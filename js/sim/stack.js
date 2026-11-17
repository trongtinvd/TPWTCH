// stack.js - playing cards, activating abilities, the stack, triggers (fire), response windows, end of turn
Sim.def('stack', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let byId, isPerm, majorUsed, other, slotRow, slowish; // util
  let PL, abDef, clearAttacked, has, live, removeStatus; // statuses
  let freeSlots; // state
  let COLTARGETS, targetColumns, targetZones; // targeting
  let REQS; // reqs
  let COSTS; // costs
  let COND, TRIGGERS; // cond
  let runFx; // fx
  let resolveAttack; // combat
  function canPlay(s, c) {
    // reason string, or null if legal
    if (s.phase !== 'play') return 'The game has not started';
    if (c.loc !== 'hand') return 'Not in hand';
    if (c.owner !== s.priority) return 'Not this player\u2019s priority';
    if (s.attackPhase && !c.def.flash && (isPerm(c) || c.def.timing !== 'Quick'))
      return 'Only Quick spells during the battle phase';
    if (slowish(c) && c.owner !== s.active) return 'Slow cards: turn player only';
    if (slowish(c) && majorUsed(s)) return 'Major action already used this turn';
    if (isPerm(c)) {
      if (s.stack.length && !c.def.flash) return 'Only when the stack is empty';
      if (!freeSlots(s, c).length) return 'No free ' + slotRow(c) + ' zone';
    } else {
      if (c.def.timing === 'Slow' && s.stack.length) return 'Slow spells need an empty stack';
      if (c.def.colTarget && !targetColumns(s, c).length) return 'Requirement: no legal target column';
      if (c.def.zoneTarget && !c.def.playerTarget && !c.def.optionalTarget && !targetZones(s, c).length)
        return 'Requirement: no legal target';
      for (const r of c.def.req || []) {
        const why = REQS[r] && REQS[r](s, c, c.def);
        if (why) return why;
      }
    }
    return null;
  }
  function canActivate(s, c, i) {
    // reason string, or null. Order: 1 requirements, 2 timing, 3 costs
    const a = c && abDef(c).abilities && abDef(c).abilities[i];
    if (!a) return 'No such ability';
    const zone = a.zone || 'board';
    if (c.loc !== zone)
      return 'Requirement: must be ' + ({ gy: 'in the graveyard', hand: 'in hand' }[zone] || 'on the board');
    for (const r of a.req || []) {
      const why = REQS[r] && REQS[r](s, c, a);
      if (why) return why;
    }
    if (c.owner !== s.priority) return 'Timing: you do not have priority';
    if (a.speed === 'Slow') {
      if (c.owner !== s.active) return 'Timing: Slow abilities only on your turn';
      if (s.stack.length) return 'Timing: Slow abilities need an empty stack';
      if (s.attackPhase) return 'Timing: not during the battle phase';
      if (majorUsed(s)) return 'Timing: major action already used';
    }
    for (const k of a.cost || []) {
      const why = COSTS[k.op].check(s, c, k);
      if (why) return why;
    }
    return null;
  }
  function hitStack(s, u, n, ev) {
    if (u.kind === 'attack') return; // an Attack has no HP: damage against it does nothing
    // stack HP: <= -1 is countered, 0 still resolves
    if (u.nodmg === s.turn) {
      ev.push({ t: 'DamageDenied', sid: u.sid, amount: n });
      return;
    }
    u.hp -= n;
    ev.push({ t: 'StackObjectDamaged', sid: u.sid, amount: n });
    // at HP <= -1 the object stays on the stack and is countered when it would resolve (see Pass)
  }
  function pushObj(s, c, list, i, ev, target) {
    // abilities AND triggers share one path: a token card + a stack object with its own HP
    const a = abDef(c)[list][i],
      sid = ++s.sid,
      n = list === 'triggers' ? 100 + i : i;
    const tok = {
      iid: 'tok-' + sid,
      def: {
        id: 'tok-' + abDef(c).id + '-' + n,
        name: c.def.name + ': ' + (a.name || 'Trigger'),
        type: 'ability',
        timing: a.speed || 'Trigger',
        hp: a.hp ?? 1,
        text: abDef(c).text,
      },
      owner: c.owner,
      loc: 'stack',
      slot: null,
      token: true,
    };
    s.cards[tok.iid] = tok;
    s.stack.push({
      sid,
      kind: 'ability',
      iid: tok.iid,
      src: c.iid,
      list,
      ab: i,
      from: abDef(c).id,
      controller: c.owner,
      hp: tok.def.hp,
      target: target || null,
      name: tok.def.name,
    });
    s.passes = 0;
    ev.push({ t: 'StackObjectCreated', iid: c.iid });
  }
  function fire(s, ev, on, subject) {
    // event -> ALL matching triggers go onto the stack together, then priority passes (non-turn player first)
    const hits = []; // 1) collect every trigger that matches this event
    for (const c of Object.values(s.cards)) {
      if (c.loc === 'stack' || c.loc === 'gone') continue;
      (abDef(c).triggers || []).forEach((t, i) => {
        if (t.on !== on || (t.zone || 'board') !== c.loc) return;
        if (t.cond && !(COND[t.cond] && COND[t.cond](s, c, subject))) return; // an unknown condition fails closed (validate.js reports it at load)
        if (TRIGGERS[on] && !TRIGGERS[on](s, c, t, subject)) return;
        hits.push({ c, i });
      });
    }
    // 2) turn player's triggers are put on the stack first, then the other player's (so the other player's resolve first).
    //    Stable sort: within one player the order is card creation order (deterministic placeholder until players can order their own triggers).
    hits.sort((a, b) => (b.c.owner === s.active) - (a.c.owner === s.active));
    for (const h of hits) pushObj(s, h.c, 'triggers', h.i, ev);
    if (hits.length) s.priority = other(s.active); // 3) only now does priority pass: the NON-turn player responds first
  }
  function resolveObj(s, o, ev) {
    // the object is already popped
    if (o.kind === 'attack') return resolveAttack(s, o, ev);
    const src = s.cards[o.src || o.iid],
      def = o.kind === 'spell' ? src.def : byId[o.from][o.list][o.ab];
    let t = o.target ? s.cards[o.target] : null;
    if (def.zoneTarget && !o.tplayer && !o.tsid && !(def.optionalTarget && !o.zone)) {
      const id = s.slots[o.zone];
      t = id ? s.cards[id] : null;
      if (!t || has(t, 'red')) {
        ev.push({ t: 'StackObjectFizzled', sid: o.sid });
        return;
      }
    } // a cloud was the target and nothing is underneath
    if (def.target && !(t && (t.loc === 'board' || def.target === 'attacker'))) {
      ev.push({ t: 'StackObjectFizzled', sid: o.sid });
      return;
    } // target became illegal
    if (def.colTarget && COLTARGETS[def.colTarget](s, o.col)) {
      ev.push({ t: 'StackObjectFizzled', sid: o.sid });
      return;
    } // nothing legal under the clouds: it fizzles and nothing is revealed   // the column is no longer a legal target
    runFx({ s, ev, src, t, who: o.controller, foe: other(o.controller), col: o.col, o, tp: o.tplayer }, def.effects);
  }
  function openRespond(s, ev, kind) {
    // the non-turn player gets priority on an empty stack (triggers on the stack resolve first)
    s.respond = { kind };
    s.priority = other(s.active);
    ev.push({ t: 'ResponseWindowOpened', kind }); // the non-turn player ALWAYS responds first, even with enter triggers already on the stack
  }
  function stopAt(s, ev, kind) {
    // an optional "stop": at this moment the non-turn player gets priority on an empty stack (turnStart, combatStart, combatEnd, draw, stack).
    // s.stops is set by the host; null = no stops. A window that is already open is never replaced.
    if (!s.stops || !s.stops[kind] || s.respond) return;
    openRespond(s, ev, kind);
  }
  function endTurn(s, ev) {
    for (const o of [...Object.values(s.cards), PL(s, 'Player'), PL(s, 'Opponent')])
      live(o)
        .filter(x => x.expires === 'turnEnd')
        .forEach(x => removeStatus(s, x, 'expired')); // end of turn: expiring statuses go
    clearAttacked(s, 'turn ended');
    s.active = other(s.active);
    s.attackPhase = false;
    s.turn++;
    s.majorUsed = false;
    s.combats = 0;
    s.priority = s.active;
    s.passes = 0;
    ev.push({ t: 'TurnChanged', active: s.active });
    fire(s, ev, 'turnStart', null);
    stopAt(s, ev, 'turnStart');
  }
  return {
    exports: { canActivate, canPlay, endTurn, fire, hitStack, openRespond, pushObj, resolveObj, stopAt },
    needs: [
      'COLTARGETS',
      'COND',
      'COSTS',
      'PL',
      'REQS',
      'TRIGGERS',
      'abDef',
      'byId',
      'clearAttacked',
      'freeSlots',
      'has',
      'isPerm',
      'live',
      'majorUsed',
      'other',
      'removeStatus',
      'resolveAttack',
      'runFx',
      'slotRow',
      'slowish',
      'targetColumns',
      'targetZones',
    ],
    link: () => {
      ({
        COLTARGETS,
        COND,
        COSTS,
        PL,
        REQS,
        TRIGGERS,
        abDef,
        byId,
        clearAttacked,
        freeSlots,
        has,
        isPerm,
        live,
        majorUsed,
        other,
        removeStatus,
        resolveAttack,
        runFx,
        slotRow,
        slowish,
        targetColumns,
        targetZones,
      } = K);
    },
  };
});

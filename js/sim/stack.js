// stack.js - playing cards, activating abilities, the stack, triggers (fire), response windows, end of turn
Sim.def('stack', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let ctl; // added by Patch3
  let byId, isPerm, other, slotRow, slowish; // util
  let gainAP, hasAP; // ap
  let PL, abDef, clearAttacked, expiresAtTurnEnd, has, hasSt, live, removeStatus; // statuses
  let freeSlots; // state
  let COLTARGETS, TARGETINGS, targetColumns, targetZones; // targeting
  let REQS; // reqs
  let COSTS; // costs
  let COND, TRIGGERS; // cond
  let runFx, ask; // fx
  let resolveAttack; // combat
  function canPlay(s, c) {
    // reason string, or null if legal
    if (s.phase !== 'play') return 'The game has not started';
    if (c.loc !== 'hand') return 'Not in hand';
    if (c.owner !== s.priority) return 'Not this player\u2019s priority';
    if (s.attackPhase && !c.def.flash && (isPerm(c) || c.def.timing !== 'Quick'))
      return 'Only Quick spells during the battle phase';
    if (slowish(c) && c.owner !== s.active) return 'Slow cards: turn player only';
    if (slowish(c) && s.respond) return 'Slow cards: only in an open game state';
    if (slowish(c) && !hasAP(s, c.owner)) return 'No action point left';
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
    const zones = [].concat(a.zone || 'board'); // one zone or a list (Depth Sea Fusion: deck or GY)
    if (!zones.includes(c.loc))
      return (
        'Requirement: must be ' +
        zones
          .map(z => ({ gy: 'in the graveyard', hand: 'in hand', deck: 'in the deck' })[z] || 'on the board')
          .join(' or ')
      );
    for (const r of a.req || []) {
      const why = REQS[r] && REQS[r](s, c, a);
      if (why) return why;
    }
    if (ctl(c) !== s.priority) return 'Timing: you do not have priority';
    if (a.speed === 'Slow') {
      if (ctl(c) !== s.active) return 'Timing: Slow abilities only on your turn';
      if (s.stack.length) return 'Timing: Slow abilities need an empty stack';
      if (s.attackPhase) return 'Timing: not during the battle phase';
      if (s.respond) return 'Timing: Slow abilities need an open game state';
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
    if (hasSt(u, 'nodamage')) {
      ev.push({ t: 'DamageDenied', sid: u.sid, amount: n });
      return;
    }
    u.hp -= n;
    ev.push({ t: 'StackObjectDamaged', sid: u.sid, amount: n });
    // at HP <= -1 the object stays on the stack and is countered when it would resolve (see Pass)
  }
  function pushObj(s, c, list, i, ev, target, extra) {
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
      owner: ctl(c),
      loc: 'stack',
      slot: null,
      token: true,
      src: c.iid, // the card it came from (the log hides it when the viewer may not see that card)
    };
    s.cards[tok.iid] = tok;
    s.stack.push(
      Object.assign(
        {
          sid,
          kind: 'ability',
          iid: tok.iid,
          src: c.iid,
          list,
          ab: i,
          from: abDef(c).id,
          controller: ctl(c),
          hp: tok.def.hp,
          target: target || null,
          name: tok.def.name,
          statuses: [],
        },
        extra || null // pick: what the trigger targeted when it was put on the stack
      )
    );
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
        if (t.cond && !(COND[t.cond] && COND[t.cond](s, c, subject, t))) return; // an unknown condition fails closed (validate.js reports it at load)
        if (TRIGGERS[on] && !TRIGGERS[on](s, c, t, subject)) return;
        hits.push({ c, i, optional: !!t.optional });
      });
    }
    if (!hits.length) return;
    // 2) the triggers wait in s.trg: each player with several of them may order them (a choice, non-turn player first; only when the host turned
    //    it on), every trigger with a targeting picks its targets, then they go on the stack: turn player's first, so the other player's resolve first.
    s.trg = { items: hits.map(h => ({ iid: h.c.iid, i: h.i, owner: ctl(h.c), optional: h.optional })), R: {} };
    advanceTrg(s, ev);
  }
  const permutations = a =>
    a.length <= 1 ? [a] : a.flatMap((x, k) => permutations([...a.slice(0, k), ...a.slice(k + 1)]).map(r => [x, ...r]));
  function advanceTrg(s, ev) {
    const T = s.trg;
    if (!T) return;
    // R[p] = the indices of p's triggers in RESOLUTION order (first resolves first). Default: they are pushed in creation order, so the last one resolves first.
    for (const p of [other(s.active), s.active]) {
      if (T.R[p]) continue;
      const mine = T.items.map((x, k) => k).filter(k => T.items[k].owner === p && !T.items[k].optional), // only MANDATORY triggers are reorderable (Q7)
        def = k => abDef(s.cards[T.items[k].iid]).triggers[T.items[k].i];
      if (s.orderTriggers && mine.length > 1 && mine.length <= 6 && !s.choice) {
        const nm = k => s.cards[T.items[k].iid].def.name,
          perms = permutations(mine.slice().reverse()).map(a => a.join(','));
        ask(
          s,
          p,
          s.cards[T.items[mine[0]].iid],
          'trigorder',
          perms,
          o =>
            o
              .split(',')
              .map(k => nm(+k))
              .join(' \u2192 '),
          'Order your triggers (the top one resolves first).',
          { p, items: mine.map(k => ({ k, name: nm(k), text: def(k).text || '' })) },
          ev
        );
        return;
      }
      T.R[p] = mine.slice().reverse();
    }
    // Q7: mandatory triggers go on the stack first (turn player's, then the other player's), optional ones after them (same player order)
    const optOf = p => T.items.map((x, k) => k).filter(k => T.items[k].owner === p && T.items[k].optional),
      pushOrder = [
        ...T.R[s.active].slice().reverse(),
        ...T.R[other(s.active)].slice().reverse(),
        ...optOf(s.active),
        ...optOf(other(s.active)),
      ];
    for (const k of pushOrder) {
      const it = T.items[k];
      if (it.tgt !== undefined) continue;
      const c = s.cards[it.iid],
        t = abDef(c).triggers[it.i];
      if (!t.targeting || s.choice) {
        it.tgt = null; // no targeting (or a choice of another effect is pending): nothing is picked now
        continue;
      }
      const G = TARGETINGS[t.targeting],
        opts = G.options(s, c);
      if (!opts.length)
        it.tgt = false; // no legal target: the trigger is not put on the stack
      else if (opts.length === 1) it.tgt = opts[0];
      else {
        ask(s, it.owner, c, 'trigtarget', opts, o => G.label(s, c, o), G.prompt(c), { tk: k }, ev);
        return;
      }
    }
    let pushed = false;
    for (const k of pushOrder) {
      const it = T.items[k];
      if (it.tgt === false) continue;
      pushObj(s, s.cards[it.iid], 'triggers', it.i, ev, null, it.tgt ? { pick: it.tgt } : null);
      pushed = true;
    }
    s.trg = null;
    if (pushed) s.priority = other(s.active); // only now does priority pass: the NON-turn player responds first
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
  // Q49 / Q50: s.stops = null | {Player:{opp:{kind:true}, own:{kind:true}}, Opponent:{...}}. `opp` = the windows a player gets as the NON-turn player
  // (enter and end are always on), `own` = as the turn player. A window is {kind, stage:'foe'|'turn'}: the non-turn player first, then the turn player.
  const stopWants = (s, p, kind) => {
    const foe = p !== s.active;
    if (foe && (kind === 'enter' || kind === 'end')) return true;
    const st = s.stops && s.stops[p];
    return !!(st && st[foe ? 'opp' : 'own'][kind]);
  };
  const respPri = s => (s.respond && s.respond.stage === 'turn' ? s.active : other(s.active)); // who holds priority in the open window
  function openRespond(s, ev, kind) {
    // an empty-stack priority window (triggers on the stack resolve first); nothing opens when neither player wants this stop
    const foe = other(s.active),
      stage = stopWants(s, foe, kind) ? 'foe' : stopWants(s, s.active, kind) ? 'turn' : null;
    if (!stage) return;
    s.respond = { kind, stage };
    s.priority = stage === 'foe' ? foe : s.active;
    ev.push({ t: 'ResponseWindowOpened', kind, player: s.priority }); // the non-turn player ALWAYS responds first, even with enter triggers already on the stack
  }
  function checkTurnEnd(s, ev) {
    // Q21: combat ended, so the turn ends: as soon as nothing is pending, the end step window opens
    if (!s.turnEnding || s.phase !== 'play' || s.attackPhase || s.stack.length || s.choice || s.respond || s.trg || s.resolving)
      return;
    s.turnEnding = false;
    openRespond(s, ev, 'end');
    ev.push({ t: 'EndStepEntered' });
  }
  function stopAt(s, ev, kind) {
    // an optional "stop": at this moment the non-turn player gets priority on an empty stack (turnStart, combatStart, combatEnd, draw, stack).
    // s.stops is set by the host; null = no stops. A window that is already open is never replaced.
    if (s.respond) return;
    openRespond(s, ev, kind);
  }
  function endTurn(s, ev) {
    for (const o of [...Object.values(s.cards), PL(s, 'Player'), PL(s, 'Opponent'), ...Object.values(s.zones), ...s.stack])
      live(o)
        .filter(x => expiresAtTurnEnd(x, s.active)) // 'turnEnd', or {turns, whose}: only the turns that count are counted down (Q11)
        .forEach(x => removeStatus(s, x, 'expired')); // end of turn: expiring statuses go
    clearAttacked(s, 'turn ended');
    s.active = other(s.active);
    s.turnEnding = false;
    s.attackPhase = false;
    s.turn++;
    s.combats = 0;
    s.priority = s.active;
    s.passes = 0;
    ev.push({ t: 'TurnChanged', active: s.active });
    gainAP(s, s.active, ev); // one action point at the start of each turn; unspent ones stay
    fire(s, ev, 'turnStart', null);
    stopAt(s, ev, 'turnStart');
  }
  return {
    exports: {
      advanceTrg,
      canActivate,
      canPlay,
      checkTurnEnd,
      endTurn,
      fire,
      hitStack,
      openRespond,
      pushObj,
      respPri,
      resolveObj,
      stopAt,
      stopWants,
    },
    needs: ['ctl', 
      'expiresAtTurnEnd',
      'hasSt',
      'COLTARGETS',
      'TARGETINGS',
      'ask',
      'COND',
      'COSTS',
      'PL',
      'REQS',
      'TRIGGERS',
      'abDef',
      'byId',
      'clearAttacked',
      'freeSlots',
      'gainAP',
      'has',
      'hasAP',
      'isPerm',
      'live',
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
      ({ ctl } = K);
      ({ expiresAtTurnEnd, hasSt } = K);
      ({
        COLTARGETS,
        TARGETINGS,
        ask,
        COND,
        COSTS,
        PL,
        REQS,
        TRIGGERS,
        abDef,
        byId,
        clearAttacked,
        freeSlots,
        gainAP,
        has,
        hasAP,
        isPerm,
        live,
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

// stack.js - playing cards, activating abilities, the stack, triggers (fire), response windows, end of turn
Sim.def('stack', function (K) {
  let autoOne; // fx
  // imports (bound by Sim.boot once every module is loaded)
  let turnGo, nextTurnPlayer; // turn
  let prGo, openRespond, stopAt; // priority
  let ctl;
  let byId, isPerm, other, slotRow, slowish; // util
  let gainAP, hasAP; // ap
  let PL, abDef, clearAttacked, expiresAtTurnEnd, has, hasKw, hasSt, live, removeStatus; // statuses
  let freeSlots; // state
  let COLTARGETS, TARGETINGS, targetColumns, targetZones; // targeting
  let REQS; // reqs
  let COSTS; // costs
  let COND, TRIGGERS; // cond
  let runFx, ask; // fx
  let resolveAttack; // combat
  let cardPlayed, consumeTrap, narrow, trapHits; // secrets
  // a trigger list of a card: 'traps' (abilities a card gives a zone, Zapping Ground) are read from the printed card, so a trap keeps working
  // whatever happens to the card that placed it (it left the board, lost its abilities)
  const listOf = (c, list) => (list === 'traps' ? c.def.traps : abDef(c)[list]) || [];
  function canPlay(s, c) {
    // reason string, or null if legal
    if (s.phase !== 'play') return 'The game has not started';
    if (s.choice) return 'Waiting for ' + s.choice.player + ' to choose'; // like dispatch (a pending choice blocks every play)
    if (c.loc !== 'hand') return 'Not in hand';
    if (c.owner !== s.priority) return 'Not this player\u2019s priority';
    if (s.attackPhase && !hasKw(c, 'flash') && (isPerm(c) || c.def.timing !== 'Quick'))
      return 'Only Quick spells during the battle phase';
    if (slowish(c) && c.owner !== s.active) return 'Slow cards: turn player only';
    if (slowish(c) && s.respond) return 'Slow cards: only in an open game state';
    if (slowish(c) && c.def.ap !== 0 && !hasAP(s, c.owner)) return 'No action point left'; // ap 0: Slow, but no action point (Secret Twin)
    if (isPerm(c)) {
      if (s.stack.length && !hasKw(c, 'flash')) return 'Only when the stack is empty';
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
      for (const k of c.def.cost || []) {
        const why = COSTS[k.op].check(s, c, k); // a spell's costs (Secret Twin: reveal your hand)
        if (why) return why;
      }
    }
    return null;
  }
  function canActivate(s, c, i) {
    // reason string, or null. Order: 1 requirements, 2 timing, 3 costs
    const a = c && abDef(c).abilities && abDef(c).abilities[i];
    if (!a) return 'No such ability';
    if (s.choice) return 'Waiting for ' + s.choice.player + ' to choose'; // like dispatch
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
    if (a.targeting && !TARGETINGS[a.targeting].options(s, c).length) return 'Requirement: no legal target';
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
  // activation after the checks. Targeting is part of the cost (Yu-Gi-Oh): the target is picked first (`pick`), then costs are paid
  function activate(s, c, i, pick, ev) {
    const a = abDef(c).abilities[i],
      tgt = findTarget(s, c, a);
    for (const k of a.cost || []) payCost(s, c, k, ev); // costs are paid on activation
    pushObj(s, c, 'abilities', i, ev, tgt ? tgt.iid : null, pick != null ? { pick } : null);
    prGo(s, 'objectPushed', ctl(c)); // the opponent gets priority first
    ev.push({ t: 'AbilityActivated', iid: c.iid, ab: i, speed: a.speed });
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
    const a = listOf(c, list)[i],
      who = (extra && extra.controller) || ctl(c), // a trap is controlled by the player who placed it
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
      owner: who,
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
          from: list === 'traps' ? c.def.id : abDef(c).id,
          controller: who,
          hp: tok.def.hp,
          target: target || null,
          name: tok.def.name,
          statuses: [],
        },
        extra || null // pick: what the trigger targeted when it was put on the stack
      )
    );
    ev.push({ t: 'StackObjectCreated', iid: c.iid }); // the caller makes the priority transition (objectPushed / triggersPushed)
  }
  function fire(s, ev, on, subject, evt) {
    // event -> ALL matching triggers go onto the stack together, then priority passes (non-turn player first)
    // evt: what happened, for the triggers that need it ('damaged': {type, source, amount, power, spell}); the stack object keeps it
    const hits = []; // 1) collect every trigger that matches this event
    for (const c of Object.values(s.cards)) {
      if (c.loc === 'gone' || (c.loc === 'stack' && c !== subject)) continue; // on the stack: only the spell that was just put there ('cast')
      (abDef(c).triggers || []).forEach((t, i) => {
        if (t.on !== on || (t.zone || 'board') !== c.loc) return;
        if (t.cond && !(COND[t.cond] && COND[t.cond](s, c, subject, t))) return; // an unknown condition fails closed (validate.js reports it at load)
        if (TRIGGERS[on] && !TRIGGERS[on](s, c, t, subject, evt)) return;
        hits.push({ c, i, optional: !!t.optional });
      });
    }
    if ((on === 'enter' || on === 'shift') && subject && subject.loc === 'board') {
      const traps = trapHits(s, subject); // the secret traps on the zone it entered (shifting in counts as entering)
      hits.push(...traps);
      narrow(
        s,
        subject.slot,
        traps.map(h => h.secret)
      );
    }
    if ((on === 'enter' || on === 'cast') && subject) cardPlayed(s, subject, hits, ev); // card secrets: revealed by their trigger, else narrowed
    if (!hits.length) return;
    // 2) the triggers wait in s.trg: each player with several of them may order them (a choice, non-turn player first; only when the host turned
    //    it on), every trigger with a targeting picks its targets, then they go on the stack: turn player's first, so the other player's resolve first.
    const items = hits.map(h =>
      Object.assign(
        { iid: h.c.iid, i: h.i, owner: h.owner || ctl(h.c), optional: h.optional },
        h.list ? { list: h.list, trap: h.trap, entered: h.entered } : null,
        evt ? { evt } : null
      )
    );
    if (s.trg) {
      // triggers are still waiting (a choice is pending): the new ones join them; their owners order again
      items.forEach(it => {
        s.trg.items.push(it);
        if (!it.optional) delete s.trg.R[it.owner];
      });
    } else s.trg = { items, R: {} };
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
        def = k => listOf(s.cards[T.items[k].iid], T.items[k].list || 'triggers')[T.items[k].i];
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
          'Order your triggers (the bottom one resolves first, like the stack).',
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
        t = listOf(c, it.list || 'triggers')[it.i];
      if (!t.targeting) {
        it.tgt = null; // no targeting: nothing is picked now
        continue;
      }
      if (s.choice) return; // targeting is part of the COST (Yu-Gi-Oh: condition : cost / targeting ; effect), so it is never moved to the
      // resolution: while another choice is pending the triggers wait in s.trg; dispatch('Choose') carries on (advanceTrg) once nothing is pending
      const G = TARGETINGS[t.targeting],
        opts = G.options(s, c);
      if (!opts.length)
        it.tgt = false; // no legal target: the trigger is not put on the stack
      else if (autoOne(s, it.owner, opts)) it.tgt = opts[0];
      else {
        ask(
          s,
          it.owner,
          c,
          'trigtarget',
          opts,
          o => G.label(s, c, o),
          G.prompt(c),
          G.secret ? { tk: k, secret: true } : { tk: k },
          ev
        );
        return;
      }
    }
    let pushed = false;
    for (const k of pushOrder) {
      const it = T.items[k];
      if (it.tgt === false) continue;
      const c = s.cards[it.iid],
        t = listOf(c, it.list || 'triggers')[it.i];
      if (it.list === 'traps') consumeTrap(s, it.trap, ev); // its cost: consume this status (paid when it is put on the stack)
      pushObj(
        s,
        c,
        it.list || 'triggers',
        it.i,
        ev,
        it.list === 'traps' ? it.entered : null, // "that card": the card that entered the zone
        Object.assign(
          {},
          it.tgt ? { pick: it.tgt } : null,
          it.evt ? { evt: it.evt } : null,
          it.list === 'traps' ? { controller: it.owner } : null,
          t.targeting && TARGETINGS[t.targeting].secret ? { secret: true } : null // its target is known to its controller only
        )
      );
      pushed = true;
    }
    s.trg = null;
    if (pushed) prGo(s, 'triggersPushed'); // only now does priority pass: the NON-turn player responds first
  }
  function resolveObj(s, o, ev) {
    // the object is already popped
    if (o.kind === 'attack') return resolveAttack(s, o, ev);
    if (o.untargeted) {
      ev.push({ t: 'StackObjectFizzled', sid: o.sid });
      return;
    } // a spell that must target, played without one (L4: The Librarian): it fizzles
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
    if (
      def.targeting &&
      o.pick != null &&
      TARGETINGS[def.targeting].legal &&
      !TARGETINGS[def.targeting].legal(s, src, o.pick)
    ) {
      ev.push({ t: 'StackObjectFizzled', sid: o.sid });
      return;
    } // the picked target is no longer legal
    if (def.colTarget && COLTARGETS[def.colTarget](s, o.col)) {
      ev.push({ t: 'StackObjectFizzled', sid: o.sid });
      return;
    } // nothing legal under the clouds: it fizzles and nothing is revealed   // the column is no longer a legal target
    runFx({ s, ev, src, t, who: o.controller, foe: other(o.controller), col: o.col, o, tp: o.tplayer }, def.effects);
  }
  // the end step: its window opens when a player wants it; when nobody does (both stops off) the turn ends at once (with the
  // opponent's end step stop off the turn used to wait for a window that never opened)
  function enterEndStep(s, ev) {
    const opened = openRespond(s, ev, 'end');
    ev.push({ t: 'EndStepEntered' });
    if (!opened) endTurn(s, ev);
  }
  function checkTurnEnd(s, ev) {
    // Q21: combat ended, so the turn ends: as soon as nothing is pending, the end step window opens
    if (
      !s.turnEnding ||
      s.phase !== 'play' ||
      s.attackPhase ||
      s.stack.length ||
      s.choice ||
      s.respond ||
      s.trg ||
      s.resolving
    )
      return;
    turnGo(s, 'endStepDue');
    enterEndStep(s, ev);
  }
  function endTurn(s, ev) {
    for (const o of [
      ...Object.values(s.cards),
      PL(s, 'Player'),
      PL(s, 'Opponent'),
      ...Object.values(s.zones),
      ...s.stack,
    ])
      live(o)
        .filter(x => expiresAtTurnEnd(x, s.active)) // 'turnEnd', or {turns, whose}: only the turns that count are counted down (Q11)
        .forEach(x => removeStatus(s, x, 'expired')); // end of turn: expiring statuses go
    expireStatuses(s, 'combatEnd', 'combat ended'); // the turn ending ends any combat phase still open
    clearAttacked(s, 'turn ended');
    s.active = nextTurnPlayer(s, ev); // Distance / Speed / Acceleration (or strict alternation without a race)
    turnGo(s, 'nextTurn');
    prGo(s, 'turnBegan');
    ev.push({ t: 'TurnChanged', active: s.active });
    gainAP(s, s.active, ev); // one action point at the start of each turn; unspent ones stay
    turnGo(s, 'turnStarts'); // the draw phase follows once the turn start is over (dispatch: checkDrawStep)
    fire(s, ev, 'turnStart', null);
    stopAt(s, ev, 'turnStart');
  }
  return {
    exports: {
      activate,
      advanceTrg,
      canActivate,
      canPlay,
      checkTurnEnd,
      endTurn,
      enterEndStep,
      fire,
      hitStack,
      pushObj,
      resolveObj,
    },
    needs: [
      'autoOne',
      'turnGo',
      'nextTurnPlayer',
      'prGo',
      'openRespond',
      'stopAt',
      'expireStatuses',
      'findTarget',
      'payCost',
      'ctl',
      'expiresAtTurnEnd',
      'hasKw',
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
      'cardPlayed',
      'consumeTrap',
      'narrow',
      'trapHits',
    ],
    link: () => {
      ({ autoOne } = K);
      ({ turnGo, nextTurnPlayer } = K);
      ({ prGo, openRespond, stopAt } = K);
      ({ expireStatuses, findTarget, payCost } = K);
      ({ ctl } = K);
      ({ expiresAtTurnEnd, hasKw, hasSt } = K);
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
      ({ cardPlayed, consumeTrap, narrow, trapHits } = K);
    },
  };
});

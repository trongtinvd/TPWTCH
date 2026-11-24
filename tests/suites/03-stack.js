// 03-stack.js - the stack and priority, activated abilities and their costs, response windows, stops, actionsOf, DebugToHand.
// Run only these: node tests/run.js --only stack,abilities,response-windows,stops
(function () {
  const { D, check, eq, rej, start, take, pass2, AT, setLife, ap, ndmg, dl, abTokens } = Tests.ctx;

  Tests.add('stack-priority', () => {
    // ================= stack and priority =================
    {
      let s = start(80);
      const z = take(s, 'Player', 'zap', 'hand');
      D(s, { type: 'PlayCard', iid: z.iid });
      eq(
        'casting puts the spell on the stack and gives the opponent priority first',
        [s.stack.length, z.loc, s.priority],
        [1, 'stack', 'Opponent']
      );
      rej('only the player holding priority may pass', s, { type: 'Pass', player: 'Player' }, 'priority');
      D(s, { type: 'Pass', player: 'Opponent' });
      eq(
        'one pass does not resolve: Zap still on the stack, no damage, priority to the caster',
        [s.stack.length, z.loc, s.life.Opponent, s.priority],
        [1, 'stack', 20, 'Player']
      );
      D(s, { type: 'Pass', player: 'Player' });
      eq(
        'two consecutive passes resolve it (0 HP still resolves): 1 damage, Zap in GY, priority back to the turn player',
        [s.stack.length, z.loc, s.life.Opponent, s.priority, s.passes],
        [0, 'gy', 19, 'Player', 0]
      );
      rej(
        'Pass with an empty stack and no response window is rejected',
        s,
        { type: 'Pass', player: 'Player' },
        'Nothing on the stack'
      );
      s = start(81);
      const z2 = take(s, 'Player', 'zap', 'hand'),
        h = take(s, 'Opponent', 'heal', 'hand');
      D(s, { type: 'PlayCard', iid: z2.iid });
      D(s, { type: 'PlayCard', iid: h.iid });
      D(s, { type: 'Pass', player: 'Player' });
      const r = D(s, { type: 'Pass', player: 'Opponent' });
      eq(
        'LIFO: the response (Heal, +3 to the Opponent) resolves first; Zap is still waiting beneath',
        [r.events.filter(e => e.t === 'StackObjectResolved').map(e => e.iid), s.life.Opponent, z2.loc, h.loc],
        [[h.iid], 23, 'stack', 'gy']
      );
      pass2(s);
      eq('then Zap resolves (23 -> 22) and the stack is empty', [s.life.Opponent, s.stack.length], [22, 0]);
      s = start(82);
      const z3 = take(s, 'Player', 'zap', 'hand'),
        h3 = take(s, 'Player', 'heal', 'hand');
      D(s, { type: 'PlayCard', iid: z3.iid });
      D(s, { type: 'Pass', player: 'Opponent' });
      D(s, { type: 'PlayCard', iid: h3.iid });
      D(s, { type: 'Pass', player: 'Opponent' });
      eq(
        'adding a response resets the pass count: one pass after it does not resolve anything',
        [s.stack.length, s.passes, s.priority],
        [2, 1, 'Player']
      );
    }
    {
      let s = start(83);
      const z = take(s, 'Player', 'zap', 'hand'),
        b = take(s, 'Opponent', 'bolt', 'hand');
      D(s, { type: 'PlayCard', iid: z.iid });
      D(s, { type: 'PlayCard', iid: b.iid });
      const r = pass2(s);
      eq(
        'Bolt (3) on Zap (HP 0) -> HP -3: Zap stays on the stack at negative HP, Bolt is resolved',
        [z.loc, b.loc, s.stack.length, s.stack[0] && s.stack[0].hp],
        ['stack', 'gy', 1, -3]
      );
      const r2 = pass2(s);
      eq(
        '...and is countered only when it would resolve: Zap\u2019s effect never happens, no Resolved event',
        [
          z.loc,
          s.life.Opponent,
          s.stack.length,
          r2.events.filter(e => e.t === 'StackObjectCountered').length,
          r2.events.filter(e => e.t === 'StackObjectResolved').length,
        ],
        ['gy', 20, 0, 1, 0]
      );
      s = start(84);
      const he = take(s, 'Player', 'heal', 'hand'),
        b2 = take(s, 'Opponent', 'bolt', 'hand');
      D(s, { type: 'PlayCard', iid: he.iid });
      D(s, { type: 'PlayCard', iid: b2.iid });
      pass2(s);
      eq(
        'boundary: Bolt (3) on Heal (HP 3) leaves HP 0: NOT countered, still on the stack',
        [s.stack.length, s.stack[0] && s.stack[0].hp, he.loc, b2.loc],
        [1, 0, 'stack', 'gy']
      );
      pass2(s);
      eq('...and it then resolves normally (+3 life)', [s.life.Player, he.loc], [23, 'gy']);
      s = start(85);
      const b3 = take(s, 'Player', 'bolt', 'hand');
      rej('Bolt cannot be played with nothing on the stack', s, { type: 'PlayCard', iid: b3.iid }, 'stack object');
      s = start(86);
      const z4 = take(s, 'Player', 'zap', 'hand'),
        gf = take(s, 'Opponent', 'grainfall', 'hand'),
        he2 = take(s, 'Opponent', 'heal', 'hand');
      D(s, { type: 'PlayCard', iid: z4.iid });
      rej(
        'the non-turn player cannot cast a Slow spell even with priority',
        s,
        { type: 'PlayCard', iid: gf.iid, tplayer: 'Player' },
        'turn player only'
      );
      check('...but can respond with a Quick spell', Sim.canPlay(s, he2) === null);
      D(s, { type: 'Pass', player: 'Opponent' });
      const sb = take(s, 'Player', 'superbolt', 'hand');
      rej(
        'a Slow spell needs an empty stack',
        s,
        { type: 'PlayCard', iid: sb.iid, tplayer: 'Opponent' },
        'empty stack'
      );
      s = start(87);
      const sb2 = take(s, 'Player', 'superbolt', 'hand');
      D(s, { type: 'PlayCard', iid: sb2.iid, tplayer: 'Opponent' });
      check('a Slow spell consumes the action point when cast, not when it resolves', !ap(s) && s.stack.length === 1);
      pass2(s);
      rej('...so no Draw afterwards', s, { type: 'Draw', player: 'Player' }, 'No action point');
    }
  });

  Tests.add('abilities', () => {
    // ================= activated abilities: Scout, Archer, Charm, Ward (costs, fizzle, counter) =================
    {
      let s = start(88);
      const sc = take(s, 'Player', 'scout', 'board', 'Player|front|1');
      rej(
        'Scout cannot activate with no opposing creature',
        s,
        { type: 'Activate', iid: sc.iid, ab: 0 },
        'no legal target'
      );
      const v = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1');
      D(s, { type: 'Activate', iid: sc.iid, ab: 0 });
      check(
        'Scout: the sacrifice cost is paid on activation; the effect is still pending',
        sc.loc === 'gy' && s.stack.length === 1 && !ndmg(v)
      );
      pass2(s);
      eq(
        'Scout: 3 effect damage from Scout; soldier (HP 3) survives at effective HP 0',
        [v.loc, dl(v)],
        ['board', [[3, 'effect', sc.iid]]]
      );
      s = start(89);
      const sc2 = take(s, 'Player', 'scout', 'board', 'Player|front|2'),
        v2 = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|2');
      D(s, { type: 'Activate', iid: sc2.iid, ab: 0 });
      s.slots['Opponent|front|2'] = null;
      v2.slot = null;
      v2.loc = 'gy'; // the target leaves before resolution
      const r = pass2(s);
      eq(
        'fizzle: target gone -> StackObjectFizzled, no damage, cost stays paid, ability token cleaned up',
        [
          r.events.some(e => e.t === 'StackObjectFizzled'),
          ndmg(v2),
          sc2.loc,
          s.stack.length,
          abTokens(s).every(t => t.loc === 'gone'),
        ],
        [true, 0, 'gy', 0, true]
      );
      s = start(90);
      const sc3 = take(s, 'Player', 'scout', 'board', 'Player|back|1'),
        v3 = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'),
        wf = take(s, 'Player', 'wolf', 'board', 'Player|front|1');
      D(s, { type: 'Activate', iid: sc3.iid, ab: 0 });
      pass2(s);
      Sim.enterCombat(s);
      AT(s, wf.iid);
      eq(
        'damage instances add up across sources: Scout 3 + Wolf 3 kills Soldier (HP 3), counters are cleared, wolf tramples 3',
        [v3.loc, ndmg(v3), s.life.Opponent],
        ['gy', 0, 17]
      );
    }
    {
      let s = start(91);
      const ar = take(s, 'Player', 'archer', 'board', 'Player|front|0');
      D(s, { type: 'Activate', iid: ar.iid, ab: 0 });
      eq(
        'Volley: 1 life is paid on activation, no action point is used (Slow abilities are free, Q19), effect pending',
        [s.life.Player, s.life.Opponent, ap(s), s.stack.length],
        [19, 20, 1, 1]
      );
      pass2(s);
      eq(
        'Volley resolves: 2 damage to the opponent; ability token gone',
        [s.life.Opponent, abTokens(s).every(t => t.loc === 'gone')],
        [18, true]
      );
      s = start(92);
      const a2 = take(s, 'Player', 'archer', 'board', 'Player|back|0');
      rej('Volley requires a front-row zone', s, { type: 'Activate', iid: a2.iid, ab: 0 }, 'front-row');
      s = start(93);
      const a3 = take(s, 'Player', 'archer', 'board', 'Player|front|0');
      setLife(s, 'Player', 1);
      rej(
        'Volley with 1 life: cannot pay the 1-life cost',
        s,
        { type: 'Activate', iid: a3.iid, ab: 0 },
        'not enough life'
      );
      s = start(94);
      const a4 = take(s, 'Player', 'archer', 'board', 'Player|front|0');
      D(s, { type: 'Draw', player: 'Player' });
      eq(
        'Volley (Slow) after the action point was used: still legal, Slow abilities are free (Q19)',
        Sim.canActivate(s, a4, 0),
        null
      );
      s = start(95);
      const a5 = take(s, 'Player', 'archer', 'board', 'Player|front|0'),
        zz = take(s, 'Player', 'zap', 'hand');
      D(s, { type: 'PlayCard', iid: zz.iid });
      D(s, { type: 'Pass', player: 'Opponent' });
      rej('Volley (Slow) needs an empty stack', s, { type: 'Activate', iid: a5.iid, ab: 0 }, 'empty stack');
      s = start(96);
      const a6 = take(s, 'Player', 'archer', 'board', 'Player|front|0'),
        bo = take(s, 'Opponent', 'bolt', 'hand');
      D(s, { type: 'Activate', iid: a6.iid, ab: 0 });
      D(s, { type: 'PlayCard', iid: bo.iid });
      pass2(s);
      pass2(s);
      eq(
        'countered ability (stack HP 1 - 3): cost is NOT refunded, effect never happens, source stays, token removed',
        [s.life.Player, s.life.Opponent, a6.loc, bo.loc, s.stack.length, abTokens(s).every(t => t.loc === 'gone')],
        [19, 20, 'board', 'gy', 0, true]
      );
    }
    {
      let s = start(97);
      const ch = take(s, 'Player', 'charm', 'board', 'Player|back|0');
      rej('Recall needs a card in the graveyard to exile', s, { type: 'Activate', iid: ch.iid, ab: 0 }, 'too few');
      const newest = take(s, 'Player', 'soldier', 'gy'),
        oldest = take(s, 'Player', 'wolf', 'gy');
      s.piles.Player.gy = [newest, oldest];
      const top = s.piles.Player.deck[0],
        h0 = s.piles.Player.hand.length;
      D(s, { type: 'Activate', iid: ch.iid, ab: 0 });
      check(
        'Recall: the OLDEST graveyard card is exiled on activation, the newest stays; no action point used',
        oldest.loc === 'exile' && newest.loc === 'gy' && s.piles.Player.gy.length === 1 && ap(s) === 1
      );
      pass2(s);
      check(
        'Recall resolves: draws exactly the top deck card',
        top.loc === 'hand' && s.piles.Player.hand.length === h0 + 1
      );
      s = start(98);
      const w = take(s, 'Player', 'ward', 'board', 'Player|back|0');
      rej('Ward needs lost life', s, { type: 'Activate', iid: w.iid, ab: 0 }, 'already full');
      setLife(s, 'Player', 15);
      D(s, { type: 'Activate', iid: w.iid, ab: 0 });
      pass2(s);
      eq(
        'Ward: +3 life, then sacrificed (in GY, zone freed)',
        [s.life.Player, w.loc, s.slots['Player|back|0']],
        [18, 'gy', null]
      );
      s = start(99);
      const w2 = take(s, 'Player', 'ward', 'board', 'Player|back|0'),
        bo2 = take(s, 'Opponent', 'bolt', 'hand');
      setLife(s, 'Player', 19);
      D(s, { type: 'Activate', iid: w2.iid, ab: 0 });
      D(s, { type: 'PlayCard', iid: bo2.iid });
      pass2(s);
      pass2(s);
      eq(
        'Ward countered at exactly HP -1 (2 - 3): object removed, no life gained, Ward is NOT sacrificed (sacrifice is an effect)',
        [s.life.Player, w2.loc, s.stack.length, abTokens(s).every(t => t.loc === 'gone')],
        [19, 'board', 0, true]
      );
    }
  });

  Tests.add('response-windows', () => {
    // ================= response windows (enter, end step) + Bolt target requirement =================
    const q = start(40),
      sd = take(q, 'Player', 'soldier', 'hand');
    Sim.dispatch(q, { type: 'PlayCard', iid: sd.iid, slot: 'Player|front|0' });
    check(
      'placing a permanent opens a response window for the opponent',
      !!q.respond && q.respond.kind === 'enter' && q.priority === 'Opponent'
    );
    check(
      'the turn player cannot act while the opponent may respond',
      !Sim.dispatch(q, { type: 'Draw', player: 'Player' }).ok &&
        !Sim.dispatch(q, { type: 'EndTurn', player: 'Player' }).ok
    );
    Sim.dispatch(q, { type: 'Pass', player: 'Opponent' });
    check('passing closes the window and priority returns to the turn player', !q.respond && q.priority === 'Player');
    Sim.dispatch(q, { type: 'EndTurn', player: 'Player' });
    check(
      'ending the turn opens an end step window; the turn has not changed yet',
      q.respond && q.respond.kind === 'end' && q.active === 'Player' && q.priority === 'Opponent'
    );
    Sim.dispatch(q, { type: 'Pass', player: 'Opponent' });
    check('passing in the end step window ends the turn', q.active === 'Opponent' && q.turn === 2 && !q.respond);
    const r = start(41);
    take(r, 'Opponent', 'barrier', 'board', 'Opponent|back|2');
    take(r, 'Opponent', 'guard', 'board', 'Opponent|front|2');
    take(r, 'Player', 'aura', 'board', 'Player|back|2');
    const wl = take(r, 'Opponent', 'infinitywall', 'hand'),
      kn = take(r, 'Player', 'knight', 'hand');
    Sim.dispatch(r, { type: 'PlayCard', iid: kn.iid, slot: 'Player|front|2' });
    check('the opponent can play Infinity Wall in the window after the 4th card is placed', !Sim.canPlay(r, wl));
    Sim.dispatch(r, { type: 'PlayCard', iid: wl.iid, col: 2 });
    Sim.dispatch(r, { type: 'Pass', player: 'Player' });
    Sim.dispatch(r, { type: 'Pass', player: 'Opponent' });
    check(
      'the response resolves: column exiled and unusable, wall back in the opponent\u2019s hand',
      kn.loc === 'exile' && Sim.isUnusable(r, 'Player|front|2') && wl.loc === 'hand'
    );
    check('the window stays open after the response', !!r.respond && r.priority === 'Opponent');
  });

  Tests.add('stops-actions', () => {
    // ================= stops (extra response windows), actionsOf, DebugToHand, bot with every stop on =================
    const STOPS = { turnStart: true, combatStart: true, combatEnd: true, draw: true, stack: true },
      mk = (seed, stops) => {
        const s = Sim.create(seed, DEFS.concat(FIXTURES), { stops });
        for (const p of ['Player', 'Opponent']) D(s, { type: 'Start', player: p });
        return s;
      };
    let s = mk(950, STOPS);
    D(s, { type: 'Draw', player: 'Player' });
    eq(
      'stop "cards drawn": after the turn player draws, the non-turn player gets a window',
      [s.respond && s.respond.kind, s.priority],
      ['draw', 'Opponent']
    );
    rej(
      '...the turn player cannot act meanwhile',
      s,
      { type: 'SetAttackPhase', player: 'Player', on: true },
      'priority'
    );
    D(s, { type: 'Pass', player: 'Opponent' });
    eq('...passing closes it', [s.respond, s.priority], [null, 'Player']);
    s = mk(951, STOPS);
    const wf = take(s, 'Player', 'wolf', 'board', 'Player|front|0');
    D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
    eq(
      'stop "combat started"',
      [s.attackPhase, s.respond && s.respond.kind, s.priority],
      [true, 'combatStart', 'Opponent']
    );
    rej('no attack while that window is open', s, { type: 'Attack', iid: wf.iid }, 'response window');
    D(s, { type: 'Pass', player: 'Opponent' });
    D(s, { type: 'SetAttackPhase', player: 'Player', on: false });
    eq('stop "combat ended"', [s.respond && s.respond.kind, s.priority], ['combatEnd', 'Opponent']);
    D(s, { type: 'Pass', player: 'Opponent' });
    eq('combat ended: the turn ends, so the end step window follows (Q21)', s.respond && s.respond.kind, 'end');
    D(s, { type: 'Pass', player: 'Opponent' });
    eq(
      'stop "turn started": the new turn\u2019s non-turn player gets a window',
      [s.active, s.respond && s.respond.kind, s.priority],
      ['Opponent', 'turnStart', 'Player']
    );
    s = mk(952, STOPS);
    const zp = take(s, 'Player', 'zap', 'hand');
    D(s, { type: 'PlayCard', iid: zp.iid });
    D(s, { type: 'Pass', player: 'Opponent' });
    const rr = D(s, { type: 'Pass', player: 'Player' });
    eq(
      'stop "stack emptied": a StackEmptied event, then the non-turn player gets a window',
      [s.stack.length, s.respond && s.respond.kind, s.priority, rr.events.some(e => e.t === 'StackEmptied')],
      [0, 'stack', 'Opponent', true]
    );
    s = mk(953, null);
    D(s, { type: 'Draw', player: 'Player' });
    eq('without stops (the default) no window opens after a draw', s.respond, null);
    s = mk(954, null);
    const hz = take(s, 'Player', 'zap', 'hand'),
      hg = take(s, 'Player', 'hummingbird', 'gy');
    setLife(s, 'Player', 10);
    const A = Sim.actionsOf(s, 'Player');
    check(
      'actionsOf lists what can be done: draw, the playable hand card and the graveyard ability',
      A.some(a => a.kind === 'draw') &&
        A.some(a => a.kind === 'play' && a.iid === hz.iid) &&
        A.some(a => a.kind === 'ability' && a.iid === hg.iid),
      JSON.stringify(A)
    );
    check(
      'hasAction agrees with it; the player without priority has no action',
      Sim.hasAction(s, 'Player') && !Sim.actionsOf(s, 'Opponent').length
    );
    s = mk(955, null);
    const dc = s.piles.Player.deck[0],
      h0 = s.piles.Player.hand.length;
    rej('DebugToHand needs the debug flag', s, { type: 'DebugToHand', iid: dc.iid }, 'Debug');
    const dr = D(s, { type: 'DebugToHand', iid: dc.iid, debug: true });
    eq(
      'DebugToHand moves a deck card to its owner\u2019s hand',
      [
        dc.loc,
        s.piles.Player.hand.length,
        s.piles.Player.deck.includes(dc),
        dr.events.some(e => e.t === 'CardAdded' && e.iid === dc.iid),
      ],
      ['hand', h0 + 1, false, true]
    );
    rej('...and only from a deck', s, { type: 'DebugToHand', iid: dc.iid, debug: true }, 'Debug');
    const g = Sim.create(956, DEFS, {
        decks: { Player: BUILTIN_DECKS[1].cards, Opponent: BUILTIN_DECKS[0].cards },
        shuffle: true,
        autoStart: true,
        stops: STOPS,
      }),
      rnd = botRng(5),
      mem = {};
    let bad = 0,
      stuck = false;
    for (let i = 0; i < 600; i++) {
      const c = botChoose(g, botActor(g), rnd, mem);
      if (!c) {
        stuck = true;
        break;
      }
      if (!D(g, c).ok) bad++;
    }
    check(
      'bot vs bot with every stop on: every command legal, never stuck, turns keep passing',
      !bad && !stuck && g.turn > 3,
      'bad=' + bad + ' stuck=' + stuck + ' turn=' + g.turn
    );
  });
})();

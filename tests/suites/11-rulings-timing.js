// 11-rulings-timing.js - rulings 2026-11-22, group 1: free Slow abilities (Q19), combat ends then the turn ends (Q21),
// per-player stops and the turn-player stop (Q49, Q50), mandatory / optional trigger order (Q7).
// Run only these: node tests/run.js --only slow-abilities,combat-ends-turn,player-stops,trigger-groups
(function () {
  const { D, check, eq, rej, start, take, pass2, ap } = Tests.ctx;
  const mk = (seed, stops) => {
    const s = Sim.create(seed, DEFS.concat(FIXTURES), { stops });
    for (const p of ['Player', 'Opponent']) D(s, { type: 'Start', player: p });
    return s;
  };

  Tests.add('slow-abilities', () => {
    // ================= Q19: Slow abilities cost nothing unless the card says so =================
    let s = start(1100);
    const ar = take(s, 'Player', 'archer', 'board', 'Player|front|0');
    D(s, { type: 'Draw', player: 'Player' });
    eq(
      'no action point left: the Slow ability Volley is still legal (own turn, empty stack)',
      Sim.canActivate(s, ar, 0),
      null
    );
    s = start(1101);
    const a2 = take(s, 'Player', 'archer', 'board', 'Player|front|0');
    D(s, { type: 'Activate', iid: a2.iid, ab: 0 });
    eq('activating a Slow ability does not spend an action point', [ap(s), s.stack.length], [1, 1]);
    s = start(1102);
    const z = take(s, 'Player', 'zap', 'hand'),
      a3 = take(s, 'Player', 'archer', 'board', 'Player|front|0');
    D(s, { type: 'PlayCard', iid: z.iid });
    D(s, { type: 'Pass', player: 'Opponent' });
    check('Slow timing stays: not with an object on the stack', /empty stack/.test(Sim.canActivate(s, a3, 0)));
    const paid = Fx.creature('t-slowap', 'SlowPay', 1, 1, {
      abilities: [
        Fx.slowAbility('Pay', {
          text: 'Slow. Spend an action point: draw.',
          cost: [Fx.spendAP()],
          hp: 1,
          effects: [Fx.draw(1)],
        }),
      ],
    });
    s = start(1103, [paid]);
    const c = take(s, 'Player', 't-slowap', 'board', 'Player|front|0');
    D(s, { type: 'Activate', iid: c.iid, ab: 0 });
    eq(
      'a card may still ask for a point: a Slow ability with a spendAP cost spends exactly one',
      [ap(s), s.stack.length],
      [0, 1]
    );
    s = start(1104, [paid]);
    const c2 = take(s, 'Player', 't-slowap', 'board', 'Player|front|0');
    D(s, { type: 'Draw', player: 'Player' });
    rej('...and cannot be used without one', s, { type: 'Activate', iid: c2.iid, ab: 0 }, 'no action point');
  });

  Tests.add('combat-ends-turn', () => {
    // ================= Rule update 2026-11-24: ending combat goes back to the main phase; End turn during combat ends combat, then the turn =================
    let s = start(1110);
    const w = take(s, 'Player', 'wolf', 'board', 'Player|front|0');
    D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
    eq('entering combat and not attacking is legal', [s.attackPhase, s.respond], [true, null]);
    D(s, { type: 'SetAttackPhase', player: 'Player', on: false });
    eq(
      'ending combat does not end the turn: back in the main phase, the turn player keeps priority',
      [s.attackPhase, s.respond, s.active, s.priority, s.turnEnding],
      [false, null, 'Player', 'Player', false]
    );
    rej(
      '...another combat needs another action point',
      s,
      { type: 'SetAttackPhase', player: 'Player', on: true },
      'No action point'
    );
    Sim.gainAP(s, 'Player', []);
    D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
    eq(
      '...with one, the player enters a second combat: the action point is spent, new attack counters',
      [s.attackPhase, Sim.apCount(s, 'Player'), Sim.hasSt(w, 'attackCounter')],
      [true, 0, true]
    );
    D(s, { type: 'Attack', iid: w.iid });
    pass2(s);
    D(s, { type: 'SetAttackPhase', player: 'Player', on: false });
    Sim.gainAP(s, 'Player', []);
    D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
    check(
      '...a creature that attacked in an earlier combat attacks again in the next one (its new counter)',
      Sim.canAttack(s, w) === null
    );
    D(s, { type: 'EndTurn', player: 'Player' });
    eq(
      'End turn during combat ends combat, then the turn: the end step window opens',
      [s.attackPhase, s.respond && s.respond.kind, s.active],
      [false, 'end', 'Player']
    );
    D(s, { type: 'Pass', player: 'Opponent' });
    eq('passing ends the turn', [s.active, s.turn], ['Opponent', 2]);
    s = start(1111);
    take(s, 'Player', 'shark', 'board', 'Player|front|0');
    D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
    D(s, { type: 'SetAttackPhase', player: 'Player', on: false });
    eq('Deep Sea Shark: its combat-end trigger is on the stack', [s.stack.length, s.respond], [1, null]);
    pass2(s);
    D(s, { type: 'Choose', player: 'Player', option: '1' });
    eq(
      'declining the second combat: back in the main phase',
      [s.attackPhase, s.respond, s.priority],
      [false, null, 'Player']
    );
    s = start(1112);
    take(s, 'Player', 'shark', 'board', 'Player|front|0');
    D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
    D(s, { type: 'SetAttackPhase', player: 'Player', on: false });
    pass2(s);
    D(s, { type: 'Choose', player: 'Player', option: '0' });
    eq(
      'the second combat starts (no action point needed)',
      [s.attackPhase, s.respond, s.turnEnding],
      [true, null, false]
    );
    D(s, { type: 'SetAttackPhase', player: 'Player', on: false });
    eq(
      '...and when it ends the player is back in the main phase',
      [s.attackPhase, s.respond, s.priority],
      [false, null, 'Player']
    );
  });

  Tests.add('player-stops', () => {
    // ================= Q49 / Q50: per-player stops, the turn player gets one after the opponent =================
    const has = (s, c) => Sim.apCount(s, c) >= 0;
    let s = mk(1120, { Player: { own: { draw: true } }, Opponent: {} });
    D(s, { type: 'Draw', player: 'Player' });
    eq(
      'only the turn player has the "draw" stop: the opponent gets none, the turn player gets one',
      [s.respond && s.respond.kind, s.respond && s.respond.stage, s.priority],
      ['draw', 'turn', 'Player']
    );
    Sim.gainAP(s, 'Player', []);
    rej(
      'in a turn-player stop there is no open game state: no combat',
      s,
      { type: 'SetAttackPhase', player: 'Player', on: true },
      'response window'
    );
    rej('...and no Draw', s, { type: 'Draw', player: 'Player' }, 'response window');
    const zp = take(s, 'Player', 'zap', 'hand'),
      sb = take(s, 'Player', 'superbolt', 'hand');
    check(
      '...but Quick spells are legal and Slow spells are not',
      Sim.canPlay(s, zp) === null && /open game state/.test(Sim.canPlay(s, sb)),
      String(Sim.canPlay(s, sb))
    );
    D(s, { type: 'Pass', player: 'Player' });
    eq('passing closes it', [s.respond, s.priority], [null, 'Player']);
    s = mk(1121, { Player: { own: { draw: true } }, Opponent: { opp: { draw: true } } });
    D(s, { type: 'Draw', player: 'Player' });
    eq('both want it: the opponent first', [s.respond.stage, s.priority], ['foe', 'Opponent']);
    const r = D(s, { type: 'Pass', player: 'Opponent' });
    eq(
      '...then the turn player, announced by an event naming the player',
      [s.respond.stage, s.priority, r.events.some(e => e.t === 'ResponseWindowOpened' && e.player === 'Player')],
      ['turn', 'Player', true]
    );
    D(s, { type: 'Pass', player: 'Player' });
    eq('...then it closes', [s.respond, s.priority], [null, 'Player']);
    s = mk(1122, { Player: { own: { enter: true } }, Opponent: {} });
    const so = take(s, 'Player', 'soldier', 'hand');
    D(s, { type: 'PlayCard', iid: so.iid, slot: 'Player|front|0' });
    eq('enter: the opponent\u2019s window is always on', [s.respond.kind, s.respond.stage], ['enter', 'foe']);
    D(s, { type: 'Pass', player: 'Opponent' });
    eq(
      '...the turn player\u2019s own enter stop follows when it is on',
      [s.respond.stage, s.priority],
      ['turn', 'Player']
    );
    D(s, { type: 'Pass', player: 'Player' });
    eq('...and closes', [s.respond, s.priority], [null, 'Player']);
    s = mk(1123, { Player: { own: { end: true } }, Opponent: {} });
    D(s, { type: 'EndTurn', player: 'Player' });
    D(s, { type: 'Pass', player: 'Opponent' });
    eq(
      'end step: the turn player\u2019s stop comes before the turn changes',
      [s.respond.kind, s.respond.stage, s.active],
      ['end', 'turn', 'Player']
    );
    D(s, { type: 'Pass', player: 'Player' });
    eq('...then the turn ends', [s.active, s.respond], ['Opponent', null]);
    s = mk(1124, { draw: true });
    eq(
      'a flat stops object (older replays, the tests) means: both players, as the non-turn player only',
      [s.stops.Player.opp.draw, s.stops.Opponent.opp.draw, s.stops.Player.own, has(s, 'Player')],
      [true, true, {}, true]
    );
  });

  Tests.add('trigger-groups', () => {
    // ================= Q7: mandatory triggers go on the stack first; only they are reorderable =================
    const trg = (id, optional) =>
      Fx.creature(id, id, 1, 5, {
        triggers: [Object.assign(Fx.trigger.attack(['any'], Fx.draw(1)), optional ? { optional: true } : {})],
      });
    const defs = ['t-m1', 't-m2', 't-m3'].map(i => trg(i)).concat(['t-o1', 't-o2'].map(i => trg(i, true)));
    const srcs = s => s.stack.map(o => (o.kind === 'attack' ? 'A' : s.cards[o.src].def.id));
    let s = start(1130, defs);
    take(s, 'Player', 't-m1', 'board', 'Player|front|0');
    take(s, 'Player', 't-o1', 'board', 'Player|front|1');
    take(s, 'Opponent', 't-m2', 'board', 'Opponent|front|0');
    take(s, 'Opponent', 't-o2', 'board', 'Opponent|front|1');
    Sim.enterCombat(s);
    D(s, { type: 'Attack', iid: Object.values(s.cards).find(c => c.def.id === 't-m1').iid });
    eq('pushed in this order: turn player mandatory, other mandatory, turn player optional, other optional', srcs(s), [
      'A',
      't-m1',
      't-m2',
      't-o1',
      't-o2',
    ]);
    s = start(1131, defs);
    take(s, 'Player', 't-m1', 'board', 'Player|front|0');
    take(s, 'Player', 't-m3', 'board', 'Player|front|2');
    take(s, 'Player', 't-o1', 'board', 'Player|front|1');
    s.orderTriggers = true;
    Sim.enterCombat(s);
    D(s, { type: 'Attack', iid: Object.values(s.cards).find(c => c.def.id === 't-m1').iid });
    eq(
      'only the two mandatory triggers can be ordered: a choice with two arrangements, for their controller',
      [s.choice.kind, s.choice.player, s.choice.options.length],
      ['trigorder', 'Player', 2]
    );
    D(s, { type: 'Choose', player: 'Player', option: s.choice.options[0] });
    const t = srcs(s);
    check(
      '...and the optional trigger is on top whatever the order chosen',
      t.length === 4 && t[3] === 't-o1' && t.slice(1, 3).sort().join() === 't-m1,t-m3',
      t.join()
    );
  });
})();

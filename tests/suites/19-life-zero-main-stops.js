// 19-life-zero-main-stops.js - life 0 is alive (paying life down to 0, starting life 0), the "main phase started" / "main phase ended" stops,
// a resolving spell that waits for choices stays visible (s.resolving keeps its card).
// Run only these: node tests/run.js --only life-zero,main-stops
(function () {
  const { D, check, eq, rej, start, take, setLife } = Tests.ctx;

  Tests.add('life-zero', () => {
    let s = start(1900);
    const a = take(s, 'Player', 'archer', 'board', 'Player|front|0');
    setLife(s, 'Player', 1);
    const r = D(s, { type: 'Activate', iid: a.iid, ab: 0 });
    eq(
      'Volley with 1 life: the 1-life cost is paid, life 0, the game goes on',
      [r.ok, s.life.Player, s.result || null],
      [true, 0, null]
    );
    const z = Sim.create(1901, DEFS.concat(FIXTURES), { autoStart: true, rules: { life: 0 } });
    eq(
      'starting life 0: both players at 0 and alive',
      [z.cfg.life, z.life.Player, z.life.Opponent, z.result || null],
      [0, 0, 0, null]
    );
    const n = Sim.create(1902, DEFS.concat(FIXTURES), { rules: { life: -5 } });
    eq('a negative starting life becomes 0', n.cfg.life, 0);
  });

  Tests.add('main-stops', () => {
    const stops = {
      Player: { opp: { mainStart: true, mainEnd: true }, own: { mainEnd: true } },
      Opponent: { opp: {}, own: {} },
    };
    const s = Sim.create(1910, DEFS.concat(FIXTURES), { stops });
    for (const p of ['Player', 'Opponent']) D(s, { type: 'Start', player: p });
    eq('own turn, own mainStart off: no window after the draw phase', [s.step, s.respond], ['main', null]);
    D(s, { type: 'EndTurn', player: 'Player' });
    eq(
      'End turn in the main phase: the turn player’s own "main ended" stop opens first, the turn has not ended',
      [s.respond && s.respond.kind, s.priority, s.active],
      ['mainEnd', 'Player', 'Player']
    );
    D(s, { type: 'Pass', player: 'Player' });
    eq(
      '...passing it runs the End turn: the end step window opens for the opponent',
      [s.respond && s.respond.kind, s.priority],
      ['end', 'Opponent']
    );
    D(s, { type: 'Pass', player: 'Opponent' });
    eq(
      'opponent’s turn: after the draw phase the "main phase started" stop opens for the Player',
      [s.active, s.step, s.respond && s.respond.kind, s.priority],
      ['Opponent', 'main', 'mainStart', 'Player']
    );
    D(s, { type: 'Pass', player: 'Player' });
    const ap0 = Sim.apCount(s, 'Opponent');
    D(s, { type: 'SetAttackPhase', player: 'Opponent', on: true });
    eq(
      'Combat pressed: "main phase ended" opens first; no combat yet, no action point spent',
      [s.respond && s.respond.kind, s.priority, s.attackPhase, Sim.apCount(s, 'Opponent')],
      ['mainEnd', 'Player', false, ap0]
    );
    rej(
      '...while it is open the turn player cannot press Combat again',
      s,
      { type: 'SetAttackPhase', player: 'Opponent', on: true },
      'priority'
    );
    D(s, { type: 'Pass', player: 'Player' });
    eq(
      '...the Player passes: combat starts and the action point is spent',
      [s.respond, s.attackPhase, s.step, Sim.apCount(s, 'Opponent')],
      [null, true, 'combat', ap0 - 1]
    );
    D(s, { type: 'SetAttackPhase', player: 'Opponent', on: false });
    eq(
      'combat ended: back in the main phase, "main phase started" opens again',
      [s.step, s.respond && s.respond.kind],
      ['main', 'mainStart']
    );
    D(s, { type: 'Pass', player: 'Player' });
    D(s, { type: 'EndTurn', player: 'Opponent' });
    eq('End turn: "main phase ended" first', s.respond && s.respond.kind, 'mainEnd');
    D(s, { type: 'Pass', player: 'Player' });
    eq('...then the end step', [s.respond && s.respond.kind, s.priority], ['end', 'Player']);
    const t = Sim.create(1911, DEFS.concat(FIXTURES), {});
    for (const p of ['Player', 'Opponent']) D(t, { type: 'Start', player: p });
    D(t, { type: 'SetAttackPhase', player: 'Player', on: true });
    check('without stops nothing waits: combat starts at once', t.attackPhase && !t.respond);
  });
})();

// 08-game-flow.js - turn structure and life boundaries, victory conditions (life, Surrender, Leave, WinGame).
// Run only these: node tests/run.js --only turn,victory
(function () {
  const { D, check, eq, rej, start, take, pass2, AT, setLife, ap } = Tests.ctx;

  Tests.add('turn-structure', () => {
    // ================= turn structure, life boundaries =================
    let s = start(150);
    const wf = take(s, 'Player', 'wolf', 'board', 'Player|front|0');
    D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
    AT(s, wf.iid);
    rej('EndTurn by the non-turn player', s, { type: 'EndTurn', player: 'Opponent' }, 'turn player');
    D(s, { type: 'EndTurn', player: 'Player' });
    eq(
      'EndTurn opens the end-step window; the turn has not changed yet',
      [s.respond && s.respond.kind, s.active, s.turn, s.priority],
      ['end', 'Player', 1, 'Opponent']
    );
    rej('EndTurn cannot be repeated while the window is open', s, { type: 'EndTurn', player: 'Player' }, 'priority');
    D(s, { type: 'Pass', player: 'Opponent' });
    eq(
      'passing in the window ends the turn and resets per-turn state',
      [s.active, s.turn, s.attackPhase, ap(s) === 0, Sim.attackedIds(s).length, s.priority, s.respond],
      ['Opponent', 2, false, false, 0, 'Opponent', null]
    );
    check('the new turn player can take a action point', D(s, { type: 'Draw', player: 'Opponent' }).ok);
    s = start(151);
    const z = take(s, 'Player', 'zap', 'hand');
    D(s, { type: 'PlayCard', iid: z.iid });
    D(s, { type: 'Pass', player: 'Opponent' });
    rej('EndTurn with a non-empty stack is rejected', s, { type: 'EndTurn', player: 'Player' }, 'Stack is not empty');
    s = start(152);
    const he = take(s, 'Player', 'heal', 'hand');
    D(s, { type: 'PlayCard', iid: he.iid });
    pass2(s);
    check('life can go above the starting value (no cap): 20 + 3 = 23', s.life.Player === 23);
    s = start(153);
    setLife(s, 'Opponent', 5);
    const sb = take(s, 'Player', 'superbolt', 'hand');
    D(s, { type: 'PlayCard', iid: sb.iid, tplayer: 'Opponent' });
    pass2(s);
    check('life can go below zero: 5 - 20 = -15', s.life.Opponent === -15);
  });

  Tests.add('victory', () => {
    // ================= victory condition =================
    let s = start(900);
    setLife(s, 'Opponent', 0);
    Sim.recalc(s, []);
    eq('life 0 is still alive: no result', s.result, null);
    setLife(s, 'Opponent', -1);
    const ev = [];
    Sim.recalc(s, ev);
    eq(
      'life -1 loses: the other player wins by life, and a GameDecided event says so',
      [s.result && s.result.winner, s.result && s.result.why, ev.some(e => e.t === 'GameDecided')],
      ['Player', 'life', true]
    );
    setLife(s, 'Player', -5);
    Sim.recalc(s, []);
    eq(
      'the first decision stands: the result does not change when the other player also drops',
      s.result.winner,
      'Player'
    );
    check(
      'after the decision the game can go on (continue): commands are still accepted',
      D(s, { type: 'Draw', player: 'Player' }).ok
    );
    s = start(901);
    setLife(s, 'Player', -1);
    setLife(s, 'Opponent', -3);
    Sim.recalc(s, []);
    eq('both players at -1 or less at once: a draw', [s.result.winner, s.result.why], [null, 'life']);
    s = start(902);
    rej('Surrender: an unknown player is rejected', s, { type: 'Surrender', player: 'Nobody' }, 'Unknown player');
    D(s, { type: 'Surrender', player: 'Player' });
    eq('Surrender: the other player wins', [s.result.winner, s.result.why], ['Opponent', 'surrender']);
    rej('a decided game cannot be surrendered again', s, { type: 'Surrender', player: 'Opponent' }, 'already decided');
    rej(
      'Surrender before the game started is rejected',
      Sim.create(903, DEFS.concat(FIXTURES)),
      { type: 'Surrender', player: 'Player' },
      'Deck building'
    );
    s = start(907);
    D(s, { type: 'Leave', player: 'Opponent' });
    eq('Leave: the other player wins, marked as left', [s.result.winner, s.result.why], ['Player', 'left']);
    const win = Fx.quick('t-win', 'Winner', 0, {
        text: 'Test Quick spell: you win the game.',
        effects: [Fx.winGame()],
      }),
      lose = Fx.quick('t-lose', 'Loser', 0, {
        text: 'Test Quick spell: your opponent wins the game.',
        effects: [Fx.winGame('foe')],
      });
    s = start(904, [win, lose]);
    const w = take(s, 'Player', 't-win', 'hand');
    D(s, { type: 'PlayCard', iid: w.iid });
    pass2(s);
    eq(
      'WinGame: the controller wins by an effect',
      [s.result && s.result.winner, s.result && s.result.why],
      ['Player', 'effect']
    );
    s = start(905, [win, lose]);
    const l = take(s, 'Player', 't-lose', 'hand');
    D(s, { type: 'PlayCard', iid: l.iid });
    pass2(s);
    eq('WinGame with who:foe: the opponent wins', s.result && s.result.winner, 'Opponent');
    check('Sim.API lists WinGame', Sim.API.effects.includes('WinGame'));
    const g = Sim.create(906, DEFS, {
        decks: { Player: BUILTIN_DECKS[1].cards, Opponent: BUILTIN_DECKS[0].cards },
        shuffle: true,
        autoStart: true,
      }),
      rnd = botRng(11),
      mem = {};
    let bad = 0,
      seen = 0;
    for (let i = 0; i < 400; i++) {
      const c = botChoose(g, botActor(g), rnd, mem);
      if (!c) break;
      seen++;
      if (c.type === 'Surrender' || c.type === 'Leave') bad++;
      D(g, c);
    }
    check('the bot never surrenders or leaves', !bad && seen > 50, 'bad=' + bad + ' seen=' + seen);
  });
  Tests.add('turn-machine', () => {
    // ================= js/sim/turn.js: the only writer of the turn's fields, with the stages each transition starts from =================
    const g = Sim.create(808, DEFS, {
      decks: { Player: BUILTIN_DECKS[0].cards, Opponent: BUILTIN_DECKS[1].cards },
      shuffle: true,
      autoStart: true,
    });
    eq('after the first draw: the main phase', Sim.turnStage(g), 'main');
    let threw = '';
    try {
      Sim.turnGo(g, 'nextTurn'); // only from the end step
    } catch (e) {
      threw = e.message;
    }
    check('a transition from the wrong stage throws in the tests', /nextTurn from stage main/.test(threw), threw);
    eq('...and changes nothing', [Sim.turnStage(g), g.turn], ['main', 1]);
    if (typeof readRepoFile !== 'function') return; // the sources are read in Node
    const src = ['dispatch', 'stack', 'ops', 'combat', 'state']
      .map(f => readRepoFile('js/sim/' + f + '.js'))
      .join('\n');
    check(
      'no other sim file assigns step, attackPhase, combats, turn or a pending flag',
      !/\.(step|attackPhase|turnEnding|mainPending|mainEndDone|drawPending|combats|turn)\s*(=[^=]|\+\+|\+=)/.test(src)
    );
  });
})();

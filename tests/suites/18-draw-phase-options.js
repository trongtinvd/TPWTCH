// 18-draw-phase-options.js - the draw phase (start -> draw -> main -> combat (optional) -> main or end), the game options of the start dialog
// (cards in the opening hand, per draw phase, per Draw action, starting life, player names), stops changed during the game (SetStop),
// cards revealed in a deck stay revealed while they are there.
// Run only these: node tests/run.js --only draw-phase,game-options,set-stop,deck-reveal
(function () {
  const { D, check, eq, rej, start, take, pass2, endTurnFlow } = Tests.ctx;

  Tests.add('draw-phase', () => {
    const s = start(1800);
    eq(
      'the first turn has a draw phase: 5 + 1 cards for the turn player, 5 for the other, then the main phase',
      [s.piles.Player.hand.length, s.piles.Opponent.hand.length, s.step, s.drawPending, s.drawn.Player],
      [6, 5, 'main', false, 1]
    );
    const h = s.piles.Opponent.hand.length,
      top = s.piles.Opponent.deck[0];
    endTurnFlow(s);
    eq(
      'next turn: start, then the draw phase draws the top card of the new turn player, then the main phase',
      [s.active, s.piles.Opponent.hand.length, top.loc, s.step],
      ['Opponent', h + 1, 'hand', 'main']
    );
    const wf = take(s, 'Opponent', 'wolf', 'board', 'Opponent|front|0');
    D(s, { type: 'SetAttackPhase', player: 'Opponent', on: true });
    eq('entering combat: the combat phase', s.step, 'combat');
    D(s, { type: 'SetAttackPhase', player: 'Opponent', on: false });
    eq('ending combat: back in the main phase', s.step, 'main');
    D(s, { type: 'EndTurn', player: 'Opponent' });
    eq('End turn: the end phase', s.step, 'end');
    check('(a creature was on the board)', wf.loc === 'board');
    const r = D(s, { type: 'Pass', player: 'Player' });
    const order = r.events.map(e => e.t).filter(t => ['TurnChanged', 'DrawStepEntered', 'CardDrawn'].includes(t));
    eq('events: the turn changes, then the draw phase and its card', order, [
      'TurnChanged',
      'DrawStepEntered',
      'CardDrawn',
    ]);
    {
      const g = Sim.create(1801, DEFS.concat(FIXTURES), {
        stops: {
          Player: { opp: { turnStart: true, draw: true }, own: {} },
          Opponent: { opp: { turnStart: true, draw: true }, own: {} },
        },
      });
      for (const p of ['Player', 'Opponent']) D(g, { type: 'Start', player: p });
      eq(
        'with the "cards drawn" stop on, the draw phase opens it for the other player',
        [g.respond && g.respond.kind, g.priority],
        ['draw', 'Opponent']
      );
      D(g, { type: 'Pass', player: 'Opponent' });
      D(g, { type: 'EndTurn', player: 'Player' });
      const n = g.piles.Opponent.hand.length;
      D(g, { type: 'Pass', player: 'Opponent' });
      eq(
        'the draw phase waits for the turn start: its stop is open, nothing drawn yet',
        [g.respond && g.respond.kind, g.piles.Opponent.hand.length, g.drawPending],
        ['turnStart', n, true]
      );
      rej(
        '...the turn player cannot end the turn before the draw phase',
        g,
        { type: 'EndTurn', player: 'Opponent' },
        'priority'
      );
      D(g, { type: 'Pass', player: 'Player' });
      eq(
        '...after the stop the draw phase comes',
        [g.piles.Opponent.hand.length, g.respond && g.respond.kind],
        [n + 1, 'draw']
      );
    }
  });

  Tests.add('game-options', () => {
    const s = Sim.create(1810, DEFS.concat(FIXTURES), {
      autoStart: true,
      rules: { startHand: 3, drawPhase: 2, drawAction: 4, life: 30 },
      names: { Player: 'Ana', Opponent: 'Bot' },
    });
    eq(
      'opening hand 3, draw phase 2, life 30',
      [s.piles.Player.hand.length, s.piles.Opponent.hand.length, s.life.Player, s.life.Opponent, s.maxLife],
      [3 + 2, 3, 30, 30, 30]
    );
    D(s, { type: 'Draw', player: 'Player' });
    eq('the Draw action draws 4', s.piles.Player.hand.length, 3 + 2 + 4);
    eq('the names are part of the state', s.names, { Player: 'Ana', Opponent: 'Bot' });
    check(
      'the logs use them',
      Narrate.story(s, s, { type: 'EndTurn', player: 'Player' }, [], 'Player').some(
        l => l.text === 'Ana ends their turn'
      )
    );
    const z = Sim.create(1811, DEFS.concat(FIXTURES), { autoStart: true, rules: { drawPhase: 0 } });
    eq('draw phase 0 (older replays): no card, no event', [z.piles.Player.hand.length, z.step], [5, 'main']);
    const d = Sim.create(1812, DEFS.concat(FIXTURES), { autoStart: true });
    eq('defaults: 5 cards, 1 per draw phase, 2 per Draw action, 20 life', d.cfg, {
      startHand: 5,
      drawPhase: 1,
      drawAction: 2,
      life: 20,
    });
    const b = Sim.create(1813, DEFS.concat(FIXTURES), { rules: { startHand: -2, life: 0, drawAction: 'x' } });
    eq(
      'bad values are clamped or ignored (life 0 is allowed)',
      [b.cfg.startHand, b.cfg.life, b.cfg.drawAction],
      [0, 0, 2]
    );
  });

  Tests.add('set-stop', () => {
    const s = Sim.create(1820, DEFS.concat(FIXTURES), {});
    const r0 = D(s, { type: 'SetStop', player: 'Player', role: 'opp', kind: 'turnStart', on: true });
    check(
      'a stop can be set during deck building (no stops before: they are created)',
      r0.ok && s.stops.Player.opp.turnStart === true
    );
    for (const p of ['Player', 'Opponent']) D(s, { type: 'Start', player: p });
    D(s, { type: 'EndTurn', player: 'Player' });
    D(s, { type: 'Pass', player: 'Opponent' });
    eq(
      'the Player’s new stop opens on the opponent’s turn start',
      [s.respond && s.respond.kind, s.priority],
      ['turnStart', 'Player']
    );
    const r = D(s, { type: 'SetStop', player: 'Player', role: 'opp', kind: 'turnStart', on: false });
    eq(
      '...it can be turned off at any time, even without priority',
      [r.ok, r.events.map(e => e.t), s.stops.Player.opp.turnStart],
      [true, ['StopChanged'], false]
    );
    check('...the open window stays open', s.respond && s.respond.kind === 'turnStart');
    D(s, { type: 'Pass', player: 'Player' });
    D(s, { type: 'EndTurn', player: 'Opponent' });
    D(s, { type: 'Pass', player: 'Player' });
    D(s, { type: 'EndTurn', player: 'Player' });
    D(s, { type: 'Pass', player: 'Opponent' });
    eq('turned off: no window on the next opponent turn start', s.respond, null);
    rej(
      'an unknown player is refused',
      s,
      { type: 'SetStop', player: 'X', role: 'opp', kind: 'draw', on: true },
      'Unknown player'
    );
  });

  Tests.add('deck-reveal', () => {
    const s = start(1830),
      li = s.piles.Player.extra.find(c => c.def.id === 'librarian'),
      u = take(s, 'Player', 'underworldfusion', 'hand');
    s.drawn.Player = 8;
    s.drawn.Opponent = 8;
    take(s, 'Player', 'soldier', 'gy');
    take(s, 'Player', 'barrier', 'gy');
    D(s, { type: 'PlayCard', iid: u.iid });
    pass2(s);
    D(s, { type: 'Choose', player: 'Player', option: li.iid });
    D(s, { type: 'Choose', player: 'Player', option: 'Player|front|2' });
    pass2(s);
    const top = s.piles.Opponent.deck[0],
      wrong = DEFS.find(d => d.id !== top.def.id && !d.extra && d.type !== 'ability').id;
    D(s, { type: 'Choose', player: 'Player', option: wrong });
    D(s, { type: 'Choose', player: 'Player', option: 'ok' });
    check(
      'L4 looked at the top card of the opponent’s deck: it is revealed to the Player while it stays there',
      Sim.isRevealed(top, 'Player') &&
        top.loc === 'deck' &&
        Sim.canSee(s, 'Player', top) &&
        !Sim.canSee(s, 'Opponent', top)
    );
    check(
      '...its status says so',
      Sim.statusLines(top).some(l => /Revealed to Player while it stays in the deck/.test(l.text || l))
    );
    eq('...the Player’s Observation knows that deck position', Sim.observe(s, 'Player').piles.Opponent.deckKnown, [
      [0, top.iid],
    ]);
    eq('...the owner’s does not', Sim.observe(s, 'Opponent').piles.Opponent.deckKnown, []);
    endTurnFlow(s);
    check(
      'drawn by its owner: it left the deck, the status ended',
      top.loc === 'hand' && !Sim.isRevealed(top, 'Player')
    );
  });
})();

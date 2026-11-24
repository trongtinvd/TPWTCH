// 01-setup.js - game setup, determinism, deck building, Draw, action points, placement.
// Run only these: node tests/run.js --only setup,draw,action-points,placement
(function () {
  const { D, other, check, eq, rej, start, take, drain, endTurnFlow, setLife, ap } = Tests.ctx;

  Tests.add('setup', () => {
    // ================= setup, determinism, deck building =================
    check('every card only uses published effect APIs', !apiErrors().length, apiErrors().join('; '));
    {
      const a = start(7),
        b = start(7),
        c = start(8);
      check('same seed -> same state', JSON.stringify(a) === JSON.stringify(b));
      check(
        'different seed -> different state (so the comparison above is not vacuous)',
        JSON.stringify(a) !== JSON.stringify(c)
      );
      const run = () => {
        const s = start(9),
          z = take(s, 'Player', 'zap', 'hand');
        D(s, { type: 'PlayCard', iid: z.iid });
        D(s, { type: 'Pass', player: s.priority });
        D(s, { type: 'Pass', player: s.priority });
        D(s, { type: 'Draw', player: 'Player' });
        return JSON.stringify(s);
      };
      check('replaying the same commands from the same seed reproduces the same final state', run() === run());
    }
    {
      const s = Sim.create(3, DEFS.concat(FIXTURES)),
        top = s.piles.Player.deck.map(c => c.iid),
        n = top.length;
      rej('deck building: only Start/ReorderDeck are accepted', s, { type: 'Draw', player: 'Player' }, 'Deck building');
      D(s, { type: 'ReorderDeck', player: 'Player', from: 0, to: 3 });
      eq(
        'ReorderDeck moves position 0 to position 3 and shifts the others up',
        s.piles.Player.deck.map(c => c.iid).slice(0, 4),
        [top[1], top[2], top[3], top[0]]
      );
      eq('reordering keeps the same set of cards', s.piles.Player.deck.map(c => c.iid).sort(), [...top].sort());
      rej(
        'ReorderDeck rejects an out-of-range position',
        s,
        { type: 'ReorderDeck', player: 'Player', from: 0, to: n },
        'Bad deck position'
      );
      D(s, { type: 'Start', player: 'Player' });
      rej(
        'a ready player\u2019s deck is locked',
        s,
        { type: 'ReorderDeck', player: 'Player', from: 0, to: 1 },
        'locked'
      );
      rej('Start twice by the same player is rejected', s, { type: 'Start', player: 'Player' }, 'Already ready');
      check(
        'no hands are dealt until BOTH players are ready',
        s.phase === 'deck' && !s.piles.Player.hand.length && !s.piles.Opponent.hand.length
      );
      D(s, { type: 'Start', player: 'Opponent' });
      eq(
        'both ready: play phase, opening hand = first five cards of the reordered deck, then the first turn’s draw phase draws the next one',
        [s.phase, s.piles.Player.hand.map(c => c.iid), s.piles.Player.deck.length, s.piles.Opponent.hand.length],
        ['play', [top[1], top[2], top[3], top[0], top[4], top[5]], n - 6, 5]
      );
      rej('Start after the game began is rejected', s, { type: 'Start', player: 'Player' }, 'already started');
    }
  });

  Tests.add('draw', () => {
    // ================= draw / action point =================
    let s = start(10);
    const P = s.piles.Player,
      top = P.deck.slice(0, 2).map(c => c.iid),
      h0 = P.hand.length,
      d0 = P.deck.length;
    D(s, { type: 'Draw', player: 'Player' });
    eq(
      'Draw adds the top two deck cards to the hand, in order',
      P.hand.slice(h0).map(c => c.iid),
      top
    );
    check(
      'Draw: deck shrinks by exactly 2, drawn cards are in hand, action point used',
      P.deck.length === d0 - 2 && P.hand.slice(h0).every(c => c.loc === 'hand') && !ap(s)
    );
    rej('a second action point in the same turn is rejected', s, { type: 'Draw', player: 'Player' }, 'No action point');
    s = start(11);
    s.piles.Player.deck.splice(1);
    const last = s.piles.Player.deck[0],
      hh = s.piles.Player.hand.length;
    D(s, { type: 'Draw', player: 'Player' });
    check(
      'with one card left, Draw takes just that card',
      s.piles.Player.hand.length === hh + 1 && s.piles.Player.hand[hh] === last && !s.piles.Player.deck.length
    );
    Sim.gainAP(s, 'Player', []);
    rej('Draw with an empty deck is rejected', s, { type: 'Draw', player: 'Player' }, 'Deck is empty');
    s = start(12);
    const zz = take(s, 'Player', 'zap', 'hand');
    D(s, { type: 'PlayCard', iid: zz.iid });
    D(s, { type: 'Pass', player: 'Opponent' });
    rej('Draw is rejected while the stack is not empty', s, { type: 'Draw', player: 'Player' }, 'Stack is not empty');
    s = start(13);
    D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
    rej('Draw is rejected during the battle phase', s, { type: 'Draw', player: 'Player' }, 'battle phase');
    s = start(14);
    D(s, { type: 'EndTurn', player: 'Player' });
    rej(
      'the non-turn player cannot Draw (a action point) in the end-step window; nothing changes',
      s,
      { type: 'Draw', player: 'Opponent' },
      'turn player'
    );
  });

  Tests.add('action-points', () => {
    // ================= action points =================
    let s = start(15);
    eq('start: the first player holds one action point, the other none', [ap(s, 'Player'), ap(s, 'Opponent')], [1, 0]);
    endTurnFlow(s);
    eq('the next turn gives its player one point; the unspent one stays', [ap(s, 'Player'), ap(s, 'Opponent')], [1, 1]);
    endTurnFlow(s);
    eq('unspent points pile up: a player can hold several', [ap(s, 'Player'), ap(s, 'Opponent')], [2, 1]);
    const r = D(s, { type: 'Draw', player: 'Player' }),
      sp = r.events.find(e => e.t === 'ActionPointSpent');
    eq(
      'spending one is an event naming the player and the reason; the oldest point goes first',
      [sp && sp.player, sp && sp.why, sp && sp.id, ap(s, 'Player')],
      ['Player', 'Draw', 1, 1]
    );
    check(
      'a spent point stays in the list, with when and why',
      Sim.apList(s, 'Player').length === 2 &&
        Sim.apList(s, 'Player')[0].spent.why === 'Draw' &&
        Sim.apList(s, 'Player')[0].spent.turn === 3
    );
    eq('with a second point the same turn can take a second action', D(s, { type: 'Draw', player: 'Player' }).ok, true);
    rej('...and a third is refused', s, { type: 'Draw', player: 'Player' }, 'No action point');
    s = start(16);
    const wd = take(s, 'Opponent', 'wardrum', 'hand');
    endTurnFlow(s);
    endTurnFlow(s);
    s.priority = 'Opponent';
    eq(
      'setup: Player 1\u2019s turn again, Player 2 kept its unspent point',
      [s.active, ap(s, 'Opponent')],
      ['Player', 1]
    );
    check('War Drum: the additional cost can be paid on the opponent\u2019s turn', Sim.canPayExtra(s, wd));
    const r2 = D(s, { type: 'PlayCard', iid: wd.iid, slot: 'Opponent|back|1', extra: true });
    eq(
      'War Drum paid off-turn: one of the opponent\u2019s points is spent, the turn player\u2019s is untouched',
      [r2.ok, ap(s, 'Opponent'), ap(s, 'Player'), r2.events.find(e => e.t === 'ActionPointSpent').why],
      [true, 0, 2, 'War Drum (additional cost)']
    );
    s = start(17);
    const sb = take(s, 'Opponent', 'superbolt', 'hand');
    Sim.gainAP(s, 'Opponent', []);
    s.priority = 'Opponent';
    rej(
      'Slow spells still need the controller\u2019s own turn, whatever points they hold',
      s,
      { type: 'PlayCard', iid: sb.iid, tplayer: 'Player' },
      'turn player only'
    );
    s = start(18);
    D(s, { type: 'Draw', player: 'Player' });
    rej('no point, no Draw', s, { type: 'Draw', player: 'Player' }, 'No action point');
    Sim.RULES.apLimit = false;
    const free = D(s, { type: 'Draw', player: 'Player' });
    Sim.RULES.apLimit = true;
    eq(
      'RULES.apLimit = false lifts the limit and spends nothing',
      [free.ok, free.events.some(e => e.t === 'ActionPointSpent')],
      [true, false]
    );
    s = start(19);
    D(s, { type: 'EndTurn', player: 'Player' });
    const tc = D(s, { type: 'Pass', player: 'Opponent' });
    check(
      'the new turn\u2019s point is announced by an event',
      tc.events.some(e => e.t === 'ActionPointGained' && e.player === 'Opponent')
    );
  });

  Tests.add('placement', () => {
    // ================= placement and the one-action-point rule =================
    let s = start(20);
    const sd = take(s, 'Player', 'soldier', 'hand'),
      bar = take(s, 'Player', 'barrier', 'hand');
    rej(
      'a creature cannot be placed in a back-row zone',
      s,
      { type: 'PlayCard', iid: sd.iid, slot: 'Player|back|0' },
      'Illegal zone'
    );
    rej(
      'a creature cannot be placed on the opponent\u2019s side',
      s,
      { type: 'PlayCard', iid: sd.iid, slot: 'Opponent|front|0' },
      'Illegal zone'
    );
    rej(
      'a non-creature permanent cannot be placed in a front-row zone',
      s,
      { type: 'PlayCard', iid: bar.iid, slot: 'Player|front|0' },
      'Illegal zone'
    );
    const r = D(s, { type: 'PlayCard', iid: sd.iid, slot: 'Player|front|0' });
    check(
      'summon: creature stands on the chosen zone, left the hand, action point used',
      r.ok &&
        sd.loc === 'board' &&
        sd.slot === 'Player|front|0' &&
        s.slots['Player|front|0'] === sd.iid &&
        !s.piles.Player.hand.includes(sd) &&
        !ap(s)
    );
    check(
      'summon opens an enter-response window for the opponent and puts nothing on the stack',
      !!s.respond && s.respond.kind === 'enter' && s.priority === 'Opponent' && !s.stack.length
    );
    rej('the turn player cannot act while the opponent may respond', s, { type: 'Draw', player: 'Player' }, 'priority');
    drain(s);
    const sb = take(s, 'Player', 'superbolt', 'hand'),
      he = take(s, 'Player', 'heal', 'hand');
    rej(
      'after a summon a second permanent is rejected (action point used)',
      s,
      { type: 'PlayCard', iid: bar.iid, slot: 'Player|back|0' },
      'No action point'
    );
    rej(
      'after a summon a Slow spell is rejected (action point used)',
      s,
      { type: 'PlayCard', iid: sb.iid, tplayer: 'Opponent' },
      'No action point'
    );
    check('after a summon a Quick spell is still legal (free action)', Sim.canPlay(s, he) === null);
    s = start(21);
    const w = take(s, 'Player', 'wolf', 'hand');
    take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|0');
    take(s, 'Player', 'soldier', 'board', 'Player|front|0');
    rej('an occupied zone is rejected', s, { type: 'PlayCard', iid: w.iid, slot: 'Player|front|0' }, 'Illegal zone');
    s = start(22);
    const five = ['soldier', 'knight', 'giant', 'guard', 'wolf'].map((id, i) =>
        take(s, 'Player', id, 'board', 'Player|front|' + i)
      ),
      ar = take(s, 'Player', 'archer', 'hand'),
      bb = take(s, 'Player', 'barrier', 'hand');
    rej(
      'full front row: a sixth creature is rejected for the right reason, nothing is created or moved',
      s,
      { type: 'PlayCard', iid: ar.iid, slot: 'Player|front|0' },
      'No free front zone'
    );
    check(
      'full front row: the five creatures are still in place, back row is still usable',
      five.every((c, i) => c.slot === 'Player|front|' + i && s.slots['Player|front|' + i] === c.iid) &&
        Sim.canPlay(s, bb) === null
    );
    s = start(23);
    const o1 = take(s, 'Opponent', 'soldier', 'hand');
    rej(
      'the non-turn player cannot place a permanent on the turn player\u2019s turn',
      s,
      { type: 'PlayCard', iid: o1.iid, slot: 'Opponent|front|0' },
      'priority'
    );
    s.priority = 'Opponent';
    rej(
      'with priority but off-turn, permanents are still turn-player-only',
      s,
      { type: 'PlayCard', iid: o1.iid, slot: 'Opponent|front|0' },
      'turn player only'
    );
    s = start(24);
    const s1 = take(s, 'Player', 'soldier', 'hand'),
      h1 = take(s, 'Player', 'heal', 'hand');
    D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
    rej(
      'battle phase: permanents are rejected',
      s,
      { type: 'PlayCard', iid: s1.iid, slot: 'Player|front|0' },
      'Only Quick spells during the battle phase'
    );
    check('battle phase: Quick spells are still legal', Sim.canPlay(s, h1) === null);
  });
})();

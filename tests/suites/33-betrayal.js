// 33-betrayal.js - Unexpected Betrayal (spec: claude/SPEC_secret_cards.md, "Betrayal control switch").
// Slow spell, 1 AP, Stack HP 1: reveal your opponent's hand, secretly select a card; it secretly gains the passive "when you play this
// card, switch its controller" (not on the stack). Its owner plays it and pays every cost (their targets stay); a spell resolves under the
// thief's control and goes to its owner's graveyard; a permanent enters a free zone of the thief's row that the thief picks (none: it goes
// to its owner's graveyard).
// Run only these: node tests/run.js --only betrayal
(function () {
  const { D, check, eq, start, take, drain, endTurnFlow } = Tests.ctx;
  // Player casts Betrayal with `foe` (card ids) as the Opponent's whole hand, secretly picks foe[pick]; then it is the Opponent's turn
  function betray(seed, foe, pick, mine) {
    const s = start(seed),
      O = s.piles.Opponent;
    for (const c of O.hand.slice()) {
      O.hand.splice(O.hand.indexOf(c), 1);
      c.loc = 'deck';
      O.deck.push(c);
    }
    const cs = foe.map(id => take(s, 'Opponent', id, 'hand')),
      b = take(s, 'Player', 'betrayal', 'hand');
    (mine || []).forEach(([id, slot]) => take(s, 'Player', id, 'board', slot));
    const r = D(s, { type: 'PlayCard', iid: b.iid });
    drain(s);
    const k = s.choice,
      pre = structuredClone(s),
      r2 = D(s, { type: 'Choose', player: 'Player', option: cs[pick].iid });
    drain(s);
    endTurnFlow(s);
    let n = 0;
    while ((s.active !== 'Opponent' || s.stack.length || s.respond) && !s.choice && n++ < 30)
      D(s, { type: 'Pass', player: s.priority });
    return { s, cs, b, r, k, pre, r2 };
  }

  Tests.add('betrayal-text', () => {
    const d = Cards.list.find(x => x.id === 'betrayal');
    eq('Unexpected Betrayal is a Slow spell with Stack HP 1', [d.type, d.timing, d.hp], ['spell', 'Slow', 1]);
    check(
      'Its text: reveal the opponent’s hand, secretly select, the passive',
      /reveal your opponent.s hand/i.test(d.text) &&
        /secretly select/.test(d.text) &&
        /switch its controller/.test(d.text),
      d.text
    );
    const g = Cards.list.find(x => x.id === 'archer').grants.betray;
    check(
      'The gained passive is not on the stack: a Betray passive with its text',
      g.passives.some(p => p.op === 'Betray' && /^Passive: when you play this card, switch its controller/.test(p.text))
    );
  });

  Tests.add('betrayal-cast', () => {
    const { s, cs, k, pre, r2 } = betray(3301, ['zap', 'soldier', 'archer'], 0);
    check(
      'The opponent’s hand is revealed to the caster',
      cs.every(c => Sim.isRevealed(c, 'Player'))
    );
    check(
      'The caster secretly selects one of those cards',
      k && k.kind === 'secretgrant' && k.player === 'Player' && k.secret && k.options.length === 3
    );
    const ev = Sim.observeEvents(pre, s, r2.events, 'Opponent'),
      foe = Sim.observe(s, 'Opponent');
    check(
      'The owner’s SecretPlaced has no card',
      ev.some(e => e.t === 'SecretPlaced' && !e.card)
    );
    check('The owner never sees the status', !JSON.stringify(foe.cards).includes('grant'));
    eq(
      'The owner knows a secret on one of 3 cards',
      foe.secrets.map(x => [x.what, x.cands.length, x.card]),
      [['betray', 3, undefined]]
    );
  });

  Tests.add('betrayal-spell', () => {
    const { s, cs } = betray(3302, ['zap', 'soldier'], 0),
      zap = cs[0],
      life = { Player: s.life.Player, Opponent: s.life.Opponent };
    const r = D(s, { type: 'PlayCard', iid: zap.iid });
    const top = s.stack[s.stack.length - 1];
    check(
      'Its owner plays it; it goes on the stack under the thief’s control',
      r.ok && top && top.controller === 'Player',
      r.why
    );
    check(
      'The switch is a passive (nothing more on the stack) and reveals the secret',
      s.stack.length === 1 &&
        r.events.some(e => e.t === 'SecretRevealed') &&
        r.events.some(e => e.t === 'ControlSwitched')
    );
    check('The thief gets priority first', s.priority === 'Player');
    drain(s);
    eq(
      'It resolves for the thief: the owner takes the damage',
      [life.Opponent - s.life.Opponent, life.Player - s.life.Player],
      [1, 0]
    );
    check('It goes to its owner’s graveyard', s.piles.Opponent.gy.includes(zap) && !zap.controller);
  });

  Tests.add('betrayal-permanent', () => {
    {
      const { s, cs } = betray(3303, ['soldier', 'zap'], 0, [['knight', 'Player|front|0']]),
        so = cs[0],
        ap = s.players.Opponent.ap.filter(a => !a.spent).length;
      const r = D(s, { type: 'PlayCard', iid: so.iid, slot: 'Opponent|front|2' });
      check(
        'Its owner pays (an action point) and picks a zone of their own',
        r.ok && s.players.Opponent.ap.filter(a => !a.spent).length === ap - 1,
        r.why
      );
      eq(
        'Before it enters, the thief picks a free zone of their front row',
        [s.choice && s.choice.player, s.choice && s.choice.kind, s.choice && s.choice.options],
        ['Player', 'place', ['Player|front|1', 'Player|front|2', 'Player|front|3', 'Player|front|4']]
      );
      D(s, { type: 'Choose', player: 'Player', option: 'Player|front|3' });
      drain(s);
      eq(
        'It enters there under the thief’s control, still the owner’s card',
        [so.loc, so.slot, so.controller, so.owner],
        ['board', 'Player|front|3', 'Player', 'Opponent']
      );
      check('The owner’s zone stays empty', !s.slots['Opponent|front|2']);
    }
    {
      const full = ['soldier', 'knight', 'giant', 'guard', 'wolf'].map((id, i) => [id, 'Player|front|' + i]);
      const { s, cs } = betray(3304, ['archer', 'zap'], 0, full),
        a = cs[0];
      const r = D(s, { type: 'PlayCard', iid: a.iid, slot: 'Opponent|front|0' });
      check(
        'No free zone on the thief’s side: it goes to its owner’s graveyard',
        r.ok && a.loc === 'gy' && s.piles.Opponent.gy.includes(a) && !a.controller && !s.choice,
        r.why
      );
    }
  });

  Tests.add('betrayal-narrow', () => {
    const { s, cs } = betray(3305, ['zap', 'heal', 'soldier'], 2);
    D(s, { type: 'PlayCard', iid: cs[0].iid });
    drain(s);
    const r = Sim.observe(s, 'Opponent').secrets[0];
    eq('A candidate played without switching is ruled out', [r.state, r.cands.length], ['armed', 2]);
    check('It stayed under its owner’s control', !cs[0].controller);
  });
})();

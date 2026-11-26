// 32-secret-twin.js - card secrets, grants (a status that adds an ability) and Duplicate's spell mode (spec: claude/SPEC_secret_cards.md).
// Secret Twin: Slow spell, 0 AP, Stack HP 1. Cost: reveal your hand. Effect: your opponent secretly selects one of those cards; it secretly
// gains Duplicate (a 'grant' status that stays when the card changes zones). Duplicate on a spell: when it is put on the stack (Stack HP =
// the spell's HP), a token copy of it goes on the stack (same targets and modifications); the copy ceases to exist when it leaves the stack.
// Run only these: node tests/run.js --only twin
(function () {
  const { D, check, eq, start, take, drain } = Tests.ctx;
  const grants = c => Sim.live(c).filter(x => x.kind === 'grant');
  // Player casts Secret Twin with `hand` (card ids) in hand besides it; returns the cards in hand and the state, the Twin resolved up to the pick
  function cast(seed, hand) {
    const s = start(seed),
      P = s.piles.Player;
    for (const c of P.hand.slice()) {
      P.hand.splice(P.hand.indexOf(c), 1);
      c.loc = 'deck';
      P.deck.push(c);
    } // an empty hand, then exactly the cards the test wants
    const tw = take(s, 'Player', 'secrettwin', 'hand'),
      cs = hand.map(id => take(s, 'Player', id, 'hand'));
    const r = D(s, { type: 'PlayCard', iid: tw.iid });
    drain(s);
    return { s, tw, cs, r };
  }

  Tests.add('twin-text', () => {
    const d = Cards.list.find(x => x.id === 'secrettwin');
    eq(
      'Secret Twin is a Slow spell with Stack HP 1 and costs no action point',
      [d.type, d.timing, d.hp, d.ap],
      ['spell', 'Slow', 1, 0]
    );
    check('Its text shows no action point cost', !/action point/.test(d.text), d.text);
    check(
      'Its text: reveal your hand (a cost), the opponent secretly selects, it gains Duplicate',
      /reveal your hand/i.test(d.text) && /opponent secretly selects/.test(d.text) && /Duplicate/.test(d.text),
      d.text
    );
    const h = Cards.list.find(x => x.id === 'heal').grants.duplicate,
      t = h.triggers[h.triggers.length - 1];
    check(
      'A spell with a gained Duplicate: a cast trigger on the stack whose Stack HP is the spell HP',
      t.on === 'cast' && t.zone === 'stack' && t.kw === 'duplicate' && t.hp === 3 && /put on the stack/.test(t.text),
      JSON.stringify(t)
    );
    const g = Cards.list.find(x => x.id === 'archer').grants.duplicate;
    check(
      'A permanent with a gained Duplicate: the enter trigger, its copy without it',
      g.triggers.some(x => x.kw === 'duplicate' && x.on === 'enter') &&
        !(g.tokens.duplicate.triggers || []).some(x => x.kw === 'duplicate')
    );
  });

  Tests.add('twin-cast', () => {
    {
      const s = start(3201),
        tw = take(s, 'Player', 'secrettwin', 'hand');
      s.players.Player.ap.forEach(a => (a.spent = a.spent || { why: 'test', turn: s.turn }));
      const r = D(s, { type: 'PlayCard', iid: tw.iid });
      check(
        'It can be cast with no action point left, and spends none',
        r.ok && !r.events.some(e => e.t === 'ActionPointSpent'),
        r.why
      );
    }
    const { s, cs, r } = cast(3202, ['heal', 'soldier', 'archer']);
    check(
      'The cost reveals every other card of the hand to the opponent',
      cs.every(c => Sim.isRevealed(c, 'Opponent'))
    );
    check(
      'A HandRevealed event names them',
      r.events.some(e => e.t === 'HandRevealed' && e.iids.length === 3)
    );
    const k = s.choice;
    check(
      'On resolution the opponent secretly selects one of the revealed cards',
      k && k.kind === 'secretgrant' && k.player === 'Opponent' && k.secret && k.options.length === 3
    );
    const me = Sim.observe(s, 'Player').choice;
    check('The caster sees a secret pick, no options', me && me.secret && !me.options);
    const pre = structuredClone(s),
      r2 = D(s, { type: 'Choose', player: 'Opponent', option: cs[0].iid });
    check(
      'Heal secretly gains Duplicate (a grant status that stays when it changes zones)',
      grants(cs[0]).length === 1 && grants(cs[0])[0].keep
    );
    const mine = Sim.observe(s, 'Player'),
      foe = Sim.observe(s, 'Opponent');
    check('The caster never sees the status', !JSON.stringify(mine.cards).includes('grant'));
    eq(
      'The caster knows a secret and its candidates, never the card',
      mine.secrets.map(x => [x.kind, x.what, x.cands.length, x.card]),
      [['card', 'duplicate', 3, undefined]]
    );
    eq(
      'The picker knows the card',
      foe.secrets.map(x => x.card),
      [cs[0].iid]
    );
    const ev = Sim.observeEvents(pre, s, r2.events, 'Player');
    check(
      'The caster’s SecretPlaced has no card',
      ev.some(e => e.t === 'SecretPlaced' && !e.card)
    );
    const L = Narrate.story(
      Sim.observeStep(pre, s, { type: 'Choose', player: 'Opponent', option: cs[0].iid }, r2.events, 'Player')
    );
    check(
      'The caster’s log: a card was secretly selected, never which',
      L.some(l => /secretly selects a card/.test(l.text)) && !L.some(l => /Heal/.test(l.text)),
      L.map(l => l.text).join(' / ')
    );
    check('The Twin went to the graveyard', s.piles.Player.gy.some(c => c.def.id === 'secrettwin') && !s.stack.length);
  });

  Tests.add('twin-spell', () => {
    const { s, cs } = cast(3203, ['zap', 'soldier']),
      zap = cs[0];
    D(s, { type: 'Choose', player: 'Opponent', option: zap.iid });
    drain(s);
    const life0 = s.life.Opponent,
      r = D(s, { type: 'PlayCard', iid: zap.iid });
    const top = s.stack[s.stack.length - 1];
    check(
      'Duplicate triggers when the spell is put on the stack, with the spell’s HP',
      r.ok && s.stack.length === 2 && top.kind === 'ability' && top.hp === 0,
      r.why
    );
    check(
      'The secret is revealed',
      r.events.some(e => e.t === 'SecretRevealed' && e.card === zap.iid)
    );
    check(
      'Once revealed the caster sees the status',
      JSON.stringify(Sim.observe(s, 'Player').cards[zap.iid]).includes('grant')
    );
    D(s, { type: 'Pass', player: s.priority });
    D(s, { type: 'Pass', player: s.priority });
    const cp = s.stack[s.stack.length - 1];
    check(
      'A token copy goes on the stack above the spell, same targets and HP',
      s.stack.length === 2 && cp.copy && cp.tplayer === s.stack[0].tplayer && cp.hp === s.stack[0].hp,
      JSON.stringify(s.stack.map(o => [o.kind, o.name, o.copy, o.tplayer])) +
        ' ch=' +
        JSON.stringify(s.choice && s.choice.kind)
    );
    drain(s);
    eq('Both resolve: twice the damage', life0 - s.life.Opponent, 2);
    check(
      'The copy ceases to exist: only the spell is in the graveyard',
      s.piles.Player.gy.filter(c => c.def.name === 'Zap').length === 1
    );
  });

  Tests.add('twin-narrow', () => {
    const { s, cs } = cast(3204, ['heal', 'soldier', 'archer']);
    D(s, { type: 'Choose', player: 'Opponent', option: cs[2].iid });
    drain(s);
    D(s, { type: 'PlayCard', iid: cs[1].iid, slot: 'Player|front|0' });
    drain(s);
    const r = Sim.observe(s, 'Player').secrets[0];
    eq('A candidate played without Duplicate triggering is ruled out', [r.state, r.cands.length], ['armed', 2]);
    D(s, { type: 'EndTurn', player: 'Player' });
    drain(s);
    // the archer, played next turn of Player
    let n = 0;
    while (s.active !== 'Player' && n++ < 20) {
      if (s.choice) break;
      D(s, { type: s.stack.length || s.respond ? 'Pass' : 'EndTurn', player: s.priority });
    }
    s.players.Player.ap.push({ id: 999, turn: s.turn, spent: null });
    const r2 = D(s, { type: 'PlayCard', iid: cs[2].iid, slot: 'Player|front|2' });
    const top = s.stack[s.stack.length - 1];
    check('The permanent: Duplicate triggers when it enters, Stack HP = its HP', r2.ok && top && top.hp === 2, r2.why);
    drain(s);
    if (s.choice) D(s, { type: 'Choose', player: 'Player', option: s.choice.options[0] });
    drain(s);
    const tok = Object.values(s.cards).find(c => c.token && c.loc === 'board' && c.def.name === 'Archer');
    check(
      'A token copy entered, without Duplicate',
      tok && !grants(tok).length && !tok.def.triggers.some(t => t.kw === 'duplicate')
    );
    check('The grant stayed on the card when it entered the board', grants(cs[2]).length === 1);
  });
})();

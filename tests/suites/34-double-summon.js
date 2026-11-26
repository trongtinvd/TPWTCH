// 34-double-summon.js - Double Summon (spec: claude/SPEC_secret_cards.md, card 4 and "Betrayal control switch").
// Slow spell, 1 AP, Stack HP 1. Pay 3 life (a cost, paid when it is played); the player who played it puts two creatures/enchantments
// from their hand into play under their control (fewer when fewer can enter: no "Done"). Stolen by Betrayal: its owner pays the life
// and their cards enter under their control; the thief picks which (no new card becomes revealed). Played by L4: the L4 player pays and
// puts their own cards in.
// Run only these: node tests/run.js --only double-summon
(function () {
  const { D, check, eq, start, take, drain, endTurnFlow, pass2, setLife } = Tests.ctx;
  const ids = (s, L) => L.map(i => s.cards[i].def.id);
  // p's whole hand becomes `hand` (card ids); returns the cards
  function hand(s, p, L) {
    const P = s.piles[p];
    for (const c of P.hand.slice()) {
      P.hand.splice(P.hand.indexOf(c), 1);
      c.loc = 'deck';
      P.deck.push(c);
    }
    return L.map(id => take(s, p, id, 'hand'));
  }
  // answer every pending choice of the resolution: an upto pick by `pick` order, a place in the first offered zone
  function answer(s, pick) {
    let n = 0;
    while (s.choice && n++ < 10) {
      const k = s.choice,
        o =
          k.kind === 'upto'
            ? pick.map(id => k.options.find(i => s.cards[i] && s.cards[i].def.id === id)).find(Boolean)
            : k.options[0];
      D(s, { type: 'Choose', player: k.player, option: o });
    }
  }

  Tests.add('double-summon-text', () => {
    const d = Cards.list.find(x => x.id === 'doublesummon');
    eq(
      'Double Summon is a Slow spell, Stack HP 1, 1 AP',
      [d.type, d.timing, d.hp, d.ap === undefined || d.ap === 1],
      ['spell', 'Slow', 1, true]
    );
    eq('Its cost: pay 3 life', d.cost, [{ op: 'PayLife', n: 3 }]);
    check(
      'Its text: pay 3 life; the player who played it puts 2 creatures or enchantments from their hand into play',
      /pay 3 life/i.test(d.text) &&
        /player who played this card puts 2 creatures or enchantments from their hand into play/.test(d.text),
      d.text
    );
  });

  Tests.add('double-summon-basic', () => {
    const s = start(3401),
      [ds, so, ba] = hand(s, 'Player', ['doublesummon', 'soldier', 'barrier', 'zap']),
      life = s.life.Player,
      ap = Sim.apCount(s, 'Player');
    const r = D(s, { type: 'PlayCard', iid: ds.iid });
    check(
      'Played: 1 action point and 3 life, paid at once',
      r.ok && Sim.apCount(s, 'Player') === ap - 1 && s.life.Player === life - 3,
      r.why
    );
    drain(s);
    const k = s.choice;
    eq(
      'On resolution its player picks among the creatures/enchantments of their hand, no Done',
      [k && k.kind, k && k.player, k && ids(s, k.options).sort()],
      ['upto', 'Player', ['barrier', 'soldier']]
    );
    answer(s, ['soldier', 'barrier']);
    eq(
      'Both enter the board under their owner’s control',
      [so.loc, ba.loc, so.controller, ba.controller, so.slot.split('|')[1], ba.slot.split('|')[1]],
      ['board', 'board', undefined, undefined, 'front', 'back']
    );
    check('Then it goes to the graveyard', ds.loc === 'gy' && !s.choice);
  });

  Tests.add('double-summon-fewer', () => {
    {
      const s = start(3402),
        [ds, so] = hand(s, 'Player', ['doublesummon', 'soldier', 'zap']);
      D(s, { type: 'PlayCard', iid: ds.iid });
      drain(s);
      answer(s, ['soldier']);
      check('One creature in hand: it alone enters', so.loc === 'board' && ds.loc === 'gy' && !s.choice);
    }
    {
      const s = start(3403),
        [ds] = hand(s, 'Player', ['doublesummon', 'zap']);
      D(s, { type: 'PlayCard', iid: ds.iid });
      drain(s);
      check('None: nothing to choose, it resolves', !s.choice && ds.loc === 'gy');
    }
    {
      const s = start(3404),
        [ds] = hand(s, 'Player', ['doublesummon', 'soldier']);
      setLife(s, 'Player', 2);
      eq('2 life: it cannot be played', Sim.canPlay(s, ds), 'Cost: not enough life');
      setLife(s, 'Player', 3);
      eq('3 life: paying down to 0 is fine', Sim.canPlay(s, ds), null);
    }
  });

  Tests.add('double-summon-duplicate', () => {
    const s = start(3405),
      [ds, sa] = hand(s, 'Player', ['doublesummon', 'shieldarmy']);
    D(s, { type: 'PlayCard', iid: ds.iid });
    drain(s);
    answer(s, ['shieldarmy']);
    drain(s);
    answer(s, []);
    eq(
      'Entering by Double Summon is entering: Duplicate 2 makes two token copies',
      [sa.loc, Object.values(s.cards).filter(c => c.token && c.loc === 'board' && c.def.name === 'Shield Army').length],
      ['board', 2]
    );
  });

  Tests.add('double-summon-granted-token', () => {
    // a token copy of a card that GAINED Duplicate (Secret Twin) keeps its triggers, and they resolve (its def is known to the Sim)
    const s = start(3410),
      [ds, pa] = hand(s, 'Player', ['doublesummon', 'parasite']);
    Sim.addStatus(s, pa, { kind: 'grant', what: 'duplicate', keep: true, srcName: 'test' });
    D(s, { type: 'PlayCard', iid: ds.iid });
    let n = 0,
      err = null;
    try {
      while ((s.stack.length || s.choice || s.respond) && n++ < 60) {
        if (s.choice) D(s, { type: 'Choose', player: s.choice.player, option: s.choice.options[0] });
        else D(s, { type: 'Pass', player: s.priority });
      }
    } catch (e) {
      err = e.message;
    }
    const tk = Object.values(s.cards).filter(c => c.token && c.def.id === 'parasite+duplicate-token');
    check(
      'Its copies entered and their triggers resolved without error',
      !err && tk.length >= 1 && !s.stack.length,
      err ||
        [
          pa.loc,
          pa.def.type,
          n,
          JSON.stringify(s.choice && s.choice.kind),
          Object.values(s.cards)
            .filter(c => c.token)
            .map(c => c.def.id + '@' + c.loc),
        ].join(' ')
    );
  });

  // Player casts Betrayal on the Opponent's hand `foe`, secretly picking foe[pick]; then it is the Opponent's turn
  function betray(seed, foe, pick) {
    const s = start(seed),
      cs = hand(s, 'Opponent', foe),
      b = take(s, 'Player', 'betrayal', 'hand');
    D(s, { type: 'PlayCard', iid: b.iid });
    drain(s);
    D(s, { type: 'Choose', player: 'Player', option: cs[pick].iid });
    drain(s);
    endTurnFlow(s);
    let n = 0;
    while ((s.active !== 'Opponent' || s.stack.length || s.respond) && !s.choice && n++ < 30)
      D(s, { type: 'Pass', player: s.priority });
    return { s, cs };
  }

  Tests.add('double-summon-stolen', () => {
    const { s, cs } = betray(3406, ['doublesummon', 'soldier', 'knight', 'barrier'], 0),
      [ds, so, kn] = cs,
      late = take(s, 'Opponent', 'giant', 'hand'), // came to the hand after Betrayal: not revealed
      life = { Player: s.life.Player, Opponent: s.life.Opponent };
    const r = D(s, { type: 'PlayCard', iid: ds.iid });
    check(
      'Its owner plays it and pays the life; it goes on the stack under the thief’s control',
      r.ok &&
        s.life.Opponent === life.Opponent - 3 &&
        s.life.Player === life.Player &&
        s.stack[s.stack.length - 1].controller === 'Player',
      r.why
    );
    drain(s);
    const k = s.choice;
    eq(
      'The thief picks among the owner’s hand',
      [k && k.kind, k && k.player, k && ids(s, k.options).sort()],
      ['upto', 'Player', ['barrier', 'giant', 'knight', 'soldier']]
    );
    const P = Sim.choicePicks(s, 'Player');
    eq('Revealed cards are clicked, the others listed', [P.how[kn.iid], P.how[late.iid]], ['click', 'list']);
    answer(s, ['knight', 'giant']);
    eq(
      'They enter the owner’s board under the owner’s control',
      [kn.loc, late.loc, kn.slot.split('|')[0], late.slot.split('|')[0], kn.controller, late.controller],
      ['board', 'board', 'Opponent', 'Opponent', undefined, undefined]
    );
    check('Soldier stays in the hand; no new card became revealed', so.loc === 'hand' && ds.loc === 'gy');
    check('The spell went to its owner’s graveyard', s.piles.Opponent.gy.includes(ds) && !ds.controller);
  });

  Tests.add('double-summon-betray-candidate', () => {
    // Betrayal's secret is "when you PLAY this card": a candidate put into play by Double Summon is not ruled out
    const { s, cs } = betray(3407, ['doublesummon', 'soldier', 'knight'], 1),
      [ds, so, kn] = cs;
    D(s, { type: 'PlayCard', iid: ds.iid });
    drain(s);
    answer(s, ['soldier', 'knight']);
    const r = Sim.observe(s, 'Opponent').secrets[0];
    eq(
      'Double Summon itself (played) is ruled out, the two cards it put into play are not',
      [r.state, r.cands.length, so.loc, kn.loc],
      ['armed', 2, 'board', 'board']
    );
  });

  Tests.add('double-summon-l4', () => {
    const s = start(3408),
      li = s.piles.Player.extra.find(c => c.def.id === 'librarian'),
      u = take(s, 'Player', 'underworldfusion', 'hand'),
      [so] = hand(s, 'Player', ['soldier', 'underworldfusion']),
      foe = hand(s, 'Opponent', ['knight']),
      O = s.piles.Opponent;
    s.drawn.Player = 8;
    s.drawn.Opponent = 8;
    take(s, 'Player', 'guard', 'gy');
    take(s, 'Player', 'banner', 'gy');
    const ds = take(s, 'Opponent', 'doublesummon', 'gy');
    O.gy.splice(O.gy.indexOf(ds), 1);
    ds.loc = 'deck';
    O.deck.unshift(ds);
    D(s, { type: 'PlayCard', iid: u.iid });
    pass2(s);
    D(s, { type: 'Choose', player: 'Player', option: li.iid });
    D(s, { type: 'Choose', player: 'Player', option: 'Player|front|2' });
    pass2(s);
    check(
      'The declare list has card names only: no gained-ability variant (x+duplicate), no token',
      s.choice.kind === 'declare' &&
        !s.choice.options.some(i => /\+|-token$/.test(i)) &&
        s.choice.options.includes('doublesummon')
    );
    D(s, { type: 'Choose', player: 'Player', option: 'doublesummon' });
    const life = s.life.Player;
    eq('The top card is Double Summon: it may be played', s.choice && s.choice.kind, 'libplay');
    D(s, { type: 'Choose', player: 'Player', option: 'play' });
    check('The L4 player pays the 3 life', s.life.Player === life - 3 && ds.loc === 'stack', [s.life.Player, life]);
    D(s, { type: 'Choose', player: 'Player', option: 'giant' });
    D(s, { type: 'Choose', player: 'Player', option: 'ok' });
    pass2(s);
    const k = s.choice;
    eq(
      'It resolves: the L4 player puts in their own cards',
      [k && k.kind, k && k.player, k && ids(s, k.options)],
      ['upto', 'Player', ['soldier']]
    );
    answer(s, ['soldier']);
    check('Soldier entered; the Opponent’s Knight stays in their hand', so.loc === 'board' && foe[0].loc === 'hand');
  });

  Tests.add('double-summon-l4-cost', () => {
    // L4 checks a spell's costs too: with 2 life the L4 player cannot play Double Summon
    const s = start(3409),
      li = s.piles.Player.extra.find(c => c.def.id === 'librarian'),
      u = take(s, 'Player', 'underworldfusion', 'hand'),
      O = s.piles.Opponent;
    s.drawn.Player = 8;
    s.drawn.Opponent = 8;
    take(s, 'Player', 'guard', 'gy');
    take(s, 'Player', 'banner', 'gy');
    const ds = take(s, 'Opponent', 'doublesummon', 'gy');
    O.gy.splice(O.gy.indexOf(ds), 1);
    ds.loc = 'deck';
    O.deck.unshift(ds);
    setLife(s, 'Player', 2);
    D(s, { type: 'PlayCard', iid: u.iid });
    pass2(s);
    D(s, { type: 'Choose', player: 'Player', option: li.iid });
    D(s, { type: 'Choose', player: 'Player', option: 'Player|front|2' });
    pass2(s);
    D(s, { type: 'Choose', player: 'Player', option: 'doublesummon' });
    eq(
      'It cannot be played',
      [s.choice && s.choice.kind, /cannot be played/.test(s.choice && s.choice.prompt)],
      ['libseen', true]
    );
  });
})();

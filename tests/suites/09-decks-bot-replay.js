// 09-decks-bot-replay.js - deck validation and the deck store, card search, Sim.create options, the bot, replays, derived card text, Store.
// Run only these: node tests/run.js --only decks,create-options,bot,replay,card-text
(function () {
  const { D, check, eq, rej } = Tests.ctx;

  Tests.add('decks', () => {
    // ================= decks, card search =================
    const ids = DEFS.filter(d => !d.extra).map(d => d.id),
      al = DEFS.slice().sort((a, b) => a.name.localeCompare(b.name));
    check(
      'default decks: two or more, unique names, every one valid (10-100 singleton known cards)',
      BUILTIN_DECKS.length >= 2 &&
        new Set(BUILTIN_DECKS.map(d => d.name)).size === BUILTIN_DECKS.length &&
        BUILTIN_DECKS.every(d => !deckProblem(d.cards)),
      BUILTIN_DECKS.map(d => deckProblem(d.cards)).join('; ')
    );
    eq(
      'deckProblem: 9 cards are too few, 10 are fine',
      [!!deckProblem(ids.slice(0, 9)), deckProblem(ids.slice(0, 10))],
      [true, null]
    );
    check(
      'deckProblem: duplicates and unknown ids are rejected',
      !!deckProblem(ids.slice(0, 9).concat(ids[0])) && !!deckProblem(ids.slice(0, 9).concat('nope'))
    );
    check(
      'saveProblem: empty name, used name (defaults too) and too few cards block saving',
      /name/i.test(saveProblem('  ', ids, null)) &&
        saveProblem(BUILTIN_DECKS[0].name, ids, null) === 'Name already used' &&
        /at least/.test(saveProblem('zz unused', ids.slice(0, 9), null)) &&
        saveProblem('zz unused', ids, null) === null
    );
    check(
      'saveProblem: a saved deck may be saved again under its own name',
      saveProblem(BUILTIN_DECKS[0].name, ids, BUILTIN_DECKS[0].name) === null
    );
    eq(
      'search: the closest match is first (exact, partial, misspelled)',
      ['bolt', 'bolt master', 'hummingbrd', 'drum', 'shark'].map(q => rankCards(q, DEFS)[0].id),
      ['bolt', 'boltmaster', 'hummingbird', 'wardrum', 'shark']
    );
    eq(
      'search: everything after the closest match is alphabetical',
      rankCards('drum', DEFS)
        .slice(1)
        .map(d => d.id),
      al.filter(d => d.id !== 'wardrum').map(d => d.id)
    );
    eq(
      'search: an empty query is plain alphabetical order',
      rankCards('  ', DEFS).map(d => d.id),
      al.map(d => d.id)
    );
  });

  Tests.add('create-options', () => {
    // ================= Sim.create options: decks, shuffle, autoStart, debug reorder =================
    const A = [
        'zap',
        'heal',
        'bolt',
        'archer',
        'scout',
        'charm',
        'ward',
        'wolf',
        'guard',
        'soldier',
        'knight',
        'giant',
      ],
      all = DEFS.concat(FIXTURES);
    let s = Sim.create(500, all, {
      decks: { Player: A, Opponent: A.slice().reverse() },
      shuffle: false,
      autoStart: true,
    });
    eq(
      'create with decks + no shuffle + autoStart: play phase, hand = first five of the list + the draw phase card, the rest stays in the deck in order',
      [s.phase, s.piles.Player.hand.map(c => c.def.id), s.piles.Player.deck.map(c => c.def.id)],
      ['play', A.slice(0, 6), A.slice(6)]
    );
    eq(
      'the second player has its own list',
      s.piles.Opponent.hand.map(c => c.def.id),
      A.slice().reverse().slice(0, 5)
    );
    const t = Sim.create(500, all, { decks: { Player: A, Opponent: A }, shuffle: true }),
      od = t.piles.Player.deck.map(c => c.def.id);
    check(
      'shuffle on: same cards in another order; without autoStart the deck phase waits',
      t.phase === 'deck' && [...od].sort().join() === [...A].sort().join() && od.join() !== A.join()
    );
    eq(
      'unknown card ids in a deck list are skipped',
      Sim.create(501, DEFS, {
        decks: { Player: ['zap', 'nope', 'heal'], Opponent: ['zap'] },
        shuffle: false,
      }).piles.Player.deck.map(c => c.def.id),
      ['zap', 'heal']
    );
    eq(
      'Sim.create without options: deck phase, the whole pool (extra deck creatures go to the extra deck)',
      [
        Sim.create(503, DEFS).phase,
        Sim.create(503, DEFS).piles.Player.deck.length,
        Sim.create(503, DEFS).piles.Opponent.extra.length,
      ],
      ['deck', DEFS.filter(d => !d.extra).length, DEFS.filter(d => d.extra).length]
    );
    s = Sim.create(502, all, { decks: { Player: A, Opponent: A }, shuffle: false, autoStart: true });
    const top = s.piles.Player.deck.map(c => c.iid);
    rej(
      'ReorderDeck in a running game needs the debug flag (decks are locked)',
      s,
      { type: 'ReorderDeck', player: 'Player', from: 0, to: 2 },
      'locked'
    );
    D(s, { type: 'ReorderDeck', player: 'Player', from: 0, to: 2, debug: true });
    eq(
      'debug ReorderDeck works mid-game: the top card moves to position 3, same cards remain',
      [s.piles.Player.deck.map(c => c.iid).slice(0, 3), s.piles.Player.deck.length],
      [[top[1], top[2], top[0]], top.length]
    );
  });

  Tests.add('bot', () => {
    // ================= the bot plays only legal commands =================
    const s = Sim.create(600, DEFS, {
        decks: { Player: BUILTIN_DECKS[1].cards, Opponent: BUILTIN_DECKS[0].cards },
        shuffle: true,
        autoStart: true,
      }),
      rnd = botRng(7),
      mem = {};
    let bad = 0,
      steps = 0,
      stuck = false;
    for (; steps < 600; steps++) {
      const cmd = botChoose(s, botActor(s), rnd, mem);
      if (!cmd) {
        stuck = true;
        break;
      }
      if (!D(s, cmd).ok) bad++;
    }
    check(
      'bot vs bot: 600 commands, every one legal, never stuck, turns keep passing',
      !bad && !stuck && s.turn > 6,
      'bad=' + bad + ' stuck=' + stuck + ' steps=' + steps + ' turn=' + s.turn
    );
  });

  Tests.add('bot-options', () => {
    // ================= the bot decides from its options alone (plain data), never from the state =================
    const s = Sim.create(601, DEFS, {
        decks: { Player: BUILTIN_DECKS[0].cards, Opponent: BUILTIN_DECKS[1].cards },
        shuffle: true,
        autoStart: true,
      }),
      r1 = botRng(8),
      r2 = botRng(8),
      m1 = {},
      m2 = {};
    let same = 0,
      steps = 0,
      plain = true;
    for (; steps < 300; steps++) {
      const p = botActor(s),
        v = Sim.optionsFor(s, p),
        j = JSON.stringify(v);
      if (/"def"|"name"|"statuses"|"logs"/.test(j)) plain = false;
      const a = botChoose(s, p, r1, m1),
        b = botDecide(deepFreeze(JSON.parse(j)), r2, m2, cmd => Sim.accepts(s, cmd));
      if (!a) break;
      if (JSON.stringify(a) === JSON.stringify(b)) same++;
      D(s, a);
    }
    check('the options are plain data: no card definition, name, status or log', plain);
    eq('a JSON copy of the options gives the same decisions (300 commands)', [same, steps], [300, 300]);
    const before = JSON.stringify(s);
    Sim.accepts(s, { type: 'EndTurn', player: botActor(s) });
    check('Sim.accepts does not change the state', JSON.stringify(s) === before);
  });

  Tests.add('deck-store', () => {
    // ================= DeckStore and the deck editor filter =================
    const ids = DEFS.map(d => d.id).slice(0, 10);
    DeckStore.save('zz tmp deck', ids);
    const had = DeckStore.nameUsed('zz tmp deck');
    DeckStore.remove('zz tmp deck');
    eq('DeckStore.remove deletes a saved deck', [had, DeckStore.nameUsed('zz tmp deck')], [true, false]);
    const bolts = DEFS.filter(d => cardMatches('bolt', d)).map(d => d.id);
    check(
      'deck editor "Only matches": names containing the query (or a typo of it) match, others do not',
      bolts.includes('bolt') &&
        bolts.includes('boltmaster') &&
        bolts.includes('superbolt') &&
        !bolts.includes('zap') &&
        cardMatches('', DEFS[0]),
      bolts.join()
    );
  });

  Tests.add('deck-extra', () => {
    // ================= decks with an extra deck =================
    const ids = DEFS.filter(d => !d.extra).map(d => d.id),
      xs = DEFS.filter(d => d.extra).map(d => d.id);
    eq(
      'deckProblem: a valid extra deck, an unknown or non-extra card in it, a duplicate, an extra creature in the main deck',
      [
        deckProblem(ids, xs),
        !!deckProblem(ids, ['zap']),
        !!deckProblem(ids, [xs[0], xs[0]]),
        !!deckProblem(ids.concat(xs[0])),
      ],
      [null, true, true, true]
    );
    check(
      'the default decks all have an extra deck list (the full pool has every extra creature)',
      BUILTIN_DECKS.every(d => Array.isArray(d.extra)) && BUILTIN_DECKS[0].extra.join() === xs.join()
    );
    DeckStore.save('zz xdeck', ids.slice(0, 10), xs);
    const back = DeckStore.find('zz xdeck');
    DeckStore.save('zz plain', ids.slice(0, 10));
    const plain = DeckStore.find('zz plain');
    DeckStore.remove('zz xdeck');
    DeckStore.remove('zz plain');
    eq(
      'DeckStore keeps the extra deck; decks saved without one load with an empty one',
      [back.cards.length, back.extra, plain.extra],
      [10, xs, []]
    );
  });

  Tests.add('replay', () => {
    // ================= replay: seed + decks + the accepted commands rebuild the identical game =================
    const opts = {
        decks: { Player: BUILTIN_DECKS[1].cards, Opponent: BUILTIN_DECKS[0].cards },
        shuffle: true,
        autoStart: true,
      },
      a = Sim.create(800, DEFS, opts),
      rnd = botRng(3),
      mem = {},
      cmds = [];
    for (let i = 0; i < 300; i++) {
      const cmd = botChoose(a, botActor(a), rnd, mem);
      if (!cmd) break;
      if (D(a, cmd).ok) cmds.push(JSON.parse(JSON.stringify(cmd)));
    }
    const b = Sim.create(800, DEFS, opts);
    let bad = 0;
    for (const cmd of cmds) if (!D(b, cmd).ok) bad++;
    check(
      'replay: seed + decks + the recorded commands rebuild the identical game state',
      cmds.length > 50 && !bad && JSON.stringify(a) === JSON.stringify(b),
      'commands=' + cmds.length + ' rejected=' + bad
    );
  });

  Tests.add('card-text', () => {
    // ================= card text derived from abilities, Store =================
    const hb = DEFS.find(d => d.id === 'hummingbird'),
      parts = textParts(hb);
    eq(
      'card text is derived from the abilities: Red Hummingbird = 2 triggers, then 1 ability',
      parts.map(x => x.key),
      ['triggers:0', 'triggers:1', 'abilities:0']
    );
    check('...and def.text is exactly those parts joined', hb.text === parts.map(x => x.text).join(' '));
    const wd = textParts(DEFS.find(d => d.id === 'wardrum'));
    check(
      'War Drum: its two enter triggers have different texts (the stack inspector highlights one of them)',
      wd.filter(x => x.list === 'triggers').length === 2 && new Set(wd.map(x => x.text)).size === wd.length
    );
    const miss = DEFS.filter(d =>
      [...(d.triggers || []), ...(d.abilities || []), ...(d.passives || [])].some(o => !o.text)
    ).map(d => d.id);
    check('every trigger, ability and passive of every pool card has its own text', !miss.length, miss.join());
    check(
      'every pool card has a derived text; Avatar\u2019s rider is a part of its own',
      DEFS.every(d => d.text && d.text.length > 10) &&
        textParts(DEFS.find(d => d.id === 'avatar')).some(x => x.list === 'rider')
    );
    Store.set('tpw_zz_probe', 'a|b');
    const got = [Store.get('tpw_zz_probe'), Store.keys('tpw_zz_').length];
    Store.del('tpw_zz_probe');
    eq('Store: set / get / keys / del', [...got, Store.get('tpw_zz_probe')], ['a|b', 1, null]);
  });
})();

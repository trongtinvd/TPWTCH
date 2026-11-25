// 10-extra-deck.js - extra deck creatures: materials and conditions data, Underworld Fusion, Depth Sea Fusion, Biology Cultivator,
// Widow Maker, L4: The Librarian.
// Run only these: node tests/run.js --only extra,underworld,depthsea,cultivator,widowmaker,librarian
(function () {
  const { D, check, eq, rej, start, take, toDeck, pass2, drain, endTurnFlow, setLife, shield, ap, owners } = Tests.ctx;

  Tests.add('extra-deck', () => {
    // ================= extra deck basics =================
    const s0 = start(1000),
      xs = DEFS.filter(d => d.extra).map(d => d.id);
    eq(
      'the pool\u2019s extra deck creatures start in the extra deck, never in the main deck',
      [
        s0.piles.Player.extra.map(c => c.def.id),
        s0.piles.Player.deck.some(c => c.def.extra),
        s0.piles.Player.extra.every(c => c.loc === 'extra'),
      ],
      [xs, false, true]
    );
    check(
      'materials and conditions are plain data on the card (they do nothing by themselves): the creature cannot be played from the extra deck',
      !!DEFS.find(d => d.id === 'widowmaker').materials && Sim.canPlay(s0, s0.piles.Player.extra[0]) === 'Not in hand'
    );
    check(
      'extra deck creatures are purple, the card text lists conditions and materials',
      cardColor(DEFS.find(d => d.id === 'widowmaker')) === EXTRA_COLOR &&
        /Conditions: a player has lost life/.test(DEFS.find(d => d.id === 'widowmaker').text) &&
        /Materials: 2 creatures with the same power or the same HP/.test(DEFS.find(d => d.id === 'widowmaker').text) &&
        /Materials: a creature, an enchantment/.test(DEFS.find(d => d.id === 'librarian').text)
    );
    check(
      'logs: an extra deck card starts with its extra deck position',
      /extra deck/.test(Sim.logLines(s0.piles.Player.extra[0])[0].text)
    );
    const only = Sim.create(1001, DEFS, {
      decks: { Player: ['zap', 'widowmaker', 'heal'], Opponent: ['zap'] },
      extra: { Player: ['librarian', 'zap'], Opponent: [] },
      shuffle: false,
    });
    eq(
      'Sim.create: an extra deck list holds only extra deck creatures, the main deck none',
      [
        only.piles.Player.deck.map(c => c.def.id),
        only.piles.Player.extra.map(c => c.def.id),
        only.piles.Opponent.extra.length,
      ],
      [['zap', 'heal'], ['librarian'], 0]
    );
    const s1 = start(1002);
    D(s1, { type: 'Draw', player: 'Player' });
    eq(
      'cards drawn are counted per player (the opening hand does not count; the draw phase and the Draw action do)',
      [s1.drawn.Player, s1.drawn.Opponent],
      [1 + 2, 0]
    );
  });

  Tests.add('underworld', () => {
    // ================= Underworld Fusion =================
    let s = start(1010);
    const uf = take(s, 'Player', 'underworldfusion', 'hand'),
      so = take(s, 'Player', 'soldier', 'gy'),
      wf = take(s, 'Player', 'wolf', 'gy');
    check(
      'Underworld Fusion needs a creature whose conditions are met: none yet',
      Sim.canPlay(s, uf) === 'Requirement: no extra deck creature can be summoned'
    );
    setLife(s, 'Opponent', 15);
    check('...a lost life makes the conditions of Widow Maker true: now it can be played', Sim.canPlay(s, uf) === null);
    D(s, { type: 'PlayCard', iid: uf.iid });
    pass2(s);
    const wm = s.piles.Player.extra.find(c => c.def.id === 'widowmaker');
    eq(
      'it reveals only creatures whose conditions are met and whose materials are in the GY',
      [s.choice.kind, s.choice.options],
      ['fusepick', [wm.iid]]
    );
    D(s, { type: 'Choose', player: 'Player', option: wm.iid });
    check(
      'the revealed card gets a revealed status (to the opponent) that lives while it stays in the extra deck',
      Sim.isRevealed(wm, 'Opponent') && Sim.live(wm).some(x => x.kind === 'revealed' && x.zone === 'extra')
    );
    eq(
      'Widow Maker needs 2 creatures with the same power or HP: every fitting GY card is offered for the first one',
      [s.choice.kind, s.choice.options.sort()],
      ['fusemat', [so.iid, wf.iid].sort()]
    );
    D(s, { type: 'Choose', player: 'Player', option: so.iid });
    eq(
      'the second material is the only one left: chosen by itself, then the summon zone is asked',
      [s.choice.kind, so.loc, wf.loc],
      ['place', 'exile', 'exile']
    );
    D(s, { type: 'Choose', player: 'Player', option: 'Player|front|2' });
    check(
      'the materials are exiled, the creature is summoned; the extra deck is one smaller; the spell is in the GY',
      wm.loc === 'board' &&
        wm.slot === 'Player|front|2' &&
        s.piles.Player.extra.length === 1 &&
        uf.loc === 'gy' &&
        s.piles.Player.exile.includes(so)
    );
    eq(
      'the materials used are remembered on the summoned creature',
      Sim.live(wm)
        .filter(x => x.kind === 'mats')
        .map(x => x.cards.map(m => m.id).sort()),
      [['soldier', 'wolf']]
    );
    // the GY ability returns it and the exiled materials
    s.slots['Player|front|2'] = null;
    wm.slot = null;
    wm.loc = 'gy';
    s.piles.Player.gy.unshift(wm);
    Sim.recalc(s, []);
    check(
      'the memory of the materials survives the card leaving the board',
      Sim.live(wm).some(x => x.kind === 'mats')
    );
    drain(s);
    D(s, { type: 'Activate', iid: uf.iid, ab: 0 });
    check('Underworld Fusion\u2019s GY ability: exiled by its cost', uf.loc === 'exile' && s.stack.length === 1);
    pass2(s);
    eq('...then an extra deck creature in the GY is picked', [s.choice.kind, s.choice.options], ['pick', [wm.iid]]);
    D(s, { type: 'Choose', player: 'Player', option: wm.iid });
    check(
      'the creature goes back to the extra deck and the materials come back from exile to the hand',
      wm.loc === 'extra' &&
        s.piles.Player.extra.includes(wm) &&
        so.loc === 'hand' &&
        wf.loc === 'hand' &&
        s.piles.Player.hand.includes(so) &&
        !Sim.live(wm).some(x => x.kind === 'mats')
    );
    // works for a creature summoned by another card too (its materials are not in exile: only the creature returns)
    s = start(1011);
    const w2 = take(s, 'Player', 'widowmaker', 'gy'),
      ufx = take(s, 'Player', 'underworldfusion', 'gy'),
      mt = take(s, 'Player', 'soldier', 'exile');
    Sim.addStatus(s, w2, {
      kind: 'mats',
      cards: [
        { iid: mt.iid, id: 'soldier', name: 'Soldier' },
        { iid: 'gone-1', id: 'wolf', name: 'Wolf' },
      ],
      keep: true,
      srcName: 'Depth Sea Fusion',
    });
    D(s, { type: 'Activate', iid: ufx.iid, ab: 0 });
    pass2(s);
    D(s, { type: 'Choose', player: 'Player', option: w2.iid });
    check(
      'only the materials that are in exile return; a creature summoned by another card works the same',
      w2.loc === 'extra' && mt.loc === 'hand'
    );
    s = start(1012);
    const u2 = take(s, 'Player', 'underworldfusion', 'gy');
    rej(
      'the GY ability needs an extra deck creature in the GY',
      s,
      { type: 'Activate', iid: u2.iid, ab: 0 },
      'extra deck creature in your graveyard'
    );
  });

  Tests.add('depthsea', () => {
    // ================= Depth Sea Fusion =================
    let s = start(1020);
    const df = take(s, 'Player', 'depthfusion', 'hand'),
      so = take(s, 'Player', 'soldier', 'hand'),
      wf = take(s, 'Player', 'wolf', 'board', 'Player|front|0');
    D(s, { type: 'PlayCard', iid: df.iid });
    pass2(s);
    const wm = s.piles.Player.extra.find(c => c.def.id === 'widowmaker');
    check(
      'materials may come from the field, hand or deck: the extra deck creatures that can be paid are offered',
      s.choice.kind === 'fusepick' && s.choice.options.includes(wm.iid)
    );
    D(s, { type: 'Choose', player: 'Player', option: wm.iid });
    D(s, { type: 'Choose', player: 'Player', option: so.iid });
    check(
      'the second material can come from another zone: the offer lists it with its zone',
      s.choice.kind === 'fusemat' && s.choice.options.includes(wf.iid) && /board/.test(s.choice.labels[wf.iid])
    );
    D(s, { type: 'Choose', player: 'Player', option: wf.iid });
    D(s, { type: 'Choose', player: 'Player', option: 'Player|front|1' });
    check(
      'only hand and field cards used: the conditions are ignored (nobody lost life) and the creature is summoned; the materials are in the GY',
      wm.loc === 'board' && so.loc === 'gy' && wf.loc === 'gy' && s.life.Player === 20 && s.life.Opponent === 20
    );
    // a deck material: the conditions matter
    s = start(1021);
    const d2 = take(s, 'Player', 'depthfusion', 'hand'),
      a = toDeck(s, 'Player', 'soldier'),
      b = toDeck(s, 'Player', 'wolf'),
      w3 = s.piles.Player.extra.find(c => c.def.id === 'widowmaker');
    D(s, { type: 'PlayCard', iid: d2.iid });
    pass2(s);
    D(s, { type: 'Choose', player: 'Player', option: w3.iid });
    D(s, { type: 'Choose', player: 'Player', option: a.iid });
    D(s, { type: 'Choose', player: 'Player', option: b.iid });
    check(
      'a material from the deck: the conditions are checked (unmet): materials are sent to the GY, nothing is summoned',
      a.loc === 'gy' && b.loc === 'gy' && w3.loc === 'extra' && !s.choice
    );
    s = start(1022);
    const d3 = take(s, 'Player', 'depthfusion', 'hand'),
      a3 = toDeck(s, 'Player', 'soldier'),
      b3 = toDeck(s, 'Player', 'wolf'),
      w4 = s.piles.Player.extra.find(c => c.def.id === 'widowmaker');
    setLife(s, 'Opponent', 19);
    D(s, { type: 'PlayCard', iid: d3.iid });
    pass2(s);
    D(s, { type: 'Choose', player: 'Player', option: w4.iid });
    D(s, { type: 'Choose', player: 'Player', option: a3.iid });
    D(s, { type: 'Choose', player: 'Player', option: b3.iid });
    D(s, { type: 'Choose', player: 'Player', option: 'Player|front|2' });
    check('...with the conditions met the deck materials summon it', w4.loc === 'board' && a3.loc === 'gy');
    // its GY / deck ability
    s = start(1023);
    const d4 = toDeck(s, 'Player', 'depthfusion'),
      h0 = s.piles.Player.hand.length;
    check(
      'actionsOf lists the deck ability',
      Sim.actionsOf(s, 'Player').some(x => x.kind === 'ability' && x.iid === d4.iid)
    );
    D(s, { type: 'Activate', iid: d4.iid, ab: 0 });
    check('the ability costs an action point (spent on activation)', ap(s) === 0 && s.stack.length === 1);
    pass2(s);
    eq('from the deck: this card is added to the hand', [d4.loc, s.piles.Player.hand.length], ['hand', h0 + 1]);
    s = start(1024);
    const d5 = take(s, 'Player', 'depthfusion', 'gy');
    D(s, { type: 'Draw', player: 'Player' });
    rej('no action point, no ability', s, { type: 'Activate', iid: d5.iid, ab: 0 }, 'no action point');
    endTurnFlow(s);
    endTurnFlow(s);
    D(s, { type: 'Activate', iid: d5.iid, ab: 0 });
    pass2(s);
    check('from the GY too, on any turn the player has an action point', d5.loc === 'hand');
    s = start(1025);
    const d6 = take(s, 'Player', 'depthfusion', 'hand');
    check('Depth Sea Fusion needs something to summon', Sim.canPlay(s, d6) === null);
    for (const c of s.piles.Player.extra.slice()) {
      s.piles.Player.extra.splice(s.piles.Player.extra.indexOf(c), 1);
      c.loc = 'gone';
    }
    check(
      '...with an empty extra deck it cannot be played',
      Sim.canPlay(s, d6) === 'Requirement: no extra deck creature can be summoned'
    );
  });

  Tests.add('cultivator', () => {
    // ================= Biology Cultivator =================
    let s = start(1030);
    const bc = take(s, 'Player', 'cultivator', 'hand'),
      wm = s.piles.Player.extra.find(c => c.def.id === 'widowmaker');
    D(s, { type: 'PlayCard', iid: bc.iid, slot: 'Player|front|2' });
    pass2(s);
    check(
      'Cultivator: the trigger asks which extra deck creature to reveal',
      s.choice.kind === 'fusepick' && s.choice.options.includes(wm.iid)
    );
    D(s, { type: 'Choose', player: 'Player', option: wm.iid });
    check(
      'conditions not met: only the reveal happens',
      !s.choice && Sim.isRevealed(wm, 'Opponent') && wm.loc === 'extra'
    );
    s = start(1031);
    const b2 = take(s, 'Player', 'cultivator', 'hand'),
      a = toDeck(s, 'Player', 'soldier'),
      b = toDeck(s, 'Player', 'wolf'),
      w2 = s.piles.Player.extra.find(c => c.def.id === 'widowmaker');
    setLife(s, 'Opponent', 18);
    D(s, { type: 'PlayCard', iid: b2.iid, slot: 'Player|front|2' });
    pass2(s);
    D(s, { type: 'Choose', player: 'Player', option: w2.iid });
    D(s, { type: 'Choose', player: 'Player', option: a.iid });
    D(s, { type: 'Choose', player: 'Player', option: b.iid });
    check(
      'conditions met: the materials go from the deck to the hand, the creature stays in the extra deck',
      a.loc === 'hand' && b.loc === 'hand' && w2.loc === 'extra' && !Sim.live(w2).some(x => x.kind === 'mats')
    );
  });

  Tests.add('widowmaker', () => {
    // ================= Widow Maker =================
    let s = start(1040);
    const wm = take(s, 'Player', 'widowmaker', 'board', 'Player|front|2'),
      so = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'),
      wf = take(s, 'Opponent', 'wolf', 'board', 'Opponent|back|1');
    take(s, 'Opponent', 'guard', 'board', 'Opponent|front|4');
    Sim.enterCombat(s);
    D(s, { type: 'Attack', iid: wm.iid });
    pass2(s);
    check(
      'Widow Maker attacks: the only adjacent pair is chosen at once and the opponent is asked',
      s.choice &&
        s.choice.kind === 'pairsend' &&
        s.choice.player === 'Opponent' &&
        s.choice.options.sort().join() === [so.iid, wf.iid].sort().join()
    );
    D(s, { type: 'Choose', player: 'Opponent', option: wf.iid });
    check('the opponent chooses which of the two goes to the GY', wf.loc === 'gy' && so.loc === 'board');
    s = start(1041);
    const w2 = take(s, 'Player', 'widowmaker', 'board', 'Player|front|2'),
      s1 = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'),
      s2 = take(s, 'Opponent', 'wolf', 'board', 'Opponent|back|1'),
      s3 = take(s, 'Opponent', 'guard', 'board', 'Opponent|front|2');
    Sim.enterCombat(s);
    D(s, { type: 'Attack', iid: w2.iid });
    eq(
      'several adjacent pairs: the controller picks one when the trigger is put on the stack (column neighbours and row neighbours)',
      [s.choice.kind, s.choice.player, s.choice.options.length],
      ['trigtarget', 'Player', 2]
    );
    const o = s.choice.options.find(x => x.includes('front|1') && x.includes('front|2'));
    D(s, { type: 'Choose', player: 'Player', option: o });
    pass2(s);
    eq(
      '...and, when the trigger resolves, the foe is asked about exactly those two',
      [s.choice.kind, s.choice.player, s.choice.options.sort()],
      ['pairsend', 'Opponent', [s1.iid, s3.iid].sort()]
    );
    {
      // a token is a legal choice: the action is "send it to the GY", whether or not it gets there (a token ceases to exist)
      const t = start(1046),
        wt = take(t, 'Player', 'widowmaker', 'board', 'Player|front|2'),
        cr = take(t, 'Opponent', 'soldier', 'board', 'Opponent|front|1'),
        tk = {
          iid: 'tk-90',
          def: Object.values(DEFS.find(d => d.id === 'wardrum').tokens)[0],
          owner: 'Opponent',
          loc: 'board',
          slot: 'Opponent|front|2',
          statuses: [],
          token: true,
        };
      t.cards[tk.iid] = tk;
      t.slots[tk.slot] = tk.iid;
      Sim.enterCombat(t);
      D(t, { type: 'Attack', iid: wt.iid });
      pass2(t);
      check('a creature + a token: the foe is asked about both', t.choice && t.choice.options.includes(tk.iid));
      D(t, { type: 'Choose', player: 'Opponent', option: tk.iid });
      check(
        '...sending the token is allowed: it ceases to exist, the creature stays',
        tk.loc === 'gone' && cr.loc === 'board'
      );
    }
    s = start(1042);
    const w3 = take(s, 'Player', 'widowmaker', 'board', 'Player|front|2'),
      r1 = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'),
      r2 = take(s, 'Opponent', 'wolf', 'board', 'Opponent|back|1');
    shield(s, r2, 'red');
    Sim.enterCombat(s);
    D(s, { type: 'Attack', iid: w3.iid });
    pass2(s);
    check(
      'a red-shielded card cannot be targeted: no pair, nothing happens',
      !s.choice && r1.loc === 'board' && r2.loc === 'board'
    );
    // the 0 HP trigger
    s = start(1043);
    const w4 = take(s, 'Player', 'widowmaker', 'board', 'Player|front|2'),
      f1 = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'),
      nw = take(s, 'Opponent', 'wolf', 'hand');
    endTurnFlow(s);
    D(s, { type: 'PlayCard', iid: nw.iid, slot: 'Opponent|front|2' });
    eq(
      'a foe card enters next to another foe card: Widow Maker\u2019s 0 HP trigger goes on the stack',
      [owners(s), s.stack[s.stack.length - 1].hp],
      [['Player'], 0]
    );
    pass2(s);
    eq(
      'it asks the controller for a creature to attack with',
      [s.choice.kind, s.choice.player, s.choice.options],
      ['pick', 'Player', [w4.iid]]
    );
    D(s, { type: 'Choose', player: 'Player', option: w4.iid });
    check(
      'the chosen creature attacks at once (an extra Attack object on the stack)',
      s.stack.some(x => x.kind === 'attack' && x.iid === w4.iid)
    );
    s = start(1044);
    take(s, 'Player', 'widowmaker', 'board', 'Player|front|2');
    const lone = take(s, 'Opponent', 'wolf', 'hand');
    endTurnFlow(s);
    D(s, { type: 'PlayCard', iid: lone.iid, slot: 'Opponent|front|2' });
    eq('a foe card entering next to MY card only (no other card of theirs): no trigger', s.stack.length, 0);
    s = start(1045);
    take(s, 'Player', 'widowmaker', 'board', 'Player|front|2');
    take(s, 'Player', 'soldier', 'board', 'Player|front|1');
    const mine = take(s, 'Player', 'knight', 'hand');
    D(s, { type: 'PlayCard', iid: mine.iid, slot: 'Player|front|0' });
    eq('a card I control entering does not trigger it', s.stack.length, 0);
  });

  Tests.add('librarian', () => {
    // ================= L4: The Librarian =================
    const ready = seed => {
      const s = start(seed),
        li = s.piles.Player.extra.find(c => c.def.id === 'librarian'),
        u = take(s, 'Player', 'underworldfusion', 'hand');
      s.drawn.Player = 8;
      s.drawn.Opponent = 8;
      return { s, li, u };
    };
    {
      const { s, li, u } = ready(1050);
      const so = take(s, 'Player', 'soldier', 'gy'),
        ba = take(s, 'Player', 'barrier', 'gy');
      D(s, { type: 'PlayCard', iid: u.iid });
      pass2(s);
      check(
        'both players drew more than 7 cards: the conditions are met and L4 is offered',
        s.choice.options.includes(li.iid)
      );
      D(s, { type: 'Choose', player: 'Player', option: li.iid });
      D(s, { type: 'Choose', player: 'Player', option: 'Player|front|2' });
      check(
        'materials: a creature and an enchantment from the GY',
        li.loc === 'board' && so.loc === 'exile' && ba.loc === 'exile'
      );
      eq(
        'summoned without Heaven and Sun: only the declare trigger (10 HP) and no reorder trigger',
        s.stack.map(o => o.hp),
        [10]
      );
    }
    {
      const { s, u } = ready(1051);
      take(s, 'Player', 'soldier', 'gy');
      take(s, 'Player', 'barrier', 'gy');
      check(
        'with both players over the threshold L4 can be summoned (a creature and an enchantment are in the GY)',
        Sim.canPlay(s, u) === null
      );
      s.drawn.Opponent = 7;
      check(
        '7 cards is not more than 7: one player short of it, nothing can be summoned',
        Sim.canPlay(s, u) === 'Requirement: no extra deck creature can be summoned'
      );
    }
    {
      const { s, li, u } = ready(1052);
      const so = take(s, 'Player', 'soldier', 'gy'),
        hv = take(s, 'Player', 'heavensun', 'gy'),
        zp = toDeck(s, 'Opponent', 'zap');
      s.piles.Opponent.deck.unshift(s.piles.Opponent.deck.pop());
      const top3 = s.piles.Opponent.deck.slice(0, 3).map(c => c.iid);
      D(s, { type: 'PlayCard', iid: u.iid });
      pass2(s);
      D(s, { type: 'Choose', player: 'Player', option: li.iid });
      D(s, { type: 'Choose', player: 'Player', option: 'Player|front|2' });
      eq(
        'summoned using Heaven and Sun: both enter triggers are on the stack (5 HP below, 10 HP above)',
        s.stack.map(o => o.hp),
        [5, 10]
      );
      pass2(s);
      eq(
        'declare: every card name can be declared',
        [s.choice.kind, s.choice.options.length >= DEFS.length],
        ['declare', true]
      );
      D(s, { type: 'Choose', player: 'Player', option: 'zap' });
      eq('the top card is Zap: it may be played', [s.choice.kind, /Zap/.test(s.choice.prompt)], ['libplay', true]);
      D(s, { type: 'Choose', player: 'Player', option: 'play' });
      check(
        'played Zap is on the stack under MY control; its real owner is remembered',
        s.stack.length === 2 &&
          zp.loc === 'stack' &&
          zp.owner === 'Opponent' &&
          zp.controller === 'Player' &&
          s.stack[s.stack.length - 1].controller === 'Player'
      );
      eq('the effect repeats: declare again', s.choice.kind, 'declare');
      D(s, { type: 'Choose', player: 'Player', option: 'giant' });
      eq(
        'the new top card is not a Giant: you only look at it',
        [s.choice.kind, /not Giant/.test(s.choice.prompt)],
        ['libseen', true]
      );
      D(s, { type: 'Choose', player: 'Player', option: 'ok' });
      check('the repetition ends there', !s.choice);
      pass2(s);
      eq(
        'Zap resolves for its controller (1 damage to the Opponent) and goes to its OWNER\u2019s graveyard',
        [s.life.Opponent, zp.loc, zp.owner, s.piles.Opponent.gy.includes(zp), s.piles.Player.gy.includes(zp)],
        [19, 'gy', 'Opponent', true, false]
      );
      pass2(s);
      eq(
        'the reorder trigger: pick the top card of the new order first',
        [s.choice.kind, s.choice.options.length],
        ['reorder', 3]
      );
      const t = s.piles.Opponent.deck.slice(0, 3).map(c => c.iid);
      D(s, { type: 'Choose', player: 'Player', option: t[2] });
      D(s, { type: 'Choose', player: 'Player', option: t[0] });
      eq(
        '...the last card is placed by itself: the deck now starts in the chosen order',
        s.piles.Opponent.deck.slice(0, 3).map(c => c.iid),
        [t[2], t[0], t[1]]
      );
      check(
        'the opponent\u2019s top 3 were really the cards that were looked at',
        t.length === 3 && so && hv && top3.length === 3
      );
    }
    {
      // a spell whose target is optional (Quick Intuition) can be played by L4, without a target
      const { s, li, u } = ready(1054);
      take(s, 'Player', 'soldier', 'gy');
      take(s, 'Player', 'heavensun', 'gy');
      const qi = toDeck(s, 'Opponent', 'intuition');
      s.piles.Opponent.deck.unshift(s.piles.Opponent.deck.pop());
      D(s, { type: 'PlayCard', iid: u.iid });
      pass2(s);
      D(s, { type: 'Choose', player: 'Player', option: li.iid });
      D(s, { type: 'Choose', player: 'Player', option: 'Player|front|2' });
      pass2(s);
      D(s, { type: 'Choose', player: 'Player', option: 'intuition' });
      eq('L4 declares Quick Intuition (optional target): it may be played', s.choice.kind, 'libplay');
      D(s, { type: 'Choose', player: 'Player', option: 'play' });
      check('...it is on the stack under my control, with no target', qi.loc === 'stack' && qi.controller === 'Player');
      while (s.choice && s.choice.kind === 'declare') D(s, { type: 'Choose', player: 'Player', option: 'giant' });
      if (s.choice && s.choice.kind === 'libseen') D(s, { type: 'Choose', player: 'Player', option: 'ok' });
      pass2(s);
      check('...and resolves to its owner\u2019s GY', qi.loc === 'gy' && s.piles.Opponent.gy.includes(qi));
    }
    {
      // a spell that MUST target (Superbolt: a permanent or a player) is played by L4 without a target and fizzles on resolve [decided 2026-11-25]
      const { s, li, u } = ready(1055);
      take(s, 'Player', 'soldier', 'gy');
      take(s, 'Player', 'heavensun', 'gy');
      const qi = toDeck(s, 'Opponent', 'superbolt');
      s.piles.Opponent.deck.unshift(s.piles.Opponent.deck.pop());
      D(s, { type: 'PlayCard', iid: u.iid });
      pass2(s);
      D(s, { type: 'Choose', player: 'Player', option: li.iid });
      D(s, { type: 'Choose', player: 'Player', option: 'Player|front|2' });
      pass2(s);
      D(s, { type: 'Choose', player: 'Player', option: 'superbolt' });
      eq('L4 declares Superbolt (must target): it may be played', s.choice.kind, 'libplay');
      D(s, { type: 'Choose', player: 'Player', option: 'play' });
      check('...on the stack under my control, untargeted', qi.loc === 'stack' && qi.controller === 'Player');
      while (s.choice && s.choice.kind === 'declare') D(s, { type: 'Choose', player: 'Player', option: 'giant' });
      if (s.choice && s.choice.kind === 'libseen') D(s, { type: 'Choose', player: 'Player', option: 'ok' });
      const r0 = pass2(s);
      check(
        '...it fizzles (no damage), to its owner\u2019s GY',
        qi.loc === 'gy' &&
          s.piles.Opponent.gy.includes(qi) &&
          r0 &&
          r0.events.some(e => e.t === 'StackObjectFizzled') &&
          !r0.events.some(e => /Damage/.test(e.t))
      );
    }
    {
      const s = start(1053),
        l4 = take(s, 'Player', 'librarian', 'board', 'Player|front|2');
      endTurnFlow(s);
      eq('L4: no trigger at the opponent\u2019s turn start', s.stack.length, 0);
      endTurnFlow(s);
      eq(
        'L4: at the start of its controller\u2019s turn a draw trigger is on the stack',
        [s.stack.length, s.stack[0].hp, s.stack[0].src],
        [1, 1, l4.iid]
      );
      const h0 = s.piles.Player.hand.length;
      pass2(s);
      eq('...it draws a card, then the draw phase draws one more', s.piles.Player.hand.length, h0 + 1 + 1);
    }
    {
      // L4 plays a permanent of the opponent
      const s = start(1060),
        l4 = s.piles.Player.extra.find(c => c.def.id === 'librarian'),
        w = toDeck(s, 'Opponent', 'wolf');
      s.piles.Opponent.deck.unshift(s.piles.Opponent.deck.pop());
      s.drawn.Player = 8;
      s.drawn.Opponent = 8;
      take(s, 'Player', 'soldier', 'gy');
      take(s, 'Player', 'barrier', 'gy');
      const u = take(s, 'Player', 'underworldfusion', 'hand');
      D(s, { type: 'PlayCard', iid: u.iid });
      pass2(s);
      D(s, { type: 'Choose', player: 'Player', option: l4.iid });
      D(s, { type: 'Choose', player: 'Player', option: 'Player|front|2' });
      pass2(s);
      D(s, { type: 'Choose', player: 'Player', option: 'wolf' });
      D(s, { type: 'Choose', player: 'Player', option: 'play' });
      eq(
        'a permanent: its controller picks the zone on their own side',
        [s.choice.kind, s.choice.options.every(k => k.startsWith('Player|front|'))],
        ['place', true]
      );
      D(s, { type: 'Choose', player: 'Player', option: 'Player|front|0' });
      check(
        'the Wolf stands under my control (it belongs to the opponent)',
        w.loc === 'board' && w.owner === 'Opponent' && w.controller === 'Player' && w.slot === 'Player|front|0'
      );
      eq('...and the effect repeats', s.choice.kind, 'declare');
      D(s, { type: 'Choose', player: 'Player', option: 'giant' });
      D(s, { type: 'Choose', player: 'Player', option: 'ok' });
      const sb = take(s, 'Player', 'superbolt', 'hand');
      Sim.gainAP(s, 'Player', []);
      D(s, { type: 'PlayCard', iid: sb.iid, zone: 'Player|front|0' });
      drain(s);
      eq(
        'when it leaves the board it goes to its owner\u2019s graveyard and is the owner\u2019s again',
        [w.loc, w.owner, w.controller, s.piles.Opponent.gy.includes(w), s.piles.Player.gy.includes(w)],
        ['gy', 'Opponent', undefined, true, false]
      );
    }
  });
  Tests.add('choice-need', () => {
    // ================= a pick chain tells the UI how many picks it still asks for (choice.need: one arrow per pick) =================
    const s = start(1090);
    const uf = take(s, 'Player', 'underworldfusion', 'hand');
    ['scout', 'vine', 'hummingbird'].forEach(id => take(s, 'Player', id, 'gy'));
    setLife(s, 'Opponent', 15);
    D(s, { type: 'PlayCard', iid: uf.iid });
    pass2(s);
    D(s, { type: 'Choose', player: 'Player', option: s.choice.options[0] });
    const first = [s.choice.kind, s.choice.need];
    D(s, { type: 'Choose', player: 'Player', option: s.choice.options[0] });
    eq(
      'Underworld Fusion: picking material 1 of 2 needs 2 picks, then material 2 needs 1',
      [first, [s.choice.kind, s.choice.need]],
      [
        ['fusemat', 2],
        ['fusemat', 1],
      ]
    );
  });
})();

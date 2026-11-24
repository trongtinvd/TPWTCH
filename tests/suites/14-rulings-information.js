// 14-rulings-information.js - rulings 2026-11-22, group 4 and 5: Observations and filtered logs (Q39, Q44), the history cap (Q43), the event array (Q13).
// Run only these: node tests/run.js --only observe,leaks,history-cap,event-array
(function () {
  const { D, check, eq, rej, start, take, pass2, endTurnFlow } = Tests.ctx;
  const ids = DEFS.filter(d => !d.extra).map(d => d.id),
    A = ids.slice(0, 14),
    B = ids.slice(14); // two decks with no card in common: a name of the other deck in anything a player sees is a leak
  const names = list => list.map(i => DEFS.find(d => d.id === i).name);
  const quoted = n => JSON.stringify(n);

  Tests.add('observe', () => {
    // ================= Q39 / Q44: an Observation holds only what is public to its player =================
    const s = Sim.create(1400, DEFS, { decks: { Player: A, Opponent: B }, shuffle: true, autoStart: true }),
      o = Sim.observe(s, 'Player'),
      j = JSON.stringify(o);
    const foeHand = s.piles.Opponent.hand;
    check(
      'own hand: names and definitions',
      s.piles.Player.hand.every(
        c => o.cards[c.iid] && o.cards[c.iid].name === c.def.name && o.cards[c.iid].id === c.def.id
      )
    );
    check(
      'the other player\u2019s hand: opaque stubs only (hidden, owner, zone), the real ids are not in it',
      foeHand.length === 5 &&
        foeHand.every(c => !(c.iid in o.cards) && !j.includes(quoted(c.iid))) &&
        Object.values(o.cards).filter(c => c.hidden).length === 5 &&
        Object.values(o.cards)
          .filter(c => c.hidden)
          .every(c => !c.name && !c.id && !c.statuses && c.loc === 'hand' && c.owner === 'Opponent')
    );
    check(
      'no name or definition id of the other deck anywhere, and no seed',
      [...names(B), ...B].every(n => !j.includes(quoted(n))) && o.n === undefined && !('logs' in o)
    );
    check(
      'decks are sizes, never lists (nobody knows the order)',
      typeof o.piles.Player.deck === 'number' &&
        typeof o.piles.Opponent.deck === 'number' &&
        ![...names(A).slice(5)].every(n => j.includes(quoted(n)))
    );
    eq('the same state gives the same Observation', Sim.observe(s, 'Player'), o);
    check(
      'the two players\u2019 views differ, and each shows its own hand',
      JSON.stringify(Sim.observe(s, 'Opponent')) !== j &&
        foeHand.every(c => Sim.observe(s, 'Opponent').cards[c.iid].name === c.def.name)
    );
    check('an Observation is plain data (it survives a JSON round trip)', JSON.stringify(JSON.parse(j)) === j);
    // a revealed card, clouds, the stack and choices
    const q = start(1401),
      zap = take(q, 'Opponent', 'zap', 'hand'),
      heal = take(q, 'Opponent', 'heal', 'hand');
    Sim.addStatus(q, zap, { kind: 'revealed', to: 'Player', zone: 'hand', srcName: 't' });
    const o2 = Sim.observe(q, 'Player');
    check(
      'a card revealed to me is known to me, the other hand card is not',
      o2.cards[zap.iid] && o2.cards[zap.iid].name === 'Zap' && !(heal.iid in o2.cards)
    );
    const ke = take(q, 'Opponent', 'kingeye', 'board', 'Opponent|front|1'),
      so = take(q, 'Opponent', 'soldier', 'board', 'Opponent|front|0'),
      ar = take(q, 'Opponent', 'archer', 'board', 'Opponent|front|2');
    const o3 = Sim.observe(q, 'Player'),
      j3 = JSON.stringify(o3);
    check(
      'cards under an enemy cloud are not told: the zone is empty in my Observation and the card is not listed',
      o3.slots['Opponent|front|0'] === null &&
        o3.slots['Opponent|front|2'] === null &&
        !(so.iid in o3.cards) &&
        !j3.includes('"Soldier"') &&
        !j3.includes('"Archer"')
    );
    check(
      'King Eye itself and the clouds (statuses on the zones) are public',
      o3.slots['Opponent|front|1'] === ke.iid && o3.zones['Opponent|front|0'].statuses.some(x => x.kind === 'cloud')
    );
    check(
      'the owner sees everything',
      Sim.observe(q, 'Opponent').slots['Opponent|front|0'] === so.iid &&
        Sim.observe(q, 'Opponent').cards[so.iid].name === 'Soldier'
    );
    q.active = 'Opponent';
    q.priority = 'Opponent';
    D(q, { type: 'Activate', iid: ar.iid, ab: 0 });
    const o4 = Sim.observe(q, 'Player'),
      j4 = JSON.stringify(o4);
    check(
      'an ability from under a cloud appears to come from King Eye; the life paid for it does not name the Archer',
      o4.stack[0].name === 'King Eye: Ability' && o4.stack[0].src !== ar.iid && !j4.includes('"Archer"')
    );
    const h = start(1402),
      hb = take(h, 'Opponent', 'hummingbird', 'board', 'Opponent|front|1'),
      g = take(h, 'Player', 'giant', 'board', 'Player|front|1');
    Sim.enterCombat(h);
    D(h, { type: 'Attack', iid: g.iid });
    pass2(h);
    const mine = Sim.observe(h, 'Opponent').choice,
      theirs = Sim.observe(h, 'Player').choice;
    check(
      'a pending choice: its options go to the chooser only, the other player learns just who must choose',
      mine.options.includes('stay') &&
        !!mine.prompt &&
        theirs.player === 'Opponent' &&
        theirs.options === undefined &&
        theirs.prompt === undefined
    );
    // events
    const e = start(1403),
      tc = take(e, 'Opponent', 'wolf', 'hand'),
      pre = structuredClone(e);
    e.active = 'Opponent';
    e.priority = 'Opponent';
    Sim.gainAP(e, 'Opponent', []);
    const r = D(e, { type: 'PlayCard', iid: tc.iid, slot: 'Opponent|front|0' }),
      ev = Sim.observeEvents(pre, e, r.events, 'Player');
    check(
      'events: a card the viewer sees on the board keeps its id',
      ev.some(x => x.t === 'PermanentSummoned' && x.iid === tc.iid)
    );
    const pre2 = structuredClone(e),
      dr = take(e, 'Opponent', 'soldier', 'deck');
    const r2 = D(e, { type: 'Draw', player: 'Opponent' }),
      ev2 = Sim.observeEvents(pre2, e, r2.events, 'Player');
    check(
      'events: a card drawn by the other player is an opaque id',
      ev2.filter(x => x.t === 'CardDrawn').every(x => /^h-/.test(x.iid))
    );
  });

  Tests.add('leaks', () => {
    // ================= bot games with disjoint decks: nothing hidden ever shows in an Observation, an event or a log =================
    const g = Sim.create(1410, DEFS, { decks: { Player: A, Opponent: B }, shuffle: true, autoStart: true }),
      rnd = botRng(21),
      mem = {};
    let leaks = [],
      steps = 0,
      lines = 0;
    for (; steps < 500; steps++) {
      const cmd = botChoose(g, botActor(g), rnd, mem);
      if (!cmd) break;
      const pre = structuredClone(g),
        r = D(g, cmd);
      if (!r.ok) continue;
      for (const V of ['Player', 'Opponent']) {
        const visible = id => Sim.canSee(pre, V, pre.cards[id]) || Sim.canSee(g, V, g.cards[id]),
          seen = new Set(
            Object.values(g.cards)
              .filter(c => visible(c.iid))
              .map(c => c.def.name)
          ), // a name a visible card also has (two Vine tokens, one under a cloud) is no leak
          hid = Object.values(g.cards).filter(
            c => c.def.type !== 'ability' && !visible(c.iid) && !Sim.canSee(g, V, c) && !seen.has(c.def.name)
          ),
          bad = text => hid.some(c => text.includes(quoted(c.def.name)) || text.includes(quoted(c.def.id))),
          o = Sim.observe(g, V),
          oj = JSON.stringify(Object.assign({}, o, { choice: null })); // the chooser may be offered names (look at the top card, exile from your deck)
        if (bad(oj)) leaks.push('observe ' + V + ' @' + steps + ' ' + cmd.type);
        const pj = JSON.stringify(Object.assign({}, Sim.optionsFor(g, V), { choice: null })); // what the bot reads
        if (bad(pj) || hid.some(c => pj.includes(quoted(c.iid))))
          leaks.push('options ' + V + ' @' + steps + ' ' + cmd.type);
        const ej = JSON.stringify(Sim.observeEvents(pre, g, r.events, V));
        if (hid.some(c => !visible(c.iid) && ej.includes(quoted(c.iid))))
          leaks.push('events ' + V + ' @' + steps + ' ' + cmd.type);
        for (const l of Narrate.story(pre, g, cmd, r.events, V)) {
          lines++;
          if (hid.some(c => l.text.includes(c.def.name))) leaks.push('log ' + V + ' @' + steps + ': ' + l.text);
        }
      }
    }
    check(
      '500 bot commands, both players: no hidden name in any Observation, bot options, event id or log line',
      !leaks.length && steps > 100 && lines > 100,
      leaks.slice(0, 3).join(' | ')
    );
  });

  Tests.add('history-cap', () => {
    // ================= Q43: statuses and logs share a cap; reaching it ends the game =================
    const cap0 = Sim.RULES.historyCap;
    check('the cap is 200 MB by default', cap0 === 200 * 1024 * 1024);
    try {
      let s = start(1420);
      check('...and a normal game is far below it', Sim.historyBytes(s) < 1024 * 1024 && !s.capped);
      Sim.RULES.historyCap = Sim.historyBytes(s) + 100;
      const r = D(s, { type: 'Draw', player: 'Player' });
      eq(
        'a command that pushes the history over the cap: the game ends in a draw by the cap',
        [
          s.capped,
          s.result && s.result.winner,
          s.result && s.result.why,
          r.events.some(e => e.t === 'HistoryCapReached'),
          r.events.some(e => e.t === 'GameDecided'),
        ],
        [true, null, 'cap', true, true]
      );
      rej('afterwards every command is refused', s, { type: 'EndTurn', player: 'Player' }, 'history limit');
      Sim.RULES.historyCap = cap0;
      s = start(1421);
      D(s, { type: 'Surrender', player: 'Opponent' });
      Sim.RULES.historyCap = Sim.historyBytes(s) + 100;
      D(s, { type: 'Draw', player: 'Player' });
      eq(
        'a game decided earlier keeps its result (the first decision stands) but still stops',
        [s.result.winner, s.result.why, s.capped],
        ['Player', 'surrender', true]
      );
    } finally {
      Sim.RULES.historyCap = cap0;
    }
  });

  Tests.add('event-array', () => {
    // ================= Q13: a command's result is ONE flat array of events, in the order things happened =================
    const g = Sim.create(1430, DEFS, {
        decks: { Player: BUILTIN_DECKS[1].cards, Opponent: BUILTIN_DECKS[0].cards },
        shuffle: true,
        autoStart: false,
      }),
      rnd = botRng(9),
      mem = {};
    let bad = 0,
      n = 0;
    const first = D(g, { type: 'Start', player: 'Player' }),
      second = D(g, { type: 'Start', player: 'Opponent' });
    eq(
      'the events are in causal order: ready, then the hands, then the game starts',
      [first.events.map(e => e.t), second.events.map(e => e.t).slice(0, 2), second.events.map(e => e.t).slice(-4)],
      [
        ['PlayerReady'],
        ['PlayerReady', 'CardDrawn'],
        ['GameStarted', 'ActionPointGained', 'DrawStepEntered', 'CardDrawn'],
      ]
    );
    for (let i = 0; i < 300; i++) {
      const cmd = botChoose(g, botActor(g), rnd, mem);
      if (!cmd) break;
      const r = D(g, cmd);
      if (!r.ok) continue;
      n += r.events.length;
      if (
        !Array.isArray(r.events) ||
        r.events.some(
          e =>
            !e ||
            Array.isArray(e) ||
            typeof e !== 'object' ||
            typeof e.t !== 'string' ||
            Object.values(e).some(
              v => Array.isArray(v) && v.some(x => x && typeof x === 'object' && typeof x.t === 'string')
            )
        )
      )
        bad++;
    }
    check('300 bot commands: every result is a flat array of plain events, none nested', !bad && n > 300);
    const s = start(1431),
      hb = take(s, 'Player', 'hummingbird', 'hand'),
      r = D(s, { type: 'PlayCard', iid: hb.iid, slot: 'Player|front|2' }),
      t = r.events.map(e => e.t);
    check(
      'a permanent entering: summoned, THEN its trigger goes on the stack (the view plays them in this order)',
      t.indexOf('PermanentSummoned') >= 0 && t.indexOf('PermanentSummoned') < t.indexOf('StackObjectCreated'),
      t.join()
    );
    Tests.ctx.drain(s);
    const w = take(s, 'Player', 'wolf', 'board', 'Player|front|0');
    Sim.enterCombat(s);
    const a = D(s, { type: 'Attack', iid: w.iid }).events.map(e => e.t);
    check(
      'an attack: declared, then put on the stack',
      a.indexOf('CreatureAttackDeclared') < a.indexOf('StackObjectCreated'),
      a.join()
    );
  });
})();

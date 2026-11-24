// 22-retaliate-text-stops-cameras.js - Retaliate is a keyworded TRIGGER (stack, priority, responses), generated card text with Stack HP + the
// written descriptions database, the camera config, removable stops, the legal picks of a choice (Ambush of the Night), the 3D card
// models index, "Defender strike back", King Eye's hidden information in the log and in the observed events.
// Run only these: node tests/run.js --only retaliate-keyword,strike-back,stops-removable,stops-copies,choice-picks,king-eye-log,generated-text,camera-config
(function () {
  const { D, check, eq, start, take, pass2, drain, dl, ndmg } = Tests.ctx;
  const byId = id => DEFS.find(d => d.id === id);
  const evs = (r, t) => r.events.filter(e => e.t === t);
  const trigOn = s => s.stack.filter(o => o.kind === 'ability' && o.list === 'triggers');
  // a game with the given rules (the "Defender strike back" option), set up like Tests.ctx.start
  const startWith = (seed, rules, extra) => {
    const s = Sim.create(seed, DEFS.concat(FIXTURES, extra || []), { rules });
    for (const p of ['Player', 'Opponent']) D(s, { type: 'Start', player: p });
    for (const p of ['Player', 'Opponent']) {
      const P = s.piles[p],
        i = P.hand.findIndex(c => c.def.id === 'shieldguard');
      if (i >= 0) {
        const c = P.hand.splice(i, 1)[0];
        c.loc = 'deck';
        P.deck.push(c);
        const n = P.deck.shift();
        n.loc = 'hand';
        P.hand.push(n);
      }
    }
    return s;
  };
  const attack = (s, c) => {
    D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
    return D(s, { type: 'Attack', iid: c.iid });
  };

  // ================= 1. Retaliate: an ordinary trigger, abbreviated by its keyword =================
  Tests.add('retaliate-keyword', () => {
    const sgd = byId('shieldguard'),
      t = sgd.triggers[0];
    check(
      'Shieldguard: Retaliate is a TRIGGER in the card data (on damaged, combat or effect damage), not a passive or a def flag',
      t.kw === 'retaliate' &&
        t.on === 'damaged' &&
        JSON.stringify(t.types) === '["combat","effect"]' &&
        t.effects[0].op === 'Retaliate' &&
        !(sgd.passives || []).length &&
        sgd.retaliate === undefined
    );
    // it triggers and goes on the stack: nothing is dealt back until it resolves
    let s = start(2201);
    const sg = take(s, 'Opponent', 'shieldguard', 'board', 'Opponent|front|1'),
      w = take(s, 'Player', 'wolf', 'board', 'Player|front|1');
    attack(s, w);
    const r = pass2(s); // the Attack resolves
    const tr = trigOn(s);
    check(
      'the Attack hit Shieldguard: its Retaliate trigger is ON THE STACK (one ability object from Shieldguard), the attacker is untouched so far',
      tr.length === 1 &&
        tr[0].src === sg.iid &&
        tr[0].from === 'shieldguard' &&
        tr[0].hp === 1 &&
        w.loc === 'board' &&
        ndmg(w) === 0 &&
        evs(r, 'StackObjectCreated').length === 1
    );
    check(
      '...it carries the damage it saw (source = the attacker, power 5), read when it resolves',
      tr[0].evt && tr[0].evt.source === w.iid && tr[0].evt.power === 5 && tr[0].evt.type === 'combat'
    );
    check(
      '...and a player holds priority on it (normal priority: the stack waits for two passes)',
      !!s.priority && !s.choice
    );
    const r2 = pass2(s);
    eq(
      'both players pass: it resolves through the normal resolution (token resolves) and deals 5 retaliate damage to the Wolf',
      [evs(r2, 'StackObjectResolved').length, w.loc, s.stack.length],
      [1, 'gy', 0]
    );
    // a response: Bolt deals 3 damage to the stack object beneath it, the Retaliate trigger (Stack HP 1) is countered
    s = start(2202);
    const sg2 = take(s, 'Opponent', 'shieldguard', 'board', 'Opponent|front|1'),
      w2 = take(s, 'Player', 'wolf', 'board', 'Player|front|1'),
      bolt = take(s, 'Player', 'bolt', 'hand');
    attack(s, w2);
    pass2(s);
    const holder = s.priority;
    if (holder !== 'Player') D(s, { type: 'Pass', player: holder }); // priority goes round to the Player
    const rb = D(s, { type: 'PlayCard', iid: bolt.iid });
    check('Retaliate can be RESPONDED to: Bolt is played on top of it', rb.ok && s.stack.length === 2, rb.why);
    pass2(s); // Bolt resolves: 3 damage to the Retaliate trigger
    const rc = pass2(s);
    check(
      '...Bolt resolves first (LIFO), the Retaliate trigger is countered (HP 1 - 3 = -2): the Wolf takes nothing',
      evs(rc, 'StackObjectCountered').length === 1 && w2.loc === 'board' && ndmg(w2) === 0 && sg2.loc === 'board'
    );
    // effect damage triggers it too; the source is a spell: its controller takes the damage; it fires even when Shieldguard dies
    s = start(2203);
    const sg3 = take(s, 'Opponent', 'shieldguard', 'board', 'Opponent|front|1'),
      sb = take(s, 'Player', 'superbolt', 'hand');
    D(s, { type: 'PlayCard', iid: sb.iid, zone: 'Opponent|front|1' });
    pass2(s);
    check(
      'Superbolt (20 effect damage) kills Shieldguard, its Retaliate still triggers (Q24) and waits on the stack',
      sg3.loc === 'gy' && trigOn(s).length === 1 && s.life.Player === 20
    );
    pass2(s);
    eq('...resolves: the spell’s controller takes Shieldguard’s last power (5)', s.life.Player, 15);
    // retaliate damage never retaliates: Shieldguard attacks Shieldguard
    s = start(2204);
    const a1 = take(s, 'Player', 'shieldguard', 'board', 'Player|front|1'),
      b1 = take(s, 'Opponent', 'shieldguard', 'board', 'Opponent|front|1');
    attack(s, a1);
    pass2(s);
    pass2(s);
    eq(
      'Shieldguard vs Shieldguard: one Retaliate (the defender’s); its damage (type retaliate) does not trigger the attacker’s',
      [dl(a1), s.stack.length, dl(b1).length],
      [[[5, 'retaliate', b1.iid]], 0, 1]
    );
    // generic: the keyword is data. Any card with Fx.retaliate() behaves the same; the old passive form does nothing any more
    const extra = [
      Fx.creature('t-ret', 'Test Retaliator', 2, 9, { triggers: [Fx.retaliate()] }),
      Fx.creature('t-oldkw', 'Test Old Keyword', 2, 9, { passives: [Fx.keyword('retaliate')] }),
    ];
    s = start(2205, extra);
    const tr1 = take(s, 'Opponent', 't-ret', 'board', 'Opponent|front|1'),
      tw = take(s, 'Player', 'wolf', 'board', 'Player|front|1');
    attack(s, tw);
    pass2(s);
    check(
      'a test creature with Fx.retaliate() triggers the same way (no Shieldguard-specific code)',
      trigOn(s).length === 1
    );
    s = start(2206, extra);
    take(s, 'Opponent', 't-oldkw', 'board', 'Opponent|front|1');
    const tw2 = take(s, 'Player', 'wolf', 'board', 'Player|front|1');
    attack(s, tw2);
    pass2(s);
    check(
      'regression guard: no special case is left in the damage code (a passive "retaliate" keyword does nothing)',
      trigOn(s).length === 0 && ndmg(tw2) === 0
    );
    // the log tells it like any trigger, with its Stack HP
    s = start(2207);
    take(s, 'Opponent', 'shieldguard', 'board', 'Opponent|front|1');
    const w3 = take(s, 'Player', 'wolf', 'board', 'Player|front|1');
    attack(s, w3);
    D(s, { type: 'Pass', player: s.priority });
    const pre = structuredClone(s),
      cmd = { type: 'Pass', player: s.priority },
      rr = D(s, cmd),
      txt = Narrate.story(pre, s, cmd, rr.events, 'Player')
        .map(l => l.text)
        .join('\n');
    check(
      'the log: "Shieldguard triggers: Retaliate (...)" with its Stack HP',
      /Shieldguard triggers: Retaliate \(.*\(stack HP 1\)/.test(txt),
      txt
    );
  });

  // ================= 9. Defender strike back (game option) =================
  Tests.add('strike-back', () => {
    let s = start(2210);
    const w = take(s, 'Player', 'wolf', 'board', 'Player|front|1'),
      k = take(s, 'Opponent', 'knight', 'board', 'Opponent|front|1');
    attack(s, w);
    pass2(s);
    eq(
      'option OFF (the default rules): the attacker takes nothing back',
      [ndmg(w), dl(k)],
      [0, [[3, 'combat', w.iid]]]
    );
    check('...and the option is not in the rules at all', !('strikeBack' in s.cfg) && !Sim.strikesBack(s, k, w));
    s = startWith(2211, { strikeBack: true });
    check('option ON: the game rules carry it', s.cfg.strikeBack === true);
    const w2 = take(s, 'Player', 'wolf', 'board', 'Player|front|1'),
      k2 = take(s, 'Opponent', 'knight', 'board', 'Opponent|front|1');
    attack(s, w2);
    const r = pass2(s);
    eq(
      'a creature attacks a creature: the defender (4 power) deals 4 combat damage back to the attacker (3/3 Wolf dies)',
      [dl(k2), w2.loc, Sim.live(w2).filter(x => x.kind === 'damage').length],
      [[[3, 'combat', w2.iid]], 'gy', 0]
    );
    const sbE = evs(r, 'DamageDealt').find(e => e.source === k2.iid);
    check(
      '...it is combat damage FROM the defender, marked as strike back (not attack damage of the attacker)',
      !!sbE && sbE.type === 'combat' && sbE.strikeBack === true && sbE.target === w2.iid && sbE.amount === 4
    );
    s = startWith(2212, { strikeBack: true });
    const w3 = take(s, 'Player', 'wolf', 'board', 'Player|front|1'),
      so = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1');
    attack(s, w3);
    pass2(s);
    eq('the damage equals the DEFENDER’s power (Soldier 2 -> Wolf takes 2)', dl(w3), [[2, 'combat', so.iid]]);
    s = startWith(2213, { strikeBack: true });
    const w4 = take(s, 'Player', 'wolf', 'board', 'Player|front|2');
    attack(s, w4);
    pass2(s);
    eq('a creature attacking the PLAYER (empty column): no strike back', [ndmg(w4), s.life.Opponent], [0, 17]);
    s = startWith(2214, { strikeBack: true });
    const sl = take(s, 'Player', 'soldier', 'board', 'Player|front|3'),
      bh = take(s, 'Player', 'barrier', 'board', 'Player|back|3'),
      g = take(s, 'Opponent', 'giant', 'board', 'Opponent|front|3');
    attack(s, sl);
    pass2(s);
    eq(
      'no trample: 6 strike-back damage kills the 2/3 Soldier and nothing passes on (the Barrier behind it, the Player)',
      [sl.loc, ndmg(bh), s.life.Player, dl(g)],
      ['gy', 0, 20, [[2, 'combat', sl.iid]]]
    );
    s = startWith(2215, { strikeBack: true });
    const gw = take(s, 'Player', 'giant', 'board', 'Player|front|0'),
      bn = take(s, 'Opponent', 'banner', 'board', 'Opponent|front|0');
    attack(s, gw);
    pass2(s);
    eq('a non-creature hit by the attack (an enchantment) does not strike back', ndmg(gw), 0);
    // Shieldguard: the strike back by the rule FIRST, then its own Retaliate trigger on the stack
    s = startWith(2216, { strikeBack: true });
    const ga = take(s, 'Player', 'giant', 'board', 'Player|front|1'),
      sg = take(s, 'Opponent', 'shieldguard', 'board', 'Opponent|front|1');
    attack(s, ga);
    const r2 = pass2(s),
      iSB = r2.events.findIndex(e => e.t === 'StrikeBack'),
      iTr = r2.events.findIndex(e => e.t === 'StackObjectCreated');
    check(
      'Shieldguard is attacked: the rule’s strike back is applied at once (5 to the Giant), THEN its Retaliate goes on the stack',
      iSB >= 0 &&
        iTr > iSB &&
        trigOn(s).length === 1 &&
        JSON.stringify(dl(ga)) === JSON.stringify([[5, 'combat', sg.iid]])
    );
    check(
      '...the strike back did not replace or merge the trigger: it waits for priority like any trigger',
      ga.loc === 'board' && s.stack.length === 1
    );
    pass2(s);
    eq(
      '...Retaliate resolves: the attacker received BOTH retaliations (5 strike back + 5 Retaliate = 10 > 8 HP: the Giant dies)',
      [ga.loc, s.stack.length],
      ['gy', 0]
    );
    s = startWith(2217, { strikeBack: true });
    const ga2 = take(s, 'Player', 'giant', 'board', 'Player|front|1'),
      bolt = take(s, 'Player', 'bolt', 'hand');
    take(s, 'Opponent', 'shieldguard', 'board', 'Opponent|front|1');
    attack(s, ga2);
    pass2(s);
    if (s.priority !== 'Player') D(s, { type: 'Pass', player: s.priority });
    D(s, { type: 'PlayCard', iid: bolt.iid });
    pass2(s);
    pass2(s);
    eq(
      '...the Retaliate after the strike back is still answerable (Bolt counters it: only the 5 strike back stays)',
      [ga2.loc, dl(ga2).length],
      ['board', 1]
    );
    s = start(2218);
    const ga3 = take(s, 'Player', 'giant', 'board', 'Player|front|1');
    take(s, 'Opponent', 'shieldguard', 'board', 'Opponent|front|1');
    attack(s, ga3);
    pass2(s);
    eq(
      'option OFF: Shieldguard gives only its Retaliate (on the stack, nothing dealt yet)',
      [ndmg(ga3), trigOn(s).length],
      [0, 1]
    );
  });

  // ================= 5. Stops: the opponent's end step and permanent entered can be turned off =================
  Tests.add('stops-removable', () => {
    let s = start(2220);
    check(
      'defaults: on the opponent’s turn "permanent entered" and "end step" are on (Sim.stopOn), other stops off',
      Sim.stopOn(s, 'Opponent', 'opp', 'end') &&
        Sim.stopOn(s, 'Opponent', 'opp', 'enter') &&
        !Sim.stopOn(s, 'Opponent', 'opp', 'draw')
    );
    D(s, { type: 'SetStop', player: 'Opponent', role: 'opp', kind: 'end', on: false });
    check(
      'SetStop turns the opponent’s end step stop OFF (it used to be forced on)',
      !Sim.stopOn(s, 'Opponent', 'opp', 'end')
    );
    let r = D(s, { type: 'EndTurn', player: 'Player' });
    check(
      'end step stop off: End turn ends the turn at once (no window that nobody can answer), the next turn starts',
      r.ok &&
        s.active === 'Opponent' &&
        !(s.respond && s.respond.kind === 'end') &&
        !evs(r, 'ResponseWindowOpened').some(e => e.kind === 'end'),
      JSON.stringify(s.respond)
    );
    check(
      '...the end step still happens (EndStepEntered, then TurnChanged)',
      evs(r, 'EndStepEntered').length === 1 && evs(r, 'TurnChanged').length === 1
    );
    s = start(2221);
    D(s, { type: 'SetStop', player: 'Opponent', role: 'opp', kind: 'end', on: false });
    D(s, { type: 'SetStop', player: 'Player', role: 'own', kind: 'end', on: true });
    r = D(s, { type: 'EndTurn', player: 'Player' });
    check(
      'the other stops keep working: the turn player’s own end step stop still opens a window (for the Player only)',
      s.respond && s.respond.kind === 'end' && s.respond.stage === 'turn' && s.priority === 'Player'
    );
    D(s, { type: 'Pass', player: 'Player' });
    eq('...passing it ends the turn', s.active, 'Opponent');
    s = start(2222);
    D(s, { type: 'SetStop', player: 'Opponent', role: 'opp', kind: 'enter', on: false });
    const so = take(s, 'Player', 'soldier', 'hand');
    r = D(s, { type: 'PlayCard', iid: so.iid, slot: 'Player|front|0' });
    check(
      '"permanent entered" off: a permanent enters with no response window, the turn player keeps priority',
      r.ok && !s.respond && s.priority === 'Player' && !evs(r, 'ResponseWindowOpened').length
    );
    D(s, { type: 'SetStop', player: 'Opponent', role: 'opp', kind: 'enter', on: true });
    const kn = take(s, 'Player', 'knight', 'hand');
    Sim.gainAP(s, 'Player', []);
    D(s, { type: 'PlayCard', iid: kn.iid, slot: 'Player|front|1' });
    check(
      'turned back on, the window opens again (the opponent answers first)',
      s.respond && s.respond.kind === 'enter' && s.priority === 'Opponent'
    );
    s = start(2223);
    D(s, { type: 'SetStop', player: 'Opponent', role: 'opp', kind: 'end', on: false });
    const w = take(s, 'Player', 'wolf', 'board', 'Player|front|1');
    take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1');
    attack(s, w);
    D(s, { type: 'Pass', player: s.priority });
    check(
      'priority on the stack is untouched by the stop (the Attack still waits for both passes)',
      s.stack.length === 1
    );
    D(s, { type: 'Pass', player: s.priority });
    D(s, { type: 'EndTurn', player: 'Player' });
    check(
      'ending the turn during combat with the stop off: combat ends, then the turn (once nothing is pending)',
      s.active === 'Opponent' && !s.attackPhase
    );
  });

  Tests.add('stops-copies', () => {
    const flat = { turnStart: true },
      s = Sim.create(2225, DEFS.concat(FIXTURES), { stops: flat });
    D(s, { type: 'SetStop', player: 'Player', role: 'opp', kind: 'end', on: false });
    check(
      'a flat stop list (the default for real games) gives each player their OWN copy: one player’s change never moves the other’s',
      !Sim.stopOn(s, 'Player', 'opp', 'end') && Sim.stopOn(s, 'Opponent', 'opp', 'end') && !('end' in flat)
    );
  });

  // ================= 6. Ambush of the Night: the legal picks come from the Sim =================
  Tests.add('choice-picks', () => {
    const s = start(2230),
      a = take(s, 'Player', 'ambush', 'hand');
    take(s, 'Player', 'soldier', 'gy');
    const sp = take(s, 'Player', 'superbolt', 'hand');
    D(s, { type: 'PlayCard', iid: a.iid });
    pass2(s);
    const g = Sim.choicePicks(s, 'Player');
    check(
      'step 1 (GY to hand): the GY cards are not clicked where they stand (a list)',
      s.choice.kind === 'upto' && !g.click && g.cards.length === 1
    );
    D(s, { type: 'Choose', player: 'Player', option: 'done' });
    const k = s.choice,
      P = Sim.choicePicks(s, 'Player'),
      hand = s.piles.Player.hand;
    check(
      'step 2 (hand into play): the Sim exposes the legal cards: every creature / enchantment of the hand, nothing else',
      k.kind === 'upto' &&
        P.click === true &&
        P.cards.length > 0 &&
        P.cards.every(id => s.cards[id].loc === 'hand' && ['creature', 'enchantment'].includes(s.cards[id].def.type)) &&
        hand.filter(c => ['creature', 'enchantment'].includes(c.def.type)).every(c => P.cards.includes(c.iid)) &&
        !P.cards.includes(sp.iid) &&
        JSON.stringify(P.buttons) === '["done"]'
    );
    check(
      '...the same list Choose validates (cards + buttons = the options)',
      JSON.stringify([...P.cards, ...P.buttons].sort()) === JSON.stringify(k.options.slice().sort())
    );
    check('...the other player gets nothing (it is not their choice)', !Sim.choicePicks(s, 'Opponent').cards.length);
    const heal = take(s, 'Player', 'heal', 'hand');
    check(
      'while the choice is pending nothing else is usable: canPlay / canActivate refuse like dispatch (so only the picks are highlighted)',
      /to choose/.test(Sim.canPlay(s, heal) || '') && P.cards.every(id => !!Sim.canPlay(s, s.cards[id]))
    );
    const bad = D(s, { type: 'Choose', player: 'Player', option: sp.iid });
    check('a card that is not highlighted is refused (the spell in hand)', !bad.ok);
    const good = D(s, { type: 'Choose', player: 'Player', option: P.cards[0] });
    check('a highlighted card is accepted', good.ok);
  });

  // ================= 10. King Eye: hidden identities stay hidden in the log and the observed events =================
  Tests.add('king-eye-log', () => {
    const s = start(2240);
    take(s, 'Opponent', 'kingeye', 'board', 'Opponent|front|1');
    const ar = take(s, 'Opponent', 'archer', 'hand');
    s.active = s.priority = 'Opponent';
    s.step = 'main';
    s.drawPending = false;
    Sim.gainAP(s, 'Opponent', []);
    const run = cmd => {
      const pre = structuredClone(s),
        r = D(s, cmd),
        log = V =>
          Narrate.story(pre, s, cmd, r.events, V)
            .map(l => l.text)
            .join('\n');
      return { r, pre, P: log('Player'), O: log('Opponent') };
    };
    const a = run({ type: 'PlayCard', iid: ar.iid, slot: 'Opponent|front|3' });
    check(
      'a card played under the cloud: the other player’s log names neither the card nor the zone it entered',
      a.r.ok && !/Archer/.test(a.P) && !/front 4/.test(a.P) && /plays a card to a covered zone/.test(a.P),
      a.P
    );
    check('...the owner’s log tells both', /Archer/.test(a.O) && /front 4/.test(a.O), a.O);
    const ob = Sim.observeEvents(a.pre, s, a.r.events, 'Player').find(e => e.t === 'PermanentSummoned'),
      oo = Sim.observeEvents(a.pre, s, a.r.events, 'Opponent').find(e => e.t === 'PermanentSummoned');
    check(
      'observed events follow the same rule: no zone for the other player, the zone for the owner',
      ob && ob.slot === null && oo.slot === 'Opponent|front|3'
    );
    D(s, { type: 'Pass', player: s.priority });
    const b = run({ type: 'Activate', iid: ar.iid, ab: 0 });
    check(
      'its ability: the other player’s log hides the ability’s name (no "Volley") and its source (it comes from King Eye)',
      b.r.ok && !/Volley/.test(b.P) && !/Archer/.test(b.P) && /King Eye: Ability is put on the stack/.test(b.P),
      b.P
    );
    check(
      '...public information stays: the action, the life paid as the cost, the stack HP',
      /activates/.test(b.P) && /pays 1 life/.test(b.P) && /stack HP 1/.test(b.P),
      b.P
    );
    check('...the owner sees the name', /Volley/.test(b.O));
    const vis = start(2241),
      arv = take(vis, 'Opponent', 'archer', 'hand');
    vis.active = vis.priority = 'Opponent';
    vis.step = 'main';
    vis.drawPending = false;
    Sim.gainAP(vis, 'Opponent', []);
    const pre = structuredClone(vis),
      cmd = { type: 'PlayCard', iid: arv.iid, slot: 'Opponent|front|3' },
      r = D(vis, cmd),
      txt = Narrate.story(pre, vis, cmd, r.events, 'Player')
        .map(l => l.text)
        .join('\n');
    check(
      'control: with no King Eye the same play is public (card and zone)',
      /Archer/.test(txt) && /front 4/.test(txt),
      txt
    );
  });

  // ================= 2 + 3. Generated card text, the written descriptions database =================
  Tests.add('generated-text', () => {
    if (!CardText.loaded() && typeof readRepoFile === 'function') CardText.load(JSON.parse(readRepoFile(CardText.URL)));
    check('the descriptions database is loaded (js/content/cardDescription.json)', CardText.loaded());
    eq(
      'every database entry names a real card by id, with its name, and only parts that card has',
      CardText.problems(DEFS),
      []
    );
    const badHp = [];
    for (const d of DEFS) {
      for (const k of ['triggers', 'abilities'])
        (d[k] || []).forEach((o, i) => {
          if (!o.text.endsWith('(Stack HP ' + o.hp + ')')) badHp.push(d.id + ' ' + k + ':' + i);
        });
      if (d.type === 'spell' && !d.body.endsWith('(Stack HP ' + d.hp + ')')) badHp.push(d.id + ' body');
    }
    eq(
      'the generated text of EVERY stack ability (triggers, activated abilities, spells) states its Stack HP from the data',
      badHp,
      []
    );
    const sg = byId('shieldguard');
    check(
      'Retaliate reads as its keyword with its reminder and HP',
      /^Retaliate \(whenever this takes combat or effect damage, .*\)\. \(Stack HP 1\)$/.test(sg.triggers[0].text)
    );
    eq(
      'generated by default: textParts = the generated texts (o.text)',
      textParts(byId('archer')).map(p => p.text),
      [byId('archer').abilities[0].text]
    );
    const before = JSON.stringify(DEFS);
    CardText.setMode('written');
    const wa = textParts(byId('archer')),
      wk = textParts(byId('kingeye'));
    check(
      'Written: the original description from the database (Archer, King Eye), marked as written',
      wa[0].text === 'Slow. Front row: pay 1 life; deal 2 damage to the opponent. (Stack HP 1)' &&
        wa[0].written === true &&
        wk[0].text.startsWith('Passive. A black cloud covers each of your other zones: your opponent cannot see')
    );
    check(
      '...a part with no written text shows its generated text (Shieldguard’s Retaliate)',
      textParts(sg)[0].text === sg.triggers[0].text && !textParts(sg)[0].written
    );
    CardText.setMode('generated');
    check(
      'switching never changes the card data (DEFS identical before / after, def.text still generated)',
      JSON.stringify(DEFS) === before
    );
    check(
      'the card data holds no written text any more (one place: the database)',
      DEFS.every(
        d => !('overrideText' in d) && !('say' in d) && Translate.abilityList(d).every(x => !('overrideText' in x.o))
      )
    );
    const pz = byId('parasite').triggers[0].text;
    check(
      'accuracy: Creeping Parasite lists all six modes with their unlock counts (no mode dropped)',
      ['0+:', '1+:', '2+:', '3+:', '4+:', '5+:'].every(x => pz.includes(x)) && pz.includes('deal 4 damage')
    );
    check(
      'accuracy: Deep Sea Shark’s modes come from their effects (pay 3 life, skip a combat; or nothing)',
      /pay 3 life, and your opponent skips their next combat phase; or nothing happens/.test(
        byId('shark').triggers[0].text
      )
    );
  });

  // ================= 4 + 8. Camera config, 3D card models =================
  Tests.add('camera-config', () => {
    const dflt = CameraCfg.normalize({});
    eq(
      'camera config defaults = the old hard-coded values (top height 60, side camera (3, 29, 22), fov 45)',
      [dflt.top.height, dflt.classic.position, dflt.classic.fov, dflt.seat.opponentYawDeg],
      [60, [3, 29, 22], 45, 180]
    );
    const bad = CameraCfg.normalize({ top: { height: 'x', zoomMin: 3, zoomMax: 1 }, classic: { position: [1, 2] } });
    check(
      'a wrong value takes its default, zoomMax never below zoomMin',
      bad.top.height === 60 && bad.top.zoomMax === 3 && bad.classic.position.length === 3
    );
    const p = CameraCfg.classicPose(dflt, Math.PI);
    check(
      'the Opponent seat = the same camera turned half way round',
      Math.abs(p.position[0] + 3) < 1e-9 && Math.abs(p.position[2] + 22) < 1e-9
    );
    if (typeof readRepoFile === 'function') {
      const j = JSON.parse(readRepoFile('config/camera.json'));
      check(
        'config/camera.json is complete (every value read from the file, none falls back)',
        JSON.stringify(CameraCfg.normalize(j)) ===
          JSON.stringify(CameraCfg.normalize(Object.assign({}, CameraCfg.DEFAULTS, j))) &&
          j.top &&
          j.classic &&
          j.seat
      );
      const ix = JSON.parse(readRepoFile('assets/3dModels/cards/index.json')),
        L = Anim3DLogic;
      check(
        'assets/3dModels/cards/index.json: a script model and a GLB model resolve, a missing file is still a gltf entry (the preview falls back)',
        L.cardModelEntry(ix, 'kingeye').type === 'script' &&
          L.cardModelEntry(ix, 'kingeye').path === 'assets/3dModels/cards/procedural/eye.js' &&
          L.cardModelEntry(ix, 'archer').type === 'gltf' &&
          L.cardModelEntry(ix, 'hummingbird').path === 'assets/3dModels/cards/hummingbird.glb'
      );
      eq(
        'every model entry names a real card',
        Object.keys(ix.cards).filter(id => !byId(id)),
        []
      );
    }
    const L = Anim3DLogic;
    eq(
      'card model entries: no entry = none; byConvention = <id>.glb; unknown type / script without builder = none, with the reason',
      [
        L.cardModelEntry({}, 'x').type,
        L.cardModelEntry({ byConvention: true }, 'x').path,
        L.cardModelEntry({ cards: { x: { type: 'fbx2', path: 'a' } } }, 'x').problems,
        L.cardModelEntry({ cards: { x: { type: 'script', path: 'a.js' } } }, 'x').type,
      ],
      ['none', 'assets/3dModels/cards/x.glb', ['unknown model type "fbx2"'], 'none']
    );
    eq(
      'the selection clip: the entry’s "select", else a clip named like select, else none (procedural)',
      [
        L.selectClipName({ select: 'pick' }, ['idle', 'pick']),
        L.selectClipName({}, ['Idle', 'OnSelected']),
        L.selectClipName({}, ['idle']),
      ],
      ['pick', 'OnSelected', null]
    );
  });
})();

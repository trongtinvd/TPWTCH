// 05-board-effects.js - cards that reshape the board or the hidden information: Infinity Wall (unusable zones), King Eye (clouds),
// Superbolt / GrainFall, Black Hawk / Bolt Master, The Vine.
// Run only these: node tests/run.js --only infinity-wall,king-eye,superbolt,black-hawk,vine
(function () {
  const { D, check, eq, rej, start, take, toDeck, pass2, AT, drain, endTurnFlow, ndmg, tokens, kinds } = Tests.ctx;

  Tests.add('infinity-wall', () => {
    // ================= Infinity Wall + unusable zones =================
    const q0 = start(30),
      w0 = take(q0, 'Player', 'infinitywall', 'hand');
    check('Infinity Wall cannot be played without a fully filled column', !!Sim.canPlay(q0, w0));
    const q = start(31),
      full = [
        take(q, 'Opponent', 'barrier', 'board', 'Opponent|back|2'),
        take(q, 'Opponent', 'guard', 'board', 'Opponent|front|2'),
        take(q, 'Player', 'knight', 'board', 'Player|front|2'),
        take(q, 'Player', 'aura', 'board', 'Player|back|2'),
      ];
    const w = take(q, 'Player', 'infinitywall', 'hand');
    check(
      'Infinity Wall is playable once a column is full',
      !Sim.canPlay(q, w) && Sim.targetColumns(q, w).join() === '2'
    );
    check(
      'Infinity Wall cannot target a column that is not full',
      !Sim.dispatch(q, { type: 'PlayCard', iid: w.iid, col: 1 }).ok
    );
    Sim.dispatch(q, { type: 'PlayCard', iid: w.iid, col: 2 });
    Sim.dispatch(q, { type: 'Pass', player: 'Opponent' });
    Sim.dispatch(q, { type: 'Pass', player: 'Player' });
    check(
      'Infinity Wall exiles every card on the column',
      full.every(x => x.loc === 'exile' && !x.slot) &&
        q.piles.Opponent.exile.length === 2 &&
        q.piles.Player.exile.length === 2
    );
    check(
      'all four zones of the column become unusable',
      ['Opponent|back|2', 'Opponent|front|2', 'Player|front|2', 'Player|back|2'].every(k => Sim.isUnusable(q, k)) &&
        !Sim.isUnusable(q, 'Player|front|1')
    );
    check('Infinity Wall returns to its owner\u2019s hand', w.loc === 'hand' && q.piles.Player.hand.includes(w));
    const sd = take(q, 'Player', 'soldier', 'hand');
    check(
      'a card cannot be placed on an unusable zone',
      !Sim.dispatch(q, { type: 'PlayCard', iid: sd.iid, slot: 'Player|front|2' }).ok &&
        !Sim.freeSlots(q, sd).includes('Player|front|2')
    );
    const st = take(q, 'Player', 'wolf', 'board', 'Player|front|2');
    Sim.dispatch(q, { type: 'Draw', player: 'Player' });
    check('a card found on an unusable zone is sent to the graveyard', st.loc === 'gy' && !q.slots['Player|front|2']);
  });

  Tests.add('king-eye', () => {
    // ================= King Eye clouds + Infinity Wall, Superbolt under a cloud =================
    {
      const q = start(40);
      take(q, 'Player', 'soldier', 'board', 'Player|front|0');
      take(q, 'Player', 'barrier', 'board', 'Player|back|0');
      const kw = take(q, 'Player', 'infinitywall', 'hand');
      check('column 1 with 2 cards of mine and none of the opponent: Wall cannot be played', !!Sim.canPlay(q, kw));
      take(q, 'Opponent', 'kingeye', 'board', 'Opponent|front|1');
      check(
        'King Eye clouds act as legal targets: Wall is playable on column 1',
        Sim.canPlay(q, kw) === null && Sim.targetColumns(q, kw).join() === '0'
      );
      check(
        'clouds never cover King Eye\u2019s own zone',
        !Sim.cloudMap(q)['Opponent|front|1'] && !!Sim.cloudMap(q)['Opponent|front|0']
      );
      const k1 = Sim.dispatch(q, { type: 'PlayCard', iid: kw.iid, col: 0 });
      Sim.dispatch(q, { type: 'Pass', player: 'Opponent' });
      const k2 = Sim.dispatch(q, { type: 'Pass', player: 'Player' });
      check(
        'Wall fizzles when nothing legal is underneath the clouds, and nothing is revealed',
        k1.ok && kw.loc === 'gy' && !Sim.isUnusable(q, 'Player|front|0') && k2.events.some(e => e.t === 'StackObjectFizzled')
      );
      const q2 = start(41);
      take(q2, 'Player', 'wolf', 'board', 'Player|front|2');
      take(q2, 'Player', 'barrier', 'board', 'Player|back|2');
      take(q2, 'Opponent', 'trap', 'board', 'Opponent|back|2');
      take(q2, 'Opponent', 'kingeye', 'board', 'Opponent|front|1');
      const kw2 = take(q2, 'Player', 'infinitywall', 'hand');
      Sim.dispatch(q2, { type: 'PlayCard', iid: kw2.iid, col: 2 });
      Sim.dispatch(q2, { type: 'Pass', player: 'Opponent' });
      const k3 = Sim.dispatch(q2, { type: 'Pass', player: 'Player' });
      check(
        'with one real card under the clouds the Wall also fizzles (column not really full)',
        kw2.loc === 'gy' && !Sim.isUnusable(q2, 'Player|front|2') && k3.events.some(e => e.t === 'StackObjectFizzled')
      );
      const q3 = start(42);
      take(q3, 'Opponent', 'kingeye', 'board', 'Opponent|front|1');
      const ke = Object.values(q3.cards).find(x => x.def.id === 'kingeye' && x.loc === 'board');
      ke.loc = 'gy';
      ke.slot = null;
      q3.slots['Opponent|front|1'] = null;
      check('clouds vanish when King Eye leaves the board', !Object.keys(Sim.cloudMap(q3)).length);
    }
    {
      const q = start(110),
        ke = take(q, 'Opponent', 'kingeye', 'board', 'Opponent|front|1'),
        sb = take(q, 'Player', 'superbolt', 'hand');
      D(q, { type: 'PlayCard', iid: sb.iid, zone: 'Opponent|back|4' });
      const r = pass2(q);
      eq(
        'Superbolt on an empty zone under a cloud fizzles and reveals nothing',
        [r.events.some(e => e.t === 'StackObjectFizzled'), ndmg(ke), q.life.Opponent, sb.loc],
        [true, 0, 20, 'gy']
      );
      const p = start(111),
        sb2 = take(p, 'Player', 'superbolt', 'hand');
      rej(
        'without clouds an empty zone is not a legal Superbolt target',
        p,
        { type: 'PlayCard', iid: sb2.iid, zone: 'Opponent|back|4' },
        'Illegal target zone'
      );
    }
  });

  Tests.add('superbolt-grainfall', () => {
    // ================= Superbolt, GrainFall =================
    const drain2 = drain;
    let q = start(120),
      z = take(q, 'Player', 'superbolt', 'hand');
    D(q, { type: 'PlayCard', iid: z.iid, tplayer: 'Opponent' });
    drain2(q);
    eq(
      'Superbolt deals exactly 20 to a player (20 -> 0); the game does not end by itself (no win rule implemented)',
      [q.life.Opponent, q.phase],
      [0, 'play']
    );
    q = start(121);
    z = take(q, 'Player', 'superbolt', 'hand');
    const vt = take(q, 'Opponent', 'scout', 'board', 'Opponent|front|1');
    D(q, { type: 'PlayCard', iid: z.iid, zone: 'Opponent|front|1' });
    drain2(q);
    eq(
      'Superbolt on a permanent destroys it and leaves players\u2019 life alone',
      [vt.loc, q.life.Opponent, q.life.Player],
      ['gy', 20, 20]
    );
    q = start(122);
    z = take(q, 'Player', 'grainfall', 'hand');
    const od = q.piles.Opponent.deck.map(c => c.iid),
      pd = q.piles.Player.deck.length;
    rej('GrainFall needs a player target', q, { type: 'PlayCard', iid: z.iid }, 'Target a player');
    D(q, { type: 'PlayCard', iid: z.iid, tplayer: 'Opponent' });
    drain2(q);
    eq(
      'GrainFall: the top ten cards go to the GY (newest first), the rest stay in order; the caster\u2019s deck is untouched',
      [q.piles.Opponent.gy.map(c => c.iid), q.piles.Opponent.deck.map(c => c.iid), q.piles.Player.deck.length],
      [od.slice(0, 10).reverse(), od.slice(10), pd]
    );
    q = start(123);
    z = take(q, 'Player', 'grainfall', 'hand');
    q.piles.Opponent.deck.splice(3);
    D(q, { type: 'PlayCard', iid: z.iid, tplayer: 'Opponent' });
    drain2(q);
    eq(
      'GrainFall with fewer than 10 cards mills what exists, no error',
      [q.piles.Opponent.deck.length, q.piles.Opponent.gy.length],
      [0, 3]
    );
    q = start(124);
    z = take(q, 'Player', 'grainfall', 'hand');
    const pd2 = q.piles.Player.deck.length;
    D(q, { type: 'PlayCard', iid: z.iid, tplayer: 'Player' });
    drain2(q);
    eq(
      'GrainFall may target its own caster',
      [q.piles.Player.deck.length, q.piles.Player.gy.length - 1],
      [pd2 - 10, 10]
    );
  });

  Tests.add('black-hawk', () => {
    // ================= Black Hawk, Bolt Master =================
    let q = start(130);
    const hk = take(q, 'Player', 'blackhawk', 'board', 'Player|front|0');
    D(q, { type: 'SetAttackPhase', player: 'Player', on: true });
    eq(
      'Black Hawk: combat-step trigger is on the stack, power not doubled yet, non-turn player has priority',
      [q.stack.length, Sim.atkOf(hk), q.priority],
      [1, 1, 'Opponent']
    );
    rej('no attack until the combat trigger has resolved', q, { type: 'Attack', iid: hk.iid }, 'Stack is not empty');
    drain(q);
    eq(
      'power doubled 5 times: 1 x 2^5 = 32 (five atkMul statuses, in order)',
      [Sim.atkOf(hk), kinds(hk, 'atkMul').length],
      [32, 5]
    );
    AT(q, hk.iid);
    eq('Black Hawk deals its doubled power (32) to the player through an empty column', q.life.Opponent, 20 - 32);
    q = start(131);
    const oh = take(q, 'Opponent', 'blackhawk', 'board', 'Opponent|front|0');
    D(q, { type: 'SetAttackPhase', player: 'Player', on: true });
    eq('an opposing Black Hawk does not trigger in my combat step', [q.stack.length, Sim.atkOf(oh)], [0, 1]);
    q = start(132);
    const bm = take(q, 'Player', 'boltmaster', 'hand'),
      sb = toDeck(q, 'Player', 'superbolt'),
      h0 = q.piles.Player.hand.length;
    D(q, { type: 'PlayCard', iid: bm.iid, slot: 'Player|front|2' });
    drain(q);
    check(
      'Bolt Master fetches Superbolt from the deck into the hand (hand: -Bolt Master +Superbolt)',
      sb.loc === 'hand' && !q.piles.Player.deck.includes(sb) && q.piles.Player.hand.length === h0
    );
    q = start(133);
    const bm2 = take(q, 'Player', 'boltmaster', 'hand');
    take(q, 'Player', 'superbolt', 'gy');
    const h1 = q.piles.Player.hand.length,
      d1 = q.piles.Player.deck.length;
    D(q, { type: 'PlayCard', iid: bm2.iid, slot: 'Player|front|2' });
    drain(q);
    eq(
      'Bolt Master with no Superbolt in the deck: fetches nothing, no error (a Superbolt in the GY is not fetched)',
      [q.piles.Player.hand.length, q.piles.Player.deck.length, q.piles.Player.hand.some(c => c.def.id === 'superbolt')],
      [h1 - 1, d1, false]
    );
  });

  Tests.add('vine', () => {
    // ================= The Vine =================
    {
      let s = start(140);
      const vn = take(s, 'Player', 'vine', 'hand'),
        sd = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|2');
      D(s, { type: 'PlayCard', iid: vn.iid, slot: 'Player|front|2' });
      drain(s);
      check(
        'Vine enter: one token on each of the 4 nearest zones (any row), owned by the Vine\u2019s controller',
        tokens(s).length === 4 &&
          tokens(s).every(t => t.owner === 'Player') &&
          ['Player|front|1', 'Player|front|3', 'Player|back|2', 'Opponent|front|2'].every(
            k => s.slots[k] && s.cards[s.slots[k]].def.id === 'vine-token'
          )
      );
      check(
        'Vine destroys the card on the zone it picks; the Vine itself stays put',
        sd.loc === 'gy' && vn.loc === 'board' && vn.slot === 'Player|front|2'
      );
      endTurnFlow(s);
      check('Vine: no trigger at the OPPONENT\u2019s turn start', s.active === 'Opponent' && !s.stack.length);
      endTurnFlow(s);
      check(
        'Vine: trigger goes on the stack at its controller\u2019s turn start',
        s.active === 'Player' && s.stack.length === 1
      );
      pass2(s);
      check(
        'Vine turn-start: 4 more tokens (8 total), never on the Vine or an existing token',
        tokens(s).length === 8 && vn.slot === 'Player|front|2' && vn.loc === 'board'
      );
      s = start(141);
      const v2 = take(s, 'Player', 'vine', 'hand');
      for (const k of Object.keys(s.slots)) if (k !== 'Player|front|0') Sim.markUnusable(s, k, 'test');
      D(s, { type: 'PlayCard', iid: v2.iid, slot: 'Player|front|0' });
      drain(s);
      eq(
        'Vine with no legal zone (every other zone unusable): nothing is created, nothing destroyed',
        [tokens(s).length, s.piles.Player.gy.length, v2.loc],
        [0, 0, 'board']
      );
      s = start(142);
      const v3 = take(s, 'Player', 'vine', 'hand');
      for (const k of Object.keys(s.slots)) if (k !== 'Player|front|0' && k !== 'Opponent|back|4') Sim.markUnusable(s, k, 'test');
      D(s, { type: 'PlayCard', iid: v3.iid, slot: 'Player|front|0' });
      drain(s);
      eq(
        'with exactly one legal zone the 4 repetitions create just one token there (re-evaluated each time)',
        [tokens(s).length, tokens(s)[0] && tokens(s)[0].slot],
        [1, 'Opponent|back|4']
      );
      s = start(143);
      take(s, 'Player', 'vine', 'board', 'Player|front|0');
      const fillers = [];
      for (const k of Object.keys(s.slots))
        if (!s.slots[k]) {
          const f = {
            iid: 'fx-' + k,
            def: FIXTURES.find(d => d.id === 'soldier'),
            owner: 'Opponent',
            loc: 'board',
            slot: k,
            damage: [],
            atk: 2,
          };
          s.cards[f.iid] = f;
          s.slots[k] = f.iid;
          fillers.push(f);
        } // 19 DISTINCT filler cards (take() would reuse one card)
      endTurnFlow(s);
      endTurnFlow(s);
      drain(s);
      eq(
        'Vine on a full board: the 4 nearest non-Vine zones are converted: 4 fillers destroyed, 4 tokens, 15 fillers untouched',
        [tokens(s).length, fillers.filter(f => f.loc === 'gy').length, fillers.filter(f => f.loc === 'board').length],
        [4, 4, 15]
      );
    }
    {
      const VT = DEFS.find(d => d.id === 'vine').tokens.vine;
      let s = start(144);
      const vz = take(s, 'Player', 'knight', 'board', 'Player|front|1'),
        tk = take(s, 'Player', 'soldier', 'board', 'Opponent|front|1');
      tk.def = VT;
      tk.atk = undefined;
      tk.token = true;
      s.attackPhase = true;
      AT(s, tk.iid);
      eq(
        'a token standing on the foe\u2019s front row hits the foe (1), not its own side',
        [s.life.Opponent, s.life.Player, ndmg(vz)],
        [19, 20, 0]
      );
      s = start(145);
      const tb = take(s, 'Player', 'soldier', 'board', 'Opponent|front|1'),
        ob = take(s, 'Opponent', 'knight', 'board', 'Opponent|back|1');
      tb.def = VT;
      tb.token = true;
      s.attackPhase = true;
      AT(s, tb.iid);
      eq('...and damages the foe\u2019s back card in its column, not the player', [ndmg(ob), s.life.Opponent], [1, 20]);
      s = start(146);
      const av = take(s, 'Player', 'vine', 'board', 'Player|front|1'),
        ally = take(s, 'Player', 'soldier', 'board', 'Opponent|front|1');
      ally.def = VT;
      ally.token = true;
      s.attackPhase = true;
      AT(s, av.iid);
      eq(
        'Vine Y (yours) standing in the foe\u2019s column blocks Vine X\u2019s attack: Y takes the damage, the player is untouched',
        [ndmg(ally), ally.loc, s.life.Opponent],
        [1, 'board', 20]
      );
    }
  });
})();

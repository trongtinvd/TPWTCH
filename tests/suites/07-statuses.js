// 07-statuses.js - the ordered status list (folds, removal, keep, expiry, auras, links, player list, vault) and the logs[] history.
// Run only these: node tests/run.js --only statuses,logs,zone-gone
(function () {
  const { D, check, eq, start, take, pass2, AT, drain, endTurnFlow, dmg, setLife, shield, kinds } = Tests.ctx;

  Tests.add('statuses-fold', () => {
    // ================= STATUSES: one ordered list per card and per player =================
    let s = start(300);
    const so = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1');
    const a = dmg(s, so, 1),
      b = dmg(s, so, 1, 'combat');
    check(
      'statuses are ordered oldest to newest (ids increase) and each has source name, turn and id',
      Sim.live(so)
        .map(x => x.seq)
        .join() === [a.seq, b.seq].join() &&
        b.seq > a.seq &&
        a.srcName === 'test' &&
        a.turn === 1
    );
    Sim.addStatus(s, so, { kind: 'life', amount: 2, srcName: 't' });
    Sim.addStatus(s, so, { kind: 'mod', atk: 1, hp: 0, srcName: 't' });
    Sim.addStatus(s, so, { kind: 'atkMul', n: 2, srcName: 't' });
    Sim.addStatus(s, so, { kind: 'mod', atk: 3, hp: 0, srcName: 't' });
    eq(
      'HP and ATK are folds: HP 3 +2 life = 5; ATK ((2+1)x2)+3 = 9; damage 2',
      [Sim.hpOf(so), Sim.atkOf(so), Sim.totalDamage(so)],
      [5, 9, 2]
    );
    s = start(301);
    const so2 = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1');
    Sim.addStatus(s, so2, { kind: 'mod', atk: 3, hp: 0, srcName: 't' });
    Sim.addStatus(s, so2, { kind: 'atkMul', n: 2, srcName: 't' });
    eq('order matters: (2+3)x2 = 10, not 2x2+3 = 7', Sim.atkOf(so2), 10);
  });

  Tests.add('statuses-lifecycle', () => {
    // ================= removal on leaving the board, keep, bounce, zone-bound, reveal, expiry =================
    {
      let s = start(302);
      const so = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'),
        g = take(s, 'Player', 'giant', 'board', 'Player|front|1');
      dmg(s, so, 1);
      shield(s, so, 'blue');
      Sim.recalc(s, []);
      const before = so.statuses.slice();
      check(
        'a card that stays on the board keeps its statuses',
        Sim.live(so).filter(x => x.kind !== 'entered').length === 2
      );
      Sim.enterCombat(s);
      AT(s, g.iid);
      check(
        'a destroyed card has every status REMOVED (not deleted): the list keeps them, greyed, with the reason',
        so.loc === 'gy' &&
          Sim.live(so).length === 0 &&
          before.every(x => so.statuses.includes(x) && x.removed && /left the board/.test(x.removed.why)) &&
          Sim.statusLines(so).every(x => x.removed)
      );
    }
    {
      let s = start(303);
      const so = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'),
        sh = shield(s, so, 'blue'),
        keep = Sim.addStatus(s, so, { kind: 'mod', atk: 0, hp: 0, keep: true, srcName: 't' }),
        sb = take(s, 'Player', 'superbolt', 'hand');
      D(s, { type: 'PlayCard', iid: sb.iid, zone: 'Opponent|front|1' });
      drain(s);
      eq(
        'a status with keep:true survives leaving the board; the others are removed',
        [so.loc, !!sh.removed, !!keep.removed],
        ['gy', true, false]
      );
    }
    {
      let s = start(304);
      const sg = take(s, 'Opponent', 'shieldguard', 'hand'),
        ally = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'),
        w = take(s, 'Player', 'wolf', 'board', 'Player|front|1');
      const d = dmg(s, ally, 1);
      shield(s, ally, 'blue');
      Sim.enterCombat(s);
      D(s, { type: 'Attack', iid: w.iid });
      D(s, { type: 'Activate', iid: sg.iid, ab: 0 });
      pass2(s);
      check(
        'bounced to hand: the card\u2019s board statuses are removed (greyed), none are live in hand',
        ally.loc === 'hand' && !!d.removed && Sim.live(ally).length === 0
      );
    }
    {
      let s = start(306);
      const hb = take(s, 'Player', 'hummingbird', 'gy');
      const st = Sim.addStatus(s, hb, { kind: 'shield', color: 'red', srcName: 't' });
      Sim.recalc(s, []);
      check(
        'a board-zone status on a card that is NOT on the board is removed by the next recalc',
        !!st.removed && /left the board/.test(st.removed.why)
      );
    }
    {
      let s = start(308);
      const p2 = take(s, 'Player', 'parasite', 'hand'),
        ho = take(s, 'Opponent', 'soldier', 'hand');
      D(s, { type: 'PlayCard', iid: p2.iid, slot: 'Player|front|0' });
      drain(s);
      const rv = Sim.live(ho).find(x => x.kind === 'revealed');
      check(
        '0-mode reveal is a status on the card in hand, visible to the revealer only',
        !!rv && Sim.isRevealed(ho, 'Player') && !Sim.isRevealed(ho, 'Opponent') && s.choice && s.choice.kind === 'pick'
      );
      D(s, { type: 'Choose', player: 'Player', option: ho.iid });
      check(
        'the revealed status is removed (greyed) when the card leaves the hand',
        ho.loc === 'gy' && !!rv.removed && !Sim.isRevealed(ho, 'Player')
      );
    }
    {
      let s = start(309);
      const wf = take(s, 'Player', 'wolf', 'board', 'Player|front|1'),
        kn = take(s, 'Player', 'knight', 'board', 'Player|front|2');
      D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
      AT(s, wf.iid);
      check(
        '"already attacked" is a status on the attacker',
        Sim.live(wf).some(x => x.kind === 'attacked') && !Sim.live(kn).some(x => x.kind === 'attacked')
      );
      const at = Sim.live(wf).find(x => x.kind === 'attacked');
      D(s, { type: 'EndTurn', player: 'Player' });
      D(s, { type: 'Pass', player: 'Opponent' });
      check(
        'expiring statuses (turnEnd) are removed when the turn ends, with the reason "expired"/"turn ended"',
        !!at.removed && Sim.live(wf).every(x => x.kind !== 'attacked')
      );
    }
    {
      let s = start(310);
      const so = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'),
        q = take(s, 'Player', 'intuition', 'hand');
      D(s, { type: 'PlayCard', iid: q.iid, zone: 'Opponent|front|1' });
      pass2(s);
      const nd = Sim.live(so).find(x => x.kind === 'nodamage');
      check(
        'Quick Intuition puts a nodamage status (expires at end of turn) on its target',
        !!nd && nd.expires === 'turnEnd'
      );
      endTurnFlow(s);
      check(
        '...and it is removed when the turn ends but stays in the list, greyed',
        !!nd.removed &&
          nd.removed.why === 'expired' &&
          Sim.statusLines(so).some(x => x.removed && x.st.kind === 'nodamage')
      );
    }
  });

  Tests.add('statuses-aura-link', () => {
    // ================= auras (War Drum) and linked statuses (Avatar ability swap) =================
    {
      let s = start(311);
      const sg = take(s, 'Player', 'soldier', 'board', 'Player|front|1'),
        dr = take(s, 'Player', 'wardrum', 'hand'),
        v = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'),
        far = take(s, 'Opponent', 'wolf', 'board', 'Opponent|front|4');
      D(s, { type: 'PlayCard', iid: dr.iid, slot: 'Player|back|1' });
      drain(s);
      D(s, { type: 'Choose', player: 'Player', option: 'Player|front|0' });
      drain(s);
      const m = Sim.live(v).filter(x => x.kind === 'mod');
      eq(
        'War Drum puts a -1/-1 status on a foe in range (src, atk, hp readable from the list)',
        [m.length, m[0].atk, m[0].hp, m[0].srcName, Sim.atkOf(v), Sim.hpOf(v)],
        [1, -1, -1, 'War Drum', 1, 2]
      );
      check('a foe outside the columns has none', !Sim.live(far).some(x => x.kind === 'mod'));
      s.slots['Opponent|front|1'] = null;
      s.slots['Opponent|front|4'] = v.iid;
      v.slot = 'Opponent|front|4';
      Sim.recalc(s, []);
      check(
        'leaving the columns REMOVES the status (greyed, "no longer in range"); no new one while out of range',
        !!m[0].removed &&
          /range/.test(m[0].removed.why) &&
          !Sim.live(v).some(x => x.kind === 'mod') &&
          Sim.atkOf(v) === 2
      );
      v.slot = 'Opponent|front|1';
      s.slots['Opponent|front|4'] = null;
      s.slots['Opponent|front|1'] = v.iid;
      D(s, { type: 'EndTurn', player: 'Player' });
      eq(
        'moving back in range adds a NEW status at the end of the list (the old one stays greyed)',
        [Sim.live(v).filter(x => x.kind === 'mod').length, v.statuses.filter(x => x.kind === 'mod').length],
        [1, 2]
      );
      s.slots['Player|back|1'] = null;
      dr.loc = 'gy';
      dr.slot = null;
      D(s, { type: 'Pass', player: 'Opponent' });
      check(
        'when the War Drum leaves the board its auras end: no live mod statuses remain',
        !Sim.live(v).some(x => x.kind === 'mod')
      );
    }
    {
      let s = start(312);
      const so = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1');
      const d = dmg(s, so, 1),
        ab = Sim.addStatus(s, so, { kind: 'ability', to: 'avatar', link: d.seq, srcName: 'Avatar of Rabies' });
      check('ability replacement is a status; abDef reads the newest live one', Sim.abDef(so).id === 'avatar');
      Sim.removeStatus(s, d, 'test');
      Sim.recalc(s, []);
      check(
        'removing the linked damage status removes the ability status too (linked status ended)',
        !!ab.removed && Sim.abDef(so).id === 'soldier'
      );
    }
  });

  Tests.add('statuses-player', () => {
    // ================= the player's own list: life as a fold, paid life, nogain =================
    let s = start(313);
    const h = take(s, 'Player', 'soldier', 'hand');
    setLife(s, 'Player', 12);
    const he = take(s, 'Player', 'heal', 'hand');
    D(s, { type: 'PlayCard', iid: he.iid });
    pass2(s);
    const sp = take(s, 'Opponent', 'zap', 'hand');
    s.priority = 'Opponent';
    eq(
      'player list: damage then life, in order; life total is the fold (20 -8 +3 = 15)',
      [s.players.Player.statuses.map(x => x.kind), s.life.Player, Sim.lifeOf(s, 'Player')],
      [['damage', 'life'], 15, 15]
    );
    s = start(314);
    const ar = take(s, 'Player', 'archer', 'board', 'Player|front|0');
    D(s, { type: 'Activate', iid: ar.iid, ab: 0 });
    pass2(s);
    eq(
      'Archer: life paid is a status on the player and the opponent\u2019s damage is too',
      [
        s.players.Player.statuses.map(x => x.kind),
        s.players.Opponent.statuses.map(x => [x.kind, x.amount]),
        s.life.Player,
        s.life.Opponent,
      ],
      [['paid'], [['damage', 2]], 19, 18]
    );
    const sp2 = take(s, 'Player', 'spirit', 'hand');
    Sim.gainAP(s, 'Player', []);
    D(s, { type: 'PlayCard', iid: sp2.iid });
    pass2(s);
    D(s, { type: 'Choose', player: 'Player', option: '0' });
    check(
      'Spirit of the Sand: red shield statuses + a cannot-gain-life rule status on the player; healing now does nothing',
      !Sim.allowed(s.players.Player, 'gainLife') && kinds(ar, 'shield').length === 1
    );
    const he2 = take(s, 'Player', 'heal', 'hand');
    const l = s.life.Player;
    D(s, { type: 'PlayCard', iid: he2.iid });
    pass2(s);
    eq(
      '...no life status is added while the cannot-gain-life status is active',
      [s.life.Player, s.players.Player.statuses.filter(x => x.kind === 'life').length],
      [l, 0]
    );
    s = start(315);
    setLife(s, 'Player', 10);
    const st = s.players.Player.statuses[0];
    Sim.removeStatus(s, st, 'test');
    D(s, { type: 'Draw', player: 'Player' });
    eq(
      'removing a damage status from a player restores the life it took (fold ignores removed statuses)',
      [s.life.Player, Sim.statusLines(s.players.Player).length, Sim.statusLines(s.players.Player)[0].removed],
      [20, 1, true]
    );
  });

  Tests.add('statuses-vault', () => {
    // ================= Heaven and Sun: vault statuses =================
    let s = start(316);
    const ke = take(s, 'Player', 'soldier', 'board', 'Player|front|0'),
      hv = take(s, 'Player', 'heavensun', 'hand');
    D(s, { type: 'PlayCard', iid: hv.iid, slot: 'Player|back|0' });
    drain(s);
    let n = 0;
    while (s.choice && s.choice.kind === 'vault' && n++ < 9)
      D(s, { type: 'Choose', player: 'Player', option: s.choice.options[0] });
    eq(
      'Heaven and Sun: each exiled card is a vault status on it',
      [kinds(hv, 'vault').length, s.piles.Player.exile.length],
      [5, 5]
    );
    s.slots['Player|back|0'] = null;
    hv.loc = 'gy';
    hv.slot = null;
    Sim.recalc(s, []);
    check(
      'when it leaves the board its vault statuses are removed: the exiled cards can no longer be retrieved',
      kinds(hv, 'vault').length === 0 && hv.statuses.filter(x => x.kind === 'vault').every(x => x.removed)
    );
  });

  Tests.add('zone-gone-rule', () => {
    // ================= zone gone is a RULE (blue does not protect) =================
    const q = start(400),
      bar = take(q, 'Opponent', 'barrier', 'board', 'Opponent|back|2'),
      blue = take(q, 'Opponent', 'soldier', 'board', 'Opponent|front|2'),
      kn = take(q, 'Player', 'knight', 'board', 'Player|front|2');
    take(q, 'Player', 'aura', 'board', 'Player|back|2');
    const bs = shield(q, blue, 'blue'),
      w = take(q, 'Player', 'infinitywall', 'hand');
    D(q, { type: 'PlayCard', iid: w.iid, col: 2 });
    D(q, { type: 'Pass', player: 'Opponent' });
    const r = D(q, { type: 'Pass', player: 'Player' });
    eq('Infinity Wall: unshielded cards are exiled', [bar.loc, kn.loc], ['exile', 'exile']);
    eq(
      'the blue card is not exiled (an effect cannot touch it) but its zone is gone: the RULES send it to the GY, the slot is empty',
      [blue.loc, q.piles.Opponent.gy.includes(blue), q.slots['Opponent|front|2']],
      ['gy', true, null]
    );
    check(
      'that destruction is marked as a rule (event + status removal reason + log)',
      r.events.some(e => e.t === 'PermanentDestroyed' && e.iid === blue.iid && e.by === 'rule') &&
        !!bs.removed &&
        /zone/.test(bs.removed.why) &&
        /rules/.test(blue.logs.filter(e => e.kind === 'zone').pop().how)
    );
  });

  Tests.add('logs', () => {
    // ================= logs[]: one append-only history per card and per player =================
    {
      const s = Sim.create(401, DEFS.concat(FIXTURES)),
        c = s.piles.Player.deck[2];
      check(
        'logs: a card starts with its shuffled deck position',
        c.logs.length === 1 && c.logs[0].kind === 'start' && c.logs[0].pos === 3 && c.logs[0].to === 'deck'
      );
      D(s, { type: 'ReorderDeck', player: 'Player', from: 2, to: 0 });
      D(s, { type: 'Start', player: 'Player' });
      D(s, { type: 'Start', player: 'Opponent' });
      eq(
        'logs: deck position when the deck locked, then leaving the deck (opening hand) and how',
        [c.logs.map(e => e.kind), c.logs[1].pos, c.logs[2].from, c.logs[2].to, c.logs[2].how],
        [['start', 'locked', 'zone'], 1, 'deck', 'hand', 'drawn']
      );
    }
    {
      const s = start(402),
        top = s.piles.Player.deck[0];
      D(s, { type: 'Draw', player: 'Player' });
      const z = top.logs.filter(e => e.kind === 'zone').pop();
      eq('logs: Draw is recorded as deck -> hand (drawn)', [z.from, z.to, z.how], ['deck', 'hand', 'drawn']);
      const q = start(403),
        gf = take(q, 'Player', 'grainfall', 'hand'),
        first = q.piles.Opponent.deck[0];
      D(q, { type: 'PlayCard', iid: gf.iid, tplayer: 'Opponent' });
      drain(q);
      const m = first.logs.filter(e => e.kind === 'zone').pop();
      eq(
        'logs: a milled card shows deck -> gy (milled); a spell shows stack, then gy',
        [
          m.from,
          m.to,
          m.how,
          gf.logs
            .filter(e => e.kind === 'zone')
            .map(e => e.to)
            .slice(-2), // the last two moves (it may have been drawn first, depending on the shuffle)
          gf.logs.filter(e => e.kind === 'zone').pop().how,
        ],
        ['deck', 'gy', 'milled', ['stack', 'gy'], 'resolved']
      );
    }
    {
      const s = start(404),
        so = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'),
        g = take(s, 'Player', 'giant', 'board', 'Player|front|1'),
        d = dmg(s, so, 1),
        sh = shield(s, so, 'red');
      Sim.removeStatus(s, d, 'test');
      check(
        'logs: applying and removing a status are both recorded with the status id and the reason',
        so.logs.some(e => e.kind === 'status+' && e.id === d.seq) &&
          so.logs.some(e => e.kind === 'status-' && e.id === d.seq && e.why === 'test') &&
          !so.logs.some(e => e.kind === 'status-' && e.id === sh.seq)
      );
      Sim.enterCombat(s);
      AT(s, g.iid);
      check(
        'logs: when the card dies every status it ever had has a matching removal entry',
        so.loc === 'gy' &&
          so.logs.filter(e => e.kind === 'status+').every(a => so.logs.some(r => r.kind === 'status-' && r.id === a.id))
      );
      check(
        'logs: chronological (n strictly increasing) and the last entry is the move to the GY',
        so.logs.every((e, i) => !i || e.n > so.logs[i - 1].n) && so.logs[so.logs.length - 1].to === 'gy'
      );
      setLife(s, 'Player', 10);
      check(
        'logs: players have a log too (life changes are statuses)',
        s.players.Player.logs.some(e => e.kind === 'status+' && e.sk === 'damage') &&
          Sim.logLines(s.players.Player).length === 1
      );
    }
  });
})();

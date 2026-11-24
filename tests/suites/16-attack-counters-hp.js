// 16-attack-counters-hp.js - attack counters, non-lethal and temporary damage, non-player HP targets (hp.js HPKINDS), Vanguard.
// Run only these: node tests/run.js --only attack-counters,non-player-hp
(function () {
  const { D, check, eq, rej, start, take, pass2, drain, dmg, shield, kinds, endTurnFlow } = Tests.ctx;
  const VG = 0; // Vanguard's ability index
  const act = (s, c, pick) =>
    D(s, Object.assign({ type: 'Activate', iid: c.iid, ab: VG }, pick == null ? {} : { pick }));
  const left = c => Sim.hpOf(c) - Sim.totalDamage(c);

  Tests.add('attack-counters', () => {
    let s = start(1600);
    const wf = take(s, 'Player', 'wolf', 'board', 'Player|front|1'),
      kn = take(s, 'Player', 'knight', 'board', 'Player|front|2'),
      so = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|3');
    const ev = D(s, { type: 'SetAttackPhase', player: 'Player', on: true }).events;
    check(
      'combat starts: each creature the turn player controls gets ONE attack counter, the foe’s get none',
      kinds(wf, 'attackCounter').length === 1 &&
        kinds(kn, 'attackCounter').length === 1 &&
        !kinds(so, 'attackCounter').length &&
        ev.some(e => e.t === 'AttackCountersPlaced' && e.n === 2)
    );
    const ct = kinds(wf, 'attackCounter')[0];
    D(s, { type: 'Attack', iid: wf.iid });
    drain(s);
    check(
      'an attack spends the counter (removed, reason "spent")',
      !!ct.removed && ct.removed.why.startsWith('spent') && !kinds(wf, 'attackCounter').length
    );
    rej('no counter left: it cannot attack again', s, { type: 'Attack', iid: wf.iid }, 'Already attacked');
    const late = take(s, 'Player', 'guard', 'board', 'Player|front|0');
    rej(
      'a creature that entered after combat started has no counter: it cannot attack',
      s,
      { type: 'Attack', iid: late.iid },
      'No attack counter'
    );
    const kc = kinds(kn, 'attackCounter')[0];
    D(s, { type: 'SetAttackPhase', player: 'Player', on: false });
    check(
      'unspent counters end with the combat phase (reason "combat ended")',
      !!kc.removed && kc.removed.why === 'combat ended'
    );
    check('counter status text', Sim.describe(kc).startsWith('Attack counter'));
  });

  Tests.add('non-player-hp', () => {
    // ---------------- Vanguard: the cost needs an attack counter ----------------
    let s = start(1610);
    const vg = take(s, 'Player', 'vanguard', 'board', 'Player|front|0'),
      ar = take(s, 'Opponent', 'archer', 'board', 'Opponent|front|2'); // 3/2
    check(
      'outside combat Vanguard has no counter: the ability is not usable',
      (Sim.canActivate(s, vg, VG) || '').includes('attack counter')
    );
    Sim.giveZoneHp(s, 'Opponent|back|4', 2, 'test');
    D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
    act(s, vg);
    const k = s.choice;
    check(
      'targets: every board card with HP (its own too), a zone with HP; never a player',
      !!k &&
        k.kind === 'abtarget' &&
        k.options.includes(ar.iid) &&
        k.options.includes(vg.iid) &&
        k.options.includes('Z:Opponent|back|4') &&
        !k.options.some(o => o.startsWith('P:'))
    );
    check('nothing is paid before the target is picked', kinds(vg, 'attackCounter').length === 1 && !s.stack.length);
    D(s, { type: 'Choose', player: 'Player', option: ar.iid });
    check(
      'picked: the counter is spent, the ability is on the stack with the pick, the opponent has priority',
      !kinds(vg, 'attackCounter').length &&
        s.stack.length === 1 &&
        s.stack[0].pick === ar.iid &&
        s.priority === 'Opponent'
    );
    rej('the counter is spent: Vanguard cannot attack now', s, { type: 'Attack', iid: vg.iid }, 'No attack counter');
    pass2(s);
    const d = kinds(ar, 'damage')[0];
    check(
      'non-lethal: 3 damage takes the 2-HP Archer to -1 and it lives',
      ar.loc === 'board' &&
        left(ar) === -1 &&
        d.nonLethal &&
        d.temporary &&
        d.expires === 'turnEnd' &&
        Sim.describe(d).includes('non-lethal') &&
        Sim.describe(d).includes('temporary')
    );
    // a newer non-lethal damage keeps holding; any other HP status entered later takes over
    Sim.damageHp(s, vg, ar.iid, 1, [], { nonLethal: true });
    Sim.recalc(s, []);
    check('a newer non-lethal damage still holds (-2, alive)', ar.loc === 'board' && left(ar) === -2);
    dmg(s, ar, 1);
    Sim.recalc(s, []);
    check('normal damage entered afterwards overrides it: the Archer dies', ar.loc === 'gy');

    // ---------------- an HP gain entered afterwards also takes over ----------------
    s = start(1611);
    const so = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'); // 2/3
    Sim.damageHp(s, so, so.iid, 6, [], { nonLethal: true });
    Sim.recalc(s, []);
    const held = so.loc === 'board' && left(so) === -3;
    Sim.addStatus(s, so, { kind: 'mod', atk: 0, hp: 1, srcName: 'test' });
    Sim.recalc(s, []);
    check('a +1 HP status entered after non-lethal damage takes over: -2 HP kills', held && so.loc === 'gy');

    // ---------------- temporary damage ends with the turn ----------------
    s = start(1612);
    const v2 = take(s, 'Player', 'vanguard', 'board', 'Player|front|0'),
      wf = take(s, 'Opponent', 'wolf', 'board', 'Opponent|front|1');
    D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
    act(s, v2, wf.iid);
    pass2(s);
    const was = left(wf);
    endTurnFlow(s);
    check(
      'temporary damage expires at the end of the turn (wolf back to 3 HP)',
      was === 0 && left(wf) === 3 && kinds(wf, 'damage').length === 0
    );

    // ---------------- stack objects: non-lethal damage still counters ----------------
    s = start(1613);
    const v3 = take(s, 'Player', 'vanguard', 'board', 'Player|front|0'),
      at = take(s, 'Player', 'wolf', 'board', 'Player|front|1'),
      zp = take(s, 'Opponent', 'zap', 'hand');
    D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
    D(s, { type: 'Attack', iid: at.iid });
    D(s, { type: 'PlayCard', iid: zp.iid });
    const sid = s.stack[s.stack.length - 1].sid,
      lifeBefore = s.life.Player;
    check(
      'a spell on the stack is a target; the Attack is not',
      Sim.hpRefs(s).includes('S:' + sid) &&
        !s.stack.filter(o => o.kind === 'attack').some(o => Sim.hpRefs(s).includes('S:' + o.sid))
    );
    act(s, v3, 'S:' + sid);
    pass2(s); // the ability resolves: Zap (stack HP 0) goes to -3
    pass2(s); // Zap would resolve: countered
    check('non-lethal damage still counters a spell (stack HP <= -1)', zp.loc === 'gy' && s.life.Player === lifeBefore);

    // ---------------- zones with HP: non-lethal holds the bar, later damage takes over ----------------
    s = start(1614);
    const v4 = take(s, 'Player', 'vanguard', 'board', 'Player|front|0'),
      zk = 'Opponent|back|4';
    Sim.giveZoneHp(s, zk, 2, 'test');
    D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
    act(s, v4, 'Z:' + zk);
    pass2(s);
    const bar = Sim.zoneBar(s, zk);
    Sim.damageZone(s, zk, 1, 'test', []);
    check(
      'a zone bar taken to -1 by non-lethal damage holds; normal damage afterwards uses it up',
      !!bar && bar.left === -1 && Sim.isUnusable(s, zk)
    );

    // ---------------- clouds, red shields, fizzling ----------------
    s = start(1615);
    const v5 = take(s, 'Player', 'vanguard', 'board', 'Player|front|0'),
      ke = take(s, 'Opponent', 'kingeye', 'board', 'Opponent|back|0'),
      hid = take(s, 'Opponent', 'archer', 'board', 'Opponent|front|2'),
      red = take(s, 'Player', 'knight', 'board', 'Player|front|3');
    shield(s, red, 'red');
    D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
    const o5 = Sim.hpRefs(s);
    check(
      'a card under a cloud is targeted through its cloud (zone ref); a red-shielded card is not a target',
      o5.includes('Z:Opponent|front|2') && !o5.includes(hid.iid) && !o5.includes(red.iid) && o5.includes(ke.iid)
    );
    act(s, v5, 'Z:Opponent|front|2');
    pass2(s);
    check(
      'the cloud passes the damage down to the card beneath',
      kinds(hid, 'damage').length === 1 && hid.loc === 'board'
    );
    s = start(1616);
    const v6 = take(s, 'Player', 'vanguard', 'board', 'Player|front|0'),
      tg = take(s, 'Opponent', 'wolf', 'board', 'Opponent|front|1');
    D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
    act(s, v6, tg.iid);
    shield(s, tg, 'red');
    const ev6 = pass2(s).events;
    check(
      'a target that became illegal fizzles the ability',
      ev6.some(e => e.t === 'StackObjectFizzled') && !kinds(tg, 'damage').length
    );
    rej('an illegal pick is rejected', s, { type: 'Activate', iid: v6.iid, ab: VG, pick: 'P:Opponent' }, '');

    // ---------------- a NEW kind of HP thing is picked up with no card change ----------------
    s = start(1617);
    const v7 = take(s, 'Player', 'vanguard', 'board', 'Player|front|0'),
      box = { hit: 0 };
    Sim.HPKINDS.testBox = {
      refs: () => ['T:box'],
      resolve: (st, ref) => (ref === 'T:box' ? { kind: 'testBox', obj: box } : null),
      damage: (st, src, o, n) => (o.hit += n),
      label: () => 'Test box',
    };
    try {
      D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
      act(s, v7);
      const opt = s.choice && s.choice.options.includes('T:box') && s.choice.labels['T:box'] === 'Test box';
      D(s, { type: 'Choose', player: 'Player', option: 'T:box' });
      pass2(s);
      eq('a registered HPKINDS entry is targetable and takes the damage', [opt, box.hit], [true, 3]);
    } finally {
      delete Sim.HPKINDS.testBox;
    }
  });
})();

// 02-combat.js - combat damage and trample, attack legality, defender responses, combat phases, Attack objects, the sword rule.
// Run only these: node tests/run.js --only combat,attack-object
(function () {
  const { D, check, eq, rej, start, take, pass2, AT, drain, dmg, ndmg, dl, owners } = Tests.ctx;

  Tests.add('combat-damage', () => {
    // ================= combat: damage, trample, absorbing =================
    let s = start(30);
    const k = take(s, 'Player', 'knight', 'board', 'Player|front|0');
    Sim.enterCombat(s);
    const r = AT(s, k.iid);
    eq(
      'empty column: knight (ATK 4) deals 4 to the opponent and nothing to its controller',
      [s.life.Opponent, s.life.Player],
      [16, 20]
    );
    check(
      'attack bookkeeping: attacker recorded, declared in column 0, no stack objects, no damage counters',
      r.ok &&
        Sim.attackedIds(s).includes(k.iid) &&
        !s.stack.length &&
        !ndmg(k) &&
        r.events.some(e => e.t === 'CreatureAttackDeclared' && e.col === 0)
    );
    s = start(31);
    let v = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1');
    const g = take(s, 'Player', 'giant', 'board', 'Player|front|1'),
      by = take(s, 'Opponent', 'guard', 'board', 'Opponent|front|2');
    Sim.enterCombat(s);
    AT(s, g.iid);
    check(
      'giant (ATK 6) destroys soldier (HP 3): it is in its owner\u2019s GY, zone freed, counters cleared',
      v.loc === 'gy' && !v.slot && !ndmg(v) && s.piles.Opponent.gy[0] === v && s.slots['Opponent|front|1'] === null
    );
    eq('excess damage 6-3 tramples to the player', s.life.Opponent, 17);
    check('no counter-damage to the attacker; a card in another column is untouched', !ndmg(g) && !ndmg(by));
    s = start(32);
    v = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1');
    let k2 = take(s, 'Player', 'wolf', 'board', 'Player|front|1');
    Sim.enterCombat(s);
    AT(s, k2.iid);
    eq(
      'ATK == HP (3 vs 3): target survives at effective HP 0, no trample',
      [v.loc, Sim.totalDamage(v), s.life.Opponent],
      ['board', 3, 20]
    );
    s = start(33);
    v = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1');
    k2 = take(s, 'Player', 'knight', 'board', 'Player|front|1');
    Sim.enterCombat(s);
    AT(s, k2.iid);
    eq('ATK == HP+1 (4 vs 3): target dies (HP -1), exactly 1 tramples', [v.loc, s.life.Opponent], ['gy', 19]);
    s = start(34);
    v = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1');
    const kb = take(s, 'Opponent', 'knight', 'board', 'Opponent|back|1'),
      g2 = take(s, 'Player', 'giant', 'board', 'Player|front|1');
    Sim.enterCombat(s);
    AT(s, g2.iid);
    eq(
      'front-to-back trample: soldier dies, the back knight takes only the remaining 3 as one combat instance from the giant',
      [v.loc, kb.loc, dl(kb).map(d => [d[0], d[2], d[1]]), s.life.Opponent],
      ['gy', 'board', [[3, g2.iid, 'combat']], 20]
    );
    s = start(35);
    const gd = take(s, 'Opponent', 'guard', 'board', 'Opponent|front|1'),
      br = take(s, 'Opponent', 'barrier', 'board', 'Opponent|back|1');
    const g3 = take(s, 'Player', 'giant', 'board', 'Player|front|1');
    Sim.enterCombat(s);
    AT(s, g3.iid);
    eq(
      'a front card that absorbs everything (6 vs HP 6) shields the back card: no damage instance on it, player untouched',
      [gd.loc, Sim.totalDamage(gd), ndmg(br), s.life.Opponent],
      ['board', 6, 0, 20]
    );
    s = start(36);
    v = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1');
    dmg(s, v, 2);
    k2 = take(s, 'Player', 'wolf', 'board', 'Player|front|1');
    Sim.enterCombat(s);
    AT(s, k2.iid);
    eq(
      'a pre-damaged target absorbs only its remaining HP: soldier (HP 3, 2 damage) absorbs 1, wolf tramples 2',
      [v.loc, s.life.Opponent],
      ['gy', 18]
    );
    s = start(37);
    const b2 = take(s, 'Opponent', 'barrier', 'board', 'Opponent|back|1'),
      g4 = take(s, 'Player', 'giant', 'board', 'Player|front|1');
    Sim.enterCombat(s);
    AT(s, g4.iid);
    eq(
      'a back-row card with an empty front row is hit: barrier (HP 2) dies, 6-2=4 tramples',
      [b2.loc, s.life.Opponent],
      ['gy', 16]
    );
    s = start(38);
    const bk = take(s, 'Player', 'knight', 'board', 'Player|back|0');
    Sim.enterCombat(s);
    check(
      'a creature standing in a back-row zone can attack (current rule: attacks go down its own column)',
      Sim.canAttack(s, bk) === null
    );
    AT(s, bk.iid);
    eq('back-row attacker with an empty column hits the player', s.life.Opponent, 16);
  });

  Tests.add('combat-rules', () => {
    // ================= combat: who may attack, when =================
    let s = start(40);
    const k = take(s, 'Player', 'wolf', 'board', 'Player|front|0'),
      inHand = take(s, 'Player', 'soldier', 'hand'),
      bar = take(s, 'Player', 'barrier', 'board', 'Player|back|2'),
      o = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|3');
    rej('attack requires the attack phase', s, { type: 'Attack', iid: k.iid }, 'attack phase');
    Sim.enterCombat(s);
    rej('a non-creature permanent cannot attack', s, { type: 'Attack', iid: bar.iid }, 'Only creatures');
    rej('a creature in hand cannot attack', s, { type: 'Attack', iid: inHand.iid }, 'Only creatures');
    rej('the non-turn player\u2019s creature cannot attack', s, { type: 'Attack', iid: o.iid }, 'turn');
    AT(s, k.iid);
    rej('a creature cannot attack twice in a turn', s, { type: 'Attack', iid: k.iid }, 'Already attacked');
    const k3 = take(s, 'Player', 'knight', 'board', 'Player|front|1'),
      z = take(s, 'Player', 'zap', 'hand');
    Sim.addStatus(s, k3, { kind: 'attackCounter', expires: 'combatEnd' }); // it entered mid-combat: give it a counter so only the stack blocks it
    D(s, { type: 'PlayCard', iid: z.iid });
    D(s, { type: 'Pass', player: 'Opponent' });
    rej('no attack while the stack is not empty', s, { type: 'Attack', iid: k3.iid }, 'Stack is not empty');
    s = start(41);
    take(s, 'Player', 'wolf', 'board', 'Player|front|0');
    rej(
      'only the turn player can enter the battle phase',
      s,
      { type: 'SetAttackPhase', player: 'Opponent', on: true },
      'turn player'
    );
    D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
    check('entering the battle phase uses the action point', s.attackPhase && !Sim.apCount(s, 'Player'));
    D(s, { type: 'SetAttackPhase', player: 'Player', on: false });
    rej(
      'leaving the battle phase goes back to the main phase (Patch5): another combat needs another action point',
      s,
      { type: 'SetAttackPhase', player: 'Player', on: true },
      'No action point'
    );
    s = start(42);
    D(s, { type: 'Draw', player: 'Player' });
    rej(
      'after another action point the battle phase is unavailable',
      s,
      { type: 'SetAttackPhase', player: 'Player', on: true },
      'No action point'
    );
  });

  Tests.add('combat-response', () => {
    // ================= the defender answers an Attack (Scout, Hummingbird) =================
    let s = start(43);
    const sc = take(s, 'Player', 'scout', 'board', 'Player|front|1'),
      os = take(s, 'Opponent', 'scout', 'board', 'Opponent|front|1'),
      hb = take(s, 'Opponent', 'hummingbird', 'board', 'Opponent|front|3');
    Sim.enterCombat(s);
    D(s, { type: 'Attack', iid: sc.iid });
    eq(
      'attack declared: the Attack and Hummingbird\u2019s trigger are TWO separate stack objects, damage is deferred',
      [owners(s), s.stack.map(o => o.kind), s.life.Opponent, s.priority],
      [['Player', 'Opponent'], ['attack', 'ability'], 20, 'Opponent']
    );
    D(s, { type: 'Activate', iid: os.iid, ab: 0 });
    pass2(s);
    check(
      'in response the Opponent\u2019s Scout kills the attacker (HP 1) before damage',
      sc.loc === 'gy' && os.loc === 'gy' && s.stack.length === 2 && s.stack[0].kind === 'attack'
    );
    pass2(s);
    check('trigger resolved: shift choice for the Opponent', !!s.choice && s.choice.player === 'Opponent');
    D(s, { type: 'Choose', player: 'Opponent', option: 'stay' });
    drain(s);
    eq(
      'an attacker that left the field deals NO damage (the Attack resolves, nothing hit)',
      [s.life.Opponent, s.life.Player, ndmg(hb), s.stack.length],
      [20, 20, 0, 0]
    );
  });

  Tests.add('combat-phase', () => {
    // ================= combat is a phase; Avatar dying to its own trigger; King Eye loses its clouds =================
    {
      let s = start(160);
      const a = take(s, 'Player', 'wolf', 'board', 'Player|front|0'),
        b = take(s, 'Player', 'knight', 'board', 'Player|front|1');
      D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
      AT(s, a.iid);
      const r = AT(s, b.iid);
      eq(
        'combat is a phase: several creatures attack one at a time in the same turn (wolf 3 + knight 4)',
        [r.ok, s.life.Opponent, Sim.attackedIds(s), s.attackPhase],
        [true, 13, [a.iid, b.iid], true]
      );
      rej('...but each creature attacks only once per phase', s, { type: 'Attack', iid: a.iid }, 'Already attacked');
      s = start(161);
      const av = take(s, 'Opponent', 'avatar', 'board', 'Opponent|front|1'),
        g = take(s, 'Player', 'giant', 'board', 'Player|front|1');
      dmg(s, av, 5, 'combat');
      Sim.enterCombat(s);
      D(s, { type: 'Attack', iid: g.iid });
      pass2(s);
      D(s, { type: 'Choose', player: 'Opponent', option: 'stay' });
      pass2(s);
      check(
        'Avatar destroyed by the damage that triggers it: its trigger is already on the stack',
        av.loc === 'gy' && s.stack.length === 1 && s.life.Opponent === 16
      );
      pass2(s);
      eq(
        'current rule: the trigger still resolves after Avatar died (1 effect damage from Avatar to the other creature)',
        dl(g),
        [[1, 'effect', av.iid]]
      );
    }
    {
      const q = start(170),
        ke = take(q, 'Opponent', 'kingeye', 'board', 'Opponent|front|1'),
        hid = take(q, 'Opponent', 'soldier', 'board', 'Opponent|front|0'),
        av = take(q, 'Player', 'avatar', 'board', 'Player|front|1');
      Sim.enterCombat(q);
      check('King Eye cloud covers the soldier before the attack', !!Sim.cloudMap(q)['Opponent|front|0']);
      D(q, { type: 'Attack', iid: av.iid });
      pass2(q);
      D(q, { type: 'Choose', player: 'Player', option: 'stay' });
      drain(q);
      check(
        'Avatar damages King Eye: it gains Avatar\u2019s abilities and its clouds disappear',
        Sim.abDef(ke).id === 'avatar' && !Object.keys(Sim.cloudMap(q)).length
      );
    }
  });

  Tests.add('attack-object', () => {
    // ================= Attack objects: no HP, no snapshot, bonus damage (Rage / addAttackDamage) =================
    {
      let s = start(220);
      const wf = take(s, 'Player', 'wolf', 'board', 'Player|front|1');
      Sim.enterCombat(s);
      D(s, { type: 'Attack', iid: wf.iid });
      check(
        'an Attack has no HP and keeps no snapshot of the attacker\u2019s power',
        s.stack[0].kind === 'attack' && s.stack[0].hp === null && s.stack[0].atk === undefined
      );
      Sim.addStatus(s, s.stack[0], { kind: 'bonus', amount: 5, srcName: 'test' }); // damage added to the Attack is a status on it (Q33)
      wf.loc = 'gy';
      s.slots['Player|front|1'] = null;
      wf.slot = null;
      pass2(s);
      eq(
        'damage added to the Attack still lands after the attacker left (5), the attacker\u2019s own power (3) does not',
        [s.life.Opponent, s.stack.length],
        [15, 0]
      );
      s = start(221);
      const w2 = take(s, 'Player', 'wolf', 'board', 'Player|front|1'),
        bo = take(s, 'Opponent', 'bolt', 'hand');
      Sim.enterCombat(s);
      D(s, { type: 'Attack', iid: w2.iid });
      D(s, { type: 'PlayCard', iid: bo.iid });
      pass2(s);
      eq(
        'Bolt cannot hurt an Attack: damage against it does nothing, the Attack is still there with no HP',
        [s.stack.length, s.stack[0].kind, s.stack[0].hp],
        [1, 'attack', null]
      );
      pass2(s);
      eq('...and then it resolves normally (3 damage)', s.life.Opponent, 17);
      s = start(222);
      const w3 = take(s, 'Player', 'wolf', 'board', 'Player|front|1'),
        w4 = take(s, 'Player', 'knight', 'board', 'Player|front|2');
      Sim.enterCombat(s);
      D(s, { type: 'Attack', iid: w3.iid });
      rej(
        'a normal attack cannot be declared while the stack is not empty (a second attacker must wait)',
        s,
        { type: 'Attack', iid: w4.iid },
        'Stack is not empty'
      );
    }
    {
      let s = start(320);
      const wf = take(s, 'Player', 'wolf', 'board', 'Player|front|1'),
        rg = take(s, 'Player', 'rage', 'hand');
      Sim.enterCombat(s);
      rej('Rage needs an Attack on the stack', s, { type: 'PlayCard', iid: rg.iid }, 'Attack must be on the stack');
      D(s, { type: 'Attack', iid: wf.iid });
      s.priority = 'Player';
      D(s, { type: 'PlayCard', iid: rg.iid });
      pass2(s);
      eq(
        'Rage resolves above the Attack: its bonus becomes 4 and the Attack is still there',
        [s.stack.map(o => o.kind), Sim.bonusOf(s.stack[0])],
        [['attack'], 4]
      );
      pass2(s);
      eq('the Attack then deals the attacker\u2019s power 3 + bonus 4 = 7', s.life.Opponent, 13);
      s = start(322);
      const w3 = take(s, 'Player', 'wolf', 'board', 'Player|front|1'),
        z = take(s, 'Opponent', 'rage', 'hand');
      Sim.enterCombat(s);
      D(s, { type: 'Attack', iid: w3.iid });
      D(s, { type: 'PlayCard', iid: z.iid });
      pass2(s);
      eq('the defender may also boost the Attack (effect has whose:any): bonus 4', Sim.bonusOf(s.stack[0]), 4);
      s = start(323);
      const w4 = take(s, 'Player', 'wolf', 'board', 'Player|front|1'),
        k4 = take(s, 'Player', 'knight', 'board', 'Player|front|2'),
        g4 = take(s, 'Opponent', 'guard', 'board', 'Opponent|front|1'),
        rr = take(s, 'Player', 'rage', 'hand');
      Sim.enterCombat(s);
      D(s, { type: 'Attack', iid: w4.iid });
      s.priority = 'Player';
      D(s, { type: 'PlayCard', iid: rr.iid });
      pass2(s);
      w4.loc = 'gy';
      s.slots['Player|front|1'] = null;
      w4.slot = null;
      pass2(s);
      eq(
        'the bonus still lands after the attacker left the board; the attacker\u2019s own power does not (guard HP 6 absorbs 4)',
        [g4.loc, Sim.totalDamage(g4), s.life.Opponent],
        ['board', 4, 20]
      );
    }
  });

  Tests.add('combat-sword', () => {
    // ================= the sword rule: who may attack right now =================
    const s = start(405),
      wf = take(s, 'Player', 'wolf', 'board', 'Player|front|1'),
      ow = take(s, 'Opponent', 'wolf', 'board', 'Opponent|front|1');
    check('sword rule: no creature can attack outside the combat phase', Sim.canAttack(s, wf) !== null);
    Sim.enterCombat(s);
    check(
      'sword rule: in the combat phase the turn player\u2019s creature can attack, the other player\u2019s cannot',
      Sim.canAttack(s, wf) === null && Sim.canAttack(s, ow) !== null
    );
    D(s, { type: 'Attack', iid: wf.iid });
    check(
      'sword rule: once it attacked (and while the stack is not empty) the sword is gone',
      Sim.canAttack(s, wf) !== null
    );
  });
})();

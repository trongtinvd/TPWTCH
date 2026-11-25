// 06-keywords-cards.js - Flash, Retaliate, shields, Spirit of the Sand, Shieldguard, War Drum, Deep Sea Shark, Quick Intuition,
// Ambush of the Night, enter triggers on death (War Drum vs War Drum), King Eye + Creeping Parasite, Repeat / continuations.
// Run only these: node tests/run.js --only flash,war-drum,shark,intuition,ambush,parasite,continuations
(function () {
  const { D, check, eq, rej, start, take, pass2, AT, drain, endTurnFlow, dmg, ndmg, shield, ap, kinds, owners } =
    Tests.ctx;

  Tests.add('flash-retaliate-shields', () => {
    // ================= Flash, Retaliate, shields, Spirit of the Sand, Shieldguard =================
    {
      const s = start(180),
        p = take(s, 'Opponent', 'parasite', 'hand');
      s.priority = 'Opponent';
      Sim.gainAP(s, 'Opponent', []);
      check('Flash: the non-turn player can play a Flash creature while holding priority', Sim.canPlay(s, p) === null);
      D(s, { type: 'PlayCard', iid: p.iid, slot: 'Opponent|front|0' });
      check('Flash creature entered without spending an action point', p.loc === 'board' && ap(s, 'Opponent') === 1);
    }
    {
      const s = start(181),
        sg = take(s, 'Opponent', 'shieldguard', 'board', 'Opponent|front|1'),
        w = take(s, 'Player', 'wolf', 'board', 'Player|front|1');
      Sim.enterCombat(s);
      AT(s, w.iid);
      eq(
        'Retaliate: Shieldguard takes 3 and hits the attacker back for 5 (wolf HP 3 dies)',
        [ndmg(sg), w.loc],
        [1, 'gy']
      );
    }
    {
      const s = start(182),
        v = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'),
        sb = take(s, 'Player', 'superbolt', 'hand'),
        g = take(s, 'Player', 'giant', 'board', 'Player|front|1');
      shield(s, v, 'red');
      check('Red shield: its zone is not a legal target', !Sim.targetZones(s, sb).includes('Opponent|front|1'));
      Sim.live(v).forEach(x => Sim.removeStatus(s, x, 'test'));
      shield(s, v, 'blue');
      Sim.enterCombat(s);
      AT(s, g.iid);
      eq('Blue shield: attacks still hit it (soldier dies, 3 tramples)', [v.loc, s.life.Opponent], ['gy', 17]);
    }
    {
      const s = start(183),
        a = take(s, 'Player', 'soldier', 'board', 'Player|front|0'),
        sp = take(s, 'Player', 'spirit', 'hand');
      D(s, { type: 'PlayCard', iid: sp.iid });
      pass2(s);
      check('Spirit of the Sand asks red or blue', !!s.choice && s.choice.kind === 'mode');
      D(s, { type: 'Choose', player: 'Player', option: '1' });
      eq(
        'Spirit (blue): counter on each own board card; life gain is disabled',
        [kinds(a, 'shield').map(x => x.color), !Sim.allowed(s.players.Player, 'gainLife')],
        [['blue'], true]
      );
    }
    {
      const s = start(184),
        sg = take(s, 'Opponent', 'shieldguard', 'hand'),
        ally = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'),
        w = take(s, 'Player', 'wolf', 'board', 'Player|front|1');
      Sim.enterCombat(s);
      D(s, { type: 'Attack', iid: w.iid });
      check(
        'Shieldguard: the Attack is on the stack, the defender has priority first, damage waits',
        s.stack.length === 1 && s.stack[0].kind === 'attack' && s.priority === 'Opponent' && s.life.Opponent === 20
      );
      D(s, { type: 'Activate', iid: sg.iid, ab: 0 });
      pass2(s);
      eq(
        'Shieldguard swap: soldier returns to hand, Shieldguard takes its zone',
        [ally.loc, sg.slot],
        ['hand', 'Opponent|front|1']
      );
    }
  });

  Tests.add('war-drum', () => {
    // ================= War Drum =================
    let s = start(200);
    const so = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'),
      far = take(s, 'Opponent', 'wolf', 'board', 'Opponent|front|3'),
      kn = take(s, 'Player', 'knight', 'board', 'Player|front|2'),
      wd = take(s, 'Player', 'wardrum', 'hand');
    dmg(s, so, 3);
    dmg(s, far, 3);
    D(s, { type: 'PlayCard', iid: wd.iid, slot: 'Player|back|1' });
    drain(s);
    eq(
      'Drummer: its controller picks the front zone (every free front zone is offered)',
      [s.choice && s.choice.kind, s.choice && s.choice.options],
      ['place', ['Player|front|0', 'Player|front|1', 'Player|front|3', 'Player|front|4']]
    );
    D(s, { type: 'Choose', player: 'Player', option: 'Player|front|1' });
    drain(s);
    eq(
      'War Drum -1/-1: a 3/3 holding 3 damage in its column dies (HP 2), one two columns away lives',
      [so.loc, far.loc],
      ['gy', 'board']
    );
    const dr = Object.values(s.cards).find(x => x.def.id === 'drummer-token' && x.loc === 'board');
    check(
      'Drummer token (3/3) is created on the Drum\u2019s column; own cards in range get +1/+1 (knight 4/5 -> 5/6)',
      !!dr && dr.slot === 'Player|front|1' && Sim.atkOf(kn) === 5 && Sim.hpOf(kn) === 6 && Sim.atkOf(dr) === 4
    );
    eq(
      'Drum is listed before Drummer on a card affected by both (older source first)',
      kinds(kn, 'mod').map(m => m.srcName),
      ['Drummer']
    );
    s.slots['Opponent|front|1'] = null;
    so.loc = 'gy';
    kn.slot = 'Player|front|4';
    s.slots['Player|front|2'] = null;
    s.slots['Player|front|4'] = kn.iid;
    D(s, { type: 'Draw', player: 'Player' });
    eq('moving out of the Drummer\u2019s columns removes the bonus', [Sim.atkOf(kn), Sim.hpOf(kn)], [4, 5]);
    s = start(201);
    const g = take(s, 'Player', 'knight', 'gy'),
      w2 = take(s, 'Player', 'wardrum', 'hand');
    const l0 = s.life.Opponent;
    D(s, { type: 'PlayCard', iid: w2.iid, slot: 'Player|back|1', extra: true });
    drain(s);
    D(s, { type: 'Choose', player: 'Player', option: 'Player|front|1' });
    drain(s);
    check('War Drum paid: action point spent, creature picker is open', !ap(s) && s.choice && s.choice.kind === 'pick');
    D(s, { type: 'Choose', player: 'Player', option: g.iid });
    D(s, { type: 'Choose', player: 'Player', option: 'Player|front|0' });
    drain(s);
    eq(
      'the returned Knight attacks at once outside combat (4 +1 Drummer = 5 to the face)',
      [g.loc, s.attackPhase, s.life.Opponent],
      ['board', false, l0 - 5]
    );
    s = start(202);
    const w3 = take(s, 'Player', 'wardrum', 'hand');
    D(s, { type: 'Draw', player: 'Player' });
    rej(
      'additional cost cannot be paid once the action point is used',
      s,
      { type: 'PlayCard', iid: w3.iid, slot: 'Player|back|1', extra: true },
      'additional cost'
    );
  });

  Tests.add('shark', () => {
    // ================= Deep Sea Shark =================
    {
      let s = start(203);
      const sh = take(s, 'Player', 'shark', 'hand');
      D(s, { type: 'PlayCard', iid: sh.iid, slot: 'Player|front|0' });
      drain(s);
      D(s, { type: 'Choose', player: 'Player', option: '0' });
      drain(s);
      eq(
        'Shark: 3 life paid, opponent flagged to skip combat',
        [s.life.Player, Sim.hasSt(s.players.Opponent, 'skipCombat')],
        [17, true]
      );
      endTurnFlow(s);
      D(s, { type: 'SetAttackPhase', player: 'Opponent', on: true });
      eq(
        'opponent presses combat: it becomes End turn, flag consumed, action point untouched',
        [
          s.attackPhase,
          s.respond && s.respond.kind,
          ap(s, 'Opponent') === 0,
          Sim.hasSt(s.players.Opponent, 'skipCombat'),
        ],
        [false, 'end', false, false]
      );
      s = start(204);
      take(s, 'Player', 'shark', 'board', 'Player|front|0');
      const wf = take(s, 'Player', 'wolf', 'board', 'Player|front|1'),
        oh = s.piles.Opponent.hand.length;
      D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
      AT(s, wf.iid);
      D(s, { type: 'SetAttackPhase', player: 'Player', on: false });
      pass2(s);
      D(s, { type: 'Choose', player: 'Player', option: '0' });
      check(
        'Shark second combat: opponent drew 5 (cost), attack phase is on again, attacked list reset',
        s.piles.Opponent.hand.length === oh + 5 && s.attackPhase && !Sim.attackedIds(s).length
      );
      AT(s, wf.iid);
      eq('the Wolf attacks a second time (3 + 3)', s.life.Opponent, 14);
    }
    {
      let s = start(208);
      take(s, 'Player', 'shark', 'board', 'Player|front|0');
      const wf = take(s, 'Player', 'wolf', 'board', 'Player|front|1'),
        oh = s.piles.Opponent.hand.length;
      D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
      AT(s, wf.iid);
      const r = D(s, { type: 'EndTurn', player: 'Player' });
      eq(
        'Shark: End turn during combat first ends the combat phase, so its trigger goes on the stack (turn not over yet)',
        [r.ok, s.attackPhase, s.stack.length, s.respond],
        [true, false, 1, null]
      );
      pass2(s);
      D(s, { type: 'Choose', player: 'Player', option: '0' });
      check(
        '...and the second combat starts (opponent drew 5, attack phase on)',
        s.piles.Opponent.hand.length === oh + 5 && s.attackPhase
      );
      s = start(209);
      const sk = take(s, 'Player', 'shark', 'hand');
      D(s, { type: 'PlayCard', iid: sk.iid, slot: 'Player|front|0' });
      drain(s);
      D(s, { type: 'Choose', player: 'Player', option: '0' });
      drain(s);
      check(
        'Shark skip shows as a status on the player while waiting, not on the other player',
        Sim.statusLines(s.players.Opponent).some(x => /skip/i.test(x.text) && !x.removed) &&
          !Sim.statusLines(s.players.Player).some(x => /skip/i.test(x.text))
      );
      endTurnFlow(s);
      D(s, { type: 'SetAttackPhase', player: 'Opponent', on: true });
      eq(
        'once the skip is used the status is gone',
        Sim.statusLines(s.players.Opponent).filter(x => /skip/i.test(x.text) && !x.removed),
        []
      );
    }
  });

  Tests.add('intuition', () => {
    // ================= Quick Intuition =================
    let s = start(205);
    const qi = take(s, 'Player', 'intuition', 'hand');
    D(s, { type: 'PlayCard', iid: qi.iid });
    pass2(s);
    eq('Quick Intuition draws until 7 cards in hand', s.piles.Player.hand.length, 7);
    s = start(206);
    const so = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'),
      gi = take(s, 'Player', 'giant', 'board', 'Player|front|1'),
      q2 = take(s, 'Player', 'intuition', 'hand');
    D(s, { type: 'PlayCard', iid: q2.iid, zone: 'Opponent|front|1' });
    pass2(s);
    Sim.enterCombat(s);
    AT(s, gi.iid);
    eq(
      'damage to the protected creature is denied (it still absorbs its HP: 6 - 3 tramples)',
      [so.loc, ndmg(so), s.life.Opponent],
      ['board', 0, 17]
    );
    s = start(207);
    const q3 = take(s, 'Opponent', 'intuition', 'gy'),
      wf = take(s, 'Player', 'wolf', 'board', 'Player|front|1');
    Sim.enterCombat(s);
    D(s, { type: 'Attack', iid: wf.iid });
    check(
      'the defender gets priority on the Attack and can answer it with Cancel Attack from the GY',
      s.stack.length === 1 && s.priority === 'Opponent'
    );
    D(s, { type: 'Activate', iid: q3.iid, ab: 0 });
    drain(s);
    eq(
      'cancelled attack: no damage, Quick Intuition exiled by its cost',
      [s.life.Opponent, q3.loc, s.stack.length],
      [20, 'exile', 0]
    );
  });

  Tests.add('ambush', () => {
    // ================= Ambush of the Night =================
    const s = start(208),
      am = take(s, 'Player', 'ambush', 'hand'),
      kg = take(s, 'Player', 'knight', 'gy');
    take(s, 'Player', 'soldier', 'hand');
    const oh = s.piles.Opponent.hand.length;
    D(s, { type: 'PlayCard', iid: am.iid });
    pass2(s);
    eq(
      'Ambush: step 2 asks which GY card to return (the only card + Done)',
      [s.choice.kind, s.choice.options],
      ['upto', [kg.iid, 'done']]
    );
    D(s, { type: 'Choose', player: 'Player', option: kg.iid });
    check(
      'returned Knight is in hand; step 3 (put into play) is now asked, the later steps are still pending',
      kg.loc === 'hand' && s.choice.e.then === 'play' && s.choice.cont.length > 0
    );
    let n = 0;
    while (s.choice && n++ < 5) D(s, { type: 'Choose', player: s.choice.player, option: 'done' });
    eq(
      'Ambush finishes in one resolution: opponent drew 2, action point spent, spell in GY',
      [s.piles.Opponent.hand.length, !ap(s), am.loc],
      [oh + 2, true, 'gy']
    );
  });

  Tests.add('parasite-click', () => {
    // ================= a target choice mixing cards and life bars: its board cards are still clicked (never a list) =================
    const s = start(702),
      w = take(s, 'Player', 'wolf', 'board', 'Player|front|2'),
      pa = take(s, 'Opponent', 'parasite', 'hand');
    s.priority = 'Opponent';
    D(s, { type: 'PlayCard', iid: pa.iid, slot: 'Opponent|front|0' });
    drain(s);
    D(s, { type: 'Choose', player: 'Opponent', option: '1' });
    const k = Sim.choicePicks(s, 'Opponent');
    eq(
      'Creeping Parasite, 4 damage to any target: not a pure card choice (life bars), yet each board card is clickable',
      [s.choice.options.includes('P:Player'), k.click, k.clickable.includes(w.iid), k.clickable.includes(pa.iid)],
      [true, false, true, true]
    );
  });
  Tests.add('parasite', () => {
    // ================= enter triggers on death (War Drum vs War Drum), King Eye + Creeping Parasite =================
    {
      const s = start(700),
        w1 = take(s, 'Player', 'wardrum', 'hand'),
        w2 = take(s, 'Opponent', 'wardrum', 'hand');
      D(s, { type: 'PlayCard', iid: w1.iid, slot: 'Player|back|1' });
      D(s, { type: 'PlayCard', iid: w2.iid, slot: 'Opponent|back|1' });
      eq(
        'War Drum answered by War Drum: both die on entering (-1/-1 each) but BOTH enter triggers are on the stack',
        [w1.loc, w2.loc, s.stack.length, owners(s)],
        ['gy', 'gy', 2, ['Player', 'Opponent']]
      );
      pass2(s);
      D(s, { type: 'Choose', player: 'Opponent', option: 'Opponent|front|0' });
      pass2(s);
      D(s, { type: 'Choose', player: 'Player', option: 'Player|front|0' });
      eq(
        '...and both resolve: each dead Drum still creates its Drummer',
        Object.values(s.cards)
          .filter(x => x.def.id === 'drummer-token' && x.loc === 'board')
          .map(x => x.owner),
        ['Opponent', 'Player']
      );
    }
    {
      const setup = () => {
        const s = start(701),
          ke = take(s, 'Player', 'kingeye', 'board', 'Player|front|1'),
          so = take(s, 'Player', 'soldier', 'board', 'Player|front|0');
        take(s, 'Player', 'wolf', 'board', 'Player|front|2');
        const pa = take(s, 'Opponent', 'parasite', 'hand');
        s.priority = 'Opponent';
        D(s, { type: 'PlayCard', iid: pa.iid, slot: 'Opponent|front|0' });
        drain(s);
        return { s, ke, so };
      };
      let { s, ke, so } = setup();
      eq(
        'King Eye: Creeping Parasite sees ONE creature (King Eye), so only modes 0 and 1 are unlocked',
        [s.choice.kind, s.choice.options],
        ['mode', ['0', '1']]
      );
      D(s, { type: 'Choose', player: 'Opponent', option: '1' });
      const o = s.choice.options;
      check(
        'a cloud zone is a legal pick (empty or not); the cards under clouds are never offered themselves; King Eye and players are',
        o.includes('Z:Player|front|0') &&
          o.includes('Z:Player|front|2') &&
          o.includes('Z:Player|back|4') &&
          !o.includes(so.iid) &&
          o.includes(ke.iid) &&
          o.includes('P:Player'),
        o.join()
      );
      D(s, { type: 'Choose', player: 'Opponent', option: 'Z:Player|back|4' });
      eq(
        'picking a cloud with nothing underneath is accepted and fizzles: nothing happens, nothing is revealed',
        [s.choice, so.loc, ndmg(so)],
        [null, 'board', 0]
      );
      ({ s, ke, so } = setup());
      D(s, { type: 'Choose', player: 'Opponent', option: '1' });
      D(s, { type: 'Choose', player: 'Opponent', option: 'Z:Player|front|0' });
      eq(
        'picking a cloud with a card underneath hits that card (4 damage kills the Soldier)',
        [s.choice, so.loc],
        [null, 'gy']
      );
    }
  });

  Tests.add('continuations', () => {
    // ================= Repeat / continuation frames, unknown trigger conditions =================
    {
      const rep1 = Fx.creature('t-repeat', 'Repeater', 1, 1, {
          triggers: [Fx.trigger.enter(Fx.repeat(2, Fx.shiftAdjacent()))],
        }),
        s = start(702, [rep1]),
        r = take(s, 'Player', 't-repeat', 'hand');
      D(s, { type: 'PlayCard', iid: r.iid, slot: 'Player|front|2' });
      drain(s);
      const first = !!s.choice;
      D(s, { type: 'Choose', player: 'Player', option: 'stay' });
      const second = !!s.choice;
      D(s, { type: 'Choose', player: 'Player', option: 'stay' });
      eq(
        'Repeat: a choice inside it is answered before the next repetition (two choices, none overwritten)',
        [first, second, s.choice],
        [true, true, null]
      );
      const zc = Fx.creature('t-zone', 'Zoner', 1, 1, {
          tokens: { t: Fx.creature('t-tok', 'Tok', 1, 1, {}) },
          triggers: [Fx.trigger.enter(Fx.nearestZone(['self']), Fx.shiftAdjacent(), Fx.createToken('t'))],
        }),
        q = start(703, [zc]),
        z = take(q, 'Player', 't-zone', 'hand');
      D(q, { type: 'PlayCard', iid: z.iid, slot: 'Player|front|2' });
      drain(q);
      D(q, { type: 'Choose', player: 'Player', option: 'stay' });
      drain(q);
      eq(
        'continuation frames keep the picked zone: NearestZone, a choice, then CreateToken still has its zone',
        Object.values(q.cards).filter(x => x.def.id === 't-tok' && x.loc === 'board').length,
        1
      );
    }
    {
      const bc = Fx.creature('t-badcond', 'BadCond', 1, 1, {
          triggers: [Object.assign(Fx.trigger.enter(Fx.draw(1)), { cond: 'nope' })],
        }),
        s = start(704, [bc]),
        c = take(s, 'Player', 't-badcond', 'hand');
      let ok = false,
        thrown = null;
      try {
        ok = D(s, { type: 'PlayCard', iid: c.iid, slot: 'Player|front|0' }).ok;
      } catch (e) {
        thrown = String(e);
      }
      eq(
        'an unknown trigger condition never crashes the Sim (fails closed: the trigger does not fire)',
        [thrown, ok, s.stack.length],
        [null, true, 0]
      );
      check(
        'Sim.API lists the trigger conditions (the validator checks them)',
        ['extraPaid', 'firstCombat', 'ownInAttackCol'].every(n => Sim.API.conds.includes(n))
      );
    }
  });
  Tests.add('counted-values', () => {
    // ================= Fx.count: a number counted when the effect resolves (Parasite 4+: a card for each creature the opponent controls) =================
    const s = start(702);
    ['soldier', 'wolf', 'hummingbird', 'blackhawk'].forEach((id, k) =>
      take(s, 'Player', id, 'board', 'Player|front|' + k)
    );
    const pa = take(s, 'Opponent', 'parasite', 'hand'),
      h0 = s.piles.Opponent.hand.length - 1;
    s.priority = 'Opponent';
    D(s, { type: 'PlayCard', iid: pa.iid, slot: 'Opponent|front|0' });
    drain(s);
    eq('four opposing creatures: modes 0-4 are unlocked', s.choice.options, ['0', '1', '2', '3', '4']);
    D(s, { type: 'Choose', player: 'Opponent', option: '4' });
    drain(s);
    eq('4+: draws one card for each of the 4 creatures', s.piles.Opponent.hand.length, h0 + 4);
    check(
      'the card data names the value, not a card-specific op',
      JSON.stringify(DEFS.find(d => d.id === 'parasite')).includes('"value":"foeCreatures"') &&
        !Sim.API.effects.includes('DrawPerFoeCreature')
    );
    eq('a counted value is a number at resolution', Sim.API.values, ['foeCreatures']);
  });
})();

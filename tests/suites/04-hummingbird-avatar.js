// 04-hummingbird-avatar.js - Red Hummingbird (shift trigger, GY ability, trigger order), Avatar of Rabies (ability layer), Throwing Bandages.
// Run only these: node tests/run.js --only hummingbird,avatar
(function () {
  const { D, check, eq, rej, start, take, pass2, drain, dmg, ndmg, dl, setLife, owners } = Tests.ctx;

  Tests.add('hummingbird', () => {
    // ================= Red Hummingbird =================
    {
      let s = start(50);
      const hb = take(s, 'Opponent', 'hummingbird', 'board', 'Opponent|front|1'),
        g = take(s, 'Player', 'giant', 'board', 'Player|front|1');
      s.attackPhase = true;
      D(s, { type: 'Attack', iid: g.iid });
      check(
        'attack damage waits: the Attack stays on the stack under the trigger (nothing damaged yet)',
        s.stack.length === 2 && s.life.Opponent === 20 && !ndmg(hb)
      );
      pass2(s);
      eq(
        'shift choice: stay + both adjacent empty zones, offered to the Hummingbird\u2019s controller',
        [s.choice.player, s.choice.options],
        ['Opponent', ['stay', 'Opponent|front|0', 'Opponent|front|2']]
      );
      rej(
        'while a choice is pending other commands are rejected',
        s,
        { type: 'Draw', player: 'Player' },
        'Waiting for Opponent'
      );
      rej(
        'only the choosing player may choose',
        s,
        { type: 'Choose', player: 'Player', option: 'stay' },
        'Not your choice'
      );
      rej(
        'an option outside the list is rejected',
        s,
        { type: 'Choose', player: 'Opponent', option: 'Opponent|front|4' },
        'Illegal option'
      );
      D(s, { type: 'Choose', player: 'Opponent', option: 'Opponent|front|0' });
      drain(s);
      eq(
        'shifted Hummingbird dodges: it moved, is undamaged, the giant hits the now-empty column 1 for 6',
        [hb.slot, hb.loc, ndmg(hb), s.life.Opponent, s.slots['Opponent|front|1'], s.stack.length],
        ['Opponent|front|0', 'board', 0, 14, null, 0]
      );
      s = start(51);
      const h2 = take(s, 'Opponent', 'hummingbird', 'board', 'Opponent|front|1'),
        g2 = take(s, 'Player', 'giant', 'board', 'Player|front|1');
      s.attackPhase = true;
      D(s, { type: 'Attack', iid: g2.iid });
      pass2(s);
      D(s, { type: 'Choose', player: 'Opponent', option: 'stay' });
      drain(s);
      eq(
        'choosing "stay": Hummingbird (HP 1) takes the hit and dies, 6-1=5 tramples',
        [h2.loc, s.life.Opponent],
        ['gy', 15]
      );
      s = start(52);
      const h3 = take(s, 'Opponent', 'hummingbird', 'board', 'Opponent|front|0'),
        g3 = take(s, 'Player', 'giant', 'board', 'Player|front|0');
      s.unusable['Opponent|front|1'] = true;
      s.attackPhase = true;
      D(s, { type: 'Attack', iid: g3.iid });
      pass2(s);
      drain(s);
      eq(
        'no legal adjacent zone (edge column + unusable neighbour): no choice is asked and the attack proceeds',
        [s.choice, h3.loc, s.life.Opponent, s.stack.length],
        [null, 'gy', 15, 0]
      );
      s = start(53);
      const h4 = take(s, 'Opponent', 'hummingbird', 'board', 'Opponent|front|0'),
        g4 = take(s, 'Player', 'giant', 'board', 'Player|front|0');
      take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1');
      s.attackPhase = true;
      D(s, { type: 'Attack', iid: g4.iid });
      pass2(s);
      eq('an occupied neighbour is not offered either: no choice with both sides blocked', s.choice, null);
      s = start(54);
      const h5 = take(s, 'Player', 'hummingbird', 'hand'),
        top = s.piles.Player.deck[0],
        d0 = s.piles.Player.deck.length;
      D(s, { type: 'PlayCard', iid: h5.iid, slot: 'Player|front|2' });
      eq('enter trigger goes on the stack (not resolved yet)', [s.stack.length, owners(s)], [1, ['Player']]);
      drain(s);
      check(
        'enter trigger draws exactly the top card of the deck',
        top.loc === 'hand' && s.piles.Player.deck.length === d0 - 1 && s.piles.Player.hand.includes(top)
      );
      s = start(55);
      take(s, 'Player', 'hummingbird', 'board', 'Player|front|0');
      take(s, 'Opponent', 'hummingbird', 'board', 'Opponent|front|0');
      const nw = take(s, 'Player', 'soldier', 'hand');
      D(s, { type: 'PlayCard', iid: nw.iid, slot: 'Player|front|1' });
      eq('enter triggers fire only for the card that entered (other Hummingbirds stay silent)', s.stack.length, 0);
      s = start(56);
      const gy = take(s, 'Player', 'hummingbird', 'gy');
      rej('GY ability needs missing life (life is full)', s, { type: 'Activate', iid: gy.iid, ab: 0 }, 'already full');
      setLife(s, 'Player', 10);
      D(s, { type: 'Activate', iid: gy.iid, ab: 0 });
      check(
        'GY ability: the exile cost is paid on activation, effect still pending',
        gy.loc === 'exile' && s.stack.length === 1 && s.life.Player === 10
      );
      pass2(s);
      eq(
        'GY ability resolves: +3 life, Hummingbird stays exiled',
        [s.life.Player, gy.loc, s.piles.Player.exile.includes(gy)],
        [13, 'exile', true]
      );
      s = start(57);
      const hb2 = take(s, 'Player', 'hummingbird', 'board', 'Player|front|0');
      setLife(s, 'Player', 10);
      rej('GY ability cannot be used from the board', s, { type: 'Activate', iid: hb2.iid, ab: 0 }, 'graveyard');
    }
    {
      let s = start(60);
      take(s, 'Player', 'hummingbird', 'board', 'Player|front|0');
      const c = take(s, 'Player', 'soldier', 'board', 'Player|front|2');
      take(s, 'Opponent', 'hummingbird', 'board', 'Opponent|front|4');
      s.attackPhase = true;
      D(s, { type: 'Attack', iid: c.iid });
      eq(
        'trigger eligibility: own non-attacking Hummingbird does not trigger, the foe\u2019s does (Attack at the bottom)',
        [owners(s), s.priority],
        [['Player', 'Opponent'], 'Opponent']
      );
      s = start(61);
      const a = take(s, 'Player', 'hummingbird', 'board', 'Player|front|0');
      take(s, 'Opponent', 'hummingbird', 'board', 'Opponent|front|3');
      s.attackPhase = true;
      D(s, { type: 'Attack', iid: a.iid });
      eq(
        'simultaneous triggers (Player turn): the Attack is at the bottom, then Player\u2019s trigger, Opponent\u2019s on top, Opponent gets priority',
        [owners(s), s.priority],
        [['Player', 'Player', 'Opponent'], 'Opponent']
      );
      pass2(s);
      eq(
        'the Opponent\u2019s trigger (top) resolves first',
        [s.choice && s.choice.player, s.stack.length],
        ['Opponent', 2]
      );
      s = start(62);
      s.active = 'Opponent';
      s.priority = 'Opponent';
      take(s, 'Player', 'hummingbird', 'board', 'Player|front|0');
      const b = take(s, 'Opponent', 'hummingbird', 'board', 'Opponent|front|3');
      s.attackPhase = true;
      D(s, { type: 'Attack', iid: b.iid });
      eq(
        'simultaneous triggers (Opponent turn): the Attack, Opponent\u2019s trigger, Player\u2019s on top, Player gets priority',
        [owners(s), s.priority],
        [['Opponent', 'Opponent', 'Player'], 'Player']
      );
    }
  });

  Tests.add('avatar-bandages', () => {
    // ================= Avatar of Rabies + Throwing Bandages (damage instances, ability layer) =================
    {
      const q = start(70),
        av = take(q, 'Opponent', 'avatar', 'board', 'Opponent|front|1'),
        g = take(q, 'Player', 'giant', 'board', 'Player|front|1');
      q.attackPhase = true;
      D(q, { type: 'Attack', iid: g.iid });
      eq(
        'Avatar: any creature attacking puts its shift trigger above the Attack; damage waits',
        [q.stack.length, Sim.totalDamage(av), q.life.Opponent],
        [2, 0, 20]
      );
      pass2(q);
      eq(
        'Avatar: shift choice for its controller (stay + 2 neighbours)',
        [q.choice.player, q.choice.options.length],
        ['Opponent', 3]
      );
      D(q, { type: 'Choose', player: 'Opponent', option: 'stay' });
      pass2(q);
      eq(
        'Avatar: the Attack resolves: giant deals 6 combat damage (HP 7): Avatar survives, no trample; its damage trigger is on the stack',
        [Sim.totalDamage(av), av.loc, q.life.Opponent, q.stack.length],
        [6, 'board', 20, 1]
      );
      pass2(q);
      eq('Avatar: its trigger deals 1 EFFECT damage (from Avatar) to the only other creature', dl(g), [
        [1, 'effect', av.iid],
      ]);
      check(
        'Avatar: the damaged creature gains Avatar\u2019s abilities; its definition and Avatar\u2019s are untouched',
        Sim.abDef(g).id === 'avatar' && g.def.id === 'giant' && Sim.abDef(av).id === 'avatar'
      );
      const bn = take(q, 'Player', 'bandages', 'hand');
      D(q, { type: 'PlayCard', iid: bn.iid, zone: 'Player|front|1' });
      pass2(q);
      check(
        'removing the damage (Bandages, 1 point total) ends the ability swap',
        Sim.totalDamage(g) === 0 && Sim.abDef(g).id === 'giant'
      );
    }
    {
      const q = start(71),
        t = take(q, 'Opponent', 'giant', 'board', 'Opponent|front|0'),
        bd = take(q, 'Player', 'bandages', 'hand');
      dmg(q, t, 7, 'combat');
      dmg(q, t, 1);
      rej(
        'Bandages: an empty zone is not a legal target',
        q,
        { type: 'PlayCard', iid: bd.iid, zone: 'Opponent|back|4' },
        'Illegal target zone'
      );
      D(q, { type: 'PlayCard', iid: bd.iid, zone: 'Opponent|front|0' });
      pass2(q);
      eq(
        'Bandages: the controller is asked which damage instance to remove',
        [q.choice.kind, q.choice.options],
        ['counter', ['1', '2']]
      );
      D(q, { type: 'Choose', player: 'Player', option: '2' });
      eq(
        'Bandages: instance 2 (1 point) is gone and 6 more points remain to remove',
        [q.choice && q.choice.left, q.choice && q.choice.options],
        [6, ['1']]
      );
      D(q, { type: 'Choose', player: 'Player', option: '1' });
      eq(
        'Bandages: 7 points removed in total; only instance 1 remains, with 1 point left',
        [
          q.choice,
          Sim.live(t)
            .filter(x => x.kind === 'damage')
            .map(d => [d.seq, d.amount]),
          t.loc,
          bd.loc,
        ],
        [null, [[1, 1]], 'board', 'gy']
      );
      const r = start(72),
        t2 = take(r, 'Opponent', 'giant', 'board', 'Opponent|front|0'),
        b2 = take(r, 'Player', 'bandages', 'hand');
      dmg(r, t2, 3, 'combat');
      dmg(r, t2, 3);
      D(r, { type: 'PlayCard', iid: b2.iid, zone: 'Opponent|front|0' });
      pass2(r);
      eq(
        'Bandages: when all damage (6) fits in 7 points everything is removed without asking',
        [r.choice, ndmg(t2)],
        [null, 0]
      );
    }
    {
      const q = start(73),
        t = take(q, 'Opponent', 'soldier', 'board', 'Opponent|front|0'),
        bd = take(q, 'Player', 'bandages', 'hand');
      D(q, { type: 'PlayCard', iid: bd.iid, zone: 'Opponent|front|0' });
      pass2(q);
      eq(
        'Bandages on an undamaged permanent: no choice, no change, spell still goes to the GY',
        [q.choice, ndmg(t), bd.loc],
        [null, 0, 'gy']
      );
    }
  });
})();

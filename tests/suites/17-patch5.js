// 17-patch5.js - Patch5: keyworded abilities are ordinary abilities (Avatar disables them), card text derived from the ability data
// (translate / overrideText / useOverrideText), every draw counts for L4, Widow Maker's targeting is a cost, triggers wait for a pending choice.
// Run only these: node tests/run.js --only keywords-are-abilities,derived-text,draw-count,widow-cost
(function () {
  const { D, check, eq, start, take, drain, pass2 } = Tests.ctx;
  const byId = id => DEFS.find(d => d.id === id);

  Tests.add('keywords-are-abilities', () => {
    const sgd = byId('shieldguard'),
      pd = byId('parasite');
    check(
      'Patch10: Retaliate is a keyworded TRIGGER of the card, Flash a keyworded passive (op Keyword); no ad-hoc def flags',
      sgd.triggers.some(t => t.kw === 'retaliate' && t.on === 'damaged') &&
        !(sgd.passives || []).some(p => p.kw === 'retaliate') &&
        pd.passives.some(p => p.op === 'Keyword' && p.kw === 'flash') &&
        sgd.retaliate === undefined &&
        pd.flash === undefined
    );
    check(
      '...and their text is derived like any ability',
      /^Retaliate \(/.test(sgd.triggers[0].text) && /Flash \(/.test(pd.text)
    );
    let s = start(1700);
    const sg = take(s, 'Opponent', 'shieldguard', 'board', 'Opponent|front|1'),
      wf = take(s, 'Player', 'wolf', 'board', 'Player|front|1');
    check('Sim.hasKw reads the effective ability set', Sim.hasKw(sg, 'retaliate') && !Sim.hasKw(wf, 'retaliate'));
    D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
    D(s, { type: 'Attack', iid: wf.iid });
    drain(s);
    check('control: a plain creature hitting Shieldguard is retaliated (5 damage, the 3/3 Wolf dies)', wf.loc === 'gy');
    s = start(1701);
    const sg2 = take(s, 'Opponent', 'shieldguard', 'board', 'Opponent|front|1'),
      av = take(s, 'Player', 'avatar', 'board', 'Player|front|1');
    D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
    D(s, { type: 'Attack', iid: av.iid });
    let n = 0;
    while ((s.stack.length || s.respond || s.choice) && n++ < 40) {
      if (s.choice)
        D(s, {
          type: 'Choose',
          player: s.choice.player,
          option: s.choice.options.includes('stay') ? 'stay' : s.choice.options[0],
        });
      else D(s, { type: 'Pass', player: s.priority });
    }
    check(
      'Avatar of Rabies takes Shieldguard’s abilities away, keywords included: it loses Retaliate (the damage and the rider are one event, so this hit is not retaliated)',
      Sim.abDef(sg2).id === 'avatar' && !Sim.hasKw(sg2, 'retaliate') && Sim.totalDamage(av) === 0
    );
    const fl = take(s, 'Player', 'parasite', 'hand');
    check('Flash is read the same way (a hand card keeps its printed abilities)', Sim.hasKw(fl, 'flash'));
  });

  Tests.add('derived-text', () => {
    const ar = byId('archer'),
      ab = ar.abilities[0];
    eq(
      'card text is translated from the ability data (Yu-Gi-Oh: Condition: cost; effect)',
      ab.text,
      'Slow. This card is in the front row: pay 1 life; deal 2 damage to your opponent. (Stack HP 1)'
    );
    check(
      'Patch10: the card data holds no written text (overrideText / useOverrideText moved to cardDescription.json)',
      DEFS.every(
        d =>
          Translate.abilityList(d).every(x => !('overrideText' in x.o) && !('useOverrideText' in x.o)) &&
          !('overrideText' in d)
      )
    );
    eq('translate(abilities[]) is the card text of an ability-only card', translate(ar), ar.text);
    const ke = byId('kingeye').passives[0];
    check('Patch10: King Eye shows its generated text by default too', ke.text.startsWith('Passive: a black cloud'));
    check(
      '...and the machine text is still there (Translate.translateOne)',
      Translate.translateOne(ke, 'passives', byId('kingeye')).startsWith('Passive: a black cloud')
    );
    check(
      'a spell is translated too: targeting before ";"',
      byId('superbolt').text === 'Slow. Target a permanent or a player; deal 20 damage to it. (Stack HP 3)'
    );
    check('Avatar’s rider names the card', /gains the abilities of Avatar of Rabies/.test(byId('avatar').text));
    const bad = DEFS.filter(d => Translate.abilityList(d).some(x => !x.o.text || /undefined|NaN/.test(x.o.text))).map(
      d => d.id
    );
    eq('every ability of every card has a readable text (no undefined / NaN)', bad, []);
  });

  Tests.add('draw-count', () => {
    let s = start(1710);
    const before = s.drawn.Player,
      hb = take(s, 'Player', 'hummingbird', 'hand');
    D(s, { type: 'PlayCard', iid: hb.iid, slot: 'Player|front|0' });
    drain(s);
    eq('L4 bug fix: a card that draws (Hummingbird) counts for "cards drawn this game"', s.drawn.Player, before + 1);
    s = start(1711);
    const qi = take(s, 'Player', 'intuition', 'hand'),
      h0 = s.piles.Player.hand.length - 1,
      d0 = s.drawn.Player;
    D(s, { type: 'PlayCard', iid: qi.iid });
    drain(s);
    eq('...Quick Intuition’s draws count', s.drawn.Player, d0 + (7 - h0));
    s = start(1712);
    take(s, 'Player', 'shark', 'board', 'Player|front|0');
    D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
    D(s, { type: 'SetAttackPhase', player: 'Player', on: false });
    const o0 = s.drawn.Opponent;
    pass2(s);
    D(s, { type: 'Choose', player: 'Player', option: '0' });
    eq('...and Deep Sea Shark’s 5 cards count for the opponent', s.drawn.Opponent, o0 + 5);
  });

  Tests.add('widow-cost', () => {
    const wd = byId('widowmaker');
    check(
      'Widow Maker: the targeting is written before ";" (part of the cost)',
      wd.triggers
        .slice(0, 2)
        .every(t => /^When this (enters|attacks): target two adjacent cards your opponent controls; /.test(t.text))
    );
    const s = start(1720),
      w = take(s, 'Player', 'widowmaker', 'board', 'Player|front|2');
    take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1');
    take(s, 'Opponent', 'wolf', 'board', 'Opponent|back|1');
    D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
    D(s, { type: 'Attack', iid: w.iid });
    const o = s.stack.find(x => x.kind === 'ability' && x.src === w.iid);
    check(
      '...the trigger is on the stack WITH its pick before anything resolves',
      !!o && !!o.pick && o.pick.includes('#')
    );
  });
})();

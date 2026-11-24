// 13-rulings-control.js - rulings 2026-11-22, group 3 and 6: owner vs controller (Q56), effects that pick an Attack ask which one (Q41),
// a resolving spell as a pick of its own effect (Q40).
// Run only these: node tests/run.js --only control,attack-pick,self-pick
(function () {
  const { D, check, eq, rej, start, take, pass2, AT, drain } = Tests.ctx;

  Tests.add('control', () => {
    // ================= Q56: the owner stays the owner, the controller is who plays / controls the card =================
    let s = start(1300);
    const w = take(s, 'Opponent', 'wolf', 'board', 'Player|front|0');
    w.controller = 'Player'; // what L4 does to a card it plays
    eq('Sim.ctl is the controller, else the owner', [Sim.ctl(w), Sim.ctl(take(s, 'Opponent', 'soldier', 'hand'))], ['Player', 'Opponent']);
    Sim.enterCombat(s);
    check('a card under my control can attack on my turn (the controller decides, not the owner)', Sim.canAttack(s, w) === null);
    check('...and shows in my actions', Sim.actionsOf(s, 'Player').some(a => a.kind === 'attack' && a.iid === w.iid));
    AT(s, w.iid);
    eq('its attack hits the controller\u2019s foe: the owner is not hurt', [s.life.Opponent, s.life.Player], [17, 20]);
    s = start(1301);
    const v = take(s, 'Opponent', 'wolf', 'board', 'Player|front|1'),
      sb = take(s, 'Player', 'superbolt', 'hand');
    v.controller = 'Player';
    D(s, { type: 'PlayCard', iid: sb.iid, zone: 'Player|front|1' });
    drain(s);
    eq('a card that leaves the board goes to its OWNER\u2019s graveyard and control ends', [v.loc, v.owner, v.controller, s.piles.Opponent.gy.includes(v), s.piles.Player.gy.includes(v)], ['gy', 'Opponent', undefined, true, false]);
    s = start(1302);
    const t = take(s, 'Opponent', 'hummingbird', 'board', 'Player|front|2');
    t.controller = 'Player';
    const g = take(s, 'Opponent', 'giant', 'board', 'Opponent|front|2');
    s.active = 'Opponent';
    s.priority = 'Opponent';
    Sim.enterCombat(s);
    D(s, { type: 'Attack', iid: g.iid });
    eq('triggers follow the controller: the foe\u2019s attack triggers a Hummingbird I control, on the stack under my name', s.stack.filter(o => o.kind === 'ability').map(o => o.controller), ['Player']);
  });

  Tests.add('attack-pick', () => {
    // ================= Q41: an effect that picks an Attack asks which one =================
    const two = () => {
      const s = start(1310),
        w1 = take(s, 'Player', 'wolf', 'board', 'Player|front|1'),
        w2 = take(s, 'Player', 'knight', 'board', 'Player|front|2');
      Sim.enterCombat(s);
      D(s, { type: 'Attack', iid: w1.iid });
      s.stack.push({ sid: ++s.sid, kind: 'attack', iid: w2.iid, src: w2.iid, controller: 'Player', hp: null, name: 'Attack: Knight', slotAt: w2.slot, statuses: [] }); // an extra attack (War Drum, Widow Maker)
      return { s, w1, w2 };
    };
    let { s, w1, w2 } = two();
    const rg = take(s, 'Player', 'rage', 'hand');
    s.priority = 'Player';
    D(s, { type: 'PlayCard', iid: rg.iid });
    pass2(s);
    eq('Rage with two Attacks on the stack asks which one', [s.choice.kind, s.choice.player, s.choice.options.length], ['attackpick', 'Player', 2]);
    check('the options are labelled with the attacker and its column', Object.values(s.choice.labels).join().includes('Wolf (column 2)') && Object.values(s.choice.labels).join().includes('Knight (column 3)'));
    const k2 = s.stack.find(o => o.iid === w2.iid);
    D(s, { type: 'Choose', player: 'Player', option: String(k2.sid) });
    eq('the chosen Attack gets the bonus status, the other none', [Sim.bonusOf(k2), Sim.bonusOf(s.stack.find(o => o.iid === w1.iid)), s.choice], [4, 0, null]);
    ({ s, w1, w2 } = two());
    const qi = take(s, 'Opponent', 'intuition', 'gy');
    D(s, { type: 'Pass', player: 'Opponent' }); // (the defender may pass; priority moves on)
    s.priority = 'Opponent';
    D(s, { type: 'Activate', iid: qi.iid, ab: 0 });
    pass2(s);
    eq('Cancel Attack with two Attacks asks which one to cancel', [s.choice.kind, s.choice.player], ['attackpick', 'Opponent']);
    const k1 = s.stack.find(o => o.iid === w1.iid);
    D(s, { type: 'Choose', player: 'Opponent', option: String(k1.sid) });
    check('the chosen Attack is gone, the other stays', !s.stack.some(o => o.iid === w1.iid) && s.stack.some(o => o.iid === w2.iid));
    s = start(1311);
    const w3 = take(s, 'Player', 'wolf', 'board', 'Player|front|1'),
      r3 = take(s, 'Player', 'rage', 'hand');
    Sim.enterCombat(s);
    D(s, { type: 'Attack', iid: w3.iid });
    s.priority = 'Player';
    D(s, { type: 'PlayCard', iid: r3.iid });
    pass2(s);
    eq('with ONE Attack nothing is asked (as before)', [s.choice, Sim.bonusOf(s.stack[0])], [null, 4]);
  });

  Tests.add('self-pick', () => {
    // ================= Q40: the resolving spell is a pick of its own effect only when the effect says so =================
    const yes = Fx.slow('t-selfback', 'Self Back', 0, { text: 'Test Slow spell: return up to 1 card from your GY to your hand (it may pick itself).', effects: [Fx.upTo('me', 'gy', 'toHand', 1, undefined, true)] }),
      no = Fx.slow('t-noself', 'No Self', 0, { text: 'Test Slow spell: return up to 1 card from your GY to your hand.', effects: [Fx.upTo('me', 'gy', 'toHand', 1)] });
    let s = start(1320, [yes, no]);
    const so = take(s, 'Player', 'soldier', 'gy'),
      a = take(s, 'Player', 't-noself', 'hand');
    D(s, { type: 'PlayCard', iid: a.iid });
    pass2(s);
    eq('without the flag the spell is not offered (Ambush of the Night does not imply itself)', s.choice.options, [so.iid, 'done']);
    s = start(1321, [yes, no]);
    const so2 = take(s, 'Player', 'soldier', 'gy'),
      b = take(s, 'Player', 't-selfback', 'hand');
    D(s, { type: 'PlayCard', iid: b.iid });
    pass2(s);
    eq('with the flag it is offered too', s.choice.options, [so2.iid, b.iid, 'done']);
    D(s, { type: 'Choose', player: 'Player', option: b.iid });
    check('picking itself: the spell ends in the hand, not the graveyard, and the effect asks no more', b.loc === 'hand' && s.piles.Player.hand.includes(b) && !s.piles.Player.gy.includes(b) && !s.choice && !s.resolving);
    s = start(1322, [yes, no]);
    const so3 = take(s, 'Player', 'soldier', 'gy'),
      c = take(s, 'Player', 't-selfback', 'hand');
    D(s, { type: 'PlayCard', iid: c.iid });
    pass2(s);
    D(s, { type: 'Choose', player: 'Player', option: so3.iid });
    check('picking another card: it goes to the hand, the spell goes to the graveyard as usual', so3.loc === 'hand' && c.loc === 'gy');
  });
})();

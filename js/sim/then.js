// then.js - REGISTRY THEN: what pickCard does with the picked card
Sim.def('then', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let bounce, enterBoard, freeSlots; // state
  let ask; // fx
  let dealDamage, extraAttack; // combat
  const THEN = {
    toGY: (s, w, c, t, k, ev) => {
      const P = s.piles[t.owner],
        i = P.hand.indexOf(t);
      if (i >= 0) P.hand.splice(i, 1);
      t.loc = 'gy';
      P.gy.unshift(t);
      ev.push({ t: 'CardDiscarded', iid: t.iid });
    },
    toHand: (s, w, c, t, k, ev) => {
      if (t.loc === 'board') bounce(s, t, ev);
    },
    damage: (s, w, c, t, k, ev) => {
      if (t.loc === 'board') dealDamage(s, c, t, k.amount, ev, 'effect', true);
    },
    summonAttack: (s, w, c, t, k, ev) => {
      const f = freeSlots(s, t);
      if (f.length === 1) {
        enterBoard(s, t, f[0], ev);
        extraAttack(s, t, ev);
      } else if (f.length)
        ask(
          s,
          w,
          c,
          'place',
          f,
          null,
          'Click a highlighted zone for ' + t.def.name + '.',
          { card: t.iid, atk: true },
          ev
        );
    },
    summon: (s, w, c, t, k, ev) => {
      const f = freeSlots(s, t);
      if (f.length === 1) enterBoard(s, t, f[0], ev);
      else if (f.length)
        ask(s, w, c, 'place', f, null, 'Click a highlighted zone for ' + t.def.name + '.', { card: t.iid }, ev);
    },
  };
  return {
    exports: { THEN },
    needs: ['ask', 'bounce', 'dealDamage', 'enterBoard', 'extraAttack', 'freeSlots'],
    link: () => {
      ({ ask, bounce, dealDamage, enterBoard, extraAttack, freeSlots } = K);
    },
  };
});

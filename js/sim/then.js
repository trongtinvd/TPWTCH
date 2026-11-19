// then.js - REGISTRY THEN: what pickCard does with the picked card
Sim.def('then', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let live, removeStatus; // statuses
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
    attack: (s, w, c, t, k, ev) => {
      if (t.loc === 'board' && t.def.type === 'creature') extraAttack(s, t, ev); // an extra attack: no requirements, no restrictions
    },
    returnEx: (s, w, c, t, k, ev) => {
      // an extra deck creature goes from the GY back to the extra deck; the materials that were used to summon it come back from exile to the hand
      const P = s.piles[t.owner];
      P.gy.splice(P.gy.indexOf(t), 1);
      t.loc = 'extra';
      P.extra.push(t);
      ev.push({ t: 'CardReturnedExtra', iid: t.iid, player: t.owner });
      const st = live(t).find(x => x.kind === 'mats');
      if (!st) return;
      for (const m of st.cards) {
        const mc = s.cards[m.iid];
        if (mc && mc.loc === 'exile' && mc.owner === t.owner) {
          P.exile.splice(P.exile.indexOf(mc), 1);
          mc.loc = 'hand';
          P.hand.push(mc);
          ev.push({ t: 'CardAdded', iid: mc.iid, player: mc.owner });
        }
      }
      removeStatus(s, st, 'materials returned');
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
    needs: ['ask', 'bounce', 'dealDamage', 'enterBoard', 'extraAttack', 'freeSlots', 'live', 'removeStatus'],
    link: () => {
      ({ ask, bounce, dealDamage, enterBoard, extraAttack, freeSlots, live, removeStatus } = K);
    },
  };
});

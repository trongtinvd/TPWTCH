// costs.js - REGISTRY COSTS: check (payable?) and pay (mutates)
Sim.def('costs', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let ctl; // added by Patch3
  let PL, addStatus, has, syncLife; // statuses
  let destroy; // state
  let hasAP, spendAP; // ap
  const COSTS = {
    // check -> reason|null; pay mutates (never refunded if countered)
    PayLife: {
      check: (s, c, k) => (s.life[ctl(c)] <= k.n ? 'Cost: not enough life' : null),
      pay: (s, c, k, ev) => {
        addStatus(s, PL(s, ctl(c)), { kind: 'paid', amount: k.n, srcName: c.def.name });
        syncLife(s, ctl(c));
        ev.push({ t: 'LifePaid', player: ctl(c), amount: k.n });
      },
    },
    ExileFromGY: {
      check: (s, c, k) => (s.piles[c.owner].gy.length < k.n ? 'Cost: graveyard has too few cards' : null),
      pay: (s, c, k, ev) => {
        for (let i = 0; i < k.n; i++) {
          const x = s.piles[c.owner].gy.pop();
          x.loc = 'exile';
          s.piles[c.owner].exile.push(x);
          ev.push({ t: 'CardExiled', iid: x.iid });
        }
      },
    },
    ExileSelf: {
      check: (s, c) => (c.loc === 'gy' ? null : 'Cost: this card must be in the graveyard'),
      pay: (s, c, k, ev) => {
        const g = s.piles[c.owner].gy;
        g.splice(g.indexOf(c), 1);
        c.loc = 'exile';
        s.piles[c.owner].exile.push(c);
        ev.push({ t: 'CardExiled', iid: c.iid });
      },
    },
    SpendAP: {
      check: (s, c) => (hasAP(s, ctl(c)) ? null : 'Cost: no action point left'),
      pay: (s, c, k, ev) => spendAP(s, ctl(c), c.def.name + ' (cost)', ev),
    },
    SacrificeSelf: { check: () => null, pay: (s, c, k, ev) => destroy(s, c, ev, 'cost') },
  };
  const payCost = (s, c, k, ev) => COSTS[k.op].pay(s, c, k, ev);
  return {
    exports: { COSTS, payCost },
    needs: ['ctl', 'PL', 'addStatus', 'destroy', 'has', 'hasAP', 'spendAP', 'syncLife'],
    link: () => {
      ({ ctl } = K);
      ({ PL, addStatus, destroy, has, hasAP, spendAP, syncLife } = K);
    },
  };
});

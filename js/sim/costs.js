// costs.js - REGISTRY COSTS: check (payable?) and pay (mutates)
Sim.def('costs', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let ctl;
  let PL, addStatus, has, syncLife; // statuses
  let destroy; // state
  let hasAP, spendAP; // ap
  const COSTS = {
    // check -> reason|null; pay mutates (never refunded if countered)
    PayLife: {
      check: (s, c, k) => (s.life[ctl(c)] - k.n <= -1 ? 'Cost: not enough life' : null), // paying down to 0 is fine (life -1 or less loses)
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
    SpendStatus: {
      // remove one status of kind k.kind from this card (Vanguard: an attack counter)
      check: (s, c, k) => (hasSt(c, k.kind) ? null : 'Cost: no ' + (k.label || k.kind) + ' on this card'),
      pay: (s, c, k, ev) => {
        removeStatus(
          s,
          live(c).find(x => x.kind === k.kind),
          'spent: ' + c.def.name
        );
        ev.push({ t: 'StatusSpent', iid: c.iid, kind: k.kind });
      },
    },
    SacrificeSelf: { check: () => null, pay: (s, c, k, ev) => destroy(s, c, ev, 'cost') },
    // reveal your hand (Secret Twin): every card in it is revealed to the opponent while it stays in the hand (like Parasite); returns the cards
    RevealHand: {
      check: () => null,
      pay: (s, c, k, ev) => {
        const p = c.owner,
          foe = p === 'Player' ? 'Opponent' : 'Player',
          L = s.piles[p].hand.filter(x => x !== c);
        for (const x of L)
          if (!hasSt(x, 'revealed', st => st.to === foe))
            addStatus(s, x, { kind: 'revealed', to: foe, zone: 'hand', srcName: c.def.name });
        ev.push({ t: 'HandRevealed', player: p, to: foe, iids: L.map(x => x.iid) });
        return L.map(x => x.iid);
      },
    },
  };
  const payCost = (s, c, k, ev) => COSTS[k.op].pay(s, c, k, ev);
  // a spell's costs (def.cost), paid when it is played; what the costs revealed (RevealHand) is returned for the stack object (null: none)
  function payCardCost(s, c, ev) {
    let shown = null;
    for (const k of c.def.cost || []) {
      const r = payCost(s, c, k, ev);
      if (Array.isArray(r)) shown = (shown || []).concat(r);
    }
    return shown;
  }
  return {
    exports: { COSTS, payCardCost, payCost },
    needs: [
      'hasSt',
      'live',
      'removeStatus',
      'ctl',
      'PL',
      'addStatus',
      'destroy',
      'has',
      'hasAP',
      'spendAP',
      'syncLife',
    ],
    link: () => {
      ({ hasSt, live, removeStatus } = K);
      ({ ctl } = K);
      ({ PL, addStatus, destroy, has, hasAP, spendAP, syncLife } = K);
    },
  };
});

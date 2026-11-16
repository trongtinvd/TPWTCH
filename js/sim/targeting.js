// targeting.js - REGISTRIES TARGETS / COLTARGETS / ZONETARGETS and the target finders
Sim.def('targeting', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let colKeys, other; // util
  let has; // statuses
  let cloudMap; // state
  // third argument true = TARGETING (a cloud counts as a card/zone there); false = RESOLUTION (only what is really underneath)
  const COLTARGETS = {
    fullColumn: (s, col, clouds) => {
      const m = clouds ? cloudMap(s) : {};
      return colKeys(col).every(k => s.slots[k] || m[k]) ? null : 'Requirement: the column must be fully filled';
    },
  };
  const targetColumns = (s, c) =>
    c.def.colTarget ? [0, 1, 2, 3, 4].filter(col => !COLTARGETS[c.def.colTarget](s, col, true)) : [];
  const ZONETARGETS = {
    anyCreature: s => {
      const m = cloudMap(s);
      return Object.keys(s.slots).filter(
        k =>
          !s.unusable[k] &&
          (m[k] || (s.slots[k] && s.cards[s.slots[k]].def.type === 'creature' && !has(s.cards[s.slots[k]], 'red')))
      );
    },
    anyPermanent: s => {
      const m = cloudMap(s);
      return Object.keys(s.slots).filter(
        k => !s.unusable[k] && (m[k] || (s.slots[k] && !has(s.cards[s.slots[k]], 'red')))
      );
    },
  }; // a cloud counts as a target even over an empty zone
  const targetZones = (s, c) => (c.def.zoneTarget ? ZONETARGETS[c.def.zoneTarget](s, c) : []);
  // ---- Published effect API. Cards reference these by name through Fx; add an entry here to give every card a new building block.
  const pendingAtk = (s, p) => {
    for (let i = s.stack.length - 1; i >= 0; i--) {
      const o = s.stack[i];
      if (o.kind === 'attack' && o.controller !== p) return o;
    }
    return null;
  }; // the topmost Attack object on the stack that p's opponent controls
  const TARGETS = {
    attacker: (s, c) => {
      const o = pendingAtk(s, c.owner);
      return o ? s.cards[o.iid] : null;
    },
    opposingFront: (s, c) => {
      const col = c.slot && c.slot.split('|')[2],
        id = col != null && s.slots[other(c.owner) + '|front|' + col];
      return id && !has(s.cards[id], 'red') ? s.cards[id] : null;
    },
  };
  const findTarget = (s, c, a) => (a.target && TARGETS[a.target] ? TARGETS[a.target](s, c) : null);
  return {
    exports: { COLTARGETS, TARGETS, ZONETARGETS, findTarget, pendingAtk, targetColumns, targetZones },
    needs: ['cloudMap', 'colKeys', 'has', 'other'],
    link: () => {
      ({ cloudMap, colKeys, has, other } = K);
    },
  };
});

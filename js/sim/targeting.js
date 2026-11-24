// targeting.js - REGISTRIES TARGETS / COLTARGETS / ZONETARGETS and the target finders
Sim.def('targeting', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let ctl;
  let colKeys, other; // util
  let has; // statuses
  let cloudMap, isUnusable; // state
  let pairLabel, pairOptions; // choices
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
          !isUnusable(s, k) &&
          (m[k] || (s.slots[k] && s.cards[s.slots[k]].def.type === 'creature' && !has(s.cards[s.slots[k]], 'red')))
      );
    },
    anyPermanent: s => {
      const m = cloudMap(s);
      return Object.keys(s.slots).filter(
        k => !isUnusable(s, k) && (m[k] || (s.slots[k] && !has(s.cards[s.slots[k]], 'red')))
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
      const o = pendingAtk(s, ctl(c));
      return o ? s.cards[o.iid] : null;
    },
    opposingFront: (s, c) => {
      const col = c.slot && c.slot.split('|')[2],
        id = col != null && s.slots[other(ctl(c)) + '|front|' + col];
      return id && !has(s.cards[id], 'red') ? s.cards[id] : null;
    },
  };
  // TARGETINGS: the targets a TRIGGER picks when it is put on the stack (Yu-Gi-Oh: condition : cost / targeting ; effect). An ability with a targeting that has no legal option is not put on the stack at all.
  const TARGETINGS = {
    adjacentPair: {
      options: (s, c) => pairOptions(s, ctl(c)),
      label: (s, c, o) => pairLabel(s, ctl(c), o),
      prompt: c => c.def.name + ': target two adjacent cards your opponent controls.',
    },
    // anything with active HP except a player (hp.js HPKINDS: board cards, zones with HP or a cloud, spells / abilities on the stack)
    nonPlayerHp: {
      options: s => hpRefs(s),
      label: (s, c, o) => hpLabel(s, o),
      prompt: c => c.def.name + ': target something with HP that is not a player.',
      legal: (s, c, o) => !!hpResolve(s, o), // re-checked when it resolves: an illegal target fizzles it
    },
  };
  const findTarget = (s, c, a) => (a.target && TARGETS[a.target] ? TARGETS[a.target](s, c) : null);
  return {
    exports: { COLTARGETS, TARGETINGS, TARGETS, ZONETARGETS, findTarget, pendingAtk, targetColumns, targetZones },
    needs: [
      'hpLabel',
      'hpRefs',
      'hpResolve',
      'ctl',
      'cloudMap',
      'colKeys',
      'has',
      'isUnusable',
      'other',
      'pairLabel',
      'pairOptions',
    ],
    link: () => {
      ({ hpLabel, hpRefs, hpResolve } = K);
      ({ ctl } = K);
      ({ cloudMap, colKeys, has, isUnusable, other, pairLabel, pairOptions } = K);
    },
  };
});

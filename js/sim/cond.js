// cond.js - REGISTRIES COND (trigger conditions), TRIGGERS (which cards a trigger event concerns), PASSIVES (continuous effects read by the rules)
Sim.def('cond', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let colKeys, zoneDist; // util
  let hasSt; // statuses
  let cloudMap, recalc; // state
  const COND = {
    extraPaid: (s, c) => hasSt(c, 'extraPaid'),
    firstCombat: (s, c) => s.combats === 1 && c.owner === s.active,
    ownInAttackCol: (s, c, a) =>
      !!(a && a.slot) &&
      colKeys(a.slot.split('|')[2]).some(k => {
        const m = s.slots[k] && s.cards[s.slots[k]];
        return !!m && m.owner === c.owner && m.def.type === 'creature';
      }),
    foeAdjacent: (s, c, subject) =>
      !!subject &&
      subject.loc === 'board' &&
      Object.keys(s.slots).some(
        k =>
          s.slots[k] &&
          s.slots[k] !== subject.iid &&
          s.cards[s.slots[k]].owner === subject.owner &&
          zoneDist(subject.slot, k) === 1
      ), // the entering card stands next to another card its controller has (Widow Maker)
    usedMat: (s, c, subject, t) => hasSt(c, 'mats', x => x.cards.some(m => m.id === t.card)), // this card was summoned using the named card as a material
  };
  // conditions of EXTRA DECK creatures (def.conditions): (state, player, condition) -> boolean. They do nothing by themselves; Fusion effects read them
  const EXCOND = {
    LostLife: s =>
      ['Player', 'Opponent'].some(p => s.players[p].statuses.some(x => x.kind === 'damage' || x.kind === 'paid')), // a player has lost life at some point (removed damage still counts)
    BothDrewMoreThan: (s, p, e) => s.drawn.Player > e.n && s.drawn.Opponent > e.n, // cards drawn since the game started; the opening hand does not count
  };
  // which cards a trigger event concerns: (state, card holding the trigger, trigger, event subject) -> boolean. Keys = the trigger names cards may use (Fx.trigger.*)
  const TRIGGERS = {
    enter: (s, c, t, subject) =>
      t.by
        ? (t.by.includes('self') && c === subject) || (t.by.includes('foe') && c.owner !== subject.owner)
        : c === subject,
    attack: (s, c, t, subject) =>
      ((t.by || []).includes('self') && c === subject) ||
      ((t.by || []).includes('foe') && c.owner !== subject.owner) ||
      (t.by || []).includes('any'),
    turnStart: (s, c) => c.owner === s.active,
    damaged: (s, c, t, subject) => c === subject,
    combat: (s, c) => c.owner === s.active,
    combatEnd: (s, c) => c.owner === s.active,
  };
  // continuous effects a card may carry in `passives`; they are not run, the rules read them (value = where)
  const PASSIVES = { Obscure: 'cloudMap', Aura: 'recalc' };
  return {
    exports: { COND, EXCOND, PASSIVES, TRIGGERS },
    needs: ['cloudMap', 'colKeys', 'hasSt', 'recalc', 'zoneDist'],
    link: () => {
      ({ cloudMap, colKeys, hasSt, recalc, zoneDist } = K);
    },
  };
});

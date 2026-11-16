// cond.js - REGISTRIES COND (trigger conditions), TRIGGERS (which cards a trigger event concerns), PASSIVES (continuous effects read by the rules)
Sim.def('cond', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let colKeys; // util
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
  };
  // which cards a trigger event concerns: (state, card holding the trigger, trigger, event subject) -> boolean. Keys = the trigger names cards may use (Fx.trigger.*)
  const TRIGGERS = {
    enter: (s, c, t, subject) => c === subject,
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
    exports: { COND, PASSIVES, TRIGGERS },
    needs: ['cloudMap', 'colKeys', 'hasSt', 'recalc'],
    link: () => {
      ({ cloudMap, colKeys, hasSt, recalc } = K);
    },
  };
});

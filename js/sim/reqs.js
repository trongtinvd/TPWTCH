// reqs.js - REGISTRY REQS: requirements (reason string, or null when satisfied)
Sim.def('reqs', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let other; // util
  let hurt; // statuses
  let cloudMap; // state
  let TARGETS, findTarget, pendingAtk; // targeting
  let COND; // cond
  let fusionPossible; // fusion
  const REQS = {
    // -> reason string, or null if satisfied
    front: (s, c) => ((c.slot || '').includes('|front|') ? null : 'Requirement: must be in a front-row zone'),
    foeAttacking: (s, c) => (TARGETS.attacker(s, c) ? null : 'Requirement: an opposing creature is attacking'),
    hurt: (s, c) => (s.life[c.owner] >= s.maxLife ? 'Requirement: life is already full' : null),
    target: (s, c, a) =>
      findTarget(s, c, a) ||
      (a.target === 'opposingFront' && c.slot && cloudMap(s)[other(c.owner) + '|front|' + c.slot.split('|')[2]])
        ? null
        : 'Requirement: no legal target', // an enemy cloud counts as a target; an empty one fizzles
    fusionOK: (s, c, a) =>
      fusionPossible(
        s,
        c.owner,
        (a.effects || []).find(e => e.op === 'Fusion')
      )
        ? null
        : 'Requirement: no extra deck creature can be summoned', // reads the Fusion effect of the card / ability
    exInGY: (s, c) =>
      s.piles[c.owner].gy.some(x => x.def.extra) ? null : 'Requirement: no extra deck creature in your graveyard',
    stack: s => (s.stack.length ? null : 'Requirement: there must be a stack object to target'),
    attackOnStack: s => (s.stack.some(o => o.kind === 'attack') ? null : 'Requirement: an Attack must be on the stack'),
    attackedCol: (s, c) => {
      const o = pendingAtk(s, c.owner),
        a = o && s.cards[o.iid];
      return a && a.loc === 'board' && a.owner !== c.owner && COND.ownInAttackCol(s, c, a)
        ? null
        : 'Requirement: an opposing creature attacked and you control a creature in that column';
    },
  };
  return {
    exports: { REQS },
    needs: ['COND', 'TARGETS', 'cloudMap', 'findTarget', 'fusionPossible', 'hurt', 'other', 'pendingAtk'],
    link: () => {
      ({ COND, TARGETS, cloudMap, findTarget, fusionPossible, hurt, other, pendingAtk } = K);
    },
  };
});

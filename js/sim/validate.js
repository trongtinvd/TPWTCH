// validate.js - fails loudly at load when a card (or an Fx builder) names something the Sim does not publish
const apiErrors = () => {
  const A = Sim.API,
    bad = [];
  const walk = (id, list, kind) =>
    (list || []).forEach(e => {
      if (!A[kind].includes(e.op)) bad.push(id + ': unknown ' + kind + ' ' + e.op);
      if (e.effects) walk(id, e.effects, kind);
      if (e.modes) e.modes.forEach(m => walk(id, m.effects, kind)); // nested mode effects are checked too
    });
  DEFS.forEach(d => {
    if (d.zoneTarget && !A.zoneTargets.includes(d.zoneTarget)) bad.push(d.id + ': unknown zone target ' + d.zoneTarget);
    if (d.rider && !A.riders.includes(d.rider.op)) bad.push(d.id + ': unknown rider ' + d.rider.op);
    (d.passives || []).forEach(p => A.passives.includes(p.op) || bad.push(d.id + ': unknown passive ' + p.op));
    (d.req || []).forEach(r => A.requirements.includes(r) || bad.push(d.id + ': unknown requirement ' + r));
    walk(d.id, d.effects, 'effects');
    (d.conditions || []).forEach(
      e => A.exConds.includes(e.op) || bad.push(d.id + ': unknown extra deck condition ' + e.op)
    );
    (d.materials || []).forEach(
      m => ['creature', 'enchantment', 'any'].includes(m.type) || bad.push(d.id + ': unknown material type ' + m.type)
    );
    if (d.colTarget && !A.colTargets.includes(d.colTarget)) bad.push(d.id + ': unknown column target ' + d.colTarget);
    (d.triggers || []).forEach(g => {
      A.triggers.includes(g.on) || bad.push(d.id + ': unknown trigger ' + g.on);
      if (g.targeting && !A.targetings.includes(g.targeting)) bad.push(d.id + ': unknown targeting ' + g.targeting);
      if (g.cond && !A.conds.includes(g.cond)) bad.push(d.id + ': unknown condition ' + g.cond);
      walk(d.id, g.effects, 'effects');
    });
    (d.abilities || []).forEach(a => {
      walk(d.id, a.effects, 'effects');
      walk(d.id, a.cost, 'costs');
      (a.req || []).forEach(r => A.requirements.includes(r) || bad.push(d.id + ': unknown requirement ' + r));
      if (a.target && !A.targets.includes(a.target)) bad.push(d.id + ': unknown target ' + a.target);
    });
  });
  // Fx and Sim cannot drift: every Fx builder is called with no arguments and must name a published op / trigger,
  // and every named requirement / target / zone target / column target must exist
  const ops = new Set([...A.effects, ...A.costs, ...A.riders, ...A.passives, ...A.exConds]),
    names = {
      req: 'requirements',
      target: 'targets',
      zoneTarget: 'zoneTargets',
      colTarget: 'colTargets',
      targeting: 'targetings',
    };
  const scan = (o, path) => {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'function') {
        let r;
        try {
          r = v();
        } catch (e) {
          continue;
        }
        if (r && typeof r.op === 'string' && !ops.has(r.op)) bad.push('Fx.' + path + k + ': unknown op ' + r.op);
        if (r && typeof r.on === 'string' && !A.triggers.includes(r.on))
          bad.push('Fx.' + path + k + ': unknown trigger ' + r.on);
      } else if (v && typeof v === 'object')
        for (const [n, x] of Object.entries(v))
          if (names[k] && typeof x === 'string' && !A[names[k]].includes(x))
            bad.push('Fx.' + k + '.' + n + ': unknown ' + names[k] + ' ' + x);
    }
  };
  scan(Fx, '');
  scan(Fx.trigger, 'trigger.');
  scan(Fx.exCond, 'exCond.');
  scan(Fx.rider, 'rider.');
  return bad;
};
apiErrors().forEach(m => console.error('Card API error: ' + m));

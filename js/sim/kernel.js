// kernel.js - Sim scaffold (no THREE, no DOM). Every js/sim/*.js file registers a module with Sim.def(name, factory); index.js calls Sim.boot().
// =====================================================================
// SIMULATION: plain serialisable data + pure functions. No THREE, no DOM,
// no view/camera concepts. Commands in, events out. Runs headless.
// =====================================================================
const deepFreeze = o => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
};
deepFreeze(DEFS);
deepFreeze(TYPES); // CardDefinitions are immutable design data
// Every js/sim/*.js file registers a module with Sim.def(name, factory); index.js calls Sim.boot().
// A module factory returns {exports, needs, link}: its names are merged into one shared table (K), then every module's
// imports (declared as `let` at the top of the factory) are bound from K, so modules may depend on each other in cycles.
// This is a stand-in for ES modules (a later step): the `let` list is the import list.
const Sim = (function () {
  const defs = [],
    K = {};
  const self = {
    def(name, factory) {
      defs.push([name, factory]);
    },
    boot(publish) {
      const mods = [];
      for (const [name, factory] of defs) {
        const m = factory(K);
        for (const k of Object.keys(m.exports)) {
          if (k in K) throw new Error('Sim module ' + name + ' redefines ' + k);
          K[k] = m.exports[k];
        }
        mods.push([name, m]);
      }
      for (const [name, m] of mods) {
        const missing = m.needs.filter(k => !(k in K));
        if (missing.length) throw new Error('Sim module ' + name + ' imports unknown names: ' + missing.join(', '));
        m.link();
      }
      Object.assign(self, publish(K));
    },
  };
  return self;
})();

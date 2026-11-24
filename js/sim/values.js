// values.js - REGISTRY VALUES: numbers an effect counts when it resolves, so a card says "for each X" with data, not with its own op.
// An effect field that takes a number (Draw's n) also takes {value: name}; countValue(x, v) gives the number. A new value = one entry
// here plus its words in VALUE (Translate, js/content/cards.js), and Fx.count.<name>.
Sim.def('values', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let foeCreatures; // fx
  const VALUES = {
    foeCreatures: x => foeCreatures(x), // creatures the opponent controls that the controller can see (a cloud hides them)
  };
  const countValue = (x, v) => (v && typeof v === 'object' ? VALUES[v.value](x) : v);
  return {
    exports: { VALUES, countValue },
    needs: ['foeCreatures'],
    link: () => {
      ({ foeCreatures } = K);
    },
  };
});

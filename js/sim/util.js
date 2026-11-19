// util.js - shared constants and small helpers (no rules)
Sim.def('util', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let create; // state
  let hasAP; // ap
  const other = p => (p === 'Player' ? 'Opponent' : 'Player');
  const byId = {}; // def id -> definition (filled by create)
  const isPerm = c => c.def.type !== 'spell' && c.def.type !== 'ability';
  const slowish = c => (isPerm(c) && !c.def.flash) || c.def.timing === 'Slow'; // Flash permanents are played like Quick spells
  const slotRow = c => (c.def.type === 'creature' ? 'front' : 'back');
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const zoneGrid = k => {
    const [o, row, col] = k.split('|');
    return { r: o === 'Opponent' ? (row === 'back' ? 0 : 1) : row === 'front' ? 2 : 3, c: +col };
  }; // 4 x 5 grid, opponent back row on top
  const zoneDist = (a, b) => {
    const p = zoneGrid(a),
      q = zoneGrid(b);
    return Math.abs(p.r - q.r) + Math.abs(p.c - q.c);
  }; // The Vine's own distance function (Manhattan)
  const cname = (s, i) => s.cards[i].def.name;
  const colKeys = col => ['Opponent|back|', 'Opponent|front|', 'Player|front|', 'Player|back|'].map(p => p + col); // the 4 zones of a column
  // ---- Abilities & stack objects ------------------------------------------------
  const RULES = { apLimit: true }; // console: cardGame.Sim.RULES.apLimit = false to sandbox freely (no action point is ever needed)
  const canPayExtra = (s, c) => !!(c.def.extraCost && c.def.extraCost.ap) && hasAP(s, c.owner); // the optional additional cost 'spend an action point': whenever its owner has one (also on the opponent's turn)
  return {
    exports: {
      RULES,
      byId,
      canPayExtra,
      cname,
      colKeys,
      isPerm,
      mulberry32,
      other,
      slotRow,
      slowish,
      zoneDist,
      zoneGrid,
    },
    needs: ['create', 'hasAP'],
    link: () => {
      ({ create, hasAP } = K);
    },
  };
});

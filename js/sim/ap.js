// ap.js - ACTION POINTS. Each player holds a list of action points (s.players[p].ap): {id, turn, spent: null | {why, turn}}.
// A player gains one at the start of their own turn (and the first player when the game starts). Unspent points stay (a player can hold several).
// Spending one is how the old "major action" works now: Draw, entering the attack phase, summoning, Slow spells and Slow abilities cost one;
// cards can also spend one at any time they allow it (War Drum's additional cost, Depth Sea Fusion's ability), even on the opponent's turn.
// A spent point stays in the list (greyed) and is written to the game log, so the log entry can open its inspection panel.
Sim.def('ap', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let RULES; // util
  const apList = (s, p) => s.players[p].ap || (s.players[p].ap = []);
  const apOpen = (s, p) => apList(s, p).filter(a => !a.spent);
  const apCount = (s, p) => apOpen(s, p).length;
  const hasAP = (s, p) => !RULES.apLimit || apCount(s, p) > 0;
  function gainAP(s, p, ev) {
    const a = { id: (s.apn = (s.apn || 0) + 1), turn: s.turn, spent: null };
    apList(s, p).push(a);
    ev.push({ t: 'ActionPointGained', player: p, id: a.id });
    return a;
  }
  function spendAP(s, p, why, ev) {
    // the oldest unspent point goes first; false when the player has none (RULES.apLimit = false: never needed, never spent)
    if (!RULES.apLimit) return true;
    const a = apOpen(s, p)[0];
    if (!a) return false;
    a.spent = { why, turn: s.turn };
    ev.push({ t: 'ActionPointSpent', player: p, id: a.id, why });
    return true;
  }
  return {
    exports: { apCount, apList, apOpen, gainAP, hasAP, spendAP },
    needs: ['RULES'],
    link: () => {
      ({ RULES } = K);
    },
  };
});

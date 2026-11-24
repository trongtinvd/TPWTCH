// turn.js - THE TURN STATE MACHINE. The turn's fields live on the state (so replays and saved games keep their shape), but ONLY the
// transitions below write them; every other file reads them. Fields:
//   step         'start' | 'draw' | 'main' | 'combat' | 'end' (the turn order shown in the game)
//   attackPhase  a combat phase is open        combats  combat phases begun this turn        turn  the turn number
//   pending flags (something is due as soon as nothing else is: no stack, choice, window, trigger or resolving spell):
//     drawPending  the draw phase       mainPending  the "main phase started" stop       turnEnding  the end step (End turn during combat)
//   mainEndDone  a Combat / End turn press that waited for the "main phase ended" window runs now (no second window)
// The stage is step, plus 'ending' while turnEnding holds. Each transition lists the stages it may start from; with RULES.strictTurn
// on (the rules tests) a transition from any other stage throws, so an impossible turn order cannot slip in unnoticed.
Sim.def('turn', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let RULES; // dispatch
  const stage = s => (s.turnEnding ? 'ending' : s.step);
  const ANY = null;
  const T = {
    gameStarted: { from: ['start'], run: s => ((s.step = 'start'), (s.drawPending = true)) },
    drawBegins: { from: ['start'], run: s => ((s.drawPending = false), (s.step = 'draw')) },
    drawEnds: { from: ['draw'], run: s => (s.step = 'main') },
    mainDue: { from: ['main'], run: s => (s.mainPending = true) },
    mainSeen: { from: ['main'], run: s => (s.mainPending = false) },
    // SetAttackPhase on / off (off while already off keeps the main phase)
    combat: {
      from: ['main', 'combat'],
      run: (s, on) => {
        const was = s.attackPhase;
        s.attackPhase = !!on;
        s.step = s.attackPhase ? 'combat' : 'main';
        if (on && !was) s.combats = (s.combats || 0) + 1;
        return was;
      },
    },
    // End turn during combat: combat ends, the end step follows once nothing is pending (the step still shows combat until then)
    combatEndsTurn: { from: ['combat'], run: s => ((s.attackPhase = false), (s.turnEnding = true)) },
    // a second combat phase (Deep Sea Shark): from the main phase or while the turn was ending
    extraCombat: {
      from: ['main', 'ending'],
      run: s => {
        s.attackPhase = true;
        s.turnEnding = false;
        s.step = 'combat';
        s.mainPending = false;
        s.combats = (s.combats || 0) + 1;
      },
    },
    endStepDue: { from: ['ending'], run: s => (s.turnEnding = false) },
    endStep: { from: ['main', 'combat'], run: s => (s.step = 'end') },
    nextTurn: {
      from: ['end'],
      run: s => {
        s.turnEnding = false;
        s.attackPhase = false;
        s.turn++;
        s.combats = 0;
      },
    },
    turnStarts: { from: ['end'], run: s => ((s.step = 'start'), (s.drawPending = true)) },
    deferredRuns: { from: ['main'], run: s => (s.mainEndDone = true) },
    deferredDone: { from: ANY, run: s => (s.mainEndDone = false) },
    forceCombat: { from: ANY, run: s => (s.attackPhase = true) }, // Sim.enterCombat: the tests' shortcut for a hand-built state
  };
  function go(s, name, arg) {
    const t = T[name];
    if (!t) throw new Error('Unknown turn transition ' + name);
    if (t.from && RULES.strictTurn && !t.from.includes(stage(s)))
      throw new Error('Turn transition ' + name + ' from stage ' + stage(s) + ' (allowed: ' + t.from.join(', ') + ')');
    return t.run(s, arg);
  }
  return {
    exports: { turnGo: go, turnStage: stage, TURN: T },
    needs: ['RULES'],
    link: () => {
      ({ RULES } = K);
    },
  };
});

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
  let RULES, other, mulberry32, live; // dispatch, util, statuses
  let prGo; // priority
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
    // a second combat phase (Deep Sea Shark, or any card that gives one): from the main phase or while the turn was ending. The
    // first combat's "combat ended" window is over: the second combat replaces it (ev: where its ResponseWindowClosed goes)
    extraCombat: {
      from: ['main', 'ending'],
      run: (s, ev) => {
        s.attackPhase = true;
        s.turnEnding = false;
        s.step = 'combat';
        s.mainPending = false;
        s.combats = (s.combats || 0) + 1;
        prGo(s, 'windowCancelled', { kind: 'combatEnd', ev });
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
  // ---- who takes the next turn: Distance / Speed / Acceleration (Docs/RULES.md "Turn order") --------------------------------
  // s.race = {Player:{distance, speed, acceleration}, Opponent:...} (base values; distance and speed grow) or null = turns alternate.
  // A player's effective stat folds their live `race` statuses in list order: {kind:'race', stat, amount} (adds) or {..., set} (sets).
  const RACE = ['distance', 'speed', 'acceleration'];
  function raceStat(s, p, k) {
    let v = s.race[p][k];
    for (const x of live(s.players[p] || {}).filter(x => x.kind === 'race' && x.stat === k))
      v = x.set != null ? x.set : v + (x.amount || 0);
    return v;
  }
  // last = the player who had the last turn (null at the start). Farthest ahead takes the turn; ties break on greater Speed, then
  // greater Acceleration, then the player who did NOT have the last turn, then (only at the start) a seeded coin toss. The other advances.
  function pickTurn(s, last, ev, coin) {
    let p = null;
    for (const k of RACE) {
      const a = raceStat(s, 'Player', k),
        b = raceStat(s, 'Opponent', k);
      if (a !== b) {
        p = a > b ? 'Player' : 'Opponent';
        break;
      }
    }
    if (!p && last) p = other(last);
    else if (!p) {
      p = coin ? coin() : mulberry32((s.n * 7 + 3) >>> 0)() < 0.5 ? 'Player' : 'Opponent';
      if (ev) ev.push({ t: 'CoinToss', winner: p });
    }
    const q = other(p),
      r = s.race[q],
      sp = raceStat(s, q, 'speed');
    r.distance += sp; // Distance += Speed; Speed += Acceleration (the base values: statuses stay on top)
    r.speed += raceStat(s, q, 'acceleration');
    if (ev)
      ev.push({
        t: 'RaceAdvanced',
        player: q,
        by: sp,
        distance: raceStat(s, q, 'distance'),
        speed: raceStat(s, q, 'speed'),
      });
    return p;
  }
  const nextTurnPlayer = (s, ev) => (s.race ? pickTurn(s, s.active, ev) : other(s.active));
  // the next n turns, the current one first: a pure projection (a copy of the race), redone whenever a stat changes
  function turnOrder(s, n) {
    const out = [{ turn: s.turn, player: s.active }];
    if (s.phase !== 'play') return out.slice(0, 0);
    const c = { n: s.n, race: s.race && JSON.parse(JSON.stringify(s.race)), players: s.players, active: s.active };
    for (let i = 1; i < n; i++) {
      c.active = c.race ? pickTurn(c, c.active, null) : other(c.active);
      out.push({ turn: s.turn + i, player: c.active });
    }
    return out;
  }
  const raceOf = (s, p) => (s.race ? Object.fromEntries(RACE.map(k => [k, raceStat(s, p, k)])) : null);
  return {
    exports: { turnGo: go, turnStage: stage, TURN: T, pickTurn, nextTurnPlayer, turnOrder, raceOf },
    needs: ['RULES', 'other', 'mulberry32', 'live', 'prGo'],
    link: () => {
      ({ RULES, other, mulberry32, live, prGo } = K);
    },
  };
});

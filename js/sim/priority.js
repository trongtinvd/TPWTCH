// priority.js - THE PRIORITY STATE MACHINE (the priority side of the turn, next to js/sim/turn.js). Its fields live on the state (so
// replays and saved games keep their shape), but ONLY the transitions below write them; every other file reads them. Fields:
//   priority  the player who may act now (a pending choice aside: s.choice.player answers it)
//   passes    passes in a row on the current stack: two resolve the top object, any push resets it
//   respond   the empty-stack response window: null | {kind, stage: 'foe' | 'turn', then?}. The non-turn player answers first (foe),
//             then the turn player when they want the same stop (Q49). then = a command waiting for the window to close (main ended)
// Situations: 'choice' (a pending choice), 'stack' (the stack is not empty), 'window:foe' / 'window:turn' (an empty-stack window),
// 'idle' (none of these: the turn player acts). Each transition lists the situations it may start from; with RULES.strictTurn on
// (the rules tests) a transition from any other situation throws, like the turn transitions.
Sim.def('priority', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let RULES, other; // util
  let turnGo; // turn
  const situation = s =>
    s.choice ? 'choice' : s.stack.length ? 'stack' : s.respond ? 'window:' + s.respond.stage : 'idle';
  const ANY = null;
  // ---- stops (Q49 / Q50) ----------------------------------------------------------------------------------------------------
  // s.stops = null | {Player:{opp:{kind:true}, own:{kind:true}}, Opponent:{...}}. `opp` = the windows a player gets as the NON-turn
  // player (enter and end are on unless turned off), `own` = as the turn player. "permanent entered" and "end step" on the opponent's
  // turn are ON BY DEFAULT, not forced: a player turns them off like any stop (SetStop ... on:false). Only a stop never set falls back
  // to the default. The stop icons read stopOn too (one source of truth).
  const STOP_DEFAULTS = { opp: { enter: true, end: true }, own: {} };
  const stopOn = (s, p, role, kind) => {
    const set = s.stops && s.stops[p] && s.stops[p][role],
      v = set ? set[kind] : undefined;
    return v === undefined || v === null ? !!STOP_DEFAULTS[role][kind] : !!v;
  };
  const stopWants = (s, p, kind) => stopOn(s, p, p !== s.active ? 'opp' : 'own', kind);
  const respPri = s => (s.respond && s.respond.stage === 'turn' ? s.active : other(s.active)); // who holds priority in the open window
  // ---- the transitions --------------------------------------------------------------------------------------------------------
  const P = {
    // a spell or an ability goes on the stack: the count resets, the other player answers first
    objectPushed: {
      from: ['stack', 'choice'],
      run: (s, controller) => ((s.passes = 0), (s.priority = other(controller))),
    },
    // a spell put on the stack while its controller is still choosing (L4: The Librarian): the count resets, priority stays
    pushedInChoice: { from: ['choice'], run: s => (s.passes = 0) },
    // an Attack (and its triggers above it): the defender answers first
    attackDeclared: {
      from: ['stack', 'choice'],
      run: (s, controller) => ((s.passes = 0), (s.priority = other(controller))),
    },
    // triggers went onto the stack together: only now does priority pass, the NON-turn player responds first
    triggersPushed: { from: ANY, run: s => ((s.passes = 0), (s.priority = other(s.active))) },
    // a pass on a non-empty stack: 'resolve' at the second pass in a row (the count stays until the object is done), else priority goes over
    passed: {
      from: ['stack'],
      run: s => {
        if (++s.passes >= 2) return 'resolve';
        s.priority = other(s.priority);
        return null;
      },
    },
    // the resolving object is done: the count resets, priority goes to the holder of an open window, else to the turn player
    resolved: {
      from: ANY,
      run: s => ((s.passes = 0), (s.priority = s.respond ? respPri(s) : s.active)),
    },
    // an empty-stack window at a stop (triggers already on the stack resolve first): the non-turn player first when they want it,
    // else the turn player when they do, else none. Returns true when a window opened
    windowOpened: {
      from: ['idle', 'stack', 'choice'],
      run: (s, { kind, then, ev }) => {
        const foe = other(s.active),
          stage = stopWants(s, foe, kind) ? 'foe' : stopWants(s, s.active, kind) ? 'turn' : null;
        if (!stage) return false;
        s.respond = then ? { kind, stage, then } : { kind, stage };
        s.priority = stage === 'foe' ? foe : s.active;
        ev.push({ t: 'ResponseWindowOpened', kind, player: s.priority }); // the non-turn player ALWAYS responds first, even with enter triggers already on the stack
        return true;
      },
    },
    // a pass in the window: Q49, the foe passed and the turn player wants the same stop: it goes to them; else the window closes
    // (priority back to the turn player; an end step window leaves that to the turn change). Returns {closed, kind, then}
    windowPassed: {
      from: ['window:foe', 'window:turn'],
      run: (s, ev) => {
        const r = s.respond,
          kind = r.kind;
        if (r.stage === 'foe' && stopWants(s, s.active, kind)) {
          r.stage = 'turn';
          s.priority = s.active;
          ev.push({ t: 'ResponseWindowOpened', kind, player: s.active });
          return { closed: false, kind };
        }
        s.respond = null;
        ev.push({ t: 'ResponseWindowClosed', kind });
        if (kind !== 'end') s.priority = s.active;
        return { closed: true, kind, then: r.then };
      },
    },
    // a window that a turn transition made obsolete (a second combat replaces the first combat's "combat ended" window).
    // Nothing happens when that window is not open. Returns whether it closed
    windowCancelled: {
      from: ANY,
      run: (s, { kind, ev }) => {
        if (!s.respond || s.respond.kind !== kind) return false;
        s.respond = null;
        ev.push({ t: 'ResponseWindowClosed', kind });
        return true;
      },
    },
    // a step that the turn player starts with priority: the draw step, a new turn
    drawStepBegan: { from: ['idle'], run: s => ((s.priority = s.active), (s.passes = 0)) },
    turnBegan: { from: ['idle'], run: s => ((s.priority = s.active), (s.passes = 0), (s.respond = null)) },
    // the first player of a race (Distance / Speed / Acceleration) gets priority; without a race the state starts with Player
    gameStarted: { from: ANY, run: (s, first) => (s.priority = first) },
  };
  function go(s, name, arg) {
    const t = P[name];
    if (!t) throw new Error('Unknown priority transition ' + name);
    if (t.from && RULES.strictTurn && !t.from.includes(situation(s)))
      throw new Error(
        'Priority transition ' + name + ' from situation ' + situation(s) + ' (allowed: ' + t.from.join(', ') + ')'
      );
    return t.run(s, arg);
  }
  // `then` = a command that waits for the window to close (main ended: the Combat / End turn press happens after it)
  function openRespond(s, ev, kind, then) {
    if (kind === 'end') turnGo(s, 'endStep'); // the turn order shown in the game
    return go(s, 'windowOpened', { kind, then, ev });
  }
  function stopAt(s, ev, kind) {
    // an optional "stop": at this moment the non-turn player gets priority on an empty stack (turnStart, draw, mainStart, mainEnd, combatStart, combatEnd, stack).
    // s.stops is set by the host; null = no stops. A window that is already open is never replaced.
    if (s.respond) return;
    openRespond(s, ev, kind);
  }
  return {
    exports: { prGo: go, prSituation: situation, PRIORITY: P, openRespond, stopAt, stopOn, stopWants, respPri },
    needs: ['RULES', 'other', 'turnGo'],
    link: () => {
      ({ RULES, other, turnGo } = K);
    },
  };
});

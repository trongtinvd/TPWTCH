// 29-priority-machine.js - the priority side as one state machine (js/sim/priority.js): who holds priority (s.priority), the pass
// count (s.passes) and the empty-stack response window (s.respond). The write guard, and every behaviour the refactor had to keep.
// Run only these: node tests/run.js --only priority-
(function () {
  const { D, check, eq, xfail, take } = Tests.ctx;
  const ALL = {
    turnStart: true,
    draw: true,
    mainStart: true,
    mainEnd: true,
    combatStart: true,
    combatEnd: true,
    stack: true,
    end: true,
  };
  const mk = (seed, stops) => {
    const s = Sim.create(seed, DEFS.concat(FIXTURES), { stops });
    for (const p of ['Player', 'Opponent']) D(s, { type: 'Start', player: p });
    return s;
  };
  const passAll = s => {
    for (let i = 0; i < 12 && !s.choice && (s.stack.length || s.respond); i++)
      D(s, { type: 'Pass', player: s.priority });
  };
  const win = s => s.respond && [s.respond.kind, s.respond.stage];

  Tests.add('priority-write-guard', () => {
    // only js/sim/priority.js assigns priority, passes or respond (the tests may still build states by hand)
    if (typeof readRepoFile !== 'function') return; // the sources are read in Node
    const files = [...readRepoFile('index.html').matchAll(/<script src="(js\/[^"]+)">/g)].map(m => m[1]),
      W = /\.(priority|passes|respond)\s*(=(?!=)|\+\+|--|[-+]=)|(\+\+|--)\s*[\w.]+\.(priority|passes|respond)\b/,
      found = [];
    for (const f of files)
      if (f !== 'js/sim/priority.js')
        readRepoFile(f)
          .split('\n')
          .forEach((l, i) => W.test(l) && found.push(f.replace('js/sim/', '') + ':' + (i + 1)));
    xfail(
      'no file but js/sim/priority.js assigns priority, passes or respond' +
        (found.length ? ' (' + found.join(' ') + ')' : ''),
      !found.length
    );
  });

  Tests.add('priority-strict', () => {
    // js/sim/priority.js: each transition lists the situations it may start from; in the tests a wrong one throws
    const s = mk(2900, {}),
      before = JSON.stringify(s),
      threw = name => {
        try {
          Sim.prGo(s, name, []);
        } catch (e) {
          return e.message;
        }
        return '';
      };
    eq('an idle game: the situation is idle', Sim.prSituation(s), 'idle');
    check('passing on an empty stack throws', /passed from situation idle/.test(threw('passed')), threw('passed'));
    check('passing a window that is not open throws', /windowPassed from situation idle/.test(threw('windowPassed')));
    check('...and nothing changed', JSON.stringify(s) === before);
    check('an unknown transition throws', /Unknown priority transition/.test(threw('nope')));
  });

  Tests.add('priority-rules', () => {
    // ---- the non-turn player responds first: a stack object, triggers, every window ----
    let s = mk(2901, {});
    const A = s.active,
      F = Sim.other(A);
    const zp = take(s, A, 'zap', 'hand');
    D(s, { type: 'PlayCard', iid: zp.iid });
    eq('a spell on the stack: the other player answers first, the pass count is 0', [s.priority, s.passes], [F, 0]);
    D(s, { type: 'Pass', player: F });
    eq('one pass: priority goes over, nothing resolves', [s.priority, s.passes, s.stack.length], [A, 1, 1]);
    const z2 = take(s, A, 'zap', 'hand');
    D(s, { type: 'PlayCard', iid: z2.iid });
    eq('a push resets the count', [s.priority, s.passes, s.stack.length], [F, 0, 2]);
    D(s, { type: 'Pass', player: F });
    const r = D(s, { type: 'Pass', player: A });
    eq(
      'two passes in a row resolve the top object only, priority back to the turn player',
      [s.stack.length, s.priority, s.passes, r.events.filter(e => e.t === 'StackObjectResolved').length],
      [1, A, 0, 1]
    );
    passAll(s);

    // the "permanent entered" window opens with the enter trigger already on the stack: the non-turn player still answers first
    s = mk(2902, {});
    const hb = take(s, s.active, 'hummingbird', 'hand');
    D(s, { type: 'PlayCard', iid: hb.iid, slot: s.active + '|front|0' });
    eq(
      'enter trigger on the stack and the enter window open: the non-turn player has priority',
      [s.stack.length, win(s), s.priority],
      [1, ['enter', 'foe'], Sim.other(s.active)]
    );
    // resolving with a window open gives priority back to the window holder
    D(s, { type: 'Pass', player: s.priority });
    D(s, { type: 'Pass', player: s.priority });
    eq(
      'the trigger resolves inside the window: priority back to the window holder (the non-turn player)',
      [s.stack.length, win(s), s.priority],
      [0, ['enter', 'foe'], Sim.other(s.active)]
    );
    // stopAt never replaces an open window: the "stack emptied" stop above did not replace the enter window (stops on)
    const ALLE = Object.assign({ enter: true }, ALL);
    s = mk(2903, { Player: { opp: ALLE, own: ALLE }, Opponent: { opp: ALLE, own: ALLE } });
    passAll(s);
    const hb2 = take(s, s.active, 'hummingbird', 'hand');
    D(s, { type: 'PlayCard', iid: hb2.iid, slot: s.active + '|front|0' });
    D(s, { type: 'Pass', player: s.priority });
    const r2 = D(s, { type: 'Pass', player: s.priority });
    eq(
      'with every stop on, the stack-emptied stop does not replace the open enter window',
      [r2.events.some(e => e.t === 'StackEmptied'), r2.events.some(e => e.t === 'ResponseWindowOpened'), win(s)],
      [true, false, ['enter', 'foe']]
    );
    // the turn-player stage: the turn player answers in it, a stack resolving inside it gives priority back to them
    D(s, { type: 'Pass', player: s.priority });
    eq(
      'Q49: the foe passed, the turn player gets their own enter stop',
      [win(s), s.priority],
      [['enter', 'turn'], s.active]
    );
    const z3 = take(s, s.active, 'zap', 'hand');
    D(s, { type: 'PlayCard', iid: z3.iid });
    eq('a spell in the window: the other player answers first', s.priority, Sim.other(s.active));
    D(s, { type: 'Pass', player: s.priority });
    D(s, { type: 'Pass', player: s.priority });
    eq(
      '...it resolves: priority back to the window holder (the turn player)',
      [win(s), s.priority],
      [['enter', 'turn'], s.active]
    );
    D(s, { type: 'Pass', player: s.priority });
    eq('...then the window closes', [s.respond, s.priority], [null, s.active]);

    // ---- end step: when nobody wants the stop, the turn ends at once ----
    s = mk(2904, { Player: { opp: { end: false } }, Opponent: { opp: { end: false } } });
    const t0 = s.active,
      e = D(s, { type: 'EndTurn', player: t0 }).events.map(x => x.t);
    eq(
      'nobody wants the end step stop: the same command ends the turn, no window',
      [
        e.includes('EndStepEntered'),
        e.includes('TurnChanged'),
        e.includes('ResponseWindowOpened'),
        s.active,
        s.priority,
      ],
      [true, true, false, Sim.other(t0), Sim.other(t0)]
    );

    // ---- "main phase ended" with a deferred command: it runs once, or fails with DeferredCommandFailed ----
    s = mk(2905, { Player: { opp: { mainEnd: true } }, Opponent: { opp: { mainEnd: true } } });
    passAll(s);
    const ap0 = Sim.apCount(s, s.active);
    D(s, { type: 'SetAttackPhase', player: s.active, on: true });
    eq(
      'Combat in the main phase first opens the main-ended window',
      [win(s), s.attackPhase],
      [['mainEnd', 'foe'], false]
    );
    const d = D(s, { type: 'Pass', player: s.priority }).events.map(x => x.t);
    eq(
      '...the foe passes: it closes, then combat starts once (one action point)',
      [s.respond, s.attackPhase, ap0 - Sim.apCount(s, s.active), d.filter(t => t === 'AttackPhaseChanged').length],
      [null, true, 1, 1]
    );
    s = mk(2906, { Player: { opp: { mainEnd: true } }, Opponent: { opp: { mainEnd: true } } });
    passAll(s);
    D(s, { type: 'SetAttackPhase', player: s.active, on: true });
    while (Sim.apCount(s, s.active)) Sim.spendAP(s, s.active, 'test', []); // the press became illegal meanwhile
    const f = D(s, { type: 'Pass', player: s.priority }).events;
    eq(
      '...when the deferred press became illegal: DeferredCommandFailed, no combat',
      [f.filter(x => x.t === 'DeferredCommandFailed').map(x => x.cmd), s.attackPhase, s.respond],
      [['SetAttackPhase'], false, null]
    );
  });

  Tests.add('priority-shark', () => {
    // Deep Sea Shark: the second combat closes the "combat ended" window, the event at the same place in the stream
    const S = { Player: { opp: ALL, own: ALL }, Opponent: { opp: ALL, own: ALL } };
    const run = (seed, endTurn) => {
      const s = mk(seed, S);
      passAll(s);
      take(s, s.active, 'shark', 'board', s.active + '|front|0');
      D(s, { type: 'SetAttackPhase', player: s.active, on: true });
      passAll(s);
      if (endTurn) D(s, { type: 'EndTurn', player: s.active });
      else D(s, { type: 'SetAttackPhase', player: s.active, on: false });
      const before = [Sim.turnStage(s), win(s)];
      passAll(s);
      const ev = D(s, { type: 'Choose', player: s.active, option: '0' }).events.map(x => x.t);
      return { s, before, ev };
    };
    for (const endTurn of [false, true]) {
      const { s, before, ev } = run(2910 + endTurn, endTurn),
        i = ev.indexOf('ResponseWindowClosed');
      eq(
        'second combat from ' +
          (endTurn ? 'ending' : 'main') +
          ': the combat-ended window was open, the second combat closes it',
        [before, (s.respond && s.respond.kind) === 'combatEnd', s.attackPhase, Sim.turnStage(s)],
        [[endTurn ? 'ending' : 'main', ['combatEnd', 'foe']], false, true, 'combat']
      );
      eq(
        '...ResponseWindowClosed right after the 5 draws, before the new attack counters',
        [ev.filter(t => t === 'ResponseWindowClosed').length, ev.slice(i - 1, i + 2)],
        [1, ['CardDrawn', 'ResponseWindowClosed', 'AttackCountersPlaced']]
      );
    }
  });
})();

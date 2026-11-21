// harness.js - the test registry and the helpers every suite shares (no THREE, no DOM).
// A suite file (tests/suites/*.js) registers one or more named suites with Tests.add(name, fn). Tests.run(filter) runs them (all, or only
// the suites whose name equals / starts with one of the filter words) and returns the result lines ('PASS ...' / 'FAIL ...').
// Run one area:  node tests/run.js --only combat      (several: --only combat,stack)      browser: cardGame.selfTest('combat')
// List the suites: node tests/run.js --list
const Tests = (function () {
  const suites = [],
    out = [], // the result lines of the current run (shared by every helper below; cleared by run)
    D = (s, c) => Sim.dispatch(s, c),
    other = Sim.other;
  const check = (name, ok, detail) =>
    out.push((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  | ' + detail : ''));
  const eq = (name, got, want) =>
    check(
      name,
      JSON.stringify(got) === JSON.stringify(want),
      'expected ' + JSON.stringify(want) + ', got ' + JSON.stringify(got)
    );
  const xfail = (name, ok) =>
    out.push(ok ? 'FAIL (known bug looks fixed: turn into a normal check) ' + name : 'XFAIL (known bug) ' + name);
  // rej: the command must fail, for the stated reason, with no events and NO change to the game state at all
  const rej = (name, s, cmd, why) => {
    const before = JSON.stringify(s),
      r = D(s, cmd);
    check(
      name,
      !r.ok && r.why.includes(why) && !r.events.length && JSON.stringify(s) === before,
      r.ok
        ? 'command succeeded'
        : 'why="' + r.why + '", events=' + r.events.length + ', stateUnchanged=' + (JSON.stringify(s) === before)
    );
  };
  const start = (seed, extra) => {
    const s = Sim.create(seed, DEFS.concat(FIXTURES, extra || []));
    for (const p of ['Player', 'Opponent']) D(s, { type: 'Start', player: p });
    for (const p of ['Player', 'Opponent']) {
      const P = s.piles[p],
        i = P.hand.findIndex(c => c.def.id === 'shieldguard');
      if (i >= 0) {
        const c = P.hand.splice(i, 1)[0];
        c.loc = 'deck';
        P.deck.push(c);
        const n = P.deck.shift();
        n.loc = 'hand';
        P.hand.push(n);
      }
    } // Shieldguard in an opening hand would open an attack response window and skew unrelated combat tests
    return s;
  };
  const take = (s, o, id, loc, slot) => {
    // move a named card out of its pile into hand / gy / a board slot
    const c = Object.values(s.cards).find(x => x.owner === o && x.def.id === id),
      P = s.piles[o];
    for (const k of ['deck', 'hand', 'gy', 'extra', 'exile']) {
      const i = P[k].indexOf(c);
      if (i >= 0) P[k].splice(i, 1);
    }
    c.loc = loc;
    if (loc === 'hand') P.hand.push(c);
    else if (loc === 'gy') P.gy.push(c);
    else if (loc === 'exile') P.exile.push(c);
    else {
      s.slots[slot] = c.iid;
      c.slot = slot;
    }
    return c;
  };
  const toDeck = (s, o, id) => {
    const c = take(s, o, id, 'gy');
    s.piles[o].gy.pop();
    c.loc = 'deck';
    s.piles[o].deck.push(c);
    return c;
  };
  const pass2 = s => {
    D(s, { type: 'Pass', player: s.priority });
    return D(s, { type: 'Pass', player: s.priority });
  }; // both pass: the top object resolves
  const AT = (s, id) => {
    const r = D(s, { type: 'Attack', iid: id });
    drain(s);
    return r;
  }; // declare an attack and let the stack resolve (stops at a pending choice)
  const drain = s => {
    let n = 0;
    while ((s.stack.length || s.respond) && !s.choice && n++ < 40) D(s, { type: 'Pass', player: s.priority });
  };
  const endTurnFlow = s => {
    const p = s.active;
    D(s, { type: 'EndTurn', player: p });
    D(s, { type: 'Pass', player: other(p) });
  };
  const dmg = (s, c, n, type) =>
    Sim.addStatus(s, c, { kind: 'damage', amount: n, orig: n, type: type || 'effect', source: c.iid, srcName: 'test' }); // put a damage status on a card
  const ndmg = c => Sim.live(c).filter(x => x.kind === 'damage').length; // active damage statuses
  const dl = c =>
    Sim.live(c)
      .filter(x => x.kind === 'damage')
      .map(d => [d.amount, d.type, d.source]);
  const setLife = (s, p, n) => {
    Sim.addStatus(s, s.players[p], { kind: 'damage', amount: s.life[p] - n, type: 'effect', srcName: 'test' });
    s.life[p] = Sim.lifeOf(s, p);
  };
  const shield = (s, c, color) => Sim.addStatus(s, c, { kind: 'shield', color, srcName: 'test' });
  const ap = (s, p) => Sim.apCount(s, p || s.active); // unspent action points (default: the turn player)
  const kinds = (c, k) => Sim.live(c).filter(x => x.kind === k);
  const owners = st => st.stack.map(o => st.cards[o.src].owner);
  const tokens = st => Object.values(st.cards).filter(x => x.def.id === 'vine-token' && x.loc === 'board');
  const abTokens = st => Object.values(st.cards).filter(x => x.def.type === 'ability');

  // helpers a suite file destructures:  const { D, check, eq, rej, start, take, ... } = Tests.ctx;
  const ctx = {
    out,
    D,
    other,
    check,
    eq,
    xfail,
    rej,
    start,
    take,
    toDeck,
    pass2,
    AT,
    drain,
    endTurnFlow,
    dmg,
    ndmg,
    dl,
    setLife,
    shield,
    ap,
    kinds,
    owners,
    tokens,
    abTokens,
  };
  const wanted = (name, want) => !want.length || want.some(w => name === w || name.startsWith(w));
  return {
    ctx,
    suites,
    add: (name, fn) => suites.push({ name, fn }),
    names: () => suites.map(s => s.name),
    run(only) {
      const want = []
        .concat(only || [])
        .flatMap(x => String(x).split(','))
        .map(x => x.trim())
        .filter(Boolean);
      out.length = 0;
      let n = 0;
      for (const s of suites) {
        if (!wanted(s.name, want)) continue;
        n++;
        try {
          s.fn();
        } catch (e) {
          out.push('FAIL suite "' + s.name + '" threw  | ' + ((e && e.stack) || e)); // one broken suite never hides the others
        }
      }
      if (!n) out.push('FAIL no suite matches "' + want.join(',') + '"  | suites: ' + suites.map(s => s.name).join(', '));
      out.push(
        '---- ' +
          out.filter(l => l.startsWith('PASS')).length +
          ' passed, ' +
          out.filter(l => l.startsWith('FAIL')).length +
          ' failed, ' +
          out.filter(l => l.startsWith('XFAIL')).length +
          ' known bug(s) documented' +
          (want.length ? ' (only: ' + want.join(', ') + ', ' + n + ' suites)' : '')
      );
      console.log(out.join('\n'));
      return out.slice();
    },
  };
})();

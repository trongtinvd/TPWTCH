// 26-golden-replays.js - recorded bot-vs-bot games (tests/golden/replays.json): seed, options, both decks, the commands, a hash of
// every command's events and of the final state (card definitions by id). Replaying the commands must give exactly the same events and the same final state,
// and the bot must choose exactly the same commands again. This is the safety net for refactors (anything that changes a result shows
// here, with the game and the command number) and the spec a port of the rules (Godot) must replay identically.
// After an INTENDED rules or bot change: node tests/run.js --record-golden (rewrites the file; review and commit the diff).
// Run only these: node tests/run.js --only golden
(function () {
  const { check, eq } = Tests.ctx;
  const headless = typeof readRepoFile === 'function';
  const STOPS = {
    turnStart: true,
    draw: true,
    mainStart: true,
    mainEnd: true,
    combatStart: true,
    combatEnd: true,
    stack: true,
  };
  // FNV-1a over a string (32 bit, hex): the same in any language
  const hash = str => {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0;
    return h.toString(16).padStart(8, '0');
  };
  const stateHash = s => hash(JSON.stringify(s, (k, v) => (k === 'def' ? v && v.id : v))); // a card's definition is content, not state: its id stands for it
  // the games: varied seeds, decks and options. Decks are stored as card ids, so a new card in the pool does not change them
  const SPECS = () => {
    const pool = DEFS.filter(d => !d.extra && !d.token && d.type !== 'ability').map(d => d.id),
      extra = DEFS.filter(d => d.extra).map(d => d.id),
      aggro = BUILTIN_DECKS[1].cards.slice(),
      pick = (seed, n) => {
        const r = botRng(seed),
          a = pool.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(r() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a.slice(0, n);
      },
      out = [];
    for (let g = 0; g < 12; g++)
      out.push({
        seed: 2000 + g,
        bot: 31 + g,
        decks: {
          Player: g % 3 === 0 ? pool.slice() : pick(100 + g, 14),
          Opponent: g % 4 === 1 ? aggro.slice() : pick(200 + g, 14),
        },
        extra: { Player: extra.slice(), Opponent: g % 2 ? extra.slice() : [] },
        stops: g % 2 === 0 ? STOPS : null,
        orderTriggers: g % 3 === 1,
        rules: g % 4 === 3 ? { strikeBack: true } : {},
      });
    return out;
  };
  const create = sp =>
    Sim.create(sp.seed, DEFS, {
      decks: sp.decks,
      extra: sp.extra,
      stops: sp.stops,
      orderTriggers: sp.orderTriggers,
      rules: sp.rules,
      shuffle: true,
      autoStart: true,
    });
  const MAX = 700;
  function record(sp) {
    const s = create(sp),
      rnd = botRng(sp.bot),
      mem = {},
      cmds = [],
      ev = [];
    for (let i = 0; i < MAX && !s.result; i++) {
      const cmd = botChoose(s, botActor(s), rnd, mem);
      if (!cmd) break;
      const r = Sim.dispatch(s, cmd);
      cmds.push(cmd);
      ev.push(hash(JSON.stringify(r.events)));
    }
    return Object.assign({}, sp, { cmds, ev, final: stateHash(s), result: s.result, turn: s.turn });
  }
  if (typeof GOLDEN_RECORD !== 'undefined')
    Tests.add('golden-record', () => {
      GOLDEN_RECORD.games = SPECS().map(record);
    });

  Tests.add('golden-replays', () => {
    if (!headless) return; // the file is read from the repo (Node)
    const G = JSON.parse(readRepoFile('tests/golden/replays.json')).games;
    check('12 recorded games, most of them decided', G.length === 12 && G.filter(g => g.result).length >= 8);
    const bad = [];
    for (const [k, g] of G.entries()) {
      // 1. the commands alone give the same events and the same final state
      const s = create(g);
      let i = 0;
      for (; i < g.cmds.length; i++) {
        const r = Sim.dispatch(s, structuredClone(g.cmds[i]));
        if (hash(JSON.stringify(r.events)) !== g.ev[i]) break;
      }
      if (i < g.cmds.length)
        bad.push('game ' + k + ': events differ at command ' + i + ' ' + JSON.stringify(g.cmds[i]));
      else if (stateHash(s) !== g.final) bad.push('game ' + k + ': final state differs');
      // 2. the bot chooses the same commands again
      const again = record(g);
      if (JSON.stringify(again.cmds) !== JSON.stringify(g.cmds)) {
        const j = again.cmds.findIndex((c, n) => JSON.stringify(c) !== JSON.stringify(g.cmds[n]));
        bad.push('game ' + k + ': the bot chose differently at command ' + (j < 0 ? again.cmds.length : j));
      }
    }
    eq('every recorded game replays identically (events, final state, bot choices)', bad.slice(0, 4), []);
  });
})();

// bot-match.js - Bot vs Bot: both seats played by bots, headless (no THREE, no DOM; the tests load it too).
// A match is a replay record (the format of js/screens/replay.js) plus `bb` = {seed, bots: {Player, Opponent}}: the Sim seed and the bot
// seeds all come from bb.seed, so the same seed, decks, options and bots always play the same game (and BotMatch.run can redo it).
// BOTS is the list the start panel offers; a new bot is one more entry with the same decide() signature.
const BOTS = {
  random: {
    name: 'Random',
    note: 'Plays any legal command, weighted (attacks and plays before Draw / End turn). Never responds.',
    decide: (s, p, rnd, mem, trace) => botChoose(s, p, rnd, mem, trace),
  },
};
const BOT_IDS = Object.keys(BOTS);
const botName = id => (BOTS[id] ? BOTS[id].name : id);
// the Sim of a replay record (the same options as the replay viewer uses)
function recSim(rec) {
  return Sim.create(rec.n, DEFS, {
    decks: { Player: rec.d1, Opponent: rec.d2 },
    extra: { Player: rec.x1 || [], Opponent: rec.x2 || [] },
    shuffle: rec.sh,
    autoStart: true,
    stops: rec.stops,
    orderTriggers: !!rec.ot,
    rules: rec.rules || {},
    names: rec.names,
    avatars: rec.avatars,
  });
}
const BotMatch = (function () {
  const MAX = 4000; // commands: a game that runs longer stops (the record says why)
  // each seat's bot gets its own generator, derived from the seed (seat 1 / seat 2)
  const botSeed = (seed, k) => (Math.imul(seed >>> 0, 2654435761) + k * 40503) >>> 0 || k;
  // the record of a new match. cfg: {seed, bots:{Player,Opponent}, d1, d2, x1, x2, a, b, rules, sh, stops}
  function record(cfg) {
    const bots = { Player: cfg.bots.Player || 'random', Opponent: cfg.bots.Opponent || 'random' };
    return {
      v: 1,
      n: cfg.seed,
      d1: cfg.d1.slice(),
      d2: cfg.d2.slice(),
      x1: (cfg.x1 || []).slice(),
      x2: (cfg.x2 || []).slice(),
      sh: cfg.sh !== false,
      stops: cfg.stops || null,
      ot: true,
      rules: cfg.rules || {},
      names: { Player: 'Bot 1 (' + botName(bots.Player) + ')', Opponent: 'Bot 2 (' + botName(bots.Opponent) + ')' },
      avatars: cfg.avatars,
      mode: 'botbot',
      kind: 'botbot',
      a: cfg.a,
      b: cfg.b,
      bb: { seed: cfg.seed, bots },
      cmds: [],
    };
  }
  // plays the match. opts.trace: keep each bot decision (debug log). Returns {rec (with cmds), traces, state, end}
  // end: 'decided' | 'max' (MAX commands) | 'stuck' (the bot had no legal command)
  function run(rec, opts = {}) {
    const s = recSim(rec),
      bb = rec.bb,
      seats = ['Player', 'Opponent'],
      rnd = {},
      mem = {},
      traces = [],
      cmds = [],
      max = opts.max || MAX;
    seats.forEach((p, k) => {
      rnd[p] = botRng(botSeed(bb.seed, k + 1));
      mem[p] = { turn: -1, n: 0 };
    });
    let end = 'max';
    for (let i = 0; i < max; i++) {
      if (s.result) {
        end = 'decided';
        break;
      }
      const p = Sim.actor(s),
        bot = BOTS[bb.bots[p]] || BOTS.random,
        tr = opts.trace ? { seat: p, bot: bb.bots[p] } : null,
        cmd = bot.decide(s, p, rnd[p], mem[p], tr);
      if (!cmd) {
        end = 'stuck';
        break;
      }
      const r = Sim.dispatch(s, cmd);
      if (!r.ok) {
        end = 'stuck';
        break;
      } // (cannot happen: the bot checks every command first)
      cmds.push(JSON.parse(JSON.stringify(cmd)));
      if (tr) traces.push(tr);
    }
    if (s.result) end = 'decided';
    return { rec: Object.assign({}, rec, { cmds, end }), traces, state: s, end };
  }
  return { record, run, botSeed, MAX };
})();

// 27-bot-match-debuglog.js - Bot vs Bot matches (js/game/bot-match.js) and the debug log (js/log/debuglog.js).
// Run only these: node tests/run.js --only bot-match,debuglog
(function () {
  const { check, eq } = Tests.ctx;
  const STOPS = {
    turnStart: true,
    draw: true,
    mainStart: true,
    mainEnd: true,
    combatStart: true,
    combatEnd: true,
    stack: true,
  };
  const recOf = (seed, rules) =>
    BotMatch.record({
      seed,
      bots: { Player: 'random', Opponent: 'random' },
      d1: BUILTIN_DECKS[0].cards,
      d2: BUILTIN_DECKS[1].cards,
      x1: BUILTIN_DECKS[0].extra || [],
      x2: BUILTIN_DECKS[1].extra || [],
      a: BUILTIN_DECKS[0].name,
      b: BUILTIN_DECKS[1].name,
      rules: rules || {},
      stops: STOPS,
    });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  Tests.add('bot-match', () => {
    check(
      'the bot list offers the random bot, with a name and a note',
      !!BOTS.random && !!BOTS.random.name && !!BOTS.random.note
    );
    const rec = recOf(777);
    eq(
      'a match record: replay format, kind botbot, seed and bots kept',
      [rec.kind, rec.n, rec.bb.seed, rec.bb.bots, rec.cmds.length],
      ['botbot', 777, 777, { Player: 'random', Opponent: 'random' }, 0]
    );
    check(
      'the seats are named after their bots',
      rec.names.Player.includes('Random') && rec.names.Opponent.startsWith('Bot 2')
    );
    const a = BotMatch.run(rec),
      b = BotMatch.run(rec),
      c = BotMatch.run(recOf(778));
    check(
      'a match ends: decided, or stopped with a reason',
      ['decided', 'max', 'stuck'].includes(a.end) && a.rec.end === a.end
    );
    check('the same seed plays exactly the same match', a.rec.cmds.length > 10 && same(a.rec.cmds, b.rec.cmds));
    check('another seed plays another match', !same(a.rec.cmds, c.rec.cmds));
    check('the input record is not changed', rec.cmds.length === 0);
    // the record replays to the same final state (it is a normal replay record)
    const s = recSim(a.rec);
    const bad = a.rec.cmds.findIndex(cmd => !Sim.dispatch(s, structuredClone(cmd)).ok);
    check(
      'every recorded command replays, to the same final state',
      bad < 0 && same(s.result, a.state.result) && s.turn === a.state.turn,
      'refused at ' + bad
    );
    // decided games: most seeds end with a winner (the bots are random but they attack)
    const ends = [11, 12, 13, 14, 15, 16].map(n => BotMatch.run(recOf(n)).end);
    check('most matches are decided', ends.filter(e => e === 'decided').length >= 4, ends.join(','));
    // traces: one per command, and they do not change what the bot chooses
    const t = BotMatch.run(rec, { trace: true });
    check('tracing does not change the match', same(t.rec.cmds, a.rec.cmds));
    check('one bot decision per command', t.traces.length === t.rec.cmds.length);
    check(
      'each decision ends with the chosen command, every earlier try was refused',
      t.traces.every((tr, i) => {
        const L = tr.tried,
          last = L[L.length - 1];
        return (
          last.ok && same(last.cmd, t.rec.cmds[i]) && L.slice(0, -1).every(x => !x.ok) && tr.main + tr.fallback >= 1
        );
      })
    );
    check(
      'a decision names its seat and bot',
      t.traces.every(tr => tr.bot === 'random' && (tr.seat === 'Player' || tr.seat === 'Opponent'))
    );
    // the game options reach the match
    const sb = BotMatch.run(recOf(777, { life: 7, strikeBack: true }));
    check(
      'the game options are used (starting HP 7, strike back)',
      recSim(sb.rec).life.Player === 7 && recSim(sb.rec).cfg.strikeBack === true
    );
    eq(
      'the bot seeds differ per seat and follow the seed',
      [
        BotMatch.botSeed(5, 1) !== BotMatch.botSeed(5, 2),
        BotMatch.botSeed(5, 1) === BotMatch.botSeed(5, 1),
        BotMatch.botSeed(5, 1) !== BotMatch.botSeed(6, 1),
      ],
      [true, true, true]
    );
  });

  Tests.add('debuglog', () => {
    const m = BotMatch.run(recOf(4242)),
      b = DebugLog.build(m.rec);
    check(
      'a record builds one entry per command, with nothing refused',
      b.entries.length === m.rec.cmds.length && !b.stopped
    );
    check(
      'a Bot vs Bot record gets its bot decisions back',
      b.entries.every(x => x.src === 'bot' && x.bot.startsWith('bot Random'))
    );
    // the context is the state BEFORE the command
    const s = recSim(m.rec),
      x0 = b.entries[0];
    eq(
      'the first entry shows the state before it',
      [x0.ctx.turn, x0.ctx.life, x0.ctx.hand],
      [
        s.turn,
        { Player: s.life.Player, Opponent: s.life.Opponent },
        { Player: s.piles.Player.hand.length, Opponent: s.piles.Opponent.hand.length },
      ]
    );
    check(
      'the context line names the stage, who acts and the piles',
      /^T1 P[12] \S+ · acts P[12]/.test(x0.ctxText) && x0.ctxText.includes('HP 20/20') && x0.ctxText.includes('deck ')
    );
    // what changed: a hit shows as a life change, a draw as hand / deck changes
    const hit = b.entries.find(x => x.events.some(e => e.t === 'PlayerDamaged'));
    check('damage to a player shows in what changed', !!hit && hit.delta.some(d => / life \d+→\d+/.test(d)));
    const dr = [4242, 1, 2, 3, 4, 5, 6, 7]
      .map(n => DebugLog.build(BotMatch.run(recOf(n)).rec).entries.find(x => x.cmd.type === 'Draw'))
      .find(x => x);
    check(
      'a Draw shows hand and deck changes and the spent action point',
      !!dr && ['hand', 'deck', 'ap'].every(k => dr.delta.some(d => d.includes(' ' + k + ' ')))
    );
    check(
      'the decisive command shows the result',
      b.entries[b.entries.length - 1].delta.some(d => d.startsWith('RESULT')) === !!m.state.result
    );
    // events: every event type has a sentence; cards show as Name#iid[owner]; the fields list every field
    const types = new Set(),
      bare = new Set();
    for (const n of [1, 2, 3, 4, 5, 6])
      for (const x of DebugLog.build(BotMatch.run(recOf(900 + n)).rec).entries)
        for (const e of x.events) {
          types.add(e.t);
          if (e.text === e.t) bare.add(e.t);
        }
    eq('every event type the bots caused has a sentence', [...bare], []);
    check('many event types were seen', types.size >= 15, types.size);
    if (typeof readRepoFile === 'function') {
      // every event the Sim can emit (scanned from its source) has a sentence, not only the ones these games caused
      const files = [...readRepoFile('index.html').matchAll(/<script src="(js\/sim\/[^"]+)">/g)].map(m => m[1]),
        all = new Set(files.flatMap(f => [...readRepoFile(f).matchAll(/\bt: '([A-Z][A-Za-z]+)'/g)].map(m => m[1]))),
        missing = [...all].filter(t => DebugLog.evText(recSim(m.rec), { t }) === t);
      eq('every Sim event type has a sentence in the debug log', missing, []);
    }
    const pl = b.entries.flatMap(x => x.events).find(e => e.t === 'CardPlayed');
    check(
      'cards show as Name#iid[P1/P2]',
      !!pl && /#\S+\[P[12]\]/.test(pl.text) && /iid=.+#\S+\[P[12]\]/.test(pl.fields)
    );
    check(
      'a command shows its cards by name',
      b.entries.filter(x => x.cmd.iid).every(x => /#\S+\[P[12]\]/.test(x.cmdText))
    );
    // the text and JSON exports
    const txt = DebugLog.exportText(m.rec, { date: 'D' });
    check(
      'the text export starts with the match header',
      txt.startsWith('TPWTCH debug log · D') && txt.includes('seed: 4242') && txt.includes('bots: P1 Random, P2 Random')
    );
    check(
      'the text export lists the opening hands and decks (#0)',
      /\n#0 · /.test(txt) && txt.includes('  P1 hand: ') && txt.includes('  P2 deck: ')
    );
    eq('the text export has one block per command', (txt.match(/\n#\d+ · /g) || []).length - 1, m.rec.cmds.length);
    const J = JSON.parse(DebugLog.exportJSON(m.rec, { date: 'D' }));
    check(
      'the JSON export holds the record and every entry',
      J.format === 'tpwtch-debuglog' &&
        same(J.record.cmds, m.rec.cmds) &&
        J.entries.length === m.rec.cmds.length &&
        same(J.result, m.state.result)
    );
    // entries already made (the running game's log) are used when they are the whole record
    const have = { entries: b.entries.map(x => Object.assign({}, x, { src: 'auto' })), state: b.state };
    check(
      'the running game log is used when it covers the record',
      DebugLog.exportText(m.rec, {}, have).includes('[auto]')
    );
    check(
      'a partial log is not used: the record is replayed',
      !DebugLog.exportText(m.rec, {}, { entries: have.entries.slice(1), state: b.state }).includes('[auto]')
    );
    // a record that is not Bot vs Bot: no bot decisions, sender player
    const plain = Object.assign({}, m.rec, { bb: undefined, kind: 'self' }),
      pb = DebugLog.build(plain);
    check(
      'a Vs Self record: no bot decisions, sender player',
      pb.entries.every(x => x.src === 'player' && !x.bot)
    );
    // a changed record stops where it no longer fits
    const broken = Object.assign({}, plain, { cmds: plain.cmds.slice(0, 3).concat([{ type: 'Attack', iid: 'nope' }]) });
    check(
      'a command the game refuses stops the log, with the reason',
      /^command 4 refused: /.test(DebugLog.build(broken).stopped || '')
    );
  });
})();

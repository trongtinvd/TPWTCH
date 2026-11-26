// debuglog.js - the debug log: every accepted command with the game state around it, for finding bugs (headless: the tests load it).
// One entry per command: where the game stood before it (turn, stage, who acts, life, action points, piles, stack, a pending choice),
// the command with card names, who sent it (player / auto / bot / replay) and, for a bot, every command it tried, then each rule event
// (a sentence plus all its fields, cards as Name#iid[P1]) and what changed (life, piles, stage...). This is ALL information (both hands,
// the decks): the players' own logs stay in narrate.js.
// The "All events" mode of the game log shows these entries; build(rec) replays a whole record headless for the exported file.
const DebugLog = (function () {
  const SEATS = ['Player', 'Opponent'],
    seat = p => (p === 'Player' ? 'P1' : p === 'Opponent' ? 'P2' : String(p)),
    nm = (s, p) => (s.names && s.names[p]) || seat(p),
    stopName = k => (typeof STOP_NAMES !== 'undefined' && STOP_NAMES[k]) || k;
  // a card: Name#iid[P1] (owner); a number that is no card stays a number
  const ref = (s, iid) => {
    const c = s.cards && s.cards[iid];
    return c ? c.def.name + '#' + iid + '[' + seat(c.owner) + ']' : String(iid);
  };
  const CARD_KEYS = new Set(['iid', 'source', 'target', 'attacker', 'option', 'card']);
  // ---- the state in one line
  function snap(s) {
    const P = s.piles || {},
      n = (p, k) => (P[p] && P[p][k] ? P[p][k].length : 0),
      per = f => ({ Player: f('Player'), Opponent: f('Opponent') }),
      board = p => Object.values(s.slots || {}).filter(id => id && s.cards[id] && Sim.ctl(s.cards[id]) === p).length;
    return {
      turn: s.turn,
      phase: s.phase,
      stage: s.turnEnding ? 'ending' : s.step,
      combat: !!s.attackPhase,
      active: s.active,
      priority: s.priority,
      actor: Sim.actor(s),
      life: per(p => s.life[p]),
      ap: per(p => Sim.apCount(s, p)),
      hand: per(p => n(p, 'hand')),
      deck: per(p => n(p, 'deck')),
      gy: per(p => n(p, 'gy')),
      exile: per(p => n(p, 'exile')),
      extra: per(p => n(p, 'extra')),
      board: per(board),
      stack: (s.stack || []).length,
      respond: s.respond ? s.respond.kind : null,
      choice: s.choice
        ? { player: s.choice.player, kind: s.choice.kind || 'pick', n: (s.choice.options || []).length }
        : null,
      result: s.result ? Object.assign({}, s.result) : null,
    };
  }
  const pair = o => o.Player + '/' + o.Opponent;
  function ctxText(x) {
    return [
      'T' +
        x.turn +
        ' ' +
        seat(x.active) +
        ' ' +
        (x.phase === 'play' ? x.stage + (x.combat && x.stage !== 'combat' ? '+combat' : '') : x.phase),
      'acts ' + seat(x.actor) + (x.priority !== x.actor ? ' (prio ' + seat(x.priority) + ')' : ''),
      'HP ' + pair(x.life),
      'AP ' + pair(x.ap),
      'hand ' + pair(x.hand),
      'deck ' + pair(x.deck),
      'gy ' + pair(x.gy),
      'board ' + pair(x.board),
      'stack ' + x.stack,
    ]
      .concat(x.respond ? ['stop ' + x.respond] : [])
      .concat(x.choice ? ['choice ' + seat(x.choice.player) + ':' + x.choice.kind + '(' + x.choice.n + ')'] : [])
      .join(' · ');
  }
  // what changed between two snapshots
  function delta(a, b) {
    const out = [];
    for (const k of ['life', 'ap', 'hand', 'deck', 'gy', 'exile', 'extra', 'board'])
      for (const p of SEATS) if (a[k][p] !== b[k][p]) out.push(seat(p) + ' ' + k + ' ' + a[k][p] + '→' + b[k][p]);
    for (const k of ['turn', 'stage', 'phase', 'active', 'priority', 'stack', 'respond'])
      if (a[k] !== b[k]) out.push(k + ' ' + a[k] + '→' + b[k]);
    if (a.combat !== b.combat) out.push('combat ' + (b.combat ? 'on' : 'off'));
    if (!a.result && b.result)
      out.push('RESULT ' + (b.result.winner ? seat(b.result.winner) + ' wins' : 'draw') + ' (' + b.result.why + ')');
    return out;
  }
  // ---- commands and events
  const val = (s, k, v) =>
    CARD_KEYS.has(k) && s.cards && s.cards[v] ? ref(s, v) : typeof v === 'object' ? JSON.stringify(v) : String(v);
  function cmdText(s, c) {
    const parts = [c.type];
    if (c.player) parts.push(seat(c.player));
    for (const [k, v] of Object.entries(c))
      if (k !== 'type' && k !== 'player' && v != null) parts.push(k + '=' + val(s, k, v));
    return parts.join(' ');
  }
  const fields = (s, e) =>
    Object.entries(e)
      .filter(([k]) => k !== 't')
      .map(([k, v]) => k + '=' + val(s, k, v))
      .join(' ');
  // one sentence per rule event (s = the state after the command)
  const T = {
    DeckReordered: (s, e) => nm(s, e.player) + ' reordered their deck',
    PlayerReady: (s, e) => nm(s, e.player) + ' pressed Start',
    GameStarted: () => 'opening hands dealt, the game starts',
    CardDrawn: (s, e) => nm(s, e.player) + ' draws ' + ref(s, e.iid),
    CardAdded: (s, e) => ref(s, e.iid) + ' goes to ' + nm(s, e.player) + '’s hand' + (e.debug ? ' (debug)' : ''),
    CardMilled: (s, e) => ref(s, e.iid) + ' milled from ' + nm(s, e.player) + '’s deck',
    CardDiscarded: (s, e) => ref(s, e.iid) + ' discarded',
    CardPlayed: (s, e) => nm(s, e.player) + ' plays ' + ref(s, e.iid),
    CardExiled: (s, e) => ref(s, e.iid) + ' exiled',
    PermanentSummoned: (s, e) => ref(s, e.iid) + ' enters ' + e.slot,
    PermanentMoved: (s, e) => ref(s, e.iid) + ' shifts to ' + e.slot,
    PermanentDestroyed: (s, e) =>
      ref(s, e.iid) +
      ' sent from the field to the graveyard' +
      (e.by === 'rule'
        ? ' by the rules' + (e.why ? ' (' + e.why + ')' : '')
        : e.by === 'cost'
          ? ' as a cost'
          : ' by an effect'),
    PermanentReturned: (s, e) => ref(s, e.iid) + ' returned to its owner’s hand',
    StackObjectCreated: (s, e) => ref(s, e.iid) + (e.attack ? ' (Attack)' : '') + ' put on the stack',
    StackObjectResolved: (s, e) => ref(s, e.iid) + ' resolves',
    StackObjectCountered: (s, e) => ref(s, e.iid) + ' countered (stack HP -1 or lower)',
    StackObjectDamaged: (s, e) => 'stack object #' + e.sid + ' takes ' + e.amount + ' damage',
    StackObjectFizzled: (s, e) => 'stack object #' + e.sid + ' fizzles (its target is gone)',
    StackEmptied: () => 'the stack is empty',
    PriorityPassed: (s, e) => 'priority passes to ' + nm(s, e.to),
    ResponseWindowOpened: (s, e) =>
      'stop: ' + stopName(e.kind) + ' (' + nm(s, e.player || Sim.other(s.active)) + ' may respond)',
    ResponseWindowClosed: (s, e) => 'stop closed: ' + stopName(e.kind),
    EndStepEntered: () => 'end step',
    DrawStepEntered: (s, e) => nm(s, e.player) + '’s draw phase',
    StopChanged: (s, e) =>
      nm(s, e.player) + ' stop "' + stopName(e.kind) + '" (' + e.role + ') ' + (e.on ? 'on' : 'off'),
    AutoPickChanged: (s, e) => nm(s, e.player) + ' automatic pick of a single option ' + (e.on ? 'on' : 'off'),
    TurnChanged: (s, e) => 'turn ' + s.turn + ': ' + nm(s, e.active) + '’s turn begins',
    AttackPhaseChanged: (s, e) => 'combat ' + (e.on ? 'started' : 'ended'),
    CombatSkipped: (s, e) => nm(s, e.player) + '’s combat is skipped (End turn instead)',
    CreatureAttackDeclared: (s, e) =>
      ref(s, e.iid) + ' attacks column ' + (e.col + 1) + (e.extra ? ' (extra attack)' : ''),
    AttackCancelled: (s, e) => 'the Attack of ' + ref(s, e.iid) + ' is cancelled',
    AttackBoosted: (s, e) => 'Attack #' + e.sid + ' gets +' + e.amount + ' damage',
    DamageDealt: (s, e) => ref(s, e.source) + ' deals ' + e.amount + ' ' + e.type + ' damage to ' + ref(s, e.target),
    DamageDenied: (s, e) => e.amount + ' damage denied on ' + (e.target ? ref(s, e.target) : 'stack object #' + e.sid),
    DamageRemoved: (s, e) => e.amount + ' damage removed from ' + ref(s, e.target),
    PlayerDamaged: (s, e) => nm(s, e.player) + ' takes ' + e.amount + ' damage' + (e.combat ? ' (combat)' : ''),
    LifePaid: (s, e) => nm(s, e.player) + ' pays ' + e.amount + ' life',
    LifeCounterAdded: (s, e) => 'life gained: +' + e.amount,
    CounterAdded: (s, e) => ref(s, e.iid) + ' gets a ' + e.color + ' shield',
    ZoneUnusable: (s, e) => e.slot + ' becomes unusable',
    SecretPlaced: (s, e) =>
      nm(s, e.player) +
      ' places secret #' +
      e.id +
      ' (' +
      e.name +
      ') on ' +
      (e.card ? ref(s, e.card) : e.slot) +
      ' (' +
      (e.cands || []).length +
      ' candidates)',
    SecretRevealed: (s, e) =>
      'secret #' + e.id + ' (' + e.name + ') on ' + (e.card ? ref(s, e.card) : e.slot) + ' triggers',
    HandRevealed: (s, e) =>
      nm(s, e.player) + ' reveals their hand to ' + nm(s, e.to) + ' (' + (e.iids || []).length + ' cards)',
    HistoryCapReached: () => 'the history limit was reached: the game is over',
    ZoneDamaged: (s, e) => e.slot + ' takes ' + e.amount + ' zone damage',
    AbilitiesTransformed: (s, e) => ref(s, e.iid) + ' takes on new abilities (was ' + e.from + ')',
    AbilityActivated: (s, e) => ref(s, e.iid) + ' activates ability #' + (e.ab + 1) + ' (' + e.speed + ')',
    ChoiceRequested: (s, e) => nm(s, e.player) + ' must choose',
    ChoiceMade: (s, e) => nm(s, e.player) + ' chose',
    ActionPointGained: (s, e) => nm(s, e.player) + ' gains an action point',
    ActionPointSpent: (s, e) => nm(s, e.player) + ' spends an action point: ' + e.why,
    CardRevealed: (s, e) => ref(s, e.iid) + ' is revealed by ' + nm(s, e.player),
    EffectFailed: (s, e) => ref(s, e.iid) + ' fails: ' + e.why,
    CardReturnedExtra: (s, e) => ref(s, e.iid) + ' returns to the extra deck',
    AttackCountersPlaced: (s, e) => nm(s, e.player) + ' gets ' + e.n + ' attack counter(s) for this combat',
    StrikeBack: (s, e) => ref(s, e.source) + ' strikes back at ' + ref(s, e.target) + ' for ' + e.amount,
    StatusSpent: (s, e) => ref(s, e.iid) + ' spends its "' + e.kind + '" status',
    DeferredCommandFailed: (s, e) => 'the follow-up ' + e.cmd + ' could not run: ' + e.why,
    CoinToss: (s, e) => 'the distances are tied: a coin toss gives ' + nm(s, e.winner) + ' the first turn',
    RaceAdvanced: (s, e) =>
      nm(s, e.player) + ' advances ' + e.by + ' (distance ' + e.distance + ', speed ' + e.speed + ')',
    GameDecided: (s, e) => 'GAME DECIDED: ' + (e.winner ? nm(s, e.winner) + ' wins' : 'draw') + ' (' + e.why + ')',
  };
  const evText = (s, e) => (T[e.t] ? T[e.t](s, e) : e.t);
  // a bot decision: how many candidates it had and every command it tried, in order
  function traceText(s, tr) {
    if (!tr || !tr.tried) return '';
    const tried = tr.tried.map(
      x => (x.ok ? '✓ ' : '✗ ') + cmdText(s, x.cmd) + ' (w' + x.w + (x.tier === 'fallback' ? ', fallback' : '') + ')'
    );
    return (
      'bot ' +
      (typeof botName === 'function' ? botName(tr.bot) : tr.bot) +
      ' ' +
      seat(tr.seat) +
      ': ' +
      tr.main +
      ' candidate(s)' +
      (tr.fallback ? ' + ' + tr.fallback + ' fallback' : '') +
      ', tried ' +
      tr.tried.length +
      ': ' +
      tried.join(' | ')
    );
  }
  // ---- one entry per command (pre = the state before, post = after)
  function entry(pre, post, cmd, events, src, trace) {
    const a = snap(pre),
      b = snap(post);
    return {
      src: src || 'player',
      ctx: a,
      ctxText: ctxText(a),
      cmd: JSON.parse(JSON.stringify(cmd)),
      cmdText: cmdText(post, cmd),
      bot: trace ? traceText(post, trace) : '',
      events: events.map(e => ({ t: e.t, text: evText(post, e), fields: fields(post, e), raw: e })),
      delta: delta(a, b),
    };
  }
  const head = (x, i) => '#' + (i + 1) + ' · ' + x.ctxText;
  function entryText(x, i) {
    const L = [head(x, i), '  > ' + x.cmdText + (x.src !== 'player' ? '   [' + x.src + ']' : '')];
    if (x.bot) L.push('  ? ' + x.bot);
    const w = Math.max(0, ...x.events.map(e => e.t.length));
    for (const e of x.events)
      L.push('    ' + e.t.padEnd(w) + '  ' + e.text + (e.fields ? '   {' + e.fields + '}' : ''));
    if (x.delta.length) L.push('  = ' + x.delta.join(', '));
    return L.join('\n');
  }
  // ---- a whole record (replay format), replayed headless. opts.traces: bot decisions per command (else, for a Bot vs Bot record, they are
  // made again with BotMatch.run, and used only when the bots choose exactly the recorded commands)
  function build(rec, opts = {}) {
    const s = recSim(rec);
    let traces = opts.traces || null;
    if (!traces && rec.bb && typeof BotMatch !== 'undefined') {
      const again = BotMatch.run(Object.assign({}, rec, { cmds: [] }), { trace: true, max: rec.cmds.length });
      if (JSON.stringify(again.rec.cmds) === JSON.stringify(rec.cmds)) traces = again.traces;
    }
    const entries = [];
    let stopped = null;
    rec.cmds.forEach((cmd, i) => {
      if (stopped) return;
      const pre = structuredClone(s),
        r = Sim.dispatch(s, cmd);
      if (!r.ok) {
        stopped = 'command ' + (i + 1) + ' refused: ' + r.why;
        return;
      }
      entries.push(
        entry(pre, s, cmd, r.events, rec.bb ? 'bot' : opts.src ? opts.src(i) : 'player', traces && traces[i])
      );
    });
    return { entries, state: s, stopped };
  }
  function headerText(rec, s, extra) {
    const deck = (ids, x) =>
      ids.map(id => (DEFS.find(d => d.id === id) || { name: id }).name).join(', ') +
      (x && x.length ? ' | extra: ' + x.map(id => (DEFS.find(d => d.id === id) || { name: id }).name).join(', ') : '');
    const r = s.result;
    return [
      'TPWTCH debug log' + (extra && extra.date ? ' · ' + extra.date : ''),
      'kind: ' +
        (rec.kind || rec.mode || '?') +
        ' · seed: ' +
        rec.n +
        (rec.bb ? ' · bots: P1 ' + botName(rec.bb.bots.Player) + ', P2 ' + botName(rec.bb.bots.Opponent) : ''),
      'P1 ' + nm(s, 'Player') + ' · deck "' + (rec.a || '?') + '": ' + deck(rec.d1, rec.x1),
      'P2 ' + nm(s, 'Opponent') + ' · deck "' + (rec.b || '?') + '": ' + deck(rec.d2, rec.x2),
      'options: ' +
        JSON.stringify(Object.assign({}, s.cfg)) +
        ' · shuffle ' +
        !!rec.sh +
        ' · trigger order ' +
        !!rec.ot +
        ' · stops ' +
        JSON.stringify(rec.stops || null),
      'commands: ' +
        rec.cmds.length +
        ' · turns: ' +
        s.turn +
        ' · result: ' +
        (r
          ? (r.winner ? seat(r.winner) + ' ' + nm(s, r.winner) + ' wins' : 'draw') +
            ' (' +
            r.why +
            ', turn ' +
            r.turn +
            ')'
          : 'not decided' + (rec.end ? ' (' + rec.end + ')' : '')),
      'legend: #n · the state BEFORE the command | > command [sender] | ? bot decision | events {fields} | = what changed',
    ].join('\n');
  }
  // the game before the first command: both hands and the deck order (top first)
  function openingText(s) {
    const L = ['#0 \u00b7 ' + ctxText(snap(s))];
    for (const p of SEATS) {
      const P = s.piles[p];
      L.push('  ' + seat(p) + ' hand: ' + P.hand.map(c => ref(s, c.iid)).join(', '));
      L.push('  ' + seat(p) + ' deck: ' + P.deck.map(c => c.def.name).join(', '));
      if (P.extra.length) L.push('  ' + seat(p) + ' extra: ' + P.extra.map(c => c.def.name).join(', '));
    }
    return L.join('\n');
  }
  // the exported file: text (for reading) or JSON (the record + every entry, for tools)
  // have = {entries, state} already made (the game log of the running game, with its senders and bot decisions), used when it is the whole record
  const fits = (rec, have) =>
    have &&
    have.entries.length === rec.cmds.length &&
    have.entries.every((x, i) => JSON.stringify(x.cmd) === JSON.stringify(rec.cmds[i]));
  const made = (rec, have) =>
    fits(rec, have) ? { entries: have.entries, state: have.state, stopped: null } : build(rec);
  function exportText(rec, extra, have) {
    const b = made(rec, have);
    return (
      headerText(rec, b.state, extra) +
      (b.stopped ? '\nSTOPPED: ' + b.stopped : '') +
      '\n\n' +
      openingText(recSim(rec)) +
      '\n\n' +
      b.entries.map(entryText).join('\n\n') +
      '\n'
    );
  }
  function exportJSON(rec, extra, have) {
    const b = made(rec, have);
    return JSON.stringify(
      {
        format: 'tpwtch-debuglog',
        v: 1,
        date: extra && extra.date,
        record: rec,
        result: b.state.result,
        turns: b.state.turn,
        stopped: b.stopped,
        entries: b.entries.map(x => ({
          src: x.src,
          ctx: x.ctx,
          cmd: x.cmd,
          cmdText: x.cmdText,
          bot: x.bot,
          events: x.events.map(e => ({ t: e.t, text: e.text, e: e.raw })),
          delta: x.delta,
        })),
      },
      null,
      1
    );
  }
  return {
    snap,
    ctxText,
    delta,
    cmdText,
    evText,
    fields,
    traceText,
    entry,
    entryText,
    head,
    build,
    headerText,
    exportText,
    exportJSON,
    ref,
  };
})();

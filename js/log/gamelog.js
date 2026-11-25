// gamelog.js - the game log: the BACK of the stack panel (flip it with the button in the panel header).
// One group per accepted command (who sent it: player / auto / bot / replay). The players' logs are the story (narrate.js); "All events"
// is the debug log (debuglog.js): the state before each command, the command, the bot's decision, every event with its fields, what
// changed. "Copy" puts the whole log on the clipboard; "Export" saves the whole game's debug log as a file (DebugLog.exportText).
const GameLog = (function () {
  const groups = [],
    MAX = 3000,
    SHOW = 300; // groups drawn in the panel (older ones are only in Copy)
  let ver = 0,
    shown = '',
    wrap = null;
  function add(pre, cmd, events, src, trace) {
    // trace: the bot's decision (its candidates and what it tried), for the debug view
    const turn = pre.turn,
      dbg = DebugLog.entry(pre, sim, cmd, events, src, trace);
    groups.push({
      turn,
      story: {
        Player: Narrate.story(Sim.observeStep(pre, sim, cmd, events, 'Player')),
        Opponent: Narrate.story(Sim.observeStep(pre, sim, cmd, events, 'Opponent')),
      }, // each player's own log
      src: src || 'player',
      cmd: dbg.cmdText,
      dbg, // the debug entry (state before, command, bot decision, events with fields, what changed): the "All events" view
      lines: dbg.events.map((e, k) => [
        e.t,
        e.text,
        e.t === 'ActionPointSpent' ? { p: events[k].player, id: events[k].id } : null,
      ]),
    }); // a spent action point can be clicked in the log: it opens its inspection panel
    if (groups.length > MAX) groups.shift();
    ver++;
  }
  const begin = s => {
    // the opening hands, once the game started (called after clear() for a fresh duel)
    groups.push({
      turn: 1,
      src: 'auto',
      cmd: 'Game start',
      lines: [],
      dbg: null,
      start: DebugLog.ctxText(DebugLog.snap(s)),
      story: { Player: Narrate.opening(s, 'Player'), Opponent: Narrate.opening(s, 'Opponent') },
    });
    ver++;
  };
  // auto = the log of the seat on screen; Player / Opponent = that player's log; raw = every rule event (all information, for debugging).
  // Vs Bot: only the human's own log (the bot's log and "All events" hold what the human may not know); Vs Self, Bot vs Bot, replays: all.
  let mode = 'auto';
  const ALL = ['auto', 'Player', 'Opponent', 'raw'],
    human = () => (ui.mode === 'bot' ? (ui.botSeat === 'Player' ? 'Opponent' : 'Player') : null),
    modes = () => (human() ? ['auto'] : ALL),
    cur = () => (modes().includes(mode) ? mode : 'auto'), // a mode left over from a Vs Self game is not used in a Vs Bot one
    viewer = () => human() || (cur() === 'auto' ? ui.view : cur()),
    modeLabel = () =>
      ({
        auto: 'Log: ' + NAME[viewer()],
        Player: 'Log: ' + NAME.Player,
        Opponent: 'Log: ' + NAME.Opponent,
        raw: 'All events',
      })[cur()];
  const storyText = () => {
    const V = viewer();
    let n = 0;
    return groups.flatMap(g => g.story[V].map((l, k) => ({ n: l.h ? 0 : ++n, g, k, l })));
  };
  function fillRich(d, rich) {
    // card names are coloured by their owner
    for (const x of Narrate.parts(rich)) {
      if (x.o) {
        const s = document.createElement('span');
        s.className = 'o' + (x.o === 'P' ? '1' : x.o === 'O' ? '2' : '0');
        s.textContent = x.t;
        d.appendChild(s);
      } else d.appendChild(document.createTextNode(x.t));
    }
  }
  const pop = () => {
    groups.pop();
    ver++;
  };
  const clear = () => {
    groups.length = 0;
    ver++;
  };
  // command numbers count commands only (the opening group is not one)
  const head = (g, i) =>
    g.dbg
      ? DebugLog.head(g.dbg, i - (groups[0] && !groups[0].dbg ? 1 : 0))
      : '#' + (i + 1) + ' \u00b7 ' + g.cmd + (g.start ? ' \u00b7 ' + g.start : '');
  const rawText = (g, i) => (g.dbg ? DebugLog.entryText(g.dbg, i) : head(g, i));
  function buildStory() {
    const all = storyText(),
      from = Math.max(0, all.length - 600);
    if (from) {
      const d = document.createElement('div');
      d.className = 'note';
      d.textContent = from + ' older lines are only in Copy.';
      wrap.appendChild(d);
    }
    for (const x of all.slice(from)) {
      const d = document.createElement('div');
      d.className = 'lgs' + (x.l.h ? ' lgturn' : '');
      d.appendChild(document.createTextNode(x.l.h ? '' : x.n + ' '));
      fillRich(d, x.l.rich);
      if (x.k === 0 && x.g.src !== 'player') {
        const s = document.createElement('i');
        s.className = x.g.src;
        s.textContent = ' ' + x.g.src;
        d.appendChild(s);
      }
      const ap = x.g.lines.find(q => q[2]);
      wrap.appendChild(d);
    }
  }
  function build() {
    wrap.replaceChildren();
    if (cur() !== 'raw') return buildStory();
    if (!groups.length) {
      const d = document.createElement('div');
      d.className = 'note';
      d.textContent = 'No events yet.';
      wrap.appendChild(d);
      return;
    }
    const from = Math.max(0, groups.length - SHOW);
    if (from) {
      const d = document.createElement('div');
      d.className = 'note';
      d.textContent = from + ' older commands are only in Copy.';
      wrap.appendChild(d);
    }
    for (let i = from; i < groups.length; i++) {
      // one command: the state before it, the command (and sender), the bot's decision, every event with its fields, what changed
      const g = groups[i],
        x = g.dbg,
        d = document.createElement('div'),
        h = document.createElement('div'),
        sub = (cls, text) => {
          const l = document.createElement('div');
          l.className = cls;
          l.textContent = text;
          d.appendChild(l);
          return l;
        };
      d.className = 'lgg';
      h.className = 'lgh';
      h.textContent = head(g, i);
      d.appendChild(h);
      if (x) {
        const c = sub('lgc', '> ' + x.cmdText);
        if (g.src !== 'player') {
          const s = document.createElement('i');
          s.className = g.src;
          s.textContent = ' ' + g.src;
          c.appendChild(s);
        }
        if (x.bot) sub('lgb', '? ' + x.bot);
      }
      g.lines.forEach(([name, text, ap], k) => {
        const l = document.createElement('div'),
          c = document.createElement('code');
        l.className = 'lge' + (ap ? ' apl' : '');
        if (ap) {
          l.dataset.ap = ap.id;
          l.dataset.app = ap.p;
          l.title = 'Click to inspect this action point';
        }
        c.textContent = name;
        l.append(c, document.createTextNode(text));
        const f = x && x.events[k] && x.events[k].fields;
        if (f) {
          const sm = document.createElement('small');
          sm.textContent = ' {' + f + '}';
          l.appendChild(sm);
        }
        d.appendChild(l);
      });
      if (x && x.delta.length) sub('lgd', '= ' + x.delta.join(', '));
      wrap.appendChild(d);
    }
  }
  function view() {
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'lg';
    }
    const key = ver + '|' + cur() + '|' + viewer();
    if (shown !== key) {
      shown = key;
      build();
    }
    return wrap;
  }
  function copy(btn) {
    const text =
        cur() === 'raw'
          ? groups.map(rawText).join('\n\n')
          : storyText()
              .map(x => (x.l.h ? '\n' + x.l.text : x.n + ' ' + x.l.text))
              .join('\n'),
      done = ok => {
        btn.textContent = ok ? 'Copied' : 'Copy failed';
        setTimeout(() => {
          btn.textContent = 'Copy';
        }, 1200);
      };
    try {
      navigator.clipboard.writeText(text).then(
        () => done(true),
        () => done(false)
      );
    } catch (e) {
      done(false);
    }
  }
  function flip() {
    stackEl.classList.add('flipping'); // edge-on at half time: the content swaps there
    setTimeout(() => {
      ui.stackLog = !ui.stackLog;
      sync();
    }, 150);
    setTimeout(() => stackEl.classList.remove('flipping'), 320);
  }
  stackEl.addEventListener('click', e => {
    const apl = e.target.closest('[data-ap]');
    if (apl) showAP(apl.dataset.app, +apl.dataset.ap, true);
    else if (e.target.closest('[data-flip]')) flip();
    else if (e.target.closest('[data-logmode]')) {
      const M = modes();
      mode = M[(M.indexOf(mode) + 1) % M.length];
      ver++;
      sync();
    } else if (e.target.closest('[data-logcopy]')) copy(e.target.closest('[data-logcopy]'));
    else if (e.target.closest('[data-logexport]')) exportDialog();
  });
  // the debug entries of every command so far (for Export: used when they cover the whole record)
  const entries = () => groups.filter(g => g.dbg).map(g => g.dbg);
  return { add, begin, pop, clear, view, modeLabel, entries };
})();

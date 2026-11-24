// gamelog.js - the game log: the BACK of the stack panel (flip it with the button in the panel header).
// One group per accepted command (who sent it: player / auto / bot / replay) with every rule event it caused, each under its event name
// (the `t` of the Sim events), so a game can be reviewed by hand. "Copy" puts the whole log on the clipboard.
const GameLog = (function () {
  const groups = [],
    MAX = 3000,
    SHOW = 300; // groups drawn in the panel (older ones are only in Copy)
  let ver = 0,
    shown = '',
    wrap = null;
  const cn = iid => {
    const c = sim.cards[iid];
    return c ? c.def.name : String(iid);
  };
  const who = p => NAME[p] || String(p);
  const stop = k => STOP_NAMES[k] || k;
  const T = {
    DeckReordered: e => who(e.player) + ' reordered their deck',
    PlayerReady: e => who(e.player) + ' pressed Start',
    GameStarted: () => 'opening hands dealt, the game starts',
    CardDrawn: e => who(e.player) + ' draws ' + cn(e.iid),
    CardAdded: e => cn(e.iid) + ' goes to ' + who(e.player) + '\u2019s hand' + (e.debug ? ' (debug)' : ''),
    CardMilled: e => cn(e.iid) + ' milled from ' + who(e.player) + '\u2019s deck',
    CardDiscarded: e => cn(e.iid) + ' discarded',
    CardExiled: e => cn(e.iid) + ' exiled',
    PermanentSummoned: e => cn(e.iid) + ' enters ' + e.slot,
    PermanentMoved: e => cn(e.iid) + ' shifts to ' + e.slot,
    PermanentDestroyed: e =>
      cn(e.iid) +
      ' sent from the field to the graveyard' +
      (e.by === 'rule'
        ? ' by the rules' + (e.why ? ' (' + e.why + ')' : '')
        : e.by === 'cost'
          ? ' as a cost'
          : ' by an effect'),
    PermanentReturned: e => cn(e.iid) + ' returned to its owner\u2019s hand',
    StackObjectCreated: e => cn(e.iid) + (e.attack ? ' (Attack)' : '') + ' put on the stack',
    StackObjectResolved: e => cn(e.iid) + ' resolves',
    StackObjectCountered: e => cn(e.iid) + ' countered (stack HP -1 or lower)',
    StackObjectDamaged: e => 'stack object #' + e.sid + ' takes ' + e.amount + ' damage',
    StackObjectFizzled: e => 'stack object #' + e.sid + ' fizzles (its target is gone)',
    StackEmptied: () => 'the stack is empty',
    PriorityPassed: e => 'priority passes to ' + who(e.to),
    ResponseWindowOpened: e => 'stop: ' + stop(e.kind) + ' (' + who(e.player || other(sim.active)) + ' may respond)',
    ResponseWindowClosed: e => 'stop closed: ' + stop(e.kind),
    EndStepEntered: () => 'end step',
    DrawStepEntered: e => who(e.player) + '\u2019s draw phase',
    StopChanged: e => who(e.player) + ' stop "' + stop(e.kind) + '" (' + e.role + ') ' + (e.on ? 'on' : 'off'),
    TurnChanged: e => 'turn ' + sim.turn + ': ' + who(e.active) + '\u2019s turn begins',
    AttackPhaseChanged: e => 'combat ' + (e.on ? 'started' : 'ended'),
    CombatSkipped: e => who(e.player) + '\u2019s combat is skipped (End turn instead)',
    CreatureAttackDeclared: e => cn(e.iid) + ' attacks column ' + (e.col + 1) + (e.extra ? ' (extra attack)' : ''),
    AttackCancelled: e => 'the Attack of ' + cn(e.iid) + ' is cancelled',
    AttackBoosted: e => 'Attack #' + e.sid + ' gets +' + e.amount + ' damage',
    DamageDealt: e => cn(e.source) + ' deals ' + e.amount + ' ' + e.type + ' damage to ' + cn(e.target),
    DamageDenied: e => e.amount + ' damage denied on ' + (e.target ? cn(e.target) : 'stack object #' + e.sid),
    DamageRemoved: e => e.amount + ' damage removed from ' + cn(e.target),
    PlayerDamaged: e => who(e.player) + ' takes ' + e.amount + ' damage' + (e.combat ? ' (combat)' : ''),
    LifePaid: e => who(e.player) + ' pays ' + e.amount + ' life',
    LifeCounterAdded: e => 'life gained: +' + e.amount,
    CounterAdded: e => cn(e.iid) + ' gets a ' + e.color + ' shield',
    ZoneUnusable: e => e.slot + ' becomes unusable',
    HistoryCapReached: () => 'the history limit was reached: the game is over',
    ZoneDamaged: e => e.slot + ' takes ' + e.amount + ' zone damage',
    AbilitiesTransformed: e => cn(e.iid) + ' takes on new abilities (was ' + e.from + ')',
    AbilityActivated: e => cn(e.iid) + ' activates ability #' + (e.ab + 1) + ' (' + e.speed + ')',
    ChoiceRequested: e => who(e.player) + ' must choose',
    ChoiceMade: e => who(e.player) + ' chose',
    ActionPointGained: e => who(e.player) + ' gains an action point',
    ActionPointSpent: e => who(e.player) + ' spends an action point: ' + e.why,
    CardRevealed: e => cn(e.iid) + ' is revealed by ' + who(e.player),
    EffectFailed: e => cn(e.iid) + ' fails: ' + e.why,
    CardReturnedExtra: e => cn(e.iid) + ' returns to the extra deck',
    GameDecided: e => 'GAME DECIDED: ' + (e.winner ? who(e.winner) + ' wins' : 'draw') + ' (' + e.why + ')',
  };
  const evText = e => (T[e.t] ? T[e.t](e) : JSON.stringify(e));
  function cmdText(c) {
    const parts = [c.type];
    if (c.player) parts.push('by ' + who(c.player));
    if (c.iid) parts.push(cn(c.iid));
    for (const k of ['slot', 'zone', 'col', 'tplayer', 'tsid', 'ab', 'on', 'extra', 'from', 'to'])
      if (c[k] != null) parts.push(k + '=' + c[k]);
    if (c.option != null) parts.push('option=' + (sim.cards[c.option] ? cn(c.option) : c.option));
    if (c.debug) parts.push('(debug)');
    return parts.join(' ');
  }
  function add(pre, cmd, events, src) {
    const turn = pre.turn;
    groups.push({
      turn,
      story: {
        Player: Narrate.story(pre, sim, cmd, events, 'Player'),
        Opponent: Narrate.story(pre, sim, cmd, events, 'Opponent'),
      }, // each player's own log
      src: src || 'player',
      cmd: cmdText(cmd),
      lines: events.map(e => [e.t, evText(e), e.t === 'ActionPointSpent' ? { p: e.player, id: e.id } : null]),
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
      story: { Player: Narrate.opening(s, 'Player'), Opponent: Narrate.opening(s, 'Opponent') },
    });
    ver++;
  };
  // auto = the log of the seat on screen; Player / Opponent = that player's log; raw = every rule event (all information, for debugging)
  let mode = 'auto';
  const MODES = ['auto', 'Player', 'Opponent', 'raw'],
    viewer = () => (mode === 'auto' ? ui.view : mode),
    modeLabel = () =>
      ({
        auto: 'Log: ' + NAME[ui.view],
        Player: 'Log: ' + NAME.Player,
        Opponent: 'Log: ' + NAME.Opponent,
        raw: 'All events',
      })[mode];
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
  const head = (g, i) => '#' + (i + 1) + ' \u00b7 T' + g.turn + ' \u00b7 ' + g.cmd;
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
    if (mode !== 'raw') return buildStory();
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
      const g = groups[i],
        d = document.createElement('div'),
        h = document.createElement('div');
      d.className = 'lgg';
      h.className = 'lgh';
      h.textContent = head(g, i);
      if (g.src !== 'player') {
        const s = document.createElement('i');
        s.className = g.src;
        s.textContent = ' ' + g.src;
        h.appendChild(s);
      }
      d.appendChild(h);
      for (const [name, text, ap] of g.lines) {
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
        d.appendChild(l);
      }
      wrap.appendChild(d);
    }
  }
  function view() {
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'lg';
    }
    const key = ver + '|' + mode + '|' + (mode === 'auto' ? ui.view : '');
    if (shown !== key) {
      shown = key;
      build();
    }
    return wrap;
  }
  function copy(btn) {
    const text =
        mode === 'raw'
          ? groups
              .map(
                (g, i) =>
                  head(g, i) +
                  (g.src !== 'player' ? ' [' + g.src + ']' : '') +
                  '\n' +
                  g.lines.map(l => '    ' + l[0] + '  ' + l[1]).join('\n')
              )
              .join('\n')
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
      mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
      ver++;
      sync();
    } else if (e.target.closest('[data-logcopy]')) copy(e.target.closest('[data-logcopy]'));
  });
  return { add, begin, pop, clear, view, modeLabel };
})();

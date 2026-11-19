// gamelog.js - the game log: the BACK of the stack panel (flip it with the button in the panel header).
// One group per accepted command (who sent it: player / auto / bot / replay) with every rule event it caused, each under its event name
// (the `t` of the Sim events), so a game can be reviewed by hand. "Copy" puts the whole log on the clipboard.
const GameLog = (function () {
  const groups = [],
    MAX = 3000,
    SHOW = 300; // groups drawn in the panel (older ones are only in Copy)
  let ver = 0,
    shown = -1,
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
    PermanentDestroyed: e => cn(e.iid) + ' destroyed' + (e.by === 'rule' ? ' by the rules (its zone is gone)' : ''),
    PermanentReturned: e => cn(e.iid) + ' returned to its owner\u2019s hand',
    StackObjectCreated: e => cn(e.iid) + (e.attack ? ' (Attack)' : '') + ' put on the stack',
    StackObjectResolved: e => cn(e.iid) + ' resolves',
    StackObjectCountered: e => cn(e.iid) + ' countered (stack HP -1 or lower)',
    StackObjectDamaged: e => 'stack object #' + e.sid + ' takes ' + e.amount + ' damage',
    StackObjectFizzled: e => 'stack object #' + e.sid + ' fizzles (its target is gone)',
    StackEmptied: () => 'the stack is empty',
    PriorityPassed: e => 'priority passes to ' + who(e.to),
    ResponseWindowOpened: e => 'stop: ' + stop(e.kind) + ' (' + who(other(sim.active)) + ' may respond)',
    ResponseWindowClosed: e => 'stop closed: ' + stop(e.kind),
    EndStepEntered: () => 'end step',
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
    AbilitiesTransformed: e => cn(e.iid) + ' takes on new abilities (was ' + e.from + ')',
    AbilityActivated: e => cn(e.iid) + ' activates ability #' + (e.ab + 1) + ' (' + e.speed + ')',
    ChoiceRequested: e => who(e.player) + ' must choose',
    ChoiceMade: e => who(e.player) + ' chose',
    ActionPointGained: e => who(e.player) + ' gains an action point',
    ActionPointSpent: e => who(e.player) + ' spends an action point: ' + e.why,
    CardRevealed: e => cn(e.iid) + ' is revealed by ' + who(e.player),
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
  function add(turn, cmd, events, src) {
    groups.push({
      turn,
      src: src || 'player',
      cmd: cmdText(cmd),
      lines: events.map(e => [e.t, evText(e), e.t === 'ActionPointSpent' ? { p: e.player, id: e.id } : null]),
    }); // a spent action point can be clicked in the log: it opens its inspection panel
    if (groups.length > MAX) groups.shift();
    ver++;
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
  function build() {
    wrap.replaceChildren();
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
    if (shown !== ver) {
      shown = ver;
      build();
    }
    return wrap;
  }
  function copy(btn) {
    const text = groups
        .map(
          (g, i) =>
            head(g, i) +
            (g.src !== 'player' ? ' [' + g.src + ']' : '') +
            '\n' +
            g.lines.map(l => '    ' + l[0] + '  ' + l[1]).join('\n')
        )
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
    else if (e.target.closest('[data-logcopy]')) copy(e.target.closest('[data-logcopy]'));
  });
  return { add, pop, clear, view };
})();

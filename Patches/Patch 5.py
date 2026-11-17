#!/usr/bin/env python3
"""Patch 5.py - run from the repo root:  python "Patches/Patch 5.py"

 1. Victory: a player loses at life <= -1 (0 is alive). The Sim records the result once (state.result = {winner, why, turn}); it never changes.
    New effect WinGame (Fx.winGame(who?)): the controller (or, with 'foe', the opponent) wins the game.
    New commands Surrender and Leave (accepted at any time, even during a choice). A draw is possible (both players <= -1 at once).
 2. Result dialog (js/result.js): who won and why, per-player Rematch / Continue / Leave buttons, both sides see the other's pick highlighted.
    Both Rematch = new game at once. Both Continue = the same game goes on, the result stays. Leave = main menu.
    Draggable (no backdrop), so the board can be inspected.
 3. The "Main menu" button is now "Exit" (red). When the other side leaves, the dialog disappears and Exit pulses red.
 4. Leaving a running hot-seat game gives the other player a result dialog with only a Leave button.
 5. Surrender button (confirmation first). The bot never surrenders or leaves on its own.
 6. "Vs bot" dialog: what the bot does when the game ends: random / rematch / continue / end.
 7. Replays: the commands after the decision (continue) are recorded like any other; a replay pauses when the game is decided
    (Play runs the rest). "Hide" button for the replay bar (a small "Replay controls" button brings it back).
 8. Timing (css/theme.css, --fx-*): a pause after every spell / ability resolves, and a shorter stack animation for Attack objects.

Safety: every pattern must match exactly the expected number of times, otherwise NOTHING is written. The test output is recorded before;
afterwards every old check must still pass and no new FAIL may appear, otherwise everything is restored. Nothing is committed.
"""
import json, os, re, shutil, subprocess, sys

ROOT = os.getcwd()
p = lambda *a: os.path.join(ROOT, *a)
NODE = shutil.which('node')
log, files, EOL, errors, newfiles = [], {}, {}, [], {}
newfiles = {}


def die(msg):
    print('ABORT: ' + msg)
    sys.exit(1)


def read(rel):
    with open(p(rel), encoding='utf-8', newline='') as f:
        raw = f.read()
    EOL[rel] = '\r\n' if '\r\n' in raw else '\n'
    return raw.replace('\r\n', '\n')


def cur(rel):
    return files[rel] if rel in files else read(rel)


def write(rel, text):
    os.makedirs(os.path.dirname(p(rel)), exist_ok=True)
    eol = EOL.get(rel) or EOL.get('js/game-host.js') or '\n'
    with open(p(rel), 'w', encoding='utf-8', newline='') as f:
        f.write(text.replace('\n', eol))


def rep(rel, old, new, desc, count=1):
    """exact-text edit; must match exactly `count` times"""
    if not os.path.exists(p(rel)):
        errors.append(f'{desc}: {rel} not found'); return
    t = cur(rel); n = t.count(old)
    if n != count:
        errors.append(f'{desc}: {n} matches in {rel}, expected {count}'); return
    files[rel] = t.replace(old, new); log.append('ok  ' + desc)


def append(rel, text, desc):
    if not os.path.exists(p(rel)):
        errors.append(f'{desc}: {rel} not found'); return
    files[rel] = cur(rel).rstrip('\n') + '\n' + text + '\n'; log.append('ok  ' + desc)


def run_tests():
    r = subprocess.run([NODE, 'tests/run.js', '--json'], cwd=ROOT, capture_output=True, text=True)
    lines = r.stdout.strip().splitlines()
    if r.returncode not in (0, 1) or not lines:
        return None, r.stderr
    return json.loads(lines[-1]), r.stderr


# ---------------------------------------------------------------- preconditions
if not NODE:
    die('node is required')
for f in ['js/sim/state.js', 'js/sim/dispatch.js', 'js/sim/ops.js', 'js/cards.js', 'js/game-host.js', 'js/view-sync.js', 'js/replay.js',
          'js/menu.js', 'js/bot.js', 'js/theme.js', 'tests/selftest.js', 'tests/run.js', 'index.html', 'css/index.css', 'css/screens.css',
          'css/theme.css']:
    if not os.path.exists(p(f)):
        die(f'{f} not found: run this from the repo root')
read('js/game-host.js')  # default line endings for new files
base, err = run_tests()
if base is None:
    die('could not run the existing tests:\n' + err)
print(f'baseline: {sum(l.startswith(("PASS", "FAIL")) for l in base)} checks, {sum(l.startswith("FAIL") for l in base)} failing already')

# ================================================================ 1. SIM: result, WinGame, Surrender, Leave
S = 'js/sim/state.js'
rep(S, "  let byId, majorUsed, mulberry32, slotRow; // util", "  let byId, majorUsed, mulberry32, other, slotRow; // util", 'state: import other')
rep(S, "      'mulberry32',\n      'removeStatus',", "      'mulberry32',\n      'other',\n      'removeStatus',", 'state: needs other')
rep(S, "        mulberry32,\n        removeStatus,", "        mulberry32,\n        other,\n        removeStatus,", 'state: link other')
rep(S, "      respond: null,\n    };",
    "      respond: null,\n      result: null, // null | {winner:'Player'|'Opponent'|null (a draw), why:'life'|'surrender'|'left'|'effect', turn}: set once, never changed\n    };",
    'state: s.result')
rep(S, "      for (const p of ['Player', 'Opponent']) syncLife(s, p);\n    } finally {",
    """      for (const p of ['Player', 'Opponent']) syncLife(s, p);
      if (!s.result) {
        // a player at life <= -1 has lost (0 is still alive); both at once = a draw
        const lost = ['Player', 'Opponent'].filter(q => s.life[q] <= -1);
        if (lost.length === 2) declareWinner(s, null, 'life', ev);
        else if (lost.length === 1) declareWinner(s, other(lost[0]), 'life', ev);
      }
    } finally {""", 'state: recalc decides the game at life <= -1')
rep(S, "  function sweepUnusable(s, ev) {", """  function declareWinner(s, p, why, ev) {
    // the first decision stands: later life changes or effects never change the result. p = null is a draw
    if (s.result) return;
    s.result = { winner: p, why, turn: s.turn };
    ev.push({ t: 'GameDecided', winner: p, why });
  }
  function sweepUnusable(s, ev) {""", 'state: declareWinner')
rep(S, "      createGame,\n      destroy,", "      createGame,\n      declareWinner,\n      destroy,", 'state: export declareWinner')

D = 'js/sim/dispatch.js'
rep(D, "  let freeSlots, recalc, sweepUnusable; // state", "  let declareWinner, freeSlots, recalc, sweepUnusable; // state", 'dispatch: import declareWinner')
rep(D, "      'declareAttack',\n      'dmgs',", "      'declareAttack',\n      'declareWinner',\n      'dmgs',", 'dispatch: needs declareWinner')
rep(D, "        declareAttack,\n        dmgs,", "        declareAttack,\n        declareWinner,\n        dmgs,", 'dispatch: link declareWinner')
rep(D, "    if (s.choice && cmd.type !== 'Choose') return fail('Waiting for ' + s.choice.player + ' to choose');",
    "    if (s.choice && !['Choose', 'Surrender', 'Leave'].includes(cmd.type))\n      return fail('Waiting for ' + s.choice.player + ' to choose'); // giving up is possible at any time",
    'dispatch: Surrender / Leave are allowed during a choice')
rep(D, "        break; // the turn really ends when the opponent passes\n      default:\n        return fail('Unknown command');",
    """        break; // the turn really ends when the opponent passes
      case 'Surrender':
      case 'Leave': {
        // the player gives up (Surrender) or walks away (Leave): the other player wins. Allowed at any time, even during a choice
        if (!['Player', 'Opponent'].includes(cmd.player)) return fail('Unknown player');
        if (s.phase !== 'play') return fail('The game has not started');
        if (s.result) return fail('The game is already decided');
        declareWinner(s, other(cmd.player), cmd.type === 'Leave' ? 'left' : 'surrender', ev);
        break;
      }
      default:
        return fail('Unknown command');""", 'dispatch: Surrender and Leave commands')

O = 'js/sim/ops.js'
rep(O, "  let cloudMap, destroy, freeSlots, makeToken, recalc; // state", "  let cloudMap, declareWinner, destroy, freeSlots, makeToken, recalc; // state", 'ops: import declareWinner')
rep(O, "      'dealDamage',\n      'destroy',", "      'dealDamage',\n      'declareWinner',\n      'destroy',", 'ops: needs declareWinner')
rep(O, "        dealDamage,\n        destroy,", "        dealDamage,\n        declareWinner,\n        destroy,", 'ops: link declareWinner')
rep(O, "    Aura: () => {}, // passive, read by recalc()\n",
    "    Aura: () => {}, // passive, read by recalc()\n    WinGame: (x, e) => {\n      declareWinner(x.s, e.who === 'foe' ? x.foe : x.who, 'effect', x.ev);\n    }, // the controller (who:'foe' = the opponent) wins; ignored when the game is already decided\n",
    'ops: WinGame')
rep('js/cards.js', "  noLifeGain: () => ({ op: 'NoLifeGain' }),",
    "  noLifeGain: () => ({ op: 'NoLifeGain' }),\n  winGame: who => ({ op: 'WinGame', who }), // effect: the controller (who:'foe' = the opponent) wins the game",
    'cards: Fx.winGame')

# ================================================================ HOST: result dialog module
newfiles['js/result.js'] = r"""// result.js - end of the game. The Sim only records WHO won and WHY (state.result, set once, never changed); everything here is host UI:
// the draggable result dialog (Rematch / Continue / Leave per player), the bot's answer, the pulsing Exit button and the replay pause.
const Result = (function () {
  const R = {
    open: false, // the dialog is on screen
    shown: null, // key of the result the dialog was already shown for (continue = it is never shown again)
    left: null, // the seat that walked away after the decision: the dialog is gone and Exit pulses
    pick: { Player: null, Opponent: null },
    botTimer: 0,
    rShown: null, // replay: key of the result the replay already paused at
  };
  const OPTS = [
      ['rematch', 'Rematch'],
      ['continue', 'Continue'],
      ['leave', 'Leave'],
    ],
    keyOf = r => (r ? r.winner + '|' + r.why + '|' + r.turn : null); // a key, not the object: undo hands back clones
  let box = null,
    title,
    body;
  function text(r) {
    const lose = r.winner ? other(r.winner) : null,
      why =
        {
          life: r.winner ? NAME[lose] + ' ran out of life' : 'both players ran out of life',
          surrender: lose && NAME[lose] + ' surrendered',
          left: lose && NAME[lose] + ' left the game',
          effect: 'won by a card effect',
        }[r.why] || '';
    return { title: r.winner ? NAME[r.winner] + ' wins' : 'Draw', why };
  }
  const label = r => {
    const t = text(r);
    return t.title + (t.why ? ' (' + t.why + ')' : '');
  };
  function place(x, y) {
    const w = box.offsetWidth;
    box.style.left = Math.max(0, Math.min(innerWidth - w, x)) + 'px';
    box.style.top = Math.max(0, Math.min(innerHeight - 44, y)) + 'px';
  }
  function build() {
    box = mkEl('div', 'result');
    box.id = 'resultDlg';
    box.hidden = true;
    const head = mkEl('div', 'rs-head'),
      hint = mkEl('small');
    title = mkEl('span');
    hint.textContent = 'drag to move';
    head.append(title, hint);
    body = mkEl('div', 'rs-body');
    box.append(head, body);
    document.body.appendChild(box);
    let d = null;
    head.addEventListener('pointerdown', e => {
      d = { dx: e.clientX - box.offsetLeft, dy: e.clientY - box.offsetTop };
      head.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    head.addEventListener('pointermove', e => {
      if (d) place(e.clientX - d.dx, e.clientY - d.dy);
    });
    const end = () => {
      d = null;
    };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
    addEventListener('resize', () => {
      if (R.open) place(box.offsetLeft, box.offsetTop);
    });
  }
  function close() {
    R.open = false;
    clearTimeout(R.botTimer);
    if (box) box.hidden = true;
  }
  function render() {
    const r = sim.result;
    if (!r || !box) return;
    const t = text(r);
    title.textContent = t.title;
    body.replaceChildren();
    body.appendChild(mkEl('div', 'rs-why')).textContent = t.why;
    if (r.why === 'left') {
      // the other side walked away: nothing to agree on, only the way out
      const row = mkEl('div', 'rs-btns');
      row.appendChild(mkBtn('Leave', () => choose(null, 'leave'), 'c-exit'));
      body.appendChild(row);
      return;
    }
    for (const p of ['Player', 'Opponent']) {
      const bot = ui.mode === 'bot' && p === 'Opponent', // the bot answers by itself
        o = other(p),
        row = mkEl('div', 'rs-row'),
        btns = mkEl('div', 'rs-btns');
      row.appendChild(mkEl('span')).textContent = NAME[p] + (bot ? ' (bot)' : '');
      for (const [v, lab] of OPTS) {
        // sel = this player's pick; ask = the other player picked it and is waiting for this one
        const cls = 'rs-opt' + (v === 'leave' ? ' c-exit' : '') + (R.pick[p] === v ? ' sel' : R.pick[o] === v && v !== 'leave' ? ' ask' : ''),
          b = mkBtn(lab, () => choose(p, v), cls);
        if (bot) b.disabled = true;
        btns.appendChild(b);
      }
      row.appendChild(btns);
      body.appendChild(row);
    }
    const a = R.pick.Player,
      b = R.pick.Opponent;
    if (a || b)
      body.appendChild(mkEl('div', 'rs-note')).textContent =
        a && b ? 'Both players must pick the same option.' : 'Waiting for ' + NAME[a ? 'Opponent' : 'Player'] + '\u2026';
  }
  function choose(p, v) {
    if (!R.open) return;
    if (v === 'leave') {
      close();
      Replays.saveCurrent()
        .catch(() => false)
        .then(() => MenuUI.show());
      return;
    }
    R.pick[p] = R.pick[p] === v ? null : v;
    render();
    const a = R.pick.Player;
    if (a && a === R.pick.Opponent) (a === 'continue' ? doContinue : doRematch)();
  }
  function doContinue() {
    // the same game goes on; the result stays what it is
    close();
    R.pick = { Player: null, Opponent: null };
    ui.note = '';
    sync();
    autoStep();
  }
  function doRematch() {
    close();
    Replays.saveCurrent()
      .catch(() => false)
      .then(() => {
        resetGame();
        autoStep();
      });
  }
  function botLeaves() {
    close();
    R.left = 'Opponent';
    ui.note = NAME.Opponent + ' (bot) left. Press Exit to return to the main menu.';
    sync();
  }
  function botDecides() {
    if (!R.open) return;
    let v = (ui.lastCfg && ui.lastCfg.botEnd) || 'random';
    if (v === 'random') v = botPick(['rematch', 'continue', 'end'], botR);
    if (v === 'end') return botLeaves();
    R.pick.Opponent = v;
    render();
    if (R.pick.Player === v) (v === 'continue' ? doContinue : doRematch)();
  }
  function show() {
    if (!box) build();
    R.open = true;
    R.pick = { Player: null, Opponent: null };
    ui.placing = null;
    closeMenu();
    box.hidden = false;
    render();
    place((innerWidth - box.offsetWidth) / 2, Math.max(8, innerHeight * 0.18));
    sync();
    clearTimeout(R.botTimer);
    if (ui.mode === 'bot' && sim.result.why !== 'left') R.botTimer = setTimeout(botDecides, 1300);
  }
  return {
    text: label,
    // called after every command (autoStep): open the dialog the first time a result shows up. true = the game is over for automation
    check() {
      if (rp.on) return false;
      const r = sim.result;
      if (!r) {
        R.shown = null;
        if (R.open) close();
        return false;
      }
      if (R.left) return true;
      if (R.shown !== keyOf(r)) {
        if (MenuUI.away) return false;
        R.shown = keyOf(r);
        show();
        return true;
      }
      return R.open;
    },
    // commands are refused while the dialog is open, after the other side left, and between the decision and the dialog
    blocks: () => R.open || !!R.left || (!rp.on && !!sim.result && R.shown !== keyOf(sim.result)),
    pulsing: () => !!R.left,
    // a replay pauses once at the command that decides the game; Play runs the rest (the continued game is part of the record)
    replayCheck() {
      if (!rp.on || !sim.result || R.rShown === keyOf(sim.result)) return;
      R.rShown = keyOf(sim.result);
      rp.playing = false;
      clearTimeout(rp.timer);
    },
    reset() {
      close();
      R.shown = R.rShown = R.left = null;
      R.pick = { Player: null, Opponent: null };
    },
  };
})();
"""

# ================================================================ HOST: game-host
G = 'js/game-host.js'
rep(G, "  autoTimer: 0,\n  autoDepth: 0,", "  autoTimer: 0,\n  stepTimer: 0, // the pause after a spell / ability resolved, before automation goes on\n  autoDepth: 0,", 'game-host: ui.stepTimer')
rep(G, "  } // while a replay plays only the replay itself sends commands\n",
    """  } // while a replay plays only the replay itself sends commands
  if (Result.blocks()) {
    ui.note = 'The game is decided: use the result window or Exit';
    sync();
    return { ok: false, why: 'The game is decided', events: [] };
  } // open result dialog, or the other side left
""", 'game-host: send is closed while the result is pending')
rep(G, """  if (jobs.length) {
    game = pre;
    sync();
    fxRun(jobs, () => {
      game = sim;
      sync();
      autoStep();
    });
  } // keep showing the old state until the animation ends
  else {
    game = sim;
    sync();
    if (r.ok) autoStep();
  }
  return r;""", """  // a spell or ability that resolved: a short pause before automatic passes / the bot / the result dialog go on, so the outcome can be seen
  const wait =
      r.ok && pre.stack.some(o => o.kind !== 'attack' && !sim.stack.some(q => q.sid === o.sid)) ? FX.resolve : 0,
    next = () => {
      clearTimeout(ui.stepTimer);
      if (wait) ui.stepTimer = setTimeout(autoStep, wait);
      else autoStep();
    };
  if (jobs.length) {
    game = pre;
    sync();
    fxRun(jobs, () => {
      game = sim;
      sync();
      next();
    });
  } // keep showing the old state until the animation ends
  else {
    game = sim;
    sync();
    if (r.ok) next();
  }
  return r;""", 'game-host: pause after a resolution')
rep(G, "  if (MenuUI.away || rp.on) return; // the menu or the deck editor is on screen (or a replay plays): nothing happens by itself\n",
    "  if (MenuUI.away || rp.on) return; // the menu or the deck editor is on screen (or a replay plays): nothing happens by itself\n  if (Result.check()) return; // the game is decided: the result dialog (or the Exit button) takes over\n",
    'game-host: autoStep checks the result')
rep(G, "  if (!undoStack.length || ui.fxBusy) return;\n  if (!rp.on) cmdLog.pop(); // an undone command is not part of the duel any more",
    "  if (!undoStack.length || ui.fxBusy || Result.blocks()) return;\n  if (!rp.on) cmdLog.pop(); // an undone command is not part of the duel any more",
    'game-host: no undo while the result is pending')
rep(G, "  fxReset();\n  closeMenu();\n  sync();\n}\nconst camArrive", "  fxReset();\n  closeMenu();\n  sync();\n  Result.check();\n}\nconst camArrive", 'game-host: undo re-checks the result')
rep(G, "  botMem.turn = -1;\n", "  botMem.turn = -1;\n  Result.reset();\n  clearTimeout(ui.stepTimer);\n", 'game-host: resetGame clears the result')
rep(G, "    show: inPlay,\n  },\n];", """    show: inPlay,
  },
  {
    id: 'surrender',
    cls: 'c-atk',
    label: () => 'Surrender',
    run: () => {
      confirmBox('Surrender? ' + NAME[ui.view] + ' loses the game.', 'Surrender', 'Cancel').then(ok => {
        if (ok && !game.result) send({ type: 'Surrender', player: ui.view });
      });
    },
    on: () => inPlay() && !game.result && !rp.on && !Result.blocks() && !ui.fxBusy && !ui.placing,
    show: () => inPlay() && !rp.on,
  },
];""", 'game-host: Surrender button')
rep(G, "  { id: 'menu', label: () => 'Main menu', run: () => MenuUI.leaveGame(), on: () => true },",
    "  { id: 'menu', cls: 'c-exit', label: () => 'Exit', run: () => MenuUI.leaveGame(), on: () => true },", 'game-host: Exit button')
rep(G, "    if (b.id === 'battle') b.el.classList.toggle('on', game.attackPhase);",
    "    if (b.id === 'battle') b.el.classList.toggle('on', game.attackPhase);\n    if (b.id === 'menu') b.el.classList.toggle('pulseR', Result.pulsing()); // the other side left: this is the way out", 'game-host: Exit pulses')

# bot: never acts while the result is pending
rep('js/bot.js', "const botWants = () => !MenuUI.away && botActor(sim) === 'Opponent';",
    "const botWants = () => !MenuUI.away && !Result.blocks() && botActor(sim) === 'Opponent'; // the bot never surrenders, and waits while the result is shown",
    'bot: waits while the result is pending')

# ================================================================ HOST: menu (bot option, Exit, leave mid-game)
M = 'js/menu.js'
rep(M, "  last: { p1: BUILTIN_DECKS[0].name, p2: BUILTIN_DECKS[1].name, shuffle: true },",
    "  last: { p1: BUILTIN_DECKS[0].name, p2: BUILTIN_DECKS[1].name, shuffle: true, botEnd: 'random' },", 'menu: default bot end behaviour')
rep(M, "    box.appendChild(cw);\n", """    box.appendChild(cw);
    let sb = null; // Vs Bot: what the bot does when the game ends
    if (mode === 'bot') {
      const bw = mkEl('label', 'mfield');
      bw.appendChild(mkEl('span')).textContent = 'When the game ends, the bot';
      sb = mkEl('select', 'dctl');
      for (const [v, t] of [
        ['random', 'Chooses at random'],
        ['rematch', 'Asks for a rematch'],
        ['continue', 'Asks to continue'],
        ['end', 'Ends (leaves)'],
      ]) {
        const o = mkEl('option');
        o.value = v;
        o.textContent = t;
        sb.appendChild(o);
      }
      sb.value = MenuUI.last.botEnd || 'random';
      bw.appendChild(sb);
      box.appendChild(bw);
    }
""", 'menu: bot end behaviour option')
rep(M, "          MenuUI.last = { p1: s1.value, p2: s2.value, shuffle: cb.checked };",
    "          MenuUI.last = { p1: s1.value, p2: s2.value, shuffle: cb.checked, botEnd: sb ? sb.value : MenuUI.last.botEnd };", 'menu: keep the bot option')
rep(M, "    this.away = true;\n    rp.playing = false;\n    Replays.bar(false);\n", "    this.away = true;\n    rp.playing = false;\n    Result.reset();\n    Replays.bar(false);\n", 'menu: show() clears the result dialog')
rep(M, """  leaveGame() {
    confirmBox('Leave this game and return to the main menu?', 'Leave', 'Stay').then(ok => {
      if (!ok) return;
      Replays.saveCurrent()
        .catch(() => false)
        .then(() => MenuUI.show());
    });
  },""", """  leaveGame() {
    // hot seat, game still running: the viewed seat leaves, so the other player is shown the result (a dialog with only Leave)
    const early = ui.mode === 'self' && !rp.on && !sim.result && game.phase === 'play';
    confirmBox(
      early ? 'Leave this game? ' + NAME[other(ui.view)] + ' wins.' : 'Leave this game and return to the main menu?',
      'Leave',
      'Stay'
    ).then(ok => {
      if (!ok) return;
      if (early && !Result.blocks() && send({ type: 'Leave', player: ui.view }).ok) return;
      Replays.saveCurrent()
        .catch(() => false)
        .then(() => MenuUI.show());
    });
  },""", 'menu: leaving a running game')

# ================================================================ HOST: replay (pause, hide)
RP = 'js/replay.js'
rep(RP, "  let bar = null,\n    lab,\n    playBtn;", "  let bar = null,\n    lab,\n    playBtn,\n    showBtn;", 'replay: showBtn variable')
rep(RP, "      lab,\n      mkBtn('Exit replay', exit, 'c-atk')\n    );\n    document.body.appendChild(bar);\n  }", """      lab,
      mkBtn('Hide', () => {
        rp.hidden = true;
        showBar(true);
      }),
      mkBtn('Exit replay', exit, 'c-atk')
    );
    document.body.appendChild(bar);
    showBtn = mkBtn('Replay controls', () => {
      rp.hidden = false;
      showBar(true);
    });
    showBtn.id = 'rpshow';
    showBtn.hidden = true;
    document.body.appendChild(showBtn);
  }""", 'replay: Hide button and the small button that brings the bar back')
rep(RP, """    const v = !!on && rp.on && !MenuUI.away;
    bar.hidden = !v;
    if (v) {
      lab.textContent = rp.i + ' / ' + rp.rec.cmds.length;
      playBtn.textContent = rp.playing ? 'Pause' : 'Play';
    }""", """    const v = !!on && rp.on && !MenuUI.away;
    bar.hidden = !v || !!rp.hidden;
    showBtn.hidden = !v || !rp.hidden;
    if (v) {
      lab.textContent =
        rp.i + ' / ' + rp.rec.cmds.length + (sim.result ? ' \\u00b7 decided: ' + Result.text(sim.result) : '');
      playBtn.textContent = rp.playing ? 'Pause' : 'Play';
    }""", 'replay: label shows the decision, bar can be hidden')
rep(RP, "    rp.i++;\n    showBar(true);\n    return true;", "    rp.i++;\n    Result.replayCheck(); // the game was just decided: pause here (Play runs the rest of the record)\n    showBar(true);\n    return true;", 'replay: pause when the game is decided')
rep(RP, "    Object.assign(rp, { on: true, feed: false, rec, i: 0, playing: false });", "    Result.reset();\n    Object.assign(rp, { on: true, feed: false, rec, i: 0, playing: false, hidden: false });", 'replay: start resets the result and the hidden flag')

# ================================================================ HOST: animation timing
V = 'js/view-sync.js'
rep(V, "function fly(def, sub, from, toFn, s0, s1) {", "function fly(def, sub, from, toFn, s0, s1, ms = FX.stack) {", 'view-sync: fly duration')
rep(V, "{ duration: 1700, fill: 'forwards' }", "{ duration: ms, fill: 'forwards' }", 'view-sync: fly uses ms')
rep(V, "new Promise(r => setTimeout(r, 2600))", "new Promise(r => setTimeout(r, ms + 900))", 'view-sync: fly timeout follows ms')
rep(V, "async function enterJob(pre, o, i) {", "const fxMs = o => (o.kind === 'attack' ? FX.attack : FX.stack); // an Attack is already shown by the sword: a shorter stack animation\nasync function enterJob(pre, o, i) {", 'view-sync: fxMs')
rep(V, "() => stackSlot(src.owner, i), 0.45, 0.32);", "() => stackSlot(src.owner, i), 0.45, 0.32, fxMs(o));", 'view-sync: enter animations use fxMs', count=2)
rep(V, "await fly(mk.def, 'Ability', mid, () => screenOf(mk), 0.32, 0.45);", "await fly(mk.def, 'Ability', mid, () => screenOf(mk), 0.32, 0.45, fxMs(o));", 'view-sync: leave (masked) uses fxMs')
rep(V, "          : null,\n    0.32,\n    0.45\n  );", "          : null,\n    0.32,\n    0.45,\n    fxMs(o)\n  );", 'view-sync: leave uses fxMs')
append('js/theme.js', r"""const FX = {
  stack: cssNum('--fx-stack-ms', 1700), // a spell / ability card flying to or from the stack
  attack: cssNum('--fx-attack-ms', 700), // the same for an Attack object
  resolve: cssNum('--fx-resolve-ms', 700), // pause after a spell / ability resolved
};""", 'theme.js: FX timings')

# ================================================================ CSS + index.html
rep('css/theme.css', "  --btn-atk-on: #c0392b;\n", "  --btn-atk-on: #c0392b;\n  --btn-exit: #d63a2f; /* Exit / Leave */\n  --exit-glow: #ff5a4d; /* the pulsing Exit button */\n", 'theme.css: exit colours')
rep('css/theme.css', "  /* ---- sprites on the cards ---- */", """  /* ---- timing (milliseconds) ---- */
  --fx-stack-ms: 1700; /* a spell / ability card flying to or from the stack */
  --fx-attack-ms: 700; /* the same for an Attack object: the sword already shows the attack */
  --fx-resolve-ms: 700; /* pause after a spell / ability resolved, before automatic passes and the bot go on */

  /* ---- sprites on the cards ---- */""", 'theme.css: timings')
append('css/index.css', r""".abtn.c-exit:not(:disabled) {
  background: var(--btn-exit);
}
@keyframes pr {
  0%,
  100% {
    box-shadow:
      0 0 0 2px var(--exit-glow),
      0 0 4px 1px var(--exit-glow);
  }
  50% {
    box-shadow:
      0 0 0 3px var(--exit-glow),
      0 0 18px 7px var(--exit-glow);
  }
}
.abtn.pulseR {
  animation: pr 0.9s ease-in-out infinite;
}
#rpshow {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  z-index: 3;
  padding: 4px 10px;
  font-size: 11px;
  opacity: 0.75;
}
#rpshow[hidden] {
  display: none;
}
@media (orientation: portrait) {
  #rpshow {
    left: 8px;
    transform: none;
    bottom: auto;
    top: calc(var(--topH) + 84px);
  }
}""", 'index.css: Exit colour, pulse, replay show button')
append('css/screens.css', r"""/* ---- result dialog (draggable, no backdrop: the board stays visible) ---- */
.result {
  position: fixed;
  z-index: 60;
  width: min(360px, 92vw);
  background: var(--bg);
  color: var(--fg);
  border-radius: 12px;
  border: 1px solid rgba(128, 128, 128, 0.4);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}
.result[hidden] {
  display: none;
}
.rs-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  padding: 10px 14px;
  font-size: 18px;
  font-weight: 700;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  border-bottom: 1px solid rgba(128, 128, 128, 0.3);
}
.rs-head small {
  font-size: 11px;
  font-weight: 400;
  opacity: 0.6;
}
.rs-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
}
.rs-why {
  font-size: 13px;
  opacity: 0.85;
}
.rs-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}
.rs-btns {
  display: flex;
  gap: 6px;
}
.rs-btns .abtn {
  flex: 1;
}
.abtn.rs-opt.sel,
.abtn.rs-opt.sel:disabled {
  background: var(--btn-go);
  color: #fff;
  opacity: 1;
  box-shadow: 0 0 0 2px var(--accent) inset;
}
.abtn.rs-opt.ask {
  outline: 2px dashed var(--btn-pass);
  outline-offset: 1px;
}
.rs-note {
  font-size: 11px;
  opacity: 0.75;
}""", 'screens.css: result dialog')
rep('index.html', '<script src="js/replay.js"></script>', '<script src="js/replay.js"></script>\n<script src="js/result.js"></script>', 'index.html: result.js')

# ================================================================ tests
rep('tests/selftest.js', "  out.push(\n    '---- ' +", r"""  // ================= Patch 5: victory condition =================
  {
    let s = start(900);
    setLife(s, 'Opponent', 0);
    Sim.recalc(s, []);
    eq('life 0 is still alive: no result', s.result, null);
    setLife(s, 'Opponent', -1);
    const ev = [];
    Sim.recalc(s, ev);
    eq(
      'life -1 loses: the other player wins by life, and a GameDecided event says so',
      [s.result && s.result.winner, s.result && s.result.why, ev.some(e => e.t === 'GameDecided')],
      ['Player', 'life', true]
    );
    setLife(s, 'Player', -5);
    Sim.recalc(s, []);
    eq('the first decision stands: the result does not change when the other player also drops', s.result.winner, 'Player');
    check('after the decision the game can go on (continue): commands are still accepted', D(s, { type: 'Draw', player: 'Player' }).ok);
    s = start(901);
    setLife(s, 'Player', -1);
    setLife(s, 'Opponent', -3);
    Sim.recalc(s, []);
    eq('both players at -1 or less at once: a draw', [s.result.winner, s.result.why], [null, 'life']);
    s = start(902);
    rej('Surrender: an unknown player is rejected', s, { type: 'Surrender', player: 'Nobody' }, 'Unknown player');
    D(s, { type: 'Surrender', player: 'Player' });
    eq('Surrender: the other player wins', [s.result.winner, s.result.why], ['Opponent', 'surrender']);
    rej('a decided game cannot be surrendered again', s, { type: 'Surrender', player: 'Opponent' }, 'already decided');
    rej(
      'Surrender before the game started is rejected',
      Sim.create(903, DEFS.concat(FIXTURES)),
      { type: 'Surrender', player: 'Player' },
      'Deck building'
    );
    s = start(907);
    D(s, { type: 'Leave', player: 'Opponent' });
    eq('Leave: the other player wins, marked as left', [s.result.winner, s.result.why], ['Player', 'left']);
    const win = Fx.quick('t-win', 'Winner', 0, { text: 'Test Quick spell: you win the game.', effects: [Fx.winGame()] }),
      lose = Fx.quick('t-lose', 'Loser', 0, { text: 'Test Quick spell: your opponent wins the game.', effects: [Fx.winGame('foe')] });
    s = start(904, [win, lose]);
    const w = take(s, 'Player', 't-win', 'hand');
    D(s, { type: 'PlayCard', iid: w.iid });
    pass2(s);
    eq('WinGame: the controller wins by an effect', [s.result && s.result.winner, s.result && s.result.why], ['Player', 'effect']);
    s = start(905, [win, lose]);
    const l = take(s, 'Player', 't-lose', 'hand');
    D(s, { type: 'PlayCard', iid: l.iid });
    pass2(s);
    eq('WinGame with who:foe: the opponent wins', s.result && s.result.winner, 'Opponent');
    check('Sim.API lists WinGame', Sim.API.effects.includes('WinGame'));
    const g = Sim.create(906, DEFS, {
        decks: { Player: BUILTIN_DECKS[1].cards, Opponent: BUILTIN_DECKS[0].cards },
        shuffle: true,
        autoStart: true,
      }),
      rnd = botRng(11),
      mem = {};
    let bad = 0,
      seen = 0;
    for (let i = 0; i < 400; i++) {
      const c = botChoose(g, botActor(g), rnd, mem);
      if (!c) break;
      seen++;
      if (c.type === 'Surrender' || c.type === 'Leave') bad++;
      D(g, c);
    }
    check('the bot never surrenders or leaves', !bad && seen > 50, 'bad=' + bad + ' seen=' + seen);
  }
  out.push(
    '---- ' +""", 'tests: Patch 5 checks')

# ================================================================ docs
rep('Docs/RULES.md', "- Life: 20 each. **[not built]** No win/loss check: life can go to 0 or below and play continues.",
    "- Life: 20 each. A player at life -1 or less has lost (see Victory).", 'RULES: life')
rep('Docs/RULES.md', "## Turn: one major action\n", """## Victory [proto]
- A player **loses at life <= -1** (0 is still alive), checked by `recalc` after every command. Both players at -1 or less at once = a **draw**.
- An effect can make a player win (`winGame`: the controller, or with `'foe'` the opponent).
- `Surrender` ends the game at once (the other player wins) and is allowed at any time, even during a choice. `Leave` is the same with the reason "left" (a player walking away from a running game).
- The result is recorded **once** in `state.result = {winner, why, turn}` and never changes (`why`: life, surrender, left, effect). Play is not stopped by the Sim: the host shows the result dialog, and **Continue** (both players) just goes on with the same game, result unchanged. **Rematch** (both players) starts a new game at once. **Leave** returns to the menu; the other side's dialog disappears and its Exit button pulses.

## Turn: one major action
""", 'RULES: victory')
rep('Docs/OPEN_QUESTIONS.md', "- [ ] 22. Win/loss: what happens at life <= 0, checked at <= 0 or <= -1?",
    "- [x] 22. Win/loss: a player loses at life <= -1 (0 is alive); both at once = a draw; the first decision stands. See `RULES.md` (Victory).", 'OPEN_QUESTIONS: Q22 resolved')
rep('Docs/OPEN_QUESTIONS.md', "\n## Timing and ordering\n", """
- [ ] 46. **Win vs loss at the same time.** A `winGame` effect resolving while a player is at -1: the first decision stands (proto). Should a win effect beat a life loss, or a loss win over everything?
- [ ] 47. **Continuing a decided game.** The result is fixed, so life below -1 no longer matters. Should a continued game still show who is "winning", and should a second decision (e.g. the other player also at -1) ever count?
- [ ] 48. **Leaving a running game.** Hot seat: the viewed seat leaving gives the other seat the win. Online: a disconnect timeout is open.

## Timing and ordering
""", 'OPEN_QUESTIONS: new questions')
rep('Docs/ARCHITECTURE.md', "`Activate`, `EndTurn`. (`Choose` answers any pending choice.)", "`Activate`, `EndTurn`, `Surrender`, `Leave`. (`Choose` answers any pending choice; `Surrender` / `Leave` are allowed at any time.)", 'ARCHITECTURE: commands')
rep('Docs/ARCHITECTURE.md', "`ChoiceRequested/Made`, `TurnChanged`.", "`ChoiceRequested/Made`, `TurnChanged`, `GameDecided`.", 'ARCHITECTURE: events')
rep('Docs/effects.md', "| `shieldAll(color)`, `noLifeGain()` | `shield` statuses on your board cards; `nogain` on you. |",
    "| `shieldAll(color)`, `noLifeGain()` | `shield` statuses on your board cards; `nogain` on you. |\n| `winGame(who?)` | The controller wins the game (`who:'foe'`: the opponent). Sets `state.result` (why `effect`); ignored when the game is already decided. |", 'effects.md: winGame')
rep('Docs/effects.md', "- Player stats, Distance/Speed/Acceleration, win/loss.", "- Player stats, Distance/Speed/Acceleration. (Win/loss is built: life <= -1, `winGame`, Surrender, Leave; see `RULES.md`.)", 'effects.md: not implemented list')
rep('README.md', "`js/replay.js` host and UI state", "`js/replay.js`, `js/result.js` host and UI state", 'README: result.js')
rep('README.md', "duel replays (localStorage)", "duel replays (localStorage), result dialog (rematch / continue / leave)", 'README: result dialog')

# ---------------------------------------------------------------- stop here if any pattern failed: nothing was written
if errors:
    print('Nothing was written. These patterns did not match:')
    for e in errors:
        print('  - ' + e)
    sys.exit(1)

# ---------------------------------------------------------------- write, test, roll back on any difference
paths = list(files) + list(newfiles)
orig = {r: (open(p(r), 'rb').read() if os.path.exists(p(r)) else None) for r in paths}


def restore():
    for r, b in orig.items():
        if b is None:
            if os.path.exists(p(r)):
                os.remove(p(r))
        else:
            open(p(r), 'wb').write(b)


for r, t in list(files.items()) + list(newfiles.items()):
    write(r, t)
after, err = run_tests()
if after is None:
    restore()
    die('the tests do not run after the edits (everything restored):\n' + (err or '')[:1500])
bset, aset = set(l for l in base if not l.startswith('----')), set(l for l in after if not l.startswith('----'))
lost = [l for l in bset if l.startswith('PASS') and l not in aset]
newfail = [l for l in after if l.startswith('FAIL') and l not in bset]
if lost or newfail:
    restore()
    print('ABORT: the tests changed (everything restored, nothing was modified).')
    for l in lost[:15]:
        print('  no longer passing: ' + l)
    for l in newfail[:15]:
        print('  new failure: ' + l)
    sys.exit(1)
n_checks = sum(l.startswith(('PASS', 'FAIL')) for l in after)
for rel in ('Docs/ARCHITECTURE.md', 'Docs/effects.md'):
    if os.path.exists(p(rel)):
        write(rel, re.sub(r'\d+ checks', f'{n_checks} checks', read(rel), count=1))
print(f'tests ok: {n_checks} checks, {sum(l.startswith("FAIL") for l in after)} failing (same as before)')
print('\n'.join(['', 'Edits:'] + ['  ' + l for l in log]))
print('\nDone. Run `npm run format`, review with `git diff --stat`, open index.html once (finish a duel, check the dialog, Exit, replay), then commit. Nothing was committed.')

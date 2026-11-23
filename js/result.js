// result.js - end of the game. The Sim only records WHO won and WHY (state.result, set once, never changed); everything here is host UI:
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
          cap: 'the history limit was reached',
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
      const bot = ui.mode === 'bot' && p === ui.botSeat, // the bot answers by itself
        o = other(p),
        row = mkEl('div', 'rs-row'),
        btns = mkEl('div', 'rs-btns');
      row.appendChild(mkEl('span')).textContent = NAME[p] + (bot ? ' (bot)' : '');
      for (const [v, lab] of OPTS) {
        // sel = this player's pick; ask = the other player picked it and is waiting for this one
        const cls =
            'rs-opt' +
            (v === 'leave' ? ' c-exit' : '') +
            (R.pick[p] === v ? ' sel' : R.pick[o] === v && v !== 'leave' ? ' ask' : ''),
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
        a && b
          ? 'Both players must pick the same option.'
          : 'Waiting for ' + NAME[a ? 'Opponent' : 'Player'] + '\u2026';
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
    R.left = ui.botSeat;
    ui.note = NAME[ui.botSeat] + ' (bot) left. Press Exit to return to the main menu.';
    sync();
  }
  function botDecides() {
    if (!R.open) return;
    let v = (ui.lastCfg && ui.lastCfg.botEnd) || 'random';
    if (v === 'random') v = botPick(['rematch', 'continue', 'end'], botR);
    if (v === 'end') return botLeaves();
    R.pick[ui.botSeat] = v;
    render();
    if (R.pick[other(ui.botSeat)] === v) (v === 'continue' ? doContinue : doRematch)();
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

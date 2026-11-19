// replay.js - duel replays. The Sim is deterministic, so seed + decks + stops + the accepted commands (cmdLog) rebuild a duel exactly.
// Saved to localStorage when a duel is left (the newest 5), listed and played back from the main menu.
// Storage: one small meta entry per replay (tpw_rpm_<id>) and the data (JSON, deflated, base64url) in chunks (tpw_rp_<id>_<k>).
// A replay only VIEWS: input is closed (send() refuses everything but the replay's own commands), the gameplay buttons are hidden.
// kinds: bot (Vs Bot), self (Vs Self), over (a take over of another replay) - colour coded in the list and in the bar.
const Replays = (function () {
  const MAX = 5,
    CHUNK = 500000, // characters per storage entry (replays saved as cookies were chunked at 3600 and still load)
    MAXCHUNKS = 4, // a longer duel is not saved
    PM = 'tpw_rpm_',
    PD = 'tpw_rp_',
    KINDS = { bot: 'Vs Bot', self: 'Vs Self', over: 'Take over' },
    SPEEDS = [0.5, 1, 2, 4],
    mem = new Map(); // the replays saved in this session (used when storage is full or blocked)
  const kindOf = m => m.k || m.kind || m.m || m.mode || 'self'; // list entries (k) and records (kind); older ones only knew the mode
  const jar = () => Store.keys('tpw_').map(k => [k, Store.get(k)]),
    setC = (k, v) => Store.set(k, v),
    delC = k => Store.del(k);
  // ---- packing: JSON -> deflate (when the browser has CompressionStream) -> base64url. First character: z = deflated, j = plain
  const b64 = u8 => {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const unb64 = t => {
    const s = atob(t.replace(/-/g, '+').replace(/_/g, '/')),
      u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  };
  const pipe = async (u8, stream) =>
    new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer());
  async function pack(obj) {
    const raw = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream === 'function')
      try {
        return 'z' + b64(await pipe(raw, new CompressionStream('deflate')));
      } catch (e) {}
    return 'j' + b64(raw);
  }
  async function unpack(t) {
    const u = unb64(t.slice(1)),
      raw = t[0] === 'z' ? await pipe(u, new DecompressionStream('deflate')) : u;
    return JSON.parse(new TextDecoder().decode(raw));
  }
  // ---- the store
  function list() {
    // oldest first
    const out = new Map();
    for (const [k, v] of jar())
      if (k.startsWith(PM))
        try {
          const m = JSON.parse(decodeURIComponent(v));
          out.set(m.id, m);
        } catch (e) {}
    for (const [id, r] of mem) if (!out.has(id)) out.set(id, r.meta);
    return [...out.values()].sort((a, b) => a.t - b.t);
  }
  function remove(id) {
    const m = list().find(x => x.id === id);
    for (let k = 0; k < Math.max(MAXCHUNKS, (m && m.c) || 0); k++) delC(PD + id + '_' + k);
    delC(PM + id);
    mem.delete(id);
  }
  async function load(id) {
    const m = list().find(x => x.id === id);
    if (!m) return null;
    const J = new Map(jar());
    let t = '',
      ok = true;
    for (let k = 0; k < m.c; k++) {
      const part = J.get(PD + id + '_' + k);
      if (part == null) {
        ok = false;
        break;
      }
      t += part;
    }
    if (ok)
      try {
        return await unpack(t);
      } catch (e) {}
    return mem.has(id) ? mem.get(id).rec : null;
  }
  async function saveCurrent() {
    // everything is captured BEFORE the first await: the caller may reset the game right after
    const init = ui.rpInit;
    if (!init || cmdLog.length <= (init.base || 0) || rp.on) return false; // nothing new to record (a take over without a move is not a replay)
    const rec = Object.assign({ v: 1 }, init, { cmds: cmdLog.slice() }),
      id = Date.now().toString(36),
      meta = {
        id,
        t: Date.now(),
        a: init.a,
        b: init.b,
        m: init.mode,
        k: init.kind || init.mode,
        as: init.as || null,
        n: rec.cmds.length,
        turns: sim.turn,
        life: [sim.life.Player, sim.life.Opponent],
        c: 0,
      };
    const data = await pack(rec),
      chunks = [];
    for (let i = 0; i < data.length; i += CHUNK) chunks.push(data.slice(i, i + CHUNK));
    if (chunks.length > MAXCHUNKS) return false; // too long to store
    meta.c = chunks.length;
    for (const m of list().slice(0, Math.max(0, list().length - (MAX - 1)))) remove(m.id); // keep the newest MAX
    if (!chunks.every((x, k) => setC(PD + id + '_' + k, x))) {
      chunks.forEach((x, k) => delC(PD + id + '_' + k)); // storage full: leave nothing half-written
      return false;
    }
    setC(PM + id, encodeURIComponent(JSON.stringify(meta))); // the meta entry goes last: a listed replay is complete
    mem.set(id, { meta, rec });
    return true;
  }
  // ---- the control bar: small SVG icon buttons (text labels only while expanded); minimised = just the icons
  const ICON = {
    back: '<path d="M4 3h2v10H4zM13 3v10L6.5 8z"/>',
    play: '<path d="M4 2.5v11l9-5.5z"/>',
    pause: '<path d="M4 3h3v10H4zM9 3h3v10H9z"/>',
    step: '<path d="M10 3h2v10h-2zM3 3v10l6.5-5z"/>',
    speed: '<path d="M2 3l6 5-6 5zM8 3l6 5-6 5z"/>',
    over: '<circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-5 6-5s6 1.7 6 5z"/>',
    min: '<path d="M3 11h10v2H3z"/>',
    max: '<path fill-rule="evenodd" d="M3 3h10v10H3zm2 2v6h6V5z"/>',
    exit: '<path d="M3.5 2.5L8 7l4.5-4.5 1 1L9 8l4.5 4.5-1 1L8 9l-4.5 4.5-1-1L7 8 2.5 3.5z"/>',
  };
  const setIcon = (b, name) => {
    b.firstChild.innerHTML = ICON[name];
  };
  function ibtn(icon, text, title, fn, cls, keep) {
    const b = mkEl('button', 'abtn ib' + (cls ? ' ' + cls : ''));
    b.innerHTML =
      '<svg viewBox="0 0 16 16" aria-hidden="true">' +
      ICON[icon] +
      '</svg><span class="' +
      (keep ? 'kp' : 'txt') +
      '"></span>';
    b.lastChild.textContent = text;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.onclick = fn;
    return b;
  }
  let bar = null,
    tag,
    lab,
    dec,
    playBtn,
    spdBtn,
    minBtn;
  const pause = () => {
    rp.playing = false;
    clearTimeout(rp.timer);
  };
  function build() {
    bar = mkEl('div');
    bar.id = 'rpbar';
    bar.hidden = true;
    tag = mkEl('span', 'rp-tag txt');
    lab = mkEl('span');
    dec = mkEl('span', 'dec');
    playBtn = ibtn('play', 'Play', 'Play / pause', toggle, 'c-go');
    spdBtn = ibtn(
      'speed',
      '',
      'Playback speed',
      () => {
        rp.speed = SPEEDS[(SPEEDS.indexOf(rp.speed) + 1) % SPEEDS.length];
        showBar(true);
      },
      '',
      true
    );
    minBtn = ibtn('min', 'Minimize', 'Minimize the replay controls', () => {
      rp.min = !rp.min;
      showBar(true);
    });
    bar.append(
      tag,
      ibtn('back', 'Back', 'Step back', stepBack),
      playBtn,
      ibtn('step', 'Step', 'Step forward', () => {
        pause();
        stepFwd();
      }),
      spdBtn,
      lab,
      dec,
      ibtn('over', 'Take over', 'Take over: play on from here (or from the start)', openTakeOver),
      minBtn,
      ibtn('exit', 'Exit replay', 'Exit the replay', exit, 'c-atk')
    );
    document.body.appendChild(bar);
  }
  function showBar(on) {
    if (!bar) {
      if (!on) return;
      build();
    }
    const v = !!on && rp.on && !MenuUI.away;
    bar.hidden = !v;
    bar.classList.toggle('min', !!rp.min);
    if (!v) return;
    const k = kindOf(rp.rec);
    tag.className = 'rp-tag txt k-' + k;
    tag.textContent = KINDS[k] || k;
    lab.textContent = rp.i + ' / ' + rp.rec.cmds.length;
    dec.textContent = sim.result ? ' \u00b7 decided: ' + Result.text(sim.result) : '';
    setIcon(playBtn, rp.playing ? 'pause' : 'play');
    playBtn.lastChild.textContent = rp.playing ? 'Pause' : 'Play';
    spdBtn.lastChild.textContent = '\u00d7' + rp.speed;
    setIcon(minBtn, rp.min ? 'max' : 'min');
    minBtn.title = rp.min ? 'Expand the replay controls' : 'Minimize the replay controls';
    minBtn.setAttribute('aria-label', minBtn.title);
  }
  // ---- seat: Player 1 / Player 2 / Current player (the camera follows priority, like Vs Self auto view)
  function applyView() {
    ui.autoView = rp.view === 'auto';
    ui.pin = null;
    ui.viewHold = false;
    if (rp.view === 'p1') setView('Player');
    else if (rp.view === 'p2') setView('Opponent');
    else setView(game.choice ? game.choice.player : game.priority);
    sync();
  }
  function cycleView() {
    if (!rp.on) return;
    rp.view = { auto: 'p1', p1: 'p2', p2: 'auto' }[rp.view] || 'auto';
    applyView();
  }
  // ---- playback: the replay sends its recorded commands through the normal send(); input is closed while it runs
  function stepFwd() {
    if (!rp.on || ui.fxBusy || rp.i >= rp.rec.cmds.length) return false;
    rp.feed = true;
    let r;
    try {
      r = send(rp.rec.cmds[rp.i], 'replay');
    } finally {
      rp.feed = false;
    }
    if (!r.ok) {
      // the game changed since the duel was recorded: stop instead of guessing
      pause();
      ui.note = 'Replay stopped at command ' + (rp.i + 1) + ': ' + r.why;
      sync();
      showBar(true);
      return false;
    }
    rp.i++;
    Result.replayCheck(); // the game was just decided: pause here (Play runs the rest of the record)
    showBar(true);
    return true;
  }
  function stepBack() {
    if (!rp.on || ui.fxBusy || !undoStack.length || rp.i <= 0) return;
    pause();
    undo(); // every accepted command pushed a snapshot
    rp.i--;
    showBar(true);
  }
  function tick() {
    clearTimeout(rp.timer);
    if (!rp.on || !rp.playing || MenuUI.away) return;
    if (ui.fxBusy) {
      rp.timer = setTimeout(tick, 120); // wait for the showcase animation
      return;
    }
    if (!stepFwd()) {
      pause();
      showBar(true);
      return;
    }
    rp.timer = setTimeout(tick, 650 / rp.speed);
  }
  function toggle() {
    if (!rp.on) return;
    rp.playing = !rp.playing && rp.i < rp.rec.cmds.length;
    showBar(true);
    tick();
  }
  function exit() {
    rp.on = false;
    pause();
    showBar(false);
    MenuUI.show();
  }
  function clearTable() {
    for (const m of meshes.values()) cardGroup.remove(m);
    meshes.clear();
    ui.selected = null;
    ui.openList = null;
    inspect.hidden = true;
    deckPanel.hidden = true;
  }
  function start(rec, keep) {
    // keep = a restart: the seat and the bar size stay as they were
    clearTimeout(rp.timer);
    Result.reset();
    Object.assign(rp, { on: true, feed: false, rec, i: 0, playing: false });
    if (!keep) Object.assign(rp, { view: 'auto', min: false });
    ui.mode = 'replay';
    ui.deckEdit = false;
    ui.pin = null;
    ui.placing = null;
    ui.note = '';
    ui.viewHold = false;
    bannerEl.hidden = true;
    clearTimeout(ui.botTimer);
    clearTimeout(ui.stepTimer);
    sim = Sim.create(rec.n, DEFS, {
      decks: { Player: rec.d1, Opponent: rec.d2 },
      extra: { Player: rec.x1 || [], Opponent: rec.x2 || [] }, // older replays had no extra deck
      shuffle: rec.sh,
      autoStart: true,
      stops: rec.stops,
    });
    game = sim;
    fxReset();
    undoStack.length = 0;
    cmdLog.length = 0;
    eventLog.length = 0;
    GameLog.clear();
    clearTable();
    applyView();
    showBar(true);
  }
  function restart() {
    // Reset game inside a replay: the same replay again from the first command, auto play off
    if (rp.on) start(rp.rec, true);
  }
  // ---- take over: continue the replay as a real duel
  function takeOver(as, from) {
    const rec = rp.rec,
      at = rp.i;
    pause();
    rp.on = false;
    Result.reset();
    ui.mode = as === 'both' ? 'self' : 'bot'; // both = Vs Self; otherwise Vs Bot with the bot on the other seat
    ui.botSeat = as === 'p2' ? 'Player' : 'Opponent';
    ui.autoView = as === 'both';
    ui.deckEdit = false;
    ui.pin = null;
    ui.placing = null;
    ui.note = '';
    ui.viewHold = false;
    clearTimeout(ui.botTimer);
    clearTimeout(ui.stepTimer);
    botMem.turn = -1;
    if (from === 'start') {
      sim = Sim.create(rec.n, DEFS, {
        decks: { Player: rec.d1, Opponent: rec.d2 },
        extra: { Player: rec.x1 || [], Opponent: rec.x2 || [] }, // older replays had no extra deck
        shuffle: rec.sh,
        autoStart: true,
        stops: rec.stops,
      });
      undoStack.length = 0; // (from the current state the replay's snapshots stay: Undo goes back through the replayed moves too)
      eventLog.length = 0;
      GameLog.clear();
      cmdLog.length = 0;
    } else {
      cmdLog.length = 0;
      rec.cmds.slice(0, at).forEach(c => cmdLog.push(JSON.parse(JSON.stringify(c)))); // the new replay holds the whole duel
    }
    game = sim;
    fxReset();
    ui.lastCfg = {
      mode: ui.mode,
      p1: rec.a,
      p2: rec.b,
      shuffle: !!rec.sh,
      botEnd: MenuUI.last.botEnd || 'random',
      botSeat: ui.botSeat,
    };
    ui.rpInit = {
      n: rec.n,
      d1: rec.d1.slice(),
      d2: rec.d2.slice(),
      x1: (rec.x1 || []).slice(),
      x2: (rec.x2 || []).slice(),
      sh: !!rec.sh,
      stops: rec.stops || null,
      mode: ui.mode,
      a: rec.a,
      b: rec.b,
      kind: 'over',
      as,
      from,
      base: cmdLog.length,
    };
    clearTable();
    showBar(false);
    setView(as === 'p2' ? 'Opponent' : 'Player');
    sync();
    autoStep();
  }
  function openTakeOver() {
    if (!rp.on) return;
    pause();
    showBar(true);
    modal((box, close, cancel) => {
      box.appendChild(mkEl('h2')).textContent = 'Take over';
      const group = (title, name, opts, def) => {
        const w = mkEl('div', 'mgroup');
        w.appendChild(mkEl('div', 'mgtitle')).textContent = title;
        for (const [v, t] of opts) {
          const l = mkEl('label', 'mcheck'),
            r = mkEl('input');
          r.type = 'radio';
          r.name = name;
          r.value = v;
          r.checked = v === def;
          l.append(r, document.createTextNode(' ' + t));
          w.appendChild(l);
        }
        box.appendChild(w);
        return () => w.querySelector('input:checked').value;
      };
      const as = group(
          'Play',
          'rp-as',
          [
            ['p1', 'As Player 1 (a bot plays Player 2)'],
            ['p2', 'As Player 2 (a bot plays Player 1)'],
            ['both', 'Both (you play both sides)'],
          ],
          { p1: 'p1', p2: 'p2', auto: 'both' }[rp.view]
        ),
        from = group(
          'Start',
          'rp-from',
          [
            ['start', 'From the beginning'],
            ['now', 'From the current board state'],
          ],
          'now'
        );
      const row = mkEl('div', 'mrow');
      row.append(
        mkBtn(
          'Confirm',
          () => {
            const a = as(),
              f = from();
            close();
            const go = () => (ui.fxBusy ? setTimeout(go, 100) : takeOver(a, f)); // wait for a running animation
            go();
          },
          'c-go'
        ),
        mkBtn('Cancel', cancel, 'c-pass')
      );
      box.appendChild(row);
    });
  }
  // ---- the list (main menu): colour coded by kind
  function open() {
    modal((box, close, cancel) => {
      box.appendChild(mkEl('h2')).textContent = 'Replays';
      const lst = mkEl('div', 'rp-list');
      box.appendChild(lst);
      const render = () => {
        lst.replaceChildren();
        const L = list().reverse();
        if (!L.length) {
          lst.appendChild(mkEl('p', 'mmsg')).textContent =
            'No replays yet. A replay is saved when you leave a duel (the newest ' + MAX + ' are kept).';
          return;
        }
        for (const m of L) {
          const k = kindOf(m),
            row = mkEl('div', 'rp-row k-' + k),
            t = mkEl('span'),
            tg = mkEl('b', 'rp-tag');
          tg.textContent =
            (KINDS[k] || k) +
            (k === 'over' && m.as ? ' \u00b7 ' + { p1: 'as P1', p2: 'as P2', both: 'both' }[m.as] : '');
          t.append(
            tg,
            document.createTextNode(
              new Date(m.t).toLocaleString() +
                ' \u00b7 ' +
                m.a +
                ' vs ' +
                m.b +
                ' \u00b7 turn ' +
                m.turns +
                ' \u00b7 life ' +
                m.life.join(':')
            )
          );
          row.append(
            t,
            mkBtn(
              'Watch',
              async () => {
                const rec = await load(m.id);
                if (!rec) {
                  t.textContent = 'This replay could not be read';
                  return;
                }
                close();
                MenuUI.away = false;
                MenuUI.hide();
                start(rec);
              },
              'c-go'
            ),
            mkBtn(
              'Delete',
              () => {
                remove(m.id);
                render();
              },
              'c-atk'
            )
          );
          lst.appendChild(row);
        }
      };
      render();
      const row = mkEl('div', 'mrow');
      row.appendChild(mkBtn('Close', cancel));
      box.appendChild(row);
    });
  }
  return { list, remove, load, saveCurrent, open, bar: showBar, start, restart, cycleView };
})();

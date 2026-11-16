// replay.js - duel replays. The Sim is deterministic, so seed + decks + the accepted commands (cmdLog) rebuild a duel exactly.
// Saved to cookies when a duel is left (the newest 5), listed and played back from the main menu.
// Storage: one small meta cookie per replay (tpw_rpm_<id>) and the data (JSON, deflated, base64url) in chunks (tpw_rp_<id>_<k>).
const Replays = (function () {
  const MAX = 5,
    CHUNK = 3600, // characters per cookie (a cookie holds ~4 KB including its name)
    MAXCHUNKS = 3, // a longer duel is not saved
    PM = 'tpw_rpm_',
    PD = 'tpw_rp_',
    mem = new Map(); // fallback when cookies are unavailable (e.g. file://)
  const jar = () => {
    let raw = '';
    try {
      raw = document.cookie || '';
    } catch (e) {}
    return raw
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => {
        const i = s.indexOf('=');
        return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)];
      });
  };
  const setC = (k, v) => {
    try {
      document.cookie = k + '=' + v + '; max-age=31536000; path=/; SameSite=Lax';
    } catch (e) {}
  };
  const delC = k => {
    try {
      document.cookie = k + '=; max-age=0; path=/; SameSite=Lax';
    } catch (e) {}
  };
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
  const pipe = async (u8, stream) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer());
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
    if (!init || !cmdLog.length || rp.on) return false;
    const rec = Object.assign({ v: 1 }, init, { cmds: cmdLog.slice() }),
      id = Date.now().toString(36),
      meta = { id, t: Date.now(), a: init.a, b: init.b, m: init.mode, n: rec.cmds.length, turns: sim.turn, life: [sim.life.Player, sim.life.Opponent], c: 0 };
    const data = await pack(rec),
      chunks = [];
    for (let i = 0; i < data.length; i += CHUNK) chunks.push(data.slice(i, i + CHUNK));
    if (chunks.length > MAXCHUNKS) return false; // too long for cookies
    meta.c = chunks.length;
    for (const m of list().slice(0, Math.max(0, list().length - (MAX - 1)))) remove(m.id); // keep the newest MAX
    chunks.forEach((x, k) => setC(PD + id + '_' + k, x));
    setC(PM + id, encodeURIComponent(JSON.stringify(meta))); // the meta cookie goes last: a listed replay is complete
    mem.set(id, { meta, rec });
    return true;
  }
  // ---- playback: the replay sends its recorded commands through the normal send(); input is closed while it runs
  let bar = null,
    lab,
    playBtn;
  function build() {
    bar = mkEl('div');
    bar.id = 'rpbar';
    bar.hidden = true;
    lab = mkEl('span');
    playBtn = mkBtn('Play', toggle, 'c-go');
    const spd = mkEl('select', 'dctl');
    for (const [v, t] of [['0.5', 'Slow'], ['1', 'Normal'], ['2', 'Fast'], ['4', 'Very fast']]) {
      const o = mkEl('option');
      o.value = v;
      o.textContent = t;
      spd.appendChild(o);
    }
    spd.value = String(rp.speed);
    spd.onchange = () => {
      rp.speed = +spd.value;
    };
    bar.append(
      mkBtn('\u25c0 Back', stepBack),
      playBtn,
      mkBtn('Step \u25b6', () => {
        rp.playing = false;
        clearTimeout(rp.timer);
        stepFwd();
      }),
      spd,
      lab,
      mkBtn('Exit replay', exit, 'c-atk')
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
    if (v) {
      lab.textContent = rp.i + ' / ' + rp.rec.cmds.length;
      playBtn.textContent = rp.playing ? 'Pause' : 'Play';
    }
  }
  function stepFwd() {
    if (!rp.on || ui.fxBusy || rp.i >= rp.rec.cmds.length) return false;
    rp.feed = true;
    let r;
    try {
      r = send(rp.rec.cmds[rp.i]);
    } finally {
      rp.feed = false;
    }
    if (!r.ok) {
      // the game changed since the duel was recorded: stop instead of guessing
      rp.playing = false;
      ui.note = 'Replay stopped at command ' + (rp.i + 1) + ': ' + r.why;
      sync();
      showBar(true);
      return false;
    }
    rp.i++;
    showBar(true);
    return true;
  }
  function stepBack() {
    if (!rp.on || ui.fxBusy || !undoStack.length || rp.i <= 0) return;
    rp.playing = false;
    clearTimeout(rp.timer);
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
      rp.playing = false;
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
    rp.playing = false;
    clearTimeout(rp.timer);
    showBar(false);
    MenuUI.show();
  }
  function start(rec) {
    clearTimeout(rp.timer);
    Object.assign(rp, { on: true, feed: false, rec, i: 0, playing: false });
    ui.mode = 'replay';
    ui.deckEdit = false;
    ui.autoView = true;
    ui.pin = null;
    ui.placing = null;
    clearTimeout(ui.botTimer);
    sim = Sim.create(rec.n, DEFS, { decks: { Player: rec.d1, Opponent: rec.d2 }, shuffle: rec.sh, autoStart: true });
    game = sim;
    fxReset();
    undoStack.length = 0;
    cmdLog.length = 0;
    eventLog.length = 0;
    for (const m of meshes.values()) cardGroup.remove(m);
    meshes.clear();
    ui.selected = null;
    ui.openList = null;
    inspect.hidden = true;
    deckPanel.hidden = true;
    setView('Player');
    sync();
    showBar(true);
  }
  function open() {
    modal((box, close, cancel) => {
      box.appendChild(mkEl('h2')).textContent = 'Replays';
      const lst = mkEl('div', 'rp-list');
      box.appendChild(lst);
      const render = () => {
        lst.replaceChildren();
        const L = list().reverse();
        if (!L.length) {
          lst.appendChild(mkEl('p', 'mmsg')).textContent = 'No replays yet. A replay is saved when you leave a duel (the newest ' + MAX + ' are kept).';
          return;
        }
        for (const m of L) {
          const row = mkEl('div', 'rp-row'),
            t = mkEl('span');
          t.textContent =
            new Date(m.t).toLocaleString() + ' \u00b7 ' + m.a + ' vs ' + m.b + ' \u00b7 ' + (m.m === 'bot' ? 'Vs Bot' : 'Vs Self') +
            ' \u00b7 turn ' + m.turns + ' \u00b7 life ' + m.life.join(':');
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
  return { list, remove, load, saveCurrent, open, bar: showBar, start };
})();

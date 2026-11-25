// targeting.js - target selection for spells and abilities: red target marks, curved arrows, Confirm.
// While a spell or ability of the viewer asks to target / pick something (a pending Sim choice, or a spell held to cast that needs a
// target), every legal target carries a red mark (flashing, rotating). X curved arrows run from the spell / ability (its stack row,
// else its card) to the cursor, X = the picks it still asks for; a picked target keeps one arrow on its mark (on a phone the arrow is
// only drawn once the target is picked). Clicking a picked target again undoes it and the arrow goes back to the cursor.
// The picks stay in the UI until the last one: the Sim answers one pick per Choose, so the next pick's legal options are read from a
// dry run (a copy of the Sim with the picks so far applied). Settings 'targetConfirm': false = the picks are sent as soon as the last
// one is marked, true = a Confirm button sends them. Non-target answers (Done, Do not play...) are sent at once, after the picks.
// Auto selection (Settings 'autoPick', on by default): a pick with one legal option only is made for the player, and it still gets its
// mark and arrow (Underworld Fusion: the last material). The dry run asks every pick (noAuto), the UI makes the single ones; off, the
// Sim is told (SetAutoPick) and the player clicks them. Widow Maker's pair (two adjacent zones) is two picks of the same chain.
// The view never edits the game: the picks become ordinary Choose / PlayCard commands through send().
const Targeting = (function () {
  const NOT_TARGET = new Set(['mode', 'trigorder', 'libplay', 'libseen']), // plain menus, not targets
    BUTTONS = new Set(['done', 'no', 'ok', 'stay', 'play', 'skip']), // answers that are buttons, never targets
    NS = 'http://www.w3.org/2000/svg';
  let T = null, // {key, base, picks[], auto[], sends[], cur, vs, done}
    queue = null; // {player, picks[{o, auto}]}: picks being sent one Choose at a time
  const ptr = { x: -1, y: -1, touch: false };
  addEventListener(
    'pointermove',
    e => {
      ptr.x = e.clientX;
      ptr.y = e.clientY;
      if (e.pointerType === 'mouse') ptr.touch = false;
    },
    true
  );
  addEventListener(
    'pointerdown',
    e => {
      ptr.touch = e.pointerType !== 'mouse';
      ptr.x = e.clientX;
      ptr.y = e.clientY;
    },
    true
  );
  // ---- overlay: the arrows (svg) and the board marks (divs); neither takes clicks
  const svg = document.createElementNS(NS, 'svg');
  svg.id = 'tgtArrows';
  svg.innerHTML =
    '<defs><marker id="tgtHead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#ff3b3b"/></marker></defs>';
  const marksEl = document.createElement('div');
  marksEl.id = 'tgtMarks';
  document.body.append(svg, marksEl);
  const MARK_SVG =
    '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="14"/><circle cx="20" cy="20" r="5"/><path d="M20 1v9M20 30v9M1 20h9M30 20h9"/></svg>';
  const markHTML = () => '<span class="tmark">' + MARK_SVG + '</span>';
  const paths = [],
    marks = new Map(); // option -> overlay div
  // ---- which choices are targeting
  const isTargetKind = k => !!k && !!k.kind && !NOT_TARGET.has(k.kind);
  const autoOn = () => Settings.get('autoPick') !== false;
  const isCard = (s, o) => !!s.cards[o];
  const isBoardOpt = o => /^[ZPS]:/.test(o) || (typeof game !== 'undefined' && o in game.slots);
  const isButton = (s, o) => BUTTONS.has(o) && !isCard(s, o);
  function castBase() {
    // a spell held to cast that needs a target: a choice of the UI's own (the Sim takes the target with PlayCard)
    const c = ui.placing;
    if (!c || ui.extraAsk || isPerm(c) || rp.on) return null;
    const d = c.def,
      opts = [];
    if (d.zoneTarget) Sim.targetZones(game, c).forEach(k => opts.push('Z:' + k));
    else if (d.colTarget) {
      const cols = Sim.targetColumns(game, c);
      zones.forEach(z => z.userData.slot && cols.includes(z.userData.slot.col) && opts.push('Z:' + z.userData.slotKey));
    }
    if (d.playerTarget) opts.push('P:Player', 'P:Opponent');
    if (d.stackTarget) game.stack.filter(o => o.kind === 'spell').forEach(o => opts.push('S:' + o.sid));
    if (!opts.length) return null;
    return {
      player: ui.view,
      iid: c.iid,
      kind: 'cast',
      options: opts,
      prompt: 'Targeting for ' + d.name + (d.colTarget ? ': a zone of the column to hit.' : '.'),
    };
  }
  function baseChoice() {
    if (rp.on || game.phase !== 'play') return null;
    const k = game.choice;
    if (k) return !foeChoice() && isTargetKind(k) ? k : null;
    return castBase();
  }
  const sameChain = k => !!k && !!T && k.player === T.base.player && k.iid === T.base.iid && isTargetKind(k);
  function needOf(k, s) {
    if (!k) return 0;
    const n = k.need != null ? k.need : ['upto', 'vault'].includes(k.kind) && k.left != null ? k.left : 1,
      t = k.options.filter(o => !isButton(s, o)).length;
    return Math.max(0, Math.min(n, t));
  }
  // Widow Maker's pair as a choice of single zones: the zones of every pair, or (one picked) its adjacent partners
  function pairView(k, a) {
    return {
      player: k.player,
      iid: k.iid,
      kind: 'pairpick',
      options: a ? pairPartners(k, a) : [...new Set(k.options.flatMap(o => o.split('#')))],
      need: a ? 1 : 2,
      prompt: k.prompt + (a ? ' Now an adjacent one.' : ''),
    };
  }
  function recompute() {
    T.cur = T.base;
    T.vs = null;
    T.done = false;
    T.auto = [];
    T.sends = [];
    if (T.base.kind === 'cast') {
      T.picks = T.picks.filter(o => T.base.options.includes(o)).slice(0, 1);
      T.done = T.picks.length > 0;
      if (T.done) T.cur = null;
      return;
    }
    if (game !== sim) {
      T.picks = []; // an animation shows an older state: nothing is buffered meanwhile
      if (isPairChoice(T.base)) T.cur = pairView(T.base, null);
      return;
    }
    // the dry run: a copy of the Sim that asks every pick (noAuto), the manual picks applied in order, the single ones made here
    const vs = structuredClone(sim),
      ok = [],
      P = T.base.player,
      choose = o => Sim.dispatch(vs, { type: 'Choose', player: P, option: o }).ok;
    vs.noAuto = Object.assign({}, vs.noAuto, { [P]: true });
    let i = 0,
      cur = null;
    for (;;) {
      const k = vs.choice;
      if (!k || (T.sends.length && !sameChain(k))) break;
      if (k.options.length === 1 && autoOn()) {
        // nothing to decide: picked for the player (mark and arrow included)
        if (!choose(k.options[0])) {
          cur = k;
          break;
        }
        T.auto.push(...(isPairChoice(k) ? k.options[0].split('#') : k.options));
        T.sends.push({ o: k.options[0], auto: true });
        continue;
      }
      if (isPairChoice(k)) {
        const v = pairView(k, null),
          a = T.picks[i],
          b = T.picks[i + 1];
        if (a == null || !v.options.includes(a)) {
          cur = v;
          break;
        }
        const pv = pairView(k, a);
        if (b == null || !pv.options.includes(b)) {
          ok.push(a);
          cur = pv;
          break;
        }
        const o = k.options.find(q => q.split('#').includes(a) && q.split('#').includes(b));
        if (!choose(o)) {
          cur = v;
          break;
        }
        ok.push(a, b);
        i += 2;
        T.sends.push({ o });
        continue;
      }
      const o = T.picks[i];
      if (o == null || !k.options.includes(o) || !choose(o)) {
        cur = k;
        break;
      }
      ok.push(o);
      i++;
      T.sends.push({ o });
    }
    T.picks = ok;
    T.vs = T.sends.length ? vs : null;
    T.cur = cur;
    T.done = !cur;
  }
  // every sync: is a target selection on, which choice does it show
  function refresh() {
    if (queue) {
      T = null;
      return;
    }
    const b = baseChoice();
    if (!b) {
      T = null;
      return;
    }
    const key = [undoStack.length, b.player, b.iid, b.kind, b.options.join(','), b.prompt].join('|');
    if (!T || T.key !== key) T = { key, base: b, picks: [] };
    else T.base = b;
    recompute();
    // every pick had one legal option only: nothing to click, the picks go (unless Confirm is asked for)
    if (T.done && !T.picks.length && T.sends.length && !confirmMode()) {
      const t = T;
      setTimeout(() => T === t && T.done && commit(), 0);
    }
  }
  const on = () => !!T || !!queue;
  const choice = () => (T ? T.cur : null);
  const vstate = () => (T && T.vs) || game;
  const picked = o => !!T && (T.picks.includes(o) || T.auto.includes(o));
  const confirmMode = () => !!Settings.get('targetConfirm');
  // a click on o (a card iid, Z:zone, a slot key, P:player, S:stack sid, a list option): pick it, undo it, or answer with it
  function click(o) {
    if (!T || o == null) return false;
    if (ui.fxBusy) return true; // input waits for the animation
    const i = T.picks.indexOf(o);
    if (i >= 0) {
      T.picks.splice(i, 1); // undo: the arrow goes back to the cursor (later picks stay if they are still legal)
      recompute();
      sync();
      return true;
    }
    if (T.base.kind === 'cast') {
      // one target: a new pick replaces the old one
      if (!T.base.options.includes(o)) return false;
      T.picks = [o];
      recompute();
      if (!confirmMode()) commit();
      else sync();
      return true;
    }
    const k = T.cur;
    if (!k || !k.options.includes(o) || T.auto.includes(o)) return false;
    if (isButton(vstate(), o)) {
      // Done / Do not play...: the answer itself, sent at once after the picks so far
      if (T.base.kind !== 'cast') commit([...T.sends, { o }]);
      return true;
    }
    T.picks.push(o);
    recompute();
    if (T.done && !confirmMode()) commit();
    else sync();
    return true;
  }
  function commit(list) {
    if (!T) return;
    if (T.base.kind === 'cast') {
      const c = ui.placing,
        o = T.picks[0];
      T = null;
      if (!c || !o) return sync();
      if (o.startsWith('Z:')) place(c, slotZones[o.slice(2)]);
      else if (o.startsWith('P:')) send({ type: 'PlayCard', iid: c.iid, tplayer: o.slice(2) });
      else send({ type: 'PlayCard', iid: c.iid, tsid: +o.slice(2) });
      return;
    }
    queue = { player: T.base.player, picks: (list || T.sends).slice() };
    T = null;
    flush();
  }
  // send the queued picks, one Choose each; an animation in between pauses it (autoStep calls flush again when it ends)
  function flush() {
    while (queue && queue.picks.length) {
      if (ui.fxBusy || game !== sim) return;
      const k = sim.choice,
        { o, auto } = queue.picks[0];
      if (auto && !(k && k.options.includes(o))) {
        queue.picks.shift(); // a single option the Sim already picked by itself (auto selection on)
        continue;
      }
      if (!k || k.player !== queue.player || !k.options.includes(o)) break;
      queue.picks.shift();
      if (!send({ type: 'Choose', player: k.player, option: o }).ok) break;
    }
    if (queue) {
      queue = null;
      sync();
    }
  }
  function cancel() {
    if (!T || !T.picks.length) return false;
    T.picks = [];
    recompute();
    sync();
    return true;
  }
  // the option a board click means: a picked one first (undo), else a legal one of the shown choice
  function optAt(u) {
    if (!T) return null;
    const c = [];
    if (u.slotKey) c.push('Z:' + u.slotKey, u.slotKey, game.slots[u.slotKey]);
    if (u.card) {
      c.push(u.card.iid);
      if (u.card.loc === 'board') c.push('Z:' + u.card.slot, u.card.slot);
    }
    const ok = c.filter(Boolean);
    const k = T.base.kind === 'cast' ? T.base : T.cur;
    return (
      ok.find(o => T.picks.includes(o)) || (k && ok.find(o => k.options.includes(o) && !isButton(vstate(), o))) || null
    );
  }
  // ---- the panel (#pick): the prompt, list options with their art and a mark, the picked list items, buttons, Confirm
  const nameOf = (s, k, o) =>
    (k && k.labels && k.labels[o]) || (s.cards[o] ? s.cards[o].def.name : o.startsWith('P:') ? NAME[o.slice(2)] : o);
  const defOf = (s, o) => (s.cards[o] ? s.cards[o].def : typeof DEFS !== 'undefined' && DEFS.find(d => d.id === o));
  function row(s, k, o, sel, onclick) {
    const b = document.createElement('button'),
      d = defOf(s, o);
    b.className = 'abtn trow' + (sel ? ' sel' : '');
    b.dataset.opt = o;
    b.innerHTML = (d ? '<img alt="">' : '') + '<span class="tnm"></span>' + markHTML();
    if (d) {
      b.querySelector('img').src = artURL(d);
      b.style.setProperty('--tc', cardColor(d));
    }
    b.querySelector('.tnm').textContent = nameOf(s, k, o);
    b.onclick = onclick;
    return b;
  }
  // list options: what cannot be clicked on the board (a deck, the graveyard, the extra deck, a stack object, a status...)
  function listOpts(k) {
    if (!k) return [];
    const s = vstate(),
      at = k.kind === 'pairpick' ? [] : Sim.choicePicks(s, k.player).clickable || [];
    // per card (Creeping Parasite's 4 damage mixes cards and life bars: its board cards are still clicked, never listed)
    return k.options.filter(
      o => !isButton(s, o) && !isBoardOpt(o) && !(isCard(s, o) && at.includes(o) && meshes.has(o))
    );
  }
  function render(pk) {
    // returns true when it filled the panel
    if (queue) {
      pk.hidden = true;
      return true;
    }
    if (!T) return false;
    const s = vstate(),
      k = T.cur,
      rows = k && k.kind !== 'declare' ? listOpts(k) : [],
      chips = [...T.picks, ...T.auto].filter(o => !isBoardOpt(o) && !meshes.has(o)),
      btns = k ? k.options.filter(o => isButton(s, o)) : [],
      conf = confirmMode() && T.picks.length > 0;
    if (!rows.length && !chips.length && !btns.length && !conf && !(k && k.kind === 'declare')) {
      pk.hidden = true;
      return true;
    }
    pk.hidden = false;
    pk.innerHTML = '<div class="mt"></div>';
    pk.firstChild.textContent = k ? k.prompt : T.base.prompt;
    if (k && k.kind === 'declare') declareUI(pk, k);
    if (rows.length) {
      const L = document.createElement('div');
      L.className = 'tlist';
      rows.forEach(o => L.appendChild(row(s, k, o, false, () => click(o))));
      pk.appendChild(L);
    }
    if (chips.length) {
      const h = document.createElement('div');
      h.className = 'note tpicked';
      h.textContent = T.picks.length ? 'Selected (click to undo):' : 'Selected:';
      pk.appendChild(h);
      const L = document.createElement('div');
      L.className = 'tlist';
      chips.forEach(o => {
        const r = row(game, T.base, o, true, () => click(o));
        if (T.auto.includes(o)) {
          r.classList.add('auto');
          r.title = 'The only legal option: picked automatically';
        }
        L.appendChild(r);
      });
      pk.appendChild(L);
    }
    btns.forEach(o => {
      const b = document.createElement('button');
      b.className = 'abtn';
      b.textContent = nameOf(s, k, o);
      b.onclick = () => click(o);
      pk.appendChild(b);
    });
    if (confirmMode() && (T.picks.length || T.done)) {
      const b = document.createElement('button');
      b.className = 'abtn c-go';
      b.textContent = T.done ? 'Confirm' : 'Confirm (' + needOf(k, s) + ' more to pick)';
      b.disabled = !T.done;
      b.onclick = () => T && T.done && commit();
      pk.appendChild(b);
    }
    return true;
  }
  function prompt() {
    if (queue) return null;
    if (!T) return null;
    const k = T.cur,
      n = needOf(k, vstate());
    return (
      NAME[T.base.player] +
      ': ' +
      (k ? k.prompt : T.base.prompt) +
      (k ? ' Click a red target mark' + (n > 1 ? ' (' + n + ' to pick)' : '') + '.' : '') +
      (T.picks.length ? ' Click a picked target again to undo it.' : '') +
      (T.auto.length && !T.picks.length ? ' The only legal option was picked for you.' : '') +
      (T.done && confirmMode() ? ' Click Confirm.' : '')
    );
  }
  // ---- per frame: the marks follow the board, the arrows the cursor
  function anchorOf(o) {
    // screen point of an option, or null
    if (o.startsWith('P:')) {
      const r = document.querySelector('#hp [data-p="' + o.slice(2) + '"]');
      return r && rectPt(r);
    }
    if (o.startsWith('S:')) {
      const r = stackEl.querySelector('[data-sid="' + o.slice(2) + '"]');
      return r && rectPt(r);
    }
    const zk = o.startsWith('Z:') ? o.slice(2) : o in game.slots ? o : null;
    if (zk) {
      const id = game.slots[zk],
        p = id && artPt(id);
      if (p) return p;
      const z = slotZones[zk];
      return z ? project(z.position.x, z.position.y + 0.07, z.position.z) : null;
    }
    return artPt(o);
  }
  // the centre of a card's art: its 3D character in the side view, else the art window of the card face (a little above the
  // middle of the card; the face texture is turned round on the opponent's cards)
  const ART_V = (108 + (320 - 92) / 2) / 460, // art window centre, from the top of the 320 x 460 face (drawCardFace)
    box = new THREE.Box3(),
    v = new THREE.Vector3();
  function artPt(iid) {
    const m = meshes.get(iid);
    if (!m || !m.visible || !m.userData.card) return null;
    const ch = typeof View3D !== 'undefined' && View3D.isOn() && View3D.characters().get(iid);
    if (ch && ch.root && ch.root.visible !== false) {
      box.setFromObject(ch.root);
      if (!box.isEmpty()) {
        box.getCenter(v);
        return project(v.x, v.y, v.z);
      }
    }
    const mat = Array.isArray(m.material) && m.material[2],
      turned = mat && mat.map && Math.abs(Math.cos(mat.map.rotation)) > 0.5 && Math.cos(mat.map.rotation) < 0;
    v.set(0, 0.05, (ART_V - 0.5) * CD * (turned ? -1 : 1));
    m.localToWorld(v);
    return project(v.x, v.y, v.z);
  }
  // the target cards flash red (a glow under the card, like the yellow "playable" one, faster)
  const tgtGlowMat = new THREE.MeshBasicMaterial({
    map: (() => {
      const c = document.createElement('canvas');
      c.width = 168;
      c.height = 224;
      const g = c.getContext('2d');
      g.shadowColor = '#ff2020';
      g.shadowBlur = 18;
      g.strokeStyle = '#ff6a6a';
      g.lineWidth = 6;
      for (let i = 0; i < 3; i++) g.strokeRect(20, 20, 128, 184);
      return new THREE.CanvasTexture(c);
    })(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 1,
  });
  const glowing = new Map(); // mesh -> glow plane
  function tgtGlow(on) {
    for (const [m, p] of glowing)
      if (!on.has(m)) {
        m.remove(p);
        glowing.delete(m);
      }
    for (const m of on)
      if (!glowing.has(m)) {
        const p = new THREE.Mesh(glowGeo, tgtGlowMat);
        p.rotation.x = -Math.PI / 2;
        p.position.y = 0.06;
        p.raycast = () => {};
        m.add(p);
        glowing.set(m, p);
      }
    tgtGlowMat.opacity = 0.25 + 0.75 * Math.abs(Math.sin(performance.now() / 160));
  }
  function rowMark(o) {
    const pk = document.getElementById('pick');
    if (!pk || pk.hidden) return null;
    const e = [...pk.querySelectorAll('[data-opt]')].find(x => x.dataset.opt === o);
    return e && rectPt(e.querySelector('.tmark') || e);
  }
  const rectPt = el => {
    const r = el.getBoundingClientRect();
    return r.width || r.height ? { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 } : null;
  };
  function srcPt() {
    const id = T.base.iid,
      o = game.stack.filter(q => q.iid === id || q.src === id).pop();
    let el = o && stackEl.querySelector('[data-sid="' + o.sid + '"]');
    if (!el && game.resolving && game.resolving.iid === id) el = stackEl.querySelector('.sc.res');
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width) return { x: r.right - 6, y: (r.top + r.bottom) / 2 };
    }
    const c = game.cards[id];
    return c ? screenOf(c) : null;
  }
  function pathAt(i) {
    while (paths.length <= i) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('marker-end', 'url(#tgtHead)');
      svg.appendChild(p);
      paths.push(p);
    }
    return paths[i];
  }
  function curve(p, a, b, bend) {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      L = Math.hypot(dx, dy) || 1,
      cx = (a.x + b.x) / 2 - (dy / L) * L * bend,
      cy = (a.y + b.y) / 2 + (dx / L) * L * bend;
    p.setAttribute('d', 'M' + a.x + ' ' + a.y + 'Q' + cx + ' ' + cy + ' ' + b.x + ' ' + b.y);
    p.setAttribute('visibility', 'visible');
  }
  function markAt(o, pt, sel) {
    let d = marks.get(o);
    if (!d) {
      d = document.createElement('div');
      d.className = 'tmark board';
      d.innerHTML = MARK_SVG;
      marksEl.appendChild(d);
      marks.set(o, d);
    }
    d.classList.toggle('sel', !!sel);
    d.style.transform = 'translate(' + pt.x + 'px,' + pt.y + 'px)';
    d.hidden = false;
  }
  function frame() {
    let n = 0;
    const seen = new Set(),
      flash = new Set(); // the meshes of the legal target cards (not yet picked)
    if (T && game.phase === 'play') {
      const k = T.base.kind === 'cast' ? T.base : T.cur,
        s = vstate();
      // marks on the board for every legal target and every picked one
      const opts = k ? k.options.filter(o => !isButton(s, o)) : [];
      for (const o of [...T.picks, ...T.auto, ...opts]) {
        if (seen.has(o)) continue;
        const pt = anchorOf(o);
        if (!pt) continue;
        seen.add(o);
        markAt(o, pt, picked(o));
        const id = isCard(game, o) ? o : game.slots[o.startsWith('Z:') ? o.slice(2) : o],
          m = id && meshes.get(id);
        if (m && m.visible && !picked(o)) flash.add(m);
      }
      const S = srcPt();
      if (S) {
        // one arrow on every picked target
        [...T.picks, ...T.auto].forEach(o => {
          const pt = anchorOf(o) || rowMark(o);
          if (pt) curve(pathAt(n++), S, pt, 0.18);
        });
        // the picks still to make: arrows to the cursor (not on a phone: there is no cursor)
        const rest = T.done ? 0 : needOf(k, s);
        if (!ptr.touch && ptr.x >= 0 && rest)
          for (let i = 0; i < rest; i++) curve(pathAt(n++), S, ptr, 0.12 + (i - (rest - 1) / 2) * 0.16);
      }
    }
    tgtGlow(flash);
    for (const [o, d] of marks) if (!seen.has(o)) d.hidden = true;
    for (let i = n; i < paths.length; i++) paths[i].setAttribute('visibility', 'hidden');
    return n > 0 || seen.size > 0; // the marks follow the camera, the target cards flash
  }
  // ---- the choice panel (#pick) can be dragged anywhere on the screen by its background or prompt (buttons and rows still click)
  (function pickDrag() {
    const pk = document.getElementById('pick');
    if (!pk) return;
    let d = null;
    const put = (x, y) => {
      const r = pk.getBoundingClientRect();
      x = Math.max(0, Math.min(innerWidth - r.width, x));
      y = Math.max(0, Math.min(innerHeight - Math.min(r.height, 40), y));
      pk.style.left = x + 'px';
      pk.style.top = y + 'px';
      pk.style.transform = 'none';
      ui.pickPos = { x, y };
    };
    pk.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button,input,select,textarea,a,label,.tlist,[draggable="true"]')) return;
      const r = pk.getBoundingClientRect();
      d = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      pk.setPointerCapture(e.pointerId);
      pk.classList.add('dragging');
      e.preventDefault();
      e.stopPropagation();
    });
    pk.addEventListener('pointermove', e => d && put(e.clientX - d.dx, e.clientY - d.dy));
    const end = () => {
      d = null;
      pk.classList.remove('dragging');
    };
    pk.addEventListener('pointerup', end);
    pk.addEventListener('pointercancel', end);
    addEventListener('resize', () => ui.pickPos && put(ui.pickPos.x, ui.pickPos.y)); // stays on screen
  })();
  return { refresh, on, choice, vstate, picked, click, commit, flush, cancel, optAt, render, prompt, frame };
})();

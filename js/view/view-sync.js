// view-sync.js - View sync (game state to meshes), hover links and arrows, showcase animations, stack panel
// =====================================================================
// VIEW SYNC: game state -> persistent card meshes that tween to targets.
// =====================================================================
const meshes = new Map(); // iid -> mesh
function targets() {
  // iid -> where the card should be drawn
  const T = new Map();
  const put = (c, x, z, y, rot, down, owner) =>
    T.set(c.iid, { c, x, z, y: y + (c === ui.selected || c === ui.placing ? 0.25 : 0), rot, down, owner });
  for (const p of ['Player', 'Opponent']) {
    // hands: only the viewer sees their own
    const hand = game.piles[p].hand,
      n = hand.length,
      opp = p === 'Opponent';
    const xs = HandScroll.spread(
      p,
      n,
      HAND_W - CW - 0.4,
      1.75,
      CW * 0.42,
      !(typeof View3D !== 'undefined' && View3D.isOn())
    ); // Patch9: a big hand scrolls (mouse wheel over it)
    hand.forEach((c, i) =>
      put(
        c,
        xs[i] * (opp ? -1 : 1),
        opp ? -HZ : HZ,
        0.1 + i * 0.02,
        opp ? Math.PI : 0,
        !Sim.canSee(game, ui.view, c), // a hand card is face down unless this seat may know it
        p
      )
    );
  }
  for (const k in game.slots) {
    const id = game.slots[k];
    if (!id) continue;
    const c = game.cards[id],
      z = slotZones[k];
    put(
      c,
      z.position.x,
      z.position.z,
      0.11 + (!rp.on && Sim.canAttack(game, c) ? ATTACK_RAISE : 0),
      Sim.ctl(c) === 'Opponent' ? Math.PI : 0,
      false,
      k.split('|')[0]
    ); // creatures able to attack stand slightly raised
  }
  return T;
}
const lift = { Player: 0, Opponent: 0 };
function applyEm(m) {
  m.material.emissive.setHex(
    m === ui.hovered
      ? m.userData.hoverEm || (m.userData.baseEm ? ZONE_FX.hover : ZONE_FX.plain)
      : m.userData.baseEm || 0
  );
}
const tableAt = (px, py) => {
  // table point under a screen position
  const r = tmpRay;
  r.setFromCamera(tmpV.set(((px - VX()) / VW()) * 2 - 1, -((py - VY()) / VH()) * 2 + 1), cam);
  const t = (0.11 - r.ray.origin.y) / r.ray.direction.y;
  return { x: r.ray.origin.x + r.ray.direction.x * t, z: r.ray.origin.z + r.ray.direction.z * t };
};
// ---- Hover links. Hover an entry, a card or an HP bar: everything related pulses green and a thin arrow joins them ----
const v3 = new THREE.Vector3(),
  arrowSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
arrowSvg.id = 'arrow';
arrowSvg.innerHTML =
  '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#3fe07a"/></marker><marker id="ahr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#ff4d4d"/></marker></defs>';
document.body.appendChild(arrowSvg);
const revealEl = document.createElement('div');
revealEl.id = 'reveal';
revealEl.hidden = true;
document.body.appendChild(revealEl);
const ringMat = new THREE.MeshBasicMaterial({
    map: glowTex,
    color: 0x3fe07a,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0,
  }),
  srcRing = new THREE.Mesh(glowGeo, ringMat);
srcRing.rotation.x = -Math.PI / 2;
srcRing.raycast = () => {};
srcRing.visible = false;
scene.add(srcRing);
const lines = [],
  redLines = []; // linkPin: a touch-selected stack/HP link stays until the next tap elsewhere
function lineAt(i) {
  while (lines.length <= i) {
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('stroke', '#3fe07a');
    l.setAttribute('stroke-width', '1.5');
    l.setAttribute('marker-end', 'url(#ah)');
    arrowSvg.appendChild(l);
    lines.push(l);
  }
  return lines[i];
}
function redLineAt(i) {
  while (redLines.length <= i) {
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('stroke', '#ff4d4d');
    l.setAttribute('stroke-width', '1.5');
    l.setAttribute('stroke-dasharray', '5 3');
    l.setAttribute('marker-end', 'url(#ahr)');
    arrowSvg.appendChild(l);
    redLines.push(l);
  }
  return redLines[i];
}
function project(x, y, z) {
  cam.updateMatrixWorld();
  v3.set(x, y, z).project(cam);
  return { x: VX() + ((v3.x + 1) / 2) * VW(), y: VY() + ((1 - v3.y) / 2) * VH() };
}
function screenOf(c) {
  // where a card is on screen (its mesh, else its pile)
  const m = meshes.get(c.iid),
    p = m
      ? m.position
      : sideZones[c.owner + (c.loc === 'extra' ? 'extra' : c.loc === 'deck' || c.loc === 'hand' ? 'deck' : 'gy')]
          .position;
  return project(p.x, p.y || 0.11, p.z);
}
function setLink(src) {
  const k = src ? src.t + (src.sid ?? src.iid ?? src.p) : '';
  if (k === ui.linkKey) return;
  ui.linkKey = k;
  ui.linkSrc = src;
  applyLink();
  ui.dirty = true;
}
function applyLink() {
  document.querySelectorAll('.hl, .hpr.pulseG').forEach(e => e.classList.remove('hl', 'pulseG'));
  revealEl.hidden = true;
  srcRing.visible = false;
  lines.forEach(l => l.setAttribute('visibility', 'hidden'));
  redLines.forEach(l => l.setAttribute('visibility', 'hidden'));
  ui.links = [];
  ui.reds = [];
  const H = ui.linkSrc;
  if (!H) return;
  const owner = o => Sim.ctl(game.cards[o.src || o.iid]);
  const list =
    H.t === 'entry'
      ? game.stack.filter(o => o.sid === H.sid)
      : H.t === 'card'
        ? game.stack.filter(o => o.kind !== 'spell' && (o.src === H.iid || (maskOf(o) || {}).iid === H.iid)) // abilities / triggers that came from this card
        : game.stack.filter(o => o.kind === 'spell' && owner(o) === H.p); // spells this player cast
  for (const o of list) {
    const el = stackEl.querySelector('[data-sid="' + o.sid + '"]');
    if (!el || el.classList.contains('pend')) continue;
    el.classList.add('hl', 'pulseG');
    const src = game.cards[o.src || o.iid],
      vs = maskOf(o) || src;
    let k;
    if (H.t === 'player' || o.kind === 'spell') {
      const row = document.querySelector('#hp [data-p="' + owner(o) + '"]');
      row.classList.add('pulseG');
      k = { el, box: row };
    } // a spell points at its caster
    else if (vs.loc === 'board' && meshes.has(vs.iid)) k = { el, mesh: meshes.get(vs.iid) };
    else {
      // hand / deck / GY / exile: reveal the card so the origin is visible
      revealEl.innerHTML = '<img><b></b><span></span>';
      revealEl.querySelector('img').src = artURL(src.def);
      revealEl.querySelector('b').textContent = src.def.name;
      revealEl.querySelector('span').textContent = 'from ' + (src.loc === 'gy' ? 'graveyard' : src.loc);
      revealEl.style.setProperty('--tc', cardColor(src.def));
      revealEl.hidden = false;
      k = { el, box: revealEl };
    }
    ui.links.push(k);
    redEnds(o).forEach(t => ui.reds.push({ el, ...t }));
  }
}
function redEnds(o) {
  // what a stack object will hurt or disable (red arrows)
  if (o.kind === 'attack') return [];
  const src = game.cards[o.src || o.iid],
    def = o.kind === 'spell' ? src.def : src.def[o.list][o.ab],
    out = [];
  const walk = fx =>
    (fx || []).forEach(e => {
      if (e.op === 'Repeat') walk(e.effects);
      else if (e.op === 'ExileColumn' || e.op === 'MakeColumnUnusable') {
        if (o.col != null)
          Sim.colKeys(o.col).forEach(k => {
            if (!out.some(t => t.zone === slotZones[k])) out.push({ zone: slotZones[k] });
          });
      } else if (e.op === 'DealDamage') {
        if (e.to === 'target') {
          const m = o.target && meshes.get(o.target);
          if (m) out.push({ mesh: m });
        } else out.push({ box: document.querySelector('#hp [data-p="' + Sim.other(o.controller) + '"]') });
      } else if (e.op === 'DamageStack') {
        const i = game.stack.indexOf(o),
          u = i > 0 && game.stack[i - 1],
          b = u && stackEl.querySelector('[data-sid="' + u.sid + '"]');
        if (b) out.push({ box: b });
      }
    });
  walk(def.effects);
  return out;
}
function updateReds() {
  ui.reds.forEach((k, i) => {
    const a = k.el.getBoundingClientRect(),
      ay = (a.top + a.bottom) / 2;
    let tx, ty;
    if (k.zone) {
      const p = k.zone.position;
      ({ x: tx, y: ty } = project(p.x, p.y + 0.06, p.z));
    } else if (k.mesh) {
      const p = k.mesh.position;
      ({ x: tx, y: ty } = project(p.x, p.y, p.z));
    } else {
      const b = k.box.getBoundingClientRect();
      tx = Math.min(Math.max(a.right, b.left), b.right);
      ty = Math.min(Math.max(ay, b.top), b.bottom);
    }
    const ax = tx > a.right ? a.right : tx < a.left ? a.left : (a.left + a.right) / 2,
      l = redLineAt(i);
    l.setAttribute('x1', ax);
    l.setAttribute('y1', ay);
    l.setAttribute('x2', tx);
    l.setAttribute('y2', ty);
    l.setAttribute('visibility', 'visible');
  });
  for (let i = ui.reds.length; i < redLines.length; i++) redLines[i].setAttribute('visibility', 'hidden');
}
function updateLink() {
  // every frame while linked (camera and cards may move)
  let ringed = false;
  ui.links.forEach((k, i) => {
    const a = k.el.getBoundingClientRect(),
      ay = (a.top + a.bottom) / 2;
    let tx, ty;
    if (k.mesh) {
      const p = k.mesh.position;
      ({ x: tx, y: ty } = project(p.x, p.y, p.z));
      if (!ringed) {
        ringed = true;
        srcRing.position.set(p.x, p.y + 0.06, p.z);
      }
    } else {
      const b = k.box.getBoundingClientRect();
      tx = Math.min(Math.max(a.right, b.left), b.right);
      ty = Math.min(Math.max(ay, b.top), b.bottom);
    }
    const ax = tx > a.right ? a.right : tx < a.left ? a.left : (a.left + a.right) / 2,
      l = lineAt(i);
    l.setAttribute('x1', ax);
    l.setAttribute('y1', ay);
    l.setAttribute('x2', tx);
    l.setAttribute('y2', ty);
    l.setAttribute('visibility', 'visible');
  });
  updateReds();
  srcRing.visible = ringed;
  ringMat.opacity = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin((performance.now() / 1000) * 6), 2);
}
stackEl.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;
  const el = e.target.closest && e.target.closest('.sc');
  setLink(el ? { t: 'entry', sid: +el.dataset.sid } : null);
}); // mouse: hover
stackEl.addEventListener('pointerleave', e => {
  if (e.pointerType === 'mouse') setLink(null);
});
stackEl.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') return;
  const el = e.target.closest && e.target.closest('.sc');
  if (el) {
    ui.linkPin = true;
    setLink({ t: 'entry', sid: +el.dataset.sid });
  }
}); // touch/pen: tap pins the arrow (lifting the finger no longer clears it)
document.addEventListener(
  'pointerdown',
  e => {
    if (!ui.linkPin || (e.target.closest && e.target.closest('#stack .sc, #hp .hpr'))) return;
    ui.linkPin = false;
    if (ui.linkSrc && (ui.linkSrc.t === 'entry' || ui.linkSrc.t === 'player')) setLink(null);
  },
  true
);
document.querySelectorAll('#hp .hpr').forEach(r => {
  r.addEventListener('pointerenter', e => {
    if (e.pointerType === 'mouse') {
      setLink({ t: 'player', p: r.dataset.p });
      ui.hoverP = r.dataset.p;
      ui.inspHold = false;
      refreshInspect();
    }
  });
  r.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') {
      ui.linkPin = true;
      setLink({ t: 'player', p: r.dataset.p });
    }
  });
  r.addEventListener('click', () => {
    if (ui.placing && ui.placing.def.playerTarget)
      send({ type: 'PlayCard', iid: ui.placing.iid, tplayer: r.dataset.p });
    else if (game.choice && !foeChoice() && game.choice.options.includes('P:' + r.dataset.p))
      send({ type: 'Choose', player: game.choice.player, option: 'P:' + r.dataset.p });
    else if (!ui.placing) showPlayer(r.dataset.p, true);
  });
  r.addEventListener('pointerleave', e => {
    if (e.pointerType === 'mouse') {
      setLink(null);
      ui.hoverP = null;
      refreshInspect();
    }
  });
});

// ---- Showcase animations. The simulation has already moved on; the screen keeps the OLD state until they finish ----
const hiddenSids = new Set();
const fxReset = () => hiddenSids.clear();
function fly(def, sub, from, toFn, s0, s1, ms = FX.stack) {
  const g = document.createElement('div');
  g.className = 'ghost';
  g.style.setProperty('--tc', cardColor(def));
  g.innerHTML = '<img><b></b><i></i>';
  g.querySelector('img').src = artURL(def);
  g.querySelector('b').textContent = def.name;
  g.querySelector('i').textContent = sub;
  document.body.appendChild(g);
  const to = toFn(),
    mid = { x: innerWidth / 2, y: innerHeight / 2 },
    at = (p, s) => 'translate(' + (p.x - 70) + 'px,' + (p.y - 98) + 'px) scale(' + s + ')';
  const a = g.animate(
    [
      // 0-33% move + grow, 33-70% hold, 70-100% travel to the destination
      { transform: at(from, s0), opacity: 0.9, offset: 0, easing: 'ease-out' },
      { transform: at(mid, 1.7), opacity: 1, offset: 0.33 },
      { transform: at(mid, 1.7), opacity: 1, offset: 0.7, easing: 'ease-in' },
      { transform: at(to || mid, s1), opacity: to ? 0.85 : 0, offset: 1 },
    ],
    { duration: ms, fill: 'forwards' }
  );
  return Promise.race([a.finished, new Promise(r => setTimeout(r, ms + 900))])
    .catch(() => {})
    .then(() => g.remove());
}
const stackSlot = (own, i) => {
  // where the next entry will appear in the stack panel
  const b = stackEl.getBoundingClientRect(),
    last = [...stackEl.querySelectorAll('.sc')].pop();
  return {
    x: b.left + b.width * (own === 'Player' ? 0.4 : 0.6),
    y: Math.min(b.bottom - 40, (last ? last.getBoundingClientRect().bottom : b.top + 24) + 28 + i * 44),
  };
};
const subOf = (src, o) =>
  o.kind === 'spell'
    ? src.def.timing + ' spell'
    : ((src.def[o.list] || [])[o.ab] || {}).name || (o.kind === 'attack' ? 'Attack' : 'Trigger');
const fxMs = o => (o.kind === 'attack' ? FX.attack : FX.stack); // an Attack is already shown by the sword: a shorter stack animation
async function noticeJob(pre, e) {
  // CardRevealed: the card flies from its pile to the middle, stays about a second and goes back. EffectFailed: a banner says why nothing happened
  const c = pre.cards[e.iid] || sim.cards[e.iid];
  if (!c) return;
  if (e.t === 'EffectFailed') {
    bannerEl.textContent = c.def.name + ' fails: ' + e.why;
    bannerEl.hidden = false;
    await sleep(2200);
    bannerEl.hidden = true;
    return;
  }
  const from = screenOf(c);
  await fly(c.def, 'Revealed by ' + NAME[e.player], from, () => from, 0.45, 0.45, 2600);
}
async function enterJob(pre, o, i) {
  const src = pre.cards[o.src || o.iid] || sim.cards[o.src || o.iid],
    m = o.kind === 'spell' ? meshes.get(src.iid) : null,
    mk = maskOf(o, sim, pre);
  if (mk) {
    await fly(mk.def, 'Ability', screenOf(mk), () => stackSlot(Sim.ctl(src), i), 0.45, 0.32, fxMs(o));
    return;
  } // hidden source: it starts from King Eye
  const from = screenOf(src);
  if (m) {
    m.visible = false;
    ui.dirty = true;
  } // the hand card is carried by the ghost
  await fly(src.def, subOf(src, o), from, () => stackSlot(Sim.ctl(src), i), 0.45, 0.32, fxMs(o));
}
async function leaveJob(pre, o) {
  const src = pre.cards[o.src || o.iid] || sim.cards[o.src || o.iid],
    el = stackEl.querySelector('[data-sid="' + o.sid + '"]'),
    b = (el || stackEl).getBoundingClientRect();
  hiddenSids.add(o.sid);
  if (el) el.style.visibility = 'hidden';
  setLink(null);
  const mk = maskOf(o, sim, pre),
    mid = { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 };
  if (mk) {
    await fly(mk.def, 'Ability', mid, () => screenOf(mk), 0.32, 0.45, fxMs(o));
    return;
  }
  await fly(
    src.def,
    subOf(src, o),
    { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 },
    () =>
      o.kind === 'spell'
        ? sim.cards[o.iid].loc === 'hand'
          ? project(0, 0.11, src.owner === 'Player' ? HZ : -HZ)
          : project(sideZones[src.owner + 'gy'].position.x, 0.11, sideZones[src.owner + 'gy'].position.z)
        : src.loc === 'board' && meshes.has(src.iid)
          ? screenOf(src)
          : null,
    0.32,
    0.45,
    fxMs(o)
  );
}
function fxJobs(pre, post) {
  // stack diff: gone = resolved/countered (leave), new = enter
  const A = new Set(pre.stack.map(o => o.sid)),
    B = new Set(post.stack.map(o => o.sid)),
    jobs = [];
  let n = 0;
  pre.stack.forEach(o => {
    if (!B.has(o.sid)) jobs.push(() => leaveJob(pre, o));
  });
  if (
    post.stack.some(o => {
      const id = o.src || o.iid,
        c = pre.cards[id],
        d = post.cards[id]; // the card's trigger is new and the card was NOT on the board before (hand, extra deck, a token that did not exist): it must land first
      return !A.has(o.sid) && o.kind !== 'spell' && !!d && d.loc === 'board' && !(c && c.loc === 'board');
    })
  )
    jobs.push(async () => {
      const m = structuredClone(post);
      m.stack = m.stack.filter(o => A.has(o.sid));
      game = m;
      sync();
      await sleep(650);
    }); // the card lands on the board BEFORE its enter trigger is shown
  post.stack.forEach(o => {
    if (!A.has(o.sid)) {
      const i = n++,
        j = () => enterJob(pre, o, i);
      j.enter = true;
      jobs.push(j);
    }
  });
  return jobs;
}
async function fxRun(jobs, done) {
  ui.fxBusy = true;
  for (const j of jobs) {
    await new Promise(r => setTimeout(r, 30));
    try {
      await j();
    } catch (e) {
      console.error(e);
    }
  }
  hiddenSids.clear();
  ui.fxBusy = false;
  ui.viewHold = false;
  bannerEl.hidden = true;
  done();
}
const isPairChoice = k =>
    !!k && ['pair', 'trigtarget'].includes(k.kind) && k.options.length > 0 && k.options.every(o => o.includes('#')),
  pairPartners = (k, z) =>
    k.options
      .map(o => o.split('#'))
      .filter(p => p.includes(z))
      .map(p => (p[0] === z ? p[1] : p[0]));
// Engine rule (Patch5): a choice whose CARD options are all cards the player can see and click (on the board, not under a cloud,
// or in their own hand) is answered by clicking them, never with a list. Options that are not cards ('done', 'no'...) stay as buttons.
// Patch10: the Sim decides it (Sim.choicePicks: the same options Choose accepts). It used to be read from the meshes, mid-sync: a card
// drawn or returned by the same effect had no mesh yet, so the other cards of the hand lost their highlight (Ambush of the Night).
const choiceCards = k => k.options.filter(o => game.cards[o]),
  choiceButtons = k => k.options.filter(o => !game.cards[o]);
function boardPick(k) {
  if (!k || !k.labels || k.kind === 'trigorder' || k.kind === 'declare' || isPairChoice(k)) return false;
  return Sim.choicePicks(game, k.player).click;
}
function trigOrderUI(pk, k) {
  const key = k.player + '|' + k.options[0];
  // the option lists the triggers in RESOLUTION order; the panel shows them like the stack panel: the bottom row resolves first
  if (!ui.trigOrder || ui.trigOrder.key !== key)
    ui.trigOrder = { key, order: k.options[0].split(',').map(Number).reverse() };
  const T = ui.trigOrder,
    info = Object.fromEntries(k.items.map(x => [x.k, x])),
    note = document.createElement('div');
  note.className = 'note';
  note.style.margin = '0';
  note.textContent =
    'Like the stack: the bottom one resolves first. Drag a row (or use the arrows) to reorder, then confirm.';
  pk.appendChild(note);
  const move = (i, j) => {
    if (j < 0 || j >= T.order.length || i === j) return;
    T.order.splice(j, 0, T.order.splice(i, 1)[0]);
    sync();
  };
  T.order.forEach((id, i) => {
    const r = document.createElement('div'),
      x = info[id];
    r.className = 'row trg';
    r.draggable = true;
    r.innerHTML =
      '<span class="pos">' +
      (T.order.length - i) +
      '</span><span class="nm"><b></b><small></small></span><span class="mv"></span>';
    r.querySelector('b').textContent = x.name;
    r.querySelector('small').textContent = x.text;
    r.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', String(i)));
    r.addEventListener('dragover', e => e.preventDefault());
    r.addEventListener('drop', e => {
      e.preventDefault();
      move(+e.dataTransfer.getData('text/plain'), i);
    });
    [
      ['\u25b2', i - 1],
      ['\u25bc', i + 1],
    ].forEach(([g, to]) => {
      const b = document.createElement('button');
      b.className = 'xbtn';
      b.textContent = g;
      b.disabled = to < 0 || to >= T.order.length;
      b.onclick = e => {
        e.stopPropagation();
        move(i, to);
      };
      r.querySelector('.mv').appendChild(b);
    });
    pk.appendChild(r);
  });
  const ok = document.createElement('button');
  ok.className = 'abtn c-go';
  ok.textContent = 'Confirm';
  ok.onclick = () => {
    ui.trigOrder = null;
    send({ type: 'Choose', player: k.player, option: T.order.slice().reverse().join(',') });
  };
  pk.appendChild(ok);
}
function declareUI(pk, k) {
  // a search box: type a name, the matching cards appear below, click one (the whole card pool is never listed)
  const inp = document.createElement('input'),
    res = document.createElement('div'),
    defs = k.options.map(o => DEFS.find(d => d.id === o)).filter(Boolean);
  inp.className = 'dctl';
  inp.placeholder = 'Type a card name\u2026';
  inp.spellcheck = false;
  inp.autocomplete = 'off';
  inp.value = ui.declareQ || '';
  res.className = 'pickres';
  pk.append(inp, res);
  const draw = () => {
    ui.declareQ = inp.value;
    res.replaceChildren();
    const q = inp.value.trim(),
      hits = q
        ? rankCards(q, defs)
            .filter(d => cardMatches(q, d))
            .slice(0, 8)
        : [];
    if (!hits.length) {
      const n = document.createElement('div');
      n.className = 'note';
      n.style.margin = '0';
      n.textContent = q ? 'No card matches' : 'Start typing to search';
      res.appendChild(n);
    }
    hits.forEach(d => {
      const b = document.createElement('button');
      b.className = 'abtn';
      b.textContent = d.name;
      b.onclick = () => {
        ui.declareQ = '';
        send({ type: 'Choose', player: k.player, option: d.id });
      };
      res.appendChild(b);
    });
  };
  inp.oninput = draw;
  draw();
  setTimeout(() => inp.focus(), 0);
}
function buildStack() {
  // shared stack panel: your objects on the left, the opponent's on the right
  const atEnd = stackEl.scrollHeight - stackEl.scrollTop - stackEl.clientHeight < 40,
    wasLog = stackEl.classList.contains('log'),
    keep = stackEl.scrollTop; // (read before the panel is rebuilt)
  stackEl.innerHTML =
    '<div class="sh"><span>' +
    (ui.stackLog ? 'Log' : 'Stack \u00b7 ' + (game.stack.length ? 'bottom resolves first' : 'empty')) +
    '</span><span class="shb">' +
    (ui.stackLog
      ? '<button class="xbtn" data-logmode style="font-size:11px" title="Switch between the story and every rule event">' +
        GameLog.modeLabel() +
        '</button><button class="xbtn" data-logcopy style="font-size:11px" title="Copy the whole log">Copy</button>'
      : '') +
    '<button class="xbtn" data-flip title="Flip the panel: stack / game log" aria-label="Flip the panel: stack or game log">\u21c4</button></span></div>';
  stackEl.classList.toggle('log', !!ui.stackLog);
  if (ui.stackLog) {
    stackEl.appendChild(GameLog.view());
    stackEl.scrollTop = atEnd || !wasLog ? stackEl.scrollHeight : keep;
    return;
  }
  for (let i = 0; i < game.stack.length; i++) {
    // oldest at the top of the panel, new objects appended at the bottom
    const o = game.stack[i],
      mk = maskOf(o),
      c = mk || game.cards[o.iid],
      d = c.def,
      own = Sim.ctl(game.cards[o.src || o.iid]),
      el = document.createElement('div');
    el.className =
      'sc ' +
      (own === 'Player' ? 'p' : 'o') +
      (i === game.stack.length - 1 ? ' top' : '') +
      (hiddenSids.has(o.sid) ? ' pend' : '');
    el.dataset.sid = o.sid;
    el.style.setProperty('--tc', cardColor(d));
    el.innerHTML =
      '<b></b><div class="sm"><span>' +
      (o.kind === 'attack'
        ? 'Attack (no HP)' + (Sim.bonusOf(o) ? ' +' + Sim.bonusOf(o) + ' damage' : '')
        : 'HP ' + o.hp) +
      (o.hp != null && o.hp <= -1 ? ' \u2716 countered on resolve' : '') +
      '</span><span></span></div>';
    el.firstChild.textContent = stackName(o);
    el.querySelector('.sm span:last-child').textContent = NAME[own];
    el.onclick = () =>
      ui.placing && ui.placing.def.stackTarget && o.kind === 'spell'
        ? send({ type: 'PlayCard', iid: ui.placing.iid, tsid: o.sid })
        : showCard(c, true, o.kind === 'ability' && !mk ? { from: o.from, list: o.list, i: o.ab, src: o.src } : null);
    stackEl.appendChild(el);
  }
  // Patch7: a spell that left the stack but still waits for its choices (Ambush of the Night) shows here as "resolving", instead of vanishing
  const rs = game.resolving && game.resolving.kind === 'spell' && game.cards[game.resolving.iid];
  if (rs && rs.loc === 'stack' && !game.stack.some(o => o.iid === rs.iid)) {
    const el = document.createElement('div'),
      own = Sim.ctl(rs);
    el.className = 'sc res ' + (own === 'Player' ? 'p' : 'o');
    el.style.setProperty('--tc', cardColor(rs.def));
    el.innerHTML = '<b></b><div class="sm"><span>Resolving\u2026</span><span></span></div>';
    el.firstChild.textContent = rs.def.name;
    el.querySelector('.sm span:last-child').textContent = NAME[own];
    el.onclick = () => showCard(rs, true, null);
    stackEl.appendChild(el);
  }
}
// ---- Patch6: the deck, extra deck, graveyard and exile show their top card: its front when the viewer may know it (a deck card only when it
// was revealed to them, e.g. by L4), otherwise the card back. The pile is a thin stack with the number of cards on a badge; it is not pickable,
// so a click still opens the zone's list.
const PILE_TOP = {
    deck: P => P.deck[0],
    extra: P => P.extra[0],
    gy: P => P.gy[0], // newest first
    exile: P => P.exile[P.exile.length - 1], // newest last
  },
  piles3d = {};
function pileView(key) {
  const z = sideZones[key],
    rot = z.userData.owner === 'Opponent' ? Math.PI : 0,
    mesh = new THREE.Mesh(cardGeo, cardMat(null, true, rot)),
    badge = new THREE.Mesh(badgeGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
  mesh.raycast = () => {};
  badge.raycast = () => {};
  badge.rotation.set(-Math.PI / 2, 0, rot);
  scene.add(mesh, badge);
  return (piles3d[key] = { z, rot, mesh, badge, n: -1, mat: null });
}
function syncPiles() {
  for (const p of ['Player', 'Opponent'])
    for (const k in PILE_TOP) {
      const key = p + k,
        v = piles3d[key] || pileView(key),
        P = game.piles[p],
        n = P[k].length,
        top = PILE_TOP[k](P),
        z = v.z;
      v.mesh.visible = v.badge.visible = !!top;
      z.userData.pileShown = !!top;
      if (!top) continue;
      const mat = cardMat(top.def, !Sim.canSee(game, ui.view, top), v.rot);
      if (v.mat !== mat) v.mesh.material = v.mat = mat;
      if (v.n !== n) {
        v.n = n;
        v.h = 0.02 + 0.01 * Math.min(n, 40); // a thicker stack for a bigger pile
        v.mesh.scale.y = v.h / 0.08;
        v.badge.material.map = badgeTexture(n, '#1d2230', '#5a6378');
        v.badge.material.needsUpdate = true;
        placePile(v);
      }
    }
}
function placePile(v) {
  // on the zone, which rises with its half of the board (the frame loop calls this too)
  const z = v.z,
    sg = v.rot ? -1 : 1;
  v.mesh.position.set(z.position.x, z.position.y + 0.06 + v.h / 2, z.position.z);
  v.badge.position.set(
    z.position.x + sg * (CW / 2 - 0.25),
    z.position.y + 0.07 + v.h,
    z.position.z + sg * (CD / 2 - 0.25)
  );
}
function sync() {
  const seat = game.choice ? game.choice.player : game.priority;
  if (ui.pin && ui.pin !== seat) ui.pin = null; // a manual seat switch holds until priority moves on
  const quiet =
    !game.choice &&
    !game.stack.length &&
    !!game.respond &&
    !['enter', 'end'].includes(game.respond.kind) &&
    (ui.actions === 'off' || (ui.actions === 'normal' && !Sim.hasAction(game, seat))); // a new stop that will be passed by itself: the camera does not swing over for it
  if (ui.autoView && !ui.viewHold && !ui.pin && game.phase === 'play' && ui.view !== seat && !quiet) setView(seat);
  updateDbg();
  buildStack();
  applyLink();
  ui.selected = ui.selected && game.cards[ui.selected.iid];
  ui.placing = ui.placing && game.cards[ui.placing.iid];
  if (ui.selected && ui.selected.loc === 'gone') {
    ui.selected = null;
    inspect.hidden = true;
  }
  const T = targets();
  const atkSet = new Set(game.stack.filter(o => o.kind === 'attack').map(o => o.iid)); // creatures whose Attack is on the stack right now
  ui.pickCards = [];
  ui.pickList = null;
  for (const [id, t] of T) {
    let m = meshes.get(id);
    const mat = cardMat(t.c.def, t.down, t.rot, effHp(t.c), Sim.atkOf(t.c));
    if (!m) {
      m = new THREE.Mesh(cardGeo, mat);
      cardGroup.add(m);
      meshes.set(id, m);
      const o = t.c.loc === 'hand' ? sideZones[t.c.owner + 'deck'].position : { x: t.x, z: t.z }; // drawn cards fly out of the deck
      m.position.set(o.x, t.y, o.z);
      m.userData.by = t.y;
    } else if (m.material !== mat) m.material = mat;
    Object.assign(m.userData, {
      name: t.down ? 'Face-down card' : t.c.def.name,
      card: t.down ? null : t.c,
      tx: t.x,
      tz: t.z,
      ty: t.y,
      owner: t.owner,
      dying: false,
    });
    setGlow(m, !t.down && canUse(t.c));
    setBadges(
      m,
      t.down
        ? null
        : {
            pw: t.c.def.type === 'creature' ? [Sim.atkOf(t.c), t.c.def.atk] : null,
            hp: [effHp(t.c), t.c.def.hp],
            opp: ui.view === 'Opponent', // Patch5: the stats face the VIEWER (power bottom left, HP bottom right on every card), whoever controls it
          }
    );
    setSword(
      m,
      !rp.on &&
        !t.down &&
        t.c.loc === 'board' &&
        ([null, 'Stack is not empty', 'Waiting for the response window'].includes(Sim.canAttack(game, t.c)) ||
          atkSet.has(t.c.iid)), // the sword stays while the Attack is on the stack
      !!t.rot
    );
    m.visible = !seenHidden(t.c);
    if (!t.down && m.visible) ui.pickCards.push(m);
  }
  for (const [id, m] of meshes)
    if (!T.has(id)) {
      // left the table: glide to its pile, then disappear
      const c = game.cards[id];
      if (!c || c.loc === 'stack' || c.loc === 'gone') {
        cardGroup.remove(m);
        meshes.delete(id);
        continue;
      } // !c: the card no longer exists (undo removed a generated token)   // the showcase animation carries it to the stack instead
      const z =
        sideZones[
          c.owner + (c.loc === 'gy' ? 'gy' : c.loc === 'exile' ? 'exile' : c.loc === 'extra' ? 'extra' : 'deck')
        ];
      Object.assign(m.userData, { tx: z.position.x, tz: z.position.z, ty: 0.11, dying: true, card: null });
      setGlow(m, false);
    }
  syncPiles();
  if (typeof View3D !== 'undefined') View3D.sync(T); // Patch8: characters follow the board cards
  for (const p of ['Player', 'Opponent']) {
    sideZones[p + 'deck'].userData.relabel(game.piles[p].deck.length + ' cards');
    sideZones[p + 'gy'].userData.relabel(game.piles[p].gy.length + ' cards');
    sideZones[p + 'exile'].userData.relabel(game.piles[p].exile.length + ' cards');
    sideZones[p + 'extra'].userData.relabel(game.piles[p].extra.length + ' cards');
  }
  const CM = Sim.cloudMap(game);
  for (const k in clouds) {
    const col = +k.split('|')[2],
      on = !!CM[k] && !Sim.isUnusable(game, k);
    clouds[k].visible = on;
    if (on) clouds[k].material = k.split('|')[0] === ui.view ? cloudOwn : cloudHide;
  } // owner sees through; revealed columns are clean
  const held = ui.placing || (ui.drag && ui.drag.card),
    free = held && isPerm(held) ? new Set(Sim.freeSlots(game, held)) : null,
    tz =
      held && !isPerm(held) && (held.def.zoneTarget || held.def.playerTarget)
        ? new Set(Sim.targetZones(game, held))
        : null,
    tcols = held && !isPerm(held) && held.def.colTarget ? Sim.targetColumns(game, held) : null;
  if (!isPairChoice(game.choice)) ui.pairFirst = null;
  const ch = foeChoice() ? null : game.choice,
    chCur = ch && !ch.kind ? game.cards[ch.iid].slot : isPairChoice(ch) ? ui.pairFirst : null,
    chSlots = !ch
      ? []
      : isPairChoice(ch)
        ? ui.pairFirst
          ? pairPartners(ch, ui.pairFirst)
          : [...new Set(ch.options.flatMap(o => o.split('#')))]
        : ch.kind === 'place'
          ? ch.options
          : ['damage', 'pick', 'swap', 'abtarget'].includes(ch.kind)
            ? ch.options
                .map(i => (i.startsWith('Z:') ? i.slice(2) : game.cards[i] && game.cards[i].slot))
                .filter(Boolean)
            : ch.kind
              ? []
              : ch.options; // shift choice: highlight left / right / current zone
  const valid = ch
    ? zones.filter(z => chSlots.includes(z.userData.slotKey) || z.userData.slotKey === chCur)
    : !held
      ? []
      : free
        ? zones.filter(z => free.has(z.userData.slotKey))
        : tz
          ? zones.filter(z => tz.has(z.userData.slotKey))
          : tcols
            ? zones.filter(z => z.userData.slot && tcols.includes(z.userData.slot.col))
            : zones.filter(z => z.userData.slot && !Sim.isUnusable(game, z.userData.slotKey));
  const actZones = new Set(); // zones that hold something the viewer can use now: the graveyard when one of its cards has a usable ability
  if (!rp.on && !game.choice && game.phase === 'play')
    for (const a of Sim.actionsOf(game, ui.view))
      if (a.kind === 'ability' && ['gy', 'deck'].includes(game.cards[a.iid].loc))
        actZones.add(sideZones[ui.view + game.cards[a.iid].loc]); // the graveyard or the deck holds something usable
  zones.forEach(z => {
    const cur = ch && z.userData.slotKey === chCur;
    z.userData.baseEm = valid.includes(z)
      ? cur
        ? ZONE_FX.current
        : ZONE_FX.valid
      : actZones.has(z)
        ? ZONE_FX.action
        : 0;
    z.userData.hoverEm = cur ? ZONE_FX.hoverCurrent : 0;
    applyEm(z);
  });
  for (const k in clouds)
    if (clouds[k].visible && k.split('|')[0] !== ui.view && valid.includes(slotZones[k])) clouds[k].material = cloudHot; // the clouds are legal targets: they light up too
  zones.forEach(z => {
    const dead = !!(z.userData.slotKey && Sim.isUnusable(game, z.userData.slotKey));
    z.visible = !dead;
    z.userData.plane.visible = !dead && !z.userData.pileShown; // Patch6: a pile with a card on it hides its label (the count is on the pile)
  }); // an unusable zone vanishes from the board
  stackEl.classList.toggle(
    'drop',
    !!(ui.drag && !isPerm(ui.drag.card) && !ui.drag.card.def.colTarget && !ui.drag.card.def.zoneTarget)
  );
  statusEl.textContent =
    game.phase === 'deck'
      ? deckStatus()
      : ui.drag
        ? 'Drop ' +
          ui.drag.card.def.name +
          (isPerm(ui.drag.card) || ui.drag.card.def.colTarget || ui.drag.card.def.zoneTarget
            ? ' on a highlighted zone'
            : ' on the board or the stack')
        : foeChoice()
          ? rp.on
            ? NAME[game.choice.player] + ' is choosing\u2026'
            : 'Bot is choosing\u2026'
          : game.choice
            ? NAME[game.choice.player] +
              ': ' +
              game.choice.prompt +
              ((['damage', 'pick', 'swap', 'place'].includes(game.choice.kind) && !game.choice.labels) ||
              boardPick(game.choice)
                ? ' Click a highlighted card, zone or life bar.'
                : isPairChoice(game.choice)
                  ? ' Click two adjacent highlighted cards (click the first again to undo).'
                  : game.choice.kind
                    ? ' Pick an option in the list.'
                    : ' Click a green zone to shift there, or the amber zone (or right click / double tap empty space) to stay.')
            : ui.placing
              ? ui.placing.def.zoneTarget || ui.placing.def.playerTarget
                ? 'Targeting for ' +
                  ui.placing.def.name +
                  ': click ' +
                  (ui.placing.def.zoneTarget ? 'a highlighted zone' : '') +
                  (ui.placing.def.zoneTarget && ui.placing.def.playerTarget ? ' or ' : '') +
                  (ui.placing.def.playerTarget ? 'a life bar' : '') +
                  ' (Esc to cancel)'
                : ui.placing.def.colTarget
                  ? 'Targeting for ' + ui.placing.def.name + ': click a zone in a highlighted column (Esc to cancel)'
                  : 'Placing ' + ui.placing.def.name + ': click a highlighted zone (Esc to cancel)'
              : NAME[game.active] +
                '\u2019s turn' +
                (' \u00b7 ' + (STEP_NAMES[game.step] || 'Main phase')) + // Patch6: start -> draw -> main -> combat -> main or end
                (' (' +
                  Sim.apCount(game, game.active) +
                  ' action point' +
                  (Sim.apCount(game, game.active) === 1 ? '' : 's') +
                  ')') +
                ' \u00b7 ' +
                (ui.note ? ui.note + ' \u00b7 ' : '') +
                (game.stack.length
                  ? 'Stack (top last): ' +
                    game.stack.map(o => stackName(o) + (o.hp == null ? '' : ' [HP ' + o.hp + ']')).join(' \u2192 ') +
                    ' \u00b7 '
                  : game.respond
                    ? 'Response window: ' + (STOP_NAMES[game.respond.kind] || game.respond.kind) + ' \u00b7 '
                    : 'Stack empty \u00b7 ') +
                NAME[game.priority] +
                ' has priority' +
                (ui.view !== game.priority ? ' (viewing ' + NAME[ui.view] + ')' : '');
  for (const p of ['Player', 'Opponent']) {
    // life bars
    const row = document.querySelector('#hp [data-p="' + p + '"]'),
      L = game.life[p];
    row.querySelector('i').style.width = Math.max(0, Math.min(100, (L / game.maxLife) * 100)) + '%';
    row.classList.toggle(
      'tgt',
      !!(ui.placing && ui.placing.def.playerTarget) ||
        !!(game.choice && !foeChoice() && !game.choice.labels && game.choice.options.includes('P:' + p))
    );
    row.querySelector('b').textContent = L;
    // action points: one four-point star per unspent point; a click opens its inspection panel
    const open = Sim.apOpen(game, p),
      key = open.map(a => a.id).join(),
      box = row.querySelector('.aps');
    if (box.dataset.k !== key) {
      box.dataset.k = key;
      box.replaceChildren(
        ...open.map(a => {
          const b = document.createElement('button');
          b.className = 'apstar';
          b.innerHTML =
            '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0L10 6L16 8L10 10L8 16L6 10L0 8L6 6Z"/></svg>';
          b.title = 'Action point (click to inspect)';
          b.setAttribute('aria-label', 'Action point');
          b.onclick = e => {
            e.stopPropagation();
            showAP(p, a.id, true);
          };
          return b;
        })
      );
    }
  }
  const pk = document.getElementById('pick'),
    pkc =
      game.choice &&
      game.choice.labels &&
      !foeChoice() &&
      !isPairChoice(game.choice) &&
      (!boardPick(game.choice) || choiceButtons(game.choice).length) // a click choice keeps its non-card buttons (Done)
        ? game.choice
        : null;
  if (ui.extraAsk && !ui.placing) ui.extraAsk = null;
  pk.hidden = !pkc && !ui.extraAsk;
  if (ui.extraAsk && !pkc) {
    pk.innerHTML = '<div class="mt"></div>';
    pk.firstChild.textContent = ui.extraAsk.c.def.name + ': also spend an action point (additional cost)?';
    [
      ['Pay the additional cost', true],
      ['Do not pay', false],
    ].forEach(([t, v]) => {
      const b = document.createElement('button');
      b.className = 'abtn';
      b.textContent = t;
      b.onclick = () => {
        const a = ui.extraAsk;
        ui.extraAsk = null;
        send(Object.assign({}, a.cmd, { extra: v }));
      };
      pk.appendChild(b);
    });
  }
  if (pkc) {
    pk.innerHTML = '<div class="mt"></div>';
    pk.firstChild.textContent = pkc.prompt;
    if (pkc.kind === 'trigorder') trigOrderUI(pk, pkc);
    else if (pkc.kind === 'declare') declareUI(pk, pkc);
    else
      (boardPick(pkc) ? choiceButtons(pkc) : pkc.options).forEach(o => {
        const b = document.createElement('button');
        b.className = 'abtn';
        b.textContent = pkc.labels[o];
        b.onclick = () => send({ type: 'Choose', player: pkc.player, option: o });
        pk.appendChild(b);
      });
  }
  if (ui.openList) buildList();
  if (ui.selected && ui.selected.loc === 'hand' && ui.selected.owner !== ui.view) ui.selected = null;
  refreshMenu(); // Patch5: the open action menu follows the game
  refreshInspect();
  ui.dirty = true;
  ui.hoverDirty = true;
}
function animate() {
  // returns true while anything is still moving
  let busy = false,
    gl = 0;
  ui.pulse = false;
  if (ui.links.length) {
    busy = true;
    updateLink();
  }
  for (const m of meshes.values()) if (m.userData.glow) gl++;
  if (gl) {
    ui.pulse = true;
    glowMat.opacity = 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin((performance.now() / 1000) * 2.6), 2);
  } // pulse only: rendered at ~30 fps below   // periodic pulse
  if (ui.camAngle !== ui.camGoal) {
    ui.camAngle += (ui.camGoal - ui.camAngle) * CameraCfg.get().seat.turnSpeed;
    if (Math.abs(ui.camGoal - ui.camAngle) < 0.002) ui.camAngle = ui.camGoal;
    if (typeof View3D === 'undefined' || !View3D.placeSeatCamera(ui.camAngle)) {
      const pose = CameraCfg.classicPose(CameraCfg.get(), ui.camAngle); // Patch10: config/camera.json classic
      camera.position.fromArray(pose.position);
      controls.target.fromArray(pose.target);
    } // Patch8: the 3D side view places its camera from config/camera3d.json
    busy = true;
    if (tv.on) placeTop();
  }
  for (const p of ['Player', 'Opponent']) {
    const t = p === game.priority ? BOARD_RISE : 0;
    if (lift[p] !== t) {
      lift[p] += (t - lift[p]) * 0.15;
      if (Math.abs(t - lift[p]) < 0.002) lift[p] = t;
      busy = true;
    }
  }
  for (const p of ['Player', 'Opponent'])
    pads[p].material.color.lerpColors(GROUND_DIM, GROUND_LIT, lift[p] / BOARD_RISE || 0);
  zones.forEach(z => {
    const L = z.userData.owner ? lift[z.userData.owner] : 0;
    z.position.y = L;
    z.userData.plane.position.y = 0.065 + L;
  });
  for (const k in clouds) clouds[k].position.y = 0.2 + lift[k.split('|')[0]];
  for (const k in piles3d) if (piles3d[k].h) placePile(piles3d[k]); // Patch6: the piles ride with their zones
  if (typeof View3D !== 'undefined' && View3D.preFrame()) busy = true; // Patch8: the hands ride with the 3D camera
  for (const [id, m] of meshes) {
    if (ui.drag && ui.drag.card.iid === id) {
      busy = true;
      continue;
    } // follows the pointer
    if (m.userData.cam3d) continue; // Patch8: placed in camera space by View3D.preFrame
    const u = m.userData,
      dx = u.tx - m.position.x,
      dz = u.tz - m.position.z,
      dy = u.ty - u.by;
    if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) > 0.003) {
      m.position.x += dx * 0.25;
      m.position.z += dz * 0.25;
      u.by += dy * 0.25;
      busy = true;
    } else {
      m.position.x = u.tx;
      m.position.z = u.tz;
      u.by = u.ty;
      if (u.dying) {
        cardGroup.remove(m);
        meshes.delete(id);
        continue;
      }
    }
    m.position.y = u.by + (u.owner ? lift[u.owner] : 0);
  }
  if (typeof View3D !== 'undefined' && View3D.postFrame()) busy = true; // Patch8: characters, card turn / scale, camera animation
  return busy;
}

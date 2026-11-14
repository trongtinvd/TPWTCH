// view-sync.js - View sync (game state to meshes), hover links and arrows, showcase animations, stack panel
// =====================================================================
// VIEW SYNC: game state -> persistent card meshes that tween to targets.
// =====================================================================
const meshes = new Map();                           // iid -> mesh
function targets(){                                 // iid -> where the card should be drawn
  const T = new Map();
  const put = (c, x, z, y, rot, down, owner) => T.set(c.iid, {c, x, z, y: y + ((c === selected || c === placing) ? 0.25 : 0), rot, down, owner});
  for (const p of ['Player', 'Opponent']){          // hands: only the viewer sees their own
    const hand = game.piles[p].hand, n = hand.length, opp = p === 'Opponent';
    const sp = n > 1 ? Math.min(1.75, (HAND_W - CW - 0.4) / (n-1)) : 0;
    hand.forEach((c, i) => put(c, (i - (n-1)/2) * sp * (opp ? -1 : 1), opp ? -HZ : HZ, 0.1 + i*0.02, opp ? Math.PI : 0, p !== ui.view && !Sim.isRevealed(c, ui.view), p));
  }
  for (const k in game.slots){
    const id = game.slots[k]; if (!id) continue;
    const c = game.cards[id], z = slotZones[k];
    put(c, z.position.x, z.position.z, 0.11 + (Sim.canAttack(game, c) ? 0.2 : 0), c.owner === 'Opponent' ? Math.PI : 0, false, k.split('|')[0]);   // creatures able to attack stand slightly raised
  }
  return T;
}
const lift = {Player:0, Opponent:0};
function applyEm(m){ m.material.emissive.setHex(m === hovered ? (m.userData.hoverEm || (m.userData.baseEm ? 0x44aa55 : 0x333333)) : (m.userData.baseEm || 0)); }
const tableAt = (px, py) => {                      // table point under a screen position
  const r = tmpRay; r.setFromCamera(tmpV.set((px-VX())/VW()*2-1, -((py-VY())/VH())*2+1), cam);
  const t = (0.11 - r.ray.origin.y) / r.ray.direction.y; return {x: r.ray.origin.x + r.ray.direction.x*t, z: r.ray.origin.z + r.ray.direction.z*t};
};
// ---- Hover links. Hover an entry, a card or an HP bar: everything related pulses green and a thin arrow joins them ----
const v3 = new THREE.Vector3(), arrowSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
arrowSvg.id = 'arrow';
arrowSvg.innerHTML = '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#3fe07a"/></marker><marker id="ahr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#ff4d4d"/></marker></defs>';
document.body.appendChild(arrowSvg);
const revealEl = document.createElement('div'); revealEl.id = 'reveal'; revealEl.hidden = true; document.body.appendChild(revealEl);
const ringMat = new THREE.MeshBasicMaterial({map:glowTex, color:0x3fe07a, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, opacity:0}), srcRing = new THREE.Mesh(glowGeo, ringMat);
srcRing.rotation.x = -Math.PI/2; srcRing.raycast = () => {}; srcRing.visible = false; scene.add(srcRing);
let linkSrc = null, linkKey = '', links = [], reds = [], linkPin = false; const lines = [], redLines = [];   // linkPin: a touch-selected stack/HP link stays until the next tap elsewhere
function lineAt(i){ while (lines.length <= i){ const l = document.createElementNS('http://www.w3.org/2000/svg', 'line'); l.setAttribute('stroke', '#3fe07a'); l.setAttribute('stroke-width', '1.5'); l.setAttribute('marker-end', 'url(#ah)'); arrowSvg.appendChild(l); lines.push(l); } return lines[i]; }
function redLineAt(i){ while (redLines.length <= i){ const l = document.createElementNS('http://www.w3.org/2000/svg', 'line'); l.setAttribute('stroke', '#ff4d4d'); l.setAttribute('stroke-width', '1.5'); l.setAttribute('stroke-dasharray', '5 3'); l.setAttribute('marker-end', 'url(#ahr)'); arrowSvg.appendChild(l); redLines.push(l); } return redLines[i]; }
function project(x, y, z){ cam.updateMatrixWorld(); v3.set(x, y, z).project(cam); return {x:VX() + (v3.x + 1)/2*VW(), y:VY() + (1 - v3.y)/2*VH()}; }
function screenOf(c){                               // where a card is on screen (its mesh, else its pile)
  const m = meshes.get(c.iid), p = m ? m.position : sideZones[c.owner + (c.loc === 'deck' || c.loc === 'hand' ? 'deck' : 'gy')].position;
  return project(p.x, p.y || 0.11, p.z);
}
function setLink(src){
  const k = src ? src.t + (src.sid ?? src.iid ?? src.p) : ''; if (k === linkKey) return;
  linkKey = k; linkSrc = src; applyLink(); dirty = true;
}
function applyLink(){
  document.querySelectorAll('.hl, .hpr.pulseG').forEach(e => e.classList.remove('hl', 'pulseG'));
  revealEl.hidden = true; srcRing.visible = false; lines.forEach(l => l.setAttribute('visibility', 'hidden')); redLines.forEach(l => l.setAttribute('visibility', 'hidden')); links = []; reds = [];
  const H = linkSrc; if (!H) return;
  const owner = o => game.cards[o.src || o.iid].owner;
  const list = H.t === 'entry' ? game.stack.filter(o => o.sid === H.sid)
    : H.t === 'card' ? game.stack.filter(o => o.kind !== 'spell' && (o.src === H.iid || (maskOf(o) || {}).iid === H.iid))      // abilities / triggers that came from this card
    : game.stack.filter(o => o.kind === 'spell' && owner(o) === H.p);                    // spells this player cast
  for (const o of list){
    const el = stackEl.querySelector('[data-sid="' + o.sid + '"]'); if (!el || el.classList.contains('pend')) continue;
    el.classList.add('hl', 'pulseG'); const src = game.cards[o.src || o.iid], vs = maskOf(o) || src; let k;
    if (H.t === 'player' || o.kind === 'spell'){ const row = document.querySelector('#hp [data-p="' + owner(o) + '"]'); row.classList.add('pulseG'); k = {el, box:row}; }   // a spell points at its caster
    else if (vs.loc === 'board' && meshes.has(vs.iid)) k = {el, mesh:meshes.get(vs.iid)};
    else {                                          // hand / deck / GY / exile: reveal the card so the origin is visible
      revealEl.innerHTML = '<img><b></b><span></span>'; revealEl.querySelector('img').src = artURL(src.def);
      revealEl.querySelector('b').textContent = src.def.name; revealEl.querySelector('span').textContent = 'from ' + (src.loc === 'gy' ? 'graveyard' : src.loc);
      revealEl.style.setProperty('--tc', cardColor(src.def)); revealEl.hidden = false; k = {el, box:revealEl};
    }
    links.push(k); redEnds(o).forEach(t => reds.push({el, ...t}));
  }
}
function redEnds(o){                                // what a stack object will hurt or disable (red arrows)
  if (o.kind === 'attack') return [];
  const src = game.cards[o.src || o.iid], def = o.kind === 'spell' ? src.def : src.def[o.list][o.ab], out = [];
  const walk = fx => (fx || []).forEach(e => {
    if (e.op === 'Repeat') walk(e.effects);
    else if (e.op === 'ExileColumn' || e.op === 'MakeColumnUnusable'){ if (o.col != null) Sim.colKeys(o.col).forEach(k => { if (!out.some(t => t.zone === slotZones[k])) out.push({zone:slotZones[k]}); }); }
    else if (e.op === 'DealDamage'){ if (e.to === 'target'){ const m = o.target && meshes.get(o.target); if (m) out.push({mesh:m}); } else out.push({box:document.querySelector('#hp [data-p="' + Sim.other(o.controller) + '"]')}); }
    else if (e.op === 'DamageStack'){ const i = game.stack.indexOf(o), u = i > 0 && game.stack[i - 1], b = u && stackEl.querySelector('[data-sid="' + u.sid + '"]'); if (b) out.push({box:b}); }
  });
  walk(def.effects); return out;
}
function updateReds(){
  reds.forEach((k, i) => {
    const a = k.el.getBoundingClientRect(), ay = (a.top + a.bottom)/2; let tx, ty;
    if (k.zone){ const p = k.zone.position; ({x:tx, y:ty} = project(p.x, p.y + 0.06, p.z)); }
    else if (k.mesh){ const p = k.mesh.position; ({x:tx, y:ty} = project(p.x, p.y, p.z)); }
    else { const b = k.box.getBoundingClientRect(); tx = Math.min(Math.max(a.right, b.left), b.right); ty = Math.min(Math.max(ay, b.top), b.bottom); }
    const ax = tx > a.right ? a.right : tx < a.left ? a.left : (a.left + a.right)/2, l = redLineAt(i);
    l.setAttribute('x1', ax); l.setAttribute('y1', ay); l.setAttribute('x2', tx); l.setAttribute('y2', ty); l.setAttribute('visibility', 'visible');
  });
  for (let i = reds.length; i < redLines.length; i++) redLines[i].setAttribute('visibility', 'hidden');
}
function updateLink(){                              // every frame while linked (camera and cards may move)
  let ringed = false;
  links.forEach((k, i) => {
    const a = k.el.getBoundingClientRect(), ay = (a.top + a.bottom)/2; let tx, ty;
    if (k.mesh){ const p = k.mesh.position; ({x:tx, y:ty} = project(p.x, p.y, p.z)); if (!ringed){ ringed = true; srcRing.position.set(p.x, p.y + 0.06, p.z); } }
    else { const b = k.box.getBoundingClientRect(); tx = Math.min(Math.max(a.right, b.left), b.right); ty = Math.min(Math.max(ay, b.top), b.bottom); }
    const ax = tx > a.right ? a.right : tx < a.left ? a.left : (a.left + a.right)/2, l = lineAt(i);
    l.setAttribute('x1', ax); l.setAttribute('y1', ay); l.setAttribute('x2', tx); l.setAttribute('y2', ty); l.setAttribute('visibility', 'visible');
  });
  updateReds();
  srcRing.visible = ringed; ringMat.opacity = 0.35 + 0.65*Math.pow(0.5 + 0.5*Math.sin(performance.now()/1000*6), 2);
}
stackEl.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; const el = e.target.closest && e.target.closest('.sc'); setLink(el ? {t:'entry', sid:+el.dataset.sid} : null); });   // mouse: hover
stackEl.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') setLink(null); });
stackEl.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; const el = e.target.closest && e.target.closest('.sc'); if (el){ linkPin = true; setLink({t:'entry', sid:+el.dataset.sid}); } });   // touch/pen: tap pins the arrow (lifting the finger no longer clears it)
document.addEventListener('pointerdown', e => { if (!linkPin || (e.target.closest && e.target.closest('#stack .sc, #hp .hpr'))) return; linkPin = false; if (linkSrc && (linkSrc.t === 'entry' || linkSrc.t === 'player')) setLink(null); }, true);
document.querySelectorAll('#hp .hpr').forEach(r => { r.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse'){ setLink({t:'player', p:r.dataset.p}); hoverP = r.dataset.p; inspHold = false; refreshInspect(); } }); r.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse'){ linkPin = true; setLink({t:'player', p:r.dataset.p}); } }); r.addEventListener('click', () => { if (placing && placing.def.playerTarget) send({type:'PlayCard', iid:placing.iid, tplayer:r.dataset.p}); else if (game.choice && game.choice.options.includes('P:' + r.dataset.p)) send({type:'Choose', player:game.choice.player, option:'P:' + r.dataset.p}); else if (!placing) showPlayer(r.dataset.p, true); }); r.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse'){ setLink(null); hoverP = null; refreshInspect(); } }); });

// ---- Showcase animations. The simulation has already moved on; the screen keeps the OLD state until they finish ----
const hiddenSids = new Set(); const fxReset = () => hiddenSids.clear();
function fly(def, sub, from, toFn, s0, s1){
  const g = document.createElement('div'); g.className = 'ghost'; g.style.setProperty('--tc', cardColor(def));
  g.innerHTML = '<img><b></b><i></i>'; g.querySelector('img').src = artURL(def); g.querySelector('b').textContent = def.name; g.querySelector('i').textContent = sub;
  document.body.appendChild(g);
  const to = toFn(), mid = {x:innerWidth/2, y:innerHeight/2}, at = (p, s) => 'translate(' + (p.x - 70) + 'px,' + (p.y - 98) + 'px) scale(' + s + ')';
  const a = g.animate([                             // 0-33% move + grow, 33-70% hold, 70-100% travel to the destination
    {transform:at(from, s0), opacity:.9, offset:0, easing:'ease-out'}, {transform:at(mid, 1.7), opacity:1, offset:.33},
    {transform:at(mid, 1.7), opacity:1, offset:.7, easing:'ease-in'}, {transform:at(to || mid, s1), opacity:to ? .85 : 0, offset:1}], {duration:1700, fill:'forwards'});
  return Promise.race([a.finished, new Promise(r => setTimeout(r, 2600))]).catch(() => {}).then(() => g.remove());
}
const stackSlot = (own, i) => {                     // where the next entry will appear in the stack panel
  const b = stackEl.getBoundingClientRect(), last = [...stackEl.querySelectorAll('.sc')].pop();
  return {x:b.left + b.width * (own === 'Player' ? 0.4 : 0.6), y:Math.min(b.bottom - 40, (last ? last.getBoundingClientRect().bottom : b.top + 24) + 28 + i*44)};
};
const subOf = (src, o) => o.kind === 'spell' ? src.def.timing + ' spell' : ((src.def[o.list] || [])[o.ab] || {}).name || (o.kind === 'attack' ? 'Attack' : 'Trigger');
async function enterJob(pre, o, i){
  const src = pre.cards[o.src || o.iid], m = o.kind === 'spell' ? meshes.get(src.iid) : null, mk = maskOf(o, sim, pre);
  if (mk){ await fly(mk.def, 'Ability', screenOf(mk), () => stackSlot(src.owner, i), 0.45, 0.32); return; }   // hidden source: it starts from King Eye
  const from = screenOf(src); if (m){ m.visible = false; dirty = true; }            // the hand card is carried by the ghost
  await fly(src.def, subOf(src, o), from, () => stackSlot(src.owner, i), 0.45, 0.32);
}
async function leaveJob(pre, o){
  const src = pre.cards[o.src || o.iid], el = stackEl.querySelector('[data-sid="' + o.sid + '"]'), b = (el || stackEl).getBoundingClientRect();
  hiddenSids.add(o.sid); if (el) el.style.visibility = 'hidden'; setLink(null);
  const mk = maskOf(o, sim, pre), mid = {x:(b.left + b.right)/2, y:(b.top + b.bottom)/2};
  if (mk){ await fly(mk.def, 'Ability', mid, () => screenOf(mk), 0.32, 0.45); return; }
  await fly(src.def, subOf(src, o), {x:(b.left + b.right)/2, y:(b.top + b.bottom)/2},
    () => o.kind === 'spell' ? (sim.cards[o.iid].loc === 'hand' ? project(0, 0.11, src.owner === 'Player' ? HZ : -HZ) : project(sideZones[src.owner + 'gy'].position.x, 0.11, sideZones[src.owner + 'gy'].position.z)) : (src.loc === 'board' && meshes.has(src.iid) ? screenOf(src) : null), 0.32, 0.45);
}
function fxJobs(pre, post){                         // stack diff: gone = resolved/countered (leave), new = enter
  const A = new Set(pre.stack.map(o => o.sid)), B = new Set(post.stack.map(o => o.sid)), jobs = []; let n = 0;
  pre.stack.forEach(o => { if (!B.has(o.sid)) jobs.push(() => leaveJob(pre, o)); });
  if (post.stack.some(o => { const c = pre.cards[o.src || o.iid]; return !A.has(o.sid) && o.kind !== 'spell' && c && c.loc === 'hand' && post.cards[c.iid].loc === 'board'; }))
    jobs.push(async () => { const m = structuredClone(post); m.stack = m.stack.filter(o => A.has(o.sid)); game = m; sync(); await sleep(650); });   // the card lands on the board BEFORE its enter trigger is shown
  post.stack.forEach(o => { if (!A.has(o.sid)){ const i = n++, j = () => enterJob(pre, o, i); j.enter = true; jobs.push(j); } });
  return jobs;
}
async function fxRun(jobs, done){
  fxBusy = true;
  for (const j of jobs){ await new Promise(r => setTimeout(r, 30)); try { await j(); } catch (e) { console.error(e); } }
  hiddenSids.clear(); fxBusy = false; viewHold = false; bannerEl.hidden = true; done();
}
function buildStack(){                              // shared stack panel: your objects on the left, the opponent's on the right
  stackEl.innerHTML = '<div class="sh">Stack \u00b7 ' + (game.stack.length ? 'bottom resolves first' : 'empty') + '</div>';
  for (let i = 0; i < game.stack.length; i++){        // oldest at the top of the panel, new objects appended at the bottom
    const o = game.stack[i], mk = maskOf(o), c = mk || game.cards[o.iid], d = c.def, own = game.cards[o.src || o.iid].owner, el = document.createElement('div');
    el.className = 'sc ' + (own === 'Player' ? 'p' : 'o') + (i === game.stack.length - 1 ? ' top' : '') + (hiddenSids.has(o.sid) ? ' pend' : '');
    el.dataset.sid = o.sid; el.style.setProperty('--tc', cardColor(d));
    el.innerHTML = '<b></b><div class="sm"><span>' + (o.kind === 'attack' ? 'Attack (no HP)' + (o.bonus ? ' +' + o.bonus + ' damage' : '') : 'HP ' + o.hp) + (o.hp != null && o.hp <= -1 ? ' \u2716 countered on resolve' : '') + '</span><span></span></div>';
    el.firstChild.textContent = stackName(o); el.querySelector('.sm span:last-child').textContent = NAME[own]; el.onclick = () => (placing && placing.def.stackTarget && o.kind === 'spell') ? send({type:'PlayCard', iid:placing.iid, tsid:o.sid}) : showCard(c); stackEl.appendChild(el);
  }
}
  function sync(){
  const seat = game.choice ? game.choice.player : game.priority;
  if (ui.pin && ui.pin !== seat) ui.pin = null;                      // a manual seat switch holds until priority moves on
  if (ui.autoView && !viewHold && !ui.pin && game.phase === 'play' && ui.view !== seat) setView(seat);
  updateDbg(); buildStack(); applyLink();
  selected = selected && game.cards[selected.iid]; placing = placing && game.cards[placing.iid];
  if (selected && selected.loc === 'gone'){ selected = null; inspect.hidden = true; }
  const T = targets(); pickCards = []; pickList = null;
  for (const [id, t] of T){
    let m = meshes.get(id); const mat = cardMat(t.c.def, t.down, t.rot, effHp(t.c), Sim.atkOf(t.c));
    if (!m){
      m = new THREE.Mesh(cardGeo, mat); cardGroup.add(m); meshes.set(id, m);
      const o = t.c.loc === 'hand' ? sideZones[t.c.owner + 'deck'].position : {x:t.x, z:t.z};   // drawn cards fly out of the deck
      m.position.set(o.x, t.y, o.z); m.userData.by = t.y;
    } else if (m.material !== mat) m.material = mat;
    Object.assign(m.userData, {name: t.down ? 'Face-down card' : t.c.def.name, card: t.down ? null : t.c, tx:t.x, tz:t.z, ty:t.y, owner:t.owner, dying:false});
    setGlow(m, !t.down && canUse(t.c));
    setBadges(m, t.down ? null : {pw: t.c.def.type === 'creature' ? [Sim.atkOf(t.c), t.c.def.atk] : null, hp:[effHp(t.c), t.c.def.hp], opp: !!t.rot});
    m.visible = !seenHidden(t.c); if (!t.down && m.visible) pickCards.push(m);
  }
  for (const [id, m] of meshes) if (!T.has(id)){    // left the table: glide to its pile, then disappear
    const c = game.cards[id];
    if (!c || c.loc === 'stack' || c.loc === 'gone'){ cardGroup.remove(m); meshes.delete(id); continue; }   // !c: the card no longer exists (undo removed a generated token)   // the showcase animation carries it to the stack instead
    const z = sideZones[c.owner + (c.loc === 'gy' ? 'gy' : c.loc === 'exile' ? 'exile' : 'deck')];
    Object.assign(m.userData, {tx:z.position.x, tz:z.position.z, ty:0.11, dying:true, card:null}); setGlow(m, false);
  }
  for (const p of ['Player', 'Opponent']){
    sideZones[p+'deck'].userData.relabel(game.piles[p].deck.length + ' cards');
    sideZones[p+'gy'].userData.relabel(game.piles[p].gy.length + ' cards');
    sideZones[p+'exile'].userData.relabel(game.piles[p].exile.length + ' cards');
  }
  const CM = Sim.cloudMap(game);
  for (const k in clouds){ const col = +k.split('|')[2], on = !!CM[k] && !game.unusable[k]; clouds[k].visible = on; if (on) clouds[k].material = k.split('|')[0] === ui.view ? cloudOwn : cloudHide; }   // owner sees through; revealed columns are clean
  const held = placing || (drag && drag.card), free = held && isPerm(held) ? new Set(Sim.freeSlots(game, held)) : null, tz = held && !isPerm(held) && (held.def.zoneTarget || held.def.playerTarget) ? new Set(Sim.targetZones(game, held)) : null, tcols = held && !isPerm(held) && held.def.colTarget ? Sim.targetColumns(game, held) : null;
  const ch = game.choice, chCur = ch && !ch.kind ? game.cards[ch.iid].slot : null, chSlots = !ch ? [] : ch.kind === 'place' ? ch.options : ['damage', 'pick', 'swap'].includes(ch.kind) ? ch.options.map(i => game.cards[i] && game.cards[i].slot).filter(Boolean) : ch.kind ? [] : ch.options;   // shift choice: highlight left / right / current zone
  const valid = ch ? zones.filter(z => chSlots.includes(z.userData.slotKey) || z.userData.slotKey === chCur) : !held ? [] : free ? zones.filter(z => free.has(z.userData.slotKey)) : tz ? zones.filter(z => tz.has(z.userData.slotKey)) : tcols ? zones.filter(z => z.userData.slot && tcols.includes(z.userData.slot.col)) : zones.filter(z => z.userData.slot && !game.unusable[z.userData.slotKey]);
  zones.forEach(z => { const cur = ch && z.userData.slotKey === chCur; z.userData.baseEm = valid.includes(z) ? (cur ? 0x7a5c14 : 0x1f6b2f) : 0; z.userData.hoverEm = cur ? 0xc99a2a : 0; applyEm(z); });
  zones.forEach(z => { const dead = !!(z.userData.slotKey && game.unusable[z.userData.slotKey]); z.visible = !dead; z.userData.plane.visible = !dead; });   // an unusable zone vanishes from the board
  stackEl.classList.toggle('drop', !!(drag && !isPerm(drag.card) && !drag.card.def.colTarget && !drag.card.def.zoneTarget));
  statusEl.textContent = game.phase === 'deck' ? deckStatus() : drag ? 'Drop ' + drag.card.def.name + (isPerm(drag.card) || drag.card.def.colTarget || drag.card.def.zoneTarget ? ' on a highlighted zone' : ' on the board or the stack') :
    game.choice ? NAME[game.choice.player] + ': ' + game.choice.prompt + (['damage', 'pick', 'swap', 'place'].includes(game.choice.kind) && !game.choice.labels ? ' Click a highlighted card, zone or life bar.' : game.choice.kind ? ' Pick an option in the list.' : ' Click a green zone to shift there, or the amber zone to stay.') :
    placing ? (placing.def.zoneTarget || placing.def.playerTarget ? 'Targeting for ' + placing.def.name + ': click ' + (placing.def.zoneTarget ? 'a highlighted zone' : '') + (placing.def.zoneTarget && placing.def.playerTarget ? ' or ' : '') + (placing.def.playerTarget ? 'a life bar' : '') + ' (Esc to cancel)' : placing.def.colTarget ? 'Targeting for ' + placing.def.name + ': click a zone in a highlighted column (Esc to cancel)' : 'Placing ' + placing.def.name + ': click a highlighted zone (Esc to cancel)') :
    NAME[game.active] + '\u2019s turn' + (game.attackPhase ? ' (attack phase)' : '') + (game.majorUsed ? ' (major action used)' : '') + ' \u00b7 ' + (ui.note ? ui.note + ' \u00b7 ' : '') + (game.stack.length ? 'Stack (top last): ' + game.stack.map(o => stackName(o) + (o.hp == null ? '' : ' [HP ' + o.hp + ']')).join(' \u2192 ') + ' \u00b7 ' : (game.respond ? 'Response window: ' + ({end:'end step', attack:'attack declared'}[game.respond.kind] || 'permanent entered') + ' \u00b7 ' : 'Stack empty \u00b7 ')) +
    NAME[game.priority] + ' has priority' + (ui.view !== game.priority ? ' (viewing ' + NAME[ui.view] + ')' : '');
  for (const p of ['Player', 'Opponent']){          // life bars
    const row = document.querySelector('#hp [data-p="' + p + '"]'), L = game.life[p];
    row.querySelector('i').style.width = Math.max(0, Math.min(100, L / game.maxLife * 100)) + '%'; row.classList.toggle('tgt', !!(placing && placing.def.playerTarget) || !!(game.choice && !game.choice.labels && game.choice.options.includes('P:' + p))); row.querySelector('b').textContent = L;
  }
  const pk = document.getElementById('pick'), pkc = game.choice && game.choice.labels ? game.choice : null;
  if (extraAsk && !placing) extraAsk = null;
  pk.hidden = !pkc && !extraAsk;
  if (extraAsk && !pkc){ pk.innerHTML = '<div class="mt"></div>'; pk.firstChild.textContent = extraAsk.c.def.name + ': also spend your major action (additional cost)?'; [['Pay the additional cost', true], ['Do not pay', false]].forEach(([t, v]) => { const b = document.createElement('button'); b.className = 'abtn'; b.textContent = t; b.onclick = () => { const a = extraAsk; extraAsk = null; send(Object.assign({}, a.cmd, {extra:v})); }; pk.appendChild(b); }); }
  if (pkc){ pk.innerHTML = '<div class="mt"></div>'; pk.firstChild.textContent = pkc.prompt; pkc.options.forEach(o => { const b = document.createElement('button'); b.className = 'abtn'; b.textContent = pkc.labels[o]; b.onclick = () => send({type:'Choose', player:pkc.player, option:o}); pk.appendChild(b); }); }
  if (openList) buildList();
  if (selected && selected.loc === 'hand' && selected.owner !== ui.view) selected = null;
  refreshInspect();
  dirty = true; hoverDirty = true;
}
function animate(){                                 // returns true while anything is still moving
  let busy = false, gl = 0; pulse = false;
  if (links.length){ busy = true; updateLink(); }
  for (const m of meshes.values()) if (m.userData.glow) gl++;
  if (gl){ pulse = true; glowMat.opacity = 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(performance.now() / 1000 * 2.6), 2); }   // pulse only: rendered at ~30 fps below   // periodic pulse
  if (camAngle !== camGoal){
    camAngle += (camGoal - camAngle) * 0.12; if (Math.abs(camGoal - camAngle) < 0.002) camAngle = camGoal;
    const c = Math.cos(camAngle), s = Math.sin(camAngle);
    camera.position.set(3*c + 22*s, 29, -3*s + 22*c);
    controls.target.set(0, 0, 0); busy = true; if (tv.on) placeTop();
  }
  for (const p of ['Player', 'Opponent']){
    const t = p === game.priority ? 0.45 : 0;
    if (lift[p] !== t){ lift[p] += (t - lift[p]) * 0.15; if (Math.abs(t - lift[p]) < 0.002) lift[p] = t; busy = true; }
  }
  for (const p of ['Player', 'Opponent']) pads[p].material.color.lerpColors(GROUND_DIM, GROUND_LIT, lift[p] / 0.45);
  zones.forEach(z => { const L = z.userData.owner ? lift[z.userData.owner] : 0; z.position.y = L; z.userData.plane.position.y = 0.065 + L; });
  for (const k in clouds) clouds[k].position.y = 0.2 + lift[k.split('|')[0]];
  for (const [id, m] of meshes){
    if (drag && drag.card.iid === id){ busy = true; continue; }    // follows the pointer
    const u = m.userData, dx = u.tx - m.position.x, dz = u.tz - m.position.z, dy = u.ty - u.by;
    if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) > 0.003){ m.position.x += dx*0.25; m.position.z += dz*0.25; u.by += dy*0.25; busy = true; }
    else { m.position.x = u.tx; m.position.z = u.tz; u.by = u.ty; if (u.dying){ cardGroup.remove(m); meshes.delete(id); continue; } }
    m.position.y = u.by + (u.owner ? lift[u.owner] : 0);
  }
  return busy;
}
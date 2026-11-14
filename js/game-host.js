// game-host.js - Game host and UI state: send(), automation, camera views, function buttons
// =====================================================================
// GAME HOST + UI STATE. The view never edits `game`; it only calls send().
// `ui.view` is the camera seat (debug-switchable), separate from priority.
// =====================================================================
const other = Sim.other, isPerm = Sim.isPerm;
const NAME = {Player:'Player 1', Opponent:'Player 2'};
const disp = n => n.replace(/^Opp(onent)?\b/, 'Player 2').replace(/^Player(?! [12])\b/, 'Player 1');
const deckStatus = () => 'Deck building \u00b7 ' + ['Player', 'Opponent'].map(p => NAME[p] + (game.ready[p] ? ' ready' : ' arranging')).join(' \u00b7 ') + ' \u00b7 seat: ' + NAME[ui.view] + (ui.note ? ' \u00b7 ' + ui.note : '') + ' \u00b7 click your Deck to reorder it, then Start';
const newSeed = () => Math.floor(Math.random() * 1e9) + 1;   // fresh random seed per launch / restart (the seed is kept in game.n)
let sim = Sim.create(newSeed(), DEFS), game = sim;      // sim: authoritative state. game: what is on screen (lags the sim while animations play)
const undoStack = [], eventLog = [];                  // snapshots for undo; recent rule events
const ui = {view:'Player', autoView:true, autoTurn:true, actions:'normal', showRemoved:false};   // showRemoved: show greyed-out removed statuses in the inspectors
let preview = null, inspHold = false, fxBusy = false;   // preview: hovered card; inspHold: suppress inspect until the pointer moves on
let placing = null, openList = null, selected = null, hovered = null, drag = null, dragCand = null;
let dirty = true, hoverDirty = true, pulse = false, lastPulse = 0;                // render on demand
const seenHidden = c => !!(c && c.loc === 'board' && c.slot && Sim.cloudMap(game)[c.slot] && c.owner !== ui.view);   // under an enemy cloud
// A card under an enemy cloud never shows itself: its abilities appear to come from the King Eye that makes the cloud.
function maskOf(o, ...sts){ if (o.kind === 'spell') return null; for (const st of (sts.length ? sts : [game])){ const c = st.cards[o.src]; if (c && c.loc === 'board' && c.owner !== ui.view){ const k = Sim.cloudMap(st)[c.slot]; if (k) return st.cards[k]; } } return null; }
const stackName = o => { const m = maskOf(o); return m ? m.def.name + ': Ability' : o.name; };
const uiCanPlay = c => placing ? 'Finish placing the current card first' : Sim.canPlay(game, c);
const sleep = ms => new Promise(r => setTimeout(r, ms)), bannerEl = document.createElement('div');
bannerEl.id = 'banner'; bannerEl.hidden = true; document.body.appendChild(bannerEl);
let viewHold = false;                                 // true while a turn change is being announced: the camera waits
function tween(ms, fn){ return Promise.race([new Promise(res => { const t0 = performance.now(); (function step(){ const t = Math.min(1, (performance.now() - t0) / ms); fn(t); dirty = true; t < 1 ? requestAnimationFrame(step) : res(); })(); }), sleep(ms + 600)]); }
let splatTex = null;
function splat3D(m){
  if (!splatTex){ splatTex = []; for (let n = 0; n < 3; n++){ const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#b3121c';
    g.beginPath(); g.arc(64, 64, 26 + Math.random()*8, 0, 7); g.fill(); for (let i = 0; i < 9; i++){ const a = Math.random()*6.28, d = 30 + Math.random()*26; g.beginPath(); g.arc(64 + Math.cos(a)*d, 64 + Math.sin(a)*d, 4 + Math.random()*9, 0, 7); g.fill(); }
    splatTex.push(new THREE.CanvasTexture(c)); } }
  const p = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshBasicMaterial({map:splatTex[Math.floor(Math.random()*3)], transparent:true, depthWrite:false}));
  p.rotation.set(-Math.PI/2, 0, Math.random()*6.28); p.position.set(0, 0.1, 0); p.raycast = () => {}; m.add(p); return () => m.remove(p);
}
function splatBar(pl){ const row = document.querySelector('#hp [data-p="' + pl + '"]'), d = document.createElement('div'); d.className = 'splat'; row.appendChild(d); return () => d.remove(); }
function makeSword(){
  const g = new THREE.Group(), steel = new THREE.MeshStandardMaterial({color:0xdfe6f0, metalness:.6, roughness:.25}), gold = new THREE.MeshStandardMaterial({color:0xd9a93a, metalness:.4, roughness:.4});
  const blade = new THREE.Mesh(new THREE.BoxGeometry(.16, .05, 1.2), steel), tip = new THREE.Mesh(new THREE.ConeGeometry(.08, .35, 4), steel), guard = new THREE.Mesh(new THREE.BoxGeometry(.6, .08, .1), gold), grip = new THREE.Mesh(new THREE.BoxGeometry(.08, .08, .4), gold);
  tip.rotation.x = Math.PI/2; tip.position.z = .77; guard.position.z = -.62; grip.position.z = -.85; g.add(blade, tip, guard, grip); return g;
}
async function attackJob(pre, ev){                    // sword flies down the column; every hit gets a splat; splats go away, THEN the numbers update
  const comb = ev.filter(e => (e.t === 'DamageDealt' && e.type === 'combat') || (e.t === 'PlayerDamaged' && e.combat)); if (!comb.length) return;
  const moved = ev.filter(e => e.t === 'PermanentMoved');   // a shift happened before the strike: move the card first, so the attack runs straight down its NEW column
  for (const e of moved){ const mm = meshes.get(e.iid), z = slotZones[e.slot]; if (mm && z){ mm.userData.tx = z.position.x; mm.userData.tz = z.position.z; } }
  if (moved.length) await sleep(600);
  const a = meshes.get(comb[0].source); if (!a) return;
  const sword = makeSword(), undo = []; let cur = {x:a.position.x, z:a.position.z}; sword.position.set(cur.x, .9, cur.z); scene.add(sword);
  for (const e of comb){
    const m = e.t === 'DamageDealt' ? meshes.get(e.target) : null; if (e.t === 'DamageDealt' && !m) continue;
    const to = m ? {x:m.position.x, z:m.position.z} : {x:cur.x, z:(e.player === 'Opponent' ? -1 : 1) * 7.3}, from = cur;
    sword.rotation.y = to.z >= from.z ? 0 : Math.PI;
    await tween(280, t => sword.position.set(from.x + (to.x - from.x)*t, .9, from.z + (to.z - from.z)*t)); cur = to;
    undo.push(m ? splat3D(m) : splatBar(e.player));
    dirty = true;
  }
  await sleep(700); scene.remove(sword); undo.forEach(f => f()); dirty = true;
}
function send(cmd){
  if (fxBusy){ sync(); return {ok:false, why:'Animation in progress', events:[]}; }       // input waits for the animation
  const pre = structuredClone(sim), r = Sim.dispatch(sim, cmd); if (!r.ok) ui.note = r.why;
  let jobs = [], rv = null;
  if (r.ok){
    const atk = r.events.find(e => e.t === 'CreatureAttackDeclared');
    const hits = r.events.filter(e => e.t === 'PlayerDamaged').reduce((n, e) => n + e.amount, 0);
    const kills = r.events.filter(e => e.t === 'PermanentDestroyed').length;
    ui.note = atk ? sim.cards[atk.iid].def.name + ' attacks column ' + (atk.col + 1) + (kills ? ', ' + kills + ' destroyed' : '') + (sim.stack.some(o => o.kind === 'attack') ? ', on the stack' : ', ' + hits + ' damage to player') : '';
    undoStack.push(pre); if (undoStack.length > 200) undoStack.shift();
    eventLog.push(...r.events); if (eventLog.length > 200) eventLog.splice(0, eventLog.length - 200);
    placing = null; selected = null; inspHold = true;                                   // any action closes the inspection panel
    jobs = fxJobs(pre, sim);
    if (r.events.some(e => (e.t === 'DamageDealt' && e.type === 'combat') || (e.t === 'PlayerDamaged' && e.combat))){   // order: attack animation -> damage numbers -> triggered abilities appear on the stack
      const A = new Set(pre.stack.map(o => o.sid)), ent = jobs.filter(j => j.enter);
      jobs = jobs.filter(j => !j.enter);
      jobs.push(() => attackJob(pre, r.events), async () => { const m = structuredClone(sim); m.stack = m.stack.filter(o => A.has(o.sid)); game = m; sync(); await sleep(700); }, ...ent);
    }
    if (r.events.some(e => e.t === 'TurnChanged')){ const hold = ui.autoView; if (hold) viewHold = true; jobs.unshift(async () => {   // turn ends: the banner plays for BOTH players, first for the one whose turn ended, then for the new turn player
      if (hold){ ui.pin = null; setView(pre.active); await camArrive(); await sleep(200); }
      bannerEl.textContent = NAME[pre.active] + ': Turn Ended'; bannerEl.hidden = false; await sleep(900);
      if (hold){ game = sim; setView(sim.active); sync(); await camArrive(); await sleep(200); }   // viewHold stays on: the new turn player sees their banner
      bannerEl.textContent = NAME[sim.active] + ': Your Turn'; bannerEl.hidden = false; await sleep(900); bannerEl.hidden = true;
      if (hold){ viewHold = false; setView(sim.choice ? sim.choice.player : sim.priority); sync(); await camArrive(); await sleep(200); } }); }   // then the seat holding priority (e.g. the Vine trigger responder) watches the stack animation
    else if (ui.autoView && pre.stack.length > sim.stack.length){ viewHold = true; setView(sim.choice ? sim.choice.player : sim.priority); }   // something resolved: the animation plays from the seat that gets priority next
  }
  if (jobs.length){ game = pre; sync(); fxRun(jobs, () => { game = sim; sync(); autoStep(); }); }   // keep showing the old state until the animation ends
  else { game = sim; sync(); if (r.ok) autoStep(); }
  return r;
}
  let autoTimer = 0, autoDepth = 0;                                  // automation: off = always auto, normal = auto when no legal action, always = never
function autoStep(){
  if (placing || autoDepth > 12 || game.phase !== 'play' || game.choice) return;
  const p = game.priority, mode = ui.actions; let cmd = null;
  if (game.stack.length){ if (mode === 'off' || (mode === 'normal' && !Sim.hasAction(game, p))) cmd = {type:'Pass', player:p}; }
  else if (game.respond){ if (mode === 'off' || (mode === 'normal' && !Sim.hasAction(game, p))) cmd = {type:'Pass', player:p}; }
  else if (ui.autoTurn && mode !== 'always' && p === game.active && (mode === 'off' ? Sim.majorUsed(game) : !Sim.hasAction(game, p))) cmd = {type:'EndTurn', player:p};
  if (!cmd) return;
  if (ui.autoView && camAngle !== camGoal){ clearTimeout(autoTimer); autoTimer = setTimeout(autoStep, 250); return; }   // let the camera reach the seat holding priority before an automatic pass / end turn skips past it
  autoDepth++; try { send(cmd); } finally { autoDepth--; }
}
const draw = () => { if (!placing) send({type:'Draw', player:ui.view}); };
const pass = () => { if (!placing) send({type:'Pass', player:ui.view}); };
const toggleAttack = () => { if (!placing) send({type:'SetAttackPhase', player:ui.view, on:!game.attackPhase}); };
function play(c){ if (uiCanPlay(c)) return; if (isPerm(c) || c.def.colTarget || c.def.zoneTarget || c.def.playerTarget){ placing = c; sync(); } else send({type:'PlayCard', iid:c.iid}); }
let extraAsk = null;                                  // pending 'pay the additional cost?' popup: {c, cmd}
const place = (c, zone) => { const cmd = {type:'PlayCard', iid:c.iid, slot:zone.userData.slotKey, zone:zone.userData.slotKey, col:zone.userData.slot.col}; if (c.def.extraCost && Sim.canPayExtra(game, c)){ extraAsk = {c, cmd}; placing = c; sync(); } else send(cmd); };
function undo(){ if (!undoStack.length || fxBusy) return; sim = undoStack.pop(); game = sim; placing = null; fxReset(); closeMenu(); sync(); }
let camAngle = 0, camGoal = 0;
const camArrive = () => new Promise(r => { const t0 = performance.now(); (function w(){ if (camAngle === camGoal || performance.now() - t0 > 1800) r(); else setTimeout(w, 30); })(); });   // resolves once the seat camera has finished turning
// ---- top-down orthographic view (toggle, bottom left) ----
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200), tv = {on:false, cx:0, cz:0, zoom:1};
let cam = camera, panFrom = null;
const HELP_SIDE = 'Drag: orbit \u00b7 Wheel: zoom \u00b7 Right-drag: pan', HELP_TOP = 'Drag: pan \u00b7 Wheel: zoom';
function fitOrtho(){ const a = VW()/VH(), H = Math.max(13.8, 11.4/a) / tv.zoom; ortho.left = -H*a; ortho.right = H*a; ortho.top = H; ortho.bottom = -H; ortho.updateProjectionMatrix(); }
function placeTop(){                                // screen-up points away from the seat being viewed
  const s = Math.sin(camAngle), c = Math.cos(camAngle);
  ortho.up.set(-s, 0, -c); ortho.position.set(tv.cx, 60, tv.cz); ortho.lookAt(tv.cx, 0, tv.cz); ortho.updateMatrixWorld();
}
function setTopView(on){
  tv.on = on; cam = on ? ortho : camera; controls.enabled = !on;
  if (on){ tv.zoom = 1; tv.cx = tv.cz = 0; fitOrtho(); placeTop(); }
  viewBtn.textContent = on ? 'Side view' : 'Top view'; helpEl.textContent = on ? HELP_TOP : HELP_SIDE;
  closeMenu(); dirty = true; hoverDirty = true;
}
viewBtn.onclick = () => setTopView(!tv.on);
helpEl.textContent = HELP_SIDE; fitOrtho();
renderer.domElement.addEventListener('wheel', e => { if (!tv.on) return; e.preventDefault(); tv.zoom = Math.min(4, Math.max(0.6, tv.zoom * Math.exp(-e.deltaY * 0.001))); fitOrtho(); dirty = true; hoverDirty = true; }, {passive:false});
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
function setView(p){ ui.view = p; camGoal = p === 'Opponent' ? Math.PI : 0; placing = null; closeMenu(); if (game.phase === 'deck'){ deckPanel.hidden = true; openList = null; inspect.hidden = true; selected = null; openDeckEditor(); } }
function openDeckEditor(){ if (game.phase === 'deck' && !game.ready[ui.view]) showList(ui.view, 'deck'); }   // deck building: your deck list opens by default
function switchPlayer(){ ui.pin = game.choice ? game.choice.player : game.priority; setView(other(ui.view)); sync(); }          // debug: seat only
function resetGame(){
  sim = Sim.create(newSeed(), DEFS); game = sim; fxReset(); undoStack.length = 0; eventLog.length = 0;
  for (const m of meshes.values()) cardGroup.remove(m); meshes.clear();
  selected = null; openList = null; inspect.hidden = true; deckPanel.hidden = true;
  setView('Player'); sync();
}

// ---- Game function buttons (HTML, top right) and debug buttons (HTML, bottom right) ----
const myPriority = () => ui.view === game.priority && !placing && !game.choice;   // nobody holds a usable priority while a player is making a choice
const inPlay = () => game.phase === 'play';
const FN = [
  {id:'start', cls:'c-go', label:() => game.ready[ui.view] ? NAME[ui.view] + ' ready \u2713' : 'Start (' + NAME[ui.view] + ')', run:() => { const r = send({type:'Start', player:ui.view}); if (r.ok && game.phase === 'deck' && !game.ready[other(ui.view)]){ setView(other(ui.view)); sync(); } },   // after Start, hand the seat to the player who is still arranging
  on:() => !placing && !game.ready[ui.view], show:() => game.phase === 'deck'},
  {id:'draw', cls:'c-go', label:() => 'Draw 2', run:draw, on:() => myPriority() && !game.stack.length && !game.respond && ui.view === game.active && !game.attackPhase && !Sim.majorUsed(game) && game.piles[ui.view].deck.length > 0, show:inPlay},
  {id:'pass', cls:'c-pass', label:() => game.respond && !game.stack.length ? 'Pass (' + ({end:'end step', attack:'attack declared'}[game.respond.kind] || 'entered') + ')' : 'Pass', run:pass, on:() => myPriority() && (game.stack.length > 0 || !!game.respond), show:inPlay},
  {id:'battle', cls:'c-atk', label:() => 'Attack: ' + (game.attackPhase ? 'on' : 'off'), run:toggleAttack, on:() => myPriority() && !game.stack.length && !game.respond && ui.view === game.active && (game.attackPhase || !Sim.majorUsed(game)), show:inPlay},
  {id:'notarget', cls:'c-go', label:() => 'Cast without target', run:() => send({type:'PlayCard', iid:placing.iid}), on:() => !!(placing && placing.def.optionalTarget), show:() => !!(placing && placing.def.optionalTarget)},
  {id:'endturn', label:() => 'End turn', run:() => send({type:'EndTurn', player:game.priority}), on:() => !placing && !game.choice && !game.stack.length && !game.respond && game.priority === game.active, show:inPlay}
];
const DBTN = [
  {id:'autoturn', label:() => 'Auto turn: ' + (ui.autoTurn ? 'on' : 'off'), run:() => { ui.autoTurn = !ui.autoTurn; sync(); autoStep(); }, on:() => true},
  {id:'actions', label:() => 'Actions: ' + ui.actions, run:() => { ui.actions = {off:'normal', normal:'always', always:'off'}[ui.actions]; sync(); autoStep(); }, on:() => true},
  {id:'reset', label:() => 'Reset game', run:resetGame, on:() => true},
  {id:'player', label:() => 'Switch player', run:switchPlayer, on:() => true},
  {id:'auto', label:() => 'Auto view: ' + (ui.autoView ? 'on' : 'off'), run:() => { ui.autoView = !ui.autoView; sync(); }, on:() => true},
  {id:'undo', label:() => 'Undo (' + undoStack.length + ')', run:undo, on:() => undoStack.length > 0}
];
const fnEl = document.createElement('div'); fnEl.id = 'fn'; document.body.appendChild(fnEl);
const dbg = document.createElement('div'); dbg.id = 'dbg'; document.body.appendChild(dbg);
[[FN, fnEl], [DBTN, dbg]].forEach(([list, host]) => list.forEach(b => {
  b.el = document.createElement('button'); b.el.className = 'abtn' + (b.cls ? ' ' + b.cls : '');
  b.el.onclick = () => { if (b.on()) b.run(); }; host.appendChild(b.el);
}));
function updateDbg(){
  [...FN, ...DBTN].forEach(b => { b.el.textContent = b.label(); b.el.disabled = !b.on(); if (b.show) b.el.hidden = !b.show(); if (b.id === 'battle') b.el.classList.toggle('on', game.attackPhase); });
}
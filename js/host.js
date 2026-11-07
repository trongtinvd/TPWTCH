// host.js - GAME HOST + UI STATE: DOM refs, send(), automation, camera/top view, function and debug buttons.
// Classic script: shares one global scope with the other js/*.js files; load order matters (see index.html).

const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(2,2), tmpRay = new THREE.Raycaster(), tmpV = new THREE.Vector2();
const hud = document.getElementById('hud'), statusEl = document.getElementById('status');
const deckPanel = document.getElementById('deckPanel'), inspect = document.getElementById('inspect'), menu = document.getElementById('menu'), stackEl = document.getElementById('stack'), viewBtn = document.getElementById('viewBtn'), helpEl = document.getElementById('help');

// =====================================================================
// GAME HOST + UI STATE. The view never edits `game`; it only calls send().
// `ui.view` is the camera seat (debug-switchable), separate from priority.
// =====================================================================
const other = Sim.other, isPerm = Sim.isPerm;
const NAME = {Player:'Player 1', Opponent:'Player 2'};
const disp = n => n.replace(/^Opp(onent)?\b/, 'Player 2').replace(/^Player(?! [12])\b/, 'Player 1');
const deckStatus = () => 'Deck building \u00b7 ' + ['Player', 'Opponent'].map(p => NAME[p] + (game.ready[p] ? ' ready' : ' arranging')).join(' \u00b7 ') + ' \u00b7 seat: ' + NAME[ui.view] + (ui.note ? ' \u00b7 ' + ui.note : '') + ' \u00b7 click your Deck to reorder it, then Start';
let sim = Sim.create(1, DEFS), game = sim;      // sim: authoritative state. game: what is on screen (lags the sim while animations play)
const history = [], eventLog = [];                  // snapshots for undo; recent rule events
const ui = {view:'Player', autoView:true, autoTurn:true, actions:'normal'};
let preview = null, inspHold = false, fxBusy = false;   // preview: hovered card; inspHold: suppress inspect until the pointer moves on
let placing = null, openList = null, selected = null, hovered = null, drag = null, dragCand = null;
let dirty = true, hoverDirty = true, pulse = false, lastPulse = 0;                // render on demand
const uiCanPlay = c => placing ? 'Finish placing the current card first' : Sim.canPlay(game, c);
function send(cmd){
  if (fxBusy){ sync(); return {ok:false, why:'Animation in progress', events:[]}; }       // input waits for the animation
  const pre = structuredClone(sim), r = Sim.dispatch(sim, cmd); if (!r.ok) ui.note = r.why;
  let jobs = [];
  if (r.ok){
    const atk = r.events.find(e => e.t === 'CreatureAttackDeclared');
    const hits = r.events.filter(e => e.t === 'PlayerDamaged').reduce((n, e) => n + e.amount, 0);
    const kills = r.events.filter(e => e.t === 'PermanentDestroyed').length;
    ui.note = atk ? sim.cards[atk.iid].def.name + ' attacks column ' + (atk.col + 1) + (kills ? ', ' + kills + ' destroyed' : '') + (sim.pending ? ', waiting on triggers' : ', ' + hits + ' damage to player') : '';
    history.push(pre); if (history.length > 200) history.shift();
    eventLog.push(...r.events); if (eventLog.length > 200) eventLog.splice(0, eventLog.length - 200);
    placing = null; selected = null; inspHold = true;                                   // any action closes the inspection panel
    jobs = fxJobs(pre, sim);
  }
  if (jobs.length){ game = pre; sync(); fxRun(jobs, () => { game = sim; sync(); autoStep(); }); }   // keep showing the old state until the animation ends
  else { game = sim; sync(); if (r.ok) autoStep(); }
  return r;
}
  let autoDepth = 0;                                  // automation: off = always auto, normal = auto when no legal action, always = never
function autoStep(){
  if (placing || autoDepth > 12 || game.phase !== 'play' || game.choice) return;
  const p = game.priority, mode = ui.actions; let cmd = null;
  if (game.stack.length){ if (mode === 'off' || (mode === 'normal' && !Sim.hasAction(game, p))) cmd = {type:'Pass', player:p}; }
  else if (ui.autoTurn && mode !== 'always' && p === game.active && (mode === 'off' ? Sim.majorUsed(game) : !Sim.hasAction(game, p))) cmd = {type:'EndTurn', player:p};
  if (!cmd) return;
  autoDepth++; try { send(cmd); } finally { autoDepth--; }
}
const draw = () => { if (!placing) send({type:'Draw', player:ui.view}); };
const pass = () => { if (!placing) send({type:'Pass', player:ui.view}); };
const toggleAttack = () => { if (!placing) send({type:'SetAttackPhase', player:ui.view, on:!game.attackPhase}); };
function play(c){ if (uiCanPlay(c)) return; if (isPerm(c)){ placing = c; sync(); } else send({type:'PlayCard', iid:c.iid}); }
const place = (c, zone) => send({type:'PlayCard', iid:c.iid, slot:zone.userData.slotKey});
function undo(){ if (!history.length || fxBusy) return; sim = history.pop(); game = sim; placing = null; fxReset(); closeMenu(); sync(); }
let camAngle = 0, camGoal = 0;
// ---- top-down orthographic view (toggle, bottom left) ----
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200), tv = {on:false, cx:0, cz:0, zoom:1};
let cam = camera, panFrom = null;
const HELP_SIDE = 'Drag: orbit \u00b7 Wheel: zoom \u00b7 Right-drag: pan', HELP_TOP = 'Drag: pan \u00b7 Wheel: zoom';
function fitOrtho(){ const a = innerWidth/innerHeight, H = Math.max(13.8, 11.4/a) / tv.zoom; ortho.left = -H*a; ortho.right = H*a; ortho.top = H; ortho.bottom = -H; ortho.updateProjectionMatrix(); }
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
function setView(p){ ui.view = p; camGoal = p === 'Opponent' ? Math.PI : 0; placing = null; closeMenu(); if (game.phase === 'deck'){ deckPanel.hidden = true; openList = null; inspect.hidden = true; selected = null; } }
function switchPlayer(){ setView(other(ui.view)); sync(); }          // debug: seat only
function resetGame(){
  sim = Sim.create(game.n + 1, DEFS); game = sim; fxReset(); history.length = 0; eventLog.length = 0;
  for (const m of meshes.values()) cardGroup.remove(m); meshes.clear();
  selected = null; openList = null; inspect.hidden = true; deckPanel.hidden = true;
  setView('Player'); sync();
}

// ---- Game function buttons (HTML, top right) and debug buttons (HTML, bottom right) ----
const myPriority = () => ui.view === game.priority && !placing;
const inPlay = () => game.phase === 'play';
const FN = [
  {id:'start', cls:'c-go', label:() => game.ready[ui.view] ? NAME[ui.view] + ' ready \u2713' : 'Start (' + NAME[ui.view] + ')', run:() => send({type:'Start', player:ui.view}), on:() => !placing && !game.ready[ui.view], show:() => game.phase === 'deck'},
  {id:'draw', cls:'c-go', label:() => 'Draw 2', run:draw, on:() => myPriority() && !game.stack.length && !game.attackPhase && game.piles[ui.view].deck.length > 0, show:inPlay},
  {id:'pass', cls:'c-pass', label:() => 'Pass', run:pass, on:() => myPriority() && game.stack.length > 0, show:inPlay},
  {id:'battle', cls:'c-atk', label:() => 'Attack: ' + (game.attackPhase ? 'on' : 'off'), run:toggleAttack, on:() => myPriority() && !game.stack.length && ui.view === game.active, show:inPlay},
  {id:'endturn', label:() => 'End turn', run:() => send({type:'EndTurn', player:game.priority}), on:() => !placing && !game.stack.length && game.priority === game.active, show:inPlay}
];
const DBTN = [
  {id:'autoturn', label:() => 'Auto turn: ' + (ui.autoTurn ? 'on' : 'off'), run:() => { ui.autoTurn = !ui.autoTurn; sync(); autoStep(); }, on:() => true},
  {id:'actions', label:() => 'Actions: ' + ui.actions, run:() => { ui.actions = {off:'normal', normal:'always', always:'off'}[ui.actions]; sync(); autoStep(); }, on:() => true},
  {id:'reset', label:() => 'Reset game', run:resetGame, on:() => true},
  {id:'player', label:() => 'Switch player', run:switchPlayer, on:() => true},
  {id:'auto', label:() => 'Auto view: ' + (ui.autoView ? 'on' : 'off'), run:() => { ui.autoView = !ui.autoView; sync(); }, on:() => true},
  {id:'undo', label:() => 'Undo (' + history.length + ')', run:undo, on:() => history.length > 0}
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

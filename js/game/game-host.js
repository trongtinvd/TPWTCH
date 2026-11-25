// game-host.js - Game host and UI state: send(), automation, camera views, function buttons
// =====================================================================
// GAME HOST + UI STATE. The view never edits `game`; it only calls send().
// `ui.view` is the camera seat (debug-switchable), separate from priority.
// =====================================================================
const other = Sim.other,
  isPerm = Sim.isPerm;
const NAME = { Player: 'Player 1', Opponent: 'Player 2' };
// the "stops": response windows the Sim opens when state.stops asks for them (the Pass button and the log name them)
const STOP_NAMES = {
  enter: 'permanent entered',
  end: 'end step (turn ended)',
  turnStart: 'turn started',
  combatStart: 'combat started',
  combatEnd: 'combat ended',
  draw: 'cards drawn',
  mainStart: 'main phase started',
  mainEnd: 'main phase ended',
  stack: 'stack emptied',
};
const STEP_NAMES = { start: 'Start', draw: 'Draw phase', main: 'Main phase', combat: 'Combat phase', end: 'End phase' };
const STOPS_ON = {
  turnStart: true,
  draw: true,
  mainStart: true,
  mainEnd: true,
  combatStart: true,
  combatEnd: true,
  stack: true,
}; // real games run with every stop on
const disp = n => n.replace(/^Opp(onent)?\b/, 'Player 2').replace(/^Player(?! [12])\b/, 'Player 1');
const deckStatus = () =>
  'Deck building \u00b7 ' +
  ['Player', 'Opponent'].map(p => NAME[p] + (game.ready[p] ? ' ready' : ' arranging')).join(' \u00b7 ') +
  ' \u00b7 seat: ' +
  NAME[ui.view] +
  (ui.note ? ' \u00b7 ' + ui.note : '') +
  ' \u00b7 click your Deck to reorder it, then Start';
const newSeed = () => Math.floor(Math.random() * 1e9) + 1; // fresh random seed per launch / restart (the seed is kept in game.n)
let sim = Sim.create(newSeed(), DEFS),
  game = sim; // sim: authoritative state. game: what is on screen (lags the sim while animations play)
const undoStack = [],
  eventLog = []; // snapshots for undo; recent rule events
const cmdLog = []; // every ACCEPTED command of the running duel: with the seed and the decks it IS the replay (the Sim is deterministic)
const rp = { on: false, feed: false, rec: null, i: 0, playing: false, speed: 1, timer: 0, view: 'auto', min: false }; // replay playback (replay.js). view: auto | p1 | p2 (seat shown); min: the control bar is minimised
// ---- THE UI STATE. Every mutable piece of interaction state lives here (the view never edits `game`; it only calls send()).
// Rule: only sync() turns state into pixels: handlers change ui.* and call sync() / send(); sync() rebuilds the meshes and the panels and
// sets ui.dirty, and the render loop in main.js draws only while ui.dirty (or an animation) asks for it.
const ui = {
  // settings
  view: 'Player', // the seat the camera looks from (debug-switchable, separate from priority)
  autoView: true,
  autoTurn: true,
  actions: 'normal', // automation: off = always auto, normal = auto when no legal action, always = never
  showRemoved: false, // show greyed-out removed statuses in the inspectors
  inspLog: false, // the inspector shows the log instead of the statuses
  mode: 'self',
  deckEdit: false,
  pin: null,
  note: '',
  // selection and input
  placing: null, // card being placed / targeted
  selected: null,
  selHl: null, // the stack ability selected in the inspector: {from, list, i, src} (its text is highlighted)
  hovered: null,
  preview: null, // hovered card (inspector)
  inspHold: false, // suppress inspect until the pointer moves on
  openList: null, // {owner, kind}: the open deck / graveyard / exile list
  drag: null,
  dragCand: null,
  extraAsk: null, // pending 'pay the additional cost?' popup: {c, cmd}
  downAt: null,
  lastEmptyTap: 0,
  lastCardTap: null, // {iid, t}: a second tap on the same card within 400 ms toggles its mute counter
  muted: new Set(), // iids with a mute counter (a UI marker: the automation passes as if their Quick spells / abilities were Slow)
  pinchD: 0, // two-finger pinch zooms the top view
  hoverP: null, // player inspection: hovered / pinned (click a life bar)
  stackLog: false, // the stack panel is flipped over: the game log is shown (js/gamelog.js)
  selP: null,
  selAP: null, // the action point shown in the inspector: {p, id}
  inspLast: null, // what the inspector shows right now (the status toggle re-renders it)
  pickCards: [],
  pickList: null, // cached; rebuilt only after sync()
  pairFirst: null, // the first zone clicked in a 'two adjacent cards' choice
  declareQ: '', // the search text of a 'declare a card name' choice
  trigOrder: null, // the order being arranged in a 'trigorder' choice: {key, order}
  // hover links (stack entry <-> card arrows)
  linkSrc: null,
  linkKey: '',
  links: [],
  reds: [],
  linkPin: false, // a touch-selected stack/HP link stays until the next tap elsewhere
  // animation, camera, automation and bot timers
  fxBusy: false, // showcase animations running: input waits
  viewHold: false, // true while a turn change is being announced: the camera waits
  camAngle: 0,
  camGoal: 0,
  autoTimer: 0,
  stepTimer: 0, // the pause after a spell / ability resolved, before automation goes on
  autoDepth: 0,
  lastCfg: null, // {mode:'self'|'bot', p1, p2, shuffle, botSeat} of the running game
  botSeat: 'Opponent', // the seat the bot plays (Vs Bot: Opponent; after "take over as Player 2": Player)
  rpInit: null, // what a replay needs besides the commands: seed, both decks, mode, deck names
  botTimer: 0,
  // render on demand
  dirty: true,
  hoverDirty: true,
  pulse: false,
  lastPulse: 0,
};
const seenHidden = c => !!(c && c.loc === 'board' && c.slot && Sim.cloudMap(game)[c.slot] && Sim.ctl(c) !== ui.view); // under an enemy cloud
// A card under an enemy cloud never shows itself: its abilities appear to come from the King Eye that makes the cloud.
function maskOf(o, ...sts) {
  if (o.kind === 'spell') return null;
  for (const st of sts.length ? sts : [game]) {
    const c = st.cards[o.src];
    if (c && c.loc === 'board' && Sim.ctl(c) !== ui.view) {
      const k = Sim.cloudMap(st)[c.slot];
      if (k) return st.cards[k];
    }
  }
  return null;
}
const stackName = o => {
  const m = maskOf(o);
  return m ? m.def.name + ': Ability' : o.name;
};
const uiCanPlay = c => (ui.placing ? 'Finish placing the current card first' : Sim.canPlay(game, c));
const sleep = ms => new Promise(r => setTimeout(r, ms)),
  bannerEl = document.createElement('div');
bannerEl.id = 'banner';
bannerEl.hidden = true;
document.body.appendChild(bannerEl);
// a hidden tab gets no animation frames: with the setting on the tweens run on a timer instead, so the game does not wait for a frame that never comes
const nextFrame = f => (document.hidden && Settings.get('runHidden') ? setTimeout(f, 50) : requestAnimationFrame(f));
function tween(ms, fn) {
  return Promise.race([
    new Promise(res => {
      const t0 = performance.now();
      (function step() {
        const t = Math.min(1, (performance.now() - t0) / ms);
        fn(t);
        ui.dirty = true;
        t < 1 ? nextFrame(step) : res();
      })();
    }),
    sleep(ms + 600),
  ]);
}
let splatTex = null;
function splat3D(m) {
  if (!splatTex) {
    splatTex = [];
    for (let n = 0; n < 3; n++) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = '#b3121c';
      g.beginPath();
      g.arc(64, 64, 26 + Math.random() * 8, 0, 7);
      g.fill();
      for (let i = 0; i < 9; i++) {
        const a = Math.random() * 6.28,
          d = 30 + Math.random() * 26;
        g.beginPath();
        g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 4 + Math.random() * 9, 0, 7);
        g.fill();
      }
      splatTex.push(new THREE.CanvasTexture(c));
    }
  }
  const p = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 1.7),
    new THREE.MeshBasicMaterial({ map: splatTex[Math.floor(Math.random() * 3)], transparent: true, depthWrite: false })
  );
  p.rotation.set(-Math.PI / 2, 0, Math.random() * 6.28);
  p.position.set(0, 0.1, 0);
  p.raycast = () => {};
  m.add(p);
  return () => m.remove(p);
}
function splatBar(pl) {
  const row = document.querySelector('#hp [data-p="' + pl + '"]'),
    d = document.createElement('div');
  d.className = 'splat';
  row.appendChild(d);
  return () => d.remove();
}
function makeSword() {
  const g = new THREE.Group(),
    steel = new THREE.MeshStandardMaterial({ color: 0xdfe6f0, metalness: 0.6, roughness: 0.25 }),
    gold = new THREE.MeshStandardMaterial({ color: 0xd9a93a, metalness: 0.4, roughness: 0.4 });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 1.2), steel),
    tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 4), steel),
    guard = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.1), gold),
    grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.4), gold);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.77;
  guard.position.z = -0.62;
  grip.position.z = -0.85;
  g.add(blade, tip, guard, grip);
  return g;
}
// non-combat damage to a card: a lightning bolt strikes it three times in 0.5 s (a new jagged bolt each time), on every card hit at once
function makeBolt(to) {
  const g = new THREE.Group(),
    mat = new THREE.MeshBasicMaterial({
      color: 0xfff2a8,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    glow = new THREE.MeshBasicMaterial({
      color: 0x9fc8ff,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    // it comes in slanted (from above and behind), so the top view sees a line and not a dot
    from = new THREE.Vector3(to.x + 2.2, 6, to.z - 4),
    end = new THREE.Vector3(to.x, 0.15, to.z),
    N = 7,
    pts = [];
  for (let i = 0; i <= N; i++) {
    const p = from.clone().lerp(end, i / N);
    if (i > 0 && i < N) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.7, 0, (Math.random() - 0.5) * 0.7));
    pts.push(p);
  }
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < N; i++) {
    const a = pts[i],
      b = pts[i + 1],
      len = a.distanceTo(b),
      dir = b.clone().sub(a).normalize();
    for (const [r, m] of [
      [0.07, mat],
      [0.2, glow], // a soft halo around the core
    ]) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), m);
      seg.position.copy(a).lerp(b, 0.5);
      seg.quaternion.setFromUnitVectors(up, dir);
      g.add(seg);
    }
  }
  g.raycast = () => {};
  return g;
}
async function boltJob(ev) {
  const ms = [...new Set(ev.filter(e => e.t === 'DamageDealt' && e.type !== 'combat').map(e => e.target))]
    .map(id => meshes.get(id))
    .filter(Boolean);
  if (!ms.length) return;
  for (let k = 0; k < 3; k++) {
    const bolts = ms.map(m => makeBolt(m.position));
    bolts.forEach(b => scene.add(b));
    ui.dirty = true;
    await sleep(100);
    bolts.forEach(b => {
      scene.remove(b);
      b.traverse(o => o.geometry && o.geometry.dispose());
    });
    ui.dirty = true;
    await sleep(67);
  }
}
const isCombatHit = e => (e.t === 'DamageDealt' && e.type === 'combat') || (e.t === 'PlayerDamaged' && e.combat);
const attackResolved = (pre, post) => {
  // did this command resolve the Attack that was on top of the stack?
  const o = pre.stack[pre.stack.length - 1];
  return !!o && o.kind === 'attack' && !post.stack.some(q => q.sid === o.sid);
};
async function attackJob(pre, ev) {
  // sword flies down the column; every hit gets a splat; splats go away, THEN the numbers update
  const comb = ev.filter(e => isCombatHit(e) || (e.t === 'DamageDenied' && attackResolved(pre, sim))); // a denied hit still gets its sword
  if (!comb.length) return;
  const moved = ev.filter(e => e.t === 'PermanentMoved'); // a shift happened before the strike: move the card first, so the attack runs straight down its NEW column
  for (const e of moved) {
    const mm = meshes.get(e.iid),
      z = slotZones[e.slot];
    if (mm && z) {
      mm.userData.tx = z.position.x;
      mm.userData.tz = z.position.z;
    }
  }
  if (moved.length) await sleep(600);
  const ao = pre.stack[pre.stack.length - 1], // the Attack that just resolved is on top of the old stack
    a = meshes.get(ao && ao.kind === 'attack' ? ao.iid : comb[0].source) || meshes.get(comb[0].source),
    z0 = ao && ao.slotAt && slotZones[ao.slotAt], // the attacker may be gone already (killed in response): the sword starts where it stood
    from0 = a ? { x: a.position.x, z: a.position.z } : z0 ? { x: z0.position.x, z: z0.position.z } : null;
  if (!from0) return;
  if (a) setSword(a, false, false);
  const cue3d =
    typeof View3D !== 'undefined'
      ? View3D.onAttack(ev, sim, ao && ao.kind === 'attack' ? ao.iid : comb[0].source)
      : null; // the attacker's animation // the strike takes over from the sword that stood on the attacker
  const sword = makeSword(),
    undo = [];
  let cur = from0;
  const sy = typeof View3D !== 'undefined' ? View3D.styleSword(sword) : 0.9; // bigger, higher and flashing in the side view
  sword.position.set(cur.x, sy, cur.z);
  scene.add(sword);
  for (const e of comb) {
    const m = e.t === 'PlayerDamaged' ? null : meshes.get(e.target);
    if (e.t !== 'PlayerDamaged' && !m) continue; // a target that is already gone shows nothing (it used to be drawn as a hit on the player)
    const to = m
        ? { x: m.position.x, z: m.position.z }
        : {
            x: cur.x,
            z: (e.player === 'Opponent' ? -1 : 1) * ((typeof View3D !== 'undefined' && View3D.playerZ()) || 7.3),
          },
      from = cur;
    sword.rotation.y = to.z >= from.z ? 0 : Math.PI;
    await tween(280, t => sword.position.set(from.x + (to.x - from.x) * t, sy, from.z + (to.z - from.z) * t));
    cur = to;
    if (cue3d && m) View3D.onHit(e.target); // the creature hit plays get_hit as the sword arrives
    undo.push(e.t === 'DamageDenied' ? () => {} : m ? splat3D(m) : splatBar(e.player));
    ui.dirty = true;
  }
  await sleep(700);
  scene.remove(sword);
  undo.forEach(f => f());
  ui.dirty = true;
}
// a stop icon click. It never waits for an animation (send() refuses input while one plays, so clicks used to get lost) and
// it is not an undo step; it is still recorded (replays stay exact) and logged. The screen state follows at once.
function sendStop(cmd) {
  if (rp.on) return { ok: false, why: 'Replay: watching only', events: [] };
  const pre = structuredClone(sim),
    r = Sim.dispatch(sim, cmd);
  if (!r.ok) return r;
  cmdLog.push(JSON.parse(JSON.stringify(cmd)));
  GameLog.add(pre, cmd, r.events, 'player');
  if (game !== sim) game.stops = structuredClone(sim.stops); // an animation shows an older state: its stops follow too
  sync();
  return r;
}
function send(cmd, src, trace) {
  // src: who sent it (player / auto / bot / replay); trace: a bot's decision (debug log)
  if (rp.on && !rp.feed) {
    ui.note = 'Replay: watching only';
    sync();
    return { ok: false, why: 'Replay: watching only', events: [] };
  } // while a replay plays only the replay itself sends commands
  if (Result.blocks()) {
    ui.note = 'The game is decided: use the result window or Exit';
    sync();
    return { ok: false, why: 'The game is decided', events: [] };
  } // open result dialog, or the other side left
  if (ui.fxBusy) {
    sync();
    return { ok: false, why: 'Animation in progress', events: [] };
  } // input waits for the animation
  const pre = structuredClone(sim),
    r = Sim.dispatch(sim, cmd);
  if (!r.ok) ui.note = r.why;
  let jobs = [],
    rv = null;
  if (r.ok) {
    const atk = r.events.find(e => e.t === 'CreatureAttackDeclared');
    const hits = r.events.filter(e => e.t === 'PlayerDamaged').reduce((n, e) => n + e.amount, 0);
    const kills = r.events.filter(e => e.t === 'PermanentDestroyed').length;
    ui.note = atk
      ? sim.cards[atk.iid].def.name +
        ' attacks column ' +
        (atk.col + 1) +
        (kills ? ', ' + kills + ' destroyed' : '') +
        (sim.stack.some(o => o.kind === 'attack') ? ', on the stack' : ', ' + hits + ' damage to player')
      : '';
    undoStack.push(pre);
    if (undoStack.length > 200) undoStack.shift();
    if (!rp.on) cmdLog.push(JSON.parse(JSON.stringify(cmd)));
    eventLog.push(...r.events);
    if (typeof AvatarView !== 'undefined') AvatarView.onEvents(r.events); // playing_card
    GameLog.add(pre, cmd, r.events, src, trace); // src: auto | bot | replay (a click is 'player')
    if (eventLog.length > 200) eventLog.splice(0, eventLog.length - 200);
    ui.placing = null;
    ui.selected = null;
    ui.inspHold = true; // any action closes the inspection panel
    jobs = r.events
      .filter(e => e.t === 'CardRevealed' || e.t === 'EffectFailed')
      .map(e => () => noticeJob(pre, e))
      .concat(fxJobs(pre, sim)); // reveals and failures are shown first
    if (r.events.some(e => e.t === 'DamageDealt' && e.type !== 'combat')) jobs.push(() => boltJob(r.events)); // effect damage: lightning
    const fail = r.events.find(e => e.t === 'EffectFailed');
    if (fail) ui.note = sim.cards[fail.iid].def.name + ' fails: ' + fail.why;
    if (r.events.some(isCombatHit) || (attackResolved(pre, sim) && r.events.some(e => e.t === 'DamageDenied'))) {
      // order: attack animation -> damage numbers -> triggered abilities appear on the stack
      const A = new Set(pre.stack.map(o => o.sid)),
        ent = jobs.filter(j => j.enter);
      jobs = jobs.filter(j => !j.enter);
      jobs.push(
        () => attackJob(pre, r.events),
        async () => {
          const m = structuredClone(sim);
          m.stack = m.stack.filter(o => A.has(o.sid));
          game = m;
          sync();
          await sleep(700);
        },
        ...ent
      );
    }
    if (r.events.some(e => e.t === 'TurnChanged')) {
      const hold = ui.autoView;
      if (hold) ui.viewHold = true;
      jobs.unshift(async () => {
        // turn ends: the banner plays for BOTH players, first for the one whose turn ended, then for the new turn player
        if (hold) {
          ui.pin = null;
          setView(pre.active);
          await camArrive();
          await sleep(200);
        }
        bannerEl.textContent = NAME[pre.active] + ': Turn Ended';
        bannerEl.hidden = false;
        await sleep(900);
        if (hold) {
          const m = structuredClone(sim);
          m.stack = pre.stack.slice();
          game = m;
          setView(sim.active);
          sync();
          await camArrive();
          await sleep(200);
        } // BUG FIX: the new turn's triggers (The Vine) must not show on the stack before their own animation   // viewHold stays on: the new turn player sees their banner
        bannerEl.textContent = NAME[sim.active] + ': Your Turn';
        bannerEl.hidden = false;
        await sleep(900);
        bannerEl.hidden = true;
        if (hold) {
          ui.viewHold = false;
          setView(sim.choice ? sim.choice.player : sim.priority);
          sync();
          await camArrive();
          await sleep(200);
        }
      });
    } // then the seat holding priority (e.g. the Vine trigger responder) watches the stack animation
    else if (ui.autoView && pre.stack.length > sim.stack.length) {
      ui.viewHold = true;
      setView(sim.choice ? sim.choice.player : sim.priority);
    } // something resolved: the animation plays from the seat that gets priority next
  }
  // a spell or ability that resolved: a short pause before automatic passes / the bot / the result dialog go on, so the outcome can be seen
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
  return r;
}
// is there anything p could do now that should stop the game? A card with a mute counter is left out: while something waits for a
// response its Quick spells and abilities count as Slow ones (it can still be used by hand at a stop). The rules never see it.
const liveAction = (s, p) => Sim.actionsOf(s, p).some(a => !(a.iid && ui.muted.has(a.iid)));
function toggleMute(c) {
  if (ui.muted.has(c.iid)) ui.muted.delete(c.iid);
  else ui.muted.add(c.iid);
  ui.note = c.def.name + (ui.muted.has(c.iid) ? ': muted (it no longer stops the game)' : ': mute counter removed');
  sync();
  clearTimeout(ui.autoTimer);
  ui.autoTimer = setTimeout(autoStep, 50); // a muted card may have been the only reason to wait
}
function autoStep() {
  if (MenuUI.away || rp.on) return; // the menu or the deck editor is on screen (or a replay plays): nothing happens by itself
  if (Result.check()) return; // the game is decided: the result dialog (or the Exit button) takes over
  if (ui.mode === 'bot' && botWants()) {
    botSchedule();
    return;
  } // the bot decides its own passes and plays
  if (ui.placing || ui.autoDepth > 12 || game.phase !== 'play' || game.choice) return;
  const p = game.priority,
    mode = ui.actions;
  let cmd = null;
  if (game.stack.length) {
    if (mode === 'off' || (mode === 'normal' && !liveAction(game, p))) cmd = { type: 'Pass', player: p };
  } else if (game.respond) {
    if (mode === 'off' || (mode === 'normal' && !liveAction(game, p))) cmd = { type: 'Pass', player: p };
  } else if (ui.autoTurn && mode !== 'always' && p === game.active) {
    const acts = Sim.actionsOf(game, p);
    if (game.attackPhase) {
      // the combat phase ends by itself when no attack is left (the next pass of automation then ends the turn if nothing else can be done)
      if (!acts.some(a => a.kind === 'attack')) cmd = { type: 'SetAttackPhase', player: p, on: false };
    } else if (mode === 'off' ? !Sim.hasAP(game, p) : !acts.length) cmd = { type: 'EndTurn', player: p };
  }
  if (!cmd) return;
  if (ui.autoView && ui.camAngle !== ui.camGoal) {
    clearTimeout(ui.autoTimer);
    ui.autoTimer = setTimeout(autoStep, 250);
    return;
  } // let the camera reach the seat holding priority before an automatic pass / end turn skips past it
  ui.autoDepth++;
  try {
    send(cmd, 'auto');
  } finally {
    ui.autoDepth--;
  }
}
const draw = () => {
  if (!ui.placing) send({ type: 'Draw', player: ui.view });
};
const pass = () => {
  if (!ui.placing) send({ type: 'Pass', player: ui.view });
};
const toggleAttack = () => {
  if (!ui.placing) send({ type: 'SetAttackPhase', player: ui.view, on: !game.attackPhase });
};
function play(c) {
  if (uiCanPlay(c)) return;
  if (isPerm(c) || c.def.colTarget || c.def.zoneTarget || c.def.playerTarget) {
    ui.placing = c;
    sync();
  } else send({ type: 'PlayCard', iid: c.iid });
}
const place = (c, zone) => {
  const cmd = {
    type: 'PlayCard',
    iid: c.iid,
    slot: zone.userData.slotKey,
    zone: zone.userData.slotKey,
    col: zone.userData.slot.col,
  };
  if (c.def.extraCost && Sim.canPayExtra(game, c)) {
    ui.extraAsk = { c, cmd };
    ui.placing = c;
    sync();
  } else send(cmd);
};
function undo() {
  if (!undoStack.length || ui.fxBusy || Result.blocks()) return;
  if (!rp.on) cmdLog.pop(); // an undone command is not part of the duel any more
  sim = undoStack.pop();
  GameLog.pop();
  game = sim;
  ui.placing = null;
  fxReset();
  closeMenu();
  sync();
  Result.check();
}
const camArrive = () =>
  new Promise(r => {
    const t0 = performance.now();
    (function w() {
      if (ui.camAngle === ui.camGoal || performance.now() - t0 > 1800) r();
      else setTimeout(w, 30);
    })();
  }); // resolves once the seat camera has finished turning
// ---- top-down orthographic view (toggle, bottom left) ----
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, CameraCfg.get().top.near, CameraCfg.get().top.far), // config/camera.json
  tv = { on: false, cx: 0, cz: 0, zoom: 1 };
let cam = camera,
  panFrom = null;
const HELP_SIDE = 'Drag: orbit \u00b7 Wheel: zoom \u00b7 Right-drag: pan',
  HELP_TOP = 'Drag: pan \u00b7 Wheel: zoom';
function fitOrtho() {
  const T = CameraCfg.get().top,
    a = VW() / VH(),
    H = Math.max(T.minHalfHeight, T.halfHeightAspect / a) / tv.zoom;
  ortho.left = -H * a;
  ortho.right = H * a;
  ortho.top = H;
  ortho.bottom = -H;
  ortho.updateProjectionMatrix();
}
function placeTop() {
  // screen-up points away from the seat being viewed
  const T = CameraCfg.get().top,
    r = ui.camAngle + (T.rotationDeg * Math.PI) / 180,
    s = Math.sin(r),
    c = Math.cos(r);
  ortho.up.set(-s, 0, -c);
  ortho.position.set(tv.cx, T.height, tv.cz);
  ortho.lookAt(tv.cx, 0, tv.cz);
  ortho.updateMatrixWorld();
}
function setTopView(on) {
  tv.on = on;
  cam = on ? ortho : camera;
  controls.enabled = !on;
  if (typeof View3D !== 'undefined') View3D.setEnabled(!on); // the side view is the 3D view (layout, characters, camera)
  if (typeof AvatarView !== 'undefined') AvatarView.setSide(!on); // the avatar models show in the side view only
  if (on) {
    tv.zoom = 1;
    tv.cx = tv.cz = 0;
    fitOrtho();
    placeTop();
  }
  viewBtn.textContent = on ? 'Side view' : 'Top view';
  helpEl.textContent = on ? HELP_TOP : HELP_SIDE;
  closeMenu();
  ui.dirty = true;
  ui.hoverDirty = true;
}
viewBtn.onclick = () => setTopView(!tv.on);
helpEl.textContent = HELP_SIDE;
fitOrtho();
renderer.domElement.addEventListener(
  'wheel',
  e => {
    if (!tv.on) return;
    e.preventDefault();
    const T = CameraCfg.get().top;
    tv.zoom = Math.min(T.zoomMax, Math.max(T.zoomMin, tv.zoom * Math.exp(-e.deltaY * T.zoomSpeed)));
    fitOrtho();
    ui.dirty = true;
    ui.hoverDirty = true;
  },
  { passive: false }
);
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
function setView(p) {
  ui.view = p;
  ui.camGoal = CameraCfg.seatAngle(p); // config/camera.json seat.opponentYawDeg
  ui.placing = null;
  closeMenu();
  if (game.phase === 'deck') {
    deckPanel.hidden = true;
    ui.openList = null;
    inspect.hidden = true;
    ui.selected = null;
    openDeckEditor();
  }
}
function openDeckEditor() {
  if (game.phase === 'deck' && !game.ready[ui.view]) showList(ui.view, 'deck');
} // deck building: your deck list opens by default
function switchPlayer() {
  ui.pin = game.choice ? game.choice.player : game.priority;
  setView(other(ui.view));
  sync();
} // debug: seat only
// the options of the start dialog. A replay recorded before the draw phase existed has no `rules`: LEGACY_RULES keeps it exact
const LEGACY_RULES = { drawPhase: 0 };
const gameRules = c => {
  const r = {};
  for (const k of ['startHand', 'drawPhase', 'drawAction', 'life']) if (c[k] != null) r[k] = c[k];
  if (c.strikeBack) r.strikeBack = true; // "Defender strike back" (recorded with the replay, like the other options)
  const race =
    c.race !== false && // the start dialog's "Turn order race" toggle (off = turns alternate)
    c.avatars &&
    typeof AvatarCatalog !== 'undefined' &&
    AvatarCatalog.get()
      ? AvatarLogic.raceOf(AvatarCatalog.get(), c.avatars)
      : null;
  if (race) r.race = race; // the avatars' Initial Distance / Speed / Acceleration decide the turn order (recorded with the replay)
  return r;
};
const gameNames = c =>
  c.mode === 'bot'
    ? { [c.botSeat === 'Player' ? 'Opponent' : 'Player']: c.name1 || 'Player', [c.botSeat || 'Opponent']: 'Bot' }
    : { Player: c.name1 || 'Player', Opponent: c.name2 || 'Player 2' };
function setNames(s) {
  // the shown names follow the game (logs, panels, the life bars)
  Object.assign(NAME, { Player: 'Player 1', Opponent: 'Player 2' }, s.names || {});
  for (const p of ['Player', 'Opponent']) {
    const el = document.querySelector('#hp [data-p="' + p + '"] span');
    if (el) el.textContent = NAME[p];
  }
  if (typeof AvatarView !== 'undefined') AvatarView.newDuel(s); // a new duel: its avatars (icons, 3D models, animations)
  if (typeof TurnStrip !== 'undefined') TurnStrip.reset(); // a new duel: the turn order strip starts over
}
function newGame(cfg) {
  ui.lastCfg = cfg;
  resetGame();
  autoStep();
}
function resetGame() {
  const c = ui.lastCfg || { mode: 'self', p1: BUILTIN_DECKS[0].name, p2: BUILTIN_DECKS[1].name, shuffle: true };
  ui.lastCfg = c;
  ui.mode = c.mode;
  ui.botSeat = c.botSeat || 'Opponent';
  ui.deckEdit = false;
  ui.autoView = c.mode === 'self';
  ui.pin = null;
  botMem.turn = -1;
  Result.reset();
  clearTimeout(ui.stepTimer);
  clearTimeout(ui.botTimer);
  const deckOf = n => (DeckStore.find(n) || BUILTIN_DECKS[0]).cards,
    exOf = n => (DeckStore.find(n) || BUILTIN_DECKS[0]).extra || [];
  const rules = gameRules(c),
    names = gameNames(c);
  sim = Sim.create(newSeed(), DEFS, {
    decks: { Player: deckOf(c.p1), Opponent: deckOf(c.p2) },
    extra: { Player: exOf(c.p1), Opponent: exOf(c.p2) },
    shuffle: c.shuffle,
    autoStart: true,
    stops: Settings.get('stops') || STOPS_ON,
    orderTriggers: true, // real games: a player with several triggers at once orders them
    rules,
    names,
    avatars: c.avatars, // chosen in the character selection scene
  });
  setNames(sim);
  game = sim;
  fxReset();
  undoStack.length = 0;
  ui.muted.clear();
  eventLog.length = 0;
  GameLog.clear();
  GameLog.begin(sim);
  rp.on = false;
  rp.playing = false;
  clearTimeout(rp.timer);
  Replays.bar(false);
  cmdLog.length = 0;
  ui.rpInit = {
    n: sim.n,
    d1: deckOf(c.p1).slice(),
    d2: deckOf(c.p2).slice(),
    x1: exOf(c.p1).slice(),
    x2: exOf(c.p2).slice(),
    sh: !!c.shuffle,
    stops: Settings.get('stops') || STOPS_ON,
    ot: true, // the replay needs the same options (the trigger order choices are part of the recorded commands)
    rules, // the game options and the names
    names,
    avatars: sim.avatars, // the avatars (a replay shows them too)
    mode: c.mode,
    a: c.p1,
    b: c.p2,
    kind: c.mode, // what the replay list colours by: bot | self | over (take over)
    base: 0, // commands that belong to an earlier replay (a take over from the current state): a duel with no new command is not saved
  };
  for (const m of meshes.values()) cardGroup.remove(m);
  meshes.clear();
  ui.selected = null;
  ui.openList = null;
  inspect.hidden = true;
  deckPanel.hidden = true;
  setView(c.mode === 'bot' ? other(ui.botSeat) : 'Player');
  sync();
}

// ---- Game function buttons (HTML, top right) and debug buttons (HTML, bottom right) ----
const hint = kind =>
  !rp.on && !game.choice && game.phase === 'play' && Sim.actionsOf(game, ui.view).some(a => a.kind === kind); // is that action available to the viewed seat now? (pulses the Draw / Attack buttons)
const debugOk = () => (ui.mode === 'self' || ui.mode === 'bot') && game.phase === 'play' && !rp.on; // debug tools (deck list: add to hand) exist in Vs Self / Vs Bot
const myPriority = () => ui.view === game.priority && !ui.placing && !game.choice; // nobody holds a usable priority while a player is making a choice
const inPlay = () => game.phase === 'play' && !rp.on; // a replay only views: every gameplay button is hidden
const FN = [
  {
    id: 'start',
    cls: 'c-go',
    label: () => (game.ready[ui.view] ? NAME[ui.view] + ' ready \u2713' : 'Start (' + NAME[ui.view] + ')'),
    run: () => {
      const r = send({ type: 'Start', player: ui.view });
      if (r.ok && game.phase === 'deck' && !game.ready[other(ui.view)]) {
        setView(other(ui.view));
        sync();
      }
    }, // after Start, hand the seat to the player who is still arranging
    on: () => !ui.placing && !game.ready[ui.view],
    show: () => game.phase === 'deck',
  },
  {
    id: 'draw',
    cls: 'c-go',
    label: () => 'Draw ' + (game.cfg && game.cfg.drawAction != null ? game.cfg.drawAction : 2),
    run: draw,
    on: () =>
      myPriority() &&
      !game.stack.length &&
      !game.respond &&
      ui.view === game.active &&
      !game.attackPhase &&
      Sim.hasAP(game, ui.view) &&
      game.piles[ui.view].deck.length > 0,
    show: inPlay,
  },
  {
    id: 'pass',
    cls: 'c-pass',
    label: () =>
      game.respond && !game.stack.length ? 'Pass (' + (STOP_NAMES[game.respond.kind] || 'entered') + ')' : 'Pass',
    run: pass,
    on: () => myPriority() && (game.stack.length > 0 || !!game.respond),
    show: inPlay,
  },
  {
    id: 'battle',
    cls: 'c-atk',
    label: () => (game.attackPhase ? 'End combat' : 'Attack: off'), // ending combat goes back to the main phase
    run: toggleAttack,
    on: () =>
      myPriority() &&
      !game.stack.length &&
      !game.respond &&
      ui.view === game.active &&
      (game.attackPhase || Sim.hasAP(game, ui.view)),
    show: inPlay,
  },
  {
    id: 'notarget',
    cls: 'c-go',
    label: () => 'Cast without target',
    run: () => send({ type: 'PlayCard', iid: ui.placing.iid }),
    on: () => !!(ui.placing && ui.placing.def.optionalTarget),
    show: () => !!(ui.placing && ui.placing.def.optionalTarget),
  },
  {
    id: 'cancel',
    cls: 'c-atk',
    label: () => 'Cancel',
    run: () => {
      ui.placing = null;
      sync();
    },
    on: () => !!ui.placing,
    show: () => !!ui.placing,
  }, // a game feature (Esc does the same): back out of picking a zone / target before anything is committed
  {
    id: 'endturn',
    label: () => 'End turn',
    run: () => send({ type: 'EndTurn', player: game.priority }),
    on: () => myPriority() && !game.stack.length && !game.respond && game.priority === game.active,
    show: inPlay,
  },
  {
    id: 'surrender',
    cls: 'c-atk',
    label: () => 'Surrender',
    run: () => {
      // The seat is fixed when the button is pressed (auto view may switch seats while the dialog is open), and a
      // confirmed surrender is never dropped: while an animation runs (the bot kept playing) it waits for it instead of being refused
      const who = ui.mode === 'bot' ? other(ui.botSeat) : ui.view; // Vs bot: always the human seat (auto view may be on the bot's)
      confirmBox('Surrender? ' + NAME[who] + ' loses the game.', 'Surrender', 'Cancel').then(ok => {
        if (!ok) return;
        const go = () => {
          if (sim.result || game.phase !== 'play' || rp.on) return;
          if (ui.fxBusy) return void setTimeout(go, 100);
          ui.placing = null;
          send({ type: 'Surrender', player: who }); // send -> autoStep -> the result dialog takes over
        };
        go();
      });
    },
    on: () => inPlay() && !game.result && !rp.on && !Result.blocks(),
    show: () => inPlay() && !rp.on,
  },
];
const DBTN = [
  {
    id: 'autoturn',
    label: () => 'Auto turn: ' + (ui.autoTurn ? 'on' : 'off'),
    run: () => {
      ui.autoTurn = !ui.autoTurn;
      sync();
      autoStep();
    },
    on: () => true,
    show: () => !rp.on,
  },
  {
    id: 'actions',
    label: () => 'Actions: ' + ui.actions,
    run: () => {
      ui.actions = { off: 'normal', normal: 'always', always: 'off' }[ui.actions];
      sync();
      autoStep();
    },
    on: () => true,
    show: () => !rp.on,
  },
  {
    id: 'stops', // portrait only (css .pOnly): shows / folds the stops under these buttons
    cls: 'pOnly',
    label: () => 'Stops: ' + (typeof StopsBar !== 'undefined' && StopsBar.portraitShown() ? 'shown' : 'hidden'),
    run: () => {
      StopsBar.togglePortrait();
      sync();
    },
    on: () => true,
    show: () => !rp.on,
  },
  {
    id: 'reset',
    label: () => (rp.on ? 'Restart replay' : 'Reset game'),
    run: () => {
      if (rp.on) return Replays.restart(); // a replay never turns into a game: Restart plays it again from the beginning
      Replays.saveCurrent()
        .catch(() => false)
        .then(resetGame);
    },
    on: () => true,
  },
  {
    id: 'deckedit',
    label: () => 'Reorder decks: ' + (ui.deckEdit ? 'on' : 'off'),
    run: () => {
      ui.deckEdit = !ui.deckEdit;
      sync();
    },
    on: () => true,
    show: () => ui.mode === 'self',
  }, // debug deck editing: click a Deck zone, drag rows
  {
    id: 'rpview',
    label: () => 'View: ' + { p1: 'Player 1', p2: 'Player 2', auto: 'Current player' }[rp.view],
    run: () => Replays.cycleView(),
    on: () => rp.on,
    show: () => rp.on,
  }, // replay only: Player 1 -> Player 2 -> Current player (the camera follows priority)
  {
    id: 'settings', // the same Settings dialog as the main menu's
    cls: 'c-icon',
    label: () => '\u2699',
    tip: 'Settings',
    run: () => settingsDialog(),
    on: () => true,
  },
  { id: 'menu', cls: 'c-exit', label: () => 'Exit', run: () => MenuUI.leaveGame(), on: () => true },
  { id: 'player', label: () => 'Switch player', run: switchPlayer, on: () => true, show: () => ui.mode === 'self' },
  {
    id: 'auto',
    label: () => 'Auto view: ' + (ui.autoView ? 'on' : 'off'),
    run: () => {
      ui.autoView = !ui.autoView;
      sync();
    },
    on: () => true,
    show: () => ui.mode === 'self',
  },
  {
    id: 'undo',
    label: () => 'Undo (' + undoStack.length + ')',
    run: undo,
    on: () => undoStack.length > 0,
    show: () => ui.mode === 'self',
  },
];
const fnEl = document.createElement('div');
fnEl.id = 'fn';
document.body.appendChild(fnEl);
const dbg = document.createElement('div');
dbg.id = 'dbg';
document.body.appendChild(dbg);
[
  [FN, fnEl],
  [DBTN, dbg],
].forEach(([list, host]) =>
  list.forEach(b => {
    b.el = document.createElement('button');
    b.el.className = 'abtn' + (b.cls ? ' ' + b.cls : '');
    b.el.onclick = () => {
      if (b.on()) b.run();
    };
    host.appendChild(b.el);
  })
);
// portrait (phone): shorter button texts, so each button row stays one line and covers less of the hands (the full text is the tooltip)
const SHORT = {
  battle: () => (game.attackPhase ? 'End atk' : 'Attack'),
  endturn: () => 'End',
  surrender: () => '\u2691',
  autoturn: () => 'Auto ' + (ui.autoTurn ? 'on' : 'off'),
  actions: () => 'Act: ' + ui.actions,
  stops: () => 'Stops ' + (typeof StopsBar !== 'undefined' && StopsBar.portraitShown() ? '\u25be' : '\u25b8'),
  reset: () => (rp.on ? 'Restart' : 'Reset'),
  deckedit: () => 'Decks ' + (ui.deckEdit ? 'on' : 'off'),
  player: () => 'Switch',
  auto: () => 'Cam ' + (ui.autoView ? 'auto' : 'free'),
};
const portraitMQ = typeof matchMedia !== 'undefined' ? matchMedia('(orientation: portrait)') : null;
function updateDbg() {
  if (typeof StopsBar !== 'undefined') StopsBar.update(); // the stop icons (bottom right)
  if (typeof TurnStrip !== 'undefined') TurnStrip.update(); // the turn order strip (right side)
  [...FN, ...DBTN].forEach(b => {
    const full = b.label();
    b.el.textContent = portraitMQ && portraitMQ.matches && SHORT[b.id] ? SHORT[b.id]() : full;
    b.el.title = b.tip || full;
    if (b.tip) b.el.setAttribute('aria-label', b.tip);
    b.el.disabled = !b.on();
    if (b.show) b.el.hidden = !b.show();
    if (b.id === 'battle') b.el.classList.toggle('on', game.attackPhase);
    if (b.id === 'draw' || b.id === 'battle')
      b.el.classList.toggle('pulseG', !b.el.disabled && !b.el.hidden && hint(b.id)); // an available action is highlighted
    if (b.id === 'menu') b.el.classList.toggle('pulseR', Result.pulsing()); // the other side left: this is the way out
  });
}

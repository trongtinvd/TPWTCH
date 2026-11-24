// view3d.js - Patch8: the 3D side view. The side view (viewBtn) now uses config/board3d.json (2 x 2 m zones, 1 m between a
// player's rows, 4 m between the front rows), config/camera3d.json (seat camera, FOV, clipping, orbit limits, the hands that
// ride with the camera) and config/characters.json (a character on every creature, with its animations). The top view is
// untouched: leaving the side view disposes every character, stops the camera animation and puts the original layout back.
// Hooks (one line each): setTopView -> setEnabled, sync -> sync(T), animate -> preFrame / postFrame, attackJob -> onAttack / onHit,
// input picking -> pickProxies + userData.pickAs, main loop -> ownsCamera.
// Debug: open the page with ?anim3d for a button row (plays a category on the selected card, else on every character);
// console: View3D.debug.play('stun'), View3D.stats().
const View3D = (function () {
  const L = Anim3DLogic,
    CFG = { board: 'config/board3d.json', camera: 'config/camera3d.json', characters: 'config/characters.json' };
  let on = false,
    applied = false,
    seen = false, // the first sync after entering: what is already on the board stands (idle), it does not enter
    cfg = { board: L.normalizeBoard({}), camera: L.normalizeCamera({}), chars: L.normalizeCharacters({}) },
    layout = L.boardLayout(cfg.board),
    saved = null,
    lastT = 0;
  const insts = new Map(), // iid -> Character3D on the board
    dying = new Set(), // characters playing their death after the card left
    known = new Map(), // iid -> HP left at the last sync (a drop = get_hit)
    hitShown = new Set(), // the attack animation already showed this hit
    group = new THREE.Group();
  group.name = 'characters3d';
  scene.add(group);
  const getJSON = url =>
    fetch(url, { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .catch(e => {
        console.warn('[3D] ' + url + ' not loaded, defaults used (' + e.message + ')');
        return {};
      });
  const ready = Promise.all([getJSON(CFG.board), getJSON(CFG.camera), getJSON(CFG.characters)]).then(([b, c, ch]) => {
    cfg = { board: L.normalizeBoard(b), camera: L.normalizeCamera(c), chars: L.normalizeCharacters(ch) };
    for (const e of cfg.chars.errors) console.warn('[3D] characters.json: ' + e);
    layout = L.boardLayout(cfg.board);
    if (on && !applied) apply();
  });
  const boardScale = () => cfg.board.cardFit * Math.min(layout.zone.width / CW, layout.zone.depth / CD);
  const sideKey = u =>
    u.deckOf ? u.deckOf + 'deck' : u.gyOf ? u.gyOf + 'gy' : u.extraOf ? u.extraOf + 'extra' : u.exileOf ? u.exileOf + 'exile' : null;
  const handZone = p => zones.find(z => z.userData.name === p + ' Hand');

  // ---- entering / leaving ----------------------------------------------------------------------------------------
  function setEnabled(v) {
    v = !!v;
    if (v === on) return;
    on = v;
    if (on) {
      if (!applied) apply();
    } else restore();
  }
  function apply() {
    applied = true;
    seen = false;
    saved = {
      zones: zones.map(z => ({
        z,
        p: z.position.clone(),
        s: z.scale.clone(),
        q: z.quaternion.clone(),
        pp: z.userData.plane.position.clone(),
        ps: z.userData.plane.scale.clone(),
        pq: z.userData.plane.quaternion.clone(),
        vis: z.visible,
        pvis: z.userData.plane.visible,
      })),
      clouds: Object.keys(clouds).map(k => ({ k, p: clouds[k].position.clone(), s: clouds[k].scale.clone() })),
      cam: { fov: camera.fov, near: camera.near, far: camera.far },
      orbit: { min: controls.minDistance, max: controls.maxDistance, polar: controls.maxPolarAngle },
    };
    const sx = layout.zone.width / TILE_W,
      sz = layout.zone.depth / TILE_D;
    for (const z of zones) {
      const u = z.userData,
        pos = u.slotKey ? layout.slots[u.slotKey] : sideKey(u) ? layout.side[sideKey(u)] : null;
      if (!pos) continue; // the hands ride with the camera (preFrame)
      z.position.x = pos.x;
      z.position.z = pos.z;
      z.scale.set(sx, 1, sz);
      u.plane.position.x = pos.x;
      u.plane.position.z = pos.z;
      u.plane.scale.set(sx, sz, 1);
    }
    for (const k in clouds) {
      const p = layout.slots[k];
      if (!p) continue;
      clouds[k].position.x = p.x;
      clouds[k].position.z = p.z;
      clouds[k].scale.set(sx, 1, sz);
    }
    const c = cfg.camera;
    camera.near = c.near;
    camera.far = c.far;
    camera.fov = c.fov;
    camera.updateProjectionMatrix();
    controls.minDistance = c.orbit.minDistance;
    controls.maxDistance = c.orbit.maxDistance;
    controls.maxPolarAngle = (c.orbit.maxPolarDeg * Math.PI) / 180;
    controls.enabled = c.orbit.enabled;
    placeSeatCamera(ui.camAngle);
    lastT = performance.now();
    refresh();
  }
  function restore() {
    CameraAnim3D.stop();
    for (const i of insts.values()) i.dispose();
    for (const i of dying) i.dispose();
    insts.clear();
    dying.clear();
    known.clear();
    hitShown.clear();
    if (!applied) return;
    applied = false;
    for (const s of saved.zones) {
      s.z.position.copy(s.p);
      s.z.scale.copy(s.s);
      s.z.quaternion.copy(s.q);
      s.z.visible = s.vis;
      const pl = s.z.userData.plane;
      pl.position.copy(s.pp);
      pl.scale.copy(s.ps);
      pl.quaternion.copy(s.pq);
      pl.visible = s.pvis;
    }
    for (const s of saved.clouds) {
      clouds[s.k].position.copy(s.p);
      clouds[s.k].scale.copy(s.s);
    }
    Object.assign(camera, saved.cam);
    camera.updateProjectionMatrix();
    controls.minDistance = saved.orbit.min;
    controls.maxDistance = saved.orbit.max;
    controls.maxPolarAngle = saved.orbit.polar;
    for (const m of meshes.values()) {
      const u = m.userData;
      if (u.cam3d) u.by = m.position.y;
      u.cam3d = false;
      u.hl = null;
      m.quaternion.identity();
      m.scale.set(1, 1, 1);
    }
    for (const k in piles3d) {
      piles3d[k].mesh.scale.x = piles3d[k].mesh.scale.z = 1;
    }
    saved = null;
    refresh();
  }
  function refresh() {
    ui.pickList = null;
    ui.dirty = true;
    ui.hoverDirty = true;
    if (typeof game !== 'undefined' && game) sync();
  }

  // ---- camera ----------------------------------------------------------------------------------------------------
  const poseObj = new THREE.Object3D();
  function placeSeatCamera(angle) {
    if (!on || !applied) return false;
    const p = L.seatPose(cfg.camera, angle, camera.aspect);
    poseObj.position.fromArray(p.position);
    if (p.rotationDeg) poseObj.rotation.set(...p.rotationDeg.map(d => (d * Math.PI) / 180), 'YXZ');
    else {
      poseObj.up.set(0, 1, 0);
      const t = new THREE.Vector3().fromArray(p.target),
        m = new THREE.Matrix4().lookAt(poseObj.position, t, poseObj.up);
      poseObj.quaternion.setFromRotationMatrix(m);
    }
    if (CameraAnim3D.owns()) CameraAnim3D.setBase(poseObj.position, poseObj.quaternion, p.fov);
    else {
      camera.position.copy(poseObj.position);
      camera.quaternion.copy(poseObj.quaternion);
    }
    controls.target.fromArray(p.target);
    ui.dirty = true;
    return true;
  }
  addEventListener('resize', () => {
    if (on && applied) placeSeatCamera(ui.camAngle);
  });
  // the orbit controls would turn the camera back to their target: they rest while a camera animation (or a fixed camera) runs
  const ownsCamera = () => on && applied && (CameraAnim3D.owns() || !cfg.camera.orbit.enabled);
  const anchorM = new THREE.Matrix4(),
    yawQ = new THREE.Quaternion(),
    Yaxis = new THREE.Vector3(0, 1, 0);
  function cameraHook(ce, asset, ch) {
    if (!on || !asset) return; // a camera file that did not load: the camera stays as it is
    if (ce.space === 'character') {
      ch.root.updateMatrixWorld(true);
      yawQ.setFromAxisAngle(Yaxis, ch.side === 'Player' ? Math.PI : 0);
      anchorM.compose(ch.root.getWorldPosition(new THREE.Vector3()), yawQ, new THREE.Vector3(1, 1, 1));
    } else if (ce.space === 'seat') anchorM.makeRotationY(ui.camAngle);
    else anchorM.identity();
    const a = cfg.camera.animation;
    CameraAnim3D.play(asset, {
      id: ce.id,
      speed: ce.speed * a.speed,
      anchor: anchorM,
      blendIn: ce.blendIn != null ? ce.blendIn : a.blendIn,
      blendOut: ce.blendOut != null ? ce.blendOut : a.blendOut,
      transitions: a.transitions,
    });
  }

  // ---- characters ------------------------------------------------------------------------------------------------
  function create(c, side) {
    const ch = L.characterFor(cfg.chars, c.def.id),
      inst = new Character3D(c.iid, ch, side, { camera: cameraHook, height: cfg.board.models.heightOffset });
    group.add(inst.root);
    inst.proxy.userData.pickAs = null;
    return inst;
  }
  // called at the end of sync(): characters follow the board cards the screen shows
  function syncT(T) {
    if (!on || !applied) return;
    const present = new Set(),
      show = cfg.board.models.showFor;
    for (const [iid, t] of T) {
      if (t.c.loc !== 'board' || !show.includes(t.c.def.type)) continue;
      const m = meshes.get(iid);
      if (!m) continue;
      present.add(iid);
      const hp = effHp(t.c);
      let inst = insts.get(iid);
      if (!inst) {
        inst = create(t.c, t.owner);
        insts.set(iid, inst);
        inst.play(seen ? 'enter' : 'idle');
      } else {
        inst.setSide(t.owner);
        const k = known.get(iid);
        if (k != null && hp < k) {
          if (hitShown.has(iid)) hitShown.delete(iid);
          else inst.play('get_hit'); // damage that was not an attack (an effect, a cost)
        }
      }
      known.set(iid, hp);
      inst.card = m;
      inst.root.visible = m.visible; // under an enemy cloud: hidden like its card
      inst.proxy.userData.pickAs = m;
    }
    for (const [iid, inst] of insts) {
      if (present.has(iid)) continue;
      insts.delete(iid);
      known.delete(iid);
      hitShown.delete(iid);
      inst.card = null;
      inst.proxy.userData.pickAs = null;
      if (L.leaveCategory(game.cards[iid]) === 'die' && inst.ready && inst.root.visible) {
        dying.add(inst);
        inst.die(() => {
          dying.delete(inst);
          inst.dispose();
          ui.dirty = true;
        });
      } else inst.dispose(); // bounced, exiled, back to the deck: it just goes
    }
    seen = true;
    ui.pickList = null;
  }
  const pickProxies = () => {
    if (!on || !applied) return [];
    const out = [];
    for (const i of insts.values())
      if (i.root.visible && i.proxy.userData.pickAs && ui.pickCards.includes(i.proxy.userData.pickAs)) out.push(i.proxy);
    return out;
  };
  // attackJob: the sword starts flying
  function onAttack(ev, post, attackerIid) {
    if (!on || !applied) return null;
    const cue = L.attackCue(ev, post, attackerIid);
    if (!cue) return null;
    const a = insts.get(cue.attacker);
    if (a) a.play(cue.category);
    return cue;
  }
  function onHit(iid) {
    const i = insts.get(iid);
    if (!i) return;
    i.play('get_hit');
    hitShown.add(iid);
  }

  // ---- frame -----------------------------------------------------------------------------------------------------
  const D2R = Math.PI / 180,
    vL = new THREE.Vector3(),
    qT = new THREE.Quaternion(),
    qA = new THREE.Quaternion(),
    eT = new THREE.Euler(),
    one = new THREE.Vector3(1, 1, 1),
    sV = new THREE.Vector3(),
    qI = new THREE.Quaternion();
  // a quaternion that turns a flat card (face up) to face the camera, tilted, upright for its seat
  function faceCam(tiltDeg, rot, out) {
    eT.set(Math.PI / 2 + tiltDeg * D2R, rot, 0, 'XYZ');
    return out.copy(camera.quaternion).multiply(qA.setFromEuler(eT));
  }
  // before the card tween: the hands ride with the camera (camera space, so they never lag behind it)
  function preFrame() {
    if (!on || !applied || typeof game === 'undefined' || !game) return false;
    let busy = false;
    camera.updateMatrixWorld();
    const inHand = new Set(),
      tanH = Math.tan((camera.fov * D2R) / 2);
    for (const p of ['Player', 'Opponent']) {
      const h = p === ui.view ? cfg.camera.hand.own : cfg.camera.hand.opponent,
        hand = game.piles[p].hand,
        dist = Math.max(0.2, -h.offset[2]),
        visW = 2 * dist * tanH * camera.aspect,
        xs = L.handSpread(hand.length, h, visW, CW),
        rot = p === 'Opponent' ? Math.PI : 0;
      const hz = handZone(p);
      if (hz) {
        hz.visible = h.zone;
        hz.userData.plane.visible = h.zone;
        const zw = Math.min(visW * h.widthFrac, (hand.length ? xs[xs.length - 1] - xs[0] : 0) + CW * h.scale + 0.2);
        vL.set(h.offset[0], h.offset[1] - 0.02, h.offset[2] - 0.03);
        hz.position.copy(camera.localToWorld(vL.clone()));
        faceCam(h.tiltDeg, 0, hz.quaternion); // the label reads upright from the camera, whoever owns the hand
        hz.scale.set(Math.max(0.3, zw) / HAND_W, 1, (CD * h.scale + 0.15) / HAND_D);
        const pl = hz.userData.plane;
        pl.position.copy(hz.position).add(sV.set(0, 0.065, 0).applyQuaternion(hz.quaternion));
        pl.quaternion.copy(hz.quaternion).multiply(qA.setFromEuler(eT.set(-Math.PI / 2, 0, 0)));
        pl.scale.set(hz.scale.x, hz.scale.z, 1);
      }
      hand.forEach((c, i) => {
        const m = meshes.get(c.iid);
        if (!m) return;
        const u = m.userData;
        if (ui.drag && ui.drag.card.iid === c.iid) {
          u.cam3d = false; // follows the pointer over the board
          u.hl = null;
          return;
        }
        inHand.add(m);
        const goal = vL.set(
          h.offset[0] + xs[i],
          h.offset[1] + (c === ui.selected || c === ui.placing ? 0.08 : 0),
          h.offset[2] + i * 0.004
        );
        if (!u.cam3d || !u.hl) {
          u.cam3d = true;
          u.hl = camera.worldToLocal(m.position.clone()); // from where it is now (the deck, the board)
        }
        if (u.hl.distanceToSquared(goal) > 1e-6) {
          u.hl.lerp(goal, 0.25);
          busy = true;
        } else u.hl.copy(goal);
        m.position.copy(camera.localToWorld(u.hl.clone()));
        u.q3d = faceCam(h.tiltDeg, rot, u.q3d || new THREE.Quaternion());
        u.s3d = h.scale;
      });
    }
    const bs = boardScale();
    for (const m of meshes.values()) {
      if (inHand.has(m)) continue;
      const u = m.userData;
      if (u.cam3d) {
        u.cam3d = false;
        u.hl = null;
        u.by = m.position.y - (u.owner ? lift[u.owner] : 0); // the board tween goes on from here
      }
      u.q3d = null;
      u.s3d = bs;
    }
    return busy;
  }
  // after the card tween: card turn / scale, characters on their cards, animations, the camera animation
  function postFrame() {
    if (!on || !applied) return false;
    const now = performance.now(),
      dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    let busy = false;
    const bs = boardScale();
    for (const m of meshes.values()) {
      const u = m.userData,
        q = u.q3d || qI,
        s = u.s3d || bs;
      if (m.quaternion.angleTo(q) > 0.002) {
        m.quaternion.slerp(q, 0.25);
        busy = true;
      } else m.quaternion.copy(q);
      sV.set(s, 1, s);
      if (m.scale.distanceToSquared(sV) > 1e-6) {
        m.scale.lerp(sV, 0.25);
        busy = true;
      } else m.scale.copy(sV);
    }
    for (const k in piles3d) piles3d[k].mesh.scale.x = piles3d[k].mesh.scale.z = bs;
    for (const i of insts.values()) {
      if (i.card) i.root.position.set(i.card.position.x, i.card.position.y + 0.04, i.card.position.z);
      i.update(dt);
    }
    for (const i of dying) i.update(dt);
    if (insts.size || dying.size) busy = true; // characters always move a little (idle)
    if (CameraAnim3D.update(dt)) busy = true;
    return busy;
  }

  // ---- debug -----------------------------------------------------------------------------------------------------
  const debug = {
    play(cat, iid) {
      const list = iid != null ? [insts.get(iid)].filter(Boolean) : [...insts.values()];
      return list.map(i => i.play(cat));
    },
  };
  if (/[?&]anim3d\b/.test(location.search)) {
    const bar = document.createElement('div');
    bar.id = 'anim3dDebug';
    bar.style.cssText =
      'position:fixed;left:4px;bottom:84px;z-index:50;display:flex;flex-wrap:wrap;gap:3px;max-width:60vw;font:11px sans-serif';
    for (const cat of L.CATEGORIES) {
      const b = document.createElement('button');
      b.className = 'abtn';
      b.textContent = cat;
      b.onclick = () => debug.play(cat, ui.selected && insts.has(ui.selected.iid) ? ui.selected.iid : null);
      bar.appendChild(b);
    }
    document.body.appendChild(bar);
  }
  function stats() {
    let mixers = 0;
    for (const i of insts.values()) if (i.mixer) mixers++;
    return {
      on,
      applied,
      characters: insts.size,
      dying: dying.size,
      mixers,
      groupChildren: group.children.length,
      sceneChildren: scene.children.length,
      cachedFiles: Assets3D.cacheSize(),
      camera: CameraAnim3D.current(),
    };
  }
  return {
    ready,
    setEnabled,
    isOn: () => on,
    placeSeatCamera,
    ownsCamera,
    sync: syncT,
    preFrame,
    postFrame,
    pickProxies,
    onAttack,
    onHit,
    debug,
    stats,
    get config() {
      return cfg;
    },
    get layout() {
      return layout;
    },
    characters: () => insts,
  };
})();

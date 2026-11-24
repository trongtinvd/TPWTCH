// view3d.js - Patch8: the 3D side view. The side view (viewBtn) now uses config/board3d.json (2 x 2 m zones, 1 m between a
// player's rows, 4 m between the front rows), config/camera3d.json (seat camera, FOV, clipping, orbit limits, the hands that
// ride with the camera) and config/characters.json (a character on every creature, with its animations). The top view is
// untouched: leaving the side view disposes every character, stops the camera animation and puts the original layout back.
// Hooks (one line each): setTopView -> setEnabled, sync -> sync(T), animate -> preFrame / postFrame, attackJob -> onAttack / onHit,
// input picking -> pickProxies + userData.pickAs, main loop -> ownsCamera.
// Debug (console): View3D.demo(), View3D.debug.play('stun'), View3D.stats(). Patch10: ?anim3d is now the standalone card preview
// (anim3d.html, js/anim/card-preview.js), independent of this scene.
// Patch12: a resize (opening / closing the browser's DevTools, a panel drag, turning a phone) no longer puts the camera back on its
// seat once the player has moved it (orbit / zoom / pan): only the projection follows the new size. An untouched camera still
// re-fits its seat (minAspect). Seat turns and entering the side view place it as before. The own hand can be dragged left / right
// (camera3d.json hand.own.drag): handGrab / handDrag / handRelease (input.js), the board and its zones never move.
// Patch13: the opponent's hand drags the same way (hand.opponent.drag), its offset kept apart.
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
  // Patch9: the configs load again each time the side view opens (edit a file, switch Top / Side: the new values show). A config
  // that arrives while the side view is already open is applied at once (it used to be ignored: the defaults stayed).
  const cfgState = { board: 'loading', camera: 'loading', characters: 'loading' };
  let cfgKey = '';
  function loadCfg() {
    const one = k =>
      fetch(CFG[k], { cache: 'no-cache' })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
        .then(j => ((cfgState[k] = 'loaded'), j))
        .catch(e => {
          cfgState[k] = 'defaults (' + e.message + ')';
          console.warn(
            '[3D] ' +
              CFG[k] +
              ' not loaded, defaults used (' +
              e.message +
              ')' +
              (location.protocol === 'file:'
                ? ': a file:// page cannot read config files, open the game through a web server'
                : '')
          );
          return {};
        });
    return Promise.all([one('board'), one('camera'), one('characters')]).then(([b, c, ch]) => {
      const next = { board: L.normalizeBoard(b), camera: L.normalizeCamera(c), chars: L.normalizeCharacters(ch) },
        key = JSON.stringify(next);
      if (key === cfgKey) return false;
      cfgKey = key;
      cfg = next;
      for (const e of cfg.chars.errors) console.warn('[3D] characters.json: ' + e);
      layout = L.boardLayout(cfg.board);
      if (on && applied) {
        restore();
        apply();
      } else if (on) apply();
      return true;
    });
  }
  const ready = loadCfg();
  const boardScale = () => cfg.board.cardFit * Math.min(layout.zone.width / CW, layout.zone.depth / CD);
  const sideKey = u =>
    u.deckOf
      ? u.deckOf + 'deck'
      : u.gyOf
        ? u.gyOf + 'gy'
        : u.extraOf
          ? u.extraOf + 'extra'
          : u.exileOf
            ? u.exileOf + 'exile'
            : null;
  const handZone = p => zones.find(z => z.userData.name === p + ' Hand');

  // ---- entering / leaving ----------------------------------------------------------------------------------------
  function setEnabled(v) {
    v = !!v;
    if (v === on) return;
    on = v;
    if (on) {
      if (!applied) apply();
      loadCfg(); // Patch9: pick up edited config files
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
      onTop(s.z, false); // Patch9
      onTop(pl, false);
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
      u.ql = null; // Patch9
      if (u.top9) onTop(m, false);
      if (u.sword) swordPose(m, false);
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
  let manual = false; // Patch12: the player moved the camera since it was last placed on its seat
  controls.addEventListener('start', () => {
    if (on && applied) manual = true;
  });
  function placeSeatCamera(angle) {
    if (!on || !applied) return false;
    manual = false;
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
  // Patch12: a resize keeps a camera the player moved (position, rotation, orbit target, zoom); the projection (aspect) is updated by
  // the resize handler of input.js. A camera nobody touched re-fits its seat for the new shape (a narrow window moves it back).
  function onResize() {
    if (!on || !applied) return 'off';
    if (manual) return 'kept';
    placeSeatCamera(ui.camAngle);
    return 'refit';
  }
  addEventListener('resize', onResize);
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
      inst = new Character3D(c.iid, ch, side, {
        camera: cameraHook,
        height: cfg.board.models.heightOffset,
        art: () => (typeof artModel3D === 'function' ? artModel3D(c.def) : null),
      });
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
    // Patch9: a creature whose Attack waits on the stack plays "attacking" until it resolves (attack / finishing_attack) or is gone
    const waiting = new Set(game.stack.filter(o => o.kind === 'attack').map(o => o.iid));
    for (const [iid, inst] of insts) {
      if (waiting.has(iid) && !inst.idleAs) {
        inst.idleAs = 'attacking';
        inst.play('attacking');
      } else if (!waiting.has(iid) && inst.idleAs) {
        inst.idleAs = null;
        if (inst.cur && inst.cur.entry.category === 'attacking') inst.play('idle');
      }
    }
    seen = true;
    ui.pickList = null;
  }
  const pickProxies = () => {
    if (!on || !applied) return [];
    const out = [];
    for (const i of insts.values())
      if (i.root.visible && i.proxy.userData.pickAs && ui.pickCards.includes(i.proxy.userData.pickAs))
        out.push(i.proxy);
    return out;
  };
  // attackJob: the sword starts flying
  function onAttack(ev, post, attackerIid) {
    if (!on || !applied) return null;
    const cue = L.attackCue(ev, post, attackerIid);
    if (!cue) return null;
    const a = insts.get(cue.attacker);
    if (a) {
      a.idleAs = null; // Patch9: the Attack resolved: after the strike it goes back to idle
      a.play(cue.category);
    }
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
  // ---- Patch12: the own hand slides left / right (only the hand: the board, its zones and the other hands stay) ---------------------
  // Patch13: the opponent's hand too, each on its own (hand.own.drag / hand.opponent.drag, Settings handOffset3d / handOffset3dFoe).
  // The offset = along the camera's x axis, as a fraction of the visible width at the hand's distance (so it suits any screen);
  // clamped to drag.min .. max, which keeps the centre of the hand on screen (|x| < 0.5)
  const handX = { own: 0, opponent: 0 };
  let grab = null;
  for (const r of ['own', 'opponent'])
    try {
      const v = Settings.get(L.HAND_SETTING[r]);
      if (typeof v === 'number' && isFinite(v)) handX[r] = v;
    } catch (e) {}
  const roleOf = p => (p === ui.view ? 'own' : 'opponent');
  const dragCfg = r => cfg.camera.hand[r].drag;
  const clampHand = r => L.clampDrag(dragCfg(r), handX[r]);
  const visWidthAt = h => 2 * Math.max(0.2, -h.offset[2]) * Math.tan((camera.fov * D2R) / 2) * camera.aspect;
  // which hand zone (not a card on it) this object is, when that hand may be dragged: 'own' / 'opponent' / null
  function grabRole(obj) {
    if (!on || !applied || !obj) return null;
    for (const p of ['Player', 'Opponent']) if (obj === handZone(p) && dragCfg(roleOf(p)).enabled) return roleOf(p);
    return null;
  }
  // pointer down on a hand zone: the drag starts
  function handGrab(obj, x) {
    const r = grabRole(obj);
    if (!r) return false;
    grab = { r, x, from: clampHand(r) };
    return true;
  }
  function handDrag(x) {
    if (!grab) return false;
    const next = L.clampDrag(dragCfg(grab.r), grab.from + (x - grab.x) / Math.max(1, VW()));
    if (next !== handX[grab.r]) {
      handX[grab.r] = next;
      ui.dirty = true;
    }
    return true;
  }
  function handRelease() {
    if (!grab) return false;
    const r = grab.r;
    grab = null;
    try {
      Settings.set(L.HAND_SETTING[r], handX[r]); // the next game keeps it
    } catch (e) {}
    return true;
  }
  const handOffsetX = (r, h) => clampHand(r) * visWidthAt(h);
  // before the card tween: the hands ride with the camera (camera space, so they never lag behind it)
  function preFrame() {
    if (!on || !applied || typeof game === 'undefined' || !game) return false;
    let busy = false;
    camera.updateMatrixWorld();
    const inHand = new Set(),
      tanH = Math.tan((camera.fov * D2R) / 2);
    for (const p of ['Player', 'Opponent']) {
      const role = roleOf(p),
        h = cfg.camera.hand[role],
        hx = handOffsetX(role, h), // Patch12 / Patch13: the dragged offset of this hand
        hand = game.piles[p].hand,
        dist = Math.max(0.2, -h.offset[2]),
        visW = 2 * dist * tanH * camera.aspect,
        xs = HandScroll.spread(p, hand.length, visW * h.widthFrac - CW * h.scale, h.spacing, CW * h.scale * 0.42, true), // Patch9: a big hand scrolls
        rot = p === 'Opponent' ? Math.PI : 0;
      const hz = handZone(p);
      if (hz) {
        hz.visible = h.zone;
        hz.userData.plane.visible = h.zone;
        onTop(hz, true); // Patch9: the hand zone is drawn over the board
        onTop(hz.userData.plane, true);
        const zw = Math.min(
          visW * h.widthFrac,
          (hand.length ? xs[xs.length - 1] - xs[0] : 0) + CW * h.scale + 0.2 + (h.drag.enabled ? h.drag.padding : 0) // Patch12: room to grab it
        );
        vL.set(h.offset[0] + hx, h.offset[1] - 0.02, h.offset[2] - 0.03);
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
          u.ql = null; // Patch9
          return;
        }
        inHand.add(m);
        const goal = vL.set(
          h.offset[0] + hx + xs[i],
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
        // Patch9: the card turns in camera space too, so an orbiting camera never leaves it tilted into the hand zone
        const tq = qA.setFromEuler(eT.set(Math.PI / 2 + h.tiltDeg * D2R, rot, 0, 'XYZ'));
        if (!u.ql) u.ql = camera.quaternion.clone().invert().multiply(m.quaternion);
        if (u.ql.angleTo(tq) > 0.002) {
          u.ql.slerp(tq, 0.25);
          busy = true;
        } else u.ql.copy(tq);
        m.quaternion.copy(camera.quaternion).multiply(u.ql);
        u.q3d = (u.q3d || new THREE.Quaternion()).copy(m.quaternion);
        onTop(m, true); // Patch9: hand cards are drawn over the board
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
      u.ql = null; // Patch9
      if (u.top9) onTop(m, false);
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
    for (const m of meshes.values()) if (m.userData.sword) swordPose(m, true); // Patch9: the swords stand above the characters, bigger
    if (flashing.size) {
      flashTick(now); // Patch9: the flying sword flashes
      busy = true;
    }
    for (const i of insts.values()) {
      if (i.card) i.root.position.set(i.card.position.x, i.card.position.y + 0.04, i.card.position.z);
      i.update(dt);
    }
    for (const i of dying) i.update(dt);
    if (insts.size || dying.size) busy = true; // characters always move a little (idle)
    if (CameraAnim3D.update(dt)) busy = true;
    return busy;
  }

  // ---- Patch9: hands on top, swords --------------------------------------------------------------------------------
  const HAND_LAYER = 1;
  scene.traverse(o => o.isLight && o.layers.enable(HAND_LAYER)); // the hands keep their light in their own pass
  ray.layers.enable(HAND_LAYER); // hand cards stay pickable
  tmpRay.layers.enable(HAND_LAYER);
  function onTop(o, v) {
    o.userData.top9 = v;
    o.traverse(x => x.layers.set(v ? HAND_LAYER : 0));
  }
  // two passes: the board, then (depth cleared) the hands, so a board card or zone near the camera never cuts a hand
  function render(r, sc, c) {
    if (!on || !applied) return false;
    c.layers.set(0);
    r.render(sc, c);
    const ac = r.autoClear;
    r.autoClear = false;
    r.clearDepth();
    c.layers.set(HAND_LAYER);
    const bg = sc.background;
    sc.background = null; // a colour background would clear the board pass
    r.render(sc, c);
    sc.background = bg;
    r.autoClear = ac;
    c.layers.set(0);
    return true;
  }
  const front = hs => hs.find(h => h.object.layers.mask === 1 << HAND_LAYER) || hs[0]; // a hand card in front is picked first
  function swordPose(m, v) {
    const sw = m.userData.sword;
    if (!sw) return;
    const b = sw.userData.b9 || (sw.userData.b9 = { y: sw.position.y, s: sw.scale.x });
    if (!v) {
      sw.position.y = b.y;
      sw.scale.setScalar(b.s);
      return;
    }
    const w = cfg.board.sword,
      k = b.s * w.scale;
    sw.position.y = w.height;
    sw.scale.set(k / (m.scale.x || 1), k, k / (m.scale.z || 1));
  }
  const flashing = new Set(),
    FLASH = new THREE.Color(0xfff0b0);
  // attackJob: the flying sword; returns its height
  function styleSword(sw) {
    if (!on || !applied) return 0.9;
    const w = cfg.board.sword;
    sw.scale.setScalar(w.scale);
    if (w.flash) {
      flashing.add(sw);
      ui.dirty = true;
    }
    return w.height;
  }
  function flashTick(now) {
    const k = 0.15 + 0.85 * Math.abs(Math.sin(now / 70));
    for (const sw of flashing) {
      if (!sw.parent) {
        flashing.delete(sw);
        continue;
      }
      sw.traverse(o => o.material && o.material.emissive && o.material.emissive.copy(FLASH).multiplyScalar(k));
    }
  }
  const playerZ = () => (on && applied ? layout.zBack + layout.zone.depth / 2 + 1.5 : 0); // where a hit on a player lands

  // ---- debug -----------------------------------------------------------------------------------------------------
  const debug = {
    play(cat, iid) {
      const list = iid != null ? [insts.get(iid)].filter(Boolean) : [...insts.values()];
      return list.map(i => i.play(cat));
    },
  };
  // Patch9: "3D demo" (a Vs self game with characters on both sides, side view on); console only since Patch10
  function demo() {
    if (typeof MenuUI === 'undefined' || typeof Tests === 'undefined') return;
    const de = document.getElementById('deckEditor');
    if (de && !de.hidden) DeckEditor.close();
    MenuUI.play({ mode: 'self', p1: 'Starter Aggro', p2: 'Starter Aggro', shuffle: false });
    for (const [p, id, col] of [
      ['Player', 'archer', 0],
      ['Player', 'shark', 2],
      ['Player', 'hummingbird', 4],
      ['Opponent', 'archer', 1],
      ['Opponent', 'shark', 3],
    ])
      try {
        Tests.ctx.take(sim, p, id, 'board', p + '|front|' + col);
      } catch (e) {} // a card the deck does not have
    game = sim;
    sync();
    if (!on) setTopView(false);
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
    onResize, // Patch12
    cameraMoved: () => manual,
    handGrab,
    handDrag,
    handRelease,
    get handOffset() {
      return clampHand('own');
    },
    get handOffsetFoe() {
      return clampHand('opponent'); // Patch13
    },
    grabRole, // Patch13
    handZone, // Patch12
    ownsCamera,
    sync: syncT,
    preFrame,
    postFrame,
    pickProxies,
    onAttack,
    render, // Patch9
    front,
    styleSword,
    playerZ,
    demo,
    reload: loadCfg,
    get configState() {
      return cfgState;
    },
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

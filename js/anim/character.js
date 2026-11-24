// character.js - Patch8: one animated character standing on a card (3D side view).
// root (placed on the card each frame) > mount (model offset, height, rotation, scale; faces the other side) > motion (the
// procedural clips move this) > model (the cloned GLB scene, or the placeholder cube). An invisible pick box on the root sends
// clicks to the card underneath. Animations: random per category without an immediate repeat, directional transitions
// (a transition clip, else the configured interpolation), loop / once / ping-pong, per-entry speed, cross-fades.
// Every file falls back on its own: no model = cube, no clip = the procedural clip of its category, no camera file = no camera move.
// Patch12: also the player avatars (js/avatar/): the categories, looping ones and the death category come from the normalized
// character (ch.categories / ch.looping / ch.die, the card ones by default); hooks.prepare(model) adjusts a loaded model (outfit),
// hooks.procClip(entry) gives the built-in clip of an entry; setOverlay(cat, on) plays a looping overlay (idle_wounded) over idle,
// on its own node (motion > overlay > model) so the two never fight over the same transform.
const Character3D = (function () {
  const D2R = Math.PI / 180,
    pickMat = new THREE.MeshBasicMaterial({ visible: false });
  let seq = 0;
  class Character {
    constructor(iid, ch, side, hooks) {
      this.iid = iid;
      this.ch = ch;
      this.side = side;
      this.hooks = hooks || {}; // { camera(camEntry, character) }
      this.root = new THREE.Object3D();
      this.root.name = 'char3d-' + iid + '-' + ++seq;
      this.mount = new THREE.Object3D();
      this.motion = new THREE.Object3D();
      this.motion.name = Procedural3D.MOTION;
      this.overlay = new THREE.Object3D(); // Patch12: the overlay clips (idle_wounded) move this one
      this.overlay.name = '__overlay';
      this.root.add(this.mount);
      this.mount.add(this.motion);
      this.motion.add(this.overlay);
      this.proxy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), pickMat);
      this.proxy.visible = false;
      this.proxy.userData.char3d = this;
      this.setProxyBox(new THREE.Box3(new THREE.Vector3(-0.45, 0, -0.45), new THREE.Vector3(0.45, 0.9, 0.45)));
      this.root.add(this.proxy);
      this.applyMount();
      this.clips = new Map(); // animation id -> clip that fits this model
      this.cams = new Map(); // camera file -> loaded camera asset
      this.last = {}; // category / transition / camera list -> last picked id
      this.fades = [];
      this.cur = null;
      this.ov = null; // Patch12: the overlay playing {cat, entry, action}
      this.ovWant = null; // the overlay category asked for (shown while the character idles)
      this.ready = false;
      this.dead = false;
      this.pending = null;
      this.ready$ = this.load();
    }
    setProxyBox(b) {
      const s = b.getSize(new THREE.Vector3()),
        c = b.getCenter(new THREE.Vector3());
      this.proxy.scale.set(Math.max(0.3, s.x), Math.max(0.3, s.y), Math.max(0.3, s.z));
      this.proxy.position.copy(c);
    }
    applyMount() {
      const m = this.ch.model,
        r = m.rotationDeg;
      this.mount.position.set(m.offset[0], m.offset[1] + m.heightOffset + (this.hooks.height || 0), m.offset[2]);
      this.mount.rotation.set(
        r[0] * D2R,
        r[1] * D2R + (m.faceOpponent && this.side === 'Player' ? Math.PI : 0),
        r[2] * D2R
      );
      this.mount.scale.fromArray(m.scale);
    }
    setSide(side) {
      if (side === this.side) return;
      this.side = side;
      this.applyMount();
    }
    async load() {
      const ch = this.ch;
      let src = ch.model.path ? await Assets3D.loadModel(ch.model.path) : null;
      if (this.dead) return;
      if (src && src.scene) {
        this.model = Assets3D.cloneScene(src.scene);
        this.cube = false;
      } else if (this.hooks.art && (this.model = this.hooks.art())) {
        this.cube = false; // Patch9: no model file (or a broken one): the card's own 3D art stands on the card
      } else {
        this.model = Procedural3D.makeCube(this.side); // missing / broken model: the placeholder cube
        this.cube = true;
      }
      if (this.hooks.prepare) this.hooks.prepare(this.model, !!(src && src.scene)); // Patch12: outfit meshes / materials
      this.overlay.add(this.model);
      const own = (src && src.clips) || [];
      const all = [];
      for (const cat of ch.categories || Anim3DLogic.CATEGORIES) all.push(...(ch.animations[cat] || []));
      for (const t of ch.transitions) all.push(...t.animations);
      await Promise.all(
        all
          .map(async a => {
            let clips = a.file ? await Assets3D.loadClips(a.file) : a.clip ? own : null;
            if (!clips || !clips.length) return; // no file, or it failed: the procedural clip plays instead
            const c = a.clip ? clips.find(x => x.name === a.clip) : clips[0];
            const fit = c && !this.cube ? Assets3D.fitClip(c, this.model) : null;
            if (fit) this.clips.set(a.id, fit);
            else if (c)
              console.warn(
                '[3D] ' + ch.name + ': animation "' + a.id + '" does not fit the model, procedural fallback'
              );
          })
          .concat(
            [].concat(...all.map(a => a.camera || [])).map(async c => {
              const asset = await Assets3D.loadCamera(c.file);
              if (asset) this.cams.set(c.file, asset);
            })
          )
      );
      if (this.dead) return;
      this.mixer = new THREE.AnimationMixer(this.mount);
      this.onFinished = e => this.finished(e.action);
      this.mixer.addEventListener('finished', this.onFinished);
      this.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(this.mount);
      if (!box.isEmpty()) {
        box.min.sub(this.root.position);
        box.max.sub(this.root.position);
        this.setProxyBox(box);
      }
      this.ready = true;
      this.play(this.pending || 'idle');
      this.pending = null;
    }
    // the clip of an animation entry: the loaded one, else the procedural one of its category
    clipOf(entry) {
      return (
        this.clips.get(entry.id) ||
        (this.hooks.procClip && this.hooks.procClip(entry, this)) ||
        Procedural3D.clipFor(entry.category, this.cube, this.side)
      );
    }
    get dieCat() {
      return this.ch.die || 'die'; // Patch12: avatars die with "dies"
    }
    play(cat) {
      if (cat === 'idle' && this.idleAs) cat = this.idleAs; // Patch9: while its Attack waits on the stack, "idle" means "attacking"
      if (this.dead || (this.dying && cat !== this.dieCat)) return null;
      if (!this.ready) {
        if (cat !== 'idle' || !this.pending) this.pending = cat;
        return null;
      }
      const entry = this.entryFor(cat);
      this.last[cat] = entry.id;
      this.transitionTo(entry);
      return entry.id;
    }
    // the entry a category plays: a random configured one (no immediate repeat), else the built-in one of the category
    entryFor(cat) {
      const list = Anim3DLogic.entriesFor(this.ch, cat),
        LOOP = this.ch.looping || Anim3DLogic.LOOPING;
      return list.length
        ? Anim3DLogic.pick(list, this.last[cat])
        : {
            id: '__proc_' + cat,
            category: cat,
            loop: LOOP[cat] ? 'repeat' : 'once',
            repetitions: Infinity,
            speed: this.ch.speed,
            then: cat === this.dieCat ? 'hold' : LOOP[cat] ? null : 'idle',
            camera: [],
            cameraChance: 0,
            procedural: null,
            weight: 1,
          };
    }
    // Patch12: a looping overlay (idle_wounded) over the idle animation: on = wanted; it shows while the character idles
    setOverlay(cat, on) {
      this.ovWant = on ? cat : null;
      this.syncOverlay();
    }
    syncOverlay() {
      if (!this.ready || !this.mixer) return;
      const idling = !!this.cur && this.cur.entry.category === 'idle',
        want = this.ovWant && idling && !this.dying ? this.ovWant : null,
        d = Math.max(0.05, this.ch.interpolation.duration);
      if (this.ov && this.ov.cat !== want) {
        this.ov.action.fadeOut(d);
        this.ov = null;
      }
      if (want && !this.ov) {
        const entry = this.entryFor(want);
        this.last[want] = entry.id;
        const act = this.mixer.clipAction(this.clipOf(entry));
        act.enabled = true;
        act.setLoop(THREE.LoopRepeat, Infinity);
        act.clampWhenFinished = false;
        act.timeScale = entry.speed;
        act.reset();
        act.setEffectiveWeight(entry.weight == null ? 1 : entry.weight);
        act.fadeIn(d);
        act.play();
        this.ov = { cat: want, entry, action: act };
      }
    }
    transitionTo(entry) {
      const from = this.cur ? this.cur.entry.id : null,
        tr = Anim3DLogic.findTransition(this.ch.transitions, from, entry.id),
        interp = tr ? tr.interpolation : this.ch.interpolation;
      if (tr && this.cur && tr.animations.length) {
        const key = 'tr|' + from + '>' + entry.id,
          ta = Anim3DLogic.pick(
            tr.animations.filter(a => this.clips.has(a.id)),
            this.last[key]
          ); // only a transition clip that loaded can play; otherwise the interpolation below is used
        if (ta) {
          this.last[key] = ta.id;
          const act = this.startAction(this.clips.get(ta.id), 'once', 1, ta.speed, interp);
          this.cur = { entry: { id: ta.id, category: 'transition', then: null }, action: act, next: entry, interp };
          return;
        }
      }
      this.begin(entry, interp);
    }
    begin(entry, interp) {
      const act = this.startAction(this.clipOf(entry), entry.loop, entry.repetitions, entry.speed, interp);
      this.cur = { entry, action: act };
      this.dieT = entry.category === this.dieCat ? 0 : null;
      this.syncOverlay(); // Patch12: the overlay follows idle
      // the camera animation is picked on its own, and starts in the same frame as the character animation
      if (entry.camera && entry.camera.length && Math.random() < entry.cameraChance && this.hooks.camera) {
        const ce = Anim3DLogic.pick(entry.camera, this.last['cam|' + entry.id]);
        if (ce) {
          this.last['cam|' + entry.id] = ce.id;
          this.hooks.camera(ce, this.cams.get(ce.file) || null, this);
        }
      }
    }
    startAction(clip, loop, reps, speed, interp) {
      const act = this.mixer.clipAction(clip),
        prev = this.cur && this.cur.action;
      act.enabled = true;
      act.setLoop(
        loop === 'once' ? THREE.LoopOnce : loop === 'pingpong' ? THREE.LoopPingPong : THREE.LoopRepeat,
        loop === 'once' ? 1 : reps
      );
      act.clampWhenFinished = loop === 'once';
      act.timeScale = speed;
      act.reset();
      act.setEffectiveWeight(1);
      this.fades = this.fades.filter(f => f.to !== act && f.from !== act);
      if (prev && prev !== act && !(this.ov && this.ov.action === prev)) {
        const d = interp.duration;
        if (interp.method === 'cut' || d <= 0) prev.stop();
        else if (interp.method === 'ease') {
          act.setEffectiveWeight(0);
          this.fades.push({ from: prev, to: act, t: 0, d, w0: prev.getEffectiveWeight() });
        } else act.crossFadeFrom(prev, d, interp.method === 'warp');
      }
      act.play();
      return act;
    }
    finished(action) {
      const cur = this.cur;
      if (!cur || cur.action !== action) return;
      if (cur.next) return this.begin(cur.next, cur.interp); // a transition clip ended: the target animation starts
      const then = cur.entry.then;
      if (cur.entry.category === this.dieCat) return this.dieDone();
      if (then && then !== 'hold') this.play(then);
    }
    // die: play it, then call back (the caller removes the character)
    die(done) {
      if (!this.ready) return done();
      this.dying = true;
      this.onDie = done;
      this.play(this.dieCat);
    }
    dieDone() {
      if (!this.onDie) return;
      const f = this.onDie;
      this.onDie = null;
      setTimeout(f, 250); // a short look at the last frame
    }
    update(dt) {
      if (!this.mixer) return;
      for (const f of this.fades) {
        f.t += dt;
        const k = Math.min(1, f.t / f.d),
          w = k * k * (3 - 2 * k); // smoothstep weights
        f.to.setEffectiveWeight(w);
        f.from.setEffectiveWeight(f.w0 * (1 - w));
        if (k >= 1) f.from.stop();
      }
      this.fades = this.fades.filter(f => f.t < f.d);
      this.mixer.update(dt);
      if (this.dieT != null && this.onDie) {
        this.dieT += dt;
        if (this.dieT > 6) this.dieDone(); // a die clip that never ends (looping by mistake) still ends
      }
    }
    dispose() {
      this.dead = true;
      if (this.mixer) {
        this.mixer.removeEventListener('finished', this.onFinished);
        this.mixer.stopAllAction();
        this.mixer.uncacheRoot(this.mount);
        this.mixer = null;
      }
      if (this.root.parent) this.root.parent.remove(this.root);
      this.proxy.geometry.dispose();
      if (this.model) {
        if (this.model.userData.dispose)
          this.model.userData.dispose(); // Patch9: the card art model frees its own parts too
        else this.model.traverse(o => o.isSkinnedMesh && o.skeleton && o.skeleton.dispose()); // geometry and materials stay shared in the cache
      }
      this.fades = [];
      this.cur = null;
      this.ov = null;
    }
  }
  return Character;
})();

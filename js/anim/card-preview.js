// card-preview.js - Patch10: the standalone 3D card preview (anim3d.html; index.html?anim3d opens it). Its own scene, camera,
// renderer and loop: nothing of the game is loaded (no Sim, no board, no game state). Pick a card in the list (or open
// anim3d.html?anim3d=<card id>): its 3D model is fetched (assets/3dModels/cards/index.json, CardModels) and shown on a pedestal,
// and the selection animation plays: the model's own "select" clip, else its scripted userData.select, else a procedural hop
// and spin. A card without a model (no entry, missing file, broken script) shows a placeholder slab in the card's colour and says why.
// Patch13: also the side view characters (config/characters.json, "Default cube" = the placeholder character) and the player
// avatars (config/avatars.json, every outfit), played by the game's own Character3D with the same hooks as the duel; an Animation
// list plays any category (random, as in the game) or one entry, and any clip of a card model. Ids: Anim3DLogic.parsePreviewId.
const CardPreview = (function () {
  const L = Anim3DLogic,
    SELECT_TIME = 0.9; // seconds of the procedural / scripted selection animation
  const el = id => document.getElementById(id);
  const canvasBox = el('pv-view'),
    list = el('pv-list'),
    search = el('pv-search'),
    status = el('pv-status'),
    replay = el('pv-replay'),
    animSel = el('pv-anim');
  // ---- the scene: everything here belongs to the preview only
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14161c);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
  camera.position.set(0, 1.9, 4.8);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  canvasBox.appendChild(renderer.domElement);
  const controls = THREE.OrbitControls ? new THREE.OrbitControls(camera, renderer.domElement) : null;
  if (controls) {
    controls.target.set(0, 0.7, 0);
    controls.update();
  }
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(3, 6, 4);
  scene.add(sun);
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.2, 0.12, 48),
    new THREE.MeshStandardMaterial({ color: 0x1d2741, roughness: 0.85 })
  );
  pedestal.position.y = -0.06;
  scene.add(pedestal);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.12, 1.22, 64),
    new THREE.MeshBasicMaterial({ color: 0xf3d27a, transparent: true, opacity: 0, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.005;
  scene.add(ring);
  const stage = new THREE.Group(); // the procedural selection animation moves this; the model sits inside
  scene.add(stage);
  function resize() {
    const w = canvasBox.clientWidth || 1,
      h = canvasBox.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  // ---- what is shown: a card model, or an animated character (side view character / avatar)
  let index = {},
    chars = null, // normalized config/characters.json
    avatars = null, // the avatar catalog (AvatarCatalog)
    cur = null, // { key, kind, holder, mixer, clips, clipAction, scripted, placeholder, inst }
    selT = -1, // seconds into the procedural / scripted selection animation (-1 = none)
    token = 0; // a newer selection makes an older load land nowhere
  const OVERLAY = typeof AvatarLogic !== 'undefined' ? AvatarLogic.OVERLAY : null;
  function placeholder(def) {
    const g = new THREE.Group(),
      color = new THREE.Color(typeof cardColor === 'function' ? cardColor(def) : '#3f7fd8'),
      m = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 1.26, 0.04),
        new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
      );
    m.position.y = 0.75;
    g.add(m);
    g.userData.dispose = () => {
      m.geometry.dispose();
      m.material.dispose();
    };
    return g;
  }
  function clear() {
    if (!cur) return;
    if (cur.mixer) cur.mixer.stopAllAction();
    if (cur.inst) cur.inst.dispose();
    stage.remove(cur.holder);
    if (!cur.inst)
      cur.holder.traverse(o => {
        if (o.userData && typeof o.userData.dispose === 'function') o.userData.dispose();
      });
    cur = null;
    selT = -1;
    stage.position.y = 0;
    stage.rotation.y = 0;
    stage.scale.setScalar(1);
    ring.material.opacity = 0;
  }
  // fit the model to about 1.4 m, feet on the pedestal
  function fit(holder) {
    const b = new THREE.Box3().setFromObject(holder);
    if (b.isEmpty()) return;
    const size = b.getSize(new THREE.Vector3()),
      k = 1.4 / Math.max(size.x, size.y, size.z, 0.001);
    if (k < 0.5 || k > 2) holder.scale.multiplyScalar(k);
    const b2 = new THREE.Box3().setFromObject(holder);
    holder.position.y -= b2.min.y;
  }
  function begin(key) {
    const my = ++token;
    list.querySelectorAll('button').forEach(b => {
      b.classList.toggle('sel', b.dataset.id === key);
      if (b.dataset.id === key && b.scrollIntoView) b.scrollIntoView({ block: 'nearest' });
    });
    if (history.replaceState) history.replaceState(null, '', '?anim3d=' + encodeURIComponent(key));
    return my;
  }
  function select(key) {
    const p = L.parsePreviewId(key);
    if (!p) return;
    if (p.kind === 'char') return selectChar(p.id);
    if (p.kind === 'avatar') return selectAvatar(p.id, p.outfit);
    return selectCard(p.id);
  }
  // ---- a card's 3D model (Patch10)
  function selectCard(id) {
    const def = Cards.list.find(d => d.id === id) || null;
    if (!def) {
      status.textContent = 'No card with the id "' + id + '".';
      return;
    }
    const my = begin(id),
      entry = L.cardModelEntry(index, id);
    status.textContent = def.name + ': loading…';
    CardModels.load(entry).then(r => {
      if (my !== token) return; // another item was picked meanwhile
      clear();
      const why =
        entry.type === 'none'
          ? entry.problems.length
            ? 'model entry ignored (' + entry.problems.join(', ') + ')'
            : 'no 3D model in ' + CardModels.INDEX
          : !r
            ? 'the model could not be loaded (' + entry.path + '), see the console'
            : '';
      const holder = r ? r.holder : placeholder(def);
      stage.add(holder);
      fit(holder);
      cur = { key: id, kind: 'card', holder, placeholder: !r, mixer: null, clips: [], clipAction: null };
      let selName = null;
      if (r && r.clips.length) {
        cur.mixer = new THREE.AnimationMixer(r.object);
        cur.clips = r.clips;
        selName = L.selectClipName(
          entry,
          r.clips.map(c => c.name)
        );
        if (selName) cur.clipAction = onceAction(r.clips.find(c => c.name === selName));
      }
      cur.scripted = !!(r && typeof r.object.userData.select === 'function');
      fillAnims(
        L.clipAnimOptions(
          cur.clips.map(c => c.name),
          selName
        )
      );
      status.textContent =
        def.name +
        (why
          ? ': placeholder shown, ' + why
          : ' · ' + (r.kind === 'gltf' ? 'GLB / glTF' : 'script') + ' model' + ' · selection: ' + animName());
      playSelect();
    });
  }
  function onceAction(clip) {
    const a = cur.mixer.clipAction(clip);
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    return a;
  }
  const animName = () =>
    cur.clipAction ? 'clip "' + cur.clipAction.getClip().name + '"' : cur.scripted ? 'scripted' : 'procedural';
  function playSelect() {
    if (!cur || cur.kind !== 'card') return;
    if (cur.mixer) cur.mixer.stopAllAction();
    if (cur.clipAction) cur.clipAction.reset().play();
    selT = 0; // the ring flash (and the procedural / scripted motion) runs in every case
  }
  // ---- Patch13: an animated character, by the game's own controller (Character3D)
  function showCharacter(key, ch, hooks, label) {
    const my = begin(key);
    clear();
    status.textContent = label + ': loading…';
    hooks = Object.assign({}, hooks);
    let built = false; // the avatar's placeholder body stood in (no GLB, or it failed)
    if (hooks.art) {
      const art = hooks.art;
      hooks.art = () => ((built = true), art());
    }
    const inst = new Character3D('preview', ch, 'Player', hooks),
      holder = new THREE.Group();
    // the game turns a character that faces its opponent half way round on the Player's side: turn it back to face the camera
    holder.rotation.y = ch.model && ch.model.faceOpponent ? Math.PI : 0;
    holder.add(inst.root);
    stage.add(holder);
    cur = { key, kind: 'character', holder, inst, ch, label };
    fillAnims(L.characterAnimOptions(ch, hooks.overlay ? OVERLAY : null));
    inst.ready$.then(() => {
      if (my !== token || !cur || cur.inst !== inst) return;
      fit(holder);
      status.textContent =
        label +
        ' · ' +
        (inst.cube
          ? 'placeholder cube' + (ch.model.path ? ' (' + ch.model.path + ' not loaded)' : '')
          : built
            ? 'placeholder body' + (ch.model.path ? ' (' + ch.model.path + ' not loaded)' : '')
            : 'model ' + ch.model.path) +
        ' · ' +
        inst.clips.size +
        ' animation file(s) loaded, the rest built-in';
      playAnim(animSel.value);
    });
  }
  function selectChar(name) {
    const ch = chars && chars.characters[name];
    if (!ch) {
      status.textContent = chars ? 'No character "' + name + '" in config/characters.json.' : 'Loading…';
      return;
    }
    showCharacter('char:' + name, ch, {}, name === 'placeholder' ? 'Default cube (placeholder)' : 'Character ' + name);
  }
  function selectAvatar(cid, oid) {
    const cat = avatars;
    const c = cat && cat.byId[cid];
    if (!c) {
      status.textContent = cat ? 'No avatar "' + cid + '" in config/avatars.json.' : 'Loading…';
      return;
    }
    const sel = { character: cid, outfit: oid && c.outfits.some(o => o.id === oid) ? oid : c.defaultOutfit },
      ch = AvatarLogic.resolve(cat, sel);
    // the same hooks as the duel (js/avatar/avatar-view.js)
    showCharacter(
      'avatar:' + sel.character + '/' + sel.outfit,
      ch,
      {
        overlay: true,
        art: () => AvatarModels.build(ch.character.body),
        prepare: (model, isGLB) => AvatarModels.applyOutfit(model, ch.outfit, isGLB),
        procClip: (entry, inst) =>
          AvatarModels.procClip(entry.procedural, entry.category, AvatarModels.hasLimbs(inst.model)),
      },
      'Avatar ' + c.name + ' · ' + ch.outfit.name
    );
  }
  // ---- the Animation list
  function fillAnims(opts) {
    animSel.textContent = '';
    let grp = null,
      gName = null;
    for (const o of opts) {
      if (o.group !== gName) {
        gName = o.group;
        grp = document.createElement('optgroup');
        grp.label = o.group;
        animSel.appendChild(grp);
      }
      const op = document.createElement('option');
      op.value = o.value;
      op.textContent = o.label.trim();
      grp.appendChild(op);
    }
    const idle = opts.find(o => o.value === 'cat:idle');
    animSel.value = idle ? idle.value : opts.length ? opts[0].value : '';
    animSel.disabled = !opts.length;
  }
  function playAnim(v) {
    if (!cur) return;
    const a = L.parseAnimOption(v);
    if (cur.kind === 'card') {
      if (a.kind !== 'clip') return playSelect();
      const clip = cur.clips.find(c => c.name === a.name);
      if (!clip) return;
      cur.mixer.stopAllAction();
      onceAction(clip).reset().play();
      return;
    }
    const inst = cur.inst;
    if (!inst.ready) return;
    inst.dying = false;
    if (a.kind === 'select') return;
    if (a.cat === OVERLAY && cur.ch.categories && cur.ch.categories.includes(OVERLAY)) {
      // the overlay plays over idle, as in the duel (life under half)
      inst.setOverlay(OVERLAY, true);
      inst.play('idle');
      return;
    }
    inst.setOverlay(OVERLAY, false);
    if (a.kind === 'cat') return inst.play(a.cat);
    const entry = L.entriesFor(cur.ch, a.cat).find(e => e.id === a.id);
    if (!entry) return;
    inst.last[a.cat] = entry.id;
    inst.transitionTo(entry);
  }
  animSel.onchange = () => playAnim(animSel.value);
  // ---- the loop (only this page's scene)
  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, clock.getDelta());
    if (cur && cur.mixer) cur.mixer.update(dt);
    if (cur && cur.inst) cur.inst.update(dt);
    if (selT >= 0 && cur && cur.kind === 'card') {
      selT += dt;
      const t = Math.min(1, selT / SELECT_TIME),
        k = Math.sin(Math.PI * t);
      ring.material.opacity = 0.9 * k;
      if (cur.scripted) cur.holder.children[0].userData.select(t);
      else if (!cur.clipAction) {
        stage.position.y = 0.35 * k; // hop
        stage.rotation.y = 2 * Math.PI * (t * t * (3 - 2 * t)); // one smooth turn
        stage.scale.setScalar(1 + 0.12 * k);
      }
      if (t >= 1) {
        selT = -1;
        stage.position.y = 0;
        stage.rotation.y = 0;
        stage.scale.setScalar(1);
        ring.material.opacity = 0;
      }
    }
    if (controls) controls.update();
    renderer.render(scene, camera);
  }
  // ---- the list: cards, side view characters (the default cube first), avatars (every outfit)
  function heading(t) {
    const h = document.createElement('div');
    h.className = 'pv-h';
    h.textContent = t;
    list.appendChild(h);
  }
  function item(key, text, title) {
    const b = document.createElement('button');
    b.dataset.id = key;
    b.textContent = text;
    b.title = title || '';
    b.className = cur && cur.key === key ? 'sel' : '';
    b.onclick = () => select(key);
    list.appendChild(b);
  }
  function fill() {
    const q = search.value.trim().toLowerCase(),
      hit = (...t) => !q || t.some(x => String(x).toLowerCase().includes(q));
    list.textContent = '';
    const cards = Cards.list.filter(d => hit(d.name, d.id));
    if (cards.length) heading('Cards');
    for (const d of cards) {
      const e = L.cardModelEntry(index, d.id);
      item(
        d.id,
        d.name + (e.type === 'none' ? '' : ' ◆'),
        e.type === 'none' ? 'No 3D model (placeholder)' : e.type + ': ' + e.path
      );
    }
    if (chars) {
      const names = Object.keys(chars.characters).sort((a, b) =>
        a === 'placeholder' ? -1 : b === 'placeholder' ? 1 : 0
      );
      const shown = names.filter(n => hit(n, n === 'placeholder' ? 'default cube' : ''));
      if (shown.length) heading('Side view characters');
      for (const n of shown) {
        const used = Object.keys(chars.cards).filter(c => chars.cards[c] === n);
        item(
          'char:' + n,
          n === 'placeholder' ? 'Default cube' : n,
          (n === chars.default
            ? 'every creature without its own character'
            : used.length
              ? 'cards: ' + used.join(', ')
              : 'not used by a card') +
            (chars.characters[n].model.path ? ' · ' + chars.characters[n].model.path : ' · no model (cube)')
        );
      }
    }
    if (avatars && avatars.characters.length) {
      const rows = [];
      for (const c of avatars.characters)
        for (const o of c.outfits) if (hit(c.name, o.name, 'avatar')) rows.push([c, o]);
      if (rows.length) heading('Avatars');
      for (const [c, o] of rows)
        item('avatar:' + c.id + '/' + o.id, c.name + ' · ' + o.name, o.model || c.model || 'placeholder body');
    }
  }
  search.oninput = fill;
  replay.onclick = () => playAnim(animSel.value);
  resize();
  frame();
  const getJSON = url =>
    fetch(url, { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .catch(e => {
        console.warn('[preview] ' + url + ' not loaded (' + e.message + ')');
        return {};
      });
  Promise.all([
    CardModels.loadIndex(),
    getJSON('config/characters.json'),
    typeof AvatarCatalog !== 'undefined' ? AvatarCatalog.ready : Promise.resolve(null),
  ]).then(([j, c, a]) => {
    index = j || {};
    chars = L.normalizeCharacters(c);
    for (const e of chars.errors) console.warn('[3D] characters.json: ' + e);
    avatars = a || null;
    fill();
    const m = /[?&]anim3d=([^&#]+)/.exec(location.search),
      first = m
        ? decodeURIComponent(m[1])
        : (Cards.list.find(d => L.cardModelEntry(index, d.id).type !== 'none') || Cards.list[0]).id;
    select(first);
  });
  return { select, play: playAnim, replay: () => playAnim(animSel.value), scene, current: () => cur };
})();

// card-preview.js - Patch10: the standalone 3D card preview (anim3d.html; index.html?anim3d opens it). Its own scene, camera,
// renderer and loop: nothing of the game is loaded (no Sim, no board, no game state). Pick a card in the list (or open
// anim3d.html?anim3d=<card id>): its 3D model is fetched (assets/3dModels/cards/index.json, CardModels) and shown on a pedestal,
// and the selection animation plays: the model's own "select" clip, else its scripted userData.select, else a procedural hop
// and spin. A card without a model (no entry, missing file, broken script) shows a placeholder slab in the card's colour and says why.
const CardPreview = (function () {
  const L = Anim3DLogic,
    SELECT_TIME = 0.9; // seconds of the procedural / scripted selection animation
  const el = id => document.getElementById(id);
  const canvasBox = el('pv-view'),
    list = el('pv-list'),
    search = el('pv-search'),
    status = el('pv-status'),
    replay = el('pv-replay');
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
  // ---- the shown model
  let index = {},
    cur = null, // { id, entry, holder, mixer, clipAction, scripted, placeholder }
    selT = -1, // seconds into the procedural / scripted selection animation (-1 = none)
    token = 0; // a newer selection makes an older load land nowhere
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
    stage.remove(cur.holder);
    cur.holder.traverse(o => {
      if (o.userData && typeof o.userData.dispose === 'function') o.userData.dispose();
    });
    cur = null;
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
  function select(id) {
    const def = Cards.list.find(d => d.id === id) || null;
    if (!def) {
      status.textContent = 'No card with the id "' + id + '".';
      return;
    }
    const my = ++token,
      entry = L.cardModelEntry(index, id);
    list.querySelectorAll('button').forEach(b => b.classList.toggle('sel', b.dataset.id === id));
    status.textContent = def.name + ': loading…';
    if (history.replaceState) history.replaceState(null, '', '?anim3d=' + encodeURIComponent(id));
    CardModels.load(entry).then(r => {
      if (my !== token) return; // another card was picked meanwhile
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
      cur = { id, entry, holder, placeholder: !r, mixer: null, clipAction: null };
      if (r && r.clips.length) {
        const name = L.selectClipName(
          entry,
          r.clips.map(c => c.name)
        );
        if (name) {
          cur.mixer = new THREE.AnimationMixer(r.object);
          cur.clipAction = cur.mixer.clipAction(r.clips.find(c => c.name === name));
          cur.clipAction.setLoop(THREE.LoopOnce, 1);
          cur.clipAction.clampWhenFinished = true;
        }
      }
      cur.scripted = !!(r && typeof r.object.userData.select === 'function');
      status.textContent =
        def.name +
        (why
          ? ': placeholder shown, ' + why
          : ' · ' + (r.kind === 'gltf' ? 'GLB / glTF' : 'script') + ' model' + ' · selection: ' + animName());
      playSelect();
    });
  }
  const animName = () =>
    cur.clipAction ? 'clip "' + cur.clipAction.getClip().name + '"' : cur.scripted ? 'scripted' : 'procedural';
  function playSelect() {
    if (!cur) return;
    if (cur.clipAction) cur.clipAction.reset().play();
    selT = 0; // the ring flash (and the procedural / scripted motion) runs in every case
  }
  // ---- the loop (only this page's scene)
  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, clock.getDelta());
    if (cur && cur.mixer) cur.mixer.update(dt);
    if (selT >= 0) {
      selT += dt;
      const t = Math.min(1, selT / SELECT_TIME),
        k = Math.sin(Math.PI * t);
      ring.material.opacity = 0.9 * k;
      if (cur && cur.scripted) cur.holder.children[0].userData.select(t);
      else if (cur && !cur.clipAction) {
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
  // ---- the card list
  function fill() {
    const q = search.value.trim().toLowerCase();
    list.textContent = '';
    for (const d of Cards.list) {
      if (q && !d.name.toLowerCase().includes(q) && !d.id.includes(q)) continue;
      const b = document.createElement('button'),
        e = L.cardModelEntry(index, d.id);
      b.dataset.id = d.id;
      b.textContent = d.name + (e.type === 'none' ? '' : ' ◆');
      b.title = e.type === 'none' ? 'No 3D model (placeholder)' : e.type + ': ' + e.path;
      b.className = cur && cur.id === d.id ? 'sel' : '';
      b.onclick = () => select(d.id);
      list.appendChild(b);
    }
  }
  search.oninput = fill;
  replay.onclick = playSelect;
  resize();
  frame();
  CardModels.loadIndex().then(j => {
    index = j || {};
    fill();
    const m = /[?&]anim3d=([^&#]+)/.exec(location.search),
      first = m
        ? decodeURIComponent(m[1])
        : (Cards.list.find(d => L.cardModelEntry(index, d.id).type !== 'none') || Cards.list[0]).id;
    select(first);
  });
  return { select, replay: playSelect, scene, current: () => cur };
})();

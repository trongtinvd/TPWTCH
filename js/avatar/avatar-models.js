// avatar-models.js - the avatar models. A character without a GLB gets a placeholder humanoid built from its "body"
// (config/avatars.json): named pivots Torso, Head, ArmL, ArmR, LegL, LegR (feet on y = 0, facing +z) and named parts. An outfit is
// applied the same way to a placeholder or to a loaded GLB: materials by name, nodes shown / hidden by name, extra parts attached to a
// node by name. The built-in ("procedural") avatar clips are here too; a GLB without limbs gets only their whole-body tracks.
const AvatarModels = (function () {
  const D2R = Math.PI / 180;
  const DEFAULT_MAT = {
    Body: '#8a8f9c',
    Skin: '#e8c9a8',
    Limbs: '#555a66',
    Trim: '#c9a54a',
    Accent: '#c9a54a',
    Hair: '#4a3a2a',
    Eyes: '#151515',
  };
  // one geometry per shape, centred, with its bounding box size (a part is scaled to its "size" = bounding box [w, h, d])
  const GEO = {};
  function geo(shape) {
    if (GEO[shape]) return GEO[shape];
    let g;
    if (shape === 'sphere') g = new THREE.SphereGeometry(0.5, 20, 14);
    else if (shape === 'cylinder') g = new THREE.CylinderGeometry(0.5, 0.5, 1, 18);
    else if (shape === 'cone') g = new THREE.ConeGeometry(0.5, 1, 18);
    else if (shape === 'torus') g = new THREE.TorusGeometry(0.36, 0.14, 10, 24).rotateX(Math.PI / 2);
    else if (shape === 'octahedron') g = new THREE.OctahedronGeometry(0.5);
    else if (shape === 'dodecahedron') g = new THREE.DodecahedronGeometry(0.5);
    else g = new THREE.BoxGeometry(1, 1, 1);
    g.computeBoundingBox();
    const s = g.boundingBox.getSize(new THREE.Vector3());
    g.translate(...g.boundingBox.getCenter(new THREE.Vector3()).multiplyScalar(-1).toArray());
    return (GEO[shape] = { g, s });
  }
  const sized = (shape, size) => {
    const { s } = geo(shape),
      w = size[0] || 0.2,
      h = size[1] != null ? size[1] : w,
      d = size[2] != null ? size[2] : w;
    return [w / s.x, h / s.y, d / s.z];
  };
  function setMat(m, spec) {
    if (!spec) return;
    if (spec.color) m.color.set(spec.color);
    if (spec.emissive && m.emissive) m.emissive.set(spec.emissive);
    if (spec.metalness != null && 'metalness' in m) m.metalness = spec.metalness;
    if (spec.roughness != null && 'roughness' in m) m.roughness = spec.roughness;
    m.needsUpdate = true;
  }
  function mesh(shape, size, mat, name) {
    const m = new THREE.Mesh(geo(shape).g, mat);
    m.scale.fromArray(sized(shape, size));
    m.name = name;
    return m;
  }
  // the materials of a placeholder: one per name, shared by its parts (an outfit recolours all of them at once)
  function matOf(root, name) {
    const mats = root.userData.mats;
    if (!mats[name]) {
      mats[name] = new THREE.MeshStandardMaterial({
        color: DEFAULT_MAT[name] || '#c9c9c9',
        roughness: 0.65,
        metalness: 0.05,
      });
      mats[name].name = name;
    }
    return mats[name];
  }
  function addPart(root, p) {
    const at = root.getObjectByName(p.attach) || root,
      m = mesh(p.shape, p.size, matOf(root, p.material), p.name);
    m.position.fromArray(p.at);
    m.rotation.set(p.rotationDeg[0] * D2R, p.rotationDeg[1] * D2R, p.rotationDeg[2] * D2R);
    m.visible = !p.hidden;
    at.add(m);
    return m;
  }
  // the placeholder humanoid of a character (normalised "body", AvatarLogic)
  function build(body) {
    const root = new THREE.Group();
    root.name = '__avatar';
    root.userData.mats = {};
    root.userData.placeholderAvatar = true;
    for (const [k, v] of Object.entries(body.materials)) setMat(matOf(root, k), v);
    const T = body.torso.size,
      H = body.head.size,
      L = body.legs.length,
      lt = body.legs.thickness,
      A = body.arms.length,
      at = body.arms.thickness;
    const node = (name, x, y, z, parent) => {
      const n = new THREE.Object3D();
      n.name = name;
      n.position.set(x, y, z);
      (parent || root).add(n);
      return n;
    };
    for (const [n, s] of [
      ['LegL', -1],
      ['LegR', 1],
    ]) {
      const leg = node(n, s * Math.min(T[0] * 0.24, 0.2), L, 0);
      const lm = mesh('box', [lt, L, lt], matOf(root, 'Limbs'), n + 'Mesh');
      lm.position.set(0, -L / 2, 0);
      leg.add(lm);
    }
    const torso = node('Torso', 0, L, 0);
    const tm = mesh(body.torso.shape, T, matOf(root, 'Body'), 'TorsoMesh');
    tm.position.y = T[1] / 2;
    torso.add(tm);
    const head = node('Head', 0, T[1] * 0.98, 0, torso);
    const hm = mesh(body.head.shape, H, matOf(root, 'Skin'), 'HeadMesh');
    hm.position.y = H[1] / 2 + 0.02;
    head.add(hm);
    if (body.eyes)
      for (const s of [-1, 1]) {
        const e = mesh('sphere', [0.07, 0.07, 0.04], matOf(root, 'Eyes'), s < 0 ? 'EyeL' : 'EyeR');
        e.position.set(s * H[0] * 0.2, H[1] * 0.58, H[2] / 2 - (body.head.shape === 'box' ? -0.005 : 0.02));
        head.add(e);
      }
    const sx = (T[0] / 2) * (body.torso.shape === 'box' ? 1 : 0.8) + at / 2;
    for (const [n, s] of [
      ['ArmL', -1],
      ['ArmR', 1],
    ]) {
      const arm = node(n, s * sx, T[1] * 0.9, 0, torso);
      const am = mesh('box', [at, A, at], matOf(root, 'Limbs'), n + 'Mesh'),
        hand = mesh('sphere', [at * 1.35, at * 1.35, at * 1.35], matOf(root, 'Skin'), n + 'Hand');
      am.position.set(0, -A / 2, 0);
      hand.position.set(0, -A, 0);
      arm.add(am, hand);
    }
    for (const p of body.parts) addPart(root, p);
    root.userData.dispose = () => Object.values(root.userData.mats).forEach(m => m.dispose());
    return root;
  }
  // an outfit on any model (placeholder or GLB): materials by name, nodes shown / hidden by name, extra parts
  function applyOutfit(model, outfit, isGLB) {
    if (!outfit) return model;
    if (isGLB) {
      // the GLB's materials are shared with the loader cache: recolour copies, one per name, owned by this model
      const own = {};
      model.traverse(o => {
        if (!o.isMesh) return;
        const one = m => {
          if (!m || !outfit.materials[m.name]) return m;
          if (!own[m.name]) setMat((own[m.name] = m.clone()), outfit.materials[m.name]);
          return own[m.name];
        };
        o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
      });
      model.userData.mats = Object.assign(model.userData.mats || {}, own);
      model.userData.dispose = () => {
        Object.values(model.userData.mats || {}).forEach(m => m.dispose()); // the recoloured copies and the outfit's parts
        model.traverse(o => o.isSkinnedMesh && o.skeleton && o.skeleton.dispose());
      };
    } else for (const [k, v] of Object.entries(outfit.materials)) setMat(matOf(model, k), v);
    if (!model.userData.mats) model.userData.mats = {};
    for (const p of outfit.parts) addPart(model, p);
    const vis = (names, v) =>
      names.forEach(n => {
        let hit = false;
        model.traverse(o => {
          if (o.name === n) {
            o.visible = v;
            hit = true;
          }
        });
        if (!hit) console.warn('[avatar] outfit "' + outfit.id + '": no node named "' + n + '" in the model');
      });
    vis(outfit.meshes.show, true);
    vis(outfit.meshes.hide, false);
    return model;
  }

  // ---- built-in clips -------------------------------------------------------------------------------------------
  // per node: [[t, {p: [x, y, z], r: [x, y, z] degrees, s: [x, y, z]}], ...]. Only the properties a node's keys name get a track,
  // so a limb only turns (its pivot never moves). __motion = the whole body, __overlay = the overlay layer (idle_wounded).
  const M = '__motion',
    O = '__overlay';
  const mirror = keys => keys.map(([t, k]) => [t, Object.assign({}, k, k.r ? { r: [k.r[0], -k.r[1], -k.r[2]] } : {})]);
  const armSwing = (a, b, T) => [
    [0, { r: [0, 0, a] }],
    [T / 2, { r: [0, 0, b] }],
    [T, { r: [0, 0, a] }],
  ];
  const VARIANTS = {
    // enter
    drop: {
      [M]: [
        [0, { p: [0, 2.2, 0], s: [0.6, 1.3, 0.6] }],
        [0.35, { p: [0, 0, 0], s: [1.2, 0.75, 1.2] }],
        [0.5, { s: [0.92, 1.1, 0.92] }],
        [0.7, { p: [0, 0, 0], s: [1, 1, 1] }],
      ],
      ArmL: [
        [0, { r: [0, 0, -150] }],
        [0.35, { r: [0, 0, -40] }],
        [0.7, { r: [0, 0, 0] }],
      ],
      ArmR: mirror([
        [0, { r: [0, 0, -150] }],
        [0.35, { r: [0, 0, -40] }],
        [0.7, { r: [0, 0, 0] }],
      ]),
    },
    spin_in: {
      [M]: [0, 1, 2, 3, 4, 5, 6]
        .map(i => [
          i * 0.1,
          { r: [0, -540 + i * 90, 0], s: [Math.max(0.02, i / 6), Math.max(0.02, i / 6), Math.max(0.02, i / 6)] },
        ])
        .concat([[0.8, { r: [0, 0, 0], s: [1, 1, 1] }]]),
    },
    boot: {
      [M]: [
        [0, { s: [1, 0.05, 1] }],
        [0.3, { s: [1, 1.15, 1] }],
        [0.45, { s: [1, 0.95, 1] }],
        [0.6, { s: [1, 1, 1] }],
      ],
      Head: [
        [0, { r: [0, 0, 0] }],
        [0.6, { r: [0, 25, 0] }],
        [0.8, { r: [0, -25, 0] }],
        [1.0, { r: [0, 0, 0] }],
      ],
    },
    // idle (loops)
    breathe: {
      [M]: [
        [0, { p: [0, 0, 0], s: [1, 1, 1] }],
        [1.2, { p: [0, 0.025, 0], s: [1.015, 1.02, 1.015] }],
        [2.4, { p: [0, 0, 0], s: [1, 1, 1] }],
      ],
      ArmL: armSwing(-4, -9, 2.4),
      ArmR: armSwing(4, 9, 2.4),
    },
    sway: {
      [M]: [
        [0, { r: [0, 0, -3] }],
        [1.6, { r: [0, 0, 3] }],
        [3.2, { r: [0, 0, -3] }],
      ],
      Head: [
        [0, { r: [0, -12, 0] }],
        [1.6, { r: [0, 12, 0] }],
        [3.2, { r: [0, -12, 0] }],
      ],
      ArmL: armSwing(-3, -6, 3.2),
      ArmR: armSwing(3, 6, 3.2),
    },
    hover: {
      [M]: [
        [0, { p: [0, 0.08, 0], r: [0, -5, 0] }],
        [1, { p: [0, 0.18, 0], r: [0, 5, 0] }],
        [2, { p: [0, 0.08, 0], r: [0, -5, 0] }],
      ],
      ArmL: [
        [0, { r: [5, 0, -6] }],
        [1, { r: [-5, 0, -6] }],
        [2, { r: [5, 0, -6] }],
      ],
      ArmR: [
        [0, { r: [-5, 0, 6] }],
        [1, { r: [5, 0, 6] }],
        [2, { r: [-5, 0, 6] }],
      ],
    },
    // idle_wounded overlays (their own node: they add to idle)
    slump: {
      [O]: [
        [0, { p: [0, -0.06, 0], r: [14, 0, -3] }],
        [1.4, { p: [0, -0.09, 0], r: [19, 0, 3] }],
        [2.8, { p: [0, -0.06, 0], r: [14, 0, -3] }],
      ],
    },
    glitch: {
      [O]: [
        [0, { p: [0, 0, 0], r: [8, 0, 0] }],
        [0.08, { p: [0.04, 0, 0], r: [8, 0, 7] }],
        [0.16, { p: [-0.04, 0, 0], r: [9, 0, -5] }],
        [0.3, { p: [0, 0, 0], r: [10, 0, 0] }],
        [1.4, { p: [0, 0, 0], r: [8, 0, 0] }],
      ],
    },
    // dies (held on the last frame)
    fall: {
      [M]: [
        [0, { p: [0, 0, 0], r: [0, 0, 0] }],
        [0.25, { p: [0, 0.12, 0], r: [10, 0, 0] }],
        [0.8, { p: [0, 0.2, -0.4], r: [-85, 0, 0] }],
        [1.0, { p: [0, 0.2, -0.5], r: [-90, 0, 0] }],
      ],
      ArmL: [
        [0, { r: [0, 0, 0] }],
        [0.8, { r: [0, 0, -80] }],
      ],
      ArmR: mirror([
        [0, { r: [0, 0, 0] }],
        [0.8, { r: [0, 0, -80] }],
      ]),
    },
    kneel: {
      [M]: [
        [0, { p: [0, 0, 0], r: [0, 0, 0] }],
        [0.5, { p: [0, -0.3, 0], r: [22, 0, 0] }],
        [1.0, { p: [0, -0.3, 0], r: [25, 0, 0] }],
        [1.5, { p: [0, 0.15, 0.3], r: [88, 0, 10] }],
      ],
      LegL: [
        [0, { r: [0, 0, 0] }],
        [0.5, { r: [-75, 0, 0] }],
      ],
      LegR: [
        [0, { r: [0, 0, 0] }],
        [0.5, { r: [-75, 0, 0] }],
      ],
      Head: [
        [0, { r: [0, 0, 0] }],
        [1.0, { r: [30, 0, 0] }],
      ],
    },
    shutdown: {
      [M]: [
        [0, { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] }],
        [0.5, { s: [1, 0.92, 1] }],
        [1.0, { p: [0, 0.05, 0], r: [0, 0, 40] }],
        [1.4, { p: [0, 0.25, 0], r: [0, 0, 90], s: [1, 0.92, 1] }],
      ],
      Head: [
        [0, { r: [0, 0, 0] }],
        [0.5, { r: [40, 0, 0] }],
      ],
    },
    // playing_card
    cast: {
      [M]: [
        [0, { p: [0, 0, 0], r: [0, 0, 0] }],
        [0.25, { r: [-6, 0, 0] }],
        [0.5, { p: [0, 0, 0.08], r: [8, 0, 0] }],
        [0.9, { p: [0, 0, 0], r: [0, 0, 0] }],
      ],
      ArmR: [
        [0, { r: [0, 0, 0] }],
        [0.25, { r: [-160, 0, 0] }],
        [0.5, { r: [-100, 0, 0] }],
        [0.9, { r: [0, 0, 0] }],
      ],
    },
    throw: {
      [M]: [
        [0, { r: [0, 0, 0] }],
        [0.3, { r: [0, 25, 0] }],
        [0.45, { r: [0, -20, 0] }],
        [0.9, { r: [0, 0, 0] }],
      ],
      ArmR: [
        [0, { r: [0, 0, 0] }],
        [0.3, { r: [60, 0, 0] }],
        [0.45, { r: [-120, 0, 0] }],
        [0.9, { r: [0, 0, 0] }],
      ],
    },
  };
  const BY_CATEGORY = { enter: 'drop', idle: 'breathe', idle_wounded: 'slump', dies: 'fall', playing_card: 'cast' };
  const q = new THREE.Quaternion(),
    e = new THREE.Euler();
  function tracksOf(node, keys) {
    const T = keys.map(k => k[0]),
      out = [];
    for (const [prop, kind] of [
      ['p', 'position'],
      ['r', 'quaternion'],
      ['s', 'scale'],
    ]) {
      if (!keys.some(k => k[1][prop])) continue;
      const vals = [];
      let last = prop === 's' ? [1, 1, 1] : [0, 0, 0];
      for (const [, k] of keys) {
        last = k[prop] || last;
        if (prop === 'r') {
          e.set(last[0] * D2R, last[1] * D2R, last[2] * D2R);
          q.setFromEuler(e);
          vals.push(q.x, q.y, q.z, q.w);
        } else vals.push(...last);
      }
      out.push(
        prop === 'r'
          ? new THREE.QuaternionKeyframeTrack(node + '.' + kind, T, vals)
          : new THREE.VectorKeyframeTrack(node + '.' + kind, T, vals)
      );
    }
    return out;
  }
  const cache = {};
  // the clip of a built-in variant (falls back on the category's own); limbs = the model has the placeholder pivots
  function procClip(variant, category, limbs) {
    const name = VARIANTS[variant] ? variant : BY_CATEGORY[category] || 'breathe',
      key = name + (limbs ? '|limbs' : '|body');
    if (cache[key]) return cache[key];
    const def = VARIANTS[name],
      tracks = [];
    let dur = 0;
    for (const [node, keys] of Object.entries(def)) {
      if (!limbs && node !== M && node !== O) continue;
      dur = Math.max(dur, keys[keys.length - 1][0]);
      tracks.push(...tracksOf(node, keys));
    }
    return (cache[key] = new THREE.AnimationClip('__avatar_' + name, dur || 1, tracks));
  }
  const hasLimbs = model => !!(model && model.userData.placeholderAvatar);
  return { build, applyOutfit, procClip, hasLimbs, VARIANTS, BY_CATEGORY };
})();

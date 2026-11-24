// procedural.js - Patch8: the placeholder character (a cube) and the procedural animations of the eight categories.
// The clips are ordinary THREE.AnimationClips on the "motion" node, so they blend and cross-fade like loaded ones. They also stand in
// for a missing or broken animation file of a real model (then only the transform tracks are used). Each category looks different:
//   enter: drops in and pops      idle: slow bob      attack: lunge      get_hit: knocked back + red flash
//   channeling_idle: hovers, spins, cyan pulse      stun: wobbles, yellow      die: topples and flattens, grey
//   finishing_attack: jump, full spin, slam, gold
const Procedural3D = (function () {
  const MOTION = '__motion',
    CUBE = '__cube',
    SIZE = 0.8;
  const geo = new THREE.BoxGeometry(SIZE, SIZE, SIZE);
  geo.translate(0, SIZE / 2, 0); // the feet (bottom face) sit on the anchor
  const nose = new THREE.BoxGeometry(0.22, 0.22, 0.2);
  nose.translate(0, SIZE * 0.6, SIZE / 2 + 0.1); // a small block on the front face shows where the cube looks
  function makeCube(side) {
    const base = side === 'Opponent' ? 0xc0606a : 0x5b86c8;
    const mat = new THREE.MeshStandardMaterial({ color: base, roughness: 0.55, emissive: 0x000000 });
    const m = new THREE.Mesh(geo, mat);
    m.name = CUBE;
    m.userData.baseColor = new THREE.Color(base);
    const n = new THREE.Mesh(nose, new THREE.MeshStandardMaterial({ color: 0xf2e6c0, roughness: 0.6 }));
    m.add(n);
    m.userData.dispose = () => {
      mat.dispose();
      n.material.dispose();
    }; // the geometry is shared by every cube
    return m;
  }
  const q = new THREE.Quaternion(),
    e = new THREE.Euler();
  // keys: [[t, {p:[x,y,z], r:[x,y,z] degrees, s:[x,y,z] | number, c: 0xrrggbb, em: 0xrrggbb}], ...]
  function clip(name, keys, withColor, base) {
    const T = keys.map(k => k[0]),
      P = [],
      R = [],
      S = [],
      C = [],
      E = [];
    let last = { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1], c: base, em: 0x000000 };
    for (const [, k] of keys) {
      const cur = Object.assign({}, last, k);
      const s = typeof cur.s === 'number' ? [cur.s, cur.s, cur.s] : cur.s;
      P.push(...cur.p);
      e.set((cur.r[0] * Math.PI) / 180, (cur.r[1] * Math.PI) / 180, (cur.r[2] * Math.PI) / 180);
      q.setFromEuler(e);
      R.push(q.x, q.y, q.z, q.w);
      S.push(...s);
      const col = new THREE.Color(cur.c),
        em = new THREE.Color(cur.em);
      C.push(col.r, col.g, col.b);
      E.push(em.r, em.g, em.b);
      last = cur;
    }
    const tracks = [
      new THREE.VectorKeyframeTrack(MOTION + '.position', T, P),
      new THREE.QuaternionKeyframeTrack(MOTION + '.quaternion', T, R),
      new THREE.VectorKeyframeTrack(MOTION + '.scale', T, S),
    ];
    if (withColor)
      tracks.push(
        new THREE.ColorKeyframeTrack(CUBE + '.material.color', T, C),
        new THREE.ColorKeyframeTrack(CUBE + '.material.emissive', T, E)
      );
    return new THREE.AnimationClip(name, T[T.length - 1], tracks);
  }
  const W = 0xffffff;
  function keysFor(cat, base) {
    switch (cat) {
      case 'enter':
        return [
          [0, { p: [0, 1.6, 0], s: 0.2, em: 0x666666 }],
          [0.3, { p: [0, 0, 0], s: [1.25, 0.7, 1.25] }],
          [0.45, { s: [0.9, 1.15, 0.9], em: 0x222222 }],
          [0.6, { s: 1, em: 0x000000 }],
        ];
      case 'idle':
        return [
          [0, { p: [0, 0, 0], r: [0, -4, 0] }],
          [1, { p: [0, 0.08, 0], r: [0, 4, 0] }],
          [2, { p: [0, 0, 0], r: [0, -4, 0] }],
        ];
      case 'attack':
        return [
          [0, {}],
          [0.15, { p: [0, 0, -0.25], r: [-12, 0, 0], c: 0xe0902c }],
          [0.3, { p: [0, 0.1, 0.9], r: [18, 0, 0], em: 0x553300 }],
          [0.5, { p: [0, 0, 0.6], r: [5, 0, 0] }],
          [0.75, { p: [0, 0, 0], r: [0, 0, 0], c: base, em: 0x000000 }],
        ];
      case 'get_hit':
        return [
          [0, { c: base }],
          [0.08, { p: [0, 0.05, -0.35], r: [-20, 0, 8], c: 0xff2020, em: 0x880000 }],
          [0.2, { p: [0, 0, -0.25], r: [-8, 0, -6] }],
          [0.45, { p: [0, 0, 0], r: [0, 0, 0], c: base, em: 0x000000 }],
        ];
      case 'channeling_idle':
        return [
          [0, { p: [0, 0.3, 0], r: [0, 0, 0], c: 0x40c8d8, em: 0x0a3a40 }],
          [0.5, { p: [0, 0.4, 0], r: [0, 120, 0], em: 0x2a8a98 }],
          [1.0, { p: [0, 0.4, 0], r: [0, 240, 0], em: 0x30a0b0 }],
          [1.5, { p: [0, 0.3, 0], r: [0, 360, 0], em: 0x0a3a40 }],
        ];
      case 'stun':
        return [
          [0, { r: [12, 0, 0], c: 0xe8d040, em: 0x332a00 }],
          [0.3, { r: [0, 0, 12] }],
          [0.6, { r: [-12, 0, 0] }],
          [0.9, { r: [0, 0, -12] }],
          [1.2, { r: [12, 0, 0] }],
        ];
      case 'die':
        return [
          [0, { c: base }],
          [0.15, { p: [0, 0.2, -0.1], r: [-10, 0, 0], c: W, em: 0x444444 }],
          [0.6, { p: [0, 0, -0.3], r: [-80, 0, 15], c: 0x555555, em: 0x000000 }],
          [1.0, { p: [0, -0.05, -0.35], r: [-90, 0, 20], s: [1, 0.08, 1], c: 0x333333 }],
        ];
      case 'finishing_attack':
        return [
          [0, { c: base }],
          [0.25, { p: [0, 1.3, -0.2], r: [0, 180, 0], c: 0xffcc33, em: 0x664400 }],
          [0.45, { p: [0, 1.5, 0.4], r: [-30, 360, 0], s: 1.2 }],
          [0.6, { p: [0, 0, 1.3], r: [25, 360, 0], s: [1.3, 0.75, 1.3], em: 0xffaa00 }],
          [0.85, { p: [0, 0, 1.0], r: [0, 360, 0], s: 1 }],
          [1.1, { p: [0, 0, 0], r: [0, 360, 0], c: base, em: 0x000000 }],
        ];
    }
    return [[0, {}]];
  }
  const cache = {};
  // withColor: the cube's own clips (they also tint it). A real model only gets the transform tracks.
  function clipFor(cat, withColor, side) {
    const base = side === 'Opponent' ? 0xc0606a : 0x5b86c8,
      key = cat + '|' + (withColor ? side : '-');
    return cache[key] || (cache[key] = clip('__proc_' + cat, keysFor(cat, base), withColor, base));
  }
  return { MOTION, CUBE, SIZE, makeCube, clipFor };
})();

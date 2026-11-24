// card-view.js - Card meshes, 3D artwork, card materials, glow
// ---- Card meshes ------------------------------------------------------------
const CW = cssNum('--card-w', 1.6),
  CD = cssNum('--card-d', 2.3),
  cardGeo = new THREE.BoxGeometry(CW, 0.08, CD);
const matCache = {},
  sideMat = new THREE.MeshStandardMaterial({ color: 0x1b1d24 });
const effHp = c => Sim.hpOf(c) - (c.loc === 'board' ? Sim.totalDamage(c) : 0); // HP left after damage counters
// ---- Simple 3D artwork: each card name maps to a small model, rendered once to a canvas ----
const mk = (geo, color, x, y, z, rx, rz, em) => {
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.15, emissive: em || 0 })
  );
  m.position.set(x || 0, y || 0, z || 0);
  m.rotation.x = rx || 0;
  m.rotation.z = rz || 0;
  return m;
};
const Bx = (w, h, d) => new THREE.BoxGeometry(w, h, d),
  Sp = r => new THREE.SphereGeometry(r, 20, 14),
  Cl = (a, b, h) => new THREE.CylinderGeometry(a, b, h, 18),
  Cn = (r, h, s) => new THREE.ConeGeometry(r, h, s || 18),
  Tr = (r, t, arc) => new THREE.TorusGeometry(r, t, 10, 32, arc || Math.PI * 2);
const H = Math.PI / 2,
  ring = (n, f) => Array.from({ length: n }, (_, i) => f((i / n) * Math.PI * 2));
const SHAPES = {
  superbolt: () => [
    mk(Bx(0.45, 1, 0.2), 0x6fd3ff, 0.25, 0.6, 0, 0, 0.45, 0x113355),
    mk(Bx(0.45, 1, 0.2), 0x6fd3ff, -0.1, -0.1, 0, 0, -0.45, 0x113355),
    mk(Cn(0.3, 0.8), 0x6fd3ff, -0.4, -0.9, 0, 0, Math.PI, 0x113355),
  ],
  grainfall: () =>
    [mk(Cl(0.5, 0.5, 0.15), 0x8b5a2b, 0, -0.6, 0)].concat(
      ring(7, a => mk(Cn(0.08, 0.5, 8), 0xe0c36a, Math.cos(a) * 0.35, 0.1, Math.sin(a) * 0.35))
    ),
  blackhawk: () => [
    mk(Sp(0.4), 0x20232b),
    mk(Sp(0.22), 0x2c303a, 0.5, 0.3, 0),
    mk(Cn(0.1, 0.3), 0xe0b341, 0.78, 0.28, 0, 0, -H),
    mk(Bx(0.1, 0.9, 0.8), 0x14161c, -0.1, 0.2, 0.4, 0, 0.4),
    mk(Bx(0.1, 0.9, 0.8), 0x14161c, -0.1, 0.2, -0.4, 0, 0.4),
  ],
  boltmaster: () => [
    mk(Cl(0.3, 0.4, 0.9), 0x5b4a9a),
    mk(Sp(0.27), 0xf0cfa8, 0, 0.72, 0),
    mk(Cn(0.3, 0.5), 0x3a2f66, 0, 1.1, 0),
    mk(Bx(0.18, 0.6, 0.1), 0xffe14d, 0.6, 0.2, 0, 0, 0.4, 0x665500),
  ],
  soldier: () => [
    mk(Cl(0.3, 0.4, 0.9), 0xb8bfcc),
    mk(Sp(0.27), 0xf0cfa8, 0, 0.72, 0),
    mk(new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, H), 0x6b7280, 0, 0.78, 0),
    mk(Cl(0.03, 0.03, 2), 0x8b5a2b, 0.6, 0.2, 0),
    mk(Cn(0.09, 0.3), 0xe8eef5, 0.6, 1.3, 0),
  ],
  knight: () => [
    mk(Bx(0.8, 1, 0.5), 0xaab4c8),
    mk(Bx(0.5, 0.45, 0.5), 0x8d98ad, 0, 0.85, 0),
    mk(Cn(0.12, 0.45), 0xd4524f, 0, 1.3, 0),
    mk(Bx(0.08, 0.7, 0.55), 0xe0b341, -0.5, 0.1, 0),
    mk(Bx(0.08, 1.1, 0.08), 0xeef2f8, 0.55, 0.3, 0),
    mk(Bx(0.35, 0.06, 0.08), 0x8b5a2b, 0.55, -0.2, 0),
  ],
  giant: () => [
    mk(Bx(1.3, 1.4, 0.8), 0x9a7b5c),
    mk(Sp(0.4), 0xe0b98f, 0, 1.1, 0),
    mk(Cl(0.2, 0.2, 1.1), 0x9a7b5c, -0.85, 0.1, 0),
    mk(Cl(0.2, 0.2, 1.1), 0x9a7b5c, 0.85, 0.1, 0),
    mk(Cl(0.12, 0.22, 1.2), 0x6e4a26, 1.1, 0.7, 0),
  ],
  barrier: () => [
    mk(Bx(0.5, 1.1, 0.2), 0x9b6b3a, -0.6, 0, 0),
    mk(Bx(0.5, 1.3, 0.2), 0xa97a47, 0, 0.1, 0),
    mk(Bx(0.5, 1.1, 0.2), 0x9b6b3a, 0.6, 0, 0),
    mk(Bx(1.9, 0.18, 0.12), 0x6e4a26, 0, 0.15, 0.15),
  ],
  ward: () => [
    mk(Cl(0.8, 0.8, 0.12), 0x4aa87a, 0, 0, 0, H),
    mk(Tr(0.8, 0.07), 0xe0c36a),
    mk(Sp(0.2), 0xe8e8f0, 0, 0, 0.1),
  ],
  aura: () => [
    mk(Sp(0.35), 0xfff0a0, 0, 0, 0, 0, 0, 0x887733),
    mk(Tr(0.7, 0.05), 0xffd86b, 0, 0, 0, H),
    mk(Tr(0.95, 0.04), 0xffd86b, 0, 0, 0, 1.1),
    mk(Tr(0.95, 0.04), 0xffd86b, 0, 0, 0, 0, 1.1),
  ],
  heal: () => [mk(Bx(0.5, 1.5, 0.5), 0xffffff), mk(Bx(1.5, 0.5, 0.5), 0xffffff)],
  zap: () => [
    mk(Bx(0.35, 0.9, 0.2), 0xffe14d, 0.2, 0.65, 0, 0, 0.45, 0x665500),
    mk(Bx(0.35, 0.9, 0.2), 0xffe14d, -0.05, 0, 0, 0, -0.45, 0x665500),
    mk(Cn(0.25, 0.7), 0xffe14d, -0.3, -0.7, 0, 0, Math.PI, 0x665500),
  ],
  archer: () => [
    mk(Tr(0.9, 0.07, Math.PI), 0x8b5a2b, 0, 0, 0, 0, H),
    mk(Cl(0.015, 0.015, 1.8), 0xeeeeee),
    mk(Cl(0.03, 0.03, 1.6), 0xd8c8a8, 0.1, 0, 0, 0, H),
    mk(Cn(0.08, 0.25), 0xdde3ea, 1, 0, 0, 0, -H),
  ],
  guard: () =>
    [mk(Cl(0.5, 0.55, 1.4), 0x9aa3b5)].concat(
      [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ].map(p => mk(Bx(0.25, 0.3, 0.25), 0x8a93a5, p[0] * 0.33, 0.85, p[1] * 0.33)),
      [mk(Cl(0.4, 0.4, 0.08), 0xe0b341, 0, 0, 0.52, H)]
    ),
  wolf: () =>
    [
      mk(Bx(1.3, 0.55, 0.5), 0x8c929c),
      mk(Bx(0.5, 0.45, 0.45), 0xa0a6b0, 0.85, 0.25, 0),
      mk(Bx(0.3, 0.2, 0.25), 0x777c85, 1.15, 0.15, 0),
      mk(Cn(0.1, 0.25), 0x6f747d, 0.8, 0.55, 0.15),
      mk(Cn(0.1, 0.25), 0x6f747d, 0.8, 0.55, -0.15),
      mk(Cn(0.1, 0.6), 0x8c929c, -0.85, 0.2, 0, 0, 1.2),
    ].concat(
      [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ].map(p => mk(Cl(0.08, 0.08, 0.5), 0x6f747d, p[0] * 0.45, -0.45, p[1] * 0.18))
    ),
  scout: () => [
    mk(Cn(0.5, 1.3), 0x4d5a4a),
    mk(Sp(0.22), 0xf0cfa8, 0, 0.8, 0),
    mk(Cn(0.28, 0.45), 0x3b473a, 0, 0.95, 0),
    mk(Bx(0.06, 0.7, 0.06), 0xeef2f8, 0.55, 0.1, 0, 0, -0.5),
  ],
  banner: () => [
    mk(Cl(0.04, 0.04, 2.1), 0x8b5a2b, -0.5, 0, 0),
    mk(Sp(0.09), 0xe0b341, -0.5, 1.1, 0),
    mk(Bx(1, 0.7, 0.06), 0xd4524f, 0, 0.7, 0),
  ],
  trap: () =>
    [mk(Cl(0.9, 0.9, 0.12), 0x6b6f78, 0, -0.3, 0), mk(Cl(0.25, 0.25, 0.08), 0xb8892b, 0, -0.2, 0)].concat(
      ring(8, a => mk(Cn(0.1, 0.5, 8), 0xc8ccd6, Math.cos(a) * 0.6, 0.05, Math.sin(a) * 0.6))
    ),
  charm: () => [
    mk(Tr(0.7, 0.04), 0xe0b341, 0, 0.3, 0),
    mk(Sp(0.1), 0xe0b341, 0, -0.4, 0),
    mk(new THREE.OctahedronGeometry(0.3), 0x6fd3ff, 0, -0.65, 0, 0, 0, 0x113344),
  ],
  bolt: () => [
    mk(Cl(0.05, 0.05, 1.8), 0xd8c8a8, 0, 0, 0, 0, H),
    mk(Cn(0.12, 0.4), 0xdde3ea, 1.1, 0, 0, 0, -H),
    mk(Bx(0.35, 0.25, 0.03), 0xd4524f, -0.8, 0, 0),
    mk(Bx(0.35, 0.03, 0.25), 0xd4524f, -0.8, 0, 0),
  ],
  mend: () => [
    mk(Cl(0.5, 0.5, 0.6), 0xf4efe6, 0, 0, 0, H),
    mk(Cl(0.51, 0.51, 0.12), 0xd4524f, 0, 0, 0, H),
    mk(Bx(1.1, 0.04, 0.5), 0xf4efe6, 0.95, -0.48, 0),
  ],
  fireball: () =>
    [mk(Sp(0.55), 0xff7a1a, 0, 0, 0, 0, 0, 0xaa3300), mk(Sp(0.35), 0xffd54a, 0, 0, 0, 0, 0, 0xaa8800)].concat(
      ring(8, a => mk(Cn(0.22, 0.9), 0xff9a2a, Math.cos(a) * 0.75, Math.sin(a) * 0.75, 0, 0, a - H, 0x662200))
    ),
  rally: () => [
    mk(Cl(0.08, 0.08, 1), 0xe0b341, -0.6, 0, 0, 0, H),
    mk(Cl(0.65, 0.1, 1.1), 0xe0b341, 0.5, 0, 0, 0, -H),
    mk(Sp(0.1), 0xe0b341, -1.1, 0, 0),
  ],
  hummingbird: () => [
    mk(Sp(0.38), 0xd4363a),
    mk(Sp(0.22), 0xe04a4a, 0.45, 0.3, 0),
    mk(Cn(0.04, 0.55), 0x2a2a2a, 0.95, 0.3, 0, 0, -H),
    mk(Bx(0.1, 0.9, 0.55), 0xb02a2e, -0.1, 0.35, 0.3, 0, 0.5),
    mk(Bx(0.1, 0.9, 0.55), 0xb02a2e, -0.1, 0.35, -0.3, 0, 0.5),
    mk(Cn(0.12, 0.6), 0x8f2226, -0.6, -0.15, 0, 0, H),
  ],
  infinitywall: () => [
    mk(Bx(1.9, 1.3, 0.3), 0x7d8597),
    mk(Bx(1.92, 0.05, 0.32), 0x4a5060, 0, 0.22, 0),
    mk(Bx(1.92, 0.05, 0.32), 0x4a5060, 0, -0.22, 0),
    mk(Tr(0.3, 0.07), 0x6fd3ff, -0.32, 0, 0.2, 0, 0, 0x113344),
    mk(Tr(0.3, 0.07), 0x6fd3ff, 0.32, 0, 0.2, 0, 0, 0x113344),
  ],
  avatar: () => [
    mk(Cl(0.45, 0.55, 1), 0x7b3f8f),
    mk(Sp(0.4), 0x9a55b0, 0, 0.85, 0),
    mk(Cn(0.07, 0.3), 0xffffff, 0.12, 0.5, 0.33, Math.PI),
    mk(Cn(0.07, 0.3), 0xffffff, -0.12, 0.5, 0.33, Math.PI),
    mk(Sp(0.06), 0xff3030, 0.15, 0.95, 0.34, 0, 0, 0xaa0000),
    mk(Sp(0.06), 0xff3030, -0.15, 0.95, 0.34, 0, 0, 0xaa0000),
  ],
  bandages: () => [
    mk(Cl(0.5, 0.5, 0.8), 0xf4efe6, 0, 0, 0, H),
    mk(Cl(0.51, 0.51, 0.2), 0xd4524f, 0, 0, 0, H),
    mk(Bx(1.2, 0.04, 0.45), 0xf4efe6, 0.95, -0.45, 0),
  ],
  blast: () => [
    mk(Sp(0.65), 0x2a2d36, 0, -0.1, 0),
    mk(Cl(0.05, 0.05, 0.5), 0x8b5a2b, 0.25, 0.7, 0, 0, -0.5),
    mk(Sp(0.13), 0xffe14d, 0.42, 0.97, 0, 0, 0, 0xffaa00),
  ],
};
SHAPES.wardrum = () => [
  mk(Cl(0.6, 0.6, 0.7), 0x8b5a2b),
  mk(Cl(0.62, 0.62, 0.1), 0xd4524f, 0, 0.4, 0),
  mk(Cl(0.62, 0.62, 0.1), 0xd4524f, 0, -0.4, 0),
  mk(Cl(0.04, 0.04, 0.9), 0xe0b341, 0.5, 0.9, 0, 0, 0.6),
  mk(Cl(0.04, 0.04, 0.9), 0xe0b341, -0.5, 0.9, 0, 0, -0.6),
];
SHAPES['drummer-token'] = () => [
  mk(Cl(0.3, 0.4, 0.9), 0xd4524f),
  mk(Sp(0.27), 0xf0cfa8, 0, 0.72, 0),
  mk(Cl(0.2, 0.2, 0.3), 0x8b5a2b, 0, 0.1, 0.45, H),
];
SHAPES.shark = () => [
  mk(Sp(0.6), 0x5a7fa8),
  mk(Cn(0.3, 0.8), 0x4a6f98, 0, 0.7, 0),
  mk(Cn(0.25, 0.7), 0x5a7fa8, -0.9, 0, 0, 0, H),
  mk(Cn(0.12, 0.4), 0xffffff, 0.55, -0.1, 0.15, Math.PI),
  mk(Cn(0.12, 0.4), 0xffffff, 0.55, -0.1, -0.15, Math.PI),
];
SHAPES.intuition = () => [
  mk(Sp(0.35), 0xffe14d, 0, 0, 0, 0, 0, 0x665500),
  mk(Tr(0.7, 0.05), 0x6fd3ff, 0, 0, 0, H),
  mk(Tr(0.9, 0.04), 0x6fd3ff, 0, 0, 0, 0, 1.1),
];
SHAPES.ambush = () => [
  mk(Sp(0.55), 0x1b1d2e),
  mk(Sp(0.1), 0xe8e8f0, 0.2, 0.15, 0.5, 0, 0, 0x444466),
  mk(Sp(0.1), 0xe8e8f0, -0.2, 0.15, 0.5, 0, 0, 0x444466),
  mk(Tr(0.8, 0.05, Math.PI), 0x7b5fd0, 0, -0.1, 0),
];
SHAPES.kingeye = () => [mk(Sp(0.7), 0xf2f2f2), mk(Sp(0.32), 0x7a2bd0, 0, 0, 0.52), mk(Sp(0.15), 0x000000, 0, 0, 0.8)];
SHAPES.vine = () => [
  mk(Cl(0.08, 0.14, 1.6), 0x3f8f3a),
  mk(Sp(0.22), 0x5fbf4a, 0.35, 0.5, 0),
  mk(Sp(0.2), 0x5fbf4a, -0.3, 0.1, 0),
  mk(Sp(0.18), 0x4aa83e, 0.3, -0.4, 0),
  mk(Tr(0.4, 0.05, Math.PI * 1.4), 0x2f6f2c, 0, -0.5, 0),
];
SHAPES['vine-token'] = SHAPES.vine;
SHAPES.heavensun = () => [
  mk(Sp(0.5), 0xffd54a, 0, 0.3, 0, 0, 0, 0xaa7700),
  mk(Tr(0.8, 0.05), 0xffe9a0, 0, 0.3, 0, H),
  mk(Cn(0.5, 0.7), 0x6fa8ff, 0, -0.6, 0),
];
SHAPES.parasite = () =>
  [mk(Sp(0.35), 0x6b2f7a, 0, 0.2, 0)].concat(
    ring(6, a => mk(Cl(0.04, 0.04, 0.8), 0x8a4a9a, Math.cos(a) * 0.4, -0.4, Math.sin(a) * 0.4))
  );
SHAPES.shieldguard = () => [
  mk(Bx(1.1, 1.4, 0.15), 0x8d98ad),
  mk(Bx(0.2, 1.5, 0.2), 0xe0b341),
  mk(Bx(0.8, 0.2, 0.2), 0xe0b341, 0, 0.2, 0),
];
SHAPES.underworldfusion = () => [
  mk(Tr(0.8, 0.07), 0x7b3fb8, 0, 0, 0, H),
  mk(Sp(0.35), 0x2a1840, 0, 0, 0, 0, 0, 0x331155),
  mk(Tr(0.55, 0.05), 0xc08cff),
];
SHAPES.depthfusion = () => [
  mk(Tr(0.8, 0.07), 0x2a6fb8, 0, 0, 0, H),
  mk(Sp(0.35), 0x1b3a5e, 0, 0, 0, 0, 0, 0x113355),
  mk(Tr(0.55, 0.05), 0x6fd3ff),
];
SHAPES.cultivator = () =>
  [
    mk(Cl(0.5, 0.6, 0.5), 0x6e4a26, 0, -0.55, 0),
    mk(Cl(0.07, 0.07, 1.1), 0x3f8f3a, 0, 0.05, 0),
    mk(Sp(0.28), 0xf0a0d0, 0, 0.7, 0),
  ].concat(ring(5, a => mk(Sp(0.1), 0xffe14d, Math.cos(a) * 0.36, 0.7, Math.sin(a) * 0.36)));
SHAPES.widowmaker = () =>
  [mk(Sp(0.45), 0x15161c), mk(Sp(0.25), 0x23242c, 0.5, 0.1, 0), mk(Bx(0.2, 0.2, 0.05), 0xd4363a, 0, 0, 0.45)].concat(
    ring(8, a => mk(Cn(0.05, 0.8, 6), 0x15161c, Math.cos(a) * 0.65, -0.1, Math.sin(a) * 0.65, 0, Math.cos(a) * 1.2))
  );
SHAPES.librarian = () => [
  mk(Bx(1.3, 0.18, 0.9), 0x6e3a8e, 0, -0.3, 0),
  mk(Bx(1.2, 0.5, 0.8), 0xeee6d0, 0, 0, 0),
  mk(Sp(0.22), 0xffe14d, 0, 0.55, 0, 0, 0, 0x665500),
];
SHAPES.spirit = () => [
  mk(Sp(0.5), 0xe8f4ff, 0, 0, 0, 0, 0, 0x335577),
  mk(Tr(0.8, 0.06), 0xd4524f),
  mk(Tr(0.8, 0.06), 0x3f7fd8, 0, 0, 0, H),
];
const artCache = {},
  artURLs = {};
let artR = null,
  artScene = null,
  artCam = null;
function artCanvas(def) {
  if (artCache[def.id]) return artCache[def.id];
  if (!artR) {
    artR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    artR.setPixelRatio(1);
    artR.setSize(256, 256);
    artScene = new THREE.Scene();
    artScene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const L = new THREE.DirectionalLight(0xffffff, 0.9);
    L.position.set(2, 3, 4);
    artScene.add(L);
    artCam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    artCam.position.set(0, 1.2, 5.4);
    artCam.lookAt(0, 0, 0);
  }
  const key = def.id.replace(/^tok-(.+)-\d+$/, '$1'); // ability tokens reuse their source card's model
  const inner = new THREE.Group();
  (SHAPES[key] ? SHAPES[key]() : [mk(Sp(0.7), 0xcccccc)]).forEach(p => inner.add(p));
  const bb = new THREE.Box3().setFromObject(inner),
    r = bb.getSize(new THREE.Vector3()).length() / 2;
  inner.position.sub(bb.getCenter(new THREE.Vector3()));
  const pivot = new THREE.Group();
  pivot.add(inner);
  pivot.scale.setScalar(1.15 / r);
  pivot.rotation.y = -0.55;
  artScene.add(pivot);
  artR.render(artScene, artCam);
  artScene.remove(pivot);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  c.getContext('2d').drawImage(artR.domElement, 0, 0);
  return (artCache[def.id] = c);
}
const artURL = def => artURLs[def.id] || (artURLs[def.id] = artCanvas(def).toDataURL());
// Patch9: the card's 3D art as the character of the 3D side view (feet on the card, `size` m at its largest, the front facing +z)
function artModel3D(def, size) {
  const key = def.id.replace(/^tok-(.+)-\d+$/, '$1'),
    inner = new THREE.Group();
  (SHAPES[key] ? SHAPES[key]() : [mk(Sp(0.7), 0xcccccc)]).forEach(p => inner.add(p));
  const bb = new THREE.Box3().setFromObject(inner),
    sz = bb.getSize(new THREE.Vector3()),
    c = bb.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -bb.min.y, -c.z);
  const g = new THREE.Group();
  g.name = '__cardArt';
  g.add(inner);
  g.scale.setScalar((size || 0.9) / Math.max(sz.x, sz.y, sz.z, 1e-6));
  g.userData.dispose = () =>
    g.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  return g;
}
// Pre-render all artwork once (cards + ability tokens), then release the second WebGL context
DEFS.forEach(d => {
  artCanvas(d);
  (d.abilities || []).forEach((_, i) => artCanvas({ id: 'tok-' + d.id + '-' + i }));
  (d.triggers || []).forEach((_, i) => artCanvas({ id: 'tok-' + d.id + '-' + (100 + i) }));
  Object.values(d.tokens || {}).forEach(artCanvas);
});
artR.dispose();
artR.forceContextLoss();
artR = null;
// ---- Patch6: the card back (face-down cards, the bottom face of every card, decks): a framed emblem of a small house under a sky of rays ----
function drawCardBack(g, w, h) {
  const css = (n, d) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d,
    A = css('--card-back-a', '#1d2550'),
    B = css('--card-back-b', '#0b0f26'),
    L = css('--card-back-line', '#c9a54a'),
    cx = w / 2,
    cy = h / 2;
  const bg = g.createRadialGradient(cx, cy, 8, cx, cy, h * 0.7);
  bg.addColorStop(0, A);
  bg.addColorStop(1, B);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.save(); // a fine diamond lattice
  g.globalAlpha = 0.13;
  g.strokeStyle = L;
  g.lineWidth = 1;
  for (let i = -h; i < w + h; i += 14) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + h, h);
    g.moveTo(i, h);
    g.lineTo(i + h, 0);
    g.stroke();
  }
  g.restore();
  g.strokeStyle = L; // double frame
  g.lineWidth = 5;
  g.strokeRect(6, 6, w - 12, h - 12);
  g.lineWidth = 1.5;
  g.strokeRect(13, 13, w - 26, h - 26);
  g.save(); // rays behind the emblem
  g.translate(cx, cy);
  g.globalAlpha = 0.35;
  g.lineWidth = 2;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.beginPath();
    g.moveTo(Math.cos(a) * 30, Math.sin(a) * 30);
    g.lineTo(Math.cos(a) * 52, Math.sin(a) * 52);
    g.stroke();
  }
  g.restore();
  g.beginPath(); // emblem: a ring with a house inside
  g.arc(cx, cy, 27, 0, Math.PI * 2);
  g.fillStyle = B;
  g.fill();
  g.lineWidth = 3;
  g.stroke();
  g.beginPath();
  g.moveTo(cx - 13, cy + 12);
  g.lineTo(cx - 13, cy - 1);
  g.lineTo(cx, cy - 13);
  g.lineTo(cx + 13, cy - 1);
  g.lineTo(cx + 13, cy + 12);
  g.closePath();
  g.fillStyle = L;
  g.fill();
  g.fillStyle = B;
  g.fillRect(cx - 3.5, cy + 2, 7, 10);
  [-1, 1].forEach(s => {
    // corner diamonds
    [-1, 1].forEach(t => {
      const x = cx + s * (w / 2 - 26),
        y = cy + t * (h / 2 - 26);
      g.beginPath();
      g.moveTo(x, y - 7);
      g.lineTo(x + 5, y);
      g.lineTo(x, y + 7);
      g.lineTo(x - 5, y);
      g.closePath();
      g.fillStyle = L;
      g.fill();
    });
  });
}
// ---- Patch7: the card face in the style of the card back: the type colour fades into navy, a gold double frame, a name banner,
// a framed art window and the type line. Colours: --card-back-* and --card-gold-text (theme.css); the type colour comes from cardColor()
function drawCardFace(g, def, w, h) {
  const css = (n, d) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d,
    B = css('--card-back-b', '#0b0f26'),
    L = css('--card-back-line', '#c9a54a'),
    TXT = css('--card-gold-text', '#f3e6c0'),
    T = cardColor(def),
    cx = w / 2,
    serif = "Georgia, 'Times New Roman', serif";
  const bg = g.createLinearGradient(0, 0, 0, h); // the type colour at the top, navy below
  bg.addColorStop(0, T);
  bg.addColorStop(0.55, B);
  bg.addColorStop(1, B);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.save(); // the same fine lattice as the back, fainter
  g.globalAlpha = 0.08;
  g.strokeStyle = L;
  g.lineWidth = 2;
  for (let i = -h; i < w + h; i += 28) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + h, h);
    g.moveTo(i, h);
    g.lineTo(i + h, 0);
    g.stroke();
  }
  g.restore();
  g.strokeStyle = L; // double frame
  g.lineWidth = 10;
  g.strokeRect(12, 12, w - 24, h - 24);
  g.lineWidth = 3;
  g.strokeRect(26, 26, w - 52, h - 52);
  g.fillStyle = 'rgba(5,8,22,0.72)'; // name banner
  g.fillRect(26, 26, w - 52, 64);
  g.fillStyle = L;
  g.fillRect(26, 88, w - 52, 3);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = TXT;
  let sz = 40;
  do {
    g.font = 'bold ' + sz + 'px ' + serif;
    sz--;
  } while (g.measureText(def.name).width > w - 72 && sz > 16);
  g.fillText(def.name, cx, 59);
  const ax = 46, // art window: a glow of the type colour behind the model, framed in gold
    ay = 108,
    aw = w - 92,
    ah = w - 92;
  const glow = g.createRadialGradient(cx, ay + ah / 2, 10, cx, ay + ah / 2, aw * 0.75);
  glow.addColorStop(0, T);
  glow.addColorStop(1, B);
  g.fillStyle = glow;
  g.fillRect(ax, ay, aw, ah);
  g.drawImage(artCanvas(def), ax + 4, ay + 4, aw - 8, ah - 8);
  g.lineWidth = 4;
  g.strokeStyle = L;
  g.strokeRect(ax, ay, aw, ah);
  const ty = ay + ah + 34, // the type line between two gold rules, a diamond in the type colour
    T0 = TYPES[def.type] || { label: def.type },
    label = ((def.extra ? 'Extra ' : '') + T0.label).toUpperCase();
  g.font = 'bold 20px ' + serif;
  const tw = Math.min(g.measureText(label).width, w - 120);
  g.fillStyle = TXT;
  g.fillText(label, cx, ty, w - 120);
  g.fillStyle = L;
  g.fillRect(40, ty - 1, cx - tw / 2 - 52, 2);
  g.fillRect(cx + tw / 2 + 12, ty - 1, cx - tw / 2 - 52, 2);
  [-1, 1].forEach(s => {
    // corner diamonds, as on the back
    [-1, 1].forEach(t => {
      const x = cx + s * (w / 2 - 44),
        y = h / 2 + t * (h / 2 - 44);
      if (t < 0) return; // the top corners sit under the name banner
      g.beginPath();
      g.moveTo(x, y - 12);
      g.lineTo(x + 8, y);
      g.lineTo(x, y + 12);
      g.lineTo(x - 8, y);
      g.closePath();
      g.fillStyle = L;
      g.fill();
    });
  });
}
const backMat = (() => {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 230;
  drawCardBack(c.getContext('2d'), c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return new THREE.MeshBasicMaterial({ map: tex });
})();
function cardMat(def, faceDown, rot, hp, atk) {
  // on the table a card shows only: name, power, effective HP
  const key = (faceDown ? 'fd' : def.id) + '|' + rot;
  if (matCache[key]) return matCache[key];
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 230;
  const g = c.getContext('2d');
  if (faceDown)
    drawCardBack(g, c.width, c.height); // Patch6: a proper card back
  else {
    c.width = 320; // Patch7: the card face matches the card back (navy, gold frame); drawn at 2x so the name stays sharp
    c.height = 460;
    drawCardFace(g, def, c.width, c.height);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.center.set(0.5, 0.5);
  tex.rotation = rot;
  tex.anisotropy = 4;
  return (matCache[key] = [sideMat, sideMat, new THREE.MeshBasicMaterial({ map: tex }), backMat, sideMat, sideMat]); // bottom face: the card back
}
const cardGroup = new THREE.Group();
scene.add(cardGroup);
// ---- Pulsing border glow on cards the viewer can play or use right now ----
const glowTex = (() => {
  const c = document.createElement('canvas');
  c.width = 168;
  c.height = 224;
  const g = c.getContext('2d');
  g.shadowColor = cssStr('--glow-shadow', '#ffe27a');
  g.shadowBlur = 16;
  g.strokeStyle = cssStr('--glow-line', '#fff1a8');
  g.lineWidth = 4;
  for (let i = 0; i < 3; i++) g.strokeRect(20, 20, 128, 184);
  return new THREE.CanvasTexture(c);
})();
const glowMat = new THREE.MeshBasicMaterial({
    map: glowTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0,
  }),
  glowGeo = new THREE.PlaneGeometry(CW + 0.5, CD + 0.5);
const PW_PAL = [
    cssPair('--pw-low', ['#cd7f32', '#5e3410']),
    cssPair('--pw-same', ['#cfd3da', '#4b505b']),
    cssPair('--pw-high', ['#ffd34d', '#7a5a00']),
  ],
  HP_PAL = [
    cssPair('--hp-low', ['#e04848', '#6e1212']),
    cssPair('--hp-same', ['#3f7fd8', '#143672']),
    cssPair('--hp-high', ['#3fb26a', '#12522b']),
  ],
  badgeTex = {},
  badgeGeo = new THREE.PlaneGeometry(cssNum('--badge-size', 0.62), cssNum('--badge-size', 0.62));
function badgeTexture(text, fill, line) {
  const k = text + fill;
  if (badgeTex[k]) return badgeTex[k];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d'),
    t = String(text);
  g.beginPath();
  g.arc(64, 64, 57, 0, 7);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 11;
  g.strokeStyle = line;
  g.stroke();
  g.beginPath();
  g.arc(64, 64, 62, 0, 7);
  g.lineWidth = 3;
  g.strokeStyle = '#fff';
  g.stroke();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold ' + (t.length > 3 ? 40 : t.length > 2 ? 52 : 70) + 'px sans-serif';
  g.lineWidth = 9;
  g.strokeStyle = 'rgba(0,0,0,.8)';
  g.strokeText(t, 64, 68);
  g.fillStyle = '#fff';
  g.fillText(t, 64, 68);
  return (badgeTex[k] = new THREE.CanvasTexture(c));
}
function setBadges(m, spec) {
  // power (bottom left): bronze/silver/gold = below/equal/above printed; HP (bottom right): red/blue/green
  const u = m.userData,
    key = spec ? JSON.stringify(spec) : '';
  if (u.bkey === key) return;
  u.bkey = key;
  (u.bm || []).forEach(b => m.remove(b));
  u.bm = [];
  if (!spec) return;
  const sg = spec.opp ? -1 : 1,
    add = (v, base, left, pal) => {
      const [fill, line] = pal[v < base ? 0 : v === base ? 1 : 2],
        b = new THREE.Mesh(
          badgeGeo,
          new THREE.MeshBasicMaterial({ map: badgeTexture(v, fill, line), transparent: true, depthWrite: false })
        );
      b.rotation.set(-Math.PI / 2, 0, spec.opp ? Math.PI : 0);
      b.position.set(sg * (left ? -1 : 1) * (CW / 2 - 0.3), 0.07, sg * (CD / 2 - 0.3));
      b.raycast = () => {};
      m.add(b);
      u.bm.push(b);
    };
  if (spec.pw) add(spec.pw[0], spec.pw[1], true, PW_PAL);
  add(spec.hp[0], spec.hp[1], false, HP_PAL);
}
let swordProto = null;
function setSword(m, on, opp) {
  // a sword on top of every creature that can attack right now (combat phase, empty stack, not yet attacked); the tip points at the foe
  const u = m.userData,
    cur = u.sword;
  if (on && !cur) {
    swordProto = swordProto || makeSword();
    const g = swordProto.clone();
    g.scale.setScalar(cssNum('--sword-scale', 0.85));
    g.position.set(0, cssNum('--sword-height', 0.45), 0);
    g.rotation.y = opp ? 0 : Math.PI;
    g.traverse(x => {
      x.raycast = () => {};
    });
    m.add(g);
    u.sword = g;
  } else if (!on && cur) {
    m.remove(cur);
    u.sword = null;
  }
}
function setGlow(m, on) {
  const g = m.userData.glow;
  if (on && !g) {
    const p = new THREE.Mesh(glowGeo, glowMat);
    p.rotation.x = -Math.PI / 2;
    p.position.y = 0.05;
    p.raycast = () => {};
    m.add(p);
    m.userData.glow = p;
  } else if (!on && g) {
    m.remove(g);
    m.userData.glow = null;
  }
}
const canUse = c => !rp.on && canUseNow(c); // nothing glows in a replay
const canUseNow = c =>
  (game.choice &&
    !foeChoice() &&
    ((game.choice.kind === 'pick' && !game.choice.labels) || boardPick(game.choice)) &&
    game.choice.options.includes(c.iid)) ||
  (Sim.ctl(c) === ui.view &&
    (c.loc === 'hand'
      ? !Sim.canPlay(game, c) || (Sim.abDef(c).abilities || []).some((a, i) => !Sim.canActivate(game, c, i))
      : c.loc === 'board' && (Sim.abDef(c).abilities || []).some((a, i) => !Sim.canActivate(game, c, i))));

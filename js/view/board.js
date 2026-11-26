// board.js - Board geometry: zones, side zones, hands, DOM references
function labelTexture(title, sub, w, d) {
  const c = document.createElement('canvas');
  const S = 128; // pixels per world unit
  c.width = Math.round(S * w * 0.96);
  c.height = Math.round(S * d * 0.96);
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const maxW = c.width * 0.88;
  // shrink font until the text fits inside the zone
  function fit(text, weight, size) {
    for (; size > 8; size--) {
      g.font = weight + ' ' + size + 'px sans-serif';
      if (g.measureText(text).width <= maxW) break;
    }
    return size;
  }
  const tSize = fit(title, 'bold', 52);
  g.strokeStyle = cssStr('--zone-line', 'rgba(201,165,74,0.45)'); // a thin gold frame, like the cards
  g.lineWidth = 3;
  g.strokeRect(6, 6, c.width - 12, c.height - 12);
  g.fillStyle = cssStr('--zone-text', 'rgba(255,255,255,0.92)');
  g.font = 'bold ' + tSize + 'px sans-serif';
  g.fillText(title, c.width / 2, sub ? c.height / 2 - tSize * 0.3 : c.height / 2);
  if (sub) {
    const sSize = fit(sub, 'normal', Math.round(tSize * 0.7));
    g.font = sSize + 'px sans-serif';
    g.fillStyle = cssStr('--zone-sub', 'rgba(255,255,255,0.6)');
    g.fillText(sub, c.width / 2, c.height / 2 + tSize * 0.6);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  return tex;
}

function makeZone(name, label, w, d, color, x, z, sub, rot) {
  rot = rot || 0; // text rotation in radians, seen from above
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, emissive: 0x000000 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), mat);
  mesh.position.set(x, 0, z);
  mesh.userData = { name, owner: name.startsWith('Player') ? 'Player' : name.startsWith('Opp') ? 'Opponent' : null };
  scene.add(mesh);
  const quarter = Math.abs(rot - Math.PI / 2) < 1e-6;
  const tw = quarter ? d : w,
    td = quarter ? w : d; // text frame is swapped when turned 90 degrees
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(tw * 0.96, td * 0.96),
    new THREE.MeshBasicMaterial({ map: labelTexture(label, sub, tw, td), transparent: true })
  );
  plane.rotation.x = -Math.PI / 2;
  plane.rotation.z = rot;
  plane.position.set(x, 0.065, z);
  scene.add(plane);
  mesh.userData.sub = sub;
  mesh.userData.plane = plane;
  mesh.userData.relabel = s2 => {
    if (s2 === mesh.userData.sub) return;
    mesh.userData.sub = s2;
    plane.material.map.dispose();
    plane.material.map = labelTexture(label, s2, tw, td);
    plane.material.needsUpdate = true;
  };
  zones.push(mesh);
  return mesh;
}

// Permanent board: 5 columns x 4 rows (opponent at top, player at bottom)
const TILE_W = cssNum('--tile-w', 2),
  TILE_D = cssNum('--tile-d', 2.8),
  PX = cssNum('--col-pitch', 2.3),
  PZ = cssNum('--row-pitch', 3.05);
const OPP = cssHex('--zone-opp', 0x8a4650),
  OPP_D = cssHex('--zone-opp-back', 0x6b3a42),
  PLY = cssHex('--zone-p1', 0x3f5f8f),
  PLY_D = cssHex('--zone-p1-back', 0x34507a);
const rows = [
  { name: 'Opp Back', label: 'Back', color: OPP_D, rot: Math.PI },
  { name: 'Opp Front', label: 'Front', color: OPP, rot: Math.PI },
  { name: 'Player Front', label: 'Front', color: PLY, rot: 0 },
  { name: 'Player Back', label: 'Back', color: PLY_D, rot: 0 },
];
const GAP = cssNum('--half-gap', 1.7); // opponent half moves up, player half moves down: room for the button row
const zRow = r => (r - 1.5) * PZ + (r < 2 ? -GAP / 2 : GAP / 2);
for (let r = 0; r < 4; r++) {
  for (let c = 0; c < 5; c++) {
    const t = makeZone(
      rows[r].name + ' (Column ' + (c + 1) + ')',
      rows[r].label,
      TILE_W,
      TILE_D,
      rows[r].color,
      (c - 2) * PX,
      zRow(r),
      'Col ' + (c + 1),
      rows[r].rot
    );
    t.userData.slot = { owner: r < 2 ? 'Opponent' : 'Player', row: r === 1 || r === 2 ? 'front' : 'back', col: c };
    t.userData.slotKey = t.userData.slot.owner + '|' + t.userData.slot.row + '|' + c;
    slotZones[t.userData.slotKey] = t;
  }
}

// Side zones, point-symmetric (Yu-Gi-Oh style): player Deck + GY on the right,
// Extra Deck + Exile on the left; opponent is the same rotated 180 degrees.
const SX = cssNum('--side-x', 7.4),
  sideZones = {};
function side(who, back, front, sign, color) {
  const rot = who === 'Opponent' ? Math.PI : 0;
  const deckMesh = makeZone(who + ' Deck', 'Deck', TILE_W, TILE_D, color, sign * SX, zRow(back), '0 cards', rot);
  deckMesh.userData.deckOf = who;
  sideZones[who + 'deck'] = deckMesh;
  const gyMesh = makeZone(
    who + ' Graveyard',
    'Graveyard',
    TILE_W,
    TILE_D,
    color,
    sign * SX,
    zRow(front),
    '0 cards',
    rot
  );
  gyMesh.userData.gyOf = who;
  sideZones[who + 'gy'] = gyMesh;
  const exMesh = makeZone(
    who + ' Extra Deck',
    'Extra Deck',
    TILE_W,
    TILE_D,
    color,
    -sign * SX,
    zRow(back),
    '0 cards',
    rot
  );
  exMesh.userData.extraOf = who;
  sideZones[who + 'extra'] = exMesh;
  sideZones[who + 'exile'] = makeZone(
    who + ' Exile',
    'Exile',
    TILE_W,
    TILE_D,
    color,
    -sign * SX,
    zRow(front),
    '0 cards',
    rot
  );
  sideZones[who + 'exile'].userData.exileOf = who;
}
side('Player', 3, 2, 1, cssHex('--side-p1', 0x2f4466));
side('Opponent', 0, 1, -1, cssHex('--side-p2', 0x5e3239));

// Hands: wide strips behind each back row (mirrored)
const HAND_W = 4 * PX + TILE_W,
  HAND_D = 2.8,
  HZ = zRow(3) + TILE_D / 2 + 0.6 + HAND_D / 2;
makeZone('Player Hand', 'Hand', HAND_W, HAND_D, cssHex('--hand-p1', 0x2a3b57), 0, HZ, null, 0);
makeZone('Opponent Hand', 'Hand', HAND_W, HAND_D, cssHex('--hand-p2', 0x4a2a30), 0, -HZ, null, Math.PI);

// ---- Clouds (King Eye): one dark slab per slot zone, shown where the Sim has a cloud. Not pickable: the zone beneath stays targetable.
const cloudGeo = new THREE.BoxGeometry(TILE_W, 0.34, TILE_D),
  cloudHide = new THREE.MeshBasicMaterial({ color: cssHex('--cloud-hidden', 0x07070c) }),
  cloudOwn = new THREE.MeshBasicMaterial({
    color: cssHex('--cloud-own', 0x07070c),
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  }),
  cloudHot = new THREE.MeshBasicMaterial({ color: cssHex('--cloud-hot', 0x16402a) }), // an enemy cloud over a legal target / pick glows green
  clouds = {};
for (const k in slotZones) {
  const m = new THREE.Mesh(cloudGeo, cloudHide);
  m.position.set(slotZones[k].position.x, 0.2, slotZones[k].position.z);
  m.raycast = () => {};
  m.visible = false;
  scene.add(m);
  clouds[k] = m;
}
// ---- Secrets (js/sim/secrets.js): one flat mark per slot zone. The placer sees gold sparks where their trap is; the other player sees a
// faint purple ring on every zone a secret may be on. Not pickable.
const sparkGeo = (() => {
    const sh = new THREE.Shape(),
      n = 8;
    for (let i = 0; i <= n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2,
        r = i % 2 ? TILE_W * 0.12 : TILE_W * 0.34;
      i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(r, 0);
    }
    return new THREE.ShapeGeometry(sh);
  })(),
  candGeo = new THREE.RingGeometry(TILE_W * 0.26, TILE_W * 0.32, 32),
  sparkMat = new THREE.MeshBasicMaterial({
    color: cssHex('--secret-spark', 0xffd75a),
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  }),
  candMat = new THREE.MeshBasicMaterial({
    color: cssHex('--secret-maybe', 0xa070ff),
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  }),
  secretMarks = {};
for (const k in slotZones) {
  const m = new THREE.Mesh(sparkGeo, sparkMat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(slotZones[k].position.x, 0.08, slotZones[k].position.z);
  m.raycast = () => {};
  m.visible = false;
  scene.add(m);
  secretMarks[k] = m;
}
const ray = new THREE.Raycaster(),
  mouse = new THREE.Vector2(2, 2),
  tmpRay = new THREE.Raycaster(),
  tmpV = new THREE.Vector2();
const hud = document.getElementById('hud'),
  statusEl = document.getElementById('status');
const deckPanel = document.getElementById('deckPanel'),
  inspect = document.getElementById('inspect'),
  menu = document.getElementById('menu'),
  stackEl = document.getElementById('stack'),
  viewBtn = document.getElementById('viewBtn'),
  helpEl = document.getElementById('help');

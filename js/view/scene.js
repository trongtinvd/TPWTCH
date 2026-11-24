//scene.js - Three.js scene, camera, renderer, lights, table (colours and light levels come from css/theme.css)
const scene = new THREE.Scene();
scene.background = new THREE.Color(cssHex('--scene-bg', 0x14161c));
const VW = () => renderer.domElement.clientWidth || innerWidth,
  VH = () => renderer.domElement.clientHeight || innerHeight,
  VX = () => renderer.domElement.getBoundingClientRect().left,
  VY = () => renderer.domElement.getBoundingClientRect().top; // the canvas may be a sub-rectangle of the window (portrait)
// Patch10: the camera numbers come from config/camera.json (CameraCfg, js/core/camera-config.js); the defaults are the same values
const camCfg0 = CameraCfg.get().classic;
const camera = new THREE.PerspectiveCamera(camCfg0.fov, innerWidth / innerHeight, camCfg0.near, camCfg0.far);
camera.position.fromArray(camCfg0.position);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false); // CSS sizes the canvas
document.body.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.fromArray(camCfg0.target);
controls.maxPolarAngle = (camCfg0.maxPolarDeg * Math.PI) / 180;
controls.update();

scene.add(new THREE.AmbientLight(0xffffff, cssNum('--light-ambient', 0.75)));
const sun = new THREE.DirectionalLight(0xffffff, cssNum('--light-sun', 0.6));
sun.position.set(6, 14, 8);
scene.add(sun);

const table = new THREE.Mesh(
  new THREE.BoxGeometry(21, 0.3, 25),
  new THREE.MeshStandardMaterial({ color: cssHex('--table-color', 0x353c4f), roughness: 0.9 })
);
table.position.set(0, -0.25, 0);
scene.add(table);
// Ground under each half: brightens while that player has priority (matches the board lift)
const GROUND_DIM = new THREE.Color(cssHex('--pad-dim', 0x353c4f)),
  GROUND_LIT = new THREE.Color(cssHex('--pad-lit', 0x707c9c)),
  pads = {};
for (const p of ['Player', 'Opponent']) {
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(21, 0.02, 12.5),
    new THREE.MeshStandardMaterial({ color: GROUND_DIM.getHex(), roughness: 0.9 })
  );
  pad.position.set(0, -0.09, p === 'Player' ? 6.25 : -6.25);
  scene.add(pad);
  pads[p] = pad;
}

const zones = [];

const slotZones = {};

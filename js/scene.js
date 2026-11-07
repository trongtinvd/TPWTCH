// scene.js - Renderer, camera, controls, lights, table. Creates the shared THREE scene objects.
// Classic script: shares one global scope with the other js/*.js files; load order matters (see index.html).

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14161c);
const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 200);
camera.position.set(3, 29, 22);
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.maxPolarAngle = Math.PI/2 - 0.05;
controls.update();

scene.add(new THREE.AmbientLight(0xffffff, 0.75));
const sun = new THREE.DirectionalLight(0xffffff, 0.6);
sun.position.set(6, 14, 8);
scene.add(sun);

const table = new THREE.Mesh(
  new THREE.BoxGeometry(21, 0.3, 25),
  new THREE.MeshStandardMaterial({color:0x353c4f, roughness:0.9})
);
table.position.set(0, -0.25, 0);
scene.add(table);
// Ground under each half: brightens while that player has priority (matches the board lift)
const GROUND_DIM = new THREE.Color(0x353c4f), GROUND_LIT = new THREE.Color(0x707c9c), pads = {};
for (const p of ['Player', 'Opponent']){
  const pad = new THREE.Mesh(new THREE.BoxGeometry(21, 0.02, 12.5), new THREE.MeshStandardMaterial({color:0x353c4f, roughness:0.9}));
  pad.position.set(0, -0.09, p === 'Player' ? 6.25 : -6.25);
  scene.add(pad); pads[p] = pad;
}

const zones = [];
const slotZones = {};

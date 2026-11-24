// main.js - console hook, bootstrap and render loop
window.cardGame = {
  Sim,
  send,
  undo,
  eventLog,
  history: undoStack,
  selfTest,
  get game() {
    return sim;
  },
}; // console/testing hook
// the card descriptions database (written texts) and the camera config load in the background; the game starts with the
// generated card texts and the default cameras, and shows the loaded ones as soon as they arrive
CardText.setMode(Settings.get('cardText') === 'written' ? 'written' : 'generated');
fetch(CardText.URL, { cache: 'no-cache' })
  .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
  .then(j => CardText.load(j))
  .catch(e => {
    CardText.load(null);
    console.warn(
      '[text] ' + CardText.URL + ' not loaded: the written descriptions are not available (' + e.message + ')'
    );
  });
CameraCfg.onChange(c => {
  ortho.near = c.top.near;
  ortho.far = c.top.far;
  camera.fov = c.classic.fov;
  camera.near = c.classic.near;
  camera.far = c.classic.far;
  camera.updateProjectionMatrix();
  controls.maxPolarAngle = (c.classic.maxPolarDeg * Math.PI) / 180;
  fitOrtho();
  if (tv.on) placeTop();
  else if (typeof View3D === 'undefined' || !View3D.placeSeatCamera(ui.camAngle)) {
    const pose = CameraCfg.classicPose(c, ui.camAngle);
    camera.position.fromArray(pose.position);
    controls.target.fromArray(pose.target);
  }
  ui.dirty = true;
});
CameraCfg.load();
setTopView(true); // default camera: top view
sync();
MenuUI.show();
function frame() {
  // a hidden tab: no rendering, and the animations are fast-forwarded (the camera arrives, cards land) so the game logic never waits for them
  let busy;
  if (document.hidden) {
    busy = false;
    for (let i = 0; i < 70 && animate(); i++);
  } else busy = animate();
  if (typeof View3D === 'undefined' || !View3D.ownsCamera()) controls.update(); // a camera animation drives the camera
  if (ui.hoverDirty && !ui.drag) {
    ui.hoverDirty = false;
    updateHover();
  }
  const now = performance.now();
  if (!document.hidden && (busy || ui.dirty || (ui.pulse && now - ui.lastPulse > 33))) {
    ui.dirty = false;
    ui.lastPulse = now;
    if (typeof View3D === 'undefined' || !View3D.render(renderer, scene, cam)) renderer.render(scene, cam); // the 3D hands are drawn over the board
  }
}
(function loop() {
  // idle = no rendering, no raycasts
  requestAnimationFrame(loop);
  frame();
})();
setInterval(() => {
  if (document.hidden && Settings.get('runHidden')) frame(); // animation frames stop in a hidden tab: a timer drives the frame instead
}, 250);

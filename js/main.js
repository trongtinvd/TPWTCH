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
setTopView(true); // default camera: top view
sync();
MenuUI.show();
(function loop() {
  // idle = no rendering, no raycasts
  requestAnimationFrame(loop);
  const busy = animate();
  controls.update();
  if (ui.hoverDirty && !ui.drag) {
    ui.hoverDirty = false;
    updateHover();
  }
  const now = performance.now();
  if (busy || ui.dirty || (ui.pulse && now - ui.lastPulse > 33)) {
    ui.dirty = false;
    ui.lastPulse = now;
    renderer.render(scene, cam);
  }
})();

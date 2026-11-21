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
function frame() {
  // a hidden tab: no rendering, and the animations are fast-forwarded (the camera arrives, cards land) so the game logic never waits for them
  let busy;
  if (document.hidden) {
    busy = false;
    for (let i = 0; i < 70 && animate(); i++);
  } else busy = animate();
  controls.update();
  if (ui.hoverDirty && !ui.drag) {
    ui.hoverDirty = false;
    updateHover();
  }
  const now = performance.now();
  if (!document.hidden && (busy || ui.dirty || (ui.pulse && now - ui.lastPulse > 33))) {
    ui.dirty = false;
    ui.lastPulse = now;
    renderer.render(scene, cam);
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

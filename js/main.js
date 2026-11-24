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
  if (typeof View3D === 'undefined' || !View3D.ownsCamera()) controls.update(); // Patch8: a camera animation drives the camera
  if (ui.hoverDirty && !ui.drag) {
    ui.hoverDirty = false;
    updateHover();
  }
  const now = performance.now();
  if (!document.hidden && (busy || ui.dirty || (ui.pulse && now - ui.lastPulse > 33))) {
    ui.dirty = false;
    ui.lastPulse = now;
    if (typeof View3D === 'undefined' || !View3D.render(renderer, scene, cam)) renderer.render(scene, cam); // Patch9: the 3D hands are drawn over the board
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

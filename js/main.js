// main.js - ENTRY POINT: console hook, default camera, first sync, render loop.
// Classic script: shares one global scope with the other js/*.js files; load order matters (see index.html).

window.cardGame = {Sim, send, undo, eventLog, history, selfTest, get game(){ return sim; }};   // console/testing hook
setTopView(true);                                   // default camera: top view
sync();
(function loop(){                                   // idle = no rendering, no raycasts
  requestAnimationFrame(loop);
  const busy = animate(); controls.update();
  if (hoverDirty && !drag){ hoverDirty = false; updateHover(); }
  const now = performance.now();
  if (busy || dirty || (pulse && now - lastPulse > 33)){ dirty = false; lastPulse = now; renderer.render(scene, cam); }
})();

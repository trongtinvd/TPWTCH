// camera-config.js - where the cameras are set. Every camera parameter lives in a config file, none in the source code:
//   config/camera.json   (this file reads it) the TOP view (height, screen rotation, frustum, zoom and pan limits), the classic side camera
//                        (position, target, FOV, clipping, orbit limit; used when the 3D view is not available) and the seat turn
//                        (how far the camera turns for the Opponent seat, and how fast)
//   config/camera3d.json (js/anim/view3d.js reads it) the 3D side view: position + target OR rotationDeg, FOV, clipping, orbit, hands
// Both files are written for the Player seat; the Opponent seat is the same turned by seat.opponentYawDeg round the table centre.
// The file loads when the page opens (and again with CameraCfg.load()); a missing or broken file keeps the defaults below.
const CameraCfg = (function () {
  const DEFAULTS = {
    seat: { opponentYawDeg: 180, turnSpeed: 0.12 },
    top: {
      height: 60,
      rotationDeg: 0,
      near: 0.1,
      far: 200,
      minHalfHeight: 13.8,
      halfHeightAspect: 11.4,
      zoomMin: 0.6,
      zoomMax: 4,
      zoomSpeed: 0.001,
      panLimit: 14,
    },
    classic: { position: [3, 29, 22], target: [0, 0, 0], fov: 45, near: 0.1, far: 200, maxPolarDeg: 87.135 },
  };
  const num = (v, d, min, max) =>
    typeof v === 'number' && isFinite(v)
      ? Math.min(max == null ? Infinity : max, Math.max(min == null ? -Infinity : min, v))
      : d;
  const vec3 = (v, d) =>
    Array.isArray(v) && v.length === 3 && v.every(x => typeof x === 'number' && isFinite(x)) ? v.slice() : d.slice();
  // a config file -> complete settings (every missing or wrong value takes its default; pure, tested headless)
  function normalize(j) {
    j = j && typeof j === 'object' ? j : {};
    const S = j.seat || {},
      T = j.top || {},
      C = j.classic || {},
      d = DEFAULTS;
    const top = {
      height: num(T.height, d.top.height, 1),
      rotationDeg: num(T.rotationDeg, d.top.rotationDeg),
      near: num(T.near, d.top.near, 0.001),
      far: num(T.far, d.top.far, 1),
      minHalfHeight: num(T.minHalfHeight, d.top.minHalfHeight, 0.5),
      halfHeightAspect: num(T.halfHeightAspect, d.top.halfHeightAspect, 0),
      zoomMin: num(T.zoomMin, d.top.zoomMin, 0.05),
      zoomMax: num(T.zoomMax, d.top.zoomMax, 0.05),
      zoomSpeed: num(T.zoomSpeed, d.top.zoomSpeed, 0),
      panLimit: num(T.panLimit, d.top.panLimit, 0),
    };
    if (top.zoomMax < top.zoomMin) top.zoomMax = top.zoomMin;
    return {
      seat: {
        opponentYawDeg: num(S.opponentYawDeg, d.seat.opponentYawDeg),
        turnSpeed: num(S.turnSpeed, d.seat.turnSpeed, 0.01, 1),
      },
      top,
      classic: {
        position: vec3(C.position, d.classic.position),
        target: vec3(C.target, d.classic.target),
        fov: num(C.fov, d.classic.fov, 5, 170),
        near: num(C.near, d.classic.near, 0.001),
        far: num(C.far, d.classic.far, 1),
        maxPolarDeg: num(C.maxPolarDeg, d.classic.maxPolarDeg, 0, 180),
      },
    };
  }
  // the classic side camera for a seat angle (radians): the configured pose turned round the vertical axis
  function classicPose(c, angle) {
    const s = Math.sin(angle),
      k = Math.cos(angle),
      turn = v => [v[0] * k + v[2] * s, v[1], -v[0] * s + v[2] * k];
    return { position: turn(c.classic.position), target: turn(c.classic.target) };
  }
  let cur = normalize({}),
    state = 'defaults';
  const listeners = [];
  function load(url) {
    if (typeof fetch !== 'function') return Promise.resolve(false);
    return fetch(url || 'config/camera.json', { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(j => {
        cur = normalize(j);
        state = 'loaded';
        listeners.forEach(f => f(cur));
        return true;
      })
      .catch(e => {
        state = 'defaults (' + e.message + ')';
        console.warn('[camera] config/camera.json not loaded, defaults used (' + e.message + ')');
        return false;
      });
  }
  return {
    DEFAULTS,
    normalize,
    classicPose,
    load,
    get: () => cur,
    get state() {
      return state;
    },
    onChange: f => listeners.push(f),
    seatAngle: p => (p === 'Opponent' ? (cur.seat.opponentYawDeg * Math.PI) / 180 : 0),
  };
})();

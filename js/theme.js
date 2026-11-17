// theme.js - reads the design variables of css/theme.css, so the 3D scene follows the stylesheet (loaded before everything else)
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const cssStr = (n, d) => cssVar(n) || d;
const cssNum = (n, d) => {
  const v = parseFloat(cssVar(n));
  return isNaN(v) ? d : v;
};
const cssHex = (n, d) => {
  const v = cssVar(n);
  try {
    return v ? new THREE.Color(v).getHex() : d;
  } catch (e) {
    return d;
  }
};
const cssPair = (n, d) => {
  const v = cssVar(n).split(/\s+/).filter(Boolean);
  return v.length === 2 ? v : d;
};
const BOARD_RISE = cssNum('--board-rise', 0.45),
  ATTACK_RAISE = cssNum('--attack-raise', 0.2),
  ZONE_FX = {
    valid: cssHex('--zone-valid', 0x1f6b2f),
    current: cssHex('--zone-current', 0x7a5c14),
    hover: cssHex('--zone-hover', 0x44aa55),
    hoverCurrent: cssHex('--zone-hover-current', 0xc99a2a),
    plain: cssHex('--zone-hover-plain', 0x333333),
  };
const FX = {
  stack: cssNum('--fx-stack-ms', 1700), // a spell / ability card flying to or from the stack
  attack: cssNum('--fx-attack-ms', 700), // the same for an Attack object
  resolve: cssNum('--fx-resolve-ms', 700), // pause after a spell / ability resolved
};

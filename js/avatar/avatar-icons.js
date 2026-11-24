// avatar-icons.js - Patch12: the avatar icon next to a player's name (and in the selection scene). An outfit or character "icon.image"
// (a PNG) is shown when it loads; otherwise, or when it fails, a generated placeholder: the character's colour, a silhouette in the
// outfit's colour, a ring in its trim colour and the character's label (config/avatars.json, AvatarLogic.iconOf).
const AvatarIcons = (function () {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function svg(spec) {
    const L = esc(spec.label || '?'),
      fs = L.length > 2 ? 9 : L.length > 1 ? 12 : 15;
    return (
      '<svg viewBox="0 0 48 48" aria-hidden="true">' +
      '<circle cx="24" cy="24" r="22" fill="' +
      spec.background +
      '"/>' +
      '<path d="M24 11a8 8 0 1 1 0 16a8 8 0 1 1 0-16zM9 41c1.5-8 8-12 15-12s13.5 4 15 12a22 22 0 0 1-30 0z" fill="' +
      spec.color +
      '" opacity="0.92"/>' +
      '<circle cx="24" cy="24" r="22" fill="none" stroke="' +
      spec.ring +
      '" stroke-width="3"/>' +
      '<text x="24" y="44.5" text-anchor="middle" font-size="' +
      fs +
      '" font-weight="700" fill="#fff" stroke="rgba(0,0,0,.55)" stroke-width="2.5" paint-order="stroke">' +
      L +
      '</text>' +
      '</svg>'
    );
  }
  // el gets the icon of spec (null: an empty slot); the same spec twice changes nothing
  function render(el, spec) {
    if (!el) return;
    const key = spec ? JSON.stringify(spec) : '';
    if (el.dataset.icon === key) return;
    el.dataset.icon = key;
    el.title = spec ? spec.title : '';
    el.setAttribute('aria-label', spec ? 'Avatar: ' + spec.title : 'No avatar');
    if (!spec) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = svg(spec);
    if (spec.image) {
      const img = new Image();
      img.alt = '';
      img.onload = () => {
        if (el.dataset.icon === key) el.replaceChildren(img); // still the same avatar
      };
      img.src = spec.image; // a missing PNG keeps the generated icon
    }
  }
  return { render, svg };
})();

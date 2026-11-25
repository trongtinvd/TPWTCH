// settings.js - user settings, kept in localStorage through Store. Settings.get('runHidden'), Settings.set('runHidden', false)
const Settings = (function () {
  const KEY = 'tpw_settings',
    DEFAULTS = { runHidden: true, stops: null, targetConfirm: false }; // runHidden: keep the game running while the browser tab is hidden; targetConfirm: a spell / ability's targets are
  // sent only when Confirm is clicked (false: as soon as the last one is marked)
  let cur = null;
  function load() {
    try {
      cur = Object.assign({}, DEFAULTS, JSON.parse(Store.get(KEY) || '{}'));
    } catch (e) {
      cur = Object.assign({}, DEFAULTS);
    }
    return cur;
  }
  return {
    get: k => (cur || load())[k],
    set(k, v) {
      (cur || load())[k] = v;
      Store.set(KEY, JSON.stringify(cur));
    },
  };
})();

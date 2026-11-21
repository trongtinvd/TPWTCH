// settings.js - user settings, kept in localStorage through Store. Settings.get('runHidden'), Settings.set('runHidden', false)
const Settings = (function () {
  const KEY = 'tpw_settings',
    DEFAULTS = { runHidden: true }; // keep the game running while the browser tab is hidden
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

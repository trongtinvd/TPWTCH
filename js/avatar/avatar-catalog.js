// avatar-catalog.js - Patch12: loads config/stats.json and config/avatars.json once (again with reload()), normalised by AvatarLogic.
// AvatarCatalog.get() is null until they arrive; a file that cannot be read leaves an empty catalog (no characters) and a warning.
const AvatarCatalog = (function () {
  const URL = { stats: 'config/stats.json', avatars: 'config/avatars.json' };
  let cat = null,
    state = 'loading';
  const subs = [];
  const getJSON = url =>
    fetch(url, { cache: 'no-cache' }).then(r =>
      r.ok ? r.json() : Promise.reject(new Error(url + ': HTTP ' + r.status))
    );
  function load() {
    state = 'loading';
    return Promise.all([getJSON(URL.stats), getJSON(URL.avatars)])
      .then(([s, a]) => {
        cat = AvatarLogic.normalizeCatalog(a, AvatarLogic.normalizeStats(s));
        state = 'loaded';
        for (const e of cat.errors) console.warn('[avatar] ' + e);
      })
      .catch(e => {
        cat = AvatarLogic.normalizeCatalog({}, { stats: [] });
        state = 'failed: ' + e.message;
        console.warn(
          '[avatar] the avatar configs were not loaded (' +
            e.message +
            ')' +
            (location.protocol === 'file:'
              ? ': a file:// page cannot read config files, open the game through a web server'
              : '')
        );
      })
      .then(() => {
        subs.forEach(f => f(cat));
        return cat;
      });
  }
  let ready = load();
  return {
    URL,
    get: () => cat,
    get ready() {
      return ready;
    },
    get state() {
      return state;
    },
    reload: () => (ready = load()),
    onChange: f => subs.push(f),
  };
})();

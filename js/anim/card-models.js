// card-models.js - loads the 3D model of a card (assets/3dModels/cards/). One loader per model type, so a new kind of model
// (another file format, a model made by code) is one CardModels.register call and an entry type in Anim3DLogic.MODEL_TYPES; the
// gameplay code never reads any of this. Built in:
//   gltf   a .glb / .gltf file (Assets3D: loaded once, cloned per use, its animation clips kept)
//   script a JavaScript file that registers a builder: CardModelScripts[name] = (THREE, params) => Object3D. The object may carry
//          userData.select = t => {...} (t = 0..1) to draw its own selection animation, and userData.dispose() to free what it made.
// load(entry) resolves to { object, clips, kind } or null (missing file, bad script, unknown type): the caller shows a placeholder.
const CardModelScripts = (typeof window !== 'undefined' && window.CardModelScripts) || {};
if (typeof window !== 'undefined') window.CardModelScripts = CardModelScripts;
const CardModels = (function () {
  const D2R = Math.PI / 180,
    types = {},
    scripts = new Map(); // script url -> promise (a script is added to the page once)
  const register = (type, load) => {
    types[type] = load;
  };
  const loadScript = url => {
    if (!scripts.has(url))
      scripts.set(
        url,
        new Promise((res, rej) => {
          const el = document.createElement('script');
          el.src = url;
          el.onload = () => res(true);
          el.onerror = () => rej(new Error('script not found: ' + url));
          document.head.appendChild(el);
        })
      );
    return scripts.get(url);
  };
  register('gltf', e =>
    Assets3D.loadModel(e.path).then(m =>
      m ? { object: Assets3D.cloneScene(m.scene), clips: m.clips || [], kind: 'gltf' } : null
    )
  );
  register('script', e =>
    loadScript(e.path).then(() => {
      const b = CardModelScripts[e.builder];
      if (typeof b !== 'function')
        throw new Error('the script ' + e.path + ' registers no builder "' + e.builder + '"');
      const o = b(THREE, e.params || {});
      if (!o || !o.isObject3D) throw new Error('builder "' + e.builder + '" did not return a THREE.Object3D');
      return { object: o, clips: o.animations || [], kind: 'script' };
    })
  );
  // the entry's placement (scale, offset, rotation) goes on a holder, so a model keeps its own transform
  function place(entry, object) {
    const holder = new THREE.Object3D();
    holder.name = 'cardModel-' + entry.id;
    holder.add(object);
    holder.scale.setScalar(entry.scale);
    holder.position.fromArray(entry.offset);
    holder.rotation.set(...entry.rotationDeg.map(d => d * D2R));
    return holder;
  }
  function load(entry) {
    if (!entry || entry.type === 'none') return Promise.resolve(null);
    const f = types[entry.type];
    if (!f) return Promise.resolve(null);
    return Promise.resolve()
      .then(() => f(entry))
      .then(r => (r ? Object.assign(r, { holder: place(entry, r.object) }) : null))
      .catch(err => {
        console.warn('[card model] ' + entry.id + ': ' + (err && err.message ? err.message : err));
        return null;
      });
  }
  const INDEX = Anim3DLogic.MODEL_DIR + 'index.json';
  const loadIndex = () =>
    fetch(INDEX, { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .catch(e => {
        console.warn('[card model] ' + INDEX + ' not loaded (' + e.message + '): no card has a model');
        return {};
      });
  return { register, load, loadIndex, INDEX, types: () => Object.keys(types) };
})();

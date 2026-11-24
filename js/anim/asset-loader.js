// asset-loader.js - 3D asset loading for the side view. One loader per file extension (GLB / glTF first; FBX and the
// JSON formats below when their loader exists). Every file is fetched once and cached (a promise per URL); a model is cloned per
// card (SkeletonUtils keeps the skeleton of each clone separate), never loaded again. A failed file resolves to null: the caller
// falls back (placeholder cube, procedural clip, untouched camera), nothing throws.
//
// JSON formats (extension .json):
//   clips:  { "format": "three-clips", "clips": [ <THREE.AnimationClip.toJSON()>, ... ] }
//   camera: { "format": "tpw-camera", "duration": 1.2, "keys": [ { "t": 0, "position": [x,y,z], "target": [x,y,z], "fov": 45 }, ... ] }
const Assets3D = (function () {
  const loaders = {}, // ext -> { model(url), clips(url), camera(url) } each returning a promise
    cache = new Map(); // kind|url -> promise
  const extOf = url => ((url.split('?')[0].match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
  function register(exts, impl) {
    for (const e of [].concat(exts)) loaders[e.toLowerCase()] = Object.assign({}, loaders[e.toLowerCase()], impl);
  }
  const warn = (what, url, e) =>
    console.warn(
      '[3D] ' +
        what +
        ' failed: ' +
        url +
        (e ? ' (' + (e.message || (e.type === 'error' ? 'request failed / not found' : e)) + ')' : '')
    );
  function cached(kind, url, run) {
    const key = kind + '|' + url;
    if (!cache.has(key))
      cache.set(
        key,
        Promise.resolve()
          .then(run)
          .then(
            v => v || null,
            e => {
              warn(kind, url, e);
              return null;
            }
          )
      );
    return cache.get(key);
  }
  function via(kind, url) {
    if (!url) return Promise.resolve(null);
    const L = loaders[extOf(url)];
    if (!L || !L[kind]) {
      return cached(kind, url, () => {
        throw new Error('no ' + kind + ' loader for ".' + extOf(url) + '"');
      });
    }
    return cached(kind, url, () => L[kind](url));
  }
  // ---- GLB / glTF ----
  let gltf = null;
  const gltfLoad = url =>
    new Promise((res, rej) => {
      if (!THREE.GLTFLoader) return rej(new Error('THREE.GLTFLoader is not loaded'));
      gltf = gltf || new THREE.GLTFLoader();
      gltf.load(url, res, undefined, rej);
    });
  register(['glb', 'gltf'], {
    model: url => gltfLoad(url).then(g => ({ scene: g.scene, clips: g.animations || [] })),
    clips: url => gltfLoad(url).then(g => g.animations || []),
    camera: url =>
      gltfLoad(url).then(g => {
        let cam = null;
        g.scene.traverse(o => {
          if (!cam && o.isCamera) cam = o;
        });
        if (!cam || !(g.animations || []).length) throw new Error('needs a camera node and an animation');
        return { kind: 'node', scene: g.scene, camera: cam, clip: g.animations[0], duration: g.animations[0].duration };
      }),
  });
  // ---- FBX (only when examples/js/loaders/FBXLoader.js is on the page) ----
  if (THREE.FBXLoader) {
    const fbx = url => new Promise((res, rej) => new THREE.FBXLoader().load(url, res, undefined, rej));
    register('fbx', {
      model: url => fbx(url).then(o => ({ scene: o, clips: o.animations || [] })),
      clips: url => fbx(url).then(o => o.animations || []),
    });
  }
  // ---- JSON ----
  const json = url =>
    fetch(url).then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  register('json', {
    clips: url =>
      json(url).then(j => {
        if (!j || j.format !== 'three-clips' || !Array.isArray(j.clips)) throw new Error('not a "three-clips" file');
        return j.clips.map(c => THREE.AnimationClip.parse(c));
      }),
    camera: url =>
      json(url).then(j => {
        if (!j || j.format !== 'tpw-camera' || !Array.isArray(j.keys) || !j.keys.length)
          throw new Error('not a "tpw-camera" file');
        const keys = j.keys
          .filter(k => k && typeof k.t === 'number' && Array.isArray(k.position))
          .sort((a, b) => a.t - b.t);
        if (!keys.length) throw new Error('no usable keys');
        return { kind: 'keys', keys, duration: typeof j.duration === 'number' ? j.duration : keys[keys.length - 1].t };
      }),
  });

  // a clip only drives what the model has: tracks for missing nodes are dropped (a clip from another skeleton keeps nothing)
  function fitClip(clip, root) {
    const names = new Set();
    root.traverse(o => names.add(o.name));
    const keep = clip.tracks.filter(t => {
      const p = THREE.PropertyBinding.parseTrackName(t.name);
      return names.has(p.nodeName) || (p.nodeName && root.getObjectByProperty('uuid', p.nodeName));
    });
    if (!keep.length) return null;
    if (keep.length < clip.tracks.length)
      console.warn('[3D] ' + clip.name + ': ' + (clip.tracks.length - keep.length) + ' track(s) do not fit the model');
    return keep.length === clip.tracks.length ? clip : new THREE.AnimationClip(clip.name, clip.duration, keep);
  }
  const cloneScene = s =>
    THREE.SkeletonUtils && THREE.SkeletonUtils.clone ? THREE.SkeletonUtils.clone(s) : s.clone(true);
  return {
    register,
    loaders,
    extOf,
    loadModel: url => via('model', url),
    loadClips: url => via('clips', url),
    loadCamera: url => via('camera', url),
    fitClip,
    cloneScene,
    cacheSize: () => cache.size,
  };
})();

// 23-animation-templates.js - the animation templates (assets/templates/sample-card/, Docs/animationGuide.md) are valid as shipped.
// Run only these: node tests/run.js --only anim-templates
(function () {
  const { check, eq } = Tests.ctx;
  Tests.add('anim-templates', () => {
    if (typeof readRepoFile !== 'function')
      return check('the template files are checked headless only (node tests/run.js)', true);
    const dir = 'assets/templates/sample-card/',
      J = f => JSON.parse(readRepoFile(dir + f)),
      L = Anim3DLogic;
    const ch = J('character.json'),
      n = L.normalizeCharacters(ch),
      sc = n.characters['sample-card'];
    eq('character.json: no config error', n.errors, []);
    check(
      '...its clips come from the model (clip names, no file), the attack has both camera animations',
      sc.animations.idle[0].clip === 'Idle' &&
        !sc.animations.idle[0].file &&
        sc.animations.attack[0].camera.map(c => c.file.split('/').pop()).join() === 'camera_orbit.glb,camera_push.json'
    );
    const cam = J('camera_push.json');
    check(
      'camera_push.json is a "tpw-camera" file with sorted keys (t, position, target)',
      cam.format === 'tpw-camera' &&
        cam.keys.every(
          (k, i) => Array.isArray(k.position) && Array.isArray(k.target) && (!i || k.t > cam.keys[i - 1].t)
        )
    );
    const cm = J('card-model.json').cards,
      g = L.cardModelEntry(cm && { cards: cm }, '<card id, GLB>'),
      s = L.cardModelEntry({ cards: cm }, '<card id, script>');
    check(
      'card-model.json: the GLB entry and the script entry resolve',
      g.type === 'gltf' && g.select === 'Select' && s.type === 'script' && s.builder === 'templateModel'
    );
    check(
      'card-model-template.js registers the builder named in the entry',
      readRepoFile(dir + 'card-model-template.js').includes('.templateModel = function')
    );
    // the GLB files: glTF 2.0 binary, with the clips and the camera the templates name
    const glbJson = f => {
      const t = readRepoFile(dir + f),
        i = t.indexOf('{"asset"');
      return JSON.parse(t.slice(i, t.indexOf('BIN') > 0 ? t.lastIndexOf('}', t.indexOf('BIN')) + 1 : undefined));
    };
    const m = glbJson('sample-card.glb'),
      c = glbJson('camera_orbit.glb');
    eq(
      'sample-card.glb holds the clips Idle, Select, Attack',
      m.animations.map(a => a.name),
      ['Idle', 'Select', 'Attack']
    );
    check(
      'camera_orbit.glb holds a camera node and its animation',
      c.nodes[0].camera === 0 && c.animations.length === 1
    );
  });
})();

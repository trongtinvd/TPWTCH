// 25-hand-drag-status-preview.js - the opponent's hand drags like the own one (its own offset), the landscape status line moves up into the
// top row when there is room (and the opponent's hand moves up), a portrait button folds the stops, and the ?anim3d preview shows the
// side view characters (the default cube) and the avatars with an Animation list. Layout / drags / the page are checked in a browser.
// Run only these: node tests/run.js --only hand-drag-both,status-slot,stops-toggle,anim3d-preview-ids,anim3d-preview-animations
(function () {
  const { check, eq } = Tests.ctx;
  const L = Anim3DLogic,
    AL = AvatarLogic;
  const headless = typeof readRepoFile === 'function';
  const J = f => JSON.parse(readRepoFile(f));

  Tests.add('hand-drag-both', () => {
    const c = L.normalizeCamera({});
    eq('defaults: the opponent hand drags like the own one', c.hand.opponent.drag, L.DRAG_DEFAULTS);
    check('each hand keeps its own offset (two Settings keys)', L.HAND_SETTING.own !== L.HAND_SETTING.opponent);
    check('the own key is unchanged (stored offsets are kept)', L.HAND_SETTING.own === 'handOffset3d');
    const d = { min: -0.3, max: 0.3 };
    check(
      'clamped to the range',
      L.clampDrag(d, 0.9) === 0.3 && L.clampDrag(d, -2) === -0.3 && L.clampDrag(d, 0.1) === 0.1
    );
    check(
      'a stored value that is not a number = the default position',
      L.clampDrag(d, 'x') === 0 && L.clampDrag(d, NaN) === 0
    );
    check(
      'switched off by config, own hand unaffected',
      L.normalizeCamera({ hand: { opponent: { drag: { enabled: false } } } }).hand.opponent.drag.enabled === false &&
        L.normalizeCamera({ hand: { opponent: { drag: { enabled: false } } } }).hand.own.drag.enabled === true
    );
    if (!headless) return;
    const s = L.normalizeCamera(J('config/camera3d.json'));
    check(
      'shipped camera3d.json: the opponent hand drags, a range on both sides',
      s.hand.opponent.drag.enabled && s.hand.opponent.drag.min < 0 && s.hand.opponent.drag.max > 0
    );
    const h = s.hand.opponent,
      half = -h.offset[2] * Math.tan((s.fov * Math.PI) / 360); // visible half height at the hand's distance
    check('shipped: the opponent hand sits higher than before (y > 1.0)', h.offset[1] > 1.0);
    check('shipped: its centre stays in the top quarter, on screen', h.offset[1] < half && h.offset[1] > half / 2);
    const v = readRepoFile('js/anim/view3d.js');
    check(
      'view3d: the grab works on either hand zone (grabRole), offsets per role',
      /function grabRole/.test(v) && /handX\[r\]/.test(v)
    );
  });

  Tests.add('status-slot', () => {
    check('a narrow gap: no slot (the status line stays under the buttons)', AL.statusSlot(384, 600) === null);
    const s = AL.statusSlot(384, 858);
    check('a wide gap: centred between the row and the buttons', s && s.centre === 621);
    check('it never touches either side', s.maxW <= 858 - 384 - 24);
    check('a very wide gap: the line stays readable (<= 520 px)', AL.statusSlot(100, 2000).maxW === 520);
    check('buttons over the row (phone on its side): no slot', AL.statusSlot(384, 380) === null);
    if (!headless) return;
    const css = readRepoFile('css/avatar.css');
    check(
      'css: body.statusTop moves the status line to the top',
      /body\.statusTop #status\s*{[^}]*top:\s*calc\(12px/.test(css)
    );
  });

  Tests.add('stops-toggle', () => {
    if (!headless) return check('checked headless only', true);
    const host = readRepoFile('js/game/game-host.js'),
      css = readRepoFile('css/index.css'),
      bar = readRepoFile('js/view/stops-bar.js');
    check(
      'a "Stops" button among the bottom buttons, portrait only',
      /id: 'stops',[\s\S]{0,120}cls: 'pOnly'/.test(host)
    );
    check(
      'landscape hides that button',
      /orientation: landscape\)\s*{\s*#dbg \.abtn\.pOnly\s*{\s*display: none/.test(css)
    );
    check('portrait folds the stops when hidden', /#stops\.pfold\s*{\s*display: none/.test(css));
    check(
      'the choice is kept (Settings stopsPortrait), hidden by default',
      /PORTRAIT_KEY = 'stopsPortrait'/.test(bar) && /=== true/.test(bar)
    );
  });

  Tests.add('anim3d-preview-ids', () => {
    eq('a bare id is a card (old links keep working)', L.parsePreviewId('shark'), { kind: 'card', id: 'shark' });
    eq('the default cube', L.parsePreviewId('char:placeholder'), { kind: 'char', id: 'placeholder' });
    eq('an avatar with its outfit', L.parsePreviewId('avatar:bot/factory'), {
      kind: 'avatar',
      id: 'bot',
      outfit: 'factory',
    });
    eq('an avatar alone = its default outfit', L.parsePreviewId('avatar:epsy'), {
      kind: 'avatar',
      id: 'epsy',
      outfit: null,
    });
    check('nothing = nothing', L.parsePreviewId('') === null && L.parsePreviewId(null) === null);
    for (const [k, i, o] of [
      ['card', 'shark'],
      ['char', 'test-rig'],
      ['avatar', '8x12', 'default'],
    ])
      check(
        'round trip ' + k,
        JSON.stringify(L.parsePreviewId(L.previewId(k, i, o))) ===
          JSON.stringify(Object.assign({ kind: k, id: i }, k === 'avatar' ? { outfit: o } : {}))
      );
  });

  Tests.add('anim3d-preview-animations', () => {
    const cube = L.normalizeCharacters({}).characters.placeholder,
      o = L.characterAnimOptions(cube);
    eq(
      'the default cube: every category, each built-in',
      o.map(x => x.value),
      L.CATEGORIES.map(c => 'cat:' + c)
    );
    check(
      'labelled built-in',
      o.filter(x => x.value !== 'cat:finishing_attack').every(x => /built-in/.test(x.label))
    );
    eq('parse: a category', L.parseAnimOption('cat:idle'), { kind: 'cat', cat: 'idle' });
    eq('parse: one entry', L.parseAnimOption('entry:idle:rig_idle_look'), {
      kind: 'entry',
      cat: 'idle',
      id: 'rig_idle_look',
    });
    eq('parse: a clip of a card model', L.parseAnimOption('clip:Spin Fast'), { kind: 'clip', name: 'Spin Fast' });
    eq(
      'card model: the selection, then its clips',
      L.clipAnimOptions(['select', 'wave'], 'select').map(x => x.value),
      ['select', 'clip:select', 'clip:wave']
    );
    if (!headless) return;
    const chars = L.normalizeCharacters(J('config/characters.json')),
      rig = L.characterAnimOptions(chars.characters['test-rig']).map(x => x.value);
    check(
      'a character with two idles: "idle (random)" and each of them',
      ['cat:idle', 'entry:idle:rig_idle', 'entry:idle:rig_idle_look'].every(v => rig.includes(v))
    );
    const cat = AL.normalizeCatalog(J('config/avatars.json'), AL.normalizeStats(J('config/stats.json')));
    for (const c of cat.characters) {
      const ch = AL.resolve(cat, { character: c.id, outfit: c.defaultOutfit }),
        a = L.characterAnimOptions(ch, AL.OVERLAY);
      check(
        c.name + ': its five avatar categories, the overlay marked',
        AL.CATEGORIES.every(k => a.some(x => x.value === 'cat:' + k)) &&
          a.find(x => x.value === 'cat:' + AL.OVERLAY).overlay
      );
    }
    const html = readRepoFile('anim3d.html');
    check(
      'anim3d.html loads the character controller and the avatar scripts, and has the Animation list',
      [
        'js/anim/procedural.js',
        'js/anim/character.js',
        'js/avatar/avatar-logic.js',
        'js/avatar/avatar-catalog.js',
        'js/avatar/avatar-models.js',
      ].every(f => html.includes('src="' + f + '"')) && html.includes('id="pv-anim"')
    );
  });
})();

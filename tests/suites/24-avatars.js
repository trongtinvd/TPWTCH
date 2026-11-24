// 24-avatars.js - player avatars. The shipped character / outfit / stat configs, selection (six characters, outfits, defaults,
// invalid selections), the avatar animation categories (random without repeat, transitions, looping, held death), the wounded and
// death thresholds (from THIS duel's starting life), the duel recording the avatars (Sim, observations, replays), the CardPlayed event
// behind playing_card, where the 3D avatars stand (behind their board, facing each other), the hand drag limits, and that nothing in
// the selection scene or the in-game view names a character. Camera / layout / clicks are checked in a browser (Docs/AVATARS.md).
// Run only these: node tests/run.js --only avatar-
(function () {
  const { D, check, eq, start, take } = Tests.ctx;
  const AL = AvatarLogic;
  const headless = typeof readRepoFile === 'function';
  const J = f => JSON.parse(readRepoFile(f));
  const catalog = () => AL.normalizeCatalog(J('config/avatars.json'), AL.normalizeStats(J('config/stats.json')));
  const NAMES = ['Bot', 'Epsy', 'Urines', '8 by 12', 'Furiona', 'Finna Emily'];

  Tests.add('avatar-catalog', () => {
    if (!headless) return check('the config files are checked headless only (node tests/run.js)', true);
    const cat = catalog();
    eq('config/avatars.json + config/stats.json: no config error', cat.errors, []);
    eq(
      'six characters, named exactly as written, in this order',
      cat.characters.map(c => c.name),
      NAMES
    );
    eq(
      'the stats are the player stats of Docs/RULES.md, in order, each with an icon',
      cat.stats.list.map(s => s.name + (s.icon ? '+icon' : '')),
      ['Power', 'Defense', 'HP', 'Initial Distance', 'Speed', 'Acceleration'].map(n => n + '+icon')
    );
    check(
      'every character: a unique id, at least one outfit, a default outfit that exists, an animation set',
      new Set(cat.characters.map(c => c.id)).size === 6 &&
        cat.characters.every(
          c =>
            c.outfits.length &&
            c.outfits.some(o => o.id === c.defaultOutfit) &&
            c.anims &&
            c.anims.animations.idle.length
        )
    );
    check(
      'every outfit: a value for every stat (from the config), flavor text, an abilities list (empty for now)',
      cat.characters.every(c =>
        c.outfits.every(
          o =>
            cat.stats.list.every(s => typeof o.stats[s.id] === 'number') &&
            o.flavor.length > 10 &&
            Array.isArray(o.abilities)
        )
      )
    );
    check(
      'outfits differ: within a character, no two outfits have the same stats and look (meshes / materials)',
      cat.characters.every(c => {
        const k = c.outfits.map(o => JSON.stringify([o.stats, o.meshes, o.materials]));
        return new Set(k).size === k.length;
      })
    );
    check(
      'each character has its own placeholder (proportions, shapes and colours differ)',
      new Set(cat.characters.map(c => JSON.stringify([c.body.torso, c.body.head, c.body.materials.Body]))).size === 6
    );
    check(
      'no character has a GLB yet: the placeholder humanoid (model null)',
      cat.characters.every(c => c.model === null)
    );
    // a broken config: reported, the rest still loads
    const bad = AL.normalizeCatalog(
      {
        characters: [
          { id: 'a', name: 'A', outfits: [{ id: 'x', stats: { nope: 1 } }], defaultOutfit: 'y', animations: 'missing' },
          { id: 'a', name: 'A again', outfits: [{ id: 'x' }] },
          { id: 'b', name: 'B', outfits: [] },
          {
            id: 'c',
            outfits: [{ id: 'o' }, { id: 'o' }],
            animations: { animations: { idle: [{ id: 'i' }, { id: 'i' }], jump: [] } },
          },
        ],
      },
      AL.normalizeStats(J('config/stats.json'))
    );
    check(
      'a broken config: duplicate ids, unknown stat, missing default outfit / animation set, no outfit, unknown category are all reported',
      [
        'used twice',
        'unknown stat',
        'default outfit',
        'animation set',
        'at least one outfit',
        'unknown animation category',
      ].every(w => bad.errors.some(e => e.includes(w))) &&
        eq(
          '...and the valid characters still load',
          bad.characters.map(c => c.id),
          ['a', 'c']
        ) !== false
    );
  });

  Tests.add('avatar-selection', () => {
    if (!headless) return check('checked headless only', true);
    const cat = catalog();
    // < and > go through all six and wrap, each time with the new character's default outfit
    let s = AL.defaultSelection(cat, 0);
    const seen = [];
    for (let i = 0; i < 6; i++) {
      seen.push(AL.describe(cat, s).name + '/' + (s.outfit === cat.byId[s.character].defaultOutfit));
      s = AL.cycleCharacter(cat, s, 1);
    }
    eq(
      '> goes through all six characters (default outfit each time)',
      seen,
      NAMES.map(n => n + '/true')
    );
    eq('...and wraps to the first', AL.describe(cat, s).name, 'Bot');
    eq('< from the first goes to the last', AL.describe(cat, AL.cycleCharacter(cat, s, -1)).name, 'Finna Emily');
    // outfits
    const bot = cat.byId.bot,
      o1 = { character: 'bot', outfit: bot.outfits[0].id },
      o2 = AL.cycleOutfit(cat, o1, 1),
      d1 = AL.describe(cat, o1),
      d2 = AL.describe(cat, o2);
    check(
      'an outfit switch changes the outfit, its stats and its text, never the character',
      o2.character === 'bot' &&
        o2.outfit !== o1.outfit &&
        JSON.stringify(d1.stats) !== JSON.stringify(d2.stats) &&
        d1.flavor !== d2.flavor
    );
    eq('outfits wrap both ways', AL.cycleOutfit(cat, o1, -1).outfit, bot.outfits[bot.outfits.length - 1].id);
    eq(
      'the stats shown are the outfit config values, in the stats.json order',
      d2.stats.map(x => [x.id, x.value]),
      cat.stats.list.map(x => [x.id, bot.outfits[1].stats[x.id]])
    );
    check(
      'the resolved model and animations follow the selection (outfit materials and meshes travel with it)',
      AL.resolve(cat, o2).outfit.id === o2.outfit && AL.resolve(cat, o2).animations.idle.length > 0
    );
    // invalid selections
    check('an unknown outfit is not valid', !AL.isValid(cat, { character: 'bot', outfit: 'nope' }));
    check('an unknown character is not valid', !AL.isValid(cat, { character: 'nobody', outfit: 'factory' }));
    check('another character’s outfit is not valid', !AL.isValid(cat, { character: 'bot', outfit: 'apprentice' }));
    eq('fix: a bad outfit becomes the character’s default', AL.fix(cat, { character: 'epsy', outfit: 'x' }), {
      character: 'epsy',
      outfit: cat.byId.epsy.defaultOutfit,
    });
    eq(
      'fix: an unknown character becomes the seat default (opponent: the second character)',
      AL.fix(cat, null, 'Opponent').character,
      cat.characters[1].id
    );
    let r = 0;
    const rnd = () => ((r = (r * 9301 + 49297) % 233280), r / 233280);
    check(
      'the bot never takes the player’s character (200 draws), always with a valid outfit',
      Array.from({ length: 200 }, () => AL.botSelection(cat, { character: 'furiona' }, rnd)).every(
        x => x.character !== 'furiona' && AL.isValid(cat, x)
      )
    );
    eq(
      'what a duel records: ids only, junk dropped',
      AL.cleanSeats({ Player: { character: 'bot', outfit: 'factory', hack: 1 }, Opponent: { character: 5 } }),
      { Player: { character: 'bot', outfit: 'factory' }, Opponent: null }
    );
    const ic = AL.iconOf(cat, { character: '8x12', outfit: 'grid-runner' });
    check(
      'the icon follows character and outfit (label, outfit colours, title); no PNG yet: a generated one',
      ic.label === '8×12' &&
        ic.title === '8 by 12 · Grid Runner' &&
        ic.image === null &&
        JSON.stringify(ic) !== JSON.stringify(AL.iconOf(cat, { character: '8x12', outfit: 'sketch' }))
    );
  });

  Tests.add('avatar-animations', () => {
    eq('the avatar categories', AL.CATEGORIES, ['enter', 'idle', 'idle_wounded', 'dies', 'playing_card']);
    const n = Anim3DLogic.normCharacter(
      't',
      {
        animations: {
          enter: [{ id: 'e1' }],
          idle: [{ id: 'i1' }, { id: 'i2', file: 'assets/none.glb' }],
          idle_wounded: [{ id: 'w1', weight: 0.6 }],
          dies: [{ id: 'd1' }],
          playing_card: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3', procedural: 'throw' }],
        },
        transitions: [{ from: 'i1', to: 'p1', interpolation: { method: 'ease', duration: 0.2 } }],
      },
      [],
      AL.SPEC
    );
    check(
      'loop / one-shot: idle and idle_wounded loop; enter and playing_card play once and go back to idle; dies is held',
      n.animations.idle[0].loop === 'repeat' &&
        n.animations.idle_wounded[0].loop === 'repeat' &&
        n.animations.enter[0].then === 'idle' &&
        n.animations.playing_card[0].loop === 'once' &&
        n.animations.playing_card[0].then === 'idle' &&
        n.animations.dies[0].then === 'hold' &&
        n.die === 'dies'
    );
    check(
      'an overlay keeps its weight; a built-in clip is named by "procedural"',
      n.animations.idle_wounded[0].weight === 0.6 && n.animations.playing_card[2].procedural === 'throw'
    );
    let k = 0;
    const seq = [0, 0, 0.5, 0.9, 0.1, 0.99];
    const rnd = () => seq[k++ % seq.length];
    let last = null,
      repeats = 0;
    for (let i = 0; i < 30; i++) {
      const a = Anim3DLogic.pick(n.animations.playing_card, last, rnd);
      if (a.id === last) repeats++;
      last = a.id;
    }
    eq('random pick, never the same playing_card twice in a row when there is a choice', repeats, 0);
    check(
      'transitions are directional (idle -> card, not card -> idle)',
      !!Anim3DLogic.findTransition(n.transitions, 'i1', 'p1') && !Anim3DLogic.findTransition(n.transitions, 'p1', 'i1')
    );
    const errs = [];
    Anim3DLogic.normCharacter(
      't',
      { animations: { attack: [{ id: 'a' }], idle: [{ id: 'x' }, { id: 'x' }] } },
      errs,
      AL.SPEC
    );
    check(
      'a card category (attack) is unknown for an avatar; ids are unique per character',
      errs.some(e => e.includes('unknown animation category "attack"')) && errs.some(e => e.includes('used twice'))
    );
    if (!headless) return;
    const cat = catalog();
    check(
      'every shipped character has all five categories, each an array of uniquely named animations',
      cat.characters.every(c => {
        const ids = AL.CATEGORIES.flatMap(k => c.anims.animations[k].map(a => a.id));
        return AL.CATEGORIES.every(k => c.anims.animations[k].length) && new Set(ids).size === ids.length;
      })
    );
    check(
      'no shipped animation names a file yet: each plays its built-in clip (the placeholder fallback)',
      cat.characters.every(c => AL.CATEGORIES.every(k => c.anims.animations[k].every(a => !a.file && a.procedural)))
    );
  });

  Tests.add('avatar-life-state', () => {
    const L = AL.lifeState;
    eq(
      'starting life 20: 20 / 10 normal, 9 / 1 / 0 wounded (below half), -1 dead',
      [20, 10, 9, 1, 0, -1].map(x => L(x, 20)),
      ['normal', 'normal', 'wounded', 'wounded', 'wounded', 'dead']
    );
    eq('starting life 7 (half = 3.5): 4 normal, 3 wounded', [L(4, 7), L(3, 7)], ['normal', 'wounded']);
    // the threshold is THIS duel's starting life (the start dialog option), not a fixed number
    const s = Sim.create(5, DEFS.concat(FIXTURES), { rules: { life: 30 } });
    eq(
      'a duel started at 30 life: maxLife 30, 14 is wounded, 15 is not',
      [s.maxLife, L(14, s.maxLife), L(15, s.maxLife)],
      [30, 'wounded', 'normal']
    );
    eq('back up to half or more: normal again', L(16, 30), 'normal');
    eq('starting life 0: never wounded, -1 dead', [L(0, 0), L(-1, 0)], ['normal', 'dead']);
  });

  Tests.add('avatar-duel', () => {
    const av = { Player: { character: 'epsy', outfit: 'starlit' }, Opponent: { character: 'bot', outfit: 'factory' } };
    const s = Sim.create(11, DEFS.concat(FIXTURES), { avatars: av });
    eq('the duel records the avatars (state.avatars)', s.avatars, av);
    eq('no avatars given (old replays, tests): null seats', Sim.create(11, DEFS.concat(FIXTURES)).avatars, {
      Player: null,
      Opponent: null,
    });
    eq(
      'only plain ids are kept',
      Sim.create(1, DEFS, {
        avatars: {
          Player: { character: 'x'.repeat(65), outfit: 'o' },
          Opponent: { character: 'a', outfit: 'b', f: () => 1 },
        },
      }).avatars,
      { Player: null, Opponent: { character: 'a', outfit: 'b' } }
    );
    eq('both players see them (public)', Sim.observe(s, 'Opponent').avatars, av);
    eq('a snapshot (undo) keeps them', structuredClone(s).avatars, av);
    // playing a card: one CardPlayed per card played from the hand, a spell and a permanent alike
    const g = start(9);
    g.avatars = av;
    const z = take(g, 'Player', 'zap', 'hand'),
      r1 = D(g, { type: 'PlayCard', iid: z.iid });
    const cp = r1.events.filter(e => e.t === 'CardPlayed');
    check(
      'a spell from the hand: one CardPlayed event {iid, player}',
      cp.length === 1 && cp[0].iid === z.iid && cp[0].player === 'Player'
    );
    eq(
      '...the Player’s avatar plays playing_card, the Opponent’s nothing',
      [AL.cues(r1.events, 'Player'), AL.cues(r1.events, 'Opponent')],
      [['playing_card'], []]
    );
    const g2 = start(20),
      sd = take(g2, 'Player', 'soldier', 'hand'),
      r2 = D(g2, { type: 'PlayCard', iid: sd.iid, slot: 'Player|front|0' });
    check(
      'a creature from the hand: CardPlayed too',
      r2.ok && r2.events.filter(e => e.t === 'CardPlayed').length === 1
    );
    const r3 = D(g2, { type: 'Draw', player: 'Player' });
    eq('other commands: no CardPlayed', r3.events.filter(e => e.t === 'CardPlayed').length, 0);
    const bad = D(g2, { type: 'PlayCard', iid: 'nope' });
    eq('a refused PlayCard: no event at all', bad.events.length, 0);
    check(
      'the observed event hides nothing new (the iid is aliased like every other event)',
      Sim.observeEvents(structuredClone(g), g, r1.events, 'Opponent').some(
        e => e.t === 'CardPlayed' && e.player === 'Player'
      )
    );
    // same seed + same avatars + same commands: the same duel (replays)
    const run = () => {
      const x = Sim.create(9, DEFS.concat(FIXTURES), { avatars: av });
      for (const p of ['Player', 'Opponent']) D(x, { type: 'Start', player: p });
      return JSON.stringify(x);
    };
    check('determinism with avatars', run() === run());
  });

  Tests.add('avatar-placement', () => {
    const cat = AL.normalizeCatalog({}, { stats: [] }),
      lay = Anim3DLogic.boardLayout({}),
      sv = Object.assign({}, cat.sideView, { behind: 2, offsetX: 0.5, scale: 1.3 }),
      a = AL.placement(lay, sv, 'Player'),
      b = AL.placement(lay, sv, 'Opponent'),
      back = lay.zBack + lay.zone.depth / 2;
    check(
      'the Player’s avatar stands behind the Player’s back row (z beyond its far edge), the Opponent’s mirrored',
      a.z === back + 2 && b.z === -(back + 2)
    );
    check(
      'the offset along the row is mirrored, the scale is the configured one',
      a.x === 0.5 && b.x === -0.5 && a.scale === 1.3 && b.scale === 1.3
    );
    check('they face each other (half a turn apart)', Math.abs(Math.abs(a.facing - b.facing) - Math.PI) < 1e-9);
    if (!headless) return;
    const shipped = catalog().sideView;
    check('shipped: centred behind the board, at least 1 m behind it', shipped.offsetX === 0 && shipped.behind >= 1);
  });

  Tests.add('avatar-hand-drag', () => {
    const c = Anim3DLogic.normalizeCamera({});
    eq(
      'defaults: the own hand can be dragged, centre within 30% of the visible width',
      c.hand.own.drag,
      Anim3DLogic.DRAG_DEFAULTS
    );
    const x = Anim3DLogic.normalizeCamera({ hand: { own: { drag: { min: -2, max: 5, padding: -1 } } } }).hand.own.drag;
    check(
      'limits are clamped to +-0.49 (the hand’s centre stays on screen: it never disappears)',
      x.min === -0.49 && x.max === 0.49 && x.padding === 0
    );
    const y = Anim3DLogic.normalizeCamera({ hand: { own: { drag: { min: 0.2, max: 0.1 } } } }).hand.own.drag;
    check('the range always includes 0 (the default position)', y.min <= 0 && y.max >= 0.2);
    check(
      'switched off by config',
      Anim3DLogic.normalizeCamera({ hand: { own: { drag: { enabled: false } } } }).hand.own.drag.enabled === false
    );
    if (!headless) return;
    const d = Anim3DLogic.normalizeCamera(J('config/camera3d.json')).hand.own.drag;
    check('shipped camera3d.json: on, a range on both sides', d.enabled && d.min < 0 && d.max > 0);
  });

  Tests.add('avatar-no-hardcoded-characters', () => {
    if (!headless) return check('checked headless only', true);
    const files = [
      'js/screens/character-select.js',
      'js/avatar/avatar-view.js',
      'js/avatar/avatar-logic.js',
      'js/avatar/avatar-models.js',
      'js/avatar/avatar-icons.js',
    ];
    const ids = catalog()
      .characters.flatMap(c => [c.id, c.name])
      .filter(x => x.length > 3);
    const hits = [];
    for (const f of files) {
      const src = readRepoFile(f);
      for (const n of ids) if (src.includes("'" + n + "'") || src.includes('"' + n + '"')) hits.push(f + ': ' + n);
    }
    eq(
      'the selection scene and the avatar code name no character (everything comes from config/avatars.json)',
      hits,
      []
    );
    const html = readRepoFile('index.html');
    check(
      'index.html loads the avatar scripts in order (logic, catalog, models, icons, view) and the selection scene',
      ['avatar-logic', 'avatar-catalog', 'avatar-models', 'avatar-icons', 'avatar-view', 'character-select'].every(
        (f, i, a) => html.indexOf(f) > 0 && (!i || html.indexOf(f) > html.indexOf(a[i - 1]))
      )
    );
    check(
      'the life bar rows hold the avatar icon INSIDE them (one click area, no handler of its own)',
      (html.match(/<div class="av"><\/div>/g) || []).length === 2
    );
  });
})();

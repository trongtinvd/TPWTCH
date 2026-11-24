// 20-patch8.js - Patch8: the 3D side view logic (Anim3DLogic): board layout, camera config, character / animation config,
// random pick without a repeat, directional transitions, the cues read from the game (attack, finishing attack, get hit, die).
// Run only these: node tests/run.js --only 3d-
(function () {
  const { D, check, eq, start, take } = Tests.ctx;
  const L = Anim3DLogic;
  const near = (a, b) => Math.abs(a - b) < 1e-9;

  Tests.add('3d-board-layout', () => {
    const b = L.normalizeBoard({}),
      lay = L.boardLayout(b);
    eq('default zone is 2 x 2 m', [lay.zone.width, lay.zone.depth], [2, 2]);
    const pf = lay.slots['Player|front|2'],
      pb = lay.slots['Player|back|2'],
      of = lay.slots['Opponent|front|2'],
      ob = lay.slots['Opponent|back|2'];
    check('front and back row of a player: 1 m between the zones', near(pb.z - pf.z - 2, 1) && near(of.z - ob.z - 2, 1));
    check('the two front rows: 4 m between the zones', near(pf.z - of.z - 2, 4));
    check('the board is symmetric round its centre', near(pf.z, -of.z) && near(pf.x, of.x) && near(pf.x, 0));
    eq('columns: 2 m zones, 0.5 m apart', lay.slots['Player|front|3'].x - lay.slots['Player|front|2'].x, 2.5);
    check(
      'side zones are point-symmetric and outside the columns',
      near(lay.side.Playerdeck.x, -lay.side.Opponentdeck.x) &&
        near(lay.side.Playerdeck.z, -lay.side.Opponentdeck.z) &&
        lay.side.Playerdeck.x - 1 > lay.slots['Player|front|4'].x + 1
    );
    const c = L.boardLayout(L.normalizeBoard({ zone: { width: 3, depth: 1.5 }, rowGap: 2, frontGap: 6, columnGap: 0 }));
    check(
      'the layout follows the config (nothing hardcoded)',
      near(c.slots['Player|back|0'].z - c.slots['Player|front|0'].z - 1.5, 2) &&
        near(c.slots['Player|front|0'].z * 2 - 1.5, 6) &&
        near(c.slots['Player|front|1'].x - c.slots['Player|front|0'].x, 3)
    );
    const bad = L.normalizeBoard({ zone: { width: 'x' }, rowGap: -3, cardFit: 7 });
    eq('bad values fall back / clamp', [bad.zone.width, bad.rowGap, bad.cardFit], [2, 0, 1]);
    eq('models are shown for creatures by default', L.normalizeBoard({}).models.showFor, ['creature']);
  });

  Tests.add('3d-camera-config', () => {
    const c = L.normalizeCamera({ position: [1, 2, 3], target: [0, 0, 0], fov: 60, near: 0.5, far: 80 });
    eq('position, target, fov, near, far come from the config', [c.position, c.target, c.fov, c.near, c.far], [[1, 2, 3], [0, 0, 0], 60, 0.5, 80]);
    const d = L.normalizeCamera({ position: 'x', fov: 900 });
    check('a bad value falls back / clamps', d.position.join() === L.CAMERA_DEFAULTS.position.join() && d.fov === 170);
    const p0 = L.seatPose(c, 0, 2),
      p1 = L.seatPose(c, Math.PI, 2);
    check(
      'the Opponent seat is the Player seat turned half way round',
      near(p1.position[0], -1) && near(p1.position[2], -3) && near(p1.position[1], 2) && near(p0.position[2], 3)
    );
    const w = L.seatPose(Object.assign({}, c, { minAspect: 2 }), 0, 1);
    eq('a narrow screen moves the camera back along its view line', w.position, [2, 4, 6]);
    const r = L.normalizeCamera({ position: [0, 5, 10], rotationDeg: [-90, 0, 0], targetDistance: 5 });
    const pr = L.seatPose(r, 0, 2);
    check('rotationDeg replaces the target (looking straight down)', near(pr.target[1], 0) && near(pr.target[2], 10));
    const h = L.normalizeCamera({}).hand.own,
      xs = L.handSpread(9, h, 2, 1.6);
    check(
      'the hand spreads evenly and stays inside the view width',
      xs.length === 9 && near(xs[0], -xs[8]) && xs[8] - xs[0] + 1.6 * h.scale <= 2 * h.widthFrac + 1e-9
    );
    eq('an empty hand has no positions', L.handSpread(0, h, 2, 1.6), []);
  });

  const CH = {
    default: 'hero',
    cards: { knight: 'hero', wolf: 'nobody' },
    characters: {
      hero: {
        model: { path: 'assets/x.glb', scale: 2, heightOffset: 0.1 },
        defaults: { speed: 2, interpolation: { method: 'ease', duration: 0.4 } },
        animations: {
          idle: [{ id: 'idle_a', file: 'a.glb' }, { id: 'idle_b', file: 'b.glb', loop: 'pingpong' }],
          attack: [{ id: 'atk', file: 'c.glb', speed: 1.5, camera: [{ id: 'cam1', file: 'k.json' }, { id: 'cam1', file: 'k2.json' }] }],
          die: [{ id: 'die_a' }, { id: 'idle_a' }],
          dance: [{ id: 'd' }],
          enter: [{ file: 'no-id.glb' }],
        },
        transitions: [
          { from: 'idle_a', to: 'atk', animations: [{ id: 'tr1', file: 't.glb' }], interpolation: { method: 'warp', duration: 0.1 } },
          { from: 'atk', to: 'ghost' },
        ],
      },
    },
  };

  Tests.add('3d-character-config', () => {
    const cfg = L.normalizeCharacters(CH),
      h = cfg.characters.hero,
      has = s => cfg.errors.some(e => e.includes(s));
    check('animation ids must be unique within a character', has('"idle_a" is used twice'));
    check('camera animation ids must be unique within an entry', has('camera animation id "cam1" is used twice'));
    check('an unknown category is reported', has('unknown animation category "dance"'));
    check('an entry without an id is reported', has('every animation needs an "id"'));
    check('a transition to an unknown id is reported', has('unknown animation "ghost"'));
    check('a card mapped to an unknown character is reported and dropped', has('"nobody"') && !cfg.cards.wolf);
    eq('the eight categories always exist', Object.keys(h.animations), L.CATEGORIES);
    eq('model settings', [h.model.path, h.model.scale, h.model.heightOffset, h.model.faceOpponent], ['assets/x.glb', [2, 2, 2], 0.1, true]);
    eq(
      'loop defaults: idle repeats, attack once, die holds, explicit pingpong kept',
      [h.animations.idle[0].loop, h.animations.idle[1].loop, h.animations.attack[0].loop, h.animations.die[0].then],
      ['repeat', 'pingpong', 'once', 'hold']
    );
    eq('speed = entry speed x character speed', h.animations.attack[0].speed, 3);
    eq('a one-shot goes back to idle', h.animations.attack[0].then, 'idle');
    eq('the interpolation of the character is the default of its transitions', h.transitions[1].interpolation, { method: 'ease', duration: 0.4 });
    eq('a transition keeps its own interpolation', h.transitions[0].interpolation, { method: 'warp', duration: 0.1 });
    eq('finishing_attack without entries uses the attack entries', L.entriesFor(h, 'finishing_attack')[0].id, 'atk');
    eq('a category with no entries is empty (procedural animation)', L.entriesFor(h, 'stun'), []);
    eq('the card map and the default', [L.characterFor(cfg, 'knight').name, L.characterFor(cfg, 'giant').name], ['hero', 'hero']);
    const e = L.normalizeCharacters({});
    eq('no config at all: the placeholder for everyone, no errors', [L.characterFor(e, 'x').name, e.errors], ['placeholder', []]);
    eq('the placeholder has no model file (cube)', e.characters.placeholder.model.path, null);
  });

  Tests.add('3d-random-pick', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    let last = null,
      repeats = 0;
    const seen = new Set();
    let x = 7;
    const rnd = () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 300; i++) {
      const p = L.pick(list, last, rnd);
      if (p.id === last) repeats++;
      seen.add(p.id);
      last = p.id;
    }
    eq('several choices: never the same twice in a row, every one comes up', [repeats, seen.size], [0, 3]);
    eq('one choice: it repeats', [L.pick([{ id: 'a' }], 'a').id], ['a']);
    eq('nothing to pick: null', L.pick([], 'a'), null);
    check('the pick is random (not always the first other one)', (() => {
      const s = new Set();
      for (let i = 0; i < 60; i++) s.add(L.pick(list, 'a', rnd).id);
      return s.has('b') && s.has('c') && !s.has('a');
    })());
  });

  Tests.add('3d-transitions', () => {
    const t = L.normalizeCharacters(CH).characters.hero.transitions;
    eq('A -> B is found', L.findTransition(t, 'idle_a', 'atk').animations[0].id, 'tr1');
    eq('B -> A is not (transitions are directional)', L.findTransition(t, 'atk', 'idle_a'), null);
    eq('no transition between unrelated ids', L.findTransition(t, 'idle_b', 'atk'), null);
    const cam = L.normalizeCamera({ animation: { transitions: [{ from: 'c1', to: 'c2', interpolation: { method: 'cut' } }] } });
    eq(
      'camera transitions are their own list, also directional',
      [L.findTransition(cam.animation.transitions, 'c1', 'c2').interpolation.method, L.findTransition(cam.animation.transitions, 'c2', 'c1')],
      ['cut', null]
    );
  });

  // resolve an attack, keeping the events of every step
  function attack(s, iid) {
    const ev = [...D(s, { type: 'Attack', iid }).events];
    let n = 0;
    while ((s.stack.length || s.respond) && !s.choice && n++ < 40) ev.push(...D(s, { type: 'Pass', player: s.priority }).events);
    return ev;
  }
  Tests.add('3d-cues', () => {
    let s = start(8801);
    const k = take(s, 'Player', 'knight', 'board', 'Player|front|1'),
      v = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1');
    Sim.enterCombat(s);
    let cue = L.attackCue(attack(s, k.iid), s);
    eq('an attack that destroys what it hits is a finishing attack', [cue.attacker, cue.category], [k.iid, 'finishing_attack']);
    eq('the creature hit gets hit', cue.hits, [{ iid: v.iid, category: 'get_hit' }]);
    eq('then it dies: it went to the graveyard', L.leaveCategory(s.cards[v.iid]), 'die');
    s = start(8802);
    const w = take(s, 'Player', 'wolf', 'board', 'Player|front|1'),
      g = take(s, 'Opponent', 'giant', 'board', 'Opponent|front|1');
    Sim.enterCombat(s);
    cue = L.attackCue(attack(s, w.iid), s);
    eq('a hit that does not kill is a normal attack', [cue.category, cue.hits.length, s.cards[g.iid].loc], ['attack', 1, 'board']);
    s = start(8803);
    const k3 = take(s, 'Player', 'knight', 'board', 'Player|front|0');
    Sim.enterCombat(s);
    cue = L.attackCue(attack(s, k3.iid), s);
    eq('an empty column: the player is hit, not lethal at 16', [cue.category, cue.hits], ['attack', []]);
    s = start(8804);
    const k4 = take(s, 'Player', 'knight', 'board', 'Player|front|0');
    Tests.ctx.setLife(s, 'Opponent', 3);
    Sim.enterCombat(s);
    cue = L.attackCue(attack(s, k4.iid), s);
    eq('a hit that takes the player below 0 is a finishing attack', [s.life.Opponent, cue.category], [-1, 'finishing_attack']);
    eq('no hit at all: no cue', L.attackCue([{ t: 'TurnChanged' }], s), null);
    eq('leaving for the hand / exile / deck is not a death', ['hand', 'exile', 'deck'].map(loc => L.leaveCategory({ loc })), [null, null, null]);
    eq('a token that ceased to exist dies', L.leaveCategory({ loc: 'gone' }), 'die');
  });

  Tests.add('3d-shipped-config', () => {
    if (typeof readRepoFile !== 'function') return check('(browser: shipped config files are checked by node tests/run.js)', true);
    const j = f => JSON.parse(readRepoFile(f));
    const ch = L.normalizeCharacters(j('config/characters.json'));
    eq('config/characters.json has no errors', ch.errors, []);
    const b = L.boardLayout(L.normalizeBoard(j('config/board3d.json')));
    eq('config/board3d.json: 2 x 2 zones, rows 1 m apart, front rows 4 m apart', [b.zone.width, b.zone.depth, b.zBack - b.zFront - 2, 2 * b.zFront - 2], [2, 2, 1, 4]);
    const c = L.normalizeCamera(j('config/camera3d.json'));
    check('config/camera3d.json loads', c.fov > 0 && c.far > c.near);
    const camIds = new Set();
    for (const n in ch.characters)
      for (const cat of L.CATEGORIES) for (const a of ch.characters[n].animations[cat]) for (const x of a.camera) camIds.add(x.id);
    const bad = c.animation.transitions.filter(t => !camIds.has(t.from) || !camIds.has(t.to));
    eq('camera transitions name camera animations that exist', bad, []);
  });
})();

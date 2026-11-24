// anim-logic.js - Patch8: the pure part of the 3D side view (no THREE, no DOM, runs in the headless tests too).
// Config normalising (board, camera, characters), random pick without an immediate repeat, directional transitions,
// the 3D board layout, the seat camera pose and the animation cues read from the game events.
const Anim3DLogic = (function () {
  const CATEGORIES = [
    'enter',
    'idle',
    'attack',
    'attacking',
    'get_hit',
    'channeling_idle',
    'stun',
    'die',
    'finishing_attack',
  ];
  // Patch9: the Attack waits on the stack (loops until it resolves or is gone)
  // a category that keeps playing until something else is asked for
  const LOOPING = { idle: 1, channeling_idle: 1, stun: 1, attacking: 1 };
  const METHODS = ['crossfade', 'warp', 'ease', 'cut'];
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const vec = (v, d) =>
    Array.isArray(v) && v.length === d.length && v.every(x => typeof x === 'number' && isFinite(x))
      ? v.slice()
      : d.slice();
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

  // ---- board ---------------------------------------------------------------------------------------------------
  const BOARD_DEFAULTS = {
    zone: { width: 2, depth: 2 },
    columnGap: 0.5, // between two zones of the same row
    rowGap: 1, // between the front and the back row of one player
    frontGap: 4, // between the two front rows
    sideGap: 1, // between the outer column and the deck / graveyard / extra deck / exile zones
    cardFit: 0.9, // a card on the board fills this much of its zone
    models: { showFor: ['creature'], heightOffset: 0 },
    sword: { scale: 2, height: 1.6, flash: true }, // Patch9: the sword in the side view (size factor, metres above the card, flashing)
  };
  // Patch9: the side view sword
  function normSword(w) {
    w = isObj(w) ? w : {};
    const d = BOARD_DEFAULTS.sword;
    return {
      scale: Math.max(0.1, num(w.scale, d.scale)),
      height: Math.max(0, num(w.height, d.height)),
      flash: typeof w.flash === 'boolean' ? w.flash : d.flash,
    };
  }
  // Patch9: a hand of n cards in `room` (the width the card centres may use): spread as before while the cards fit (at most maxSp
  // apart); a bigger hand keeps minSp and scrolls. s = scroll in cards (clamped to 0..max). Returns { xs, max, s }.
  function scrollSpread(n, room, maxSp, minSp, s) {
    if (n <= 0) return { xs: [], max: 0, s: 0 };
    room = Math.max(0, room);
    const fit = n > 1 ? room / (n - 1) : 0;
    if (n < 2 || fit >= minSp) {
      const sp = n > 1 ? Math.min(maxSp, fit) : 0;
      return { xs: Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * sp || 0), max: 0, s: 0 };
    }
    const max = n - 1 - room / minSp,
      k = Math.min(max, Math.max(0, num(s, 0)));
    return { xs: Array.from({ length: n }, (_, i) => -room / 2 + (i - k) * minSp), max, s: k };
  }
  function normalizeBoard(j) {
    j = isObj(j) ? j : {};
    const z = isObj(j.zone) ? j.zone : {},
      m = isObj(j.models) ? j.models : {};
    return {
      zone: {
        width: Math.max(0.1, num(z.width, BOARD_DEFAULTS.zone.width)),
        depth: Math.max(0.1, num(z.depth, BOARD_DEFAULTS.zone.depth)),
      },
      columnGap: Math.max(0, num(j.columnGap, BOARD_DEFAULTS.columnGap)),
      rowGap: Math.max(0, num(j.rowGap, BOARD_DEFAULTS.rowGap)),
      frontGap: Math.max(0, num(j.frontGap, BOARD_DEFAULTS.frontGap)),
      sideGap: Math.max(0, num(j.sideGap, BOARD_DEFAULTS.sideGap)),
      cardFit: Math.min(1, Math.max(0.1, num(j.cardFit, BOARD_DEFAULTS.cardFit))),
      models: {
        showFor: Array.isArray(m.showFor)
          ? m.showFor.filter(x => typeof x === 'string')
          : BOARD_DEFAULTS.models.showFor,
        heightOffset: num(m.heightOffset, BOARD_DEFAULTS.models.heightOffset),
      },
      sword: normSword(j.sword), // Patch9
    };
  }
  // Board coordinates: x = columns (column 1 on the left for the Player), z = towards the Player, y = up, metres.
  // The board centre (0, 0, 0) is the middle of the gap between the two front rows.
  function boardLayout(b) {
    b = b && b.zone ? b : normalizeBoard(b);
    const W = b.zone.width,
      D = b.zone.depth,
      px = W + b.columnGap,
      zFront = b.frontGap / 2 + D / 2,
      zBack = zFront + D + b.rowGap,
      slots = {},
      side = {};
    for (const owner of ['Player', 'Opponent']) {
      const s = owner === 'Player' ? 1 : -1;
      for (let col = 0; col < 5; col++) {
        slots[owner + '|front|' + col] = { x: (col - 2) * px, z: s * zFront };
        slots[owner + '|back|' + col] = { x: (col - 2) * px, z: s * zBack };
      }
    }
    const sx = 2 * px + W + b.sideGap; // centre of a side zone
    // point-symmetric like the top view: the Player's deck and graveyard on the right, extra deck and exile on the left
    side.Playerdeck = { x: sx, z: zBack };
    side.Playergy = { x: sx, z: zFront };
    side.Playerextra = { x: -sx, z: zBack };
    side.Playerexile = { x: -sx, z: zFront };
    side.Opponentdeck = { x: -sx, z: -zBack };
    side.Opponentgy = { x: -sx, z: -zFront };
    side.Opponentextra = { x: sx, z: -zBack };
    side.Opponentexile = { x: sx, z: -zFront };
    return { slots, side, zone: { width: W, depth: D }, zFront, zBack, pitch: px };
  }

  // ---- camera --------------------------------------------------------------------------------------------------
  const CAMERA_DEFAULTS = {
    position: [0, 12, 16],
    target: [0, 0, 1.2],
    rotationDeg: null, // [x, y, z] Euler degrees (order YXZ). When given it replaces `target`
    targetDistance: 12, // with rotationDeg: how far ahead the orbit centre sits
    fov: 45,
    near: 0.1,
    far: 200,
    minAspect: 1.2, // a narrower screen (phone portrait) moves the camera back so the board width still fits
    orbit: { enabled: true, minDistance: 3, maxDistance: 45, maxPolarDeg: 85 },
    hand: {
      own: { offset: [0, -0.98, -3.2], tiltDeg: -25, scale: 0.17, spacing: 0.3, widthFrac: 0.92, zone: true },
      opponent: { offset: [0, 1.08, -3.6], tiltDeg: 20, scale: 0.12, spacing: 0.22, widthFrac: 0.7, zone: true },
    },
    animation: { blendIn: 0.25, blendOut: 0.35, speed: 1, transitions: [] },
  };
  function normHand(h, d) {
    h = isObj(h) ? h : {};
    return {
      offset: vec(h.offset, d.offset),
      tiltDeg: num(h.tiltDeg, d.tiltDeg),
      scale: Math.max(0.01, num(h.scale, d.scale)),
      spacing: Math.max(0, num(h.spacing, d.spacing)),
      widthFrac: Math.max(0.05, num(h.widthFrac, d.widthFrac)),
      zone: h.zone == null ? d.zone : !!h.zone,
      drag: normDrag(h.drag), // Patch12
    };
  }
  // Patch12: dragging the own hand sideways. min / max = how far its centre may go, as a fraction of the visible width at the hand
  // (-0.49 .. 0.49: the centre always stays on screen, so the hand never disappears); padding = extra grab room on the hand zone (m)
  const DRAG_DEFAULTS = { enabled: true, min: -0.3, max: 0.3, padding: 0.5 };
  function normDrag(g) {
    g = isObj(g) ? g : {};
    const lim = v => Math.min(0.49, Math.max(-0.49, v));
    const a = lim(num(g.min, DRAG_DEFAULTS.min)),
      b = lim(num(g.max, DRAG_DEFAULTS.max));
    return {
      enabled: g.enabled == null ? DRAG_DEFAULTS.enabled : !!g.enabled,
      min: Math.min(a, b, 0),
      max: Math.max(a, b, 0),
      padding: Math.max(0, num(g.padding, DRAG_DEFAULTS.padding)),
    };
  }
  // Patch13: either hand can be dragged; each keeps its own offset (Settings key per role), clamped to its drag range
  const HAND_SETTING = { own: 'handOffset3d', opponent: 'handOffset3dFoe' };
  const clampDrag = (d, x) => Math.min(d.max, Math.max(d.min, typeof x === 'number' && isFinite(x) ? x : 0));
  function normalizeCamera(j) {
    j = isObj(j) ? j : {};
    const D = CAMERA_DEFAULTS,
      o = isObj(j.orbit) ? j.orbit : {},
      h = isObj(j.hand) ? j.hand : {},
      a = isObj(j.animation) ? j.animation : {};
    return {
      position: vec(j.position, D.position),
      target: vec(j.target, D.target),
      rotationDeg: Array.isArray(j.rotationDeg) ? vec(j.rotationDeg, [0, 0, 0]) : null,
      targetDistance: Math.max(0.1, num(j.targetDistance, D.targetDistance)),
      fov: Math.min(170, Math.max(1, num(j.fov, D.fov))),
      near: Math.max(0.001, num(j.near, D.near)),
      far: Math.max(num(j.near, D.near) + 0.01, num(j.far, D.far)),
      minAspect: Math.max(0, num(j.minAspect, D.minAspect)),
      orbit: {
        enabled: o.enabled == null ? D.orbit.enabled : !!o.enabled,
        minDistance: num(o.minDistance, D.orbit.minDistance),
        maxDistance: num(o.maxDistance, D.orbit.maxDistance),
        maxPolarDeg: num(o.maxPolarDeg, D.orbit.maxPolarDeg),
      },
      hand: { own: normHand(h.own, D.hand.own), opponent: normHand(h.opponent, D.hand.opponent) },
      animation: {
        blendIn: Math.max(0, num(a.blendIn, D.animation.blendIn)),
        blendOut: Math.max(0, num(a.blendOut, D.animation.blendOut)),
        speed: Math.max(0.01, num(a.speed, D.animation.speed)),
        transitions: normTransitions(a.transitions, null, []),
      },
    };
  }
  const rotY = (p, a) => [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1], -p[0] * Math.sin(a) + p[2] * Math.cos(a)];
  // forward vector of an Euler (degrees, order YXZ, camera looks down -Z)
  function forwardOf(deg) {
    const x = (deg[0] * Math.PI) / 180,
      y = (deg[1] * Math.PI) / 180;
    return [-Math.sin(y) * Math.cos(x), Math.sin(x), -Math.cos(y) * Math.cos(x)];
  }
  // the camera pose for a seat: the config is written for the Player seat, the Opponent seat turns it half way round (angle PI)
  function seatPose(c, angle, aspect) {
    c = c && c.hand ? c : normalizeCamera(c);
    let pos = c.position.slice(),
      tgt = c.target.slice();
    if (c.rotationDeg) {
      const f = forwardOf(c.rotationDeg);
      tgt = [pos[0] + f[0] * c.targetDistance, pos[1] + f[1] * c.targetDistance, pos[2] + f[2] * c.targetDistance];
    }
    if (aspect > 0 && c.minAspect > 0 && aspect < c.minAspect) {
      const k = c.minAspect / aspect; // narrower view: same framing of the board width, further away
      pos = [tgt[0] + (pos[0] - tgt[0]) * k, tgt[1] + (pos[1] - tgt[1]) * k, tgt[2] + (pos[2] - tgt[2]) * k];
    }
    const out = {
      position: rotY(pos, angle || 0),
      target: rotY(tgt, angle || 0),
      fov: c.fov,
      near: c.near,
      far: c.far,
    };
    if (c.rotationDeg && !c.orbit.enabled)
      out.rotationDeg = [c.rotationDeg[0], c.rotationDeg[1] + ((angle || 0) * 180) / Math.PI, c.rotationDeg[2]];
    return out;
  }
  // evenly spread hand: offsets along the camera's x axis, never wider than the view allows
  function handSpread(n, h, visibleWidth, cardWidth) {
    if (n <= 0) return [];
    const cw = cardWidth * h.scale,
      room = Math.max(0, visibleWidth * h.widthFrac - cw),
      sp = n > 1 ? Math.min(h.spacing, room / (n - 1)) : 0;
    const out = [];
    for (let i = 0; i < n; i++) out.push((i - (n - 1) / 2) * sp);
    return out;
  }

  // ---- characters ----------------------------------------------------------------------------------------------
  const LOOP_MODES = ['repeat', 'once', 'pingpong'];
  function normInterp(v, d) {
    v = isObj(v) ? v : {};
    d = d || { method: 'crossfade', duration: 0.25 };
    return {
      method: METHODS.includes(v.method) ? v.method : d.method,
      duration: Math.max(0, num(v.duration, d.duration)),
    };
  }
  function normTransitions(list, defInterp, errors) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach((t, i) => {
      if (!isObj(t) || typeof t.from !== 'string' || typeof t.to !== 'string') {
        errors.push('transition ' + i + ': needs "from" and "to" animation ids');
        return;
      }
      out.push({
        from: t.from,
        to: t.to,
        animations: (Array.isArray(t.animations) ? t.animations : [])
          .filter(a => isObj(a) && typeof a.id === 'string')
          .map(a => ({
            id: a.id,
            file: typeof a.file === 'string' ? a.file : null,
            clip: typeof a.clip === 'string' ? a.clip : null,
            speed: Math.max(0.01, num(a.speed, 1)),
          })),
        interpolation: normInterp(t.interpolation, defInterp),
      });
    });
    return out;
  }
  // Patch12: spec = { categories, looping, die } (the avatar categories reuse this: Docs/animationGuide.md). Default = the card characters
  const CARD_SPEC = { categories: CATEGORIES, looping: LOOPING, die: 'die' };
  function normCharacter(name, j, errors, spec) {
    j = isObj(j) ? j : {};
    const S = spec || CARD_SPEC,
      CATS = S.categories,
      LOOP = S.looping || {},
      DIE = S.die || 'die';
    const err = m => errors.push(name + ': ' + m),
      m = isObj(j.model) ? j.model : {},
      d = isObj(j.defaults) ? j.defaults : {},
      defInterp = normInterp(d.interpolation, { method: 'crossfade', duration: 0.25 }),
      ids = new Set(),
      animations = {};
    const model = {
      path: typeof m.path === 'string' && m.path ? m.path : null, // null: the placeholder cube
      scale: Array.isArray(m.scale) ? vec(m.scale, [1, 1, 1]) : [num(m.scale, 1), num(m.scale, 1), num(m.scale, 1)],
      offset: vec(m.offset, [0, 0, 0]),
      rotationDeg: vec(m.rotationDeg, [0, 0, 0]),
      heightOffset: num(m.heightOffset, 0),
      faceOpponent: m.faceOpponent == null ? true : !!m.faceOpponent,
    };
    const src = isObj(j.animations) ? j.animations : {};
    for (const k of Object.keys(src)) if (!CATS.includes(k)) err('unknown animation category "' + k + '"');
    for (const cat of CATS) {
      animations[cat] = [];
      (Array.isArray(src[cat]) ? src[cat] : []).forEach((a, i) => {
        if (!isObj(a) || typeof a.id !== 'string' || !a.id)
          return err(cat + '[' + i + ']: every animation needs an "id"');
        if (ids.has(a.id)) return err('animation id "' + a.id + '" is used twice (ids must be unique per character)');
        ids.add(a.id);
        const cams = [],
          camIds = new Set();
        (Array.isArray(a.camera) ? a.camera : []).forEach((c, ci) => {
          if (!isObj(c) || typeof c.id !== 'string' || typeof c.file !== 'string')
            return err(a.id + '.camera[' + ci + ']: needs "id" and "file"');
          if (camIds.has(c.id)) return err(a.id + ': camera animation id "' + c.id + '" is used twice');
          camIds.add(c.id);
          cams.push({
            id: c.id,
            file: c.file,
            speed: Math.max(0.01, num(c.speed, 1)),
            space: ['character', 'world', 'seat'].includes(c.space) ? c.space : 'character',
            blendIn: c.blendIn == null ? null : Math.max(0, num(c.blendIn, 0)),
            blendOut: c.blendOut == null ? null : Math.max(0, num(c.blendOut, 0)),
          });
        });
        animations[cat].push({
          id: a.id,
          category: cat,
          file: typeof a.file === 'string' && a.file ? a.file : null, // null: the procedural animation of the category
          clip: typeof a.clip === 'string' ? a.clip : null,
          loop: LOOP_MODES.includes(a.loop) ? a.loop : LOOP[cat] ? 'repeat' : 'once',
          repetitions: Math.max(1, Math.round(num(a.repetitions, Infinity))) || Infinity,
          speed: Math.max(0.01, num(a.speed, 1)) * Math.max(0.01, num(d.speed, 1)),
          then: typeof a.then === 'string' ? a.then : cat === DIE ? 'hold' : LOOP[cat] ? null : 'idle',
          camera: cams,
          cameraChance: Math.min(1, Math.max(0, num(a.cameraChance, 1))),
          procedural: typeof a.procedural === 'string' && a.procedural ? a.procedural : null, // Patch12: which built-in clip stands in (no file)
          weight: Math.min(1, Math.max(0, num(a.weight, 1))), // Patch12: an overlay's weight (idle_wounded)
        });
      });
    }
    const transitions = normTransitions(j.transitions, defInterp, []);
    for (const t of transitions) {
      if (!ids.has(t.from)) err('transition from unknown animation "' + t.from + '"');
      if (!ids.has(t.to)) err('transition to unknown animation "' + t.to + '"');
      for (const a of t.animations) {
        if (ids.has(a.id)) err('transition animation id "' + a.id + '" clashes with an animation id');
        ids.add(a.id);
      }
    }
    return {
      name,
      model,
      animations,
      transitions,
      interpolation: defInterp,
      speed: Math.max(0.01, num(d.speed, 1)),
      categories: CATS, // Patch12: Character3D reads these three (a card character: the defaults)
      looping: LOOP,
      die: DIE,
    };
  }
  // characters.json: { "default": "<character>", "cards": { "<card id>": "<character>" }, "characters": { "<character>": {...} } }
  function normalizeCharacters(j) {
    j = isObj(j) ? j : {};
    const errors = [],
      characters = {};
    const src = isObj(j.characters) ? j.characters : {};
    for (const k of Object.keys(src)) characters[k] = normCharacter(k, src[k], errors);
    if (!characters.placeholder) characters.placeholder = normCharacter('placeholder', {}, errors);
    const cards = {};
    for (const [card, ch] of Object.entries(isObj(j.cards) ? j.cards : {})) {
      if (!characters[ch]) errors.push('card "' + card + '" uses unknown character "' + ch + '"');
      else cards[card] = ch;
    }
    let def = typeof j.default === 'string' ? j.default : 'placeholder';
    if (!characters[def]) {
      errors.push('default character "' + def + '" does not exist');
      def = 'placeholder';
    }
    return { characters, cards, default: def, errors };
  }
  const characterFor = (cfg, cardId) => cfg.characters[cfg.cards[cardId] || cfg.default] || cfg.characters.placeholder;
  // the list a category plays from: finishing_attack falls back on attack; an empty list = the procedural animation
  function entriesFor(ch, cat) {
    const l = ch.animations[cat] || [];
    if (l.length) return l;
    if (cat === 'finishing_attack' && ch.animations.attack.length) return ch.animations.attack;
    return [];
  }

  // ---- Patch13: the 3D preview page (anim3d.html) ----------------------------------------------------------------
  // What it can show, as one id (also the ?anim3d= value): a card's 3D model "<card id>" (as before), a side view character
  // "char:<name>" (characters.json; "char:placeholder" = the default cube) or an avatar "avatar:<character>/<outfit>".
  function parsePreviewId(s) {
    s = typeof s === 'string' ? s.trim() : '';
    let m;
    if ((m = /^char:(.+)$/.exec(s))) return { kind: 'char', id: m[1] };
    if ((m = /^avatar:([^/]+)(?:\/(.+))?$/.exec(s))) return { kind: 'avatar', id: m[1], outfit: m[2] || null };
    if ((m = /^card:(.+)$/.exec(s))) return { kind: 'card', id: m[1] };
    return s ? { kind: 'card', id: s } : null;
  }
  const previewId = (kind, id, outfit) =>
    kind === 'card' ? id : kind === 'avatar' ? 'avatar:' + id + (outfit ? '/' + outfit : '') : 'char:' + id;
  // the animations a character offers, grouped by category: "<category> (random)" (what the game plays: a random entry, or the
  // built-in one when the category has none) then each configured entry. The overlay category (avatars: idle_wounded) is marked:
  // it plays over idle. value: "cat:<category>" | "entry:<category>:<id>"
  function characterAnimOptions(ch, overlay) {
    const cats = (ch && ch.categories) || CATEGORIES,
      out = [];
    for (const cat of cats) {
      const list = entriesFor(ch, cat),
        ov = cat === overlay;
      out.push({
        group: cat,
        value: 'cat:' + cat,
        label: cat + (ov ? ' (over idle)' : list.length > 1 ? ' (random)' : list.length ? '' : ' (built-in)'),
        overlay: ov,
      });
      if (list.length > 1 || (list.length && list[0].category !== cat))
        for (const a of list)
          out.push({
            group: cat,
            value: 'entry:' + cat + ':' + a.id,
            label: '  ' + a.id + (a.file ? '' : ' (built-in)'),
            overlay: ov,
          });
    }
    return out;
  }
  // a card model's animations: its selection animation, then every clip of the model (played once)
  function clipAnimOptions(clipNames, selectName) {
    const out = [
      { group: 'select', value: 'select', label: 'selection' + (selectName ? ' (clip "' + selectName + '")' : '') },
    ];
    for (const n of clipNames || []) out.push({ group: 'clips', value: 'clip:' + n, label: n });
    return out;
  }
  function parseAnimOption(v) {
    let m;
    if ((m = /^cat:(.+)$/.exec(v || ''))) return { kind: 'cat', cat: m[1] };
    if ((m = /^entry:([^:]+):(.+)$/.exec(v || ''))) return { kind: 'entry', cat: m[1], id: m[2] };
    if ((m = /^clip:(.+)$/.exec(v || ''))) return { kind: 'clip', name: m[1] };
    return { kind: 'select' };
  }

  // random pick that avoids repeating `lastId` when there is another choice
  function pick(list, lastId, rnd) {
    if (!list || !list.length) return null;
    const r = rnd || Math.random,
      pool = list.length > 1 && lastId != null ? list.filter(a => a.id !== lastId) : list;
    const l = pool.length ? pool : list;
    return l[Math.min(l.length - 1, Math.floor(r() * l.length))];
  }
  // transitions are directional: A -> B says nothing about B -> A
  const findTransition = (list, fromId, toId) => (list || []).find(t => t.from === fromId && t.to === toId) || null;

  // ---- cues from the game --------------------------------------------------------------------------------------
  // an Attack that hit: attack or finishing_attack for the attacker (finishing = it destroyed a creature it hit, or a player
  // it hit fell below 0 life), get_hit for each creature it hit
  function attackCue(events, post, attackerIid) {
    const hits = events.filter(
      e => (e.t === 'DamageDealt' && e.type === 'combat') || (e.t === 'PlayerDamaged' && e.combat)
    );
    const attacker = attackerIid || (hits.find(e => e.source) || {}).source || null;
    if (!attacker) return null;
    const dead = new Set(events.filter(e => e.t === 'PermanentDestroyed').map(e => e.iid));
    const lethal =
      hits.some(e => e.t === 'DamageDealt' && dead.has(e.target)) ||
      hits.some(e => e.t === 'PlayerDamaged' && post && post.life && post.life[e.player] < 0);
    return {
      attacker,
      category: lethal ? 'finishing_attack' : 'attack',
      hits: hits.filter(e => e.t === 'DamageDealt').map(e => ({ iid: e.target, category: 'get_hit' })),
    };
  }
  // a creature that left the board: die when it went to the graveyard (or a token ceased to exist), else it just leaves
  const leaveCategory = c => (!c || c.loc === 'gy' || c.loc === 'gone' ? 'die' : null);

  // ---- Patch10: 3D card models (assets/3dModels/cards/index.json), used by the standalone preview (?anim3d) -------------------------
  // index = { dir, byConvention, cards: { <card id>: entry } }. An entry: { type: 'gltf', path } (a .glb / .gltf file) or
  // { type: 'script', path, builder, params } (a script that registers CardModelScripts[builder](THREE, params) -> Object3D).
  // A path is relative to dir unless it starts with "assets/" (anywhere in the repo), "/" or a scheme (https:).
  // Optional on both: scale, offset [x, y, z], rotationDeg [x, y, z], select (the name of the clip played when the card is selected).
  // A card without an entry: <dir>/<id>.glb when byConvention is true, else no model (the preview shows a placeholder).
  // New model types: add the type here and a loader in js/anim/card-models.js (CardModels.register); gameplay never reads this.
  const MODEL_TYPES = ['gltf', 'script'];
  const MODEL_DIR = 'assets/3dModels/cards/';
  function cardModelEntry(index, id) {
    const ix = isObj(index) ? index : {},
      dir = typeof ix.dir === 'string' && ix.dir ? ix.dir.replace(/\/?$/, '/') : MODEL_DIR,
      cards = isObj(ix.cards) ? ix.cards : {},
      problems = [];
    let e = cards[id],
      from = 'index';
    if (e === undefined) {
      if (ix.byConvention !== true) return { id, type: 'none', from: 'none', problems };
      e = { type: 'gltf', path: dir + id + '.glb' };
      from = 'convention';
    }
    if (!isObj(e)) return { id, type: 'none', from, problems: ['entry is not an object'] };
    let type = e.type;
    if (type === undefined && typeof e.path === 'string') type = /\.js$/i.test(e.path) ? 'script' : 'gltf';
    if (!MODEL_TYPES.includes(type)) return { id, type: 'none', from, problems: ['unknown model type "' + type + '"'] };
    const path =
      typeof e.path === 'string' && e.path ? (/^(\w+:|\/|assets\/)/.test(e.path) ? e.path : dir + e.path) : '';
    if (!path) problems.push('no path');
    if (type === 'script' && (typeof e.builder !== 'string' || !e.builder))
      problems.push('a script model needs a builder name');
    if (problems.length) return { id, type: 'none', from, problems };
    return {
      id,
      type,
      from,
      path,
      builder: type === 'script' ? e.builder : null,
      params: isObj(e.params) ? e.params : {},
      scale: num(e.scale, 1) > 0 ? num(e.scale, 1) : 1,
      offset: vec(e.offset, [0, 0, 0]),
      rotationDeg: vec(e.rotationDeg, [0, 0, 0]),
      select: typeof e.select === 'string' ? e.select : null,
      problems,
    };
  }
  // which clip plays when the card is selected: the entry's `select`, else a clip whose name contains "select", else none (procedural)
  const selectClipName = (entry, names) => {
    const L = names || [];
    if (entry && entry.select && L.includes(entry.select)) return entry.select;
    return L.find(n => /select/i.test(n)) || null;
  };

  return {
    CATEGORIES,
    LOOPING,
    METHODS,
    normCharacter, // Patch12: also used for the avatars (js/avatar/avatar-logic.js)
    normTransitions,
    BOARD_DEFAULTS,
    CAMERA_DEFAULTS,
    DRAG_DEFAULTS, // Patch12
    normalizeBoard,
    normalizeCamera,
    normalizeCharacters,
    boardLayout,
    seatPose,
    handSpread,
    HAND_SETTING, // Patch13
    clampDrag,
    scrollSpread, // Patch9
    characterFor,
    entriesFor,
    pick,
    findTransition,
    attackCue,
    leaveCategory,
    MODEL_TYPES, // Patch10
    MODEL_DIR,
    cardModelEntry,
    selectClipName,
    parsePreviewId, // Patch13
    previewId,
    characterAnimOptions,
    clipAnimOptions,
    parseAnimOption,
  };
})();
if (typeof module !== 'undefined') module.exports = Anim3DLogic;

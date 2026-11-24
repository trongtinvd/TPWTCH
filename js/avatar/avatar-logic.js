// avatar-logic.js - Patch12: the pure part of the player avatars (no THREE, no DOM: runs in the headless tests too).
// config/stats.json (the player stats and their icons) and config/avatars.json (characters, outfits, animation sets, side view
// placement) are normalised here; the selection scene, the life bars and the 3D view only read the normalised catalog, so a new
// character or outfit is a config change. The Sim never reads any of this: a duel only records {character, outfit} per seat.
// Docs: Docs/AVATARS.md (adding characters / outfits / models), Docs/animationGuide.md (avatar animations).
const AvatarLogic = (function () {
  const CATEGORIES = ['enter', 'idle', 'idle_wounded', 'dies', 'playing_card'];
  const LOOPING = { idle: 1, idle_wounded: 1 }; // keep playing until something else is asked for
  const OVERLAY = 'idle_wounded'; // plays OVER idle (its own node), not instead of it
  const SPEC = { categories: CATEGORIES, looping: LOOPING, die: 'dies' };
  const WOUNDED_BELOW = 0.5; // wounded while life < 50% of the duel's starting life
  const SEATS = ['Player', 'Opponent'];
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const str = (v, d) => (typeof v === 'string' && v ? v : d);
  const vec = (v, d) =>
    Array.isArray(v) && v.length === d.length && v.every(x => typeof x === 'number' && isFinite(x))
      ? v.slice()
      : d.slice();
  const COLOR = /^#[0-9a-fA-F]{6}$/;

  // ---- stats (config/stats.json) -------------------------------------------------------------------------------
  // { stats: [ { id, name, icon: <svg path data, 16 x 16 box> | <image path>, description } ] } - the order is the display order
  function normalizeStats(j) {
    const errors = [],
      list = [],
      seen = new Set();
    (isObj(j) && Array.isArray(j.stats) ? j.stats : []).forEach((s, i) => {
      if (!isObj(s) || !str(s.id)) return errors.push('stats[' + i + ']: needs an "id"');
      if (seen.has(s.id)) return errors.push('stat id "' + s.id + '" is used twice');
      seen.add(s.id);
      const icon = str(s.icon, '');
      list.push({
        id: s.id,
        name: str(s.name, s.id),
        icon,
        iconIsImage: /\.(png|svg|webp|jpe?g|gif)$/i.test(icon), // a file; otherwise SVG path data
        description: str(s.description, ''),
      });
    });
    return { list, byId: Object.fromEntries(list.map(s => [s.id, s])), errors };
  }

  // ---- characters and outfits (config/avatars.json) ------------------------------------------------------------
  const MATERIAL_KEYS = ['color', 'emissive'];
  function normMaterials(m, err) {
    const out = {};
    for (const [k, v] of Object.entries(isObj(m) ? m : {})) {
      const o = typeof v === 'string' ? { color: v } : isObj(v) ? v : null;
      if (!o) {
        err('material "' + k + '" must be a colour or {color, emissive, metalness, roughness}');
        continue;
      }
      const r = {};
      for (const c of MATERIAL_KEYS)
        if (o[c] != null) {
          if (COLOR.test(o[c])) r[c] = o[c];
          else err('material "' + k + '".' + c + ': "' + o[c] + '" is not a #rrggbb colour');
        }
      for (const c of ['metalness', 'roughness']) if (typeof o[c] === 'number') r[c] = Math.min(1, Math.max(0, o[c]));
      out[k] = r;
    }
    return out;
  }
  const SHAPES = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'octahedron', 'dodecahedron'];
  // a placeholder part: { name, shape, size: [..], at: [x, y, z], rotationDeg: [x, y, z], material, attach }
  function normParts(list, err) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach((p, i) => {
      if (!isObj(p) || !str(p.name)) return err('parts[' + i + ']: needs a "name"');
      if (!SHAPES.includes(p.shape)) return err('part "' + p.name + '": unknown shape "' + p.shape + '"');
      out.push({
        name: p.name,
        shape: p.shape,
        size: Array.isArray(p.size) ? p.size.filter(x => typeof x === 'number' && x > 0) : [0.2],
        at: vec(p.at, [0, 0, 0]),
        rotationDeg: vec(p.rotationDeg, [0, 0, 0]),
        material: str(p.material, 'Accent'),
        attach: str(p.attach, 'Torso'),
        hidden: p.hidden === true, // an outfit shows it (meshes.show)
      });
    });
    return out;
  }
  function normVisual(v) {
    v = isObj(v) ? v : {};
    return {
      scale: Array.isArray(v.scale) ? vec(v.scale, [1, 1, 1]) : [num(v.scale, 1), num(v.scale, 1), num(v.scale, 1)],
      offset: vec(v.offset, [0, 0, 0]),
      rotationDeg: vec(v.rotationDeg, [0, 0, 0]),
      heightOffset: num(v.heightOffset, 0),
    };
  }
  // the placeholder humanoid: proportions, shapes and colours (js/avatar/avatar-models.js builds it)
  function normBody(b, err) {
    b = isObj(b) ? b : {};
    const t = isObj(b.torso) ? b.torso : {},
      h = isObj(b.head) ? b.head : {},
      a = isObj(b.arms) ? b.arms : {},
      l = isObj(b.legs) ? b.legs : {};
    const shape = (v, d, ok) => (ok.includes(v) ? v : d);
    return {
      torso: {
        shape: shape(t.shape, 'box', ['box', 'sphere', 'cylinder', 'cone']),
        size: vec(t.size, [0.6, 0.7, 0.35]),
      },
      head: {
        shape: shape(h.shape, 'sphere', ['box', 'sphere', 'cylinder', 'octahedron']),
        size: vec(h.size, [0.42, 0.42, 0.42]),
      },
      arms: { length: Math.max(0.1, num(a.length, 0.6)), thickness: Math.max(0.03, num(a.thickness, 0.14)) },
      legs: { length: Math.max(0.1, num(l.length, 0.7)), thickness: Math.max(0.03, num(l.thickness, 0.17)) },
      eyes: b.eyes !== false,
      materials: normMaterials(b.materials, err),
      parts: normParts(b.parts, err),
    };
  }
  function normIcon(v) {
    v = isObj(v) ? v : typeof v === 'string' ? { image: v } : {};
    return {
      image: str(v.image, null), // a PNG (or any image) path; null = the generated placeholder
      label: typeof v.label === 'string' ? v.label.slice(0, 4) : null,
      background: COLOR.test(v.background) ? v.background : null,
      color: COLOR.test(v.color) ? v.color : null,
      ring: COLOR.test(v.ring) ? v.ring : null,
    };
  }
  function normAbilities(list, err) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach((a, i) => {
      if (!isObj(a) || !str(a.id)) return err('abilities[' + i + ']: needs an "id"');
      out.push({ id: a.id, name: str(a.name, a.id), text: str(a.text, ''), data: isObj(a.data) ? a.data : null });
    });
    return out;
  }
  // a character's or an outfit's "animations": the name of an animation set, or an inline set
  function animSource(v, sets) {
    if (typeof v === 'string') return sets[v] || null;
    return isObj(v) ? v : null;
  }
  function normCatalog(j, stats) {
    j = isObj(j) ? j : {};
    stats = stats && stats.list ? stats : normalizeStats(stats);
    const errors = [],
      sets = isObj(j.animationSets) ? j.animationSets : {},
      characters = [],
      ids = new Set();
    const sv = isObj(j.sideView) ? j.sideView : {};
    const sideView = {
      behind: Math.max(0, num(sv.behind, 2.2)), // metres behind the back row
      offsetX: num(sv.offsetX, 0), // along the row (mirrored for the opponent)
      height: num(sv.height, 0),
      scale: Math.max(0.05, num(sv.scale, 1.6)),
    };
    (Array.isArray(j.characters) ? j.characters : []).forEach((c, i) => {
      if (!isObj(c) || !str(c.id)) return errors.push('characters[' + i + ']: needs an "id"');
      if (ids.has(c.id)) return errors.push('character id "' + c.id + '" is used twice');
      ids.add(c.id);
      const err = m => errors.push(c.id + ': ' + m);
      const outfits = [],
        oids = new Set();
      (Array.isArray(c.outfits) ? c.outfits : []).forEach((o, k) => {
        if (!isObj(o) || !str(o.id)) return err('outfits[' + k + ']: needs an "id"');
        if (oids.has(o.id)) return err('outfit id "' + o.id + '" is used twice');
        oids.add(o.id);
        const oerr = m => err(o.id + ': ' + m),
          st = {},
          sv = isObj(o.stats) ? o.stats : {};
        for (const k2 of Object.keys(sv)) if (!stats.byId[k2]) oerr('unknown stat "' + k2 + '"');
        for (const s of stats.list) st[s.id] = typeof sv[s.id] === 'number' && isFinite(sv[s.id]) ? sv[s.id] : null;
        const m = isObj(o.meshes) ? o.meshes : {};
        outfits.push({
          id: o.id,
          name: str(o.name, o.id),
          model: str(o.model, null), // a GLB that replaces the character's model for this outfit
          meshes: {
            show: (Array.isArray(m.show) ? m.show : []).filter(x => typeof x === 'string'),
            hide: (Array.isArray(m.hide) ? m.hide : []).filter(x => typeof x === 'string'),
          },
          materials: normMaterials(o.materials, oerr),
          parts: normParts(o.parts, oerr),
          visual: normVisual(o.visual),
          stats: st,
          abilities: normAbilities(o.abilities, oerr),
          flavor: str(o.flavor, ''),
          icon: normIcon(o.icon),
          animations: o.animations == null ? null : o.animations,
        });
      });
      if (!outfits.length) return err('needs at least one outfit (left out)');
      let def = str(c.defaultOutfit, outfits[0].id);
      if (!oids.has(def)) {
        err('default outfit "' + def + '" does not exist, "' + outfits[0].id + '" used');
        def = outfits[0].id;
      }
      const animSrc = animSource(c.animations, sets);
      if (c.animations != null && !animSrc) err('animation set "' + c.animations + '" does not exist');
      const anims = Anim3DLogic.normCharacter(c.id, animSrc || {}, errors, SPEC);
      for (const o of outfits)
        if (o.animations != null) {
          const src = animSource(o.animations, sets);
          if (!src) err(o.id + ': animation set "' + o.animations + '" does not exist');
          const oe = [];
          o.anims = src ? Anim3DLogic.normCharacter(c.id + '/' + o.id, src, oe, SPEC) : null;
          for (const e of oe) errors.push(e);
        } else o.anims = null;
      characters.push({
        id: c.id,
        name: str(c.name, c.id),
        model: str(c.model, null), // null = the placeholder humanoid of "body"
        body: normBody(c.body, err),
        visual: normVisual(c.visual),
        icon: normIcon(c.icon),
        outfits,
        defaultOutfit: def,
        anims,
      });
    });
    return {
      characters,
      byId: Object.fromEntries(characters.map(c => [c.id, c])),
      sideView,
      stats,
      errors: errors.concat(stats.errors || []),
    };
  }

  // ---- selection ------------------------------------------------------------------------------------------------
  const charOf = (cat, id) => (cat && cat.byId[id]) || null;
  const outfitOf = (ch, id) => (ch && ch.outfits.find(o => o.id === id)) || null;
  const isValid = (cat, sel) => !!(sel && outfitOf(charOf(cat, sel.character), sel.outfit));
  function defaultSelection(cat, index) {
    if (!cat || !cat.characters.length) return null;
    const c = cat.characters[(((index || 0) % cat.characters.length) + cat.characters.length) % cat.characters.length];
    return { character: c.id, outfit: c.defaultOutfit };
  }
  // a selection that is surely valid: the given one, the character with its default outfit, else the seat's default
  function fix(cat, sel, seat) {
    if (isValid(cat, sel)) return { character: sel.character, outfit: sel.outfit };
    const c = sel && charOf(cat, sel.character);
    if (c) return { character: c.id, outfit: c.defaultOutfit };
    return defaultSelection(cat, seat === 'Opponent' ? 1 : 0);
  }
  // the next / previous character (wraps); its default outfit is selected
  function cycleCharacter(cat, sel, dir) {
    if (!cat || !cat.characters.length) return null;
    const L = cat.characters,
      i = Math.max(
        0,
        L.findIndex(c => sel && c.id === sel.character)
      ),
      c = L[(((i + (dir < 0 ? -1 : 1)) % L.length) + L.length) % L.length];
    return { character: c.id, outfit: c.defaultOutfit };
  }
  function cycleOutfit(cat, sel, dir) {
    const c = sel && charOf(cat, sel.character);
    if (!c) return fix(cat, sel);
    const L = c.outfits,
      i = Math.max(
        0,
        L.findIndex(o => o.id === sel.outfit)
      ),
      o = L[(((i + (dir < 0 ? -1 : 1)) % L.length) + L.length) % L.length];
    return { character: c.id, outfit: o.id };
  }
  // the bot's avatar: a random character other than the player's, with its default outfit
  function botSelection(cat, avoid, rnd) {
    if (!cat || !cat.characters.length) return null;
    const L = cat.characters.filter(c => !avoid || c.id !== avoid.character),
      pool = L.length ? L : cat.characters,
      c = pool[Math.min(pool.length - 1, Math.floor((rnd || Math.random)() * pool.length))];
    return { character: c.id, outfit: c.defaultOutfit };
  }
  // what a duel records: {Player: {character, outfit} | null, Opponent: ...} - plain strings, nothing else
  function cleanSeats(a) {
    const out = { Player: null, Opponent: null };
    if (!isObj(a)) return out;
    for (const p of SEATS) {
      const s = a[p];
      if (isObj(s) && typeof s.character === 'string' && typeof s.outfit === 'string')
        out[p] = { character: s.character.slice(0, 64), outfit: s.outfit.slice(0, 64) };
    }
    return out;
  }

  // ---- what the screens read ------------------------------------------------------------------------------------
  // everything one selection shows: names, the stats in display order, abilities (or the flavour text), the icon
  function describe(cat, sel) {
    const c = sel && charOf(cat, sel.character),
      o = outfitOf(c, sel && sel.outfit);
    if (!c || !o) return null;
    return {
      character: c,
      outfit: o,
      name: c.name,
      outfitName: o.name,
      index: cat.characters.indexOf(c),
      count: cat.characters.length,
      outfitIndex: c.outfits.indexOf(o),
      outfitCount: c.outfits.length,
      stats: cat.stats.list.map(s => ({
        id: s.id,
        name: s.name,
        icon: s.icon,
        iconIsImage: s.iconIsImage,
        value: o.stats[s.id],
      })),
      abilities: o.abilities,
      flavor: o.flavor,
      icon: iconOf(cat, sel),
    };
  }
  function iconOf(cat, sel) {
    const c = sel && charOf(cat, sel.character),
      o = outfitOf(c, sel && sel.outfit);
    if (!c || !o) return null;
    const m = Object.assign({}, c.body.materials, o.materials),
      col = k => (m[k] && m[k].color) || null;
    return {
      image: o.icon.image || c.icon.image, // the outfit's own picture first, then the character's
      label: o.icon.label || c.icon.label || c.name.charAt(0),
      background: o.icon.background || c.icon.background || col('Skin') || '#334466',
      color: o.icon.color || c.icon.color || col('Body') || '#c9a54a',
      ring: o.icon.ring || c.icon.ring || col('Trim') || '#c9a54a',
      title: c.name + ' · ' + o.name,
    };
  }
  // the animated character Character3D plays (js/anim/character.js): the outfit's model / animations replace the character's
  function resolve(cat, sel) {
    const c = sel && charOf(cat, sel.character),
      o = outfitOf(c, sel && sel.outfit);
    if (!c || !o) return null;
    const base = o.anims || c.anims,
      v1 = c.visual,
      v2 = o.visual;
    const model = {
      path: o.model || c.model,
      scale: v1.scale.map((x, i) => x * v2.scale[i]),
      offset: v1.offset.map((x, i) => x + v2.offset[i]),
      rotationDeg: v1.rotationDeg.map((x, i) => x + v2.rotationDeg[i]),
      heightOffset: v1.heightOffset + v2.heightOffset,
      faceOpponent: true,
    };
    return Object.assign({}, base, { name: c.id + '/' + o.id, model, character: c, outfit: o });
  }

  // ---- in the duel ----------------------------------------------------------------------------------------------
  // 'dead' at -1 life or less (that player loses), 'wounded' below half of THIS duel's starting life, else 'normal'
  function lifeState(life, startLife) {
    if (typeof life !== 'number') return 'normal';
    if (life < 0) return 'dead';
    return startLife > 0 && life < startLife * WOUNDED_BELOW ? 'wounded' : 'normal';
  }
  // the one-shot animations a command's events ask of a seat's avatar
  function cues(events, seat) {
    const out = [];
    for (const e of events || []) if (e.t === 'CardPlayed' && e.player === seat) out.push('playing_card');
    return out;
  }
  // where an avatar stands in the side view: centre of the area behind its board (board coordinates: Anim3DLogic.boardLayout)
  function placement(layout, sideView, seat) {
    const s = seat === 'Opponent' ? -1 : 1,
      z = layout.zBack + layout.zone.depth / 2 + sideView.behind;
    return {
      x: s * sideView.offsetX,
      y: sideView.height,
      z: s * z,
      scale: sideView.scale,
      facing: seat === 'Player' ? Math.PI : 0,
    };
  }

  return {
    CATEGORIES,
    LOOPING,
    OVERLAY,
    SPEC,
    WOUNDED_BELOW,
    normalizeStats,
    normalizeCatalog: normCatalog,
    isValid,
    defaultSelection,
    fix,
    cycleCharacter,
    cycleOutfit,
    botSelection,
    cleanSeats,
    describe,
    iconOf,
    resolve,
    lifeState,
    cues,
    placement,
  };
})();

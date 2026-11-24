// character-select.js - Patch12: the character selection scene, between the start dialog (Start) and the duel (Confirm).
// Its own full-screen screen with its own three.js renderer and scenes (not a dialog over the menu): the selected character's name
// at the top; a large 3D model with < > under its feet; on the right the outfit (a small 3D preview of the SAME model in that
// outfit, with < >), the outfit's stats (icon + value, config/stats.json) and its abilities (none yet: its flavor text); Confirm.
// Everything shown comes from config/avatars.json (AvatarCatalog): nothing here names a character. Vs Self: Player 1 chooses, then
// Player 2. Vs Bot: the bot takes a random other character. Confirm passes {Player, Opponent} to the duel (cfg.avatars); Back returns
// to the start dialog with its settings. Keys: Left / Right = character, Up / Down = outfit, Enter = Confirm, Esc = Back.
const CharacterSelect = (function () {
  let root = null,
    el = {},
    cfg = null, // the start dialog's settings (kept as they are, plus avatars)
    steps = [], // the seats that choose: ['Player'] (Vs Bot) or ['Player', 'Opponent'] (Vs Self)
    step = 0,
    picks = {},
    sel = null,
    R = null,
    raf = 0,
    lastT = 0,
    big = null,
    small = null;
  const scenes = { big: null, small: null },
    cams = { big: null, small: null };
  const STORE = 'avatarPick';
  const seatName = p =>
    cfg.mode === 'bot' ? cfg.name1 || 'Player' : p === 'Player' ? cfg.name1 || 'Player 1' : cfg.name2 || 'Player 2';
  // ---- DOM -----------------------------------------------------------------------------------------------------
  function build() {
    root = mkEl('div', 'screen');
    root.id = 'charSelect';
    root.hidden = true;
    root.innerHTML =
      '<canvas class="cs-canvas"></canvas>' +
      '<div class="cs-top"><div class="cs-step"></div><h1 class="cs-name"></h1></div>' +
      '<div class="cs-main">' +
      '<section class="cs-left" aria-label="Character">' +
      '<div class="cs-view cs-big" aria-hidden="true"></div>' +
      '<div class="cs-nav"><button class="abtn cs-arrow" data-go="char-1" aria-label="Previous character">&lt;</button>' +
      '<span class="cs-count"></span>' +
      '<button class="abtn cs-arrow" data-go="char1" aria-label="Next character">&gt;</button></div>' +
      '</section>' +
      '<section class="cs-right" aria-label="Outfit">' +
      '<div class="cs-outfit"><div class="cs-h">Outfit</div>' +
      '<div class="cs-orow"><button class="abtn cs-arrow" data-go="outfit-1" aria-label="Previous outfit">&lt;</button>' +
      '<div class="cs-view cs-small" aria-hidden="true"></div>' +
      '<button class="abtn cs-arrow" data-go="outfit1" aria-label="Next outfit">&gt;</button></div>' +
      '<div class="cs-oname"></div></div>' +
      '<div class="cs-stats" role="list" aria-label="Stats"></div>' +
      '<div class="cs-abil"><div class="cs-h">Abilities</div><div class="cs-abody"></div></div>' +
      '<div class="cs-msg" hidden></div>' +
      '<div class="cs-actions"><button class="abtn c-pass cs-back">Back</button><button class="abtn c-go cs-ok">Confirm</button></div>' +
      '</section></div>';
    document.body.appendChild(root);
    for (const k of ['canvas', 'step', 'name', 'big', 'small', 'count', 'oname', 'stats', 'abody', 'msg', 'ok', 'back'])
      el[k] = root.querySelector('.cs-' + k);
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-go]');
      if (!b || b.disabled) return;
      const m = /^(char|outfit)(-?1)$/.exec(b.dataset.go);
      if (m) (m[1] === 'char' ? switchChar : switchOutfit)(+m[2]);
    });
    el.ok.onclick = confirm;
    el.back.onclick = back;
    addEventListener('keydown', onKey);
    addEventListener('resize', () => root && !root.hidden && fit());
  }
  function onKey(e) {
    if (!root || root.hidden || document.querySelector('.modal-bd')) return;
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight') switchChar(k === 'ArrowLeft' ? -1 : 1);
    else if (k === 'ArrowUp' || k === 'ArrowDown') switchOutfit(k === 'ArrowUp' ? -1 : 1);
    else if (k === 'Enter') confirm();
    else if (k === 'Escape') back();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  // ---- 3D ------------------------------------------------------------------------------------------------------
  function start3D() {
    R = new THREE.WebGLRenderer({ canvas: el.canvas, antialias: true, alpha: true });
    R.setPixelRatio(Math.min(devicePixelRatio, 2));
    R.setClearColor(0, 0);
    R.autoClear = false;
    for (const k of ['big', 'small']) {
      const S = new THREE.Scene();
      S.add(new THREE.HemisphereLight(0xdfe6ff, 0x26304a, 0.9));
      const L = new THREE.DirectionalLight(0xffffff, 0.8);
      L.position.set(2.5, 4, 5);
      S.add(L);
      const rim = new THREE.DirectionalLight(0xc9a54a, 0.5);
      rim.position.set(-3, 2.5, -4);
      S.add(rim);
      scenes[k] = S;
      cams[k] = new THREE.PerspectiveCamera(k === 'big' ? 30 : 28, 1, 0.05, 50);
    }
    // the stand under the big model's feet
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.95, 0.06, 40),
      new THREE.MeshStandardMaterial({ color: 0x1d2550, roughness: 0.6, metalness: 0.2, emissive: 0x0b0f26 })
    );
    disc.position.y = -0.03;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.018, 8, 60),
      new THREE.MeshBasicMaterial({ color: 0xc9a54a })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.005;
    scenes.big.add(disc, ring);
    scenes.big.userData.stand = [disc, ring];
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
    fit();
  }
  function stop3D() {
    cancelAnimationFrame(raf);
    raf = 0;
    dropModels();
    if (!R) return;
    for (const m of scenes.big.userData.stand) {
      m.geometry.dispose();
      m.material.dispose();
    }
    R.dispose();
    R.forceContextLoss();
    R = null;
    // a context-lost canvas cannot be used again: the next open gets a fresh one
    const c = mkEl('canvas', 'cs-canvas');
    el.canvas.replaceWith(c);
    el.canvas = c;
  }
  function fit() {
    if (!R) return;
    R.setSize(innerWidth, innerHeight, false);
  }
  function dropModels() {
    for (const m of [big, small]) if (m) m.dispose();
    big = small = null;
  }
  function makeModel(k, sel, first) {
    const ch = AvatarLogic.resolve(AvatarCatalog.get(), sel),
      inst = new Character3D('select-' + k, ch, 'Opponent', {
        art: () => AvatarModels.build(ch.character.body),
        prepare: (model, isGLB) => AvatarModels.applyOutfit(model, ch.outfit, isGLB),
        procClip: (entry, c) => AvatarModels.procClip(entry.procedural, entry.category, AvatarModels.hasLimbs(c.model)),
      });
    scenes[k].add(inst.root);
    inst.play(first);
    inst.ready$.then(() => frame3(k, inst)); // frame the model once it is built (the GLB may take a while)
    return inst;
  }
  // camera distance so the whole model fits its view
  function frame3(k, inst) {
    if (!inst.ready || inst.dead) return;
    const b = new THREE.Box3().setFromObject(inst.model),
      h = Math.max(0.6, b.max.y - Math.min(0, b.min.y)),
      cam = cams[k],
      d = (h * (k === 'big' ? 0.62 : 0.6)) / Math.tan((cam.fov * Math.PI) / 360) + (k === 'big' ? 0.6 : 0.4);
    cam.userData.fit = { y: h * (k === 'big' ? 0.47 : 0.62), d, look: h * (k === 'big' ? 0.45 : 0.55) };
  }
  function rect(div) {
    const r = div.getBoundingClientRect();
    return { x: r.left, y: innerHeight - r.bottom, w: r.width, h: r.height };
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    R.setScissorTest(false);
    R.clear();
    R.setScissorTest(true);
    for (const [k, inst, div] of [
      ['big', big, el.big],
      ['small', small, el.small],
    ]) {
      if (!inst) continue;
      inst.update(dt);
      if (k === 'small') inst.root.rotation.y += dt * 0.6; // the outfit preview turns
      const r = rect(div);
      if (r.w < 2 || r.h < 2) continue;
      const cam = cams[k],
        f = cam.userData.fit || { y: 1, d: 5, look: 0.9 };
      cam.aspect = r.w / r.h;
      const narrow = Math.max(1, 0.75 / cam.aspect); // a tall thin view: further away so the width still fits
      cam.position.set(0, f.y, f.d * narrow);
      cam.lookAt(0, f.look, 0);
      cam.updateProjectionMatrix();
      R.setViewport(r.x, r.y, r.w, r.h);
      R.setScissor(r.x, r.y, r.w, r.h);
      R.render(scenes[k], cam);
    }
  }

  // ---- selection -----------------------------------------------------------------------------------------------
  const seat = () => steps[step];
  function setSel(next, how) {
    const cat = AvatarCatalog.get();
    if (!cat || !next) return;
    const prev = sel;
    sel = AvatarLogic.fix(cat, next, seat());
    if (!sel) return;
    const charChanged = !prev || prev.character !== sel.character;
    if (prev && !charChanged && prev.outfit === sel.outfit && how !== 'force') return render();
    dropModels();
    big = makeModel('big', sel, charChanged ? 'enter' : 'idle');
    small = makeModel('small', sel, 'idle');
    render();
  }
  function switchChar(dir) {
    if (!sel) return;
    setSel(AvatarLogic.cycleCharacter(AvatarCatalog.get(), sel, dir));
  }
  function switchOutfit(dir) {
    if (!sel) return;
    setSel(AvatarLogic.cycleOutfit(AvatarCatalog.get(), sel, dir));
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function statIcon(s) {
    return s.iconIsImage
      ? '<img src="' + esc(s.icon) + '" alt="">'
      : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="' + esc(s.icon) + '"/></svg>';
  }
  function render() {
    const cat = AvatarCatalog.get(),
      d = sel && AvatarLogic.describe(cat, sel),
      many = steps.length > 1;
    el.step.textContent =
      (many ? 'Step ' + (step + 1) + ' of ' + steps.length + ' · ' : '') + seatName(seat()) + ', choose your character';
    el.ok.textContent = many && step < steps.length - 1 ? 'Confirm · next player' : 'Confirm';
    root.querySelectorAll('[data-go]').forEach(b => (b.disabled = !d));
    if (!d) {
      el.name.textContent = cat ? 'No characters' : 'Loading…';
      el.count.textContent = '';
      el.oname.textContent = '';
      el.stats.innerHTML = '';
      el.abody.innerHTML = '';
      const failed = cat && !cat.characters.length;
      el.msg.hidden = !failed;
      el.msg.textContent = failed
        ? 'The avatars could not be loaded (' + AvatarCatalog.URL.avatars + '): the duel starts without avatars.'
        : '';
      el.ok.disabled = !failed; // still loading: wait; nothing to choose from: play without avatars
      return;
    }
    el.msg.hidden = true;
    el.ok.disabled = !AvatarLogic.isValid(cat, sel); // an invalid selection cannot be confirmed
    el.name.textContent = d.name;
    el.count.textContent = d.index + 1 + ' / ' + d.count;
    el.oname.textContent =
      d.outfitName + (d.outfitCount > 1 ? '  (' + (d.outfitIndex + 1) + ' / ' + d.outfitCount + ')' : '');
    root.querySelectorAll('[data-go^="outfit"]').forEach(b => (b.disabled = d.outfitCount < 2));
    root.querySelectorAll('[data-go^="char"]').forEach(b => (b.disabled = d.count < 2));
    el.stats.innerHTML = d.stats
      .map(
        s =>
          '<div class="cs-stat" role="listitem" title="' +
          esc(s.name) +
          '">' +
          statIcon(s) +
          '<span class="cs-sn">' +
          esc(s.name) +
          '</span><b>' +
          (s.value == null ? '–' : esc(s.value)) +
          '</b></div>'
      )
      .join('');
    el.abody.innerHTML = d.abilities.length
      ? d.abilities.map(a => '<div class="cs-ab"><b>' + esc(a.name) + '</b><p>' + esc(a.text) + '</p></div>').join('')
      : '<p class="cs-flavor">' + esc(d.flavor || 'No abilities yet.') + '</p>';
  }
  function remembered(p) {
    const s = Settings.get(STORE);
    return s && s[p];
  }
  function beginStep(i) {
    step = i;
    sel = null;
    const cat = AvatarCatalog.get();
    if (!cat) return render();
    const p = seat(),
      want = picks[p] || remembered(p) || AvatarLogic.defaultSelection(cat, p === 'Opponent' ? 1 : 0);
    setSel(want, 'force');
  }
  function confirm() {
    if (!root || root.hidden || el.ok.disabled) return;
    const cat = AvatarCatalog.get();
    if (cat && cat.characters.length) {
      if (!AvatarLogic.isValid(cat, sel)) return; // never confirm an invalid selection
      picks[seat()] = { character: sel.character, outfit: sel.outfit };
      const keep = Object.assign({}, Settings.get(STORE) || {}, { [seat()]: picks[seat()] });
      Settings.set(STORE, keep);
      if (step < steps.length - 1) return beginStep(step + 1);
      if (cfg.mode === 'bot') picks.Opponent = AvatarLogic.botSelection(cat, picks.Player);
    }
    const out = Object.assign({}, cfg, {
      avatars: cat && cat.characters.length ? AvatarLogic.cleanSeats(picks) : null,
    });
    close();
    MenuUI.play(out);
  }
  function back() {
    if (!root || root.hidden) return;
    if (step > 0) return beginStep(step - 1);
    const mode = cfg.mode;
    close();
    MenuUI.show();
    startDialog(mode); // the start dialog again, with the same settings (MenuUI.last)
  }
  function open(c) {
    if (!root) build();
    cfg = Object.assign({}, c);
    steps = cfg.mode === 'self' ? ['Player', 'Opponent'] : ['Player'];
    picks = {};
    if (typeof MenuUI !== 'undefined') {
      MenuUI.hide(); // the menu scene stops: this scene has its own renderer
      MenuUI.away = true;
    }
    root.hidden = false;
    const bc = document.getElementById('bootCover');
    if (bc) bc.remove();
    start3D();
    beginStep(0);
    if (!AvatarCatalog.get()) AvatarCatalog.ready.then(() => root && !root.hidden && beginStep(step));
  }
  function close() {
    if (!root || root.hidden) return;
    stop3D();
    root.hidden = true;
  }
  return {
    open,
    close,
    back,
    confirm,
    switchChar,
    switchOutfit,
    isOpen: () => !!root && !root.hidden,
    get selection() {
      return sel ? Object.assign({}, sel) : null;
    },
    get seat() {
      return steps[step] || null;
    },
    debug: () => ({
      big: big && big.cur && big.cur.entry.id,
      small: small && small.cur && small.cur.entry.id,
      step,
      picks,
    }),
  };
})();

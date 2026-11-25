// avatar-view.js - the avatars in the duel. Each seat has ONE avatar (a Character3D with its own animation controller),
// made when the duel starts (setNames) and kept until the next duel or a different selection: switching Top / Side view only shows
// or hides it, so nothing is ever duplicated. Top view: hidden and paused. Side view: it stands behind its board, facing the other.
// It reads the duel's avatars ({character, outfit} per seat, state.avatars) and life, and the events of each command:
//   enter        - the first time it is shown in this duel (and when it comes back from death, e.g. Undo)
//   idle         - loops; idle_wounded plays OVER it while life < 50% of this duel's starting life (back to plain idle at 50%+)
//   dies         - life -1 or less (that player loses); held
//   playing_card - its player played a card (the Sim's CardPlayed event)
// The life bars show the avatar icons (AvatarIcons). Debug (console): AvatarView.stats(), AvatarView.play('Player', 'dies').
const AvatarView = (function () {
  const group = new THREE.Group();
  group.name = 'avatars3d';
  group.visible = false;
  scene.add(group);
  const seats = { Player: null, Opponent: null }; // {key, inst, state, entered}
  let side = false,
    lastT = performance.now(),
    duels = 0,
    made = 0; // controllers ever made (stats)
  const OV = AvatarLogic.OVERLAY;
  const iconEl = p => document.querySelector('#hp [data-p="' + p + '"] .av');
  const cur = () => (typeof game !== 'undefined' && game) || null;
  function selOf(s, p) {
    const cat = AvatarCatalog.get();
    if (!cat || !cat.characters.length || !s) return null;
    return AvatarLogic.fix(cat, s.avatars && s.avatars[p], p); // older replays and tests record none: the seat's default
  }
  function drop(p) {
    const x = seats[p];
    if (x && x.inst) x.inst.dispose();
    seats[p] = null;
  }
  function make(p, sel) {
    const ch = AvatarLogic.resolve(AvatarCatalog.get(), sel),
      inst = new Character3D('avatar-' + p, ch, p, {
        art: () => AvatarModels.build(ch.character.body), // no GLB (or it failed): the placeholder humanoid
        prepare: (model, isGLB) => AvatarModels.applyOutfit(model, ch.outfit, isGLB),
        procClip: (entry, c) => AvatarModels.procClip(entry.procedural, entry.category, AvatarModels.hasLimbs(c.model)),
      });
    inst.proxy.userData.pickAs = null; // never picked: clicks go to the board
    group.add(inst.root);
    made++;
    return inst;
  }
  const visible = () =>
    side && typeof View3D !== 'undefined' && View3D.isOn() && !(typeof MenuUI !== 'undefined' && MenuUI.away);
  // called by setNames (a new duel: new sim) and by sync()
  // the life bar rows: .me = the seat on screen (bottom right / left in portrait), .foe = the other one
  function rows() {
    const v = (typeof ui !== 'undefined' && ui.view) || 'Player';
    for (const p of ['Player', 'Opponent']) {
      const r = document.querySelector('#hp [data-p="' + p + '"]');
      if (!r) continue;
      r.classList.toggle('me', p === v);
      r.classList.toggle('foe', p !== v);
    }
    measure();
  }
  // --foeB / --foeR (bottom / right of the top-left row: the hover label, the inspector and the status line keep clear of it),
  // --meT (top of the own row, bottom left in landscape: the inspection panel ends above it), --meH (its height)
  let mKey = '';
  function measure() {
    const f = document.querySelector('#hp .hpr.foe'),
      m = document.querySelector('#hp .hpr.me');
    if (!f || !m) return;
    const land = innerWidth > innerHeight,
      fn = document.getElementById('fn');
    m.classList.remove('tight'); // landscape: the row sits bottom left, under the inspection panel (it used to share the right side with
    // the buttons and, when they left no room, went under the stack panel)
    if (land) document.documentElement.style.setProperty('--meH', m.offsetHeight + 'px');
    const fr = f.getBoundingClientRect(),
      a = Math.ceil(fr.bottom),
      r = Math.ceil(fr.right),
      b = Math.floor(m.getBoundingClientRect().top),
      fl = fnLeft(fn),
      k = [a, r, b, fl, land, m.className].join('|');
    if (k === mKey) return;
    mKey = k;
    const st = document.documentElement.style;
    st.setProperty('--foeB', a + 'px');
    st.setProperty('--foeR', r + 'px');
    st.setProperty('--meT', (b > 0 ? b : innerHeight) + 'px');
    // the status line goes up between this row and the top right buttons when there is room (the top of the board is free)
    const slot = land && fr.width ? AvatarLogic.statusSlot(r, fl) : null;
    document.body.classList.toggle('statusTop', !!slot);
    if (slot) {
      st.setProperty('--stC', slot.centre + 'px');
      st.setProperty('--stW', slot.maxW + 'px');
    }
  }
  // the left edge of the visible top right buttons (#fn)
  function fnLeft(fn) {
    const bs = fn ? [...fn.children].filter(x => x.offsetParent) : [];
    return bs.length ? Math.floor(Math.min(...bs.map(x => x.getBoundingClientRect().left))) : innerWidth - 12;
  }
  if (typeof ResizeObserver !== 'undefined') {
    document.querySelectorAll('#hp .hpr').forEach(r => new ResizeObserver(() => ((mKey = ''), measure())).observe(r));
    const fnEl = document.getElementById('fn'); // buttons shown / hidden move the gap for the status line
    if (fnEl) new ResizeObserver(() => ((mKey = ''), measure())).observe(fnEl);
  }
  addEventListener('resize', () => {
    mKey = '';
    requestAnimationFrame(measure);
  });
  function refresh(s) {
    rows();
    s = s || cur();
    if (!s) return;
    const cat = AvatarCatalog.get();
    for (const p of ['Player', 'Opponent']) {
      const sel = selOf(s, p),
        key = sel ? sel.character + '/' + sel.outfit : '';
      AvatarIcons.render(iconEl(p), sel ? AvatarLogic.iconOf(cat, sel) : null);
      if (!sel) {
        drop(p);
        continue;
      }
      if (!seats[p] || seats[p].key !== key) {
        drop(p);
        seats[p] = { key, inst: make(p, sel), state: AvatarLogic.lifeState(s.life[p], s.maxLife), entered: false };
      }
      const x = seats[p],
        st = AvatarLogic.lifeState(s.life[p], s.maxLife);
      if (x.state !== st) {
        const was = x.state;
        x.state = st;
        if (x.entered) {
          if (st === 'dead') {
            x.inst.setOverlay(OV, false);
            x.inst.play('dies');
          } else {
            if (was === 'dead') x.inst.play('enter');
            x.inst.setOverlay(OV, st === 'wounded');
          }
        }
      }
      if (typeof View3D !== 'undefined') {
        const pl = AvatarLogic.placement(View3D.layout, cat.sideView, p);
        x.inst.root.position.set(pl.x, pl.y, pl.z);
        x.inst.root.scale.setScalar(pl.scale);
      }
    }
    show();
  }
  function show() {
    const v = visible();
    group.visible = v;
    if (!v) return;
    for (const p of ['Player', 'Opponent']) {
      const x = seats[p];
      if (!x || x.entered) continue;
      x.entered = true; // the first time it is seen in this duel: it enters
      if (x.state === 'dead') x.inst.play('dies');
      else {
        x.inst.play('enter');
        x.inst.setOverlay(OV, x.state === 'wounded');
      }
    }
    lastT = performance.now();
    ui.dirty = true;
  }
  function newDuel(s) {
    duels++;
    drop('Player');
    drop('Opponent');
    refresh(s);
  }
  function setSide(on) {
    side = !!on;
    refresh();
  }
  // the events of an accepted command (send): one-shot animations
  function onEvents(events) {
    if (!group.visible) return; // hidden: nothing to show (and nothing stale queued for later)
    for (const p of ['Player', 'Opponent']) {
      const x = seats[p];
      if (!x || !x.entered || x.state === 'dead') continue;
      for (const c of AvatarLogic.cues(events, p)) x.inst.play(c);
    }
  }
  // every frame (animate): true while they move
  function frame() {
    const now = performance.now(),
      dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    if (group.visible !== visible()) show();
    if (!group.visible) return false;
    let any = false;
    for (const p of ['Player', 'Opponent'])
      if (seats[p]) {
        seats[p].inst.update(dt);
        any = true;
      }
    return any;
  }
  AvatarCatalog.onChange(() => refresh());
  return {
    newDuel,
    refresh,
    setSide,
    onEvents,
    frame,
    group,
    seat: p => seats[p],
    play: (p, cat) => seats[p] && seats[p].inst.play(cat),
    stats: () => ({
      side,
      visible: group.visible,
      duels,
      controllersMade: made,
      groupChildren: group.children.length,
      seats: Object.fromEntries(
        ['Player', 'Opponent'].map(p => [
          p,
          seats[p]
            ? {
                key: seats[p].key,
                state: seats[p].state,
                entered: seats[p].entered,
                anim: seats[p].inst.cur ? seats[p].inst.cur.entry.id : null,
                category: seats[p].inst.cur ? seats[p].inst.cur.entry.category : null,
                overlay: seats[p].inst.ov ? seats[p].inst.ov.entry.id : null,
                ready: seats[p].inst.ready,
              }
            : null,
        ])
      ),
    }),
  };
})();

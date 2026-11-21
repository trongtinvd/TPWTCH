// menu.js - Main menu scene (title, three buttons, two dancing card models), the start dialog and small modal helpers
function mkEl(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function mkBtn(text, fn, cls) {
  const b = mkEl('button', 'abtn' + (cls ? ' ' + cls : ''));
  b.textContent = text;
  b.onclick = fn;
  return b;
}
function modal(fill, onCancel) {
  // fill(box, close, cancel). Left or right click on the empty backdrop, or Esc, cancels.
  const bd = mkEl('div', 'modal-bd'),
    box = mkEl('div', 'modal');
  bd.appendChild(box);
  document.body.appendChild(bd);
  let done = false;
  const onKey = e => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cancel();
    }
  };
  const close = () => {
    if (done) return;
    done = true;
    bd.remove();
    removeEventListener('keydown', onKey, true);
  };
  const cancel = () => {
    if (done) return;
    close();
    if (onCancel) onCancel();
  };
  addEventListener('keydown', onKey, true);
  bd.addEventListener('pointerdown', e => {
    if (e.target === bd) cancel();
  }); // fires for every mouse button
  bd.addEventListener('contextmenu', e => e.preventDefault());
  fill(box, close, cancel);
  return close;
}
const confirmBox = (msg, yes = 'Discard', no = 'Cancel') =>
  new Promise(res =>
    modal(
      (box, close) => {
        box.appendChild(mkEl('p', 'mmsg')).textContent = msg;
        const row = mkEl('div', 'mrow');
        row.append(
          mkBtn(
            yes,
            () => {
              close();
              res(true);
            },
            'c-atk'
          ),
          mkBtn(no, () => {
            close();
            res(false);
          })
        );
        box.appendChild(row);
      },
      () => res(false)
    )
  );

// ---- two dancing card models (3D model only, no card frame), swapped every 10 seconds ----
const MenuScene = (function () {
  let R = null,
    S = null,
    cam = null,
    canvas = null,
    raf = 0,
    timer = 0,
    t0 = 0,
    slots = [];
  const FOV = 35,
    DIST = 10;
  const free = m =>
    m.root.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  function makeModel(def) {
    const inner = new THREE.Group();
    (SHAPES[def.id] ? SHAPES[def.id]() : [mk(Sp(0.7), 0xcccccc)]).forEach(p => inner.add(p));
    const bb = new THREE.Box3().setFromObject(inner),
      r = bb.getSize(new THREE.Vector3()).length() / 2;
    inner.position.sub(bb.getCenter(new THREE.Vector3()));
    const pivot = new THREE.Group();
    pivot.add(inner);
    pivot.scale.setScalar(1.5 / r);
    const root = new THREE.Group();
    root.add(pivot);
    return { root, pivot, def, born: performance.now(), base: 1 };
  }
  function layout() {
    if (!R) return;
    const a = innerWidth / innerHeight,
      hw = Math.tan((FOV * Math.PI) / 360) * DIST * a,
      sc = Math.max(0.45, Math.min(1, a / 1.2));
    slots.forEach((m, i) => {
      m.root.position.x = (i ? 1 : -1) * hw * 0.72;
      m.base = sc;
    });
  }
  function setSlot(i, def) {
    if (slots[i]) {
      S.remove(slots[i].root);
      free(slots[i]);
    }
    slots[i] = makeModel(def);
    S.add(slots[i].root);
    layout();
  }
  function rotateCards() {
    const shown = slots.map(m => m.def.id),
      L = DEFS.filter(d => !shown.includes(d.id)),
      pick = () => L.splice(Math.floor(Math.random() * L.length), 1)[0];
    const a = pick(),
      b = pick();
    setSlot(0, a);
    setSlot(1, b);
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const t = (now - t0) / 1000;
    slots.forEach((m, i) => {
      const ph = (i * Math.PI) / 2,
        dir = i ? -1 : 1,
        age = Math.min(1, (now - m.born) / 450),
        k = 1 + 1.7 * Math.pow(age - 1, 3) + 0.7 * Math.pow(age - 1, 2); // pop in with a small overshoot
      m.root.position.y = Math.abs(Math.sin(t * 3 + ph)) * 0.6 - 0.3; // hop
      m.pivot.rotation.y = dir * Math.sin(t * 1.6 + ph) * 0.9; // sway
      m.pivot.rotation.z = dir * Math.sin(t * 3 + ph) * 0.14; // tilt
      const sq = 1 + 0.07 * Math.sin(t * 6 + ph),
        s = m.base * Math.max(0, k);
      m.root.scale.set(s / Math.sqrt(sq), s * sq, s / Math.sqrt(sq)); // squash and stretch
    });
    R.render(S, cam);
  }
  return {
    start(host) {
      if (R) return;
      canvas = mkEl('canvas');
      canvas.id = 'menuCanvas';
      host.prepend(canvas); // a fresh canvas each time: a context-lost canvas cannot be reused
      R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      R.setPixelRatio(Math.min(devicePixelRatio, 2));
      R.setClearColor(0, 0);
      S = new THREE.Scene();
      S.add(new THREE.AmbientLight(0xffffff, 0.8));
      const L = new THREE.DirectionalLight(0xffffff, 0.9);
      L.position.set(3, 5, 6);
      S.add(L);
      cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
      cam.position.set(0, 0, DIST);
      slots = [];
      this.resize();
      rotateCards();
      t0 = performance.now();
      raf = requestAnimationFrame(frame);
      timer = setInterval(rotateCards, 10000);
    },
    stop() {
      if (!R) return;
      cancelAnimationFrame(raf);
      clearInterval(timer);
      slots.forEach(free);
      slots = [];
      R.dispose();
      R.forceContextLoss();
      R = null;
      S = null;
      canvas.remove();
      canvas = null;
    },
    resize() {
      if (!R) return;
      R.setSize(innerWidth, innerHeight, false);
      cam.aspect = innerWidth / innerHeight;
      cam.updateProjectionMatrix();
      layout();
    },
  };
})();

function settingsDialog() {
  modal((box, close, cancel) => {
    box.appendChild(mkEl('h2')).textContent = 'Settings';
    const w = mkEl('label', 'mcheck'),
      cb = mkEl('input');
    cb.type = 'checkbox';
    cb.checked = Settings.get('runHidden');
    cb.onchange = () => Settings.set('runHidden', cb.checked);
    w.append(cb, document.createTextNode(' Keep the game running when the browser tab is hidden'));
    box.appendChild(w);
    const note = mkEl('p', 'mmsg');
    note.style.fontSize = '12px';
    note.style.opacity = '0.7';
    note.textContent =
      'Browsers slow hidden tabs down: the bot and the automatic passes may act about once per second there.';
    box.appendChild(note);
    const row = mkEl('div', 'mrow');
    row.appendChild(mkBtn('Close', cancel));
    box.appendChild(row);
  });
}
function startDialog(mode) {
  // mode: 'self' | 'bot'
  const decks = DeckStore.list(),
    names = decks.map(d => d.name);
  modal((box, close, cancel) => {
    box.appendChild(mkEl('h2')).textContent = mode === 'bot' ? 'Vs Bot' : 'Vs Self';
    const sel = (label, def) => {
      const w = mkEl('label', 'mfield');
      w.appendChild(mkEl('span')).textContent = label;
      const s = mkEl('select', 'dctl');
      decks.forEach(d => {
        const o = mkEl('option');
        o.value = d.name;
        o.textContent = d.name + ' (' + d.cards.length + ')';
        s.appendChild(o);
      });
      s.value = names.includes(def) ? def : names[0];
      w.appendChild(s);
      box.appendChild(w);
      return s;
    };
    const s1 = sel('Player 1 deck', MenuUI.last.p1),
      s2 = sel(mode === 'bot' ? 'Bot deck (Player 2)' : 'Player 2 deck', MenuUI.last.p2);
    const cw = mkEl('label', 'mcheck'),
      cb = mkEl('input');
    cb.type = 'checkbox';
    cb.checked = MenuUI.last.shuffle;
    cw.append(cb, document.createTextNode(' Shuffle the decks at the start'));
    box.appendChild(cw);
    let sb = null; // Vs Bot: what the bot does when the game ends
    if (mode === 'bot') {
      const bw = mkEl('label', 'mfield');
      bw.appendChild(mkEl('span')).textContent = 'When the game ends, the bot';
      sb = mkEl('select', 'dctl');
      for (const [v, t] of [
        ['random', 'Chooses at random'],
        ['rematch', 'Asks for a rematch'],
        ['continue', 'Asks to continue'],
        ['end', 'Ends (leaves)'],
      ]) {
        const o = mkEl('option');
        o.value = v;
        o.textContent = t;
        sb.appendChild(o);
      }
      sb.value = MenuUI.last.botEnd || 'random';
      bw.appendChild(sb);
      box.appendChild(bw);
    }
    const row = mkEl('div', 'mrow');
    row.append(
      mkBtn(
        'Start',
        () => {
          MenuUI.last = { p1: s1.value, p2: s2.value, shuffle: cb.checked, botEnd: sb ? sb.value : MenuUI.last.botEnd };
          close();
          MenuUI.play(Object.assign({ mode }, MenuUI.last));
        },
        'c-go'
      ),
      mkBtn('Cancel', cancel, 'c-pass')
    );
    box.appendChild(row);
  });
}
const MenuUI = {
  away: true, // true while the main menu or the deck editor is on screen: the game underneath is paused (no bot, no auto-pass)
  root: null,
  last: { p1: BUILTIN_DECKS[0].name, p2: BUILTIN_DECKS[1].name, shuffle: true, botEnd: 'random' },
  build() {
    const r = (this.root = mkEl('div', 'screen'));
    r.id = 'mainMenu';
    r.hidden = true;
    const c = mkEl('div', 'menu-center'),
      h = mkEl('h1'),
      bs = mkEl('div', 'menu-btns');
    h.textContent = 'The Places Where They Call Home';
    [
      ['Vs Self', () => startDialog('self')],
      ['Vs Bot', () => startDialog('bot')],
      [
        'Edit Decks',
        () => {
          MenuUI.hide();
          DeckEditor.open();
        },
      ],
      ['Replays', () => Replays.open()],
      ['Settings', () => settingsDialog()],
    ].forEach(([t, f]) => {
      const b = mkBtn(t, f, 'mbtn');
      bs.appendChild(b);
    });
    c.append(h, bs);
    r.appendChild(c);
    document.body.appendChild(r);
  },
  show() {
    if (!this.root) this.build();
    this.away = true;
    rp.playing = false;
    Result.reset();
    Replays.bar(false);
    clearTimeout(ui.botTimer);
    closeMenu();
    this.root.hidden = false;
    const bc = document.getElementById('bootCover');
    if (bc) bc.remove();
    MenuScene.start(this.root);
  },
  hide() {
    this.root.hidden = true;
    MenuScene.stop();
  },
  play(cfg) {
    this.away = false;
    this.hide();
    newGame(cfg);
  },
  leaveGame() {
    // hot seat, game still running: the viewed seat leaves, so the other player is shown the result (a dialog with only Leave)
    const early = ui.mode === 'self' && !rp.on && !sim.result && game.phase === 'play';
    confirmBox(
      early ? 'Leave this game? ' + NAME[other(ui.view)] + ' wins.' : 'Leave this game and return to the main menu?',
      'Leave',
      'Stay'
    ).then(ok => {
      if (!ok) return;
      if (early && !Result.blocks() && send({ type: 'Leave', player: ui.view }).ok) return;
      Replays.saveCurrent()
        .catch(() => false)
        .then(() => MenuUI.show());
    });
  },
};
addEventListener('resize', () => MenuScene.resize());

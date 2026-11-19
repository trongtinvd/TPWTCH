// deck-editor.js - Deck editing scene (HTML): 10x10 deck grid, greyed extra deck, inspector, card list with fuzzy search
const DeckEditor = (function () {
  const S = {
    name: '',
    cards: [],
    extra: [], // the extra deck (extra deck creatures only)
    loaded: null,
    saved: '',
    query: '',
    sel: null,
    key: '0',
    last: null,
    fType: 'all',
    fIn: 'all',
    fOnly: false,
  };
  const byId = Object.fromEntries(DEFS.map(d => [d.id, d]));
  const statsOf = d =>
    d.type === 'creature'
      ? 'ATK ' + d.atk + ' \u00b7 HP ' + d.hp
      : d.type === 'spell'
        ? d.timing + ' \u00b7 HP ' + d.hp
        : 'HP ' + d.hp;
  let root = null,
    grid,
    extra,
    nameIn,
    saveBtn,
    delBtn,
    msg,
    selEl,
    insp,
    list,
    search,
    drag = null,
    lastPT = 'mouse',
    noClick = false;
  const snap = () => JSON.stringify([S.name.trim(), S.cards, S.extra]),
    dirty = () => snap() !== S.saved;
  const ownName = () => (S.loaded && !S.loaded.builtin ? S.loaded.name : null); // a default deck can never be overwritten: save under a new name
  const problem = () => (dirty() ? saveProblem(S.name, S.cards, ownName(), S.extra) : 'Nothing to save');

  const inAny = id => S.cards.includes(id) || S.extra.includes(id);
  function cell(i, list = S.cards) {
    const id = list[i],
      c = mkEl('div', 'de-cell' + (id ? '' : ' empty'));
    c.dataset.i = i;
    if (id) {
      const d = byId[id],
        im = new Image(),
        sp = mkEl('span');
      c.dataset.id = id;
      c.style.setProperty('--tc', cardColor(d));
      im.src = artURL(d);
      im.alt = '';
      im.draggable = false;
      sp.textContent = d.name;
      c.append(mkEl('b', '', String(i + 1)), im, sp);
    }
    return c;
  }
  const renderGrid = () => {
    grid.replaceChildren(...Array.from({ length: DECK_MAX }, (_, i) => cell(i)));
    extra.replaceChildren(...Array.from({ length: EXTRA_MAX }, (_, i) => cell(i, S.extra)));
  };
  const typeOk = d =>
    S.fType === 'all' ||
    (S.fType === 'extra'
      ? !!d.extra
      : S.fType === 'quick' || S.fType === 'slow'
        ? d.type === 'spell' && String(d.timing).toLowerCase() === S.fType
        : d.type === S.fType && !d.extra);
  const cardList = () =>
    rankCards(S.query, DEFS).filter(
      d => (!S.fOnly || cardMatches(S.query, d)) && typeOk(d) && (S.fIn === 'all' || inAny(d.id) === (S.fIn === 'in'))
    );
  function renderList() {
    const st = list.scrollTop;
    list.replaceChildren(
      ...cardList().map(d => {
        const inDeck = inAny(d.id),
          r = mkEl('div', 'de-row' + (inDeck ? ' in' : '')),
          im = new Image(),
          nm = mkEl('div', 'nm'),
          b = mkEl('b'),
          sp = mkEl('span');
        r.dataset.id = d.id;
        r.style.setProperty('--tc', cardColor(d));
        im.src = artURL(d);
        im.alt = '';
        im.draggable = false;
        b.textContent = d.name;
        sp.textContent = TYPES[d.type].label + ' \u00b7 ' + statsOf(d);
        nm.append(b, sp);
        r.append(im, nm);
        if (inDeck) r.appendChild(mkEl('i', '', '\u2713'));
        return r;
      })
    );
    list.scrollTop = st;
  }
  function renderInspect(id) {
    const d = id && byId[id];
    if (!d) {
      insp.innerHTML = '<div class="pbody"><p>Hover or click a card to inspect it.</p></div>';
      return;
    }
    const k = S.cards.indexOf(id),
      kx = S.extra.indexOf(id);
    insp.style.setProperty('--tc', cardColor(d));
    insp.innerHTML =
      '<div class="art"></div><div class="pbody"><h3></h3><div class="meta"></div><div class="stats"></div><p></p><div class="where"></div></div>';
    const im = new Image();
    im.src = artURL(d);
    im.alt = d.name;
    insp.querySelector('.art').appendChild(im);
    insp.querySelector('h3').textContent = d.name;
    insp.querySelector('.meta').textContent = TYPES[d.type].label + (d.type === 'spell' ? ' \u00b7 ' + d.timing : '');
    insp.querySelector('.stats').innerHTML = statsOf(d)
      .split(' \u00b7 ')
      .map(x => '<span class="stat">' + x + '</span>')
      .join('');
    insp.querySelector('p').textContent = d.text;
    insp.querySelector('.where').textContent =
      k >= 0
        ? 'In the deck: position ' + (k + 1) + ' of ' + S.cards.length + (k === 0 ? ' (top)' : '')
        : kx >= 0
          ? 'In the extra deck: position ' + (kx + 1) + ' of ' + S.extra.length
          : 'Not in the deck';
  }
  function updateTop() {
    const p = problem();
    saveBtn.disabled = !!p;
    delBtn.disabled = !(S.loaded && !S.loaded.builtin); // only a saved deck can be deleted
    msg.textContent = dirty() ? p || '' : '';
  }
  function changed() {
    renderGrid();
    renderList();
    renderInspect(S.sel);
    updateTop();
  }
  const select = id => {
    S.sel = id;
    renderInspect(id);
  };
  const listOf = id => (byId[id] && byId[id].extra ? S.extra : S.cards), // extra deck creatures live in the extra deck
    maxOf = id => (byId[id] && byId[id].extra ? EXTRA_MAX : DECK_MAX);
  const add = id => {
    if (!id || inAny(id) || listOf(id).length >= maxOf(id)) return;
    listOf(id).push(id);
    changed();
  };
  const remove = id => {
    const L = listOf(id),
      i = L.indexOf(id);
    if (i < 0) return;
    L.splice(i, 1);
    changed();
  };
  const move = (i, j, L = S.cards) => {
    L.splice(j, 0, L.splice(i, 1)[0]);
    changed();
  };

  function refreshSelect(key) {
    const L = DeckStore.list();
    selEl.replaceChildren(
      ...L.map((d, i) => {
        const o = mkEl('option');
        o.value = String(i);
        o.textContent = d.name + (d.builtin ? ' (default)' : '') + ' \u00b7 ' + d.cards.length;
        return o;
      }),
      Object.assign(mkEl('option'), { value: 'new', textContent: '+ New deck' })
    );
    selEl.value = S.key = key;
  }
  function load(deck, key) {
    S.name = deck.name;
    S.cards = deck.cards.slice();
    S.extra = (deck.extra || []).slice();
    S.loaded = deck;
    S.last = deck.name;
    S.saved = snap();
    S.sel = S.cards[0] || S.extra[0] || null;
    nameIn.value = S.name;
    refreshSelect(key);
    changed();
  }
  function loadNew() {
    let n = 'New deck',
      i = 2;
    while (DeckStore.nameUsed(n)) n = 'New deck ' + i++;
    S.name = n;
    S.cards = [];
    S.extra = [];
    S.loaded = null;
    S.saved = snap();
    S.sel = null;
    nameIn.value = n;
    refreshSelect('new');
    changed();
  }
  function save() {
    if (problem()) return;
    const n = S.name.trim();
    DeckStore.save(n, S.cards, S.extra);
    S.name = n;
    nameIn.value = n;
    S.loaded = DeckStore.find(n);
    S.last = n;
    S.saved = snap();
    refreshSelect(String(DeckStore.list().findIndex(d => d.name === n)));
    updateTop();
  }
  async function del() {
    const d = S.loaded;
    if (!d || d.builtin) return;
    if (!(await confirmBox('Delete the deck \u201c' + d.name + '\u201d? This cannot be undone.', 'Delete', 'Cancel')))
      return;
    DeckStore.remove(d.name);
    S.last = null;
    load(DeckStore.list()[0], '0');
  }
  const discardOk = msg => (dirty() ? confirmBox(msg) : Promise.resolve(true));

  const cellUnder = (x, y) => {
    const e = document.elementFromPoint(x, y);
    return e && e.closest ? e.closest('.de-grid .de-cell, .de-extra .de-cell') : null;
  };
  function makeGhost(id) {
    const d = byId[id],
      g = mkEl('div', 'de-cell de-ghost'),
      im = new Image(),
      sp = mkEl('span');
    g.style.setProperty('--tc', cardColor(d));
    im.src = artURL(d);
    im.alt = '';
    sp.textContent = d.name;
    g.append(im, sp);
    document.body.appendChild(g);
    return g;
  }
  function moveGhost(d, x, y) {
    d.ghost.style.transform = 'translate(' + (x - 32) + 'px,' + (y - 36) + 'px)';
    root.querySelectorAll('.drop').forEach(c => c.classList.remove('drop'));
    const t = cellUnder(x, y);
    if (t) t.classList.add('drop');
  }
  function activate(d, x, y) {
    d.on = true;
    d.ghost = makeGhost(d.id);
    if (d.kind !== 'list') d.el.classList.add('dragging');
    try {
      if (navigator.vibrate) navigator.vibrate(15);
    } catch (e) {}
    moveGhost(d, x, y);
  }
  function begin(kind, el, id, i, e) {
    // a drag from the grid (reorder) or from the card list (insert)
    const d = (drag = {
      kind,
      el,
      id,
      i,
      x: e.clientX,
      y: e.clientY,
      cx: e.clientX,
      cy: e.clientY,
      on: false,
      ghost: null,
      timer: 0,
    });
    if (kind !== 'list' && e.pointerType !== 'mouse')
      d.timer = setTimeout(() => {
        if (drag === d) activate(d, d.cx, d.cy);
      }, 350); // touch: a long press picks a deck card up, so a plain swipe still scrolls the page
  }
  function endDrag(apply, e) {
    const d = drag;
    if (!d) return;
    drag = null;
    clearTimeout(d.timer);
    if (d.ghost) d.ghost.remove();
    root.querySelectorAll('.dragging, .drop').forEach(c => c.classList.remove('dragging', 'drop'));
    if (!d.on) {
      if (apply && d.kind !== 'list') select(d.id);
      return;
    } // never picked up: a plain tap just inspects
    noClick = true;
    setTimeout(() => {
      noClick = false;
    }, 0);
    if (!apply) return;
    const t = cellUnder(e.clientX, e.clientY);
    if (!t) return;
    const j = +t.dataset.i,
      inX = !!t.closest('.de-extra'); // dropped on the extra deck grid?
    if (d.kind === 'grid' || d.kind === 'xgrid') {
      // reorder inside the same deck (a card never changes deck by dragging)
      if (inX !== (d.kind === 'xgrid')) return;
      const L = d.kind === 'xgrid' ? S.extra : S.cards,
        k = Math.min(j, L.length - 1);
      if (k !== d.i) move(d.i, k, L);
    } else if (!inAny(d.id)) {
      const ex = !!(byId[d.id] && byId[d.id].extra),
        L = listOf(d.id);
      if (L.length >= maxOf(d.id) || (!ex && inX)) return; // a card goes only into its own deck
      L.splice(ex && !inX ? L.length : Math.min(j, L.length), 0, d.id);
      S.sel = d.id;
      changed();
    }
  }
  function build() {
    root = mkEl('div', 'screen');
    root.id = 'deckEditor';
    root.hidden = true;
    root.innerHTML =
      '<div class="de-left de-panel"></div><div class="de-center"><div class="de-top"></div><div class="de-grid"></div><div class="de-xl">Extra Deck</div><div class="de-extra"></div></div>' +
      '<div class="de-right"><input class="dctl de-search" placeholder="Search cards\u2026" spellcheck="false" autocomplete="off"><div class="de-list"></div><div class="de-exit"></div></div>';
    document.body.appendChild(root);
    insp = root.querySelector('.de-left');
    grid = root.querySelector('.de-grid');
    extra = root.querySelector('.de-extra');
    list = root.querySelector('.de-list');
    search = root.querySelector('.de-search');
    const top = root.querySelector('.de-top');
    nameIn = mkEl('input', 'dctl de-name');
    nameIn.maxLength = 40;
    nameIn.placeholder = 'Deck name';
    nameIn.spellcheck = false;
    saveBtn = mkBtn('Save', save, 'c-go');
    delBtn = mkBtn('Delete', del, 'c-atk');
    msg = mkEl('span', 'de-msg');
    selEl = mkEl('select', 'dctl');
    top.append(nameIn, saveBtn, delBtn, selEl, msg);
    root.querySelector('.de-exit').appendChild(
      mkBtn('Exit', async () => {
        if (!(await discardOk('Leave the deck editor? Unsaved changes will be lost.'))) return;
        DeckEditor.close();
        MenuUI.show();
      })
    );
    const fl = mkEl('div', 'de-filters'),
      mkSel = (opts, key) => {
        const s = mkEl('select', 'dctl');
        for (const [v, t] of opts) {
          const o = mkEl('option');
          o.value = v;
          o.textContent = t;
          s.appendChild(o);
        }
        s.value = S[key];
        s.addEventListener('change', () => {
          S[key] = s.value;
          renderList();
        });
        return s;
      },
      only = mkEl('label', 'mcheck'),
      onlyCb = mkEl('input');
    onlyCb.type = 'checkbox';
    onlyCb.checked = S.fOnly;
    onlyCb.addEventListener('change', () => {
      S.fOnly = onlyCb.checked;
      renderList();
    });
    only.append(onlyCb, document.createTextNode(' Only matches'));
    fl.append(
      mkSel(
        [
          ['all', 'All types'],
          ['creature', 'Creatures'],
          ['extra', 'Extra deck creatures'],
          ['enchantment', 'Enchantments'],
          ['quick', 'Quick spells'],
          ['slow', 'Slow spells'],
        ],
        'fType'
      ),
      mkSel(
        [
          ['all', 'In deck or not'],
          ['out', 'Not in deck'],
          ['in', 'In deck'],
        ],
        'fIn'
      ),
      only
    );
    search.after(fl);
    root.addEventListener(
      'pointerdown',
      e => {
        lastPT = e.pointerType;
      },
      true
    ); // mouse: click / right click. touch or pen: tap / double tap / long press
    nameIn.addEventListener('input', () => {
      S.name = nameIn.value;
      updateTop();
    });
    selEl.addEventListener('change', async () => {
      const v = selEl.value,
        prev = S.key;
      if (!(await discardOk('This deck has unsaved changes. Discard them?'))) {
        selEl.value = prev;
        return;
      }
      if (v === 'new') loadNew();
      else load(DeckStore.list()[+v], v);
    });
    search.addEventListener('input', () => {
      S.query = search.value;
      renderList();
    });
    insp.addEventListener('click', () => insp.classList.toggle('open')); // phone: the compact inspector expands when tapped
    // dragging (grid: reorder; list: insert at the cell it is dropped on)
    for (const [g, kind] of [
      [grid, 'grid'],
      [extra, 'xgrid'],
    ])
      g.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        const c = e.target.closest('.de-cell[data-id]');
        if (c) begin(kind, c, c.dataset.id, +c.dataset.i, e);
      });
    list.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const r = e.target.closest('.de-row');
      if (!r || r.classList.contains('in')) return;
      if (e.pointerType !== 'mouse' && e.target.tagName !== 'IMG') return; // touch: only the thumbnail drags, the rest of the row scrolls the list
      begin('list', r, r.dataset.id, -1, e);
    });
    addEventListener('pointermove', e => {
      const d = drag;
      if (!d) return;
      d.cx = e.clientX;
      d.cy = e.clientY;
      const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      if (!d.on) {
        if (d.timer) {
          if (moved > 8) {
            clearTimeout(d.timer);
            drag = null;
          }
          return;
        }
        if (moved > 6) activate(d, e.clientX, e.clientY);
        return;
      } // moving before the long press = scrolling
      moveGhost(d, e.clientX, e.clientY);
    });
    addEventListener(
      'touchmove',
      e => {
        if (drag && drag.on) e.preventDefault();
      },
      { passive: false }
    ); // a picked-up card must not scroll the page
    addEventListener('pointerup', e => endDrag(true, e));
    addEventListener('pointercancel', e => endDrag(false, e));
    // removing / adding without a mouse: double tap
    for (const g of [grid, extra]) {
      g.addEventListener('contextmenu', e => {
        e.preventDefault();
        if (lastPT !== 'mouse') return;
        const c = e.target.closest('.de-cell[data-id]');
        if (c) remove(c.dataset.id);
      });
      g.addEventListener('dblclick', e => {
        if (lastPT === 'mouse') return;
        const c = e.target.closest('.de-cell[data-id]');
        if (c) remove(c.dataset.id);
      });
    }
    list.addEventListener('click', e => {
      if (noClick) return;
      const r = e.target.closest('.de-row');
      if (!r) return;
      select(r.dataset.id);
      if (lastPT === 'mouse') add(r.dataset.id);
    });
    list.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (lastPT !== 'mouse') return;
      const r = e.target.closest('.de-row');
      if (r) remove(r.dataset.id);
    });
    list.addEventListener('dblclick', e => {
      if (lastPT === 'mouse') return;
      const r = e.target.closest('.de-row');
      if (!r) return;
      const id = r.dataset.id;
      if (inAny(id)) remove(id);
      else add(id);
    });
    const hov = e => {
      if (e.pointerType !== 'mouse' || drag) return;
      const c = e.target.closest('[data-id]');
      renderInspect(c ? c.dataset.id : S.sel);
    };
    for (const h of [grid, extra, list]) {
      h.addEventListener('pointerover', hov);
      h.addEventListener('pointerleave', () => renderInspect(S.sel));
    }
  }
  return {
    open() {
      if (!root) build();
      root.hidden = false;
      search.value = S.query = '';
      const L = DeckStore.list(),
        i = Math.max(
          0,
          L.findIndex(d => d.name === S.last)
        );
      load(L[i], String(i));
    },
    close() {
      if (root) root.hidden = true;
    },
  };
})();

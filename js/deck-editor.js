// deck-editor.js - Deck editing scene (HTML): 10x10 deck grid, greyed extra deck, inspector, card list with fuzzy search
const DeckEditor = (function(){
  const S = {name:'', cards:[], loaded:null, saved:'', query:'', sel:null, key:'0', last:null};
  const byId = Object.fromEntries(DEFS.map(d => [d.id, d]));
  const statsOf = d => d.type === 'creature' ? 'ATK ' + d.atk + ' \u00b7 HP ' + d.hp : d.type === 'spell' ? d.timing + ' \u00b7 HP ' + d.hp : 'HP ' + d.hp;
  let root = null, grid, extra, nameIn, saveBtn, msg, selEl, insp, list, search, drag = null;
  const snap = () => JSON.stringify([S.name.trim(), S.cards]), dirty = () => snap() !== S.saved;
  const ownName = () => S.loaded && !S.loaded.builtin ? S.loaded.name : null;   // a default deck can never be overwritten: save under a new name
  const problem = () => dirty() ? saveProblem(S.name, S.cards, ownName()) : 'Nothing to save';

  function cell(i){
    const id = S.cards[i], c = mkEl('div', 'de-cell' + (id ? '' : ' empty')); c.dataset.i = i;
    if (id){ const d = byId[id], im = new Image(), sp = mkEl('span'); c.dataset.id = id; c.style.setProperty('--tc', cardColor(d)); im.src = artURL(d); im.alt = ''; im.draggable = false; sp.textContent = d.name; c.append(mkEl('b', '', String(i + 1)), im, sp); }
    return c;
  }
  const renderGrid = () => grid.replaceChildren(...Array.from({length:DECK_MAX}, (_, i) => cell(i)));
  function renderList(){
    const st = list.scrollTop;
    list.replaceChildren(...rankCards(S.query, DEFS).map(d => {
      const inDeck = S.cards.includes(d.id), r = mkEl('div', 'de-row' + (inDeck ? ' in' : '')), im = new Image(), nm = mkEl('div', 'nm'), b = mkEl('b'), sp = mkEl('span');
      r.dataset.id = d.id; r.style.setProperty('--tc', cardColor(d)); im.src = artURL(d); im.alt = ''; im.draggable = false;
      b.textContent = d.name; sp.textContent = TYPES[d.type].label + ' \u00b7 ' + statsOf(d); nm.append(b, sp); r.append(im, nm); if (inDeck) r.appendChild(mkEl('i', '', '\u2713')); return r; }));
    list.scrollTop = st;
  }
  function renderInspect(id){
    const d = id && byId[id]; if (!d){ insp.innerHTML = '<div class="pbody"><p>Hover or click a card to inspect it.</p></div>'; return; }
    const k = S.cards.indexOf(id);
    insp.style.setProperty('--tc', cardColor(d));
    insp.innerHTML = '<div class="art"></div><div class="pbody"><h3></h3><div class="meta"></div><div class="stats"></div><p></p><div class="where"></div></div>';
    const im = new Image(); im.src = artURL(d); im.alt = d.name; insp.querySelector('.art').appendChild(im);
    insp.querySelector('h3').textContent = d.name; insp.querySelector('.meta').textContent = TYPES[d.type].label + (d.type === 'spell' ? ' \u00b7 ' + d.timing : '');
    insp.querySelector('.stats').innerHTML = statsOf(d).split(' \u00b7 ').map(x => '<span class="stat">' + x + '</span>').join('');
    insp.querySelector('p').textContent = d.text; insp.querySelector('.where').textContent = k >= 0 ? 'In the deck: position ' + (k + 1) + ' of ' + S.cards.length + (k === 0 ? ' (top)' : '') : 'Not in the deck';
  }
  function updateTop(){ const p = problem(); saveBtn.disabled = !!p; msg.textContent = dirty() ? (p || '') : ''; }
  function changed(){ renderGrid(); renderList(); renderInspect(S.sel); updateTop(); }
  const select = id => { S.sel = id; renderInspect(id); };
  const add = id => { if (!id || S.cards.includes(id) || S.cards.length >= DECK_MAX) return; S.cards.push(id); changed(); };
  const remove = id => { const i = S.cards.indexOf(id); if (i < 0) return; S.cards.splice(i, 1); changed(); };
  const move = (i, j) => { S.cards.splice(j, 0, S.cards.splice(i, 1)[0]); changed(); };

  function refreshSelect(key){
    const L = DeckStore.list(); selEl.replaceChildren(...L.map((d, i) => { const o = mkEl('option'); o.value = String(i); o.textContent = d.name + (d.builtin ? ' (default)' : '') + ' \u00b7 ' + d.cards.length; return o; }), Object.assign(mkEl('option'), {value:'new', textContent:'+ New deck'}));
    selEl.value = S.key = key;
  }
  function load(deck, key){
    S.name = deck.name; S.cards = deck.cards.slice(); S.loaded = deck; S.last = deck.name; S.saved = snap(); S.sel = S.cards[0] || null; nameIn.value = S.name; refreshSelect(key); changed();
  }
  function loadNew(){
    let n = 'New deck', i = 2; while (DeckStore.nameUsed(n)) n = 'New deck ' + i++;
    S.name = n; S.cards = []; S.loaded = null; S.saved = snap(); S.sel = null; nameIn.value = n; refreshSelect('new'); changed();
  }
  function save(){
    if (problem()) return; const n = S.name.trim(); DeckStore.save(n, S.cards); S.name = n; nameIn.value = n; S.loaded = DeckStore.find(n); S.last = n; S.saved = snap();
    refreshSelect(String(DeckStore.list().findIndex(d => d.name === n))); updateTop();
  }
  const discardOk = msg => dirty() ? confirmBox(msg) : Promise.resolve(true);

  const cellUnder = (x, y) => { const e = document.elementFromPoint(x, y); return e && e.closest ? e.closest('.de-grid .de-cell') : null; };
  function endDrag(apply, e){
    if (!drag) return; const d = drag; drag = null; if (d.ghost) d.ghost.remove();
    grid.querySelectorAll('.dragging, .drop').forEach(x => x.classList.remove('dragging', 'drop'));
    if (!d.on){ if (apply) select(S.cards[d.i]); return; }                              // never moved: a plain click just inspects
    if (apply){ const t = cellUnder(e.clientX, e.clientY); if (t){ const j = Math.min(+t.dataset.i, S.cards.length - 1); if (j !== d.i) move(d.i, j); } }
  }
  function build(){
    root = mkEl('div', 'screen'); root.id = 'deckEditor'; root.hidden = true;
    root.innerHTML = '<div class="de-left de-panel"></div><div class="de-center"><div class="de-top"></div><div class="de-grid"></div><div class="de-xl">Extra Deck \u00b7 not implemented yet</div><div class="de-extra"></div></div>' +
      '<div class="de-right"><input class="dctl de-search" placeholder="Search cards\u2026" spellcheck="false" autocomplete="off"><div class="de-list"></div><div class="de-exit"></div></div>';
    document.body.appendChild(root);
    insp = root.querySelector('.de-left'); grid = root.querySelector('.de-grid'); extra = root.querySelector('.de-extra'); list = root.querySelector('.de-list'); search = root.querySelector('.de-search');
    const top = root.querySelector('.de-top'); nameIn = mkEl('input', 'dctl de-name'); nameIn.maxLength = 40; nameIn.placeholder = 'Deck name'; nameIn.spellcheck = false;
    saveBtn = mkBtn('Save', save, 'c-go'); msg = mkEl('span', 'de-msg'); selEl = mkEl('select', 'dctl'); top.append(nameIn, saveBtn, selEl, msg);
    root.querySelector('.de-exit').appendChild(mkBtn('Exit', async () => { if (!await discardOk('Leave the deck editor? Unsaved changes will be lost.')) return; DeckEditor.close(); MenuUI.show(); }));
    extra.replaceChildren(...Array.from({length:20}, () => mkEl('div', 'de-cell empty')));
    nameIn.addEventListener('input', () => { S.name = nameIn.value; updateTop(); });
    selEl.addEventListener('change', async () => { const v = selEl.value, prev = S.key;
      if (!await discardOk('This deck has unsaved changes. Discard them?')){ selEl.value = prev; return; }
      if (v === 'new') loadNew(); else load(DeckStore.list()[+v], v); });
    search.addEventListener('input', () => { S.query = search.value; renderList(); });
    // grid: left-drag reorders, click inspects, right click removes
    grid.addEventListener('pointerdown', e => { if (e.button !== 0) return; const c = e.target.closest('.de-cell[data-id]'); if (c) drag = {i:+c.dataset.i, x:e.clientX, y:e.clientY, on:false, el:c, ghost:null}; });
    addEventListener('pointermove', e => { if (!drag) return;
      if (!drag.on && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6){ const r = drag.el.getBoundingClientRect(), g = drag.el.cloneNode(true);
        g.className = 'de-cell de-ghost'; g.style.width = r.width + 'px'; g.style.height = r.height + 'px'; document.body.appendChild(g); drag.ghost = g; drag.on = true; drag.el.classList.add('dragging'); }
      if (drag.on){ const r = drag.ghost.getBoundingClientRect(); drag.ghost.style.transform = 'translate(' + (e.clientX - r.width / 2) + 'px,' + (e.clientY - r.height / 2) + 'px)';
        grid.querySelectorAll('.drop').forEach(x => x.classList.remove('drop')); const t = cellUnder(e.clientX, e.clientY); if (t) t.classList.add('drop'); } });
    addEventListener('pointerup', e => endDrag(true, e)); addEventListener('pointercancel', e => endDrag(false, e));
    grid.addEventListener('contextmenu', e => { e.preventDefault(); const c = e.target.closest('.de-cell[data-id]'); if (c) remove(c.dataset.id); });
    // card list: left click adds to the end of the deck, right click removes
    list.addEventListener('click', e => { const r = e.target.closest('.de-row'); if (r){ select(r.dataset.id); add(r.dataset.id); } });
    list.addEventListener('contextmenu', e => { e.preventDefault(); const r = e.target.closest('.de-row'); if (r) remove(r.dataset.id); });
    const hov = e => { if (e.pointerType !== 'mouse' || drag) return; const c = e.target.closest('[data-id]'); renderInspect(c ? c.dataset.id : S.sel); };
    for (const h of [grid, list]){ h.addEventListener('pointerover', hov); h.addEventListener('pointerleave', () => renderInspect(S.sel)); }
  }
  return {
    open(){ if (!root) build(); root.hidden = false; search.value = S.query = '';
      const L = DeckStore.list(), i = Math.max(0, L.findIndex(d => d.name === S.last)); load(L[i], String(i)); },
    close(){ if (root) root.hidden = true; }
  };
})();

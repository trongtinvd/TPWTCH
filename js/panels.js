// panels.js - PANELS: deck/GY list, inspect panel, card action menu, close/escape handling.
// Classic script: shares one global scope with the other js/*.js files; load order matters (see index.html).

// ---- Panels + the little action menu next to the clicked card -------------------
const posColor = (i, n, hue) => 'hsla(' + hue + ',90%,58%,' + (0.12 + 0.5 * (n > 1 ? 1 - i/(n-1) : 1)).toFixed(3) + ')';
function showList(owner, kind){
  if (game.phase === 'deck' && owner !== ui.view){ ui.note = 'Deck building is private \u2013 switch seat (debug) to edit the other deck'; sync(); return; }
  openList = {owner, kind}; buildList(); deckPanel.scrollTop = 0; }
function buildList(){
  const st = deckPanel.scrollTop, {owner, kind} = openList, cards = game.piles[owner][kind], gy = kind === 'gy', canEdit = game.phase === 'deck' && kind === 'deck' && owner === ui.view && !game.ready[owner];
  deckPanel.innerHTML = '<div class="phead"><b>' + NAME[owner] + (gy ? ' Graveyard' : ' Deck') + ' (' + cards.length +
    ')</b><button class="xbtn" data-close="list" aria-label="Close list">\u00d7</button></div>' +
    '<div class="legend" style="--h:' + (gy ? 275 : 42) + '"><span>' + (gy ? 'Newest' : 'Top') + '</span><i></i><span>' + (gy ? 'Oldest' : 'Bottom') + '</span></div>';
  if (game.phase === 'deck' && !gy) deckPanel.insertAdjacentHTML('beforeend', '<div class="note">' + (canEdit ? 'Drag rows or use \u25b2\u25bc to reorder. Press Start when done \u2013 the deck locks then.' : 'This deck is locked.') + '</div>');
  if (!cards.length) deckPanel.insertAdjacentHTML('beforeend', '<div class="note">Empty</div>');
  cards.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'row' + (c === selected ? ' sel' : ''); row.tabIndex = 0;
    row.style.setProperty('--tc', cardColor(c.def));
    row.style.background = posColor(i, cards.length, gy ? 275 : 42);
    row.innerHTML = '<span class="pos">' + (i+1) + '</span><span class="nm"></span><span class="ty">' + TYPES[c.def.type].label + '</span>';
    row.querySelector('.nm').textContent = c.def.name;
    if (canEdit){
      row.draggable = true;
      row.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; });
      row.addEventListener('dragover', e => e.preventDefault());
      row.addEventListener('drop', e => { e.preventDefault(); const f = +e.dataTransfer.getData('text/plain'); if (f !== i) send({type:'ReorderDeck', player:owner, from:f, to:i}); });
      const mv = document.createElement('span'); mv.className = 'mv';
      [['\u25b2', i-1, 'Move up'], ['\u25bc', i+1, 'Move down']].forEach(([g, to, lab]) => {
        const b = document.createElement('button'); b.className = 'xbtn'; b.textContent = g; b.setAttribute('aria-label', lab); b.disabled = to < 0 || to >= cards.length;
        b.addEventListener('click', e => { e.stopPropagation(); send({type:'ReorderDeck', player:owner, from:i, to}); }); mv.appendChild(b);
      });
      row.appendChild(mv);
    }
    row.addEventListener('click', () => showCard(c));
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); showCard(c); } });
    deckPanel.appendChild(row);
  });
  deckPanel.insertAdjacentHTML('beforeend', '<div class="rowspace"></div>');
  deckPanel.hidden = false; deckPanel.scrollTop = st;
}
function showCard(c, pin = true){
  const d = c.def, T = TYPES[d.type], pile = game.piles[c.owner][c.loc], idx = pile ? pile.indexOf(c) : -1;
  if (pin) selected = c;
  deckPanel.querySelectorAll('.row').forEach((r, i) => r.classList.toggle('sel', !!openList && game.piles[openList.owner][openList.kind][i] === selected));
  const stats = d.type === 'creature' ? ['ATK ' + d.atk, 'HP ' + d.hp] : d.type === 'spell' ? [d.timing, 'HP ' + d.hp] : ['HP ' + d.hp];
  const where = {deck:'Position in deck: ' + (idx+1) + ' of ' + (pile||[]).length + (idx === 0 ? ' (top)' : ''),
                 gy:'Graveyard: ' + (idx+1) + ' of ' + (pile||[]).length + (idx === 0 ? ' (most recent)' : ''),
                 hand:'In ' + NAME[c.owner] + '\u2019s hand', board:'On the board (' + NAME[c.owner] + ')', stack:'On the stack (' + NAME[c.owner] + ')'}[c.loc];
  const gyActs = c.loc === 'gy' ? (d.abilities || []).map((a, i) => ({a, i, why: c.owner !== ui.view ? 'Not your card' : Sim.canActivate(game, c, i)})).filter(x => x.a.zone === 'gy') : [];
  const key = c.iid + '|' + where + '|' + c.damage.length + '|' + Sim.totalDamage(c) + '|' + gyActs.map(x => x.why || 'ok').join();
  if (inspect.hidden || inspect.dataset.key !== key){
  inspect.dataset.key = key;
  inspect.innerHTML = '<div class="phead"><b>Inspect</b><button class="xbtn" data-close="inspect" aria-label="Close inspection panel">\u00d7</button></div>' +
    '<div class="art"></div><div class="pbody"><h3></h3><div class="meta"></div><div class="stats"></div><p></p><div class="where"></div><div class="dmg"></div></div>';
  inspect.style.setProperty('--tc', cardColor(d));
  const im = new Image(); im.src = artURL(d); im.alt = d.name; inspect.querySelector('.art').appendChild(im);
  inspect.querySelector('h3').textContent = d.name;
  inspect.querySelector('.meta').textContent = T.label + (d.type === 'spell' ? ' \u00b7 ' + d.timing : '');
  inspect.querySelector('.stats').innerHTML = stats.map(x => '<span class="stat">' + x + '</span>').join('');
  inspect.querySelector('p').textContent = d.text;
  inspect.querySelector('.where').textContent = where;
  if (gyActs.length){ const bar = document.createElement('div'); bar.className = 'acts'; gyActs.forEach(({a, i, why}) => { const b = document.createElement('button'); b.className = 'abtn'; b.textContent = a.speed + ': ' + a.name; b.disabled = !!why; b.title = why || ''; if (!why) b.onclick = () => send({type:'Activate', iid:c.iid, ab:i}); bar.appendChild(b); }); inspect.appendChild(bar); }
  const dl = inspect.querySelector('.dmg');
  if (c.damage.length){
    const h = document.createElement('b'); h.textContent = 'Damage counters (' + Sim.totalDamage(c) + ' / HP ' + d.hp + ')'; dl.appendChild(h);
    c.damage.forEach(x => { const r = document.createElement('div'); r.textContent = x.amount + ' from ' + game.cards[x.source].def.name + ' \u00b7 turn ' + x.turn + ', #' + x.seq; dl.appendChild(r); });
  }
  }
  inspect.hidden = false;
}
function actionsFor(c){
  const acts = [];
  if (c.loc === 'hand' && c.owner === ui.view) acts.push({t:'Play', why:uiCanPlay(c), run:() => play(c)});
  if (c.loc === 'board' && c.def.type === 'creature') acts.push({t:'Attack', why: c.owner !== ui.view ? 'Not your creature' : Sim.canAttack(game, c), run:() => send({type:'Attack', iid:c.iid})});
  if (c.loc === 'board') (c.def.abilities || []).forEach((a, i) => (a.zone || 'board') === 'board' && acts.push({t:a.speed + ': ' + a.name, why: c.owner !== ui.view ? 'Not your card' : Sim.canActivate(game, c, i), run:() => send({type:'Activate', iid:c.iid, ab:i})}));
  if (c.loc === 'board' && c.def.type === 'enchantment' && !c.def.abilities) acts.push({t:'Activate', why:'This card has no ability yet'});
  return acts;
}
function closeMenu(){ menu.hidden = true; }
function openMenu(c, x, y){
  const acts = actionsFor(c);
  if (!acts.length) return closeMenu();
  menu.innerHTML = '<div class="mt"></div>';
  menu.firstChild.textContent = c.def.name;
  acts.forEach(a => {
    const b = document.createElement('button'); b.className = 'abtn'; b.textContent = a.t;
    b.disabled = !!a.why; if (a.why) b.title = a.why; else b.onclick = () => { closeMenu(); a.run(); };
    menu.appendChild(b);
  });
  const why = acts.find(a => a.why);
  if (why) menu.insertAdjacentHTML('beforeend', '<div class="note" style="margin:0"></div>'), menu.lastChild.textContent = why.why;
  menu.hidden = false;
  const w = 160, h = 56 + acts.length * 36 + (why ? 36 : 0);   // placed right at the pointer, kept on screen
  menu.style.left = Math.max(8, Math.min(x + 10, innerWidth - w - 8)) + 'px';
  menu.style.top  = Math.max(8, Math.min(y + 10, innerHeight - h - 8)) + 'px';
}
function refreshInspect(){                          // hovered card wins; otherwise the pinned (clicked) one; otherwise hidden
  const c = inspHold ? null : (preview || selected);
  if (c && !(c.loc === 'hand' && c.owner !== ui.view)) showCard(c, false); else inspect.hidden = true;
}
function hideInspect(){ inspect.hidden = true; selected = null; deckPanel.querySelectorAll('.row.sel').forEach(r => r.classList.remove('sel')); sync(); }
function hideList(){ deckPanel.hidden = true; openList = null; hideInspect(); }
function closeAll(){ closeMenu(); if (!deckPanel.hidden) hideList(); else if (!inspect.hidden) hideInspect(); }
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-close]');
  if (b) (b.dataset.close === 'inspect' ? hideInspect : hideList)();
});
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!menu.hidden) closeMenu();
  else if (placing){ placing = null; sync(); }
  else if (!inspect.hidden) hideInspect();
  else if (!deckPanel.hidden) hideList();
});

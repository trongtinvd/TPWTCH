// panels.js - Deck/graveyard/exile lists, inspect panel, action menu
// ---- Panels + the little action menu next to the clicked card -------------------
const cloudMap_ = c => c.loc === 'board' && !!Sim.cloudMap(game)[c.slot];   // derived (a passive of King Eye), not a stored status
// Statuses of a card or a player: the ordered list, oldest first. Removed ones are greyed and only shown when the toggle is on.
function renderStatuses(dl, o, extra){
  const L = Sim.statusLines(o), nLive = L.filter(x => !x.removed).length, nGone = L.length - nLive, shown = L.filter(x => ui.showRemoved || !x.removed);
  if (!L.length && !extra) return; const h = document.createElement('b'); h.textContent = 'Statuses (' + nLive + ' active' + (nGone ? ', ' + nGone + ' removed' : '') + ')'; dl.appendChild(h);
  if (extra) { const r = document.createElement('div'); r.textContent = '\u2022 ' + extra; dl.appendChild(r); }
  shown.forEach(x => { const r = document.createElement('div'); r.textContent = '\u2022 ' + x.text; if (x.removed){ r.style.opacity = '.45'; r.style.textDecoration = 'line-through'; } dl.appendChild(r); });
  dl.appendChild(document.createElement('br'));
}
const phead = () => '<div class="phead"><b>Inspect</b><span><button class="xbtn" data-toggle="removed" style="font-size:11px" aria-label="Show or hide removed statuses">Removed: ' + (ui.showRemoved ? 'shown' : 'hidden') + '</button><button class="xbtn" data-close="inspect" aria-label="Close inspection panel">\u00d7</button></span></div>';
const posColor = (i, n, hue) => 'hsla(' + hue + ',90%,58%,' + (0.12 + 0.5 * (n > 1 ? 1 - i/(n-1) : 1)).toFixed(3) + ')';
const listCards = l => { const a = game.piles[l.owner][l.kind]; return l.kind === 'exile' ? [...a].reverse() : a; };   // exile lists newest first
function showList(owner, kind){
  if (game.phase === 'deck' && owner !== ui.view){ ui.note = 'Deck building is private \u2013 switch seat (debug) to edit the other deck'; sync(); return; }
  openList = {owner, kind}; buildList(); deckPanel.scrollTop = 0; }
function buildList(){
  const st = deckPanel.scrollTop, {owner, kind} = openList, cards = listCards(openList), gy = kind !== 'deck', canEdit = game.phase === 'deck' && kind === 'deck' && owner === ui.view && !game.ready[owner];
  deckPanel.innerHTML = '<div class="phead"><b>' + NAME[owner] + ({gy:' Graveyard', exile:' Exile'}[kind] || ' Deck') + ' (' + cards.length +
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
let inspLast = null;   // what the inspector shows right now (the status toggle re-renders it)
function showCard(c, pin = true){
  inspLast = {c};
  const d = c.def, T = TYPES[d.type], pile = game.piles[c.owner][c.loc], idx = pile ? pile.indexOf(c) : -1;
  if (pin){ selected = c; selP = null; }
  deckPanel.querySelectorAll('.row').forEach((r, i) => r.classList.toggle('sel', !!openList && listCards(openList)[i] === selected));
  const stats = (d.type === 'creature' ? ['ATK ' + Sim.atkOf(c), 'HP ' + Sim.hpOf(c)] : d.type === 'spell' ? [d.timing, 'HP ' + d.hp] : ['HP ' + Sim.hpOf(c)]).concat(c.loc === 'board' && Sim.totalDamage(c) ? ['Damage ' + Sim.totalDamage(c)] : []);
  const where = {deck:'Position in deck: ' + (idx+1) + ' of ' + (pile||[]).length + (idx === 0 ? ' (top)' : ''),
                 gy:'Graveyard: ' + (idx+1) + ' of ' + (pile||[]).length + (idx === 0 ? ' (most recent)' : ''),
                 exile:'In exile (' + NAME[c.owner] + ')', hand:'In ' + NAME[c.owner] + '\u2019s hand', board:'On the board (' + NAME[c.owner] + ')', stack:'On the stack (' + NAME[c.owner] + ')'}[c.loc];
  const gyActs = (c.loc === 'gy' || c.loc === 'hand') ? (Sim.abDef(c).abilities || []).map((a, i) => ({a, i, why: c.owner !== ui.view ? 'Not your card' : Sim.canActivate(game, c, i)})).filter(x => x.a.zone === c.loc) : [];
  const key = c.iid + '|' + where + '|' + ui.showRemoved + '|' + gyActs.map(x => x.why || 'ok').join() + '|' + Sim.statusLines(c).map(x => x.text).join('|') + '|' + (cloudMap_(c) ? 'cloud' : '');
  if (inspect.hidden || inspect.dataset.key !== key){
  inspect.dataset.key = key;
  inspect.innerHTML = phead() +
    '<div class="art"></div><div class="pbody"><h3></h3><div class="meta"></div><div class="stats"></div><p></p><div class="where"></div><div class="dmg"></div></div>';
  inspect.style.setProperty('--tc', cardColor(d));
  const im = new Image(); im.src = artURL(d); im.alt = d.name; inspect.querySelector('.art').appendChild(im);
  inspect.querySelector('h3').textContent = d.name;
  inspect.querySelector('.meta').textContent = T.label + (d.type === 'spell' ? ' \u00b7 ' + d.timing : '');
  inspect.querySelector('.stats').innerHTML = stats.map(x => '<span class="stat">' + x + '</span>').join('');
  inspect.querySelector('p').textContent = d.text;
  inspect.querySelector('.where').textContent = where;
  if (gyActs.length){ const bar = document.createElement('div'); bar.className = 'acts'; gyActs.forEach(({a, i, why}) => { const b = document.createElement('button'); b.className = 'abtn'; b.textContent = a.speed + ': ' + a.name; b.disabled = !!why; b.title = why || ''; if (!why) b.onclick = () => send({type:'Activate', iid:c.iid, ab:i}); bar.appendChild(b); }); inspect.appendChild(bar); }
  const dl = inspect.querySelector('.dmg'); renderStatuses(dl, c, cloudMap_(c) ? 'Covered by a King Eye cloud (derived from the board)' : '');
  }
  inspect.hidden = false;
}
let hoverP = null, selP = null;                     // player inspection: hovered / pinned (click a life bar)
function showPlayer(p, pin){
  inspLast = {p};
  if (pin){ selP = p; selected = null; }
  const s = game, P = s.piles[p], n = Object.values(s.cards).filter(c => c.loc === 'board' && c.owner === p).length;
  const stats = ['Life ' + s.life[p] + ' / ' + s.maxLife, 'Permanents ' + n, 'Hand ' + P.hand.length, 'Deck ' + P.deck.length, 'GY ' + P.gy.length, 'Exile ' + P.exile.length];
  const where = (s.active === p ? 'Turn player' : 'Not the turn player') + (s.priority === p ? ' · has priority' : '');
  const key = 'P|' + p + stats.join() + where + ui.showRemoved + '|' + Sim.statusLines(s.players[p]).map(x => x.text).join('|');
  if (inspect.hidden || inspect.dataset.key !== key){
    inspect.dataset.key = key;
    inspect.innerHTML = phead() + '<div class="art"></div><div class="pbody"><h3></h3><div class="meta">Player</div><div class="stats"></div><p></p><div class="where"></div><div class="dmg"></div></div>';
    inspect.style.setProperty('--tc', p === 'Player' ? '#3f7fd8' : '#d4524f');
    inspect.querySelector('.art').textContent = NAME[p]; inspect.querySelector('h3').textContent = NAME[p];
    inspect.querySelector('.stats').innerHTML = stats.map(x => '<span class="stat">' + x + '</span>').join('');
    inspect.querySelector('p').textContent = 'Life total, piles and rules that affect this player.';
    inspect.querySelector('.where').textContent = where;
    const dl = inspect.querySelector('.dmg'); renderStatuses(dl, s.players[p]);
  }
  inspect.hidden = false;
}
function actionsFor(c){
  const acts = [];
  if (c.loc === 'hand' && c.owner === ui.view) acts.push({t:'Play', why:uiCanPlay(c), run:() => play(c)});
  if (c.loc === 'board' && c.def.type === 'creature') acts.push({t:'Attack', why: c.owner !== ui.view ? 'Not your creature' : Sim.canAttack(game, c), run:() => send({type:'Attack', iid:c.iid})});
  if (c.loc === 'board' || c.loc === 'hand') (Sim.abDef(c).abilities || []).forEach((a, i) => (a.zone || 'board') === c.loc && acts.push({t:a.speed + ': ' + a.name, why: c.owner !== ui.view ? 'Not your card' : Sim.canActivate(game, c, i), run:() => send({type:'Activate', iid:c.iid, ab:i})}));
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
  const c = inspHold ? null : (preview || (hoverP ? null : selected)), p = inspHold || c ? null : (hoverP || selP);
  if (c && !(c.loc === 'hand' && c.owner !== ui.view && !Sim.isRevealed(c, ui.view)) && !seenHidden(c)) showCard(c, false); else if (p) showPlayer(p); else inspect.hidden = true;
}
function hideInspect(){ inspect.hidden = true; selected = null; selP = null; deckPanel.querySelectorAll('.row.sel').forEach(r => r.classList.remove('sel')); sync(); }
function hideList(){ deckPanel.hidden = true; openList = null; hideInspect(); }
function closeAll(){ closeMenu(); if (!deckPanel.hidden) hideList(); else if (!inspect.hidden) hideInspect(); }
document.addEventListener('click', e => {
  const tg = e.target.closest && e.target.closest('[data-toggle="removed"]'); if (tg){ ui.showRemoved = !ui.showRemoved; inspect.dataset.key = ''; if (inspLast && inspLast.c) showCard(inspLast.c, false); else if (inspLast && inspLast.p) showPlayer(inspLast.p, false); return; }
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
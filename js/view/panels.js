// panels.js - Deck/graveyard/exile lists, inspect panel, action menu
// ---- Panels + the little action menu next to the clicked card -------------------
const cloudMap_ = c => c.loc === 'board' && !!Sim.cloudMap(game)[c.slot]; // derived (a passive of King Eye), not a stored status
// Statuses of a card or a player: the ordered list, oldest first. Removed ones are greyed and only shown when the toggle is on.
function renderLog(dl, o, extra) {
  // the whole history, newest on top
  const L = Sim.logLines(o),
    h = document.createElement('b');
  h.textContent = 'Log (' + L.length + ' entries, newest first)';
  dl.appendChild(h);
  if (extra) {
    const r = document.createElement('div');
    r.textContent = '\u2022 ' + extra;
    dl.appendChild(r);
  }
  L.slice()
    .reverse()
    .forEach(x => {
      const r = document.createElement('div');
      r.textContent = '\u2022 ' + x.text;
      dl.appendChild(r);
    });
  dl.appendChild(document.createElement('br'));
}
function renderStatuses(dl, o, extra) {
  if (ui.inspLog) {
    renderLog(dl, o, extra);
    return;
  }
  const L = Sim.statusLines(o),
    nLive = L.filter(x => !x.removed).length,
    nGone = L.length - nLive,
    shown = L.filter(x => ui.showRemoved || !x.removed).reverse(); // newest on top
  if (!L.length && !extra) return;
  const h = document.createElement('b');
  h.textContent = 'Statuses (' + nLive + ' active' + (nGone ? ', ' + nGone + ' removed' : '') + ')';
  dl.appendChild(h);
  if (extra) {
    const r = document.createElement('div');
    r.textContent = '\u2022 ' + extra;
    dl.appendChild(r);
  }
  shown.forEach(x => {
    const r = document.createElement('div');
    r.textContent = '\u2022 ' + x.text;
    if (x.removed) {
      r.style.opacity = '.45';
      r.style.textDecoration = 'line-through';
    }
    dl.appendChild(r);
  });
  dl.appendChild(document.createElement('br'));
}
const phead = forCard =>
  '<div class="phead"><b>Inspect</b><span>' +
  (forCard
    ? '<button class="xbtn" data-toggle="text" style="font-size:11px" aria-label="Switch the card text between the generated and the written description" title="Generated: the text derived from the card data (default). Written: the original description.">Text: ' +
      (CardText.mode === 'written' ? 'Written' : 'Generated') +
      '</button>'
    : '') +
  '<button class="xbtn" data-toggle="mode" style="font-size:11px" aria-label="Switch between statuses and log">View: ' +
  (ui.inspLog ? 'Log' : 'Statuses') +
  '</button>' +
  (ui.inspLog
    ? ''
    : '<button class="xbtn" data-toggle="removed" style="font-size:11px" aria-label="Show or hide removed statuses">Removed: ' +
      (ui.showRemoved ? 'shown' : 'hidden') +
      '</button>') +
  '<button class="xbtn" data-close="inspect" aria-label="Close inspection panel">\u00d7</button></span></div>';
const posColor = (i, n, hue) =>
  'hsla(' + hue + ',90%,58%,' + (0.12 + 0.5 * (n > 1 ? 1 - i / (n - 1) : 1)).toFixed(3) + ')';
const listCards = l => {
  const a = game.piles[l.owner][l.kind];
  return l.kind === 'exile' ? [...a].reverse() : a;
}; // exile lists newest first
function showList(owner, kind) {
  if (game.phase === 'deck' && owner !== ui.view) {
    ui.note = 'Deck building is private \u2013 switch seat (debug) to edit the other deck';
    sync();
    return;
  }
  ui.openList = { owner, kind };
  buildList();
  deckPanel.scrollTop = 0;
}
function buildList() {
  const st = deckPanel.scrollTop,
    { owner, kind } = ui.openList,
    cards = listCards(ui.openList),
    gy = kind === 'gy' || kind === 'exile',
    rowActs = new Set(
      !rp.on && !game.choice && game.phase === 'play'
        ? Sim.actionsOf(game, ui.view)
            .filter(a => a.kind === 'ability')
            .map(a => a.iid)
        : []
    ), // graveyard cards with a usable ability
    canEdit =
      kind === 'deck' &&
      ((game.phase === 'deck' && owner === ui.view && !game.ready[owner]) || (ui.deckEdit && game.phase === 'play'));
  deckPanel.innerHTML =
    '<div class="phead"><b>' +
    NAME[owner] +
    ({ gy: ' Graveyard', exile: ' Exile', extra: ' Extra Deck' }[kind] || ' Deck') +
    ' (' +
    cards.length +
    ')</b><button class="xbtn" data-close="list" aria-label="Close list">\u00d7</button></div>' +
    '<div class="legend" style="--h:' +
    (gy ? 275 : 42) +
    '"><span>' +
    (gy ? 'Newest' : 'Top') +
    '</span><i></i><span>' +
    (gy ? 'Oldest' : 'Bottom') +
    '</span></div>';
  if (kind === 'deck' && (game.phase === 'deck' || ui.deckEdit))
    deckPanel.insertAdjacentHTML(
      'beforeend',
      '<div class="note">' +
        (canEdit && game.phase === 'play'
          ? 'Debug: top of the list = next draw. Drag rows or use \u25b2\u25bc to reorder.'
          : canEdit
            ? 'Drag rows or use \u25b2\u25bc to reorder. Press Start when done \u2013 the deck locks then.'
            : 'This deck is locked.') +
        '</div>'
    );
  if (!cards.length) deckPanel.insertAdjacentHTML('beforeend', '<div class="note">Empty</div>');
  cards.forEach((c, i) => {
    // a card this seat may not know (the other player\u2019s deck or extra deck, an unrevealed hand) is listed but not named; your own deck stays readable (deck building)
    const known = Sim.canSee(game, ui.view, c) || (owner === ui.view && kind === 'deck') || ui.deckEdit,
      row = document.createElement('div');
    row.className = 'row' + (c === ui.selected ? ' sel' : '') + (rowActs.has(c.iid) ? ' act' : '');
    row.tabIndex = 0;
    row.style.setProperty('--tc', known ? cardColor(c.def) : '#666');
    row.style.background = posColor(i, cards.length, gy ? 275 : 42);
    row.innerHTML =
      '<span class="pos">' +
      (i + 1) +
      '</span><span class="nm"></span><span class="ty">' +
      (known ? TYPES[c.def.type].label : '') +
      '</span>';
    row.querySelector('.nm').textContent = known ? c.def.name : 'Hidden card';
    if (kind === 'extra' && game.phase === 'play' && known) {
      // an extra deck creature whose conditions are met is lit; the progress of its conditions is shown next to it
      const ok = Sim.condsMet(game, owner, c.def),
        pr = document.createElement('span');
      row.classList.add(ok ? 'ready' : 'locked');
      pr.className = 'cprog';
      pr.textContent = (c.def.conditions || []).map(condNote).filter(Boolean).join(' \u00b7 ');
      pr.title = pr.textContent;
      if (pr.textContent) row.insertBefore(pr, row.querySelector('.ty'));
    }
    if (canEdit) {
      row.draggable = true;
      row.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', String(i));
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragover', e => e.preventDefault());
      row.addEventListener('drop', e => {
        e.preventDefault();
        const f = +e.dataTransfer.getData('text/plain');
        if (f !== i) send({ type: 'ReorderDeck', debug: true, player: owner, from: f, to: i });
      });
      const mv = document.createElement('span');
      mv.className = 'mv';
      [
        ['\u25b2', i - 1, 'Move up'],
        ['\u25bc', i + 1, 'Move down'],
      ].forEach(([g, to, lab]) => {
        const b = document.createElement('button');
        b.className = 'xbtn';
        b.textContent = g;
        b.setAttribute('aria-label', lab);
        b.disabled = to < 0 || to >= cards.length;
        b.addEventListener('click', e => {
          e.stopPropagation();
          send({ type: 'ReorderDeck', debug: true, player: owner, from: i, to });
        });
        mv.appendChild(b);
      });
      row.appendChild(mv);
    }
    row.addEventListener('click', e => {
      if (!known) return;
      showCard(c);
      if (!rp.on) openMenu(c, e.clientX, e.clientY); // GY: its abilities; deck (debug, Vs Self / Vs Bot): add to hand. No trip across the scene
    });
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (known) showCard(c);
      }
    });
    deckPanel.appendChild(row);
  });
  deckPanel.insertAdjacentHTML('beforeend', '<div class="rowspace"></div>');
  deckPanel.hidden = false;
  deckPanel.scrollTop = st;
}
// ---- The card text as parts (one per trigger / ability / passive / rider, see textParts in cards.js).
// cls: ''    normal
//      'dim' GREYED OUT = not usable from where the card is right now (or, with a stack ability selected: not that ability)
//      'off' CROSSED OUT = disabled (Avatar of Rabies took the card's abilities away; the new ones are added after them)
//      'hl'  the ability selected on the stack
const partOn = (c, p, def) => {
  // usable from the card's current location? (location only: priority, timing and costs are not considered)
  if (p.list === 'passives' && def.passives[p.i].op === 'Keyword') {
    const k = KEYWORDS[def.passives[p.i].kw];
    return !k || c.loc === k.zone; // Flash works from the hand, Retaliate on the board
  }
  if (p.list === 'passives' || p.list === 'rider') return c.loc === 'board';
  if (p.list === 'triggers') {
    const t = def.triggers[p.i];
    return t.on === 'enter' ? c.loc !== 'board' : c.loc === (t.zone || 'board'); // a permanent cannot enter the board from the board
  }
  if (p.list === 'abilities') return [].concat(def.abilities[p.i].zone || 'board').includes(c.loc);
  return true; // keywords and the text of a spell
};
function cardParts(c, H) {
  const sc = (H && game.cards[H.src]) || c,
    base = sc.def,
    eff = sc.loc === 'board' ? Sim.abDef(sc) : base,
    swapped = eff.id !== base.id;
  const add = (out, def, off, onlyAb) => {
    for (const p of textParts(def)) {
      const ab = !['body', 'extra', 'conditions', 'materials'].includes(p.list);
      if (onlyAb && !ab) continue;
      const hit = !!H && def.id === H.from && p.list === H.list && p.i === H.i,
        cls = hit ? 'hl' : H ? 'dim' : off && ab ? 'off' : partOn(sc, p, def) ? '' : 'dim';
      if (p.list === 'conditions' || p.list === 'materials') out.push({ box: p.list, def, cls, text: p.text });
      else out.push({ text: p.text, cls, written: !!p.written });
    }
    return out;
  };
  let out = add([], base, swapped, false); // the printed abilities: crossed out when replaced
  if (swapped) add(out, eff, false, true); // ...and the ones that replaced them
  if (H && !out.some(x => x.cls === 'hl')) {
    // the selected object came from abilities the card has lost since (its Avatar damage was removed): show the text it came from
    const fd = DEFS.find(x => x.id === H.from);
    if (fd) out = add([], fd, false, false);
  }
  return out;
}
// what an extra deck creature's condition looks like right now: a note for the row (hover shows it too). UI only: it reads the game, it never changes it
const COND_UI = {
  LostLife: s => {
    const who = ['Player', 'Opponent'].filter(q =>
      s.players[q].statuses.some(x => x.kind === 'damage' || x.kind === 'paid')
    );
    return who.length ? 'life lost by: ' + who.map(q => NAME[q]).join(', ') : 'nobody has lost life yet';
  },
  BothDrewMoreThan: (s, e) =>
    NAME.Player + ' ' + s.drawn.Player + '/' + e.n + ' \u00b7 ' + NAME.Opponent + ' ' + s.drawn.Opponent + '/' + e.n,
};
const condNote = e => (COND_UI[e.op] ? COND_UI[e.op](game, e) : '');
function boxInto(p, x, c) {
  // Conditions and Materials: each on its own lines, with a status mark per condition and a chip per material
  const b = document.createElement('div'),
    h = document.createElement('b');
  b.className = 'xbox ' + x.box + (x.cls ? ' ' + x.cls : '');
  h.textContent = x.box === 'conditions' ? 'Conditions' : 'Materials';
  b.appendChild(h);
  if (x.box === 'conditions')
    x.def.conditions.forEach(e => {
      const r = document.createElement('div'),
        note = condNote(e),
        live = game.phase === 'play' && c && c.def.extra;
      r.className = 'xrow';
      const ok = live ? Sim.condOk(game, c.owner, e) : null;
      r.textContent = (ok === null ? '\u2022 ' : ok ? '\u2713 ' : '\u2717 ') + e.text;
      if (ok !== null) r.classList.add(ok ? 'met' : 'unmet');
      if (note) {
        r.title = note;
        const n = document.createElement('small');
        n.textContent = note;
        r.appendChild(n);
      }
      b.appendChild(r);
    });
  else
    x.def.materials.forEach(m => {
      const ch = document.createElement('span');
      ch.className = 'chip';
      ch.textContent = m.text;
      b.appendChild(ch);
    });
  p.appendChild(b);
}
// the written / generated switch (or the description database arriving) shows the open card again
CardText.onChange(() => {
  if (typeof inspect === 'undefined' || inspect.hidden || !ui.inspLast || !ui.inspLast.c) return;
  inspect.dataset.key = '';
  showCard(ui.inspLast.c, false);
});
function partsInto(p, parts, c) {
  p.textContent = '';
  parts.forEach((x, i) => {
    if (x.box) return boxInto(p, x, c);
    const s = document.createElement('span');
    s.className = 'seg' + (x.cls ? ' ' + x.cls : '');
    s.textContent = x.text;
    s.title = { off: 'Disabled (crossed out)', dim: 'Not usable right now (greyed out)' }[x.cls] || '';
    if (x.written) s.classList.add('written'); // the original description (Text: Written)
    p.appendChild(s);
    if (i < parts.length - 1) p.appendChild(document.createTextNode(' '));
  });
}
function showCard(c, pin = true, hl = null) {
  ui.inspLast = { c };
  const d = c.def,
    T = TYPES[d.type],
    pile = game.piles[c.owner][c.loc],
    idx = pile ? pile.indexOf(c) : -1;
  if (pin) {
    ui.selected = c;
    ui.selP = null;
    ui.selAP = null;
    ui.selHl = hl;
  }
  const H = c === ui.selected ? ui.selHl : null, // a selected stack ability: its text is highlighted, the rest greyed out
    parts = cardParts(c, H);
  deckPanel
    .querySelectorAll('.row')
    .forEach((r, i) => r.classList.toggle('sel', !!ui.openList && listCards(ui.openList)[i] === ui.selected));
  // one HP field = HP left after damage (the board badge's number), coloured like that badge: red below printed, blue equal, green above
  const hpStat = () => {
      const v = effHp(c),
        [fill, line] = HP_PAL[v < d.hp ? 0 : v === d.hp ? 1 : 2];
      return (
        '<span class="stat" style="background:' +
        fill +
        ';box-shadow:inset 0 0 0 2px ' +
        line +
        ';color:#fff">HP ' +
        v +
        '</span>'
      );
    },
    stats = (
      d.type === 'creature'
        ? ['ATK ' + Sim.atkOf(c), hpStat()]
        : d.type === 'spell'
          ? [d.timing, 'HP ' + d.hp]
          : [hpStat()]
    ).map(x => (x.startsWith('<span') ? x : '<span class="stat">' + x + '</span>'));
  const where = {
    deck: 'Position in deck: ' + (idx + 1) + ' of ' + (pile || []).length + (idx === 0 ? ' (top)' : ''),
    gy: 'Graveyard: ' + (idx + 1) + ' of ' + (pile || []).length + (idx === 0 ? ' (most recent)' : ''),
    exile: 'In exile (' + NAME[c.owner] + ')',
    extra: 'In the extra deck (' + NAME[c.owner] + ')',
    hand: 'In ' + NAME[c.owner] + '\u2019s hand',
    board: 'On the board (' + NAME[Sim.ctl(c)] + ')' + (Sim.ctl(c) !== c.owner ? ', owned by ' + NAME[c.owner] : ''),
    stack: 'On the stack (' + NAME[Sim.ctl(c)] + ')' + (Sim.ctl(c) !== c.owner ? ', owned by ' + NAME[c.owner] : ''),
  }[c.loc];
  const gyActs =
    !rp.on && (c.loc === 'gy' || c.loc === 'hand' || c.loc === 'deck')
      ? (Sim.abDef(c).abilities || [])
          .map((a, i) => ({ a, i, why: Sim.ctl(c) !== ui.view ? 'Not your card' : Sim.canActivate(game, c, i) }))
          .filter(x => [].concat(x.a.zone || 'board').includes(c.loc))
      : [];
  const key =
    c.iid +
    '|' +
    where +
    '|' +
    ui.showRemoved +
    '|' +
    ui.inspLog +
    '|' +
    (c.logs || []).length +
    '|' +
    gyActs.map(x => x.why || 'ok').join() +
    '|' +
    Sim.statusLines(c)
      .map(x => x.text)
      .join('|') +
    '|' +
    (cloudMap_(c) ? 'cloud' : '') +
    '|' +
    stats.join('') +
    JSON.stringify(H) +
    JSON.stringify(parts);
  if (inspect.hidden || inspect.dataset.key !== key) {
    inspect.dataset.key = key;
    inspect.innerHTML =
      phead(true) +
      '<div class="art"></div><div class="pbody"><h3></h3><div class="meta"></div><div class="stats"></div><p></p><div class="where"></div><div class="dmg"></div></div>';
    inspect.style.setProperty('--tc', cardColor(d));
    const im = new Image();
    im.src = artURL(d);
    im.alt = d.name;
    inspect.querySelector('.art').appendChild(im);
    inspect.querySelector('h3').textContent = d.name;
    inspect.querySelector('.meta').textContent = T.label + (d.type === 'spell' ? ' \u00b7 ' + d.timing : '');
    inspect.querySelector('.stats').innerHTML = stats.join('');
    partsInto(inspect.querySelector('p'), parts, c);
    inspect.querySelector('.where').textContent = where;
    if (gyActs.length) {
      const bar = document.createElement('div');
      bar.className = 'acts';
      gyActs.forEach(({ a, i, why }) => {
        const b = document.createElement('button');
        b.className = 'abtn';
        b.textContent = a.speed + ': ' + a.name;
        b.disabled = !!why;
        b.title = why || '';
        if (!why) b.onclick = () => send({ type: 'Activate', iid: c.iid, ab: i });
        bar.appendChild(b);
      });
      inspect.appendChild(bar);
    }
    const dl = inspect.querySelector('.dmg');
    renderStatuses(dl, c, cloudMap_(c) ? 'Covered by a King Eye cloud (derived from the board)' : '');
  }
  inspect.hidden = false;
}
function showPlayer(p, pin) {
  ui.inspLast = { p };
  if (pin) {
    ui.selP = p;
    ui.selected = null;
    ui.selAP = null;
  }
  const s = game,
    P = s.piles[p],
    n = Object.values(s.cards).filter(c => c.loc === 'board' && Sim.ctl(c) === p).length;
  const stats = [
    'Life ' + s.life[p] + ' / ' + s.maxLife,
    'Permanents ' + n,
    'Hand ' + P.hand.length,
    'Deck ' + P.deck.length,
    'GY ' + P.gy.length,
    'Exile ' + P.exile.length,
  ];
  const r = Sim.raceOf(s, p); // the turn order race (effective values, statuses folded in)
  if (r) stats.push('Distance ' + r.distance, 'Speed ' + r.speed, 'Acceleration ' + r.acceleration);
  const where = (s.active === p ? 'Turn player' : 'Not the turn player') + (s.priority === p ? ' · has priority' : '');
  const key =
    'P|' +
    p +
    stats.join() +
    where +
    ui.showRemoved +
    '|' +
    ui.inspLog +
    (s.players[p].logs || []).length +
    '|' +
    Sim.statusLines(s.players[p])
      .map(x => x.text)
      .join('|');
  if (inspect.hidden || inspect.dataset.key !== key) {
    inspect.dataset.key = key;
    inspect.innerHTML =
      phead() +
      '<div class="art"></div><div class="pbody"><h3></h3><div class="meta">Player</div><div class="stats"></div><p></p><div class="where"></div><div class="dmg"></div></div>';
    inspect.style.setProperty('--tc', p === 'Player' ? 'var(--p1-color)' : 'var(--p2-color)');
    inspect.querySelector('.art').textContent = NAME[p];
    inspect.querySelector('h3').textContent = NAME[p];
    inspect.querySelector('.stats').innerHTML = stats.map(x => '<span class="stat">' + x + '</span>').join('');
    inspect.querySelector('p').textContent = 'Life total, piles and rules that affect this player.';
    inspect.querySelector('.where').textContent = where;
    const dl = inspect.querySelector('.dmg');
    renderStatuses(dl, s.players[p]);
  }
  inspect.hidden = false;
}
function showAP(p, id, pin) {
  // the inspection panel of one action point: whose it is, when it was gained, and (if spent) when and on what
  const a = Sim.apList(game, p).find(x => x.id === id);
  if (!a) {
    inspect.hidden = true;
    return;
  }
  ui.inspLast = { ap: { p, id } };
  if (pin) {
    ui.selAP = { p, id };
    ui.selected = null;
    ui.selP = null;
    ui.inspHold = false;
  }
  const key = 'AP|' + p + '|' + id + '|' + (a.spent ? a.spent.turn + a.spent.why : '');
  if (inspect.hidden || inspect.dataset.key !== key) {
    inspect.dataset.key = key;
    inspect.innerHTML =
      '<div class="phead"><b>Inspect</b><span><button class="xbtn" data-close="inspect" aria-label="Close inspection panel">\u00d7</button></span></div>' +
      '<div class="art"></div><div class="pbody"><h3>Action point</h3><div class="meta"></div><div class="stats"></div><p></p><div class="where"></div></div>';
    inspect.style.setProperty('--tc', 'var(--ap-color)');
    inspect.querySelector('.art').textContent = '\u2726';
    inspect.querySelector('.meta').textContent = NAME[p];
    inspect.querySelector('.stats').innerHTML = [a.spent ? 'Spent' : 'Available']
      .map(x => '<span class="stat">' + x + '</span>')
      .join('');
    inspect.querySelector('p').textContent =
      'Spend one to draw, enter the attack phase, summon a permanent or play a Slow spell (some cards ask for one as a cost). A player gains one at the start of their own turn; unspent points stay.';
    inspect.querySelector('.where').textContent =
      'Gained on turn ' +
      a.turn +
      (a.spent ? ' \u00b7 spent on turn ' + a.spent.turn + ': ' + a.spent.why : ' \u00b7 not spent yet');
  }
  inspect.hidden = false;
}
function actionsFor(c) {
  const acts = [];
  if (c.loc === 'deck' && debugOk())
    acts.push({ t: 'Debug: add to hand', run: () => send({ type: 'DebugToHand', iid: c.iid, debug: true }) });
  if (c.loc === 'hand' && c.owner === ui.view) acts.push({ t: 'Play', why: uiCanPlay(c), run: () => play(c) });
  if (c.loc === 'board' && c.def.type === 'creature')
    acts.push({
      t: 'Attack',
      why: Sim.ctl(c) !== ui.view ? 'Not your creature' : Sim.canAttack(game, c),
      run: () => send({ type: 'Attack', iid: c.iid }),
    });
  if (c.loc === 'board' || c.loc === 'hand' || c.loc === 'gy' || c.loc === 'deck')
    (Sim.abDef(c).abilities || []).forEach(
      (a, i) =>
        [].concat(a.zone || 'board').includes(c.loc) &&
        acts.push({
          t: a.speed + ': ' + a.name,
          why: Sim.ctl(c) !== ui.view ? 'Not your card' : Sim.canActivate(game, c, i),
          run: () => send({ type: 'Activate', iid: c.iid, ab: i }),
        })
    );
  if (c.loc === 'board' && c.def.type === 'enchantment' && !c.def.abilities)
    acts.push({ t: 'Activate', why: 'This card has no ability yet' });
  return acts;
}
function closeMenu() {
  menu.hidden = true;
  ui.menuAt = null;
}
function openMenu(c, x, y) {
  ui.menuAt = { iid: c.iid, x, y };
  ui.menuKey = null;
  renderMenu();
}
// the action menu is LIVE: every sync re-reads the actions, so a greyed button lights up as soon as it becomes usable
// (and the other way round). It is rebuilt only when an action or its reason changed, so a press in progress is not lost.
const refreshMenu = () => {
  if (!menu.hidden && ui.menuAt) renderMenu();
};
function renderMenu() {
  const at = ui.menuAt,
    c = at && game.cards[at.iid];
  if (!c || c.loc === 'gone' || rp.on) return closeMenu();
  const x = at.x,
    y = at.y,
    acts = actionsFor(c);
  if (!acts.length) return closeMenu();
  const key = c.iid + '|' + acts.map(a => a.t + '=' + (a.why || '')).join('|');
  if (!menu.hidden && ui.menuKey === key) return;
  ui.menuKey = key;
  menu.innerHTML = '<div class="mt"></div>';
  menu.firstChild.textContent = c.def.name;
  acts.forEach(a => {
    const b = document.createElement('button');
    b.className = 'abtn';
    b.textContent = a.t;
    b.disabled = !!a.why;
    if (a.why) b.title = a.why;
    else
      b.onclick = () => {
        closeMenu();
        a.run();
      };
    menu.appendChild(b);
  });
  const why = acts.find(a => a.why);
  if (why)
    (menu.insertAdjacentHTML('beforeend', '<div class="note" style="margin:0"></div>'),
      (menu.lastChild.textContent = why.why));
  menu.hidden = false;
  const w = 160,
    h = 56 + acts.length * 36 + (why ? 36 : 0); // placed right at the pointer, kept on screen
  menu.style.left = Math.max(8, Math.min(x + 10, innerWidth - w - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(y + 10, innerHeight - h - 8)) + 'px';
}
function refreshInspect() {
  // hovered card wins; otherwise the pinned (clicked) one; otherwise hidden
  const c = ui.inspHold ? null : ui.preview || (ui.hoverP ? null : ui.selected),
    p = ui.inspHold || c ? null : ui.hoverP || ui.selP,
    a = ui.inspHold || c || p ? null : ui.selAP;
  if (c && (Sim.canSee(game, ui.view, c) || (c.owner === ui.view && c.loc === 'deck')) && !seenHidden(c))
    showCard(c, false);
  else if (p) showPlayer(p);
  else if (a) showAP(a.p, a.id, false);
  else inspect.hidden = true;
}
function hideInspect() {
  inspect.hidden = true;
  ui.selected = null;
  ui.selP = null;
  ui.selAP = null;
  deckPanel.querySelectorAll('.row.sel').forEach(r => r.classList.remove('sel'));
  sync();
}
function hideList() {
  deckPanel.hidden = true;
  ui.openList = null;
  hideInspect();
}
function closeAll() {
  closeMenu();
  if (!deckPanel.hidden) hideList();
  else if (!inspect.hidden) hideInspect();
}
document.addEventListener('click', e => {
  const tg = e.target.closest && e.target.closest('[data-toggle]');
  if (tg) {
    if (tg.dataset.toggle === 'mode') ui.inspLog = !ui.inspLog;
    else if (tg.dataset.toggle === 'text') {
      CardText.setMode(CardText.mode === 'written' ? 'generated' : 'written'); // display only, the card data never changes
      Settings.set('cardText', CardText.mode);
    } else ui.showRemoved = !ui.showRemoved;
    inspect.dataset.key = '';
    if (ui.inspLast && ui.inspLast.c) showCard(ui.inspLast.c, false);
    else if (ui.inspLast && ui.inspLast.p) showPlayer(ui.inspLast.p, false);
    else if (ui.inspLast && ui.inspLast.ap) showAP(ui.inspLast.ap.p, ui.inspLast.ap.id, false);
    return;
  }
  const b = e.target.closest && e.target.closest('[data-close]');
  if (b) (b.dataset.close === 'inspect' ? hideInspect : hideList)();
});
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!menu.hidden) closeMenu();
  else if (ui.placing) {
    ui.placing = null;
    sync();
  } else if (!inspect.hidden) hideInspect();
  else if (!deckPanel.hidden) hideList();
});

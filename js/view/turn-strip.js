// turn-strip.js - the turn order strip on the right side of the game (Expedition 33 / Honkai: Star Rail style).
// A vertical stack of tiles, top to bottom: the current turn (flashing), then the turns the race (Docs/RULES.md "Turn order") projects
// ahead. Blue = your turn, red = the opponent's; the tiles fade out towards the bottom. Sim.turnOrder is pure, so the strip is simply
// recomputed on every sync: a speed change moves the tiles (a tile that changes owner flips), a finished turn slides off the top.
// Tiles are keyed by turn number, so CSS transitions do the moving. Reads the shown state (`game`), so it moves with the turn banner.
const TurnStrip = (function () {
  const N = 8, // turns projected (the most tiles shown)
    LEAVE_MS = 450;
  // tiles shown and px between tile tops come from css (--ts-count, --ts-pitch): the phone layout shows fewer, smaller tiles
  const cssNum = (k, d) => parseFloat(getComputedStyle(el).getPropertyValue(k)) || d;
  const EMBLEM = {
    // a small gold emblem per side: a shield (you) / crossed blades (the opponent)
    mine: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M12 7v9M8.5 11h7"/>',
    foe: '<path d="M5 4l10 10M19 4L9 14M14 16l3 3M10 16l-3 3M15 12l2.5 2.5M9 12l-2.5 2.5"/>',
  };
  let el = null,
    list = null,
    head = null;
  const tiles = new Map(); // turn number -> element
  const seat = () => (ui.mode === 'bot' && !rp.on ? other(ui.botSeat) : ui.view); // whose turns are blue
  function build() {
    el = document.createElement('div');
    el.id = 'turnStrip';
    el.setAttribute('aria-label', 'Turn order');
    head = document.createElement('div');
    head.className = 'tshead';
    head.innerHTML = '<span class="tsorn"></span>Turns<span class="tsorn"></span>';
    list = document.createElement('div');
    list.className = 'tslist';
    el.append(head, list);
    document.body.appendChild(el);
  }
  function tile(t) {
    const d = document.createElement('div');
    d.className = 'ts enter';
    d.innerHTML =
      '<span class="tsgem"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></svg></span>' +
      '<span class="tsname"></span><span class="tsno"></span><span class="tscorner tl"></span><span class="tscorner br"></span>';
    d.querySelector('.tsno').textContent = t.turn;
    list.appendChild(d);
    requestAnimationFrame(() => requestAnimationFrame(() => d.classList.remove('enter'))); // fade in from below
    return d;
  }
  function paint(d, t, i, me, n, pitch) {
    const mine = t.player === me,
      side = mine ? 'mine' : 'foe';
    if (d.dataset.side && d.dataset.side !== side) {
      d.classList.remove('flip');
      void d.offsetWidth; // restart the animation
      d.classList.add('flip'); // the projection changed who takes this turn
    }
    if (d.dataset.side !== side) {
      d.dataset.side = side;
      d.querySelector('svg').innerHTML = EMBLEM[side];
    }
    d.classList.toggle('mine', mine);
    d.classList.toggle('foe', !mine);
    d.classList.toggle('now', i === 0);
    d.querySelector('.tsname').textContent = i === 0 ? (mine ? 'Your turn' : 'Their turn') : NAME[t.player];
    d.style.transform = 'translateY(' + i * pitch + 'px)' + (i === 0 ? ' scale(1.06)' : '');
    d.style.opacity = i === 0 ? 1 : Math.max(0.12, 1 - (i / (n - 1)) * 0.88); // fade out towards the bottom
    d.title = 'Turn ' + t.turn + ': ' + NAME[t.player] + (i === 0 ? ' (now)' : '');
  }
  function raceText(s) {
    const r = Sim.raceOf(s, 'Player') && ['Player', 'Opponent'].map(p => [p, Sim.raceOf(s, p)]);
    return r
      ? r
          .map(
            ([p, x]) => NAME[p] + ': distance ' + x.distance + ', speed ' + x.speed + ', acceleration ' + x.acceleration
          )
          .join('\n')
      : 'No avatar stats: turns alternate';
  }
  function update() {
    if (!el) build();
    const s = game;
    el.hidden = MenuUI.away || !s || s.phase !== 'play';
    if (el.hidden) return;
    const n = Math.min(N, Math.max(2, Math.round(cssNum('--ts-count', N)))),
      pitch = cssNum('--ts-pitch', 46),
      order = Sim.turnOrder(s, n),
      me = seat(),
      keep = new Set(order.map(t => t.turn));
    for (const [k, d] of tiles)
      if (!keep.has(k)) {
        tiles.delete(k);
        d.classList.add(k < s.turn ? 'gone' : 'drop'); // a finished turn slides off the top; a rewound one (undo) just fades
        setTimeout(() => d.remove(), LEAVE_MS);
      }
    order.forEach((t, i) => {
      let d = tiles.get(t.turn);
      if (!d) tiles.set(t.turn, (d = tile(t)));
      paint(d, t, i, me, n, pitch);
    });
    list.style.height = n * pitch + 'px';
    head.title = raceText(s);
  }
  function reset() {
    // a new duel or replay: no slide from the previous game's tiles
    for (const d of tiles.values()) d.remove();
    tiles.clear();
  }
  return { update, reset, N };
})();

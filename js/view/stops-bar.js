// stops-bar.js - Patch6: the stops as small icon buttons in the bottom right corner of the game (MTG Arena style).
// Two rows for the seat you play: the stops on the opponent's turn and on your own turn, in turn order. A click sends SetStop (a recorded
// command, so replays stay exact) and keeps the choice as the default for the next game. "Permanent entered" and "End step" on the
// opponent's turn are on by default; Patch10: they turn off like any other stop (they were locked here AND forced on in the Sim).
// Whether a stop is on is the Sim's answer (Sim.stopOn), defaults included: one source of truth.
const StopsBar = (function () {
  const ICON = {
    turnStart: '<circle cx="12" cy="14" r="4"/><path d="M12 4v3M4.5 7.5l2 2M19.5 7.5l-2 2M2 14h3M19 14h3M2 20h20"/>',
    draw: '<rect x="6" y="3" width="12" height="16" rx="2"/><path d="M12 8v7M9 12l3 3 3-3"/>',
    mainStart: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5.5 3.5-5.5 3.5z"/>',
    mainEnd: '<circle cx="12" cy="12" r="9"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
    combatStart: '<path d="M4 4l11 11M20 4L9 15M13 17l4 4M11 17l-4 4M15 13l3 3M9 13l-3 3"/>',
    combatEnd: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
    stack: '<path d="M12 4l9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4M3 16l9 4 9-4"/>',
    enter: '<rect x="4" y="12" width="16" height="9" rx="1.5"/><path d="M12 2v9M8.5 7.5L12 11l3.5-3.5"/>',
    end: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>',
  };
  const ORDER = ['turnStart', 'draw', 'mainStart', 'mainEnd', 'combatStart', 'combatEnd', 'stack', 'enter', 'end'], // Patch7: + main started / ended
    ROLES = [
      ['opp', 'Their turn'],
      ['own', 'Your turn'],
    ];
  let el = null;
  const seat = () => (ui.mode === 'bot' ? other(ui.botSeat) : ui.view); // Vs Bot: always your seat; Vs Self: the seat you look from
  const isOn = (p, role, k) => Sim.stopOn(sim, p, role, k); // Patch7: the real state, not the (older) animated one
  function build() {
    el = document.createElement('div');
    el.id = 'stops';
    el.setAttribute('aria-label', 'Stops');
    for (const [role, title] of ROLES) {
      const row = document.createElement('div');
      row.className = 'strow';
      const t = document.createElement('span');
      t.className = 'stt';
      t.textContent = title;
      row.appendChild(t);
      for (const k of ORDER) {
        const b = document.createElement('button');
        b.className = 'stb';
        b.dataset.role = role;
        b.dataset.kind = k;
        b.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          ICON[k] +
          '</svg>';
        b.onclick = e => {
          e.stopPropagation();
          toggle(role, k);
        };
        row.appendChild(b);
      }
      el.appendChild(row);
    }
    (document.getElementById('dbg') || document.body).appendChild(el);
  }
  function toggle(role, k) {
    if (rp.on) return;
    const p = seat(),
      r = sendStop({ type: 'SetStop', player: p, role, kind: k, on: !isOn(p, role, k) }); // Patch7: never refused while an animation plays
    if (r.ok && sim.stops) Settings.set('stops', JSON.parse(JSON.stringify(sim.stops))); // the default for the next game
  }
  // Patch13: portrait (phone): the stops take room, so a button (Stops: shown / hidden, #dbg) folds them; landscape always shows them.
  // Hidden by default; the choice is kept for the next game.
  const PORTRAIT_KEY = 'stopsPortrait';
  const portraitShown = () => Settings.get(PORTRAIT_KEY) === true;
  function togglePortrait() {
    Settings.set(PORTRAIT_KEY, !portraitShown());
    update();
  }
  function update() {
    if (!el) build();
    el.classList.toggle('pfold', !portraitShown()); // css: folded in portrait only
    el.hidden = rp.on || MenuUI.away;
    if (el.hidden) return;
    const p = seat();
    el.querySelectorAll('.stb').forEach(b => {
      const role = b.dataset.role,
        k = b.dataset.kind,
        on = isOn(p, role, k);
      b.classList.toggle('on', on);
      b.title =
        'Stop: ' +
        (STOP_NAMES[k] || k) +
        ', on ' +
        (role === 'own' ? 'your own turn' : 'the opponent’s turn') +
        ' (' +
        NAME[p] +
        '): ' +
        (on ? 'on' : 'off') +
        ' · click to turn it ' +
        (on ? 'off' : 'on');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  return { update, togglePortrait, portraitShown, PORTRAIT_KEY };
})();

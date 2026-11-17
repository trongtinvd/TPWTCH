// layout.js - phone (portrait) layout: drag the bottom border of the inspector (top) and the top border of the stack / list panels (bottom)
// to resize them. The sizes (% of the screen height) are kept in localStorage.
(function () {
  const KEY = 'tpw_layout',
    LIM = [12, 50], // each panel: 12% to 50% of the screen height
    MAXSUM = 72, // the board always keeps at least 28%
    size = { top: 26, bot: 28 }, // the CSS defaults (--topH / --botH in index.css)
    rootStyle = document.documentElement.style;
  let raf = 0;
  const clamp = v => Math.max(LIM[0], Math.min(LIM[1], v));
  function apply() {
    rootStyle.setProperty('--topH', size.top.toFixed(2) + 'dvh');
    rootStyle.setProperty('--botH', size.bot.toFixed(2) + 'dvh');
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => dispatchEvent(new Event('resize'))); // the canvas and the cameras follow the new board rectangle
  }
  function load() {
    const raw = Store.get(KEY);
    if (!raw) return;
    const [t, b] = decodeURIComponent(raw).split('|').map(Number);
    if (!isFinite(t) || !isFinite(b)) return;
    size.top = clamp(t);
    size.bot = clamp(b);
    if (size.top + size.bot > MAXSUM) {
      size.top = 26;
      size.bot = 28;
    }
    apply();
  }
  function save() {
    Store.set(KEY, size.top.toFixed(1) + '|' + size.bot.toFixed(1));
  }
  function handle(id, which, label) {
    const h = document.createElement('div');
    h.id = id;
    h.setAttribute('aria-label', label);
    document.body.appendChild(h);
    let on = false;
    h.addEventListener('pointerdown', e => {
      on = true;
      h.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    });
    h.addEventListener('pointermove', e => {
      if (!on) return;
      const H = innerHeight,
        other = which === 'top' ? 'bot' : 'top';
      size[which] = Math.min(clamp(((which === 'top' ? e.clientY : H - e.clientY) / H) * 100), MAXSUM - size[other]);
      apply();
    });
    const end = () => {
      if (!on) return;
      on = false;
      save();
    };
    h.addEventListener('pointerup', end);
    h.addEventListener('pointercancel', end);
  }
  handle('hTop', 'top', 'Drag to resize the inspector');
  handle('hBot', 'bot', 'Drag to resize the stack and card lists');
  load();
})();

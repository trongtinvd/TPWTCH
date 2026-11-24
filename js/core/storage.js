// storage.js - the only place that touches browser storage. Everything the game saves (decks, replays, panel sizes) goes through Store
// (localStorage). Without localStorage (Node tests, blocked storage) it falls back to memory, so callers never need a try/catch.
const Store = (function () {
  const memStore = {
    m: new Map(),
    getItem(k) {
      return this.m.has(k) ? this.m.get(k) : null;
    },
    setItem(k, v) {
      this.m.set(k, String(v));
    },
    removeItem(k) {
      this.m.delete(k);
    },
    key(i) {
      return [...this.m.keys()][i] ?? null;
    },
    get length() {
      return this.m.size;
    },
  };
  let ls = null;
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem('tpw_probe', '1');
      localStorage.removeItem('tpw_probe');
      ls = localStorage;
    }
  } catch (e) {}
  const S = ls || memStore;
  const get = k => {
      try {
        return S.getItem(k);
      } catch (e) {
        return null;
      }
    },
    set = (k, v) => {
      try {
        S.setItem(k, v);
        return true;
      } catch (e) {
        return false; // storage full or blocked
      }
    },
    del = k => {
      try {
        S.removeItem(k);
      } catch (e) {}
    },
    keys = prefix => {
      const out = [];
      try {
        for (let i = 0; i < S.length; i++) {
          const k = S.key(i);
          if (k != null && k.startsWith(prefix || '')) out.push(k);
        }
      } catch (e) {}
      return out;
    };
  // One-time bridge: the game used to save into cookies. Copy every tpw_* cookie into localStorage, then expire the cookie.
  // (Delete this block once nobody has old cookies any more.)
  if (ls && typeof document !== 'undefined')
    try {
      for (const part of (document.cookie || '').split(';')) {
        const t = part.trim(),
          i = t.indexOf('=');
        if (i < 0 || !t.startsWith('tpw_')) continue;
        const k = t.slice(0, i);
        if (get(k) === null) set(k, t.slice(i + 1));
        if (get(k) !== null) document.cookie = k + '=; max-age=0; path=/; SameSite=Lax';
      }
    } catch (e) {}
  return { get, set, del, keys };
})();

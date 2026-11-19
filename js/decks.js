// decks.js - Deck store (localStorage through Store), default decks, deck validation, fuzzy card search (no THREE, no DOM)
const DECK_MIN = 10,
  DECK_MAX = 100, // the editor grid is 10 x 10
  EXTRA_MAX = 20; // the extra deck grid is 10 x 2
const BUILTIN_DECKS = [
  {
    name: 'Full Pool',
    builtin: true,
    cards: DEFS.filter(d => !d.extra).map(d => d.id),
    extra: DEFS.filter(d => d.extra).map(d => d.id),
  },
  {
    name: 'Starter Aggro',
    builtin: true,
    extra: [],
    cards: [
      'hummingbird',
      'archer',
      'scout',
      'avatar',
      'blackhawk',
      'shark',
      'boltmaster',
      'shieldguard',
      'kingeye',
      'wardrum',
      'superbolt',
      'zap',
      'bolt',
      'heal',
      'intuition',
    ],
  },
];
const DeckStore = (function () {
  const PRE = 'tpw_deck_',
    known = new Set(DEFS.map(d => d.id));
  const skey = n =>
    PRE + encodeURIComponent(n).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const exIds = new Set(DEFS.filter(d => d.extra).map(d => d.id));
  const clean = (ids, extra) =>
    ids
      .filter(id => known.has(id) && exIds.has(id) === !!extra)
      .filter((id, i, a) => a.indexOf(id) === i)
      .slice(0, extra ? EXTRA_MAX : DECK_MAX);
  const parse = t => t.split(',').filter(Boolean);
  function fromStore() {
    const out = [];
    for (const k of Store.keys(PRE))
      try {
        {
          const [m, x] = decodeURIComponent(Store.get(k) || '').split('|'); // 'main ids|extra ids' (older decks have no extra part)
          out.push({
            name: decodeURIComponent(k.slice(PRE.length)),
            cards: clean(parse(m || '')),
            extra: clean(parse(x || ''), true),
          });
        }
      } catch (e) {}
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }
  const list = () => BUILTIN_DECKS.concat(fromStore());
  return {
    list,
    find: name => list().find(d => d.name === name) || null,
    nameUsed: name => list().some(d => d.name === name),
    remove: name => Store.del(skey(name)),
    save: (name, cards, extra) => {
      const x = clean(extra || [], true);
      return Store.set(skey(name), encodeURIComponent(clean(cards).join(',') + (x.length ? '|' + x.join(',') : '')));
    },
  };
})();
function deckProblem(cards, extra = []) {
  // reason string, or null if the deck is valid (extra: the extra deck, optional, at most EXTRA_MAX extra deck creatures, singleton)
  if (extra.length > EXTRA_MAX) return 'The extra deck holds at most ' + EXTRA_MAX + ' cards';
  if (new Set(extra).size !== extra.length) return 'Decks are singleton: no duplicate cards';
  if (extra.some(id => !DEFS.some(d => d.id === id && d.extra)))
    return 'Only extra deck creatures go in the extra deck';
  if (cards.some(id => DEFS.some(d => d.id === id && d.extra))) return 'Extra deck creatures go in the extra deck';
  if (cards.length < DECK_MIN) return 'A deck needs at least ' + DECK_MIN + ' cards (' + cards.length + ')';
  if (cards.length > DECK_MAX) return 'A deck holds at most ' + DECK_MAX + ' cards';
  if (new Set(cards).size !== cards.length) return 'Decks are singleton: no duplicate cards';
  if (cards.some(id => !DEFS.some(d => d.id === id))) return 'Unknown card in the deck';
  return null;
}
function saveProblem(name, cards, ownName, extra) {
  // ownName: the saved (non-default) deck being edited, so it may keep its own name
  const n = name.trim();
  if (!n) return 'Give the deck a name';
  if (DeckStore.nameUsed(n) && n !== ownName) return 'Name already used';
  return deckProblem(cards, extra);
}
function levenshtein(a, b) {
  let p = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const c = [i];
    for (let j = 1; j <= b.length; j++)
      c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    p = c;
  }
  return p[b.length];
}
function substringDist(q, t) {
  // smallest edit distance between q and any substring of t (Sellers)
  const m = q.length;
  let col = Array.from({ length: m + 1 }, (_, i) => i),
    best = col[m];
  for (let j = 1; j <= t.length; j++) {
    const nc = [0];
    for (let i = 1; i <= m; i++)
      nc[i] = Math.min(col[i] + 1, nc[i - 1] + 1, col[i - 1] + (q[i - 1] === t[j - 1] ? 0 : 1));
    col = nc;
    best = Math.min(best, col[m]);
  }
  return best;
}
function cardMatches(query, d) {
  // the 'Only matches' filter: the name contains the query, give or take a typo (one edit per four letters)
  const q = query.trim().toLowerCase();
  return !q || substringDist(q, d.name.toLowerCase()) <= Math.floor(q.length / 4);
}
function rankCards(query, defs) {
  // the single closest match first, everything else alphabetical
  const q = query.trim().toLowerCase(),
    alpha = defs.slice().sort((a, b) => a.name.localeCompare(b.name));
  if (!q) return alpha;
  let best = null,
    bs = null;
  for (const d of alpha) {
    const n = d.name.toLowerCase(),
      s = [substringDist(q, n), levenshtein(q, n)];
    if (!bs || s[0] < bs[0] || (s[0] === bs[0] && s[1] < bs[1])) {
      best = d;
      bs = s;
    }
  }
  return [best].concat(alpha.filter(d => d !== best));
}

// logs.js - logs[]: one append-only history per card and per player
Sim.def('logs', function (K) {
  // ---- LOGS: one append-only history per card and per player (o.logs), next to statuses[]. statuses = the current state; logs = the whole story: deck position, every zone change and how, every status applied / removed. Own counter (s.lseq): status ids (s.seq) are untouched.
  const lg = (s, o, e) => {
    if (o) (o.logs || (o.logs = [])).push(Object.assign({ n: (s.lseq = (s.lseq || 0) + 1), turn: s.turn }, e));
  };
  // a status belongs to a card (iid), a player, a zone (its key) or a stack object ('so-' + sid)
  const ownKey = (s, o) =>
    o.sid != null && o.kind
      ? 'so-' + o.sid
      : o.key && o.statuses
        ? o.key
        : o.iid || (o === s.players.Player ? 'Player' : o === s.players.Opponent ? 'Opponent' : null);
  const ownerOf = (s, st) =>
    s.cards[st.own] ||
    s.players[st.own] ||
    (s.zones && s.zones[st.own]) ||
    (String(st.own).startsWith('so-') ? s.stack.find(o => 'so-' + o.sid === st.own) : null) ||
    null; // a stack object that is gone cannot log any more
  const whereOf = c => (c.loc === 'board' ? 'board ' + c.slot : c.loc);
  const HOW = {
    CardDrawn: ['drawn', 'hand'],
    CardAdded: ['added to hand', 'hand'],
    CardMilled: ['milled', 'gy'],
    CardDiscarded: ['discarded', 'gy'],
    CardExiled: ['exiled', 'exile', 'gone'],
    CardReturnedExtra: ['returned to the extra deck', 'extra'],
    PermanentSummoned: ['entered the board', 'board'],
    PermanentMoved: ['shifted', 'board'],
    PermanentDestroyed: ['destroyed', 'gy', 'gone'],
    PermanentReturned: ['returned to hand', 'hand', 'gone'],
    StackObjectCreated: ['put on the stack', 'stack'],
    StackObjectResolved: ['resolved', 'gy', 'hand'],
    StackObjectCountered: ['countered', 'gy'],
  };
  function howOf(ev, c) {
    for (let i = ev.length - 1; i >= 0; i--) {
      const e = ev[i],
        h = HOW[e.t];
      if (h && e.iid === c.iid && h.slice(1).includes(c.loc))
        return e.t === 'PermanentDestroyed' && e.by === 'rule' ? 'destroyed by the rules: its zone is gone' : h[0];
    }
    return 'moved';
  } // the label comes from the rule events of this command
  function syncLogs(s, ev) {
    for (const c of Object.values(s.cards)) {
      if (c.def.type === 'ability') continue; // ability tokens are transient: no history
      const w = whereOf(c),
        L = c.logs || (c.logs = []);
      let last = null;
      for (let i = L.length - 1; i >= 0; i--)
        if (L[i].to !== undefined) {
          last = L[i].to;
          break;
        }
      if (last !== w) lg(s, c, { kind: 'zone', from: last, to: w, how: howOf(ev, c) });
    }
  }
  const logText = e =>
    'T' +
    e.turn +
    ' #' +
    e.n +
    ' \u00b7 ' +
    (
      {
        start: () =>
          e.to === 'extra'
            ? 'placed in the extra deck (' + e.pos + ' of ' + e.of + ')'
            : 'shuffled into the deck at position ' + e.pos + ' of ' + e.of,
        locked: () => 'deck locked at position ' + e.pos + ' of ' + e.of,
        zone: () => (e.from || 'nowhere') + ' \u2192 ' + e.to + ' (' + e.how + ')',
        'status+': () => 'applied: ' + e.text,
        'status-': () => 'removed #' + e.id + ' (' + e.sk + '): ' + e.why,
      }[e.kind] || (() => e.kind)
    )();
  // Q43: statuses and logs share a cap (RULES.historyCap, 200 MB). The size is ESTIMATED from the number of entries (bytes per status / log entry), not measured:
  // a command costs a walk over the objects, never a serialisation
  const BYTES = { status: 230, log: 120 };
  const historyBytes = s => {
    let n = 0;
    const add = o => {
      n += ((o.statuses && o.statuses.length) || 0) * BYTES.status + ((o.logs && o.logs.length) || 0) * BYTES.log;
    };
    Object.values(s.cards).forEach(add);
    Object.values(s.players).forEach(add);
    Object.values(s.zones).forEach(add);
    s.stack.forEach(add);
    return n;
  };
  const logLines = o => (o.logs || []).map(e => ({ text: logText(e), n: e.n, e })); // oldest first; the UI shows newest on top
  return {
    exports: { HOW, historyBytes, howOf, lg, logLines, logText, ownKey, ownerOf, syncLogs, whereOf },
    needs: [],
    link: () => {},
  };
});

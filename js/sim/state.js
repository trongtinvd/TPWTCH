// state.js - game state: creation, zones, clouds, recalc (state-based rules), leaving / entering the board
Sim.def('state', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let byId, majorUsed, mulberry32, other, slotRow; // util
  let lg, syncLogs; // logs
  let abDef, addStatus, clearStatuses, hasSt, hpOf, live, removeStatus, syncLife, totalDamage; // statuses
  let fire; // stack
  let dispatch; // dispatch
  function buildDeck(owner, seed, defs, shuffle = true) {
    // CardInstances, top of deck first
    const rnd = mulberry32(seed);
    const cards = defs.map((def, i) => ({
      iid: owner.toLowerCase() + '-' + i,
      def,
      owner,
      loc: 'deck',
      slot: null,
      statuses: [],
    }));
    for (let i = cards.length - 1; shuffle && i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }
  function create(n, defs, opts = {}) {
    // opts: {decks:{Player:[ids], Opponent:[ids]}, shuffle:true, autoStart:false} (see createGame)                         // content is injected: the Sim never reads globals
    for (const k in byId) delete byId[k];
    Object.assign(byId, Object.fromEntries(defs.map(d => [d.id, d])));
    const s = {
      n,
      phase: 'deck',
      ready: { Player: false, Opponent: false },
      cards: {},
      piles: {},
      slots: {},
      stack: [],
      active: 'Player',
      priority: 'Player',
      passes: 0,
      attackPhase: false,
      life: { Player: 20, Opponent: 20 },
      players: { Player: { statuses: [] }, Opponent: { statuses: [] } },
      maxLife: 20,
      turn: 1,
      seq: 0,
      majorUsed: false,
      sid: 0,
      choice: null,
      unusable: {},
      respond: null,
      result: null, // null | {winner:'Player'|'Opponent'|null (a draw), why:'life'|'surrender'|'left'|'effect', turn}: set once, never changed
    }; // respond: null | {kind:'enter'|'end'} = the non-turn player may respond before play continues
    for (const [p, seed] of [
      ['Player', n * 2 + 1],
      ['Opponent', n * 2],
    ]) {
      const deck = buildDeck(
        p,
        seed,
        opts.decks && opts.decks[p] ? opts.decks[p].map(id => byId[id]).filter(Boolean) : defs,
        opts.shuffle !== false
      );
      deck.forEach((c, i) => {
        s.cards[c.iid] = c;
        lg(s, c, { kind: 'start', to: 'deck', pos: i + 1, of: deck.length });
      });
      s.piles[p] = { deck, hand: [], gy: [], exile: [] }; // opening hands are dealt when both players press Start
      for (const row of ['front', 'back']) for (let c = 0; c < 5; c++) s.slots[p + '|' + row + '|' + c] = null; // slot -> iid
    }
    return s;
  }
  function createGame(n, defs, opts = {}) {
    const s = create(n, defs, opts);
    if (opts.autoStart) for (const p of ['Player', 'Opponent']) dispatch(s, { type: 'Start', player: p });
    return s;
  } // the public Sim.create
  const freeSlots = (s, c) =>
    Object.keys(s.slots).filter(k => !s.slots[k] && !s.unusable[k] && k.startsWith(c.owner + '|' + slotRow(c) + '|')); // an unusable zone is never free
  // Clouds (King Eye) are derived from the board, so they vanish when King Eye leaves: slotKey -> King Eye iid. They cover the controller's OTHER zones.
  const cloudMap = s => {
    const m = {};
    for (const c of Object.values(s.cards))
      if (c.loc === 'board' && (abDef(c).passives || []).some(p => p.op === 'Obscure'))
        for (const row of ['front', 'back'])
          for (let i = 0; i < 5; i++) {
            const k = c.owner + '|' + row + '|' + i;
            if (k !== c.slot) m[k] = c.iid;
          }
    return m;
  };
  const AURAREQ = (s, c, st) => {
    const a = s.cards[st.src],
      p = a && abDef(a).passives && abDef(a).passives[st.idx]; // an aura status holds while its source stands on the board and the target is in its columns
    return !!(
      a &&
      a.loc === 'board' &&
      c.loc === 'board' &&
      p &&
      p.op === 'Aura' &&
      Math.abs(+c.slot.split('|')[2] - +a.slot.split('|')[2]) <= 1 &&
      (p.who === 'foe') === (c.owner !== a.owner)
    );
  };
  let rcBusy = false;
  function recalc(s, ev) {
    // derived state: statuses that stopped meeting their requirement are removed, auras add their statuses, then state-based death (damage > HP)
    if (rcBusy) return;
    rcBusy = true;
    try {
      for (let n = 0; n < 8; n++) {
        const all = Object.values(s.cards),
          board = all.filter(c => c.loc === 'board');
        for (const c of all)
          for (const st of live(c)) {
            if (!st.keep && (st.zone || 'board') !== c.loc) removeStatus(s, st, 'left the ' + (st.zone || 'board'));
            else if (st.aura && !AURAREQ(s, c, st)) removeStatus(s, st, 'no longer in range');
            else if (st.link && !live(c).some(y => y.seq === st.link)) removeStatus(s, st, 'linked status ended');
          }
        for (const c of board)
          if (!hasSt(c, 'entered')) addStatus(s, c, { kind: 'entered', n: (s.ent = (s.ent || 0) + 1) });
        const enteredN = c => (live(c).find(y => y.kind === 'entered') || { n: 0 }).n;
        for (const a of board
          .filter(c => (abDef(c).passives || []).some(p => p.op === 'Aura'))
          .sort((p, q) => enteredN(p) - enteredN(q))) {
          // oldest source first: War Drum's -1/-1 is listed before the Drummer's +1/+1
          abDef(a).passives.forEach((p, idx) => {
            if (p.op !== 'Aura') return;
            for (const t of board) {
              const st = { kind: 'mod', atk: p.atk, hp: p.hp, src: a.iid, idx, aura: true, srcName: a.def.name };
              if (AURAREQ(s, t, st) && !hasSt(t, 'mod', y => y.src === a.iid && y.idx === idx)) addStatus(s, t, st);
            }
          });
        }
        const dead = board.filter(c => c.loc === 'board' && totalDamage(c) > hpOf(c)); // only the final value decides: at -1 HP inside the columns a card lives, leave them and it dies
        if (!dead.length) break;
        dead.forEach(c => destroy(s, c, ev));
      }
      for (const p of ['Player', 'Opponent']) syncLife(s, p);
      if (!s.result) {
        // a player at life <= -1 has lost (0 is still alive); both at once = a draw
        const lost = ['Player', 'Opponent'].filter(q => s.life[q] <= -1);
        if (lost.length === 2) declareWinner(s, null, 'life', ev);
        else if (lost.length === 1) declareWinner(s, other(lost[0]), 'life', ev);
      }
    } finally {
      rcBusy = false;
    }
    syncLogs(s, ev);
  }
  function declareWinner(s, p, why, ev) {
    // the first decision stands: later life changes or effects never change the result. p = null is a draw
    if (s.result) return;
    s.result = { winner: p, why, turn: s.turn };
    ev.push({ t: 'GameDecided', winner: p, why });
  }
  function sweepUnusable(s, ev) {
    // a card that somehow ends up on an unusable zone goes to the graveyard
    for (const k of Object.keys(s.unusable)) {
      const id = s.slots[k];
      if (id) destroy(s, s.cards[id], ev, 'left the board: its zone became unusable (a rule, not an effect)');
    }
  }
  function destroy(s, c, ev, why) {
    // leaves the field for the graveyard; its statuses are removed (they stay in the list, greyed)
    s.slots[c.slot] = null;
    c.slot = null;
    clearStatuses(s, c, why || 'left the board');
    if (c.token) c.loc = 'gone';
    else {
      c.loc = 'gy';
      s.piles[c.owner].gy.unshift(c);
    }
    ev.push(why ? { t: 'PermanentDestroyed', iid: c.iid, by: 'rule' } : { t: 'PermanentDestroyed', iid: c.iid });
    recalc(s, ev);
  }
  function bounce(s, t, ev) {
    if (t.slot) s.slots[t.slot] = null;
    t.slot = null;
    clearStatuses(s, t, 'left the board');
    if (t.token) t.loc = 'gone';
    else {
      t.loc = 'hand';
      s.piles[t.owner].hand.push(t);
    }
    ev.push({ t: 'PermanentReturned', iid: t.iid });
    recalc(s, ev);
  }
  function enterBoard(s, t, slot, ev) {
    const P = s.piles[t.owner];
    for (const k of ['hand', 'gy', 'exile']) {
      const i = P[k].indexOf(t);
      if (i >= 0) P[k].splice(i, 1);
    }
    s.slots[slot] = t.iid;
    t.slot = slot;
    t.loc = 'board';
    ev.push({ t: 'PermanentSummoned', iid: t.iid, slot });
    fire(s, ev, 'enter', t); // queued BEFORE the state-based check: a permanent that dies on entering still has its enter triggers
    recalc(s, ev);
  }
  function makeToken(s, def, owner, zone, ev) {
    const n = (s.tokN = (s.tokN || 0) + 1),
      t = { iid: 'tk-' + n, def, owner, loc: 'board', slot: zone, statuses: [], token: true };
    s.cards[t.iid] = t;
    s.slots[zone] = t.iid;
    ev.push({ t: 'PermanentSummoned', iid: t.iid, slot: zone });
    fire(s, ev, 'enter', t);
    recalc(s, ev);
  }
  return {
    exports: {
      AURAREQ,
      bounce,
      buildDeck,
      cloudMap,
      create,
      createGame,
      declareWinner,
      destroy,
      enterBoard,
      freeSlots,
      makeToken,
      recalc,
      sweepUnusable,
    },
    needs: [
      'abDef',
      'addStatus',
      'byId',
      'clearStatuses',
      'dispatch',
      'fire',
      'hasSt',
      'hpOf',
      'lg',
      'live',
      'majorUsed',
      'mulberry32',
      'other',
      'removeStatus',
      'slotRow',
      'syncLife',
      'syncLogs',
      'totalDamage',
    ],
    link: () => {
      ({
        abDef,
        addStatus,
        byId,
        clearStatuses,
        dispatch,
        fire,
        hasSt,
        hpOf,
        lg,
        live,
        majorUsed,
        mulberry32,
        other,
        removeStatus,
        slotRow,
        syncLife,
        syncLogs,
        totalDamage,
      } = K);
    },
  };
});

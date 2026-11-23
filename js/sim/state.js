// state.js - game state: creation, zones, clouds, recalc (state-based rules), leaving / entering the board
Sim.def('state', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let ctl; // added by Patch3
  let byId, mulberry32, other, slotRow; // util
  let lg, syncLogs; // logs
  let abDef, addStatus, clearStatuses, hasSt, hpOf, isRevealed, live, removeStatus, syncLife, totalDamage; // statuses
  let fire; // stack
  let dispatch; // dispatch
  function buildDeck(owner, seed, defs, shuffle = true, loc = 'deck') {
    // CardInstances, top of deck first (the extra deck is never shuffled)
    const rnd = mulberry32(seed);
    const cards = defs.map((def, i) => ({
      iid: owner.toLowerCase() + (loc === 'extra' ? 'x-' : '-') + i,
      def,
      owner,
      loc,
      slot: null,
      statuses: [],
    }));
    for (let i = cards.length - 1; shuffle && i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }
  // stops (Q49 / Q50): null, or per player {opp, own}. A flat {kind:true} (older replays, the rules tests) means: both players, as the non-turn player only.
  const normStops = x => {
    if (!x) return null;
    const one = e => (e && ('opp' in e || 'own' in e) ? { opp: e.opp || {}, own: e.own || {} } : { opp: e || {}, own: {} });
    return x.Player || x.Opponent ? { Player: one(x.Player), Opponent: one(x.Opponent) } : { Player: one(x), Opponent: one(x) };
  };
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
      players: { Player: { statuses: [], ap: [] }, Opponent: { statuses: [], ap: [] } },
      maxLife: 20,
      turn: 1,
      seq: 0,
      apn: 0, // action point ids
      drawn: { Player: 0, Opponent: 0 }, // cards drawn since the game started (the opening hand does not count)
      sid: 0,
      choice: null,
      zones: {}, // zone objects {key, statuses[]}: unusable, clouds and zone HP are statuses on them (Q34, Q10)
      respond: null,
      orderTriggers: !!opts.orderTriggers, // the host turns it on: a player with several triggers at once orders them (a 'trigorder' choice); off in the rules tests
      turnEnding: false, // Q21: combat has ended, the end step opens as soon as nothing is pending
      stops: normStops(opts.stops), // extra priority windows ("stops") that are on: {turnStart, combatStart, combatEnd, draw, stack}; null = none (the rules tests)
      capped: false, // Q43: the history cap was reached: the game is over, every command is refused
      result: null, // null | {winner:'Player'|'Opponent'|null (a draw), why:'life'|'surrender'|'left'|'effect', turn}: set once, never changed
    }; // respond: null | {kind:'enter'|'end'} = the non-turn player may respond before play continues
    for (const [p, seed] of [
      ['Player', n * 2 + 1],
      ['Opponent', n * 2],
    ]) {
      const deck = buildDeck(
        p,
        seed,
        opts.decks && opts.decks[p]
          ? opts.decks[p].map(id => byId[id]).filter(d => d && !d.extra)
          : defs.filter(d => !d.extra),
        opts.shuffle !== false
      );
      const extra = buildDeck(
        p,
        seed,
        opts.extra && opts.extra[p]
          ? opts.extra[p].map(id => byId[id]).filter(d => d && d.extra)
          : opts.decks
            ? []
            : defs.filter(d => d.extra),
        false,
        'extra'
      ); // no list given and no decks given: the whole pool (extra deck creatures go to the extra deck)
      extra.forEach((c, i) => {
        s.cards[c.iid] = c;
        lg(s, c, { kind: 'start', to: 'extra', pos: i + 1, of: extra.length });
      });
      deck.forEach((c, i) => {
        s.cards[c.iid] = c;
        lg(s, c, { kind: 'start', to: 'deck', pos: i + 1, of: deck.length });
      });
      s.piles[p] = { deck, hand: [], gy: [], exile: [], extra }; // opening hands are dealt when both players press Start
      for (const row of ['front', 'back'])
        for (let c = 0; c < 5; c++) {
          const k = p + '|' + row + '|' + c;
          s.slots[k] = null; // slot -> iid
          s.zones[k] = { key: k, statuses: [] };
        }
    }
    return s;
  }
  function createGame(n, defs, opts = {}) {
    const s = create(n, defs, opts);
    if (opts.autoStart) for (const p of ['Player', 'Opponent']) dispatch(s, { type: 'Start', player: p });
    return s;
  } // the public Sim.create
  const isUnusable = (s, k) => !!s.zones[k] && hasSt(s.zones[k], 'unusable');
  const markUnusable = (s, k, srcName) => {
    if (s.zones[k] && !isUnusable(s, k)) addStatus(s, s.zones[k], { kind: 'unusable', keep: true, srcName });
  };
  // Zone HP (Q10): off until an effect gives a zone HP; every such effect feeds ONE shared bar. null = disabled
  function zoneBar(s, k) {
    const z = s.zones[k],
      sum = kind => (z ? live(z).reduce((n, x) => n + (x.kind === kind ? x.amount : 0), 0) : 0);
    if (!z || !live(z).some(x => x.kind === 'zonehp')) return null;
    const hp = sum('zonehp'),
      damage = sum('zonedmg');
    return { hp, damage, left: hp - damage };
  }
  const giveZoneHp = (s, k, n, srcName) => {
    if (s.zones[k]) addStatus(s, s.zones[k], { kind: 'zonehp', amount: n, srcName });
  };
  function damageZone(s, k, n, srcName, ev) {
    // false when the zone has no HP (nothing happens). At <= 0 recalc exiles its contents and the zone becomes unusable
    if (!zoneBar(s, k)) return false;
    addStatus(s, s.zones[k], { kind: 'zonedmg', amount: n, srcName });
    ev.push({ t: 'ZoneDamaged', slot: k, amount: n });
    recalc(s, ev);
    return true;
  }
  const freeSlots = (s, c) =>
    Object.keys(s.slots).filter(k => !s.slots[k] && !isUnusable(s, k) && k.startsWith(ctl(c) + '|' + slotRow(c) + '|')); // an unusable zone is never free
  // Clouds (King Eye) are derived from the board, so they vanish when King Eye leaves: slotKey -> King Eye iid. They cover the controller's OTHER zones.
  // Q34: a cloud is a `cloud` status on a zone; syncClouds keeps those statuses equal to the board (recalc runs it after every command, cloudMap before
  // it answers, so a state built by hand is read correctly too). Nothing changes when they already match.
  const obscures = c => c.loc === 'board' && (abDef(c).passives || []).some(p => p.op === 'Obscure');
  function syncClouds(s) {
    const kings = Object.values(s.cards).filter(obscures);
    for (const k in s.zones) {
      const z = s.zones[k],
        mine = k.split('|')[0],
        covers = a => a.slot !== k && ctl(a) === mine;
      for (const st of live(z))
        if (st.kind === 'cloud') {
          const a = s.cards[st.src];
          if (!(a && obscures(a) && covers(a))) removeStatus(s, st, 'no longer covered');
        }
      for (const a of kings)
        if (covers(a) && !live(z).some(x => x.kind === 'cloud' && x.src === a.iid))
          addStatus(s, z, { kind: 'cloud', src: a.iid, srcName: a.def.name });
    }
  }
  const cloudMap = s => {
    syncClouds(s);
    const m = {};
    for (const k in s.zones) {
      const st = live(s.zones[k]).find(x => x.kind === 'cloud');
      if (st) m[k] = st.src;
    }
    return m;
  };
  // INFORMATION: may player p know which card c is, right now? The board (unless covered by a cloud the owner controls), the graveyard, exile and the
  // stack are public; a hand or the extra deck is known to its owner and to whoever it was revealed to; a deck is known to nobody (nobody knows the order).
  // Logs, the table and every list ask THIS function, so a hidden card can never leak by accident.
  const canSee = (s, p, c) => {
    if (!c) return false;
    if (c.loc === 'board') return !(ctl(c) !== p && cloudMap(s)[c.slot]);
    if (c.loc === 'gy' || c.loc === 'exile' || c.loc === 'stack' || c.loc === 'gone') return true;
    if (c.loc === 'hand' || c.loc === 'extra') return c.owner === p || isRevealed(c, p);
    return false;
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
      (p.who === 'foe') === (ctl(c) !== ctl(a))
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
        syncClouds(s);
        let zoneChanged = false;
        for (const k of Object.keys(s.zones)) {
          // a zone whose HP bar is used up: its contents are exiled (a rule, so even a blue card), the zone becomes unusable, the bar is gone
          const b = zoneBar(s, k);
          if (!b || b.left > 0) continue;
          if (s.slots[k]) exileFromBoard(s, s.cards[s.slots[k]], ev);
          markUnusable(s, k, 'zone HP');
          live(s.zones[k])
            .filter(x => x.kind === 'zonehp' || x.kind === 'zonedmg')
            .forEach(x => removeStatus(s, x, 'zone HP used up'));
          ev.push({ t: 'ZoneUnusable', slot: k });
          zoneChanged = true;
        }
        const dead = board.filter(c => c.loc === 'board' && totalDamage(c) > hpOf(c)); // only the final value decides: at -1 HP inside the columns a card lives, leave them and it dies
        if (!dead.length && !zoneChanged) break;
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
    for (const k of Object.keys(s.zones).filter(z => isUnusable(s, z))) {
      const id = s.slots[k];
      if (id) destroy(s, s.cards[id], ev, 'left the board: its zone became unusable (a rule, not an effect)');
    }
  }
  function exileFromBoard(s, c, ev) {
    s.slots[c.slot] = null;
    c.slot = null;
    release(c);
    clearStatuses(s, c, 'left the board');
    if (c.token) c.loc = 'gone';
    else {
      c.loc = 'exile';
      s.piles[c.owner].exile.push(c);
    }
    ev.push({ t: 'CardExiled', iid: c.iid });
  }
  function release(c) {
    // a card played under temporary control (L4) goes back to its real owner when it leaves: the owner's zones receive it
    delete c.controller; // Q56: control ends; the card was always its owner's
  }
  function destroy(s, c, ev, why) {
    // leaves the field for the graveyard; its statuses are removed (they stay in the list, greyed)
    release(c);
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
    release(t);
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
    for (const k of ['hand', 'gy', 'exile', 'extra']) {
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
      canSee,
      cloudMap,
      create,
      createGame,
      declareWinner,
      destroy,
      enterBoard,
      damageZone,
      exileFromBoard,
      freeSlots,
      giveZoneHp,
      isUnusable,
      makeToken,
      markUnusable,
      recalc,
      release,
      syncClouds,
      sweepUnusable,
      zoneBar,
    },
    needs: ['ctl', 
      'abDef',
      'addStatus',
      'byId',
      'clearStatuses',
      'dispatch',
      'fire',
      'hasSt',
      'hpOf',
      'isRevealed',
      'lg',
      'live',
      'mulberry32',
      'other',
      'removeStatus',
      'slotRow',
      'syncLife',
      'syncLogs',
      'totalDamage',
    ],
    link: () => {
      ({ ctl } = K);
      ({
        abDef,
        addStatus,
        byId,
        clearStatuses,
        dispatch,
        fire,
        hasSt,
        hpOf,
        isRevealed,
        lg,
        live,
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

// observe.js - OBSERVATIONS: what ONE player may know (Q39, Q44). Sim.observe(state, p) is a plain-data snapshot that holds only what is public to p
// (Sim.canSee is the one rule): a card p may not know is a stub with an opaque id (or missing: a card under an enemy cloud, a deck), never its name, definition,
// statuses or logs. This is the anti-cheat layer: a host sends a client its Observation, never the state. Sim.observeEvents does the same for the events of a command.
Sim.def('observe', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let canSee, cloudMap, slotSeen, ctl, isPerm, abDef; // state
  let raceOf; // turn
  let atkOf, hpOf, totalDamage, apOpen; // statuses, ap
  let secretHidden, secretsFor; // secrets
  // an opaque id for a hidden card: a hash of the game seed (never sent), the viewer and the real id, so the real id (its position in the deck list) cannot be read back
  const hash = str => {
    let h1 = 0xdeadbeef,
      h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  };
  // the ability names of a card (they identify it as much as its name does)
  const abNames = c => {
    const d = abDef(c),
      out = [];
    for (const k of ['abilities', 'triggers', 'passives'])
      for (const a of d[k] || []) if (a && a.name) out.push(a.name);
    return out;
  };
  function scope(sts, p) {
    // sts = the states to look at (an Observation: one; events: before and after). A card is known when p could see it in ANY of them.
    // An ability on the stack (a token card) is known exactly when the card it comes from is: a hidden source makes its ability hidden
    // too (its id is opaque, its name and text are never told).
    const seed = sts[0].n,
      all = {};
    for (const s of sts) for (const id in s.cards) all[id] = all[id] || s.cards[id];
    const seenIn = (s, id) => {
        const c = s.cards[id];
        if (!c) return false;
        if (c.def.type === 'ability') return !!c.src && seenIn(s, c.src);
        return canSee(s, p, c);
      },
      known = id => sts.some(s => seenIn(s, id)),
      hiddenIid = new Set(),
      hid = new Set(),
      vis = new Set(),
      hidAb = new Set(),
      visAb = new Set();
    for (const id in all) {
      const c = all[id],
        ab = c.def.type === 'ability',
        src = ab ? all[c.src] : c,
        ok = known(id);
      if (!ok) hiddenIid.add(id);
      for (const x of [c.def.name, c.def.id]) (ok ? vis : hid).add(x);
      if (src) for (const x of abNames(src)) (ok ? visAb : hidAb).add(x);
    }
    const hidden = new Set([...hid].filter(x => !vis.has(x))),
      hiddenAb = [...hidAb].filter(x => !visAb.has(x) && ![...vis].some(v => typeof v === 'string' && v.includes(x))); // "Ambush" is also in the name "Ambush of the Night"
    const alias = id => (hiddenIid.has(id) ? 'h-' + hash(seed + '|' + p + '|' + id) : id);
    const swap = (t, list, to) => list.sort((a, b) => b.length - a.length).reduce((r, n) => r.split(n).join(to), t);
    const maskText = t => (typeof t === 'string' ? swap(swap(t, [...hidden], 'a card'), hiddenAb, 'an ability') : t);
    const scrub = v =>
      typeof v === 'string'
        ? hidden.has(v)
          ? 'a card'
          : hiddenIid.has(v)
            ? alias(v)
            : maskText(v) // a text that names a hidden card ("Summon Archer" on a spent action point)
        : Array.isArray(v)
          ? v.map(scrub)
          : v && typeof v === 'object'
            ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrub(x)]))
            : v;
    return { known, hiddenIid, alias, scrub, maskText };
  }
  // the name of an ability whose source p may not see: it seems to come from the King Eye that covers that source (or "a card")
  const coverName = (s, src) => {
    const king = src && src.loc === 'board' && cloudMap(s)[src.slot];
    return king && s.cards[king] ? s.cards[king].def.name + ': Ability' : 'a card';
  };
  function observe(s, p) {
    const sc = scope([s], p),
      cards = {},
      piles = {},
      slots = {},
      zones = {};
    const stub = c => ({ iid: sc.alias(c.iid), hidden: true, owner: c.owner, loc: c.loc });
    const card = c => ({
      iid: c.iid,
      id: c.def.id,
      name: c.def.name,
      type: c.def.type,
      owner: c.owner,
      controller: c.controller,
      loc: c.loc,
      slot: c.slot,
      atk: c.def.type === 'creature' ? atkOf(c) : null,
      hp: hpOf(c),
      damage: totalDamage(c),
      statuses: sc.scrub((c.statuses || []).filter(st => !secretHidden(st, p))), // a secret status (Secret Twin): its placer only
    });
    for (const id in s.cards) {
      const c = s.cards[id];
      if (c.def.type === 'ability' || (c.loc === 'deck' && !sc.known(id)) || c.loc === 'gone') continue; // a deck: only its size, and the cards revealed to p
      if (sc.known(id)) cards[id] = card(c);
      else if (c.loc === 'hand' || c.loc === 'extra') cards[sc.alias(id)] = stub(c); // a card under an enemy cloud is not even mentioned
    }
    const players = {};
    for (const q of ['Player', 'Opponent']) {
      const P = s.piles[q],
        ids = list => list.map(c => sc.alias(c.iid));
      piles[q] = {
        deck: P.deck.length,
        deckKnown: P.deck.map((c, i) => (sc.known(c.iid) ? [i, c.iid] : null)).filter(Boolean), // [position, iid] of the deck cards revealed to p
        hand: ids(P.hand),
        gy: ids(P.gy),
        exile: ids(P.exile),
        extra: ids(P.extra),
      };
      players[q] = {
        life: s.life[q],
        statuses: sc.scrub(s.players[q].statuses),
        ap: { open: apOpen(s, q).length, list: sc.scrub(s.players[q].ap) },
        drawn: s.drawn[q],
        ready: s.ready[q],
      };
    }
    for (const k in s.slots) {
      const id = s.slots[k];
      slots[k] = id && sc.known(id) ? id : null; // what stands under an enemy cloud is not told
      const cl = cloudMap(s)[k];
      zones[k] = {
        statuses: sc.scrub(s.zones[k].statuses.filter(st => !secretHidden(st, p))), // a secret status: its placer only
        cloud: cl ? sc.alias(cl) : null, // the King Eye whose cloud covers the zone
        seen: slotSeen(s, p, k), // may p know what stands there
      };
    }
    const stack = s.stack.map(o => {
      const src = s.cards[o.src || o.iid],
        seen = o.kind === 'spell' || (src && sc.known(src.iid)),
        a = seen && o.kind === 'ability' && src ? (abDef(src)[o.list] || [])[o.ab] : null; // the source may have lost that list since (Avatar)
      const name = seen ? o.name : o.kind === 'attack' ? 'Attack' : coverName(s, src);
      return {
        sid: o.sid,
        kind: o.kind,
        controller: o.controller,
        hp: o.hp,
        name,
        iid: sc.alias(o.iid),
        src: o.src ? sc.alias(o.src) : undefined,
        target: o.target ? sc.alias(o.target) : null,
        tplayer: o.tplayer || null,
        tsid: o.tsid == null ? null : o.tsid,
        col: o.col,
        zone: o.zone || null,
        pick: o.secret && o.controller !== p ? null : o.pick || null, // a secret target: its controller only
        secret: !!o.secret,
        list: o.list, // a trigger or an activated ability (public: an activation is a command)
        abName: a ? a.name || null : null, // the ability's name and text: only when p may see where it comes from
        abText: a ? a.text || null : null,
        statuses: sc.scrub(o.statuses || []),
      };
    });
    let choice = null;
    if (s.choice) {
      const k = s.choice;
      choice =
        k.player === p
          ? {
              player: k.player,
              kind: k.kind,
              prompt: k.prompt,
              iid: k.iid ? sc.alias(k.iid) : undefined,
              card: k.card ? sc.alias(k.card) : undefined,
              token: !!k.token,
              secret: !!k.secret,
              options: k.options.map(sc.alias),
              labels: k.labels
                ? Object.fromEntries(Object.entries(k.labels).map(([o, t]) => [sc.alias(o), t]))
                : undefined,
            }
          : {
              // somebody else's choice: that it is pending, its kind and the cards it is about (opaque when hidden), never its prompt or options;
              // its labels only when p may see the card it comes from
              player: k.player,
              kind: k.kind,
              iid: k.iid ? sc.alias(k.iid) : undefined,
              card: k.card ? sc.alias(k.card) : undefined,
              token: !!k.token,
              secret: !!k.secret, // that it is a secret pick is public, the pick is not
              labels:
                k.labels && k.iid && sc.known(k.iid) && !k.secret
                  ? Object.fromEntries(Object.entries(k.labels).map(([o, t]) => [sc.alias(o), sc.maskText(t)]))
                  : undefined,
            };
    }
    return {
      viewer: p,
      names: Object.assign({}, s.names), // public
      phase: s.phase,
      turn: s.turn,
      active: s.active,
      priority: s.priority,
      attackPhase: s.attackPhase,
      respond: s.respond ? { kind: s.respond.kind, stage: s.respond.stage } : null,
      maxLife: s.maxLife,
      avatars: JSON.parse(JSON.stringify(s.avatars || { Player: null, Opponent: null })), // public
      race: s.race ? { Player: raceOf(s, 'Player'), Opponent: raceOf(s, 'Opponent') } : null, // public (the turn order strip)
      players,
      piles,
      cards,
      slots,
      zones,
      secrets: sc.scrub(secretsFor(s, p)), // what p may know of every secret: the zone for its placer (or once revealed), else the candidates
      stack,
      choice,
      result: s.result,
    };
  }
  // where a card now stands may be told to p when p sees it there, or the zone is not under a cloud another player controls
  const slotKnown = (pre, post, p, iid, key) =>
    (!!post.cards[iid] && canSee(post, p, post.cards[iid])) || slotSeen(post, p, key);
  const LEAVE = ['PermanentDestroyed', 'PermanentReturned', 'CardExiled', 'CardReturnedExtra'];
  function stepScope(pre, post, p) {
    // what p may know of ONE command (pre -> post). A card hidden ON THE BOARD before (under an enemy cloud) that is public afterwards
    // (it left the board) carries a one-off opaque id until the event / log line that takes it off the board, so the lines before
    // cannot be tied to the card that then shows up in the GY.
    const sc = scope([pre, post], p),
      under = new Set(
        Object.keys(pre.cards).filter(
          id => pre.cards[id].loc === 'board' && !canSee(pre, p, pre.cards[id]) && !sc.hiddenIid.has(id)
        )
      ),
      before = id => 'h-' + hash(pre.n + '|' + p + '|before|' + id),
      id0 = x => (typeof x !== 'string' ? x : under.has(x) ? before(x) : sc.alias(x)); // an id as p may know it BEFORE the command's events
    return { pre, post, p, sc, under, before, id0 };
  }
  function eventsOf(st, ev) {
    const { pre, post, p, sc, before } = st,
      under = new Set(st.under);
    return ev.map(e => {
      if (under.size && typeof e.iid === 'string' && under.has(e.iid) && LEAVE.includes(e.t)) under.delete(e.iid);
      const o = Object.assign({}, e);
      for (const k of ['iid', 'source', 'target']) if (typeof o[k] === 'string' && under.has(o[k])) o[k] = before(o[k]);
      // where a card p cannot see stands is hidden too (a card played or moved under an enemy cloud): the zone goes
      if (typeof o.slot === 'string' && typeof e.iid === 'string' && !slotKnown(pre, post, p, e.iid, o.slot))
        o.slot = null;
      for (const k of ['iid', 'source', 'target']) if (typeof o[k] === 'string') o[k] = sc.alias(o[k]);
      if (typeof o.why === 'string') o.why = sc.maskText(o.why);
      if (typeof o.from === 'string' && e.t === 'AbilitiesTransformed') o.from = sc.scrub(o.from); // the id of a hidden card (an Avatar under a cloud)
      if (e.t === 'SecretPlaced' && e.player !== p) {
        delete o.slot; // where a secret was placed: its placer only
        delete o.card;
      }
      if (Array.isArray(o.cands)) o.cands = o.cands.map(x => (ZKEY.test(x) ? x : sc.alias(x))); // card candidates: opaque when p cannot see them
      if (Array.isArray(o.iids)) o.iids = o.iids.map(sc.alias);
      return o;
    });
  }
  function observeEvents(pre, post, ev, p) {
    // the events of one command as p may see them: the id of a card p never knew is opaque, names inside texts are masked
    return eventsOf(stepScope(pre, post, p), ev);
  }
  const ZKEY = /^(Player|Opponent)\|(front|back)\|\d$/;
  function commandOf(st, cmd) {
    // the command as p may know it: hidden cards opaque, a zone p may not know is null, the ability's name only with its card
    const { pre, post, p, sc, under, id0 } = st,
      c = pre.cards[cmd.iid],
      o = Object.assign({}, cmd);
    if (!o.player && c) o.player = ctl(c);
    for (const k of ['iid', 'card']) if (typeof o[k] === 'string') o[k] = id0(o[k]);
    if (c) {
      const seen = sc.known(c.iid) && !under.has(c.iid);
      o.perm = isPerm(c);
      if (seen) {
        o.colTarget = !!c.def.colTarget;
        if (cmd.type === 'Activate') {
          const a = (abDef(c).abilities || [])[cmd.ab];
          o.abName = (a && a.name) || null;
        }
      } else {
        delete o.ab;
        const king = cloudMap(pre)[c.slot] || (post.cards[c.iid] && cloudMap(post)[post.cards[c.iid].slot]),
          kc = king && (post.cards[king] || pre.cards[king]);
        o.cover = kc && (canSee(post, p, kc) || canSee(pre, p, kc)) ? kc.def.name : null; // its ability seems to come from the King Eye that covers it
      }
      if (typeof o.slot === 'string' && !slotKnown(pre, post, p, c.iid, o.slot)) o.slot = null;
    }
    if (cmd.type === 'Choose' && pre.choice && typeof cmd.option === 'string') {
      const k = pre.choice,
        about = k.card || k.iid,
        x = cmd.option;
      o.about = id0(about); // the card the choice is about, as p knows it across the command (a card played from the hand is public once on the board)
      if (k.secret && k.player !== p)
        o.option = null; // a secret pick
      else if (pre.cards[x]) o.option = id0(x);
      else if (about && ZKEY.test(x) && (!k.kind || k.kind === 'place') && !slotKnown(pre, post, p, about, x))
        o.option = null;
      if (!k.kind && k.iid && pre.cards[k.iid]) {
        const kc = pre.cards[k.iid];
        o.from = canSee(pre, p, kc) || slotSeen(pre, p, kc.slot) ? kc.slot : null; // a shift: where it stood
      }
    }
    return o;
  }
  function logsOf(st) {
    // the card and player logs this command wrote (the zone changes and statuses), as p may know them
    const { pre, post, p, sc, under, before } = st,
      n0 = pre.lseq || 0,
      out = [],
      at = (w, s, c) => {
        const m = /^board (.+)$/.exec(w || '');
        if (!m) return w || null;
        return (s.cards[c.iid] && canSee(s, p, s.cards[c.iid])) || slotSeen(s, p, m[1]) ? w : 'board ?';
      };
    for (const c of Object.values(post.cards)) {
      const L = (c.logs || []).filter(l => l.n > n0);
      if (!L.length || c.def.type === 'ability') continue;
      let leave = null;
      if (under.has(c.iid)) {
        const l = L.find(x => x.kind === 'zone' && /^board /.test(x.from || '') && !/^board /.test(x.to || ''));
        leave = l ? l.n : Infinity;
      }
      for (const l of L) {
        const early = leave != null && l.n < leave,
          iid = early ? before(c.iid) : sc.alias(c.iid);
        if (l.kind === 'zone')
          out.push({
            n: l.n,
            iid,
            kind: 'zone',
            from: at(l.from, pre, c),
            to: at(l.to, post, c),
            how: sc.maskText(l.how),
          });
        else if (
          (l.kind === 'status+' || l.kind === 'status-') &&
          !early &&
          sc.known(c.iid) &&
          !secretHidden(
            (c.statuses || []).find(x => x.seq === l.id),
            p
          ) // a secret status leaves no trace for the other player
        )
          out.push({
            n: l.n,
            iid,
            kind: l.kind,
            sk: l.sk,
            id: l.id,
            text: sc.maskText(l.text),
            why: sc.maskText(l.why),
          });
      }
    }
    for (const q of ['Player', 'Opponent'])
      for (const l of post.players[q].logs || [])
        if (l.n > n0 && (l.kind === 'status+' || l.kind === 'status-'))
          out.push({
            n: l.n,
            player: q,
            kind: l.kind,
            sk: l.sk,
            id: l.id,
            text: sc.maskText(l.text),
            why: sc.maskText(l.why),
          });
    return out.sort((a, b) => a.n - b.n);
  }
  function tokensOf(st, ev) {
    const { pre, post, sc } = st,
      out = {};
    for (const e of ev)
      for (const k of ['iid', 'source', 'target']) {
        const id = e[k],
          t = typeof id === 'string' && (post.cards[id] || pre.cards[id]);
        if (!t || t.def.type !== 'ability' || out[sc.alias(id)]) continue;
        const src = post.cards[t.src] || pre.cards[t.src],
          s = post.cards[t.src] && post.cards[t.src].loc === 'board' ? post : pre;
        out[sc.alias(id)] = { owner: t.owner, name: sc.known(id) ? t.def.name : coverName(s, src) };
      }
    return out;
  }
  // EVERYTHING p may know of one command: the Observation before and after, the command, its events and the log lines it wrote.
  // The narrated log (narrate.js) is built from this only, so it cannot tell what p may not know.
  function observeStep(pre, post, cmd, ev, p) {
    const st = stepScope(pre, post, p);
    return {
      viewer: p,
      pre: observe(pre, p),
      post: observe(post, p),
      cmd: commandOf(st, cmd),
      ev: eventsOf(st, ev),
      logs: logsOf(st),
      tokens: tokensOf(st, ev), // the abilities the events name (one can go on the stack and resolve in the same command)
    };
  }
  return {
    exports: { observe, observeEvents, observeStep },
    needs: [
      'abDef',
      'apOpen',
      'atkOf',
      'canSee',
      'cloudMap',
      'ctl',
      'hpOf',
      'isPerm',
      'slotSeen',
      'totalDamage',
      'raceOf',
      'secretHidden',
      'secretsFor',
    ],
    link: () => {
      ({ abDef, apOpen, atkOf, canSee, cloudMap, ctl, hpOf, isPerm, slotSeen, totalDamage, raceOf } = K);
      ({ secretHidden, secretsFor } = K);
    },
  };
});

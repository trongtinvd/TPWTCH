// observe.js - OBSERVATIONS: what ONE player may know (Q39, Q44). Sim.observe(state, p) is a plain-data snapshot that holds only what is public to p
// (Sim.canSee is the one rule): a card p may not know is a stub with an opaque id (or missing: a card under an enemy cloud, a deck), never its name, definition,
// statuses or logs. This is the anti-cheat layer: a host sends a client its Observation, never the state. Sim.observeEvents does the same for the events of a command.
Sim.def('observe', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let canSee, cloudMap, slotSeen; // state
  let atkOf, hpOf, totalDamage, apOpen; // statuses, ap
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
  function scope(sts, p) {
    // sts = the states to look at (an Observation: one; events: before and after). A card is known when p could see it in ANY of them
    const seed = sts[0].n,
      all = {};
    for (const s of sts) for (const id in s.cards) all[id] = all[id] || s.cards[id];
    const known = id => sts.some(s => s.cards[id] && canSee(s, p, s.cards[id])),
      hiddenIid = new Set(),
      hid = new Set(),
      vis = new Set();
    for (const id in all) {
      const c = all[id];
      if (c.def.type === 'ability') continue;
      if (known(id)) {
        vis.add(c.def.name);
        vis.add(c.def.id);
      } else {
        hiddenIid.add(id);
        hid.add(c.def.name);
        hid.add(c.def.id);
      }
    }
    const hidden = new Set([...hid].filter(x => !vis.has(x)));
    const alias = id => (hiddenIid.has(id) ? 'h-' + hash(seed + '|' + p + '|' + id) : id);
    const scrub = v =>
      typeof v === 'string'
        ? hidden.has(v)
          ? 'a card'
          : alias(v)
        : Array.isArray(v)
          ? v.map(scrub)
          : v && typeof v === 'object'
            ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrub(x)]))
            : v;
    const maskText = t =>
      [...hidden].sort((a, b) => b.length - a.length).reduce((r, n) => r.split(n).join('a card'), t);
    return { known, hiddenIid, alias, scrub, maskText };
  }
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
      statuses: sc.scrub(c.statuses || []),
    });
    for (const id in s.cards) {
      const c = s.cards[id];
      if (c.def.type === 'ability' || (c.loc === 'deck' && !sc.known(id)) || c.loc === 'gone') continue; // a deck: only its size, and the cards revealed to p (Patch6)
      if (sc.known(id)) cards[id] = card(c);
      else if (c.loc === 'hand' || c.loc === 'extra') cards[sc.alias(id)] = stub(c); // a card under an enemy cloud is not even mentioned
    }
    const players = {};
    for (const q of ['Player', 'Opponent']) {
      const P = s.piles[q],
        ids = list => list.map(c => sc.alias(c.iid));
      piles[q] = {
        deck: P.deck.length,
        deckKnown: P.deck.map((c, i) => (sc.known(c.iid) ? [i, c.iid] : null)).filter(Boolean), // Patch6: [position, iid] of the deck cards revealed to p
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
      zones[k] = { statuses: sc.scrub(s.zones[k].statuses) };
    }
    const stack = s.stack.map(o => {
      const src = s.cards[o.src || o.iid],
        seen = o.kind === 'spell' || (src && sc.known(src.iid));
      let name = o.name;
      if (!seen) {
        const king = src && cloudMap(s)[src.slot];
        name = o.kind === 'attack' ? 'Attack' : king ? s.cards[king].def.name + ': Ability' : 'a card';
      }
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
              options: k.options.map(sc.alias),
              labels: k.labels
                ? Object.fromEntries(Object.entries(k.labels).map(([o, t]) => [sc.alias(o), t]))
                : undefined,
            }
          : { player: k.player }; // somebody else's choice: only that it is pending
    }
    return {
      viewer: p,
      phase: s.phase,
      turn: s.turn,
      active: s.active,
      priority: s.priority,
      attackPhase: s.attackPhase,
      respond: s.respond ? { kind: s.respond.kind, stage: s.respond.stage } : null,
      maxLife: s.maxLife,
      avatars: JSON.parse(JSON.stringify(s.avatars || { Player: null, Opponent: null })), // Patch12: public
      players,
      piles,
      cards,
      slots,
      zones,
      stack,
      choice,
      result: s.result,
    };
  }
  // where a card now stands may be told to p when p sees it there, or the zone is not under a cloud another player controls
  const slotKnown = (pre, post, p, iid, key) =>
    (!!post.cards[iid] && canSee(post, p, post.cards[iid])) || slotSeen(post, p, key);
  function observeEvents(pre, post, ev, p) {
    // the events of one command as p may see them: the id of a card p never knew is opaque, names inside texts are masked
    const sc = scope([pre, post], p);
    return ev.map(e => {
      const o = Object.assign({}, e);
      // Patch10: where a card p cannot see stands is hidden too (a card played or moved under an enemy cloud): the zone goes
      if (typeof o.slot === 'string' && typeof e.iid === 'string' && !slotKnown(pre, post, p, e.iid, o.slot))
        o.slot = null;
      for (const k of ['iid', 'source', 'target']) if (typeof o[k] === 'string') o[k] = sc.alias(o[k]);
      if (typeof o.why === 'string') o.why = sc.maskText(o.why);
      return o;
    });
  }
  return {
    exports: { observe, observeEvents },
    needs: ['apOpen', 'atkOf', 'canSee', 'cloudMap', 'hpOf', 'slotSeen', 'totalDamage'],
    link: () => {
      ({ apOpen, atkOf, canSee, cloudMap, hpOf, slotSeen, totalDamage } = K);
    },
  };
});

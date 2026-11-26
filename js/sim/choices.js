// choices.js - the multi-step choices of the extra deck cards: adjacent pairs (Widow Maker), reordering the top of a deck and declaring a card name
// then playing the opponent's top card (L4: The Librarian). Each flow is started by an op (ops.js) and continued by a CH handler (ch.js).
Sim.def('choices', function (K) {
  let fire; // stack
  let autoOne; // fx
  let prGo; // priority
  // imports (bound by Sim.boot once every module is loaded)
  let ctl;
  let byId, cname, isPerm, other, zoneDist; // util
  let has; // statuses
  let addStatus, isRevealed;
  let cloudMap, destroy, enterBoard, freeSlots, isUnusable; // state
  let ask; // fx
  let REQS; // reqs
  // ---- Widow Maker: target two adjacent cards the opponent controls; THEY send one of them to the graveyard
  const slotText = k => k.split('|').slice(1).join(' ');
  function pairOptions(s, who) {
    // every pair of adjacent cards the opponent of `who` controls and `who` may target
    const foe = other(who),
      m = cloudMap(s),
      at = k => s.slots[k] && s.cards[s.slots[k]],
      // a zone under the foe's own cloud is offered whatever is (or is not) under it; elsewhere only visible, targetable cards
      seen = Object.keys(s.slots).filter(
        k =>
          !isUnusable(s, k) &&
          ((m[k] && k.split('|')[0] === foe) || (at(k) && ctl(at(k)) === foe && !has(at(k), 'red')))
      ),
      opts = [];
    for (let i = 0; i < seen.length; i++)
      for (let j = i + 1; j < seen.length; j++)
        if (zoneDist(seen[i], seen[j]) === 1) opts.push(seen[i] + '#' + seen[j]);
    return opts;
  }
  function pairLabel(s, who, o) {
    const m = cloudMap(s),
      name = k =>
        (m[k] && k.split('|')[0] === other(who) ? 'covered zone' : cname(s, s.slots[k])) + ' (' + slotText(k) + ')';
    return o.split('#').map(name).join(' + ');
  }
  function pairStart(x) {
    // the pair was normally chosen when the ability was put on the stack (x.o.pick: targeting is part of the cost); without one it is chosen now
    if (x.o && x.o.pick) return pairPicked(x.s, x.who, x.src, x.o.pick, x.ev);
    const opts = pairOptions(x.s, x.who);
    if (autoOne(x.s, x.who, opts)) return pairPicked(x.s, x.who, x.src, opts[0], x.ev);
    if (opts.length)
      ask(
        x.s,
        x.who,
        x.src,
        'pair',
        opts,
        o => pairLabel(x.s, x.who, o),
        x.src.def.name + ': target two adjacent cards your opponent controls.',
        {},
        x.ev
      );
  }
  function pairPicked(s, who, c, opt, ev) {
    const foe = other(who),
      real = opt
        .split('#')
        .map(k => s.slots[k] && s.cards[s.slots[k]])
        .filter(t => t && t.loc === 'board' && ctl(t) === foe && !has(t, 'red')); // only what is really there and still targetable
    if (real.length === 1) destroy(s, real[0], ev);
    else if (real.length === 2)
      ask(
        s,
        foe,
        c,
        'pairsend',
        real.map(t => t.iid),
        i => cname(s, i) + ' (' + slotText(s.cards[i].slot) + ')',
        c.def.name + ': send one of these cards to the graveyard.',
        {},
        ev
      );
  }
  // ---- L4, first ability: look at the top n cards of a deck and put them back in the order you wish
  function reorderAsk(s, who, src, owner, rest, placed, ev) {
    if (rest.length <= 1) {
      const order = [...placed, ...rest].map(id => s.cards[id]);
      s.piles[owner].deck.splice(0, order.length, ...order);
      return;
    }
    ask(
      s,
      who,
      src,
      'reorder',
      rest,
      i => cname(s, i),
      src.def.name +
        ': pick the card to put ' +
        (placed.length ? 'next' : 'on top') +
        ' (' +
        (placed.length + 1) +
        ' of ' +
        (placed.length + rest.length) +
        ').',
      { owner, placed, need: rest.length - 1 }, // need: the picks still to come (the last card goes by itself)
      ev
    );
  }
  // a card someone looked at in a deck is revealed to them while it stays in that deck (it keeps the status when the deck is reordered)
  const revealInDeck = (s, c, who, src) => {
    if (c && c.owner !== who && !isRevealed(c, who))
      addStatus(s, c, { kind: 'revealed', to: who, zone: 'deck', srcName: src.def.name });
  };
  function reorderStart(x, e) {
    const owner = e.who === 'foe' ? x.foe : x.who,
      top = x.s.piles[owner].deck.slice(0, e.n).map(c => c.iid);
    top.forEach(id => revealInDeck(x.s, x.s.cards[id], x.who, x.src));
    if (top.length > 1) reorderAsk(x.s, x.who, x.src, owner, top, [], x.ev);
  }
  // ---- L4, second ability: declare a name, look at the opponent's top card; if it has that name you may play it (you control it while it is in play / on the stack), then repeat
  function declareAsk(s, who, src, ev) {
    const defs = Object.values(byId)
      .filter(d => d.type !== 'ability')
      .sort((a, b) => a.name.localeCompare(b.name));
    ask(
      s,
      who,
      src,
      'declare',
      defs.map(d => d.id),
      i => byId[i].name,
      src.def.name + ': declare a card name.',
      {},
      ev
    );
  }
  // a spell that must target (no optional target): L4 plays it WITHOUT a target, and it fizzles when it resolves [decided 2026-11-25]
  const mustTarget = d =>
    !d.optionalTarget && !!(d.zoneTarget || d.colTarget || d.playerTarget || d.stackTarget || d.target || d.targeting);
  const TARGET_REQS = ['target', 'stack']; // "a legal target exists": moot for a spell played without one
  const playable = (s, me, t) => {
    // permanents need a free zone on my side; spells need their requirements (a spell that must target skips the "a target exists" ones)
    const was = t.controller;
    t.controller = me;
    try {
      if (isPerm(t)) return freeSlots(s, t).length > 0;
      const d = t.def,
        skip = mustTarget(d) ? TARGET_REQS : [];
      return (d.req || []).every(r => skip.includes(r) || !REQS[r] || !REQS[r](s, t, d));
    } finally {
      if (was === undefined) delete t.controller;
      else t.controller = was;
    }
  };
  function libLook(s, me, c, name, ev) {
    const top = s.piles[other(me)].deck[0];
    if (!top) return;
    revealInDeck(s, top, me, c);
    const hit = top.def.id === name,
      can = hit && playable(s, me, top);
    ask(
      s,
      me,
      c,
      can ? 'libplay' : 'libseen',
      can ? ['play', 'no'] : ['ok'],
      i => ({ play: 'Play ' + top.def.name, no: 'Do not play it', ok: 'OK' })[i],
      c.def.name +
        ': the top card of the opponent\u2019s deck is ' +
        top.def.name +
        (hit ? (can ? '. Play it?' : ', but it cannot be played.') : ', not ' + byId[name].name + '.'),
      {},
      ev
    );
  }
  function libPlay(s, me, c, t, ev) {
    const D = s.piles[t.owner].deck;
    D.splice(D.indexOf(t), 1);
    t.controller = me; // Q56: the owner stays, only the control changes; it ends when the card leaves (release)
    if (isPerm(t)) {
      const f = freeSlots(s, t);
      if (autoOne(s, me, f)) enterBoard(s, t, f[0], ev);
      else
        return ask(
          s,
          me,
          c,
          'place',
          f,
          null,
          'Click a highlighted zone for ' + t.def.name + '.',
          { card: t.iid, again: true },
          ev
        );
    } else {
      t.loc = 'stack';
      s.stack.push({
        sid: ++s.sid,
        kind: 'spell',
        iid: t.iid,
        controller: me,
        hp: t.def.hp,
        name: t.def.name,
        col: undefined,
        zone: null,
        tplayer: null,
        tsid: null,
        untargeted: mustTarget(t.def) || undefined, // it fizzles on resolve (stack.js)
        statuses: [],
      });
      prGo(s, 'pushedByEffect'); // the count resets; priority stays while the Librarian goes on
      ev.push({ t: 'StackObjectCreated', iid: t.iid });
      fire(s, ev, 'cast', t); // its own 'cast' triggers (Duplicate, spell mode)
    }
    declareAsk(s, me, c, ev); // repeat this effect
  }
  return {
    exports: { declareAsk, libLook, libPlay, pairLabel, pairOptions, pairPicked, pairStart, reorderAsk, reorderStart },
    needs: [
      'fire',
      'autoOne',
      'prGo',
      'addStatus',
      'isRevealed',
      'ctl',
      'REQS',
      'ask',
      'byId',
      'cloudMap',
      'cname',
      'destroy',
      'enterBoard',
      'freeSlots',
      'has',
      'isPerm',
      'isUnusable',
      'other',
      'zoneDist',
    ],
    link: () => {
      ({ fire } = K);
      ({ autoOne } = K);
      ({ prGo } = K);
      ({ addStatus, isRevealed } = K);
      ({ ctl } = K);
      ({ REQS, ask, byId, cloudMap, cname, destroy, enterBoard, freeSlots, has, isPerm, isUnusable, other, zoneDist } =
        K);
    },
  };
});

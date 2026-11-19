// choices.js - the multi-step choices of the extra deck cards: adjacent pairs (Widow Maker), reordering the top of a deck and declaring a card name
// then playing the opponent's top card (L4: The Librarian). Each flow is started by an op (ops.js) and continued by a CH handler (ch.js).
Sim.def('choices', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let byId, cname, isPerm, other, zoneDist; // util
  let has; // statuses
  let cloudMap, destroy, enterBoard, freeSlots; // state
  let ask; // fx
  let REQS; // reqs
  // ---- Widow Maker: target two adjacent cards the opponent controls; THEY send one of them to the graveyard
  const slotText = k => k.split('|').slice(1).join(' ');
  function pairStart(x) {
    const s = x.s,
      m = cloudMap(s),
      at = k => s.slots[k] && s.cards[s.slots[k]],
      // a zone under the foe's own cloud is offered whatever is (or is not) under it; elsewhere only visible, targetable cards
      seen = Object.keys(s.slots).filter(
        k =>
          !s.unusable[k] &&
          ((m[k] && k.split('|')[0] === x.foe) || (at(k) && at(k).owner === x.foe && !has(at(k), 'red')))
      ),
      opts = [];
    for (let i = 0; i < seen.length; i++)
      for (let j = i + 1; j < seen.length; j++)
        if (zoneDist(seen[i], seen[j]) === 1) opts.push(seen[i] + '#' + seen[j]);
    if (opts.length === 1) return pairPicked(s, x.who, x.src, opts[0], x.ev);
    if (opts.length) {
      const name = k =>
        (m[k] && k.split('|')[0] === x.foe ? 'covered zone' : cname(s, s.slots[k])) + ' (' + slotText(k) + ')';
      ask(
        s,
        x.who,
        x.src,
        'pair',
        opts,
        o => o.split('#').map(name).join(' + '),
        x.src.def.name + ': target two adjacent cards your opponent controls.',
        {},
        x.ev
      );
    }
  }
  function pairPicked(s, who, c, opt, ev) {
    const foe = other(who),
      real = opt
        .split('#')
        .map(k => s.slots[k] && s.cards[s.slots[k]])
        .filter(t => t && t.loc === 'board' && t.owner === foe && !has(t, 'red')); // only what is really there and still targetable
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
      { owner, placed },
      ev
    );
  }
  function reorderStart(x, e) {
    const owner = e.who === 'foe' ? x.foe : x.who,
      top = x.s.piles[owner].deck.slice(0, e.n).map(c => c.iid);
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
  const playable = (s, me, t) => {
    // permanents need a free zone on my side; spells that need no target and whose requirements hold (targeted spells cannot be played this way yet)
    const was = t.owner;
    t.owner = me;
    try {
      if (isPerm(t)) return freeSlots(s, t).length > 0;
      const d = t.def;
      if (d.zoneTarget || d.colTarget || d.playerTarget || d.stackTarget) return false;
      return (d.req || []).every(r => !REQS[r] || !REQS[r](s, t, d));
    } finally {
      t.owner = was;
    }
  };
  function libLook(s, me, c, name, ev) {
    const top = s.piles[other(me)].deck[0];
    if (!top) return;
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
    t.home = t.owner; // it goes back to its owner's zones when it leaves
    t.owner = me;
    if (isPerm(t)) {
      const f = freeSlots(s, t);
      if (f.length === 1) enterBoard(s, t, f[0], ev);
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
      });
      s.passes = 0;
      ev.push({ t: 'StackObjectCreated', iid: t.iid });
    }
    declareAsk(s, me, c, ev); // repeat this effect
  }
  return {
    exports: { declareAsk, libLook, libPlay, pairPicked, pairStart, reorderAsk, reorderStart },
    needs: [
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
      'other',
      'zoneDist',
    ],
    link: () => {
      ({ REQS, ask, byId, cloudMap, cname, destroy, enterBoard, freeSlots, has, isPerm, other, zoneDist } = K);
    },
  };
});

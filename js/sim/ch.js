// ch.js - REGISTRY CH: answers to non-shift choices (Choose command)
Sim.def('ch', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let other; // util
  let addStatus, has, hurt, live, removeStatus; // statuses
  let bounce, enterBoard, freeSlots, makeToken; // state
  let ask, askDeck, runFx, upToAsk; // fx
  let THEN; // then
  let extraAttack; // combat
  const CH = {
    // answers to non-shift choices (Choose command)
    mode: (s, k, c, cmd, ev) =>
      runFx({ s, ev, src: c, who: k.player, foe: other(k.player), t: null }, k.modes[+cmd.option].effects),
    pick: (s, k, c, cmd, ev) => {
      if (cmd.option.startsWith('P:')) {
        const p = cmd.option.slice(2);
        hurt(s, p, k.amount, c.def.name, 'effect');
        ev.push({ t: 'PlayerDamaged', player: p, amount: k.amount });
      } else if (cmd.option.startsWith('Z:')) {
        // a zone under a cloud was picked: only what is REALLY there is affected; an empty (or red-shielded) zone fizzles and reveals nothing
        const id = s.slots[cmd.option.slice(2)],
          t = id && s.cards[id];
        if (t && t.loc === 'board' && !has(t, 'red')) THEN[k.then](s, k.player, c, t, k, ev);
      } else THEN[k.then](s, k.player, c, s.cards[cmd.option], k, ev);
    },
    place: (s, k, c, cmd, ev) => {
      if (k.token) {
        makeToken(s, c.def.tokens[k.token], k.player, cmd.option, ev);
        return;
      }
      enterBoard(s, s.cards[k.card], cmd.option, ev);
      if (k.atk) extraAttack(s, s.cards[k.card], ev);
      if (k.next) upToAsk(s, k.player, c, k.next.e, k.next.left, ev);
    },
    upto: (s, k, c, cmd, ev) => {
      if (cmd.option === 'done') return;
      const t = s.cards[cmd.option],
        P = s.piles[k.player];
      if (k.e.then === 'toHand') {
        P[k.e.from].splice(P[k.e.from].indexOf(t), 1);
        t.loc = 'hand';
        P.hand.push(t);
        ev.push({ t: 'CardAdded', iid: t.iid, player: k.player });
        upToAsk(s, k.player, c, k.e, k.left - 1, ev);
        return;
      }
      const f = freeSlots(s, t);
      if (f.length === 1) {
        enterBoard(s, t, f[0], ev);
        upToAsk(s, k.player, c, k.e, k.left - 1, ev);
      } else if (f.length)
        ask(
          s,
          k.player,
          c,
          'place',
          f,
          null,
          'Click a highlighted zone for ' + t.def.name + '.',
          { card: t.iid, next: { e: k.e, left: k.left - 1 } },
          ev
        );
    },
    swap: (s, k, c, cmd, ev) => {
      if (cmd.option === 'stay' || c.loc !== 'hand') return;
      const t = s.cards[cmd.option];
      if (t.loc !== 'board') return;
      const slot = t.slot;
      bounce(s, t, ev);
      enterBoard(s, c, slot, ev);
    },
    vault: (s, k, c, cmd, ev) => {
      const d = s.cards[cmd.option],
        P = s.piles[c.owner];
      P.deck.splice(P.deck.indexOf(d), 1);
      d.loc = 'exile';
      P.exile.push(d);
      addStatus(s, c, { kind: 'vault', card: d.iid, name: d.def.name, srcName: c.def.name });
      ev.push({ t: 'CardExiled', iid: d.iid });
      if (k.left > 1) askDeck(s, c, k.left - 1, ev);
    },
    vaultpick: (s, k, c, cmd, ev) => {
      const d = s.cards[cmd.option],
        P = s.piles[d.owner];
      P.exile.splice(P.exile.indexOf(d), 1);
      removeStatus(
        s,
        live(c).find(y => y.kind === 'vault' && y.card === d.iid),
        'taken into hand'
      );
      d.loc = 'hand';
      P.hand.push(d);
      ev.push({ t: 'CardAdded', iid: d.iid, player: d.owner });
    },
  };
  return {
    exports: { CH },
    needs: [
      'THEN',
      'addStatus',
      'ask',
      'askDeck',
      'bounce',
      'enterBoard',
      'extraAttack',
      'freeSlots',
      'has',
      'hurt',
      'live',
      'makeToken',
      'other',
      'removeStatus',
      'runFx',
      'upToAsk',
    ],
    link: () => {
      ({
        THEN,
        addStatus,
        ask,
        askDeck,
        bounce,
        enterBoard,
        extraAttack,
        freeSlots,
        has,
        hurt,
        live,
        makeToken,
        other,
        removeStatus,
        runFx,
        upToAsk,
      } = K);
    },
  };
});

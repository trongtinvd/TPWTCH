// ch.js - REGISTRY CH: answers to non-shift choices (Choose command)
Sim.def('ch', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let addAttackBonus, cancelAttackObj;
  let other; // util
  let addStatus, has, hurt, live, removeStatus; // statuses
  let bounce, destroy, enterBoard, freeSlots, makeToken; // state
  let ask, askDeck, runFx, upToAsk; // fx
  let THEN; // then
  let dupAsk; // ops
  let fusionMat, fusionPicked; // fusion
  let declareAsk, libLook, libPlay, pairPicked, reorderAsk; // choices
  let extraAttack; // combat
  let advanceTrg; // stack
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
        if (k.dupLeft) dupAsk(s, k.player, c, k.dupLeft, ev); // Duplicate: the next copy
        return;
      }
      enterBoard(s, s.cards[k.card], cmd.option, ev);
      if (k.atk) extraAttack(s, s.cards[k.card], ev);
      if (k.next) upToAsk(s, k.player, c, k.next.e, k.next.left, ev);
      if (k.again) declareAsk(s, k.player, c, ev); // L4: repeat the effect after the played card entered
    },
    attackpick: (s, k, c, cmd, ev) => {
      const o = s.stack.find(q => String(q.sid) === cmd.option);
      if (!o) return; // it left the stack meanwhile
      if (k.act === 'cancel') cancelAttackObj(s, o, ev);
      else addAttackBonus(s, o, k.amount, c.def.name, ev);
    },
    trigorder: (s, k, c, cmd, ev) => {
      s.trg.R[k.p] = cmd.option.split(',').map(Number);
      advanceTrg(s, ev);
    },
    abtarget: (s, k, c, cmd, ev) => activate(s, c, k.ab, cmd.option, ev), // the ability's target was picked: pay the costs, put it on the stack
    trigtarget: (s, k, c, cmd, ev) => {
      s.trg.items[k.tk].tgt = cmd.option;
      advanceTrg(s, ev);
    },
    fusepick: (s, k, c, cmd, ev) => fusionPicked(s, k, c, cmd, ev),
    fusemat: (s, k, c, cmd, ev) => fusionMat(s, k, c, cmd, ev),
    pair: (s, k, c, cmd, ev) => pairPicked(s, k.player, c, cmd.option, ev),
    pairsend: (s, k, c, cmd, ev) => {
      const t = s.cards[cmd.option];
      if (t.loc === 'board') destroy(s, t, ev);
    },
    reorder: (s, k, c, cmd, ev) =>
      reorderAsk(
        s,
        k.player,
        c,
        k.owner,
        k.options.filter(o => o !== cmd.option),
        [...k.placed, cmd.option],
        ev
      ),
    declare: (s, k, c, cmd, ev) => libLook(s, k.player, c, cmd.option, ev),
    libseen: () => {},
    libplay: (s, k, c, cmd, ev) => {
      const top = s.piles[other(k.player)].deck[0];
      if (cmd.option === 'play' && top) libPlay(s, k.player, c, top, ev);
    },
    upto: (s, k, c, cmd, ev) => {
      if (cmd.option === 'done') return;
      const t = s.cards[cmd.option],
        P = s.piles[k.player];
      if (t === c && t.loc === 'stack') {
        // Q40: the resolving spell picked itself: it ends up in the hand instead of the graveyard (settle)
        if (s.resolving) s.resolving.toHand = true;
        upToAsk(s, k.player, c, k.e, k.left - 1, ev);
        return;
      }
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
      'dupAsk',
      'activate',
      'addAttackBonus',
      'cancelAttackObj',
      'THEN',
      'advanceTrg',
      'addStatus',
      'ask',
      'askDeck',
      'bounce',
      'declareAsk',
      'destroy',
      'enterBoard',
      'extraAttack',
      'freeSlots',
      'fusionMat',
      'fusionPicked',
      'has',
      'hurt',
      'libLook',
      'libPlay',
      'live',
      'makeToken',
      'other',
      'pairPicked',
      'removeStatus',
      'reorderAsk',
      'runFx',
      'upToAsk',
    ],
    link: () => {
      ({ dupAsk } = K);
      ({ activate } = K);
      ({ addAttackBonus, cancelAttackObj } = K);
      ({
        THEN,
        advanceTrg,
        addStatus,
        ask,
        askDeck,
        bounce,
        declareAsk,
        destroy,
        enterBoard,
        extraAttack,
        freeSlots,
        fusionMat,
        fusionPicked,
        has,
        hurt,
        libLook,
        libPlay,
        live,
        makeToken,
        other,
        pairPicked,
        removeStatus,
        reorderAsk,
        runFx,
        upToAsk,
      } = K);
    },
  };
});

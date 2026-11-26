// ops.js - REGISTRY OPS: effect handlers. Add an entry here (and an Fx builder in cards.js) to give every card a new building block
Sim.def('ops', function (K) {
  let autoOne; // fx
  // imports (bound by Sim.boot once every module is loaded)
  let countValue; // values
  let drawCards; // dispatch
  let turnGo; // turn
  let addAttackBonus, cancelAttackObj;
  let ctl;
  let cname, colKeys, zoneDist; // util
  let PL, addStatus, allowed, clearAttacked, clearStatuses, has, hasSt, hurt, isRevealed, live, removeStatus, syncLife; // statuses
  let cloudMap,
    damageZone,
    declareWinner,
    destroy,
    freeSlots,
    giveZoneHp,
    isUnusable,
    makeToken,
    markUnusable,
    recalc,
    release; // state
  let fusionStart; // fusion
  let declareAsk, pairStart, reorderStart; // choices
  let pendingAtk; // targeting
  let ask, askCounters, askDeck, foeCreatures, runFx, suspend, upToAsk; // fx
  let CH; // ch
  let dealDamage; // combat
  let fire, hitStack; // stack
  let atkOf; // statuses (Retaliate)
  let placeCardSecret, placeZoneSecret; // secrets
  let abDef; // statuses
  let prGo; // priority
  // Board picks for the player x.who. A card under an enemy cloud is never offered by itself: its ZONE is ('Z:slot'), empty or not,
  // so the picker learns nothing about what is underneath. Elsewhere a card is offered unless it has a red shield.
  const boardPicks = (x, foeOnly) => {
    const s = x.s,
      m = cloudMap(s),
      out = [];
    for (const k of Object.keys(s.slots)) {
      if (isUnusable(s, k)) continue;
      const own = k.split('|')[0] === x.who;
      if (foeOnly && own) continue;
      if (m[k] && !own) {
        out.push('Z:' + k);
        continue;
      }
      const c = s.slots[k] && s.cards[s.slots[k]];
      if (c && !has(c, 'red')) out.push(c.iid);
    }
    return out;
  };
  // Q41: an effect that picks an Attack, with several to pick from, asks (one option per Attack; the answer is in ch.js)
  const pickAttack = (x, list, extra) =>
    ask(
      x.s,
      x.who,
      x.src,
      'attackpick',
      list.map(o => String(o.sid)),
      i => {
        const o = x.s.stack.find(q => String(q.sid) === i);
        return 'Attack of ' + cname(x.s, o.iid) + (o.slotAt ? ' (column ' + (+o.slotAt.split('|')[2] + 1) + ')' : '');
      },
      x.src.def.name + ': choose which Attack.',
      extra,
      x.ev
    );
  const OPS = {
    // effect handlers: (ctx, effect). ctx = {s, ev, src, t, who, foe}
    // Retaliate (the effect of the keyworded trigger, Fx.retaliate). The trigger kept the damage it saw (o.evt). Damage equal to
    // this card's power (now, if it is still on the board; else its power when it was damaged) goes to the source: the creature that dealt
    // it while it is on the board, or the player behind a spell. Its type is 'retaliate', which never triggers Retaliate.
    Retaliate: x => {
      const d = x.o && x.o.evt;
      if (!d) return;
      const me = x.src,
        pw = me.loc === 'board' ? atkOf(me) : d.power,
        from = x.s.cards[d.source];
      if (!(pw > 0)) return;
      if (d.spell) {
        hurt(x.s, d.spell, pw, me.def.name, 'retaliate');
        x.ev.push({ t: 'PlayerDamaged', player: d.spell, amount: pw });
      } else if (from && from.loc === 'board') dealDamage(x.s, me, from, pw, x.ev, 'retaliate');
    },
    DealDamage: (x, e) => {
      if (e.to === 'target' && !x.tp) dealDamage(x.s, x.src, x.t, e.amount, x.ev, 'effect', true);
      else {
        const p = e.to === 'target' ? x.tp : x.foe;
        hurt(x.s, p, e.amount, x.src.def.name, 'effect');
        x.ev.push({ t: 'PlayerDamaged', player: p, amount: e.amount });
      }
    },
    Mill: (x, e) => {
      const p = x.tp || x.who,
        P = x.s.piles[p];
      for (let i = 0; i < e.n; i++) {
        const d = P.deck.shift();
        if (!d) break;
        d.loc = 'gy';
        P.gy.unshift(d);
        x.ev.push({ t: 'CardMilled', iid: d.iid, player: p });
      }
    },
    FetchFromDeck: (x, e) => {
      const P = x.s.piles[x.who],
        i = P.deck.findIndex(d => d.def.id === e.card);
      if (i < 0) return;
      const d = P.deck.splice(i, 1)[0];
      d.loc = 'hand';
      P.hand.push(d);
      x.ev.push({ t: 'CardAdded', iid: d.iid, player: x.who });
    },
    DoublePower: x => {
      const c = x.src;
      if (c.loc === 'board') addStatus(x.s, c, { kind: 'atkMul', n: 2, srcName: c.def.name });
    },
    GainLife: (x, e) => {
      // gaining life adds a 'life' status to a player (or +HP to a target card)
      if (!allowed(PL(x.s, x.who), 'gainLife')) return;
      const k = { kind: 'life', amount: e.amount, srcName: x.src.def.name };
      if (e.to === 'target' && x.t && x.t.loc === 'board') addStatus(x.s, x.t, k);
      else {
        addStatus(x.s, PL(x.s, x.who), k);
        syncLife(x.s, x.who);
      }
      x.ev.push({
        t: 'LifeCounterAdded',
        amount: e.amount,
        player: x.who,
        target: e.to === 'target' && x.t ? x.t.iid : undefined,
      });
    }, // life may exceed the starting value
    SacrificeSelf: x => {
      if (x.src.loc === 'board') destroy(x.s, x.src, x.ev);
    }, // effect-sacrifice: only if the effect resolves
    Draw: (x, e) => {
      const w = e.who === 'foe' ? x.foe : x.who;
      drawCards(x.s, w, countValue(x, e.n), x.ev); // counted once, before the first draw; drawCards (dispatch.js) is the one draw
    },
    DamageHp: (x, e) => {
      // damage the picked non-player HP target (x.o.pick: a card, a zone / cloud, a stack object; see hp.js)
      const ref = x.o && x.o.pick;
      if (ref != null)
        damageHp(x.s, x.src, ref, e.amount, x.ev, { nonLethal: !!e.nonLethal, temporary: !!e.temporary });
    },
    DamageStack: (x, e) => {
      const u = x.s.stack[x.s.stack.length - 1];
      if (u) hitStack(x.s, u, e.amount, x.ev);
    },
    ShiftAdjacent: x => {
      // asks the controller (a Choose command) instead of moving silently
      const c = x.src;
      if (c.loc !== 'board') return;
      const [o, row, col] = c.slot.split('|'),
        opts = [-1, 1]
          .map(d => o + '|' + row + '|' + (+col + d))
          .filter(k => k in x.s.slots && !x.s.slots[k] && !isUnusable(x.s, k));
      if (opts.length) {
        x.s.choice = {
          player: x.who,
          iid: c.iid,
          options: ['stay', ...opts],
          prompt: c.def.name + ': shift to an adjacent column?',
        };
        x.ev.push({ t: 'ChoiceRequested', player: x.who });
      }
    },
    NearestZone: (x, e) => {
      // sets x.zone; re-evaluated every time it runs. Ties: first zone in key order (placeholder for 'you choose')
      x.zone = null;
      const c = x.src;
      if (c.loc !== 'board') return;
      let best = null,
        bd = Infinity;
      for (const k of Object.keys(x.s.slots)) {
        if (isUnusable(x.s, k)) continue; // unusable zones are never targeted
        const occ = x.s.slots[k] && x.s.cards[x.s.slots[k]];
        if (occ && (e.skip || []).some(sp => (sp === 'self' ? occ === c : occ.def.id === sp))) continue;
        const d = zoneDist(c.slot, k);
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
      x.zone = best;
    },
    DestroyOnZone: x => {
      const id = x.zone && x.s.slots[x.zone];
      if (id && !has(x.s.cards[id], 'blue')) destroy(x.s, x.s.cards[id], x.ev);
    },
    CreateToken: (x, e) => {
      const def = x.src.def.tokens && x.src.def.tokens[e.token];
      if (!x.zone || !def || x.s.slots[x.zone] || isUnusable(x.s, x.zone)) return;
      const n = (x.s.tokN = (x.s.tokN || 0) + 1),
        t = { iid: 'tk-' + n, def, owner: x.who, loc: 'board', slot: x.zone, statuses: [], token: true };
      x.s.cards[t.iid] = t;
      x.s.slots[x.zone] = t.iid;
      x.ev.push({ t: 'PermanentSummoned', iid: t.iid, slot: x.zone });
      fire(x.s, x.ev, 'enter', t);
      recalc(x.s, x.ev);
    },
    ExileColumn: x => {
      if (x.col == null) return;
      for (const k of colKeys(x.col)) {
        const id = x.s.slots[k];
        if (!id) continue;
        const c = x.s.cards[id];
        if (has(c, 'blue')) continue;
        x.s.slots[k] = null;
        c.slot = null;
        release(c);
        clearStatuses(x.s, c, 'left the board');
        if (c.token) c.loc = 'gone';
        else {
          c.loc = 'exile';
          x.s.piles[c.owner].exile.push(c);
        }
        x.ev.push({ t: 'CardExiled', iid: c.iid, from: 'board', by: 'effect' });
      }
    },
    MakeColumnUnusable: x => {
      if (x.col == null) return;
      for (const k of colKeys(x.col)) {
        markUnusable(x.s, k, x.src.def.name);
        x.ev.push({ t: 'ZoneUnusable', slot: k });
      }
    },
    ReturnToHand: x => {
      if (x.o) x.o.toHand = true;
    },
    DamageAnother: (x, e) => {
      // controller picks another creature on the board (automatic when there is only one)
      const opts = Object.values(x.s.cards)
        .filter(c => c.loc === 'board' && c.def.type === 'creature' && c !== x.src && !has(c, 'red'))
        .map(c => c.iid);
      if (autoOne(x.s, x.who, opts)) dealDamage(x.s, x.src, x.s.cards[opts[0]], e.amount, x.ev, 'effect', true);
      else if (opts.length) {
        x.s.choice = {
          player: x.who,
          iid: x.src.iid,
          kind: 'damage',
          amount: e.amount,
          options: opts,
          prompt: x.src.def.name + ': deal ' + e.amount + ' damage to another creature.',
        };
        x.ev.push({ t: 'ChoiceRequested', player: x.who });
      }
    },
    RemoveDamage: (x, e) => {
      if (x.t && x.t.loc === 'board') askCounters(x.s, x.who, x.src, x.t, e.n, x.ev);
    },
    Repeat: (x, e) => {
      for (let i = 0; i < e.n; i++) {
        runFx(x, e.effects);
        if (x.s.choice) {
          // an inner effect opened a choice: do NOT go on to the next repetition, resume with the remaining ones after the answer
          if (i < e.n - 1) suspend(x, [{ op: 'Repeat', n: e.n - i - 1, effects: e.effects }]);
          return;
        }
      }
    },
    ChooseMode: (x, e) => {
      // only one fitting mode: run it; several: the controller picks
      const n = foeCreatures(x),
        ok = e.modes.filter(m => n >= (m.min || 0) && n <= (m.max ?? 99));
      if (!ok.length) return;
      if (ok.length === 1) return runFx(x, ok[0].effects);
      x.s.choice = {
        player: x.who,
        iid: x.src.iid,
        kind: 'mode',
        options: ok.map((m, i) => String(i)),
        labels: Object.fromEntries(ok.map((m, i) => [String(i), m.name])),
        modes: ok,
        prompt: x.src.def.name + ': choose one effect (opponent controls ' + n + ' creatures).',
      };
      x.ev.push({ t: 'ChoiceRequested', player: x.who });
    },
    PickCard: (x, e) => {
      const s = x.s,
        cs = Object.values(s.cards),
        mine = c => ctl(c) === x.who;
      const ids =
        e.from === 'foeHand'
          ? s.piles[x.foe].hand.map(c => {
              if (!isRevealed(c, x.who))
                addStatus(s, c, { kind: 'revealed', to: x.who, zone: 'hand', srcName: x.src.def.name });
              return c.iid;
            })
          : e.from === 'foeBoard'
            ? boardPicks(x, true)
            : e.from === 'anyTarget'
              ? boardPicks(x, false).concat(['P:Player', 'P:Opponent'])
              : e.from === 'myGYEx'
                ? cs.filter(c => mine(c) && c.def.extra && c.loc === 'gy').map(c => c.iid)
                : e.from === 'myBoardCreatures'
                  ? cs
                      .filter(c => mine(c) && c.loc === 'board' && c.def.type === 'creature' && !has(c, 'red'))
                      .map(c => c.iid)
                  : e.from === 'myGYCreatures'
                    ? cs
                        .filter(
                          c =>
                            mine(c) && c.def.type === 'creature' && !c.token && c.loc === 'gy' && freeSlots(s, c).length
                        )
                        .map(c => c.iid)
                    : cs
                        .filter(
                          c =>
                            mine(c) && c.def.type === 'creature' && !c.token && ['hand', 'gy', 'exile'].includes(c.loc)
                        )
                        .map(c => c.iid);
      if (ids.length)
        ask(
          s,
          x.who,
          x.src,
          'pick',
          ids,
          e.from === 'myGYCreatures' ||
            e.from === 'myGYEx' ||
            (e.from === 'myCreatures' && ids.some(i => s.cards[i].loc !== 'hand'))
            ? i => cname(s, i) + ' (' + s.cards[i].loc + ')'
            : null,
          x.src.def.name +
            ': ' +
            (e.from === 'foeHand'
              ? 'click a revealed card to discard it.'
              : e.from === 'myCreatures' || e.from === 'myGYCreatures'
                ? 'pick a creature to put into play.'
                : e.from === 'myGYEx'
                  ? 'pick an extra deck creature to return to the extra deck.'
                  : e.from === 'myBoardCreatures'
                    ? 'click a creature you control: it attacks.'
                    : 'click a card or a life bar.'),
          { then: e.then, amount: e.amount || 0 },
          x.ev
        );
    },
    Fusion: (x, e) => fusionStart(x, e),
    SelfToHand: x => {
      // this card (resolving ability's source) goes from the deck or the GY to its owner's hand
      const c = x.src,
        P = x.s.piles[c.owner];
      if (c.loc !== 'deck' && c.loc !== 'gy') return;
      P[c.loc].splice(P[c.loc].indexOf(c), 1);
      c.loc = 'hand';
      P.hand.push(c);
      x.ev.push({ t: 'CardAdded', iid: c.iid, player: c.owner });
    },
    SendAdjacentPair: x => pairStart(x),
    ReorderTop: (x, e) => reorderStart(x, e),
    DeclareName: x => declareAsk(x.s, x.who, x.src, x.ev),
    DestroyAll: x => {
      for (const c of Object.values(x.s.cards)) if (c.loc === 'board' && !has(c, 'blue')) destroy(x.s, c, x.ev);
    },
    VaultFromDeck: (x, e) => askDeck(x.s, x.src, e.n, x.ev),
    RevealVault: x => {
      const c = x.src,
        v = live(c)
          .filter(y => y.kind === 'vault' && x.s.cards[y.card].loc === 'exile')
          .map(y => y.card);
      if (c.loc === 'board' && v.length)
        ask(
          x.s,
          x.foe,
          c,
          'vaultpick',
          v,
          i => cname(x.s, i),
          c.def.name + ": pick one exiled card to put into the controller's hand.",
          {},
          x.ev
        );
    },
    SwapIn: x => {
      const s = x.s,
        o = pendingAtk(s, ctl(x.src)),
        a = o && s.cards[o.iid],
        src = x.src;
      if (!a || a.loc !== 'board' || src.loc !== 'hand') return;
      const ids = colKeys(a.slot.split('|')[2])
        .map(k => s.slots[k])
        .filter(id => id && ctl(s.cards[id]) === ctl(src) && s.cards[id].def.type === 'creature');
      if (!ids.length) return;
      if (autoOne(s, x.who, ids)) CH.swap(s, null, src, { option: ids[0] }, x.ev);
      else ask(s, x.who, src, 'swap', ids, null, 'Click the creature to return to your hand.', {}, x.ev);
    },
    ShieldAll: (x, e) => {
      for (const c of Object.values(x.s.cards))
        if (c.loc === 'board' && ctl(c) === x.who) {
          addStatus(x.s, c, { kind: 'shield', color: e.color, srcName: x.src.def.name });
          x.ev.push({ t: 'CounterAdded', iid: c.iid, color: e.color });
        }
    },
    NoLifeGain: x => {
      addStatus(x.s, PL(x.s, x.who), { kind: 'cannot', what: 'gainLife', srcName: x.src.def.name });
    },
    GiveZoneHp: (x, e) => {
      // the picked zone (a spell's target zone, or NearestZone's) gets zone HP; all such effects add to ONE bar (Q10)
      const k = x.zone || (x.o && x.o.zone);
      if (k) giveZoneHp(x.s, k, e.n, x.src.def.name);
    },
    DamageZone: (x, e) => {
      const k = x.zone || (x.o && x.o.zone);
      if (k) damageZone(x.s, k, e.n, x.src.def.name, x.ev); // nothing happens to a zone without HP
    },
    Aura: () => {}, // passive, read by recalc()
    WinGame: (x, e) => {
      declareWinner(x.s, e.who === 'foe' ? x.foe : x.who, 'effect', x.ev);
    }, // the controller (who:'foe' = the opponent) wins; ignored when the game is already decided
    DrawUntil: (x, e) => OPS.Draw(x, { n: Math.max(0, e.n - x.s.piles[x.who].hand.length) }),
    NoDamage: x => {
      if (x.t && x.t.loc === 'board')
        addStatus(x.s, x.t, { kind: 'nodamage', expires: 'turnEnd', srcName: x.src.def.name });
      else if (x.o && x.o.tsid) {
        const u = x.s.stack.find(y => y.sid === x.o.tsid);
        if (u) addStatus(x.s, u, { kind: 'nodamage', expires: 'turnEnd', srcName: x.src.def.name });
      }
    },
    CancelAttack: x => {
      const s = x.s,
        foes = s.stack.filter(o => o.kind === 'attack' && o.controller !== x.who);
      if (foes.length > 1) return pickAttack(x, foes, { act: 'cancel' }); // Q41: several Attacks: the player chooses which one
      const id = x.t && x.t.iid,
        i = s.stack.map(o => o.kind === 'attack' && o.iid === id).lastIndexOf(true);
      if (i < 0) return;
      s.stack.splice(i, 1);
      x.ev.push({ t: 'AttackCancelled', iid: id });
    }, // removes the Attack object from the stack: no damage, its triggers stay
    SkipFoeCombat: (x, e) => {
      const s = x.s;
      if (e.pay) {
        if (s.life[x.who] - e.pay <= -1) return; // 0 life is still alive
        addStatus(s, PL(s, x.who), { kind: 'paid', amount: e.pay, srcName: x.src.def.name });
        syncLife(s, x.who);
        x.ev.push({ t: 'LifePaid', player: x.who, amount: e.pay });
      }
      addStatus(s, PL(s, x.foe), { kind: 'skipCombat', srcName: x.src.def.name });
    },
    SecondCombat: x => {
      const s = x.s,
        sk = live(PL(s, x.who)).find(y => y.kind === 'skipCombat');
      if (sk) {
        removeStatus(s, sk, 'used');
        return;
      }
      if (s.piles[x.foe].deck.length < 5) return; // the draw is a cost: no 5 cards, no second combat
      OPS.Draw({ ...x, who: x.foe }, { n: 5 });
      turnGo(s, 'extraCombat', x.ev); // a second combat phase: the turn is not ending, the "combat ended" window is over
      clearAttacked(s, 'new combat phase');
      placeAttackCounters(s, x.ev); // a new combat phase gives new attack counters
      x.ev.push({ t: 'AttackPhaseChanged', on: true });
      fire(s, x.ev, 'combat', null);
    },
    AddAttackDamage: (x, e) => {
      const w = e.whose || 'any',
        hit = x.s.stack.filter(
          o => o.kind === 'attack' && (w === 'any' || (w === 'mine') === (o.controller === x.who))
        );
      if (hit.length > 1) return pickAttack(x, hit, { act: 'boost', amount: e.amount }); // Q41: several matching Attacks: the player chooses
      if (hit.length) addAttackBonus(x.s, hit[0], e.amount, x.src.def.name, x.ev);
    }, // generic: adds damage to the matching Attack object (the one, or the chosen one)
    // the picked zone (targeting secretZone) secretly gains the card's trap e.trap (def.traps): js/sim/secrets.js
    SetTrap: (x, e) => {
      const k = x.o && x.o.pick;
      if (k && x.s.zones[k]) placeZoneSecret(x.s, x.who, x.src, k, e.trap || 0, x.ev);
    },
    // who 'player': the player who played the spell picks from their own pile... unless it was stolen (Betrayal: the stack object's `by`,
    // its owner, whose cards enter; the thief picks them)
    UpTo: (x, e) =>
      upToAsk(
        x.s,
        e.who === 'foe' ? x.foe : x.who,
        x.src,
        e.who === 'player' && x.o && x.o.by ? Object.assign({}, e, { pile: x.o.by }) : e,
        e.n,
        x.ev
      ),
    PlaceToken: (x, e) => {
      const s = x.s,
        def = x.src.def.tokens[e.token],
        f = Object.keys(s.slots).filter(k => k.startsWith(x.who + '|front|') && !s.slots[k] && !isUnusable(s, k)); // the controller picks the zone (front row only)
      if (!f.length) return;
      if (autoOne(s, x.who, f)) return makeToken(s, def, x.who, f[0], x.ev);
      ask(
        s,
        x.who,
        x.src,
        'place',
        f,
        null,
        x.src.def.name + ': click a front zone for the ' + def.name + ' token.',
        { token: e.token },
        x.ev
      );
    },
  };
  // Duplicate (permanent mode): `left` token copies of src (its def.tokens.duplicate) on free zones of its row, one pick at a time
  // (CH.place continues with dupLeft); a single free zone is filled by itself; no free zone = no more copies
  // the token copy Duplicate makes: the card as it is now (a gained Duplicate included: cards.js GRANTS), without Duplicate
  const dupDef = src => {
    const d = abDef(src);
    return (d.tokens && d.tokens.duplicate) || (src.def.tokens && src.def.tokens.duplicate) || null;
  };
  function dupAsk(s, who, src, left, ev) {
    const def = dupDef(src);
    while (def && left > 0 && !s.choice) {
      const row = def.type === 'creature' ? 'front' : 'back',
        f = Object.keys(s.slots).filter(k => k.startsWith(who + '|' + row + '|') && !s.slots[k] && !isUnusable(s, k));
      if (!f.length) return;
      if (!autoOne(s, who, f))
        return ask(
          s,
          who,
          src,
          'place',
          f,
          null,
          src.def.name + ': click a free zone for a token copy (' + left + ' left).',
          { token: 'duplicate', dupLeft: left - 1 },
          ev
        );
      makeToken(s, def, who, f[0], ev);
      left--;
    }
  }
  // Duplicate (spell mode): n token copies of the spell's stack object go on the stack above it: same targets, same HP and statuses
  // (modifications are kept), the card without Duplicate; a copy ceases to exist when it leaves the stack. The spell gone: nothing
  function dupSpell(s, who, src, n, ev) {
    const o = s.stack.find(q => q.kind === 'spell' && q.iid === src.iid),
      def = dupDef(src);
    if (!o || !def) return;
    for (let i = 0; i < n; i++) {
      const k = (s.tokN = (s.tokN || 0) + 1),
        t = {
          iid: 'tk-' + k,
          def,
          owner: src.owner,
          controller: src.controller,
          loc: 'stack',
          slot: null,
          token: true,
          statuses: JSON.parse(JSON.stringify(live(src).filter(st => st.kind !== 'grant' && st.kind !== 'revealed'))),
        };
      s.cards[t.iid] = t;
      s.stack.push(
        Object.assign(JSON.parse(JSON.stringify(o)), { sid: ++s.sid, iid: t.iid, controller: who, copy: true })
      );
      ev.push({ t: 'StackObjectCreated', iid: t.iid });
    }
    prGo(s, 'pushedByEffect');
  }
  OPS.Duplicate = (x, e) =>
    x.src.loc === 'stack' ? dupSpell(x.s, x.who, x.src, e.n || 1, x.ev) : dupAsk(x.s, x.who, x.src, e.n || 1, x.ev);
  // a card is secretly selected and secretly gains e.what (a grant: cards.js GRANTS). by 'foe': the spell's opponent picks among the cards
  // its cost revealed (from 'shown', still in the hand); by 'self': its controller picks among the opponent's hand (from 'foeHand')
  OPS.SecretGrant = (x, e) => {
    const s = x.s,
      picker = e.by === 'foe' ? x.foe : x.who,
      hand = s.piles[e.by === 'foe' ? x.who : x.foe].hand,
      ids = (e.from === 'shown' ? (x.o && x.o.shown) || [] : hand.map(c => c.iid)).filter(i =>
        hand.some(c => c.iid === i)
      );
    if (!ids.length) return;
    ask(
      s,
      picker,
      x.src,
      'secretgrant',
      ids,
      null,
      x.src.def.name + ': secretly select a card.',
      {
        secret: true,
        what: e.what,
        cands: ids,
      },
      x.ev
    );
  };
  // reveal the opponent's hand to the controller (each card stays revealed while in that hand)
  OPS.RevealFoeHand = x => {
    const L = x.s.piles[x.foe].hand;
    for (const c of L)
      if (!isRevealed(c, x.who))
        addStatus(x.s, c, { kind: 'revealed', to: x.who, zone: 'hand', srcName: x.src.def.name });
    x.ev.push({ t: 'HandRevealed', player: x.foe, to: x.who, iids: L.map(c => c.iid) });
  };
  return {
    exports: { OPS, dupAsk, dupDef },
    needs: [
      'autoOne',
      'countValue',
      'drawCards',
      'turnGo',
      'damageHp',
      'placeAttackCounters',
      'addAttackBonus',
      'cancelAttackObj',
      'ctl',
      'CH',
      'PL',
      'addStatus',
      'ask',
      'askCounters',
      'askDeck',
      'clearAttacked',
      'clearStatuses',
      'cloudMap',
      'cname',
      'colKeys',
      'dealDamage',
      'declareWinner',
      'declareAsk',
      'destroy',
      'fire',
      'foeCreatures',
      'freeSlots',
      'fusionStart',
      'has',
      'hasSt',
      'hitStack',
      'hurt',
      'isRevealed',
      'live',
      'makeToken',
      'pairStart',
      'pendingAtk',
      'recalc',
      'release',
      'removeStatus',
      'reorderStart',
      'runFx',
      'suspend',
      'syncLife',
      'upToAsk',
      'zoneDist',
      'allowed',
      'atkOf',
      'damageZone',
      'giveZoneHp',
      'isUnusable',
      'markUnusable',
      'placeZoneSecret',
      'placeCardSecret',
      'abDef',
      'prGo',
    ],
    link: () => {
      ({ autoOne } = K);
      ({ countValue, drawCards } = K);
      ({ turnGo } = K);
      ({ damageHp, placeAttackCounters } = K);
      ({ addAttackBonus, cancelAttackObj } = K);
      ({ ctl } = K);
      ({
        CH,
        PL,
        addStatus,
        ask,
        askCounters,
        askDeck,
        clearAttacked,
        clearStatuses,
        cloudMap,
        cname,
        colKeys,
        dealDamage,
        declareWinner,
        declareAsk,
        destroy,
        fire,
        foeCreatures,
        freeSlots,
        fusionStart,
        has,
        hasSt,
        hitStack,
        hurt,
        isRevealed,
        live,
        makeToken,
        pairStart,
        pendingAtk,
        recalc,
        release,
        removeStatus,
        reorderStart,
        runFx,
        suspend,
        syncLife,
        upToAsk,
        zoneDist,
      } = K);
      ({ allowed, damageZone, giveZoneHp, isUnusable, markUnusable } = K);
      ({ atkOf } = K);
      ({ placeCardSecret, placeZoneSecret, abDef, prGo } = K);
    },
  };
});

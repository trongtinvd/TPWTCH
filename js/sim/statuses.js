// statuses.js - statuses[]: the ordered modifier list and every fold over it (HP, ATK, life, damage)
Sim.def('statuses', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let byId; // util
  let lg, ownKey, ownerOf; // logs
  let recalc; // state
  // ---- STATUSES: ONE ordered list per card (c.statuses) and per player (s.players[p].statuses). Newest is applied last; HP / ATK / life are folds over the list.
  // A removed status stays in the list (removed:{why,turn,seq}) and is ignored by every fold. Optional fields: zone (where it lives, default 'board'; it is removed when the card leaves that zone unless keep:true),
  // req (re-checked by recalc; fails -> removed), link (seq of another status on the same card; removed when that one is), expires ('turnEnd').
  const stOf = o => o.statuses || (o.statuses = []);
  const live = o => stOf(o).filter(x => !x.removed);
  const addStatus = (s, o, st) => {
    st = Object.assign({ turn: s.turn, own: ownKey(s, o) }, st);
    st.seq = ++s.seq;
    st.removed = null;
    stOf(o).push(st);
    lg(s, o, { kind: 'status+', id: st.seq, sk: st.kind, text: describe(st).split(' \u00b7 turn ')[0] });
    return st;
  };
  const removeStatus = (s, st, why) => {
    if (st && !st.removed) {
      st.removed = { why, turn: s.turn, seq: ++s.seq };
      lg(s, ownerOf(s, st), { kind: 'status-', id: st.seq, sk: st.kind, why });
    }
  };
  const clearStatuses = (s, o, why) =>
    live(o).forEach(x => {
      if (!x.keep) removeStatus(s, x, why);
    });
  const hasSt = (o, kind, f) => !!o && live(o).some(x => x.kind === kind && (!f || f(x)));
  const abDef = c => {
    const d = live(c)
      .filter(x => x.kind === 'ability')
      .pop();
    return d ? byId[d.to] : c.def;
  }; // ability layer: the newest active 'ability' status decides; c.def is never edited
  const isRevealed = (c, p) => hasSt(c, 'revealed', x => x.to === p);
  const PL = (s, p) => s.players[p];
  const lifeOf = (s, p) =>
    live(PL(s, p)).reduce(
      (n, x) => n + (x.kind === 'life' ? x.amount : x.kind === 'damage' || x.kind === 'paid' ? -x.amount : 0),
      s.maxLife
    ); // fold of the player's list
  const syncLife = (s, p) => {
    s.life[p] = lifeOf(s, p);
  }; // s.life is a cache of the fold: never write it directly
  const dmgs = c => live(c).filter(x => x.kind === 'damage');
  const attackedIds = s =>
    Object.values(s.cards)
      .flatMap(c =>
        live(c)
          .filter(x => x.kind === 'attacked')
          .map(x => [x.seq, c.iid])
      )
      .sort((a, b) => a[0] - b[0])
      .map(x => x[1]);
  function describe(st) {
    const by = st.srcName ? ' from ' + st.srcName : '',
      when = ' \u00b7 turn ' + st.turn + ', #' + st.seq,
      sg = n => (n >= 0 ? '+' : '') + n;
    const t = {
      damage: () =>
        'Damage ' +
        st.amount +
        (st.orig != null && st.orig !== st.amount ? ' (was ' + st.orig + ')' : '') +
        by +
        ' \u00b7 ' +
        st.type,
      life: () => 'Life +' + st.amount + by,
      paid: () => 'Life paid ' + st.amount + ' for ' + st.srcName,
      mod: () => (st.srcName || 'Effect') + ': ' + sg(st.atk) + '/' + sg(st.hp) + ' while in range',
      atkMul: () => 'Power x' + st.n + by,
      shield: () =>
        (st.color === 'red'
          ? 'Red shield: cannot be targeted'
          : 'Blue shield: unaffected by spells and abilities that do not target it (attacks still hit)') + by,
      ability: () =>
        'Ability replaced: uses the abilities of ' + byId[st.to].name + ' (ends when that damage is removed)',
      nodamage: () => 'Damage is denied until the end of the turn' + by,
      revealed: () =>
        'Revealed to ' + st.to + ' while it stays in ' + (st.zone === 'extra' ? 'the extra deck' : 'hand'),
      mats: () =>
        'Summoned using ' + st.cards.map(m => m.name).join(', ') + (st.srcName ? ' (' + st.srcName + ')' : ''),
      vault: () => 'Exiled by it: ' + (st.name || st.card),
      extraPaid: () => 'Additional cost was paid',
      attacked: () => 'Restriction: already attacked',
      entered: () => 'Entered the board (#' + st.n + ')',
      nogain: () => 'Cannot gain life for the rest of the game' + by,
      skipCombat: () => 'Waiting: your next combat is skipped (pressing combat becomes End turn)' + by,
    }[st.kind];
    return (
      (t ? t() : st.kind) +
      when +
      (st.removed ? ' \u2014 removed: ' + st.removed.why + ' (turn ' + st.removed.turn + ')' : '')
    );
  }
  const statusLines = o => stOf(o).map(st => ({ text: describe(st), removed: !!st.removed, st }));
  const has = (c, k) => hasSt(c, 'shield', x => x.color === k); // shield counters: red = cannot be targeted, blue = unaffected by anything that does not target it
  const totalDamage = c => dmgs(c).reduce((n, d) => n + d.amount, 0);
  const hpOf = c =>
    live(c).reduce((n, x) => n + (x.kind === 'life' ? x.amount : x.kind === 'mod' ? x.hp : 0), c.def.hp); // fold: printed HP + life + modifiers
  const atkOf = c => {
    let b = c.def.atk;
    if (b == null) return b;
    for (const x of live(c)) b = x.kind === 'mod' ? b + x.atk : x.kind === 'atkMul' ? b * x.n : b;
    return Math.max(0, b);
  }; // fold in order: printed power, then every status oldest to newest
  function hurt(s, p, amount, source, type) {
    addStatus(s, PL(s, p), { kind: 'damage', amount, orig: amount, type, srcName: source });
    syncLife(s, p);
  } // player damage is a status, like card damage
  const clearAttacked = (s, why) =>
    Object.values(s.cards).forEach(c =>
      live(c)
        .filter(x => x.kind === 'attacked')
        .forEach(x => removeStatus(s, x, why))
    );
  return {
    exports: {
      PL,
      abDef,
      addStatus,
      atkOf,
      attackedIds,
      clearAttacked,
      clearStatuses,
      describe,
      dmgs,
      has,
      hasSt,
      hpOf,
      hurt,
      isRevealed,
      lifeOf,
      live,
      removeStatus,
      stOf,
      statusLines,
      syncLife,
      totalDamage,
    },
    needs: ['byId', 'lg', 'ownKey', 'ownerOf', 'recalc'],
    link: () => {
      ({ byId, lg, ownKey, ownerOf, recalc } = K);
    },
  };
});

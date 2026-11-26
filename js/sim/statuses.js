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
    if (st.expires && typeof st.expires === 'object') {
      // Q11: {turns:n, whose:'any'|'self'|'foe'}: it ends after n turns that count; 'self' / 'foe' are relative to its controller (by)
      st.expires = Object.assign({ turns: 1, whose: 'any' }, st.expires);
      st.expires.left = st.expires.turns;
      if (st.by === undefined) st.by = st.own === 'Player' || st.own === 'Opponent' ? st.own : o.controller || o.owner;
    }
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
  // Q8 / Q37: rule statuses. {kind:'cannot'|'can', what}: folded in list order, the later-entered one wins; allowed by default
  const allowed = (o, what) => {
    let ok = true;
    for (const x of live(o)) if (x.what === what) ok = x.kind === 'can' ? true : x.kind === 'cannot' ? false : ok;
    return ok;
  };
  // 'combatEnd' statuses (attack counters) end when a combat phase ends; every object with statuses is swept
  const expireStatuses = (s, when, why) => {
    for (const o of [
      ...Object.values(s.cards),
      PL(s, 'Player'),
      PL(s, 'Opponent'),
      ...Object.values(s.zones),
      ...s.stack,
    ])
      live(o)
        .filter(x => x.expires === when)
        .forEach(x => removeStatus(s, x, why));
  };
  // non-lethal damage. The NEWEST live status that changes HP decides: while it is non-lethal damage, HP at or below the death line
  // does not kill (a card, a zone bar). Any HP status entered later (damage, life, an HP modifier, zone HP) takes over and can kill.
  const changesHp = x =>
    x.kind === 'damage' ||
    x.kind === 'life' ||
    (x.kind === 'mod' && !!x.hp) ||
    x.kind === 'zonehp' ||
    x.kind === 'zonedmg';
  const nonLethalHold = o => {
    const L = live(o).filter(changesHp);
    return !!L.length && !!L[L.length - 1].nonLethal;
  };
  const dmgFlags = st => (st.nonLethal ? ' \u00b7 non-lethal' : '') + (st.temporary ? ' \u00b7 temporary' : '');
  const bonusOf = o => live(o).reduce((n, x) => n + (x.kind === 'bonus' ? x.amount : 0), 0); // damage added to an Attack: statuses on the Attack
  // end of a turn (ended = the player whose turn it was): does this status end now? 'turnEnd' = this turn; {turns, whose} counts only matching turns
  const expiresAtTurnEnd = (st, ended) => {
    const e = st.expires;
    if (e === 'turnEnd') return true;
    if (!e || typeof e !== 'object') return false;
    if (e.whose === 'self' ? ended !== st.by : e.whose === 'foe' ? ended === st.by : false) return false;
    return --e.left <= 0;
  };
  const abDef = c => {
    const d = live(c)
      .filter(x => x.kind === 'ability')
      .pop();
    return d ? byId[d.to] : c.def;
  }; // ability layer: the newest active 'ability' status decides; c.def is never edited
  // keyworded abilities belong to the EFFECTIVE ability set, so losing abilities (Avatar of Rabies) loses them too: a keyworded passive
  // (Flash: op Keyword) or a keyworded trigger / ability (Retaliate: kw on a trigger)
  const hasKw = (c, kw) => {
    if (!c) return false;
    const d = abDef(c);
    return (
      (d.passives || []).some(p => p.op === 'Keyword' && p.kw === kw) ||
      [...(d.triggers || []), ...(d.abilities || [])].some(a => a.kw === kw)
    );
  };
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
      sg = n => (n >= 0 ? '+' : '') + n,
      RULE = { gainLife: 'gain life', attack: 'attack' },
      ex =
        st.expires && typeof st.expires === 'object'
          ? ' \u00b7 ends after ' +
            st.expires.left +
            ' more ' +
            ({ any: '', self: 'own ', foe: 'opposing ' }[st.expires.whose] || '') +
            'turn(s)'
          : '';
    const t = {
      damage: () =>
        'Damage ' +
        st.amount +
        (st.orig != null && st.orig !== st.amount ? ' (was ' + st.orig + ')' : '') +
        by +
        ' \u00b7 ' +
        st.type +
        dmgFlags(st),
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
        'Revealed to ' +
        st.to +
        ' while it stays in ' +
        ({ extra: 'the extra deck', deck: 'the deck' }[st.zone] || 'hand'),
      mats: () =>
        'Summoned using ' + st.cards.map(m => m.name).join(', ') + (st.srcName ? ' (' + st.srcName + ')' : ''),
      vault: () => 'Exiled by it: ' + (st.name || st.card),
      extraPaid: () => 'Additional cost was paid',
      attacked: () => 'Restriction: already attacked',
      entered: () => 'Entered the board (#' + st.n + ')',
      cannot: () => 'Cannot ' + (RULE[st.what] || st.what) + by,
      can: () => 'Can ' + (RULE[st.what] || st.what) + by,
      bonus: () => 'Attack gets +' + st.amount + ' damage' + by,
      cloud: () => 'Covered by a black cloud' + by,
      unusable: () => 'Zone is unusable' + by,
      zoneSecret: () => 'Secret trap' + by + ' (only its placer sees it)',
      zonehp: () => 'Zone HP +' + st.amount + ' (one shared bar)' + by,
      zonedmg: () => 'Zone damage ' + st.amount + by + dmgFlags(st),
      attackCounter: () => 'Attack counter: attacking spends it; it ends with the combat phase',
      skipCombat: () => 'Waiting: your next combat is skipped (pressing combat becomes End turn)' + by,
    }[st.kind];
    return (
      (t ? t() : st.kind) +
      when +
      ex +
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
      allowed,
      atkOf,
      attackedIds,
      bonusOf,
      clearAttacked,
      clearStatuses,
      describe,
      dmgs,
      expireStatuses,
      expiresAtTurnEnd,
      nonLethalHold,
      has,
      hasKw,
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

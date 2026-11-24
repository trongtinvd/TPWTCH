// options.js - what ONE player may do right now, as plain data: their own legal plays (with the zones / columns they may pick),
// abilities, attackers, the pending choice's options. No card definition, no other card: the bot decides from this alone
// (js/game/bot.js), never from the state. Sim.accepts answers "would this command be accepted?" without changing the state,
// like a human trying a button.
Sim.def('options', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let ctl, other, isPerm, freeSlots, targetColumns, targetZones; // state, targeting
  let canPlay, canActivate, canAttack, abDef, hasAP; // rules, statuses, ap
  let dispatch; // dispatch
  const actor = s => (s.phase === 'play' ? (s.choice ? s.choice.player : s.priority) : null); // who must act now
  function playOption(s, c) {
    const d = c.def,
      perm = !!isPerm(c);
    return {
      iid: c.iid,
      foe: other(c.owner),
      perm,
      slots: perm ? freeSlots(s, c).slice() : [],
      colTarget: !!d.colTarget,
      cols: !perm && d.colTarget ? targetColumns(s, c).slice() : [],
      optionalTarget: !!d.optionalTarget,
      playerTarget: !!d.playerTarget,
      zoneTarget: !!d.zoneTarget,
      zones: !perm && d.zoneTarget ? targetZones(s, c).slice() : [],
    };
  }
  function optionsFor(s, p) {
    // {player, actor, turn} and, when p must act: choice (options) | mustPass | attackPhase + attackers | plays, abilities, hasAP, canBattle, deckSize
    const o = { player: p, actor: actor(s), turn: s.turn };
    if (o.actor !== p) return o;
    if (s.choice) {
      o.choice = structuredClone(s.choice.options);
      return o;
    }
    if (s.stack.length || s.respond || s.active !== p) {
      o.mustPass = true;
      return o;
    }
    const mine = Object.values(s.cards).filter(c => ctl(c) === p);
    o.attackPhase = !!s.attackPhase;
    if (s.attackPhase) {
      o.attackers = mine.filter(c => canAttack(s, c) === null).map(c => c.iid);
      return o;
    }
    o.plays = s.piles[p].hand.filter(c => canPlay(s, c) === null).map(c => playOption(s, c));
    o.abilities = [];
    for (const c of mine)
      if (['board', 'hand', 'gy', 'deck'].includes(c.loc))
        (abDef(c).abilities || []).forEach((a, i) => {
          if (canActivate(s, c, i) === null) o.abilities.push({ iid: c.iid, ab: i });
        });
    o.hasAP = !!hasAP(s, p);
    o.canBattle = mine.some(c => c.loc === 'board' && c.def.type === 'creature');
    o.deckSize = s.piles[p].deck.length;
    return o;
  }
  const accepts = (s, cmd) => {
    try {
      return !!dispatch(structuredClone(s), cmd).ok;
    } catch (e) {
      return false;
    }
  };
  return {
    exports: { actor, optionsFor, accepts },
    needs: [
      'abDef',
      'canActivate',
      'canAttack',
      'canPlay',
      'ctl',
      'dispatch',
      'freeSlots',
      'hasAP',
      'isPerm',
      'other',
      'targetColumns',
      'targetZones',
    ],
    link: () => {
      ({
        abDef,
        canActivate,
        canAttack,
        canPlay,
        ctl,
        dispatch,
        freeSlots,
        hasAP,
        isPerm,
        other,
        targetColumns,
        targetZones,
      } = K);
    },
  };
});

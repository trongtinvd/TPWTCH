// combat.js - damage, defender strike back, riders, Attack objects and strikes (Retaliate is a trigger: ops.js Retaliate)
Sim.def('combat', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let ctl;
  let expireStatuses, live, nonLethalHold, removeStatus;
  let other; // util
  let abDef, addStatus, allowed, atkOf, bonusOf, has, hasSt, hpOf, hurt, totalDamage; // statuses
  let destroy, recalc; // state
  let fire; // stack
  const RIDERS = {
    InheritAbilities: (s, src, tgt, ev, d) => {
      const id = abDef(src).id;
      if (tgt.loc === 'board' && d && tgt.def.id !== id) {
        addStatus(s, tgt, { kind: 'ability', to: id, link: d.seq, srcName: src.def.name });
        ev.push({ t: 'AbilitiesTransformed', iid: tgt.iid, from: id });
      }
    },
  }; // the rider adds an ability status linked to the damage status just dealt; the effect lives and dies with that status
  // the game option "Defender strike back" (s.cfg.strikeBack). A creature hit by an Attack deals damage equal to its power to
  // the attacking creature: combat damage (combat rules: blue shields do not stop it, 'damaged' triggers see it), from the defender,
  // to the attacker only (it never tramples), never answered by another strike back. Applied at once by the rule (no stack), BEFORE the
  // defender's own 'damaged' triggers (Shieldguard: the strike back first, then its Retaliate goes on the stack).
  const strikesBack = (s, tgt, attacker) =>
    !!(s.cfg && s.cfg.strikeBack) &&
    tgt.def.type === 'creature' &&
    !!attacker &&
    attacker.loc === 'board' &&
    attacker !== tgt;
  function dealDamage(s, src, tgt, amount, ev, type, targeted, mods) {
    // mods: {nonLethal, temporary}. Temporary damage expires at the end of the turn; non-lethal: see nonLethalHold
    // mods.attack: this is an Attack's damage (strike()), so the defender may strike back
    if (hasSt(tgt, 'nodamage')) {
      ev.push({ t: 'DamageDenied', target: tgt.iid, amount });
      return;
    }
    if (has(tgt, 'blue') && !targeted && (type || 'combat') !== 'combat') return; // blue shield: only effects that target it can touch it
    const d = addStatus(s, tgt, {
      kind: 'damage',
      amount,
      orig: amount,
      type: type || 'combat',
      source: src.iid,
      srcName: src.def.name,
      ...(mods && mods.nonLethal ? { nonLethal: true } : null),
      ...(mods && mods.temporary ? { temporary: true, expires: 'turnEnd' } : null),
      ...(mods && mods.strikeBack ? { strikeBack: true } : null),
    }); // damage is a status
    ev.push(
      Object.assign(
        { t: 'DamageDealt', source: src.iid, target: tgt.iid, amount, type: type || 'combat' },
        mods && mods.nonLethal ? { nonLethal: true } : null,
        mods && mods.temporary ? { temporary: true } : null,
        mods && mods.strikeBack ? { strikeBack: true } : null
      )
    );
    const rd = abDef(src).rider,
      abBefore = abDef(tgt).id;
    if (rd && RIDERS[rd.op]) RIDERS[rd.op](s, src, tgt, ev, d);
    // the damage and its rider are one event: a victim whose abilities this event replaced (Avatar of Rabies) triggers neither the
    // 'damaged' abilities it lost (Shieldguard's Retaliate) nor the ones it gained
    const pw = atkOf(tgt); // power before the victim may be destroyed
    if (mods && mods.attack && strikesBack(s, tgt, src) && pw > 0) {
      ev.push({ t: 'StrikeBack', source: tgt.iid, target: src.iid, amount: pw });
      dealDamage(s, tgt, src, pw, ev, 'combat', false, { strikeBack: true }); // to the attacker only: no trample, no strike back of its own
    }
    // every damage type fires 'damaged' (a trigger says which types it wants: Fx.trigger.damaged = combat only, Retaliate = combat
    // or effect). The trigger sees the damage (source, amount, type, the victim's power now): a trigger reads it when it resolves.
    if (abDef(tgt).id === abBefore)
      fire(s, ev, 'damaged', tgt, {
        type: type || 'combat',
        source: src.iid,
        amount,
        power: pw,
        spell: src.def.type === 'spell' ? ctl(src) : null, // the player behind a spell (Retaliate hits that player)
      }); // triggers see the victim before it is destroyed
    if (totalDamage(tgt) > hpOf(tgt) && !nonLethalHold(tgt)) destroy(s, tgt, ev, 'rule'); // lethal damage is a rule (Q45); non-lethal damage never kills
  }
  function canAttack(s, c) {
    // reason string, or null if legal
    if (!c || c.loc !== 'board' || c.def.type !== 'creature') return 'Only creatures on the board can attack';
    if (!allowed(c, 'attack')) return 'This creature cannot attack';
    if (!s.attackPhase) return 'Turn the attack phase on first';
    if (!hasSt(c, 'attackCounter'))
      return hasSt(c, 'attacked')
        ? 'Already attacked this turn'
        : ctl(c) !== s.active
          ? 'Not this player\u2019s turn'
          : 'No attack counter (spent, or it entered after combat started)'; // attacking spends an attack counter
    if (ctl(c) !== s.active) return 'Not this player\u2019s turn';
    if (s.stack.length) return 'Stack is not empty';
    if (s.respond) return 'Waiting for the response window';
    return null;
  }
  function strike(s, c, ev, o) {
    // damage flows down the attacker's CURRENT column
    const at = (o && o.slotAt && c.loc !== 'board' ? o.slotAt : c.slot).split('|'),
      col = at[2],
      foe = other(ctl(c));
    /* at: where it stood when it struck (it may die mid-strike, e.g. to a defender's strike back) */ let left =
      (c.loc === 'board' ? atkOf(c) : 0) + (o ? bonusOf(o) : 0); // the attacker's power counts only while it is on the board; damage added to the Attack itself always counts. Damage goes toward the controller's opponent; a card standing on the foe's side skips itself

    for (const row of ['front', 'back']) {
      if (at[0] === foe && (row === 'front' || at[1] === 'back')) continue; // an attacker standing on the foe's side only hits what lies beyond it, never backward
      const id = s.slots[foe + '|' + row + '|' + col];
      if (!id || left <= 0) continue;
      if (id === c.iid) continue; // every card on the foe's side of the column absorbs damage, whoever controls it   // never absorbed by the attacker's own cards (e.g. your own Vines standing in that column)
      const t = s.cards[id],
        remaining = Math.max(0, hpOf(t) - totalDamage(t)); // a card already at 0 or below (held by non-lethal damage) absorbs nothing
      dealDamage(s, c, t, left, ev, 'combat', false, { attack: true });
      left = Math.max(0, left - remaining);
    }
    if (left > 0) {
      hurt(s, foe, left, c.def.name, 'combat');
      ev.push({ t: 'PlayerDamaged', player: foe, amount: left, combat: true, source: c.iid });
    }
  }
  function resolveAttack(s, o, ev) {
    const c = s.cards[o.iid];
    if (c.loc === 'board') o.slotAt = c.slot;
    if (o.slotAt) strike(s, c, ev, o);
    recalc(s, ev);
  }
  function declareAttack(s, c, ev, extra) {
    // an attack is an object on the stack: it is NOT a snapshot of the attacker, it reads the attacker (if still on the board) when it resolves
    if (c.loc !== 'board' || c.def.type !== 'creature') return;
    const o = {
      sid: ++s.sid,
      kind: 'attack',
      iid: c.iid,
      src: c.iid,
      controller: ctl(c),
      hp: null,
      name: 'Attack: ' + c.def.name,
      slotAt: c.slot,
      statuses: [], // damage added to this Attack is a bonus status on it
    };
    s.stack.push(o);
    s.passes = 0;
    ev.push({ t: 'CreatureAttackDeclared', iid: c.iid, col: +c.slot.split('|')[2], extra: !!extra });
    ev.push({ t: 'StackObjectCreated', iid: c.iid, attack: true });
    fire(s, ev, 'attack', c); // its triggers go ABOVE the Attack: separate objects, resolved (and answered) independently
    s.priority = other(ctl(c)); // the defender answers first
  }
  function addAttackBonus(s, o, amount, srcName, ev) {
    addStatus(s, o, { kind: 'bonus', amount, srcName }); // damage added to an Attack is a status on it
    ev.push({ t: 'AttackBoosted', sid: o.sid, amount });
  }
  function cancelAttackObj(s, o, ev) {
    const i = s.stack.indexOf(o);
    if (i < 0) return;
    s.stack.splice(i, 1);
    ev.push({ t: 'AttackCancelled', iid: o.iid });
  }
  const extraAttack = (s, c, ev) => declareAttack(s, c, ev, true);
  // attack counters. When a combat phase starts, each creature the turn player controls gets one; an Attack spends one;
  // every counter ends with the combat phase (expires:'combatEnd'). Extra attacks granted by effects (Shark, Widow Maker) need none.
  function placeAttackCounters(s, ev) {
    let n = 0;
    for (const c of Object.values(s.cards))
      if (c.loc === 'board' && c.def.type === 'creature' && ctl(c) === s.active) {
        addStatus(s, c, { kind: 'attackCounter', expires: 'combatEnd', srcName: 'combat' });
        n++;
      }
    if (ev) ev.push({ t: 'AttackCountersPlaced', player: s.active, n });
  }
  function spendAttackCounter(s, c, why) {
    const k = live(c).find(x => x.kind === 'attackCounter');
    if (k) removeStatus(s, k, why);
    return !!k;
  }
  const endCombatStatuses = s => expireStatuses(s, 'combatEnd', 'combat ended');
  const enterCombat = (s, ev) => {
    s.attackPhase = true;
    placeAttackCounters(s, ev);
  }; // a combat phase starts (also the tests' shortcut for a hand-built state)
  return {
    exports: {
      RIDERS,
      addAttackBonus,
      cancelAttackObj,
      canAttack,
      dealDamage,
      declareAttack,
      endCombatStatuses,
      enterCombat,
      extraAttack,
      placeAttackCounters,
      resolveAttack,
      strikesBack,
      spendAttackCounter,
      strike,
    },
    needs: [
      'expireStatuses',
      'live',
      'nonLethalHold',
      'removeStatus',
      'ctl',
      'allowed',
      'bonusOf',
      'abDef',
      'addStatus',
      'atkOf',
      'destroy',
      'fire',
      'has',
      'hasSt',
      'hpOf',
      'hurt',
      'other',
      'recalc',
      'totalDamage',
    ],
    link: () => {
      ({ expireStatuses, live, nonLethalHold, removeStatus } = K);
      ({ ctl } = K);
      ({ allowed, bonusOf } = K);
      ({ abDef, addStatus, atkOf, destroy, fire, has, hasSt, hpOf, hurt, other, recalc, totalDamage } = K);
    },
  };
});

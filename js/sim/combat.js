// combat.js - damage, retaliate, riders, Attack objects and strikes
Sim.def('combat', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let ctl; // added by Patch3
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
  function retaliate(s, from, pw, src, ev) {
    if (pw <= 0) return;
    if (src.def.type === 'spell') {
      hurt(s, ctl(src), pw, from.def.name, 'retaliate');
      ev.push({ t: 'PlayerDamaged', player: ctl(src), amount: pw });
    } else if (src.loc === 'board') dealDamage(s, from, src, pw, ev, 'retaliate');
  } // Retaliate: the source (creature, or the spell's controller) takes damage equal to the retaliator's power; retaliation never retaliates
  function dealDamage(s, src, tgt, amount, ev, type, targeted) {
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
    }); // damage is a status
    ev.push({ t: 'DamageDealt', source: src.iid, target: tgt.iid, amount, type: type || 'combat' });
    if ((type || 'combat') === 'combat') fire(s, ev, 'damaged', tgt); // triggers see the victim before it is destroyed
    const rd = abDef(src).rider;
    if (rd && RIDERS[rd.op]) RIDERS[rd.op](s, src, tgt, ev, d);
    const pw = atkOf(tgt);
    if (totalDamage(tgt) > hpOf(tgt)) destroy(s, tgt, ev, 'rule'); // lethal damage is a rule (Q45)
    if (tgt.def.retaliate && type !== 'retaliate') retaliate(s, tgt, pw, src, ev);
  }
  function canAttack(s, c) {
    // reason string, or null if legal
    if (!c || c.loc !== 'board' || c.def.type !== 'creature') return 'Only creatures on the board can attack';
    if (!allowed(c, 'attack')) return 'This creature cannot attack';
    if (!s.attackPhase) return 'Turn the attack phase on first';
    if (hasSt(c, 'attacked')) return 'Already attacked this turn';
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
    /* at: where it stood when it struck (it may die mid-strike, e.g. to Retaliate) */ let left =
      (c.loc === 'board' ? atkOf(c) : 0) + (o ? bonusOf(o) : 0); // the attacker's power counts only while it is on the board; damage added to the Attack itself always counts. Damage goes toward the controller's opponent; a card standing on the foe's side skips itself

    for (const row of ['front', 'back']) {
      if (at[0] === foe && (row === 'front' || at[1] === 'back')) continue; // an attacker standing on the foe's side only hits what lies beyond it, never backward
      const id = s.slots[foe + '|' + row + '|' + col];
      if (!id || left <= 0) continue;
      if (id === c.iid) continue; // every card on the foe's side of the column absorbs damage, whoever controls it   // never absorbed by the attacker's own cards (e.g. your own Vines standing in that column)
      const t = s.cards[id],
        remaining = hpOf(t) - totalDamage(t);
      dealDamage(s, c, t, left, ev);
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
  return {
    exports: { RIDERS, addAttackBonus, cancelAttackObj, canAttack, dealDamage, declareAttack, extraAttack, resolveAttack, retaliate, strike },
    needs: ['ctl', 
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
      ({ ctl } = K);
      ({ allowed, bonusOf } = K);
      ({ abDef, addStatus, atkOf, destroy, fire, has, hasSt, hpOf, hurt, other, recalc, totalDamage } = K);
    },
  };
});

// cards.js - Effect API (Fx) and card definitions
// ---- Placeholder cards -------------------------------------------------
const themed = typeof cssStr === 'function' ? cssStr : (n, d) => d; // colours come from css/theme.css in the browser; the headless tests use the defaults
const TYPES = {
  creature: { label: 'Creature', color: themed('--type-creature', '#3f7fd8') },
  enchantment: { label: 'Enchantment', color: themed('--type-enchantment', '#3fa66a') },
  spell: { label: 'Spell', color: themed('--type-spell', '#d4524f') },
};
TYPES.ability = { label: 'Ability', color: themed('--type-ability', '#b8892b') };
const SLOW_COLOR = themed('--type-slow', '#8e5bd0'); // Slow spells are purple
const EXTRA_COLOR = themed('--type-extra', '#a63fd0'); // extra deck creatures are purple
const cardColor = def =>
  def.extra ? EXTRA_COLOR : def.type === 'spell' && def.timing === 'Slow' ? SLOW_COLOR : TYPES[def.type].color;
// ---- Card shapes: defaults for type / timing / speed, so a card states only what is special about it.
// A spell may give `say` instead of `text`: the text becomes "<Timing>. <say> (Stack HP n)" (the "(Stack HP n)" part is left out at 0 HP).
const spellDef = (timing, id, name, hp, rest = {}) => {
  const { say, ...def } = rest;
  return Object.assign(
    { id, name, type: 'spell', timing, hp },
    say == null ? {} : { text: timing + '. ' + say + (hp ? ' (Stack HP ' + hp + ')' : '') },
    def
  );
};
// ---- Card text is DERIVED from the card's abilities. Every trigger, activated ability, passive and rider carries its own `text`
// (withText); `kw` is the keyword line (Flash, Retaliate...); `body` is the text of a spell / placeholder (its own `text` as authored).
// textParts(def) lists the parts in display order; def.text is those parts joined. The inspector greys / crosses out / highlights single parts.
const withText = (text, o) => Object.assign(o, { text });
function textParts(def) {
  const P = [],
    add = (list, i, o) => o && o.text && P.push({ key: list + ':' + i, list, i, text: o.text });
  if (def.kw) P.push({ key: 'kw', list: 'kw', i: 0, text: def.kw });
  if (def.body) P.push({ key: 'body', list: 'body', i: 0, text: def.body });
  if ((def.conditions || []).length)
    P.push({
      key: 'conditions',
      list: 'conditions',
      i: 0,
      text: 'Conditions: ' + def.conditions.map(o => o.text).join('; ') + '.',
    });
  if ((def.materials || []).length)
    P.push({
      key: 'materials',
      list: 'materials',
      i: 0,
      text: 'Materials: ' + def.materials.map(o => o.text).join(', ') + '.',
    });
  (def.passives || []).forEach((o, i) => add('passives', i, o));
  (def.triggers || []).forEach((o, i) => add('triggers', i, o));
  if (def.rider && def.rider.text) P.push({ key: 'rider', list: 'rider', i: 0, text: def.rider.text });
  (def.abilities || []).forEach((o, i) => add('abilities', i, o));
  if (!P.length && def.text) P.push({ key: 'body', list: 'body', i: 0, text: def.text }); // fixtures and tokens: plain text only
  return P;
}
// =====================================================================
// EFFECT API (content side). Cards may ONLY use these builders; each returns plain
// data naming an operation the Sim publishes (see Sim.API). Mix and match freely.
// =====================================================================
const Fx = {
  // effects (run when a spell/ability resolves)
  dealDamage: (to, amount) => ({ op: 'DealDamage', to, amount }), // to: 'player' | 'target'
  gainLife: (amount, to) => ({ op: 'GainLife', amount, to }), // puts life counters on the controller (default) or on the target card
  draw: (n, who) => ({ op: 'Draw', n, who }),
  damageStack: amount => ({ op: 'DamageStack', amount }),
  sacrificeSelf: () => ({ op: 'SacrificeSelf' }), // also usable as a cost
  repeat: (n, ...effects) => ({ op: 'Repeat', n, effects }), // composition: run effects n times
  // costs (paid on activation)
  payLife: n => ({ op: 'PayLife', n }),
  spendAP: () => ({ op: 'SpendAP' }), // cost: spend one action point (usable on the opponent's turn too, when a Fast ability asks for it)
  exileFromGY: n => ({ op: 'ExileFromGY', n }),
  exileSelf: () => ({ op: 'ExileSelf' }), // cost: exile this card from the graveyard
  shiftAdjacent: () => ({ op: 'ShiftAdjacent' }), // effect: controller may move this card to an adjacent empty column
  damageAnother: amount => ({ op: 'DamageAnother', amount }), // effect: controller picks another creature; it takes `amount` effect damage
  removeDamage: n => ({ op: 'RemoveDamage', n }), // effect: remove n damage points from the target; controller picks which instances
  mill: n => ({ op: 'Mill', n }), // effect: target player puts n cards from the top of their deck into the GY
  fetch: card => ({ op: 'FetchFromDeck', card }), // effect: controller adds the named card from their deck to their hand
  doublePower: () => ({ op: 'DoublePower' }), // effect: this card's power x2 (Base layer, lasts while on the field)
  nearestZone: skip => ({ op: 'NearestZone', skip }), // effect: pick the closest zone to this card, skipping zones occupied by 'self' / a card id
  destroyOnZone: () => ({ op: 'DestroyOnZone' }), // effect: destroy whatever stands on the picked zone
  createToken: token => ({ op: 'CreateToken', token }), // effect: create def.tokens[token] on the picked zone, under the controller
  trigger: {
    // triggered abilities: go on the stack when the event happens
    enter: (...effects) => ({ on: 'enter', effects }), // when this card enters the field
    combat: (...effects) => ({ on: 'combat', effects }), // beginning of its controller's combat step
    combatEnd: (...effects) => ({ on: 'combatEnd', effects }), // after its controller's FIRST combat phase of the turn ends (use cond:'firstCombat')
    damaged: (...effects) => ({ on: 'damaged', effects }), // this card takes combat damage
    turnStart: (...effects) => ({ on: 'turnStart', effects }), // start of its controller's turn
    attack: (by, ...effects) => ({ on: 'attack', by, effects }), // by: 'self' and/or 'foe' (creature controlled by this card's opponent)
    foeEnter: (...effects) => ({ on: 'enter', by: ['foe'], effects }), // when a card the opponent controls enters (add cond:'foeAdjacent' to ask for a neighbour)
  },
  // requirements (strings) and targets (strings)
  req: {
    front: 'front',
    hurt: 'hurt',
    target: 'target',
    stack: 'stack',
    foeAttacking: 'foeAttacking',
    attackOnStack: 'attackOnStack',
    fusionOK: 'fusionOK', // the card's Fusion effect has an extra deck creature it can summon
    exInGY: 'exInGY', // an extra deck creature is in your graveyard
  },
  target: { opposingFront: 'opposingFront', attacker: 'attacker' },
  targeting: { adjacentPair: 'adjacentPair' }, // trigger field: what it targets when it is put on the stack (the cost / targeting part: condition : cost / targeting ; effect)
  zoneTarget: { anyPermanent: 'anyPermanent', anyCreature: 'anyCreature' }, // spell target: a zone with a card (or a cloud) on it, chosen when the spell is played
  playerTarget: true, // spell flag: a player can be targeted (click a life bar)
  rider: { inheritAbilities: () => ({ op: 'InheritAbilities' }) }, // damage this card deals: the victim loses its abilities and gains this card's.
  colTarget: { full: 'fullColumn' }, // spell target: a column (chosen when the spell is played)
  obscure: () => ({ op: 'Obscure' }), // passive: a black cloud covers each of the controller's other zones
  exileColumn: () => ({ op: 'ExileColumn' }), // effect: exile every card on the targeted column
  makeColumnUnusable: () => ({ op: 'MakeColumnUnusable' }), // effect: the targeted column's four zones become unusable for the rest of the game
  giveZoneHp: n => ({ op: 'GiveZoneHp', n }), // effect: the picked zone gets n zone HP (off until an effect gives it; every such effect feeds ONE shared bar)
  damageZone: n => ({ op: 'DamageZone', n }), // effect: damage the picked zone's HP bar; used up = its contents are exiled and the zone becomes unusable
  returnToHand: () => ({ op: 'ReturnToHand' }), // effect: this spell goes to its owner's hand instead of the graveyard
  modes: (...modes) => ({ op: 'ChooseMode', modes }), // controller picks one mode whose [min,max] foe-creature range fits
  mode: (name, min, max, ...effects) => ({ name, min, max, effects }),
  pickCard: (from, then, amount) => ({ op: 'PickCard', from, then, amount }), // from: foeHand | foeBoard | anyTarget | myCreatures; then: toGY | toHand | damage | summon
  destroyAll: () => ({ op: 'DestroyAll' }),
  drawPerFoeCreature: () => ({ op: 'DrawPerFoeCreature' }),
  vaultFromDeck: n => ({ op: 'VaultFromDeck', n }),
  revealVault: () => ({ op: 'RevealVault' }),
  swapIn: () => ({ op: 'SwapIn' }),
  shieldAll: color => ({ op: 'ShieldAll', color }),
  noLifeGain: () => ({ op: 'NoLifeGain' }),
  winGame: who => ({ op: 'WinGame', who }), // effect: the controller (who:'foe' = the opponent) wins the game
  aura: (who, atk, hp) => ({ op: 'Aura', who, atk, hp }), // passive: own/foe cards in this card's column and the adjacent columns get +atk/+hp (derived, never stored)
  drawUntil: n => ({ op: 'DrawUntil', n }),
  addAttackDamage: (amount, whose) => ({ op: 'AddAttackDamage', amount, whose }), // effect: adds damage to the topmost Attack object on the stack (whose: 'mine' | 'foe' | 'any')
  noDamage: () => ({ op: 'NoDamage' }), // target creature / stack spell: damage is denied until the end of this turn
  cancelAttack: () => ({ op: 'CancelAttack' }),
  skipFoeCombat: pay => ({ op: 'SkipFoeCombat', pay }),
  secondCombat: () => ({ op: 'SecondCombat' }),
  upTo: (who, from, then, n, types) => ({ op: 'UpTo', who, from, then, n, types }), // who: me|foe; from: gy|hand; then: toHand|play
  placeToken: token => ({ op: 'PlaceToken', token }), // effect: the controller picks a free front zone and puts the token there
  // extra deck: `materials` and `conditions` are plain data on the creature; they do nothing by themselves, Fusion effects (and other cards) read them
  mat: (type, n, same) => {
    const noun = type === 'any' ? 'card' : type,
      art = /^[aeiou]/.test(noun) ? 'an ' : 'a ';
    return {
      type,
      n,
      same,
      text:
        (n > 1 ? n + ' ' + noun + 's' : art + noun) +
        (same ? ' with the same ' + same.map(k => (k === 'atk' ? 'power' : 'HP')).join(' or the same ') : ''),
    }; // same: the cards share at least one of these stats ('atk' | 'hp')
  },
  exCond: {
    lostLife: () => ({ op: 'LostLife', text: 'a player has lost life' }),
    bothDrew: n => ({ op: 'BothDrewMoreThan', n, text: 'both players have drawn more than ' + n + ' cards this game' }),
  },
  fusion: o => ({ op: 'Fusion', ...o }), // effect: reveal an extra deck creature (pick: conditions | fusable | any), choose its materials among `from` zones, pay them (pay: gy | exile | hand), summon it (summon); cond: must | ignoreHB (ignored when only hand + field cards are used) | none
  selfToHand: () => ({ op: 'SelfToHand' }), // effect: this card goes from the deck or the GY to its owner's hand
  sendAdjacentPair: () => ({ op: 'SendAdjacentPair' }), // effect: target two adjacent cards the opponent controls; THEY send one of them to the GY
  reorderTop: (who, n) => ({ op: 'ReorderTop', who, n }), // effect: look at the top n cards of a deck (who: me | foe) and put them back in the order you wish
  declareName: () => ({ op: 'DeclareName' }), // effect: declare a card name, look at the foe's top card, you may play it if it matches, and repeat
  // card shapes (see spellDef above)
  exCreature: (id, name, atk, hp, rest) => ({ id, name, type: 'creature', extra: true, atk, hp, ...rest }), // an extra deck creature (purple): lives in the extra deck, enters the front row when summoned
  creature: (id, name, atk, hp, rest) => ({ id, name, type: 'creature', atk, hp, ...rest }),
  enchantment: (id, name, hp, rest) => ({ id, name, type: 'enchantment', hp, ...rest }), // any non-creature permanent
  quick: (id, name, hp, rest) => spellDef('Quick', id, name, hp, rest),
  slow: (id, name, hp, rest) => spellDef('Slow', id, name, hp, rest),
  fastAbility: (name, rest) => ({ name, speed: 'Fast', ...rest }), // activated ability; rest: text, zone, req, cost, target, hp, effects
  slowAbility: (name, rest) => ({ name, speed: 'Slow', ...rest }),
};
const Cards = {
  list: [],
  add(factory) {
    const d = factory(Fx);
    if (d.body === undefined && d.text !== undefined) d.body = d.text; // authored text of a spell / placeholder: the part that is not an ability
    d.text = textParts(d)
      .map(x => x.text)
      .join(' '); // the card text is DERIVED from its abilities
    this.list.push(d);
  },
};
const FIXTURES = []; // ability-less cards kept ONLY for headless tests; not part of the game's card pool
const PHC = 'Placeholder creature. No ability yet.',
  PHE = 'Placeholder enchantment. No effect yet.',
  PHS = 'Placeholder Slow spell. No effect yet.';
FIXTURES.push(
  Fx.creature('soldier', 'Soldier', 2, 3, { text: PHC }),
  Fx.creature('knight', 'Knight', 4, 5, { text: PHC }),
  Fx.creature('giant', 'Giant', 6, 8, { text: PHC }),
  Fx.enchantment('barrier', 'Barrier', 2, { text: PHE }),
  Fx.enchantment('aura', 'Aura', 6, { text: PHE }),
  Fx.creature('guard', 'Guard', 1, 6, { text: PHC }),
  Fx.creature('wolf', 'Wolf', 3, 3, { text: PHC }),
  Fx.enchantment('banner', 'Banner', 3, { text: PHE }),
  Fx.enchantment('trap', 'Trap', 1, { text: PHE }),
  Fx.quick('rage', 'Rage', 2, {
    req: ['attackOnStack'],
    text: 'Test Quick spell: the topmost Attack on the stack deals 4 more damage.',
    effects: [Fx.addAttackDamage(4)],
  }),
  Fx.quick('mend', 'Mend', 4, { text: 'Placeholder Quick spell. No effect yet.' }),
  Fx.slow('fireball', 'Fireball', 6, { text: PHS }),
  Fx.slow('rally', 'Rally', 1, { text: PHS }),
  Fx.slow('blast', 'Blast', 5, { text: 'Placeholder Slow spell: only when the stack is empty. No effect yet.' })
);
// ---- The card pool. Each card is an independent module: a factory that receives the API and returns its definition.
// Order matters: it is the order of the 'Full Pool' deck.
Cards.add(Fx =>
  Fx.enchantment('ward', 'Ward', 4, {
    abilities: [
      Fx.fastAbility('Restore', {
        text: 'Fast. You have lost life: sacrifice this card, then gain 3 life. (Stack HP 2)',
        req: [Fx.req.hurt],
        hp: 2,
        effects: [Fx.gainLife(3), Fx.sacrificeSelf()],
      }),
    ],
  })
);
Cards.add(Fx => Fx.quick('heal', 'Heal', 3, { text: 'Quick. Gain 3 life.', effects: [Fx.gainLife(3)] }));
Cards.add(Fx =>
  Fx.quick('zap', 'Zap', 0, {
    text: 'Quick, 0 HP (still resolves). Deal 1 damage to the opponent.',
    effects: [Fx.dealDamage('player', 1)],
  })
);
Cards.add(Fx =>
  Fx.creature('archer', 'Archer', 3, 2, {
    abilities: [
      Fx.slowAbility('Volley', {
        text: 'Slow. Front row: pay 1 life; deal 2 damage to the opponent. (Stack HP 1)',
        req: [Fx.req.front],
        cost: [Fx.payLife(1)],
        hp: 1,
        effects: [Fx.dealDamage('player', 2)],
      }),
    ],
  })
);
Cards.add(Fx =>
  Fx.creature('scout', 'Scout', 1, 1, {
    abilities: [
      Fx.fastAbility('Ambush', {
        text: 'Fast. A creature faces this: sacrifice this card; deal 3 damage to that creature. (Stack HP 0)',
        req: [Fx.req.target],
        cost: [Fx.sacrificeSelf()],
        target: Fx.target.opposingFront,
        hp: 0,
        effects: [Fx.dealDamage('target', 3)],
      }),
    ],
  })
);
Cards.add(Fx =>
  Fx.enchantment('charm', 'Charm', 5, {
    abilities: [
      Fx.slowAbility('Recall', {
        text: 'Slow. Exile your oldest GY card; draw 1. (Stack HP 1)',
        cost: [Fx.exileFromGY(1)],
        hp: 1,
        effects: [Fx.draw(1)],
      }),
    ],
  })
);
Cards.add(Fx =>
  Fx.quick('infinitywall', 'Infinity Wall', 6, {
    colTarget: Fx.colTarget.full,
    say: 'Target a fully filled column: exile every card on it. That column becomes unusable for the rest of the game. Return this card to your hand.',
    effects: [Fx.exileColumn(), Fx.makeColumnUnusable(), Fx.returnToHand()],
  })
);
Cards.add(Fx =>
  Fx.quick('bolt', 'Bolt', 2, {
    req: [Fx.req.stack],
    text: 'Quick. Deal 3 damage to the stack object beneath it (countered at HP -1 or lower).',
    effects: [Fx.damageStack(3)],
  })
);
Cards.add(Fx =>
  Fx.creature('hummingbird', 'Red Hummingbird', 2, 1, {
    triggers: [
      withText('When this enters: draw a card.', Fx.trigger.enter(Fx.draw(1))),
      withText(
        'When this card or an opponent\u2019s creature attacks: you may shift this card to an adjacent empty column.',
        Fx.trigger.attack(['self', 'foe'], Fx.shiftAdjacent())
      ),
    ],
    abilities: [
      Fx.fastAbility('Feather Balm', {
        text: 'Fast, from your GY: exile this card; gain 3 life. (Stack HP 1)',
        zone: 'gy',
        req: [Fx.req.hurt],
        cost: [Fx.exileSelf()],
        hp: 1,
        effects: [Fx.gainLife(3)],
      }),
    ],
  })
);
Cards.add(Fx =>
  Fx.creature('kingeye', 'King Eye', 6, 10, {
    passives: [
      withText(
        'Passive. A black cloud covers each of your other zones: your opponent cannot see those zones or the cards on them. Abilities of cards under a cloud appear to come from King Eye. A cloud is a legal target for anything that targets a card or zone there; the effect passes to what is underneath, and with nothing legal underneath it fizzles (nothing is revealed).',
        Fx.obscure()
      ),
    ],
  })
);
Cards.add(Fx => {
  const spread = Fx.repeat(4, Fx.nearestZone(['self', 'vine-token']), Fx.destroyOnZone(), Fx.createToken('vine'));
  return Fx.creature('vine', 'The Vine', 1, 1, {
    tokens: { vine: Fx.creature('vine-token', 'Vine', 1, 1, { text: 'Token. Vanilla 1/1.' }) },
    triggers: [
      withText(
        'When this enters: 4 times, pick the closest zone (any row, back-row zones included) not occupied by this card or a Vine token, destroy the card there, and create a Vine token (1/1) on it, even in a zone a creature cannot normally enter.',
        Fx.trigger.enter(spread)
      ),
      withText('At the start of your turn: do the same.', Fx.trigger.turnStart(spread)),
    ],
  });
});
Cards.add(Fx =>
  Fx.creature('avatar', 'Avatar of Rabies', 3, 7, {
    triggers: [
      withText(
        'Whenever a creature attacks: you may shift this card to an adjacent empty column.',
        Fx.trigger.attack(['any'], Fx.shiftAdjacent())
      ),
      withText(
        'Whenever this card takes combat damage: deal 1 damage to another creature.',
        Fx.trigger.damaged(Fx.damageAnother(1))
      ),
    ],
    rider: withText(
      'Damage dealt by this card: that creature loses all its original abilities and gains the abilities of Avatar of Rabies.',
      Fx.rider.inheritAbilities()
    ),
  })
);
Cards.add(Fx =>
  Fx.quick('bandages', 'Throwing Bandages', 10, {
    zoneTarget: Fx.zoneTarget.anyPermanent,
    say: 'Target a permanent: remove 7 damage counters from it (7 points, split across its damage instances as you choose).',
    effects: [Fx.removeDamage(7)],
  })
);
Cards.add(Fx =>
  Fx.slow('superbolt', 'Superbolt', 3, {
    zoneTarget: Fx.zoneTarget.anyPermanent,
    playerTarget: Fx.playerTarget,
    say: 'Deal 20 damage to any target (a permanent or a player).',
    effects: [Fx.dealDamage('target', 20)],
  })
);
Cards.add(Fx =>
  Fx.slow('grainfall', 'GrainFall', 2, {
    playerTarget: Fx.playerTarget,
    say: 'Target player mills ten cards.',
    effects: [Fx.mill(10)],
  })
);
Cards.add(Fx =>
  Fx.creature('blackhawk', 'Black Hawk', 1, 0, {
    triggers: [
      withText(
        'At the beginning of your combat step: double this card\u2019s power 5 times.',
        Fx.trigger.combat(Fx.repeat(5, Fx.doublePower()))
      ),
    ],
  })
);
Cards.add(Fx =>
  Fx.creature('boltmaster', 'Bolt Master', 2, 3, {
    triggers: [
      withText(
        'When this enters: add a Superbolt from your deck to your hand.',
        Fx.trigger.enter(Fx.fetch('superbolt'))
      ),
    ],
  })
);
Cards.add(Fx =>
  Fx.enchantment('heavensun', 'Heaven and Sun', 5, {
    triggers: [
      withText(
        'When this enters: choose 5 cards from your deck and exile them (stack HP 7).',
        Object.assign(Fx.trigger.enter(Fx.vaultFromDeck(5)), { hp: 7 })
      ),
      withText(
        'At the start of your turn: your opponent picks one of those exiled cards; put it into your hand.',
        Fx.trigger.turnStart(Fx.revealVault())
      ),
    ],
  })
);
Cards.add(Fx =>
  Fx.creature('parasite', 'Creeping Parasite', 0, 0, {
    flash: true,
    kw: 'Flash (play it as a Quick spell; it does not spend an action point).',
    triggers: [
      withText(
        'When this enters, choose one effect unlocked by the number of creatures your opponent controls. 0: look at their hand and send a card to the GY. 1+: 4 damage to any target. 2+: return a card they control to hand. 3+: put a creature from your hand, GY or exile into play. 4+: draw cards equal to their creature count. 5: destroy all cards on the board.',
        Fx.trigger.enter(
          Fx.modes(
            Fx.mode('0: look at their hand, send a card to the GY', 0, 99, Fx.pickCard('foeHand', 'toGY')),
            Fx.mode('1+: 4 damage to any target', 1, 99, Fx.pickCard('anyTarget', 'damage', 4)),
            Fx.mode('2+: return a card they control to hand', 2, 99, Fx.pickCard('foeBoard', 'toHand')),
            Fx.mode('3+: put a creature from hand, GY or exile into play', 3, 99, Fx.pickCard('myCreatures', 'summon')),
            Fx.mode('4+: draw cards equal to their creature count', 4, 99, Fx.drawPerFoeCreature()),
            Fx.mode('5: destroy all cards on the board', 5, 99, Fx.destroyAll())
          )
        )
      ),
    ],
  })
);
Cards.add(Fx =>
  Fx.creature('shieldguard', 'Shieldguard', 5, 15, {
    retaliate: true,
    kw: 'Retaliate (whenever this takes damage it deals damage equal to its power to the source: the damaging creature, or the controller of the spell).',
    abilities: [
      Fx.fastAbility('Swap In', {
        text: 'Fast, from your hand: after an opposing creature attacks, if you control a creature in that column, return that creature to your hand and put this card into its zone. (Stack HP 1)',
        zone: 'hand',
        req: ['attackedCol'],
        hp: 1,
        effects: [Fx.swapIn()],
      }),
    ],
  })
);
Cards.add(Fx =>
  Fx.quick('spirit', 'Spirit of the Sand', 0, {
    text: 'Quick, 0 HP. Choose one: each card you control gets a red shield counter (cannot be targeted), or each gets a blue shield counter (unaffected by spells and abilities that do not target it; attacks still hit it). You cannot gain life for the rest of the game.',
    effects: [
      Fx.modes(
        Fx.mode('Red shield on each card you control', 0, 99, Fx.shieldAll('red')),
        Fx.mode('Blue shield on each card you control', 0, 99, Fx.shieldAll('blue'))
      ),
      Fx.noLifeGain(),
    ],
  })
);
Cards.add(Fx =>
  Fx.enchantment('wardrum', 'War Drum', 0, {
    flash: true,
    extraCost: { ap: true },
    kw: 'Flash. Additional cost (optional): spend an action point.',
    tokens: {
      drummer: Fx.creature('drummer-token', 'Drummer', 3, 3, {
        passives: [Fx.aura('own', 1, 1)],
        text: 'Token. Cards you control in this column and the adjacent columns get +1/+1.',
      }),
    },
    passives: [
      withText(
        'Passive: cards your opponent controls in this column and the adjacent columns get -1/-1.',
        Fx.aura('foe', -1, -1)
      ),
    ],
    triggers: [
      withText(
        'When this enters, if the additional cost was paid: put a creature from your GY into play; it attacks immediately.',
        Object.assign(Fx.trigger.enter(Fx.pickCard('myGYCreatures', 'summonAttack')), { cond: 'extraPaid' })
      ),
      withText(
        'When this enters: create a Drummer token (3/3; cards you control in its column and the adjacent ones get +1/+1).',
        Fx.trigger.enter(Fx.placeToken('drummer'))
      ),
    ], // later in the array = higher on the stack = resolves first: the Drummer exists before the creature attacks
  })
);
Cards.add(Fx =>
  Fx.creature('shark', 'Deep Sea Shark', 6, 4, {
    triggers: [
      withText(
        'When this enters: you may pay 3 life; skip your opponent next combat phase (pressing combat becomes End turn instead).',
        Fx.trigger.enter(
          Fx.modes(
            Fx.mode('Pay 3 life: skip opponent next combat', 0, 99, Fx.skipFoeCombat(3)),
            Fx.mode('Do nothing', 0, 99)
          )
        )
      ),
      withText(
        'After your first combat phase ends: you may have your opponent draw 5 cards (cost; does nothing if they cannot); enter a second combat phase, where creatures can attack again.',
        Object.assign(
          Fx.trigger.combatEnd(
            Fx.modes(
              Fx.mode('Opponent draws 5: second combat phase', 0, 99, Fx.secondCombat()),
              Fx.mode('Do nothing', 0, 99)
            )
          ),
          { cond: 'firstCombat' }
        )
      ),
    ],
  })
);
Cards.add(Fx =>
  Fx.quick('intuition', 'Quick Intuition', 4, {
    zoneTarget: Fx.zoneTarget.anyCreature,
    optionalTarget: true,
    stackTarget: true,
    text: 'Quick. Draw until you have 7 cards in hand. You may target a creature or a spell: damage to it is denied until the end of this turn. (Stack HP 4)',
    effects: [Fx.drawUntil(7), Fx.noDamage()],
    abilities: [
      Fx.fastAbility('Cancel Attack', {
        text: 'From your GY, Fast, when your opponent attacks: exile this card; cancel that attack. (Stack HP 1)',
        zone: 'gy',
        req: [Fx.req.foeAttacking],
        cost: [Fx.exileSelf()],
        target: Fx.target.attacker,
        hp: 1,
        effects: [Fx.cancelAttack()],
      }),
    ],
  })
);
Cards.add(Fx =>
  Fx.slow('ambush', 'Ambush of the Night', 0, {
    text: 'Slow, 0 HP. In order: you draw 2; return up to 2 cards from your GY to your hand; put up to 2 creatures/enchantments from your hand into play. Then your opponent returns up to 2 cards from their GY to their hand, puts up to 2 creatures/enchantments from their GY into play, and draws 2.',
    effects: [
      Fx.draw(2),
      Fx.upTo('me', 'gy', 'toHand', 2),
      Fx.upTo('me', 'hand', 'play', 2, ['creature', 'enchantment']),
      Fx.upTo('foe', 'gy', 'toHand', 2),
      Fx.upTo('foe', 'gy', 'play', 2, ['creature', 'enchantment']),
      Fx.draw(2, 'foe'),
    ],
  })
);
Cards.add(Fx =>
  Fx.quick('underworldfusion', 'Underworld Fusion', 10, {
    req: [Fx.req.fusionOK],
    say: 'Reveal an extra deck creature whose conditions are met and exile its materials from your GY; summon that creature.',
    effects: [Fx.fusion({ from: ['gy'], pay: 'exile', summon: true, pick: 'conditions', cond: 'must' })],
    abilities: [
      Fx.fastAbility('Undo Fusion', {
        text: 'Fast, from your GY: exile this card; return an extra deck creature from your GY to the extra deck, and return the materials used to summon it from exile to your hand. (Stack HP 1)',
        zone: 'gy',
        req: [Fx.req.exInGY],
        cost: [Fx.exileSelf()],
        hp: 1,
        effects: [Fx.pickCard('myGYEx', 'returnEx')],
      }),
    ],
  })
);
Cards.add(Fx =>
  Fx.quick('depthfusion', 'Depth Sea Fusion', 7, {
    req: [Fx.req.fusionOK],
    say: 'Reveal an extra deck creature and send its materials from your field, hand or deck to the GY; summon it if its conditions are met (ignored if the materials come only from your hand and field).',
    effects: [
      Fx.fusion({ from: ['board', 'hand', 'deck'], pay: 'gy', summon: true, pick: 'fusable', cond: 'ignoreHB' }),
    ],
    abilities: [
      Fx.fastAbility('Recover', {
        text: 'Fast, from your deck or GY: spend an action point; add this card to your hand. (Stack HP 1)',
        zone: ['deck', 'gy'],
        cost: [Fx.spendAP()],
        hp: 1,
        effects: [Fx.selfToHand()],
      }),
    ],
  })
);
Cards.add(Fx =>
  Fx.creature('cultivator', 'Biology Cultivator', 4, 9, {
    triggers: [
      withText(
        'When this enters: reveal an extra deck creature; if its conditions are met, put its materials from your deck into your hand.',
        Object.assign(
          Fx.trigger.enter(Fx.fusion({ from: ['deck'], pay: 'hand', summon: false, pick: 'any', cond: 'must' })),
          { hp: 1 }
        )
      ),
    ],
  })
);
// ---- Extra deck creatures (keep them last: the extra deck of the 'Full Pool' deck is in this order)
Cards.add(Fx => {
  const strike = Fx.sendAdjacentPair();
  return Fx.exCreature('widowmaker', 'Widow Maker', 6, 7, {
    conditions: [Fx.exCond.lostLife()],
    materials: [Fx.mat('creature', 2, ['atk', 'hp'])],
    triggers: [
      withText(
        'When this enters: target two adjacent cards your opponent controls; they send one of them to the GY.',
        Object.assign(Fx.trigger.enter(strike), { hp: 1, targeting: Fx.targeting.adjacentPair })
      ),
      withText(
        'When this attacks: target two adjacent cards your opponent controls; they send one of them to the GY.',
        Object.assign(Fx.trigger.attack(['self'], strike), { hp: 1, targeting: Fx.targeting.adjacentPair })
      ),
      withText(
        'When a card your opponent controls enters adjacent to another card they control: target a creature you control; it attacks.',
        Object.assign(Fx.trigger.foeEnter(Fx.pickCard('myBoardCreatures', 'attack')), { cond: 'foeAdjacent', hp: 0 })
      ),
    ],
  });
});
Cards.add(Fx =>
  Fx.exCreature('librarian', 'L4: The Librarian', 10, 10, {
    conditions: [Fx.exCond.bothDrew(7)],
    materials: [Fx.mat('creature', 1), Fx.mat('enchantment', 1)],
    triggers: [
      withText(
        'When this enters, if it was summoned using Heaven and Sun: look at the top 3 cards of your opponent\u2019s deck and put them back on top in any order.',
        Object.assign(Fx.trigger.enter(Fx.reorderTop('foe', 3)), { cond: 'usedMat', card: 'heavensun', hp: 5 })
      ),
      withText(
        'When this enters: declare a card name, then look at the top card of your opponent\u2019s deck; if it has that name you may play it, and repeat this effect.',
        Object.assign(Fx.trigger.enter(Fx.declareName()), { hp: 10 })
      ),
      withText('At the start of your turn: draw a card.', Fx.trigger.turnStart(Fx.draw(1))),
    ],
  })
);
const DEFS = Cards.list;

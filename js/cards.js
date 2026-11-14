// cards.js - Effect API (Fx) and card definitions
// ---- Placeholder cards -------------------------------------------------
const TYPES = {
  creature:    {label:'Creature',    color:'#3f7fd8'},
  enchantment: {label:'Enchantment', color:'#3fa66a'},
  spell:       {label:'Spell',       color:'#d4524f'}
};
TYPES.ability = {label:'Ability', color:'#b8892b'};
const cardColor = def => def.type === 'spell' && def.timing === 'Slow' ? '#8e5bd0' : TYPES[def.type].color;   // Slow spells are purple
// =====================================================================
// EFFECT API (content side). Cards may ONLY use these builders; each returns plain
// data naming an operation the Sim publishes (see Sim.API). Mix and match freely.
// =====================================================================
const Fx = {
  // effects (run when a spell/ability resolves)
  dealDamage: (to, amount) => ({op:'DealDamage', to, amount}),   // to: 'player' | 'target'
  gainLife: (amount, to) => ({op:'GainLife', amount, to}),   // puts life counters on the controller (default) or on the target card
  draw: (n, who) => ({op:'Draw', n, who}),
  damageStack: amount => ({op:'DamageStack', amount}),
  sacrificeSelf: () => ({op:'SacrificeSelf'}),                   // also usable as a cost
  repeat: (n, ...effects) => ({op:'Repeat', n, effects}),        // composition: run effects n times
  // costs (paid on activation)
  payLife: n => ({op:'PayLife', n}),
  exileFromGY: n => ({op:'ExileFromGY', n}),
  exileSelf: () => ({op:'ExileSelf'}),                           // cost: exile this card from the graveyard
  shiftAdjacent: () => ({op:'ShiftAdjacent'}),
  damageAnother: amount => ({op:'DamageAnother', amount}),       // effect: controller picks another creature; it takes `amount` effect damage
  removeDamage: n => ({op:'RemoveDamage', n}),                   // effect: remove n damage points from the target; controller picks which instances                   // effect: controller may move this card to an adjacent empty column
  mill: n => ({op:'Mill', n}),                                   // effect: target player puts n cards from the top of their deck into the GY
  fetch: card => ({op:'FetchFromDeck', card}),                   // effect: controller adds the named card from their deck to their hand
  doublePower: () => ({op:'DoublePower'}),                       // effect: this card's power x2 (Base layer, lasts while on the field)
  nearestZone: skip => ({op:'NearestZone', skip}),                // effect: pick the closest zone to this card, skipping zones occupied by 'self' / a card id
  destroyOnZone: () => ({op:'DestroyOnZone'}),                    // effect: destroy whatever stands on the picked zone
  createToken: token => ({op:'CreateToken', token}),              // effect: create def.tokens[token] on the picked zone, under the controller
  trigger: {                                                     // triggered abilities: go on the stack when the event happens
    enter: (...effects) => ({on:'enter', effects}),
    combat: (...effects) => ({on:'combat', effects}),
    combatEnd: (...effects) => ({on:'combatEnd', effects}),   // after its controller's FIRST combat phase of the turn ends (use cond:'firstCombat')            // beginning of its controller's combat step
    damaged: (...effects) => ({on:'damaged', effects}),          // this card takes combat damage
    turnStart: (...effects) => ({on:'turnStart', effects}),     // start of its controller's turn              // when this card enters the field
    attack: (by, ...effects) => ({on:'attack', by, effects})     // by: 'self' and/or 'foe' (creature controlled by this card's opponent)
  },
  // requirements (strings) and targets (strings)
  req: {front:'front', hurt:'hurt', target:'target', stack:'stack', foeAttacking:'foeAttacking', attackOnStack:'attackOnStack'},
  target: {opposingFront:'opposingFront', attacker:'attacker'},
  zoneTarget: {anyPermanent:'anyPermanent', anyCreature:'anyCreature'},
  playerTarget: true,                                            // spell flag: a player can be targeted (click a life bar)                     // spell target: a zone with a card (or a cloud) on it, chosen when the spell is played
  rider: {inheritAbilities: () => ({op:'InheritAbilities'})},    // damage this card deals: the victim loses its abilities and gains this card's,
  colTarget: {full:'fullColumn'},                                // spell target: a column (chosen when the spell is played)
  obscure: () => ({op:'Obscure'}),                               // passive: a black cloud covers each of the controller's other zones
  exileColumn: () => ({op:'ExileColumn'}),                       // effect: exile every card on the targeted column
  makeColumnUnusable: () => ({op:'MakeColumnUnusable'}),         // effect: the targeted column's four zones become unusable for the rest of the game
  returnToHand: () => ({op:'ReturnToHand'}),
  modes: (...modes) => ({op:'ChooseMode', modes}),                       // controller picks one mode whose [min,max] foe-creature range fits
  mode: (name, min, max, ...effects) => ({name, min, max, effects}),
  pickCard: (from, then, amount) => ({op:'PickCard', from, then, amount}),   // from: foeHand | foeBoard | anyTarget | myCreatures; then: toGY | toHand | damage | summon
  destroyAll: () => ({op:'DestroyAll'}),
  drawPerFoeCreature: () => ({op:'DrawPerFoeCreature'}),
  vaultFromDeck: n => ({op:'VaultFromDeck', n}),
  revealVault: () => ({op:'RevealVault'}),
  swapIn: () => ({op:'SwapIn'}),
  shieldAll: color => ({op:'ShieldAll', color}),
  noLifeGain: () => ({op:'NoLifeGain'}),
  aura: (who, atk, hp) => ({op:'Aura', who, atk, hp}),            // passive: own/foe cards in this card's column and the adjacent columns get +atk/+hp (derived, never stored)
  drawUntil: n => ({op:'DrawUntil', n}),
  addAttackDamage: (amount, whose) => ({op:'AddAttackDamage', amount, whose}),   // effect: adds damage to the topmost Attack object on the stack (whose: 'mine' | 'foe' | 'any')
  noDamage: () => ({op:'NoDamage'}),                              // target creature / stack spell: damage is denied until the end of this turn
  cancelAttack: () => ({op:'CancelAttack'}),
  skipFoeCombat: pay => ({op:'SkipFoeCombat', pay}),
  secondCombat: () => ({op:'SecondCombat'}),
  upTo: (who, from, then, n, types) => ({op:'UpTo', who, from, then, n, types}),   // who: me|foe; from: gy|hand; then: toHand|play
  freeFrontZone: () => ({op:'FreeFrontZone'}),
  placeToken: token => ({op:'PlaceToken', token})                      // effect: this spell goes to its owner's hand instead of the graveyard
};
// Each card is an independent module: a factory that receives the API and returns its definition.
const Cards = {list: [], add(factory){ this.list.push(factory(Fx)); }};
const FIXTURES = [];   // ability-less cards kept ONLY for headless tests; not part of the game's card pool
const PHC = 'Placeholder creature. No ability yet.', PHE = 'Placeholder enchantment. No effect yet.';
FIXTURES.push({id:'soldier', name:'Soldier', type:'creature', atk:2, hp:3, text:PHC});
FIXTURES.push({id:'knight',  name:'Knight',  type:'creature', atk:4, hp:5, text:PHC});
FIXTURES.push({id:'giant',   name:'Giant',   type:'creature', atk:6, hp:8, text:PHC});
FIXTURES.push({id:'barrier', name:'Barrier', type:'enchantment', hp:2, text:PHE});
Cards.add(Fx => ({id:'ward', name:'Ward', type:'enchantment', hp:4, text:'Fast. You have lost life: sacrifice this card, then gain 3 life. (Stack HP 2)',
  abilities:[{name:'Restore', speed:'Fast', req:[Fx.req.hurt], hp:2, effects:[Fx.gainLife(3), Fx.sacrificeSelf()]}]}));
FIXTURES.push({id:'aura', name:'Aura', type:'enchantment', hp:6, text:PHE});
Cards.add(Fx => ({id:'heal', name:'Heal', type:'spell', timing:'Quick', hp:3, text:'Quick. Gain 3 life.', effects:[Fx.gainLife(3)]}));
Cards.add(Fx => ({id:'zap', name:'Zap', type:'spell', timing:'Quick', hp:0, text:'Quick, 0 HP (still resolves). Deal 1 damage to the opponent.', effects:[Fx.dealDamage('player', 1)]}));
Cards.add(Fx => ({id:'archer', name:'Archer', type:'creature', atk:3, hp:2, text:'Slow. Front row: pay 1 life; deal 2 damage to the opponent. (Stack HP 1)',
  abilities:[{name:'Volley', speed:'Slow', req:[Fx.req.front], cost:[Fx.payLife(1)], hp:1, effects:[Fx.dealDamage('player', 2)]}]}));
FIXTURES.push({id:'guard', name:'Guard', type:'creature', atk:1, hp:6, text:PHC});
FIXTURES.push({id:'wolf',  name:'Wolf',  type:'creature', atk:3, hp:3, text:PHC});
Cards.add(Fx => ({id:'scout', name:'Scout', type:'creature', atk:1, hp:1, text:'Fast. A creature faces this: sacrifice this card; deal 3 damage to that creature. (Stack HP 0)',
  abilities:[{name:'Ambush', speed:'Fast', req:[Fx.req.target], cost:[Fx.sacrificeSelf()], target:Fx.target.opposingFront, hp:0, effects:[Fx.dealDamage('target', 3)]}]}));
FIXTURES.push({id:'banner', name:'Banner', type:'enchantment', hp:3, text:PHE});
FIXTURES.push({id:'trap',   name:'Trap',   type:'enchantment', hp:1, text:PHE});
Cards.add(Fx => ({id:'charm', name:'Charm', type:'enchantment', hp:5, text:'Slow. Exile your oldest GY card; draw 1. (Stack HP 1)',
  abilities:[{name:'Recall', speed:'Slow', cost:[Fx.exileFromGY(1)], hp:1, effects:[Fx.draw(1)]}]}));
Cards.add(Fx => ({id:'infinitywall', name:'Infinity Wall', type:'spell', timing:'Quick', hp:6, colTarget:Fx.colTarget.full,
  text:'Quick. Target a fully filled column: exile every card on it. That column becomes unusable for the rest of the game. Return this card to your hand. (Stack HP 6)',
  effects:[Fx.exileColumn(), Fx.makeColumnUnusable(), Fx.returnToHand()]}));
Cards.add(Fx => ({id:'bolt', name:'Bolt', type:'spell', timing:'Quick', hp:2, req:[Fx.req.stack], text:'Quick. Deal 3 damage to the stack object beneath it (countered at HP -1 or lower).', effects:[Fx.damageStack(3)]}));
FIXTURES.push({id:'rage',     name:'Rage',     type:'spell', timing:'Quick', hp:2, req:['attackOnStack'], text:'Test Quick spell: the topmost Attack on the stack deals 4 more damage.', effects:[Fx.addAttackDamage(4)]});
FIXTURES.push({id:'mend',     name:'Mend',     type:'spell', timing:'Quick', hp:4, text:'Placeholder Quick spell. No effect yet.'});
FIXTURES.push({id:'fireball', name:'Fireball', type:'spell', timing:'Slow',  hp:6, text:'Placeholder Slow spell. No effect yet.'});
FIXTURES.push({id:'rally',    name:'Rally',    type:'spell', timing:'Slow',  hp:1, text:'Placeholder Slow spell. No effect yet.'});
FIXTURES.push({id:'blast',    name:'Blast',    type:'spell', timing:'Slow',  hp:5, text:'Placeholder Slow spell: only when the stack is empty. No effect yet.'});
Cards.add(Fx => ({id:'hummingbird', name:'Red Hummingbird', type:'creature', atk:2, hp:1,
  text:'When this enters: draw a card. When this card or an opponent\u2019s creature attacks: you may shift this card to an adjacent empty column. Fast, from your GY: exile this card; gain 3 life.',
  triggers:[Fx.trigger.enter(Fx.draw(1)), Fx.trigger.attack(['self', 'foe'], Fx.shiftAdjacent())],
  abilities:[{name:'Feather Balm', speed:'Fast', zone:'gy', req:[Fx.req.hurt], cost:[Fx.exileSelf()], hp:1, effects:[Fx.gainLife(3)]}]}));
Cards.add(Fx => ({id:'kingeye', name:'King Eye', type:'creature', atk:6, hp:10,
  text:'Passive. A black cloud covers each of your other zones: your opponent cannot see those zones or the cards on them. Abilities of cards under a cloud appear to come from King Eye. A cloud is a legal target for anything that targets a card or zone there; the effect passes to what is underneath, and with nothing legal underneath it fizzles (nothing is revealed).',
  passives:[Fx.obscure()]}));
Cards.add(Fx => { const spread = Fx.repeat(4, Fx.nearestZone(['self', 'vine-token']), Fx.destroyOnZone(), Fx.createToken('vine'));
  return {id:'vine', name:'The Vine', type:'creature', atk:1, hp:1,
    text:'When this enters and at the start of your turn: 4 times, pick the closest zone not occupied by this card or a Vine token, destroy the card there, and create a Vine token (1/1) on it.',
    tokens:{vine:{id:'vine-token', name:'Vine', type:'creature', atk:1, hp:1, text:'Token. Vanilla 1/1.'}},
    triggers:[Fx.trigger.enter(spread), Fx.trigger.turnStart(spread)]}; });
Cards.add(Fx => ({id:'avatar', name:'Avatar of Rabies', type:'creature', atk:3, hp:7,
  text:'Whenever a creature attacks: you may shift this card to an adjacent empty column. Whenever this card takes combat damage: deal 1 damage to another creature. Damage dealt by this card: that creature loses all its original abilities and gains the abilities of Avatar of Rabies.',
  triggers:[Fx.trigger.attack(['any'], Fx.shiftAdjacent()), Fx.trigger.damaged(Fx.damageAnother(1))],
  rider:Fx.rider.inheritAbilities()}));
Cards.add(Fx => ({id:'bandages', name:'Throwing Bandages', type:'spell', timing:'Quick', hp:10, zoneTarget:Fx.zoneTarget.anyPermanent,
  text:'Quick. Target a permanent: remove 7 damage counters from it (7 points, split across its damage instances as you choose). (Stack HP 10)',
  effects:[Fx.removeDamage(7)]}));
Cards.add(Fx => ({id:'superbolt', name:'Superbolt', type:'spell', timing:'Slow', hp:3, zoneTarget:Fx.zoneTarget.anyPermanent, playerTarget:Fx.playerTarget,
  text:'Slow. Deal 20 damage to any target (a permanent or a player). (Stack HP 3)', effects:[Fx.dealDamage('target', 20)]}));
Cards.add(Fx => ({id:'grainfall', name:'GrainFall', type:'spell', timing:'Slow', hp:2, playerTarget:Fx.playerTarget,
  text:'Slow. Target player mills ten cards. (Stack HP 2)', effects:[Fx.mill(10)]}));
Cards.add(Fx => ({id:'blackhawk', name:'Black Hawk', type:'creature', atk:1, hp:0,
  text:'At the beginning of your combat step: double this card\u2019s power 5 times.', triggers:[Fx.trigger.combat(Fx.repeat(5, Fx.doublePower()))]}));
Cards.add(Fx => ({id:'boltmaster', name:'Bolt Master', type:'creature', atk:2, hp:3,
  text:'When this enters: add a Superbolt from your deck to your hand.', triggers:[Fx.trigger.enter(Fx.fetch('superbolt'))]}));
Cards.add(Fx => ({id:'heavensun', name:'Heaven and Sun', type:'enchantment', hp:5,
  text:'When this enters: choose 5 cards from your deck and exile them (stack HP 7). At the start of your turn: your opponent picks one of those exiled cards; put it into your hand.',
  triggers:[Object.assign(Fx.trigger.enter(Fx.vaultFromDeck(5)), {hp:7}), Fx.trigger.turnStart(Fx.revealVault())]}));
Cards.add(Fx => ({id:'parasite', name:'Creeping Parasite', type:'creature', atk:0, hp:0, flash:true,
  text:'Flash (play it as a Quick spell; it does not use the major action). When this enters, choose one effect unlocked by the number of creatures your opponent controls. 0: look at their hand and send a card to the GY. 1+: 4 damage to any target. 2+: return a card they control to hand. 3+: put a creature from your hand, GY or exile into play. 4+: draw cards equal to their creature count. 5: destroy all cards on the board.',
  triggers:[Fx.trigger.enter(Fx.modes(
    Fx.mode('0: look at their hand, send a card to the GY', 0, 99, Fx.pickCard('foeHand', 'toGY')),
    Fx.mode('1+: 4 damage to any target', 1, 99, Fx.pickCard('anyTarget', 'damage', 4)),
    Fx.mode('2+: return a card they control to hand', 2, 99, Fx.pickCard('foeBoard', 'toHand')),
    Fx.mode('3+: put a creature from hand, GY or exile into play', 3, 99, Fx.pickCard('myCreatures', 'summon')),
    Fx.mode('4+: draw cards equal to their creature count', 4, 99, Fx.drawPerFoeCreature()),
    Fx.mode('5: destroy all cards on the board', 5, 99, Fx.destroyAll())))]}));
Cards.add(Fx => ({id:'shieldguard', name:'Shieldguard', type:'creature', atk:5, hp:15, retaliate:true,
  text:'Retaliate (whenever this takes damage it deals damage equal to its power to the source: the damaging creature, or the controller of the spell). Fast, from your hand: after an opposing creature attacks, if you control a creature in that column, return that creature to your hand and put this card into its zone. (Stack HP 1)',
  abilities:[{name:'Swap In', speed:'Fast', zone:'hand', req:['attackedCol'], hp:1, effects:[Fx.swapIn()]}]}));
Cards.add(Fx => ({id:'spirit', name:'Spirit of the Sand', type:'spell', timing:'Quick', hp:0,
  text:'Quick, 0 HP. Choose one: each card you control gets a red shield counter (cannot be targeted), or each gets a blue shield counter (unaffected by spells and abilities that do not target it; attacks still hit it). You cannot gain life for the rest of the game.',
  effects:[Fx.modes(Fx.mode('Red shield on each card you control', 0, 99, Fx.shieldAll('red')), Fx.mode('Blue shield on each card you control', 0, 99, Fx.shieldAll('blue'))), Fx.noLifeGain()]}));
Cards.add(Fx => ({id:'wardrum', name:'War Drum', type:'enchantment', hp:0, flash:true, extraCost:{major:true},
  text:'Flash. Additional cost (optional, your turn only): spend your major action. Passive: cards your opponent controls in this column and the adjacent columns get -1/-1. When this enters: create a Drummer token (3/3; cards you control in its column and the adjacent ones get +1/+1). When this enters, if the additional cost was paid: put a creature from your GY into play; it attacks immediately.',
  tokens:{drummer:{id:'drummer-token', name:'Drummer', type:'creature', atk:3, hp:3, passives:[Fx.aura('own', 1, 1)], text:'Token. Cards you control in this column and the adjacent columns get +1/+1.'}},
  passives:[Fx.aura('foe', -1, -1)],
  triggers:[Object.assign(Fx.trigger.enter(Fx.pickCard('myGYCreatures', 'summonAttack')), {cond:'extraPaid'}), Fx.trigger.enter(Fx.placeToken('drummer'))]}));   // later in the array = higher on the stack = resolves first: the Drummer exists before the creature attacks
Cards.add(Fx => ({id:'shark', name:'Deep Sea Shark', type:'creature', atk:6, hp:4,
  text:'When this enters: you may pay 3 life; skip your opponent next combat phase (pressing combat becomes End turn instead). After your first combat phase ends: you may have your opponent draw 5 cards (cost; does nothing if they cannot); enter a second combat phase, where creatures can attack again.',
  triggers:[Fx.trigger.enter(Fx.modes(Fx.mode('Pay 3 life: skip opponent next combat', 0, 99, Fx.skipFoeCombat(3)), Fx.mode('Do nothing', 0, 99))),
    Object.assign(Fx.trigger.combatEnd(Fx.modes(Fx.mode('Opponent draws 5: second combat phase', 0, 99, Fx.secondCombat()), Fx.mode('Do nothing', 0, 99))), {cond:'firstCombat'})]}));
Cards.add(Fx => ({id:'intuition', name:'Quick Intuition', type:'spell', timing:'Quick', hp:4, zoneTarget:Fx.zoneTarget.anyCreature, optionalTarget:true, stackTarget:true,
  text:'Quick. Draw until you have 7 cards in hand. You may target a creature or a spell: damage to it is denied until the end of this turn. From your GY, Fast, when your opponent attacks: exile this card; cancel that attack. (Stack HP 4)',
  effects:[Fx.drawUntil(7), Fx.noDamage()],
  abilities:[{name:'Cancel Attack', speed:'Fast', zone:'gy', req:[Fx.req.foeAttacking], cost:[Fx.exileSelf()], target:Fx.target.attacker, hp:1, effects:[Fx.cancelAttack()]}]}));
Cards.add(Fx => ({id:'ambush', name:'Ambush of the Night', type:'spell', timing:'Slow', hp:0,
  text:'Slow, 0 HP. In order: you draw 2; return up to 2 cards from your GY to your hand; put up to 2 creatures/enchantments from your hand into play. Then your opponent returns up to 2 cards from their GY to their hand, puts up to 2 creatures/enchantments from their GY into play, and draws 2.',
  effects:[Fx.draw(2), Fx.upTo('me', 'gy', 'toHand', 2), Fx.upTo('me', 'hand', 'play', 2, ['creature', 'enchantment']), Fx.upTo('foe', 'gy', 'toHand', 2), Fx.upTo('foe', 'gy', 'play', 2, ['creature', 'enchantment']), Fx.draw(2, 'foe')]}));
const DEFS = Cards.list;
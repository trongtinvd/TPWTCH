// cards.js - CONTENT: card types, the Fx effect-builder API, and every card definition. Add new cards here.
// Classic script: shares one global scope with the other js/*.js files; load order matters (see index.html).

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
  gainLife: amount => ({op:'GainLife', amount}),
  draw: n => ({op:'Draw', n}),
  damageStack: amount => ({op:'DamageStack', amount}),
  sacrificeSelf: () => ({op:'SacrificeSelf'}),                   // also usable as a cost
  repeat: (n, ...effects) => ({op:'Repeat', n, effects}),        // composition: run effects n times
  // costs (paid on activation)
  payLife: n => ({op:'PayLife', n}),
  exileFromGY: n => ({op:'ExileFromGY', n}),
  exileSelf: () => ({op:'ExileSelf'}),                           // cost: exile this card from the graveyard
  shiftAdjacent: () => ({op:'ShiftAdjacent'}),                   // effect: controller may move this card to an adjacent empty column
  trigger: {                                                     // triggered abilities: go on the stack when the event happens
    enter: (...effects) => ({on:'enter', effects}),              // when this card enters the field
    attack: (by, ...effects) => ({on:'attack', by, effects})     // by: 'self' and/or 'foe' (creature controlled by this card's opponent)
  },
  // requirements (strings) and targets (strings)
  req: {front:'front', hurt:'hurt', target:'target'},
  target: {opposingFront:'opposingFront'}
};
// Each card is an independent module: a factory that receives the API and returns its definition.
const Cards = {list: [], add(factory){ this.list.push(factory(Fx)); }};
const PHC = 'Placeholder creature. No ability yet.', PHE = 'Placeholder enchantment. No effect yet.';
Cards.add(() => ({id:'soldier', name:'Soldier', type:'creature', atk:2, hp:3, text:PHC}));
Cards.add(() => ({id:'knight',  name:'Knight',  type:'creature', atk:4, hp:5, text:PHC}));
Cards.add(() => ({id:'giant',   name:'Giant',   type:'creature', atk:6, hp:8, text:PHC}));
Cards.add(() => ({id:'barrier', name:'Barrier', type:'enchantment', hp:2, text:PHE}));
Cards.add(Fx => ({id:'ward', name:'Ward', type:'enchantment', hp:4, text:'Fast. You have lost life: sacrifice this card, then gain 3 life. (Stack HP 2)',
  abilities:[{name:'Restore', speed:'Fast', req:[Fx.req.hurt], hp:2, effects:[Fx.gainLife(3), Fx.sacrificeSelf()]}]}));
Cards.add(() => ({id:'aura', name:'Aura', type:'enchantment', hp:6, text:PHE}));
Cards.add(Fx => ({id:'heal', name:'Heal', type:'spell', timing:'Quick', hp:3, text:'Quick. Gain 3 life.', effects:[Fx.gainLife(3)]}));
Cards.add(Fx => ({id:'zap', name:'Zap', type:'spell', timing:'Quick', hp:0, text:'Quick, 0 HP (still resolves). Deal 1 damage to the opponent.', effects:[Fx.dealDamage('player', 1)]}));
Cards.add(Fx => ({id:'archer', name:'Archer', type:'creature', atk:3, hp:2, text:'Slow. Front row: pay 1 life; deal 2 damage to the opponent. (Stack HP 1)',
  abilities:[{name:'Volley', speed:'Slow', req:[Fx.req.front], cost:[Fx.payLife(1)], hp:1, effects:[Fx.dealDamage('player', 2)]}]}));
Cards.add(() => ({id:'guard', name:'Guard', type:'creature', atk:1, hp:6, text:PHC}));
Cards.add(() => ({id:'wolf',  name:'Wolf',  type:'creature', atk:3, hp:3, text:PHC}));
Cards.add(Fx => ({id:'scout', name:'Scout', type:'creature', atk:1, hp:1, text:'Fast. A creature faces this: sacrifice this card; deal 3 damage to that creature. (Stack HP 0)',
  abilities:[{name:'Ambush', speed:'Fast', req:[Fx.req.target], cost:[Fx.sacrificeSelf()], target:Fx.target.opposingFront, hp:0, effects:[Fx.dealDamage('target', 3)]}]}));
Cards.add(() => ({id:'banner', name:'Banner', type:'enchantment', hp:3, text:PHE}));
Cards.add(() => ({id:'trap',   name:'Trap',   type:'enchantment', hp:1, text:PHE}));
Cards.add(Fx => ({id:'charm', name:'Charm', type:'enchantment', hp:5, text:'Slow. Exile your oldest GY card; draw 1. (Stack HP 1)',
  abilities:[{name:'Recall', speed:'Slow', cost:[Fx.exileFromGY(1)], hp:1, effects:[Fx.draw(1)]}]}));
Cards.add(Fx => ({id:'bolt', name:'Bolt', type:'spell', timing:'Quick', hp:2, text:'Quick. Deal 3 damage to the stack object beneath it (countered at HP -1 or lower).', effects:[Fx.damageStack(3)]}));
Cards.add(() => ({id:'mend',     name:'Mend',     type:'spell', timing:'Quick', hp:4, text:'Placeholder Quick spell. No effect yet.'}));
Cards.add(() => ({id:'fireball', name:'Fireball', type:'spell', timing:'Slow',  hp:6, text:'Placeholder Slow spell. No effect yet.'}));
Cards.add(() => ({id:'rally',    name:'Rally',    type:'spell', timing:'Slow',  hp:1, text:'Placeholder Slow spell. No effect yet.'}));
Cards.add(() => ({id:'blast',    name:'Blast',    type:'spell', timing:'Slow',  hp:5, text:'Placeholder Slow spell: only when the stack is empty. No effect yet.'}));
Cards.add(Fx => ({id:'hummingbird', name:'Red Hummingbird', type:'creature', atk:2, hp:1,
  text:'When this enters: draw a card. When this card or an opponent\u2019s creature attacks: you may shift this card to an adjacent empty column. Fast, from your GY: exile this card; gain 3 life.',
  triggers:[Fx.trigger.enter(Fx.draw(1)), Fx.trigger.attack(['self', 'foe'], Fx.shiftAdjacent())],
  abilities:[{name:'Feather Balm', speed:'Fast', zone:'gy', req:[Fx.req.hurt], cost:[Fx.exileSelf()], hp:1, effects:[Fx.gainLife(3)]}]}));
const DEFS = Cards.list;

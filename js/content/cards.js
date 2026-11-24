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
// A spell may give `say` instead of `overrideText`: the override becomes "<Timing>. <say> (Stack HP n)" (the "(Stack HP n)" part is left out at 0 HP).
const spellDef = (timing, id, name, hp, rest = {}) => {
  const { say, ...def } = rest;
  return Object.assign(
    { id, name, type: 'spell', timing, hp },
    say == null ? {} : { overrideText: timing + '. ' + say + (hp ? ' (Stack HP ' + hp + ')' : '') },
    def
  );
};
// ---- Card text is DERIVED from the card's abilities: translate(abilities[]) turns the ability DATA (the JavaScript) into English.
// Every trigger, activated ability, passive (keywords are passives), rider and spell may carry `overrideText`: a human rewrite used
// instead of the machine text when `useOverrideText` is true (for abilities whose machine text is too clumsy). The machine text is
// always available as translateOne(o); o.text is filled with whichever is shown. textParts(def) lists the parts in display order;
// def.text is those parts joined. The inspector greys / crosses out / highlights single parts.
const ovr = (overrideText, o, useOverrideText = false) => Object.assign(o, { overrideText, useOverrideText });
// Keyworded abilities are ordinary abilities with a short name, so they can be reused and referenced (and disabled, like any other ability).
const KEYWORDS = {
  flash: { name: 'Flash', zone: 'hand', reminder: 'play it as a Quick spell; it does not spend an action point' },
  retaliate: {
    name: 'Retaliate',
    zone: 'board',
    reminder:
      'whenever this takes damage it deals damage equal to its power to the source: the damaging creature, or the controller of the spell',
  },
};
const Translate = (function () {
  const cap = t => (t ? t[0].toUpperCase() + t.slice(1) : t),
    num = (n, one, many) => (n === 1 ? one : n + ' ' + (many || one + 's')),
    cards = n => (n === 1 ? 'a card' : n + ' cards'),
    defName = (id, def) => {
      const d =
        Cards.list.find(x => x.id === id) ||
        FIXTURES.find(x => x.id === id) ||
        Object.values((def && def.tokens) || {}).find(x => x.id === id);
      return d ? d.name + (/-token$/.test(id) ? ' token' : '') : id;
    },
    tokName = (ctx, k) => {
      const t = ctx.def.tokens && ctx.def.tokens[k];
      return t ? t.name + ' token (' + t.atk + '/' + t.hp + ')' : k + ' token';
    },
    // a list of clauses: one, "a, then b", or (3+) one sentence each
    seq = L => {
      L = L.filter(Boolean);
      return L.length <= 2 ? L.join(', then ') : L.map((x, i) => (i ? cap(x) : x)).join('. ');
    };
  const REQ = {
    front: 'this card is in the front row',
    hurt: 'you have lost life',
    target: 'a creature faces this card',
    stack: 'a spell or ability is on the stack',
    foeAttacking: 'your opponent is attacking',
    attackOnStack: 'an Attack is on the stack',
    fusionOK: 'an extra deck creature can be summoned this way',
    exInGY: 'an extra deck creature is in your GY',
    attackedCol: 'an opposing creature attacks a column where you control a creature',
  };
  const TARGET = { opposingFront: 'the creature facing this card', attacker: 'the attacking creature' };
  const TARGETING = {
    adjacentPair: 'target two adjacent cards your opponent controls',
    nonPlayerHp: 'target something with HP that is not a player',
  };
  const ZONE = { gy: 'GY', hand: 'hand', deck: 'deck', board: 'board' };
  const PICK_FROM = {
    foeHand: 'look at your opponent’s hand and choose a card there',
    foeBoard: 'choose a card your opponent controls',
    anyTarget: 'choose any target',
    myCreatures: 'choose a creature in your hand, GY or exile',
    myGYCreatures: 'choose a creature in your GY',
    myBoardCreatures: 'choose a creature you control',
    myGYEx: 'choose an extra deck creature in your GY',
  };
  const PICK_THEN = {
    toGY: 'send it to the GY',
    toHand: 'return it to its owner’s hand',
    damage: e => 'deal ' + e.amount + ' damage to it',
    summon: 'put it into play',
    summonAttack: 'put it into play, and it attacks immediately',
    attack: 'it attacks',
    returnEx: 'return it to the extra deck, and return the materials used to summon it from exile to your hand',
  };
  const who = (e, me, foe) => (e.who === 'foe' ? foe : me);
  // one effect / cost -> a clause ("deal 3 damage to it")
  const OP = {
    DealDamage: (e, c) =>
      'deal ' + e.amount + ' damage to ' + (e.to === 'player' ? 'your opponent' : c.tgt || 'the target'),
    GainLife: (e, c) =>
      e.to === 'target'
        ? 'put ' + e.amount + ' life counters on ' + (c.tgt || 'the target')
        : 'gain ' + e.amount + ' life',
    Draw: e => who(e, 'draw ' + cards(e.n), 'your opponent draws ' + cards(e.n)),
    DamageStack: e => 'deal ' + e.amount + ' damage to the stack object beneath this (countered at HP -1 or lower)',
    DamageHp: e =>
      'deal ' +
      e.amount +
      ' ' +
      [e.temporary && 'temporary', e.nonLethal && 'non-lethal'].filter(Boolean).join(' ') +
      (e.temporary || e.nonLethal ? ' ' : '') +
      'damage to it',
    SpendStatus: e =>
      'spend ' + (/^[aeiou]/.test(e.label || e.kind) ? 'an ' : 'a ') + (e.label || e.kind) + ' on this card',
    SacrificeSelf: () => 'sacrifice this card',
    Repeat: (e, c) => {
      const L = e.effects.map(x => clause(x, c));
      return L.length === 1
        ? L[0] + ' ' + e.n + ' times'
        : e.n + ' times: ' + L.slice(0, -1).join(', ') + ', then ' + L[L.length - 1];
    },
    PayLife: e => 'pay ' + e.n + ' life',
    SpendAP: () => 'spend an action point',
    ExileFromGY: e => (e.n === 1 ? 'exile your oldest GY card' : 'exile your ' + e.n + ' oldest GY cards'),
    ExileSelf: () => 'exile this card',
    ShiftAdjacent: () => 'you may shift this card to an adjacent empty column',
    DamageAnother: e => 'deal ' + e.amount + ' damage to another creature',
    RemoveDamage: e => 'remove ' + e.n + ' damage from it (split across its damage instances as you choose)',
    Mill: e => 'that player mills ' + cards(e.n),
    FetchFromDeck: e => 'add a ' + defName(e.card) + ' from your deck to your hand',
    DoublePower: () => 'double this card’s power',
    NearestZone: (e, c) =>
      'pick the closest zone (any row) not occupied by ' +
      (e.skip || []).map(k => (k === 'self' ? 'this card' : 'a ' + defName(k, c.def))).join(' or '),
    DestroyOnZone: () => 'destroy the card there',
    CreateToken: (e, c) =>
      'create a ' + tokName(c, e.token) + ' there, even in a zone a creature cannot normally enter',
    ExileColumn: () => 'exile every card on that column',
    MakeColumnUnusable: () => 'that column becomes unusable for the rest of the game',
    GiveZoneHp: e => 'that zone gets ' + e.n + ' zone HP',
    DamageZone: e => 'deal ' + e.n + ' damage to that zone',
    ReturnToHand: () => 'return this card to your hand',
    ChooseMode: e => 'choose one: ' + e.modes.map(m => m.name).join(', or '),
    PickCard: (e, c) => {
      const t = PICK_THEN[e.then];
      return (PICK_FROM[e.from] || 'choose a card') + ' and ' + (typeof t === 'function' ? t(e) : t || e.then); // chosen as it resolves: not a target (no ';')
    },
    DestroyAll: () => 'destroy all cards on the board',
    DrawPerFoeCreature: () => 'draw a card for each creature your opponent controls',
    VaultFromDeck: e => 'choose ' + cards(e.n) + ' from your deck and exile them',
    RevealVault: () => 'your opponent picks one of the cards this card exiled, and you put it into your hand',
    SwapIn: () => 'return that creature to your hand and put this card into its zone',
    ShieldAll: e => 'each card you control gets a ' + e.color + ' shield counter',
    NoLifeGain: () => 'you cannot gain life for the rest of the game',
    WinGame: e => (e.who === 'foe' ? 'your opponent wins the game' : 'you win the game'),
    Aura: e =>
      'cards ' +
      (e.who === 'foe' ? 'your opponent controls' : 'you control') +
      ' in this column and the adjacent columns get ' +
      (e.atk >= 0 ? '+' : '') +
      e.atk +
      '/' +
      (e.hp >= 0 ? '+' : '') +
      e.hp,
    DrawUntil: e => 'draw until you have ' + e.n + ' cards in hand',
    AddAttackDamage: e =>
      'the topmost ' +
      (e.whose === 'mine' ? 'Attack you control' : e.whose === 'foe' ? 'opposing Attack' : 'Attack') +
      ' on the stack deals ' +
      e.amount +
      ' more damage',
    NoDamage: (e, c) => 'damage to ' + (c.tgt || 'the target') + ' is denied until the end of this turn',
    CancelAttack: () => 'cancel that attack',
    SkipFoeCombat: e => 'pay ' + e.pay + ' life, and your opponent skips their next combat phase',
    SecondCombat: () => 'your opponent draws 5 cards, then enter a second combat phase',
    UpTo: e => {
      const foe = e.who === 'foe',
        what = e.types ? e.types.map(t => t + 's').join(' or ') : 'cards',
        from = (foe ? 'their ' : 'your ') + ZONE[e.from];
      return (
        (foe ? 'your opponent ' : '') +
        (e.then === 'toHand'
          ? (foe ? 'returns' : 'return') +
            ' up to ' +
            e.n +
            ' ' +
            what +
            ' from ' +
            from +
            ' to ' +
            (foe ? 'their' : 'your') +
            ' hand'
          : (foe ? 'puts' : 'put') + ' up to ' + e.n + ' ' + what + ' from ' + from + ' into play')
      );
    },
    PlaceToken: (e, c) => 'put a ' + tokName(c, e.token) + ' on a free front zone',
    Fusion: e =>
      'reveal an extra deck creature, pay its materials from your ' +
      e.from.map(z => ZONE[z]).join(', ') +
      (e.summon ? ' and summon it' : ' and put them into your hand'),
    SelfToHand: () => 'add this card to your hand',
    SendAdjacentPair: () => 'they send one of them to the GY',
    ReorderTop: e =>
      'look at the top ' +
      cards(e.n) +
      ' of ' +
      who(e, 'your', 'your opponent’s') +
      ' deck and put them back on top in any order',
    DeclareName: () =>
      'declare a card name, then look at the top card of your opponent’s deck; if it has that name you may play it, and repeat this effect',
    Obscure: () => 'a black cloud covers each of your other zones',
    InheritAbilities: (e, c) =>
      'that creature loses all its original abilities and gains the abilities of ' + c.def.name,
    Keyword: e => {
      const k = KEYWORDS[e.kw];
      return k ? k.name + ' (' + k.reminder + ')' : e.kw;
    },
  };
  function clause(e, c) {
    const f = OP[e.op];
    return f ? f(e, c) : e.op;
  }
  const effectsText = (L, c) => seq((L || []).map(e => clause(e, c)));
  const hpNote = hp => (hp == null ? '' : ' (Stack HP ' + hp + ')');
  const conds = req => (req || []).map(r => REQ[r] || r).join(' and ');
  // "Condition: cost / targeting; effect" (Yu-Gi-Oh syntax: what comes before ';' is paid / chosen when it is put on the stack)
  const body = (cond, cost, eff) => {
    if (cost && !eff) eff = 'nothing happens';
    return (cond ? cap(cond) + ': ' + (cost ? cost + '; ' : '') + eff : cost ? cap(cost) + '; ' + eff : cap(eff)) + '.';
  };
  const WHEN = (t, c) => {
    const by = [].concat(t.by || []);
    switch (t.on) {
      case 'enter':
        return by.includes('foe')
          ? 'When a card your opponent controls enters' +
              (t.cond === 'foeAdjacent' ? ' adjacent to another card they control' : '')
          : 'When this enters';
      case 'combat':
        return 'At the beginning of your combat step';
      case 'combatEnd':
        return t.cond === 'firstCombat' ? 'After your first combat phase ends' : 'After your combat phase ends';
      case 'damaged':
        return 'Whenever this card takes combat damage';
      case 'turnStart':
        return 'At the start of your turn';
      case 'attack':
        return by.includes('any')
          ? 'Whenever a creature attacks'
          : by.includes('self') && by.includes('foe')
            ? 'When this card or a creature your opponent controls attacks'
            : by.includes('foe')
              ? 'When a creature your opponent controls attacks'
              : 'When this attacks';
    }
    return 'When ' + t.on;
  };
  const IF = {
    extraPaid: () => ', if the additional cost was paid',
    usedMat: t => ', if it was summoned using ' + defName(t.card),
  };
  // one ability -> its machine text. kind: triggers | abilities | passives | rider | spell
  function translateOne(o, kind, def) {
    const c = { def };
    if (kind === 'triggers') {
      const head = WHEN(o, c) + (IF[o.cond] ? IF[o.cond](o) : '');
      return (
        head +
        ': ' +
        (o.targeting ? TARGETING[o.targeting] + '; ' : '') +
        effectsText(o.effects, c) +
        '.' +
        hpNote(o.hp)
      );
    }
    if (kind === 'abilities') {
      const zones = [].concat(o.zone || []),
        head = o.speed + (zones.length ? ', from your ' + zones.map(z => ZONE[z]).join(' or ') : '') + '.';
      c.tgt = o.target ? TARGET[o.target] : o.targeting ? 'it' : null;
      const cost = (o.cost || [])
        .map(e => clause(e, c))
        .concat(o.targeting ? [TARGETING[o.targeting]] : [])
        .join(' and ');
      return head + ' ' + body(conds(o.req), cost, effectsText(o.effects, c)) + hpNote(o.hp);
    }
    if (kind === 'passives') return o.op === 'Keyword' ? clause(o, c) + '.' : 'Passive: ' + clause(o, c) + '.';
    if (kind === 'rider') return 'Damage dealt by this card: ' + clause(o, c) + '.';
    if (kind === 'spell') {
      const d = o,
        tg = d.colTarget
          ? 'target a fully filled column'
          : d.zoneTarget && d.optionalTarget
            ? 'you may target a ' +
              (d.zoneTarget === 'anyCreature' ? 'creature' : 'permanent') +
              (d.stackTarget ? ' or a spell' : '')
            : d.zoneTarget && d.playerTarget
              ? 'target a ' + (d.zoneTarget === 'anyCreature' ? 'creature' : 'permanent') + ' or a player'
              : d.zoneTarget
                ? 'target a ' + (d.zoneTarget === 'anyCreature' ? 'creature' : 'permanent')
                : d.playerTarget
                  ? 'target a player'
                  : '';
      c.tgt = d.colTarget ? 'it' : tg ? 'it' : null;
      let eff = effectsText(d.effects, c);
      if (d.colTarget) eff = eff.replace('exile every card on that column', 'exile every card on it');
      return d.timing + '. ' + body(conds(d.req), tg, eff) + (d.hp ? hpNote(d.hp) : '');
    }
    return '';
  }
  const shown = (o, kind, def) => (o.useOverrideText && o.overrideText ? o.overrideText : translateOne(o, kind, def));
  // the card's ability lists, in display order, as {list, i, o}
  const abilityList = def => [
    ...(def.passives || []).map((o, i) => ({ list: 'passives', i, o })),
    ...(def.triggers || []).map((o, i) => ({ list: 'triggers', i, o })),
    ...(def.rider ? [{ list: 'rider', i: 0, o: def.rider }] : []),
    ...(def.abilities || []).map((o, i) => ({ list: 'abilities', i, o })),
  ];
  // string translate(abilities[]): the shown text of a list of abilities ({list, o} items, or a card definition)
  const translate = (abilities, def) => {
    if (!Array.isArray(abilities)) [def, abilities] = [abilities, abilityList(abilities)];
    return abilities.map(x => shown(x.o, x.list, def)).join(' ');
  };
  return { translate, translateOne, shown, abilityList };
})();
const translate = Translate.translate;
function textParts(def) {
  const P = [],
    add = (list, i, o) => o && o.text && P.push({ key: list + ':' + i, list, i, text: o.text });
  if (def.body) P.push({ key: 'body', list: 'body', i: 0, text: def.body });
  if (def.extraCost && def.extraCost.ap)
    P.push({ key: 'extra', list: 'extra', i: 0, text: 'Additional cost (optional): spend an action point.' });
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
  // Patch4: damage the picked non-player HP target (use with targeting: nonPlayerHp). mods: {nonLethal, temporary}
  damageHp: (amount, mods) => ({
    op: 'DamageHp',
    amount,
    nonLethal: !!(mods && mods.nonLethal),
    temporary: !!(mods && mods.temporary),
  }),
  spendStatus: (kind, label) => ({ op: 'SpendStatus', kind, label }), // cost: remove one `kind` status from this card
  spendAttackCounter: () => ({ op: 'SpendStatus', kind: 'attackCounter', label: 'attack counter' }),
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
  targeting: { adjacentPair: 'adjacentPair', nonPlayerHp: 'nonPlayerHp' }, // trigger field: what it targets when it is put on the stack (the cost / targeting part: condition : cost / targeting ; effect)
  zoneTarget: { anyPermanent: 'anyPermanent', anyCreature: 'anyCreature' }, // spell target: a zone with a card (or a cloud) on it, chosen when the spell is played
  playerTarget: true, // spell flag: a player can be targeted (click a life bar)
  keyword: kw => ({ op: 'Keyword', kw }), // passive: a keyworded ability (KEYWORDS: flash | retaliate); an ordinary ability, so it can be disabled
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
  upTo: (who, from, then, n, types, self) => ({ op: 'UpTo', who, from, then, n, types, self }), // who: me|foe; from: gy|hand; then: toHand|play
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
    // every ability shows its machine text (translate) unless useOverrideText asks for the human rewrite
    Translate.abilityList(d).forEach(x => (x.o.text = Translate.shown(x.o, x.list, d)));
    if (d.type === 'spell') d.body = Translate.shown(d, 'spell', d); // the spell's own effect is an ability of the card too
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
        overrideText: 'Fast. You have lost life: sacrifice this card, then gain 3 life. (Stack HP 2)',
        req: [Fx.req.hurt],
        hp: 2,
        effects: [Fx.gainLife(3), Fx.sacrificeSelf()],
      }),
    ],
  })
);
Cards.add(Fx => Fx.quick('heal', 'Heal', 3, { overrideText: 'Quick. Gain 3 life.', effects: [Fx.gainLife(3)] }));
Cards.add(Fx =>
  Fx.quick('zap', 'Zap', 0, {
    overrideText: 'Quick, 0 HP (still resolves). Deal 1 damage to the opponent.',
    effects: [Fx.dealDamage('player', 1)],
  })
);
Cards.add(Fx =>
  Fx.creature('archer', 'Archer', 3, 2, {
    abilities: [
      Fx.slowAbility('Volley', {
        overrideText: 'Slow. Front row: pay 1 life; deal 2 damage to the opponent. (Stack HP 1)',
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
        overrideText: 'Fast. A creature faces this: sacrifice this card; deal 3 damage to that creature. (Stack HP 0)',
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
        overrideText: 'Slow. Exile your oldest GY card; draw 1. (Stack HP 1)',
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
    overrideText: 'Quick. Deal 3 damage to the stack object beneath it (countered at HP -1 or lower).',
    effects: [Fx.damageStack(3)],
  })
);
Cards.add(Fx =>
  Fx.creature('hummingbird', 'Red Hummingbird', 2, 1, {
    triggers: [
      ovr('When this enters: draw a card.', Fx.trigger.enter(Fx.draw(1))),
      ovr(
        'When this card or an opponent\u2019s creature attacks: you may shift this card to an adjacent empty column.',
        Fx.trigger.attack(['self', 'foe'], Fx.shiftAdjacent())
      ),
    ],
    abilities: [
      Fx.fastAbility('Feather Balm', {
        overrideText: 'Fast, from your GY: exile this card; gain 3 life. (Stack HP 1)',
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
      ovr(
        'Passive. A black cloud covers each of your other zones: your opponent cannot see those zones or the cards on them. Abilities of cards under a cloud appear to come from King Eye. A cloud is a legal target for anything that targets a card or zone there; the effect passes to what is underneath, and with nothing legal underneath it fizzles (nothing is revealed).',
        Fx.obscure(),
        true
      ),
    ],
  })
);
Cards.add(Fx => {
  const spread = Fx.repeat(4, Fx.nearestZone(['self', 'vine-token']), Fx.destroyOnZone(), Fx.createToken('vine'));
  return Fx.creature('vine', 'The Vine', 1, 1, {
    tokens: { vine: Fx.creature('vine-token', 'Vine', 1, 1, { text: 'Token. Vanilla 1/1.' }) },
    triggers: [
      ovr(
        'When this enters: 4 times, pick the closest zone (any row, back-row zones included) not occupied by this card or a Vine token, destroy the card there, and create a Vine token (1/1) on it, even in a zone a creature cannot normally enter.',
        Fx.trigger.enter(spread)
      ),
      ovr('At the start of your turn: do the same.', Fx.trigger.turnStart(spread), true),
    ],
  });
});
Cards.add(Fx =>
  Fx.creature('avatar', 'Avatar of Rabies', 3, 7, {
    triggers: [
      ovr(
        'Whenever a creature attacks: you may shift this card to an adjacent empty column.',
        Fx.trigger.attack(['any'], Fx.shiftAdjacent())
      ),
      ovr(
        'Whenever this card takes combat damage: deal 1 damage to another creature.',
        Fx.trigger.damaged(Fx.damageAnother(1))
      ),
    ],
    rider: ovr(
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
      ovr(
        'At the beginning of your combat step: double this card\u2019s power 5 times.',
        Fx.trigger.combat(Fx.repeat(5, Fx.doublePower()))
      ),
    ],
  })
);
Cards.add(Fx =>
  Fx.creature('boltmaster', 'Bolt Master', 2, 3, {
    triggers: [
      ovr('When this enters: add a Superbolt from your deck to your hand.', Fx.trigger.enter(Fx.fetch('superbolt'))),
    ],
  })
);
Cards.add(Fx =>
  Fx.enchantment('heavensun', 'Heaven and Sun', 5, {
    triggers: [
      ovr(
        'When this enters: choose 5 cards from your deck and exile them (stack HP 7).',
        Object.assign(Fx.trigger.enter(Fx.vaultFromDeck(5)), { hp: 7 })
      ),
      ovr(
        'At the start of your turn: your opponent picks one of those exiled cards; put it into your hand.',
        Fx.trigger.turnStart(Fx.revealVault())
      ),
    ],
  })
);
Cards.add(Fx =>
  Fx.creature('parasite', 'Creeping Parasite', 0, 0, {
    passives: [Fx.keyword('flash')],
    triggers: [
      ovr(
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
        ),
        true
      ),
    ],
  })
);
Cards.add(Fx =>
  Fx.creature('shieldguard', 'Shieldguard', 5, 15, {
    passives: [Fx.keyword('retaliate')],
    abilities: [
      Fx.fastAbility('Swap In', {
        overrideText:
          'Fast, from your hand: after an opposing creature attacks, if you control a creature in that column, return that creature to your hand and put this card into its zone. (Stack HP 1)',
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
    useOverrideText: true,
    overrideText:
      'Quick, 0 HP. Choose one: each card you control gets a red shield counter (cannot be targeted), or each gets a blue shield counter (unaffected by spells and abilities that do not target it; attacks still hit it). You cannot gain life for the rest of the game.',
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
    extraCost: { ap: true },
    tokens: {
      drummer: Fx.creature('drummer-token', 'Drummer', 3, 3, {
        passives: [Fx.aura('own', 1, 1)],
        overrideText: 'Token. Cards you control in this column and the adjacent columns get +1/+1.',
      }),
    },
    passives: [
      Fx.keyword('flash'),
      ovr(
        'Passive: cards your opponent controls in this column and the adjacent columns get -1/-1.',
        Fx.aura('foe', -1, -1)
      ),
    ],
    triggers: [
      ovr(
        'When this enters, if the additional cost was paid: put a creature from your GY into play; it attacks immediately.',
        Object.assign(Fx.trigger.enter(Fx.pickCard('myGYCreatures', 'summonAttack')), { cond: 'extraPaid' })
      ),
      ovr(
        'When this enters: create a Drummer token (3/3; cards you control in its column and the adjacent ones get +1/+1).',
        Fx.trigger.enter(Fx.placeToken('drummer'))
      ),
    ], // later in the array = higher on the stack = resolves first: the Drummer exists before the creature attacks
  })
);
Cards.add(Fx =>
  Fx.creature('shark', 'Deep Sea Shark', 6, 4, {
    triggers: [
      ovr(
        'When this enters: you may pay 3 life; skip your opponent next combat phase (pressing combat becomes End turn instead).',
        Fx.trigger.enter(
          Fx.modes(
            Fx.mode('Pay 3 life: skip opponent next combat', 0, 99, Fx.skipFoeCombat(3)),
            Fx.mode('Do nothing', 0, 99)
          )
        ),
        true
      ),
      ovr(
        'After your first combat phase ends: you may have your opponent draw 5 cards (cost; does nothing if they cannot); enter a second combat phase, where creatures can attack again.',
        Object.assign(
          Fx.trigger.combatEnd(
            Fx.modes(
              Fx.mode('Opponent draws 5: second combat phase', 0, 99, Fx.secondCombat()),
              Fx.mode('Do nothing', 0, 99)
            )
          ),
          { cond: 'firstCombat' }
        ),
        true
      ),
    ],
  })
);
Cards.add(Fx =>
  Fx.quick('intuition', 'Quick Intuition', 4, {
    zoneTarget: Fx.zoneTarget.anyCreature,
    optionalTarget: true,
    stackTarget: true,
    overrideText:
      'Quick. Draw until you have 7 cards in hand. You may target a creature or a spell: damage to it is denied until the end of this turn. (Stack HP 4)',
    effects: [Fx.drawUntil(7), Fx.noDamage()],
    abilities: [
      Fx.fastAbility('Cancel Attack', {
        overrideText:
          'From your GY, Fast, when your opponent attacks: exile this card; cancel that attack. (Stack HP 1)',
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
    overrideText:
      'Slow, 0 HP. In order: you draw 2; return up to 2 cards from your GY to your hand; put up to 2 creatures/enchantments from your hand into play. Then your opponent returns up to 2 cards from their GY to their hand, puts up to 2 creatures/enchantments from their GY into play, and draws 2.',
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
    useOverrideText: true,
    say: 'Reveal an extra deck creature whose conditions are met and exile its materials from your GY; summon that creature.',
    effects: [Fx.fusion({ from: ['gy'], pay: 'exile', summon: true, pick: 'conditions', cond: 'must' })],
    abilities: [
      Fx.fastAbility('Undo Fusion', {
        overrideText:
          'Fast, from your GY: exile this card; return an extra deck creature from your GY to the extra deck, and return the materials used to summon it from exile to your hand. (Stack HP 1)',
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
    useOverrideText: true,
    say: 'Reveal an extra deck creature and send its materials from your field, hand or deck to the GY; summon it if its conditions are met (ignored if the materials come only from your hand and field).',
    effects: [
      Fx.fusion({ from: ['board', 'hand', 'deck'], pay: 'gy', summon: true, pick: 'fusable', cond: 'ignoreHB' }),
    ],
    abilities: [
      Fx.fastAbility('Recover', {
        overrideText: 'Fast, from your deck or GY: spend an action point; add this card to your hand. (Stack HP 1)',
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
      ovr(
        'When this enters: reveal an extra deck creature; if its conditions are met, put its materials from your deck into your hand.',
        Object.assign(
          Fx.trigger.enter(Fx.fusion({ from: ['deck'], pay: 'hand', summon: false, pick: 'any', cond: 'must' })),
          { hp: 1 }
        ),
        true
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
      ovr(
        'When this enters: target two adjacent cards your opponent controls; they send one of them to the GY.',
        Object.assign(Fx.trigger.enter(strike), { hp: 1, targeting: Fx.targeting.adjacentPair })
      ),
      ovr(
        'When this attacks: target two adjacent cards your opponent controls; they send one of them to the GY.',
        Object.assign(Fx.trigger.attack(['self'], strike), { hp: 1, targeting: Fx.targeting.adjacentPair })
      ),
      ovr(
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
      ovr(
        'When this enters, if it was summoned using Heaven and Sun: look at the top 3 cards of your opponent\u2019s deck and put them back on top in any order.',
        Object.assign(Fx.trigger.enter(Fx.reorderTop('foe', 3)), { cond: 'usedMat', card: 'heavensun', hp: 5 })
      ),
      ovr(
        'When this enters: declare a card name, then look at the top card of your opponent\u2019s deck; if it has that name you may play it, and repeat this effect.',
        Object.assign(Fx.trigger.enter(Fx.declareName()), { hp: 10 })
      ),
      ovr('At the start of your turn: draw a card.', Fx.trigger.turnStart(Fx.draw(1))),
    ],
  })
);
Cards.add(Fx =>
  Fx.creature('vanguard', 'Vanguard', 2, 3, {
    // Patch4. Stats and stack HP are placeholders (OPEN_QUESTIONS C6)
    abilities: [
      Fx.fastAbility('Hold the Line', {
        overrideText:
          'Fast. Spend an attack counter on this card, target something with HP that is not a player: deal 3 temporary non-lethal damage to it. (Stack HP 1)',
        cost: [Fx.spendAttackCounter()],
        targeting: Fx.targeting.nonPlayerHp,
        hp: 1,
        effects: [Fx.damageHp(3, { nonLethal: true, temporary: true })],
      }),
    ],
  })
);
const DEFS = Cards.list;

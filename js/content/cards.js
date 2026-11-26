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
const spellDef = (timing, id, name, hp, rest = {}) => Object.assign({ id, name, type: 'spell', timing, hp }, rest);
// ---- Card text. The text shown by default is GENERATED from the card's data: translate(abilities[]) turns the ability DATA
// (the JavaScript) into English, every stack ability with its Stack HP. The human-written descriptions live in ONE place,
// js/content/cardDescription.json (CardText), keyed by card id and part key; the inspector can switch to them (CardText.setMode).
// Switching never edits a card: def.text and o.text always hold the generated text, textParts(def, mode) picks per call.
// Keyworded abilities are ordinary abilities with a short name, so they can be reused and referenced (and disabled, like any other ability).
// Flash is a passive (it changes how the card is played); Retaliate is a TRIGGER abbreviated by its keyword (Fx.retaliate): it goes on
// the stack and resolves like every other trigger.
const KEYWORDS = {
  flash: { name: 'Flash', zone: 'hand', reminder: 'play it as a Quick spell; it does not spend an action point' },
  retaliate: {
    name: 'Retaliate',
    zone: 'board',
    reminder:
      'whenever this takes combat or effect damage, it deals damage equal to its power to the source: the damaging creature, or the controller of the spell',
  },
  // Duplicate N (permanent mode): an enter trigger whose Stack HP is the card's HP; the copies have no Duplicate
  duplicate: {
    name: 'Duplicate',
    zone: 'board',
    reminder: o =>
      o.on === 'cast'
        ? 'when this spell is put on the stack, put ' +
          (o.n > 1 ? o.n + ' token copies' : 'a token copy') +
          ' of it on the stack, without Duplicate, with the same targets and modifications'
        : 'when this enters, create ' +
          (o.n > 1 ? o.n + ' token copies' : 'a token copy') +
          ' of it, without Duplicate, on free zones of your row that you pick',
  },
};
const kwName = o => KEYWORDS[o.kw].name + (o.n > 1 ? ' ' + o.n : ''); // "Duplicate 2"
const kwReminder = o =>
  typeof KEYWORDS[o.kw].reminder === 'function' ? KEYWORDS[o.kw].reminder(o) : KEYWORDS[o.kw].reminder;
const stackHp = a => (a.hp == null ? 1 : a.hp); // a trigger / activated ability without an explicit HP has Stack HP 1 (Cards.add writes it into the data)
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
  const VALUE = { foeCreatures: 'creature your opponent controls' }; // the counted things of a value (Fx.count): 'draw a card for each ...'
  const TARGET = { opposingFront: 'the creature facing this card', attacker: 'the attacking creature' };
  const TARGETING = {
    adjacentPair: 'target two adjacent cards your opponent controls',
    nonPlayerHp: 'target something with HP that is not a player',
    secretZone: 'secretly target an empty zone',
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
    Draw: e =>
      typeof e.n === 'object'
        ? who(e, 'draw a card for each ' + VALUE[e.n.value], 'your opponent draws a card for each ' + VALUE[e.n.value])
        : who(e, 'draw ' + cards(e.n), 'your opponent draws ' + cards(e.n)),
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
    RevealHand: () => 'reveal your hand',
    SecretGrant: e =>
      (e.by === 'foe'
        ? 'your opponent secretly selects one of the revealed cards'
        : 'secretly select one of those cards') +
      '; it secretly gains ' +
      (GRANT_TEXT[e.what] || e.what) +
      ' (the status stays when the card changes zones)',
    RevealFoeHand: () => 'reveal your opponent\u2019s hand',
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
    ChooseMode: (e, c) => {
      // each mode by its effects; modes unlocked by the number of creatures the opponent controls say so (Fx.mode min / max)
      const ranged = e.modes.some(m => m.min > 0 || m.max < 99),
        range = m => (m.max >= 99 ? m.min + '+' : m.min === m.max ? String(m.min) : m.min + '-' + m.max),
        L = e.modes.map(m => (ranged ? range(m) + ': ' : '') + (effectsText(m.effects, c) || 'nothing happens'));
      return ranged
        ? 'choose one effect unlocked by the number of creatures your opponent controls (' + L.join('; ') + ')'
        : 'choose one: ' + L.join('; or ');
    },
    PickCard: (e, c) => {
      const t = PICK_THEN[e.then];
      return (PICK_FROM[e.from] || 'choose a card') + ' and ' + (typeof t === 'function' ? t(e) : t || e.then); // chosen as it resolves: not a target (no ';')
    },
    DestroyAll: () => 'destroy all cards on the board',
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
    SetTrap: (e, c) => 'that zone secretly gains \u201c' + ((c.def.traps || [])[e.trap || 0] || {}).text + '\u201d',
    PlaceToken: (e, c) => 'put a ' + tokName(c, e.token) + ' on a free front zone',
    Duplicate: e =>
      'create ' +
      (e.n > 1 ? e.n + ' token copies' : 'a token copy') +
      ' of this card, without Duplicate, on free zones of your row',
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
    Betray: () => 'when you play this card, switch its controller',
    Obscure: () =>
      'a black cloud covers each of your other zones: your opponent cannot see those zones or the cards on them, and abilities from under a cloud appear to come from this card',
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
      case 'damaged': {
        const ty = t.types || ['combat'];
        return 'Whenever this card takes ' + (ty.length === 1 ? ty[0] + ' damage' : ty.join(' or ') + ' damage');
      }
      case 'turnStart':
        return 'At the start of your turn';
      case 'cast':
        return 'When this spell is put on the stack';
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
      if (o.kw && KEYWORDS[o.kw]) return kwName(o) + ' (' + kwReminder(o) + ').' + hpNote(stackHp(o)); // a keyworded trigger: its keyword and reminder
      const head = WHEN(o, c) + (IF[o.cond] ? IF[o.cond](o) : '');
      return (
        head +
        ': ' +
        (o.targeting ? TARGETING[o.targeting] + '; ' : '') +
        effectsText(o.effects, c) +
        '.' +
        hpNote(stackHp(o))
      );
    }
    if (kind === 'traps') {
      // an ability a card gives a zone (Zapping Ground): "When a card enters this zone: consume this status; <effect>."
      c.tgt = 'that card';
      return (
        'When a card enters this zone: consume this status; ' + effectsText(o.effects, c) + '.' + hpNote(stackHp(o))
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
      return head + ' ' + body(conds(o.req), cost, effectsText(o.effects, c)) + hpNote(stackHp(o));
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
      const cost = (d.cost || [])
        .map(e => clause(e, c))
        .concat(tg ? [tg] : [])
        .join(' and '); // a spell's costs (paid when it is played: Secret Twin reveals the hand), then its targeting
      return d.timing + '. ' + body(conds(d.req), cost, eff) + hpNote(d.hp || 0);
    }
    return '';
  }
  const shown = (o, kind, def) => translateOne(o, kind, def); // always the generated text (the written one: CardText)
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
// ---- CardText: the written descriptions, one database (js/content/cardDescription.json), keyed by card id then part key
// (the keys of textParts: 'body' = a spell's own effect, 'passives:0', 'triggers:1', 'rider', 'abilities:0'). A card's identity is its
// id; the stored name is only a check (CardText.problems reports ids, names or part keys the card data does not have).
// mode 'generated' (default) | 'written'. A part without a written text shows its generated text in both modes.
const CardText = (function () {
  let db = null,
    mode = 'generated';
  const listeners = [];
  return {
    URL: 'js/content/cardDescription.json',
    load(json) {
      db = json && json.cards ? json : { cards: {} };
      listeners.forEach(f => f());
      return db;
    },
    loaded: () => !!db,
    get mode() {
      return mode;
    },
    setMode(m) {
      mode = m === 'written' ? 'written' : 'generated';
      listeners.forEach(f => f());
    },
    onChange: f => listeners.push(f),
    written: (def, key) => {
      const e = db && db.cards[def.id];
      return e && e.text && typeof e.text[key] === 'string' ? e.text[key] : null;
    },
    entry: id => (db && db.cards[id]) || null,
    // every database entry must name a real card (or token), by its id, with the same name, and only part keys that card has
    problems(defs) {
      const out = [],
        all = new Map();
      const add = d => {
        all.set(d.id, d);
        Object.values(d.tokens || {}).forEach(add);
      };
      defs.forEach(add);
      for (const [id, e] of Object.entries((db && db.cards) || {})) {
        const d = all.get(id);
        if (!d) {
          out.push(id + ': no card with this id');
          continue;
        }
        if (e.name !== d.name) out.push(id + ': name "' + e.name + '" is not the card name "' + d.name + '"');
        const keys = new Set(textParts(d, 'generated').map(p => p.key));
        for (const k of Object.keys(e.text || {})) if (!keys.has(k)) out.push(id + ': the card has no part ' + k);
      }
      return out;
    },
  };
})();
// does playing this card spend an action point (the Sim's slowish rule: a permanent without Flash, or a Slow spell)? Tokens and
// extra deck cards are never played from a hand, so they show no cost
const playsForAP = def =>
  !def.isToken &&
  !def.extra &&
  def.ap !== 0 && // a card that costs no action point (Secret Twin: a Slow spell, 0 AP)
  def.type !== 'ability' &&
  (def.type === 'spell'
    ? def.timing === 'Slow'
    : !(def.passives || []).some(p => p.op === 'Keyword' && p.kw === 'flash'));
// the card text as parts (one per trigger / ability / passive / rider). mode: CardText.mode unless given; the card is never changed
function textParts(def, mode) {
  const P = [],
    add = (list, i, o) => o && o.text && P.push({ key: list + ':' + i, list, i, text: o.text });
  if (playsForAP(def)) P.push({ key: 'cost', list: 'cost', i: 0, text: 'Cost: 1 action point.' }); // playing it spends an action point
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
  if (!P.length && def.text) P.push({ key: 'body', list: 'body', i: 0, text: def.text }); // fixtures: plain text only
  if ((mode || CardText.mode) === 'written')
    return P.map(p => {
      const w = CardText.written(def, p.key);
      return w == null ? p : Object.assign({}, p, { text: w, written: true });
    });
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
  draw: (n, who) => ({ op: 'Draw', n, who }), // n: a number or a counted value (Fx.count.*)
  count: { foeCreatures: { value: 'foeCreatures' } }, // values counted when the effect resolves (js/sim/values.js)
  damageStack: amount => ({ op: 'DamageStack', amount }),
  // damage the picked non-player HP target (use with targeting: nonPlayerHp). mods: {nonLethal, temporary}
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
  revealHand: () => ({ op: 'RevealHand' }), // spell cost: reveal your hand to your opponent (Secret Twin); the cards stay revealed while in the hand
  revealFoeHand: () => ({ op: 'RevealFoeHand' }), // effect: your opponent's hand is revealed to you (each card stays revealed while in that hand)
  // effect: someone secretly selects a card and it secretly gains `what` (a grant: GRANTS below). by 'foe' = the spell's opponent picks among
  // the cards the cost revealed (Secret Twin), by 'self' = its controller picks among the opponent's hand (Unexpected Betrayal)
  secretGrant: (what, by, from) => ({ op: 'SecretGrant', what, by, from }),
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
    damaged: (...effects) => ({ on: 'damaged', effects }), // this card takes combat damage (types: ['combat', 'effect'] widens it)
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
  targeting: { adjacentPair: 'adjacentPair', nonPlayerHp: 'nonPlayerHp', secretZone: 'secretZone' }, // trigger field: what it targets when it is put on the stack (the cost / targeting part: condition : cost / targeting ; effect)
  zoneTarget: { anyPermanent: 'anyPermanent', anyCreature: 'anyCreature' }, // spell target: a zone with a card (or a cloud) on it, chosen when the spell is played
  playerTarget: true, // spell flag: a player can be targeted (click a life bar)
  keyword: kw => ({ op: 'Keyword', kw }), // passive: a keyworded passive (KEYWORDS: flash); an ordinary ability, so it can be disabled
  // Retaliate is a TRIGGER abbreviated by its keyword: whenever this card takes combat or effect damage it goes on the stack;
  // it resolves like any trigger (op Retaliate: damage equal to this card's power to the source). Retaliate damage never retaliates.
  retaliate: () => ({
    on: 'damaged',
    kw: 'retaliate',
    name: 'Retaliate',
    types: ['combat', 'effect'],
    effects: [{ op: 'Retaliate' }],
  }),
  rider: { inheritAbilities: () => ({ op: 'InheritAbilities' }) }, // damage this card deals: the victim loses its abilities and gains this card's.
  colTarget: { full: 'fullColumn' }, // spell target: a column (chosen when the spell is played)
  betray: () => ({ op: 'Betray' }), // passive (Unexpected Betrayal's grant): when its owner plays it, the other player controls it
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
  // Duplicate N (permanent mode): when this enters (Stack HP = the card's HP, set by Cards.derive), create N token copies on free zones of
  // the controller's row, picked by the controller (fewer free zones = fewer copies). Cards.add makes the copy: def.tokens.duplicate
  duplicate: (n = 1) => ({ on: 'enter', kw: 'duplicate', name: 'Duplicate', n, effects: [{ op: 'Duplicate', n }] }),
  // Duplicate N (spell mode): when the spell is put on the stack (Stack HP = the spell's HP), N token copies of it go on the stack
  duplicateSpell: (n = 1) => ({
    on: 'cast',
    zone: 'stack',
    kw: 'duplicate',
    name: 'Duplicate',
    n,
    effects: [{ op: 'Duplicate', n }],
  }),
  // secrets (js/sim/secrets.js). setTrap: the zone picked by targeting secretZone secretly gains def.traps[trap]. trap: an ability of a ZONE,
  // "when a card enters this zone: consume this status (cost); effects" (target = the card that entered); controlled by who placed it
  setTrap: (trap = 0) => ({ op: 'SetTrap', trap }),
  trap: (...effects) => ({ on: 'zoneEnter', target: 'entered', effects }),
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
    bothDrew: n => ({
      op: 'BothDrewMoreThan',
      n,
      text: 'both players have drawn ' + (n + 1) + ' or more cards this game (the opening hand does not count)',
    }), // n = "more than n": each player needs n + 1 draws
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
    const d = this.build(factory(Fx));
    this.grantsOf(d);
    this.list.push(d);
  },
  // GRANTS: an ability a card can gain from a status (kind 'grant', what): the card with it is precomputed here (generated text included)
  // as d.grants[what], a definition of its own (id '<id>+<what>', dupOf: the card it extends); the Sim registers it and abDef picks it
  grantsOf(d) {
    if (d.type === 'ability' || d.isToken) return d;
    d.grants = {};
    for (const what in GRANTS) {
      const g = GRANTS[what](d);
      if (g)
        d.grants[what] = this.build(
          Object.assign({}, d, g, { id: d.id + '+' + what, grantOf: d.id, grants: undefined })
        );
    }
    return d;
  },
  build(d) {
    if ((d.triggers || []).some(t => t.kw === 'duplicate')) {
      // the token copy: the card without Duplicate (the copy never makes copies itself)
      const { tokens, ...rest } = d;
      d.tokens = Object.assign({}, tokens, {
        duplicate: Object.assign({}, rest, {
          id: d.id + '-token',
          triggers: d.triggers.filter(t => t.kw !== 'duplicate'),
        }),
      });
    }
    this.derive(d);
    Object.values(d.tokens || {}).forEach(t => {
      t.isToken = true; // a token is never played: no action point cost in its text
      this.derive(t);
    }); // tokens get their generated text too
    return d;
  },
  derive(d) {
    // every stack ability states its HP in the data (the default 1 is written in, so the text and the Sim read the same number)
    for (const t of d.triggers || []) if (t.kw === 'duplicate' && t.hp == null) t.hp = d.hp || 0; // Duplicate's Stack HP is the card's HP
    for (const k of ['triggers', 'abilities', 'traps']) (d[k] || []).forEach(o => (o.hp = stackHp(o)));
    (d.traps || []).forEach(o => (o.text = Translate.translateOne(o, 'traps', d))); // before the triggers: their text quotes it
    // every ability shows its generated text; the written descriptions are in CardText
    Translate.abilityList(d).forEach(x => (x.o.text = Translate.shown(x.o, x.list, d)));
    if (d.type === 'spell') d.body = Translate.shown(d, 'spell', d); // the spell's own effect is an ability of the card too
    d.text = textParts(d, 'generated')
      .map(x => x.text)
      .join(' '); // the card text is DERIVED from its abilities
  },
};
// what a 'grant' status adds to a card (null: nothing for this card). Duplicate: the permanent mode on a creature / enchantment, the
// spell mode on a spell (Secret Twin)
const GRANTS = {
  duplicate: d => ({
    triggers: (d.triggers || []).concat([
      Object.assign(d.type === 'spell' ? Fx.duplicateSpell(1) : Fx.duplicate(1), { grant: 'duplicate' }),
    ]),
  }),
  betray: d => ({ passives: (d.passives || []).concat([Object.assign(Fx.betray(), { grant: 'betray' })]) }),
};
const GRANT_TEXT = { duplicate: 'Duplicate', betray: '\u201cwhen you play this card, switch its controller\u201d' };
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
FIXTURES.forEach(d => Cards.grantsOf(d)); // a fixture can gain a grant too (its text stays the written placeholder)
// ---- The card pool. Each card is an independent module: a factory that receives the API and returns its definition.
// Order matters: it is the order of the 'Full Pool' deck.
Cards.add(Fx =>
  Fx.enchantment('ward', 'Ward', 4, {
    abilities: [
      Fx.fastAbility('Restore', {
        req: [Fx.req.hurt],
        hp: 2,
        effects: [Fx.gainLife(3), Fx.sacrificeSelf()],
      }),
    ],
  })
);
Cards.add(Fx => Fx.quick('heal', 'Heal', 3, { effects: [Fx.gainLife(3)] }));
Cards.add(Fx =>
  Fx.quick('zap', 'Zap', 0, {
    effects: [Fx.dealDamage('player', 1)],
  })
);
Cards.add(Fx =>
  Fx.creature('archer', 'Archer', 3, 2, {
    abilities: [
      Fx.slowAbility('Volley', {
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
    effects: [Fx.exileColumn(), Fx.makeColumnUnusable(), Fx.returnToHand()],
  })
);
Cards.add(Fx =>
  Fx.quick('bolt', 'Bolt', 2, {
    req: [Fx.req.stack],
    effects: [Fx.damageStack(3)],
  })
);
Cards.add(Fx =>
  Fx.creature('hummingbird', 'Red Hummingbird', 2, 1, {
    triggers: [Fx.trigger.enter(Fx.draw(1)), Fx.trigger.attack(['self', 'foe'], Fx.shiftAdjacent())],
    abilities: [
      Fx.fastAbility('Feather Balm', {
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
    passives: [Fx.obscure()],
  })
);
Cards.add(Fx => {
  const spread = Fx.repeat(4, Fx.nearestZone(['self', 'vine-token']), Fx.destroyOnZone(), Fx.createToken('vine'));
  return Fx.creature('vine', 'The Vine', 1, 1, {
    tokens: { vine: Fx.creature('vine-token', 'Vine', 1, 1, { text: 'Token. Vanilla 1/1.' }) },
    triggers: [Fx.trigger.enter(spread), Fx.trigger.turnStart(spread)],
  });
});
Cards.add(Fx =>
  Fx.creature('avatar', 'Avatar of Rabies', 3, 7, {
    triggers: [Fx.trigger.attack(['any'], Fx.shiftAdjacent()), Fx.trigger.damaged(Fx.damageAnother(1))],
    rider: Fx.rider.inheritAbilities(),
  })
);
Cards.add(Fx =>
  Fx.quick('bandages', 'Throwing Bandages', 10, {
    zoneTarget: Fx.zoneTarget.anyPermanent,
    effects: [Fx.removeDamage(7)],
  })
);
Cards.add(Fx =>
  Fx.slow('superbolt', 'Superbolt', 3, {
    zoneTarget: Fx.zoneTarget.anyPermanent,
    playerTarget: Fx.playerTarget,
    effects: [Fx.dealDamage('target', 20)],
  })
);
Cards.add(Fx =>
  Fx.slow('grainfall', 'GrainFall', 2, {
    playerTarget: Fx.playerTarget,
    effects: [Fx.mill(10)],
  })
);
Cards.add(Fx =>
  Fx.creature('blackhawk', 'Black Hawk', 1, 0, {
    triggers: [Fx.trigger.combat(Fx.repeat(5, Fx.doublePower()))],
  })
);
Cards.add(Fx =>
  Fx.creature('boltmaster', 'Bolt Master', 2, 3, {
    triggers: [Fx.trigger.enter(Fx.fetch('superbolt'))],
  })
);
Cards.add(Fx =>
  Fx.enchantment('heavensun', 'Heaven and Sun', 5, {
    triggers: [Object.assign(Fx.trigger.enter(Fx.vaultFromDeck(5)), { hp: 7 }), Fx.trigger.turnStart(Fx.revealVault())],
  })
);
Cards.add(Fx =>
  Fx.creature('parasite', 'Creeping Parasite', 0, 0, {
    passives: [Fx.keyword('flash')],
    triggers: [
      Fx.trigger.enter(
        Fx.modes(
          Fx.mode('0: look at their hand, send a card to the GY', 0, 99, Fx.pickCard('foeHand', 'toGY')),
          Fx.mode('1+: 4 damage to any target', 1, 99, Fx.pickCard('anyTarget', 'damage', 4)),
          Fx.mode('2+: return a card they control to hand', 2, 99, Fx.pickCard('foeBoard', 'toHand')),
          Fx.mode('3+: put a creature from hand, GY or exile into play', 3, 99, Fx.pickCard('myCreatures', 'summon')),
          Fx.mode('4+: draw cards equal to their creature count', 4, 99, Fx.draw(Fx.count.foeCreatures)),
          Fx.mode('5: destroy all cards on the board', 5, 99, Fx.destroyAll())
        )
      ),
    ],
  })
);
Cards.add(Fx =>
  Fx.creature('shieldguard', 'Shieldguard', 5, 15, {
    triggers: [Fx.retaliate()], // a keyworded TRIGGER (on the stack, answerable), not a passive
    abilities: [
      Fx.fastAbility('Swap In', {
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
      }),
    },
    passives: [Fx.keyword('flash'), Fx.aura('foe', -1, -1)],
    triggers: [
      Object.assign(Fx.trigger.enter(Fx.pickCard('myGYCreatures', 'summonAttack')), { cond: 'extraPaid' }),
      Fx.trigger.enter(Fx.placeToken('drummer')),
    ], // later in the array = higher on the stack = resolves first: the Drummer exists before the creature attacks
  })
);
Cards.add(Fx =>
  Fx.creature('shark', 'Deep Sea Shark', 6, 4, {
    triggers: [
      Fx.trigger.enter(
        Fx.modes(
          Fx.mode('Pay 3 life: skip opponent next combat', 0, 99, Fx.skipFoeCombat(3)),
          Fx.mode('Do nothing', 0, 99)
        )
      ),
      Object.assign(
        Fx.trigger.combatEnd(
          Fx.modes(
            Fx.mode('Opponent draws 5: second combat phase', 0, 99, Fx.secondCombat()),
            Fx.mode('Do nothing', 0, 99)
          )
        ),
        { cond: 'firstCombat' }
      ),
    ],
  })
);
Cards.add(Fx =>
  Fx.quick('intuition', 'Quick Intuition', 4, {
    zoneTarget: Fx.zoneTarget.anyCreature,
    optionalTarget: true,
    stackTarget: true,
    effects: [Fx.drawUntil(7), Fx.noDamage()],
    abilities: [
      Fx.fastAbility('Cancel Attack', {
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
    effects: [Fx.fusion({ from: ['gy'], pay: 'exile', summon: true, pick: 'conditions', cond: 'must' })],
    abilities: [
      Fx.fastAbility('Undo Fusion', {
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
    effects: [
      Fx.fusion({ from: ['board', 'hand', 'deck'], pay: 'gy', summon: true, pick: 'fusable', cond: 'ignoreHB' }),
    ],
    abilities: [
      Fx.fastAbility('Recover', {
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
      Object.assign(
        Fx.trigger.enter(Fx.fusion({ from: ['deck'], pay: 'hand', summon: false, pick: 'any', cond: 'must' })),
        { hp: 1 }
      ),
    ],
  })
);
Cards.add(Fx => Fx.creature('shieldarmy', 'Shield Army', 0, 10, { triggers: [Fx.duplicate(2)] }));
Cards.add(Fx => {
  // When this enters and at the start of your turn: secretly target an empty zone; that zone secretly gains the trap (it stays after this leaves)
  const arm = on => Object.assign(on(Fx.setTrap(0)), { hp: 1, targeting: Fx.targeting.secretZone });
  return Fx.enchantment('zapping', 'Zapping Ground', 6, {
    traps: [Object.assign(Fx.trap(Fx.dealDamage('target', 1)), { name: 'Zap', hp: 2 })],
    triggers: [arm(Fx.trigger.enter), arm(Fx.trigger.turnStart)],
  });
});
// Secret Twin: Slow, 0 AP. Cost: reveal your hand. Your opponent secretly selects one of those cards; it secretly gains Duplicate
Cards.add(Fx =>
  Fx.slow('secrettwin', 'Secret Twin', 1, {
    ap: 0,
    cost: [Fx.revealHand()],
    effects: [Fx.secretGrant('duplicate', 'foe', 'shown')],
  })
);
// Unexpected Betrayal: Slow, 1 AP. Reveal your opponent's hand; secretly select one of those cards; it secretly gains the passive
// "when you play this card, switch its controller" (js/sim/stack.js betray)
Cards.add(Fx =>
  Fx.slow('betrayal', 'Unexpected Betrayal', 1, {
    effects: [Fx.revealFoeHand(), Fx.secretGrant('betray', 'self', 'foeHand')],
  })
);
// ---- Extra deck creatures (keep them last: the extra deck of the 'Full Pool' deck is in this order)
Cards.add(Fx => {
  const strike = Fx.sendAdjacentPair();
  return Fx.exCreature('widowmaker', 'Widow Maker', 6, 7, {
    conditions: [Fx.exCond.lostLife()],
    materials: [Fx.mat('creature', 2, ['atk', 'hp'])],
    triggers: [
      Object.assign(Fx.trigger.enter(strike), { hp: 1, targeting: Fx.targeting.adjacentPair }),
      Object.assign(Fx.trigger.attack(['self'], strike), { hp: 1, targeting: Fx.targeting.adjacentPair }),
      Object.assign(Fx.trigger.foeEnter(Fx.pickCard('myBoardCreatures', 'attack')), { cond: 'foeAdjacent', hp: 0 }),
    ],
  });
});
Cards.add(Fx =>
  Fx.exCreature('librarian', 'L4: The Librarian', 10, 10, {
    conditions: [Fx.exCond.bothDrew(7)],
    materials: [Fx.mat('creature', 1), Fx.mat('enchantment', 1)],
    triggers: [
      Object.assign(Fx.trigger.enter(Fx.reorderTop('foe', 3)), { cond: 'usedMat', card: 'heavensun', hp: 5 }),
      Object.assign(Fx.trigger.enter(Fx.declareName()), { hp: 10 }),
      Fx.trigger.turnStart(Fx.draw(1)),
    ],
  })
);
Cards.add(Fx =>
  Fx.creature('vanguard', 'Vanguard', 2, 3, {
    // Stats and stack HP are placeholders (OPEN_QUESTIONS C6)
    abilities: [
      Fx.fastAbility('Hold the Line', {
        cost: [Fx.spendAttackCounter()],
        targeting: Fx.targeting.nonPlayerHp,
        hp: 1,
        effects: [Fx.damageHp(3, { nonLethal: true, temporary: true })],
      }),
    ],
  })
);
const DEFS = Cards.list;

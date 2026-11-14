// sim.js - Simulation: rules, stack, combat, effects, API validation (no THREE, no DOM)
// =====================================================================
// SIMULATION: plain serialisable data + pure functions. No THREE, no DOM,
// no view/camera concepts. Commands in, events out. Runs headless.
// =====================================================================
const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)){ Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };
deepFreeze(DEFS); deepFreeze(TYPES);                // CardDefinitions are immutable design data
const Sim = (function(){
  const other = p => p === 'Player' ? 'Opponent' : 'Player';
  let byId = {};                                      // def id -> definition (filled by create)
  // ---- STATUSES: ONE ordered list per card (c.statuses) and per player (s.players[p].statuses). Newest is applied last; HP / ATK / life are folds over the list.
  // A removed status stays in the list (removed:{why,turn,seq}) and is ignored by every fold. Optional fields: zone (where it lives, default 'board'; it is removed when the card leaves that zone unless keep:true),
  // req (re-checked by recalc; fails -> removed), link (seq of another status on the same card; removed when that one is), expires ('turnEnd').
  const stOf = o => o.statuses || (o.statuses = []);
  const live = o => stOf(o).filter(x => !x.removed);
  const addStatus = (s, o, st) => { st = Object.assign({turn:s.turn}, st); st.seq = ++s.seq; st.removed = null; stOf(o).push(st); return st; };
  const removeStatus = (s, st, why) => { if (st && !st.removed) st.removed = {why, turn:s.turn, seq:++s.seq}; };
  const clearStatuses = (s, o, why) => live(o).forEach(x => { if (!x.keep) removeStatus(s, x, why); });
  const hasSt = (o, kind, f) => !!o && live(o).some(x => x.kind === kind && (!f || f(x)));
  const abDef = c => { const d = live(c).filter(x => x.kind === 'ability').pop(); return d ? byId[d.to] : c.def; };   // ability layer: the newest active 'ability' status decides; c.def is never edited
  const isRevealed = (c, p) => hasSt(c, 'revealed', x => x.to === p);
  const PL = (s, p) => s.players[p];
  const lifeOf = (s, p) => live(PL(s, p)).reduce((n, x) => n + (x.kind === 'life' ? x.amount : x.kind === 'damage' || x.kind === 'paid' ? -x.amount : 0), s.maxLife);   // fold of the player's list
  const syncLife = (s, p) => { s.life[p] = lifeOf(s, p); };   // s.life is a cache of the fold: never write it directly
  const dmgs = c => live(c).filter(x => x.kind === 'damage');
  const attackedIds = s => Object.values(s.cards).flatMap(c => live(c).filter(x => x.kind === 'attacked').map(x => [x.seq, c.iid])).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  function describe(st){
    const by = st.srcName ? ' from ' + st.srcName : '', when = ' \u00b7 turn ' + st.turn + ', #' + st.seq, sg = n => (n >= 0 ? '+' : '') + n;
    const t = {damage: () => 'Damage ' + st.amount + (st.orig != null && st.orig !== st.amount ? ' (was ' + st.orig + ')' : '') + by + ' \u00b7 ' + st.type, life: () => 'Life +' + st.amount + by, paid: () => 'Life paid ' + st.amount + ' for ' + st.srcName,
      mod: () => (st.srcName || 'Effect') + ': ' + sg(st.atk) + '/' + sg(st.hp) + ' while in range', atkMul: () => 'Power x' + st.n + by, shield: () => (st.color === 'red' ? 'Red shield: cannot be targeted' : 'Blue shield: unaffected by spells and abilities that do not target it (attacks still hit)') + by,
      ability: () => 'Ability replaced: uses the abilities of ' + byId[st.to].name + ' (ends when that damage is removed)', nodamage: () => 'Damage is denied until the end of the turn' + by, revealed: () => 'Revealed to ' + st.to + ' while it stays in hand',
      vault: () => 'Exiled by it: ' + (st.name || st.card), extraPaid: () => 'Additional cost was paid', attacked: () => 'Restriction: already attacked', entered: () => 'Entered the board (#' + st.n + ')', nogain: () => 'Cannot gain life for the rest of the game' + by,
      skipCombat: () => 'Waiting: your next combat is skipped (pressing combat becomes End turn)' + by}[st.kind];
    return (t ? t() : st.kind) + when + (st.removed ? ' \u2014 removed: ' + st.removed.why + ' (turn ' + st.removed.turn + ')' : '');
  }
  const statusLines = o => stOf(o).map(st => ({text:describe(st), removed:!!st.removed, st}));
  const isPerm = c => c.def.type !== 'spell' && c.def.type !== 'ability';
  const has = (c, k) => hasSt(c, 'shield', x => x.color === k);          // shield counters: red = cannot be targeted, blue = unaffected by anything that does not target it
  const slowish = c => (isPerm(c) && !c.def.flash) || c.def.timing === 'Slow';   // Flash permanents are played like Quick spells
  const slotRow = c => c.def.type === 'creature' ? 'front' : 'back';
  function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  function buildDeck(owner, seed, defs){                  // CardInstances, top of deck first
    const rnd = mulberry32(seed);
    const cards = defs.map((def,i) => ({iid: owner.toLowerCase()+'-'+i, def, owner, loc:'deck', slot:null, statuses:[]}));
    for (let i = cards.length-1; i > 0; i--){ const j = Math.floor(rnd()*(i+1)); [cards[i],cards[j]] = [cards[j],cards[i]]; }
    return cards;
  }
  function create(n, defs){                         // content is injected: the Sim never reads globals
    byId = Object.fromEntries(defs.map(d => [d.id, d]));
    const s = {n, phase:'deck', ready:{Player:false, Opponent:false}, cards:{}, piles:{}, slots:{}, stack:[], active:'Player', priority:'Player', passes:0, attackPhase:false, life:{Player:20, Opponent:20}, players:{Player:{statuses:[]}, Opponent:{statuses:[]}}, maxLife:20, turn:1, seq:0, majorUsed:false, sid:0, choice:null, pending:null, unusable:{}, respond:null};   // respond: null | {kind:'enter'|'end'} = the non-turn player may respond before play continues
    for (const [p, seed] of [['Player', n*2+1], ['Opponent', n*2]]){
      const deck = buildDeck(p, seed, defs); deck.forEach(c => s.cards[c.iid] = c);
      s.piles[p] = {deck, hand:[], gy:[], exile:[]};   // opening hands are dealt when both players press Start
      for (const row of ['front','back']) for (let c = 0; c < 5; c++) s.slots[p+'|'+row+'|'+c] = null;   // slot -> iid
    }
    return s;
  }
  const freeSlots = (s, c) => Object.keys(s.slots).filter(k => !s.slots[k] && !s.unusable[k] && k.startsWith(c.owner+'|'+slotRow(c)+'|'));   // an unusable zone is never free
  const colKeys = col => ['Opponent|back|', 'Opponent|front|', 'Player|front|', 'Player|back|'].map(p => p + col);   // the 4 zones of a column
  // Clouds (King Eye) are derived from the board, so they vanish when King Eye leaves: slotKey -> King Eye iid. They cover the controller's OTHER zones.
  const cloudMap = s => { const m = {}; for (const c of Object.values(s.cards)) if (c.loc === 'board' && (abDef(c).passives || []).some(p => p.op === 'Obscure')) for (const row of ['front', 'back']) for (let i = 0; i < 5; i++){ const k = c.owner + '|' + row + '|' + i; if (k !== c.slot) m[k] = c.iid; } return m; };
  // third argument true = TARGETING (a cloud counts as a card/zone there); false = RESOLUTION (only what is really underneath)
  const COLTARGETS = {fullColumn: (s, col, clouds) => { const m = clouds ? cloudMap(s) : {}; return colKeys(col).every(k => s.slots[k] || m[k]) ? null : 'Requirement: the column must be fully filled'; }};
  const targetColumns = (s, c) => c.def.colTarget ? [0, 1, 2, 3, 4].filter(col => !COLTARGETS[c.def.colTarget](s, col, true)) : [];
  const ZONETARGETS = {anyCreature: s => { const m = cloudMap(s); return Object.keys(s.slots).filter(k => !s.unusable[k] && (m[k] || (s.slots[k] && s.cards[s.slots[k]].def.type === 'creature' && !has(s.cards[s.slots[k]], 'red')))); }, anyPermanent: s => { const m = cloudMap(s); return Object.keys(s.slots).filter(k => !s.unusable[k] && (m[k] || (s.slots[k] && !has(s.cards[s.slots[k]], 'red')))); }};   // a cloud counts as a target even over an empty zone
  const targetZones = (s, c) => c.def.zoneTarget ? ZONETARGETS[c.def.zoneTarget](s, c) : [];
  const RIDERS = {InheritAbilities: (s, src, tgt, ev, d) => { const id = abDef(src).id; if (tgt.loc === 'board' && d && tgt.def.id !== id){ addStatus(s, tgt, {kind:'ability', to:id, link:d.seq, srcName:src.def.name}); ev.push({t:'AbilitiesTransformed', iid:tgt.iid, from:id}); } }};   // the rider adds an ability status linked to the damage status just dealt; the effect lives and dies with that status
  function askCounters(s, who, src, t, left, ev){      // remove `left` damage points from t; the controller picks statuses one at a time
    const L = dmgs(t); if (left <= 0 || !L.length) return;
    const total = L.reduce((n, d) => n + d.amount, 0);
    if (total <= left){ L.forEach(d => removeStatus(s, d, 'removed by ' + src.def.name)); ev.push({t:'DamageRemoved', target:t.iid, amount:total}); return; }
    s.choice = {player:who, iid:src.iid, kind:'counter', target:t.iid, left, options:L.map(d => String(d.seq)),
      labels:Object.fromEntries(L.map(d => [String(d.seq), d.amount + ' from ' + d.srcName + ' (' + d.type + ', turn ' + d.turn + ')'])),
      prompt:src.def.name + ': remove ' + left + ' more damage from ' + t.def.name + '. Pick a damage instance.'};
    ev.push({t:'ChoiceRequested', player:who});
  }
  function canPlay(s, c){                           // reason string, or null if legal
    if (s.phase !== 'play') return 'The game has not started';
    if (c.loc !== 'hand') return 'Not in hand';
    if (c.owner !== s.priority) return 'Not this player\u2019s priority';
    if (s.attackPhase && !c.def.flash && (isPerm(c) || c.def.timing !== 'Quick')) return 'Only Quick spells during the battle phase';
    if (slowish(c) && c.owner !== s.active) return 'Slow cards: turn player only';
    if (slowish(c) && majorUsed(s)) return 'Major action already used this turn';
    if (isPerm(c)){
      if (s.stack.length && !c.def.flash) return 'Only when the stack is empty';
      if (!freeSlots(s, c).length) return 'No free ' + slotRow(c) + ' zone';
    } else {
      if (c.def.timing === 'Slow' && s.stack.length) return 'Slow spells need an empty stack';
      if (c.def.colTarget && !targetColumns(s, c).length) return 'Requirement: no legal target column';
      if (c.def.zoneTarget && !c.def.playerTarget && !c.def.optionalTarget && !targetZones(s, c).length) return 'Requirement: no legal target';
      for (const r of c.def.req || []){ const why = REQS[r] && REQS[r](s, c, c.def); if (why) return why; }
    }
    return null;
  }
  const totalDamage = c => dmgs(c).reduce((n, d) => n + d.amount, 0);
  // ---- Abilities & stack objects ------------------------------------------------
  const RULES = {oneMajor:true};                    // console: cardGame.Sim.RULES.oneMajor = false to sandbox freely
  const majorUsed = s => RULES.oneMajor && s.majorUsed;
  const canPayExtra = (s, c) => !!(c.def.extraCost && c.def.extraCost.major) && c.owner === s.active && !majorUsed(s);   // the optional additional cost 'spend the major action': own turn only for now
// ---- Published effect API. Cards reference these by name through Fx; add an entry here to give every card a new building block.
  const pendingAtk = (s, p) => { for (let i = s.stack.length - 1; i >= 0; i--){ const o = s.stack[i]; if (o.kind === 'attack' && o.controller !== p) return o; } return null; };   // the topmost Attack object on the stack that p's opponent controls
  const TARGETS = {attacker: (s, c) => { const o = pendingAtk(s, c.owner); return o ? s.cards[o.iid] : null; }, opposingFront: (s, c) => { const col = c.slot && c.slot.split('|')[2], id = col != null && s.slots[other(c.owner) + '|front|' + col]; return id && !has(s.cards[id], 'red') ? s.cards[id] : null; }};
  const findTarget = (s, c, a) => a.target && TARGETS[a.target] ? TARGETS[a.target](s, c) : null;
  const REQS = {                                    // -> reason string, or null if satisfied
    front: (s, c) => (c.slot || '').includes('|front|') ? null : 'Requirement: must be in a front-row zone',
    foeAttacking: (s, c) => TARGETS.attacker(s, c) ? null : 'Requirement: an opposing creature is attacking',
    hurt: (s, c) => s.life[c.owner] >= s.maxLife ? 'Requirement: life is already full' : null,
    target: (s, c, a) => findTarget(s, c, a) || (a.target === 'opposingFront' && c.slot && cloudMap(s)[other(c.owner) + '|front|' + c.slot.split('|')[2]]) ? null : 'Requirement: no legal target',   // an enemy cloud counts as a target; an empty one fizzles
    stack: s => s.stack.length ? null : 'Requirement: there must be a stack object to target',
    attackOnStack: s => s.stack.some(o => o.kind === 'attack') ? null : 'Requirement: an Attack must be on the stack',
    attackedCol: (s, c) => { const o = pendingAtk(s, c.owner), a = o && s.cards[o.iid]; return a && a.loc === 'board' && a.owner !== c.owner && COND.ownInAttackCol(s, c, a) ? null : 'Requirement: an opposing creature attacked and you control a creature in that column'; }
  };
  const COSTS = {                                   // check -> reason|null; pay mutates (never refunded if countered)
    PayLife: {check: (s, c, k) => s.life[c.owner] <= k.n ? 'Cost: not enough life' : null, pay: (s, c, k, ev) => { addStatus(s, PL(s, c.owner), {kind:'paid', amount:k.n, srcName:c.def.name}); syncLife(s, c.owner); ev.push({t:'LifePaid', player:c.owner, amount:k.n}); }},
    ExileFromGY: {check: (s, c, k) => s.piles[c.owner].gy.length < k.n ? 'Cost: graveyard has too few cards' : null,
      pay: (s, c, k, ev) => { for (let i = 0; i < k.n; i++){ const x = s.piles[c.owner].gy.pop(); x.loc = 'exile'; s.piles[c.owner].exile.push(x); ev.push({t:'CardExiled', iid:x.iid}); } }},
    ExileSelf: {check: (s, c) => c.loc === 'gy' ? null : 'Cost: this card must be in the graveyard',
      pay: (s, c, k, ev) => { const g = s.piles[c.owner].gy; g.splice(g.indexOf(c), 1); c.loc = 'exile'; s.piles[c.owner].exile.push(c); ev.push({t:'CardExiled', iid:c.iid}); }},
    SacrificeSelf: {check: () => null, pay: (s, c, k, ev) => destroy(s, c, ev)}
  };
  const payCost = (s, c, k, ev) => COSTS[k.op].pay(s, c, k, ev);
  function canActivate(s, c, i){                    // reason string, or null. Order: 1 requirements, 2 timing, 3 costs
    const a = c && abDef(c).abilities && abDef(c).abilities[i];
    if (!a) return 'No such ability';
    const zone = a.zone || 'board'; if (c.loc !== zone) return 'Requirement: must be ' + ({gy:'in the graveyard', hand:'in hand'}[zone] || 'on the board');
    for (const r of a.req || []){ const why = REQS[r] && REQS[r](s, c, a); if (why) return why; }
    if (c.owner !== s.priority) return 'Timing: you do not have priority';
    if (a.speed === 'Slow'){
      if (c.owner !== s.active) return 'Timing: Slow abilities only on your turn';
      if (s.stack.length) return 'Timing: Slow abilities need an empty stack';
      if (s.attackPhase) return 'Timing: not during the battle phase';
      if (majorUsed(s)) return 'Timing: major action already used';
    }
    for (const k of a.cost || []){ const why = COSTS[k.op].check(s, c, k); if (why) return why; }
    return null;
  }
      function hitStack(s, u, n, ev){ if (u.kind === 'attack') return;   // an Attack has no HP: damage against it does nothing
                      // stack HP: <= -1 is countered, 0 still resolves
    if (u.nodmg === s.turn){ ev.push({t:'DamageDenied', sid:u.sid, amount:n}); return; } u.hp -= n; ev.push({t:'StackObjectDamaged', sid:u.sid, amount:n});
    // at HP <= -1 the object stays on the stack and is countered when it would resolve (see Pass)
  }
const zoneGrid = k => { const [o, row, col] = k.split('|'); return {r: o === 'Opponent' ? (row === 'back' ? 0 : 1) : (row === 'front' ? 2 : 3), c: +col}; };   // 4 x 5 grid, opponent back row on top
  const zoneDist = (a, b) => { const p = zoneGrid(a), q = zoneGrid(b); return Math.abs(p.r - q.r) + Math.abs(p.c - q.c); };   // The Vine's own distance function (Manhattan)
const OPS = {                                     // effect handlers: (ctx, effect). ctx = {s, ev, src, t, who, foe}
    DealDamage: (x, e) => { if (e.to === 'target' && !x.tp) dealDamage(x.s, x.src, x.t, e.amount, x.ev, 'effect', true); else { const p = e.to === 'target' ? x.tp : x.foe; hurt(x.s, p, e.amount, x.src.def.name, 'effect'); x.ev.push({t:'PlayerDamaged', player:p, amount:e.amount}); } },
    Mill: (x, e) => { const p = x.tp || x.who, P = x.s.piles[p]; for (let i = 0; i < e.n; i++){ const d = P.deck.shift(); if (!d) break; d.loc = 'gy'; P.gy.unshift(d); x.ev.push({t:'CardMilled', iid:d.iid, player:p}); } },
    FetchFromDeck: (x, e) => { const P = x.s.piles[x.who], i = P.deck.findIndex(d => d.def.id === e.card); if (i < 0) return; const d = P.deck.splice(i, 1)[0]; d.loc = 'hand'; P.hand.push(d); x.ev.push({t:'CardAdded', iid:d.iid, player:x.who}); },
    DoublePower: x => { const c = x.src; if (c.loc === 'board') addStatus(x.s, c, {kind:'atkMul', n:2, srcName:c.def.name}); },
    GainLife: (x, e) => {                         // gaining life adds a 'life' status to a player (or +HP to a target card)
      if (hasSt(PL(x.s, x.who), 'nogain')) return;
      const k = {kind:'life', amount:e.amount, srcName:x.src.def.name};
      if (e.to === 'target' && x.t && x.t.loc === 'board') addStatus(x.s, x.t, k);
      else { addStatus(x.s, PL(x.s, x.who), k); syncLife(x.s, x.who); }
      x.ev.push({t:'LifeCounterAdded', amount:e.amount});
    },   // life may exceed the starting value
    SacrificeSelf: x => { if (x.src.loc === 'board') destroy(x.s, x.src, x.ev); },   // effect-sacrifice: only if the effect resolves
    Draw: (x, e) => { const w = e.who === 'foe' ? x.foe : x.who; for (let i = 0; i < e.n; i++){ const d = x.s.piles[w].deck.shift(); if (d){ d.loc = 'hand'; x.s.piles[w].hand.push(d); x.ev.push({t:'CardDrawn', iid:d.iid, player:w}); } } },
    DamageStack: (x, e) => { const u = x.s.stack[x.s.stack.length - 1]; if (u) hitStack(x.s, u, e.amount, x.ev); },
    ShiftAdjacent: x => {                         // asks the controller (a Choose command) instead of moving silently
      const c = x.src; if (c.loc !== 'board') return;
      const [o, row, col] = c.slot.split('|'), opts = [-1, 1].map(d => o + '|' + row + '|' + (+col + d)).filter(k => k in x.s.slots && !x.s.slots[k] && !x.s.unusable[k]);
      if (opts.length){ x.s.choice = {player:x.who, iid:c.iid, options:['stay', ...opts], prompt:c.def.name + ': shift to an adjacent column?'}; x.ev.push({t:'ChoiceRequested', player:x.who}); }
    },
    NearestZone: (x, e) => {                      // sets x.zone; re-evaluated every time it runs. Ties: first zone in key order (placeholder for 'you choose')
      x.zone = null; const c = x.src; if (c.loc !== 'board') return;
      let best = null, bd = Infinity;
      for (const k of Object.keys(x.s.slots)){
        if (x.s.unusable[k]) continue;                   // unusable zones are never targeted
        const occ = x.s.slots[k] && x.s.cards[x.s.slots[k]];
        if (occ && (e.skip || []).some(sp => sp === 'self' ? occ === c : occ.def.id === sp)) continue;
        const d = zoneDist(c.slot, k); if (d < bd){ bd = d; best = k; }
      }
      x.zone = best;
    },
    DestroyOnZone: x => { const id = x.zone && x.s.slots[x.zone]; if (id && !has(x.s.cards[id], 'blue')) destroy(x.s, x.s.cards[id], x.ev); },
    CreateToken: (x, e) => {
      const def = x.src.def.tokens && x.src.def.tokens[e.token]; if (!x.zone || !def || x.s.slots[x.zone] || x.s.unusable[x.zone]) return;
      const n = x.s.tokN = (x.s.tokN || 0) + 1, t = {iid:'tk-' + n, def, owner:x.who, loc:'board', slot:x.zone, statuses:[], token:true};
      x.s.cards[t.iid] = t; x.s.slots[x.zone] = t.iid; recalc(x.s, x.ev); x.ev.push({t:'PermanentSummoned', iid:t.iid, slot:x.zone}); fire(x.s, x.ev, 'enter', t);
    },
    ExileColumn: x => { if (x.col == null) return; for (const k of colKeys(x.col)){ const id = x.s.slots[k]; if (!id) continue; const c = x.s.cards[id]; if (has(c, 'blue')) continue; x.s.slots[k] = null; c.slot = null; clearStatuses(x.s, c, 'left the board');
      if (c.token) c.loc = 'gone'; else { c.loc = 'exile'; x.s.piles[c.owner].exile.push(c); } x.ev.push({t:'CardExiled', iid:c.iid}); } },
    MakeColumnUnusable: x => { if (x.col == null) return; for (const k of colKeys(x.col)){ x.s.unusable[k] = true; x.ev.push({t:'ZoneUnusable', slot:k}); } },
    ReturnToHand: x => { if (x.o) x.o.toHand = true; },
    DamageAnother: (x, e) => {                    // controller picks another creature on the board (automatic when there is only one)
      const opts = Object.values(x.s.cards).filter(c => c.loc === 'board' && c.def.type === 'creature' && c !== x.src && !has(c, 'red')).map(c => c.iid);
      if (opts.length === 1) dealDamage(x.s, x.src, x.s.cards[opts[0]], e.amount, x.ev, 'effect', true);
      else if (opts.length){ x.s.choice = {player:x.who, iid:x.src.iid, kind:'damage', amount:e.amount, options:opts, prompt:x.src.def.name + ': deal ' + e.amount + ' damage to another creature.'}; x.ev.push({t:'ChoiceRequested', player:x.who}); }
    },
    RemoveDamage: (x, e) => { if (x.t && x.t.loc === 'board') askCounters(x.s, x.who, x.src, x.t, e.n, x.ev); },
    Repeat: (x, e) => { for (let i = 0; i < e.n; i++) runFx(x, e.effects); },
    ChooseMode: (x, e) => {                       // only one fitting mode: run it; several: the controller picks
      const n = foeCreatures(x), ok = e.modes.filter(m => n >= (m.min || 0) && n <= (m.max ?? 99));
      if (!ok.length) return; if (ok.length === 1) return runFx(x, ok[0].effects);
      x.s.choice = {player:x.who, iid:x.src.iid, kind:'mode', options:ok.map((m, i) => String(i)), labels:Object.fromEntries(ok.map((m, i) => [String(i), m.name])), modes:ok, prompt:x.src.def.name + ': choose one effect (opponent controls ' + n + ' creatures).'}; x.ev.push({t:'ChoiceRequested', player:x.who});
    },
    PickCard: (x, e) => {
      const s = x.s, cs = Object.values(s.cards), mine = c => c.owner === x.who;
      const ids = e.from === 'foeHand' ? s.piles[x.foe].hand.map(c => { if (!isRevealed(c, x.who)) addStatus(s, c, {kind:'revealed', to:x.who, zone:'hand', srcName:x.src.def.name}); return c.iid; })
        : e.from === 'foeBoard' ? cs.filter(c => c.loc === 'board' && !mine(c) && !has(c, 'red')).map(c => c.iid)
        : e.from === 'anyTarget' ? cs.filter(c => c.loc === 'board' && !has(c, 'red')).map(c => c.iid).concat(['P:Player', 'P:Opponent'])
        : e.from === 'myGYCreatures' ? cs.filter(c => mine(c) && c.def.type === 'creature' && !c.token && c.loc === 'gy' && freeSlots(s, c).length).map(c => c.iid)
        : cs.filter(c => mine(c) && c.def.type === 'creature' && !c.token && ['hand', 'gy', 'exile'].includes(c.loc)).map(c => c.iid);
      if (ids.length) ask(s, x.who, x.src, 'pick', ids, (e.from === 'myGYCreatures' || (e.from === 'myCreatures' && ids.some(i => s.cards[i].loc !== 'hand'))) ? i => cname(s, i) + ' (' + s.cards[i].loc + ')' : null, x.src.def.name + ': ' + (e.from === 'foeHand' ? 'click a revealed card to discard it.' : e.from === 'myCreatures' || e.from === 'myGYCreatures' ? 'pick a creature to put into play.' : 'click a card or a life bar.'), {then:e.then, amount:e.amount || 0}, x.ev);
    },
    DestroyAll: x => { for (const c of Object.values(x.s.cards)) if (c.loc === 'board' && !has(c, 'blue')) destroy(x.s, c, x.ev); },
    DrawPerFoeCreature: x => OPS.Draw(x, {n:foeCreatures(x)}),
    VaultFromDeck: (x, e) => askDeck(x.s, x.src, e.n, x.ev),
    RevealVault: x => { const c = x.src, v = live(c).filter(y => y.kind === 'vault' && x.s.cards[y.card].loc === 'exile').map(y => y.card); if (c.loc === 'board' && v.length) ask(x.s, x.foe, c, 'vaultpick', v, i => cname(x.s, i), c.def.name + ': pick one exiled card to put into the controller\'s hand.', {}, x.ev); },
    SwapIn: x => {
      const s = x.s, o = pendingAtk(s, x.src.owner), a = o && s.cards[o.iid], src = x.src; if (!a || a.loc !== 'board' || src.loc !== 'hand') return;
      const ids = colKeys(a.slot.split('|')[2]).map(k => s.slots[k]).filter(id => id && s.cards[id].owner === src.owner && s.cards[id].def.type === 'creature'); if (!ids.length) return;
      if (ids.length === 1) CH.swap(s, null, src, {option:ids[0]}, x.ev); else ask(s, x.who, src, 'swap', ids, null, 'Click the creature to return to your hand.', {}, x.ev);
    },
    ShieldAll: (x, e) => { for (const c of Object.values(x.s.cards)) if (c.loc === 'board' && c.owner === x.who){ addStatus(x.s, c, {kind:'shield', color:e.color, srcName:x.src.def.name}); x.ev.push({t:'CounterAdded', iid:c.iid, color:e.color}); } },
    NoLifeGain: x => { addStatus(x.s, PL(x.s, x.who), {kind:'nogain', srcName:x.src.def.name}); },
    Aura: () => {},                               // passive, read by recalc()
    DrawUntil: (x, e) => OPS.Draw(x, {n: Math.max(0, e.n - x.s.piles[x.who].hand.length)}),
    NoDamage: x => { if (x.t && x.t.loc === 'board') addStatus(x.s, x.t, {kind:'nodamage', expires:'turnEnd', srcName:x.src.def.name}); else if (x.o && x.o.tsid){ const u = x.s.stack.find(y => y.sid === x.o.tsid); if (u) u.nodmg = x.s.turn; } },
    CancelAttack: x => { const s = x.s, id = x.t && x.t.iid, i = s.stack.map(o => o.kind === 'attack' && o.iid === id).lastIndexOf(true); if (i < 0) return; s.stack.splice(i, 1); x.ev.push({t:'AttackCancelled', iid:id}); },   // removes the Attack object from the stack: no damage, its triggers stay
    SkipFoeCombat: (x, e) => { const s = x.s; if (e.pay){ if (s.life[x.who] <= e.pay) return; addStatus(s, PL(s, x.who), {kind:'paid', amount:e.pay, srcName:x.src.def.name}); syncLife(s, x.who); x.ev.push({t:'LifePaid', player:x.who, amount:e.pay}); } addStatus(s, PL(s, x.foe), {kind:'skipCombat', srcName:x.src.def.name}); },
    SecondCombat: x => { const s = x.s, sk = live(PL(s, x.who)).find(y => y.kind === 'skipCombat'); if (sk){ removeStatus(s, sk, 'used'); return; } if (s.piles[x.foe].deck.length < 5) return;   // the draw is a cost: no 5 cards, no second combat
      OPS.Draw({...x, who:x.foe}, {n:5}); s.attackPhase = true; clearAttacked(s, 'new combat phase'); s.combats = (s.combats || 0) + 1; x.ev.push({t:'AttackPhaseChanged', on:true}); fire(s, x.ev, 'combat', null); },
    AddAttackDamage: (x, e) => { const w = e.whose || 'any'; for (let i = x.s.stack.length - 1; i >= 0; i--){ const o = x.s.stack[i]; if (o.kind === 'attack' && (w === 'any' || (w === 'mine') === (o.controller === x.who))){ o.bonus = (o.bonus || 0) + e.amount; x.ev.push({t:'AttackBoosted', sid:o.sid, amount:e.amount}); return; } } },   // generic: adds damage to the topmost matching Attack object
    UpTo: (x, e) => upToAsk(x.s, e.who === 'foe' ? x.foe : x.who, x.src, e, e.n, x.ev),
    PlaceToken: (x, e) => { const s = x.s, def = x.src.def.tokens[e.token], f = Object.keys(s.slots).filter(k => k.startsWith(x.who + '|front|') && !s.slots[k] && !s.unusable[k]);   // the controller picks the zone (front row only)
      if (!f.length) return; if (f.length === 1) return makeToken(s, def, x.who, f[0], x.ev);
      ask(s, x.who, x.src, 'place', f, null, x.src.def.name + ': click a front zone for the ' + def.name + ' token.', {token:e.token}, x.ev); },
    FreeFrontZone: x => { x.zone = null; const c = x.src; if (c.loc !== 'board') return; const col = +c.slot.split('|')[2]; let bd = 9; for (let i = 0; i < 5; i++){ const k = x.who + '|front|' + i, d = Math.abs(i - col); if (!x.s.slots[k] && !x.s.unusable[k] && d < bd){ bd = d; x.zone = k; } } }
  };
  const runFx = (x, list) => { list = list || [];   // an op that opens a choice suspends the rest of the list as a continuation frame; Choose resumes it
    for (let i = 0; i < list.length; i++){ const e = list[i]; if (OPS[e.op]) OPS[e.op](x, e);
      if (x.s.choice && i < list.length - 1){ (x.s.choice.cont = x.s.choice.cont || []).push({rest:list.slice(i + 1), src:x.src.iid, who:x.who, foe:x.foe, col:x.col, tp:x.tp, t:x.t && x.t.iid, o:x.o && {tsid:x.o.tsid}}); return; } } };
  const foeCreatures = x => Object.values(x.s.cards).filter(c => c.loc === 'board' && c.def.type === 'creature' && c.owner !== x.who).length;
  const cname = (s, i) => s.cards[i].def.name;
  const hpOf = c => live(c).reduce((n, x) => n + (x.kind === 'life' ? x.amount : x.kind === 'mod' ? x.hp : 0), c.def.hp);   // fold: printed HP + life + modifiers
  const atkOf = c => { let b = c.def.atk; if (b == null) return b; for (const x of live(c)) b = x.kind === 'mod' ? b + x.atk : x.kind === 'atkMul' ? b * x.n : b; return Math.max(0, b); };   // fold in order: printed power, then every status oldest to newest
  function hurt(s, p, amount, source, type){ addStatus(s, PL(s, p), {kind:'damage', amount, orig:amount, type, srcName:source}); syncLife(s, p); }   // player damage is a status, like card damage
  const clearAttacked = (s, why) => Object.values(s.cards).forEach(c => live(c).filter(x => x.kind === 'attacked').forEach(x => removeStatus(s, x, why)));
  function ask(s, who, src, kind, ids, label, prompt, extra, ev){ s.choice = Object.assign({player:who, iid:src.iid, kind, options:ids, labels:label ? Object.fromEntries(ids.map(i => [i, label(i)])) : undefined, prompt}, extra); ev.push({t:'ChoiceRequested', player:who}); }
  let rcBusy = false;
  const AURAREQ = (s, c, st) => { const a = s.cards[st.src], p = a && abDef(a).passives && abDef(a).passives[st.idx];   // an aura status holds while its source stands on the board and the target is in its columns
    return !!(a && a.loc === 'board' && c.loc === 'board' && p && p.op === 'Aura' && Math.abs(+c.slot.split('|')[2] - +a.slot.split('|')[2]) <= 1 && (p.who === 'foe') === (c.owner !== a.owner)); };
  function recalc(s, ev){                           // derived state: statuses that stopped meeting their requirement are removed, auras add their statuses, then state-based death (damage > HP)
    if (rcBusy) return; rcBusy = true;
    try { for (let n = 0; n < 8; n++){
      const all = Object.values(s.cards), board = all.filter(c => c.loc === 'board');
      for (const c of all) for (const st of live(c)){
        if (!st.keep && (st.zone || 'board') !== c.loc) removeStatus(s, st, 'left the ' + (st.zone || 'board'));
        else if (st.aura && !AURAREQ(s, c, st)) removeStatus(s, st, 'no longer in range');
        else if (st.link && !live(c).some(y => y.seq === st.link)) removeStatus(s, st, 'linked status ended');
      }
      for (const c of board) if (!hasSt(c, 'entered')) addStatus(s, c, {kind:'entered', n:(s.ent = (s.ent || 0) + 1)});
      const enteredN = c => (live(c).find(y => y.kind === 'entered') || {n:0}).n;
      for (const a of board.filter(c => (abDef(c).passives || []).some(p => p.op === 'Aura')).sort((p, q) => enteredN(p) - enteredN(q))){   // oldest source first: War Drum's -1/-1 is listed before the Drummer's +1/+1
        abDef(a).passives.forEach((p, idx) => { if (p.op !== 'Aura') return;
          for (const t of board){ const st = {kind:'mod', atk:p.atk, hp:p.hp, src:a.iid, idx, aura:true, srcName:a.def.name};
            if (AURAREQ(s, t, st) && !hasSt(t, 'mod', y => y.src === a.iid && y.idx === idx)) addStatus(s, t, st); } }); }
      const dead = board.filter(c => c.loc === 'board' && totalDamage(c) > hpOf(c));   // only the final value decides: at -1 HP inside the columns a card lives, leave them and it dies
      if (!dead.length) break; dead.forEach(c => destroy(s, c, ev)); }
      for (const p of ['Player', 'Opponent']) syncLife(s, p);
    } finally { rcBusy = false; } }
  function declareAttack(s, c, ev, extra){          // an attack is an object on the stack: it is NOT a snapshot of the attacker, it reads the attacker (if still on the board) when it resolves
    if (c.loc !== 'board' || c.def.type !== 'creature') return;
    const o = {sid:++s.sid, kind:'attack', iid:c.iid, src:c.iid, controller:c.owner, hp:null, name:'Attack: ' + c.def.name, slotAt:c.slot, bonus:0};
    s.stack.push(o); s.passes = 0; ev.push({t:'CreatureAttackDeclared', iid:c.iid, col:+c.slot.split('|')[2], extra:!!extra}); ev.push({t:'StackObjectCreated', iid:c.iid, attack:true});
    fire(s, ev, 'attack', c);                       // its triggers go ABOVE the Attack: separate objects, resolved (and answered) independently
    s.priority = other(c.owner);                    // the defender answers first
  }
  const extraAttack = (s, c, ev) => declareAttack(s, c, ev, true);
  function resume(s, frames, ev){ frames = frames.slice(); while (frames.length){ const f = frames.shift(), x = {s, ev, src:s.cards[f.src], who:f.who, foe:f.foe, col:f.col, tp:f.tp, t:f.t ? s.cards[f.t] : null, o:f.o}; runFx(x, f.rest); if (s.choice){ s.choice.cont = (s.choice.cont || []).concat(frames); return; } } }
  function upToAsk(s, p, src, e, left, ev){         // 'up to n': one pick at a time, with a Done option
    if (left <= 0) return;
    const ids = s.piles[p][e.from].filter(c => c !== src && (!e.types || e.types.includes(c.def.type)) && (e.then !== 'play' || freeSlots(s, c).length)).map(c => c.iid); if (!ids.length) return;
    ask(s, p, src, 'upto', [...ids, 'done'], i => i === 'done' ? 'Done' : cname(s, i), src.def.name + ': ' + (e.then === 'play' ? 'put into play' : 'return to hand') + ' (up to ' + left + ' more).', {e, left}, ev);
  }
  function askDeck(s, c, n, ev){ const ids = s.piles[c.owner].deck.map(d => d.iid); if (ids.length) ask(s, c.owner, c, 'vault', ids, i => cname(s, i), c.def.name + ': exile a card from your deck (' + n + ' left).', {left:n}, ev); }
  function bounce(s, t, ev){ if (t.slot) s.slots[t.slot] = null; t.slot = null; clearStatuses(s, t, 'left the board'); if (t.token) t.loc = 'gone'; else { t.loc = 'hand'; s.piles[t.owner].hand.push(t); } ev.push({t:'PermanentReturned', iid:t.iid}); recalc(s, ev); }
  function enterBoard(s, t, slot, ev){ const P = s.piles[t.owner]; for (const k of ['hand', 'gy', 'exile']){ const i = P[k].indexOf(t); if (i >= 0) P[k].splice(i, 1); } s.slots[slot] = t.iid; t.slot = slot; t.loc = 'board'; recalc(s, ev); ev.push({t:'PermanentSummoned', iid:t.iid, slot}); fire(s, ev, 'enter', t); }
  function retaliate(s, from, pw, src, ev){ if (pw <= 0) return; if (src.def.type === 'spell'){ hurt(s, src.owner, pw, from.def.name, 'retaliate'); ev.push({t:'PlayerDamaged', player:src.owner, amount:pw}); } else if (src.loc === 'board') dealDamage(s, from, src, pw, ev, 'retaliate'); }   // Retaliate: the source (creature, or the spell's controller) takes damage equal to the retaliator's power; retaliation never retaliates
  const COND = {extraPaid: (s, c) => hasSt(c, 'extraPaid'), firstCombat: (s, c) => s.combats === 1 && c.owner === s.active, ownInAttackCol: (s, c, a) => !!(a && a.slot) && colKeys(a.slot.split('|')[2]).some(k => { const m = s.slots[k] && s.cards[s.slots[k]]; return !!m && m.owner === c.owner && m.def.type === 'creature'; })};
  const THEN = {
    toGY: (s, w, c, t, k, ev) => { const P = s.piles[t.owner], i = P.hand.indexOf(t); if (i >= 0) P.hand.splice(i, 1); t.loc = 'gy'; P.gy.unshift(t); ev.push({t:'CardDiscarded', iid:t.iid}); },
    toHand: (s, w, c, t, k, ev) => { if (t.loc === 'board') bounce(s, t, ev); },
    damage: (s, w, c, t, k, ev) => { if (t.loc === 'board') dealDamage(s, c, t, k.amount, ev, 'effect', true); },
    summonAttack: (s, w, c, t, k, ev) => { const f = freeSlots(s, t); if (f.length === 1){ enterBoard(s, t, f[0], ev); extraAttack(s, t, ev); } else if (f.length) ask(s, w, c, 'place', f, null, 'Click a highlighted zone for ' + t.def.name + '.', {card:t.iid, atk:true}, ev); },
    summon: (s, w, c, t, k, ev) => { const f = freeSlots(s, t); if (f.length === 1) enterBoard(s, t, f[0], ev); else if (f.length) ask(s, w, c, 'place', f, null, 'Click a highlighted zone for ' + t.def.name + '.', {card:t.iid}, ev); }
  };
  const CH = {                                      // answers to non-shift choices (Choose command)
    mode: (s, k, c, cmd, ev) => runFx({s, ev, src:c, who:k.player, foe:other(k.player), t:null}, k.modes[+cmd.option].effects),
    pick: (s, k, c, cmd, ev) => { if (cmd.option.startsWith('P:')){ const p = cmd.option.slice(2); hurt(s, p, k.amount, c.def.name, 'effect'); ev.push({t:'PlayerDamaged', player:p, amount:k.amount}); } else THEN[k.then](s, k.player, c, s.cards[cmd.option], k, ev); },
    place: (s, k, c, cmd, ev) => { if (k.token){ makeToken(s, c.def.tokens[k.token], k.player, cmd.option, ev); return; } enterBoard(s, s.cards[k.card], cmd.option, ev); if (k.atk) extraAttack(s, s.cards[k.card], ev); if (k.next) upToAsk(s, k.player, c, k.next.e, k.next.left, ev); },
    upto: (s, k, c, cmd, ev) => { if (cmd.option === 'done') return; const t = s.cards[cmd.option], P = s.piles[k.player];
      if (k.e.then === 'toHand'){ P[k.e.from].splice(P[k.e.from].indexOf(t), 1); t.loc = 'hand'; P.hand.push(t); ev.push({t:'CardAdded', iid:t.iid, player:k.player}); upToAsk(s, k.player, c, k.e, k.left - 1, ev); return; }
      const f = freeSlots(s, t); if (f.length === 1){ enterBoard(s, t, f[0], ev); upToAsk(s, k.player, c, k.e, k.left - 1, ev); }
      else if (f.length) ask(s, k.player, c, 'place', f, null, 'Click a highlighted zone for ' + t.def.name + '.', {card:t.iid, next:{e:k.e, left:k.left - 1}}, ev); },
    swap: (s, k, c, cmd, ev) => { if (cmd.option === 'stay' || c.loc !== 'hand') return; const t = s.cards[cmd.option]; if (t.loc !== 'board') return; const slot = t.slot; bounce(s, t, ev); enterBoard(s, c, slot, ev); },
    vault: (s, k, c, cmd, ev) => { const d = s.cards[cmd.option], P = s.piles[c.owner]; P.deck.splice(P.deck.indexOf(d), 1); d.loc = 'exile'; P.exile.push(d); addStatus(s, c, {kind:'vault', card:d.iid, name:d.def.name, srcName:c.def.name}); ev.push({t:'CardExiled', iid:d.iid}); if (k.left > 1) askDeck(s, c, k.left - 1, ev); },
    vaultpick: (s, k, c, cmd, ev) => { const d = s.cards[cmd.option], P = s.piles[d.owner]; P.exile.splice(P.exile.indexOf(d), 1); removeStatus(s, live(c).find(y => y.kind === 'vault' && y.card === d.iid), 'taken into hand'); d.loc = 'hand'; P.hand.push(d); ev.push({t:'CardAdded', iid:d.iid, player:d.owner}); }
  };
  function resolveObj(s, o, ev){                   // the object is already popped
    if (o.kind === 'attack') return resolveAttack(s, o, ev);
    const src = s.cards[o.src || o.iid], def = o.kind === 'spell' ? src.def : byId[o.from][o.list][o.ab];
    let t = o.target ? s.cards[o.target] : null;
    if (def.zoneTarget && !o.tplayer && !o.tsid && !(def.optionalTarget && !o.zone)){ const id = s.slots[o.zone]; t = id ? s.cards[id] : null; if (!t || has(t, 'red')){ ev.push({t:'StackObjectFizzled', sid:o.sid}); return; } }   // a cloud was the target and nothing is underneath
    if (def.target && !(t && (t.loc === 'board' || def.target === 'attacker'))){ ev.push({t:'StackObjectFizzled', sid:o.sid}); return; }   // target became illegal
    if (def.colTarget && COLTARGETS[def.colTarget](s, o.col)){ ev.push({t:'StackObjectFizzled', sid:o.sid}); return; }   // nothing legal under the clouds: it fizzles and nothing is revealed   // the column is no longer a legal target
    runFx({s, ev, src, t, who:o.controller, foe:other(o.controller), col:o.col, o, tp:o.tplayer}, def.effects);
  }
  function sweepUnusable(s, ev){                    // a card that somehow ends up on an unusable zone goes to the graveyard
    for (const k of Object.keys(s.unusable)){ const id = s.slots[k]; if (id && !has(s.cards[id], 'blue')) destroy(s, s.cards[id], ev); }
  }
  function destroy(s, c, ev){                       // leaves the field for the graveyard; its statuses are removed (they stay in the list, greyed)
    s.slots[c.slot] = null; c.slot = null; clearStatuses(s, c, 'left the board');
    if (c.token) c.loc = 'gone'; else { c.loc = 'gy'; s.piles[c.owner].gy.unshift(c); } ev.push({t:'PermanentDestroyed', iid:c.iid}); recalc(s, ev);
  }
  function dealDamage(s, src, tgt, amount, ev, type, targeted){ if (hasSt(tgt, 'nodamage')){ ev.push({t:'DamageDenied', target:tgt.iid, amount}); return; } if (has(tgt, 'blue') && !targeted && (type || 'combat') !== 'combat') return;   // blue shield: only effects that target it can touch it
    const d = addStatus(s, tgt, {kind:'damage', amount, orig:amount, type:type || 'combat', source:src.iid, srcName:src.def.name});   // damage is a status
    ev.push({t:'DamageDealt', source:src.iid, target:tgt.iid, amount, type:type || 'combat'});
    if ((type || 'combat') === 'combat') fire(s, ev, 'damaged', tgt);      // triggers see the victim before it is destroyed
    const rd = abDef(src).rider; if (rd && RIDERS[rd.op]) RIDERS[rd.op](s, src, tgt, ev, d);
    const pw = atkOf(tgt); if (totalDamage(tgt) > hpOf(tgt)) destroy(s, tgt, ev);
    if (tgt.def.retaliate && type !== 'retaliate') retaliate(s, tgt, pw, src, ev);
  }
  function canAttack(s, c){                         // reason string, or null if legal
    if (!c || c.loc !== 'board' || c.def.type !== 'creature') return 'Only creatures on the board can attack';
    if (!s.attackPhase) return 'Turn the attack phase on first';
    if (hasSt(c, 'attacked')) return 'Already attacked this turn';
    if (c.owner !== s.active) return 'Not this player\u2019s turn';
    if (s.stack.length) return 'Stack is not empty';
    if (s.respond) return 'Waiting for the response window';
    return null;
  }
  function pushObj(s, c, list, i, ev, target){   // abilities AND triggers share one path: a token card + a stack object with its own HP
    const a = abDef(c)[list][i], sid = ++s.sid, n = list === 'triggers' ? 100 + i : i;
    const tok = {iid:'tok-' + sid, def:{id:'tok-' + abDef(c).id + '-' + n, name:c.def.name + ': ' + (a.name || 'Trigger'), type:'ability', timing:a.speed || 'Trigger', hp:a.hp ?? 1, text:abDef(c).text}, owner:c.owner, loc:'stack', slot:null, damage:[], token:true};
    s.cards[tok.iid] = tok;
    s.stack.push({sid, kind:'ability', iid:tok.iid, src:c.iid, list, ab:i, from:abDef(c).id, controller:c.owner, hp:tok.def.hp, target:target || null, name:tok.def.name});
    s.passes = 0; ev.push({t:'StackObjectCreated', iid:c.iid});
  }
  function fire(s, ev, on, subject){                // event -> ALL matching triggers go onto the stack together, then priority passes (non-turn player first)
    const hits = [];                                // 1) collect every trigger that matches this event
    for (const c of Object.values(s.cards)){
      if (c.loc === 'stack' || c.loc === 'gone') continue;
      (abDef(c).triggers || []).forEach((t, i) => {
        if (t.on !== on || (t.zone || 'board') !== c.loc) return;
        if (t.cond && !COND[t.cond](s, c, subject)) return;
        if (on === 'enter' && c !== subject) return;
        if (on === 'damaged' && c !== subject) return;
        if (on === 'turnStart' && c.owner !== s.active) return;
        if (on === 'combat' && c.owner !== s.active) return;
        if (on === 'combatEnd' && c.owner !== s.active) return;
        if (on === 'attack' && !(((t.by || []).includes('self') && c === subject) || ((t.by || []).includes('foe') && c.owner !== subject.owner) || (t.by || []).includes('any'))) return;
        hits.push({c, i});
      });
    }
    // 2) turn player's triggers are put on the stack first, then the other player's (so the other player's resolve first).
    //    Stable sort: within one player the order is card creation order (deterministic placeholder until players can order their own triggers).
    hits.sort((a, b) => (b.c.owner === s.active) - (a.c.owner === s.active));
    for (const h of hits) pushObj(s, h.c, 'triggers', h.i, ev);
    if (hits.length) s.priority = other(s.active);   // 3) only now does priority pass: the NON-turn player responds first
  }
  function strike(s, c, ev, o){                        // damage flows down the attacker's CURRENT column
    const at = ((o && o.slotAt && c.loc !== 'board') ? o.slotAt : c.slot).split('|'), col = at[2], foe = other(c.owner);   /* at: where it stood when it struck (it may die mid-strike, e.g. to Retaliate) */ let left = (c.loc === 'board' ? atkOf(c) : 0) + ((o && o.bonus) || 0);   // the attacker's power counts only while it is on the board; damage added to the Attack itself always counts. Damage goes toward the controller's opponent; a card standing on the foe's side skips itself
   
    for (const row of ['front', 'back']){
      if (at[0] === foe && (row === 'front' || at[1] === 'back')) continue;   // an attacker standing on the foe's side only hits what lies beyond it, never backward
      const id = s.slots[foe + '|' + row + '|' + col]; if (!id || left <= 0) continue;
      if (id === c.iid) continue;   // every card on the foe's side of the column absorbs damage, whoever controls it   // never absorbed by the attacker's own cards (e.g. your own Vines standing in that column)
      const t = s.cards[id], remaining = hpOf(t) - totalDamage(t);
      dealDamage(s, c, t, left, ev); left = Math.max(0, left - remaining);
    }
    if (left > 0){ hurt(s, foe, left, c.def.name, 'combat'); ev.push({t:'PlayerDamaged', player:foe, amount:left, combat:true, source:c.iid}); }
  }
  function settle(){}                               // kept so old call sites stay valid: attacks now resolve as stack objects (resolveAttack)
  function resolveAttack(s, o, ev){ const c = s.cards[o.iid]; if (c.loc === 'board') o.slotAt = c.slot; if (o.slotAt) strike(s, c, ev, o); recalc(s, ev); }
  function openRespond(s, ev, kind){                // the non-turn player gets priority on an empty stack (triggers on the stack resolve first)
    s.respond = {kind}; s.priority = other(s.active); ev.push({t:'ResponseWindowOpened', kind});   // the non-turn player ALWAYS responds first, even with enter triggers already on the stack
  }
  function endTurn(s, ev){
    for (const o of [...Object.values(s.cards), PL(s, 'Player'), PL(s, 'Opponent')]) live(o).filter(x => x.expires === 'turnEnd').forEach(x => removeStatus(s, x, 'expired'));   // end of turn: expiring statuses go
    clearAttacked(s, 'turn ended');
    s.active = other(s.active); s.attackPhase = false; s.turn++; s.majorUsed = false; s.combats = 0;
    s.priority = s.active; s.passes = 0; ev.push({t:'TurnChanged', active:s.active}); fire(s, ev, 'turnStart', null);
  }
  function dispatch(s, cmd){                        // mutates s; returns {ok, why, events}
    const ev = [], fail = why => ({ok:false, why, events:[]});
    if (s.choice && cmd.type !== 'Choose') return fail('Waiting for ' + s.choice.player + ' to choose');
    if (s.phase === 'deck' && cmd.type !== 'ReorderDeck' && cmd.type !== 'Start') return fail('Deck building: press Start when your deck is ready');
    switch (cmd.type){
      case 'ReorderDeck': {
        if (s.phase !== 'deck' || s.ready[cmd.player]) return fail('Your deck is locked');
        const d = s.piles[cmd.player].deck;
        if (!(cmd.from >= 0 && cmd.from < d.length && cmd.to >= 0 && cmd.to < d.length)) return fail('Bad deck position');
        d.splice(cmd.to, 0, d.splice(cmd.from, 1)[0]); ev.push({t:'DeckReordered', player:cmd.player}); break;
      }
      case 'Start': {
        if (s.phase !== 'deck') return fail('The game has already started');
        if (s.ready[cmd.player]) return fail('Already ready');
        s.ready[cmd.player] = true; ev.push({t:'PlayerReady', player:cmd.player});
        if (s.ready.Player && s.ready.Opponent){
          s.phase = 'play';
          for (const p of ['Player', 'Opponent']){ const P = s.piles[p]; P.hand = P.deck.splice(0, 5); P.hand.forEach(c => { c.loc = 'hand'; ev.push({t:'CardDrawn', iid:c.iid, player:p}); }); }
          ev.push({t:'GameStarted'});
        }
        break;
      }
      case 'Draw': {
        const d = s.piles[cmd.player].deck;
        if (cmd.player !== s.priority) return fail('Not this player\u2019s priority');
        if (s.stack.length) return fail('Stack is not empty');
        if (s.attackPhase) return fail('Not during the battle phase');
        if (cmd.player !== s.active) return fail('Only the turn player can draw');
        if (!d.length) return fail('Deck is empty');
        if (majorUsed(s)) return fail('Major action already used this turn');
        s.majorUsed = true;
        if (d.length > 1){ const x = d.shift(); x.loc = 'hand'; s.piles[x.owner].hand.push(x); ev.push({t:'CardDrawn', iid:x.iid, player:x.owner}); }   // draw two
        const c = d.shift(); c.loc = 'hand'; s.piles[c.owner].hand.push(c);
        ev.push({t:'CardDrawn', iid:c.iid, player:c.owner}); break;
      }
      case 'PlayCard': {
        const c = s.cards[cmd.iid], why = c ? canPlay(s, c) : 'Unknown card';
        if (why) return fail(why);
        if (isPerm(c) && !freeSlots(s, c).includes(cmd.slot)) return fail('Illegal zone');
        if (c.def.colTarget && !targetColumns(s, c).includes(cmd.col)) return fail('Illegal target column');
        const tp = c.def.playerTarget && ['Player', 'Opponent'].includes(cmd.tplayer) ? cmd.tplayer : null;
        if (c.def.playerTarget && !c.def.zoneTarget && !tp) return fail('Target a player');
        const tsid = c.def.stackTarget && s.stack.some(o => o.sid === cmd.tsid && o.kind === 'spell') ? cmd.tsid : null;
        if (c.def.zoneTarget && !tp && !tsid && !(c.def.optionalTarget && !cmd.zone) && !targetZones(s, c).includes(cmd.zone)) return fail('Illegal target zone');
        if (cmd.extra && !(c.def.extraCost && canPayExtra(s, c))) return fail('Cannot pay the additional cost');
        const h = s.piles[c.owner].hand; h.splice(h.indexOf(c), 1); const paid = !!(cmd.extra && c.def.extraCost); if (paid) s.majorUsed = true;
        if (slowish(c)) s.majorUsed = true;
        if (isPerm(c)){ s.slots[cmd.slot] = c.iid; c.slot = cmd.slot; c.loc = 'board'; if (paid) addStatus(s, c, {kind:'extraPaid', srcName:'additional cost'}); recalc(s, ev); ev.push({t:'PermanentSummoned', iid:c.iid, slot:cmd.slot}); fire(s, ev, 'enter', c); if (c.owner === s.active && !s.respond) openRespond(s, ev, 'enter'); }
        else { c.loc = 'stack'; s.stack.push({sid:++s.sid, kind:'spell', iid:c.iid, controller:c.owner, hp:c.def.hp, name:c.def.name + (c.def.colTarget ? ' \u2192 col ' + (cmd.col + 1) : ''), col:cmd.col, zone:c.def.zoneTarget && !tp && !tsid ? (cmd.zone || null) : null, tplayer:tp, tsid}); s.passes = 0; s.priority = other(c.owner); ev.push({t:'StackObjectCreated', iid:c.iid}); }   // the opponent gets priority first; the stack resolves only after two passes in a row
        break;
      }
      case 'Pass': {
        if (cmd.player !== s.priority) return fail('Not this player\u2019s priority');
        if (!s.stack.length){                       // passing in an empty-stack response window closes it
          if (!s.respond) return fail('Nothing on the stack');
          const k = s.respond.kind; s.respond = null; ev.push({t:'ResponseWindowClosed', kind:k});
          if (k === 'end') endTurn(s, ev); else { s.priority = s.active; settle(s, ev); }
          break;
        }
        if (++s.passes >= 2){
          const o = s.stack.pop(), c = s.cards[o.iid], dead = o.hp <= -1; if (dead) ev.push({t:'StackObjectCountered', sid:o.sid}); else resolveObj(s, o, ev);
          if (o.kind === 'attack'){} else if (o.kind === 'spell'){ if (o.toHand){ c.loc = 'hand'; s.piles[c.owner].hand.push(c); } else { c.loc = 'gy'; s.piles[c.owner].gy.unshift(c); } } else c.loc = 'gone';   // ability tokens cease to exist   // newest first
          s.passes = 0; s.priority = s.respond ? other(s.active) : s.active; if (!dead) ev.push({t:'StackObjectResolved', iid:c.iid}); settle(s, ev);
        } else { s.priority = other(s.priority); ev.push({t:'PriorityPassed', to:s.priority}); }
        break;
      }
      case 'SetAttackPhase': {
        if (cmd.player !== s.active) return fail('Only the turn player can enter the battle phase');
        if (cmd.player !== s.priority) return fail('Not this player\u2019s priority');
        if (s.stack.length) return fail('Stack is not empty');
        if (cmd.on && !s.attackPhase){ if (majorUsed(s)) return fail('Major action already used this turn');
          { const sk = live(PL(s, cmd.player)).find(y => y.kind === 'skipCombat'); if (sk){ removeStatus(s, sk, 'used'); ev.push({t:'CombatSkipped', player:cmd.player}); openRespond(s, ev, 'end'); ev.push({t:'EndStepEntered'}); break; } }   // Deep Sea Shark: pressing combat becomes End turn
          s.majorUsed = true; }
        const was = s.attackPhase; s.attackPhase = !!cmd.on; ev.push({t:'AttackPhaseChanged', on:s.attackPhase}); if (cmd.on && !was){ s.combats = (s.combats || 0) + 1; fire(s, ev, 'combat', null); } if (!cmd.on && was) fire(s, ev, 'combatEnd', null); break;
      }
      case 'Attack': {
        const c = s.cards[cmd.iid], why = canAttack(s, c);
        if (why) return fail(why);
        addStatus(s, c, {kind:'attacked', expires:'turnEnd'});
        declareAttack(s, c, ev);   // the Attack goes on the stack first, its triggers above it
        break;
      }
      case 'Choose': {
        const k = s.choice;
        if (!k) return fail('Nothing to choose'); if (cmd.player !== k.player) return fail('Not your choice'); if (!k.options.includes(cmd.option)) return fail('Illegal option');
        s.choice = null; const c = s.cards[k.iid];
        if (CH[k.kind]) CH[k.kind](s, k, c, cmd, ev);
        else if (k.kind === 'damage') dealDamage(s, c, s.cards[cmd.option], k.amount, ev, 'effect', true);
        else if (k.kind === 'counter'){ const t = s.cards[k.target], d = dmgs(t).find(y => String(y.seq) === cmd.option), r = Math.min(k.left, d.amount); d.amount -= r; if (!d.amount) removeStatus(s, d, 'removed by ' + c.def.name); ev.push({t:'DamageRemoved', target:t.iid, amount:r}); askCounters(s, k.player, c, t, k.left - r, ev); }
        else
        if (cmd.option !== 'stay'){ s.slots[c.slot] = null; s.slots[cmd.option] = c.iid; c.slot = cmd.option; ev.push({t:'PermanentMoved', iid:c.iid, slot:cmd.option}); }
        if (k.cont){ if (s.choice) s.choice.cont = (s.choice.cont || []).concat(k.cont); else resume(s, k.cont, ev); } recalc(s, ev); ev.push({t:'ChoiceMade', player:k.player}); settle(s, ev); break;
      }
      case 'Activate': {
        const c = s.cards[cmd.iid], why = c ? canActivate(s, c, cmd.ab) : 'Unknown card';
        if (why) return fail(why);
        const a = abDef(c).abilities[cmd.ab], tgt = findTarget(s, c, a);
        for (const k of a.cost || []) payCost(s, c, k, ev);               // costs are paid on activation
        if (a.speed === 'Slow') s.majorUsed = true;                       // Slow consumes the major action now, not on resolution
        pushObj(s, c, 'abilities', cmd.ab, ev, tgt ? tgt.iid : null);
        s.priority = other(c.owner);                                      // the opponent gets priority first
        ev.push({t:'AbilityActivated', iid:c.iid, ab:cmd.ab, speed:a.speed}); break;
      }
      case 'EndTurn':
        if (cmd.player !== s.active || cmd.player !== s.priority) return fail('Only the turn player holding priority can end the turn');
        if (s.stack.length) return fail('Stack is not empty');
        if (s.respond) return fail('Waiting for the response window');
        if (s.attackPhase){ s.attackPhase = false; ev.push({t:'AttackPhaseChanged', on:false}); fire(s, ev, 'combatEnd', null); if (s.stack.length) break; }   // ending the turn ends combat first, so 'after combat' triggers (Shark) still happen
        openRespond(s, ev, 'end'); ev.push({t:'EndStepEntered'}); break;      // the turn really ends when the opponent passes
      default: return fail('Unknown command');
    }
    sweepUnusable(s, ev); recalc(s, ev);
    return {ok:true, events:ev};
  }
  function makeToken(s, def, owner, zone, ev){ const n = s.tokN = (s.tokN || 0) + 1, t = {iid:'tk-' + n, def, owner, loc:'board', slot:zone, statuses:[], token:true};
    s.cards[t.iid] = t; s.slots[zone] = t.iid; recalc(s, ev); ev.push({t:'PermanentSummoned', iid:t.iid, slot:zone}); fire(s, ev, 'enter', t); }
  function hasAction(s, p){                         // is there anything legal for p right now?
    if (s.phase !== 'play' || p !== s.priority) return false;
    const P = s.piles[p], mine = Object.values(s.cards).filter(c => c.owner === p && (c.loc === 'board' || c.loc === 'gy')), turn = p === s.active && !s.stack.length;
    if (turn && !s.attackPhase && !majorUsed(s) && P.deck.length) return true;
    if (P.hand.some(c => !canPlay(s, c))) return true;
    if (s.attackPhase ? mine.some(c => !canAttack(s, c)) : turn && !majorUsed(s) && mine.some(c => c.def.type === 'creature')) return true;
    return mine.concat(P.hand).some(c => (abDef(c).abilities || []).some((a, i) => !canActivate(s, c, i)));
  }
  return {addStatus, removeStatus, statusLines, describe, lifeOf, live, hasSt, has, isRevealed, attackedIds, API:{effects:Object.keys(OPS), costs:Object.keys(COSTS), requirements:Object.keys(REQS), targets:Object.keys(TARGETS), colTargets:Object.keys(COLTARGETS), zoneTargets:Object.keys(ZONETARGETS), riders:Object.keys(RIDERS), triggers:['enter', 'attack', 'turnStart', 'damaged', 'combat', 'combatEnd'], passives:['Obscure', 'Aura']}, cloudMap, abDef, hpOf, targetZones, create, dispatch, canPlay, canActivate, hasAction, majorUsed, canPayExtra, recalc, atkOf, RULES, canAttack, totalDamage, freeSlots, targetColumns, colKeys, other, isPerm};
})();

// Validate that every card only uses published APIs (fails loudly at load, not mid-game)
const apiErrors = () => { const A = Sim.API, bad = [];
  const walk = (id, list, kind) => (list || []).forEach(e => { if (!A[kind].includes(e.op)) bad.push(id + ': unknown ' + kind + ' ' + e.op); if (e.effects) walk(id, e.effects, kind); });
  DEFS.forEach(d => { if (d.zoneTarget && !A.zoneTargets.includes(d.zoneTarget)) bad.push(d.id + ': unknown zone target ' + d.zoneTarget); if (d.rider && !A.riders.includes(d.rider.op)) bad.push(d.id + ': unknown rider ' + d.rider.op); (d.passives || []).forEach(p => A.passives.includes(p.op) || bad.push(d.id + ': unknown passive ' + p.op)); (d.req || []).forEach(r => A.requirements.includes(r) || bad.push(d.id + ': unknown requirement ' + r)); walk(d.id, d.effects, 'effects'); if (d.colTarget && !A.colTargets.includes(d.colTarget)) bad.push(d.id + ': unknown column target ' + d.colTarget);
    (d.triggers || []).forEach(g => { A.triggers.includes(g.on) || bad.push(d.id + ': unknown trigger ' + g.on); walk(d.id, g.effects, 'effects'); });
    (d.abilities || []).forEach(a => { walk(d.id, a.effects, 'effects'); walk(d.id, a.cost, 'costs');
      (a.req || []).forEach(r => A.requirements.includes(r) || bad.push(d.id + ': unknown requirement ' + r));
      if (a.target && !A.targets.includes(a.target)) bad.push(d.id + ': unknown target ' + a.target); }); });
  return bad; };
apiErrors().forEach(m => console.error('Card API error: ' + m));
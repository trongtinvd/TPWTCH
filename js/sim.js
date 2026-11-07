// sim.js - SIMULATION: pure rules (no THREE/DOM) plus load-time card API validation. Commands in, events out.
// Classic script: shares one global scope with the other js/*.js files; load order matters (see index.html).

// =====================================================================
// SIMULATION: plain serialisable data + pure functions. No THREE, no DOM,
// no view/camera concepts. Commands in, events out. Runs headless.
// =====================================================================
const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)){ Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };
deepFreeze(DEFS); deepFreeze(TYPES);                // CardDefinitions are immutable design data
const Sim = (function(){
  const other = p => p === 'Player' ? 'Opponent' : 'Player';
  const isPerm = c => c.def.type !== 'spell' && c.def.type !== 'ability';
  const slotRow = c => c.def.type === 'creature' ? 'front' : 'back';
  function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  function buildDeck(owner, seed, defs){                  // CardInstances, top of deck first
    const rnd = mulberry32(seed);
    const cards = defs.map((def,i) => ({iid: owner.toLowerCase()+'-'+i, def, owner, loc:'deck', slot:null, damage:[]}));
    for (let i = cards.length-1; i > 0; i--){ const j = Math.floor(rnd()*(i+1)); [cards[i],cards[j]] = [cards[j],cards[i]]; }
    return cards;
  }
  function create(n, defs){                         // content is injected: the Sim never reads globals
    const s = {n, phase:'deck', ready:{Player:false, Opponent:false}, cards:{}, piles:{}, slots:{}, stack:[], active:'Player', priority:'Player', passes:0, attackPhase:false, life:{Player:20, Opponent:20}, maxLife:20, attacked:[], turn:1, seq:0, majorUsed:false, sid:0, choice:null, pending:null};
    for (const [p, seed] of [['Player', n*2+1], ['Opponent', n*2]]){
      const deck = buildDeck(p, seed, defs); deck.forEach(c => s.cards[c.iid] = c);
      s.piles[p] = {deck, hand:[], gy:[], exile:[]};   // opening hands are dealt when both players press Start
      for (const row of ['front','back']) for (let c = 0; c < 5; c++) s.slots[p+'|'+row+'|'+c] = null;   // slot -> iid
    }
    return s;
  }
  const freeSlots = (s, c) => Object.keys(s.slots).filter(k => !s.slots[k] && k.startsWith(c.owner+'|'+slotRow(c)+'|'));
  function canPlay(s, c){                           // reason string, or null if legal
    if (s.phase !== 'play') return 'The game has not started';
    if (c.loc !== 'hand') return 'Not in hand';
    if (c.owner !== s.priority) return 'Not this player\u2019s priority';
    if (s.attackPhase && (isPerm(c) || c.def.timing !== 'Quick')) return 'Only Quick spells during the battle phase';
    if ((isPerm(c) || c.def.timing === 'Slow') && c.owner !== s.active) return 'Slow cards: turn player only';
    if ((isPerm(c) || c.def.timing === 'Slow') && majorUsed(s)) return 'Major action already used this turn';
    if (isPerm(c)){
      if (s.stack.length) return 'Only when the stack is empty';
      if (!freeSlots(s, c).length) return 'No free ' + slotRow(c) + ' zone';
    } else if (c.def.timing === 'Slow' && s.stack.length) return 'Slow spells need an empty stack';
    return null;
  }
  const totalDamage = c => c.damage.reduce((n, d) => n + d.amount, 0);
  // ---- Abilities & stack objects ------------------------------------------------
  const RULES = {oneMajor:true};                    // console: cardGame.Sim.RULES.oneMajor = false to sandbox freely
  const majorUsed = s => RULES.oneMajor && s.majorUsed;
// ---- Published effect API. Cards reference these by name through Fx; add an entry here to give every card a new building block.
  const TARGETS = {opposingFront: (s, c) => { const col = c.slot && c.slot.split('|')[2], id = col != null && s.slots[other(c.owner) + '|front|' + col]; return id ? s.cards[id] : null; }};
  const findTarget = (s, c, a) => a.target && TARGETS[a.target] ? TARGETS[a.target](s, c) : null;
  const REQS = {                                    // -> reason string, or null if satisfied
    front: (s, c) => (c.slot || '').includes('|front|') ? null : 'Requirement: must be in a front-row zone',
    hurt: (s, c) => s.life[c.owner] >= s.maxLife ? 'Requirement: life is already full' : null,
    target: (s, c, a) => findTarget(s, c, a) ? null : 'Requirement: no legal target'
  };
  const COSTS = {                                   // check -> reason|null; pay mutates (never refunded if countered)
    PayLife: {check: (s, c, k) => s.life[c.owner] <= k.n ? 'Cost: not enough life' : null, pay: (s, c, k, ev) => { s.life[c.owner] -= k.n; ev.push({t:'LifePaid', player:c.owner, amount:k.n}); }},
    ExileFromGY: {check: (s, c, k) => s.piles[c.owner].gy.length < k.n ? 'Cost: graveyard has too few cards' : null,
      pay: (s, c, k, ev) => { for (let i = 0; i < k.n; i++){ const x = s.piles[c.owner].gy.pop(); x.loc = 'exile'; s.piles[c.owner].exile.push(x); ev.push({t:'CardExiled', iid:x.iid}); } }},
    ExileSelf: {check: (s, c) => c.loc === 'gy' ? null : 'Cost: this card must be in the graveyard',
      pay: (s, c, k, ev) => { const g = s.piles[c.owner].gy; g.splice(g.indexOf(c), 1); c.loc = 'exile'; s.piles[c.owner].exile.push(c); ev.push({t:'CardExiled', iid:c.iid}); }},
    SacrificeSelf: {check: () => null, pay: (s, c, k, ev) => destroy(s, c, ev)}
  };
  const payCost = (s, c, k, ev) => COSTS[k.op].pay(s, c, k, ev);
  function canActivate(s, c, i){                    // reason string, or null. Order: 1 requirements, 2 timing, 3 costs
    const a = c && c.def.abilities && c.def.abilities[i];
    if (!a) return 'No such ability';
    const zone = a.zone || 'board'; if (c.loc !== zone) return 'Requirement: must be ' + (zone === 'gy' ? 'in the graveyard' : 'on the board');
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
      function hitStack(s, u, n, ev){                   // stack HP: <= -1 is countered, 0 still resolves
    u.hp -= n; ev.push({t:'StackObjectDamaged', sid:u.sid, amount:n});
    if (u.hp <= -1){
      s.stack.splice(s.stack.indexOf(u), 1);
      if (u.kind === 'spell'){ const c = s.cards[u.iid]; c.loc = 'gy'; s.piles[c.owner].gy.unshift(c); } else s.cards[u.iid].loc = 'gone';
      ev.push({t:'StackObjectCountered', sid:u.sid});
    }
  }
const OPS = {                                     // effect handlers: (ctx, effect). ctx = {s, ev, src, t, who, foe}
    DealDamage: (x, e) => { if (e.to === 'target') dealDamage(x.s, x.src, x.t, e.amount, x.ev, 'effect'); else { x.s.life[x.foe] -= e.amount; x.ev.push({t:'PlayerDamaged', player:x.foe, amount:e.amount}); } },
    GainLife: (x, e) => { x.s.life[x.who] = Math.min(x.s.maxLife, x.s.life[x.who] + e.amount); },
    SacrificeSelf: x => { if (x.src.loc === 'board') destroy(x.s, x.src, x.ev); },   // effect-sacrifice: only if the effect resolves
    Draw: (x, e) => { for (let i = 0; i < e.n; i++){ const d = x.s.piles[x.who].deck.shift(); if (d){ d.loc = 'hand'; x.s.piles[x.who].hand.push(d); x.ev.push({t:'CardDrawn', iid:d.iid, player:x.who}); } } },
    DamageStack: (x, e) => { const u = x.s.stack[x.s.stack.length - 1]; if (u) hitStack(x.s, u, e.amount, x.ev); },
    ShiftAdjacent: x => {                         // asks the controller (a Choose command) instead of moving silently
      const c = x.src; if (c.loc !== 'board') return;
      const [o, row, col] = c.slot.split('|'), opts = [-1, 1].map(d => o + '|' + row + '|' + (+col + d)).filter(k => k in x.s.slots && !x.s.slots[k]);
      if (opts.length){ x.s.choice = {player:x.who, iid:c.iid, options:['stay', ...opts], prompt:c.def.name + ': shift to an adjacent column?'}; x.ev.push({t:'ChoiceRequested', player:x.who}); }
    },
    Repeat: (x, e) => { for (let i = 0; i < e.n; i++) runFx(x, e.effects); }
  };
  const runFx = (x, list) => { for (const e of list || []) if (OPS[e.op]) OPS[e.op](x, e); };
  function resolveObj(s, o, ev){                   // the object is already popped
    const src = s.cards[o.src || o.iid], def = o.kind === 'spell' ? src.def : src.def[o.list][o.ab];
    const t = o.target ? s.cards[o.target] : null;
    if (def.target && !(t && t.loc === 'board')){ ev.push({t:'StackObjectFizzled', sid:o.sid}); return; }   // target became illegal
    runFx({s, ev, src, t, who:o.controller, foe:other(o.controller)}, def.effects);
  }
      function destroy(s, c, ev){                       // leaves the field for the graveyard; damage counters go away
    s.slots[c.slot] = null; c.slot = null; c.loc = 'gy'; c.damage = [];
    s.piles[c.owner].gy.unshift(c); ev.push({t:'PermanentDestroyed', iid:c.iid});
  }
  function dealDamage(s, src, tgt, amount, ev, type){     // adds a damage counter; destroyed once damage exceeds HP
    tgt.damage.push({amount, source:src.iid, type:type || 'combat', turn:s.turn, seq:++s.seq});
    ev.push({t:'DamageDealt', source:src.iid, target:tgt.iid, amount});
    if (totalDamage(tgt) > tgt.def.hp) destroy(s, tgt, ev);
  }
  function canAttack(s, c){                         // reason string, or null if legal
    if (!c || c.loc !== 'board' || c.def.type !== 'creature') return 'Only creatures on the board can attack';
    if (!s.attackPhase) return 'Turn the attack phase on first';
    if (s.attacked.includes(c.iid)) return 'Already attacked this turn';
    if (c.owner !== s.active) return 'Not this player\u2019s turn';
    if (s.stack.length) return 'Stack is not empty';
    if (!c.slot || !c.slot.includes('|front|')) return 'Only front-row creatures can attack';
    return null;
  }
  function pushObj(s, c, list, i, ev, target){   // abilities AND triggers share one path: a token card + a stack object with its own HP
    const a = c.def[list][i], sid = ++s.sid, n = list === 'triggers' ? 100 + i : i;
    const tok = {iid:'tok-' + sid, def:{id:'tok-' + c.def.id + '-' + n, name:c.def.name + ': ' + (a.name || 'Trigger'), type:'ability', timing:a.speed || 'Trigger', hp:a.hp ?? 1, text:c.def.text}, owner:c.owner, loc:'stack', slot:null, damage:[], token:true};
    s.cards[tok.iid] = tok;
    s.stack.push({sid, kind:'ability', iid:tok.iid, src:c.iid, list, ab:i, controller:c.owner, hp:tok.def.hp, target:target || null, name:tok.def.name});
    s.passes = 0; ev.push({t:'StackObjectCreated', iid:c.iid});
  }
  function fire(s, ev, on, subject){                // event -> ALL matching triggers go onto the stack together, then priority passes (turn player first)
    const hits = [];                                // 1) collect every trigger that matches this event
    for (const c of Object.values(s.cards)){
      if (c.loc !== 'board') continue;
      (c.def.triggers || []).forEach((t, i) => {
        if (t.on !== on) return;
        if (on === 'enter' && c !== subject) return;
        if (on === 'attack' && !(((t.by || []).includes('self') && c === subject) || ((t.by || []).includes('foe') && c.owner !== subject.owner))) return;
        hits.push({c, i});
      });
    }
    // 2) turn player's triggers are put on the stack first, then the other player's (so the other player's resolve first).
    //    Stable sort: within one player the order is card creation order (deterministic placeholder until players can order their own triggers).
    hits.sort((a, b) => (b.c.owner === s.active) - (a.c.owner === s.active));
    for (const h of hits) pushObj(s, h.c, 'triggers', h.i, ev);
    if (hits.length) s.priority = s.active;         // 3) only now does priority pass, to the turn player first
  }
  function strike(s, c, ev){                        // damage flows down the attacker's CURRENT column
    const col = c.slot.split('|')[2], foe = other(c.owner); let left = c.def.atk;
    for (const row of ['front', 'back']){
      const id = s.slots[foe + '|' + row + '|' + col]; if (!id || left <= 0) continue;
      const t = s.cards[id], remaining = t.def.hp - totalDamage(t);
      dealDamage(s, c, t, left, ev); left = Math.max(0, left - remaining);
    }
    if (left > 0){ s.life[foe] -= left; ev.push({t:'PlayerDamaged', player:foe, amount:left}); }
  }
  function settle(s, ev){                           // deferred combat runs once no trigger or choice is outstanding
    if (!s.pending || s.choice || s.stack.length) return;
    const c = s.cards[s.pending.iid]; s.pending = null;
    if (c.loc === 'board') strike(s, c, ev);        // an attacker that left the field deals no damage
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
        const h = s.piles[c.owner].hand; h.splice(h.indexOf(c), 1);
        if (isPerm(c) || c.def.timing === 'Slow') s.majorUsed = true;
        if (isPerm(c)){ s.slots[cmd.slot] = c.iid; c.slot = cmd.slot; c.loc = 'board'; ev.push({t:'PermanentSummoned', iid:c.iid, slot:cmd.slot}); fire(s, ev, 'enter', c); }
        else { c.loc = 'stack'; s.stack.push({sid:++s.sid, kind:'spell', iid:c.iid, controller:c.owner, hp:c.def.hp, name:c.def.name}); s.passes = 0; s.priority = other(c.owner); ev.push({t:'StackObjectCreated', iid:c.iid}); }   // the opponent gets priority first; the stack resolves only after two passes in a row
        break;
      }
      case 'Pass': {
        if (!s.stack.length) return fail('Nothing on the stack');
        if (cmd.player !== s.priority) return fail('Not this player\u2019s priority');
        if (++s.passes >= 2){
          const o = s.stack.pop(), c = s.cards[o.iid]; resolveObj(s, o, ev);
          if (o.kind === 'spell'){ c.loc = 'gy'; s.piles[c.owner].gy.unshift(c); } else c.loc = 'gone';   // ability tokens cease to exist   // newest first
          s.passes = 0; s.priority = s.active; ev.push({t:'StackObjectResolved', iid:c.iid}); settle(s, ev);
        } else { s.priority = other(s.priority); ev.push({t:'PriorityPassed', to:s.priority}); }
        break;
      }
      case 'SetAttackPhase': {
        if (cmd.player !== s.active) return fail('Only the turn player can enter the battle phase');
        if (cmd.player !== s.priority) return fail('Not this player\u2019s priority');
        if (s.stack.length) return fail('Stack is not empty');
        if (cmd.on && !s.attackPhase){ if (majorUsed(s)) return fail('Major action already used this turn'); s.majorUsed = true; }
        s.attackPhase = !!cmd.on; ev.push({t:'AttackPhaseChanged', on:s.attackPhase}); break;
      }
      case 'Attack': {
        const c = s.cards[cmd.iid], why = canAttack(s, c);
        if (why) return fail(why);
        s.attacked.push(c.iid);
        ev.push({t:'CreatureAttackDeclared', iid:c.iid, col:+c.slot.split('|')[2]});
        s.pending = {iid:c.iid}; fire(s, ev, 'attack', c); settle(s, ev);   // damage waits for attack triggers to resolve
        break;
      }
      case 'Choose': {
        const k = s.choice;
        if (!k) return fail('Nothing to choose'); if (cmd.player !== k.player) return fail('Not your choice'); if (!k.options.includes(cmd.option)) return fail('Illegal option');
        s.choice = null; const c = s.cards[k.iid];
        if (cmd.option !== 'stay'){ s.slots[c.slot] = null; s.slots[cmd.option] = c.iid; c.slot = cmd.option; ev.push({t:'PermanentMoved', iid:c.iid, slot:cmd.option}); }
        ev.push({t:'ChoiceMade', player:k.player}); settle(s, ev); break;
      }
      case 'Activate': {
        const c = s.cards[cmd.iid], why = c ? canActivate(s, c, cmd.ab) : 'Unknown card';
        if (why) return fail(why);
        const a = c.def.abilities[cmd.ab], tgt = findTarget(s, c, a);
        for (const k of a.cost || []) payCost(s, c, k, ev);               // costs are paid on activation
        if (a.speed === 'Slow') s.majorUsed = true;                       // Slow consumes the major action now, not on resolution
        pushObj(s, c, 'abilities', cmd.ab, ev, tgt ? tgt.iid : null);
        s.priority = other(c.owner);                                      // the opponent gets priority first
        ev.push({t:'AbilityActivated', iid:c.iid, ab:cmd.ab, speed:a.speed}); break;
      }
      case 'EndTurn':
        if (cmd.player !== s.active || cmd.player !== s.priority) return fail('Only the turn player holding priority can end the turn');
        if (s.stack.length) return fail('Stack is not empty');
        s.active = other(s.active); s.attackPhase = false; s.attacked = []; s.turn++; s.majorUsed = false;
        s.priority = s.active; s.passes = 0; ev.push({t:'TurnChanged', active:s.active}); break;
      default: return fail('Unknown command');
    }
    return {ok:true, events:ev};
  }
  function hasAction(s, p){                         // is there anything legal for p right now?
    if (s.phase !== 'play' || p !== s.priority) return false;
    const P = s.piles[p], mine = Object.values(s.cards).filter(c => c.owner === p && (c.loc === 'board' || c.loc === 'gy')), turn = p === s.active && !s.stack.length;
    if (turn && !s.attackPhase && !majorUsed(s) && P.deck.length) return true;
    if (P.hand.some(c => !canPlay(s, c))) return true;
    if (s.attackPhase ? mine.some(c => !canAttack(s, c)) : turn && !majorUsed(s) && mine.some(c => c.def.type === 'creature' && (c.slot || '').includes('|front|'))) return true;
    return mine.some(c => (c.def.abilities || []).some((a, i) => !canActivate(s, c, i)));
  }
  return {API:{effects:Object.keys(OPS), costs:Object.keys(COSTS), requirements:Object.keys(REQS), targets:Object.keys(TARGETS), triggers:['enter', 'attack']}, create, dispatch, canPlay, canActivate, hasAction, majorUsed, RULES, canAttack, totalDamage, freeSlots, other, isPerm};
})();

// Validate that every card only uses published APIs (fails loudly at load, not mid-game)
const apiErrors = () => { const A = Sim.API, bad = [];
  const walk = (id, list, kind) => (list || []).forEach(e => { if (!A[kind].includes(e.op)) bad.push(id + ': unknown ' + kind + ' ' + e.op); if (e.effects) walk(id, e.effects, kind); });
  DEFS.forEach(d => { walk(d.id, d.effects, 'effects');
    (d.triggers || []).forEach(g => { A.triggers.includes(g.on) || bad.push(d.id + ': unknown trigger ' + g.on); walk(d.id, g.effects, 'effects'); });
    (d.abilities || []).forEach(a => { walk(d.id, a.effects, 'effects'); walk(d.id, a.cost, 'costs');
      (a.req || []).forEach(r => A.requirements.includes(r) || bad.push(d.id + ': unknown requirement ' + r));
      if (a.target && !A.targets.includes(a.target)) bad.push(d.id + ': unknown target ' + a.target); }); });
  return bad; };
apiErrors().forEach(m => console.error('Card API error: ' + m));

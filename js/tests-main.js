// tests-main.js - Headless self-tests, console hook, bootstrap and render loop
// ---- Headless rules tests (no THREE/DOM): run cardGame.selfTest() in the console ----
function selfTest(){
  const out = [], D = (s, c) => Sim.dispatch(s, c), other = Sim.other;
  const check = (name, ok, detail) => out.push((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  | ' + detail : ''));
  const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), 'expected ' + JSON.stringify(want) + ', got ' + JSON.stringify(got));
  const xfail = (name, ok) => out.push(ok ? 'FAIL (known bug looks fixed: turn into a normal check) ' + name : 'XFAIL (known bug) ' + name);
  // rej: the command must fail, for the stated reason, with no events and NO change to the game state at all
  const rej = (name, s, cmd, why) => { const before = JSON.stringify(s), r = D(s, cmd); check(name, !r.ok && r.why.includes(why) && !r.events.length && JSON.stringify(s) === before, r.ok ? 'command succeeded' : 'why="' + r.why + '", events=' + r.events.length + ', stateUnchanged=' + (JSON.stringify(s) === before)); };
  const start = seed => { const s = Sim.create(seed, DEFS.concat(FIXTURES)); for (const p of ['Player', 'Opponent']) D(s, {type:'Start', player:p});
    for (const p of ['Player', 'Opponent']){ const P = s.piles[p], i = P.hand.findIndex(c => c.def.id === 'shieldguard'); if (i >= 0){ const c = P.hand.splice(i, 1)[0]; c.loc = 'deck'; P.deck.push(c); const n = P.deck.shift(); n.loc = 'hand'; P.hand.push(n); } }   // Shieldguard in an opening hand would open an attack response window and skew unrelated combat tests
    return s; };
  const take = (s, o, id, loc, slot) => {           // move a named card out of its pile into hand / gy / a board slot
    const c = Object.values(s.cards).find(x => x.owner === o && x.def.id === id), P = s.piles[o];
    for (const k of ['deck', 'hand', 'gy']){ const i = P[k].indexOf(c); if (i >= 0) P[k].splice(i, 1); }
    c.loc = loc; if (loc === 'hand') P.hand.push(c); else if (loc === 'gy') P.gy.push(c); else { s.slots[slot] = c.iid; c.slot = slot; }
    return c;
  };
  const toDeck = (s, o, id) => { const c = take(s, o, id, 'gy'); s.piles[o].gy.pop(); c.loc = 'deck'; s.piles[o].deck.push(c); return c; };
  const pass2 = s => { D(s, {type:'Pass', player:s.priority}); return D(s, {type:'Pass', player:s.priority}); };   // both pass: the top object resolves
  const AT = (s, id) => { const r = D(s, {type:'Attack', iid:id}); drain(s); return r; };   // declare an attack and let the stack resolve (stops at a pending choice)
  const drain = s => { let n = 0; while ((s.stack.length || s.respond) && !s.choice && n++ < 40) D(s, {type:'Pass', player:s.priority}); };
  const endTurnFlow = s => { const p = s.active; D(s, {type:'EndTurn', player:p}); D(s, {type:'Pass', player:other(p)}); };
  const dmg = (s, c, n, type) => Sim.addStatus(s, c, {kind:'damage', amount:n, orig:n, type:type || 'effect', source:c.iid, srcName:'test'});   // put a damage status on a card
  const ndmg = c => Sim.live(c).filter(x => x.kind === 'damage').length;   // active damage statuses
  const dl = c => Sim.live(c).filter(x => x.kind === 'damage').map(d => [d.amount, d.type, d.source]);
  const setLife = (s, p, n) => { Sim.addStatus(s, s.players[p], {kind:'damage', amount:s.life[p] - n, type:'effect', srcName:'test'}); s.life[p] = Sim.lifeOf(s, p); };
  const shield = (s, c, color) => Sim.addStatus(s, c, {kind:'shield', color, srcName:'test'});
  const kinds = (c, k) => Sim.live(c).filter(x => x.kind === k);
  const owners = st => st.stack.map(o => st.cards[o.src].owner);
  const tokens = st => Object.values(st.cards).filter(x => x.def.id === 'vine-token' && x.loc === 'board');
  const abTokens = st => Object.values(st.cards).filter(x => x.def.type === 'ability');

  // ================= setup, determinism, deck building =================
  check('every card only uses published effect APIs', !apiErrors().length, apiErrors().join('; '));
  { const a = start(7), b = start(7), c = start(8);
    check('same seed -> same state', JSON.stringify(a) === JSON.stringify(b));
    check('different seed -> different state (so the comparison above is not vacuous)', JSON.stringify(a) !== JSON.stringify(c));
    const run = () => { const s = start(9), z = take(s, 'Player', 'zap', 'hand'); D(s, {type:'PlayCard', iid:z.iid}); pass2(s); D(s, {type:'Draw', player:'Player'}); return JSON.stringify(s); };
    check('replaying the same commands from the same seed reproduces the same final state', run() === run()); }
  { const s = Sim.create(3, DEFS.concat(FIXTURES)), top = s.piles.Player.deck.map(c => c.iid), n = top.length;
    rej('deck building: only Start/ReorderDeck are accepted', s, {type:'Draw', player:'Player'}, 'Deck building');
    D(s, {type:'ReorderDeck', player:'Player', from:0, to:3});
    eq('ReorderDeck moves position 0 to position 3 and shifts the others up', s.piles.Player.deck.map(c => c.iid).slice(0, 4), [top[1], top[2], top[3], top[0]]);
    eq('reordering keeps the same set of cards', s.piles.Player.deck.map(c => c.iid).sort(), [...top].sort());
    rej('ReorderDeck rejects an out-of-range position', s, {type:'ReorderDeck', player:'Player', from:0, to:n}, 'Bad deck position');
    D(s, {type:'Start', player:'Player'});
    rej('a ready player\u2019s deck is locked', s, {type:'ReorderDeck', player:'Player', from:0, to:1}, 'locked');
    rej('Start twice by the same player is rejected', s, {type:'Start', player:'Player'}, 'Already ready');
    check('no hands are dealt until BOTH players are ready', s.phase === 'deck' && !s.piles.Player.hand.length && !s.piles.Opponent.hand.length);
    D(s, {type:'Start', player:'Opponent'});
    eq('both ready: play phase, opening hand = first five cards of the reordered deck, deck shrinks by 5', [s.phase, s.piles.Player.hand.map(c => c.iid), s.piles.Player.deck.length, s.piles.Opponent.hand.length], ['play', [top[1], top[2], top[3], top[0], top[4]], n - 5, 5]);
    rej('Start after the game began is rejected', s, {type:'Start', player:'Player'}, 'already started'); }

  // ================= draw / major action =================
  { let s = start(10); const P = s.piles.Player, top = P.deck.slice(0, 2).map(c => c.iid), h0 = P.hand.length, d0 = P.deck.length;
    D(s, {type:'Draw', player:'Player'});
    eq('Draw adds the top two deck cards to the hand, in order', P.hand.slice(h0).map(c => c.iid), top);
    check('Draw: deck shrinks by exactly 2, drawn cards are in hand, major action used', P.deck.length === d0 - 2 && P.hand.slice(h0).every(c => c.loc === 'hand') && s.majorUsed);
    rej('a second major action in the same turn is rejected', s, {type:'Draw', player:'Player'}, 'Major action already used');
    s = start(11); s.piles.Player.deck.splice(1); const last = s.piles.Player.deck[0], hh = s.piles.Player.hand.length;
    D(s, {type:'Draw', player:'Player'});
    check('with one card left, Draw takes just that card', s.piles.Player.hand.length === hh + 1 && s.piles.Player.hand[hh] === last && !s.piles.Player.deck.length);
    s.majorUsed = false; rej('Draw with an empty deck is rejected', s, {type:'Draw', player:'Player'}, 'Deck is empty');
    s = start(12); const zz = take(s, 'Player', 'zap', 'hand'); D(s, {type:'PlayCard', iid:zz.iid}); D(s, {type:'Pass', player:'Opponent'});
    rej('Draw is rejected while the stack is not empty', s, {type:'Draw', player:'Player'}, 'Stack is not empty');
    s = start(13); D(s, {type:'SetAttackPhase', player:'Player', on:true});
    rej('Draw is rejected during the battle phase', s, {type:'Draw', player:'Player'}, 'battle phase');
    s = start(14); D(s, {type:'EndTurn', player:'Player'}); 
    rej('the non-turn player cannot Draw (a major action) in the end-step window; nothing changes', s, {type:'Draw', player:'Opponent'}, 'turn player'); }

  // ================= placement and the one-major-action rule =================
  { let s = start(20); const sd = take(s, 'Player', 'soldier', 'hand'), bar = take(s, 'Player', 'barrier', 'hand');
    rej('a creature cannot be placed in a back-row zone', s, {type:'PlayCard', iid:sd.iid, slot:'Player|back|0'}, 'Illegal zone');
    rej('a creature cannot be placed on the opponent\u2019s side', s, {type:'PlayCard', iid:sd.iid, slot:'Opponent|front|0'}, 'Illegal zone');
    rej('a non-creature permanent cannot be placed in a front-row zone', s, {type:'PlayCard', iid:bar.iid, slot:'Player|front|0'}, 'Illegal zone');
    const r = D(s, {type:'PlayCard', iid:sd.iid, slot:'Player|front|0'});
    check('summon: creature stands on the chosen zone, left the hand, major action used', r.ok && sd.loc === 'board' && sd.slot === 'Player|front|0' && s.slots['Player|front|0'] === sd.iid && !s.piles.Player.hand.includes(sd) && s.majorUsed);
    check('summon opens an enter-response window for the opponent and puts nothing on the stack', !!s.respond && s.respond.kind === 'enter' && s.priority === 'Opponent' && !s.stack.length);
    rej('the turn player cannot act while the opponent may respond', s, {type:'Draw', player:'Player'}, 'priority');
    drain(s);
    const sb = take(s, 'Player', 'superbolt', 'hand'), he = take(s, 'Player', 'heal', 'hand');
    rej('after a summon a second permanent is rejected (major action used)', s, {type:'PlayCard', iid:bar.iid, slot:'Player|back|0'}, 'Major action already used');
    rej('after a summon a Slow spell is rejected (major action used)', s, {type:'PlayCard', iid:sb.iid, tplayer:'Opponent'}, 'Major action already used');
    check('after a summon a Quick spell is still legal (free action)', Sim.canPlay(s, he) === null);
    s = start(21); const w = take(s, 'Player', 'wolf', 'hand'); take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|0'); take(s, 'Player', 'soldier', 'board', 'Player|front|0');
    rej('an occupied zone is rejected', s, {type:'PlayCard', iid:w.iid, slot:'Player|front|0'}, 'Illegal zone');
    s = start(22); const five = ['soldier', 'knight', 'giant', 'guard', 'wolf'].map((id, i) => take(s, 'Player', id, 'board', 'Player|front|' + i)), ar = take(s, 'Player', 'archer', 'hand'), bb = take(s, 'Player', 'barrier', 'hand');
    rej('full front row: a sixth creature is rejected for the right reason, nothing is created or moved', s, {type:'PlayCard', iid:ar.iid, slot:'Player|front|0'}, 'No free front zone');
    check('full front row: the five creatures are still in place, back row is still usable', five.every((c, i) => c.slot === 'Player|front|' + i && s.slots['Player|front|' + i] === c.iid) && Sim.canPlay(s, bb) === null);
    s = start(23); const o1 = take(s, 'Opponent', 'soldier', 'hand');
    rej('the non-turn player cannot place a permanent on the turn player\u2019s turn', s, {type:'PlayCard', iid:o1.iid, slot:'Opponent|front|0'}, 'priority');
    s.priority = 'Opponent'; rej('with priority but off-turn, permanents are still turn-player-only', s, {type:'PlayCard', iid:o1.iid, slot:'Opponent|front|0'}, 'turn player only');
    s = start(24); const s1 = take(s, 'Player', 'soldier', 'hand'), h1 = take(s, 'Player', 'heal', 'hand'); D(s, {type:'SetAttackPhase', player:'Player', on:true});
    rej('battle phase: permanents are rejected', s, {type:'PlayCard', iid:s1.iid, slot:'Player|front|0'}, 'Only Quick spells during the battle phase');
    check('battle phase: Quick spells are still legal', Sim.canPlay(s, h1) === null); }

  // ================= combat =================
  { let s = start(30); const k = take(s, 'Player', 'knight', 'board', 'Player|front|0'); s.attackPhase = true;
    const r = AT(s, k.iid);
    eq('empty column: knight (ATK 4) deals 4 to the opponent and nothing to its controller', [s.life.Opponent, s.life.Player], [16, 20]);
    check('attack bookkeeping: attacker recorded, declared in column 0, no stack objects, no damage counters', r.ok && Sim.attackedIds(s).includes(k.iid) && !s.stack.length && !ndmg(k) && r.events.some(e => e.t === 'CreatureAttackDeclared' && e.col === 0));
    s = start(31); let v = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'); const g = take(s, 'Player', 'giant', 'board', 'Player|front|1'), by = take(s, 'Opponent', 'guard', 'board', 'Opponent|front|2'); s.attackPhase = true;
    AT(s, g.iid);
    check('giant (ATK 6) destroys soldier (HP 3): it is in its owner\u2019s GY, zone freed, counters cleared', v.loc === 'gy' && !v.slot && !ndmg(v) && s.piles.Opponent.gy[0] === v && s.slots['Opponent|front|1'] === null);
    eq('excess damage 6-3 tramples to the player', s.life.Opponent, 17);
    check('no counter-damage to the attacker; a card in another column is untouched', !ndmg(g) && !ndmg(by));
    s = start(32); v = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'); let k2 = take(s, 'Player', 'wolf', 'board', 'Player|front|1'); s.attackPhase = true; AT(s, k2.iid);
    eq('ATK == HP (3 vs 3): target survives at effective HP 0, no trample', [v.loc, Sim.totalDamage(v), s.life.Opponent], ['board', 3, 20]);
    s = start(33); v = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'); k2 = take(s, 'Player', 'knight', 'board', 'Player|front|1'); s.attackPhase = true; AT(s, k2.iid);
    eq('ATK == HP+1 (4 vs 3): target dies (HP -1), exactly 1 tramples', [v.loc, s.life.Opponent], ['gy', 19]);
    s = start(34); v = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'); const kb = take(s, 'Opponent', 'knight', 'board', 'Opponent|back|1'), g2 = take(s, 'Player', 'giant', 'board', 'Player|front|1'); s.attackPhase = true; AT(s, g2.iid);
    eq('front-to-back trample: soldier dies, the back knight takes only the remaining 3 as one combat instance from the giant', [v.loc, kb.loc, dl(kb).map(d => [d[0], d[2], d[1]]), s.life.Opponent], ['gy', 'board', [[3, g2.iid, 'combat']], 20]);
    s = start(35); const gd = take(s, 'Opponent', 'guard', 'board', 'Opponent|front|1'), br = take(s, 'Opponent', 'barrier', 'board', 'Opponent|back|1'); const g3 = take(s, 'Player', 'giant', 'board', 'Player|front|1'); s.attackPhase = true; AT(s, g3.iid);
    eq('a front card that absorbs everything (6 vs HP 6) shields the back card: no damage instance on it, player untouched', [gd.loc, Sim.totalDamage(gd), ndmg(br), s.life.Opponent], ['board', 6, 0, 20]);
    s = start(36); v = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'); dmg(s, v, 2); k2 = take(s, 'Player', 'wolf', 'board', 'Player|front|1'); s.attackPhase = true; AT(s, k2.iid);
    eq('a pre-damaged target absorbs only its remaining HP: soldier (HP 3, 2 damage) absorbs 1, wolf tramples 2', [v.loc, s.life.Opponent], ['gy', 18]);
    s = start(37); const b2 = take(s, 'Opponent', 'barrier', 'board', 'Opponent|back|1'), g4 = take(s, 'Player', 'giant', 'board', 'Player|front|1'); s.attackPhase = true; AT(s, g4.iid);
    eq('a back-row card with an empty front row is hit: barrier (HP 2) dies, 6-2=4 tramples', [b2.loc, s.life.Opponent], ['gy', 16]);
    s = start(38); const bk = take(s, 'Player', 'knight', 'board', 'Player|back|0'); s.attackPhase = true;
    check('a creature standing in a back-row zone can attack (current rule: attacks go down its own column)', Sim.canAttack(s, bk) === null);
    AT(s, bk.iid); eq('back-row attacker with an empty column hits the player', s.life.Opponent, 16); }
  { let s = start(40); const k = take(s, 'Player', 'wolf', 'board', 'Player|front|0'), inHand = take(s, 'Player', 'soldier', 'hand'), bar = take(s, 'Player', 'barrier', 'board', 'Player|back|2'), o = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|3');
    rej('attack requires the attack phase', s, {type:'Attack', iid:k.iid}, 'attack phase'); s.attackPhase = true;
    rej('a non-creature permanent cannot attack', s, {type:'Attack', iid:bar.iid}, 'Only creatures');
    rej('a creature in hand cannot attack', s, {type:'Attack', iid:inHand.iid}, 'Only creatures');
    rej('the non-turn player\u2019s creature cannot attack', s, {type:'Attack', iid:o.iid}, 'turn');
    AT(s, k.iid);
    rej('a creature cannot attack twice in a turn', s, {type:'Attack', iid:k.iid}, 'Already attacked');
    const k3 = take(s, 'Player', 'knight', 'board', 'Player|front|1'), z = take(s, 'Player', 'zap', 'hand'); D(s, {type:'PlayCard', iid:z.iid}); D(s, {type:'Pass', player:'Opponent'});
    rej('no attack while the stack is not empty', s, {type:'Attack', iid:k3.iid}, 'Stack is not empty');
    s = start(41); take(s, 'Player', 'wolf', 'board', 'Player|front|0');
    rej('only the turn player can enter the battle phase', s, {type:'SetAttackPhase', player:'Opponent', on:true}, 'turn player');
    D(s, {type:'SetAttackPhase', player:'Player', on:true}); check('entering the battle phase uses the major action', s.attackPhase && s.majorUsed);
    D(s, {type:'SetAttackPhase', player:'Player', on:false});
    rej('leaving and re-entering the battle phase is not a second major action', s, {type:'SetAttackPhase', player:'Player', on:true}, 'Major action already used');
    s = start(42); D(s, {type:'Draw', player:'Player'});
    rej('after another major action the battle phase is unavailable', s, {type:'SetAttackPhase', player:'Player', on:true}, 'Major action already used'); }
  { let s = start(43); const sc = take(s, 'Player', 'scout', 'board', 'Player|front|1'), os = take(s, 'Opponent', 'scout', 'board', 'Opponent|front|1'), hb = take(s, 'Opponent', 'hummingbird', 'board', 'Opponent|front|3'); s.attackPhase = true;
    D(s, {type:'Attack', iid:sc.iid});
    eq('attack declared: the Attack and Hummingbird\u2019s trigger are TWO separate stack objects, damage is deferred', [owners(s), s.stack.map(o => o.kind), s.life.Opponent, s.priority], [['Player', 'Opponent'], ['attack', 'ability'], 20, 'Opponent']);
    D(s, {type:'Activate', iid:os.iid, ab:0}); pass2(s);
    check('in response the Opponent\u2019s Scout kills the attacker (HP 1) before damage', sc.loc === 'gy' && os.loc === 'gy' && s.stack.length === 2 && s.stack[0].kind === 'attack');
    pass2(s); check('trigger resolved: shift choice for the Opponent', !!s.choice && s.choice.player === 'Opponent');
    D(s, {type:'Choose', player:'Opponent', option:'stay'}); drain(s);
    eq('an attacker that left the field deals NO damage (the Attack resolves, nothing hit)', [s.life.Opponent, s.life.Player, ndmg(hb), s.stack.length], [20, 20, 0, 0]); }

  // ================= Red Hummingbird =================
  { let s = start(50); const hb = take(s, 'Opponent', 'hummingbird', 'board', 'Opponent|front|1'), g = take(s, 'Player', 'giant', 'board', 'Player|front|1'); s.attackPhase = true; D(s, {type:'Attack', iid:g.iid});
    check('attack damage waits: the Attack stays on the stack under the trigger (nothing damaged yet)', s.stack.length === 2 && s.life.Opponent === 20 && !ndmg(hb));
    pass2(s);
    eq('shift choice: stay + both adjacent empty zones, offered to the Hummingbird\u2019s controller', [s.choice.player, s.choice.options], ['Opponent', ['stay', 'Opponent|front|0', 'Opponent|front|2']]);
    rej('while a choice is pending other commands are rejected', s, {type:'Draw', player:'Player'}, 'Waiting for Opponent');
    rej('only the choosing player may choose', s, {type:'Choose', player:'Player', option:'stay'}, 'Not your choice');
    rej('an option outside the list is rejected', s, {type:'Choose', player:'Opponent', option:'Opponent|front|4'}, 'Illegal option');
    D(s, {type:'Choose', player:'Opponent', option:'Opponent|front|0'}); drain(s);
    eq('shifted Hummingbird dodges: it moved, is undamaged, the giant hits the now-empty column 1 for 6', [hb.slot, hb.loc, ndmg(hb), s.life.Opponent, s.slots['Opponent|front|1'], s.stack.length], ['Opponent|front|0', 'board', 0, 14, null, 0]);
    s = start(51); const h2 = take(s, 'Opponent', 'hummingbird', 'board', 'Opponent|front|1'), g2 = take(s, 'Player', 'giant', 'board', 'Player|front|1'); s.attackPhase = true; D(s, {type:'Attack', iid:g2.iid}); pass2(s); D(s, {type:'Choose', player:'Opponent', option:'stay'}); drain(s);
    eq('choosing "stay": Hummingbird (HP 1) takes the hit and dies, 6-1=5 tramples', [h2.loc, s.life.Opponent], ['gy', 15]);
    s = start(52); const h3 = take(s, 'Opponent', 'hummingbird', 'board', 'Opponent|front|0'), g3 = take(s, 'Player', 'giant', 'board', 'Player|front|0'); s.unusable['Opponent|front|1'] = true; s.attackPhase = true; D(s, {type:'Attack', iid:g3.iid}); pass2(s); drain(s);
    eq('no legal adjacent zone (edge column + unusable neighbour): no choice is asked and the attack proceeds', [s.choice, h3.loc, s.life.Opponent, s.stack.length], [null, 'gy', 15, 0]);
    s = start(53); const h4 = take(s, 'Opponent', 'hummingbird', 'board', 'Opponent|front|0'), g4 = take(s, 'Player', 'giant', 'board', 'Player|front|0'); take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'); s.attackPhase = true; D(s, {type:'Attack', iid:g4.iid}); pass2(s);
    eq('an occupied neighbour is not offered either: no choice with both sides blocked', s.choice, null);
    s = start(54); const h5 = take(s, 'Player', 'hummingbird', 'hand'), top = s.piles.Player.deck[0], d0 = s.piles.Player.deck.length; D(s, {type:'PlayCard', iid:h5.iid, slot:'Player|front|2'});
    eq('enter trigger goes on the stack (not resolved yet)', [s.stack.length, owners(s)], [1, ['Player']]); drain(s);
    check('enter trigger draws exactly the top card of the deck', top.loc === 'hand' && s.piles.Player.deck.length === d0 - 1 && s.piles.Player.hand.includes(top));
    s = start(55); take(s, 'Player', 'hummingbird', 'board', 'Player|front|0'); take(s, 'Opponent', 'hummingbird', 'board', 'Opponent|front|0'); const nw = take(s, 'Player', 'soldier', 'hand'); D(s, {type:'PlayCard', iid:nw.iid, slot:'Player|front|1'});
    eq('enter triggers fire only for the card that entered (other Hummingbirds stay silent)', s.stack.length, 0);
    s = start(56); const gy = take(s, 'Player', 'hummingbird', 'gy');
    rej('GY ability needs missing life (life is full)', s, {type:'Activate', iid:gy.iid, ab:0}, 'already full');
    setLife(s, 'Player', 10); D(s, {type:'Activate', iid:gy.iid, ab:0});
    check('GY ability: the exile cost is paid on activation, effect still pending', gy.loc === 'exile' && s.stack.length === 1 && s.life.Player === 10);
    pass2(s); eq('GY ability resolves: +3 life, Hummingbird stays exiled', [s.life.Player, gy.loc, s.piles.Player.exile.includes(gy)], [13, 'exile', true]);
    s = start(57); const hb2 = take(s, 'Player', 'hummingbird', 'board', 'Player|front|0'); setLife(s, 'Player', 10);
    rej('GY ability cannot be used from the board', s, {type:'Activate', iid:hb2.iid, ab:0}, 'graveyard'); }
  { let s = start(60); take(s, 'Player', 'hummingbird', 'board', 'Player|front|0'); const c = take(s, 'Player', 'soldier', 'board', 'Player|front|2'); take(s, 'Opponent', 'hummingbird', 'board', 'Opponent|front|4'); s.attackPhase = true; D(s, {type:'Attack', iid:c.iid});
    eq('trigger eligibility: own non-attacking Hummingbird does not trigger, the foe\u2019s does (Attack at the bottom)', [owners(s), s.priority], [['Player', 'Opponent'], 'Opponent']);
    s = start(61); const a = take(s, 'Player', 'hummingbird', 'board', 'Player|front|0'); take(s, 'Opponent', 'hummingbird', 'board', 'Opponent|front|3'); s.attackPhase = true; D(s, {type:'Attack', iid:a.iid});
    eq('simultaneous triggers (Player turn): the Attack is at the bottom, then Player\u2019s trigger, Opponent\u2019s on top, Opponent gets priority', [owners(s), s.priority], [['Player', 'Player', 'Opponent'], 'Opponent']);
    pass2(s); eq('the Opponent\u2019s trigger (top) resolves first', [s.choice && s.choice.player, s.stack.length], ['Opponent', 2]);
    s = start(62); s.active = 'Opponent'; s.priority = 'Opponent'; take(s, 'Player', 'hummingbird', 'board', 'Player|front|0'); const b = take(s, 'Opponent', 'hummingbird', 'board', 'Opponent|front|3'); s.attackPhase = true; D(s, {type:'Attack', iid:b.iid});
    eq('simultaneous triggers (Opponent turn): the Attack, Opponent\u2019s trigger, Player\u2019s on top, Player gets priority', [owners(s), s.priority], [['Opponent', 'Opponent', 'Player'], 'Player']); }

  // ================= Avatar of Rabies + Throwing Bandages (damage instances, ability layer) =================
  { const q = start(70), av = take(q, 'Opponent', 'avatar', 'board', 'Opponent|front|1'), g = take(q, 'Player', 'giant', 'board', 'Player|front|1'); q.attackPhase = true;
    D(q, {type:'Attack', iid:g.iid});
    eq('Avatar: any creature attacking puts its shift trigger above the Attack; damage waits', [q.stack.length, Sim.totalDamage(av), q.life.Opponent], [2, 0, 20]);
    pass2(q); eq('Avatar: shift choice for its controller (stay + 2 neighbours)', [q.choice.player, q.choice.options.length], ['Opponent', 3]);
    D(q, {type:'Choose', player:'Opponent', option:'stay'}); pass2(q);
    eq('Avatar: the Attack resolves: giant deals 6 combat damage (HP 7): Avatar survives, no trample; its damage trigger is on the stack', [Sim.totalDamage(av), av.loc, q.life.Opponent, q.stack.length], [6, 'board', 20, 1]);
    pass2(q);
    eq('Avatar: its trigger deals 1 EFFECT damage (from Avatar) to the only other creature', dl(g), [[1, 'effect', av.iid]]);
    check('Avatar: the damaged creature gains Avatar\u2019s abilities; its definition and Avatar\u2019s are untouched', Sim.abDef(g).id === 'avatar' && g.def.id === 'giant' && Sim.abDef(av).id === 'avatar');
    const bn = take(q, 'Player', 'bandages', 'hand'); D(q, {type:'PlayCard', iid:bn.iid, zone:'Player|front|1'}); pass2(q);
    check('removing the damage (Bandages, 1 point total) ends the ability swap', Sim.totalDamage(g) === 0 && Sim.abDef(g).id === 'giant'); }
  { const q = start(71), t = take(q, 'Opponent', 'giant', 'board', 'Opponent|front|0'), bd = take(q, 'Player', 'bandages', 'hand');
    dmg(q, t, 7, 'combat'); dmg(q, t, 1);
    rej('Bandages: an empty zone is not a legal target', q, {type:'PlayCard', iid:bd.iid, zone:'Opponent|back|4'}, 'Illegal target zone');
    D(q, {type:'PlayCard', iid:bd.iid, zone:'Opponent|front|0'}); pass2(q);
    eq('Bandages: the controller is asked which damage instance to remove', [q.choice.kind, q.choice.options], ['counter', ['1', '2']]);
    D(q, {type:'Choose', player:'Player', option:'2'});
    eq('Bandages: instance 2 (1 point) is gone and 6 more points remain to remove', [q.choice && q.choice.left, q.choice && q.choice.options], [6, ['1']]);
    D(q, {type:'Choose', player:'Player', option:'1'});
    eq('Bandages: 7 points removed in total; only instance 1 remains, with 1 point left', [q.choice, Sim.live(t).filter(x => x.kind === 'damage').map(d => [d.seq, d.amount]), t.loc, bd.loc], [null, [[1, 1]], 'board', 'gy']);
    const r = start(72), t2 = take(r, 'Opponent', 'giant', 'board', 'Opponent|front|0'), b2 = take(r, 'Player', 'bandages', 'hand');
    dmg(r, t2, 3, 'combat'); dmg(r, t2, 3);
    D(r, {type:'PlayCard', iid:b2.iid, zone:'Opponent|front|0'}); pass2(r);
    eq('Bandages: when all damage (6) fits in 7 points everything is removed without asking', [r.choice, ndmg(t2)], [null, 0]); }
  { const q = start(73), t = take(q, 'Opponent', 'soldier', 'board', 'Opponent|front|0'), bd = take(q, 'Player', 'bandages', 'hand'); D(q, {type:'PlayCard', iid:bd.iid, zone:'Opponent|front|0'}); pass2(q);
    eq('Bandages on an undamaged permanent: no choice, no change, spell still goes to the GY', [q.choice, ndmg(t), bd.loc], [null, 0, 'gy']); }

  // ================= stack and priority =================
  { let s = start(80); const z = take(s, 'Player', 'zap', 'hand'); D(s, {type:'PlayCard', iid:z.iid});
    eq('casting puts the spell on the stack and gives the opponent priority first', [s.stack.length, z.loc, s.priority], [1, 'stack', 'Opponent']);
    rej('only the player holding priority may pass', s, {type:'Pass', player:'Player'}, 'priority');
    D(s, {type:'Pass', player:'Opponent'});
    eq('one pass does not resolve: Zap still on the stack, no damage, priority to the caster', [s.stack.length, z.loc, s.life.Opponent, s.priority], [1, 'stack', 20, 'Player']);
    D(s, {type:'Pass', player:'Player'});
    eq('two consecutive passes resolve it (0 HP still resolves): 1 damage, Zap in GY, priority back to the turn player', [s.stack.length, z.loc, s.life.Opponent, s.priority, s.passes], [0, 'gy', 19, 'Player', 0]);
    rej('Pass with an empty stack and no response window is rejected', s, {type:'Pass', player:'Player'}, 'Nothing on the stack');
    s = start(81); const z2 = take(s, 'Player', 'zap', 'hand'), h = take(s, 'Opponent', 'heal', 'hand'); D(s, {type:'PlayCard', iid:z2.iid}); D(s, {type:'PlayCard', iid:h.iid});
    D(s, {type:'Pass', player:'Player'}); const r = D(s, {type:'Pass', player:'Opponent'});
    eq('LIFO: the response (Heal, +3 to the Opponent) resolves first; Zap is still waiting beneath', [r.events.filter(e => e.t === 'StackObjectResolved').map(e => e.iid), s.life.Opponent, z2.loc, h.loc], [[h.iid], 23, 'stack', 'gy']);
    pass2(s); eq('then Zap resolves (23 -> 22) and the stack is empty', [s.life.Opponent, s.stack.length], [22, 0]);
    s = start(82); const z3 = take(s, 'Player', 'zap', 'hand'), h3 = take(s, 'Player', 'heal', 'hand'); D(s, {type:'PlayCard', iid:z3.iid}); D(s, {type:'Pass', player:'Opponent'}); D(s, {type:'PlayCard', iid:h3.iid}); D(s, {type:'Pass', player:'Opponent'});
    eq('adding a response resets the pass count: one pass after it does not resolve anything', [s.stack.length, s.passes, s.priority], [2, 1, 'Player']); }
  { let s = start(83); const z = take(s, 'Player', 'zap', 'hand'), b = take(s, 'Opponent', 'bolt', 'hand');
    D(s, {type:'PlayCard', iid:z.iid}); D(s, {type:'PlayCard', iid:b.iid}); const r = pass2(s);
    eq('Bolt (3) on Zap (HP 0) -> HP -3: Zap stays on the stack at negative HP, Bolt is resolved', [z.loc, b.loc, s.stack.length, s.stack[0] && s.stack[0].hp], ['stack', 'gy', 1, -3]);
    const r2 = pass2(s);
    eq('...and is countered only when it would resolve: Zap\u2019s effect never happens, no Resolved event', [z.loc, s.life.Opponent, s.stack.length, r2.events.filter(e => e.t === 'StackObjectCountered').length, r2.events.filter(e => e.t === 'StackObjectResolved').length], ['gy', 20, 0, 1, 0]);
    s = start(84); const he = take(s, 'Player', 'heal', 'hand'), b2 = take(s, 'Opponent', 'bolt', 'hand'); D(s, {type:'PlayCard', iid:he.iid}); D(s, {type:'PlayCard', iid:b2.iid}); pass2(s);
    eq('boundary: Bolt (3) on Heal (HP 3) leaves HP 0: NOT countered, still on the stack', [s.stack.length, s.stack[0] && s.stack[0].hp, he.loc, b2.loc], [1, 0, 'stack', 'gy']);
    pass2(s); eq('...and it then resolves normally (+3 life)', [s.life.Player, he.loc], [23, 'gy']);
    s = start(85); const b3 = take(s, 'Player', 'bolt', 'hand');
    rej('Bolt cannot be played with nothing on the stack', s, {type:'PlayCard', iid:b3.iid}, 'stack object');
    s = start(86); const z4 = take(s, 'Player', 'zap', 'hand'), gf = take(s, 'Opponent', 'grainfall', 'hand'), he2 = take(s, 'Opponent', 'heal', 'hand'); D(s, {type:'PlayCard', iid:z4.iid});
    rej('the non-turn player cannot cast a Slow spell even with priority', s, {type:'PlayCard', iid:gf.iid, tplayer:'Player'}, 'turn player only');
    check('...but can respond with a Quick spell', Sim.canPlay(s, he2) === null);
    D(s, {type:'Pass', player:'Opponent'}); const sb = take(s, 'Player', 'superbolt', 'hand');
    rej('a Slow spell needs an empty stack', s, {type:'PlayCard', iid:sb.iid, tplayer:'Opponent'}, 'empty stack');
    s = start(87); const sb2 = take(s, 'Player', 'superbolt', 'hand'); D(s, {type:'PlayCard', iid:sb2.iid, tplayer:'Opponent'});
    check('a Slow spell consumes the major action when cast, not when it resolves', s.majorUsed && s.stack.length === 1); pass2(s);
    rej('...so no Draw afterwards', s, {type:'Draw', player:'Player'}, 'Major action already used'); }
  { let s = start(88); const sc = take(s, 'Player', 'scout', 'board', 'Player|front|1');
    rej('Scout cannot activate with no opposing creature', s, {type:'Activate', iid:sc.iid, ab:0}, 'no legal target');
    const v = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'); D(s, {type:'Activate', iid:sc.iid, ab:0});
    check('Scout: the sacrifice cost is paid on activation; the effect is still pending', sc.loc === 'gy' && s.stack.length === 1 && !ndmg(v));
    pass2(s); eq('Scout: 3 effect damage from Scout; soldier (HP 3) survives at effective HP 0', [v.loc, dl(v)], ['board', [[3, 'effect', sc.iid]]]);
    s = start(89); const sc2 = take(s, 'Player', 'scout', 'board', 'Player|front|2'), v2 = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|2'); D(s, {type:'Activate', iid:sc2.iid, ab:0});
    s.slots['Opponent|front|2'] = null; v2.slot = null; v2.loc = 'gy';           // the target leaves before resolution
    const r = pass2(s);
    eq('fizzle: target gone -> StackObjectFizzled, no damage, cost stays paid, ability token cleaned up', [r.events.some(e => e.t === 'StackObjectFizzled'), ndmg(v2), sc2.loc, s.stack.length, abTokens(s).every(t => t.loc === 'gone')], [true, 0, 'gy', 0, true]);
    s = start(90); const sc3 = take(s, 'Player', 'scout', 'board', 'Player|back|1'), v3 = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'), wf = take(s, 'Player', 'wolf', 'board', 'Player|front|1');
    D(s, {type:'Activate', iid:sc3.iid, ab:0}); pass2(s); s.attackPhase = true; AT(s, wf.iid);
    eq('damage instances add up across sources: Scout 3 + Wolf 3 kills Soldier (HP 3), counters are cleared, wolf tramples 3', [v3.loc, ndmg(v3), s.life.Opponent], ['gy', 0, 17]); }
  { let s = start(91); const ar = take(s, 'Player', 'archer', 'board', 'Player|front|0'); D(s, {type:'Activate', iid:ar.iid, ab:0});
    eq('Volley: 1 life is paid on activation, major action used, effect pending', [s.life.Player, s.life.Opponent, s.majorUsed, s.stack.length], [19, 20, true, 1]);
    pass2(s); eq('Volley resolves: 2 damage to the opponent; ability token gone', [s.life.Opponent, abTokens(s).every(t => t.loc === 'gone')], [18, true]);
    s = start(92); const a2 = take(s, 'Player', 'archer', 'board', 'Player|back|0');
    rej('Volley requires a front-row zone', s, {type:'Activate', iid:a2.iid, ab:0}, 'front-row');
    s = start(93); const a3 = take(s, 'Player', 'archer', 'board', 'Player|front|0'); setLife(s, 'Player', 1);
    rej('Volley with 1 life: cannot pay the 1-life cost', s, {type:'Activate', iid:a3.iid, ab:0}, 'not enough life');
    s = start(94); const a4 = take(s, 'Player', 'archer', 'board', 'Player|front|0'); D(s, {type:'Draw', player:'Player'});
    rej('Volley (Slow) after the major action was used', s, {type:'Activate', iid:a4.iid, ab:0}, 'major action already used');
    s = start(95); const a5 = take(s, 'Player', 'archer', 'board', 'Player|front|0'), zz = take(s, 'Player', 'zap', 'hand'); D(s, {type:'PlayCard', iid:zz.iid}); D(s, {type:'Pass', player:'Opponent'});
    rej('Volley (Slow) needs an empty stack', s, {type:'Activate', iid:a5.iid, ab:0}, 'empty stack');
    s = start(96); const a6 = take(s, 'Player', 'archer', 'board', 'Player|front|0'), bo = take(s, 'Opponent', 'bolt', 'hand'); D(s, {type:'Activate', iid:a6.iid, ab:0}); D(s, {type:'PlayCard', iid:bo.iid}); pass2(s); pass2(s);
    eq('countered ability (stack HP 1 - 3): cost is NOT refunded, effect never happens, source stays, token removed', [s.life.Player, s.life.Opponent, a6.loc, bo.loc, s.stack.length, abTokens(s).every(t => t.loc === 'gone')], [19, 20, 'board', 'gy', 0, true]); }
  { let s = start(97); const ch = take(s, 'Player', 'charm', 'board', 'Player|back|0');
    rej('Recall needs a card in the graveyard to exile', s, {type:'Activate', iid:ch.iid, ab:0}, 'too few');
    const newest = take(s, 'Player', 'soldier', 'gy'), oldest = take(s, 'Player', 'wolf', 'gy'); s.piles.Player.gy = [newest, oldest]; const top = s.piles.Player.deck[0], h0 = s.piles.Player.hand.length;
    D(s, {type:'Activate', iid:ch.iid, ab:0});
    check('Recall: the OLDEST graveyard card is exiled on activation, the newest stays; major action used', oldest.loc === 'exile' && newest.loc === 'gy' && s.piles.Player.gy.length === 1 && s.majorUsed);
    pass2(s); check('Recall resolves: draws exactly the top deck card', top.loc === 'hand' && s.piles.Player.hand.length === h0 + 1);
    s = start(98); const w = take(s, 'Player', 'ward', 'board', 'Player|back|0');
    rej('Ward needs lost life', s, {type:'Activate', iid:w.iid, ab:0}, 'already full'); setLife(s, 'Player', 15); D(s, {type:'Activate', iid:w.iid, ab:0}); pass2(s);
    eq('Ward: +3 life, then sacrificed (in GY, zone freed)', [s.life.Player, w.loc, s.slots['Player|back|0']], [18, 'gy', null]);
    s = start(99); const w2 = take(s, 'Player', 'ward', 'board', 'Player|back|0'), bo2 = take(s, 'Opponent', 'bolt', 'hand'); setLife(s, 'Player', 19); D(s, {type:'Activate', iid:w2.iid, ab:0}); D(s, {type:'PlayCard', iid:bo2.iid}); pass2(s); pass2(s);
    eq('Ward countered at exactly HP -1 (2 - 3): object removed, no life gained, Ward is NOT sacrificed (sacrifice is an effect)', [s.life.Player, w2.loc, s.stack.length, abTokens(s).every(t => t.loc === 'gone')], [19, 'board', 0, true]); }

  // ================= Infinity Wall, unusable zones, response windows =================
  {                                                 // Infinity Wall + unusable zones
    const q0 = start(30), w0 = take(q0, 'Player', 'infinitywall', 'hand');
    check('Infinity Wall cannot be played without a fully filled column', !!Sim.canPlay(q0, w0));
    const q = start(31), full = [take(q, 'Opponent', 'barrier', 'board', 'Opponent|back|2'), take(q, 'Opponent', 'guard', 'board', 'Opponent|front|2'), take(q, 'Player', 'knight', 'board', 'Player|front|2'), take(q, 'Player', 'aura', 'board', 'Player|back|2')];
    const w = take(q, 'Player', 'infinitywall', 'hand');
    check('Infinity Wall is playable once a column is full', !Sim.canPlay(q, w) && Sim.targetColumns(q, w).join() === '2');
    check('Infinity Wall cannot target a column that is not full', !Sim.dispatch(q, {type:'PlayCard', iid:w.iid, col:1}).ok);
    Sim.dispatch(q, {type:'PlayCard', iid:w.iid, col:2}); Sim.dispatch(q, {type:'Pass', player:'Opponent'}); Sim.dispatch(q, {type:'Pass', player:'Player'});
    check('Infinity Wall exiles every card on the column', full.every(x => x.loc === 'exile' && !x.slot) && q.piles.Opponent.exile.length === 2 && q.piles.Player.exile.length === 2);
    check('all four zones of the column become unusable', ['Opponent|back|2', 'Opponent|front|2', 'Player|front|2', 'Player|back|2'].every(k => q.unusable[k]) && !q.unusable['Player|front|1']);
    check('Infinity Wall returns to its owner\u2019s hand', w.loc === 'hand' && q.piles.Player.hand.includes(w));
    const sd = take(q, 'Player', 'soldier', 'hand');
    check('a card cannot be placed on an unusable zone', !Sim.dispatch(q, {type:'PlayCard', iid:sd.iid, slot:'Player|front|2'}).ok && !Sim.freeSlots(q, sd).includes('Player|front|2'));
    const st = take(q, 'Player', 'wolf', 'board', 'Player|front|2'); Sim.dispatch(q, {type:'Draw', player:'Player'});
    check('a card found on an unusable zone is sent to the graveyard', st.loc === 'gy' && !q.slots['Player|front|2']);
  }
  {                                                 // response windows + Bolt target requirement
    const q = start(40), sd = take(q, 'Player', 'soldier', 'hand');
    Sim.dispatch(q, {type:'PlayCard', iid:sd.iid, slot:'Player|front|0'});
    check('placing a permanent opens a response window for the opponent', !!q.respond && q.respond.kind === 'enter' && q.priority === 'Opponent');
    check('the turn player cannot act while the opponent may respond', !Sim.dispatch(q, {type:'Draw', player:'Player'}).ok && !Sim.dispatch(q, {type:'EndTurn', player:'Player'}).ok);
    Sim.dispatch(q, {type:'Pass', player:'Opponent'});
    check('passing closes the window and priority returns to the turn player', !q.respond && q.priority === 'Player');
    Sim.dispatch(q, {type:'EndTurn', player:'Player'});
    check('ending the turn opens an end step window; the turn has not changed yet', q.respond && q.respond.kind === 'end' && q.active === 'Player' && q.priority === 'Opponent');
    Sim.dispatch(q, {type:'Pass', player:'Opponent'});
    check('passing in the end step window ends the turn', q.active === 'Opponent' && q.turn === 2 && !q.respond);
    const r = start(41); take(r, 'Opponent', 'barrier', 'board', 'Opponent|back|2'); take(r, 'Opponent', 'guard', 'board', 'Opponent|front|2'); take(r, 'Player', 'aura', 'board', 'Player|back|2');
    const wl = take(r, 'Opponent', 'infinitywall', 'hand'), kn = take(r, 'Player', 'knight', 'hand');
    Sim.dispatch(r, {type:'PlayCard', iid:kn.iid, slot:'Player|front|2'});
    check('the opponent can play Infinity Wall in the window after the 4th card is placed', !Sim.canPlay(r, wl));
    Sim.dispatch(r, {type:'PlayCard', iid:wl.iid, col:2}); Sim.dispatch(r, {type:'Pass', player:'Player'}); Sim.dispatch(r, {type:'Pass', player:'Opponent'});
    check('the response resolves: column exiled and unusable, wall back in the opponent\u2019s hand', kn.loc === 'exile' && r.unusable['Player|front|2'] && wl.loc === 'hand');
    check('the window stays open after the response', !!r.respond && r.priority === 'Opponent');
  }
  // ================= King Eye / Superbolt =================
  {                                                 // King Eye clouds + Infinity Wall
    const q = start(40); take(q, 'Player', 'soldier', 'board', 'Player|front|0'); take(q, 'Player', 'barrier', 'board', 'Player|back|0'); const kw = take(q, 'Player', 'infinitywall', 'hand');
    check('column 1 with 2 cards of mine and none of the opponent: Wall cannot be played', !!Sim.canPlay(q, kw));
    take(q, 'Opponent', 'kingeye', 'board', 'Opponent|front|1');
    check('King Eye clouds act as legal targets: Wall is playable on column 1', Sim.canPlay(q, kw) === null && Sim.targetColumns(q, kw).join() === '0');
    check('clouds never cover King Eye\u2019s own zone', !Sim.cloudMap(q)['Opponent|front|1'] && !!Sim.cloudMap(q)['Opponent|front|0']);
    const k1 = Sim.dispatch(q, {type:'PlayCard', iid:kw.iid, col:0}); Sim.dispatch(q, {type:'Pass', player:'Opponent'}); const k2 = Sim.dispatch(q, {type:'Pass', player:'Player'});
    check('Wall fizzles when nothing legal is underneath the clouds, and nothing is revealed', k1.ok && kw.loc === 'gy' && !q.unusable['Player|front|0'] && k2.events.some(e => e.t === 'StackObjectFizzled' ));
    const q2 = start(41); take(q2, 'Player', 'wolf', 'board', 'Player|front|2'); take(q2, 'Player', 'barrier', 'board', 'Player|back|2'); take(q2, 'Opponent', 'trap', 'board', 'Opponent|back|2'); take(q2, 'Opponent', 'kingeye', 'board', 'Opponent|front|1'); const kw2 = take(q2, 'Player', 'infinitywall', 'hand');
    Sim.dispatch(q2, {type:'PlayCard', iid:kw2.iid, col:2}); Sim.dispatch(q2, {type:'Pass', player:'Opponent'}); const k3 = Sim.dispatch(q2, {type:'Pass', player:'Player'});
    check('with one real card under the clouds the Wall also fizzles (column not really full)', kw2.loc === 'gy' && !q2.unusable['Player|front|2'] && k3.events.some(e => e.t === 'StackObjectFizzled'));
    const q3 = start(42); take(q3, 'Opponent', 'kingeye', 'board', 'Opponent|front|1'); const ke = Object.values(q3.cards).find(x => x.def.id === 'kingeye' && x.loc === 'board'); ke.loc = 'gy'; ke.slot = null; q3.slots['Opponent|front|1'] = null;
    check('clouds vanish when King Eye leaves the board', !Object.keys(Sim.cloudMap(q3)).length);
  }
  { const q = start(110), ke = take(q, 'Opponent', 'kingeye', 'board', 'Opponent|front|1'), sb = take(q, 'Player', 'superbolt', 'hand');
    D(q, {type:'PlayCard', iid:sb.iid, zone:'Opponent|back|4'}); const r = pass2(q);
    eq('Superbolt on an empty zone under a cloud fizzles and reveals nothing', [r.events.some(e => e.t === 'StackObjectFizzled'), ndmg(ke), q.life.Opponent, sb.loc], [true, 0, 20, 'gy']);
    const p = start(111), sb2 = take(p, 'Player', 'superbolt', 'hand');
    rej('without clouds an empty zone is not a legal Superbolt target', p, {type:'PlayCard', iid:sb2.iid, zone:'Opponent|back|4'}, 'Illegal target zone'); }
  { const drain2 = drain; let q = start(120), z = take(q, 'Player', 'superbolt', 'hand'); D(q, {type:'PlayCard', iid:z.iid, tplayer:'Opponent'}); drain2(q);
    eq('Superbolt deals exactly 20 to a player (20 -> 0); the game does not end by itself (no win rule implemented)', [q.life.Opponent, q.phase], [0, 'play']);
    q = start(121); z = take(q, 'Player', 'superbolt', 'hand'); const vt = take(q, 'Opponent', 'scout', 'board', 'Opponent|front|1'); D(q, {type:'PlayCard', iid:z.iid, zone:'Opponent|front|1'}); drain2(q);
    eq('Superbolt on a permanent destroys it and leaves players\u2019 life alone', [vt.loc, q.life.Opponent, q.life.Player], ['gy', 20, 20]);
    q = start(122); z = take(q, 'Player', 'grainfall', 'hand'); const od = q.piles.Opponent.deck.map(c => c.iid), pd = q.piles.Player.deck.length;
    rej('GrainFall needs a player target', q, {type:'PlayCard', iid:z.iid}, 'Target a player');
    D(q, {type:'PlayCard', iid:z.iid, tplayer:'Opponent'}); drain2(q);
    eq('GrainFall: the top ten cards go to the GY (newest first), the rest stay in order; the caster\u2019s deck is untouched', [q.piles.Opponent.gy.map(c => c.iid), q.piles.Opponent.deck.map(c => c.iid), q.piles.Player.deck.length], [od.slice(0, 10).reverse(), od.slice(10), pd]);
    q = start(123); z = take(q, 'Player', 'grainfall', 'hand'); q.piles.Opponent.deck.splice(3); D(q, {type:'PlayCard', iid:z.iid, tplayer:'Opponent'}); drain2(q);
    eq('GrainFall with fewer than 10 cards mills what exists, no error', [q.piles.Opponent.deck.length, q.piles.Opponent.gy.length], [0, 3]);
    q = start(124); z = take(q, 'Player', 'grainfall', 'hand'); const pd2 = q.piles.Player.deck.length; D(q, {type:'PlayCard', iid:z.iid, tplayer:'Player'}); drain2(q);
    eq('GrainFall may target its own caster', [q.piles.Player.deck.length, q.piles.Player.gy.length - 1], [pd2 - 10, 10]); }

  // ================= Black Hawk, Bolt Master =================
  { let q = start(130); const hk = take(q, 'Player', 'blackhawk', 'board', 'Player|front|0'); D(q, {type:'SetAttackPhase', player:'Player', on:true});
    eq('Black Hawk: combat-step trigger is on the stack, power not doubled yet, non-turn player has priority', [q.stack.length, Sim.atkOf(hk), q.priority], [1, 1, 'Opponent']);
    rej('no attack until the combat trigger has resolved', q, {type:'Attack', iid:hk.iid}, 'Stack is not empty');
    drain(q); eq('power doubled 5 times: 1 x 2^5 = 32 (five atkMul statuses, in order)', [Sim.atkOf(hk), kinds(hk, 'atkMul').length], [32, 5]);
    AT(q, hk.iid); eq('Black Hawk deals its doubled power (32) to the player through an empty column', q.life.Opponent, 20 - 32);
    q = start(131); const oh = take(q, 'Opponent', 'blackhawk', 'board', 'Opponent|front|0'); D(q, {type:'SetAttackPhase', player:'Player', on:true});
    eq('an opposing Black Hawk does not trigger in my combat step', [q.stack.length, Sim.atkOf(oh)], [0, 1]);
    q = start(132); const bm = take(q, 'Player', 'boltmaster', 'hand'), sb = toDeck(q, 'Player', 'superbolt'), h0 = q.piles.Player.hand.length;
    D(q, {type:'PlayCard', iid:bm.iid, slot:'Player|front|2'}); drain(q);
    check('Bolt Master fetches Superbolt from the deck into the hand (hand: -Bolt Master +Superbolt)', sb.loc === 'hand' && !q.piles.Player.deck.includes(sb) && q.piles.Player.hand.length === h0);
    q = start(133); const bm2 = take(q, 'Player', 'boltmaster', 'hand'); take(q, 'Player', 'superbolt', 'gy'); const h1 = q.piles.Player.hand.length, d1 = q.piles.Player.deck.length;
    D(q, {type:'PlayCard', iid:bm2.iid, slot:'Player|front|2'}); drain(q);
    eq('Bolt Master with no Superbolt in the deck: fetches nothing, no error (a Superbolt in the GY is not fetched)', [q.piles.Player.hand.length, q.piles.Player.deck.length, q.piles.Player.hand.some(c => c.def.id === 'superbolt')], [h1 - 1, d1, false]); }

  // ================= The Vine =================
  { let s = start(140); const vn = take(s, 'Player', 'vine', 'hand'), sd = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|2');
    D(s, {type:'PlayCard', iid:vn.iid, slot:'Player|front|2'}); drain(s);
    check('Vine enter: one token on each of the 4 nearest zones (any row), owned by the Vine\u2019s controller', tokens(s).length === 4 && tokens(s).every(t => t.owner === 'Player') && ['Player|front|1', 'Player|front|3', 'Player|back|2', 'Opponent|front|2'].every(k => s.slots[k] && s.cards[s.slots[k]].def.id === 'vine-token'));
    check('Vine destroys the card on the zone it picks; the Vine itself stays put', sd.loc === 'gy' && vn.loc === 'board' && vn.slot === 'Player|front|2');
    endTurnFlow(s); check('Vine: no trigger at the OPPONENT\u2019s turn start', s.active === 'Opponent' && !s.stack.length);
    endTurnFlow(s); check('Vine: trigger goes on the stack at its controller\u2019s turn start', s.active === 'Player' && s.stack.length === 1);
    pass2(s); check('Vine turn-start: 4 more tokens (8 total), never on the Vine or an existing token', tokens(s).length === 8 && vn.slot === 'Player|front|2' && vn.loc === 'board');
    s = start(141); const v2 = take(s, 'Player', 'vine', 'hand'); for (const k of Object.keys(s.slots)) if (k !== 'Player|front|0') s.unusable[k] = true;
    D(s, {type:'PlayCard', iid:v2.iid, slot:'Player|front|0'}); drain(s);
    eq('Vine with no legal zone (every other zone unusable): nothing is created, nothing destroyed', [tokens(s).length, s.piles.Player.gy.length, v2.loc], [0, 0, 'board']);
    s = start(142); const v3 = take(s, 'Player', 'vine', 'hand'); for (const k of Object.keys(s.slots)) if (k !== 'Player|front|0' && k !== 'Opponent|back|4') s.unusable[k] = true;
    D(s, {type:'PlayCard', iid:v3.iid, slot:'Player|front|0'}); drain(s);
    eq('with exactly one legal zone the 4 repetitions create just one token there (re-evaluated each time)', [tokens(s).length, tokens(s)[0] && tokens(s)[0].slot], [1, 'Opponent|back|4']);
    s = start(143); take(s, 'Player', 'vine', 'board', 'Player|front|0'); const fillers = [];
    for (const k of Object.keys(s.slots)) if (!s.slots[k]){ const f = {iid:'fx-' + k, def:FIXTURES.find(d => d.id === 'soldier'), owner:'Opponent', loc:'board', slot:k, damage:[], atk:2}; s.cards[f.iid] = f; s.slots[k] = f.iid; fillers.push(f); }   // 19 DISTINCT filler cards (take() would reuse one card)
    endTurnFlow(s); endTurnFlow(s); drain(s);
    eq('Vine on a full board: the 4 nearest non-Vine zones are converted: 4 fillers destroyed, 4 tokens, 15 fillers untouched', [tokens(s).length, fillers.filter(f => f.loc === 'gy').length, fillers.filter(f => f.loc === 'board').length], [4, 4, 15]); }
  { const VT = DEFS.find(d => d.id === 'vine').tokens.vine; let s = start(144); const vz = take(s, 'Player', 'knight', 'board', 'Player|front|1'), tk = take(s, 'Player', 'soldier', 'board', 'Opponent|front|1');
    tk.def = VT; tk.atk = undefined; tk.token = true; s.attackPhase = true; AT(s, tk.iid);
    eq('a token standing on the foe\u2019s front row hits the foe (1), not its own side', [s.life.Opponent, s.life.Player, ndmg(vz)], [19, 20, 0]);
    s = start(145); const tb = take(s, 'Player', 'soldier', 'board', 'Opponent|front|1'), ob = take(s, 'Opponent', 'knight', 'board', 'Opponent|back|1'); tb.def = VT; tb.token = true; s.attackPhase = true; AT(s, tb.iid);
    eq('...and damages the foe\u2019s back card in its column, not the player', [ndmg(ob), s.life.Opponent], [1, 20]);
    s = start(146); const av = take(s, 'Player', 'vine', 'board', 'Player|front|1'), ally = take(s, 'Player', 'soldier', 'board', 'Opponent|front|1'); ally.def = VT; ally.token = true; s.attackPhase = true; AT(s, av.iid);
    eq('Vine Y (yours) standing in the foe\u2019s column blocks Vine X\u2019s attack: Y takes the damage, the player is untouched', [ndmg(ally), ally.loc, s.life.Opponent], [1, 'board', 20]); }

  // ================= combat is a phase; Avatar dying to its own trigger =================
  { let s = start(160); const a = take(s, 'Player', 'wolf', 'board', 'Player|front|0'), b = take(s, 'Player', 'knight', 'board', 'Player|front|1'); D(s, {type:'SetAttackPhase', player:'Player', on:true});
    AT(s, a.iid); const r = AT(s, b.iid);
    eq('combat is a phase: several creatures attack one at a time in the same turn (wolf 3 + knight 4)', [r.ok, s.life.Opponent, Sim.attackedIds(s), s.attackPhase], [true, 13, [a.iid, b.iid], true]);
    rej('...but each creature attacks only once per phase', s, {type:'Attack', iid:a.iid}, 'Already attacked');
    s = start(161); const av = take(s, 'Opponent', 'avatar', 'board', 'Opponent|front|1'), g = take(s, 'Player', 'giant', 'board', 'Player|front|1'); dmg(s, av, 5, 'combat'); s.attackPhase = true;
    D(s, {type:'Attack', iid:g.iid}); pass2(s); D(s, {type:'Choose', player:'Opponent', option:'stay'}); pass2(s);
    check('Avatar destroyed by the damage that triggers it: its trigger is already on the stack', av.loc === 'gy' && s.stack.length === 1 && s.life.Opponent === 16);
    pass2(s);
    eq('current rule: the trigger still resolves after Avatar died (1 effect damage from Avatar to the other creature)', dl(g), [[1, 'effect', av.iid]]); }
  { const q = start(170), ke = take(q, 'Opponent', 'kingeye', 'board', 'Opponent|front|1'), hid = take(q, 'Opponent', 'soldier', 'board', 'Opponent|front|0'), av = take(q, 'Player', 'avatar', 'board', 'Player|front|1'); q.attackPhase = true;
    check('King Eye cloud covers the soldier before the attack', !!Sim.cloudMap(q)['Opponent|front|0']);
    D(q, {type:'Attack', iid:av.iid}); pass2(q); D(q, {type:'Choose', player:'Player', option:'stay'}); drain(q);
    check('Avatar damages King Eye: it gains Avatar\u2019s abilities and its clouds disappear', Sim.abDef(ke).id === 'avatar' && !Object.keys(Sim.cloudMap(q)).length); }
  // ================= turn structure, life boundaries =================
  { let s = start(150); const wf = take(s, 'Player', 'wolf', 'board', 'Player|front|0'); D(s, {type:'SetAttackPhase', player:'Player', on:true}); AT(s, wf.iid);
    rej('EndTurn by the non-turn player', s, {type:'EndTurn', player:'Opponent'}, 'turn player');
    D(s, {type:'EndTurn', player:'Player'});
    eq('EndTurn opens the end-step window; the turn has not changed yet', [s.respond && s.respond.kind, s.active, s.turn, s.priority], ['end', 'Player', 1, 'Opponent']);
    rej('EndTurn cannot be repeated while the window is open', s, {type:'EndTurn', player:'Player'}, 'priority');
    D(s, {type:'Pass', player:'Opponent'});
    eq('passing in the window ends the turn and resets per-turn state', [s.active, s.turn, s.attackPhase, s.majorUsed, Sim.attackedIds(s).length, s.priority, s.respond], ['Opponent', 2, false, false, 0, 'Opponent', null]);
    check('the new turn player can take a major action', D(s, {type:'Draw', player:'Opponent'}).ok);
    s = start(151); const z = take(s, 'Player', 'zap', 'hand'); D(s, {type:'PlayCard', iid:z.iid}); D(s, {type:'Pass', player:'Opponent'});
    rej('EndTurn with a non-empty stack is rejected', s, {type:'EndTurn', player:'Player'}, 'Stack is not empty');
    s = start(152); const he = take(s, 'Player', 'heal', 'hand'); D(s, {type:'PlayCard', iid:he.iid}); pass2(s);
    check('life can go above the starting value (no cap): 20 + 3 = 23', s.life.Player === 23);
    s = start(153); setLife(s, 'Opponent', 5); const sb = take(s, 'Player', 'superbolt', 'hand'); D(s, {type:'PlayCard', iid:sb.iid, tplayer:'Opponent'}); pass2(s);
    check('life can go below zero: 5 - 20 = -15', s.life.Opponent === -15); }
  // ================= Flash, Retaliate, shields, Spirit of the Sand =================
  { const s = start(180), p = take(s, 'Opponent', 'parasite', 'hand'); s.priority = 'Opponent';
    check('Flash: the non-turn player can play a Flash creature while holding priority', Sim.canPlay(s, p) === null);
    D(s, {type:'PlayCard', iid:p.iid, slot:'Opponent|front|0'});
    check('Flash creature entered without using the major action', p.loc === 'board' && !s.majorUsed); }
  { const s = start(181), sg = take(s, 'Opponent', 'shieldguard', 'board', 'Opponent|front|1'), w = take(s, 'Player', 'wolf', 'board', 'Player|front|1'); s.attackPhase = true; AT(s, w.iid);
    eq('Retaliate: Shieldguard takes 3 and hits the attacker back for 5 (wolf HP 3 dies)', [ndmg(sg), w.loc], [1, 'gy']); }
  { const s = start(182), v = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'), sb = take(s, 'Player', 'superbolt', 'hand'), g = take(s, 'Player', 'giant', 'board', 'Player|front|1');
    shield(s, v, 'red'); check('Red shield: its zone is not a legal target', !Sim.targetZones(s, sb).includes('Opponent|front|1'));
    Sim.live(v).forEach(x => Sim.removeStatus(s, x, 'test')); shield(s, v, 'blue'); s.attackPhase = true; AT(s, g.iid);
    eq('Blue shield: attacks still hit it (soldier dies, 3 tramples)', [v.loc, s.life.Opponent], ['gy', 17]); }
  { const s = start(183), a = take(s, 'Player', 'soldier', 'board', 'Player|front|0'), sp = take(s, 'Player', 'spirit', 'hand'); D(s, {type:'PlayCard', iid:sp.iid}); pass2(s);
    check('Spirit of the Sand asks red or blue', !!s.choice && s.choice.kind === 'mode'); D(s, {type:'Choose', player:'Player', option:'1'});
    eq('Spirit (blue): counter on each own board card; life gain is disabled', [kinds(a, 'shield').map(x => x.color), Sim.hasSt(s.players.Player, 'nogain')], [['blue'], true]); }
  { const s = start(184), sg = take(s, 'Opponent', 'shieldguard', 'hand'), ally = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'), w = take(s, 'Player', 'wolf', 'board', 'Player|front|1'); s.attackPhase = true; D(s, {type:'Attack', iid:w.iid});
    check('Shieldguard: the Attack is on the stack, the defender has priority first, damage waits', s.stack.length === 1 && s.stack[0].kind === 'attack' && s.priority === 'Opponent' && s.life.Opponent === 20);
    D(s, {type:'Activate', iid:sg.iid, ab:0}); pass2(s);
    eq('Shieldguard swap: soldier returns to hand, Shieldguard takes its zone', [ally.loc, sg.slot], ['hand', 'Opponent|front|1']); }
  // ================= War Drum, Deep Sea Shark, Quick Intuition, Ambush of the Night =================
  { let s = start(200); const so = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'), far = take(s, 'Opponent', 'wolf', 'board', 'Opponent|front|3'), kn = take(s, 'Player', 'knight', 'board', 'Player|front|2'), wd = take(s, 'Player', 'wardrum', 'hand');
    dmg(s, so, 3); dmg(s, far, 3);
    D(s, {type:'PlayCard', iid:wd.iid, slot:'Player|back|1'}); drain(s);
    eq('Drummer: its controller picks the front zone (every free front zone is offered)', [s.choice && s.choice.kind, s.choice && s.choice.options], ['place', ['Player|front|0', 'Player|front|1', 'Player|front|3', 'Player|front|4']]); D(s, {type:'Choose', player:'Player', option:'Player|front|1'}); drain(s);
    eq('War Drum -1/-1: a 3/3 holding 3 damage in its column dies (HP 2), one two columns away lives', [so.loc, far.loc], ['gy', 'board']);
    const dr = Object.values(s.cards).find(x => x.def.id === 'drummer-token' && x.loc === 'board');
    check('Drummer token (3/3) is created on the Drum\u2019s column; own cards in range get +1/+1 (knight 4/5 -> 5/6)', !!dr && dr.slot === 'Player|front|1' && Sim.atkOf(kn) === 5 && Sim.hpOf(kn) === 6 && Sim.atkOf(dr) === 4);
    eq('Drum is listed before Drummer on a card affected by both (older source first)', kinds(kn, 'mod').map(m => m.srcName), ['Drummer']);
    s.slots['Opponent|front|1'] = null; so.loc = 'gy';
    kn.slot = 'Player|front|4'; s.slots['Player|front|2'] = null; s.slots['Player|front|4'] = kn.iid; D(s, {type:'Draw', player:'Player'});
    eq('moving out of the Drummer\u2019s columns removes the bonus', [Sim.atkOf(kn), Sim.hpOf(kn)], [4, 5]);
    s = start(201); const g = take(s, 'Player', 'knight', 'gy'), w2 = take(s, 'Player', 'wardrum', 'hand'); const l0 = s.life.Opponent;
    D(s, {type:'PlayCard', iid:w2.iid, slot:'Player|back|1', extra:true}); drain(s); D(s, {type:'Choose', player:'Player', option:'Player|front|1'}); drain(s);
    check('War Drum paid: major action spent, creature picker is open', s.majorUsed && s.choice && s.choice.kind === 'pick');
    D(s, {type:'Choose', player:'Player', option:g.iid}); D(s, {type:'Choose', player:'Player', option:'Player|front|0'}); drain(s);
    eq('the returned Knight attacks at once outside combat (4 +1 Drummer = 5 to the face)', [g.loc, s.attackPhase, s.life.Opponent], ['board', false, l0 - 5]);
    s = start(202); const w3 = take(s, 'Player', 'wardrum', 'hand'); D(s, {type:'Draw', player:'Player'});
    rej('additional cost cannot be paid once the major action is used', s, {type:'PlayCard', iid:w3.iid, slot:'Player|back|1', extra:true}, 'additional cost'); }
  { let s = start(203); const sh = take(s, 'Player', 'shark', 'hand'); D(s, {type:'PlayCard', iid:sh.iid, slot:'Player|front|0'}); drain(s); D(s, {type:'Choose', player:'Player', option:'0'}); drain(s);
    eq('Shark: 3 life paid, opponent flagged to skip combat', [s.life.Player, Sim.hasSt(s.players.Opponent, 'skipCombat')], [17, true]);
    endTurnFlow(s); D(s, {type:'SetAttackPhase', player:'Opponent', on:true});
    eq('opponent presses combat: it becomes End turn, flag consumed, major action untouched', [s.attackPhase, s.respond && s.respond.kind, s.majorUsed, Sim.hasSt(s.players.Opponent, 'skipCombat')], [false, 'end', false, false]);
    s = start(204); take(s, 'Player', 'shark', 'board', 'Player|front|0'); const wf = take(s, 'Player', 'wolf', 'board', 'Player|front|1'), oh = s.piles.Opponent.hand.length;
    D(s, {type:'SetAttackPhase', player:'Player', on:true}); AT(s, wf.iid); D(s, {type:'SetAttackPhase', player:'Player', on:false}); pass2(s); D(s, {type:'Choose', player:'Player', option:'0'});
    check('Shark second combat: opponent drew 5 (cost), attack phase is on again, attacked list reset', s.piles.Opponent.hand.length === oh + 5 && s.attackPhase && !Sim.attackedIds(s).length);
    AT(s, wf.iid); eq('the Wolf attacks a second time (3 + 3)', s.life.Opponent, 14); }
  { let s = start(208); take(s, 'Player', 'shark', 'board', 'Player|front|0'); const wf = take(s, 'Player', 'wolf', 'board', 'Player|front|1'), oh = s.piles.Opponent.hand.length;
    D(s, {type:'SetAttackPhase', player:'Player', on:true}); AT(s, wf.iid); const r = D(s, {type:'EndTurn', player:'Player'});
    eq('Shark: End turn during combat first ends the combat phase, so its trigger goes on the stack (turn not over yet)', [r.ok, s.attackPhase, s.stack.length, s.respond], [true, false, 1, null]);
    pass2(s); D(s, {type:'Choose', player:'Player', option:'0'});
    check('...and the second combat starts (opponent drew 5, attack phase on)', s.piles.Opponent.hand.length === oh + 5 && s.attackPhase);
    s = start(209); const sk = take(s, 'Player', 'shark', 'hand'); D(s, {type:'PlayCard', iid:sk.iid, slot:'Player|front|0'}); drain(s); D(s, {type:'Choose', player:'Player', option:'0'}); drain(s);
    check('Shark skip shows as a status on the player while waiting, not on the other player', Sim.statusLines(s.players.Opponent).some(x => /skip/i.test(x.text) && !x.removed) && !Sim.statusLines(s.players.Player).some(x => /skip/i.test(x.text)));
    endTurnFlow(s); D(s, {type:'SetAttackPhase', player:'Opponent', on:true});
    eq('once the skip is used the status is gone', Sim.statusLines(s.players.Opponent).filter(x => /skip/i.test(x.text) && !x.removed), []); }
  { let s = start(205); const qi = take(s, 'Player', 'intuition', 'hand'); D(s, {type:'PlayCard', iid:qi.iid}); pass2(s);
    eq('Quick Intuition draws until 7 cards in hand', s.piles.Player.hand.length, 7);
    s = start(206); const so = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'), gi = take(s, 'Player', 'giant', 'board', 'Player|front|1'), q2 = take(s, 'Player', 'intuition', 'hand');
    D(s, {type:'PlayCard', iid:q2.iid, zone:'Opponent|front|1'}); pass2(s); s.attackPhase = true; AT(s, gi.iid);
    eq('damage to the protected creature is denied (it still absorbs its HP: 6 - 3 tramples)', [so.loc, ndmg(so), s.life.Opponent], ['board', 0, 17]);
    s = start(207); const q3 = take(s, 'Opponent', 'intuition', 'gy'), wf = take(s, 'Player', 'wolf', 'board', 'Player|front|1'); s.attackPhase = true; D(s, {type:'Attack', iid:wf.iid});
    check('the defender gets priority on the Attack and can answer it with Cancel Attack from the GY', s.stack.length === 1 && s.priority === 'Opponent');
    D(s, {type:'Activate', iid:q3.iid, ab:0}); drain(s);
    eq('cancelled attack: no damage, Quick Intuition exiled by its cost', [s.life.Opponent, q3.loc, s.stack.length], [20, 'exile', 0]); }
  { let s = start(220); const wf = take(s, 'Player', 'wolf', 'board', 'Player|front|1'); s.attackPhase = true; D(s, {type:'Attack', iid:wf.iid});
    check('an Attack has no HP and keeps no snapshot of the attacker\u2019s power', s.stack[0].kind === 'attack' && s.stack[0].hp === null && s.stack[0].atk === undefined);
    s.stack[0].bonus = 5; wf.loc = 'gy'; s.slots['Player|front|1'] = null; wf.slot = null; pass2(s);
    eq('damage added to the Attack still lands after the attacker left (5), the attacker\u2019s own power (3) does not', [s.life.Opponent, s.stack.length], [15, 0]);
    s = start(221); const w2 = take(s, 'Player', 'wolf', 'board', 'Player|front|1'), bo = take(s, 'Opponent', 'bolt', 'hand'); s.attackPhase = true; D(s, {type:'Attack', iid:w2.iid}); D(s, {type:'PlayCard', iid:bo.iid}); pass2(s);
    eq('Bolt cannot hurt an Attack: damage against it does nothing, the Attack is still there with no HP', [s.stack.length, s.stack[0].kind, s.stack[0].hp], [1, 'attack', null]);
    pass2(s); eq('...and then it resolves normally (3 damage)', s.life.Opponent, 17);
    s = start(222); const w3 = take(s, 'Player', 'wolf', 'board', 'Player|front|1'), w4 = take(s, 'Player', 'knight', 'board', 'Player|front|2'); s.attackPhase = true; D(s, {type:'Attack', iid:w3.iid});
    rej('a normal attack cannot be declared while the stack is not empty (a second attacker must wait)', s, {type:'Attack', iid:w4.iid}, 'Stack is not empty'); }
  { const s = start(208), am = take(s, 'Player', 'ambush', 'hand'), kg = take(s, 'Player', 'knight', 'gy'); take(s, 'Player', 'soldier', 'hand'); const oh = s.piles.Opponent.hand.length;
    D(s, {type:'PlayCard', iid:am.iid}); pass2(s);
    eq('Ambush: step 2 asks which GY card to return (the only card + Done)', [s.choice.kind, s.choice.options], ['upto', [kg.iid, 'done']]);
    D(s, {type:'Choose', player:'Player', option:kg.iid});
    check('returned Knight is in hand; step 3 (put into play) is now asked, the later steps are still pending', kg.loc === 'hand' && s.choice.e.then === 'play' && s.choice.cont.length > 0);
    let n = 0; while (s.choice && n++ < 5) D(s, {type:'Choose', player:s.choice.player, option:'done'});
    eq('Ambush finishes in one resolution: opponent drew 2, major action spent, spell in GY', [s.piles.Opponent.hand.length, s.majorUsed, am.loc], [oh + 2, true, 'gy']); }
  // ================= STATUSES: one ordered list per card and per player =================
  { let s = start(300); const so = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1');
    const a = dmg(s, so, 1), b = dmg(s, so, 1, 'combat');
    check('statuses are ordered oldest to newest (ids increase) and each has source name, turn and id', Sim.live(so).map(x => x.seq).join() === [a.seq, b.seq].join() && b.seq > a.seq && a.srcName === 'test' && a.turn === 1);
    Sim.addStatus(s, so, {kind:'life', amount:2, srcName:'t'}); Sim.addStatus(s, so, {kind:'mod', atk:1, hp:0, srcName:'t'}); Sim.addStatus(s, so, {kind:'atkMul', n:2, srcName:'t'}); Sim.addStatus(s, so, {kind:'mod', atk:3, hp:0, srcName:'t'});
    eq('HP and ATK are folds: HP 3 +2 life = 5; ATK ((2+1)x2)+3 = 9; damage 2', [Sim.hpOf(so), Sim.atkOf(so), Sim.totalDamage(so)], [5, 9, 2]);
    s = start(301); const so2 = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'); Sim.addStatus(s, so2, {kind:'mod', atk:3, hp:0, srcName:'t'}); Sim.addStatus(s, so2, {kind:'atkMul', n:2, srcName:'t'});
    eq('order matters: (2+3)x2 = 10, not 2x2+3 = 7', Sim.atkOf(so2), 10); }
  { let s = start(302); const so = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'), g = take(s, 'Player', 'giant', 'board', 'Player|front|1'); dmg(s, so, 1); shield(s, so, 'blue'); Sim.recalc(s, []);
    const before = so.statuses.slice(); check('a card that stays on the board keeps its statuses', Sim.live(so).filter(x => x.kind !== 'entered').length === 2);
    s.attackPhase = true; AT(s, g.iid);
    check('a destroyed card has every status REMOVED (not deleted): the list keeps them, greyed, with the reason', so.loc === 'gy' && Sim.live(so).length === 0 && before.every(x => so.statuses.includes(x) && x.removed && /left the board/.test(x.removed.why)) && Sim.statusLines(so).every(x => x.removed)); }
  { let s = start(303); const so = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'), sh = shield(s, so, 'blue'), keep = Sim.addStatus(s, so, {kind:'mod', atk:0, hp:0, keep:true, srcName:'t'}), sb = take(s, 'Player', 'superbolt', 'hand');
    D(s, {type:'PlayCard', iid:sb.iid, zone:'Opponent|front|1'}); drain(s);
    eq('a status with keep:true survives leaving the board; the others are removed', [so.loc, !!sh.removed, !!keep.removed], ['gy', true, false]);
  }
  { let s = start(304); const sg = take(s, 'Opponent', 'shieldguard', 'hand'), ally = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'), w = take(s, 'Player', 'wolf', 'board', 'Player|front|1'); const d = dmg(s, ally, 1); shield(s, ally, 'blue'); s.attackPhase = true; D(s, {type:'Attack', iid:w.iid});
    D(s, {type:'Activate', iid:sg.iid, ab:0}); pass2(s);
    check('bounced to hand: the card\u2019s board statuses are removed (greyed), none are live in hand', ally.loc === 'hand' && !!d.removed && Sim.live(ally).length === 0); }
  { let s = start(306); const hb = take(s, 'Player', 'hummingbird', 'gy'); const st = Sim.addStatus(s, hb, {kind:'shield', color:'red', srcName:'t'}); Sim.recalc(s, []);
    check('a board-zone status on a card that is NOT on the board is removed by the next recalc', !!st.removed && /left the board/.test(st.removed.why)); }
  { let s = start(308);    const p2 = take(s, 'Player', 'parasite', 'hand'), ho = take(s, 'Opponent', 'soldier', 'hand'); D(s, {type:'PlayCard', iid:p2.iid, slot:'Player|front|0'}); drain(s);
    const rv = Sim.live(ho).find(x => x.kind === 'revealed');
    check('0-mode reveal is a status on the card in hand, visible to the revealer only', !!rv && Sim.isRevealed(ho, 'Player') && !Sim.isRevealed(ho, 'Opponent') && s.choice && s.choice.kind === 'pick');
    D(s, {type:'Choose', player:'Player', option:ho.iid});
    check('the revealed status is removed (greyed) when the card leaves the hand', ho.loc === 'gy' && !!rv.removed && !Sim.isRevealed(ho, 'Player')); }
  { let s = start(309); const wf = take(s, 'Player', 'wolf', 'board', 'Player|front|1'), kn = take(s, 'Player', 'knight', 'board', 'Player|front|2'); D(s, {type:'SetAttackPhase', player:'Player', on:true}); AT(s, wf.iid);
    check('"already attacked" is a status on the attacker', Sim.live(wf).some(x => x.kind === 'attacked') && !Sim.live(kn).some(x => x.kind === 'attacked'));
    const at = Sim.live(wf).find(x => x.kind === 'attacked'); D(s, {type:'EndTurn', player:'Player'}); D(s, {type:'Pass', player:'Opponent'});
    check('expiring statuses (turnEnd) are removed when the turn ends, with the reason "expired"/"turn ended"', !!at.removed && Sim.live(wf).every(x => x.kind !== 'attacked')); }
  { let s = start(310); const so = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'), q = take(s, 'Player', 'intuition', 'hand'); D(s, {type:'PlayCard', iid:q.iid, zone:'Opponent|front|1'}); pass2(s);
    const nd = Sim.live(so).find(x => x.kind === 'nodamage');
    check('Quick Intuition puts a nodamage status (expires at end of turn) on its target', !!nd && nd.expires === 'turnEnd'); endTurnFlow(s);
    check('...and it is removed when the turn ends but stays in the list, greyed', !!nd.removed && nd.removed.why === 'expired' && Sim.statusLines(so).some(x => x.removed && x.st.kind === 'nodamage')); }
  { let s = start(311); const sg = take(s, 'Player', 'soldier', 'board', 'Player|front|1'), dr = take(s, 'Player', 'wardrum', 'hand'), v = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'), far = take(s, 'Opponent', 'wolf', 'board', 'Opponent|front|4');
    D(s, {type:'PlayCard', iid:dr.iid, slot:'Player|back|1'}); drain(s); D(s, {type:'Choose', player:'Player', option:'Player|front|0'}); drain(s);
    const m = Sim.live(v).filter(x => x.kind === 'mod');
    eq('War Drum puts a -1/-1 status on a foe in range (src, atk, hp readable from the list)', [m.length, m[0].atk, m[0].hp, m[0].srcName, Sim.atkOf(v), Sim.hpOf(v)], [1, -1, -1, 'War Drum', 1, 2]);
    check('a foe outside the columns has none', !Sim.live(far).some(x => x.kind === 'mod'));
    s.slots['Opponent|front|1'] = null; s.slots['Opponent|front|4'] = v.iid; v.slot = 'Opponent|front|4'; Sim.recalc(s, []);
    check('leaving the columns REMOVES the status (greyed, "no longer in range"); no new one while out of range', !!m[0].removed && /range/.test(m[0].removed.why) && !Sim.live(v).some(x => x.kind === 'mod') && Sim.atkOf(v) === 2);
    v.slot = 'Opponent|front|1'; s.slots['Opponent|front|4'] = null; s.slots['Opponent|front|1'] = v.iid; D(s, {type:'EndTurn', player:'Player'});
    eq('moving back in range adds a NEW status at the end of the list (the old one stays greyed)', [Sim.live(v).filter(x => x.kind === 'mod').length, v.statuses.filter(x => x.kind === 'mod').length], [1, 2]);
    s.slots['Player|back|1'] = null; dr.loc = 'gy'; dr.slot = null; D(s, {type:'Pass', player:'Opponent'});
    check('when the War Drum leaves the board its auras end: no live mod statuses remain', !Sim.live(v).some(x => x.kind === 'mod')); }
  { let s = start(312); const so = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1');
    const d = dmg(s, so, 1), ab = Sim.addStatus(s, so, {kind:'ability', to:'avatar', link:d.seq, srcName:'Avatar of Rabies'});
    check('ability replacement is a status; abDef reads the newest live one', Sim.abDef(so).id === 'avatar'); Sim.removeStatus(s, d, 'test'); Sim.recalc(s, []);
    check('removing the linked damage status removes the ability status too (linked status ended)', !!ab.removed && Sim.abDef(so).id === 'soldier'); }
  { let s = start(313); const h = take(s, 'Player', 'soldier', 'hand'); setLife(s, 'Player', 12); const he = take(s, 'Player', 'heal', 'hand'); D(s, {type:'PlayCard', iid:he.iid}); pass2(s); const sp = take(s, 'Opponent', 'zap', 'hand'); s.priority = 'Opponent';
    eq('player list: damage then life, in order; life total is the fold (20 -8 +3 = 15)', [s.players.Player.statuses.map(x => x.kind), s.life.Player, Sim.lifeOf(s, 'Player')], [['damage', 'life'], 15, 15]);
    s = start(314); const ar = take(s, 'Player', 'archer', 'board', 'Player|front|0'); D(s, {type:'Activate', iid:ar.iid, ab:0}); pass2(s);
    eq('Archer: life paid is a status on the player and the opponent\u2019s damage is too', [s.players.Player.statuses.map(x => x.kind), s.players.Opponent.statuses.map(x => [x.kind, x.amount]), s.life.Player, s.life.Opponent], [['paid'], [['damage', 2]], 19, 18]);
    const sp2 = take(s, 'Player', 'spirit', 'hand'); s.majorUsed = false; D(s, {type:'PlayCard', iid:sp2.iid}); pass2(s); D(s, {type:'Choose', player:'Player', option:'0'});
    check('Spirit of the Sand: red shield statuses + a nogain status on the player; healing now does nothing', Sim.hasSt(s.players.Player, 'nogain') && kinds(ar, 'shield').length === 1);
    const he2 = take(s, 'Player', 'heal', 'hand'); const l = s.life.Player; D(s, {type:'PlayCard', iid:he2.iid}); pass2(s);
    eq('...no life status is added while nogain is active', [s.life.Player, s.players.Player.statuses.filter(x => x.kind === 'life').length], [l, 0]); }
  { let s = start(315); setLife(s, 'Player', 10); const st = s.players.Player.statuses[0]; Sim.removeStatus(s, st, 'test'); D(s, {type:'Draw', player:'Player'});
    eq('removing a damage status from a player restores the life it took (fold ignores removed statuses)', [s.life.Player, Sim.statusLines(s.players.Player).length, Sim.statusLines(s.players.Player)[0].removed], [20, 1, true]); }
  { let s = start(316); const ke = take(s, 'Player', 'soldier', 'board', 'Player|front|0'), hv = take(s, 'Player', 'heavensun', 'hand'); D(s, {type:'PlayCard', iid:hv.iid, slot:'Player|back|0'}); drain(s);
    let n = 0; while (s.choice && s.choice.kind === 'vault' && n++ < 9) D(s, {type:'Choose', player:'Player', option:s.choice.options[0]});
    eq('Heaven and Sun: each exiled card is a vault status on it', [kinds(hv, 'vault').length, s.piles.Player.exile.length], [5, 5]);
    s.slots['Player|back|0'] = null; hv.loc = 'gy'; hv.slot = null; Sim.recalc(s, []);
    check('when it leaves the board its vault statuses are removed: the exiled cards can no longer be retrieved', kinds(hv, 'vault').length === 0 && hv.statuses.filter(x => x.kind === 'vault').every(x => x.removed)); }
  // ================= Attack object bonus (generic AddAttackDamage) =================
  { let s = start(320); const wf = take(s, 'Player', 'wolf', 'board', 'Player|front|1'), rg = take(s, 'Player', 'rage', 'hand'); s.attackPhase = true;
    rej('Rage needs an Attack on the stack', s, {type:'PlayCard', iid:rg.iid}, 'Attack must be on the stack');
    D(s, {type:'Attack', iid:wf.iid}); s.priority = 'Player'; D(s, {type:'PlayCard', iid:rg.iid}); pass2(s);
    eq('Rage resolves above the Attack: its bonus becomes 4 and the Attack is still there', [s.stack.map(o => o.kind), s.stack[0].bonus], [['attack'], 4]);
    pass2(s); eq('the Attack then deals the attacker\u2019s power 3 + bonus 4 = 7', s.life.Opponent, 13);
    s = start(322); const w3 = take(s, 'Player', 'wolf', 'board', 'Player|front|1'), z = take(s, 'Opponent', 'rage', 'hand'); s.attackPhase = true; D(s, {type:'Attack', iid:w3.iid}); D(s, {type:'PlayCard', iid:z.iid}); pass2(s);
    eq('the defender may also boost the Attack (effect has whose:any): bonus 4', s.stack[0].bonus, 4);
    s = start(323); const w4 = take(s, 'Player', 'wolf', 'board', 'Player|front|1'), k4 = take(s, 'Player', 'knight', 'board', 'Player|front|2'), g4 = take(s, 'Opponent', 'guard', 'board', 'Opponent|front|1'), rr = take(s, 'Player', 'rage', 'hand'); s.attackPhase = true; D(s, {type:'Attack', iid:w4.iid}); s.priority = 'Player'; D(s, {type:'PlayCard', iid:rr.iid}); pass2(s); w4.loc = 'gy'; s.slots['Player|front|1'] = null; w4.slot = null; pass2(s);
    eq('the bonus still lands after the attacker left the board; the attacker\u2019s own power does not (guard HP 6 absorbs 4)', [g4.loc, Sim.totalDamage(g4), s.life.Opponent], ['board', 4, 20]); }
  out.push('---- ' + out.filter(l => l.startsWith('PASS')).length + ' passed, ' + out.filter(l => l.startsWith('FAIL')).length + ' failed, ' + out.filter(l => l.startsWith('XFAIL')).length + ' known bug(s) documented');
  console.log(out.join('\n')); return out;
}
window.cardGame = {Sim, send, undo, eventLog, history:undoStack, selfTest, get game(){ return sim; }};   // console/testing hook
setTopView(true);                                   // default camera: top view
sync(); openDeckEditor();
(function loop(){                                   // idle = no rendering, no raycasts
  requestAnimationFrame(loop);
  const busy = animate(); controls.update();
  if (hoverDirty && !drag){ hoverDirty = false; updateHover(); }
  const now = performance.now();
  if (busy || dirty || (pulse && now - lastPulse > 33)){ dirty = false; lastPulse = now; renderer.render(scene, cam); }
})();
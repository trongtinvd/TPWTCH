// tests.js - HEADLESS RULES TESTS: cardGame.selfTest() (also runnable in Node, see README).
// Classic script: shares one global scope with the other js/*.js files; load order matters (see index.html).

// ---- Headless rules tests (no THREE/DOM): run cardGame.selfTest() in the console ----
function selfTest(){
  const out = [], check = (name, ok) => out.push((ok ? 'PASS ' : 'FAIL ') + name);
  const start = seed => { const s = Sim.create(seed, DEFS); for (const p of ['Player', 'Opponent']) Sim.dispatch(s, {type:'Start', player:p}); return s; };
  const take = (s, o, id, loc, slot) => {           // move a named card out of its pile into hand or a board slot
    const c = Object.values(s.cards).find(x => x.owner === o && x.def.id === id), P = s.piles[o];
    for (const k of ['deck', 'hand']){ const i = P[k].indexOf(c); if (i >= 0) P[k].splice(i, 1); }
    c.loc = loc; if (loc === 'hand') P.hand.push(c); else if (loc === 'gy') P.gy.push(c); else { s.slots[slot] = c.iid; c.slot = slot; }
    return c;
  };
  check('every card only uses published effect APIs', !apiErrors().length);
  check('same seed -> same state', JSON.stringify(start(7)) === JSON.stringify(start(7)));
  let s = start(1), c = take(s, 'Player', 'knight', 'board', 'Player|front|0'); s.attackPhase = true;
  Sim.dispatch(s, {type:'Attack', iid:c.iid});
  check('empty column hits the player', s.life.Opponent === 16);
  s = start(2); const v = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'); c = take(s, 'Player', 'giant', 'board', 'Player|front|1'); s.attackPhase = true;
  Sim.dispatch(s, {type:'Attack', iid:c.iid});
  check('excess damage tramples to the player', v.loc === 'gy' && s.life.Opponent === 17);
  s = start(3); let z = take(s, 'Player', 'zap', 'hand');
  Sim.dispatch(s, {type:'PlayCard', iid:z.iid}); Sim.dispatch(s, {type:'Pass', player:'Opponent'}); Sim.dispatch(s, {type:'Pass', player:'Player'});
  check('0 HP stack object still resolves', z.loc === 'gy' && s.life.Opponent === 19);
  s = start(4); z = take(s, 'Player', 'zap', 'hand'); const b = take(s, 'Opponent', 'bolt', 'hand');
  Sim.dispatch(s, {type:'PlayCard', iid:z.iid}); Sim.dispatch(s, {type:'PlayCard', iid:b.iid});
  Sim.dispatch(s, {type:'Pass', player:'Player'}); Sim.dispatch(s, {type:'Pass', player:'Opponent'});
  check('stack object at -1 HP is countered', z.loc === 'gy' && s.life.Opponent === 20 && !s.stack.length);
  s = start(5); let h = take(s, 'Player', 'hummingbird', 'hand'); const n0 = s.piles.Player.hand.length;
  Sim.dispatch(s, {type:'PlayCard', iid:h.iid, slot:'Player|front|2'}); Sim.dispatch(s, {type:'Pass', player:'Player'}); Sim.dispatch(s, {type:'Pass', player:'Opponent'});
  check('Hummingbird enter trigger draws a card', s.piles.Player.hand.length === n0 && h.loc === 'board');
  s = start(6); h = take(s, 'Opponent', 'hummingbird', 'board', 'Opponent|front|1'); c = take(s, 'Player', 'giant', 'board', 'Player|front|1'); s.attackPhase = true;
  Sim.dispatch(s, {type:'Attack', iid:c.iid});
  check('attack damage waits for triggers', !!s.pending && s.life.Opponent === 20 && s.stack.length === 1);
  Sim.dispatch(s, {type:'Pass', player:'Player'}); Sim.dispatch(s, {type:'Pass', player:'Opponent'});
  check('shift choice is requested', !!s.choice && s.choice.player === 'Opponent' && s.choice.options.length === 3);
  Sim.dispatch(s, {type:'Choose', player:'Opponent', option:'Opponent|front|0'});
  check('shifted Hummingbird dodges the attack', h.slot === 'Opponent|front|0' && s.life.Opponent === 14 && !s.pending);
  s = start(8); h = take(s, 'Player', 'hummingbird', 'gy'); s.life.Player = 10;
  Sim.dispatch(s, {type:'Activate', iid:h.iid, ab:0}); Sim.dispatch(s, {type:'Pass', player:'Opponent'}); Sim.dispatch(s, {type:'Pass', player:'Player'});
  check('GY ability exiles Hummingbird and gains 3 life', h.loc === 'exile' && s.life.Player === 13);
  const owners = st => st.stack.map(o => st.cards[o.src].owner).join();
  s = start(11); take(s, 'Player', 'hummingbird', 'board', 'Player|front|0'); c = take(s, 'Player', 'soldier', 'board', 'Player|front|2'); take(s, 'Opponent', 'hummingbird', 'board', 'Opponent|front|4'); s.attackPhase = true;
  Sim.dispatch(s, {type:'Attack', iid:c.iid});
  check('trigger matches the card text: own non-attacking creature does not trigger Hummingbird', owners(s) === 'Opponent' && s.priority === 'Player');
  s = start(13); c = take(s, 'Player', 'hummingbird', 'board', 'Player|front|0'); take(s, 'Opponent', 'hummingbird', 'board', 'Opponent|front|3'); s.attackPhase = true;
  Sim.dispatch(s, {type:'Attack', iid:c.iid});
  check('simultaneous triggers: turn player (Player) goes on the stack first, then the other player', owners(s) === 'Player,Opponent' && s.priority === 'Player');
  s = start(14); s.active = 'Opponent'; s.priority = 'Opponent'; take(s, 'Player', 'hummingbird', 'board', 'Player|front|0'); c = take(s, 'Opponent', 'hummingbird', 'board', 'Opponent|front|3'); s.attackPhase = true;
  Sim.dispatch(s, {type:'Attack', iid:c.iid});
  check('simultaneous triggers: turn player (Opponent) goes on the stack first, then the other player', owners(s) === 'Opponent,Player' && s.priority === 'Opponent');
  console.log(out.join('\n')); return out;
}

// bot.js - A deliberately dumb opponent: it plays whatever it can. It sees only its own options (Sim.optionsFor), never the state, and
// every command is checked with Sim.accepts first, so it can never break a rule.
function botRng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}
const botPick = (a, rnd) => a[Math.floor(rnd() * a.length)];
const botActor = s => Sim.actor(s); // who must act now
// ---- the bot's decision: it reads ONLY Sim.optionsFor(state, p) (its own legal options, plain data) and asks legal(cmd) ----
function botPlayCmd(o, rnd) {
  // a PlayCard command with random (legal-looking) targets, or null; o = one entry of options.plays
  const cmd = { type: 'PlayCard', iid: o.iid };
  if (o.perm) {
    if (!o.slots.length) return null;
    cmd.slot = cmd.zone = botPick(o.slots, rnd);
    cmd.col = +cmd.slot.split('|')[2];
    return cmd;
  }
  if (o.colTarget) {
    if (!o.cols.length) return null;
    cmd.col = botPick(o.cols, rnd);
  }
  if (o.optionalTarget) return cmd; // cast without a target
  if (o.playerTarget && !(o.zoneTarget && rnd() < 0.5)) cmd.tplayer = o.foe;
  if (o.zoneTarget && !cmd.tplayer) {
    const foes = o.zones.filter(k => k.startsWith(o.foe + '|')),
      pool = foes.length ? foes : o.zones;
    if (pool.length) cmd.zone = botPick(pool, rnd);
    else if (o.playerTarget) cmd.tplayer = o.foe;
    else return null;
  }
  return cmd;
}
function botCandidates(v, rnd, mem) {
  // {main, fallback}: weighted commands; fallback is only tried when no main command is legal. v = Sim.optionsFor(state, p)
  const p = v.player,
    main = [],
    fallback = [],
    add = (w, cmd) => main.push({ w, cmd });
  if (v.choice) {
    v.choice.forEach(o => add(1, { type: 'Choose', player: p, option: o }));
    return { main, fallback };
  }
  if (v.mustPass) {
    add(1, { type: 'Pass', player: p });
    return { main, fallback };
  } // it never responds: it just passes
  if (mem.turn !== v.turn) {
    mem.turn = v.turn;
    mem.n = 0;
  }
  fallback.push({ w: 1, cmd: { type: 'EndTurn', player: p } });
  if (++mem.n > 40) return { main, fallback }; // safety valve: a card that loops back to hand cannot keep it busy forever
  if (v.attackPhase) {
    v.attackers.forEach(iid => add(3, { type: 'Attack', iid }));
    return { main, fallback };
  }
  for (const o of v.plays) {
    const cmd = botPlayCmd(o, rnd);
    if (cmd) add(2, cmd);
  }
  v.abilities.forEach(a => add(2, { type: 'Activate', iid: a.iid, ab: a.ab }));
  if (v.hasAP) {
    if (v.canBattle) add(3, { type: 'SetAttackPhase', player: p, on: true });
    if (v.deckSize) add(1, { type: 'Draw', player: p });
  }
  return { main, fallback };
}
function botDecide(v, rnd, mem, legal) {
  // one legal command for v.player, or null. legal(cmd) -> true when the game would accept it
  if (v.actor !== v.player) return null;
  const { main, fallback } = botCandidates(v, rnd, mem);
  const tryList = list => {
    const L = list.slice();
    while (L.length) {
      let r = rnd() * L.reduce((n, x) => n + x.w, 0),
        i = 0;
      while (i < L.length - 1 && (r -= L[i].w) >= 0) i++;
      const x = L.splice(i, 1)[0];
      if (legal(x.cmd)) return x.cmd;
    }
    return null;
  };
  return tryList(main) || tryList(fallback);
}
// the host's side of the boundary: it hands the bot its options and a legality check, never the state
const botChoose = (s, p, rnd, mem) => botDecide(Sim.optionsFor(s, p), rnd, mem, cmd => Sim.accepts(s, cmd));
// ---- host side (browser): the bot is always the Opponent seat ----
const botMem = { turn: -1, n: 0 },
  botR = botRng(Date.now());
const botWants = () => !MenuUI.away && !Result.blocks() && botActor(sim) === ui.botSeat; // the bot never surrenders, and waits while the result is shown
function botSchedule() {
  clearTimeout(ui.botTimer);
  ui.botTimer = setTimeout(botTick, 650);
}
function botTick() {
  if (ui.mode !== 'bot' || !botWants()) return;
  if (ui.fxBusy) {
    botSchedule();
    return;
  } // wait for the animation
  const cmd = botChoose(sim, ui.botSeat, botR, botMem);
  if (!cmd) {
    console.warn('Bot has no legal command');
    ui.note = 'Bot has no legal command';
    sync();
    return;
  }
  send(cmd, 'bot');
}
const foeChoice = () => !!game.choice && (rp.on || (ui.mode === 'bot' && game.choice.player === ui.botSeat)); // (in a replay every choice belongs to the replay) // a choice the bot must answer: the human sees and clicks nothing for it

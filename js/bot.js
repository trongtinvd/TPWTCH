// bot.js - A deliberately dumb opponent: it plays whatever it can. Every command is dry-run on a copy of the state first, so it can never break a rule.
function botRng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}
const botPick = (a, rnd) => a[Math.floor(rnd() * a.length)];
const botActor = s => (s.phase === 'play' ? (s.choice ? s.choice.player : s.priority) : null); // who must act now
const botLegal = (s, cmd) => {
  try {
    return Sim.dispatch(structuredClone(s), cmd).ok;
  } catch (e) {
    return false;
  }
};
function botPlayCmd(s, c, rnd) {
  // a PlayCard command with random (legal-looking) targets, or null
  const d = c.def,
    foe = Sim.other(c.owner),
    cmd = { type: 'PlayCard', iid: c.iid };
  if (Sim.isPerm(c)) {
    const f = Sim.freeSlots(s, c);
    if (!f.length) return null;
    cmd.slot = cmd.zone = botPick(f, rnd);
    cmd.col = +cmd.slot.split('|')[2];
    return cmd;
  }
  if (d.colTarget) {
    const cols = Sim.targetColumns(s, c);
    if (!cols.length) return null;
    cmd.col = botPick(cols, rnd);
  }
  if (d.optionalTarget) return cmd; // cast without a target
  if (d.playerTarget && !(d.zoneTarget && rnd() < 0.5)) cmd.tplayer = foe;
  if (d.zoneTarget && !cmd.tplayer) {
    const z = Sim.targetZones(s, c),
      foes = z.filter(k => k.startsWith(foe + '|')),
      pool = foes.length ? foes : z;
    if (pool.length) cmd.zone = botPick(pool, rnd);
    else if (d.playerTarget) cmd.tplayer = foe;
    else return null;
  }
  return cmd;
}
function botCandidates(s, p, rnd, mem) {
  // {main, fallback}: weighted commands; fallback is only tried when no main command is legal
  const main = [],
    fallback = [],
    add = (w, cmd) => main.push({ w, cmd });
  if (s.choice) {
    s.choice.options.forEach(o => add(1, { type: 'Choose', player: p, option: o }));
    return { main, fallback };
  }
  if (s.stack.length || s.respond || s.active !== p) {
    add(1, { type: 'Pass', player: p });
    return { main, fallback };
  } // it never responds: it just passes
  if (mem.turn !== s.turn) {
    mem.turn = s.turn;
    mem.n = 0;
  }
  fallback.push({ w: 1, cmd: { type: 'EndTurn', player: p } });
  if (++mem.n > 40) return { main, fallback }; // safety valve: a card that loops back to hand cannot keep it busy forever
  const mine = Object.values(s.cards).filter(c => c.owner === p);
  if (s.attackPhase) {
    mine.filter(c => Sim.canAttack(s, c) === null).forEach(c => add(3, { type: 'Attack', iid: c.iid }));
    return { main, fallback };
  }
  for (const c of s.piles[p].hand)
    if (Sim.canPlay(s, c) === null) {
      const cmd = botPlayCmd(s, c, rnd);
      if (cmd) add(2, cmd);
    }
  for (const c of mine)
    if (['board', 'hand', 'gy'].includes(c.loc))
      (Sim.abDef(c).abilities || []).forEach((a, i) => {
        if (Sim.canActivate(s, c, i) === null) add(2, { type: 'Activate', iid: c.iid, ab: i });
      });
  if (!Sim.majorUsed(s)) {
    if (mine.some(c => c.loc === 'board' && c.def.type === 'creature'))
      add(3, { type: 'SetAttackPhase', player: p, on: true });
    if (s.piles[p].deck.length) add(1, { type: 'Draw', player: p });
  }
  return { main, fallback };
}
function botChoose(s, p, rnd, mem) {
  // one legal command for p, or null
  if (botActor(s) !== p) return null;
  const { main, fallback } = botCandidates(s, p, rnd, mem);
  const tryList = list => {
    const L = list.slice();
    while (L.length) {
      let r = rnd() * L.reduce((n, x) => n + x.w, 0),
        i = 0;
      while (i < L.length - 1 && (r -= L[i].w) >= 0) i++;
      const x = L.splice(i, 1)[0];
      if (botLegal(s, x.cmd)) return x.cmd;
    }
    return null;
  };
  return tryList(main) || tryList(fallback);
}
// ---- host side (browser): the bot is always the Opponent seat ----
const botMem = { turn: -1, n: 0 },
  botR = botRng(Date.now());
const botWants = () => !MenuUI.away && botActor(sim) === 'Opponent';
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
  const cmd = botChoose(sim, 'Opponent', botR, botMem);
  if (!cmd) {
    console.warn('Bot has no legal command');
    ui.note = 'Bot has no legal command';
    sync();
    return;
  }
  send(cmd);
}
const foeChoice = () => ui.mode === 'bot' && !!game.choice && game.choice.player === 'Opponent'; // a choice the bot must answer: the human sees and clicks nothing for it

// 15-rulings-sent-to-gy.js - Q45: "destroy" is only a description of a card being sent from the field to the graveyard; the move records from / to / by.
// Run only these: node tests/run.js --only sent-to-gy
(function () {
  const { D, check, eq, start, take, pass2, AT, drain, dmg } = Tests.ctx;
  const sent = ev => ev.filter(e => e.t === 'PermanentDestroyed');

  Tests.add('sent-to-gy', () => {
    // ================= every field -> graveyard move says from, to and by =================
    let s = start(1500);
    const so = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'),
      gi = take(s, 'Player', 'giant', 'board', 'Player|front|1');
    s.attackPhase = true;
    D(s, { type: 'Attack', iid: gi.iid });
    let ev = [];
    for (let n = 0; n < 6 && s.stack.length; n++) ev = ev.concat(D(s, { type: 'Pass', player: s.priority }).events);
    eq('lethal damage is a rule: the move is from the field to the graveyard, by the rules', sent(ev).map(e => [e.iid === so.iid, e.from, e.to, e.by]), [[true, 'board', 'gy', 'rule']]);
    s = start(1501);
    const v = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1'),
      sb = take(s, 'Player', 'superbolt', 'hand');
    D(s, { type: 'PlayCard', iid: sb.iid, zone: 'Opponent|front|1' });
    const e2 = pass2(s).events;
    eq('a card sent to the graveyard by an effect (Superbolt\u2019s damage is lethal: still the rule)', sent(e2).map(e => [e.by, e.to]), [['rule', 'gy']]);
    s = start(1502);
    const sc = take(s, 'Player', 'scout', 'board', 'Player|front|1');
    take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|1');
    const e3 = D(s, { type: 'Activate', iid: sc.iid, ab: 0 }).events;
    eq('paying a sacrifice cost is a move by "cost"', sent(e3).map(e => [e.iid === sc.iid, e.by]), [[true, 'cost']]);
    s = start(1503);
    const w = take(s, 'Player', 'ward', 'board', 'Player|back|0');
    Tests.ctx.setLife(s, 'Player', 15);
    D(s, { type: 'Activate', iid: w.iid, ab: 0 });
    const e4 = pass2(s).events;
    eq('an effect that sends its own card (Ward) is a move by "effect"', sent(e4).map(e => [e.iid === w.iid, e.by]), [[true, 'effect']]);
    s = start(1504);
    const k = take(s, 'Opponent', 'barrier', 'board', 'Opponent|back|2'),
      g = take(s, 'Opponent', 'guard', 'board', 'Opponent|front|2'),
      kn = take(s, 'Player', 'knight', 'board', 'Player|front|2');
    take(s, 'Player', 'aura', 'board', 'Player|back|2');
    const bl = take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|3');
    Sim.addStatus(s, bl, { kind: 'shield', color: 'blue', srcName: 't' });
    Sim.markUnusable(s, 'Opponent|front|3', 'test');
    const e5 = D(s, { type: 'Draw', player: 'Player' }).events;
    eq('a zone that is gone: the rules send its card to the graveyard (even a blue one), exactly the same move, by the rules', sent(e5).map(e => [e.iid === bl.iid, e.from, e.to, e.by, e.why]), [[true, 'board', 'gy', 'rule', 'its zone became unusable']]);
    check('...and it is in the graveyard of its owner like any other', bl.loc === 'gy' && s.piles.Opponent.gy.includes(bl));
    check('the log reads it as a move, not as a special event', /sent to the graveyard by the rules/.test(bl.logs.filter(e => e.kind === 'zone').pop().how));
  });

  Tests.add('sent-to-gy-tokens', () => {
    // a token that is sent away ceases to exist: to = gone
    const s = start(1510),
      vn = take(s, 'Player', 'vine', 'hand');
    D(s, { type: 'PlayCard', iid: vn.iid, slot: 'Player|front|2' });
    drain(s);
    const tk = Object.values(s.cards).find(c => c.token && c.def.id === 'vine-token' && c.loc === 'board'),
      pk = take(s, 'Opponent', 'superbolt', 'hand');
    s.priority = 'Opponent';
    s.active = 'Opponent';
    Sim.gainAP(s, 'Opponent', []);
    const r = D(s, { type: 'PlayCard', iid: pk.iid, zone: tk.slot });
    const ev = pass2(s).events;
    eq('a token sent from the field: to "gone", by the rules (lethal damage)', sent(ev).filter(e => e.iid === tk.iid).map(e => [e.to, e.by]), [['gone', 'rule']]);
    check('(the cast itself was legal)', r.ok);
  });
})();

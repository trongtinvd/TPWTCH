// 12-rulings-statuses.js - rulings 2026-11-22, group 2: rule statuses cannot / can (Q8, Q37), statuses on stack objects (Q33),
// statuses on zones: unusable and clouds (Q34), turns that count (Q11), zone HP (Q10).
// Run only these: node tests/run.js --only rule-statuses,stack-statuses,zone-statuses,expiry-turns,zone-hp
(function () {
  const { D, check, eq, rej, start, take, pass2, endTurnFlow, shield } = Tests.ctx;

  Tests.add('rule-statuses', () => {
    // ================= Q8 / Q37: cannot / can, folded in list order, the later-entered effect wins =================
    let s = start(1200);
    const P = s.players.Player;
    check('everything is allowed by default', Sim.allowed(P, 'gainLife') && Sim.allowed(P, 'attack'));
    Sim.addStatus(s, P, { kind: 'cannot', what: 'gainLife', srcName: 't' });
    eq('a cannot status forbids it', Sim.allowed(P, 'gainLife'), false);
    Sim.addStatus(s, P, { kind: 'can', what: 'gainLife', srcName: 't' });
    eq('a later can overrides it', Sim.allowed(P, 'gainLife'), true);
    const c3 = Sim.addStatus(s, P, { kind: 'cannot', what: 'gainLife', srcName: 't' });
    eq('a still later cannot wins again; another rule is untouched', [Sim.allowed(P, 'gainLife'), Sim.allowed(P, 'attack')], [false, true]);
    Sim.removeStatus(s, c3, 'test');
    eq('a removed status is ignored: the can before it applies again', Sim.allowed(P, 'gainLife'), true);
    eq(
      'the status lines say what the rule is',
      Sim.statusLines(P).map(x => x.text.split(' \u00b7 ')[0]),
      ['Cannot gain life from t', 'Can gain life from t', 'Cannot gain life from t']
    );
    s = start(1201);
    const he = take(s, 'Player', 'heal', 'hand');
    Sim.addStatus(s, s.players.Player, { kind: 'cannot', what: 'gainLife', srcName: 't' });
    D(s, { type: 'PlayCard', iid: he.iid });
    pass2(s);
    eq('GainLife obeys it: Heal resolves and gains nothing', [s.life.Player, he.loc], [20, 'gy']);
    s = start(1202);
    const h2 = take(s, 'Player', 'heal', 'hand');
    Sim.addStatus(s, s.players.Player, { kind: 'cannot', what: 'gainLife', srcName: 't' });
    Sim.addStatus(s, s.players.Player, { kind: 'can', what: 'gainLife', srcName: 't' });
    D(s, { type: 'PlayCard', iid: h2.iid });
    pass2(s);
    eq('...and with a later can Heal works again', s.life.Player, 23);
    s = start(1203);
    const sp = take(s, 'Player', 'spirit', 'hand');
    D(s, { type: 'PlayCard', iid: sp.iid });
    pass2(s);
    D(s, { type: 'Choose', player: 'Player', option: '0' });
    check(
      'Spirit of the Sand is a cannot-gain-life status on the player (no separate nogain kind)',
      !Sim.allowed(s.players.Player, 'gainLife') &&
        !Sim.hasSt(s.players.Player, 'nogain') &&
        Sim.statusLines(s.players.Player).some(x => /^Cannot gain life from Spirit of the Sand/.test(x.text))
    );
    s = start(1204);
    const wf = take(s, 'Player', 'wolf', 'board', 'Player|front|0');
    s.attackPhase = true;
    check('a creature may attack by default', Sim.canAttack(s, wf) === null);
    Sim.addStatus(s, wf, { kind: 'cannot', what: 'attack', srcName: 't' });
    rej('cannot attack: the Attack command is refused', s, { type: 'Attack', iid: wf.iid }, 'cannot attack');
    Sim.addStatus(s, wf, { kind: 'can', what: 'attack', srcName: 't' });
    check('a later can lets it attack again', Sim.canAttack(s, wf) === null && D(s, { type: 'Attack', iid: wf.iid }).ok);
  });

  Tests.add('stack-statuses', () => {
    // ================= Q33: stack objects (Attacks included) have statuses[] =================
    let s = start(1210);
    const wf = take(s, 'Player', 'wolf', 'board', 'Player|front|1'),
      rg = take(s, 'Player', 'rage', 'hand');
    s.attackPhase = true;
    D(s, { type: 'Attack', iid: wf.iid });
    const at = s.stack[0];
    check(
      'an Attack has an empty statuses list and no bonus field',
      Array.isArray(at.statuses) && !at.statuses.length && at.bonus === undefined && Sim.bonusOf(at) === 0
    );
    s.priority = 'Player';
    D(s, { type: 'PlayCard', iid: rg.iid });
    pass2(s);
    const b = Sim.live(at).filter(x => x.kind === 'bonus');
    eq(
      'damage added to an Attack is a status on it, with its amount and source',
      [b.length, b[0] && b[0].amount, b[0] && b[0].srcName, Sim.bonusOf(at)],
      [1, 4, 'Rage', 4]
    );
    check('the stack object keeps its own log of that status', !!at.logs && at.logs.some(e => e.kind === 'status+'));
    pass2(s);
    eq('the Attack deals the attacker\u2019s power 3 + the bonus status 4', s.life.Opponent, 13);
    s = start(1211);
    const z = take(s, 'Player', 'zap', 'hand'),
      bo = take(s, 'Opponent', 'bolt', 'hand');
    D(s, { type: 'PlayCard', iid: z.iid });
    const zo = s.stack[0];
    Sim.addStatus(s, zo, { kind: 'nodamage', expires: 'turnEnd', srcName: 'test' });
    D(s, { type: 'PlayCard', iid: bo.iid });
    const r = pass2(s);
    eq(
      'damage denial on a stack object is a status too: Bolt is denied, Zap keeps its HP',
      [zo.hp, r.events.some(e => e.t === 'DamageDenied' && e.sid === zo.sid), s.stack.length, zo.nodmg],
      [0, true, 1, undefined]
    );
    pass2(s);
    eq('...and Zap resolves', [s.life.Opponent, z.loc], [19, 'gy']);
  });

  Tests.add('zone-statuses', () => {
    // ================= Q34: unusable zones and King Eye clouds are statuses on the zones =================
    let s = start(1220);
    const ks = Object.keys(s.slots);
    check(
      'every board zone is an object with its own statuses list',
      ks.length === 20 && ks.every(k => s.zones[k] && s.zones[k].key === k && Array.isArray(s.zones[k].statuses))
    );
    check('there is no separate unusable table any more', s.unusable === undefined);
    eq('nothing is unusable or covered at the start', [ks.filter(k => Sim.isUnusable(s, k)).length, Object.keys(Sim.cloudMap(s)).length], [0, 0]);
    s = start(1221);
    take(s, 'Opponent', 'barrier', 'board', 'Opponent|back|2');
    take(s, 'Opponent', 'guard', 'board', 'Opponent|front|2');
    take(s, 'Player', 'knight', 'board', 'Player|front|2');
    take(s, 'Player', 'aura', 'board', 'Player|back|2');
    const w = take(s, 'Player', 'infinitywall', 'hand');
    D(s, { type: 'PlayCard', iid: w.iid, col: 2 });
    pass2(s);
    const col = ['Opponent|back|2', 'Opponent|front|2', 'Player|front|2', 'Player|back|2'];
    check(
      'Infinity Wall puts an unusable status (with its name) on each of the four zones, and no other zone has one',
      col.every(k => Sim.live(s.zones[k]).some(x => x.kind === 'unusable' && x.srcName === 'Infinity Wall') && Sim.isUnusable(s, k)) &&
        !Sim.isUnusable(s, 'Player|front|1')
    );
    check('...the status is kept for good and reads as text', Sim.statusLines(s.zones[col[0]])[0].text.startsWith('Zone is unusable from Infinity Wall'));
    s = start(1222);
    const ke = take(s, 'Opponent', 'kingeye', 'board', 'Opponent|front|1'),
      covered = k => Sim.live(s.zones[k]).filter(x => x.kind === 'cloud').length;
    eq(
      'King Eye: a cloud status on each of its controller\u2019s other nine zones (read from a state built by hand), none on its own zone or the foe\u2019s',
      [Object.keys(Sim.cloudMap(s)).length, covered('Opponent|front|0'), covered('Opponent|front|1'), covered('Player|front|0')],
      [9, 1, 0, 0]
    );
    check('the status names its source', Sim.live(s.zones['Opponent|back|4'])[0].src === ke.iid);
    s.slots['Opponent|front|1'] = null;
    ke.slot = 'Opponent|front|2';
    s.slots['Opponent|front|2'] = ke.iid;
    Sim.recalc(s, []);
    eq(
      'the clouds follow King Eye when it moves; the old one stays in the list, greyed',
      [covered('Opponent|front|1'), covered('Opponent|front|2'), s.zones['Opponent|front|2'].statuses.some(x => x.kind === 'cloud' && x.removed)],
      [1, 0, true]
    );
    ke.loc = 'gy';
    ke.slot = null;
    s.slots['Opponent|front|2'] = null;
    Sim.recalc(s, []);
    check(
      'when King Eye leaves the board every cloud status is removed',
      !Object.keys(Sim.cloudMap(s)).length &&
        Object.values(s.zones).every(z => !Sim.live(z).some(x => x.kind === 'cloud')) &&
        s.zones['Opponent|back|0'].statuses.every(x => !x.removed || x.removed.why === 'no longer covered')
    );
  });

  Tests.add('expiry-turns', () => {
    // ================= Q11: a multi-turn effect says which turns count =================
    let s = start(1230);
    const so = take(s, 'Player', 'soldier', 'board', 'Player|front|0'),
      add = e => Sim.addStatus(s, so, { kind: 'mod', atk: 1, hp: 0, expires: e, srcName: 't' }),
      a = add({ turns: 2, whose: 'self' }),
      b = add({ turns: 1, whose: 'foe' }),
      c = add({ turns: 2, whose: 'any' }),
      d = add('turnEnd');
    eq(
      'the controller defaults to the card\u2019s controller and the status counts its turns down',
      [a.by, a.expires.left, a.expires.whose],
      ['Player', 2, 'self']
    );
    endTurnFlow(s);
    eq(
      'after Player 1\u2019s turn: self 1 left, foe not counted, any 1 left, the old turnEnd form is gone',
      [!a.removed, a.expires.left, !b.removed, b.expires.left, !c.removed, c.expires.left, !!d.removed],
      [true, 1, true, 1, true, 1, true]
    );
    endTurnFlow(s);
    eq(
      'after Player 2\u2019s turn: the foe one and the any one are gone (reason: expired), the self one is not counted',
      [!!b.removed, b.removed && b.removed.why, !!c.removed, !a.removed, a.expires.left],
      [true, 'expired', true, true, 1]
    );
    endTurnFlow(s);
    eq('after Player 1\u2019s second turn the self one is gone', [!!a.removed, a.removed && a.removed.why], [true, 'expired']);
    s = start(1231);
    Sim.addStatus(s, s.players.Opponent, { kind: 'cannot', what: 'gainLife', expires: { turns: 1, whose: 'self' }, srcName: 't' });
    endTurnFlow(s);
    const mid = Sim.allowed(s.players.Opponent, 'gainLife');
    endTurnFlow(s);
    eq(
      'a rule status on a player that lasts through that player\u2019s next turn only: still on after the other turn, off after its own',
      [mid, Sim.allowed(s.players.Opponent, 'gainLife')],
      [false, true]
    );
    s = start(1232);
    const zs = Sim.addStatus(s, s.zones['Player|front|0'], { kind: 'unusable', by: 'Player', expires: { turns: 1, whose: 'foe' }, srcName: 't' });
    endTurnFlow(s);
    const z1 = !zs.removed;
    endTurnFlow(s);
    eq('zones and stack objects count turns too (a zone status for the opponent\u2019s next turn)', [z1, !!zs.removed], [true, true]);
  });

  Tests.add('zone-hp', () => {
    // ================= Q10: zone HP is off until an effect gives it; every effect feeds one shared bar =================
    const hp5 = Fx.quick('t-zhp', 'Zone Armor', 0, {
        text: 'Test Quick spell: the target zone gets 5 zone HP.',
        zoneTarget: Fx.zoneTarget.anyPermanent,
        effects: [Fx.giveZoneHp(5)],
      }),
      hit3 = Fx.quick('t-zhit', 'Zone Hit', 0, {
        text: 'Test Quick spell: the target zone takes 3 zone damage.',
        zoneTarget: Fx.zoneTarget.anyPermanent,
        effects: [Fx.damageZone(3)],
      });
    check('Sim.API lists the zone HP effects', Sim.API.effects.includes('GiveZoneHp') && Sim.API.effects.includes('DamageZone'));
    const s = start(1240, [hp5, hit3]),
      K = 'Opponent|front|1',
      so = take(s, 'Opponent', 'soldier', 'board', K),
      a = take(s, 'Player', 't-zhp', 'hand'),
      h = take(s, 'Player', 't-zhit', 'hand');
    eq('zone HP is off by default; damaging such a zone does nothing', [Sim.zoneBar(s, K), Sim.damageZone(s, K, 3, 't', []), s.zones[K].statuses.length], [null, false, 0]);
    D(s, { type: 'PlayCard', iid: a.iid, zone: K });
    pass2(s);
    eq('an effect gives the zone HP', Sim.zoneBar(s, K), { hp: 5, damage: 0, left: 5 });
    Sim.giveZoneHp(s, K, 2, 'test');
    eq('another effect adds to the SAME bar', Sim.zoneBar(s, K), { hp: 7, damage: 0, left: 7 });
    D(s, { type: 'PlayCard', iid: h.iid, zone: K });
    pass2(s);
    eq('zone damage lowers the bar and does not touch the card standing there', [Sim.zoneBar(s, K).left, so.loc, Sim.totalDamage(so)], [4, 'board', 0]);
    shield(s, so, 'blue');
    const ev = [];
    Sim.damageZone(s, K, 4, 'test', ev);
    eq(
      'at 0 the contents are exiled (a rule, so even a blue card), the zone is unusable, the bar is gone',
      [so.loc, s.slots[K], Sim.isUnusable(s, K), Sim.zoneBar(s, K)],
      ['exile', null, true, null]
    );
    check(
      'the events say so, the HP statuses are greyed (zone HP used up) and the unusable status stays',
      ev.some(e => e.t === 'CardExiled' && e.iid === so.iid) &&
        ev.some(e => e.t === 'ZoneUnusable' && e.slot === K) &&
        s.zones[K].statuses.filter(x => x.kind === 'zonehp' || x.kind === 'zonedmg').every(x => x.removed && x.removed.why === 'zone HP used up') &&
        Sim.live(s.zones[K]).some(x => x.kind === 'unusable')
    );
    const E2 = 'Player|back|4';
    Sim.giveZoneHp(s, E2, 2, 'test');
    Sim.damageZone(s, E2, 2, 'test', []);
    check('an empty zone collapses the same way: unusable, nothing to exile', Sim.isUnusable(s, E2));
  });
})();

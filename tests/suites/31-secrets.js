// 31-secrets.js - the secret mechanic (js/sim/secrets.js) and Zapping Ground (spec: claude/SPEC_secret_cards.md).
// Zapping Ground: when it enters and at the start of your turn (Stack HP 1), secretly target an empty zone (a cost); that zone secretly gains
// "when a card enters this zone (Stack HP 2): consume this status (cost); deal 1 damage to that card". Shifting in counts as entering.
// The other player is told a secret was placed and its candidates (the zones it may be on), never the zone; candidates narrow when a card
// enters a candidate zone they can see and nothing triggers; the secret is revealed when it triggers. Traps stay after Zapping Ground leaves.
// Run only these: node tests/run.js --only secret
(function () {
  const { D, check, eq, start, take, drain, endTurnFlow } = Tests.ctx;
  const traps = (s, k) => Sim.live(s.zones[k]).filter(x => x.kind === 'zoneSecret');
  // run a command, keep what each player may know of it
  const step = (s, cmd) => {
    const pre = structuredClone(s),
      r = D(s, cmd);
    return {
      r,
      Player: Sim.observeStep(pre, s, cmd, r.events, 'Player'),
      Opponent: Sim.observeStep(pre, s, cmd, r.events, 'Opponent'),
    };
  };
  const ZK = 'Opponent|front|2';
  // Player plays Zapping Ground and secretly picks `zone`; returns the steps of the pick and of the resolution
  const arm = (s, zone, slot) => {
    const z = take(s, 'Player', 'zapping', 'hand');
    D(s, { type: 'PlayCard', iid: z.iid, slot: slot || 'Player|back|0' });
    const pick = step(s, { type: 'Choose', player: 'Player', option: zone }),
      steps = [pick];
    let n = 0;
    while ((s.stack.length || s.respond) && !s.choice && n++ < 10)
      steps.push(step(s, { type: 'Pass', player: s.priority }));
    return { z, pick, steps };
  };
  const toOpponentTurn = s => {
    endTurnFlow(s);
    drain(s);
  };

  Tests.add('secret-text', () => {
    eq(
      'No card names anything the Sim lacks (Sim.loadErrors: main.js warns when the browser mixed old and new files)',
      Sim.loadErrors,
      []
    );
    const d = Cards.list.find(x => x.id === 'zapping');
    eq('Zapping Ground is a 6 HP enchantment', [d.type, d.hp], ['enchantment', 6]);
    eq(
      'It arms a zone when it enters and at the start of your turn (Stack HP 1, secret zone target)',
      d.triggers.map(t => [t.on, t.hp, t.targeting]),
      [
        ['enter', 1, 'secretZone'],
        ['turnStart', 1, 'secretZone'],
      ]
    );
    eq(
      'The trap text',
      d.traps[0].text,
      'When a card enters this zone: consume this status; deal 1 damage to that card. (Stack HP 2)'
    );
    check(
      'The trigger text says it is secret and quotes the trap',
      /secretly target an empty zone; that zone secretly gains .When a card enters this zone/.test(d.triggers[0].text)
    );
  });

  Tests.add('secret-place', () => {
    const s = start(3101),
      z = take(s, 'Player', 'zapping', 'hand');
    take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|0');
    Sim.markUnusable(s, 'Opponent|back|4', 'test');
    D(s, { type: 'PlayCard', iid: z.iid, slot: 'Player|back|0' });
    const k = s.choice;
    check(
      'The enter trigger asks its controller for a secret zone',
      k && k.kind === 'trigtarget' && k.secret && k.player === 'Player'
    );
    eq('Options: every empty usable zone (not its own, the Soldier or the unusable one)', k.options.length, 17);
    const foe = Sim.observe(s, 'Opponent').choice;
    check('The other player sees a secret pick, no options, no labels', foe.secret && !foe.options && !foe.labels);
    const pick = step(s, { type: 'Choose', player: 'Player', option: ZK }),
      top = s.stack[s.stack.length - 1];
    check('It goes on the stack with 1 HP, its pick is the zone', top && top.hp === 1 && top.pick === ZK && top.secret);
    eq('The other player does not see the pick', Sim.observe(s, 'Opponent').stack.slice(-1)[0].pick, null);
    eq('Its controller does', Sim.observe(s, 'Player').stack.slice(-1)[0].pick, ZK);
    eq('The observed Choose hides the zone from the other player', pick.Opponent.cmd.option, null);
    check(
      'The other player’s log says a zone was secretly targeted, never which',
      Narrate.story(pick.Opponent).some(l => /secretly targets a zone/.test(l.text)) &&
        !Narrate.story(pick.Opponent).some(l => /front zone 3/.test(l.text))
    );
    const res = step(s, { type: 'Pass', player: s.priority });
    step(s, { type: 'Pass', player: s.priority });
    drain(s);
    eq(
      'The zone has the trap, placed by Player',
      traps(s, ZK).map(x => [x.by, x.src]),
      [['Player', z.iid]]
    );
    void res;
    const rec = s.secrets[0];
    eq('The secret record', [rec.by, rec.zone, rec.state, rec.cands.length], ['Player', ZK, 'armed', 17]);
    const po = Sim.observe(s, 'Opponent'),
      pp = Sim.observe(s, 'Player');
    check(
      'The other player sees no trap status on the zone',
      !po.zones[ZK].statuses.some(x => x.kind === 'zoneSecret')
    );
    check(
      'Its placer does',
      pp.zones[ZK].statuses.some(x => x.kind === 'zoneSecret')
    );
    eq(
      'The other player knows the secret and its candidates, not its zone',
      [po.secrets[0].zone, po.secrets[0].cands.length],
      [undefined, 17]
    );
    eq('Its placer knows the zone', pp.secrets[0].zone, ZK);
  });

  Tests.add('secret-trigger', () => {
    const s = start(3102),
      { steps } = arm(s, ZK);
    const placed = steps.find(x => x.r.events.some(e => e.t === 'SecretPlaced'));
    check(
      'SecretPlaced: no slot for the other player, the slot for its placer',
      placed &&
        !('slot' in placed.Opponent.ev.find(e => e.t === 'SecretPlaced')) &&
        placed.Player.ev.find(e => e.t === 'SecretPlaced').slot === ZK
    );
    check(
      'The other player’s log: a secret with its candidate count, no zone',
      Narrate.story(placed.Opponent).some(l =>
        /places a secret \(Zapping Ground\): it may be on one of 19 zones/.test(l.text)
      )
    );
    toOpponentTurn(s);
    eq(
      'No Zapping trigger on the other player’s turn start',
      [s.active, s.stack.length, !!s.choice],
      ['Opponent', 0, false]
    );
    // a card enters another candidate zone: nothing triggers, the candidate is ruled out
    const w = take(s, 'Opponent', 'wolf', 'hand');
    D(s, { type: 'PlayCard', iid: w.iid, slot: 'Opponent|front|1' });
    check('A card entering another zone triggers nothing', !s.stack.length);
    check(
      'That zone is no longer a candidate',
      !s.secrets[0].cands.includes('Opponent|front|1') && s.secrets[0].cands.length === 18
    );
    drain(s);
    Sim.gainAP(s, 'Opponent', []); // a second play this turn
    const so = take(s, 'Opponent', 'soldier', 'hand');
    D(s, { type: 'PlayCard', iid: so.iid, slot: ZK });
    const top = s.stack[s.stack.length - 1];
    check(
      'A card entering the trapped zone: the trap goes on the stack (HP 2), controlled by its placer, targeting that card',
      top && top.list === 'traps' && top.hp === 2 && top.controller === 'Player' && top.target === so.iid
    );
    check(
      'Its cost is paid: the status is consumed',
      !traps(s, ZK).length && Sim.statusLines(s.zones[ZK]).some(x => x.removed)
    );
    eq('The secret is revealed', [s.secrets[0].state, Sim.observe(s, 'Opponent').secrets[0].zone], ['revealed', ZK]);
    drain(s);
    eq(
      'It resolves: 1 damage to the Soldier, from Zapping Ground',
      Sim.live(so)
        .filter(x => x.kind === 'damage')
        .map(x => [x.amount, s.cards[x.source] && s.cards[x.source].def.id]),
      [[1, 'zapping']]
    );
  });

  Tests.add('secret-entries', () => {
    {
      // shifting in counts as entering
      const s = start(3103);
      arm(s, 'Player|front|2');
      const a = take(s, 'Player', 'soldier', 'board', 'Player|front|1');
      s.choice = {
        player: 'Player',
        iid: a.iid,
        options: ['stay', 'Player|front|0', 'Player|front|2'],
        prompt: 'shift',
      };
      D(s, { type: 'Choose', player: 'Player', option: 'Player|front|2' });
      const top = s.stack[s.stack.length - 1];
      check('A shift into the zone triggers the trap', top && top.list === 'traps' && top.target === a.iid);
    }
    {
      // tokens enter too (Shield Army's Duplicate), and the trap stays after Zapping Ground leaves
      const s = start(3104),
        { z } = arm(s, 'Player|front|3');
      take(s, 'Player', 'zapping', 'gy');
      check('Zapping Ground left: the trap stays', z.loc === 'gy' && traps(s, 'Player|front|3').length === 1);
      endTurnFlow(s);
      endTurnFlow(s);
      drain(s);
      const sa = take(s, 'Player', 'shieldarmy', 'hand');
      ['soldier', 'knight', 'giant'].forEach((id, i) => take(s, 'Player', id, 'board', 'Player|front|' + i));
      D(s, { type: 'PlayCard', iid: sa.iid, slot: 'Player|front|4' });
      drain(s);
      const tok = Object.values(s.cards).find(c => c.token && c.slot === 'Player|front|3');
      check(
        'A Duplicate token entering the zone triggers it; the trap still deals its damage',
        !!tok && Sim.live(tok).some(x => x.kind === 'damage' && x.amount === 1)
      );
    }
  });

  Tests.add('secret-turnstart-cloud', () => {
    {
      const s = start(3105);
      arm(s, ZK);
      toOpponentTurn(s);
      endTurnFlow(s);
      check(
        'At the start of its controller’s turn it asks again',
        s.choice && s.choice.kind === 'trigtarget' && s.choice.secret
      );
      check('A zone already trapped can be picked again', s.choice.options.includes(ZK));
    }
    {
      // King Eye: a covered zone may be picked; if it is filled, the ability fizzles
      const s = start(3106);
      take(s, 'Opponent', 'kingeye', 'board', 'Opponent|front|0');
      take(s, 'Opponent', 'soldier', 'board', 'Opponent|front|3');
      const z = take(s, 'Player', 'zapping', 'hand');
      D(s, { type: 'PlayCard', iid: z.iid, slot: 'Player|back|0' });
      check('A covered zone with a card under it is an option', s.choice.options.includes('Opponent|front|3'));
      check('The King Eye zone is not (seen, filled)', !s.choice.options.includes('Opponent|front|0'));
      D(s, { type: 'Choose', player: 'Player', option: 'Opponent|front|3' });
      const r = [];
      let n = 0;
      while (s.stack.length && n++ < 10) r.push(...D(s, { type: 'Pass', player: s.priority }).events);
      check(
        'Filled at resolution: it fizzles, no trap, no secret',
        r.some(e => e.t === 'StackObjectFizzled') && !traps(s, 'Opponent|front|3').length && !(s.secrets || []).length
      );
    }
  });
})();

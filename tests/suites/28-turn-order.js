// 28-turn-order.js - the turn order race (Docs/RULES.md "Turn order"): Distance / Speed / Acceleration decide who takes each turn.
// The farthest ahead takes the turn (ties: greater Speed, greater Acceleration, the player who did not have the last turn, coin toss), the other
// advances (Distance += Speed; Speed += Acceleration). Sim.turnOrder projects the next turns; `race` statuses change the stats.
// Run only these: node tests/run.js --only turn-order
(function () {
  const { D, check, eq, endTurnFlow } = Tests.ctx;
  const R = (dP, sP, aP, dO, sO, aO) => ({
    Player: { distance: dP, speed: sP, acceleration: aP },
    Opponent: { distance: dO, speed: sO, acceleration: aO },
  });
  const game = (seed, race) => {
    const s = Sim.create(seed, DEFS.concat(FIXTURES), { rules: race ? { race } : {} });
    for (const p of ['Player', 'Opponent']) D(s, { type: 'Start', player: p });
    return s;
  };
  const turns = (s, n) => {
    const out = [s.active];
    for (let i = 1; i < n; i++) {
      endTurnFlow(s);
      out.push(s.active);
    }
    return out;
  };
  const P = 'Player',
    O = 'Opponent';

  Tests.add('turn-order', () => {
    {
      const s = game(2801);
      eq(
        'no race (no avatars): the state has no race field, turns alternate',
        [s.race, turns(s, 4)],
        [undefined, [P, O, P, O]]
      );
      eq(
        '...and the projection alternates too',
        Sim.turnOrder(game(2801), 4).map(t => t.player),
        [P, O, P, O]
      );
    }
    {
      const s = Sim.create(2802, DEFS.concat(FIXTURES), {
        rules: { race: { Player: { distance: 1, speed: 1 }, Opponent: { distance: 1, speed: 1, acceleration: 1 } } },
      });
      check(
        'a race with a missing value is dropped (turns alternate)',
        s.race === undefined && s.cfg.race === undefined
      );
    }
    {
      const s = Sim.create(2803, DEFS.concat(FIXTURES), { rules: { race: R(3, 3, 3, 5, 2, 2) } });
      D(s, { type: 'Start', player: P });
      const r = D(s, { type: 'Start', player: O });
      eq(
        'the farthest ahead takes the first turn (priority and its action point too)',
        [s.active, s.priority, s.players.Opponent.ap.length, s.players.Player.ap.length],
        [O, O, 1, 0]
      );
      eq('the other player advances: Distance += Speed, Speed += Acceleration', s.race.Player, {
        distance: 6,
        speed: 6,
        acceleration: 3,
      });
      check(
        'RaceAdvanced is logged',
        r.events.some(e => e.t === 'RaceAdvanced' && e.player === P && e.by === 3 && e.distance === 6)
      );
      check('no coin toss without a tie', !r.events.some(e => e.t === 'CoinToss'));
    }
    {
      const s = game(2804, R(13, 1, 1, 10, 3, 2));
      eq(
        'the rules example: D10 S3 A2 -> D13 S5',
        [s.active, s.race.Opponent.distance, s.race.Opponent.speed],
        [P, 13, 5]
      );
    }
    {
      const a = [],
        seen = {};
      for (let n = 2810; n < 2830; n++) {
        const s = Sim.create(n, DEFS.concat(FIXTURES), { rules: { race: R(4, 2, 1, 4, 2, 1) } });
        D(s, { type: 'Start', player: P });
        const r = D(s, { type: 'Start', player: O }),
          toss = r.events.find(e => e.t === 'CoinToss');
        a.push(!!toss && toss.winner === s.active);
        seen[s.active] = 1;
      }
      check(
        'a tie at the start is a coin toss: its winner takes the turn',
        a.every(x => x)
      );
      check('...both players win some tosses (20 seeds)', seen.Player && seen.Opponent);
      const x = game(2815, R(4, 2, 1, 4, 2, 1)).active,
        y = game(2815, R(4, 2, 1, 4, 2, 1)).active;
      check('...and the same seed gives the same toss (replays)', x === y);
    }
    {
      // Player D0 S10, Opponent D5 S1 (no acceleration): O first (5 > 0), P -> 10; P (10 > 5), O -> 6; P again (10 > 6), O -> 7 ...
      const s = game(2805, R(0, 10, 0, 5, 1, 0));
      eq('overtaking grants the next turn; streaks are possible', turns(s, 5), [O, P, P, P, P]);
      eq('...the turn number still counts every turn', s.turn, 5);
      check('...the streaking player gains a point every turn', s.players.Player.ap.length === 4);
    }
    {
      // P D2 S1 A0, O D3 S1 A0: O (3>2), P -> 3 (tie) -> P (the player who did not have the last turn), O -> 4 -> O, P -> 4 (tie) -> P ...
      const s = game(2806, R(2, 1, 0, 3, 1, 0));
      eq('a tie later goes to the player who did not have the last turn', turns(s, 4), [O, P, O, P]);
    }
    {
      eq('a Distance tie goes to the greater Speed (no coin toss)', game(2808, R(4, 3, 1, 4, 2, 9)).active, P);
      eq('...a Speed tie too goes to the greater Acceleration', game(2809, R(4, 2, 1, 4, 2, 3)).active, O);
      // P D4 S2 A0, O D4 S1 A0: P first (speed); O -> 5; O (5>4); P -> 6; P (6>5); O -> 6: tie D6, speed P2 > O1 -> P keeps the turn
      eq('a later tie breaks on Speed before the last-turn rule', turns(game(2811, R(4, 2, 0, 4, 1, 0)), 4), [
        P,
        O,
        P,
        P,
      ]);
    }
    {
      const s = game(2807, R(3, 3, 3, 3, 2, 2)),
        proj = Sim.turnOrder(s, 10);
      eq(
        'the projection lists the current turn first, with its number',
        [proj.length, proj[0], proj[9].turn],
        [10, { turn: 1, player: s.active }, 10]
      );
      eq(
        '...and the real game follows it turn by turn',
        turns(s, 10),
        proj.map(t => t.player)
      );
      check(
        '...the projection does not change the race',
        JSON.stringify(Sim.turnOrder(s, 5)) === JSON.stringify(Sim.turnOrder(s, 5))
      );
    }
    {
      const s = game(2808, R(0, 1, 0, 5, 1, 0)),
        before = Sim.turnOrder(s, 6).map(t => t.player);
      Sim.addStatus(s, s.players.Player, { kind: 'race', stat: 'speed', amount: 10, srcName: 'test' });
      const after = Sim.turnOrder(s, 6).map(t => t.player);
      // before: P creeps 1 a turn (O keeps the turn until P catches up); after +10 speed: P overtakes on turn 2 and keeps going
      eq(
        'a speed change recomputes the projection',
        [before, after],
        [
          [O, O, O, O, O, P],
          [O, O, P, P, P, P],
        ]
      );
      eq('...Sim.raceOf folds the status (base speed stays 1)', [Sim.raceOf(s, P).speed, s.race.Player.speed], [11, 1]);
      eq('...and the turns follow the new projection', turns(s, 6), after);
      const o = Sim.observe(s, O);
      eq('the race is public (observe)', o.race.Player.speed, 11);
    }
    {
      const s = game(2809, R(0, 1, 0, 5, 1, 0));
      Sim.addStatus(s, s.players.Opponent, { kind: 'race', stat: 'distance', set: 0, srcName: 'test' });
      eq('a `set` race status replaces the value', Sim.raceOf(s, O).distance, 0);
    }
    if (typeof AvatarLogic !== 'undefined') {
      const cat = AvatarLogic.normalizeCatalog(
        {
          characters: [
            {
              id: 'a',
              name: 'A',
              outfits: [
                { id: 'x', name: 'X', stats: { initialDistance: 3, speed: 2, acceleration: 1 } },
                { id: 'y', name: 'Y', stats: { speed: 2 } },
              ],
            },
          ],
        },
        AvatarLogic.normalizeStats({
          stats: ['initialDistance', 'speed', 'acceleration'].map(id => ({ id, name: id, icon: '' })),
        })
      );
      eq(
        "AvatarLogic.raceOf: each seat's outfit stats as the Sim's race",
        AvatarLogic.raceOf(cat, { Player: { character: 'a', outfit: 'x' }, Opponent: { character: 'a', outfit: 'x' } }),
        R(3, 2, 1, 3, 2, 1)
      );
      eq(
        '...null when a seat has no avatar or a value is missing',
        [
          AvatarLogic.raceOf(cat, { Player: { character: 'a', outfit: 'x' }, Opponent: null }),
          AvatarLogic.raceOf(cat, {
            Player: { character: 'a', outfit: 'x' },
            Opponent: { character: 'a', outfit: 'y' },
          }),
        ],
        [null, null]
      );
    }
  });
})();

// 21-patch9.js - Patch9: Shark's second combat with the stops on, the "attacking" animation category, the hand scroll spread,
// the side view sword settings, the board config defaults.
// Run only these: node tests/run.js --only p9-
(function () {
  const { D, check, eq, start, take } = Tests.ctx;
  const L = Anim3DLogic;
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const ALL = {
    turnStart: true,
    draw: true,
    mainStart: true,
    mainEnd: true,
    combatStart: true,
    combatEnd: true,
    stack: true,
    end: true,
  };
  const passAll = s => {
    for (let i = 0; i < 12 && !s.choice && (s.stack.length || s.respond); i++)
      D(s, { type: 'Pass', player: s.priority });
  };

  Tests.add('p9-shark-second-combat-stops', () => {
    const s = start(901);
    s.stops = { Player: { opp: ALL, own: ALL }, Opponent: { opp: ALL, own: ALL } }; // every stop on, like a real game
    take(s, 'Player', 'shark', 'board', 'Player|front|0');
    const wf = take(s, 'Player', 'wolf', 'board', 'Player|front|1'),
      oh = s.piles.Opponent.hand.length;
    passAll(s);
    D(s, { type: 'SetAttackPhase', player: 'Player', on: true });
    passAll(s);
    D(s, { type: 'Attack', player: 'Player', iid: wf.iid });
    passAll(s);
    D(s, { type: 'SetAttackPhase', player: 'Player', on: false });
    eq(
      'combat ended: Shark trigger on the stack, the combat-ended window open',
      [s.stack.length, s.respond && s.respond.kind],
      [1, 'combatEnd']
    );
    passAll(s);
    check('the trigger asks for its mode', !!s.choice);
    D(s, { type: 'Choose', player: 'Player', option: '0' });
    eq(
      'second combat: opponent drew 5, attack phase on, the turn order shows combat, the old combat-ended window is closed',
      [s.piles.Opponent.hand.length - oh, s.attackPhase, s.step, (s.respond && s.respond.kind) === 'combatEnd'],
      [5, true, 'combat', false]
    );
    passAll(s);
    eq(
      '...the turn player has priority in the second combat',
      [s.priority, s.attackPhase, s.step],
      ['Player', true, 'combat']
    );
    const r = D(s, { type: 'Attack', player: 'Player', iid: wf.iid });
    check('...and the Wolf can attack again', r.ok);
  });

  Tests.add('p9-attacking-category', () => {
    check('"attacking" is an animation category', L.CATEGORIES.includes('attacking'));
    check('...it loops until the attack resolves or is gone', !!L.LOOPING.attacking);
    const ch = L.normalizeCharacters({
      characters: { a: { animations: { attacking: [{ id: 'x', file: 'f.glb' }] } } },
      cards: { wolf: 'a' },
    });
    eq(
      '...a character may give clips for it',
      [ch.errors, ch.characters.a.animations.attacking[0].loop],
      [[], 'repeat']
    );
  });

  Tests.add('p9-hand-scroll', () => {
    const fit = L.scrollSpread(3, 10, 1.5, 0.5, 4);
    eq('a hand that fits: centred, normal spacing, no scroll', [fit.xs, fit.max, fit.s], [[-1.5, 0, 1.5], 0, 0]);
    const tight = L.scrollSpread(9, 4, 1.5, 0.4, 0);
    check('a bigger hand squeezes up to the minimum spacing', near(tight.xs[1] - tight.xs[0], 0.5) && tight.max === 0);
    const big = L.scrollSpread(21, 4, 1.5, 0.4, 0);
    check('a huge hand keeps the minimum spacing and can scroll', near(big.xs[1] - big.xs[0], 0.4) && big.max > 0);
    check('...scrolled to the start: the first card at the left edge', near(big.xs[0], -2));
    const end = L.scrollSpread(21, 4, 1.5, 0.4, 1e9);
    check(
      '...scrolled to the end (clamped): the last card at the right edge',
      near(end.s, end.max) && near(end.xs[20], 2)
    );
    eq('...scrolling never goes below 0', L.scrollSpread(21, 4, 1.5, 0.4, -5).s, 0);
    eq('one card / no card', [L.scrollSpread(1, 4, 1.5, 0.4, 3).xs, L.scrollSpread(0, 4, 1.5, 0.4, 0).xs], [[0], []]);
  });

  Tests.add('p9-board-config', () => {
    const b = L.normalizeBoard({}),
      lay = L.boardLayout(b);
    eq(
      'defaults: 2 x 2 m zones, 1 m between rows, 4 m between the front rows',
      [lay.zone.width, lay.zone.depth, lay.zBack - lay.zFront - 2, 2 * lay.zFront - 2],
      [2, 2, 1, 4]
    );
    eq('side view sword defaults', [b.sword.scale > 1, b.sword.height > 1, b.sword.flash], [true, true, true]);
    const w = L.normalizeBoard({ sword: { scale: 3, height: 2, flash: false } }).sword;
    eq('the sword settings follow the config', [w.scale, w.height, w.flash], [3, 2, false]);
    const bad = L.normalizeBoard({ sword: { scale: 'x', height: -1 } }).sword;
    check('bad sword values fall back to the defaults', bad.scale === b.sword.scale && bad.height >= 0);
    if (typeof readRepoFile !== 'function')
      return check('(browser: shipped config files are checked by node tests/run.js)', true);
    const f = L.boardLayout(L.normalizeBoard(JSON.parse(readRepoFile('config/board3d.json'))));
    check('config/board3d.json loads (its values are yours to change)', f.zone.width > 0 && f.zFront > 0);
  });
})();

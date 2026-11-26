// 30-duplicate.js - the Duplicate keyword (permanent mode) and Shield Army.
// Duplicate N on a creature / enchantment: a keyworded enter trigger (on the stack, its HP = the card's HP) that creates N token copies
// of the card on free zones of the controller's row, picked by the controller; fewer free zones = fewer tokens; copies have no Duplicate.
// Run only these: node tests/run.js --only duplicate
(function () {
  const { D, check, eq, start, take, drain } = Tests.ctx;
  const armies = (s, o) =>
    Object.values(s.cards).filter(c => c.loc === 'board' && c.owner === o && c.def.name === 'Shield Army');

  Tests.add('duplicate-text', () => {
    const d = Cards.list.find(x => x.id === 'shieldarmy'),
      t = d.triggers[0],
      tok = d.tokens.duplicate;
    eq('Shield Army is a 0/10 creature', [d.type, d.atk, d.hp], ['creature', 0, 10]);
    check(
      'Duplicate 2 is a keyworded trigger whose Stack HP is the card HP',
      t.kw === 'duplicate' && t.n === 2 && t.hp === 10
    );
    check('Its text names the keyword and the count', /^Duplicate 2 \(/.test(t.text));
    check(
      'The token copy is Shield Army without Duplicate',
      tok.isToken && tok.name === 'Shield Army' && tok.atk === 0 && tok.hp === 10 && !(tok.triggers || []).length
    );
  });

  Tests.add('duplicate-play', () => {
    {
      const s = start(3001),
        sa = take(s, 'Player', 'shieldarmy', 'hand');
      take(s, 'Player', 'soldier', 'board', 'Player|front|0');
      D(s, { type: 'PlayCard', iid: sa.iid, slot: 'Player|front|2' });
      const top = s.stack[s.stack.length - 1];
      check('Duplicate goes on the stack with 10 HP', top && top.hp === 10);
      drain(s);
      eq(
        'The controller picks a free zone of their front row',
        [s.choice && s.choice.kind, s.choice && s.choice.player, s.choice && s.choice.options],
        ['place', 'Player', ['Player|front|1', 'Player|front|3', 'Player|front|4']]
      );
      D(s, { type: 'Choose', player: 'Player', option: 'Player|front|4' });
      drain(s);
      eq('Then the second copy, among the zones still free', s.choice && s.choice.options, [
        'Player|front|1',
        'Player|front|3',
      ]);
      D(s, { type: 'Choose', player: 'Player', option: 'Player|front|1' });
      drain(s);
      const a = armies(s, 'Player');
      eq(
        'Two token copies entered where picked',
        a
          .filter(c => c.token)
          .map(c => c.slot)
          .sort(),
        ['Player|front|1', 'Player|front|4']
      );
      check(
        'The copies have no Duplicate: nothing more on the stack, no choice',
        !s.stack.length && !s.choice && a.length === 3
      );
    }
    {
      const s = start(3002),
        sa = take(s, 'Player', 'shieldarmy', 'hand');
      ['soldier', 'knight', 'giant'].forEach((id, i) => take(s, 'Player', id, 'board', 'Player|front|' + i));
      D(s, { type: 'PlayCard', iid: sa.iid, slot: 'Player|front|3' });
      drain(s);
      eq(
        'One free zone: one token, placed by itself',
        armies(s, 'Player')
          .map(c => c.slot)
          .sort(),
        ['Player|front|3', 'Player|front|4']
      );
    }
    {
      const s = start(3003),
        sa = take(s, 'Player', 'shieldarmy', 'hand');
      ['soldier', 'knight', 'giant', 'wolf'].forEach((id, i) => take(s, 'Player', id, 'board', 'Player|front|' + i));
      D(s, { type: 'PlayCard', iid: sa.iid, slot: 'Player|front|4' });
      drain(s);
      check('No free zone: no token', armies(s, 'Player').length === 1 && !s.choice);
    }
  });

  Tests.add('duplicate-any-entry', () => {
    // Duplicate (permanent mode) triggers whenever the card enters, not only when it is played
    // (War Drum's paid enter trigger summons Shield Army from the graveyard)
    const s = start(3004),
      sa = take(s, 'Player', 'shieldarmy', 'gy'),
      wd = take(s, 'Player', 'wardrum', 'hand');
    ['soldier', 'knight'].forEach((id, i) => take(s, 'Player', id, 'board', 'Player|front|' + i));
    D(s, { type: 'PlayCard', iid: wd.iid, slot: 'Player|back|1', extra: true });
    drain(s);
    D(s, { type: 'Choose', player: 'Player', option: 'Player|front|2' }); // the Drummer token
    drain(s);
    D(s, { type: 'Choose', player: 'Player', option: sa.iid });
    D(s, { type: 'Choose', player: 'Player', option: 'Player|front|3' });
    drain(s);
    eq(
      'Put into play by an effect: Duplicate still makes its copy',
      armies(s, 'Player')
        .map(c => c.slot)
        .sort(),
      ['Player|front|3', 'Player|front|4']
    );
  });
})();

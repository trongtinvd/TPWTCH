// bot-match-ui.js - the Bot vs Bot start panel (main menu), its end summary, and Export log (any game: log panel, result window,
// replay bar). A match is played headless first (BotMatch.run, js/game/bot-match.js), then opened in the replay viewer: watched with
// the animations, or with "Skip presentation" jumped straight to the end.
function saveFile(name, text, type) {
  const a = mkEl('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}
const fileStamp = () => {
  const d = new Date(),
    z = n => String(n).padStart(2, '0');
  return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes());
};
// Export log: the debug log of the whole game (js/log/debuglog.js) as .txt (to read) or .json (the record and every entry, for tools)
function exportDialog() {
  const rec = Replays.currentRec();
  if (!rec || !rec.cmds.length) {
    ui.note = 'Nothing to export yet';
    sync();
    return;
  }
  const have = { entries: GameLog.entries(), state: sim },
    base = 'tpwtch-' + (rec.kind || rec.mode || 'game') + '-seed' + rec.n + '-' + fileStamp(),
    extra = { date: new Date().toISOString() };
  modal((box, close, cancel) => {
    box.appendChild(mkEl('h2')).textContent = 'Export log';
    box.appendChild(mkEl('p', 'mmsg')).textContent =
      'The debug log of the whole game (' +
      rec.cmds.length +
      ' commands): the state before each command, the command and who sent it, the bot decisions, every rule event with its fields and what changed. It shows all hidden information.';
    const row = mkEl('div', 'mrow'),
      go = (ext, type, make) => () => {
        try {
          saveFile(base + ext, make(rec, extra, have), type);
          close();
        } catch (e) {
          console.error(e);
          box.appendChild(mkEl('p', 'mmsg')).textContent = 'Export failed: ' + e.message;
        }
      };
    row.append(
      mkBtn('Text (.txt)', go('.txt', 'text/plain', DebugLog.exportText), 'c-go'),
      mkBtn('JSON (.json)', go('.json', 'application/json', DebugLog.exportJSON)),
      mkBtn('Cancel', cancel, 'c-pass')
    );
    box.appendChild(row);
  });
}
const BotMatchUI = (function () {
  let cfg = null; // the last match's settings ("Run again")
  const last = () =>
    Object.assign(
      {
        p1: BUILTIN_DECKS[0].name,
        p2: BUILTIN_DECKS[1].name,
        bot1: 'random',
        bot2: 'random',
        seed: '',
        skip: false,
        shuffle: true,
        strikeBack: false,
        startHand: 5,
        drawPhase: 1,
        drawAction: 2,
        life: 20,
      },
      Settings.get('lastBotMatch') || {}
    );
  function run(c, seed) {
    // plays the match headless, then opens it in the replay viewer
    cfg = c;
    const deck = n => DeckStore.find(n) || BUILTIN_DECKS[0],
      rec = BotMatch.record({
        seed,
        bots: { Player: c.bot1, Opponent: c.bot2 },
        d1: deck(c.p1).cards,
        d2: deck(c.p2).cards,
        x1: deck(c.p1).extra || [],
        x2: deck(c.p2).extra || [],
        a: c.p1,
        b: c.p2,
        sh: c.shuffle,
        rules: gameRules(c),
        stops: STOPS_ON, // every stop on: the bots pass through every priority window (more of the rules get played)
      }),
      m = BotMatch.run(rec);
    MenuUI.away = false;
    MenuUI.hide();
    Replays.start(m.rec);
    if (c.skip) Replays.jumpEnd();
    else Replays.play();
  }
  function open() {
    const L = last(),
      decks = DeckStore.list(),
      names = decks.map(d => d.name);
    modal((box, close, cancel) => {
      box.appendChild(mkEl('h2')).textContent = 'Bot vs Bot';
      const field = (label, el, host = box) => {
        const w = mkEl('label', 'mfield');
        w.appendChild(mkEl('span')).textContent = label;
        w.appendChild(el);
        host.appendChild(w);
        return el;
      };
      const select = (opts, v) => {
        const s = mkEl('select', 'dctl');
        for (const [val, text, title] of opts) {
          const o = mkEl('option');
          o.value = val;
          o.textContent = text;
          if (title) o.title = title;
          s.appendChild(o);
        }
        s.value = opts.some(o => o[0] === v) ? v : opts[0][0];
        return s;
      };
      const deckOpts = decks.map(d => [d.name, d.name + ' (' + d.cards.length + ')']),
        botOpts = BOT_IDS.map(id => [id, BOTS[id].name, BOTS[id].note]);
      const s1 = field('Bot 1 deck', select(deckOpts, names.includes(L.p1) ? L.p1 : names[0])),
        b1 = field('Bot 1', select(botOpts, L.bot1)),
        s2 = field('Bot 2 deck', select(deckOpts, names.includes(L.p2) ? L.p2 : names[0])),
        b2 = field('Bot 2', select(botOpts, L.bot2));
      // the seed: the game (deck shuffles) and both bots follow it, so the same seed plays the same match again
      const sw = mkEl('div', 'mfield'),
        si = mkEl('input', 'dctl');
      sw.appendChild(mkEl('span')).textContent = 'Seed (empty = random)';
      si.type = 'number';
      si.min = 1;
      si.step = 1;
      si.value = L.seed;
      si.placeholder = 'random';
      const dice = mkBtn('Random', () => (si.value = newSeed())),
        line = mkEl('div');
      line.style.cssText = 'display:flex;gap:6px';
      si.style.flex = '1';
      line.append(si, dice);
      sw.appendChild(line);
      box.appendChild(sw);
      const grid = box.appendChild(mkEl('div', 'mgrid')),
        num = (label, v, min, max) => {
          const i = mkEl('input', 'dctl');
          i.type = 'number';
          i.min = min;
          i.max = max;
          i.step = 1;
          i.value = v;
          return field(label, i, grid);
        },
        gh = num('Cards at the start', L.startHand, 0, 40),
        gd = num('Cards per draw phase', L.drawPhase, 0, 10),
        ga = num('Cards per Draw action', L.drawAction, 0, 10),
        gl = num('Starting HP', L.life, 0, 999);
      const check = (text, v, title) => {
        const w = mkEl('label', 'mcheck'),
          cb = mkEl('input');
        cb.type = 'checkbox';
        cb.checked = !!v;
        if (title) w.title = title;
        w.append(cb, document.createTextNode(' ' + text));
        box.appendChild(w);
        return cb;
      };
      const sk = check(
          'Skip presentation (no animations: jump to the end)',
          L.skip,
          'The match is played at once and opened at its last command; Step back and the log still work.'
        ),
        sh = check('Shuffle the decks at the start', L.shuffle),
        kb = check('Defender strike back', L.strikeBack);
      const int = (el, d, min, max) => {
        const v = Math.floor(+el.value);
        return isFinite(v) && el.value !== '' ? Math.max(min, Math.min(max, v)) : d;
      };
      const row = mkEl('div', 'mrow');
      row.append(
        mkBtn(
          'Start',
          () => {
            const c = {
              p1: s1.value,
              p2: s2.value,
              bot1: b1.value,
              bot2: b2.value,
              seed: si.value.trim(),
              skip: sk.checked,
              shuffle: sh.checked,
              strikeBack: kb.checked,
              startHand: int(gh, 5, 0, 40),
              drawPhase: int(gd, 1, 0, 10),
              drawAction: int(ga, 2, 0, 10),
              life: int(gl, 20, 0, 999),
            };
            Settings.set('lastBotMatch', c);
            close();
            run(c, c.seed ? int(si, 1, 1, 4294967295) : newSeed());
          },
          'c-go'
        ),
        mkBtn('Cancel', cancel, 'c-pass')
      );
      box.appendChild(row);
    });
  }
  // the match reached its end: the summary (Export, Save replay, Watch from the start, Run again, Main menu); closing it keeps the viewer
  function finished() {
    const rec = rp.rec,
      bb = rec.bb;
    modal((box, close, cancel) => {
      box.appendChild(mkEl('h2')).textContent = 'Bot vs Bot finished';
      const r = sim.result,
        L = [
          r
            ? Result.text(r)
            : 'Not decided (' +
              ({ max: 'command limit reached', stuck: 'a bot had no legal command' }[rec.end] || 'stopped') +
              ')',
          'Bot 1: ' + botName(bb.bots.Player) + ' · ' + rec.a,
          'Bot 2: ' + botName(bb.bots.Opponent) + ' · ' + rec.b,
          'Seed ' + bb.seed + ' · turn ' + sim.turn + ' · ' + rec.cmds.length + ' commands',
        ];
      for (const t of L) box.appendChild(mkEl('p', 'mmsg')).textContent = t;
      const msg = mkEl('p', 'mmsg');
      const row = mkEl('div', 'mrow'),
        row2 = mkEl('div', 'mrow');
      row.append(
        mkBtn(
          'Export log',
          () => {
            close();
            exportDialog();
          },
          'c-go'
        ),
        mkBtn('Save replay', e => {
          Replays.saveRecord(rec, sim)
            .catch(() => false)
            .then(ok => {
              msg.textContent = ok ? 'Saved to Replays (the newest 5 are kept).' : 'Could not save (storage full?)';
              e.target.disabled = !!ok;
            });
        }),
        mkBtn('Watch from start', () => {
          close();
          Replays.restart();
          Replays.play();
        })
      );
      row2.append(
        mkBtn(
          'Run again (new seed)',
          () => {
            close();
            run(Object.assign({}, cfg || last()), newSeed());
          },
          'c-go'
        ),
        mkBtn('Close', cancel, 'c-pass'),
        mkBtn(
          'Main menu',
          () => {
            close();
            rp.on = false;
            Replays.bar(false);
            MenuUI.show();
          },
          'c-exit'
        )
      );
      box.append(row, row2, msg);
    });
  }
  return { open, finished, run };
})();

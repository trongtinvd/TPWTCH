#!/usr/bin/env python3
"""Patch 3.py - run from the repo root:  python "Patches/Patch 3.py"

 1. Deck editor: Delete button (saved decks only).
 2. Deck editor: filters (type, in deck / not in deck, "Only matches" for the search box).
 3. Bug: a permanent that dies the moment it enters (War Drum vs War Drum) still gets its enter triggers.
    Enter triggers are now queued BEFORE the state-based death check.
 4. King Eye: effects that count the foe's creatures (Parasite modes, draw-per-creature) ignore creatures under a cloud.
 5. Parasite / pick effects: every zone under a cloud is a legal pick (empty or not); a card under a cloud is never offered by
    itself; an empty or red-shielded pick fizzles and reveals nothing. Clouds over legal picks glow.
 6. ChatGPT findings: (a) Repeat waits for choices and continuation frames keep `zone`; (b) the validator checks trigger `cond`,
    the runtime fails closed on an unknown cond; (c) CI runs `node tests/run.js` before deploying.
 7. Phone: drag the inspector's bottom border / the bottom panels' top border; sizes kept in a cookie (js/layout.js).
 8. Duel replays: commands + seed + decks, saved to cookies when a duel is left (newest 5), played back from the main menu (js/replay.js).

Safety: every pattern must match exactly the expected number of times, otherwise NOTHING is written. The test output is recorded
before; afterwards every old check must still pass, no new FAIL may appear, otherwise everything is restored. Nothing is committed.
"""
import json, os, re, shutil, subprocess, sys

ROOT = os.getcwd()
p = lambda *a: os.path.join(ROOT, *a)
NODE = shutil.which('node')
log, files, EOL, errors = [], {}, {}, []


def die(msg):
    print('ABORT: ' + msg)
    sys.exit(1)


def read(rel):
    with open(p(rel), encoding='utf-8', newline='') as f:
        raw = f.read()
    EOL[rel] = '\r\n' if '\r\n' in raw else '\n'
    return raw.replace('\r\n', '\n')


def cur(rel):
    return files[rel] if rel in files else read(rel)


def write(rel, text):
    os.makedirs(os.path.dirname(p(rel)), exist_ok=True)
    eol = EOL.get(rel) or EOL.get('js/game-host.js') or '\n'
    with open(p(rel), 'w', encoding='utf-8', newline='') as f:
        f.write(text.replace('\n', eol))


def rep(rel, old, new, desc, count=1):
    """exact-text edit; a pattern that does not match exactly `count` times is an error and nothing gets written"""
    if not os.path.exists(p(rel)):
        errors.append(f'{desc}: {rel} not found')
        return
    t = cur(rel)
    n = t.count(old)
    if n != count:
        errors.append(f'{desc}: {n} matches in {rel}, expected {count}')
        return
    files[rel] = t.replace(old, new)
    log.append('ok  ' + desc)


def append(rel, text, desc):
    if not os.path.exists(p(rel)):
        errors.append(f'{desc}: {rel} not found')
        return
    files[rel] = cur(rel).rstrip('\n') + '\n' + text
    log.append('ok  ' + desc)


newfiles = {}


def run_tests():
    r = subprocess.run([NODE, 'tests/run.js', '--json'], cwd=ROOT, capture_output=True, text=True)
    lines = r.stdout.strip().splitlines()
    if r.returncode not in (0, 1) or not lines:
        return None, r.stderr
    return json.loads(lines[-1]), r.stderr


# ---------------------------------------------------------------- preconditions
if not NODE:
    die('node is required')
for f in ['js/sim/state.js', 'js/sim/ops.js', 'js/game-host.js', 'tests/selftest.js', 'index.html']:
    if not os.path.exists(p(f)):
        die(f'{f} not found: run this from the repo root')
read('js/game-host.js')  # default line endings for new files
base, err = run_tests()
if base is None:
    die('could not run the existing tests:\n' + err)
print(f'baseline: {sum(l.startswith(("PASS", "FAIL")) for l in base)} checks, {sum(l.startswith("FAIL") for l in base)} failing already')

# ================================================================ 3. enter triggers are queued before the death check
S = 'js/sim/state.js'
rep(S, r"""    ev.push({ t: 'PermanentSummoned', iid: t.iid, slot });
    recalc(s, ev);
    fire(s, ev, 'enter', t);""", r"""    ev.push({ t: 'PermanentSummoned', iid: t.iid, slot });
    fire(s, ev, 'enter', t); // queued BEFORE the state-based check: a permanent that dies on entering still has its enter triggers
    recalc(s, ev);""", 'state: enterBoard queues enter triggers before recalc')
rep(S, r"""    ev.push({ t: 'PermanentSummoned', iid: t.iid, slot: zone });
    recalc(s, ev);
    fire(s, ev, 'enter', t);""", r"""    ev.push({ t: 'PermanentSummoned', iid: t.iid, slot: zone });
    fire(s, ev, 'enter', t);
    recalc(s, ev);""", 'state: makeToken queues enter triggers before recalc')
rep('js/sim/ops.js', r"""      x.ev.push({ t: 'PermanentSummoned', iid: t.iid, slot: x.zone });
      recalc(x.s, x.ev);
      fire(x.s, x.ev, 'enter', t);""", r"""      x.ev.push({ t: 'PermanentSummoned', iid: t.iid, slot: x.zone });
      fire(x.s, x.ev, 'enter', t);
      recalc(x.s, x.ev);""", 'ops: CreateToken queues enter triggers before recalc')
rep('js/sim/dispatch.js', r"""          ev.push({ t: 'PermanentSummoned', iid: c.iid, slot: cmd.slot });
          recalc(s, ev);
          fire(s, ev, 'enter', c);""", r"""          ev.push({ t: 'PermanentSummoned', iid: c.iid, slot: cmd.slot });
          fire(s, ev, 'enter', c); // before recalc: War Drum answered by War Drum kills both, both triggers still happen
          recalc(s, ev);""", 'dispatch: PlayCard queues enter triggers before recalc')

# ================================================================ 4 + 5. King Eye: counts and picks
F = 'js/sim/fx.js'
rep(F, r"""  let freeSlots; // state""", r"""  let cloudMap, freeSlots; // state""", 'fx: import cloudMap')
rep(F, r"""    needs: ['OPS', 'cname', 'dmgs', 'freeSlots', 'removeStatus'],""", r"""    needs: ['OPS', 'cloudMap', 'cname', 'dmgs', 'freeSlots', 'removeStatus'],""", 'fx: needs cloudMap')
rep(F, r"""      ({ OPS, cname, dmgs, freeSlots, removeStatus } = K);""", r"""      ({ OPS, cloudMap, cname, dmgs, freeSlots, removeStatus } = K);""", 'fx: link cloudMap')
rep(F, r"""  const foeCreatures = x =>
    Object.values(x.s.cards).filter(c => c.loc === 'board' && c.def.type === 'creature' && c.owner !== x.who).length;""", r"""  const foeCreatures = x => {
    const m = cloudMap(x.s); // a creature under a cloud is not seen: next to a King Eye the foe sees ONE creature (King Eye itself)
    return Object.values(x.s.cards).filter(
      c => c.loc === 'board' && c.def.type === 'creature' && c.owner !== x.who && !m[c.slot]
    ).length;
  };""", 'fx: foeCreatures ignores creatures under a cloud')

O = 'js/sim/ops.js'
rep(O, r"""  let destroy, freeSlots, makeToken, recalc; // state""", r"""  let cloudMap, destroy, freeSlots, makeToken, recalc; // state""", 'ops: import cloudMap')
rep(O, r"""      'cname',
      'colKeys',""", r"""      'cloudMap',
      'cname',
      'colKeys',""", 'ops: needs cloudMap')
rep(O, r"""        cname,
        colKeys,""", r"""        cloudMap,
        cname,
        colKeys,""", 'ops: link cloudMap')
rep(O, r"""  const OPS = {
    // effect handlers""", r"""  // Board picks for the player x.who. A card under an enemy cloud is never offered by itself: its ZONE is ('Z:slot'), empty or not,
  // so the picker learns nothing about what is underneath. Elsewhere a card is offered unless it has a red shield.
  const boardPicks = (x, foeOnly) => {
    const s = x.s,
      m = cloudMap(s),
      out = [];
    for (const k of Object.keys(s.slots)) {
      if (s.unusable[k]) continue;
      const own = k.split('|')[0] === x.who;
      if (foeOnly && own) continue;
      if (m[k] && !own) {
        out.push('Z:' + k);
        continue;
      }
      const c = s.slots[k] && s.cards[s.slots[k]];
      if (c && !has(c, 'red')) out.push(c.iid);
    }
    return out;
  };
  const OPS = {
    // effect handlers""", 'ops: boardPicks helper')
rep(O, r"""            ? cs.filter(c => c.loc === 'board' && !mine(c) && !has(c, 'red')).map(c => c.iid)
            : e.from === 'anyTarget'
              ? cs
                  .filter(c => c.loc === 'board' && !has(c, 'red'))
                  .map(c => c.iid)
                  .concat(['P:Player', 'P:Opponent'])
              : e.from === 'myGYCreatures'""", r"""            ? boardPicks(x, true)
            : e.from === 'anyTarget'
              ? boardPicks(x, false).concat(['P:Player', 'P:Opponent'])
              : e.from === 'myGYCreatures'""", 'ops: PickCard foeBoard / anyTarget use boardPicks')

C = 'js/sim/ch.js'
rep(C, r"""  let addStatus, hurt, live, removeStatus; // statuses""", r"""  let addStatus, has, hurt, live, removeStatus; // statuses""", 'ch: import has')
rep(C, r"""      'freeSlots',
      'hurt',
      'live',""", r"""      'freeSlots',
      'has',
      'hurt',
      'live',""", 'ch: needs has')
rep(C, r"""        freeSlots,
        hurt,
        live,""", r"""        freeSlots,
        has,
        hurt,
        live,""", 'ch: link has')
rep(C, r"""      } else THEN[k.then](s, k.player, c, s.cards[cmd.option], k, ev);
    },""", r"""      } else if (cmd.option.startsWith('Z:')) {
        // a zone under a cloud was picked: only what is REALLY there is affected; an empty (or red-shielded) zone fizzles and reveals nothing
        const id = s.slots[cmd.option.slice(2)],
          t = id && s.cards[id];
        if (t && t.loc === 'board' && !has(t, 'red')) THEN[k.then](s, k.player, c, t, k, ev);
      } else THEN[k.then](s, k.player, c, s.cards[cmd.option], k, ev);
    },""", 'ch: pick answers a cloud zone')

rep('js/board.js', r"""  cloudOwn = new THREE.MeshBasicMaterial({ color: 0x07070c, transparent: true, opacity: 0.4, depthWrite: false }),
  clouds = {};""", r"""  cloudOwn = new THREE.MeshBasicMaterial({ color: 0x07070c, transparent: true, opacity: 0.4, depthWrite: false }),
  cloudHot = new THREE.MeshBasicMaterial({ color: 0x16402a }), // an enemy cloud over a legal target / pick glows green
  clouds = {};""", 'board: cloudHot material')
V = 'js/view-sync.js'
rep(V, r"""          ? ch.options.map(i => game.cards[i] && game.cards[i].slot).filter(Boolean)""", r"""          ? ch.options.map(i => (i.startsWith('Z:') ? i.slice(2) : game.cards[i] && game.cards[i].slot)).filter(Boolean)""", 'view-sync: cloud zone picks are highlighted')
rep(V, r"""    z.userData.hoverEm = cur ? 0xc99a2a : 0;
    applyEm(z);
  });
  zones.forEach(z => {
    const dead""", r"""    z.userData.hoverEm = cur ? 0xc99a2a : 0;
    applyEm(z);
  });
  for (const k in clouds)
    if (clouds[k].visible && k.split('|')[0] !== ui.view && valid.includes(slotZones[k])) clouds[k].material = cloudHot; // the clouds are legal targets: they light up too
  zones.forEach(z => {
    const dead""", 'view-sync: clouds over legal targets glow')
rep('js/input.js', r"""            ? ['damage', 'pick', 'swap'].includes(k.kind)
              ? u.card
                ? u.card.iid
                : occ
              : null""", r"""            ? ['damage', 'pick', 'swap'].includes(k.kind)
              ? u.slotKey && k.options.includes('Z:' + u.slotKey)
                ? 'Z:' + u.slotKey
                : u.card
                  ? u.card.iid
                  : occ
              : null""", 'input: clicking a cloud zone answers a Z: pick')

# ================================================================ 6a. Repeat + continuation frames
rep(F, r"""  const runFx = (x, list) => {
""", r"""  // a continuation frame = the rest of an effect list plus the context it needs; EVERY field an op may have set on x belongs here (zone: NearestZone)
  const frameOf = (x, rest) => ({
    rest,
    src: x.src.iid,
    who: x.who,
    foe: x.foe,
    col: x.col,
    tp: x.tp,
    zone: x.zone,
    t: x.t && x.t.iid,
    o: x.o && { tsid: x.o.tsid },
  });
  const suspend = (x, rest) => {
    (x.s.choice.cont = x.s.choice.cont || []).push(frameOf(x, rest));
  }; // call right after an op opened a choice: the answer resumes `rest`
  const runFx = (x, list) => {
""", 'fx: frameOf / suspend helpers')
rep(F, r"""        (x.s.choice.cont = x.s.choice.cont || []).push({
          rest: list.slice(i + 1),
          src: x.src.iid,
          who: x.who,
          foe: x.foe,
          col: x.col,
          tp: x.tp,
          t: x.t && x.t.iid,
          o: x.o && { tsid: x.o.tsid },
        });
        return;""", r"""        suspend(x, list.slice(i + 1));
        return;""", 'fx: runFx uses suspend')
rep(F, r"""          tp: f.tp,
          t: f.t ? s.cards[f.t] : null,""", r"""          tp: f.tp,
          zone: f.zone,
          t: f.t ? s.cards[f.t] : null,""", 'fx: resume restores zone')
rep(F, r"""    exports: { ask, askCounters, askDeck, foeCreatures, resume, runFx, upToAsk },""", r"""    exports: { ask, askCounters, askDeck, foeCreatures, resume, runFx, suspend, upToAsk },""", 'fx: export suspend')
rep(O, r"""  let ask, askCounters, askDeck, foeCreatures, runFx, upToAsk; // fx""", r"""  let ask, askCounters, askDeck, foeCreatures, runFx, suspend, upToAsk; // fx""", 'ops: import suspend')
rep(O, r"""      'runFx',
      'syncLife',""", r"""      'runFx',
      'suspend',
      'syncLife',""", 'ops: needs suspend')
rep(O, r"""        runFx,
        syncLife,""", r"""        runFx,
        suspend,
        syncLife,""", 'ops: link suspend')
rep(O, r"""    Repeat: (x, e) => {
      for (let i = 0; i < e.n; i++) runFx(x, e.effects);
    },""", r"""    Repeat: (x, e) => {
      for (let i = 0; i < e.n; i++) {
        runFx(x, e.effects);
        if (x.s.choice) {
          // an inner effect opened a choice: do NOT go on to the next repetition, resume with the remaining ones after the answer
          if (i < e.n - 1) suspend(x, [{ op: 'Repeat', n: e.n - i - 1, effects: e.effects }]);
          return;
        }
      }
    },""", 'ops: Repeat waits for choices')

# ================================================================ 6b. trigger conditions are validated
rep('js/sim/validate.js', r"""      A.triggers.includes(g.on) || bad.push(d.id + ': unknown trigger ' + g.on);""", r"""      A.triggers.includes(g.on) || bad.push(d.id + ': unknown trigger ' + g.on);
      if (g.cond && !A.conds.includes(g.cond)) bad.push(d.id + ': unknown condition ' + g.cond);""", 'validate: trigger cond')
rep('js/sim/index.js', r"""    triggers: K.TRIGGERS,
    passives: K.PASSIVES,
  };""", r"""    triggers: K.TRIGGERS,
    passives: K.PASSIVES,
    conds: K.COND,
  };""", 'index: Sim.API.conds')
rep('js/sim/stack.js', r"""        if (t.cond && !COND[t.cond](s, c, subject)) return;""", r"""        if (t.cond && !(COND[t.cond] && COND[t.cond](s, c, subject))) return; // an unknown condition fails closed (validate.js reports it at load)""", 'stack: fire fails closed on an unknown cond')

# ================================================================ 6c. CI runs the tests
rep('.github/workflows/static.yml', r"""jobs:
  # Single deploy job since we're just deploying
  deploy:
    environment:""", r"""jobs:
  # The headless rules tests run first: a failing check blocks the deploy
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Rules tests
        run: node tests/run.js
  # Single deploy job since we're just deploying
  deploy:
    needs: test
    environment:""", 'ci: test job before deploy')

# ================================================================ 1. + 2. deck editor
rep('js/decks.js', r"""    nameUsed: name => list().some(d => d.name === name),""", r"""    nameUsed: name => list().some(d => d.name === name),
    remove(name) {
      mem.delete(name);
      try {
        document.cookie = ckey(name) + '=; max-age=0; path=/; SameSite=Lax';
      } catch (e) {}
    },""", 'decks: DeckStore.remove')
rep('js/decks.js', r"""function rankCards(query, defs) {""", r"""function cardMatches(query, d) {
  // the 'Only matches' filter: the name contains the query, give or take a typo (one edit per four letters)
  const q = query.trim().toLowerCase();
  return !q || substringDist(q, d.name.toLowerCase()) <= Math.floor(q.length / 4);
}
function rankCards(query, defs) {""", 'decks: cardMatches')

D = 'js/deck-editor.js'
rep(D, r"""const S = { name: '', cards: [], loaded: null, saved: '', query: '', sel: null, key: '0', last: null };""", r"""const S = {
    name: '',
    cards: [],
    loaded: null,
    saved: '',
    query: '',
    sel: null,
    key: '0',
    last: null,
    fType: 'all',
    fIn: 'all',
    fOnly: false,
  };""", 'deck-editor: filter state')
rep(D, r"""    saveBtn,
    msg,""", r"""    saveBtn,
    delBtn,
    msg,""", 'deck-editor: delBtn variable')
rep(D, r"""  function renderList() {
    const st = list.scrollTop;""", r"""  const typeOk = d =>
    S.fType === 'all' ||
    (S.fType === 'quick' || S.fType === 'slow'
      ? d.type === 'spell' && String(d.timing).toLowerCase() === S.fType
      : d.type === S.fType);
  const cardList = () =>
    rankCards(S.query, DEFS).filter(
      d =>
        (!S.fOnly || cardMatches(S.query, d)) &&
        typeOk(d) &&
        (S.fIn === 'all' || S.cards.includes(d.id) === (S.fIn === 'in'))
    );
  function renderList() {
    const st = list.scrollTop;""", 'deck-editor: cardList (filters)')
rep(D, r"""      ...rankCards(S.query, DEFS).map(d => {""", r"""      ...cardList().map(d => {""", 'deck-editor: renderList uses cardList')
rep(D, r"""    saveBtn.disabled = !!p;""", r"""    saveBtn.disabled = !!p;
    delBtn.disabled = !(S.loaded && !S.loaded.builtin); // only a saved deck can be deleted""", 'deck-editor: delete enabled state')
rep(D, r"""  const discardOk = msg =>""", r"""  async function del() {
    const d = S.loaded;
    if (!d || d.builtin) return;
    if (!(await confirmBox('Delete the deck \u201c' + d.name + '\u201d? This cannot be undone.', 'Delete', 'Cancel'))) return;
    DeckStore.remove(d.name);
    S.last = null;
    load(DeckStore.list()[0], '0');
  }
  const discardOk = msg =>""", 'deck-editor: del()')
rep(D, r"""    saveBtn = mkBtn('Save', save, 'c-go');""", r"""    saveBtn = mkBtn('Save', save, 'c-go');
    delBtn = mkBtn('Delete', del, 'c-atk');""", 'deck-editor: Delete button')
rep(D, r"""    top.append(nameIn, saveBtn, selEl, msg);""", r"""    top.append(nameIn, saveBtn, delBtn, selEl, msg);""", 'deck-editor: Delete button in the top row')
rep(D, r"""    extra.replaceChildren(...Array.from({ length: 20 }, () => mkEl('div', 'de-cell empty')));""", r"""    const fl = mkEl('div', 'de-filters'),
      mkSel = (opts, key) => {
        const s = mkEl('select', 'dctl');
        for (const [v, t] of opts) {
          const o = mkEl('option');
          o.value = v;
          o.textContent = t;
          s.appendChild(o);
        }
        s.value = S[key];
        s.addEventListener('change', () => {
          S[key] = s.value;
          renderList();
        });
        return s;
      },
      only = mkEl('label', 'mcheck'),
      onlyCb = mkEl('input');
    onlyCb.type = 'checkbox';
    onlyCb.checked = S.fOnly;
    onlyCb.addEventListener('change', () => {
      S.fOnly = onlyCb.checked;
      renderList();
    });
    only.append(onlyCb, document.createTextNode(' Only matches'));
    fl.append(
      mkSel(
        [
          ['all', 'All types'],
          ['creature', 'Creatures'],
          ['enchantment', 'Enchantments'],
          ['quick', 'Quick spells'],
          ['slow', 'Slow spells'],
        ],
        'fType'
      ),
      mkSel(
        [
          ['all', 'In deck or not'],
          ['out', 'Not in deck'],
          ['in', 'In deck'],
        ],
        'fIn'
      ),
      only
    );
    search.after(fl);
    extra.replaceChildren(...Array.from({ length: 20 }, () => mkEl('div', 'de-cell empty')));""", 'deck-editor: filter row')
append('css/screens.css', r""".de-filters {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}
.de-filters .dctl {
  flex: 1 1 100px;
  padding: 5px 6px;
  font-size: 12px;
}
.rp-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 50vh;
  overflow: auto;
}
.rp-row {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
}
.rp-row span {
  flex: 1;
  min-width: 0;
}
.rp-row .abtn {
  padding: 5px 9px;
  font-size: 12px;
}""", 'screens.css: filters and replay list')

# ================================================================ 7. phone: resizable panels
newfiles['js/layout.js'] = r"""// layout.js - phone (portrait) layout: drag the bottom border of the inspector (top) and the top border of the stack / list panels (bottom)
// to resize them. The sizes (% of the screen height) are kept in a cookie.
(function () {
  const KEY = 'tpw_layout',
    LIM = [12, 50], // each panel: 12% to 50% of the screen height
    MAXSUM = 72, // the board always keeps at least 28%
    size = { top: 26, bot: 28 }, // the CSS defaults (--topH / --botH in index.css)
    rootStyle = document.documentElement.style;
  let raf = 0;
  const clamp = v => Math.max(LIM[0], Math.min(LIM[1], v));
  function apply() {
    rootStyle.setProperty('--topH', size.top.toFixed(2) + 'dvh');
    rootStyle.setProperty('--botH', size.bot.toFixed(2) + 'dvh');
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => dispatchEvent(new Event('resize'))); // the canvas and the cameras follow the new board rectangle
  }
  function load() {
    let raw = '';
    try {
      raw = document.cookie || '';
    } catch (e) {}
    const part = raw
      .split(';')
      .map(x => x.trim())
      .find(x => x.startsWith(KEY + '='));
    if (!part) return;
    const [t, b] = decodeURIComponent(part.slice(KEY.length + 1)).split('|').map(Number);
    if (!isFinite(t) || !isFinite(b)) return;
    size.top = clamp(t);
    size.bot = clamp(b);
    if (size.top + size.bot > MAXSUM) {
      size.top = 26;
      size.bot = 28;
    }
    apply();
  }
  function save() {
    try {
      document.cookie =
        KEY +
        '=' +
        encodeURIComponent(size.top.toFixed(1) + '|' + size.bot.toFixed(1)) +
        '; max-age=31536000; path=/; SameSite=Lax';
    } catch (e) {}
  }
  function handle(id, which, label) {
    const h = document.createElement('div');
    h.id = id;
    h.setAttribute('aria-label', label);
    document.body.appendChild(h);
    let on = false;
    h.addEventListener('pointerdown', e => {
      on = true;
      h.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    });
    h.addEventListener('pointermove', e => {
      if (!on) return;
      const H = innerHeight,
        other = which === 'top' ? 'bot' : 'top';
      size[which] = Math.min(clamp(((which === 'top' ? e.clientY : H - e.clientY) / H) * 100), MAXSUM - size[other]);
      apply();
    });
    const end = () => {
      if (!on) return;
      on = false;
      save();
    };
    h.addEventListener('pointerup', end);
    h.addEventListener('pointercancel', end);
  }
  handle('hTop', 'top', 'Drag to resize the inspector');
  handle('hBot', 'bot', 'Drag to resize the stack and card lists');
  load();
})();
"""
rep('index.html', r"""<script src="js/input.js"></script>""", r"""<script src="js/input.js"></script>
<script src="js/layout.js"></script>""", 'index.html: layout.js')
append('css/index.css', r"""/* ---- phone: drag handles for the inspector (top) and the stack / lists (bottom); replay controls ---- */
#hTop,
#hBot {
  display: none;
}
#rpbar {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  z-index: 3;
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  background: var(--panel);
  padding: 6px 8px;
  border-radius: 10px;
  backdrop-filter: blur(6px);
  font-size: 12px;
}
#rpbar[hidden] {
  display: none;
}
#rpbar .abtn {
  padding: 5px 10px;
  font-size: 12px;
}
#rpbar .dctl {
  padding: 4px 6px;
  font-size: 12px;
}
@media (orientation: portrait) {
  #hTop,
  #hBot {
    display: block;
    position: fixed;
    left: 0;
    right: 0;
    height: 18px;
    z-index: 6;
    touch-action: none;
    cursor: ns-resize;
  }
  #hTop::after,
  #hBot::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 7px;
    width: 44px;
    height: 4px;
    margin-left: -22px;
    border-radius: 2px;
    background: var(--fg);
    opacity: 0.45;
  }
  #hTop {
    top: calc(var(--topH) - 14px);
  }
  #hBot {
    top: calc(100dvh - var(--botH) - 14px);
  }
  #rpbar {
    left: 8px;
    right: 8px;
    transform: none;
    bottom: auto;
    top: calc(var(--topH) + 84px);
  }
}""", 'index.css: handles and replay bar')

# ================================================================ 8. replays
G = 'js/game-host.js'
rep(G, r"""const undoStack = [],
  eventLog = []; // snapshots for undo; recent rule events""", r"""const undoStack = [],
  eventLog = []; // snapshots for undo; recent rule events
const cmdLog = []; // every ACCEPTED command of the running duel: with the seed and the decks it IS the replay (the Sim is deterministic)
const rp = { on: false, feed: false, rec: null, i: 0, playing: false, speed: 1, timer: 0 }; // replay playback (replay.js)""", 'game-host: cmdLog and rp')
rep(G, r"""  lastCfg: null, // {mode:'self'|'bot', p1, p2, shuffle} of the running game""", r"""  lastCfg: null, // {mode:'self'|'bot', p1, p2, shuffle} of the running game
  rpInit: null, // what a replay needs besides the commands: seed, both decks, mode, deck names""", 'game-host: ui.rpInit')
rep(G, r"""function send(cmd) {
""", r"""function send(cmd) {
  if (rp.on && !rp.feed) {
    ui.note = 'Replay: watching only';
    sync();
    return { ok: false, why: 'Replay: watching only', events: [] };
  } // while a replay plays only the replay itself sends commands
""", 'game-host: send is closed during a replay')
rep(G, r"""    undoStack.push(pre);
    if (undoStack.length > 200) undoStack.shift();""", r"""    undoStack.push(pre);
    if (undoStack.length > 200) undoStack.shift();
    if (!rp.on) cmdLog.push(JSON.parse(JSON.stringify(cmd)));""", 'game-host: record accepted commands')
rep(G, r"""  if (MenuUI.away) return; // the menu or the deck editor is on screen: the game waits""", r"""  if (MenuUI.away || rp.on) return; // the menu or the deck editor is on screen (or a replay plays): nothing happens by itself""", 'game-host: no automation during a replay')
rep(G, r"""  if (!undoStack.length || ui.fxBusy) return;
  sim = undoStack.pop();""", r"""  if (!undoStack.length || ui.fxBusy) return;
  if (!rp.on) cmdLog.pop(); // an undone command is not part of the duel any more
  sim = undoStack.pop();""", 'game-host: undo drops the last recorded command')
rep(G, r"""  game = sim;
  fxReset();
  undoStack.length = 0;
  eventLog.length = 0;""", r"""  game = sim;
  fxReset();
  undoStack.length = 0;
  eventLog.length = 0;
  rp.on = false;
  rp.playing = false;
  clearTimeout(rp.timer);
  Replays.bar(false);
  cmdLog.length = 0;
  ui.rpInit = { n: sim.n, d1: deckOf(c.p1).slice(), d2: deckOf(c.p2).slice(), sh: !!c.shuffle, mode: c.mode, a: c.p1, b: c.p2 };""", 'game-host: resetGame starts a fresh recording')
rep(G, r"""  { id: 'reset', label: () => 'Reset game', run: resetGame, on: () => true },""", r"""  {
    id: 'reset',
    label: () => 'Reset game',
    run: () => {
      Replays.saveCurrent()
        .catch(() => false)
        .then(resetGame);
    },
    on: () => true,
  },""", 'game-host: Reset game saves the duel first')
M = 'js/menu.js'
rep(M, r"""    ].forEach(([t, f]) => {""", r"""      ['Replays', () => Replays.open()],
    ].forEach(([t, f]) => {""", 'menu: Replays button')
rep(M, r"""    confirmBox('Leave this game and return to the main menu?', 'Leave', 'Stay').then(ok => {
      if (ok) MenuUI.show();
    });""", r"""    confirmBox('Leave this game and return to the main menu?', 'Leave', 'Stay').then(ok => {
      if (!ok) return;
      Replays.saveCurrent()
        .catch(() => false)
        .then(() => MenuUI.show());
    });""", 'menu: leaving a duel saves its replay')
rep(M, r"""    this.away = true;
    clearTimeout(ui.botTimer);""", r"""    this.away = true;
    rp.playing = false;
    Replays.bar(false);
    clearTimeout(ui.botTimer);""", 'menu: show() hides the replay bar')
rep('index.html', r"""<script src="js/deck-editor.js"></script>""", r"""<script src="js/deck-editor.js"></script>
<script src="js/replay.js"></script>""", 'index.html: replay.js')

newfiles['js/replay.js'] = r"""// replay.js - duel replays. The Sim is deterministic, so seed + decks + the accepted commands (cmdLog) rebuild a duel exactly.
// Saved to cookies when a duel is left (the newest 5), listed and played back from the main menu.
// Storage: one small meta cookie per replay (tpw_rpm_<id>) and the data (JSON, deflated, base64url) in chunks (tpw_rp_<id>_<k>).
const Replays = (function () {
  const MAX = 5,
    CHUNK = 3600, // characters per cookie (a cookie holds ~4 KB including its name)
    MAXCHUNKS = 3, // a longer duel is not saved
    PM = 'tpw_rpm_',
    PD = 'tpw_rp_',
    mem = new Map(); // fallback when cookies are unavailable (e.g. file://)
  const jar = () => {
    let raw = '';
    try {
      raw = document.cookie || '';
    } catch (e) {}
    return raw
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => {
        const i = s.indexOf('=');
        return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)];
      });
  };
  const setC = (k, v) => {
    try {
      document.cookie = k + '=' + v + '; max-age=31536000; path=/; SameSite=Lax';
    } catch (e) {}
  };
  const delC = k => {
    try {
      document.cookie = k + '=; max-age=0; path=/; SameSite=Lax';
    } catch (e) {}
  };
  // ---- packing: JSON -> deflate (when the browser has CompressionStream) -> base64url. First character: z = deflated, j = plain
  const b64 = u8 => {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const unb64 = t => {
    const s = atob(t.replace(/-/g, '+').replace(/_/g, '/')),
      u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  };
  const pipe = async (u8, stream) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer());
  async function pack(obj) {
    const raw = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream === 'function')
      try {
        return 'z' + b64(await pipe(raw, new CompressionStream('deflate')));
      } catch (e) {}
    return 'j' + b64(raw);
  }
  async function unpack(t) {
    const u = unb64(t.slice(1)),
      raw = t[0] === 'z' ? await pipe(u, new DecompressionStream('deflate')) : u;
    return JSON.parse(new TextDecoder().decode(raw));
  }
  // ---- the store
  function list() {
    // oldest first
    const out = new Map();
    for (const [k, v] of jar())
      if (k.startsWith(PM))
        try {
          const m = JSON.parse(decodeURIComponent(v));
          out.set(m.id, m);
        } catch (e) {}
    for (const [id, r] of mem) if (!out.has(id)) out.set(id, r.meta);
    return [...out.values()].sort((a, b) => a.t - b.t);
  }
  function remove(id) {
    const m = list().find(x => x.id === id);
    for (let k = 0; k < Math.max(MAXCHUNKS, (m && m.c) || 0); k++) delC(PD + id + '_' + k);
    delC(PM + id);
    mem.delete(id);
  }
  async function load(id) {
    const m = list().find(x => x.id === id);
    if (!m) return null;
    const J = new Map(jar());
    let t = '',
      ok = true;
    for (let k = 0; k < m.c; k++) {
      const part = J.get(PD + id + '_' + k);
      if (part == null) {
        ok = false;
        break;
      }
      t += part;
    }
    if (ok)
      try {
        return await unpack(t);
      } catch (e) {}
    return mem.has(id) ? mem.get(id).rec : null;
  }
  async function saveCurrent() {
    // everything is captured BEFORE the first await: the caller may reset the game right after
    const init = ui.rpInit;
    if (!init || !cmdLog.length || rp.on) return false;
    const rec = Object.assign({ v: 1 }, init, { cmds: cmdLog.slice() }),
      id = Date.now().toString(36),
      meta = { id, t: Date.now(), a: init.a, b: init.b, m: init.mode, n: rec.cmds.length, turns: sim.turn, life: [sim.life.Player, sim.life.Opponent], c: 0 };
    const data = await pack(rec),
      chunks = [];
    for (let i = 0; i < data.length; i += CHUNK) chunks.push(data.slice(i, i + CHUNK));
    if (chunks.length > MAXCHUNKS) return false; // too long for cookies
    meta.c = chunks.length;
    for (const m of list().slice(0, Math.max(0, list().length - (MAX - 1)))) remove(m.id); // keep the newest MAX
    chunks.forEach((x, k) => setC(PD + id + '_' + k, x));
    setC(PM + id, encodeURIComponent(JSON.stringify(meta))); // the meta cookie goes last: a listed replay is complete
    mem.set(id, { meta, rec });
    return true;
  }
  // ---- playback: the replay sends its recorded commands through the normal send(); input is closed while it runs
  let bar = null,
    lab,
    playBtn;
  function build() {
    bar = mkEl('div');
    bar.id = 'rpbar';
    bar.hidden = true;
    lab = mkEl('span');
    playBtn = mkBtn('Play', toggle, 'c-go');
    const spd = mkEl('select', 'dctl');
    for (const [v, t] of [['0.5', 'Slow'], ['1', 'Normal'], ['2', 'Fast'], ['4', 'Very fast']]) {
      const o = mkEl('option');
      o.value = v;
      o.textContent = t;
      spd.appendChild(o);
    }
    spd.value = String(rp.speed);
    spd.onchange = () => {
      rp.speed = +spd.value;
    };
    bar.append(
      mkBtn('\u25c0 Back', stepBack),
      playBtn,
      mkBtn('Step \u25b6', () => {
        rp.playing = false;
        clearTimeout(rp.timer);
        stepFwd();
      }),
      spd,
      lab,
      mkBtn('Exit replay', exit, 'c-atk')
    );
    document.body.appendChild(bar);
  }
  function showBar(on) {
    if (!bar) {
      if (!on) return;
      build();
    }
    const v = !!on && rp.on && !MenuUI.away;
    bar.hidden = !v;
    if (v) {
      lab.textContent = rp.i + ' / ' + rp.rec.cmds.length;
      playBtn.textContent = rp.playing ? 'Pause' : 'Play';
    }
  }
  function stepFwd() {
    if (!rp.on || ui.fxBusy || rp.i >= rp.rec.cmds.length) return false;
    rp.feed = true;
    let r;
    try {
      r = send(rp.rec.cmds[rp.i]);
    } finally {
      rp.feed = false;
    }
    if (!r.ok) {
      // the game changed since the duel was recorded: stop instead of guessing
      rp.playing = false;
      ui.note = 'Replay stopped at command ' + (rp.i + 1) + ': ' + r.why;
      sync();
      showBar(true);
      return false;
    }
    rp.i++;
    showBar(true);
    return true;
  }
  function stepBack() {
    if (!rp.on || ui.fxBusy || !undoStack.length || rp.i <= 0) return;
    rp.playing = false;
    clearTimeout(rp.timer);
    undo(); // every accepted command pushed a snapshot
    rp.i--;
    showBar(true);
  }
  function tick() {
    clearTimeout(rp.timer);
    if (!rp.on || !rp.playing || MenuUI.away) return;
    if (ui.fxBusy) {
      rp.timer = setTimeout(tick, 120); // wait for the showcase animation
      return;
    }
    if (!stepFwd()) {
      rp.playing = false;
      showBar(true);
      return;
    }
    rp.timer = setTimeout(tick, 650 / rp.speed);
  }
  function toggle() {
    if (!rp.on) return;
    rp.playing = !rp.playing && rp.i < rp.rec.cmds.length;
    showBar(true);
    tick();
  }
  function exit() {
    rp.on = false;
    rp.playing = false;
    clearTimeout(rp.timer);
    showBar(false);
    MenuUI.show();
  }
  function start(rec) {
    clearTimeout(rp.timer);
    Object.assign(rp, { on: true, feed: false, rec, i: 0, playing: false });
    ui.mode = 'replay';
    ui.deckEdit = false;
    ui.autoView = true;
    ui.pin = null;
    ui.placing = null;
    clearTimeout(ui.botTimer);
    sim = Sim.create(rec.n, DEFS, { decks: { Player: rec.d1, Opponent: rec.d2 }, shuffle: rec.sh, autoStart: true });
    game = sim;
    fxReset();
    undoStack.length = 0;
    cmdLog.length = 0;
    eventLog.length = 0;
    for (const m of meshes.values()) cardGroup.remove(m);
    meshes.clear();
    ui.selected = null;
    ui.openList = null;
    inspect.hidden = true;
    deckPanel.hidden = true;
    setView('Player');
    sync();
    showBar(true);
  }
  function open() {
    modal((box, close, cancel) => {
      box.appendChild(mkEl('h2')).textContent = 'Replays';
      const lst = mkEl('div', 'rp-list');
      box.appendChild(lst);
      const render = () => {
        lst.replaceChildren();
        const L = list().reverse();
        if (!L.length) {
          lst.appendChild(mkEl('p', 'mmsg')).textContent = 'No replays yet. A replay is saved when you leave a duel (the newest ' + MAX + ' are kept).';
          return;
        }
        for (const m of L) {
          const row = mkEl('div', 'rp-row'),
            t = mkEl('span');
          t.textContent =
            new Date(m.t).toLocaleString() + ' \u00b7 ' + m.a + ' vs ' + m.b + ' \u00b7 ' + (m.m === 'bot' ? 'Vs Bot' : 'Vs Self') +
            ' \u00b7 turn ' + m.turns + ' \u00b7 life ' + m.life.join(':');
          row.append(
            t,
            mkBtn(
              'Watch',
              async () => {
                const rec = await load(m.id);
                if (!rec) {
                  t.textContent = 'This replay could not be read';
                  return;
                }
                close();
                MenuUI.away = false;
                MenuUI.hide();
                start(rec);
              },
              'c-go'
            ),
            mkBtn(
              'Delete',
              () => {
                remove(m.id);
                render();
              },
              'c-atk'
            )
          );
          lst.appendChild(row);
        }
      };
      render();
      const row = mkEl('div', 'mrow');
      row.appendChild(mkBtn('Close', cancel));
      box.appendChild(row);
    });
  }
  return { list, remove, load, saveCurrent, open, bar: showBar, start };
})();
"""

# ================================================================ tests
T = 'tests/selftest.js'
rep(T, r"""    const s = Sim.create(seed, DEFS.concat(FIXTURES));
    for (const p of ['Player', 'Opponent']) D(s, { type: 'Start', player: p });""", r"""    const s = Sim.create(seed, DEFS.concat(FIXTURES, extra || []));
    for (const p of ['Player', 'Opponent']) D(s, { type: 'Start', player: p });""", 'tests: start() takes extra card definitions')
rep(T, r"""  const start = seed => {""", r"""  const start = (seed, extra) => {""", 'tests: start signature')
rep(T, r"""  out.push(
    '---- ' +""", r"""  // ================= Patch 3: enter triggers on death, King Eye counts and picks, Repeat / continuations, conditions, decks, replay =================
  {
    const s = start(700),
      w1 = take(s, 'Player', 'wardrum', 'hand'),
      w2 = take(s, 'Opponent', 'wardrum', 'hand');
    D(s, { type: 'PlayCard', iid: w1.iid, slot: 'Player|back|1' });
    D(s, { type: 'PlayCard', iid: w2.iid, slot: 'Opponent|back|1' });
    eq(
      'War Drum answered by War Drum: both die on entering (-1/-1 each) but BOTH enter triggers are on the stack',
      [w1.loc, w2.loc, s.stack.length, owners(s)],
      ['gy', 'gy', 2, ['Player', 'Opponent']]
    );
    pass2(s);
    D(s, { type: 'Choose', player: 'Opponent', option: 'Opponent|front|0' });
    pass2(s);
    D(s, { type: 'Choose', player: 'Player', option: 'Player|front|0' });
    eq(
      '...and both resolve: each dead Drum still creates its Drummer',
      Object.values(s.cards)
        .filter(x => x.def.id === 'drummer-token' && x.loc === 'board')
        .map(x => x.owner),
      ['Opponent', 'Player']
    );
  }
  {
    const setup = () => {
      const s = start(701),
        ke = take(s, 'Player', 'kingeye', 'board', 'Player|front|1'),
        so = take(s, 'Player', 'soldier', 'board', 'Player|front|0');
      take(s, 'Player', 'wolf', 'board', 'Player|front|2');
      const pa = take(s, 'Opponent', 'parasite', 'hand');
      s.priority = 'Opponent';
      D(s, { type: 'PlayCard', iid: pa.iid, slot: 'Opponent|front|0' });
      drain(s);
      return { s, ke, so };
    };
    let { s, ke, so } = setup();
    eq(
      'King Eye: Creeping Parasite sees ONE creature (King Eye), so only modes 0 and 1 are unlocked',
      [s.choice.kind, s.choice.options],
      ['mode', ['0', '1']]
    );
    D(s, { type: 'Choose', player: 'Opponent', option: '1' });
    const o = s.choice.options;
    check(
      'a cloud zone is a legal pick (empty or not); the cards under clouds are never offered themselves; King Eye and players are',
      o.includes('Z:Player|front|0') &&
        o.includes('Z:Player|front|2') &&
        o.includes('Z:Player|back|4') &&
        !o.includes(so.iid) &&
        o.includes(ke.iid) &&
        o.includes('P:Player'),
      o.join()
    );
    D(s, { type: 'Choose', player: 'Opponent', option: 'Z:Player|back|4' });
    eq(
      'picking a cloud with nothing underneath is accepted and fizzles: nothing happens, nothing is revealed',
      [s.choice, so.loc, ndmg(so)],
      [null, 'board', 0]
    );
    ({ s, ke, so } = setup());
    D(s, { type: 'Choose', player: 'Opponent', option: '1' });
    D(s, { type: 'Choose', player: 'Opponent', option: 'Z:Player|front|0' });
    eq('picking a cloud with a card underneath hits that card (4 damage kills the Soldier)', [s.choice, so.loc], [null, 'gy']);
  }
  {
    const rep1 = Fx.creature('t-repeat', 'Repeater', 1, 1, {
        triggers: [Fx.trigger.enter(Fx.repeat(2, Fx.shiftAdjacent()))],
      }),
      s = start(702, [rep1]),
      r = take(s, 'Player', 't-repeat', 'hand');
    D(s, { type: 'PlayCard', iid: r.iid, slot: 'Player|front|2' });
    drain(s);
    const first = !!s.choice;
    D(s, { type: 'Choose', player: 'Player', option: 'stay' });
    const second = !!s.choice;
    D(s, { type: 'Choose', player: 'Player', option: 'stay' });
    eq('Repeat: a choice inside it is answered before the next repetition (two choices, none overwritten)', [first, second, s.choice], [true, true, null]);
    const zc = Fx.creature('t-zone', 'Zoner', 1, 1, {
        tokens: { t: Fx.creature('t-tok', 'Tok', 1, 1, {}) },
        triggers: [Fx.trigger.enter(Fx.nearestZone(['self']), Fx.shiftAdjacent(), Fx.createToken('t'))],
      }),
      q = start(703, [zc]),
      z = take(q, 'Player', 't-zone', 'hand');
    D(q, { type: 'PlayCard', iid: z.iid, slot: 'Player|front|2' });
    drain(q);
    D(q, { type: 'Choose', player: 'Player', option: 'stay' });
    drain(q);
    eq(
      'continuation frames keep the picked zone: NearestZone, a choice, then CreateToken still has its zone',
      Object.values(q.cards).filter(x => x.def.id === 't-tok' && x.loc === 'board').length,
      1
    );
  }
  {
    const bc = Fx.creature('t-badcond', 'BadCond', 1, 1, {
        triggers: [Object.assign(Fx.trigger.enter(Fx.draw(1)), { cond: 'nope' })],
      }),
      s = start(704, [bc]),
      c = take(s, 'Player', 't-badcond', 'hand');
    let ok = false,
      thrown = null;
    try {
      ok = D(s, { type: 'PlayCard', iid: c.iid, slot: 'Player|front|0' }).ok;
    } catch (e) {
      thrown = String(e);
    }
    eq('an unknown trigger condition never crashes the Sim (fails closed: the trigger does not fire)', [thrown, ok, s.stack.length], [null, true, 0]);
    check(
      'Sim.API lists the trigger conditions (the validator checks them)',
      ['extraPaid', 'firstCombat', 'ownInAttackCol'].every(n => Sim.API.conds.includes(n))
    );
  }
  {
    const ids = DEFS.map(d => d.id).slice(0, 10);
    DeckStore.save('zz tmp deck', ids);
    const had = DeckStore.nameUsed('zz tmp deck');
    DeckStore.remove('zz tmp deck');
    eq('DeckStore.remove deletes a saved deck', [had, DeckStore.nameUsed('zz tmp deck')], [true, false]);
    const bolts = DEFS.filter(d => cardMatches('bolt', d)).map(d => d.id);
    check(
      'deck editor "Only matches": names containing the query (or a typo of it) match, others do not',
      bolts.includes('bolt') && bolts.includes('boltmaster') && bolts.includes('superbolt') && !bolts.includes('zap') && cardMatches('', DEFS[0]),
      bolts.join()
    );
  }
  {
    // replay: seed + decks + the accepted commands rebuild the identical game
    const opts = { decks: { Player: BUILTIN_DECKS[1].cards, Opponent: BUILTIN_DECKS[0].cards }, shuffle: true, autoStart: true },
      a = Sim.create(800, DEFS, opts),
      rnd = botRng(3),
      mem = {},
      cmds = [];
    for (let i = 0; i < 300; i++) {
      const cmd = botChoose(a, botActor(a), rnd, mem);
      if (!cmd) break;
      if (D(a, cmd).ok) cmds.push(JSON.parse(JSON.stringify(cmd)));
    }
    const b = Sim.create(800, DEFS, opts);
    let bad = 0;
    for (const cmd of cmds) if (!D(b, cmd).ok) bad++;
    check(
      'replay: seed + decks + the recorded commands rebuild the identical game state',
      cmds.length > 50 && !bad && JSON.stringify(a) === JSON.stringify(b),
      'commands=' + cmds.length + ' rejected=' + bad
    );
  }
  out.push(
    '---- ' +""", 'tests: Patch 3 checks')

# ================================================================ docs
rep('Docs/RULES.md', r"""- **[proto] Triggers:** all triggers from one event are pushed together, turn player's first (so the other player's resolve first); priority goes to the turn player's opponent. Order within one player: card creation order (placeholder).""", r"""- **[proto] Triggers:** all triggers from one event are pushed together, turn player's first (so the other player's resolve first); priority goes to the turn player's opponent. Order within one player: card creation order (placeholder).
- **[proto] Enter triggers are queued before the state-based check.** A permanent that dies the moment it enters (War Drum answered by War Drum: each one's -1/-1 aura kills the other) still has its enter triggers on the stack, and they resolve.""", 'RULES: enter triggers before death')
rep('Docs/RULES.md', r"""- **Auras (War Drum -1/-1 on foes,""", r"""- **Clouds hide counts and picks [proto]:** a creature under an enemy cloud counts as none when an effect counts the foe's creatures (Creeping Parasite's modes and its draw count): next to a King Eye the foe sees one creature, King Eye. A zone under a cloud is a legal pick (Parasite: 4 damage, return to hand): every such zone is offered, empty or not, and a card under a cloud is never offered by itself. If the picked zone is empty, or holds a red-shielded card, the effect fizzles and nothing is revealed.
- **Auras (War Drum -1/-1 on foes,""", 'RULES: clouds hide counts and picks')
rep('Docs/OPEN_QUESTIONS.md', "\n## Rules definitions\n", """- [x] **Enter triggers when a permanent dies on entering.** They are queued before the state-based check and still resolve (War Drum vs War Drum).
- [x] **Hidden information and counts (King Eye).** Creatures under a cloud count as none for effects that count the foe's creatures; a cloud zone is a legal pick; an empty or red-shielded pick fizzles and reveals nothing.

## Rules definitions
""", 'OPEN_QUESTIONS: resolved items')
rep('README.md', r"""`js/game-host.js`, `js/input.js`, `js/panels.js`, `js/menu.js`, `js/deck-editor.js` host and UI state, pointer input, panels, menu, deck editor""", r"""`js/game-host.js`, `js/input.js`, `js/layout.js`, `js/panels.js`, `js/menu.js`, `js/deck-editor.js`, `js/replay.js` host and UI state, pointer input, phone panel resizing (cookie), panels, menu, deck editor, duel replays (cookies)""", 'README: code list')

# ---------------------------------------------------------------- stop here if any pattern failed: nothing was written
if errors:
    print('Nothing was written. These patterns did not match:')
    for e in errors:
        print('  - ' + e)
    sys.exit(1)

# ---------------------------------------------------------------- write, test, roll back on any difference
paths = list(files) + list(newfiles)
orig = {r: (open(p(r), 'rb').read() if os.path.exists(p(r)) else None) for r in paths}


def restore():
    for r, b in orig.items():
        if b is None:
            if os.path.exists(p(r)):
                os.remove(p(r))
        else:
            open(p(r), 'wb').write(b)


for r, t in list(files.items()) + list(newfiles.items()):
    write(r, t)
after, err = run_tests()
if after is None:
    restore()
    die('the tests do not run after the edits (everything restored):\n' + (err or '')[:1500])
bset, aset = set(l for l in base if not l.startswith('----')), set(l for l in after if not l.startswith('----'))
lost = [l for l in bset if l.startswith('PASS') and l not in aset]
newfail = [l for l in after if l.startswith('FAIL') and l not in bset]
if lost or newfail:
    restore()
    print('ABORT: the tests changed (everything restored, nothing was modified).')
    for l in lost[:15]:
        print('  no longer passing: ' + l)
    for l in newfail[:15]:
        print('  new failure: ' + l)
    sys.exit(1)
n_checks = sum(l.startswith(('PASS', 'FAIL')) for l in after)
for rel in ('Docs/ARCHITECTURE.md', 'Docs/effects.md'):
    if os.path.exists(p(rel)):
        write(rel, re.sub(r'\d+ checks', f'{n_checks} checks', read(rel), count=1))
print(f'tests ok: {n_checks} checks, {sum(l.startswith("FAIL") for l in after)} failing (same as before)')
print('\n'.join(['', 'Edits:'] + ['  ' + l for l in log]))
print('\nDone. Run `npm run format`, review with `git diff --stat`, then commit. Nothing was committed.')

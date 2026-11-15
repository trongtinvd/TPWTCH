#!/usr/bin/env python3
"""patch.py - refactor steps 1-3 + docs. Run from the repo root:  python patch.py

1. Tests out:   selfTest() moves from js/tests-main.js to tests/selftest.js; new tests/run.js runs it in Node;
                js/tests-main.js becomes js/main.js (console hook + render loop); index.html updated.
2. Dead code:   removes stale code/comments (see the 'edits' below).
3. Format:      Prettier (js, css, tests) - formatting only.
4. Docs:        README (paths, layout, how to test), test-count and test-location lines in ARCHITECTURE / effects.

Safety: the test output is recorded BEFORE anything is touched; after the edits and again after formatting the
tests are re-run and the output must be identical, otherwise that stage is rolled back. Nothing is committed.
"""
import json, os, re, shutil, subprocess, sys, tempfile

ROOT = os.getcwd()
p = lambda *a: os.path.join(ROOT, *a)
NODE, NPX = shutil.which('node'), shutil.which('npx')
log, files, EOL = [], {}, {}

def die(msg):
    print('ABORT: ' + msg); sys.exit(1)

def read(rel):
    with open(p(rel), encoding='utf-8', newline='') as f: raw = f.read()
    EOL[rel] = '\r\n' if '\r\n' in raw else '\n'
    return raw.replace('\r\n', '\n')

def cur(rel):
    return files[rel] if rel in files else read(rel)

def write(rel, text):
    os.makedirs(os.path.dirname(p(rel)), exist_ok=True)
    eol = EOL.get(rel) or EOL.get('js/sim.js') or '\n'
    with open(p(rel), 'w', encoding='utf-8', newline='') as f: f.write(text.replace('\n', eol))

def edit(rel, pat, repl, desc, count=1):
    """regex edit; a pattern that does not match exactly `count` times is skipped with a warning"""
    if not os.path.exists(p(rel)): log.append(f'SKIPPED {desc}: {rel} not found'); return
    t = cur(rel); n = len(re.findall(pat, t, re.M))
    if n != count: log.append(f'SKIPPED {desc}: {n} matches in {rel}, expected {count}'); return
    files[rel] = re.sub(pat, repl, t, flags=re.M); log.append('ok      ' + desc)

# ---------------------------------------------------------------- Node runner
RUN_JS = r"""// run.js - headless rules tests (no THREE, no DOM).  Usage: node tests/run.js [--json] [path/to/selftest.js]
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const root = process.env.REPO_ROOT || path.join(__dirname, '..');
const args = process.argv.slice(2);
const testFile = args.find(a => !a.startsWith('--')) || path.join(__dirname, 'selftest.js');

// Every script shares one global scope, exactly like the browser.
const sandbox = {
  console: { log() {}, error: (...a) => console.error(...a), warn: (...a) => console.error(...a) },
  structuredClone,
};
vm.createContext(sandbox);
const scripts = ['js/cards.js', 'js/sim.js', 'js/decks.js', 'js/bot.js'].map(f => path.join(root, f)).concat(testFile);
for (const f of scripts) vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: f });

const out = JSON.parse(vm.runInContext('JSON.stringify(selfTest())', sandbox));
console.log(args.includes('--json') ? JSON.stringify(out) : out.join('\n'));
process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0);
"""

def run_tests(runner, selftest=None):
    cmd = [NODE, runner, '--json'] + ([selftest] if selftest else [])
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, env=dict(os.environ, REPO_ROOT=ROOT))
    lines = r.stdout.strip().splitlines()
    if r.returncode not in (0, 1) or not lines: return None, r.stderr
    return json.loads(lines[-1]), r.stderr

def same(a, b):
    if a == b: return True
    for i, (x, y) in enumerate(zip(a, b)):
        if x != y: print(f'  first difference at line {i}:\n    before: {x[:200]}\n    after:  {y[:200]}'); break
    else: print(f'  different number of lines: {len(a)} vs {len(b)}')
    return False

# ---------------------------------------------------------------- preconditions
if not NODE: die('node is required (https://nodejs.org)')
for f in ['js/sim.js', 'js/cards.js', 'js/tests-main.js', 'index.html']:
    if not os.path.exists(p(f)): die(f'{f} not found: run this from the repo root (already patched?)')

# ---------------------------------------------------------------- baseline (nothing is written to the repo yet)
tm = read('js/tests-main.js'); read('js/sim.js')
if 'function selfTest(){' not in tm or 'window.cardGame' not in tm: die('could not find selfTest / window.cardGame in js/tests-main.js')
i_fn, i_win = tm.index('function selfTest(){'), tm.index('window.cardGame')
hdr = re.search(r'^// ---- Headless rules tests[^\n]*\n', tm, re.M)
start = hdr.start() if hdr and hdr.end() == i_fn else i_fn
test_src = tm[i_fn:i_win].rstrip() + '\n'
if not test_src.endswith('}\n'): die('selfTest does not end where expected')
tmp = tempfile.mkdtemp()
open(os.path.join(tmp, 'run.js'), 'w', encoding='utf-8').write(RUN_JS)
open(os.path.join(tmp, 'selftest.js'), 'w', encoding='utf-8').write(test_src)
base, err = run_tests(os.path.join(tmp, 'run.js'), os.path.join(tmp, 'selftest.js'))
if base is None: die('could not run the existing tests:\n' + err)
n_fail = sum(l.startswith('FAIL') for l in base); n_checks = sum(l.startswith(('PASS', 'FAIL')) for l in base)
print(f'baseline: {n_checks} checks, {n_fail} failing already (kept as they are)')

# ---------------------------------------------------------------- stage A: edits (computed in memory)
newfiles = {}
newfiles['tests/selftest.js'] = ('// selftest.js - headless rules tests (no THREE, no DOM).\n'
    '// Run: node tests/run.js   (index.html also loads it: cardGame.selfTest() in the console)\n' + test_src)
newfiles['tests/run.js'] = RUN_JS
files['js/tests-main.js'] = tm
main_src = tm[:start] + tm[i_win:]
main_src = re.sub(r'^// tests-main\.js[^\n]*', '// main.js - console hook, bootstrap and render loop', main_src, count=1)
newfiles['js/main.js'] = main_src; EOL['js/main.js'] = EOL['js/tests-main.js']
del files['js/tests-main.js']

# cards.js: comments that ended up on the wrong line, and an unused builder
C = 'js/cards.js'
edit(C, r"(controller picks which instances)[ \t]+// effect: controller may move this card to an adjacent empty column", r"\1", 'cards: stray comment on removeDamage')
edit(C, r"(\bshiftAdjacent: \(\) => \(\{op:'ShiftAdjacent'\}\),)[ \t]*$", r"\1   // effect: controller may move this card to an adjacent empty column", 'cards: comment on shiftAdjacent')
edit(C, r"(\(use cond:'firstCombat'\))[ \t]+// beginning of its controller's combat step", r"\1", 'cards: stray comment on combatEnd')
edit(C, r"(\bcombat: \(\.\.\.effects\) => \(\{on:'combat', effects\}\),)[ \t]*$", r"\1   // beginning of its controller's combat step", 'cards: comment on combat')
edit(C, r"(// start of its controller's turn)[ \t]+// when this card enters the field", r"\1", 'cards: stray comment on turnStart')
edit(C, r"(\benter: \(\.\.\.effects\) => \(\{on:'enter', effects\}\),)[ \t]*$", r"\1   // when this card enters the field", 'cards: comment on enter')
edit(C, r"(playerTarget: true,[ \t]+// spell flag: a player can be targeted \(click a life bar\))[ \t]+// spell target: a zone with a card \(or a cloud\) on it, chosen when the spell is played", r"\1", 'cards: stray comment on playerTarget')
edit(C, r"(\bzoneTarget: \{anyPermanent:'anyPermanent', anyCreature:'anyCreature'\},)[ \t]*$", r"\1   // spell target: a zone with a card (or a cloud) on it, chosen when the spell is played", 'cards: comment on zoneTarget')
edit(C, r"(the victim loses its abilities and gains this card's),", r"\1.", 'cards: comment on rider')
edit(C, r"(placeToken: token => \(\{op:'PlaceToken', token\}\))[ \t]+// effect: this spell goes to its owner's hand instead of the graveyard", r"\1   // effect: the controller picks a free front zone and puts the token there", 'cards: stray comment on placeToken')
edit(C, r"(\breturnToHand: \(\) => \(\{op:'ReturnToHand'\}\),)[ \t]*$", r"\1   // effect: this spell goes to its owner's hand instead of the graveyard", 'cards: comment on returnToHand')
edit(C, r"^[ \t]*freeFrontZone: \(\) => \(\{op:'FreeFrontZone'\}\),[ \t]*\n", '', 'cards: unused freeFrontZone builder')

# sim.js: no-op leftovers of the old attack window, an unused op, a pre-statuses field
S = 'js/sim.js'
edit(S, r"^[ \t]*function settle\(\)\{\}[^\n]*\n", '', 'sim: no-op settle()')
edit(S, r"settle\(s, ev\);[ \t]?", '', 'sim: the 3 calls to settle()', count=3)
edit(S, r"choice:null, pending:null,", 'choice:null,', 'sim: s.pending (no longer exists)')
edit(S, r"slot:null, damage:\[\], token:true\}", 'slot:null, token:true}', 'sim: damage:[] on ability tokens (pre-statuses)')
edit(S, r"^[ \t]*FreeFrontZone:[^\n]*\n", '', 'sim: unused FreeFrontZone op')

# the 'attack' response window kind no longer exists
edit('js/game-host.js', r"\{end:'end step', attack:'attack declared'\}", "{end:'end step'}", 'game-host: dead response kind')
edit('js/view-sync.js', r"\{end:'end step', attack:'attack declared'\}", "{end:'end step'}", 'view-sync: dead response kind')

# index.html: comments inside <script src> are ignored by browsers; new test / main scripts
edit('index.html', r'(<script src="[^"]+">)[^<]*(</script>)', r'\1\2', 'index.html: stray text inside <script src> tags', count=len(re.findall(r'<script src="[^"]+">[^<]*</script>', cur('index.html'))))
edit('index.html', r'<script src="js/tests-main\.js"></script>', '<script src="tests/selftest.js"></script>\n<script src="js/main.js"></script>', 'index.html: load tests/selftest.js and js/main.js')

# docs
edit('README.md', r"## Files \(`/docs`\)", '## Files (`Docs/`)', 'README: docs folder is Docs/')
if os.path.exists(p('README.md')) and '## Running the tests' not in cur('README.md'):
    files['README.md'] = cur('README.md').rstrip() + """

## Code
Plain scripts loaded in order by `index.html` (no build step):
- `js/cards.js` Fx effect API + card definitions - `js/sim.js` rules (no THREE/DOM) - `js/decks.js` deck store, validation, search - `js/bot.js` bot
- `js/scene.js`, `js/board.js`, `js/card-view.js`, `js/view-sync.js` three.js scene, board, card meshes, state -> mesh sync
- `js/game-host.js`, `js/input.js`, `js/panels.js`, `js/menu.js`, `js/deck-editor.js` host and UI state, pointer input, panels, menu, deck editor
- `js/main.js` console hook and render loop
- `tests/selftest.js` headless rules tests, `tests/run.js` runs them in Node

## Running the tests
`node tests/run.js` (Node 18+, no dependencies). The same tests run in the browser console with `cardGame.selfTest()`.
`npx prettier --write js css tests` formats the code (see `.prettierrc.json`).
"""
    log.append('ok      README: code layout + how to run the tests')
edit('Docs/ARCHITECTURE.md', r"Status in `cardGame\.selfTest\(\)` \(headless, \d+ checks\):", f"Status in `tests/selftest.js` (`node tests/run.js`, or `cardGame.selfTest()` in the console; headless, {n_checks} checks):", 'ARCHITECTURE: test location and count')
edit('Docs/effects.md', r"`cardGame\.selfTest\(\)` \(headless, no THREE/DOM\): \d+ checks\.", f"`tests/selftest.js` (`node tests/run.js`, or `cardGame.selfTest()` in the console; headless, no THREE/DOM): {n_checks} checks.", 'effects.md: test location and count')

# ---------------------------------------------------------------- stage A: write, verify, roll back on any difference
paths = list(files) + list(newfiles) + ['js/tests-main.js']
orig = {r: (open(p(r), 'rb').read() if os.path.exists(p(r)) else None) for r in paths}
def restore(snap):
    for r, b in snap.items():
        if b is None:
            if os.path.exists(p(r)): os.remove(p(r))
        else:
            os.makedirs(os.path.dirname(p(r)), exist_ok=True); open(p(r), 'wb').write(b)
for r, t in list(files.items()) + list(newfiles.items()): write(r, t)
os.remove(p('js/tests-main.js'))
after, err = run_tests(p('tests', 'run.js'))
if after is None or not same(base, after):
    restore(orig)
    try: os.rmdir(p('tests'))
    except OSError: pass
    die('tests changed after the edits (rolled back, nothing was modified):\n' + (err or ''))
print('stage A ok: tests identical after moving tests, removing dead code, fixing docs')

# ---------------------------------------------------------------- stage B: Prettier (formatting only)
if not os.path.exists(p('.prettierrc.json')):
    open(p('.prettierrc.json'), 'w').write(json.dumps({'printWidth': 120, 'singleQuote': True, 'arrowParens': 'avoid', 'trailingComma': 'es5', 'endOfLine': 'auto'}, indent=2) + '\n')
if not os.path.exists(p('package.json')):
    open(p('package.json'), 'w').write(json.dumps({'private': True, 'scripts': {'test': 'node tests/run.js', 'format': 'prettier --write js css tests'}}, indent=2) + '\n')
snap = {}
for d in ('js', 'css', 'tests'):
    for f in os.listdir(p(d)):
        if f.endswith(('.js', '.css')): snap[f'{d}/{f}'] = open(p(d, f), 'rb').read()
if not NPX: print('npx not found: formatting skipped (run: npx prettier --write js css tests)')
else:
    r = subprocess.run([NPX, '--yes', 'prettier@3.3.3', '--write', 'js/**/*.js', 'css/**/*.css', 'tests/**/*.js'], cwd=ROOT, capture_output=True, text=True)
    fmt, err = (run_tests(p('tests', 'run.js')) if r.returncode == 0 else (None, r.stderr + r.stdout))
    if fmt is None or not same(base, fmt):
        restore(snap); print('formatting skipped and rolled back (stage A is kept):\n' + (err or '')[:800])
    else: print('stage B ok: formatted, tests identical')

print('\n'.join(['', 'Edits:'] + ['  ' + l for l in log]))
print('\nDone. Review with `git diff --stat`; then `node tests/run.js`. Nothing was committed.')

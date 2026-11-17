#!/usr/bin/env python3
"""Patch 4.py - run from the repo root:  python "Patches/Patch 4.py"

 1. Stack inspector: click an ability / trigger on the stack -> in the inspector the text of THAT ability is highlighted, the rest greyed.
 2. Card text is DERIVED from the card's abilities (every trigger / ability / passive / rider carries its own `text`; def.text is built from them).
    When Avatar of Rabies replaces a card's abilities, the old ones are crossed out and the new ones are added.
 3. Greyed = not usable from where the card is right now (location only). Hummingbird: enter trigger greyed on the board, attack trigger
    greyed everywhere but the board, GY ability greyed everywhere but the GY.   Crossed out = disabled (replaced).
 4. css/theme.css: every colour / distance / board rise / sprite size lives there as a CSS variable (js/theme.js reads them for the 3D scene).
 5. CI: actions/checkout and actions/setup-node bumped to the Node 24 releases (v5), tests run on Node 24.
 6. Cookies -> localStorage (js/storage.js, one tiny wrapper). Old tpw_* cookies are moved over once, then expired.

Safety: every pattern must match exactly the expected number of times, otherwise NOTHING is written. The test output is recorded before;
afterwards every old check must still pass and no new FAIL may appear, otherwise everything is restored. Nothing is committed.
"""
import json, os, re, shutil, subprocess, sys

ROOT = os.getcwd()
p = lambda *a: os.path.join(ROOT, *a)
NODE = shutil.which('node')
log, files, EOL, errors, newfiles = [], {}, {}, [], {}


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
    """exact-text edit; must match exactly `count` times"""
    if not os.path.exists(p(rel)):
        errors.append(f'{desc}: {rel} not found'); return
    t = cur(rel); n = t.count(old)
    if n != count:
        errors.append(f'{desc}: {n} matches in {rel}, expected {count}'); return
    files[rel] = t.replace(old, new); log.append('ok  ' + desc)


def repall(rel, old, new, desc):
    """exact-text edit of every occurrence (at least one)"""
    if not os.path.exists(p(rel)):
        errors.append(f'{desc}: {rel} not found'); return
    t = cur(rel); n = t.count(old)
    if n < 1:
        errors.append(f'{desc}: no match in {rel}'); return
    files[rel] = t.replace(old, new); log.append(f'ok  {desc} ({n}x)')


def rx(rel, pat, new, desc):
    """regex edit (DOTALL), must match exactly once"""
    if not os.path.exists(p(rel)):
        errors.append(f'{desc}: {rel} not found'); return
    t = cur(rel); n = len(re.findall(pat, t, re.S))
    if n != 1:
        errors.append(f'{desc}: {n} matches in {rel}, expected 1'); return
    files[rel] = re.sub(pat, lambda m: new, t, flags=re.S); log.append('ok  ' + desc)


def append(rel, text, desc):
    if not os.path.exists(p(rel)):
        errors.append(f'{desc}: {rel} not found'); return
    files[rel] = cur(rel).rstrip('\n') + '\n' + text + '\n'; log.append('ok  ' + desc)


def run_tests():
    r = subprocess.run([NODE, 'tests/run.js', '--json'], cwd=ROOT, capture_output=True, text=True)
    lines = r.stdout.strip().splitlines()
    if r.returncode not in (0, 1) or not lines:
        return None, r.stderr
    return json.loads(lines[-1]), r.stderr


# ---------------------------------------------------------------- preconditions
if not NODE:
    die('node is required')
for f in ['js/cards.js', 'js/scene.js', 'js/panels.js', 'js/view-sync.js', 'js/decks.js', 'js/replay.js', 'js/layout.js',
          'tests/selftest.js', 'tests/run.js', 'index.html', 'css/index.css']:
    if not os.path.exists(p(f)):
        die(f'{f} not found: run this from the repo root')
for f in ['js/game-host.js', 'js/cards.js', 'js/scene.js']:
    read(f)  # records line endings (cards.js and scene.js are rewritten in full)
base, err = run_tests()
if base is None:
    die('could not run the existing tests:\n' + err)
print(f'baseline: {sum(l.startswith(("PASS", "FAIL")) for l in base)} checks, {sum(l.startswith("FAIL") for l in base)} failing already')

# ================================================================ NEW FILES
newfiles['css/theme.css'] = r"""/* theme.css - EVERY tunable look-and-feel value in one place. Reload the page after editing.
   UI colours are used by index.css / screens.css. The "3D" values are read by js/theme.js at start-up:
   colours are #hex, distances are world units (a card is --card-w x --card-d), pairs are "fill line". */
:root {
  /* ---- UI colours ---- */
  --bg: #14161c;
  --fg: #e8eaf0;
  --panel: rgba(20, 22, 28, 0.8);
  --p1-color: #3f7fd8;
  --p2-color: #d4524f;
  --btn: #3f7fd8;
  --btn-go: #2f7d5b;
  --btn-pass: #a8742c;
  --btn-atk: #7a3b3b;
  --btn-atk-on: #c0392b;
  --accent: #3fe07a; /* hover links, drop targets, selected highlight */
  --drop: #3fa66a;
  --splat: #b3121c;

  /* ---- inspector text: greyed = not usable right now, crossed out = disabled, highlighted = the selected stack ability ---- */
  --seg-dim-opacity: 0.38;
  --seg-off-opacity: 0.7;
  --seg-hl-bg: rgba(63, 224, 122, 0.22);

  /* ---- card colours by type ---- */
  --type-creature: #3f7fd8;
  --type-enchantment: #3fa66a;
  --type-spell: #d4524f;
  --type-slow: #8e5bd0; /* Slow spells */
  --type-ability: #b8892b;

  /* ---- 3D scene ---- */
  --scene-bg: #14161c;
  --table-color: #353c4f;
  --pad-dim: #353c4f; /* ground under a half while the OTHER player has priority */
  --pad-lit: #707c9c; /* ... while this player has priority */
  --light-ambient: 0.75;
  --light-sun: 0.6;

  /* ---- zones ---- */
  --zone-opp: #8a4650;
  --zone-opp-back: #6b3a42;
  --zone-p1: #3f5f8f;
  --zone-p1-back: #34507a;
  --side-p1: #2f4466; /* deck / graveyard / exile zones */
  --side-p2: #5e3239;
  --hand-p1: #2a3b57;
  --hand-p2: #4a2a30;
  --zone-valid: #1f6b2f; /* legal target / placement */
  --zone-current: #7a5c14;
  --zone-hover: #44aa55;
  --zone-hover-current: #c99a2a;
  --zone-hover-plain: #333333;
  --cloud-hidden: #07070c; /* King Eye clouds */
  --cloud-own: #07070c;
  --cloud-hot: #16402a;

  /* ---- distances (world units) ---- */
  --tile-w: 2;
  --tile-d: 2.8;
  --col-pitch: 2.3; /* distance between columns */
  --row-pitch: 3.05; /* distance between rows */
  --half-gap: 1.7; /* gap between the two halves of the board */
  --side-x: 7.4; /* how far the deck / graveyard columns stand from the centre */
  --card-w: 1.6;
  --card-d: 2.3;
  --board-rise: 0.45; /* how far the half of the player who has priority rises */
  --attack-raise: 0.2; /* a creature that can attack stands this much higher */

  /* ---- sprites on the cards ---- */
  --badge-size: 0.62; /* power / HP badges */
  --sword-scale: 0.85;
  --sword-height: 0.45;
  --glow-shadow: #ffe27a; /* the pulsing border of a usable card */
  --glow-line: #fff1a8;
  --pw-low: #cd7f32 #5e3410; /* power below / equal to / above the printed value: fill line */
  --pw-same: #cfd3da #4b505b;
  --pw-high: #ffd34d #7a5a00;
  --hp-low: #e04848 #6e1212;
  --hp-same: #3f7fd8 #143672;
  --hp-high: #3fb26a #12522b;
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme='dark']) {
    --bg: #dfe3ea;
    --fg: #1a1d24;
    --panel: rgba(255, 255, 255, 0.85);
  }
}
:root[data-theme='dark'] {
  --bg: #14161c;
  --fg: #e8eaf0;
  --panel: rgba(20, 22, 28, 0.8);
}
"""

newfiles['js/theme.js'] = r"""// theme.js - reads the design variables of css/theme.css, so the 3D scene follows the stylesheet (loaded before everything else)
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const cssStr = (n, d) => cssVar(n) || d;
const cssNum = (n, d) => {
  const v = parseFloat(cssVar(n));
  return isNaN(v) ? d : v;
};
const cssHex = (n, d) => {
  const v = cssVar(n);
  try {
    return v ? new THREE.Color(v).getHex() : d;
  } catch (e) {
    return d;
  }
};
const cssPair = (n, d) => {
  const v = cssVar(n).split(/\s+/).filter(Boolean);
  return v.length === 2 ? v : d;
};
const BOARD_RISE = cssNum('--board-rise', 0.45),
  ATTACK_RAISE = cssNum('--attack-raise', 0.2),
  ZONE_FX = {
    valid: cssHex('--zone-valid', 0x1f6b2f),
    current: cssHex('--zone-current', 0x7a5c14),
    hover: cssHex('--zone-hover', 0x44aa55),
    hoverCurrent: cssHex('--zone-hover-current', 0xc99a2a),
    plain: cssHex('--zone-hover-plain', 0x333333),
  };
"""

newfiles['js/storage.js'] = r"""// storage.js - the only place that touches browser storage. Everything the game saves (decks, replays, panel sizes) goes through Store
// (localStorage). Without localStorage (Node tests, blocked storage) it falls back to memory, so callers never need a try/catch.
const Store = (function () {
  const memStore = {
    m: new Map(),
    getItem(k) {
      return this.m.has(k) ? this.m.get(k) : null;
    },
    setItem(k, v) {
      this.m.set(k, String(v));
    },
    removeItem(k) {
      this.m.delete(k);
    },
    key(i) {
      return [...this.m.keys()][i] ?? null;
    },
    get length() {
      return this.m.size;
    },
  };
  let ls = null;
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem('tpw_probe', '1');
      localStorage.removeItem('tpw_probe');
      ls = localStorage;
    }
  } catch (e) {}
  const S = ls || memStore;
  const get = k => {
      try {
        return S.getItem(k);
      } catch (e) {
        return null;
      }
    },
    set = (k, v) => {
      try {
        S.setItem(k, v);
        return true;
      } catch (e) {
        return false; // storage full or blocked
      }
    },
    del = k => {
      try {
        S.removeItem(k);
      } catch (e) {}
    },
    keys = prefix => {
      const out = [];
      try {
        for (let i = 0; i < S.length; i++) {
          const k = S.key(i);
          if (k != null && k.startsWith(prefix || '')) out.push(k);
        }
      } catch (e) {}
      return out;
    };
  // One-time bridge: the game used to save into cookies. Copy every tpw_* cookie into localStorage, then expire the cookie.
  // (Delete this block once nobody has old cookies any more.)
  if (ls && typeof document !== 'undefined')
    try {
      for (const part of (document.cookie || '').split(';')) {
        const t = part.trim(),
          i = t.indexOf('=');
        if (i < 0 || !t.startsWith('tpw_')) continue;
        const k = t.slice(0, i);
        if (get(k) === null) set(k, t.slice(i + 1));
        if (get(k) !== null) document.cookie = k + '=; max-age=0; path=/; SameSite=Lax';
      }
    } catch (e) {}
  return { get, set, del, keys };
})();
"""

newfiles['js/scene.js'] = r"""//scene.js - Three.js scene, camera, renderer, lights, table (colours and light levels come from css/theme.css)
const scene = new THREE.Scene();
scene.background = new THREE.Color(cssHex('--scene-bg', 0x14161c));
const VW = () => renderer.domElement.clientWidth || innerWidth,
  VH = () => renderer.domElement.clientHeight || innerHeight,
  VX = () => renderer.domElement.getBoundingClientRect().left,
  VY = () => renderer.domElement.getBoundingClientRect().top; // the canvas may be a sub-rectangle of the window (portrait)
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 200);
camera.position.set(3, 29, 22);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false); // CSS sizes the canvas
document.body.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.update();

scene.add(new THREE.AmbientLight(0xffffff, cssNum('--light-ambient', 0.75)));
const sun = new THREE.DirectionalLight(0xffffff, cssNum('--light-sun', 0.6));
sun.position.set(6, 14, 8);
scene.add(sun);

const table = new THREE.Mesh(
  new THREE.BoxGeometry(21, 0.3, 25),
  new THREE.MeshStandardMaterial({ color: cssHex('--table-color', 0x353c4f), roughness: 0.9 })
);
table.position.set(0, -0.25, 0);
scene.add(table);
// Ground under each half: brightens while that player has priority (matches the board lift)
const GROUND_DIM = new THREE.Color(cssHex('--pad-dim', 0x353c4f)),
  GROUND_LIT = new THREE.Color(cssHex('--pad-lit', 0x707c9c)),
  pads = {};
for (const p of ['Player', 'Opponent']) {
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(21, 0.02, 12.5),
    new THREE.MeshStandardMaterial({ color: GROUND_DIM.getHex(), roughness: 0.9 })
  );
  pad.position.set(0, -0.09, p === 'Player' ? 6.25 : -6.25);
  scene.add(pad);
  pads[p] = pad;
}

const zones = [];

const slotZones = {};
"""

# ---- cards.js: the whole file, with a `text` on every trigger / ability / passive / rider and the card text derived from them
newfiles['js/cards.js'] = r"""// cards.js - Effect API (Fx) and card definitions
// ---- Placeholder cards -------------------------------------------------
const themed = typeof cssStr === 'function' ? cssStr : (n, d) => d; // colours come from css/theme.css in the browser; the headless tests use the defaults
const TYPES = {
  creature: { label: 'Creature', color: themed('--type-creature', '#3f7fd8') },
  enchantment: { label: 'Enchantment', color: themed('--type-enchantment', '#3fa66a') },
  spell: { label: 'Spell', color: themed('--type-spell', '#d4524f') },
};
TYPES.ability = { label: 'Ability', color: themed('--type-ability', '#b8892b') };
const SLOW_COLOR = themed('--type-slow', '#8e5bd0'); // Slow spells are purple
const cardColor = def => (def.type === 'spell' && def.timing === 'Slow' ? SLOW_COLOR : TYPES[def.type].color);
// ---- Card shapes: defaults for type / timing / speed, so a card states only what is special about it.
// A spell may give `say` instead of `text`: the text becomes "<Timing>. <say> (Stack HP n)" (the "(Stack HP n)" part is left out at 0 HP).
const spellDef = (timing, id, name, hp, rest = {}) => {
  const { say, ...def } = rest;
  return Object.assign(
    { id, name, type: 'spell', timing, hp },
    say == null ? {} : { text: timing + '. ' + say + (hp ? ' (Stack HP ' + hp + ')' : '') },
    def
  );
};
// ---- Card text is DERIVED from the card's abilities. Every trigger, activated ability, passive and rider carries its own `text`
// (withText); `kw` is the keyword line (Flash, Retaliate...); `body` is the text of a spell / placeholder (its own `text` as authored).
// textParts(def) lists the parts in display order; def.text is those parts joined. The inspector greys / crosses out / highlights single parts.
const withText = (text, o) => Object.assign(o, { text });
function textParts(def) {
  const P = [],
    add = (list, i, o) => o && o.text && P.push({ key: list + ':' + i, list, i, text: o.text });
  if (def.kw) P.push({ key: 'kw', list: 'kw', i: 0, text: def.kw });
  if (def.body) P.push({ key: 'body', list: 'body', i: 0, text: def.body });
  (def.passives || []).forEach((o, i) => add('passives', i, o));
  (def.triggers || []).forEach((o, i) => add('triggers', i, o));
  if (def.rider && def.rider.text) P.push({ key: 'rider', list: 'rider', i: 0, text: def.rider.text });
  (def.abilities || []).forEach((o, i) => add('abilities', i, o));
  if (!P.length && def.text) P.push({ key: 'body', list: 'body', i: 0, text: def.text }); // fixtures and tokens: plain text only
  return P;
}
// =====================================================================
// EFFECT API (content side). Cards may ONLY use these builders; each returns plain
// data naming an operation the Sim publishes (see Sim.API). Mix and match freely.
// =====================================================================
const Fx = {
  // effects (run when a spell/ability resolves)
  dealDamage: (to, amount) => ({ op: 'DealDamage', to, amount }), // to: 'player' | 'target'
  gainLife: (amount, to) => ({ op: 'GainLife', amount, to }), // puts life counters on the controller (default) or on the target card
  draw: (n, who) => ({ op: 'Draw', n, who }),
  damageStack: amount => ({ op: 'DamageStack', amount }),
  sacrificeSelf: () => ({ op: 'SacrificeSelf' }), // also usable as a cost
  repeat: (n, ...effects) => ({ op: 'Repeat', n, effects }), // composition: run effects n times
  // costs (paid on activation)
  payLife: n => ({ op: 'PayLife', n }),
  exileFromGY: n => ({ op: 'ExileFromGY', n }),
  exileSelf: () => ({ op: 'ExileSelf' }), // cost: exile this card from the graveyard
  shiftAdjacent: () => ({ op: 'ShiftAdjacent' }), // effect: controller may move this card to an adjacent empty column
  damageAnother: amount => ({ op: 'DamageAnother', amount }), // effect: controller picks another creature; it takes `amount` effect damage
  removeDamage: n => ({ op: 'RemoveDamage', n }), // effect: remove n damage points from the target; controller picks which instances
  mill: n => ({ op: 'Mill', n }), // effect: target player puts n cards from the top of their deck into the GY
  fetch: card => ({ op: 'FetchFromDeck', card }), // effect: controller adds the named card from their deck to their hand
  doublePower: () => ({ op: 'DoublePower' }), // effect: this card's power x2 (Base layer, lasts while on the field)
  nearestZone: skip => ({ op: 'NearestZone', skip }), // effect: pick the closest zone to this card, skipping zones occupied by 'self' / a card id
  destroyOnZone: () => ({ op: 'DestroyOnZone' }), // effect: destroy whatever stands on the picked zone
  createToken: token => ({ op: 'CreateToken', token }), // effect: create def.tokens[token] on the picked zone, under the controller
  trigger: {
    // triggered abilities: go on the stack when the event happens
    enter: (...effects) => ({ on: 'enter', effects }), // when this card enters the field
    combat: (...effects) => ({ on: 'combat', effects }), // beginning of its controller's combat step
    combatEnd: (...effects) => ({ on: 'combatEnd', effects }), // after its controller's FIRST combat phase of the turn ends (use cond:'firstCombat')
    damaged: (...effects) => ({ on: 'damaged', effects }), // this card takes combat damage
    turnStart: (...effects) => ({ on: 'turnStart', effects }), // start of its controller's turn
    attack: (by, ...effects) => ({ on: 'attack', by, effects }), // by: 'self' and/or 'foe' (creature controlled by this card's opponent)
  },
  // requirements (strings) and targets (strings)
  req: {
    front: 'front',
    hurt: 'hurt',
    target: 'target',
    stack: 'stack',
    foeAttacking: 'foeAttacking',
    attackOnStack: 'attackOnStack',
  },
  target: { opposingFront: 'opposingFront', attacker: 'attacker' },
  zoneTarget: { anyPermanent: 'anyPermanent', anyCreature: 'anyCreature' }, // spell target: a zone with a card (or a cloud) on it, chosen when the spell is played
  playerTarget: true, // spell flag: a player can be targeted (click a life bar)
  rider: { inheritAbilities: () => ({ op: 'InheritAbilities' }) }, // damage this card deals: the victim loses its abilities and gains this card's.
  colTarget: { full: 'fullColumn' }, // spell target: a column (chosen when the spell is played)
  obscure: () => ({ op: 'Obscure' }), // passive: a black cloud covers each of the controller's other zones
  exileColumn: () => ({ op: 'ExileColumn' }), // effect: exile every card on the targeted column
  makeColumnUnusable: () => ({ op: 'MakeColumnUnusable' }), // effect: the targeted column's four zones become unusable for the rest of the game
  returnToHand: () => ({ op: 'ReturnToHand' }), // effect: this spell goes to its owner's hand instead of the graveyard
  modes: (...modes) => ({ op: 'ChooseMode', modes }), // controller picks one mode whose [min,max] foe-creature range fits
  mode: (name, min, max, ...effects) => ({ name, min, max, effects }),
  pickCard: (from, then, amount) => ({ op: 'PickCard', from, then, amount }), // from: foeHand | foeBoard | anyTarget | myCreatures; then: toGY | toHand | damage | summon
  destroyAll: () => ({ op: 'DestroyAll' }),
  drawPerFoeCreature: () => ({ op: 'DrawPerFoeCreature' }),
  vaultFromDeck: n => ({ op: 'VaultFromDeck', n }),
  revealVault: () => ({ op: 'RevealVault' }),
  swapIn: () => ({ op: 'SwapIn' }),
  shieldAll: color => ({ op: 'ShieldAll', color }),
  noLifeGain: () => ({ op: 'NoLifeGain' }),
  aura: (who, atk, hp) => ({ op: 'Aura', who, atk, hp }), // passive: own/foe cards in this card's column and the adjacent columns get +atk/+hp (derived, never stored)
  drawUntil: n => ({ op: 'DrawUntil', n }),
  addAttackDamage: (amount, whose) => ({ op: 'AddAttackDamage', amount, whose }), // effect: adds damage to the topmost Attack object on the stack (whose: 'mine' | 'foe' | 'any')
  noDamage: () => ({ op: 'NoDamage' }), // target creature / stack spell: damage is denied until the end of this turn
  cancelAttack: () => ({ op: 'CancelAttack' }),
  skipFoeCombat: pay => ({ op: 'SkipFoeCombat', pay }),
  secondCombat: () => ({ op: 'SecondCombat' }),
  upTo: (who, from, then, n, types) => ({ op: 'UpTo', who, from, then, n, types }), // who: me|foe; from: gy|hand; then: toHand|play
  placeToken: token => ({ op: 'PlaceToken', token }), // effect: the controller picks a free front zone and puts the token there
  // card shapes (see spellDef above)
  creature: (id, name, atk, hp, rest) => ({ id, name, type: 'creature', atk, hp, ...rest }),
  enchantment: (id, name, hp, rest) => ({ id, name, type: 'enchantment', hp, ...rest }), // any non-creature permanent
  quick: (id, name, hp, rest) => spellDef('Quick', id, name, hp, rest),
  slow: (id, name, hp, rest) => spellDef('Slow', id, name, hp, rest),
  fastAbility: (name, rest) => ({ name, speed: 'Fast', ...rest }), // activated ability; rest: text, zone, req, cost, target, hp, effects
  slowAbility: (name, rest) => ({ name, speed: 'Slow', ...rest }),
};
const Cards = {
  list: [],
  add(factory) {
    const d = factory(Fx);
    if (d.body === undefined && d.text !== undefined) d.body = d.text; // authored text of a spell / placeholder: the part that is not an ability
    d.text = textParts(d)
      .map(x => x.text)
      .join(' '); // the card text is DERIVED from its abilities
    this.list.push(d);
  },
};
const FIXTURES = []; // ability-less cards kept ONLY for headless tests; not part of the game's card pool
const PHC = 'Placeholder creature. No ability yet.',
  PHE = 'Placeholder enchantment. No effect yet.',
  PHS = 'Placeholder Slow spell. No effect yet.';
FIXTURES.push(
  Fx.creature('soldier', 'Soldier', 2, 3, { text: PHC }),
  Fx.creature('knight', 'Knight', 4, 5, { text: PHC }),
  Fx.creature('giant', 'Giant', 6, 8, { text: PHC }),
  Fx.enchantment('barrier', 'Barrier', 2, { text: PHE }),
  Fx.enchantment('aura', 'Aura', 6, { text: PHE }),
  Fx.creature('guard', 'Guard', 1, 6, { text: PHC }),
  Fx.creature('wolf', 'Wolf', 3, 3, { text: PHC }),
  Fx.enchantment('banner', 'Banner', 3, { text: PHE }),
  Fx.enchantment('trap', 'Trap', 1, { text: PHE }),
  Fx.quick('rage', 'Rage', 2, {
    req: ['attackOnStack'],
    text: 'Test Quick spell: the topmost Attack on the stack deals 4 more damage.',
    effects: [Fx.addAttackDamage(4)],
  }),
  Fx.quick('mend', 'Mend', 4, { text: 'Placeholder Quick spell. No effect yet.' }),
  Fx.slow('fireball', 'Fireball', 6, { text: PHS }),
  Fx.slow('rally', 'Rally', 1, { text: PHS }),
  Fx.slow('blast', 'Blast', 5, { text: 'Placeholder Slow spell: only when the stack is empty. No effect yet.' })
);
// ---- The card pool. Each card is an independent module: a factory that receives the API and returns its definition.
// Order matters: it is the order of the 'Full Pool' deck.
Cards.add(Fx =>
  Fx.enchantment('ward', 'Ward', 4, {
    abilities: [
      Fx.fastAbility('Restore', {
        text: 'Fast. You have lost life: sacrifice this card, then gain 3 life. (Stack HP 2)',
        req: [Fx.req.hurt],
        hp: 2,
        effects: [Fx.gainLife(3), Fx.sacrificeSelf()],
      }),
    ],
  })
);
Cards.add(Fx => Fx.quick('heal', 'Heal', 3, { text: 'Quick. Gain 3 life.', effects: [Fx.gainLife(3)] }));
Cards.add(Fx =>
  Fx.quick('zap', 'Zap', 0, {
    text: 'Quick, 0 HP (still resolves). Deal 1 damage to the opponent.',
    effects: [Fx.dealDamage('player', 1)],
  })
);
Cards.add(Fx =>
  Fx.creature('archer', 'Archer', 3, 2, {
    abilities: [
      Fx.slowAbility('Volley', {
        text: 'Slow. Front row: pay 1 life; deal 2 damage to the opponent. (Stack HP 1)',
        req: [Fx.req.front],
        cost: [Fx.payLife(1)],
        hp: 1,
        effects: [Fx.dealDamage('player', 2)],
      }),
    ],
  })
);
Cards.add(Fx =>
  Fx.creature('scout', 'Scout', 1, 1, {
    abilities: [
      Fx.fastAbility('Ambush', {
        text: 'Fast. A creature faces this: sacrifice this card; deal 3 damage to that creature. (Stack HP 0)',
        req: [Fx.req.target],
        cost: [Fx.sacrificeSelf()],
        target: Fx.target.opposingFront,
        hp: 0,
        effects: [Fx.dealDamage('target', 3)],
      }),
    ],
  })
);
Cards.add(Fx =>
  Fx.enchantment('charm', 'Charm', 5, {
    abilities: [
      Fx.slowAbility('Recall', {
        text: 'Slow. Exile your oldest GY card; draw 1. (Stack HP 1)',
        cost: [Fx.exileFromGY(1)],
        hp: 1,
        effects: [Fx.draw(1)],
      }),
    ],
  })
);
Cards.add(Fx =>
  Fx.quick('infinitywall', 'Infinity Wall', 6, {
    colTarget: Fx.colTarget.full,
    say: 'Target a fully filled column: exile every card on it. That column becomes unusable for the rest of the game. Return this card to your hand.',
    effects: [Fx.exileColumn(), Fx.makeColumnUnusable(), Fx.returnToHand()],
  })
);
Cards.add(Fx =>
  Fx.quick('bolt', 'Bolt', 2, {
    req: [Fx.req.stack],
    text: 'Quick. Deal 3 damage to the stack object beneath it (countered at HP -1 or lower).',
    effects: [Fx.damageStack(3)],
  })
);
Cards.add(Fx =>
  Fx.creature('hummingbird', 'Red Hummingbird', 2, 1, {
    triggers: [
      withText('When this enters: draw a card.', Fx.trigger.enter(Fx.draw(1))),
      withText(
        'When this card or an opponent\u2019s creature attacks: you may shift this card to an adjacent empty column.',
        Fx.trigger.attack(['self', 'foe'], Fx.shiftAdjacent())
      ),
    ],
    abilities: [
      Fx.fastAbility('Feather Balm', {
        text: 'Fast, from your GY: exile this card; gain 3 life. (Stack HP 1)',
        zone: 'gy',
        req: [Fx.req.hurt],
        cost: [Fx.exileSelf()],
        hp: 1,
        effects: [Fx.gainLife(3)],
      }),
    ],
  })
);
Cards.add(Fx =>
  Fx.creature('kingeye', 'King Eye', 6, 10, {
    passives: [
      withText(
        'Passive. A black cloud covers each of your other zones: your opponent cannot see those zones or the cards on them. Abilities of cards under a cloud appear to come from King Eye. A cloud is a legal target for anything that targets a card or zone there; the effect passes to what is underneath, and with nothing legal underneath it fizzles (nothing is revealed).',
        Fx.obscure()
      ),
    ],
  })
);
Cards.add(Fx => {
  const spread = Fx.repeat(4, Fx.nearestZone(['self', 'vine-token']), Fx.destroyOnZone(), Fx.createToken('vine'));
  return Fx.creature('vine', 'The Vine', 1, 1, {
    tokens: { vine: Fx.creature('vine-token', 'Vine', 1, 1, { text: 'Token. Vanilla 1/1.' }) },
    triggers: [
      withText(
        'When this enters: 4 times, pick the closest zone not occupied by this card or a Vine token, destroy the card there, and create a Vine token (1/1) on it.',
        Fx.trigger.enter(spread)
      ),
      withText('At the start of your turn: do the same.', Fx.trigger.turnStart(spread)),
    ],
  });
});
Cards.add(Fx =>
  Fx.creature('avatar', 'Avatar of Rabies', 3, 7, {
    triggers: [
      withText(
        'Whenever a creature attacks: you may shift this card to an adjacent empty column.',
        Fx.trigger.attack(['any'], Fx.shiftAdjacent())
      ),
      withText(
        'Whenever this card takes combat damage: deal 1 damage to another creature.',
        Fx.trigger.damaged(Fx.damageAnother(1))
      ),
    ],
    rider: withText(
      'Damage dealt by this card: that creature loses all its original abilities and gains the abilities of Avatar of Rabies.',
      Fx.rider.inheritAbilities()
    ),
  })
);
Cards.add(Fx =>
  Fx.quick('bandages', 'Throwing Bandages', 10, {
    zoneTarget: Fx.zoneTarget.anyPermanent,
    say: 'Target a permanent: remove 7 damage counters from it (7 points, split across its damage instances as you choose).',
    effects: [Fx.removeDamage(7)],
  })
);
Cards.add(Fx =>
  Fx.slow('superbolt', 'Superbolt', 3, {
    zoneTarget: Fx.zoneTarget.anyPermanent,
    playerTarget: Fx.playerTarget,
    say: 'Deal 20 damage to any target (a permanent or a player).',
    effects: [Fx.dealDamage('target', 20)],
  })
);
Cards.add(Fx =>
  Fx.slow('grainfall', 'GrainFall', 2, {
    playerTarget: Fx.playerTarget,
    say: 'Target player mills ten cards.',
    effects: [Fx.mill(10)],
  })
);
Cards.add(Fx =>
  Fx.creature('blackhawk', 'Black Hawk', 1, 0, {
    triggers: [
      withText(
        'At the beginning of your combat step: double this card\u2019s power 5 times.',
        Fx.trigger.combat(Fx.repeat(5, Fx.doublePower()))
      ),
    ],
  })
);
Cards.add(Fx =>
  Fx.creature('boltmaster', 'Bolt Master', 2, 3, {
    triggers: [
      withText('When this enters: add a Superbolt from your deck to your hand.', Fx.trigger.enter(Fx.fetch('superbolt'))),
    ],
  })
);
Cards.add(Fx =>
  Fx.enchantment('heavensun', 'Heaven and Sun', 5, {
    triggers: [
      withText(
        'When this enters: choose 5 cards from your deck and exile them (stack HP 7).',
        Object.assign(Fx.trigger.enter(Fx.vaultFromDeck(5)), { hp: 7 })
      ),
      withText(
        'At the start of your turn: your opponent picks one of those exiled cards; put it into your hand.',
        Fx.trigger.turnStart(Fx.revealVault())
      ),
    ],
  })
);
Cards.add(Fx =>
  Fx.creature('parasite', 'Creeping Parasite', 0, 0, {
    flash: true,
    kw: 'Flash (play it as a Quick spell; it does not use the major action).',
    triggers: [
      withText(
        'When this enters, choose one effect unlocked by the number of creatures your opponent controls. 0: look at their hand and send a card to the GY. 1+: 4 damage to any target. 2+: return a card they control to hand. 3+: put a creature from your hand, GY or exile into play. 4+: draw cards equal to their creature count. 5: destroy all cards on the board.',
        Fx.trigger.enter(
          Fx.modes(
            Fx.mode('0: look at their hand, send a card to the GY', 0, 99, Fx.pickCard('foeHand', 'toGY')),
            Fx.mode('1+: 4 damage to any target', 1, 99, Fx.pickCard('anyTarget', 'damage', 4)),
            Fx.mode('2+: return a card they control to hand', 2, 99, Fx.pickCard('foeBoard', 'toHand')),
            Fx.mode('3+: put a creature from hand, GY or exile into play', 3, 99, Fx.pickCard('myCreatures', 'summon')),
            Fx.mode('4+: draw cards equal to their creature count', 4, 99, Fx.drawPerFoeCreature()),
            Fx.mode('5: destroy all cards on the board', 5, 99, Fx.destroyAll())
          )
        )
      ),
    ],
  })
);
Cards.add(Fx =>
  Fx.creature('shieldguard', 'Shieldguard', 5, 15, {
    retaliate: true,
    kw: 'Retaliate (whenever this takes damage it deals damage equal to its power to the source: the damaging creature, or the controller of the spell).',
    abilities: [
      Fx.fastAbility('Swap In', {
        text: 'Fast, from your hand: after an opposing creature attacks, if you control a creature in that column, return that creature to your hand and put this card into its zone. (Stack HP 1)',
        zone: 'hand',
        req: ['attackedCol'],
        hp: 1,
        effects: [Fx.swapIn()],
      }),
    ],
  })
);
Cards.add(Fx =>
  Fx.quick('spirit', 'Spirit of the Sand', 0, {
    text: 'Quick, 0 HP. Choose one: each card you control gets a red shield counter (cannot be targeted), or each gets a blue shield counter (unaffected by spells and abilities that do not target it; attacks still hit it). You cannot gain life for the rest of the game.',
    effects: [
      Fx.modes(
        Fx.mode('Red shield on each card you control', 0, 99, Fx.shieldAll('red')),
        Fx.mode('Blue shield on each card you control', 0, 99, Fx.shieldAll('blue'))
      ),
      Fx.noLifeGain(),
    ],
  })
);
Cards.add(Fx =>
  Fx.enchantment('wardrum', 'War Drum', 0, {
    flash: true,
    extraCost: { major: true },
    kw: 'Flash. Additional cost (optional, your turn only): spend your major action.',
    tokens: {
      drummer: Fx.creature('drummer-token', 'Drummer', 3, 3, {
        passives: [Fx.aura('own', 1, 1)],
        text: 'Token. Cards you control in this column and the adjacent columns get +1/+1.',
      }),
    },
    passives: [
      withText(
        'Passive: cards your opponent controls in this column and the adjacent columns get -1/-1.',
        Fx.aura('foe', -1, -1)
      ),
    ],
    triggers: [
      withText(
        'When this enters, if the additional cost was paid: put a creature from your GY into play; it attacks immediately.',
        Object.assign(Fx.trigger.enter(Fx.pickCard('myGYCreatures', 'summonAttack')), { cond: 'extraPaid' })
      ),
      withText(
        'When this enters: create a Drummer token (3/3; cards you control in its column and the adjacent ones get +1/+1).',
        Fx.trigger.enter(Fx.placeToken('drummer'))
      ),
    ], // later in the array = higher on the stack = resolves first: the Drummer exists before the creature attacks
  })
);
Cards.add(Fx =>
  Fx.creature('shark', 'Deep Sea Shark', 6, 4, {
    triggers: [
      withText(
        'When this enters: you may pay 3 life; skip your opponent next combat phase (pressing combat becomes End turn instead).',
        Fx.trigger.enter(
          Fx.modes(
            Fx.mode('Pay 3 life: skip opponent next combat', 0, 99, Fx.skipFoeCombat(3)),
            Fx.mode('Do nothing', 0, 99)
          )
        )
      ),
      withText(
        'After your first combat phase ends: you may have your opponent draw 5 cards (cost; does nothing if they cannot); enter a second combat phase, where creatures can attack again.',
        Object.assign(
          Fx.trigger.combatEnd(
            Fx.modes(
              Fx.mode('Opponent draws 5: second combat phase', 0, 99, Fx.secondCombat()),
              Fx.mode('Do nothing', 0, 99)
            )
          ),
          { cond: 'firstCombat' }
        )
      ),
    ],
  })
);
Cards.add(Fx =>
  Fx.quick('intuition', 'Quick Intuition', 4, {
    zoneTarget: Fx.zoneTarget.anyCreature,
    optionalTarget: true,
    stackTarget: true,
    text: 'Quick. Draw until you have 7 cards in hand. You may target a creature or a spell: damage to it is denied until the end of this turn. (Stack HP 4)',
    effects: [Fx.drawUntil(7), Fx.noDamage()],
    abilities: [
      Fx.fastAbility('Cancel Attack', {
        text: 'From your GY, Fast, when your opponent attacks: exile this card; cancel that attack. (Stack HP 1)',
        zone: 'gy',
        req: [Fx.req.foeAttacking],
        cost: [Fx.exileSelf()],
        target: Fx.target.attacker,
        hp: 1,
        effects: [Fx.cancelAttack()],
      }),
    ],
  })
);
Cards.add(Fx =>
  Fx.slow('ambush', 'Ambush of the Night', 0, {
    text: 'Slow, 0 HP. In order: you draw 2; return up to 2 cards from your GY to your hand; put up to 2 creatures/enchantments from your hand into play. Then your opponent returns up to 2 cards from their GY to their hand, puts up to 2 creatures/enchantments from their GY into play, and draws 2.',
    effects: [
      Fx.draw(2),
      Fx.upTo('me', 'gy', 'toHand', 2),
      Fx.upTo('me', 'hand', 'play', 2, ['creature', 'enchantment']),
      Fx.upTo('foe', 'gy', 'toHand', 2),
      Fx.upTo('foe', 'gy', 'play', 2, ['creature', 'enchantment']),
      Fx.draw(2, 'foe'),
    ],
  })
);
const DEFS = Cards.list;
"""

# ================================================================ 1 + 2 + 3 + 4: inspector text parts, stack highlight
P = 'js/panels.js'
rep(P, r"""function showCard(c, pin = true) {""", r"""// ---- The card text as parts (one per trigger / ability / passive / rider, see textParts in cards.js).
// cls: ''    normal
//      'dim' GREYED OUT = not usable from where the card is right now (or, with a stack ability selected: not that ability)
//      'off' CROSSED OUT = disabled (Avatar of Rabies took the card's abilities away; the new ones are added after them)
//      'hl'  the ability selected on the stack
const partOn = (c, p, def) => {
  // usable from the card's current location? (location only: priority, timing and costs are not considered)
  if (p.list === 'passives' || p.list === 'rider') return c.loc === 'board';
  if (p.list === 'triggers') {
    const t = def.triggers[p.i];
    return t.on === 'enter' ? c.loc !== 'board' : c.loc === (t.zone || 'board'); // a permanent cannot enter the board from the board
  }
  if (p.list === 'abilities') return c.loc === (def.abilities[p.i].zone || 'board');
  return true; // keywords and the text of a spell
};
function cardParts(c, H) {
  const sc = (H && game.cards[H.src]) || c,
    base = sc.def,
    eff = sc.loc === 'board' ? Sim.abDef(sc) : base,
    swapped = eff.id !== base.id;
  const add = (out, def, off, onlyAb) => {
    for (const p of textParts(def)) {
      const ab = p.list !== 'kw' && p.list !== 'body';
      if (onlyAb && !ab) continue;
      const hit = !!H && def.id === H.from && p.list === H.list && p.i === H.i;
      out.push({
        text: p.text,
        cls: hit ? 'hl' : H ? 'dim' : off && ab ? 'off' : partOn(sc, p, def) ? '' : 'dim',
      });
    }
    return out;
  };
  let out = add([], base, swapped, false); // the printed abilities: crossed out when replaced
  if (swapped) add(out, eff, false, true); // ...and the ones that replaced them
  if (H && !out.some(x => x.cls === 'hl')) {
    // the selected object came from abilities the card has lost since (its Avatar damage was removed): show the text it came from
    const fd = DEFS.find(x => x.id === H.from);
    if (fd) out = add([], fd, false, false);
  }
  return out;
}
function partsInto(p, parts) {
  p.textContent = '';
  parts.forEach((x, i) => {
    const s = document.createElement('span');
    s.className = 'seg' + (x.cls ? ' ' + x.cls : '');
    s.textContent = x.text;
    s.title = { off: 'Disabled (crossed out)', dim: 'Not usable right now (greyed out)' }[x.cls] || '';
    p.appendChild(s);
    if (i < parts.length - 1) p.appendChild(document.createTextNode(' '));
  });
}
function showCard(c, pin = true, hl = null) {""", 'panels: cardParts / partsInto / showCard signature')
rep(P, r"""    ui.selected = c;
    ui.selP = null;
  }
  deckPanel""", r"""    ui.selected = c;
    ui.selP = null;
    ui.selHl = hl;
  }
  const H = c === ui.selected ? ui.selHl : null, // a selected stack ability: its text is highlighted, the rest greyed out
    parts = cardParts(c, H);
  deckPanel""", 'panels: showCard computes the highlight and the parts')
rep(P, r"""    (cloudMap_(c) ? 'cloud' : '');
  if (inspect.hidden || inspect.dataset.key !== key) {""", r"""    (cloudMap_(c) ? 'cloud' : '') +
    '|' +
    JSON.stringify(H) +
    JSON.stringify(parts);
  if (inspect.hidden || inspect.dataset.key !== key) {""", 'panels: inspector key includes the text parts')
rep(P, r"""    inspect.querySelector('p').textContent = d.text;""", r"""    partsInto(inspect.querySelector('p'), parts);""", 'panels: text rendered from the parts')
rep(P, r"""inspect.style.setProperty('--tc', p === 'Player' ? '#3f7fd8' : '#d4524f');""", r"""inspect.style.setProperty('--tc', p === 'Player' ? 'var(--p1-color)' : 'var(--p2-color)');""", 'panels: player colours from theme.css')
rep('js/game-host.js', r"""  selected: null,
  hovered: null,""", r"""  selected: null,
  selHl: null, // the stack ability selected in the inspector: {from, list, i, src} (its text is highlighted)
  hovered: null,""", 'game-host: ui.selHl')
rep('js/view-sync.js', r"""        : showCard(c);""", r"""        : showCard(c, true, o.kind === 'ability' && !mk ? { from: o.from, list: o.list, i: o.ab, src: o.src } : null);""", 'view-sync: clicking a stack ability highlights its text')

# ================================================================ 4. theme variables wired into the 3D code
V = 'js/view-sync.js'
rep(V, r"""const t = p === game.priority ? 0.45 : 0;""", r"""const t = p === game.priority ? BOARD_RISE : 0;""", 'view-sync: board rise')
rep(V, r"""lift[p] / 0.45);""", r"""(lift[p] / BOARD_RISE) || 0);""", 'view-sync: board rise (ground colour)')
rep(V, r"""0.11 + (Sim.canAttack(game, c) ? 0.2 : 0),""", r"""0.11 + (Sim.canAttack(game, c) ? ATTACK_RAISE : 0),""", 'view-sync: attack raise')
rep(V, r"""(m.userData.baseEm ? 0x44aa55 : 0x333333)""", r"""(m.userData.baseEm ? ZONE_FX.hover : ZONE_FX.plain)""", 'view-sync: hover colours')
rep(V, r"""z.userData.baseEm = valid.includes(z) ? (cur ? 0x7a5c14 : 0x1f6b2f) : 0;""", r"""z.userData.baseEm = valid.includes(z) ? (cur ? ZONE_FX.current : ZONE_FX.valid) : 0;""", 'view-sync: valid-zone colours')
rep(V, r"""z.userData.hoverEm = cur ? 0xc99a2a : 0;""", r"""z.userData.hoverEm = cur ? ZONE_FX.hoverCurrent : 0;""", 'view-sync: current-zone hover colour')

CV = 'js/card-view.js'
rep(CV, r"""const CW = 1.6,
  CD = 2.3,
  cardGeo""", r"""const CW = cssNum('--card-w', 1.6),
  CD = cssNum('--card-d', 2.3),
  cardGeo""", 'card-view: card size')
rx(CV, r"const PW_PAL = \[.*?badgeGeo = new THREE\.PlaneGeometry\(0\.62, 0\.62\);", r"""const PW_PAL = [
    cssPair('--pw-low', ['#cd7f32', '#5e3410']),
    cssPair('--pw-same', ['#cfd3da', '#4b505b']),
    cssPair('--pw-high', ['#ffd34d', '#7a5a00']),
  ],
  HP_PAL = [
    cssPair('--hp-low', ['#e04848', '#6e1212']),
    cssPair('--hp-same', ['#3f7fd8', '#143672']),
    cssPair('--hp-high', ['#3fb26a', '#12522b']),
  ],
  badgeTex = {},
  badgeGeo = new THREE.PlaneGeometry(cssNum('--badge-size', 0.62), cssNum('--badge-size', 0.62));""", 'card-view: badge palettes and size')
rep(CV, r"""    g.scale.setScalar(0.85);
    g.position.set(0, 0.45, 0);""", r"""    g.scale.setScalar(cssNum('--sword-scale', 0.85));
    g.position.set(0, cssNum('--sword-height', 0.45), 0);""", 'card-view: sword size and height')
rep(CV, r"""g.shadowColor = '#ffe27a';""", r"""g.shadowColor = cssStr('--glow-shadow', '#ffe27a');""", 'card-view: glow shadow colour')
rep(CV, r"""g.strokeStyle = '#fff1a8';""", r"""g.strokeStyle = cssStr('--glow-line', '#fff1a8');""", 'card-view: glow line colour')

B = 'js/board.js'
rx(B, r"const TILE_W = 2,.*?PLY_D = 0x34507a;", r"""const TILE_W = cssNum('--tile-w', 2),
  TILE_D = cssNum('--tile-d', 2.8),
  PX = cssNum('--col-pitch', 2.3),
  PZ = cssNum('--row-pitch', 3.05);
const OPP = cssHex('--zone-opp', 0x8a4650),
  OPP_D = cssHex('--zone-opp-back', 0x6b3a42),
  PLY = cssHex('--zone-p1', 0x3f5f8f),
  PLY_D = cssHex('--zone-p1-back', 0x34507a);""", 'board: tile sizes and zone colours')
rep(B, r"""const GAP = 1.7;""", r"""const GAP = cssNum('--half-gap', 1.7);""", 'board: gap between the halves')
rep(B, r"""const SX = 7.4,""", r"""const SX = cssNum('--side-x', 7.4),""", 'board: side zone distance')
rep(B, r"""side('Player', 3, 2, 1, 0x2f4466);""", r"""side('Player', 3, 2, 1, cssHex('--side-p1', 0x2f4466));""", 'board: side colour P1')
rep(B, r"""side('Opponent', 0, 1, -1, 0x5e3239);""", r"""side('Opponent', 0, 1, -1, cssHex('--side-p2', 0x5e3239));""", 'board: side colour P2')
rep(B, r"""makeZone('Player Hand', 'Hand', HAND_W, HAND_D, 0x2a3b57, 0, HZ, null, 0);""", r"""makeZone('Player Hand', 'Hand', HAND_W, HAND_D, cssHex('--hand-p1', 0x2a3b57), 0, HZ, null, 0);""", 'board: hand colour P1')
rep(B, r"""makeZone('Opponent Hand', 'Hand', HAND_W, HAND_D, 0x4a2a30, 0, -HZ, null, Math.PI);""", r"""makeZone('Opponent Hand', 'Hand', HAND_W, HAND_D, cssHex('--hand-p2', 0x4a2a30), 0, -HZ, null, Math.PI);""", 'board: hand colour P2')
rep(B, r"""cloudHide = new THREE.MeshBasicMaterial({ color: 0x07070c }),""", r"""cloudHide = new THREE.MeshBasicMaterial({ color: cssHex('--cloud-hidden', 0x07070c) }),""", 'board: cloud colour')
rep(B, r"""cloudOwn = new THREE.MeshBasicMaterial({ color: 0x07070c, transparent: true, opacity: 0.4, depthWrite: false }),""", r"""cloudOwn = new THREE.MeshBasicMaterial({
    color: cssHex('--cloud-own', 0x07070c),
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  }),""", 'board: own cloud colour')
rep(B, r"""cloudHot = new THREE.MeshBasicMaterial({ color: 0x16402a }),""", r"""cloudHot = new THREE.MeshBasicMaterial({ color: cssHex('--cloud-hot', 0x16402a) }),""", 'board: hot cloud colour')

# CSS: variables out of index.css, hard-coded colours replaced by variables
rx('css/index.css', r""":root \{\n  --bg: #14161c;.*?:root\[data-theme='dark'\] \{\n  --bg: #14161c;\n  --fg: #e8eaf0;\n  --panel: rgba\(20, 22, 28, 0\.8\);\n\}\n""", "/* every colour, distance and sprite setting lives in css/theme.css */\n", 'index.css: variable blocks moved to theme.css')
rep('css/index.css', r""".abtn {
  background: #3f7fd8;""", r""".abtn {
  background: var(--btn);""", 'index.css: button colour')
rep('css/index.css', r"""background: #2f7d5b;""", r"""background: var(--btn-go);""", 'index.css: go button')
rep('css/index.css', r"""background: #a8742c;""", r"""background: var(--btn-pass);""", 'index.css: pass button')
rep('css/index.css', r"""background: #7a3b3b;""", r"""background: var(--btn-atk);""", 'index.css: attack button')
rep('css/index.css', r"""background: #c0392b;""", r"""background: var(--btn-atk-on);""", 'index.css: attack-on button')
rep('css/index.css', r""".hpr[data-p='Player'] i {
  background: #3f7fd8;""", r""".hpr[data-p='Player'] i {
  background: var(--p1-color);""", 'index.css: P1 life bar')
rep('css/index.css', r""".hpr[data-p='Opponent'] i {
  background: #d4524f;""", r""".hpr[data-p='Opponent'] i {
  background: var(--p2-color);""", 'index.css: P2 life bar')
repall('css/index.css', '#3fe07a', 'var(--accent)', 'index.css: accent colour')
repall('css/index.css', '#3fa66a', 'var(--drop)', 'index.css: drop colour')
repall('css/index.css', '#b3121c', 'var(--splat)', 'index.css: splat colour')
repall('css/screens.css', '#3fe07a', 'var(--accent)', 'screens.css: accent colour')
append('css/index.css', r"""/* ---- inspector text parts: greyed = not usable right now, crossed out = disabled, highlighted = the selected stack ability ---- */
.seg {
  transition: opacity 0.15s;
}
.seg.dim {
  opacity: var(--seg-dim-opacity);
}
.seg.off {
  opacity: var(--seg-off-opacity);
  text-decoration: line-through;
}
.seg.hl {
  background: var(--seg-hl-bg);
  border-radius: 4px;
  box-shadow: 0 0 0 2px var(--seg-hl-bg);
}""", 'index.css: text part styles')

# index.html: theme.css, theme.js, storage.js
rep('index.html', r"""<link rel="stylesheet" href="css/index.css">""", r"""<link rel="stylesheet" href="css/theme.css">
<link rel="stylesheet" href="css/index.css">""", 'index.html: theme.css')
rep('index.html', r"""<script src="js/scene.js"></script>""", r"""<script src="js/theme.js"></script>
<script src="js/storage.js"></script>
<script src="js/scene.js"></script>""", 'index.html: theme.js and storage.js')

# ================================================================ 5. CI: Node 24 actions
W = '.github/workflows/static.yml'
rep(W, r"""uses: actions/checkout@v4""", r"""uses: actions/checkout@v5""", 'ci: actions/checkout v5 (Node 24 runtime)', count=2)
rep(W, r"""uses: actions/setup-node@v4""", r"""uses: actions/setup-node@v5""", 'ci: actions/setup-node v5 (Node 24 runtime)')
rep(W, r"""node-version: 20""", r"""node-version: 24""", 'ci: run the tests on Node 24')

# ================================================================ 6. cookies -> localStorage
rep('tests/run.js', r"""'js/decks.js'""", r"""'js/storage.js', 'js/decks.js'""", 'tests/run.js: load storage.js')
rep('js/decks.js', r"""// decks.js - Deck store (cookies), default decks, deck validation, fuzzy card search (no THREE; the only DOM use is document.cookie)""", r"""// decks.js - Deck store (localStorage through Store), default decks, deck validation, fuzzy card search (no THREE, no DOM)""", 'decks: header')
rx('js/decks.js', r"const DeckStore = \(function \(\) \{.*?\n\}\)\(\);\n", r"""const DeckStore = (function () {
  const PRE = 'tpw_deck_',
    known = new Set(DEFS.map(d => d.id));
  const skey = n =>
    PRE + encodeURIComponent(n).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const clean = ids =>
    ids
      .filter(id => known.has(id))
      .filter((id, i, a) => a.indexOf(id) === i)
      .slice(0, DECK_MAX);
  function fromStore() {
    const out = [];
    for (const k of Store.keys(PRE))
      try {
        out.push({
          name: decodeURIComponent(k.slice(PRE.length)),
          cards: clean(
            decodeURIComponent(Store.get(k) || '')
              .split(',')
              .filter(Boolean)
          ),
        });
      } catch (e) {}
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }
  const list = () => BUILTIN_DECKS.concat(fromStore());
  return {
    list,
    find: name => list().find(d => d.name === name) || null,
    nameUsed: name => list().some(d => d.name === name),
    remove: name => Store.del(skey(name)),
    save: (name, cards) => Store.set(skey(name), encodeURIComponent(clean(cards).join(','))),
  };
})();
""", 'decks: DeckStore on Store')
rep('js/replay.js', r"""// Saved to cookies when a duel is left (the newest 5), listed and played back from the main menu.
// Storage: one small meta cookie per replay (tpw_rpm_<id>) and the data (JSON, deflated, base64url) in chunks (tpw_rp_<id>_<k>).""", r"""// Saved to localStorage when a duel is left (the newest 5), listed and played back from the main menu.
// Storage: one small meta entry per replay (tpw_rpm_<id>) and the data (JSON, deflated, base64url) in chunks (tpw_rp_<id>_<k>).""", 'replay: header')
rx('js/replay.js', r"  const MAX = 5,.*?mem = new Map\(\); // fallback[^\n]*\n", r"""  const MAX = 5,
    CHUNK = 500000, // characters per storage entry (replays saved as cookies were chunked at 3600 and still load)
    MAXCHUNKS = 4, // a longer duel is not saved
    PM = 'tpw_rpm_',
    PD = 'tpw_rp_',
    mem = new Map(); // the replays saved in this session (used when storage is full or blocked)
""", 'replay: constants')
rx('js/replay.js', r"  const jar = \(\) => \{.*?(?=  // ---- packing)", r"""  const jar = () => Store.keys('tpw_').map(k => [k, Store.get(k)]),
    setC = (k, v) => Store.set(k, v),
    delC = k => Store.del(k);
""", 'replay: jar / setC / delC on Store')
rep('js/replay.js', r"""    chunks.forEach((x, k) => setC(PD + id + '_' + k, x));""", r"""    if (!chunks.every((x, k) => setC(PD + id + '_' + k, x))) {
      chunks.forEach((x, k) => delC(PD + id + '_' + k)); // storage full: leave nothing half-written
      return false;
    }""", 'replay: a failed write leaves nothing behind')
rep('js/layout.js', r"""// to resize them. The sizes (% of the screen height) are kept in a cookie.""", r"""// to resize them. The sizes (% of the screen height) are kept in localStorage.""", 'layout: header')
rx('js/layout.js', r"  function load\(\) \{\n    let raw = '';.*?const \[t, b\] = decodeURIComponent\(part\.slice\(KEY\.length \+ 1\)\)", r"""  function load() {
    const raw = Store.get(KEY);
    if (!raw) return;
    const [t, b] = decodeURIComponent(raw)""", 'layout: load from Store')
rx('js/layout.js', r"  function save\(\) \{.*?\n  \}\n  function handle", r"""  function save() {
    Store.set(KEY, size.top.toFixed(1) + '|' + size.bot.toFixed(1));
  }
  function handle""", 'layout: save to Store')

# ================================================================ tests
rep('tests/selftest.js', r"""  out.push(
    '---- ' +""", r"""  // ================= Patch 4: card text derived from abilities, Store =================
  {
    const hb = DEFS.find(d => d.id === 'hummingbird'),
      parts = textParts(hb);
    eq(
      'card text is derived from the abilities: Red Hummingbird = 2 triggers, then 1 ability',
      parts.map(x => x.key),
      ['triggers:0', 'triggers:1', 'abilities:0']
    );
    check('...and def.text is exactly those parts joined', hb.text === parts.map(x => x.text).join(' '));
    const wd = textParts(DEFS.find(d => d.id === 'wardrum'));
    check(
      'War Drum: its two enter triggers have different texts (the stack inspector highlights one of them)',
      wd.filter(x => x.list === 'triggers').length === 2 && new Set(wd.map(x => x.text)).size === wd.length
    );
    const miss = DEFS.filter(d => [...(d.triggers || []), ...(d.abilities || []), ...(d.passives || [])].some(o => !o.text)).map(
      d => d.id
    );
    check('every trigger, ability and passive of every pool card has its own text', !miss.length, miss.join());
    check(
      'every pool card has a derived text; Avatar\u2019s rider is a part of its own',
      DEFS.every(d => d.text && d.text.length > 10) &&
        textParts(DEFS.find(d => d.id === 'avatar')).some(x => x.list === 'rider')
    );
    Store.set('tpw_zz_probe', 'a|b');
    const got = [Store.get('tpw_zz_probe'), Store.keys('tpw_zz_').length];
    Store.del('tpw_zz_probe');
    eq('Store: set / get / keys / del', [...got, Store.get('tpw_zz_probe')], ['a|b', 1, null]);
  }
  out.push(
    '---- ' +""", 'tests: Patch 4 checks')

# ================================================================ docs
rep('README.md', r"""phone panel resizing (cookie), panels, menu, deck editor, duel replays (cookies)""", r"""phone panel resizing (localStorage), panels, menu, deck editor, duel replays (localStorage)""", 'README: storage wording')
rep('README.md', r"""- `js/main.js` console hook and render loop""", r"""- `css/theme.css` every colour, distance and sprite setting as a CSS variable; `js/theme.js` reads them for the 3D scene; `js/storage.js` the only code that touches localStorage
- `js/main.js` console hook and render loop""", 'README: theme and storage files')
append('Docs/effects.md', r"""
## Card text
The text of a card is **derived** from its abilities: every trigger, activated ability, passive and rider carries its own `text` (`withText(text, trigger)` in `cards.js`), a keyword line is `kw`, the text of a spell is `body`. `textParts(def)` lists the parts in display order and `def.text` is those parts joined (`Cards.add` builds it). The inspector shows every part separately:
- **greyed out** = not usable from where the card is right now (enter trigger on the board, attack trigger anywhere but the board, a `zone:'gy'` ability anywhere but the GY, a passive off the board);
- **crossed out** = disabled: Avatar of Rabies replaced the abilities (the new ones are listed after the old ones);
- **highlighted** (the rest greyed) = the ability you selected on the stack.""", 'effects.md: card text')

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
print('\nDone. Run `npm run format`, review with `git diff --stat`, open index.html once to check the inspector, then commit. Nothing was committed.')

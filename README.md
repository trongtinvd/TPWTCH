# TPWTCH

Offline single-player **3D tactical deck-building card game** (inspired by Yu-Gi-Oh!/MTG): positional board, shared stack, PvE NPCs that each play differently.
Status: early design/prototyping; rules will change.

## Pitch
Pick a **story** (series of **stages**). Each stage is a duel vs an NPC with narrative, personality, and sometimes unique rules ("gimmicks") listed in the stage description (solution discoverable; brute force/alternatives allowed). Losing has no permanent cost: retry. Beating stories unlocks more (one available at start).

## Differentiators
- **Positional combat:** 5 columns, 20 zones; attacks go down a column (front -> back -> player).
- **One major action/turn:** draw two, OR summon/Slow spell, OR attack. Abilities and Quick spells are free.
- **Distance/Speed/Acceleration turn order:** no fixed alternation; streaks possible.
- **Shared stack** with HP-based countering.
- **Composable cards:** data built from effect primitives, no per-card engine code.
- **Planning AI:** simulation-based, belief model, personality weight vectors.

## Design goals
Meaningful positioning; composable interactions; unusual/NPC-exclusive cards; distinct (not just stronger) opponents; AI that reasons about future states; deterministic sim for large-scale runs; rules separate from 3D presentation; scalable card pool; informative losses.

## Central risk
Many independent systems (position, stack, card HP, zone HP, base stats, D/S/A, hidden info, real-time input, gimmicks, predictive AI) are hard to teach/balance. Needs one clear central skill identity (OPEN_QUESTIONS Q18).

## Tech
Godot (final presentation); three.js board prototype to validate rules/feel. Principle: **rules are data + simulation, not engine presentation code.**

## Files (`Docs/`)
- `README.md` overview, goals, risk
- `RULES.md` current rules
- `ARCHITECTURE.md` sim/presentation split, systems, AI, risks
- `effects.md` effect system as implemented in the prototype
- `OPEN_QUESTIONS.md` rules to settle before the card pool grows
- `ROADMAP.md` phases
- `CONTRIBUTING.md` ground rules
- `game_design_document.txt` card texts and detailed rule notes not covered elsewhere

## Code
Plain scripts loaded in order by `index.html` (no build step):
- `js/cards.js` Fx effect API + card definitions - `js/sim/*.js` rules (no THREE/DOM; `kernel.js` scaffold, one file per concern and per registry: `ops.js` effects, `costs.js`, `reqs.js`, `targeting.js`, `cond.js` conditions / triggers / passives, `ch.js`, `then.js`; `index.js` is the public `Sim` facade, `validate.js` checks cards against `Sim.API`) - `js/decks.js` deck store, validation, search - `js/bot.js` bot
- `js/scene.js`, `js/board.js`, `js/card-view.js`, `js/view-sync.js` three.js scene, board, card meshes, state -> mesh sync
- `js/game-host.js`, `js/input.js`, `js/layout.js`, `js/panels.js`, `js/menu.js`, `js/deck-editor.js`, `js/replay.js` host and UI state, pointer input, phone panel resizing (localStorage), panels, menu, deck editor, duel replays (localStorage)
- `css/theme.css` every colour, distance and sprite setting as a CSS variable; `js/theme.js` reads them for the 3D scene; `js/storage.js` the only code that touches localStorage
- `js/main.js` console hook and render loop
- `tests/selftest.js` headless rules tests, `tests/run.js` runs them in Node

## Running the tests
`node tests/run.js` (Node 18+, no dependencies). The same tests run in the browser console with `cardGame.selfTest()`.
`npx prettier --write js css tests` formats the code (see `.prettierrc.json`).

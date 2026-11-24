# TPWTCH

Offline single-player **3D tactical deck-building card game** (inspired by Yu-Gi-Oh!/MTG): positional board, shared stack, PvE NPCs that each play differently.
Status: early design/prototyping; rules will change.

## Pitch

Pick a **story** (series of **stages**). Each stage is a duel vs an NPC with narrative, personality, and sometimes unique rules ("gimmicks") listed in the stage description (solution discoverable; brute force/alternatives allowed). Losing has no permanent cost: retry. Beating stories unlocks more (one available at start).

## Differentiators

- **Positional combat:** 5 columns, 20 zones; attacks go down a column (front -> back -> player).
- **Action points:** one per own turn, unspent ones stay (shown as stars under the life bar). An action point pays for: draw two, OR summon/Slow spell, OR attack. Abilities and Quick spells are free (some cards spend points too).
- **Extra deck:** purple creatures with `materials` and `conditions` fields, summoned by Fusion cards.
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

- `RULES.md` current rules
- `ARCHITECTURE.md` sim/presentation split, systems, AI, risks
- `effects.md` effect system as implemented in the prototype
- `OPEN_QUESTIONS.md` rules to settle before the card pool grows
- `ANIMATION_3D.md` the 3D side view; `animationGuide.md` how to add GLB models, animations and camera moves
- `CAMERA.md` camera settings; `AVATARS.md` player avatars

## Code

Plain scripts loaded in order by `index.html` (no build step):

Folders under `js/`:

- `js/core/` `theme.js` (reads `css/theme.css` for the 3D scene), `storage.js` (the only code that touches localStorage), `settings.js`
- `js/content/` `cards.js` Fx effect API + card definitions, `decks.js` deck store, validation, search
- `js/sim/*.js` rules (no THREE/DOM; `kernel.js` scaffold, one file per concern and per registry: `ops.js` effects, `costs.js`, `reqs.js`, `targeting.js`, `cond.js` conditions / triggers / passives, `ap.js` action points, `fusion.js` / `choices.js` extra deck flows, `ch.js`, `then.js`; `index.js` is the public `Sim` facade, `validate.js` checks cards against `Sim.API`, `observe.js` per-player Observations, `options.js` a player's legal options for the bot, `turn.js` the turn state machine)
- `js/game/` `game-host.js` host and UI state (send, automation, buttons), `input.js` pointer input, `bot.js` the bot (decides from `Sim.optionsFor` only)
- `js/log/` `narrate.js` the per-player story log (no DOM; the Node tests load it to check the logs for leaks), `gamelog.js` the log panel (back of the stack panel)
- `js/view/` `scene.js`, `board.js`, `card-view.js` (card meshes, card back), `view-sync.js` (state -> meshes, pile tops), `panels.js`, `layout.js` (phone panel resizing), `stops-bar.js` (the stop icons)
- `js/screens/` `menu.js` (main menu, start dialog, settings), `character-select.js` (the character selection scene), `deck-editor.js`, `replay.js` (duel replays), `result.js` (rematch / continue / leave)
- `js/avatar/` player avatars: `avatar-logic.js` (pure), `avatar-catalog.js`, `avatar-models.js`, `avatar-icons.js`, `avatar-view.js`; configs `config/avatars.json`, `config/stats.json`; guide `Docs/AVATARS.md`
- `js/main.js` console hook and render loop
- `css/theme.css` every colour, distance and sprite setting as a CSS variable
- `tests/harness.js` + `tests/suites/*.js` headless rules tests, `tests/run.js` runs them in Node

## Running the tests

`node tests/run.js` (Node 18+, no dependencies). The same tests run in the browser console with `cardGame.selfTest()`.
`npm run format` formats the code (see `.prettierrc.json`); CI runs `npm run format:check`.

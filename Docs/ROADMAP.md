# Roadmap

| Phase | Focus | Contents |
|---|---|---|
| 0 | Board prototype (three.js) | Playable hot-seat board to test feel/rules before Godot. **Largely built and ahead of this scope (below).** |
| 1 | Rules core | GameState, players, board, zones, card instances, HP, ATK, basic effects/turns. |
| 2 | Combat and stack | Attack, damage, column trample, stack, priority, Quick/Slow/Flash, abilities, triggers. (Prototype already has a first version.) |
| 3 | Modifier/rule system | Effective stats, temp modifiers, ability layers, zone/column restrictions, rule queries, precedence. |
| 4 | Content | Few rule-stressing cards (see `game_design_document.txt`): The Vine, Infinity Wall, Fracture Ground, Maximum Damage, King Eye, Avatar of Rabies, Throwing Bandages, The Seven Steves, Parriable. **Built so far:** The Vine, Infinity Wall, King Eye, Avatar of Rabies, Throwing Bandages. Do **not** mass-produce yet. |
| 5 | Presentation (Godot) | 3D board, card/creature/character views, animation, VFX, UI. |
| 6 | AI | Observation, belief model, greedy AI, state evaluation, personality vectors, search planner (advanced search only if profiling justifies). |
| 7 | Simulation lab | Headless sim, replay, stats, tournaments, personality generation, balance tests. |
| 8 | Campaign | Stories, stages, NPC decks, NPC-only cards, gimmicks, narrative. |

## Phase 0: original scope vs what exists
Original scope: 5 columns, hand of 5, deck/GY/exile/stack, colour-coded cards, drag to play, click deck to draw, 100 HP, attack button, four one-ability cards, switch-player button.

**Built (`Card Game Board Prototype.html`, single file, three.js r128):**
- **Sim/view split.** `Sim` is pure data + functions (`create`, `dispatch`, `canPlay/canActivate/canAttack`, `hasAction`, `statuses`, `hpOf`), no THREE/DOM; the view only calls `send(command)`. `cardGame.selfTest()` runs headless tests (about 200 checks). See `effects.md`, `ARCHITECTURE.md`.
- **Board:** 5x4 zones, hands, Deck/GY/Extra Deck/Exile zones, **life 20** (not 100). Default camera is a top-down orthographic view (toggle to a side view with orbit); the seat camera flips for Player 2.
- **Deck-building phase** (reorder own deck by drag or arrows, then Start), seeded shuffle, singleton 21-card decks, opening hand of 5.
- **Turn flow:** Draw 2 button, attack-phase toggle, End turn, Pass; one major action per turn; priority-based stack with a stack panel (yours left, opponent's right); response windows (entered, end step, attack declared).
- **Colours:** blue creature, green non-creature (enchantment), red Quick spell, purple Slow spell, gold ability/trigger tokens.
- **Playing cards:** drag a hand card (permanents onto a highlighted zone, spells onto the board or stack panel), or click a card for a menu (Play / Attack / abilities incl. hand abilities) and click a zone. Usable cards glow. Choices (Parasite targets, shift, swap, place) are answered by clicking highlighted cards, zones or life bars.
- **Inspectors:** hover/click a card for its panel (stats, text, damage instances, **statuses** put on it by other cards); hover/click a life bar for the **player panel** (life, piles, damage taken, life counters, life paid). Only one panel shows at a time.
- **Showcase animations** when something enters/leaves the stack (input waits; the screen shows the previous state until it ends); turn-change banners with the camera turning to the right seat.
- **Hover links:** hovering a stack entry, a card, or a life bar highlights related objects with arrows.
- **Debug buttons:** Auto turn, Actions (off / normal / always automation of passes and end turn), Reset game, Switch player (a manual switch holds until priority moves on), Auto view, Undo (state snapshots; generated tokens are removed too).
- **Cards (21):** see `effects.md`. Keywords: Flash, Retaliate; Fast/Slow abilities, GY and hand abilities, shields, life counters.

**Not built:** Distance/Speed/Acceleration, player stats, win/loss, modifiers/layers, zone HP, observation filtering beyond King Eye and reveals, input windows, Fracture Ground / Maximum Damage / Seven Steves / Parriable, AI, replays. Three.js art is generated per card name (simple primitive models).

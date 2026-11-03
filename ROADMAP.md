# Roadmap

| Phase | Focus | Contents |
|---|---|---|
| 0 | **Board prototype (three.js)** | Fast, playable hot-seat board to test feel and rules before committing to Godot. |
| 1 | Rules core | GameState, players, board, zones, card instances, HP, ATK, basic effects, basic turns. |
| 2 | Combat and stack | Attack, damage, column trample, stack, priority, Quick/Slow, abilities, triggers. |
| 3 | Modifier / rule system | Effective stats, temporary modifiers, ability layers, zone/column restrictions, rule queries, precedence. |
| 4 | Content | A handful of rule-stressing cards: The Vine, Infinity Wall, Fracture Ground, Maximum Damage, King Eye, Avatar of Rabies, Throwing Bandages, The Seven Steves, Parriable. Do **not** mass-produce cards yet. |
| 5 | Presentation (Godot) | 3D board, card/creature/character views, animation, VFX, UI. |
| 6 | AI | Observation, belief model, greedy AI, state evaluation, personality vectors, search planner. |
| 7 | Simulation lab | Headless sim, replay, statistics, tournaments, personality generation, balance tests. |
| 8 | Campaign | Stories, stages, NPC decks, NPC-only cards, explicit gimmicks, narrative. |

## Phase 0 prototype scope

- Board with 5 columns, hand of 5, deck / graveyard / exile / stack zones for both players.
- Card colours: blue creature, green non-creature, red spell.
- Drag blue to a front slot, green to a back slot, red onto the board (flashes on the stack, then to the graveyard).
- Click deck to draw; 100 HP each; click a creature, then Attack.
- One ability per card: lifelink, sacrifice for 3 damage, exile from GY to draw, death trigger damaging its column and adjacent columns.
- Switch-player button for solo hot-seat testing.

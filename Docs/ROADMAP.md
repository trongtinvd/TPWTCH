# Roadmap

| Phase | Focus | Contents |
|---|---|---|
| 0 | Board prototype (three.js) | Playable hot-seat board to test feel/rules before Godot. |
| 1 | Rules core | GameState, players, board, zones, card instances, HP, ATK, basic effects/turns. |
| 2 | Combat and stack | Attack, damage, column trample, stack, priority, Quick/Slow, abilities, triggers. |
| 3 | Modifier/rule system | Effective stats, temp modifiers, ability layers, zone/column restrictions, rule queries, precedence. |
| 4 | Content | Few rule-stressing cards (see `game_design_document.txt`): The Vine, Infinity Wall, Fracture Ground, Maximum Damage, King Eye, Avatar of Rabies, Throwing Bandages, The Seven Steves, Parriable. Do **not** mass-produce yet. |
| 5 | Presentation (Godot) | 3D board, card/creature/character views, animation, VFX, UI. |
| 6 | AI | Observation, belief model, greedy AI, state evaluation, personality vectors, search planner (advanced search only if profiling justifies). |
| 7 | Simulation lab | Headless sim, replay, stats, tournaments, personality generation, balance tests. |
| 8 | Campaign | Stories, stages, NPC decks, NPC-only cards, gimmicks, narrative. |

## Phase 0 scope
- 5 columns; hand of 5; deck/GY/exile/stack per player.
- Colours: blue creature, green non-creature, red spell.
- Drag blue to front slot, green to back slot, red onto board (flashes on stack, then GY).
- Click deck to draw; 100 HP each; click creature then Attack.
- One ability per card: lifelink, sacrifice for 3 damage, exile from GY to draw, death trigger damaging its column and adjacent columns.
- Switch-player button for solo hot-seat.

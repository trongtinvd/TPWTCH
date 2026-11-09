# Effects (three.js prototype, current implementation)

Documents what is built, not the full design. Cards are plain data; simulation interprets it; cards contain no logic.
```
Card factory -> Fx builders -> plain {op:...} -> Sim.dispatch -> stack object -> OPS[op](ctx, effect) -> events
```

| Piece | Side | Role |
|---|---|---|
| `Fx` | Content | Builders returning plain effect/cost/trigger/req/target data. |
| `OPS` | Sim | Effect handlers by `op`. |
| `COSTS` | Sim | `check` (payable?) and `pay` (mutates). |
| `REQS` | Sim | Return reason string, or `null` if satisfied. |
| `TARGETS` | Sim | Target finders. |
| `Sim.API` | Sim | Published list of all names above, plus trigger names (`enter`, `attack`). |
| `apiErrors()` | Validation | At load, every card is checked against `Sim.API`; unknown names fail loudly (console error). |

Runtime `runFx` silently skips unknown ops. Definitions are deep-frozen; runtime state (`loc`, `slot`, `damage[]`) is on instances. To add a block: add a handler entry (`OPS/COSTS/REQS/TARGETS`) + matching `Fx` builder. Each card is a factory `Cards.add(Fx => ({...}))` returning its definition.

Card `type` values: `creature`, `enchantment` (any non-creature permanent), `spell` (with `timing` `Quick` or `Slow`); `ability` is internal (stack tokens).

## Effect sources
| Source | Field | Runs |
|---|---|---|
| Spell | `effects: [...]` | On resolving off stack |
| Activated ability | `abilities: [{name, speed, zone, req, cost, target, hp, effects}]` | Activate -> stack -> resolve |
| Triggered ability | `triggers: [{on, by, effects}]` | Event -> stack -> resolve |
| Cost | `cost: [...]` in ability | Paid on activation |

Spells/abilities/triggers are **stack objects** with HP. Abilities/triggers are wrapped in a temp token card (`type:'ability'`, `loc:'stack'`, named `Card: Ability`) -> `loc:'gone'` after resolve/counter. Tokens reuse their source card's artwork.

## Ops
Handlers get `x = {s, ev, src, t, who, foe}` (state, events, source, target, controller, opponent). Effects run in list order (Ward: gainLife(3) then sacrificeSelf()).

| Builder | Behavior |
|---|---|
| `dealDamage(to, n)` | `'target'`: damage instance (type `'effect'`) on target. `'player'`: removes life from controller's opponent. |
| `gainLife(n)` | Controller gains, capped at `maxLife` (20). |
| `draw(n)` | Deck -> hand one at a time; empty deck = no draw, no error. |
| `damageStack(n)` | Damages top stack object (resolving one already popped, so the one beneath). |
| `sacrificeSelf()` | Destroys source if still on board at resolution. |
| `shiftAdjacent()` | Lists empty adjacent same-row slots; sets `s.choice` (`stay` + slots); waits for `Choose` from the controller. No free slot: nothing. |
| `repeat(n, ...fx)` | Runs nested effects n times (only composition primitive). |

## Costs (paid at activation, never refunded if countered/fizzled)
| Builder | Behavior |
|---|---|
| `payLife(n)` | Life must be > n; removes n. |
| `exileFromGY(n)` | GY needs >= n cards; exiles the n oldest. |
| `exileSelf()` | Card must be in GY; exiles it. |
| `sacrificeSelf()` | Destroys immediately (even if later countered). As effect: only on resolution. |

## Requirements / targets
`front`: in front-row slot. `hurt`: controller's life < `maxLife`. `target`: a legal target exists.
Only target finder: `opposingFront` (opposing creature in same column); chosen at activation, stored as `target: iid`.
**Fizzle:** if the object has a target and it is off the board at resolution, no effects run, `StackObjectFizzled` emitted; costs stay paid.

## Activation (`canActivate` order)
1. Correct zone (`zone`: `board` default, or `gy`). 2. Reqs pass. 3. Controller has priority. 4. Speed: `Slow` needs own turn, empty stack, no attack phase, unused major action; `Fast` unrestricted. 5. Costs payable.
`Slow` sets `majorUsed` on activation, not resolution. After any activation the opponent gets priority first.
Activation is from the card's menu on the board, or the Inspect panel buttons for GY abilities.

## Playing cards and priority (`canPlay`, `Pass`)
- Hand cards need: game started, card in hand, owner holds priority.
- Permanents: own turn, major action unused, stack empty, not in attack phase, free zone in the right row (creature front, other back). They enter immediately, then enter triggers go on the stack.
- Slow spell: own turn, major unused, stack empty, not in attack phase. Quick spell: priority only (any time, including in the attack phase).
- A spell goes on the stack and the **opponent** gets priority. `Pass` (needs a non-empty stack and priority) passes it on; after two consecutive passes the top object resolves, then priority returns to the turn player. Spells go to the top of the GY (newest first) after resolving or being countered.

## Triggers
| Trigger | Fires for |
|---|---|
| `trigger.enter(...fx)` | Only the card that entered. |
| `trigger.attack(by, ...fx)` | `by` list: `'self'` = attacking card; `'foe'` = any card whose owner differs from attacker's owner. |

`'foe'` is relative to the trigger's owner: `by:['self','foe']` does not fire when its own controller attacks with a different creature. Only cards on the board trigger.

damage triggered effect fires when a card takes combat damage, before it is destroyed. A trigger already on the stack still resolves if its source has since left the board.

**Simultaneous triggers (`fire()`):** collect all matches; push all at once, turn player's first then other's (LIFO: other player's resolve first); priority to turn player. Within a player: card creation order (deterministic placeholder). Example: both control Red Hummingbird, Player (turn player) attacks with theirs -> Opponent's trigger resolves first.

**Attack timing:** `Attack` (turn player, attack phase, stack empty, front-row creature, not yet attacked this turn) sets `s.pending`, fires attack triggers; combat damage (`strike`) runs once stack and choice are clear (`settle`). Attacker gone by then: no damage. While `s.choice` is set, only `Choose` is accepted.

## Stack HP
Each stack object has `hp` (spell HP, ability `hp`, or 1 for a trigger without). `hitStack` subtracts; **countered at <= -1, 0 resolves**. Countered spell -> GY; countered ability token removed.

## Damage
Instances `{amount, source, type, turn, seq}` on card; destroyed when total > HP (HP <= -1); `destroy` (to GY) clears instances. Types: `'combat'`, `'effect'`. Player damage = plain life decrement: no instance, ignores Power/Defense. No win/loss check on life.
**Combat trample (`strike`):** ATK passes through opposing front, then back; each target takes the full remaining ATK as damage but absorbs only its remaining HP (`hp - damage`) of it; the rest goes on, then to the player. Note this means ATK = HP + 1 kills *and* tramples 1 (Q20).

## Current cards (21; one of each per deck)
| Card | Effect |
|---|---|
| Heal | Quick spell, HP 3: `gainLife(3)` |
| Zap | Quick, HP 0: `dealDamage('player',1)` |
| Bolt | Quick, HP 2: `damageStack(3)` |
| Ward (enchantment, HP 4) | "Restore": Fast, stack HP 2; `req hurt`; `gainLife(3)`, `sacrificeSelf()` |
| Archer (3/2) | "Volley", Slow, HP 1; `req front`; cost `payLife(1)`; `dealDamage('player',2)` |
| Scout (1/1) | "Ambush", Fast, HP 0; `req target`; cost `sacrificeSelf()`; target `opposingFront`; `dealDamage('target',3)` |
| Charm (enchantment, HP 5) | "Recall", Slow, HP 1; cost `exileFromGY(1)`; `draw(1)` |
| Red Hummingbird (2/1) | Enter: `draw(1)`. Attack by self or foe creature: `shiftAdjacent()`. GY ability "Feather Balm": Fast, `req hurt`, cost `exileSelf()`: `gainLife(3)` |
| Placeholders (no effect) | Creatures Soldier 2/3, Knight 4/5, Giant 6/8, Guard 1/6, Wolf 3/3; enchantments Barrier, Aura, Banner, Trap; spells Mend (Quick), Fireball, Rally, Blast (Slow) |

Red Hummingbird is a prototype test card for triggers and choices (a simplified cousin of Avatar of Rabies' shift); it is not in `game_design_document.txt`. None of the Phase 4 cards exist yet.

## Tests
`cardGame.selfTest()` (headless, no THREE/DOM). Covers: API validation; same seed -> same state; empty column hits player; trample; 0 HP resolves; -1 HP countered; Hummingbird enter draw; attack damage waits for triggers; shift choice and dodge; GY ability; own non-attacking creature does not trigger; simultaneous trigger order from either seat. See `ARCHITECTURE.md` for gaps.

## Not implemented
- Continuous/rule effects: no modifiers, `GetEffectiveStat`, base/current layers, layered abilities.
- Durations/delayed effects (Maximum Damage impossible).
- Zone/column state: no zone HP, unusable zones/columns, column-wide targets.
- Observation/visibility filtering.
- Real-time input windows (only `Choose`).
- Targeting beyond `opposingFront` (no damage-instance, zone, stack-object targeting; `damageStack` always top).
- Triggers beyond `enter`, `attack` (no death, damage, draw, turn).
- Player-chosen trigger ordering within a player.
- Effects that remove damage instances, create tokens, move/exile arbitrary cards.
- Player stats (Power/Defense), Distance/Speed/Acceleration, win/loss.
- Silent no-ops: `draw` on empty deck; `shiftAdjacent` with no free slot.

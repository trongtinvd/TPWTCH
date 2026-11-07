# Effects

How effects work in the three.js board prototype ("Card Game Board Prototype"). This documents the **current implementation**, not the full design in `game_design_document.txt`. See [Not implemented yet](#not-implemented-yet) for the gap.

## Overview

Cards are plain data. The simulation interprets that data. Cards contain no logic.

```
Card factory --uses--> Fx builders --return--> plain {op: ...} objects
                                                      |
Sim.dispatch(command) --> stack object --resolves--> OPS[op](ctx, effect) --> events
```

| Piece | Side | Role |
|---|---|---|
| `Fx` | Content | Builders that return plain effect, cost, trigger, requirement and target data. |
| `OPS` | Simulation | Effect handlers, keyed by `op`. |
| `COSTS` | Simulation | Cost handlers: `check` (can it be paid?) and `pay` (mutates state). |
| `REQS` | Simulation | Requirement checks. Return a reason string, or `null` if satisfied. |
| `TARGETS` | Simulation | Target finders. |
| `Sim.API` | Simulation | The published list of all names above. |
| `apiErrors()` | Validation | Run at load. Every card is checked against `Sim.API`; unknown names fail loudly at load. |

At runtime, `runFx` silently skips an unknown op. Card definitions are deep-frozen; runtime state (`loc`, `slot`, `damage[]`) lives on card instances.

To add a building block, add an entry to the relevant handler table (`OPS`, `COSTS`, `REQS`, `TARGETS`) and a matching `Fx` builder. Every card can then use it.

## Where effects come from

| Source | Card field | When it runs |
|---|---|---|
| Spell effects | `effects: [...]` | When the spell resolves off the stack. |
| Activated abilities | `abilities: [{name, speed, zone, req, cost, target, hp, effects}]` | A player activates it, it goes on the stack, then it resolves. |
| Triggered abilities | `triggers: [{on, by, effects}]` | A game event fires it, it goes on the stack, then it resolves. |
| Costs | `cost: [...]` inside an ability | Paid immediately on activation. |

Spells, abilities and triggers are all **stack objects** with their own HP. An ability or trigger is wrapped in a temporary token card (`type: 'ability'`, `loc: 'stack'`), which becomes `loc: 'gone'` once it resolves or is countered.

## Effect ops

Handlers receive a context `x = {s, ev, src, t, who, foe}`: state, event list, source card, target card, controller, and the controller's opponent.

| Builder | Behavior |
|---|---|
| `Fx.dealDamage(to, amount)` | `to: 'target'` adds a damage instance of type `'effect'` to the target. `to: 'player'` removes life from the controller's opponent. |
| `Fx.gainLife(amount)` | Adds life to the controller, capped at `maxLife` (20). |
| `Fx.draw(n)` | Moves up to `n` cards from the controller's deck to hand, one at a time. An empty deck means no draw and no error. |
| `Fx.damageStack(amount)` | Damages the top stack object. The resolving object is already popped, so this hits the object beneath it. |
| `Fx.sacrificeSelf()` | Destroys the source, but only if it is still on the board when the effect resolves. |
| `Fx.shiftAdjacent()` | Lists empty adjacent slots in the same row and sets `s.choice` with options `stay` plus each slot, then waits for a `Choose` command. If no slot is free, nothing happens. |
| `Fx.repeat(n, ...effects)` | Runs the nested effects `n` times. The only composition primitive. |

Effects run in list order. Ward's `[gainLife(3), sacrificeSelf()]` gains life first, then sacrifices.

## Costs

Costs are paid at activation. They are **never refunded** if the ability is countered or fizzles.

| Builder | Check / behavior |
|---|---|
| `Fx.payLife(n)` | Life must be strictly greater than `n`. Removes `n` life. |
| `Fx.exileFromGY(n)` | The graveyard needs at least `n` cards. Exiles the `n` oldest (it pops from the end of a newest-first list). |
| `Fx.exileSelf()` | The card must be in the graveyard. Exiles it. |
| `Fx.sacrificeSelf()` | Destroys the card immediately, so it happens even if the ability is later countered. As an *effect* (above) it only happens on resolution. |

## Requirements and targets

Requirements (`req`) are checked on activation:

| Name | Satisfied when |
|---|---|
| `front` | The card is in a front-row slot. |
| `hurt` | The controller's life is below `maxLife`. |
| `target` | A legal target exists. |

Targets: only `opposingFront` exists. It is the opposing creature in the same column. The target is chosen at activation and stored on the stack object (`target: iid`).

**Fizzle:** if the ability defines a target and that target is no longer on the board at resolution, no effects run and `StackObjectFizzled` is emitted. Costs already paid stay paid.

## Activation order

`canActivate` checks, in order:

1. The card is in the correct zone (`zone`, default `board`, or `gy`).
2. Requirements pass.
3. The controller has priority.
4. Speed timing. `Slow` needs your turn, an empty stack, no attack phase and an unused major action. `Fast` adds no restriction.
5. Costs can be paid.

A `Slow` ability sets `majorUsed` **on activation**, not on resolution. After any activation the opponent gets priority first.

## Triggers

Two triggers exist:

| Trigger | Fires for |
|---|---|
| `Fx.trigger.enter(...effects)` | Only the card that entered the field. |
| `Fx.trigger.attack(by, ...effects)` | `by` is a list. `'self'` matches the attacking card. `'foe'` matches any card whose owner differs from the attacker's owner. |

Note that `'foe'` is relative to the trigger's owner. A card with `by: ['self', 'foe']` does **not** trigger when its own controller attacks with a different creature.

### Simultaneous triggers

When one event matches several triggers, `fire()` handles them in three steps:

1. **Collect** every matching trigger on the board.
2. **Put them all on the stack in one step.** The turn player's triggers go on first, then the other player's. Because the stack resolves last-in-first-out, the other player's triggers resolve first.
3. **Then priority passes**, to the turn player first.

Within one player's triggers, order is card creation order. This is a deterministic placeholder until players can order their own triggers.

Example: Player is the turn player, both players control a Red Hummingbird, and Player attacks with their Hummingbird. Both triggers go on the stack, Player's first, then Opponent's. Opponent's resolves first.

### Attack timing

`Attack` sets `s.pending` and fires the attack triggers. Combat damage (`strike`) runs only once the stack and any choice are clear (`settle`). If the attacker has left the field by then, it deals no damage. While `s.choice` is set, every command except `Choose` is rejected.

## Stack HP

- Every stack object has `hp`: a spell's own HP, an ability's `hp`, or `1` for a trigger with no `hp`.
- `hitStack` subtracts damage. The object is **countered at HP <= -1**; **0 HP still resolves**.
- A countered spell goes to the graveyard. A countered ability token is removed.
- The stack resolves after two consecutive passes.

## Damage

Damage is stored as instances on the card: `{amount, source, type, turn, seq}`. A permanent is destroyed when total damage exceeds its HP (equivalent to HP <= -1). `destroy` clears all damage instances.

- Combat damage has type `'combat'`; card effects use `'effect'`.
- Damage to the player is a plain life decrement. It creates no instance and ignores Power and Defense.

## Current cards

| Card | Source | Effect |
|---|---|---|
| Heal | Spell, Quick, HP 3 | `gainLife(3)` |
| Zap | Spell, Quick, HP 0 | `dealDamage('player', 1)` |
| Bolt | Spell, Quick, HP 2 | `damageStack(3)` |
| Ward | Ability, Fast, stack HP 2 | `req: hurt`; `gainLife(3)`, then `sacrificeSelf()` |
| Archer | Ability "Volley", Slow, stack HP 1 | `req: front`; cost `payLife(1)`; `dealDamage('player', 2)` |
| Scout | Ability "Ambush", Fast, stack HP 0 | `req: target`; cost `sacrificeSelf()`; target `opposingFront`; `dealDamage('target', 3)` |
| Charm | Ability "Recall", Slow, stack HP 1 | Cost `exileFromGY(1)`; `draw(1)` |
| Red Hummingbird | Triggers + GY ability | On enter: `draw(1)`. On attack by self or a foe creature: `shiftAdjacent()`. Fast from GY, `req: hurt`, cost `exileSelf()`: `gainLife(3)` |
| Soldier, Knight, Giant, Guard, Wolf, Barrier, Aura, Banner, Trap | Placeholders | No effect yet. |
| Mend, Fireball, Rally, Blast | Placeholder spells | No effect yet. |

## Tests

`cardGame.selfTest()` runs headless rules checks (no THREE or DOM). Trigger-related checks:

- Attack damage waits for triggers.
- The shift choice is requested and a shifted Hummingbird dodges the attack.
- A Hummingbird does not trigger on its own controller's non-attacking creature.
- Simultaneous triggers: the turn player's go on the stack first, whichever seat the turn player is.

## Not implemented yet

- **Continuous or rule effects:** no modifiers, no `GetEffectiveStat` queries, no base/current stat layers, no layered abilities.
- **Durations and delayed effects:** nothing can last N turns or fire later (Maximum Damage is not possible yet).
- **Zone and column state:** no zone HP, no unusable zones or columns, no column-wide targets.
- **Information filtering:** no Observation or visibility system.
- **Real-time input windows:** the only interruption is the `Choose` command for `shiftAdjacent`.
- **Targeting:** only `opposingFront`. No damage-instance, zone or stack-object targeting. `damageStack` always hits the top object.
- **Triggers:** only `enter` and `attack`. No death, damage, draw or turn triggers.
- **Trigger ordering within a player:** fixed by card creation order. Players cannot choose.
- **Silent no-ops:** `draw` on an empty deck and `shiftAdjacent` with no free slot do nothing without a message.

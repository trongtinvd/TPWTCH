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
| `COND` | Sim | Trigger conditions (`ownInAttackCol`), also used by `REQS.attackedCol`. |
| `CH` / `THEN` | Sim | Answers to non-shift choices (`Choose`) and the "then" actions of `PickCard`. |
| `Sim.API` | Sim | Published list of all names above, plus trigger names. |
| `apiErrors()` | Validation | At load, every card is checked against `Sim.API`; unknown names fail loudly (console error). Nested `modes` effects are not walked yet. |

Runtime `runFx` silently skips unknown ops. Definitions are deep-frozen; runtime state (`loc`, `slot`, `damage[]`, `counters`, `life[]`, `vault`, `revealed`) is on instances. To add a block: add a handler entry (`OPS/COSTS/REQS/TARGETS`) + matching `Fx` builder. Each card is a factory `Cards.add(Fx => ({...}))` returning its definition.

Card `type` values: `creature`, `enchantment` (any non-creature permanent), `spell` (with `timing` `Quick` or `Slow`); `ability` is internal (stack tokens). Card flags: `flash:true` (play like a Quick spell), `retaliate:true`.

## Effect sources
| Source | Field | Runs |
|---|---|---|
| Spell | `effects: [...]` | On resolving off stack |
| Activated ability | `abilities: [{name, speed, zone, req, cost, target, hp, effects}]` | Activate -> stack -> resolve. `zone`: `board` (default), `gy`, `hand` |
| Triggered ability | `triggers: [{on, by, zone, cond, hp, effects}]` | Event -> stack -> resolve |
| Cost | `cost: [...]` in ability | Paid on activation |

Spells/abilities/triggers are **stack objects** with HP. Abilities/triggers are wrapped in a temp token card (`type:'ability'`, `loc:'stack'`, named `Card: Ability`) -> `loc:'gone'` after resolve/counter. Tokens reuse their source card's artwork.

## Ops
Handlers get `x = {s, ev, src, t, who, foe}` (state, events, source, target, controller, opponent). Effects run in list order (Ward: gainLife(3) then sacrificeSelf()).

| Builder | Behavior |
|---|---|
| `dealDamage(to, n)` | `'target'`: damage instance (type `'effect'`) on the target card, or on a targeted player. `'player'`: damage instance on the controller's opponent. Target damage counts as targeted (passes blue shields). |
| `gainLife(n, to?)` | Puts a **life counter** of `n` on the controller (default) or on the target card (`to:'target'`, +HP). Blocked by `noLifeGain`. Uncapped. |
| `draw(n)` | Deck -> hand one at a time; empty deck = no draw, no error. |
| `damageStack(n)` | Damages top stack object (resolving one already popped, so the one beneath). |
| `sacrificeSelf()` | Destroys source if still on board at resolution. |
| `shiftAdjacent()` | Lists empty adjacent same-row slots; sets a shift `choice` (`stay` + slots); waits for `Choose`. No free slot: nothing. |
| `repeat(n, ...fx)` | Runs nested effects n times. |
| `mill(n)`, `fetch(card)`, `doublePower()` | Mill target player; fetch a named card from deck to hand; double this card's power. |
| `nearestZone(skip)`, `destroyOnZone()`, `createToken(t)` | The Vine's building blocks (re-evaluated every repetition). `destroyOnZone` skips blue-shielded cards. |
| `exileColumn()`, `makeColumnUnusable()`, `returnToHand()` | Infinity Wall. `exileColumn` skips blue-shielded cards. |
| `removeDamage(n)`, `damageAnother(n)` | Bandages / Avatar. Both set choices; red-shielded cards are excluded from `damageAnother`. |
| `obscure()` (passive) | King Eye clouds. |
| `modes(...mode)` / `mode(name, min, max, ...fx)` | Controller picks **one** mode whose `[min,max]` fits the number of creatures the opponent controls. One fitting mode runs directly; several open a popup `mode` choice. |
| `pickCard(from, then, amount?)` | `from`: `foeHand` (reveals the hand, click a card), `foeBoard`, `anyTarget` (cards or life bars), `myCreatures` (hand/GY/exile; popup only if GY/exile hold creatures). `then`: `toGY`, `toHand` (bounce), `damage` (`amount`), `summon` (click a zone if several are free). Red-shielded cards are excluded. |
| `destroyAll()` | Destroys every card on the board except blue-shielded ones. |
| `drawPerFoeCreature()` | Draws one card per creature the opponent controls. |
| `vaultFromDeck(n)` / `revealVault()` | Heaven and Sun: controller exiles `n` chosen deck cards one at a time (remembered on the card as `vault`); later the **opponent** picks one for the controller's hand. |
| `swapIn()` | Shieldguard: return a creature in the attacked column to hand and put this card (from hand) in its zone; auto if one candidate, click if several. |
| `shieldAll(color)` | Puts a `red` or `blue` shield counter on each card the controller controls on the board. |
| `noLifeGain()` | Controller cannot gain life (or life counters) for the rest of the game (`state.noGain`). |

## Costs (paid at activation, never refunded if countered/fizzled)
| Builder | Behavior |
|---|---|
| `payLife(n)` | Life must be > n; removes n and logs it as `paid`. |
| `exileFromGY(n)` | GY needs >= n cards; exiles the n oldest. |
| `exileSelf()` | Card must be in GY; exiles it. |
| `sacrificeSelf()` | Destroys immediately (even if later countered). As effect: only on resolution. |

## Requirements / targets
`front`: in front-row slot. `hurt`: controller's life < `maxLife`. `target`: a legal target exists. `stack`: a stack object exists. `attackedCol`: an attack is pending, the attacker belongs to the opponent and the controller has a creature in its column.
Target finder: `opposingFront` (opposing creature in same column, not red-shielded); chosen at activation, stored as `target: iid`.
**Fizzle:** if the object has a target and it is off the board at resolution (or a zone target holds a red-shielded card), no effects run, `StackObjectFizzled` emitted; costs stay paid.

## Activation (`canActivate` order)
1. Correct zone (`zone`: `board` default, `gy`, or `hand`). 2. Reqs pass. 3. Controller has priority. 4. Speed: `Slow` needs own turn, empty stack, no attack phase, unused major action; `Fast` unrestricted. 5. Costs payable.
`Slow` sets `majorUsed` on activation, not resolution. After any activation the opponent gets priority first.
Activation is from the card's menu on the board or in your hand, or the Inspect panel buttons for GY and hand abilities. `hasAction` also counts hand abilities.

## Playing cards and priority (`canPlay`, `Pass`)
- Hand cards need: game started, card in hand, owner holds priority.
- Non-Flash permanents: own turn, major action unused, stack empty, not in attack phase, free zone in the right row (creature front, other back). They enter immediately, then enter triggers go on the stack.
- **Flash permanents:** only priority and a free zone are needed (any time, also in the attack phase and with a non-empty stack); no major action. The "entered" response window opens only if the turn player played it.
- Slow spell: own turn, major unused, stack empty, not in attack phase. Quick spell: priority only.
- A spell goes on the stack and the **opponent** gets priority first. `Pass` (needs a non-empty stack or an open response window and priority) passes it on; after two consecutive passes the top object resolves, then priority returns to the turn player (or, with an open window, to the non-turn player). Spells go to the top of the GY (newest first) after resolving or being countered.

## Triggers
| Trigger | Fires for |
|---|---|
| `trigger.enter(...fx)` | Only the card that entered. |
| `trigger.attack(by, ...fx)` | `by` list: `'self'` = attacking card; `'foe'` = any card whose owner differs from attacker's owner; `'any'`. |
| `trigger.damaged(...fx)` | The card that takes combat damage (before it is destroyed). |
| `trigger.combat(...fx)` | Beginning of its controller's combat step. |
| `trigger.turnStart(...fx)` | Start of its controller's turn. |

Optional trigger fields: `hp` (stack HP, e.g. Heaven and Sun's enter trigger 7), `zone` (where the card must be, default `board`), `cond` (e.g. `ownInAttackCol`). `'foe'` is relative to the trigger's owner. A trigger already on the stack still resolves if its source has since left the board.

**Simultaneous triggers (`fire()`):** collect all matches; push all at once, turn player's first then other's (LIFO: other player's resolve first); priority to the turn player's opponent. Within a player: card creation order (deterministic placeholder).

**Attack timing:** `Attack` (turn player, attack phase, stack empty, no open window, not yet attacked this turn) sets `s.pending`, fires attack triggers and, if the defender has a usable hand reaction, opens an `attack` response window; combat damage (`strike`) runs once stack, choice and window are clear (`settle`). Attacker gone by then: no damage.

## Choices
`state.choice = {player, iid, kind, options, labels?, prompt, ...}`; while set only `Choose` is accepted. Kinds: shift (no kind; click a green zone), `damage` and `counter` (Avatar / Bandages), `mode` (popup), `pick` (click card / zone / life bar `P:Player` / `P:Opponent`, or popup when `labels` exist), `place` (click a zone), `swap` (click a creature), `vault` and `vaultpick` (popup). A choice **without** `labels` is answered by clicking the board; with `labels` the picker panel is shown.

## Stack HP
Each stack object has `hp` (spell HP, ability `hp`, or 1 for a trigger without). `hitStack` subtracts; **countered at <= -1, 0 resolves**. Countered spell -> GY; countered ability token removed.

## Damage, counters and shields
Instances `{amount, source, type, turn, seq}` on card; destroyed when total damage > HP (printed HP + life counters); `destroy` (to GY) clears instances, shields and life counters. Types: `'combat'`, `'effect'`, `'retaliate'`. Player damage is also an instance (`state.log[player]`, kind `damage`), as are life counters (`life`) and paid life (`paid`).
`dealDamage(s, src, tgt, amount, ev, type, targeted)`: blue-shielded targets ignore non-combat damage unless `targeted`; if the target has `retaliate` (and `type !== 'retaliate'`) the source takes damage equal to its power back (a spell's controller takes it as life loss).
**Combat trample (`strike`):** ATK passes through the cards on the foe's side of the attacker's column (front, then back; a foe-side attacker only hits what lies beyond it); each target takes the full remaining ATK as damage but absorbs only its remaining HP of it; the rest goes on, then to the player. ATK = HP + 1 kills *and* tramples 1 (Q20).
Shield counters live in `card.counters` (`red`, `blue`); see `RULES.md`.

## Current cards (21; one of each per deck)
| Card | Effect |
|---|---|
| Heal | Quick, HP 3: `gainLife(3)` |
| Zap | Quick, HP 0: `dealDamage('player',1)` |
| Bolt | Quick, HP 2: `damageStack(3)` |
| Superbolt | Slow, HP 3: 20 damage to any target (permanent or player) |
| GrainFall | Slow, HP 2: target player mills 10 |
| Throwing Bandages | Quick, HP 10: remove 7 damage points (controller picks instances) |
| Infinity Wall | Quick, HP 6: exile a full column, make it unusable, return to hand |
| Spirit of the Sand | Quick, HP 0: `modes` red / blue shield on each of your cards, plus `noLifeGain` |
| Ward (ench., HP 4) | "Restore": Fast, stack HP 2; `req hurt`; `gainLife(3)`, `sacrificeSelf()` |
| Charm (ench., HP 5) | "Recall", Slow, HP 1; cost `exileFromGY(1)`; `draw(1)` |
| Heaven and Sun (ench., HP 5) | Enter (stack HP 7): exile 5 chosen deck cards. Turn start: opponent picks one of them for your hand |
| Archer (3/2) | "Volley", Slow, HP 1; `req front`; cost `payLife(1)`; `dealDamage('player',2)` |
| Scout (1/1) | "Ambush", Fast, HP 0; `req target`; cost `sacrificeSelf()`; target `opposingFront`; `dealDamage('target',3)` |
| Red Hummingbird (2/1) | Enter: `draw(1)`. Attack by self or foe creature: `shiftAdjacent()`. GY ability "Feather Balm": Fast, `req hurt`, cost `exileSelf()`: `gainLife(3)` |
| King Eye (6/10) | Passive `obscure()`: clouds over your other zones |
| The Vine (1/1) | Enter and turn start: `repeat(4, nearestZone, destroyOnZone, createToken)` |
| Avatar of Rabies (3/7) | Attack (any): `shiftAdjacent()`; damaged: `damageAnother(1)`; rider `inheritAbilities` |
| Black Hawk (1/0) | Combat step: `repeat(5, doublePower())` |
| Bolt Master (2/3) | Enter: `fetch('superbolt')` |
| Creeping Parasite (0/0, Flash) | Enter: `modes` unlocked by the opponent's creature count: 0 look at hand, send one to GY; 1+ 4 damage to any target; 2+ return a card they control to hand; 3+ put a creature from hand/GY/exile into play; 4+ draw per their creature count; 5 destroy all. **Every unlocked mode is selectable** (with 2 creatures: 0, 1 or 2) |
| Shieldguard (5/15, Retaliate) | Hand ability "Swap In": Fast, stack HP 1, `req attackedCol`: return the creature in the attacked column to hand, put Shieldguard in its zone |

Test-only fixtures (not in decks): Soldier 2/3, Knight 4/5, Giant 6/8, Guard 1/6, Wolf 3/3, Barrier, Aura, Banner, Trap, Mend, Fireball, Rally, Blast. Red Hummingbird, Superbolt, GrainFall, Black Hawk, Bolt Master, Heaven and Sun, Creeping Parasite, Shieldguard and Spirit of the Sand are prototype cards not in `game_design_document.txt`; The Vine, Infinity Wall, King Eye, Avatar of Rabies and Throwing Bandages are Phase 4 cards.

## Tests
`cardGame.selfTest()` (headless, no THREE/DOM). Covers (in addition to the earlier list): Flash, Retaliate, red/blue shields, Spirit of the Sand, Shieldguard's response window and swap, Vine, Infinity Wall, King Eye, Superbolt/GrainFall, Black Hawk/Bolt Master. Not yet covered: Creeping Parasite modes, Heaven and Sun, the player damage / life counter log, foe-side attacker direction. See `ARCHITECTURE.md` for gaps.

## Not implemented
- Continuous/rule effects: no modifiers, `GetEffectiveStat`, base/current layers, layered abilities beyond the Avatar damage rider.
- Durations/delayed effects (Maximum Damage impossible).
- Zone HP (Fracture Ground), column state beyond "unusable".
- Observation/visibility filtering beyond King Eye clouds and per-viewer revealed cards.
- Real-time input windows (only `Choose`).
- Player-chosen trigger ordering within a player; targeting of damage instances/stack objects beyond Bandages/Bolt.
- Player stats (Power/Defense), Distance/Speed/Acceleration, win/loss.
- Silent no-ops: `draw` on empty deck; `shiftAdjacent` with no free slot.

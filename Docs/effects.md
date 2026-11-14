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
| `COND` | Sim | Trigger conditions (`ownInAttackCol`, `extraPaid`, `firstCombat`). |
| `CH` / `THEN` | Sim | Answers to `Choose` and the "then" actions of `PickCard`. |
| Status API | Sim | `addStatus`, `removeStatus`, `statusLines`, `hpOf`, `atkOf`, `lifeOf`, `hasSt`, `isRevealed`. See below. |
| `Sim.API` | Sim | Published list of all names above, plus trigger and passive names. |
| `apiErrors()` | Validation | At load every card is checked against `Sim.API`; unknown names fail loudly. Nested `modes` effects are not walked yet. |

Runtime `runFx` silently skips unknown ops. Definitions are deep-frozen; runtime state lives on instances: `{iid, def, owner, loc, slot, statuses[]}`. To add a block: add a handler entry + matching `Fx` builder. Each card is a factory `Cards.add(Fx => ({...}))`.

Card `type`: `creature`, `enchantment` (any non-creature permanent), `spell` (`timing` Quick or Slow); `ability` is internal (stack tokens). Flags: `flash:true`, `retaliate:true`, `extraCost:{major:true}`.

## Statuses
One ordered list per card (`card.statuses`) and per player (`state.players[p].statuses`); see `RULES.md` for the rules and the kind table.
- `Sim.addStatus(s, owner, {kind, ...})` appends (id = `++s.seq`, `turn`, `removed:null`). Optional fields: `zone` (default `'board'`; the status is removed when the card is not in that zone, unless `keep:true`), `aura` + `src` + `idx` (re-checked each recalc), `link` (seq of another status on the card), `expires:'turnEnd'`.
- `Sim.removeStatus(s, st, why)` sets `removed:{why,turn,seq}`. It is never deleted. All folds skip removed statuses.
- `recalc(s, ev)` runs after every command (and inside many ops): removes statuses that left their zone / failed their requirement / lost their link, adds `entered`, adds aura `mod` statuses (oldest source first), kills cards with damage > HP, refreshes the `state.life` cache.
- Folds: `hpOf(c)` (printed HP + `life` + `mod.hp`), `atkOf(c)` (printed, then `mod` add and `atkMul` multiply in list order, min 0), `totalDamage(c)`, `lifeOf(s,p)`.
- `Sim.statusLines(owner)` returns `[{text, removed, st}]` in list order: the inspector and player panel render exactly this (removed ones greyed, behind a toggle).
- Effects write statuses; they never edit fields: `dealDamage` -> `damage`, `gainLife` -> `life`, `doublePower` -> `atkMul`, `shieldAll` -> `shield`, `noLifeGain` -> `nogain`, `noDamage` -> `nodamage` (turnEnd), `skipFoeCombat` -> `skipCombat` on the foe, `payLife` cost -> `paid`, `vaultFromDeck` -> `vault`, `pickCard foeHand` -> `revealed`, rider `inheritAbilities` -> linked `ability`.

## Effect sources
| Source | Field | Runs |
|---|---|---|
| Spell | `effects: [...]` | On resolving off stack |
| Activated ability | `abilities: [{name, speed, zone, req, cost, target, hp, effects}]` | Activate -> stack -> resolve. `zone`: `board`, `gy`, `hand` |
| Triggered ability | `triggers: [{on, by, zone, cond, hp, effects}]` | Event -> stack -> resolve |
| Passive | `passives: [obscure(), aura(...)]` | Read continuously (clouds; aura statuses) |
| Cost | `cost: [...]` in ability | Paid on activation |

Spells/abilities/triggers are stack objects with HP. Abilities/triggers are wrapped in a temp token card (`type:'ability'`, `loc:'stack'`) -> `loc:'gone'` after resolve/counter. An **Attack** is a stack object of `kind:'attack'` (no HP, no token card).

## Ops
Handlers get `x = {s, ev, src, t, who, foe, ...}`. Effects run in list order. An op that opens a choice suspends the rest of the list as a continuation; `Choose` resumes it.

| Builder | Behavior |
|---|---|
| `dealDamage(to, n)` | `'target'`: `damage` status on the target card (or a targeted player). `'player'`: on the controller's opponent. Target damage passes blue shields. Denied by `nodamage`. |
| `gainLife(n, to?)` | `life` status on the controller (default) or target card (+HP). Blocked by `nogain`. |
| `draw(n, who?)`, `drawUntil(n)` | Deck -> hand one at a time (`who:'foe'` = the opponent); empty deck = no draw. `drawUntil`: until n cards in hand. |
| `damageStack(n)` | Damages the top stack object. **No effect on an Attack.** |
| **`addAttackDamage(n, whose?)`** | **Adds n to the `bonus` of the topmost Attack object on the stack** (`whose`: `'mine'` / `'foe'` / `'any'` (default), relative to the effect's controller). The bonus is read when the Attack resolves and still lands if the attacker left. Requirement `attackOnStack` is available. |
| `cancelAttack()` | Removes the targeted Attack object from the stack (target finder `attacker`). |
| `noDamage()` | Target creature (or stack spell): damage to it is denied until end of turn (`nodamage` status, `expires:'turnEnd'`). |
| `sacrificeSelf()` | Destroys source if still on board. |
| `shiftAdjacent()` | Choice: `stay` + empty adjacent same-row slots. None free: nothing. |
| `repeat(n, ...fx)` | Runs nested effects n times. |
| `mill`, `fetch`, `doublePower` | Mill target player; fetch a named card; `doublePower` adds an `atkMul` x2 status. |
| `nearestZone`, `destroyOnZone`, `createToken` | The Vine (re-evaluated each repetition). |
| `placeToken(t)` | The controller picks a free **front** zone for a token (auto if one). Used by War Drum. |
| `exileColumn`, `makeColumnUnusable`, `returnToHand` | Infinity Wall. |
| `removeDamage(n)`, `damageAnother(n)` | Bandages / Avatar. Bandages asks which `damage` status to reduce; a fully removed one is greyed. |
| `obscure()`, `aura(who, atk, hp)` (passives) | Clouds; aura: cards of `'own'`/`'foe'` in the source's column and adjacent columns hold a `mod` status while in range. |
| `modes`, `mode` | Controller picks one mode whose `[min,max]` fits the opponent's creature count. |
| `pickCard(from, then, amount?)` | `from`: `foeHand` (adds `revealed`), `foeBoard`, `anyTarget`, `myCreatures`, `myGYCreatures`. `then`: `toGY`, `toHand`, `damage`, `summon`, `summonAttack` (put into play, then it attacks at once as an extra Attack). |
| `upTo(who, from, then, n, types?)` | Up to n picks (with Done): `then` `toHand` or `play`. The resolving card is not offered. |
| `destroyAll`, `drawPerFoeCreature` | Parasite. |
| `vaultFromDeck(n)` / `revealVault()` | Heaven and Sun: `vault` statuses on the card. |
| `swapIn()` | Shieldguard (reads the Attack on the stack). |
| `shieldAll(color)`, `noLifeGain()` | `shield` statuses on your board cards; `nogain` on you. |
| `skipFoeCombat(pay)`, `secondCombat()` | Shark: pay life, `skipCombat` on the foe; second combat (foe draws 5 as a cost; if you hold a `skipCombat` status it is used up instead). |

## Costs (paid at activation, never refunded if countered/fizzled)
`payLife(n)` (`paid` status), `exileFromGY(n)`, `exileSelf()`, `sacrificeSelf()` (destroys immediately). Optional card cost `extraCost:{major:true}` (War Drum): asked on play; adds `extraPaid`.

## Requirements / targets
`front`, `hurt`, `target`, `stack`, `foeAttacking`, `attackedCol`, `attackOnStack`. Targets: `opposingFront`, `attacker` (the topmost Attack the opponent controls). Zone targets `anyPermanent`, `anyCreature`; `colTarget` `fullColumn`; `playerTarget`; `optionalTarget`, `stackTarget` (Quick Intuition).
**Fizzle:** target gone at resolution (or a red-shielded zone target) -> no effects, `StackObjectFizzled`; costs stay paid.

## Activation (`canActivate` order)
1. Zone. 2. Reqs. 3. Priority. 4. Speed (`Slow`: own turn, empty stack, no attack phase, major action unused; `Fast`: free). 5. Costs payable. Slow sets `majorUsed` on activation. After any activation the opponent gets priority first.

## Playing cards and priority
See `RULES.md`. Flash permanents need only priority and a free zone.

## Triggers
| Trigger | Fires for |
|---|---|
| `enter` | Only the card that entered. |
| `attack(by, ...)` | `'self'`, `'foe'` or `'any'`; fired when the Attack is declared; goes above the Attack. |
| `damaged` | The card that takes combat damage. |
| `combat` | Beginning of its controller's combat step. |
| `combatEnd` | After its controller's combat phase ends (`cond:'firstCombat'` = the first one this turn). Also fires when End turn ends combat. |
| `turnStart` | Start of its controller's turn. |

Optional fields: `hp`, `zone`, `cond`. `fire()` collects all matches, turn player's first, then priority to the non-turn player.

## Attack objects
`declareAttack(s, c, ev, extra)` pushes `{kind:'attack', iid, controller, hp:null, slotAt, bonus:0}`, fires attack triggers above it, gives the defender priority. `resolveAttack`: damage = `atkOf(attacker)` if on board else 0, plus `bonus`, down the column (`slotAt` if the attacker left). Normal `Attack` command needs an empty stack; extra attacks come from effects.

## Choices
`state.choice = {player, iid, kind, options, labels?, prompt, cont?}`; only `Choose` is accepted. Kinds: shift (no kind), `damage`, `counter` (options are `damage` status ids), `mode`, `pick`, `place`, `swap`, `vault`, `vaultpick`, `upto`. Without `labels` it is answered by clicking the board; with `labels` the picker panel shows.

## Stack HP
`hitStack` subtracts; **<= -1 countered, 0 resolves**. An Attack ignores it. Countered spell -> GY; countered ability token removed. (Stack objects have no statuses yet: `nodmg` is a field, Q33.)

## Current cards (25; one of each per deck)
| Card | Effect |
|---|---|
| Heal / Zap / Bolt / Superbolt / GrainFall | As before: +3 life / 1 damage / 3 damage to the stack object below / 20 damage to any target / mill 10 |
| Throwing Bandages | Quick, HP 10: remove 7 damage points from a permanent |
| Infinity Wall | Quick, HP 6: exile a full column, make it unusable, back to hand |
| Spirit of the Sand | Quick, HP 0: red or blue `shield` on each of your cards + `nogain` |
| Quick Intuition | Quick, HP 4: `drawUntil(7)`, optional target creature/spell gets `noDamage`. GY, Fast, when the foe attacks: exile this; `cancelAttack` |
| Ambush of the Night | Slow, HP 0: you draw 2, return <=2 GY cards, put <=2 creatures/enchantments from hand into play; then the foe returns <=2, puts <=2 from their GY into play, draws 2 |
| Ward, Charm, Heaven and Sun | Enchantments (see card text) |
| War Drum (ench., Flash, HP 0) | Passive `aura('foe',-1,-1)`. Enter: `placeToken('drummer')` (3/3 with `aura('own',1,1)`). Optional extra cost (major action): enter also puts a creature from your GY into play and it attacks at once |
| Archer, Scout, Red Hummingbird, King Eye, The Vine, Avatar of Rabies, Black Hawk, Bolt Master | As before (Black Hawk: five `atkMul` statuses) |
| Deep Sea Shark (6/4) | Enter: may pay 3 life, foe gets `skipCombat`. After your first combat phase: foe draws 5 (cost), second combat phase |
| Creeping Parasite (0/0, Flash) | Enter: mode by foe creature count (every unlocked mode selectable) |
| Shieldguard (5/15, Retaliate) | Hand ability Swap In: Fast, `attackedCol` (reads the Attack on the stack) |

Test-only fixtures (not in decks): Soldier 2/3, Knight 4/5, Giant 6/8, Guard 1/6, Wolf 3/3, Barrier, Aura, Banner, Trap, Mend, Fireball, Rally, Blast, **Rage** (Quick, HP 2, `req attackOnStack`: `addAttackDamage(4)`).

## Tests
`cardGame.selfTest()` (headless, no THREE/DOM): 264 checks. Added: status order and folds, removal on leaving the board (kept in the list), `keep`, zone-bound statuses, expiry, aura enter/leave/return, linked ability status, player list folds, `nogain`, Heaven and Sun vault, `revealed`, and the Attack bonus (resolves, stays after the attacker leaves, defender can boost). Not yet covered: Creeping Parasite modes other than 0, Shark's second-combat edge cases with statuses.

## Not implemented
- Base/Current stat layers and equipment (only the status fold exists), durations other than `turnEnd`, Maximum Damage.
- Zone HP (Fracture Ground), column state beyond "unusable".
- Observation filtering beyond King Eye clouds and `revealed`.
- Real-time input windows.
- Player-chosen trigger order; statuses on stack objects; pruning of old removed statuses.
- Player stats, Distance/Speed/Acceleration, win/loss.
- Silent no-ops: `draw` on empty deck; `shiftAdjacent` with no free slot.

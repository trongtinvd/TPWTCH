# Architecture

**Rules are data + simulation, not presentation code.**
```
Content -> Simulation -> Events/Observations -> Presentation
Human and AI both drive the same Simulation.
```

## Simulation / presentation split
Simulation never touches Node3D, meshes, animations, cameras, VFX. It takes **Commands**, emits **Events**; presentation animates events. Events are rules facts (`CreatureAttackDeclared`), not visual (`AttackAnimationStarted`) unless a mechanic needs real-time interaction. Enables human/AI/headless matches, replays, tests, balance runs.
- Commands (design): Draw, Summon, PlayCard, Attack, ActivateAbility, ChooseTarget, PassPriority, MovePermanent, AttemptParry.
- Events (design): TurnStarted/Ended, PermanentEntered/Left/Summoned, CreatureAttackDeclared, AttackStarted, DamageAttempted/Dealt/Received, CreatureDestroyed/PermanentDestroyed, CardDrawn/Played/Exiled, StackObjectCreated/Resolved, AbilityActivated.

### Implemented in the prototype
- **Commands:** `ReorderDeck`, `Start`, `Draw`, `PlayCard`, `Pass`, `SetAttackPhase`, `Attack`, `Choose`, `Activate`, `EndTurn`. (`Choose` answers any pending choice.)
- **Events:** `DeckReordered`, `PlayerReady`, `GameStarted`, `CardDrawn/Added/Milled/Discarded`, `PermanentSummoned/Moved/Destroyed/Returned`, `StackObjectCreated/Resolved/Damaged/Countered/Fizzled`, `DamageDenied`, `PriorityPassed`, `ResponseWindowOpened/Closed`, `AbilityActivated`, `AttackPhaseChanged`, `CreatureAttackDeclared`, `AttackCancelled`, `AttackBoosted`, `CombatSkipped`, `DamageDealt`, `DamageRemoved`, `PlayerDamaged`, `LifePaid`, `LifeCounterAdded`, `CounterAdded`, `CardExiled`, `ZoneUnusable`, `AbilitiesTransformed`, `ChoiceRequested/Made`, `TurnChanged`.
- `Sim.dispatch(state, cmd)` mutates state and returns `{ok, why, events}`. Content (`DEFS`) is injected into `Sim.create(n, defs)`.
- **Presentation host:** `send(cmd)` keeps `sim` (authoritative) and `game` (on screen). While showcase animations play, `game` is the pre-command snapshot; input is rejected until they finish. Animations are derived by diffing stack snapshots (Q13).
- **Undo** = `structuredClone` snapshots (max 200); `eventLog` keeps 200 events (not yet a replay format).
- **UI seat vs priority:** `ui.view` is the viewed seat; "Auto view" follows priority; "Switch player" pins it.
- **Click-based choices:** a pending `state.choice` without `labels` is answered by clicking; with `labels` the picker lists the options.
- **Determinism:** `mulberry32(seed)`; seeds from the game number. No other randomness.

## Core systems
GameState, PlayerState, BoardState, CardInstance, PermanentInstance, StackObject, CharacterState, EquipmentState; Turn, Combat, Stack, Effect, Trigger, Damage, Zone systems.
**[proto]** One `state` object: `cards` (iid -> instance), `piles` per player, `slots`, `stack`, `players[p].statuses`, `life` (cache), priority, `respond` (response window), `choice`, `unusable`. Logic is plain functions in `Sim`.

## Cards
- **CardDefinition** (immutable). **[proto]** Deep-frozen; factories receive `Fx`.
- **CardInstance** (mutable): zone, owner, slot and **`statuses[]`**. **[proto]** `{iid, def, owner, loc, slot, statuses[]}`; nothing else is stored on an instance (no `damage[]`, `life[]`, `counters`, `atk`, `xform`, `revealed`, `vault`, `extraPaid`).
- Primitives (design): `DealDamage, Destroy, Exile, Move, Summon, Draw, ModifyStat, ModifyRule, AddAbility, RemoveAbility, CreateTrigger, CreateDelayedEffect, CreateChoice, WaitForInput`. **[proto]** see `effects.md`.
- Effect kinds: one-shot, triggered, continuous, rule/restriction. **[proto]** One-shot and triggered effects; continuous effects are **statuses** (shield, nogain, skipCombat, mod, atkMul...).

## Statuses (the modifier layer) [proto]
**One ordered list per card and per player replaces the ad-hoc fields.** This is the first implementation of the modifier registry:
- Every change is `addStatus`; every undo is `removeStatus(why)`. A removed status stays in the list (greyed in the UI), so the list is also the history of the card.
- **State = fold of the list, oldest to newest** (`hpOf`, `atkOf`, `lifeOf`, `abDef`, `has`). No status reads another card's fields except through a declared requirement.
- **Lifecycle is generic, not per card:** `zone` (removed when the card leaves it; `keep` overrides), `aura` requirement, `link`, `expires`. `recalc` applies them after every command; effects never clean up after themselves.
- Precedence is the list order ("newest applied last"). This answers Q8 for stat folds; it does not yet cover rule statuses that contradict each other (`cannot` vs `can`).
- `Sim.statusLines(owner)` is the only thing the UI reads for statuses: card inspector and player panel are the same renderer, with a show/hide toggle for removed ones.
- Derived, not stored: King Eye clouds (`cloudMap`). Not yet on the list: stack objects (`nodmg`), `s.combats`, `majorUsed`, `unusable` (zone state).

## Effective-state queries
GameState is truth; queries apply statuses: `CanEnterZone, GetEffectiveStat, GetEffectiveDistance, GetEffectiveAbilities, GetVisibleInformation, CanDealDamage, CanTarget, CanMove, CanAttack`. **[proto]** Reason-string checks (`canPlay`, `canActivate`, `canAttack`) plus folds: `hpOf`, `atkOf`, `abDef` (ability layer), `has(card,'red'|'blue')`, `hasSt(o, kind)`, `isRevealed`, `cloudMap`. `canAttack` reads the `attacked` status.

## Abilities
Layered: original, granted, disabled/removed, effective. Never delete; compute the effective set. **[proto]** `abDef(card)`: the newest active `ability` status decides; it is linked to the damage status that caused it, so removing that damage ends it.

## Stack, priority, attacks
**[proto]** The stack holds spells, abilities and **Attacks** (`kind:'attack'`, no HP, no snapshot; they read the attacker when they resolve). Triggers of an attack sit above it as their own objects; the defender has priority first. Response windows remain only for *enter* and *end*. `s.pending` and the attack window no longer exist.

## Targeting
Categories: Card, Permanent, Creature, Zone, Column, Player, Stack Object, Damage Instance. **[proto]** Finders: `opposingFront`, `attacker`, zone targets, column targets, player targets, list picks. Damage instances are `damage` statuses, so "target a damage instance" (Bandages) is picking from the status list. Red-shielded cards are filtered from all of them.

## Information
AI and UI get a filtered **Observation**, not raw GameState. **[proto]** No Observation layer. The view hides the other player's hand unless a `revealed` status names the viewer (`Sim.isRevealed`); clouds are drawn over hidden zones. The inspector shows statuses with their source names, so an Observation layer will have to filter status lists too (a hidden card's statuses must not leak).

## Real-time input
Simulation -> `InputWindowRequested` -> presentation prompt -> `PlayerCommand` -> simulation resolves. **[proto]** Only `WaitingForChoice` and empty-stack response windows.

## Determinism and replays
Initial state + RNG seed + commands = same result. Statuses use the global `s.seq` counter, so ids are deterministic too.

## AI
```
AI: BeliefModel (hidden info, sampled worlds) | IPlanner (Greedy/Beam/Determinized/MCTS/ISMCTS) | PersonalityEvaluator (weights)
```
- Loop: observe -> sample worlds -> simulate own actions + responses -> evaluate -> execute first action -> re-plan. Belief: probabilities for opponent hand/deck; revealed cards are certain information.
- Score = StateEvaluation + EventEvaluation; personality = weight vector. Difficulty = search depth, beam width, samples, time budget, noise.
- Branching: hand abilities, response windows, mode / pick choices and Attack objects on the stack add branching; the planner needs to enumerate `Choose` options cheaply. Statuses make state hashing larger: removed statuses should be excluded from hashes.
- **[proto]** Not started. `Sim.hasAction` is the only AI-adjacent helper.

## Simulation lab (dev only)
Headless runs, replay, stats, AI tournaments, personality evolution. Benchmark first: simulated turns/sec on target PC. Removed statuses grow the state; pruning policy needed before long runs (Q32).

## Risks
1. Too many independent systems / no central skill identity (README, Q18).
2. Rule interaction explosion -> generic effect system, not per-card exceptions.
3. Modifier order conflicts (list order solves stat folds only).
4. AI compute.
5. Real-time input vs deterministic sim.
6. Information complexity.
7. Hidden information leaking through timing or through status lists.
8. State growth from kept-but-removed statuses.

## Rules tests
Status in `cardGame.selfTest()` (headless, 264 checks):
- [x] Effect APIs valid; determinism; deck phase; draw / major action; placement.
- [x] Combat trample and edge cases; Attack objects (no HP, bonus, cancel, attacker leaving, defender priority).
- [x] Stack HP, LIFO, costs, fizzle; triggers and simultaneous order.
- [x] Infinity Wall, King Eye, Bandages, Avatar, Vine, Superbolt/GrainFall, Black Hawk/Bolt Master, Flash, Retaliate, shields, Spirit, Shieldguard.
- [x] War Drum, Deep Sea Shark, Quick Intuition, Ambush of the Night.
- [x] **Statuses:** list order and folds (order matters), removal on leaving the board (kept, greyed), `keep`, zone-bound (`revealed`, vault), expiry, aura enter / leave / return, linked ability, player list folds, `nogain`.
- [ ] Creeping Parasite modes other than 0 reveal.
- [ ] Undo removing tokens (view); foe-side attacker direction in the view.
- [ ] Zone/column restrictions block the intended operations *(partly)*.
- [ ] Base stats persist; equipment changes only current stats *(not built)*.
- [ ] Hidden info never reaches AI *(not built)*.
- [ ] Simulated games reproduce real-game outcomes *(needs command recording)*.

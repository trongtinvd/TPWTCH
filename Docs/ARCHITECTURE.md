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
Names differ slightly from the design lists above.
- **Commands:** `ReorderDeck`, `Start`, `Draw`, `PlayCard`, `Pass`, `SetAttackPhase`, `Attack`, `Choose`, `Activate`, `EndTurn`. (`Choose` answers any pending choice: shift, damage/counter picks, modes, card/zone/player picks, swaps; no `MovePermanent`, `AttemptParry`, or separate `ChooseTarget`.)
- **Events:** `DeckReordered`, `PlayerReady`, `GameStarted`, `CardDrawn`, `CardAdded`, `CardMilled`, `CardDiscarded`, `PermanentSummoned/Moved/Destroyed/Returned`, `StackObjectCreated/Resolved/Damaged/Countered/Fizzled`, `PriorityPassed`, `ResponseWindowOpened/Closed`, `AbilityActivated`, `AttackPhaseChanged`, `CreatureAttackDeclared`, `DamageDealt`, `DamageRemoved`, `PlayerDamaged`, `LifePaid`, `LifeCounterAdded`, `CounterAdded`, `CardExiled`, `ZoneUnusable`, `AbilitiesTransformed`, `ChoiceRequested/Made`, `TurnChanged`.
- `Sim.dispatch(state, cmd)` mutates state and returns `{ok, why, events}`. Content (`DEFS`) is injected into `Sim.create(n, defs)`; the Sim reads no globals.
- **Presentation host:** `send(cmd)` keeps `sim` (authoritative) and `game` (what is on screen). While showcase animations play, `game` is the pre-command snapshot; input is rejected until they finish. Animations are derived by diffing stack snapshots, not from events (open: Q13).
- **Undo** = `structuredClone` snapshots (max 200). After an undo the view drops meshes for cards that no longer exist (generated tokens). `eventLog` keeps the last 200 events (not yet a replay format; commands are not recorded).
- **UI seat vs priority:** `ui.view` is the viewed seat, separate from whose priority it is; "Auto view" follows priority. A manual "Switch player" sets `ui.pin` so the view is not pulled back until priority moves to someone else. Turn changes play banners from each player's seat and wait for the camera (`camArrive`) before the next step; the stack animation then plays from the seat holding priority. `autoStep` can auto-pass / auto-end-turn (Actions: off / normal / always).
- **Click-based choices:** a pending `state.choice` without `labels` is answered by clicking highlighted cards, zones or life bars; with `labels` the picker panel lists the options.
- **Determinism:** deck shuffles use `mulberry32(seed)`; seeds come from the game number (`Player: 2n+1`, `Opponent: 2n`). The Sim has no other randomness.

## Core systems
GameState, PlayerState, BoardState, CardInstance, PermanentInstance, StackObject, CharacterState, EquipmentState; Turn, Combat, Stack, Effect, Trigger, Damage, Zone systems.
**[proto]** One `state` object holds `cards` (iid -> instance), `piles` per player (deck/hand/gy/exile), `slots` (owner|row|col -> iid), `stack`, `life`, `log` (per-player damage / life counter / paid-life instances), `noGain`, `unusable`, priority, `respond` (response window), `choice`, `pending` (deferred combat). Turn/combat/stack/trigger/damage logic are plain functions in `Sim`; no Character, Equipment, or Zone systems yet.

## Cards
- **CardDefinition** (immutable): name, type, printed stats, timing, keywords (`flash`, `retaliate`), costs, conditions, targets, triggers, effects, tags, text, visuals. **[proto]** Deep-frozen at load; factories receive the `Fx` builder API.
- **CardInstance** (mutable): zone, damage, base-stat mods, modifiers, attachments, counters, temp effects, instance ID. Matters for copies, tokens, zone moves, AI sims, replays, saves. **[proto]** `{iid, def, owner, loc, slot, damage[], atk, counters{red,blue}, life[], vault[], revealed{player}, xform}`.
- Primitives (design): `DealDamage, Destroy, Exile, Move, Summon, Draw, ModifyStat, ModifyRule, AddAbility, RemoveAbility, CreateTrigger, CreateDelayedEffect, CreateChoice, WaitForInput`.
  **[proto]** Effects, costs, requirements, triggers and choices are listed in `effects.md` (e.g. `ChooseMode`, `PickCard`, `GainLife` as life counters, `ShieldAll`). `PickCard` + `ChooseMode` are the first generic "create choice" primitives.
- Effect kinds: one-shot, triggered, continuous, rule/restriction. Implement via Effect/Modifier registration, not nested GameState decorators. **[proto]** One-shot, triggered, and two hard-wired continuous rules (shield counters, `noGain`).

## Effective-state queries
GameState is truth; queries apply modifiers: `CanEnterZone, GetEffectiveStat, GetEffectiveDistance, GetEffectiveAbilities, GetVisibleInformation, CanDealDamage, CanTarget, CanMove, CanAttack`. Temporary effects register modifiers, not one-off booleans (`disabledColumn`, `playerCannotDraw`, `hiddenCard`...).
Precedence (to formalise before large card library): Base Rule -> Persistent -> Temporary -> Specific Overrides -> Final. Must give deterministic answers to e.g. "creatures cannot move" vs "this creature can move" vs "column cannot be entered" vs "ignores movement restrictions".
**[proto]** Reason-string checks (`canPlay`, `canActivate`, `canAttack`) plus ad-hoc queries: `has(card, 'red'|'blue')` in targeting and damage, `hpOf`, `statuses`, `cloudMap`, `abDef` (ability layer). `noGain` is a plain state flag, i.e. exactly the kind of one-off boolean the modifier layer should replace.

## Abilities
Layered: original, granted, disabled/removed, effective. Never delete; compute effective set (e.g. Avatar of Rabies transforms a victim's abilities without altering its definition). **[proto]** `abDef(card)`: the newest damage instance carrying a rider decides; removing that damage ends the swap.

## Targeting
First-class. Categories: Card, Permanent, Creature, Zone, Column, Player, Stack Object, Damage Instance. Supports restrictions and dynamic queries; dynamic targets (The Vine) re-evaluate on each repetition. **[proto]** Finders: `opposingFront`, zone targets (`anyPermanent`), column targets (`fullColumn`), player targets, list picks (`PickCard`). Red-shielded cards are filtered out of all of them; targets are fixed at activation and fizzle if gone at resolution.

## Information
AI and UI get a filtered **Observation**, not raw GameState (GameState -> Visibility System -> Observation). *King Eye* alters observation without corrupting underlying data; blackout visuals are presentation.
**[proto]** No Observation layer. The view hides the non-viewed player's hand by drawing it face down unless the card's `revealed` flag names the viewer; King Eye clouds are drawn over hidden zones. The full state is available to the view.

## Real-time input
Simulation -> `InputWindowRequested` -> presentation prompt -> `PlayerCommand` -> simulation resolves. Sim states: Resolved, WaitingForInput, WaitingForChoice. Never polls input; record command timing for replays. Example (Parriable): DamageEvent -> ParryWindowRequested -> prompt -> AttemptParry(windowID) -> resolve.
**[proto]** Only `WaitingForChoice` (`state.choice`; every other command is rejected until `Choose`) and empty-stack response windows (`state.respond`: entered / end / attack). No timed windows.

## Determinism and replays
Initial state/decks + RNG seed + commands = same result; replay = those three. All randomness in sim RNG. Benefits: reproducible bugs, deterministic AI tests, tournament analysis, balance experiments.

## AI
```
AI: BeliefModel (hidden info, sampled worlds) | IPlanner (Greedy/Beam/Determinized/MCTS/ISMCTS) | PersonalityEvaluator (weights)
```
- Loop: observe -> sample worlds -> simulate own actions + responses -> evaluate -> execute first action -> re-plan.
- Belief: probabilities for opponent hand/deck, responses; sample worlds (e.g. counter exists 70%) weighted by probability. Revealed cards (Creeping Parasite) are certain information in the belief model.
- Score = StateEvaluation + EventEvaluation. Personality = continuous weight vector (PlayerDamage, CreatureCount, CreaturePower, CardAdvantage, BoardControl, PlayerHP, OwnHP, Risk, EmptyZones, LethalThreat...). Example A: damage +2, summon +8, draw +3, take damage -1; B: damage +4, summon +3, draw +8, take damage -20. Archetypes (aggressive, defensive, control, opportunistic, risk-taking, resource, board) are just regions of the space.
- Difficulty = search depth, beam width, world samples, time budget, eval noise, planning frequency, hidden-info confidence, candidate count (same rules, less search).
- Keep planner swappable. Prune: action pruning, heuristic pre-eval, beam, limited samples, depth/time limits, transposition tables, state hashing, re-planning. Branching: 20 x 15 x 15 x 15 ~ 67,500. Hand abilities, response windows and mode / pick choices add branching: the planner needs a way to enumerate `Choose` options cheaply.
- **[proto]** Not started. `Sim.hasAction(state, player)` (is any legal action available, including hand abilities?) is the only AI-adjacent helper; it drives UI automation.

## Simulation lab (dev only)
Headless runs, replay, stats, AI tournaments, personality generation/evolution (population -> tournaments -> select -> mutate). Metrics: win rate, length, damage, cards drawn/played, creatures summoned/destroyed, abilities used, board value, lethal/missed lethal, risky/defensive plays, strategic diversity. Fitness = win rate + game quality + variety + distinctiveness + appropriate difficulty (not win rate alone). Populations include current, historical, random, hand-built benchmark AIs, varied decks, maybe recorded human strategies, to avoid self-play overfitting. Benchmark first: complete simulated turns/sec on target PC.

## Risks
1. Too many independent systems / no central skill identity (see README, Q18).
2. Rule interaction explosion -> strong generic effect system, not per-card exceptions.
3. Modifier order conflicts.
4. AI compute (hidden info + look-ahead).
5. Real-time input vs deterministic sim.
6. Information complexity when many cards alter rules, zones, visibility, stats, timing.
7. Response windows and hand reactions leak hidden information through timing (Q30).

## Rules tests
Status in `cardGame.selfTest()` (headless; run from the console; about 200 checks):
- [x] Every card only uses published effect APIs (`apiErrors()`); same seed -> same state; replay determinism.
- [x] Combat tramples front -> back -> player; empty column hits player; trample edge cases (ATK = HP, HP + 1, pre-damaged targets).
- [x] Stack objects: 0 HP resolves, -1 HP countered; LIFO responses; pass counting.
- [x] Costs stay paid on counter/fizzle; fizzle when target gone; major-action limits; priority/pass flow; deck-phase commands.
- [x] Triggers: enter draw; attack damage waits for triggers; shift choice; shifted creature dodges; own non-attacking creature does not trigger; simultaneous trigger order from either seat.
- [x] GY ability: exiles Hummingbird, gains life.
- [x] Infinity Wall / unusable zones, King Eye clouds, Bandages, Avatar, The Vine, Superbolt / GrainFall, Black Hawk / Bolt Master.
- [x] Flash, Retaliate, red/blue shields, Spirit of the Sand, Shieldguard window and swap.
- [ ] Creeping Parasite modes (0 reveal, pick, summon, destroy-all), Heaven and Sun vault.
- [ ] Player damage / life counter log; foe-side attacker direction (a Vine behind the foe's front row must not hit backward); undo removing tokens (view).
- [ ] Permanents die at <= -1 HP (covered only indirectly by the trample test).
- [ ] Zone/column restrictions block the intended operations. *(partly: unusable zones)*
- [ ] Base stats persist; equipment changes only current stats. *(not built)*
- [ ] Temporary modifiers expire correctly. *(not built)*
- [ ] Hidden info never reaches AI. *(not built)*
- [ ] Simulated games reproduce real-game outcomes. *(needs command recording)*

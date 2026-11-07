# Architecture

**Rules are data + simulation, not presentation code.**
```
Content -> Simulation -> Events/Observations -> Presentation
Human and AI both drive the same Simulation.
```

## Simulation / presentation split
Simulation never touches Node3D, meshes, animations, cameras, VFX. It takes **Commands**, emits **Events**; presentation animates events. Events are rules facts (`CreatureAttackDeclared`), not visual (`AttackAnimationStarted`) unless a mechanic needs real-time interaction. Enables human/AI/headless matches, replays, tests, balance runs.
- Commands: Draw, Summon, PlayCard, Attack, ActivateAbility, ChooseTarget, PassPriority, MovePermanent, AttemptParry.
- Events: TurnStarted/Ended, PermanentEntered/Left/Summoned, CreatureAttackDeclared, AttackStarted, DamageAttempted/Dealt/Received, CreatureDestroyed/PermanentDestroyed, CardDrawn/Played/Exiled, StackObjectCreated/Resolved, AbilityActivated.

## Core systems
GameState, PlayerState, BoardState, CardInstance, PermanentInstance, StackObject, CharacterState, EquipmentState; Turn, Combat, Stack, Effect, Trigger, Damage, Zone systems.

## Cards
- **CardDefinition** (immutable): name, type, printed stats, timing, costs, conditions, targets, triggers, effects, tags, text, visuals.
- **CardInstance** (mutable): zone, damage, base-stat mods, modifiers, attachments, counters, temp effects, instance ID. Matters for copies, tokens, zone moves, AI sims, replays, saves.
- Primitives: `DealDamage, Destroy, Exile, Move, Summon, Draw, ModifyStat, ModifyRule, AddAbility, RemoveAbility, CreateTrigger, CreateDelayedEffect, CreateChoice, WaitForInput`.
- Effect kinds: one-shot, triggered, continuous, rule/restriction. Implement via Effect/Modifier registration, not nested GameState decorators.

## Effective-state queries
GameState is truth; queries apply modifiers: `CanEnterZone, GetEffectiveStat, GetEffectiveDistance, GetEffectiveAbilities, GetVisibleInformation, CanDealDamage, CanTarget, CanMove, CanAttack`. Temporary effects register modifiers, not one-off booleans (`disabledColumn`, `playerCannotDraw`, `hiddenCard`...).
Precedence (to formalise before large card library): Base Rule -> Persistent -> Temporary -> Specific Overrides -> Final. Must give deterministic answers to e.g. "creatures cannot move" vs "this creature can move" vs "column cannot be entered" vs "ignores movement restrictions".

## Abilities
Layered: original, granted, disabled/removed, effective. Never delete; compute effective set (e.g. Avatar of Rabies transforms a victim's abilities without altering its definition).

## Targeting
First-class. Categories: Card, Permanent, Creature, Zone, Column, Player, Stack Object, Damage Instance. Supports restrictions and dynamic queries; dynamic targets (The Vine) re-evaluate on each repetition.

## Information
AI and UI get a filtered **Observation**, not raw GameState (GameState -> Visibility System -> Observation). *King Eye* alters observation without corrupting underlying data; blackout visuals are presentation.

## Real-time input
Simulation -> `InputWindowRequested` -> presentation prompt -> `PlayerCommand` -> simulation resolves. Sim states: Resolved, WaitingForInput, WaitingForChoice. Never polls input; record command timing for replays. Example (Parriable): DamageEvent -> ParryWindowRequested -> prompt -> AttemptParry(windowID) -> resolve.

## Determinism and replays
Initial state/decks + RNG seed + commands = same result; replay = those three. All randomness in sim RNG. Benefits: reproducible bugs, deterministic AI tests, tournament analysis, balance experiments.

## AI
```
AI: BeliefModel (hidden info, sampled worlds) | IPlanner (Greedy/Beam/Determinized/MCTS/ISMCTS) | PersonalityEvaluator (weights)
```
- Loop: observe -> sample worlds -> simulate own actions + responses -> evaluate -> execute first action -> re-plan.
- Belief: probabilities for opponent hand/deck, responses; sample worlds (e.g. counter exists 70%) weighted by probability.
- Score = StateEvaluation + EventEvaluation. Personality = continuous weight vector (PlayerDamage, CreatureCount, CreaturePower, CardAdvantage, BoardControl, PlayerHP, OwnHP, Risk, EmptyZones, LethalThreat...). Example A: damage +2, summon +8, draw +3, take damage -1; B: damage +4, summon +3, draw +8, take damage -20. Archetypes (aggressive, defensive, control, opportunistic, risk-taking, resource, board) are just regions of the space.
- Difficulty = search depth, beam width, world samples, time budget, eval noise, planning frequency, hidden-info confidence, candidate count (same rules, less search).
- Keep planner swappable. Prune: action pruning, heuristic pre-eval, beam, limited samples, depth/time limits, transposition tables, state hashing, re-planning. Branching: 20 x 15 x 15 x 15 ~ 67,500.

## Simulation lab (dev only)
Headless runs, replay, stats, AI tournaments, personality generation/evolution (population -> tournaments -> select -> mutate). Metrics: win rate, length, damage, cards drawn/played, creatures summoned/destroyed, abilities used, board value, lethal/missed lethal, risky/defensive plays, strategic diversity. Fitness = win rate + game quality + variety + distinctiveness + appropriate difficulty (not win rate alone). Populations include current, historical, random, hand-built benchmark AIs, varied decks, maybe recorded human strategies, to avoid self-play overfitting. Benchmark first: complete simulated turns/sec on target PC.

## Risks
1. Too many independent systems / no central skill identity (see README, Q18).
2. Rule interaction explosion -> strong generic effect system, not per-card exceptions.
3. Modifier order conflicts.
4. AI compute (hidden info + look-ahead).
5. Real-time input vs deterministic sim.
6. Information complexity when many cards alter rules, zones, visibility, stats, timing.

## Rules tests to write
- Combat tramples front -> back -> player; empty column hits player.
- Permanents die at <= -1 HP; stack objects countered at <= -1, 0 resolves.
- Zone/column restrictions block the intended operations.
- Base stats persist; equipment changes only current stats.
- Temporary modifiers expire correctly.
- Hidden info never reaches AI.
- Simulated games reproduce real-game outcomes.

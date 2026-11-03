# Architecture

## Guiding principle

**Game rules are data + simulation, not presentation code.**

```
Content -> Simulation -> Events / Observations -> Presentation
Human  \
        -> Simulation
AI     /
```

Human and AI drive the *same* simulation.

## Simulation / presentation split

The simulation never touches Node3D, meshes, animations, cameras or VFX. It accepts **Commands** and emits **Events**; presentation animates events. Events are rules facts (`CreatureAttackDeclared`), not visual ones (`AttackAnimationStarted`). This enables human matches, AI matches, headless runs, replays, automated tests and balance testing.

## Core systems

GameState, PlayerState, BoardState, CardInstance, PermanentInstance, StackObject, CharacterState, EquipmentState, TurnSystem, CombatSystem, StackSystem, EffectSystem, TriggerSystem, DamageSystem, ZoneSystem.

## Cards

- **CardDefinition**: immutable design data (name, type, stats, timing, costs, targets, triggers, effects, tags, text, visuals).
- **CardInstance**: mutable runtime state (zone, damage, base-stat mods, modifiers, attachments, counters, instance ID).
- Cards are compositions of primitives: `DealDamage, Destroy, Exile, Move, Summon, Draw, ModifyStat, ModifyRule, AddAbility, RemoveAbility, CreateTrigger, CreateDelayedEffect, CreateChoice, WaitForInput`.
- Effect kinds: one-shot, triggered, continuous, rule/restriction.

## Effective-state queries

GameState is truth. Rules are answered by queries that apply modifiers on top: `CanEnterZone, GetEffectiveStat, GetEffectiveDistance, GetEffectiveAbilities, GetVisibleInformation, CanDealDamage, CanTarget, CanMove, CanAttack`. Temporary effects register modifiers instead of adding one-off booleans (`disabledColumn`, `playerCannotDraw`...).

Modifier precedence (to be formalised): Base Rule -> Persistent -> Temporary -> Specific Overrides -> Final.

## Abilities

Layered: original, granted, disabled/removed, effective. Never physically delete an ability; compute the effective set.

## Information

The AI and the UI get a filtered **Observation**, not the raw GameState. Effects like *King Eye* alter the observation; board-blackout visuals are a presentation consequence.

## Real-time input

Mechanics like *Parriable* work through input windows: Simulation -> `InputWindowRequested` -> Presentation prompt -> `PlayerCommand` -> Simulation resolves. The simulation never polls input. Record command timing for replays.

## Determinism and replays

Same initial state + commands + RNG seed = same result. All randomness lives in the simulation RNG. A replay is initial state/decks + seed + commands.

## AI

```
AI
+-- BeliefModel         estimate hidden info, sample possible worlds
+-- Planner (IPlanner)  Greedy / Beam / Determinized / MCTS / ISMCTS
+-- PersonalityEvaluator weight vector over state + event scores
```

- Loop: observe -> sample worlds -> simulate own actions and responses -> evaluate -> execute first action -> re-plan.
- Personality = continuous weight vector (damage, creature count, card advantage, risk, own HP...), not a fixed archetype.
- Difficulty = search depth, beam width, world samples, time budget, evaluation noise, candidate count. Same rules, less search.
- Keep the planner swappable; prune aggressively (branching explodes fast).

## Simulation lab (dev only)

Headless runs, replay, statistics, AI tournaments, personality generation/evolution. Fitness must reward more than win rate: game quality, variety, distinctiveness, appropriate difficulty. Include historical, random and hand-built benchmark AIs to avoid self-play overfitting.

## Rules tests to write

- Combat tramples front -> back -> player; empty column hits the player.
- Permanents die at <= -1 HP; stack objects countered at <= -1, 0 HP resolves.
- Zone and column restrictions block the right operations.
- Base stats persist; equipment changes only current stats.
- Temporary modifiers expire correctly.
- Hidden information never reaches the AI.
- Simulated games reproduce real-game outcomes.

# Contributing

## Ground rules
1. **Simulation is authoritative.** No rules logic in presentation (Godot nodes, three.js meshes, UI).
2. **Commands in, events out.** Commands = intent (`Attack`, `PlayCard`); events = facts (`DamageDealt`, `PermanentDestroyed`).
3. **Data over code.** Compose existing effect primitives; if bespoke code seems needed, first consider a new *generic* primitive.
4. **Determinism.** Same state + commands + RNG seed = same result; all randomness via the sim RNG.
5. **Every rule gets a test** (list in `ARCHITECTURE.md`).

## Workflow
- Branch from `main`: `feature/`, `fix/`, `docs/<short-name>`. Small commits, imperative messages.
- PR states what rule/system changed and which tests cover it.
- Rule change: update `RULES.md`; close/add entries in `OPEN_QUESTIONS.md`.

## Adding a card
1. Write the definition (name, type, stats, timing, costs, targets, triggers, effects, tags, text).
2. Use existing primitives where possible.
3. Add a test of its key interaction.
4. Log new rule ambiguity in `OPEN_QUESTIONS.md`.

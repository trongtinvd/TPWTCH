# Contributing

## Ground rules

1. **The simulation is authoritative.** No rules logic in presentation code (Godot nodes, three.js meshes, UI).
2. **Commands in, events out.** Commands express intent (`Attack`, `PlayCard`); events record facts (`DamageDealt`, `PermanentDestroyed`).
3. **Data over code.** New cards should be built by composing existing effect primitives. If a card needs bespoke engine code, first ask whether a new *generic* primitive would serve it.
4. **Determinism.** Same initial state + commands + RNG seed must give the same result. All randomness goes through the simulation RNG.
5. **Every rule gets a test.** See the list in `docs/ARCHITECTURE.md`.

## Workflow

- Branch from `main`: `feature/<short-name>`, `fix/<short-name>`, `docs/<short-name>`.
- Keep commits small, with imperative messages (`Add column fully-occupied query`).
- Open a PR describing *what rule or system changed* and which tests cover it.
- If you change a rule, update `docs/RULES.md` and, if relevant, close or add an entry in `docs/OPEN_QUESTIONS.md`.

## Adding a card

1. Write the card as a definition (name, type, stats, timing, costs, targets, triggers, effects, tags, text).
2. Use only existing effect primitives where possible.
3. Add a test showing the card's key interaction.
4. Note any new rule ambiguity in `docs/OPEN_QUESTIONS.md`.

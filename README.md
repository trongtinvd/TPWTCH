# TPWTCH

An offline, single-player **3D tactical deck-building card game** with a positional board, a shared stack, and PvE opponents that each play differently. Inspired by *Yu-Gi-Oh!* and *Magic: The Gathering*.

> **Status:** early design / prototyping. Rules and implementation details will change.

## The pitch

Pick a **story**. Each story is a series of **stages**, and each stage is a duel against an NPC with its own narrative, personality and sometimes unique rules ("gimmicks") that are listed up front. Losing has no permanent cost, so you retry, learn the stage's trick, and push through. Beating stories unlocks more stories.

## What makes it different

- **Positional combat.** A 5-column, 20-zone board. Attacks travel down a column: front creature, then back permanent, then the player.
- **One major action per turn.** Draw two, *or* summon / play a Slow spell, *or* attack. Everything else (abilities, Quick spells) is free.
- **Distance / Speed / Acceleration turn order.** No fixed alternation: a race that can produce turn streaks.
- **A shared stack** with HP-based countering (a stack object dies at HP <= -1; 0 HP still resolves).
- **Composable cards.** Cards are data built from reusable effect primitives, not custom code.
- **Opponents that plan.** Simulation-based AI with belief models and personality weight vectors.

## Repository layout

```
/docs
  DESIGN_OVERVIEW.md   Concept, goals, rules summary
  RULES.md             Quick reference of the rules as currently designed
  ARCHITECTURE.md      Simulation / presentation split, systems, AI
  OPEN_QUESTIONS.md    Unresolved rules to settle before the card pool grows
  ROADMAP.md           Phased development plan
  game_design_document.txt   Full original design document
```

## Tech

- **Engine:** Godot (final presentation layer)
- **Prototype:** three.js board prototype to validate the rules and feel quickly
- **Core principle:** *game rules are data + simulation, not engine presentation code.*

## Getting started

Nothing to build yet. Start with [`docs/ROADMAP.md`](docs/ROADMAP.md) for the current phase and [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md) for what needs deciding.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

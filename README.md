# TPWTCH

Offline single-player **3D tactical deck-building card game** (inspired by Yu-Gi-Oh!/MTG): positional board, shared stack, PvE NPCs that each play differently.
Status: early design/prototyping; rules will change.

## Pitch
Pick a **story** (series of **stages**). Each stage is a duel vs an NPC with narrative, personality, and sometimes unique rules ("gimmicks") listed in the stage description (solution discoverable; brute force/alternatives allowed). Losing has no permanent cost: retry. Beating stories unlocks more (one available at start).

## Differentiators
- **Positional combat:** 5 columns, 20 zones; attacks go down a column (front -> back -> player).
- **One major action/turn:** draw two, OR summon/Slow spell, OR attack. Abilities and Quick spells are free.
- **Distance/Speed/Acceleration turn order:** no fixed alternation; streaks possible.
- **Shared stack** with HP-based countering.
- **Composable cards:** data built from effect primitives, no per-card engine code.
- **Planning AI:** simulation-based, belief model, personality weight vectors.

## Design goals
Meaningful positioning; composable interactions; unusual/NPC-exclusive cards; distinct (not just stronger) opponents; AI that reasons about future states; deterministic sim for large-scale runs; rules separate from 3D presentation; scalable card pool; informative losses.

## Central risk
Many independent systems (position, stack, card HP, zone HP, base stats, D/S/A, hidden info, real-time input, gimmicks, predictive AI) are hard to teach/balance. Needs one clear central skill identity (OPEN_QUESTIONS Q18).

## Tech
Godot (final presentation); three.js board prototype to validate rules/feel. Principle: **rules are data + simulation, not engine presentation code.**

## Files (`/docs`)
- `README.md` overview, goals, risk
- `RULES.md` current rules
- `ARCHITECTURE.md` sim/presentation split, systems, AI, risks
- `effects.md` effect system as implemented in the prototype
- `OPEN_QUESTIONS.md` rules to settle before the card pool grows
- `ROADMAP.md` phases
- `CONTRIBUTING.md` ground rules
- `game_design_document.txt` card texts and detailed rule notes not covered elsewhere

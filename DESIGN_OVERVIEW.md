# Design Overview

## Core concept

An offline PvE card game about tactical combat, positioning, composable card interactions, stage-specific mechanics and distinct opponents. There is no permanent punishment for losing a duel.

```
Story unlocked -> Stage / Duel -+-> Win  -> progress
                                +-> Lose -> retry
```

One story is available at first; completing stories unlocks more. Stage gimmicks are stated in the stage description, so the intended solution is discoverable, but brute force and alternative solutions are allowed.

## Design goals

- Make positioning meaningful.
- Make card interactions highly composable.
- Allow unusual cards and NPC-exclusive mechanics.
- Make opponents feel distinct, not just statistically stronger.
- Support AI that reasons about future states.
- Keep the rules engine deterministic and fit for large-scale simulation.
- Separate rules from 3D presentation.
- Scale the card pool without per-card engine code.
- Make losing informative so retrying feels worthwhile.

## Central risk

The design has many independent systems: positioning, stack, card HP, zone HP, persistent base stats, distance/speed/acceleration, hidden information, real-time input, stage gimmicks and predictive AI. Each is interesting; together they are hard to teach and balance. **The game needs one clear central skill identity** (see `OPEN_QUESTIONS.md`, Q18).

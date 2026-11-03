# Open Questions

Settle these **before the card pool grows.** Tick them off and record the decision in `RULES.md`.

## Rules definitions

- [ ] 1. What does "destroy" mean versus other ways of leaving play?
- [ ] 2. Which stat modifications persist through which zone transitions?
- [ ] 3. What exactly does an *unusable zone* prevent?
- [ ] 4. What exactly does an *unusable column* prevent?
- [ ] 5. What does "cannot discern" hide (existence, location, identity, type, stats, abilities, equipment)?
- [ ] 9. What is a "damage counter": one point, or a damage instance?
- [ ] 10. How do zone-HP effects stack?
- [ ] 14. What is legal targeting, exactly?
- [ ] 15. How are tokens represented?
- [ ] 16. Can effects create creatures in normally illegal zones? (*The Vine* depends on this.)

## Timing and ordering

- [ ] 6. How are simultaneous triggers ordered?
- [ ] 7. How are mandatory vs optional triggers ordered?
- [ ] 8. Which modifier wins when they contradict?
- [ ] 11. Exactly when does a multi-turn effect expire? ("next three turns" in *Maximum Damage*)
- [ ] 12. What happens to temporary effects when their host changes zones?
- [ ] 17. What exactly ends an effect?

## Architecture

- [ ] 13. Which events are simulation events and which are presentation-only?

## Design

- [ ] 18. **What is the game's primary strategic skill?** (Positioning? Stack timing? Tempo racing? Reading the stage gimmick?)

## Card-specific unknowns

| Card | Unknown |
|---|---|
| The Vine | Can it create a creature in a back-row zone? |
| Fracture Ground | Does "each zone" mean permanent zones only, or deck/hand/GY/exile/stack too? |
| Maximum Damage | Boundary of "next three turns". |
| Throwing Bandages | Seven points, or seven total damage across instances? |
| The Seven Steves | Damage per creature is unspecified. |
| Parriable | Ownership and ordering of simultaneous input windows. |

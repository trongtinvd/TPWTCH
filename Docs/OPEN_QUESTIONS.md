# Open Questions

Settle **before the card pool grows**; record decisions in `RULES.md`.

## Rules definitions
- [ ] 1. "Destroy" vs other ways of leaving play? (Proto: `destroy` = board -> GY; sacrifice uses the same path; exile is separate.)
- [ ] 2. Which stat modifications persist through which zone transitions?
- [ ] 3. What does an *unusable zone* prevent?
- [ ] 4. What does an *unusable column* prevent?
- [ ] 5. What does "cannot discern" hide (existence, location, identity, type, stats, abilities, equipment)?
- [ ] 9. "Damage counter": one point or a damage instance?
- [ ] 10. How do zone-HP effects stack?
- [ ] 14. Exact legal targeting? (Proto has only `opposingFront`.)
- [ ] 15. How are tokens represented? (Proto: ability/trigger stack tokens exist; no creature tokens.)
- [ ] 16. Can effects create creatures in normally illegal zones? (*The Vine*)

## Timing and ordering
- [ ] 6. Simultaneous trigger order? (Proto: turn player's first on the stack, other player's resolve first; within a player, card creation order.)
- [ ] 7. Mandatory vs optional trigger order? (Proto: players cannot yet order their own triggers.)
- [ ] 8. Which modifier wins on contradiction?
- [ ] 11. When does a multi-turn effect expire? ("next three turns", *Maximum Damage*)
- [ ] 12. Temporary effects when host changes zones?
- [ ] 17. What exactly ends an effect?
- [ ] 19. **Do Slow abilities spend the major action?** Design says abilities are free; proto makes Slow abilities (Volley, Recall) cost the major action, on activation. Keep, or make "Slow" ability timing only mean "open state, own turn"?
- [ ] 21. Should combat end the turn (original design) or only the attack phase, with several attackers per turn (proto)? Is entering the attack phase with no attack a legal "pass"?
- [ ] 22. Win/loss: what happens at life <= 0 (not implemented), and is it checked at <= 0 or <= -1 like permanents?

## Combat
- [ ] 20. Trample vs kill threshold: a creature dies at damage > HP but absorbs only its remaining HP, so exactly 1 extra ATK both kills and tramples. Intended? Or should lethal = HP+1 absorbed?

## Architecture
- [ ] 13. Simulation events vs presentation-only events? (Proto: Sim emits rule events only; showcase animations are derived by diffing stack snapshots in the view.)

## Design
- [ ] 18. **Primary strategic skill?** (Positioning / stack timing / tempo racing / reading the stage gimmick)

## Card-specific
| Card | Unknown |
|---|---|
| The Vine | Can it create a creature in a back-row zone? |
| Fracture Ground | "Each zone": permanent zones only, or deck/hand/GY/exile/stack too? |
| Maximum Damage | Boundary of "next three turns". |
| Throwing Bandages | Seven points, or seven total damage across instances? |
| The Seven Steves | Damage per creature unspecified. |
| Parriable | Ownership/ordering of simultaneous input windows. |

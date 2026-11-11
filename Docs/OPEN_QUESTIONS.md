# Open Questions

Settle **before the card pool grows**; record decisions in `RULES.md`.

## Rules definitions
- [ ] 1. "Destroy" vs other ways of leaving play? (Proto: `destroy` = board -> GY; sacrifice uses the same path; exile and bounce (`bounce`) are separate.)
- [ ] 2. Which stat modifications persist through which zone transitions? (Proto: damage, shields, life counters, revealed flag are cleared on leaving the board / hand.)
- [ ] 3. What does an *unusable zone* prevent? (Proto: placing, targeting by Vine; cards on it go to the GY, except blue-shielded ones.)
- [ ] 4. What does an *unusable column* prevent?
- [ ] 5. What does "cannot discern" hide (existence, location, identity, type, stats, abilities, equipment)?
- [ ] 9. "Damage counter": one point or a damage instance? (Proto: instance; life counters are instances too.)
- [ ] 10. How do zone-HP effects stack?
- [ ] 14. Exact legal targeting? (Proto: `opposingFront`, zone targets, player targets, picks from lists; red shield removes a card from targeting.)
- [ ] 15. How are tokens represented? (Proto: ability/trigger stack tokens and Vine creature tokens, which count as cards on the board and vanish instead of going to the GY.)
- [ ] 16. Can effects create creatures in normally illegal zones? (*The Vine*) Proto: yes, any usable zone; also Parasite 3+ may only use free front zones.
- [ ] 23. **Flash and the stack:** a Flash permanent enters immediately even with objects on the stack, so it is faster than a Quick spell (cannot be countered). Intended? Should it use the stack?
- [ ] 24. **Retaliate:** triggers on any damage (not only attacks), reads power at damage time, hits the source creature or a spell's controller, and is blocked by a blue shield. Keep? Should it fire when the retaliator is destroyed by that damage (proto: yes)?
- [ ] 25. **Blue shield scope:** "unaffected by spells and abilities that do not target it". Are keyword effects (Retaliate), rules sweeps (unusable zone) and the Vine's destruction included? (Proto: yes for the first and last, no for the sweep.)
- [ ] 26. **Life counters:** can they be removed (Bandages for life, drain)? Does a player's life counter total matter beyond the inspector? Do card life counters survive bounce (proto: no)?
- [ ] 27. **Simultaneous vs sequential selection:** The Vine re-evaluates four times, so one protected zone wastes all four. Should it pick 4 distinct zones at once (the other 3 would still resolve)?
- [ ] 28. **Reveal:** how long does a revealed card stay revealed (proto: until it leaves the hand) and can a card be revealed to both players?
- [ ] 29. **Creeping Parasite tiers:** proto lets the player pick any unlocked mode; the card text could also mean "the highest tier only".

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
- [ ] 30. **Attack response window and hidden information:** the window opens only when the defender holds a usable hand reaction, so the attacker may infer "they have something" from the pause. Always open it (and require passing every attack) or accept the leak?

## Combat
- [ ] 20. Trample vs kill threshold: a creature dies at damage > HP but absorbs only its remaining HP, so exactly 1 extra ATK both kills and tramples. Intended? Or should lethal = HP+1 absorbed?
- [ ] 31. Direction rule: an attacker on the foe's side hits only cards beyond it. Should friendly cards ahead of a back-row attacker on its own side absorb? (Proto: no, only foe-side cards absorb, whoever controls them.)

## Architecture
- [ ] 13. Simulation events vs presentation-only events? (Proto: Sim emits rule events only; showcase animations are derived by diffing stack snapshots in the view.)

## Design
- [ ] 18. **Primary strategic skill?** (Positioning / stack timing / tempo racing / reading the stage gimmick)

## Card-specific
| Card | Unknown |
|---|---|
| The Vine | Can it create a creature in a back-row zone? (Proto: yes.) Simultaneous vs sequential zone choice (Q27). |
| Fracture Ground | "Each zone": permanent zones only, or deck/hand/GY/exile/stack too? |
| Maximum Damage | Boundary of "next three turns". |
| Throwing Bandages | Seven points, or seven total damage across instances? (Proto: points.) |
| The Seven Steves | Damage per creature unspecified. |
| Parriable | Ownership/ordering of simultaneous input windows. |
| Creeping Parasite | Mode selection (Q29); "5" tier means 5 or more; can the 4 damage target red-shielded cards (no). |
| Heaven and Sun | What happens to exiled cards if it leaves play (proto: stay exiled, no longer retrievable)? |
| Spirit of the Sand | Cards entering after it resolves get no shield; does the life-gain lock also stop life counters on cards? (Proto: yes.) |

# Open Questions

Settle **before the card pool grows**; record decisions in `RULES.md`.

## Resolved
- [x] **30. Attack response window and hidden information.** Resolved: the window is gone. An Attack is a stack object and the defender always gets priority on it, so there is no pause to read.
- [x] **Where do creatures / enchantments go?** Creatures front, enchantments back, unless a card says otherwise.
- [x] **Normal attacks and the stack.** Need an empty stack unless a card says otherwise.
- [x] **Statuses.** One ordered list per card and per player; state = fold, newest applied last; removed on leaving the board, on failing a requirement, on clearing themselves, on expiry; removed ones stay greyed (toggle). See `RULES.md`.

## Rules definitions
- [ ] 1. "Destroy" vs other ways of leaving play? (Proto: `destroy` = board -> GY; sacrifice the same; exile and bounce separate. All remove the card's statuses.)
- [ ] 2. Which statuses persist through which zone transitions? (Proto: none, unless the status has `keep`. No card uses `keep` yet.)
- [ ] 3. What does an *unusable zone* prevent?
- [ ] 4. What does an *unusable column* prevent?
- [ ] 5. What does "cannot discern" hide (existence, location, identity, type, stats, abilities, equipment)? New: does it also hide the **statuses** list? (Proto: clouds hide the card, so its statuses are hidden too.)
- [ ] 9. "Damage counter": one point or an instance? (Proto: one `damage` status; Bandages can reduce one partly.)
- [ ] 10. How do zone-HP effects stack?
- [ ] 14. Exact legal targeting? (Proto: finders; red shield removes a card from targeting.)
- [ ] 15. How are tokens represented? (Proto: ability stack tokens and creature tokens; tokens count as cards, vanish instead of going to the GY, and keep their greyed statuses.)
- [ ] 16. Can effects create creatures in normally illegal zones? (*The Vine*) Proto: yes, any usable zone.
- [ ] 23. **Flash and the stack:** a Flash permanent enters immediately, even with objects on the stack. Intended?
- [ ] 24. **Retaliate:** any damage, reads power at damage time, hits the source or a spell's controller, blocked by blue shield, fires even if the retaliator dies. Keep?
- [ ] 25. **Blue shield scope:** keyword effects and rule sweeps. (Proto: Retaliate and the Vine blocked, the unusable-zone sweep not.)
- [ ] 26. **Life statuses:** can they be removed (drain)? Do card life statuses survive bounce (proto: no, all board statuses go)?
- [ ] 27. **Simultaneous vs sequential selection** (The Vine picks 4 times, re-evaluating).
- [ ] 28. **Reveal:** proto: a `revealed` status lives while the card is in the hand; two players = two statuses. Revealed on another player's turn change? Is the revealed-to player told when it ends?
- [ ] 29. **Creeping Parasite tiers:** any unlocked mode, or only the highest?

## Statuses (new)
- [ ] 32. **Pruning removed statuses.** They stay forever (even across several lives of a card, and for tokens). Cap per card? Drop when the card changes zone for the Nth time? Needed before long headless runs and for undo snapshot size.
- [ ] 33. **Statuses on stack objects.** `nodamage` on a stack spell and the Attack `bonus` are plain fields on the stack object. Should stack objects have `statuses[]` too (then "damage added to an Attack" is a status)?
- [ ] 34. **Derived vs stored.** King Eye clouds, `unusable` zones, `majorUsed`, `combats` are not statuses. Which should become statuses (zone statuses with Q3/Q4)?
- [ ] 35. **Re-applied auras.** A card leaving and re-entering an aura's columns gets a new status (the old one stays greyed). OK, or should the old one be revived?
- [ ] 36. **Aura order.** Auras are added oldest source first; a source that leaves and returns is "newest". Matters only for non-commutative folds (x2 vs +n).
- [ ] 37. **Order of mixed `mod` and `atkMul`.** Folded in list order, so a x2 applied before an aura +1 gives a different result than after. Intended, or should auras apply last?
- [ ] 38. **`entered` status.** Real status, but noise in every list. Hide kinds without effect behind the toggle?
- [ ] 39. **Status visibility.** A hidden card (hand, under a cloud) hides its statuses. Revealed ones show only to the revealer.
- [ ] 40. **Resolving spell as a pick.** Proto: a resolving spell/ability source is never a legal pick of its own effects (Ambush of the Night could otherwise return itself). Keep as a generic rule? What about "from your GY" abilities of the same card?
- [ ] 41. **`addAttackDamage` target.** Proto: the topmost Attack matching `whose`. With several Attacks on the stack (extra attacks) should the player choose?
- [ ] 42. **Extra attacks and the empty-stack rule.** An effect (War Drum) declares an Attack while the stack is non-empty. Should the defender be able to respond before the creature's enter triggers resolve? (Proto: the Attack is above them.)

## Timing and ordering
- [ ] 6. Simultaneous trigger order? (Proto: turn player's first on the stack, other player's resolve first; within a player, creation order.)
- [ ] 7. Mandatory vs optional trigger order? (Players cannot yet order their own triggers.)
- [ ] 8. Which modifier wins on contradiction? Proto: stat folds are list order; rule statuses (`cannot` vs `can`) not yet.
- [ ] 11. When does a multi-turn effect expire? ("next three turns", *Maximum Damage*) The status model has `expires:'turnEnd'`; a turn counter (`expires:{turns:n}`) is the likely extension.
- [ ] 12. Temporary effects when the host changes zones? (Proto: statuses go with the card unless `keep`.)
- [ ] 17. What exactly ends an effect? (Proto: leave zone, requirement fails, link ends, clears itself, expires, removed by an effect.)
- [ ] 19. **Do Slow abilities spend the major action?** Design: free. Proto: they spend it on activation.
- [ ] 21. Should combat end the turn (original) or only the attack phase (proto)? Is entering the attack phase with no attack a legal "pass"? (End turn during combat ends the combat phase first: proto.)
- [ ] 22. Win/loss: what happens at life <= 0, checked at <= 0 or <= -1?

## Combat
- [ ] 20. Trample vs kill threshold: ATK = HP + 1 both kills and tramples 1. Intended?
- [ ] 31. Direction rule: an attacker on the foe's side hits only cards beyond it. Should friendly cards ahead of a back-row attacker absorb?

## Architecture
- [ ] 13. Simulation events vs presentation-only events? (Proto: rule events only; animations are derived by diffing stack snapshots.)

## Design
- [ ] 18. **Primary strategic skill?** (Positioning / stack timing / tempo racing / reading the stage gimmick)

## Card-specific
| Card | Unknown |
|---|---|
| The Vine | Back-row zones; simultaneous vs sequential (Q27). |
| Fracture Ground | "Each zone": permanent zones only, or deck/hand/GY/exile/stack too? |
| Maximum Damage | Boundary of "next three turns" (Q11). |
| Throwing Bandages | Seven points or seven total? (Proto: points.) |
| The Seven Steves | Damage per creature unspecified. |
| Parriable | Ownership/ordering of simultaneous input windows. |
| Creeping Parasite | Mode selection (Q29); "5" tier. |
| Heaven and Sun | If it leaves play its `vault` statuses are removed: exiled cards stay exiled and cannot be retrieved. Intended? |
| Spirit of the Sand | Cards entering later get no shield; `nogain` also blocks card life statuses (proto: yes). |
| War Drum | Extra cost only on your turn; the returned creature's attack happens outside the attack phase; the -1/-1 aura can kill a creature whose damage equals HP when it enters range. |
| Deep Sea Shark | The skip is a status on the foe: what if the foe also has a Shark? (Proto: their second-combat ability consumes it.) |
| Quick Intuition | "Damage denied" lasts until end of turn, including damage to the creature from a later turn's cards? (Proto: expires at the end of the turn it was cast.) |
| Ambush of the Night | Order and "up to" choices; the spell itself is not a legal pick (Q40). |

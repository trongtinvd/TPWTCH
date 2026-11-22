# Open Questions

Settle **before the card pool grows**; record decisions in `RULES.md`.
Last pass: 2026-11-22 (the owner answered every numbered question). What is left open is at the top; everything decided is below, with the ruling.

## Still open
- [ ] 45. **Destroyed by a rule vs by an effect.** Zone-gone destruction is marked `by:'rule'`. Should "when destroyed by an effect" triggers (future) ignore it? Should it trigger "destroyed" abilities at all? (Not answered yet.)

### Card-specific (numbered)
| # | Card | Open point |
|---|---|---|
| C1 | Fracture Ground | Not implemented. "Each zone": permanent zones only, or deck/hand/GY/exile/stack too? |
| C2 | The Seven Steves | Not implemented. Damage per creature unspecified. |
| C3 | Parriable | Not implemented. Ownership/ordering of simultaneous input windows. |
| C4 | Throwing Bandages | "Seven points or seven total?" The question was unclear to the owner; **kept as is** (points). Rephrase if it matters later. |
| C5 | Deep Sea Shark | Resolved in meaning: another Shark's ability can skip the second combat phase. Wording of the original question was unclear; nothing to decide. |

### Decided but not built yet
These rulings differ from the prototype (or need new code). Each needs tests first, then code. Detail in `RULES.md` ("Rulings 2026-11-22").
- Q19 Slow abilities are free unless the card says so (proto: they spend an action point).
- Q21 Combat ends, then the turn ends (proto: combat ends, the turn goes on until End turn).
- Q49 The turn player also gets a stop (after the non-turn player's).
- Q50 Stops are a per-player setting, Arena style.
- Q7 Mandatory triggers go on the stack first and are reorderable among themselves.
- Q8 / Q37 Contradicting modifiers: list order, the later-entered effect wins (rule statuses `cannot` vs `can` still to build).
- Q10 Zone HP: disabled by default, one shared bar for all effects.
- Q11 Multi-turn effects declare which turns count (any / owner's / opponent's).
- Q13 The sim emits a 1D event array; the view reads it in order.
- Q33 / Q34 Stack objects (Attacks included) get `statuses[]`; clouds and unusable zones become statuses on zones; action points stay their own objects.
- Q39 / Q44 Hidden information enforced as an anti-cheat layer; each player's logs show only what is public to them.
- Q41 Effects that pick an Attack will ask the player to choose it.
- Q43 Logs and statuses are capped at 200 MB; the game ends when the cap is reached.
- Q56 Controller vs owner (proto: `owner` doubles as controller, `home` remembers the real owner).
- Q1 Zone moves are described by from / to / how / why, not by keywords.
- Q16 The Vine's text says it may create tokens in back-row zones (card text updated 2026-11-22).

## Resolved
- [x] **30. Attack response window and hidden information.** The window is gone. An Attack is a stack object and the defender always gets priority on it.
- [x] **Where do creatures / enchantments go?** Creatures front, enchantments back, unless a card says otherwise.
- [x] **Normal attacks and the stack.** Need an empty stack unless a card says otherwise.
- [x] **Statuses.** One ordered list per card and per player; state = fold, newest applied last; removed on leaving the board, on failing a requirement, on clearing themselves, on expiry; removed ones stay greyed (toggle).
- [x] **Enter triggers when a permanent dies on entering.** Queued before the state-based check and still resolve (War Drum vs War Drum).
- [x] **Hidden information and counts (King Eye).** Creatures under a cloud count as none for effects that count the foe's creatures; a cloud zone is a legal pick; an empty or red-shielded pick fizzles and reveals nothing.
- [x] 22. Win/loss: lose at life <= -1; both at once = draw; first decision stands.

### Rules definitions
- [x] 1. "Destroy" and the other ways to leave the board (destroyed -> GY, bounced -> hand, spun -> deck, exiled -> exile) are only descriptions of what a card does, **not keywords**. The game cares about from where to where, how and why.
- [x] 2. Statuses survive a zone change only with `keep`. **Kept.**
- [x] 3. What an unusable zone prevents: **kept** as built.
- [x] 4. What an unusable column prevents: **kept** as built.
- [x] 5. What "cannot discern" hides: **kept** as built (a cloud hides the card, so its statuses too).
- [x] 9. A damage counter is **one instance** (one `damage` status).
- [x] 10. Zone HP: **disabled by default** until an effect gives a zone HP; one shared HP bar for all such effects.
- [x] 14. Legal target = meets the requirement in the card text **and** is not blocked by an effect such as red shield.
- [x] 15. Tokens: **kept** (ability tokens on the stack, creature tokens on the board).
- [x] 16. Effects may create creatures in a normally illegal zone **if the card text says so** (The Vine's text updated).
- [x] 23. Flash permanents enter immediately even with objects on the stack. **Kept.**
- [x] 24. Retaliate is an **ability** that fires even if the retaliator dies. Kept as built.
- [x] 25. Blue shield only protects against **spells and abilities**, never against attacks or rules.
- [x] 26. Leaving the board ends all statuses on the card, unless the text says otherwise (so card life statuses do not survive bounce).
- [x] 27. Repeated picks (The Vine) are sequential, re-evaluated each time. **Kept.**
- [x] 28. A hand `revealed` status ends when the card leaves the hand.
- [x] 29. Creeping Parasite: any unlocked mode. **Kept.**

### Statuses
- [x] 32. Removed statuses stay forever. **Kept.** (Size is bounded by the 200 MB cap, Q43.)
- [x] 33. Stack objects also use `statuses[]`.
- [x] 34. Clouds and unusable zones are statuses on the zones. Action points are their own objects. Attacks are unique stack objects (not cards) with `statuses[]`.
- [x] 35. A card re-entering an aura's range gets a **new** status.
- [x] 36. Aura order: **kept** (oldest source first).
- [x] 37. Mixed `mod` and `atkMul`: follow the `statuses[]` order.
- [x] 38. `entered` stays visible (kept on).
- [x] 39. Visibility: cards on the board, in GYs and in exile are public. Cards in decks, extra decks and hands are visible only to their owner. A card can change this (King Eye hides, Parasite reveals). Enforced as an anti-cheat feature.
- [x] 40. A resolving spell stays on the stack (or in `resolving`) until all its effects are done; it **may** be a legal pick of its own effect when the text implies it. (Today's proto rule, "never a legal pick", is to be revisited with tests: Ambush of the Night does not imply itself.)
- [x] 41. Effects that pick an Attack ask the player to choose it. Not implemented yet.
- [x] 42. Extra attack: the effect that put the card in play resolves and goes away, then the Attack goes on the stack, the defender can respond (e.g. Shieldguard enters, the Attack deals damage and goes away, Shieldguard's trigger resolves, then the rest).
- [x] 43. Log size: 200 MB cap; the game ends when it is reached.
- [x] 44. Each player's log shows only what is public to them (see 39).

### Timing and ordering
- [x] 6. Simultaneous triggers: **kept** (turn player's first on the stack, so the other player's resolve first; creation order within a player).
- [x] 7. Mandatory effects go on the stack first; mandatory ones can be rearranged among themselves.
- [x] 8. Contradicting modifiers are statuses; they fold in list order; later-entered effects win.
- [x] 11. A multi-turn effect states which turns count: any turn, the player's turns only, or the opponent's turns only.
- [x] 12. Temporary effects end when the host leaves the board unless the text says otherwise.
- [x] 13. The sim emits its results as a 1D array of events; the view reads it in order to play animations.
- [x] 17. What ends an effect: **kept**.
- [x] 19. Slow abilities are free unless the card says otherwise. Slow/Fast is declared per card.
- [x] 21. Combat ends, then the turn ends. Entering combat and not attacking is legal.
- [x] 46. Win and loss at the same time: whichever resolves first; if simultaneous, a draw.
- [x] 47. Continuing a decided game does not change who won.
- [x] 48. Leaving a running game: **kept**.
- [x] 49. The opponent gets a stop, then the turn player gets one.
- [x] 50. Stops: Arena style (per-player setting).

### Combat
- [x] 20. ATK = HP + 1 both kills and tramples 1. **Kept.**
- [x] 31. Friendly cards ahead of a back-row attacker do **not** absorb.

### Action points and the extra deck
- [x] 51. No cap; a player gets one point when their turn starts.
- [x] 52. Opening hands do not count as drawn.
- [x] 53. A revealed extra deck card stays revealed until it leaves the extra deck.
- [x] 54. Not a gamble: the game tells the player whether the conditions are met; the player is responsible for checking they can perform the summon, and can see the conditions, the materials and all cards in hand, board and deck.
- [x] 55. Each card must say whether its ability is Slow or Fast.
- [x] 56. Control: the owner stays the owner, the controller is the player who plays it. Spells, abilities and attacks care about the controller unless the text says otherwise. A card going from the board to zone X goes to its **owner's** zone X.
- [x] 57. Adjacency counts both players' cards unless the card says otherwise (Widow Maker: opponent's only).
- [x] 58. Material checks ("same power / same HP") use current values. **Kept.**

### Card-specific, resolved
| Card | Ruling |
|---|---|
| The Vine | Back-row zones allowed (text updated); picks are sequential (Q27). |
| Maximum Damage | Uses the turn-kind rule of Q11. |
| Creeping Parasite | Any unlocked mode (Q29). |
| Heaven and Sun | Intended: if it leaves play its `vault` statuses are removed and the exiled cards cannot be retrieved. |
| Spirit of the Sand | Kept (later cards get no shield; `nogain` also blocks card life statuses). |
| War Drum | The extra cost can be paid on any turn. Kept. |
| Quick Intuition | Kept (denial expires at the end of the turn it was cast). |
| Underworld Fusion | Kept (only materials still in exile; the exiled Fusion itself is the cost). |
| Depth Sea Fusion | Q54, Q55: answered. |
| Widow Maker | Kept (with one targetable card left it is sent without a choice). |
| L4: The Librarian | Kept (Q52, Q56). |
| Ambush of the Night | Answered (Q40). |

# Rules (current design)

Tags: **[proto]** = how the three.js prototype behaves today (where it differs from or refines the design); **[not built]** = designed but not implemented.

## Board
- 5 columns x 4 zones (Opp Back, Opp Front, Player Front, Player Back) = 20 permanent zones.
- Each player: Deck, Extra Deck, Hand, Graveyard (GY), Exile. Shared **Stack** for non-permanents, abilities and Attacks.
- **Creatures go in the front row, enchantments (any non-creature permanent) in the back row, unless a card says otherwise.** Occupied destination: move fails.
- **[proto]** Extra Deck and Exile exist only as board zones. Zones are not yet first-class objects (see "Zones and columns"). Tokens (The Vine, Drummer) and effects like Creeping Parasite put creatures into any free zone the effect names, subject to "unusable".

## Card types
| Type | Enters | Notes |
|---|---|---|
| Creature | Front row | ATK, HP, abilities. Only creatures attack. |
| Non-creature permanent | Back row | HP, no ATK. (`enchantment` in code.) |
| Quick | Stack | Whenever timing allows; repeatable per turn if requirements met. |
| Slow | Stack | Only in an open game state. |

Permanents enter immediately (not via stack); their *enter triggers* use the stack. No universal mana; cards define own costs/restrictions.

## Statuses (one ordered list per card and per player) [proto]
Everything that changes a card or a player after it was printed/started is a **status** in ONE list: `card.statuses[]` and `state.players[p].statuses[]`.
- **Ordered.** Oldest first, **newest is applied last**. Each status has an id (`seq`), kind, source name, turn, and kind-specific data.
- **Current state = a fold of the list.** Reading the list is enough to know the state without replaying the duel. HP = printed HP + life/modifier statuses. ATK = printed ATK, then every `mod` (add) and `atkMul` (multiply) in list order: (2+3)x2 = 10, but 2x2+3 = 7. Damage taken = sum of active `damage` statuses; a card dies at damage > HP. A player's life = 20 + life - damage - paid. `state.life` is only a cache of that fold.
- **Removal, not deletion.** A status is removed when:
  1. its card **leaves the board** (or the zone the status lives in, e.g. a `revealed` status lives in the hand), unless the status has `keep` (an effect says it stays);
  2. it **stops meeting its requirement** (an aura status when the card leaves the source's columns or the source leaves; a status linked to another status when that one ends);
  3. it **clears itself** (Shark's skip-combat once used);
  4. it **expires** (`expires:'turnEnd'`: Quick Intuition's damage denial, "already attacked");
  5. an effect removes it (Throwing Bandages).
- A removed status **stays in the list** with `removed:{why, turn, seq}`. Every fold ignores it. The inspector and player panel show it **greyed and struck through** when the "Removed: hidden/shown" button in the panel header is on.
- A status that re-applies (a card moves back into War Drum's columns) is a **new** status at the end of the list; the old one stays greyed.

| Kind | On | Effect |
|---|---|---|
| `damage` {amount, orig, type, source} | card, player | Damage instance. Bandages lowers `amount` (orig stays) or removes it. |
| `life` {amount} | card (+HP), player | Gained life. Blocked by `nogain`. |
| `paid` {amount} | player | Life paid as a cost. |
| `mod` {atk, hp} | card | Additive modifier. Aura ones carry `aura` + source and end when out of range. |
| `atkMul` {n} | card | Multiplies ATK at its place in the list (Black Hawk: five x2). |
| `shield` {color} | card | `red` = cannot be targeted; `blue` = unaffected by non-targeting spells/abilities. |
| `ability` {to, link} | card | Ability layer (Avatar). The newest active one decides; `link` = the damage status that caused it. |
| `nodamage` | card | Damage denied; expires at end of turn. |
| `attacked` | card | Already attacked this phase; expires at end of turn or at a new combat phase. |
| `revealed` {to} | card in hand | Revealed to that player while it stays in hand. |
| `vault` {card} | card | A card exiled by it (Heaven and Sun); removed when it leaves, or when taken. |
| `extraPaid` | card | The optional additional cost was paid (War Drum). |
| `entered` {n} | card | Board entry order (orders aura sources). |
| `nogain` | player | Cannot gain life (Spirit of the Sand). |
| `skipCombat` | player | Next combat becomes End turn; removed when used (Deep Sea Shark). |

King Eye clouds are **derived from the board** (a passive), not stored statuses; the inspector lists them as a derived line.

## Keywords
- **Flash** (Creeping Parasite, War Drum): the permanent can be played like a Quick spell: whenever its owner holds priority, including the opponent's turn and the battle phase, even with objects on the stack. It does **not** use the major action. It still needs a free zone in the right row. It opens the "permanent entered" window only when the turn player played it. [proto]
- **Retaliate** (Shieldguard): whenever the card takes damage (combat or effect) it deals damage equal to its *current* power back to the source: the creature that dealt it, or, if the source was a spell, the spell's controller. Power is read before the card is destroyed. Retaliation damage has type `retaliate` and never retaliates again. [proto]
- **Fast** (abilities): usable whenever the owner holds priority. **Slow** abilities: see "Turn".

## Setup [proto]
- Decks are **singleton** (one copy of each card, currently 25 cards), shuffled from a seed.
- **Deck-building phase:** each player reorders their own deck, then presses Start. Decks lock when a player is ready. When both are ready each gets an opening hand of 5 and Player 1's turn starts.
- Life: 20 each. **[not built]** No win/loss check: life can go to 0 or below and play continues.

## Turn: one major action
1. Draw two (one if only one card is left; illegal on an empty deck), OR 2. Summon one permanent / play one Slow spell, OR 3. Enter the attack phase.
Free: Fast abilities, legal Quick spells, **Flash permanents**, inspecting piles. No draw at turn start.
- **[proto]** Entering the attack phase spends the major action. The phase can be toggled off but the action stays spent.
- **[proto]** **Slow abilities** also spend the major action, on activation (Q19).
- **[proto]** The turn does not end after combat. The turn player presses End turn (stack empty); the opponent gets an end-step window and the turn changes when they pass. **End turn during combat ends the combat phase first** (so "after combat" triggers still fire; if they use the stack, the turn is not over yet).
- **[proto]** Deep Sea Shark: while a `skipCombat` status is on a player, pressing combat becomes End turn and the status is removed. The skipped player's own Shark second-combat ability also uses it up instead of starting a combat.
- `RULES.oneMajor = false` (console) lifts the limit for sandboxing.

## Turn order (Distance/Speed/Acceleration) [not built]
- Start: Distance = Initial Distance. Player farthest ahead takes the turn; ties: coin toss.
- The player who did *not* get the turn advances: `Distance += Speed; Speed += Acceleration`. (D10 S3 A2 -> D13 S5.)
- Overtaking grants the next turn; streaks possible.
- **[proto]** Turns strictly alternate.

## Stack
Add object -> priority/responses -> both pass -> top resolves -> triggers -> priority resumes. Objects: Quick/Slow spells, activated and triggered abilities, **Attacks**. Stack HP = resistance to counter. **HP <= -1 countered; HP 0 resolves.**
- **[proto] Priority:** a player must hold priority to play a spell or activate an ability. After a spell/ability goes on the stack the **opponent** gets priority first. The top object resolves after **two consecutive passes**, then priority returns to the turn player (or the non-turn player in an open window).
- **[proto]** Quick spells: any time the holder has priority. Slow spells and non-Flash permanents: turn player, own priority, empty stack, major action unused, not in the attack phase. In the attack phase only Quick spells, Flash permanents and Fast abilities.
- **[proto] Triggers:** all triggers from one event are pushed together, turn player's first (so the other player's resolve first); priority goes to the turn player's opponent. Order within one player: card creation order (placeholder).
- **[proto] Response windows** (empty-stack priority for the non-turn player): *enter* and *end* only. **The old "attack" window is gone**: the Attack is a stack object, so the defender simply gets priority on it (Q30 resolved).
- **[proto]** A targeted object whose target left the board by resolution **fizzles** (costs stay paid).
- **[proto] Hand abilities** (`zone:'hand'`): activated before anything goes on the stack, so declining reveals nothing (Shieldguard *Swap In*).
- **[proto] Choices:** an effect that needs a decision sets a pending *choice*; only `Choose` is accepted. A multi-step effect (Ambush of the Night, Parasite) suspends the rest of its effect list as a continuation and resumes after each answer. The resolving spell is never a legal pick for its own effect.

## Combat
Enter the combat phase (major action). Then the turn player's creatures attack one at a time, each at most once per phase. Combat does not end the turn.
- **An Attack is a stack object.** `Attack` (turn player, attack phase, **empty stack**, no open window, not yet attacked) puts an Attack object on the stack and marks the attacker `attacked`. Its attack triggers go **above** it as separate objects (so they resolve and can be answered first). The **defender gets priority first**.
- **An Attack has no HP and no snapshot.** Damage dealt to it (Bolt) does nothing. It reads the attacker when it resolves: the attacker's *current* power if it is still on the board, plus the Attack's own **bonus** (damage added by effects, e.g. `addAttackDamage`). If the attacker left the board the attacker's power is 0, but the bonus still lands, down the column it stood in.
- **Cancel Attack** removes the Attack object (no damage; its triggers stay).
- **Normal attacks need an empty stack** unless a card says otherwise. Extra attacks made by an effect (War Drum's returned creature) are declared during that effect's resolution.
- The attacker's column: damage passes through the cards on the foe's side (front, then back), then reaches the foe. **Every** card on the foe's side absorbs damage whoever controls it. An attacker standing on the foe's side hits only what lies beyond it, never backward. Empty column = direct damage. No automatic counter-damage (except Retaliate).
- **Trample:** each target absorbs its *remaining HP* of ATK; the rest continues. A target dies at damage > HP, so ATK = HP + 1 kills **and** tramples 1 (Q20).
- Any creature on the board can attack, including one in a back-row zone.
- Damage to a player is a `damage` status on the player.

## HP and damage
Permanents die at **HP <= -1** (damage > HP). Damage = `damage` statuses (amount, source, type, turn). Types: combat, effect, retaliate. A card may remove chosen instances (Bandages: the controller picks instances; a partly removed one keeps `orig`).
**[proto]** Death is checked by `recalc` after every command, from the folded values: a card at -1 HP inside an aura's columns lives, and dies when it leaves them.

### Life [proto]
Gaining life adds a `life` status to a player (or +HP to a target card). Life total = 20 + life - damage - paid; uncapped both ways.

## Shields and other card statuses [proto]
- **Red shield:** cannot be targeted (zone targets, Scout, Avatar's choice, Parasite lists). A red card under a cloud still makes the cloud targetable; the effect fizzles if it lands on it.
- **Blue shield:** unaffected by spells and abilities that do not target it (The Vine, Infinity Wall, destroy-all, non-targeted damage, Retaliate). Attacks still hit it.
- Shields are statuses; they go when the card leaves the board. A blue card left on a zone that becomes unusable stays there.
- **Revealed:** Creeping Parasite's 0 mode adds a `revealed` status (to the Parasite's controller) to each card in the opponent's hand. It lives in the hand: it is removed (greyed) when the card leaves it.
- **Auras (War Drum -1/-1 on foes, Drummer +1/+1 on own):** while the source is on the board each card in range (its column and the adjacent ones) holds a `mod` status. Leaving the range, or the source leaving, removes it; coming back adds a new one.

## Player stats [not built]
Power, Defense, HP, Initial Distance, Speed, Acceleration.

## Stat layers [not built]
`Original` -> `Base` (persistent) -> `Current` (temporary + equipment). **[proto]** The statuses list replaces the ad-hoc fields: printed stats, then every status in order. Persistence across zones is the `keep` flag. The Base/Current split (equipment) still has to be built on top.

## Zones and columns [not built]
First-class objects: occupancy, usability, restrictions, optional integrity HP, effects, ownership. Column: `IsUsable, IsFullyOccupied, ExileEverything, GetZones`. Zone integrity: separate from permanent HP, unaffected by regular combat; at <= 0 exile contents and mark unusable (Q10).
**[proto]** Slots are a map `owner|row|col -> card id`; `state.unusable` marks unusable zones; clouds are derived from the board.

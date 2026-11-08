# Rules (current design)

Tags: **[proto]** = how the three.js prototype behaves today (where it differs from or refines the design); **[not built]** = designed but not implemented.

## Board
- 5 columns x 4 zones (Opp Back, Opp Front, Player Front, Player Back) = 20 permanent zones.
- Each player: Deck, Extra Deck, Hand, Graveyard (GY), Exile. Shared **Stack** for non-permanents and abilities.
- Creatures -> front row; non-creature permanents -> back row. Occupied destination: move fails.
- **[proto]** Extra Deck and Exile exist only as board zones (Exile holds cards, Extra Deck is inert). Zones are not yet first-class objects (see "Zones and columns").

## Card types
| Type | Enters | Notes |
|---|---|---|
| Creature | Front row | ATK, HP, abilities. Only creatures attack. |
| Non-creature permanent | Back row | HP, no ATK. (`enchantment` in code.) |
| Quick | Stack | Whenever timing allows; repeatable per turn if requirements met. |
| Slow | Stack | Only in an open game state. |

Permanents enter immediately (not via stack); their *enter triggers* use the stack. No universal mana; cards define own costs/restrictions.

## Setup [proto]
- Decks are **singleton** (one copy of each card, 21 cards), shuffled from a seed.
- **Deck-building phase:** each player may reorder their own deck, then presses Start. Decks lock when a player is ready. When both are ready each player gets an opening hand of 5 (top 5 cards) and the game starts with Player 1's turn.
- Life: 20 each (max 20). **[not built]** No win/loss check: life can go to 0 or below and play continues.

## Turn: one major action
1. Draw two (one if only one card is left; illegal on an empty deck), OR 2. Summon one permanent / play one Slow spell, OR 3. Enter the attack phase.
Free: Fast abilities, legal Quick spells, inspecting deck/GY. No draw at turn start. (Singleton decks limit repeat access/infinite chains.)
- **[proto]** Entering the attack phase spends the major action. The attack phase can be toggled off again but the action stays spent.
- **[proto]** **Slow abilities** (Archer *Volley*, Charm *Recall*) also spend the major action, spent on activation, not resolution. Design text said all abilities are free: see Q19.
- **[proto]** The turn does not end automatically after combat. The turn player presses End turn (stack must be empty). Optional automation ends the turn when the player has no legal action left.
- **[proto]** `RULES.oneMajor = false` (console) lifts the limit for sandboxing.

## Turn order (Distance/Speed/Acceleration) [not built]
- Start: Distance = Initial Distance. Player farthest ahead takes the turn; ties: coin toss.
- The player who did *not* get the turn advances: `Distance += Speed; Speed += Acceleration`. (D10 S3 A2 -> D13 S5.)
- Overtaking grants the next turn; streaks possible.
- **[proto]** Turns strictly alternate (End turn passes the turn to the other player).

## Stack
Add object -> priority/responses -> both pass -> top resolves -> triggers -> priority resumes. Players may pass. Objects: Quick/Slow spells, activated and triggered abilities. Stack HP = resistance to counter, not effect strength. **HP <= -1 countered; HP 0 resolves.**
- **[proto] Priority:** a player must hold priority to play a spell or activate an ability. After a spell/ability goes on the stack the **opponent** gets priority first. The top object resolves after **two consecutive passes**, then priority returns to the turn player. Pass is only legal with a non-empty stack.
- **[proto]** Quick spells can be played by the priority holder at any time (including on the stack). Slow spells and permanents: turn player, own priority, empty stack, major action unused, not in the attack phase. In the attack phase only Quick spells (and Fast abilities) are legal.
- **[proto] Triggers** go on the stack when their event happens. All triggers from one event are pushed together, turn player's first (so the other player's resolve first); priority then goes to the turn player. Order within one player's triggers is card creation order (placeholder).
- **[proto]** A targeted object whose target left the board by resolution **fizzles** (no effect; costs stay paid).

## Combat
Creature attacks its own column: attacker -> opposing front -> opposing back -> player; absent targets let damage continue; empty column = direct damage. Damage based on ATK. No automatic counter-damage. Damage persists until removed or the permanent leaves.
- **[proto]** In the attack phase **each** of the turn player's front-row creatures may attack once (stack must be empty). Attacking does not end the turn.
- **[proto]** Declaring an attack fires attack triggers first; damage (`strike`) is dealt only once the stack and any pending choice are clear. If the attacker left the board meanwhile, no damage. Damage follows the attacker's *current* column.
- **[proto] Trample detail:** each target absorbs its *remaining HP* worth of ATK; the rest continues. A target dies at damage > HP (HP <= -1), so a 4-ATK attacker kills a 3-HP creature **and** tramples 1 onward (see Q20).
- **[proto]** Damage to a player is a plain life decrease: no damage instance, no Power/Defense.

## HP and damage
Permanents die at **HP <= -1**. Damage = instances (amount, source, type, timestamp, tags); current damage = sum of active instances. Types: combat, effect, card-defined. Example: 8 damage = A(7) + B(1, from Avatar of Rabies); a card may remove chosen instances.
**[proto]** Instances are `{amount, source, type, turn, seq}`; types `combat` and `effect`. Dying clears them. No card removes instances yet.

## Player stats [not built]
Power (damage-dealt multiplier), Defense (damage-taken multiplier), HP, Initial Distance, Speed, Acceleration. Characters may modify them and have unique abilities.
**[proto]** Only life (20) exists.

## Stat layers [not built]
`Original` (printed) -> `Base` (persistent mod; may persist off field per effect) -> `Current` (temporary + equipment). 1/1 original, 8/8 base, +3/+4 equipment = 11/12; equipment leaves -> 8/8.
**[proto]** Only printed stats; effective HP = printed HP minus damage.

## Zones and columns [not built]
First-class objects: occupancy, usability, restrictions, optional integrity HP, effects, ownership. Zone queries: `CanEnterZone, CanTargetZone, CanMoveToZone, IsZoneUsable`. Column: `IsUsable, IsFullyOccupied, ExileEverything, GetZones`; fully filled = all 4 zones occupied; can become permanently unusable (meaning defined centrally, not per card).
Zone integrity: separate from permanent HP, unaffected by regular combat; at <= 0, exile contents and mark unusable. Implement as zone-level effect/restriction; stacking rules undefined (Q10).
**[proto]** Board slots are a plain map `owner|row|col -> card id`; the only zone logic is "free slot in the right row".

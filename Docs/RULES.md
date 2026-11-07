# Rules (current design)

## Board
- 5 columns x 4 zones (Opp Back, Opp Front, Player Front, Player Back) = 20 permanent zones.
- Each player: Deck, Extra Deck, Hand, Graveyard (GY), Exile. Shared **Stack** for non-permanents and abilities.
- Creatures -> front row; non-creature permanents -> back row. Occupied destination: move fails.

## Card types
| Type | Enters | Notes |
|---|---|---|
| Creature | Front row | ATK, HP, abilities. Only creatures attack. |
| Non-creature permanent | Back row | HP, no ATK. |
| Quick | Stack | Whenever timing allows; repeatable per turn if requirements met. |
| Slow | Stack | Only in an open game state. |

Permanents enter immediately (not via stack). No universal mana; cards define own costs/restrictions.

## Turn: one major action (ends turn)
1. Draw two, OR 2. Summon one permanent / play one Slow spell, OR 3. Enter combat.
Free: abilities, character abilities, legal Quick spells, inspecting deck/GY when allowed. No draw at turn start. (Singleton decks limit repeat access/infinite chains.)

## Turn order (Distance/Speed/Acceleration)
- Start: Distance = Initial Distance. Player farthest ahead takes the turn; ties: coin toss.
- The player who did *not* get the turn advances: `Distance += Speed; Speed += Acceleration`. (D10 S3 A2 -> D13 S5.)
- Overtaking grants the next turn; streaks possible.

## Stack
Add object -> priority/responses -> both pass -> top resolves -> triggers -> priority resumes. Players may pass. Objects: Quick/Slow spells, activated and triggered abilities. Stack HP = resistance to counter, not effect strength. **HP <= -1 countered; HP 0 resolves.**

## Combat
Creature attacks its own column: attacker -> opposing front -> opposing back -> player; absent targets let damage continue; empty column = direct damage. Damage based on ATK. No automatic counter-damage. Damage persists until removed or the permanent leaves. Combat ends the turn.

## HP and damage
Permanents die at **HP <= -1**. Damage = instances (amount, source, type, timestamp, tags); current damage = sum of active instances. Types: combat, effect, card-defined. Example: 8 damage = A(7) + B(1, from Avatar of Rabies); a card may remove chosen instances.

## Player stats
Power (damage-dealt multiplier), Defense (damage-taken multiplier), HP, Initial Distance, Speed, Acceleration. Characters may modify them and have unique abilities.

## Stat layers
`Original` (printed) -> `Base` (persistent mod; may persist off field per effect) -> `Current` (temporary + equipment). 1/1 original, 8/8 base, +3/+4 equipment = 11/12; equipment leaves -> 8/8.

## Zones and columns
First-class objects: occupancy, usability, restrictions, optional integrity HP, effects, ownership. Zone queries: `CanEnterZone, CanTargetZone, CanMoveToZone, IsZoneUsable`. Column: `IsUsable, IsFullyOccupied, ExileEverything, GetZones`; fully filled = all 4 zones occupied; can become permanently unusable (meaning defined centrally, not per card).
Zone integrity: separate from permanent HP, unaffected by regular combat; at <= 0, exile contents and mark unusable. Implement as zone-level effect/restriction; stacking rules undefined (Q10).

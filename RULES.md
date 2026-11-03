# Rules Quick Reference (current design)

## Board

- 5 columns x 4 zones: Opponent Back, Opponent Front, Player Front, Player Back (20 permanent zones).
- Each player also has: Deck, Extra Deck, Hand, Graveyard, Exile.
- A shared **Stack** holds non-permanent cards and abilities.
- Creatures go in front-row zones; non-creature permanents in back-row zones. Moving into an occupied zone fails.

## Card types

| Type | Enters | Notes |
|---|---|---|
| Creature | Field (front row) | Has ATK, HP, abilities. Only creatures attack. |
| Non-creature permanent | Field (back row) | Has HP, no ATK. |
| Quick | Stack | Playable whenever timing allows; can be played multiple times a turn if requirements are met. |
| Slow | Stack | Only in an open game state. |

No universal mana: each card defines its own costs and restrictions.

## Turn: one major action

1. Draw two cards, **or**
2. Summon one permanent **or** play one Slow spell, **or**
3. Enter combat.

Free actions: abilities, character abilities, legal Quick spells, inspecting deck/GY when allowed. There is no draw at turn start.

## Turn order: Distance / Speed / Acceleration

- The player farthest ahead takes the turn. The player who just acted does **not** advance.
- The player who did *not* get the turn advances: `Distance += Speed; Speed += Acceleration`.
- Overtaking grants the next turn; streaks are possible. Ties are a coin toss.

## Stack

Players respond to stack objects, both pass, top resolves, triggers fire, priority resumes. Stack objects have HP: **HP <= -1 = countered; HP 0 still resolves.**

## Combat

A creature attacks its own column. Damage flows: attacker -> opposing front -> opposing back -> player. Empty column = direct damage. Defenders do not automatically hit back. Damage persists. Combat ends the turn.

## HP and death

Every permanent has HP and dies at **HP <= -1**. Damage is tracked as individual **damage instances** (amount, source, type, timestamp, tags), so cards can interact with specific hits.

## Player stats

Power (damage multiplier), Defense (damage-taken multiplier), HP, Initial Distance, Speed, Acceleration.

## Stat layers

`Original` (printed) -> `Base` (persistent modification) -> `Current` (after temporary and equipment modifiers). Example: 1/1 original, 8/8 base, +3/+4 equipment = 11/12 current; removing the equipment returns to 8/8.

## Zones and columns

Zones and columns are first-class objects with occupancy, usability, restrictions and optional integrity HP. Zone integrity is separate from permanent HP and unaffected by regular combat. A zone at <= 0 integrity exiles its contents and becomes unusable. A column is "fully filled" when all four of its zones are occupied.

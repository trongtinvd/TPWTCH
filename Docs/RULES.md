# Rules (current design)

Tags: **[proto]** = how the three.js prototype behaves today (where it differs from or refines the design); **[not built]** = designed but not implemented.

## Board
- 5 columns x 4 zones (Opp Back, Opp Front, Player Front, Player Back) = 20 permanent zones.
- Each player: Deck, Extra Deck, Hand, Graveyard (GY), Exile. Shared **Stack** for non-permanents and abilities.
- Creatures -> front row; non-creature permanents -> back row. Occupied destination: move fails.
- **[proto]** Extra Deck and Exile exist only as board zones (Exile holds cards, Extra Deck is inert). Zones are not yet first-class objects (see "Zones and columns"). Tokens (The Vine) and effects like Creeping Parasite may put creatures into any free zone the effect names, subject to "unusable".

## Card types
| Type | Enters | Notes |
|---|---|---|
| Creature | Front row | ATK, HP, abilities. Only creatures attack. |
| Non-creature permanent | Back row | HP, no ATK. (`enchantment` in code.) |
| Quick | Stack | Whenever timing allows; repeatable per turn if requirements met. |
| Slow | Stack | Only in an open game state. |

Permanents enter immediately (not via stack); their *enter triggers* use the stack. No universal mana; cards define own costs/restrictions.

## Keywords
- **Flash** (Creeping Parasite): the permanent can be played like a Quick spell: whenever its owner holds priority, including the opponent's turn and the battle phase, even with objects on the stack. It does **not** use the major action. It still needs a free zone in the right row. It opens the "permanent entered" response window only when the turn player played it. [proto]
- **Retaliate** (Shieldguard): whenever the card takes damage (combat or effect) it deals damage equal to its *current* power back to the damage's source: the creature that dealt it, or, if the source was a spell, the spell's controller (a player). Power is read before the card is destroyed, so a retaliator that dies still retaliates. Retaliation damage has type `retaliate` and never retaliates again. It only hits a creature still on the board. [proto]
- **Fast** (abilities): usable whenever the owner holds priority. **Slow** abilities: see "Turn".

## Setup [proto]
- Decks are **singleton** (one copy of each card, currently 21 cards), shuffled from a seed.
- **Deck-building phase:** each player may reorder their own deck, then presses Start. Decks lock when a player is ready. When both are ready each player gets an opening hand of 5 (top 5 cards) and the game starts with Player 1's turn.
- Life: 20 each. **[not built]** No win/loss check: life can go to 0 or below and play continues.

## Turn: one major action
1. Draw two (one if only one card is left; illegal on an empty deck), OR 2. Summon one permanent / play one Slow spell, OR 3. Enter the attack phase.
Free: Fast abilities, legal Quick spells, **Flash permanents**, inspecting deck/GY. No draw at turn start. (Singleton decks limit repeat access/infinite chains.)
- **[proto]** Entering the attack phase spends the major action. The attack phase can be toggled off again but the action stays spent.
- **[proto]** **Slow abilities** (Archer *Volley*, Charm *Recall*) also spend the major action, spent on activation, not resolution. Design text said all abilities are free: see Q19.
- **[proto]** The turn does not end automatically after combat. The turn player presses End turn (stack must be empty); the opponent gets an end-step response window and the turn changes when they pass. Optional automation ends the turn when the player has no legal action left.
- **[proto]** `RULES.oneMajor = false` (console) lifts the limit for sandboxing.

## Turn order (Distance/Speed/Acceleration) [not built]
- Start: Distance = Initial Distance. Player farthest ahead takes the turn; ties: coin toss.
- The player who did *not* get the turn advances: `Distance += Speed; Speed += Acceleration`. (D10 S3 A2 -> D13 S5.)
- Overtaking grants the next turn; streaks possible.
- **[proto]** Turns strictly alternate (End turn passes the turn to the other player).

## Stack
Add object -> priority/responses -> both pass -> top resolves -> triggers -> priority resumes. Players may pass. Objects: Quick/Slow spells, activated and triggered abilities. Stack HP = resistance to counter, not effect strength. **HP <= -1 countered; HP 0 resolves.**
- **[proto] Priority:** a player must hold priority to play a spell or activate an ability. After a spell/ability goes on the stack the **opponent** gets priority first. The top object resolves after **two consecutive passes**, then priority returns to the turn player. Pass is only legal with a non-empty stack or an open response window.
- **[proto]** Quick spells can be played by the priority holder at any time (including on the stack). Slow spells and (non-Flash) permanents: turn player, own priority, empty stack, major action unused, not in the attack phase. In the attack phase only Quick spells, Flash permanents and Fast abilities are legal.
- **[proto] Triggers** go on the stack when their event happens. All triggers from one event are pushed together, turn player's first (so the other player's resolve first); priority then goes to the turn player's opponent. Order within one player's triggers is card creation order (placeholder). Triggers fire only for cards in the zone the trigger names (default: the board).
- **[proto] Response windows** (empty-stack priority for the non-turn player): *enter* (after the turn player places a permanent), *end* (end step), and *attack* (see Combat). Passing closes the window.
- **[proto]** A targeted object whose target left the board by resolution **fizzles** (no effect; costs stay paid).
- **[proto] Hand abilities:** a card may have an activated ability usable from the hand (`zone:'hand'`), activated exactly like a graveyard ability (Hummingbird *Feather Balm*): the player chooses to activate *before* anything goes on the stack, so declining reveals nothing. Shieldguard's *Swap In* is the only one so far.
- **[proto] Choices:** effects that need a decision set a pending *choice* and only `Choose` is accepted until it is answered. Preferred UI: click the card, zone or life bar; a popup list is used only when options come from several zones (e.g. Creeping Parasite 3+ with creatures in GY/exile) or for mode / deck picks.

## Combat
Enter the combat phase. This uses the major action. During the phase, the turn player's creatures attack one at a time, each at most once, until the turn ends. Combat does not end the turn by itself.
Any creature standing on the board can attack, including one in a back-row zone. Creatures cannot be placed in the back row normally, but one that ends up there still acts as a creature and attacks down its own column.
Creature attacks its own column toward the **controller's opponent**: damage passes through the cards on the foe's side of the column (front, then back), then reaches the foe. **Every** card on the foe's side absorbs damage whoever controls it. An attacker standing on the foe's side hits only what lies *beyond* it (a foe-side front attacker hits the back row behind it; a foe-side back attacker hits the player directly); it never fires backward. Empty column = direct damage. Damage based on ATK. No automatic counter-damage (except Retaliate). Damage persists until removed or the permanent leaves.
- **[proto]** In the attack phase **each** of the turn player's creatures may attack once (stack must be empty, no open window). Attacking does not end the turn.
- **[proto]** Declaring an attack fires attack triggers first. If the defending player holds a usable *attack-timed hand ability* (`attackedCol`: an opposing creature attacked and they control a creature in that column) an **attack response window** opens; otherwise no window is shown. Damage (`strike`) is dealt only once the stack, any pending choice and the window are clear. If the attacker left the board meanwhile, no damage. Damage follows the attacker's column as it stood when the attack struck (it may die mid-strike, e.g. to Retaliate).
- **[proto] Trample detail:** each target absorbs its *remaining HP* (HP incl. life counters minus damage) worth of ATK; the rest continues. A target dies at damage > HP (HP <= -1), so a 4-ATK attacker kills a 3-HP creature **and** tramples 1 onward (see Q20).
- **[proto]** Damage to a player is recorded as a damage instance on the player (see below).

## HP and damage
Permanents die at **HP <= -1**. Damage = instances (amount, source, type, timestamp, tags); current damage = sum of active instances. Types: combat, effect, retaliate, card-defined. Example: 8 damage = A(7) + B(1, from Avatar of Rabies); a card may remove chosen instances.
**[proto]** Instances are `{amount, source, type, turn, seq}`. Dying clears them. Throwing Bandages removes chosen instances.

### Life counters [proto]
**Gaining life puts life counters** on a player (or on a target card, where each counter adds its amount to the card's HP). Counters are instances `{amount, source, turn, seq}` just like damage instances and are listed in the inspectors. A player's life total = 20 + life counters - damage taken - life paid. Life is uncapped: gains can exceed 20 and damage can take it below 0. Card life counters are removed when the card leaves the board. No current card targets a card with a gain-life effect.

### Player damage instances [proto]
Damage to a player (combat trample, Zap, Archer, Superbolt, Retaliate vs a spell, Creeping Parasite) is a **damage instance on the player**: `{kind:'damage', amount, source, type, turn, seq}` in `state.log[player]`. Life paid as a cost is logged as `kind:'paid'` and gains as `kind:'life'`. The player inspector (hover or click a life bar) lists all of them.

## Counters and shields [proto]
Spirit of the Sand puts a shield counter on each card its controller controls on the board when it resolves.
- **Red shield:** the card cannot be targeted (not by Superbolt/Bandages zone targets, Scout, Avatar's damage choice, Creeping Parasite lists). A red-shielded card under a cloud still makes the cloud a legal target; the effect fizzles if it resolves onto a red card.
- **Blue shield:** the card is unaffected by **spells and abilities that do not target it**: The Vine's destruction, Infinity Wall's column exile, Creeping Parasite's destroy-all, non-targeted damage. It can still be hit by **attacks** (combat damage). Retaliation damage is blocked (counted as an ability).
- Targeted effects still affect a blue card. Shield counters are removed when the card leaves the board.
- **No life gain:** Spirit of the Sand also stops its controller from gaining life (or putting life counters) for the rest of the game.
- **Known limit:** a blue card left on a zone that becomes unusable stays there (the usual "unusable zone sends cards to the GY" sweep skips it).

## Revealed information [proto]
Creeping Parasite's 0 mode reveals the opponent's whole hand to the Parasite's controller. Each revealed card stays face-up **for that player** while it remains in the hand; the flag is cleared when the card leaves the hand. The opponent is not told which cards are revealed to whom beyond their own inspector status.

## Player stats [not built]
Power (damage-dealt multiplier), Defense (damage-taken multiplier), HP, Initial Distance, Speed, Acceleration. Characters may modify them and have unique abilities.

## Stat layers [not built]
`Original` (printed) -> `Base` (persistent mod; may persist off field per effect) -> `Current` (temporary + equipment). 1/1 original, 8/8 base, +3/+4 equipment = 11/12; equipment leaves -> 8/8.
**[proto]** Only printed stats; Black Hawk's doubled power is stored on the instance; effective HP = printed HP + life counters - damage. Inspectors also list *statuses* put on a card by other cards (shields, ability replacement, modified power, life counters, King Eye cover, already attacked).

## Zones and columns [not built]
First-class objects: occupancy, usability, restrictions, optional integrity HP, effects, ownership. Zone queries: `CanEnterZone, CanTargetZone, CanMoveToZone, IsZoneUsable`. Column: `IsUsable, IsFullyOccupied, ExileEverything, GetZones`; fully filled = all 4 zones occupied; can become permanently unusable (meaning defined centrally, not per card).
Zone integrity: separate from permanent HP, unaffected by regular combat; at <= 0, exile contents and mark unusable. Implement as zone-level effect/restriction; stacking rules undefined (Q10).
**[proto]** Board slots are a plain map `owner|row|col -> card id`; `state.unusable` marks unusable zones (Infinity Wall); King Eye clouds are derived from the board.

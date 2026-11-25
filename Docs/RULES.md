# Rules (current design)

Tags: **[proto]** = how the three.js prototype behaves today (where it differs from or refines the design); **[not built]** = designed but not implemented.

## Board

- 5 columns x 4 zones (Opp Back, Opp Front, Player Front, Player Back) = 20 permanent zones.
- Each player: Deck, Extra Deck, Hand, Graveyard (GY), Exile. Shared **Stack** for non-permanents, abilities and Attacks.
- **Creatures go in the front row, enchantments (any non-creature permanent) in the back row, unless a card says otherwise.** Occupied destination: move fails.
- **[proto]** Extra Deck and Exile exist only as board zones. Zones are not yet first-class objects (see "Zones and columns"). Tokens (The Vine, Drummer) and effects like Creeping Parasite put creatures into any free zone the effect names, subject to "unusable".

## Card types

| Type                   | Enters    | Notes                                                            |
| ---------------------- | --------- | ---------------------------------------------------------------- |
| Creature               | Front row | ATK, HP, abilities. Only creatures attack.                       |
| Non-creature permanent | Back row  | HP, no ATK. (`enchantment` in code.)                             |
| Quick                  | Stack     | Whenever timing allows; repeatable per turn if requirements met. |
| Slow                   | Stack     | Only in an open game state.                                      |

Permanents enter immediately (not via stack); their _enter triggers_ use the stack. No universal mana; cards define own costs/restrictions.

## Statuses (one ordered list per card and per player) [proto]

Everything that changes a card or a player after it was printed/started is a **status** in ONE list: `card.statuses[]` and `state.players[p].statuses[]`.

- **Ordered.** Oldest first, **newest is applied last**. Each status has an id (`seq`), kind, source name, turn, and kind-specific data.
- **Current state = a fold of the list.** Reading the list is enough to know the state without replaying the duel. HP = printed HP + life/modifier statuses. ATK = printed ATK, then every `mod` (add) and `atkMul` (multiply) in list order: (2+3)x2 = 10, but 2x2+3 = 7. Damage taken = sum of active `damage` statuses; a card dies at damage > HP. A player's life = 20 + life - damage - paid. `state.life` is only a cache of that fold.
- **Removal, not deletion.** A status is removed when:
  1. its card **leaves the board** (or the zone the status lives in, e.g. a `revealed` status lives in the hand), unless the status has `keep` (an effect says it stays);
  2. it **stops meeting its requirement** (an aura status when the card leaves the source's columns or the source leaves; a status linked to another status when that one ends);
  3. it **clears itself** (Shark's skip-combat once used);
  4. it **expires** (`expires:'turnEnd'`: Quick Intuition's damage denial, "already attacked"; or `expires:{turns:n, whose:'any'|'self'|'foe'}`: it ends after n turns that count, `self` / `foe` relative to the status's controller `by`, counted down at each turn end) **[proto]**;
  5. an effect removes it (Throwing Bandages).
- A removed status **stays in the list** with `removed:{why, turn, seq}`. Every fold ignores it. The inspector and player panel show it **greyed and struck through** when the "Removed: hidden/shown" button in the panel header is on.
- A status that re-applies (a card moves back into War Drum's columns) is a **new** status at the end of the list; the old one stays greyed.

| Kind                                  | On                               | Effect                                                                                                                                                                                      |
| ------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `damage` {amount, orig, type, source} | card, player                     | Damage instance. Bandages lowers `amount` (orig stays) or removes it.                                                                                                                       |
| `life` {amount}                       | card (+HP), player               | Gained life. Blocked by a `cannot gainLife` rule status.                                                                                                                                    |
| `paid` {amount}                       | player                           | Life paid as a cost.                                                                                                                                                                        |
| `mod` {atk, hp}                       | card                             | Additive modifier. Aura ones carry `aura` + source and end when out of range.                                                                                                               |
| `atkMul` {n}                          | card                             | Multiplies ATK at its place in the list (Black Hawk: five x2).                                                                                                                              |
| `shield` {color}                      | card                             | `red` = cannot be targeted; `blue` = unaffected by non-targeting spells/abilities.                                                                                                          |
| `ability` {to, link}                  | card                             | Ability layer (Avatar). The newest active one decides; `link` = the damage status that caused it.                                                                                           |
| `nodamage`                            | card                             | Damage denied; expires at end of turn.                                                                                                                                                      |
| `attacked`                            | card                             | Record: it attacked this phase; expires at end of turn or at a new combat phase.                                                                                                            |
| `attackCounter`                       | card                             | **[proto]** Put on each creature the turn player controls when a combat phase starts; an Attack spends one; `expires:'combatEnd'` (also at turn end).                               |
| `revealed` {to, zone}                 | card in hand / extra deck / deck | Revealed to that player while it stays in that zone (hand: Parasite; extra deck: Fusion cards; deck: L4 looked at it).                                                              |
| `vault` {card}                        | card                             | A card exiled by it (Heaven and Sun); removed when it leaves, or when taken.                                                                                                                |
| `extraPaid`                           | card                             | The optional additional cost was paid (War Drum).                                                                                                                                           |
| `entered` {n}                         | card                             | Board entry order (orders aura sources).                                                                                                                                                    |
| `mats` {cards}                        | extra deck creature              | The materials it was summoned with (`keep`: survives leaving the board). Read by "return the materials used" and by `cond:'usedMat'`. Removed when the materials are returned.              |
| `cannot` / `can` {what}               | card, player                     | Rule statuses (Q8, Q37): `cannot` forbids `what` (`gainLife`, `attack`), a later `can` allows it again; the later-entered one wins (`Sim.allowed`). Spirit of the Sand = `cannot gainLife`. |
| `bonus` {amount}                      | stack object (Attack)            | Damage added to an Attack (Rage). The Attack deals its attacker's power + the sum of its bonus statuses.                                                                                    |
| `cloud` {src}                         | zone                             | King Eye covers this zone. Kept equal to the board by `syncClouds` (recalc, and before `cloudMap` answers).                                                                                 |
| `unusable`                            | zone                             | The zone is unusable (Infinity Wall, a used-up zone HP bar). `keep`: permanent.                                                                                                             |
| `zonehp` / `zonedmg` {amount}         | zone                             | Zone HP: every `zonehp` adds to ONE shared bar, `zonedmg` lowers it. At 0 the contents are exiled (a rule) and the zone becomes `unusable`.                                                 |
| `skipCombat`                          | player                           | Next combat becomes End turn; removed when used (Deep Sea Shark).                                                                                                                           |

King Eye clouds are `cloud` statuses on the zones, kept equal to the board (a passive of the source): they vanish (greyed) when King Eye leaves, and follow it when it moves. **[proto]** Stack objects (spells, abilities, Attacks) hold `statuses[]` too (`bonus`, `nodamage`); they have no lifecycle rules, they simply end with the object.

## Logs (one per card and per player, next to statuses) [proto]

`card.logs[]` / `players[p].logs[]`: append-only history since the duel began. **statuses[] rebuilds the current state; logs[] rebuilds the whole story.** Entries: `start` (position in the shuffled deck), `locked` (position when the deck was locked), `zone` (from -> to and **how**: drawn, milled, entered the board, shifted, destroyed, destroyed by the rules, exiled, returned to hand, put on the stack, resolved, countered), `status+` (applied, with id) and `status-` (removed, with id and reason). The inspector toggles between Statuses and Log; both list the newest on top. Ability tokens have no log. Own counter (`s.lseq`), so status ids do not change.

## Extra deck [proto]

- Each player has an **extra deck**: extra deck creatures (purple cards, `extra:true`, still `type:'creature'`). They are never drawn; they enter only through effects (the Fusion cards), into a front-row zone. Zones: board zone "Extra Deck" (click: list), pile `piles[p].extra`, `loc:'extra'`.
- An extra deck creature has two fields, **`materials`** and **`conditions`**. They do nothing by themselves; effects read them. `materials`: `[{type:'creature'|'enchantment'|'any', n, same?:['atk','hp']}]` (`same`: the n cards share at least one of those stats; current values). `conditions`: `[{op}]` naming an `EXCOND` entry: `LostLife` (a player has lost life at some point, removed damage still counts), `BothDrewMoreThan` (n: each player drew more than n cards since the game started; the opening hand does not count).
- **Fusion effect** (`fusion({from, pay, summon, pick, cond})`): reveal an extra deck creature (`pick`: `conditions` = conditions met and materials available, `fusable` = materials available, `any`), choose its materials among the `from` zones (`board`, `hand`, `deck`, `gy`; a blue-shielded card cannot be used; a choice with one option is made by itself), pay them (`pay`: `gy`, `exile`, `hand`), and if `summon`, summon it (the controller picks the zone). `cond`: `must` (conditions must be met), `ignoreHB` (ignored when every material comes from hand or field), `none`. The materials are spent even if the conditions end up unmet. A revealed card gets a `revealed` status (to the opponent) while it stays in the extra deck.
- The materials used are remembered on the summoned creature (`mats`, kept for good) whichever card summoned it.
- **Temporary control** (L4: The Librarian plays the opponent's top card): the card keeps its `owner`; a `controller` field names who controls it (`Sim.ctl(c)` = controller, else owner; Q56). Control decides the side (zones), who may attack or activate, whose turn triggers, who pays, whose foe is hit. When the card leaves the board or the stack, control ends (`release`) and it goes to its OWNER's graveyard / hand / exile. Only permanents and spells that need no target can be played this way; a spell whose target is optional (Quick Intuition) is played without one (spells that must target: not yet).

## Keywords

Keyworded abilities are ordinary abilities with a short name, so they can be reused and referenced; anything that removes or replaces abilities (Avatar of Rabies) removes them too. **[proto]**

- **Flash** (Creeping Parasite, War Drum): the permanent can be played like a Quick spell: whenever its owner holds priority, including the opponent's turn and the battle phase, even with objects on the stack. It does **not** spend an action point. It still needs a free zone in the right row. It opens the "permanent entered" window only when the turn player played it. [proto]
- **Retaliate** (Shieldguard): a **triggered ability** abbreviated by its keyword (it is NOT a special rule): whenever the card takes damage (combat or effect) the trigger goes on the stack like any trigger (Stack HP 1, priority, responses, it can be countered). When it resolves it deals damage equal to the card's power (its current power if it is still on the board, else its power when it was damaged) to the source: the creature that dealt it (if it is still on the board), or, if the source was a spell, the spell's controller. It triggers even if the card dies from that damage (Q24). Retaliation damage has type `retaliate` and never triggers Retaliate. Damage whose rider replaces the victim's abilities (Avatar of Rabies) triggers neither the 'damaged' abilities it lost nor the ones it gained. [proto]
- **Defender strike back** (game option, off by default; start dialog): when an Attack hits a creature, that creature deals damage equal to its power (read before it may be destroyed) to the attacking creature (if it is still on the board). It is combat damage from the defender (blue shields do not stop it, 'damaged' triggers see it), applied at once by the rule (no stack), to the attacker only (it never tramples on), and it is never struck back. Every creature the Attack damages strikes back; non-creatures do not; an Attack that reaches the player does not. It happens before the defender's own triggers: a Shieldguard first strikes back by the rule, then its Retaliate goes on the stack. `state.cfg.strikeBack`.
- **Fast** (abilities): usable whenever the owner holds priority. **Slow** abilities: see "Turn".

## Setup [proto]

- Decks are **singleton** (one copy of each card): a main deck (10 to 100 cards, currently 28 in the pool) shuffled from a seed, and an **extra deck** (0 to 20 extra deck creatures, never shuffled).
- **Deck-building phase:** each player reorders their own deck, then presses Start. Decks lock when a player is ready. When both are ready each gets an opening hand of 5 and Player 1's turn starts.
- Life: 20 each. A player at life -1 or less has lost (see Victory). Paying life may bring a player down to 0, not below (life 0 can still pay 0); starting life can be set from 0 up.
- **Game options [proto]** (the Vs Bot / Vs Self dialog, `state.cfg`, Sim option `rules`): cards at the start (default 5), cards per draw phase (1), cards per Draw action (2), starting HP (20, also the max life), and the player names (`state.names`, default "Player"; the bot is "Bot"). Replays record them; a replay recorded before the draw phase existed replays with 0 cards per draw phase.

## Victory [proto]

- A player **loses at life <= -1** (0 is still alive), checked by `recalc` after every command. Both players at -1 or less at once = a **draw**.
- An effect can make a player win (`winGame`: the controller, or with `'foe'` the opponent).
- `Surrender` ends the game at once (the other player wins) and is allowed at any time, even during a choice. `Leave` is the same with the reason "left" (a player walking away from a running game).
- The result is recorded **once** in `state.result = {winner, why, turn}` and never changes (`why`: life, surrender, left, effect). Play is not stopped by the Sim: the host shows the result dialog, and **Continue** (both players) just goes on with the same game, result unchanged. **Rematch** (both players) starts a new game at once. **Leave** returns to the menu; the other side's dialog disappears and its Exit button pulses.

## Turn and action points [proto]

**Turn order [rule update 2026-11-24, proto]:** start (action point, turn-start triggers, the turn-start stop) -> **draw phase** (the turn player draws `cfg.drawPhase` cards, 1 by default, then the "cards drawn" stop) -> main phase -> combat phase (optional) -> main phase or end phase. The draw phase comes once the start is over (nothing on the stack, no open window or choice); the first turn of the game has one too. `state.step` = start | draw | main | combat | end (shown in the status line).

Each player holds **action points** (shown as four-point stars under the life bar; click one for its inspection panel). A player gains **one at the start of their own turn** (the first player when the game starts). **Unspent points stay**, so a player can hold several. Spending one is how the old "major action" works:

1. **Draw** two (`cfg.drawAction`; fewer if the deck runs short; illegal on an empty deck), costs one point, OR 2. **Summon** one permanent / play one **Slow** spell, costs one point. **Slow abilities are free** unless the card says otherwise (a `spendAP` cost): they only need an open game state and their controller's turn **[proto since 2026-11-22]**, OR 3. **Enter the attack phase**, costs one point.

- All of these still need an **open game state** (empty stack, no open window) and **the controller's own turn**; a point alone is not enough. Free: Fast abilities, legal Quick spells, **Flash permanents**, inspecting piles. The draw phase is free (it is not the Draw action).
- Cards can spend a point themselves, **also on the opponent's turn** when the player has one: War Drum's optional additional cost (`extraCost:{ap:true}`), the `spendAP` cost (Depth Sea Fusion's ability).
- Entering the attack phase spends a point; the phase can be toggled off but entering it again costs another.
- A spent point stays in the player's list (`players[p].ap`: `{id, turn, spent:{why, turn}}`) and is written to the game log (`ActionPointSpent`); clicking that log line opens the point's inspection panel (gained on turn N, spent on turn M by what).
- **Ending combat goes back to the main phase [rule update 2026-11-24, proto]** (replaces "combat ends, then the turn ends"). The turn player may spend another action point on another combat (new attack counters, so a creature can attack again). Pressing **End turn** during combat ends combat and then the turn (`state.turnEnding`: "after combat" triggers still fire; the end-step window opens once nothing is pending). Entering combat and not attacking is legal.
- Deep Sea Shark: while a `skipCombat` status is on a player, pressing combat becomes End turn and the status is removed. The point is not spent. The skipped player's own Shark second-combat ability also uses it up instead of starting a combat.
- `RULES.apLimit = false` (console) lifts the limit for sandboxing (no point is needed or spent).

## Turn order (Distance/Speed/Acceleration) [proto 2026-11-25]

- Start: Distance = Initial Distance. Player farthest ahead takes the turn. Tie breakers, in order: greater Speed, greater Acceleration, the player who did not take the previous turn, coin toss (only possible at the start). [decided 2026-11-25]
- The player who did _not_ get the turn advances: `Distance += Speed; Speed += Acceleration`. (D10 S3 A2 -> D13 S5.)
- Overtaking grants the next turn; streaks possible.
- **[proto]** The stats are the avatars' outfit stats (`initialDistance`, `speed`, `acceleration`), passed to the Sim as the game option `rules.race` (recorded with replays). No race (no avatars, older replays, the rules tests): turns strictly alternate.
- **[proto]** The start coin toss is seeded from the game seed (replays repeat it).
- **[proto]** Stats change through `race` statuses on the player (`{kind:'race', stat:'distance'|'speed'|'acceleration', amount}` adds, `set` replaces; folded in list order, like card stats). Advancing grows the base Distance and Speed; statuses stay on top. Events: `CoinToss`, `RaceAdvanced`.
- **[proto]** `Sim.turnOrder(s, n)` projects the next n turns (current first) from a copy of the race; the **turn order strip** (right side, `js/view/turn-strip.js`) redraws it on every sync, so any stat change re-projects at once. Blue = your turns, red = the opponent's; the top tile flashes, later ones fade out.

## Stack

Add object -> priority/responses -> both pass -> top resolves -> triggers -> priority resumes. Objects: Quick/Slow spells, activated and triggered abilities, **Attacks**. Stack HP = resistance to counter. **HP <= -1 countered; HP 0 resolves.**

- **[proto] Priority:** a player must hold priority to play a spell or activate an ability. After a spell/ability goes on the stack the **opponent** gets priority first. The top object resolves after **two consecutive passes**, then priority returns to the turn player (or the non-turn player in an open window).
- **[proto]** Quick spells: any time the holder has priority. Slow spells and non-Flash permanents: turn player, own priority, empty stack, an action point available, not in the attack phase. In the attack phase only Quick spells, Flash permanents and Fast abilities.
- **[proto] Triggers:** all triggers from one event are pushed together, turn player's first (so the other player's resolve first); priority goes to the turn player's opponent. Order within one player: card creation order (placeholder).
- **[proto] Enter triggers are queued before the state-based check.** A permanent that dies the moment it enters (War Drum answered by War Drum: each one's -1/-1 aura kills the other) still has its enter triggers on the stack, and they resolve.
- **[proto] Response windows** (empty-stack priority for the non-turn player): _enter_ and _end_ always; and, when the host turns them on (`state.stops`: on in real games, off in the rules tests), seven more **stops**: turn started, cards drawn, main phase started, main phase ended, combat started, combat ended, stack emptied (each gives the non-turn player priority on an empty stack; the Pass button names it). _Enter_ and _end_ are **on by default, not forced**: a player turns them off like any stop; with nobody wanting the end step the turn ends at once (`Sim.stopOn` = the one answer, defaults included). **Per-player stops, turn-player stop [proto]:** `state.stops = {Player:{opp:{kind:true}, own:{kind:true}}, Opponent:{...}}`; `opp` = the windows a player gets as the non-turn player (enter and end on unless turned off), `own` = as the turn player; a flat object means `opp` for both. The window is `{kind, stage:'foe'|'turn'}`: the non-turn player first, then the turn player (if their `own` stop is on). In the turn stage only Quick spells, Flash permanents and Fast abilities are legal (no open game state: no Slow card, Draw, combat or End turn). The stops are set in the game: small icons in the bottom right corner (their turn / your turn, MTG Arena style); a click sends `SetStop {player, role, kind, on}` (allowed at any time, recorded for replays) and keeps the choice as the default for the next game . _Main phase started_ opens after the draw phase and after each combat (once nothing is pending). _Main phase ended_ opens when the turn player presses Combat or End turn in the main phase: the press waits, and happens (Combat: the action point is spent then) when the window closes; if it became illegal meanwhile it is dropped (`DeferredCommandFailed`). **The old "attack" window is gone**: the Attack is a stack object, so the defender simply gets priority on it (Q30 resolved).
- **[proto]** A targeted object whose target left the board by resolution **fizzles** (costs stay paid).
- **[proto] Resolving:** a spell or ability whose effect asks for choices (Fusion: materials, summon zone; Ambush of the Night) stays _resolving_ (shown in the stack panel as "Resolving…" ) (`state.resolving`, a spell is neither on the stack nor in the GY) until the last answer. Only then does it go to the GY, `StackObjectResolved` is logged and the stack-emptied stop opens. So the order is: materials paid, creature summoned, spell to the GY.
- **[proto] Trigger order and targeting:** all triggers of one event wait in `state.trg`. With `state.orderTriggers` on (the host sets it; the rules tests do not), a player with several of them gets a `trigorder` choice (non-turn player first, then the turn player; the top row resolves first). A trigger with a `targeting` (Widow Maker: `adjacentPair`) picks its target when it is put on the stack (Yu-Gi-Oh: condition : cost / targeting ; effect), stored as `pick` on the stack object; with no legal target it is not put on the stack. Then they are pushed in this order: turn player's mandatory, the other player's mandatory, turn player's optional, the other player's optional (`optional:true` on the trigger; no pool card has one yet). Only a player's mandatory triggers are reorderable (Q7). Attacks and extra attacks declared by those effects are declared during resolution, so they land above them.
- **[proto] Hand abilities** (`zone:'hand'`): activated before anything goes on the stack, so declining reveals nothing (Shieldguard _Swap In_).
- **[proto] Choices:** an effect that needs a decision sets a pending _choice_; only `Choose` is accepted. A multi-step effect (Ambush of the Night, Parasite) suspends the rest of its effect list as a continuation and resumes after each answer. The resolving spell is never a legal pick for its own effect.

## Combat

Enter the combat phase (an action point). Then the turn player's creatures attack one at a time, each at most once per phase. When combat ends the player is back in the main phase **[proto]** (see Turn).

- **An Attack is a stack object.** `Attack` (turn player, attack phase, **empty stack**, no open window, not yet attacked) puts an Attack object on the stack and marks the attacker `attacked`. Its attack triggers go **above** it as separate objects (so they resolve and can be answered first). The **defender gets priority first**.
- **An Attack has no HP and no snapshot.** Damage dealt to it (Bolt) does nothing. It reads the attacker when it resolves: the attacker's _current_ power if it is still on the board, plus the Attack's own **bonus** (damage added by effects, e.g. `addAttackDamage`). If the attacker left the board the attacker's power is 0, but the bonus still lands, down the column it stood in.
- **Cancel Attack** removes the Attack object (no damage; its triggers stay).
- **Normal attacks need an empty stack** unless a card says otherwise. Extra attacks made by an effect (War Drum's returned creature) are declared during that effect's resolution.
- The attacker's column: damage passes through the cards on the foe's side (front, then back), then reaches the foe. **Every** card on the foe's side absorbs damage whoever controls it. An attacker standing on the foe's side hits only what lies beyond it, never backward. Empty column = direct damage. No automatic counter-damage (except Retaliate).
- **Trample:** each target absorbs its _remaining HP_ of ATK; the rest continues. A target dies at damage > HP, so ATK = HP + 1 kills **and** tramples 1 (Q20).
- Any creature on the board can attack, including one in a back-row zone.
- Damage to a player is a `damage` status on the player.

## Attack counters [proto]

- When a combat phase starts (entering combat, or a second combat), each creature the turn player controls gets **one attack counter**. A creature that enters later in that phase gets none, so it cannot attack.
- `Attack` spends one counter (it also records `attacked`). No counter = no normal attack. Extra attacks made by effects (Shark, Widow Maker, War Drum) need no counter.
- Unspent counters end when the combat phase ends. A card may spend a counter as a cost (Vanguard).

## HP and damage

Permanents die at **HP <= -1** (damage > HP). Damage = `damage` statuses (amount, source, type, turn). Types: combat, effect, retaliate. A card may remove chosen instances (Bandages: the controller picks instances; a partly removed one keeps `orig`).
**[proto]** Death is checked by `recalc` after every command, from the folded values: a card at -1 HP inside an aura's columns lives, and dies when it leaves them.

### Non-lethal and temporary damage [proto]

- **Non-lethal**: the newest live status that changes HP (damage, life, HP modifier, zone HP / zone damage) decides. While it is non-lethal damage, HP at or below the death line does not kill (a card, a zone bar). Any HP status entered afterwards (normal damage, +HP, -HP) takes over and can kill; a newer non-lethal damage keeps holding.
- On the stack non-lethal changes nothing: stack HP <= -1 still counters the spell or ability.
- **Temporary**: the damage status expires at the end of the turn (`expires:'turnEnd'`).
- **Non-player HP targets** (`hp.js` registry `HPKINDS`): board cards with HP, zones with an HP bar (a black cloud counts and passes the effect down to the card beneath, else to the zone bar, else fizzles), spells and abilities on the stack (not Attacks). Never a player; red shields excluded. A new kind of HP thing is one registry entry.

### Life [proto]

Gaining life adds a `life` status to a player (or +HP to a target card). Life total = 20 + life - damage - paid; uncapped both ways.

## Shields and other card statuses [proto]

- **Red shield:** cannot be targeted (zone targets, Scout, Avatar's choice, Parasite lists). A red card under a cloud still makes the cloud targetable; the effect fizzles if it lands on it.
- **Blue shield:** unaffected by spells and abilities that do not target it (The Vine, Infinity Wall, destroy-all, non-targeted damage, Retaliate). Attacks still hit it.
- Shields are statuses; they go when the card leaves the board. A blue card on a zone that becomes unusable is NOT exiled by Infinity Wall (an effect cannot touch it), but its zone is gone, so the **rules** (not an effect) send it to the GY: blue does not protect it, and its statuses are removed with the reason "its zone became unusable".
- **Revealed:** Creeping Parasite's 0 mode adds a `revealed` status (to the Parasite's controller) to each card in the opponent's hand. It lives in the hand: it is removed (greyed) when the card leaves it.
- **Clouds hide counts and picks [proto]:** a creature under an enemy cloud counts as none when an effect counts the foe's creatures (Creeping Parasite's modes and its draw count): next to a King Eye the foe sees one creature, King Eye. A zone under a cloud is a legal pick (Parasite: 4 damage, return to hand): every such zone is offered, empty or not, and a card under a cloud is never offered by itself. If the picked zone is empty, or holds a red-shielded card, the effect fizzles and nothing is revealed.
- **Auras (War Drum -1/-1 on foes, Drummer +1/+1 on own):** while the source is on the board each card in range (its column and the adjacent ones) holds a `mod` status. Leaving the range, or the source leaving, removes it; coming back adds a new one.

## Player stats [not built]

Power, Defense, HP, Initial Distance, Speed, Acceleration.
 Defined (name, icon, description) in `config/stats.json`; each avatar outfit gives them placeholder values (`config/avatars.json`, shown in the character selection scene). Gameplay does not read them yet; the duel's life is still the start dialog's Starting HP. A duel records each player's avatar (`state.avatars`: `{character, outfit}` ids, public); the Sim emits **`CardPlayed {iid, player}`** for every card played from a hand (presentation: the avatar's `playing_card`). See `Docs/AVATARS.md`.

## Stat layers [not built]

`Original` -> `Base` (persistent) -> `Current` (temporary + equipment). **[proto]** The statuses list replaces the ad-hoc fields: printed stats, then every status in order. Persistence across zones is the `keep` flag. The Base/Current split (equipment) still has to be built on top.

## Zones and columns [partly built]

First-class objects: occupancy, usability, restrictions, optional integrity HP, effects, ownership. Column: `IsUsable, IsFullyOccupied, ExileEverything, GetZones`. Zone integrity: separate from permanent HP, unaffected by regular combat; at <= 0 exile contents and mark unusable (Q10).
Zone HP is **disabled by default**; it exists only after an effect gives a zone HP, and several such effects share **one** HP bar (decided 2026-11-22, Q10).
**[proto]** Slots are a map `owner|row|col -> card id`; `state.zones[key] = {key, statuses[]}` holds the zone's statuses: `unusable`, `cloud`, `zonehp` / `zonedmg`. Zone HP (Q10) is built as a status bar; no card gives it yet (effects `GiveZoneHp`, `DamageZone`, tests only).

## Rulings 2026-11-22 (decided; **[not built]** unless marked **[proto]**)

Answers to the numbered questions in `OPEN_QUESTIONS.md`. Where this section and an older line above disagree, **this section wins** and the older line is tagged.

### Leaving play and zones

- Words like destroy, bounce, spin (to the deck) and exile are only shorthand for what a card does; they are **not keywords**. The game only cares about **from which zone to which zone, how and why**. A card leaving the board goes to its **owner's** zone X.
- A card sent from the field to the graveyard is a single kind of move (the event `PermanentDestroyed` is only its name): it records `from`, `to` and `by` (`rule`: lethal damage, a zone that is gone; `effect`; `cost`), and a rule-sent card is sent exactly like an effect-sent one (Q45). **[proto]**
- Leaving the board ends **all** statuses on the card unless the card text says otherwise (also for card life statuses on bounce). **[proto]**
- Zone HP is disabled until an effect gives a zone HP; effects share one HP bar. **[proto]**
- An effect may create a creature in a zone that is normally illegal for it **only if the card text says so** (The Vine: any usable zone, back row included).

### Targeting and shields

- A legal target meets the requirement written on the card **and** is not blocked by an effect such as red shield. **[proto: finders]**
- Blue shield protects only against spells and abilities, never against attacks or rules. **[proto]**
- A resolving spell stays on the stack (resolving) until all its effects are done. It is a legal pick of its own effect only if the effect says so (`upTo(..., types, true)`: offered from the graveyard it is about to enter, and picking itself sends it to the hand instead). Ambush of the Night does not imply itself. **[proto]**
- Effects that pick an Attack ask the player to choose which one when several match (`attackpick` choice: Rage's bonus, Cancel Attack). With one Attack nothing is asked. **[proto]**

### Statuses

- Contradicting modifiers are statuses, folded in list order; **effects that entered later win**. `mod` and `atkMul` fold in list order too (no "auras last" rule). Aura sources are applied oldest first. Rule statuses `cannot` / `can` follow the same order (`Sim.allowed`). **[proto]**
- A card re-entering an aura's range gets a **new** status. **[proto]** The `entered` status stays visible. **[proto]**
- Stack objects (spells, abilities, **Attacks**) also have `statuses[]`; "damage added to an Attack" becomes a status. **[proto]**
- Clouds (King Eye) and unusable zones become statuses **on the zones**. Action points stay their own objects. An Attack is a unique stack object, not a card. **[proto]**
- A damage counter is one instance (one `damage` status). **[proto]**
- A multi-turn effect says which turns count: any turn, its controller's turns only, or the opponent's turns only (`expires:{turns:n, whose:'any'|'self'|'foe'}`). **[proto]**

### Information and logs (anti-cheat)

- **Public to both players:** cards on the board, in graveyards, in exile. **Private to the owner:** deck, extra deck, hand. A card may change that (King Eye hides, Creeping Parasite reveals).
- The Observation a player gets (state, events, logs) contains **only** what is public to that player. `Sim.observe(state, p)` builds it (`js/sim/observe.js`; `Sim.canSee` is the one rule): a card p may not know is an opaque stub (hidden hand / extra deck cards) or not mentioned at all (a card under an enemy cloud, a deck: only its size); ids of hidden cards are hashes of the seed, the viewer and the real id, so the position in the deck list cannot be read back; names in statuses and texts are masked; a pending choice is detailed only for its chooser. `Sim.observeEvents(pre, post, events, p)` does the same for a command's events, `Narrate.story` for the log. Treat this as a security feature: the host must not send hidden data to a client, so a modified client cannot read it. **[proto; no host sends Observations yet, the view still reads the state]**
- Each player's log shows only what is available to them (the opponent's hand card is "a card"). `revealed` ends when the card leaves the hand (or the extra deck for extra deck cards, or the deck). **[proto]**
- **A card looked at in a deck stays revealed while it is in that deck:** L4's "look at the top cards" and "look at the top card" give each card a `revealed` status (to L4's controller, zone `deck`); `canSee` lets that player know it (the board shows it face up on top of the deck, the Observation lists it in `piles[q].deckKnown`). Reordering the deck keeps it; drawing or any other move ends it.
- Logs and statuses share a **200 MB cap**; reaching it **ends the game**: `RULES.historyCap`, estimated from the number of status and log entries (`Sim.historyBytes`: bytes per entry, no serialising); the game becomes a draw by `cap` (a game decided earlier keeps its result), `state.capped` is set and every later command is refused. **[proto]**

### Timing and stack

- Mandatory effects go on the stack first; mandatory effects may be rearranged among themselves. Simultaneous triggers: turn player's first, so the other player's resolve first. **[proto]**
- Slow/Fast is declared **per card**. Abilities cost nothing unless the card says so (they do **not** spend an action point by default). **[proto]**
- **Flash** permanents enter immediately, even with objects on the stack. **[proto]**
- An extra attack (War Drum): the effect that put the card in play resolves; then the Attack goes on the stack; the defender may respond (a Shieldguard played in response enters; the Attack deals damage and goes away; Shieldguard's trigger resolves; then the rest of the stack).
- **Stops:** the opponent gets a stop, then the turn player gets one. Which stops are on is a **per-player** setting, Arena style. **[proto]**
- **Combat:** entering combat and not attacking is legal. When combat ends the player is back in the main phase **[proto]**. Friendly cards ahead of a back-row attacker do not absorb its damage. ATK = HP + 1 kills and tramples 1. **[proto]**
- **Simulation output:** the sim emits the result of each command as ONE flat (1D) array of events, in the order things happened; the presentation layer reads that array in order so animations play in the right order. **[proto]** (tests: no nested events, a permanent is summoned before its trigger is stacked, an attack is declared before it is stacked)

### Win and end

- If a win effect and a life loss happen together, **whichever resolves first** decides; if they are truly simultaneous the game is a **draw**. Continuing a decided game never changes the result. **[proto]** Leaving a running game: as in Victory. **[proto]**

### Action points and the extra deck

- No cap; a player gets **one point when their turn starts**. Opening hands do not count as drawn. **[proto]**
- Fusion is not a gamble: the game tells the player whether the conditions are met, and the player is responsible for checking they can perform the summon (conditions, materials and every card in hand, board and deck are visible to them). **[proto reveals; the UI hint is partly built]**
- Control: the **owner** stays the owner; the **controller** is the player who plays or controls the card. Spells, abilities and attacks care about the controller unless the text says otherwise. **[proto]** (`card.controller`, `Sim.ctl`; stack objects had `controller` already.)
- "Adjacent" counts cards of both players unless the card says otherwise (Widow Maker: the opponent's adjacent cards only). Same-stat material checks use current values. **[proto]**
- Heaven and Sun: if it leaves play its `vault` statuses are removed and the exiled cards can no longer be retrieved (intended). **[proto]**

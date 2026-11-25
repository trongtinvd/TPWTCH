# Architecture

**Rules are data + simulation, not presentation code.**

```
Content -> Simulation -> Events/Observations -> Presentation
Human and AI both drive the same Simulation.
```

## Simulation / presentation split

Simulation never touches Node3D, meshes, animations, cameras, VFX. It takes **Commands**, emits **Events**; presentation animates events. Events are rules facts (`CreatureAttackDeclared`), not visual (`AttackAnimationStarted`) unless a mechanic needs real-time interaction. Enables human/AI/headless matches, replays, tests, balance runs.

- Commands (design): Draw, Summon, PlayCard, Attack, ActivateAbility, ChooseTarget, PassPriority, MovePermanent, AttemptParry.
- Events (design): TurnStarted/Ended, PermanentEntered/Left/Summoned, CreatureAttackDeclared, AttackStarted, DamageAttempted/Dealt/Received, CreatureDestroyed/PermanentDestroyed, CardDrawn/Played/Exiled, StackObjectCreated/Resolved, AbilityActivated.

### Implemented in the prototype

- **Commands:** `ReorderDeck`, `Start`, `Draw`, `PlayCard`, `Pass`, `SetAttackPhase`, `Attack`, `Choose`, `Activate`, `EndTurn`, `Surrender`, `Leave`, `SetStop` (any time, also during a choice or deck building), `SetAutoPick` (any time: a player turns off / on the automatic pick of a single legal option, `state.noAuto[player]`), `DebugToHand` (debug). (`Choose` answers any pending choice; `Surrender` / `Leave` are allowed at any time.)
- **Events:** `DeckReordered`, `PlayerReady`, `GameStarted`, `CardDrawn/Added/Milled/Discarded`, `PermanentSummoned/Moved/Destroyed/Returned`, `StackObjectCreated/Resolved/Damaged/Countered/Fizzled`, `DamageDenied`, `PriorityPassed`, `ResponseWindowOpened/Closed`, `AbilityActivated`, `AttackPhaseChanged`, `CreatureAttackDeclared`, `AttackCancelled`, `AttackBoosted`, `CombatSkipped`, `DamageDealt`, `DamageRemoved`, `PlayerDamaged`, `LifePaid`, `LifeCounterAdded`, `CounterAdded`, `CardExiled`, `ZoneUnusable`, `AbilitiesTransformed`, `ChoiceRequested/Made`, `TurnChanged`, `StackEmptied`, `GameDecided`, `ActionPointGained` / `ActionPointSpent` (action points, `js/sim/ap.js`: one per player turn, spent by Draw, combat, summons, Slow cards, and cards that ask for it), `CardRevealed`, `CardReturnedExtra`, `DrawStepEntered`, `StopChanged`, `EffectFailed` (an effect could not do anything; the host shows why), `CardPlayed` (a card played from a hand).
- `Sim.dispatch(state, cmd)` mutates state and returns `{ok, why, events}`. Content (`DEFS`) is injected into `Sim.create(n, defs)`.
- **Presentation host:** `send(cmd)` keeps `sim` (authoritative) and `game` (on screen). While showcase animations play, `game` is the pre-command snapshot; input is rejected until they finish. Animations are derived by diffing stack snapshots (Q13).
- **Undo** = `structuredClone` snapshots (max 200); `eventLog` keeps 200 events (not yet a replay format).
- **UI seat vs priority:** `ui.view` is the viewed seat; "Auto view" follows priority; "Switch player" pins it.
- **Click-based choices:** a pending `state.choice` without `labels` is answered by clicking; with `labels` the picker lists the options.
- **Determinism:** `mulberry32(seed)`; seeds from the game number. The only other generator is the bot's own seeded `botRng` (its choices, never the game's).

## Core systems

GameState, PlayerState, BoardState, CardInstance, PermanentInstance, StackObject, CharacterState, EquipmentState; Turn, Combat, Stack, Effect, Trigger, Damage, Zone systems.
**[proto]** One `state` object: `cards` (iid -> instance), `piles` per player, `slots`, `stack`, `players[p].statuses`, `life` (cache), priority, `respond` (response window), `choice`, `unusable`. Logic is plain functions in `Sim`.

## Cards

- **CardDefinition** (immutable). **[proto]** Deep-frozen; factories receive `Fx`.
- **CardInstance** (mutable): zone, owner, slot and **`statuses[]`**. **[proto]** `{iid, def, owner, loc, slot, statuses[], logs[]}`; nothing else is stored on an instance (no `damage[]`, `life[]`, `counters`, `atk`, `xform`, `revealed`, `vault`, `extraPaid`).
- Primitives (design): `DealDamage, Destroy, Exile, Move, Summon, Draw, ModifyStat, ModifyRule, AddAbility, RemoveAbility, CreateTrigger, CreateDelayedEffect, CreateChoice, WaitForInput`. **[proto]** see `effects.md`.
- Effect kinds: one-shot, triggered, continuous, rule/restriction. **[proto]** One-shot and triggered effects; continuous effects are **statuses** (shield, nogain, skipCombat, mod, atkMul...).

## Statuses (the modifier layer) [proto]

**One ordered list per card and per player replaces the ad-hoc fields.** This is the first implementation of the modifier registry:

- Every change is `addStatus`; every undo is `removeStatus(why)`. A removed status stays in the list (greyed in the UI), so the list is also the history of the card.
- **State = fold of the list, oldest to newest** (`hpOf`, `atkOf`, `lifeOf`, `abDef`, `has`). No status reads another card's fields except through a declared requirement.
- **Lifecycle is generic, not per card:** `zone` (removed when the card leaves it; `keep` overrides), `aura` requirement, `link`, `expires`. `recalc` applies them after every command; effects never clean up after themselves.
- Precedence is the list order ("newest applied last"). This answers Q8 for stat folds; it does not yet cover rule statuses that contradict each other (`cannot` vs `can`).
- `Sim.statusLines(owner)` is the only thing the UI reads for statuses: card inspector and player panel are the same renderer, with a show/hide toggle for removed ones.
- **[proto]** Statuses also live on **zones** (`state.zones[key].statuses`: `unusable`, `cloud`, `zonehp` / `zonedmg`) and on **stack objects** (`bonus`, `nodamage`). King Eye clouds are `cloud` statuses kept equal to the board. Rule statuses `cannot` / `can` (folded in list order, `Sim.allowed`) replace ad-hoc flags. Not yet on the list: `s.combats`, action points (`players[p].ap`, their own list with the same keep-the-history idea).

## Logs [proto]

**Debug log** (`js/log/debuglog.js`, headless): one entry per accepted command: the state before it in one line (turn, stage, who acts / priority, HP, action points, hand / deck / GY / board sizes, stack, open stop, pending choice), the command with cards as `Name#iid[P1]` and its sender (player / auto / bot / replay), the bot's decision (`botDecide(..., trace)`: candidates and every command tried, without changing the random draws), every rule event as a sentence plus all its fields, and what changed (`delta`). It shows ALL information. The game log's "All events" mode shows it; **Export** (log panel, result window, replay bar) saves the whole game as `.txt` (header with seed, decks, options, result; `#0` = opening hands and deck order) or `.json` (the replay record + every entry). `DebugLog.build(rec)` replays any record headless, so a file can be made for any replay. A test fails when a Sim event type has no sentence.

`logs[]` sits next to `statuses[]` on every card and player: statuses = current state, logs = the whole history (deck position, zone changes with their reason taken from the rule events of the command, status applied / removed). Zone changes are detected by `syncLogs` (end of every `recalc`, so also at the end of every command) and labelled from the events; a move with no matching event is logged as "moved". Status add/remove hook into `addStatus` / `removeStatus` (status stamped with `own`). State grows: see Q43/Q44.

## Effective-state queries

GameState is truth; queries apply statuses: `CanEnterZone, GetEffectiveStat, GetEffectiveDistance, GetEffectiveAbilities, GetVisibleInformation, CanDealDamage, CanTarget, CanMove, CanAttack`. **[proto]** Reason-string checks (`canPlay`, `canActivate`, `canAttack`) plus folds: `hpOf`, `atkOf`, `abDef` (ability layer), `has(card,'red'|'blue')`, `hasSt(o, kind)`, `isRevealed`, `cloudMap`. `canAttack` reads the `attacked` status.

## Abilities

Layered: original, granted, disabled/removed, effective. Never delete; compute the effective set. **[proto]** `abDef(card)`: the newest active `ability` status decides; it is linked to the damage status that caused it, so removing that damage ends it.

## Turn state machine [proto]

`js/sim/turn.js` is the only writer of the turn's fields (`step`, `attackPhase`, `combats`, `turn`, and the pending flags `drawPending`, `mainPending`, `turnEnding`, `mainEndDone`); every other file reads them. The stage is `step`, or `ending` while `turnEnding` holds. Transitions (`Sim.TURN`, each with the stages it may start from): `gameStarted`, `drawBegins` / `drawEnds` (start -> draw -> main), `mainDue` / `mainSeen` (the main phase started stop), `combat` (on / off), `combatEndsTurn` (End turn during combat), `extraCombat` (Shark), `endStepDue`, `endStep`, `nextTurn` / `turnStarts`, `deferredRuns` / `deferredDone`, `forceCombat` (tests only). The rules tests turn `RULES.strictTurn` on: a transition from another stage throws. The fields stay on the state, so replays and the golden games keep their shape.

## Stack, priority, attacks

**[proto]** The stack holds spells, abilities and **Attacks** (`kind:'attack'`, no HP, no snapshot; they read the attacker when they resolve). Triggers of an attack sit above it as their own objects; the defender has priority first. Response windows remain only for _enter_ and _end_. `s.pending` and the attack window no longer exist.

## Targeting

Categories: Card, Permanent, Creature, Zone, Column, Player, Stack Object, Damage Instance. **[proto]** Finders: `opposingFront`, `attacker`, zone targets, column targets, player targets, list picks. Damage instances are `damage` statuses, so "target a damage instance" (Bandages) is picking from the status list. Red-shielded cards are filtered from all of them.

## Information

**[proto] `Sim.canSee(state, player, card)` is the one rule** for what a player may know: the board (unless covered by a cloud the owner controls), the GY, exile and the stack are public; a hand or the extra deck is known to its owner and to whoever it was revealed to; a deck is known to nobody. The table (face-down cards), the inspector, the deck / extra deck lists and BOTH logs ask it, so a hidden card cannot leak by accident (a test plays bot games with decks that share no card name and fails when a name shows up in a log that may not know it). Each player has their own log (`Narrate.story(Sim.observeStep(pre, post, cmd, events, viewer))`; narrate.js only formats, it never sees the full state, so all hiding lives in `js/sim/observe.js`; an ability whose source is hidden is hidden too): their own cards by name, the other player's hidden cards as "a card", names coloured by owner; the two logs together are the whole game. "All events" shows the raw events (debug; not offered in a Vs Bot game, nor is the bot's log).
AI and UI get a filtered **Observation**, not raw GameState. **[proto]** `Sim.observe(state, player)` (`js/sim/observe.js`) returns plain data with only what that player may know: own hand and extra deck by name; the other hand and extra deck as opaque stubs (ids are hashes of seed + viewer + real id); decks as sizes; cards under an enemy cloud not mentioned; stack objects from hidden sources masked ("King Eye: Ability"); a choice only for its chooser; status texts scrubbed of hidden names. `Sim.observeEvents` filters a command's events the same way. `tests/suites/14-rulings-information.js` plays bot games with disjoint decks and fails when a hidden name or id shows up in an Observation, an event or a log line. The bot reads only its options (`Sim.optionsFor`, below) and the leak test checks those too. The view still reads the full state (a single-process prototype): moving it onto Observations is the next step.

## Real-time input

Simulation -> `InputWindowRequested` -> presentation prompt -> `PlayerCommand` -> simulation resolves. **[proto]** Only `WaitingForChoice` and empty-stack response windows.

## Determinism and replays

Initial state + RNG seed + commands = same result. Statuses use the global `s.seq` counter, so ids are deterministic too.
**Golden replays** (`tests/golden/replays.json`, suite `26-golden-replays.js`): 12 recorded bot-vs-bot games (seed, options, decks as card ids, commands, an FNV-1a hash of each command's events and of the final state). Replaying the commands must give the same hashes and the bot must choose the same commands: the safety net for refactors and the spec a port must replay. After an intended rules or bot change, `node tests/run.js --record-golden` rewrites the file (one command per line, so the diff shows what changed).

**Bot vs Bot** (`js/game/bot-match.js`, start panel `js/screens/bot-match-ui.js`, main menu button): `BOTS` is the bot list the panel offers (only `random` now; a new bot is one more entry with `decide(state, p, rnd, mem, trace)`). `BotMatch.record(cfg)` makes a replay record with `bb = {seed, bots}`; the Sim seed and each seat's bot generator come from that one seed, so seed + decks + options + bots always play the same match. `BotMatch.run(rec)` plays it headless (max 4000 commands; `end` = decided / max / stuck), then the replay viewer opens it: watched with the animations, or with "Skip presentation" jumped to the end (`Replays.jumpEnd`). The viewer plays the bots again to show their decisions in the log. A summary opens at the end (Export log, Save replay, Watch from start, Run again, Main menu); matches are not saved to Replays unless asked (only 5 are kept).

Replays (`js/screens/replay.js`) are exactly that: seed + both decks + the accepted commands. A replay only views (no gameplay UI, switchable seat, minimisable controls). **Take over** continues it as a new duel (kind `over`, from the start or from the current position; the bot seat is `ui.botSeat`).

## AI

```
AI: BeliefModel (hidden info, sampled worlds) | IPlanner (Greedy/Beam/Determinized/MCTS/ISMCTS) | PersonalityEvaluator (weights)
```

- Loop: observe -> sample worlds -> simulate own actions + responses -> evaluate -> execute first action -> re-plan. Belief: probabilities for opponent hand/deck; revealed cards are certain information.
- Score = StateEvaluation + EventEvaluation; personality = weight vector. Difficulty = search depth, beam width, samples, time budget, noise.
- Branching: hand abilities, response windows, mode / pick choices and Attack objects on the stack add branching; the planner needs to enumerate `Choose` options cheaply. Statuses make state hashing larger: removed statuses should be excluded from hashes.
- **[proto]** Planning not started. The bot (`js/game/bot.js`) is random and never sees the state: `Sim.optionsFor(state, p)` (`js/sim/options.js`) gives it plain data (its legal plays with their zones / columns, abilities, attackers, the pending choice's options, action points), and `Sim.accepts(state, cmd)` tells it whether a command would be accepted without changing the state. `botDecide(options, rnd, mem, legal)` is the whole decision; `botChoose(state, p, rnd, mem)` is the host's wrapper. `Sim.actionsOf` / `Sim.hasAction` drive the UI highlights and automation.

## Simulation lab (dev only)

Headless runs, replay, stats, AI tournaments, personality evolution. Benchmark first: simulated turns/sec on target PC. Removed statuses grow the state; pruning policy needed before long runs (Q32).

## Risks

1. Too many independent systems / no central skill identity (README, Q18).
2. Rule interaction explosion -> generic effect system, not per-card exceptions.
3. Modifier order conflicts (list order solves stat folds only).
4. AI compute.
5. Real-time input vs deterministic sim.
6. Information complexity.
7. Hidden information leaking through timing or through status lists.
8. State growth from kept-but-removed statuses.

## Rules tests

Status of the tests in `tests/suites/` (`node tests/run.js`, or `cardGame.selfTest()` in the console; headless):

- [x] Effect APIs valid; determinism; deck phase; draw / action points; placement.
- [x] **Action points** (gain per turn, persist, several, off-turn spending, events) and the **extra deck** (default / custom lists, Fusion cards, materials solver, Widow Maker, L4 with temporary control, deck store and `deckProblem` with an extra deck).
- [x] Combat trample and edge cases; Attack objects (no HP, bonus, cancel, attacker leaving, defender priority).
- [x] Stack HP, LIFO, costs, fizzle; triggers and simultaneous order.
- [x] Infinity Wall, King Eye, Bandages, Avatar, Vine, Superbolt/GrainFall, Black Hawk/Bolt Master, Flash, Retaliate, shields, Spirit, Shieldguard.
- [x] War Drum, Deep Sea Shark, Quick Intuition, Ambush of the Night.
- [x] **Statuses:** list order and folds (order matters), removal on leaving the board (kept, greyed), `keep`, zone-bound (`revealed`, vault), expiry, aura enter / leave / return, linked ability, player list folds, `nogain`.
- [ ] Creeping Parasite modes other than 0 reveal.
- [ ] Undo removing tokens (view); foe-side attacker direction in the view.
- [ ] Zone/column restrictions block the intended operations _(partly)_.
- [ ] Base stats persist; equipment changes only current stats _(not built)_.
- [x] Observations and logs leak nothing hidden (bot games with disjoint decks); [ ] the AI and the view read Observations only _(not built)_.
- [ ] Simulated games reproduce real-game outcomes _(needs command recording)_.

## 3D side view

`js/anim/` holds the 3D side view: config in `config/`, assets in `assets/`. The Sim is untouched; the view reads its events (attack, damage, cards leaving the board) and plays the animations. Details: `Docs/ANIMATION_3D.md`. `js/view/hand-scroll.js` scrolls a big hand with the mouse wheel (top and side view); `js/core/back-nav.js` maps the browser Back button (popup: cancel, deck editor / replay: Exit, game: Surrender popup, menu: nothing).

`js/content/cardDescription.json` = the written card descriptions (CardText in cards.js; the generated text is the default, the inspector's "Text" button switches, the card data never changes). `js/core/camera-config.js` + `config/camera.json` = top view / classic camera / seat turn (see `Docs/CAMERA.md`). `anim3d.html` + `js/anim/card-models.js` + `js/anim/card-preview.js` = the standalone 3D card preview (`?anim3d`), models in `assets/3dModels/cards/`. Sim: `Sim.choicePicks` (the legal picks of a choice, for validation and highlighting), `Sim.stopOn`, `Sim.slotSeen` (logs and observed events hide where a hidden card stands).

**Player avatars** (`js/avatar/`, `js/screens/character-select.js`, `config/avatars.json`, `config/stats.json`, `Docs/AVATARS.md`). Start > character selection scene (own screen and renderer) > Confirm > duel. The Sim only records `state.avatars` (`{character, outfit}` per seat, public in Observations, kept by replays) and emits `CardPlayed`; everything else is presentation: `AvatarView` keeps one `Character3D` per seat (made at the duel start, shown in the side view only), the life bar rows carry the avatar icons. The 3D view keeps a camera the player moved across resizes and lets the own hand slide sideways (`Docs/CAMERA.md`).

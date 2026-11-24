# Player avatars

An **avatar** is the character a player controls in a duel. It has a character identity and name, outfits, a 3D model (per character, optionally per outfit), outfit meshes and materials, outfit stats, outfit abilities (for now a flavor text) and animations. All of it is data: adding a character or an outfit is a JSON edit, nothing in the selection scene or the game code names a character (a test checks this).

Animations: `Docs/animationGuide.md` section 5. GLB export rules: same guide, section 0.

## Files

| File                             | What                                                                                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config/avatars.json`            | characters (selection order), their outfits, the shared animation sets, where the avatars stand in the side view                                                     |
| `config/stats.json`              | the player stats (`Docs/RULES.md` "Player stats"): id, name, icon, description, in display order                                                                     |
| `js/avatar/avatar-logic.js`      | pure: normalising, selection (`cycleCharacter`, `cycleOutfit`, `fix`, `isValid`), `describe`, `iconOf`, `resolve`, `lifeState`, `cues`, `placement` (headless tests) |
| `js/avatar/avatar-catalog.js`    | loads the two configs (`AvatarCatalog.get()`, `.reload()`)                                                                                                           |
| `js/avatar/avatar-models.js`     | the placeholder humanoid, outfits applied to any model, the built-in clips                                                                                           |
| `js/avatar/avatar-icons.js`      | the icon next to a player's name (PNG, else a generated one)                                                                                                         |
| `js/avatar/avatar-view.js`       | in the duel: one avatar per seat, icons, life state, events, side view placement                                                                                     |
| `js/screens/character-select.js` | the character selection scene                                                                                                                                        |
| `css/avatar.css`                 | the scene and the life bar rows                                                                                                                                      |

## The flow

Main menu > Vs Self / Vs Bot > start dialog > **Start** > **character selection scene** (its own screen and renderer) > **Confirm** > duel. Back returns to the start dialog with the same settings. Vs Self: Player 1 chooses, then Player 2. Vs Bot: the player chooses; the bot gets a random other character in its default outfit. The last confirmed choice per seat is remembered (`Settings` `avatarPick`). Keys: Left / Right = character, Up / Down = outfit, Enter = Confirm, Esc (or the browser's Back) = Back.

The duel records `{character, outfit}` per seat in `state.avatars` (ids only; the Sim never reads them for rules). Replays, Rematch and Take over keep them; an older replay has none and shows the seats' defaults (first character for Player 1, second for Player 2).

## Add a character

Append to `characters` in `config/avatars.json` (the order is the selection order):

```json
{
  "id": "moss",
  "name": "Moss",
  "model": null,
  "visual": { "scale": 1, "offset": [0, 0, 0], "rotationDeg": [0, 0, 0], "heightOffset": 0 },
  "animations": "humanoid",
  "icon": { "image": "assets/avatars/moss/icon.png", "label": "M" },
  "body": {
    "torso": { "shape": "box", "size": [0.6, 0.7, 0.35] },
    "head": { "shape": "sphere", "size": [0.42, 0.42, 0.42] },
    "arms": { "length": 0.6, "thickness": 0.14 },
    "legs": { "length": 0.7, "thickness": 0.17 },
    "materials": {
      "Body": "#4f7a3a",
      "Skin": "#d9c3a0",
      "Limbs": "#2e4a22",
      "Trim": "#c9a54a",
      "Accent": "#9bd16b",
      "Eyes": "#111111"
    },
    "parts": [
      {
        "name": "Leaf",
        "shape": "cone",
        "size": [0.12, 0.3, 0.05],
        "attach": "Head",
        "at": [0, 0.5, 0],
        "material": "Accent"
      },
      {
        "name": "Scarf",
        "shape": "torus",
        "size": [0.45, 0.1, 0.4],
        "attach": "Torso",
        "at": [0, 0.68, 0],
        "material": "Trim",
        "hidden": true
      }
    ]
  },
  "defaultOutfit": "plain",
  "outfits": [
    {
      "id": "plain",
      "name": "Plain",
      "stats": { "power": 3, "defense": 3, "hp": 20, "initialDistance": 3, "speed": 3, "acceleration": 3 },
      "abilities": [],
      "flavor": "..."
    }
  ]
}
```

| Key                        | Meaning                                                                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | unique; what duels and replays record. Do not rename it once used                                                                                                                                                         |
| `name`                     | shown exactly as written                                                                                                                                                                                                  |
| `model`                    | a GLB path; `null` = the placeholder humanoid built from `body`                                                                                                                                                           |
| `visual`                   | scale (number or `[x, y, z]`), offset, rotation, height of the model                                                                                                                                                      |
| `animations`               | an animation set name (`animationSets`) or an inline set                                                                                                                                                                  |
| `icon`                     | `image` = a PNG (or any image) path; `label`, `background`, `color`, `ring` = the generated placeholder icon (defaults: the first letter and the body colours)                                                            |
| `body`                     | the placeholder: `torso` / `head` shape (`box`, `sphere`, `cylinder`, `cone`; head also `octahedron`) and `size` = bounding box `[w, h, d]` in metres; `arms` / `legs` length and thickness; `materials` by name; `parts` |
| `outfits`, `defaultOutfit` | at least one outfit; the default is selected when the character is (a missing default: the first outfit, with a warning)                                                                                                  |

**Placeholder parts:** `name` (unique in the character, outfits show / hide it by this name), `shape` (`box`, `sphere`, `cylinder`, `cone`, `torus`, `octahedron`, `dodecahedron`), `size` `[w, h, d]`, `attach` (`Torso`, `Head`, `ArmL`, `ArmR`, `LegL`, `LegR`, or nothing = the torso), `at` (centre, relative to that node: Torso = hips, Head = neck, arms = shoulder, legs = hip joint; the model faces +Z), `rotationDeg`, `material`, `hidden` (an outfit shows it). Material names are free; `Body`, `Skin` (head, hands), `Limbs`, `Eyes` are used by the body itself.

## Add an outfit

Append to the character's `outfits`:

```json
{
  "id": "moss-winter",
  "name": "Winter Coat",
  "model": null,
  "meshes": { "show": ["Scarf"], "hide": ["Leaf"] },
  "materials": {
    "Body": "#ffffff",
    "Trim": { "color": "#88aaff", "emissive": "#112244", "metalness": 0.2, "roughness": 0.5 }
  },
  "parts": [
    {
      "name": "Hat",
      "shape": "cone",
      "size": [0.4, 0.4, 0.4],
      "attach": "Head",
      "at": [0, 0.55, 0],
      "material": "Trim"
    }
  ],
  "visual": { "scale": 1.05 },
  "stats": { "power": 2, "defense": 5, "hp": 22, "initialDistance": 3, "speed": 2, "acceleration": 2 },
  "abilities": [],
  "flavor": "Warm, slow and stubborn.",
  "icon": { "image": "assets/avatars/moss/winter.png" }
}
```

| Key          | Meaning                                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`         | unique within the character                                                                                                                                                                      |
| `model`      | a GLB that replaces the character's model for this outfit (optional)                                                                                                                             |
| `meshes`     | `show` / `hide`: node names in the model (placeholder parts, or mesh / node names of the GLB). A name that is not found logs a warning                                                           |
| `materials`  | by material name: a colour, or `{color, emissive, metalness, roughness}`. On a GLB the material names are the ones from Blender; the outfit recolours its own copies (the file is never changed) |
| `parts`      | extra placeholder parts (also on a GLB: attached to the node named by `attach`)                                                                                                                  |
| `visual`     | multiplied (scale) / added (offset, rotation, height) to the character's                                                                                                                         |
| `stats`      | one number per stat id of `config/stats.json` (missing = shown as "-"; an unknown id is reported). Placeholders: gameplay does not read them yet                                                 |
| `abilities`  | `[{ "id", "name", "text", "data" }]`: shown instead of the flavor text when not empty. `data` is kept untouched for the future ability system                                                    |
| `flavor`     | shown while an outfit has no abilities                                                                                                                                                           |
| `icon`       | the outfit's own icon (else the character's)                                                                                                                                                     |
| `animations` | optional: an animation set name or inline set that replaces the character's for this outfit                                                                                                      |

The selection scene lists the outfits in this order; the small preview shows the same model in that outfit, the stats come from `stats`, the text from `abilities` / `flavor`.

## Give an outfit (or a character) a different model or mesh

- **A whole different model:** set the outfit's `model` to a GLB path. The character's `model` stays the default for the other outfits.
- **The same GLB, different meshes:** put every variant in one GLB (e.g. `Coat`, `Cape`, `Helmet` as separate objects), then use `meshes.show` / `meshes.hide` per outfit; recolour with `materials`.
- **Replacing a placeholder with a GLB:** set the character's `model` (and remove nothing else: `body` is used again if the file fails to load). Feet at the origin, facing glTF +Z, about 1.6-2 m tall (`visual.scale` otherwise). Clips: `animationGuide.md` section 5.
- **Icons:** put a PNG (square, e.g. 128 x 128) in `assets/` and set `icon.image` on the character or the outfit. A missing image keeps the generated icon.

## Stats and icons

`config/stats.json`: `{ "id", "name", "icon", "description" }` per stat, in display order. The stats are the player stats of `Docs/RULES.md` (Power, Defense, HP, Initial Distance, Speed, Acceleration); the design documents name them but had no icons, so simple ones were drawn: `icon` is SVG path data in a 16 x 16 box, or an image path. A new stat = a new entry here plus a value in each outfit.

## In the duel

- **Life bars:** each row is avatar icon + name + life bar (+ action points). Clicking the icon, the name or the bar does exactly what clicking the life bar always did (the row's single handler: inspect the player, or pick them as a target).
- **Landscape:** the other seat top left, right of the stack panel; the seat on screen bottom right, above the buttons and stops (on a short screen with many buttons: under the stack panel). Avatar first, the name right of it, the life bar under both. Vs Self swaps them with the view. **Portrait:** one box under the inspector; the seat on screen on the left with its avatar left of the name and bar, the other seat on the right with its avatar right of them.
- **3D (side view only):** each avatar stands at the centre of the area behind its board, facing the other (`sideView` in `config/avatars.json`: `behind` metres behind the back row, `offsetX`, `height`, `scale`). It is never picked by clicks and draws under the hands. Top view: hidden and paused.

## Checks

`node tests/run.js --only avatar-` (configs, selection, animation categories, wounded / death thresholds, the duel record, CardPlayed, placement, hand drag limits, no hard-coded character). In the browser: `AvatarView.stats()`, `CharacterSelect.debug()`.

## Not built yet

Stats and abilities do not affect gameplay; the outfit `HP` stat and the start dialog's Starting HP are separate (the dialog decides the duel's life). No GLB or PNG ships yet (placeholders only). The bot's avatar is random, not chosen by a personality.

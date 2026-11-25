# Animation guide: GLB models, animations and camera animations

How to put your own 3D models, their animations and camera moves into the game. Nothing in the code changes: you add files and edit JSON.
Working samples of everything below are in **`assets/templates/sample-card/`**:

| File                     | What it is                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `sample-card.glb`        | a small model with three clips inside it: `Idle` (loop), `Select` (0.9 s), `Attack` (0.6 s)            |
| `camera_orbit.glb`       | a camera animation made as a glTF camera (1.2 s, character space)                                      |
| `camera_push.json`       | a camera animation made as keys (`tpw-camera` format, 1 s, with FOV)                                   |
| `character.json`         | a ready character entry for `config/characters.json` (uses the model, its clips and both camera files) |
| `card-model.json`        | ready entries for `assets/3dModels/cards/index.json` (a GLB model and a script model)                  |
| `card-model-template.js` | a card model made by code (copy, rename the builder, edit)                                             |

`node tests/run.js --only anim-templates` checks that these templates are valid.

There are **two places** a model shows:

1. **The 3D card preview** (`index.html?anim3d`, standalone page): one model per card, plays a _selection_ animation. Config: `assets/3dModels/cards/index.json`.
2. **The 3D side view of the game** (Side view button): a _character_ stands on every creature card and plays its animations (enter, idle, attack...). Config: `config/characters.json`. Camera animations play here, attached to an animation.
3. **The player avatars**: each player's chosen character stands behind their board in the side view, and in the character selection scene. Config: `config/avatars.json` (section 5; characters and outfits: `Docs/AVATARS.md`).

The same GLB can serve all three.

---

## 0. Making the GLB (Blender)

- **Units:** metres. A zone on the board is 2 x 2 m; a character of about 1-1.5 m fits. Set `scale` in the JSON rather than re-exporting.
- **Feet at the origin**, standing on the ground (y = 0 in the game).
- **Facing:** the model must face glTF **+Z**. In Blender that is **-Y**: the model looks at you in the _Front_ view (numpad 1).
- **Apply transforms** (Ctrl+A > All Transforms) before export.
- **Animations:** one Blender _action_ per animation, with a clear name (`Idle`, `Select`, `Attack`...). The action name is the clip name in the GLB. Export: File > Export > glTF 2.0, format **glTF Binary (.glb)**, _Include > Selected Objects_ if needed, _Animation_ on, _Group by NLA Track_ off or on (each action must come out as its own clip).
- **Clips in separate files** are allowed for characters (one GLB per animation, same bone names as the model); the preview reads clips from the model file only.
- **Camera animation in Blender:** a Camera object with keyframed location and rotation, exported alone as `.glb` (_Include > Cameras_). glTF cannot animate the FOV: for a zoom use the JSON format (section 3).

Check a file quickly: drop it on https://gltf-viewer.donmccurdy.com/ - it lists the clips by name.

---

## 1. A card model for the 3D card preview (`?anim3d`)

1. Put the file in **`assets/3dModels/cards/`**, e.g. `assets/3dModels/cards/hummingbird.glb`.
2. Add (or edit) the card in **`assets/3dModels/cards/index.json`** under `"cards"`; the key is the card id from `js/content/cards.js` (`Fx.creature('hummingbird', ...)`):

```json
"hummingbird": {
  "type": "gltf",
  "path": "hummingbird.glb",
  "scale": 1,
  "offset": [0, 0, 0],
  "rotationDeg": [0, 0, 0],
  "select": "Select"
}
```

| Key                              | Meaning                                                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `type`                           | `gltf` (a .glb / .gltf file) or `script` (a model made by code, below)                                                           |
| `path`                           | relative to `assets/3dModels/cards/`, unless it starts with `assets/` (anywhere in the repo)                                     |
| `scale`, `offset`, `rotationDeg` | placement; the preview also fits very small / very big models to about 1.4 m                                                     |
| `select`                         | the clip played when the card is selected. Without it: a clip whose name contains "select"; without one: a built-in hop and spin |

3. Open `index.html?anim3d=hummingbird` (or open `?anim3d` and click the card). The status line says which model and which selection animation it uses, or why it shows a placeholder.

**Try the template now:** in `index.json` replace the hummingbird line with
`"hummingbird": { "type": "gltf", "path": "assets/templates/sample-card/sample-card.glb", "select": "Select" }`.

**A model made by code** (`type: "script"`): copy `assets/templates/sample-card/card-model-template.js` to `assets/3dModels/cards/procedural/`, rename the builder, and add
`"<card id>": { "type": "script", "path": "procedural/<file>.js", "builder": "<name>", "params": { } }`. The builder returns a `THREE.Object3D`; `userData.select(t)` (t = 0..1) can draw its own selection animation. Example: King Eye (`procedural/eye.js`).

`"byConvention": true` in `index.json` makes every card without an entry try `assets/3dModels/cards/<card id>.glb`.

---

## 2. A character with animations in the 3D side view

1. Put the files under `assets/`, e.g. `assets/models/hummingbird/hummingbird.glb` (+ one GLB per animation if the clips are separate).
2. In **`config/characters.json`**, add the character under `"characters"` and map the card under `"cards"`. Template (`assets/templates/sample-card/character.json`):

```json
"cards": { "hummingbird": "hummingbird" },
"characters": {
  "hummingbird": {
    "model": { "path": "assets/models/hummingbird/hummingbird.glb", "scale": 1, "offset": [0, 0, 0], "rotationDeg": [0, 0, 0], "heightOffset": 0 },
    "defaults": { "speed": 1, "interpolation": { "method": "crossfade", "duration": 0.25 } },
    "animations": {
      "enter":  [ { "id": "hb_enter", "clip": "Select" } ],
      "idle":   [ { "id": "hb_idle", "clip": "Idle" } ],
      "attack": [ { "id": "hb_attack", "clip": "Attack",
                    "camera": [ { "id": "hb_cam", "file": "assets/templates/sample-card/camera_push.json" } ] } ],
      "get_hit": [ { "id": "hb_hit", "file": "assets/models/hummingbird/hit.glb" } ]
    },
    "transitions": [ { "from": "hb_attack", "to": "hb_idle", "interpolation": { "method": "ease", "duration": 0.4 } } ]
  }
}
```

**Categories** (when they play): `enter` (the creature appears), `idle` (loops), `attack` (its Attack resolves), `finishing_attack` (lethal: the attack took the player below 0 and decided the game; empty = `attack`), `get_hit` (it takes damage), `die` (it goes to the GY), `channeling_idle`, `stun` (no game event yet: console `View3D.debug.play('stun')`). Several entries in a category = a random pick, never the same twice in a row. An empty or missing category plays a procedural clip.

**An animation entry**

| Key            | Meaning                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `id`           | required, unique within the character                                                                                   |
| `clip`         | the clip name. With no `file`: a clip of the MODEL file (clips inside the model, like the template)                     |
| `file`         | a separate animation file (GLB / glTF, or JSON `three-clips`); `clip` then picks inside it (default: its first clip)    |
| `loop`         | `repeat` (default for idle, channeling_idle, stun), `once` (default otherwise), `pingpong`; `repetitions` limits repeat |
| `speed`        | x the character's `defaults.speed`                                                                                      |
| `then`         | the category after a one-shot (default `idle`; `die` holds its last pose)                                               |
| `camera`       | camera animations for this animation (section 3); one is picked at random                                               |
| `cameraChance` | 0-1, the chance a camera animation plays at all (default 1)                                                             |

**Transitions** (`from` id -> `to` id, one direction): either `animations` (a clip played once in between) or an `interpolation`: `crossfade`, `warp`, `ease`, `cut`, with a `duration` in seconds. No transition: `defaults.interpolation`.

3. Reload the page (the configs load again each time you switch Top view / Side view), start a game, put the card on the board, press **Side view**. Console: `View3D.debug.play('attack')`, `View3D.stats()`.

**Try the template now:** paste the `sample-card` character from `character.json` into `config/characters.json` and set `"cards": { "archer": "sample-card" }`; the console helper `View3D.demo()` starts a game with an Archer on the board.

---

## 3. Camera animations

A camera animation belongs to an animation entry (`"camera": [ ... ]` above): when that animation plays, the camera moves, then returns to the seat camera. Each camera entry:

```json
{
  "id": "hb_cam",
  "file": "assets/templates/sample-card/camera_orbit.glb",
  "speed": 1,
  "space": "character",
  "blendIn": 0.25,
  "blendOut": 0.35
}
```

- `space`: `character` (default: origin = the character's feet, +Z = the way it faces, +Y up), `seat` (board space turned with the seat), `world` (board space: origin = centre of the table, +Z towards the Player).
- `blendIn` / `blendOut`: seconds to blend from the current camera / back to the seat camera (defaults in `config/camera3d.json` `animation`).
- Two formats:
  - **GLB / glTF** (`camera_orbit.glb`): a camera node with an animation (position + rotation). The FOV stays the camera's.
  - **JSON keys** (`camera_push.json`): `{ "format": "tpw-camera", "duration": 1.0, "keys": [ { "t": 0, "position": [x, y, z], "target": [x, y, z], "fov": 45 }, ... ] }`. The camera sits at `position` and looks at `target`; `fov` is optional; between keys everything is interpolated. Easiest to write by hand.
- Two camera animations one after the other: `config/camera3d.json` `animation.transitions` (`{ "from": "<cam id>", "to": "<cam id>", "interpolation": { "method": "crossfade", "duration": 0.15 } }`).

The seat camera itself (where the camera rests) is not an animation: `config/camera3d.json` (side view) and `config/camera.json` (top view); see `Docs/CAMERA.md`.

---

## 4. When something does not show

| What you see                                                    | Why / what to do                                                                                                               |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A coloured slab in the preview, "the model could not be loaded" | wrong `path`, or the file is not pushed. The console names the file.                                                           |
| "no 3D model in .../index.json"                                 | the card id is not in `index.json` (check the id in `js/content/cards.js`)                                                     |
| A cube on the board instead of the model                        | the character's `model.path` failed (console `[3D]` warning)                                                                   |
| The model moves with a procedural bob instead of its clip       | the `clip` name does not exist, or the clip's bones do not match the model (console: "track(s) do not fit the model")          |
| The model faces away / lies on its back                         | it was not facing Blender -Y with transforms applied; or fix it with `rotationDeg` (e.g. `[0, 180, 0]`)                        |
| Nothing loads at all, console says `file://`                    | open the game through a web server (GitHub Pages, or `python -m http.server` in the repo), not by double-clicking `index.html` |
| A change does not show on GitHub Pages                          | Pages may serve the old copy for a few minutes; reload with Ctrl+F5                                                            |

Every file falls back on its own: no model = cube / placeholder, no clip = a procedural clip, no camera file = the camera does not move. A broken file never stops the game.

---

## 5. Player avatars

An avatar is the character a player controls in a duel (chosen in the character selection scene, see `Docs/AVATARS.md` for characters, outfits and models). Its animations use **the same architecture as the card characters**: the same entry format (section 2 table), random pick without an immediate repeat, `loop` / `then`, directional `transitions`, the same loader (`js/anim/asset-loader.js`) and the same controller class (`Character3D`, `js/anim/character.js`). Only the categories differ, and an avatar's controller is its own (one per seat, made when the duel starts, never duplicated by switching Top / Side view).

**Categories**

| Category       | When it plays                                                                                                                                        | Default `loop` / `then` |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `enter`        | the first time the avatar is shown in the duel (the side view opens, or the duel starts in the side view); also when it comes back from death (Undo) | `once` -> `idle`        |
| `idle`         | the normal waiting animation; loops whenever nothing else plays                                                                                      | `repeat`                |
| `idle_wounded` | an **overlay over idle** while the player's life is below 50% of the duel's starting life (see below)                                                | `repeat`                |
| `dies`         | the player's life reaches -1 or less (they lose); the last pose is held                                                                              | `once` -> `hold`        |
| `playing_card` | the player plays a card from their hand (the Sim's `CardPlayed` event)                                                                               | `once` -> `idle`        |

Each category is an array; every entry needs an `id` unique within the character. A card category (`attack`, `get_hit`...) is an error in an avatar set, and the reverse.

**Where the configuration lives**

```json
"animationSets": {
  "humanoid": {
    "defaults": { "speed": 1, "interpolation": { "method": "crossfade", "duration": 0.25 } },
    "animations": {
      "enter":        [ { "id": "enter_drop", "procedural": "drop" }, { "id": "enter_spin", "procedural": "spin_in" } ],
      "idle":         [ { "id": "idle_breathe", "clip": "Idle" } ],
      "idle_wounded": [ { "id": "wounded_slump", "file": "assets/avatars/common/wounded.glb", "weight": 0.8 } ],
      "dies":         [ { "id": "dies_fall", "clip": "Death" } ],
      "playing_card": [ { "id": "card_cast", "clip": "Cast" }, { "id": "card_throw", "clip": "Throw" } ]
    },
    "transitions": [ { "from": "idle_breathe", "to": "card_cast", "interpolation": { "method": "ease", "duration": 0.2 } } ]
  }
},
"characters": [ { "id": "epsy", "animations": "humanoid", ... } ]
```

A character's `animations` is the name of a set in `animationSets` (several characters share one) or an inline set with the same shape. An outfit may have its own `animations` (a set name or inline), which replaces the character's for that outfit.

**Adding an animation:** export the clip in the character's GLB (use `clip`) or as its own file (use `file`, plus `clip` to pick inside it), then add an entry with a new `id` to the right category. Two or more entries in a category = a random pick, never the same twice in a row.

**Transitions** work exactly as for card characters (section 2): `from` / `to` are animation ids, one direction only, either an `interpolation` (`crossfade`, `warp`, `ease`, `cut` + `duration`) or `animations` (a clip played once in between). Without one: `defaults.interpolation`.

**The wounded idle.** The threshold is **50% of the starting life of the current duel** (the "Starting HP" of the start dialog; `state.maxLife`), never a fixed number: at 20 the overlay shows from 9 down, at 30 from 14 down. At 50% or more it fades out and plain idle stays. It plays on its own node (`__overlay`, between the motion node and the model), so it adds to idle instead of replacing it; it fades out while a one-shot (`playing_card`) plays and back in when idle resumes. `weight` (0-1, default 1) sets how strongly it shows. For a GLB clip, author it to be layered (e.g. only the spine and head bend), since three.js blends it with idle by weight. Rule: `AvatarLogic.lifeState(life, startLife)` (`js/avatar/avatar-logic.js`).

**Triggering `playing_card`.** The Sim emits `CardPlayed {iid, player}` for every card played from a hand (a spell or a permanent; a card put onto the board by an effect is not "played"). The host passes each accepted command's events to `AvatarView.onEvents` (`js/game/game-host.js`, `send`), which asks `AvatarLogic.cues(events, seat)` what to play. To make another event play something, add it to `cues` (and, for a new category, to `AvatarLogic.CATEGORIES`). Console: `AvatarView.play('Player', 'playing_card')`.

**Placeholder animations.** An entry with no `file` and no `clip` (or whose file fails, or whose clip does not fit the model) plays a built-in clip: `procedural` names it, else the category's own. Built-in clips: enter `drop`, `spin_in`, `boot`; idle `breathe`, `sway`, `hover`; idle_wounded `slump`, `glitch`; dies `fall`, `kneel`, `shutdown`; playing_card `cast`, `throw` (`js/avatar/avatar-models.js`). On the placeholder humanoid they move the limbs (pivots `Torso`, `Head`, `ArmL`, `ArmR`, `LegL`, `LegR`); on a GLB only the whole body moves (its bones have their own rest poses, so the built-in limb turns are never applied to them). A missing file logs one `[3D]` warning and never stops the game. All six shipped characters use built-in clips only.

**Debug (console):** `AvatarView.stats()` (seats, current animation, overlay, controllers made), `AvatarView.play('Opponent', 'dies')`, `Tests.ctx.setLife(sim, 'Opponent', 9); game = sim; sync()` (wounded).

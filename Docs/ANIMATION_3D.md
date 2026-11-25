# 3D side view

> Step-by-step with templates (GLB models, animations, camera animations): **`Docs/animationGuide.md`**.

The **Side view** button now shows the board in 3D with an animated character on every creature. The **Top view** is unchanged: leaving the side view removes every character, stops the camera animation and puts the original layout back.

## Files

| File                            | What                                                                                                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config/board3d.json`           | zone size (2 x 2 m), gaps (rows 1 m, front rows 4 m, columns, side zones), card fit, which card types get a character, global height offset                                                          |
| `config/camera3d.json`          | seat camera (position + target, or `rotationDeg`), FOV, near / far, `minAspect` (narrow screens move back), orbit limits, the two hands (camera space), camera animation blend / speed / transitions |
| `config/characters.json`        | `cards` (card id -> character), `default`, `characters` (model, animations, transitions)                                                                                                             |
| `assets/camera/*.json`, `*.glb` | camera animations                                                                                                                                                                                    |
| `assets/samples/test-rig/`      | a small sample character: model and animations in separate GLB files                                                                                                                                 |
| `js/anim/anim-logic.js`         | pure logic (tested by `node tests/run.js --only 3d-`)                                                                                                                                                |
| `js/anim/asset-loader.js`       | loaders by extension, one cache per file                                                                                                                                                             |
| `js/anim/procedural.js`         | placeholder cube + procedural clips                                                                                                                                                                  |
| `js/anim/character.js`          | one character: mixer, random pick, transitions, fallbacks                                                                                                                                            |
| `js/anim/camera-anim.js`        | camera animations                                                                                                                                                                                    |
| `js/anim/view3d.js`             | mode switch, layout, hands on the camera, picking, game cues, debug                                                                                                                                  |

The config files are read at start (`fetch`); a missing or broken file means the built-in defaults.

## Coordinates

Metres. Origin = centre of the gap between the front rows; +z towards the Player; +y up; column 1 of the Player is at -x. Each character stands on the centre of its card, feet on the card, and faces the other side (glTF forward = +Z). Camera animations in `"space": "character"` use the character's feet as origin and +Z as the way it faces; `"seat"` = board space turned with the seat; `"world"` = board space.

## Add a character

1. Put the files somewhere under `assets/`, e.g. `assets/models/knight/knight.glb` plus one GLB per animation (same bone names as the model; the clips need not be inside the model).
2. Add to `config/characters.json`:

```json
"characters": {
  "knight": {
    "model": { "path": "assets/models/knight/knight.glb", "scale": 1, "offset": [0, 0, 0], "rotationDeg": [0, 0, 0], "heightOffset": 0 },
    "defaults": { "speed": 1, "interpolation": { "method": "crossfade", "duration": 0.25 } },
    "animations": {
      "idle":   [ { "id": "kn_idle", "file": "assets/models/knight/idle.glb" } ],
      "attack": [ { "id": "kn_slash", "file": "assets/models/knight/slash.glb", "speed": 1.2,
                    "camera": [ { "id": "kn_cam_a", "file": "assets/camera/strike_push.json" } ] },
                  { "id": "kn_thrust", "file": "assets/models/knight/thrust.glb" } ]
    },
    "transitions": [
      { "from": "kn_idle", "to": "kn_slash", "animations": [ { "id": "kn_draw", "file": "assets/models/knight/draw.glb" } ] },
      { "from": "kn_slash", "to": "kn_idle", "interpolation": { "method": "ease", "duration": 0.4 } }
    ]
  }
}
```

3. Map the card: `"cards": { "knight": "knight" }` (key = card id in `js/content/cards.js`).

### Animation entry

| Key            | Default                                               |                                                                                                                                |
| -------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `id`           | required                                              | unique within the character (transition clips too)                                                                             |
| `file`         | none                                                  | GLB / glTF / FBX (if FBXLoader is on the page) / JSON clips. None: `clip` from the model's own clips, else the procedural clip |
| `clip`         | first clip                                            | clip name inside the file                                                                                                      |
| `loop`         | `repeat` for idle, channeling_idle, stun; else `once` | `repeat`, `once`, `pingpong`                                                                                                   |
| `repetitions`  | endless                                               | for repeat / pingpong                                                                                                          |
| `speed`        | 1                                                     | x the character's `defaults.speed`                                                                                             |
| `then`         | `idle` (die: `hold`)                                  | category played after a one-shot                                                                                               |
| `camera`       | `[]`                                                  | `{ id, file, speed, space, blendIn, blendOut }`, picked at random on its own                                                   |
| `cameraChance` | 1                                                     | 0-1, chance that a camera animation plays at all                                                                               |

Categories: `enter`, `idle`, `attack`, `get_hit`, `channeling_idle`, `stun`, `die`, `finishing_attack` (empty: uses `attack`). An empty category plays its procedural clip. A random pick never repeats the previous one of that category when there is a choice.

### Transitions

Directional (`from` -> `to` only). A transition clip that loaded plays once first; otherwise the `interpolation` blends: `crossfade`, `warp` (time-warped cross-fade), `ease` (smoothstep weights), `cut`. No transition entry: the character's `defaults.interpolation`. Camera transitions are separate (`camera3d.json` `animation.transitions`, by camera animation id).

### Camera animation formats

- GLB / glTF: a camera node with an animation (position, rotation; FOV from the camera).
- JSON: `{ "format": "tpw-camera", "duration": 1.2, "keys": [ { "t": 0, "position": [x,y,z], "target": [x,y,z], "fov": 45 } ] }`.

It blends in from where the camera is, blends out back to the seat camera; the orbit controls rest meanwhile.

## Fallbacks

Each file on its own: no / broken model = cube; no / broken / non-fitting clip = the procedural clip of its category (transform only on a real model); no / broken transition clip = interpolation; no / broken camera file = the camera is not touched. No placeholder camera animation exists.

## When things play

- `enter`: a creature appears on the board while the side view is open (creatures already there when you switch stand in idle).
- `attack` / `finishing_attack`: when the sword of a resolving Attack starts flying; finishing (lethal) = its hit on the player takes them below 0 and decides the game.
- `get_hit`: when the sword arrives, or when any other damage lowers its HP.
- `die`: the creature went to the graveyard (or a token ceased to exist); it plays where the creature stood, then the character is removed. Bounce / exile / spin just remove it.
- `channeling_idle`, `stun`: not in the game yet; play them by hand (below).

## Debug

`?anim3d` opens the standalone 3D card preview (`anim3d.html`, `js/anim/card-preview.js`): its own scene, none of the game. Pick a card (or `anim3d.html?anim3d=<card id>`): its model is fetched from `assets/3dModels/cards/index.json` (`type: gltf` = a .glb / .gltf file, `type: script` = a .js file registering `CardModelScripts[builder](THREE, params)`; see the `_doc` there), shown, and the selection animation plays (the entry's `select` clip, else a clip named like select, else the script's `userData.select`, else a procedural hop and spin). No model / a missing file / a broken script: a placeholder in the card's colour and the reason. A new model type = `CardModels.register(type, load)` + `Anim3DLogic.MODEL_TYPES`. Side view console: `View3D.debug.play('stun')`, `View3D.debug.play('attack', iid)`, `View3D.stats()` (characters, mixers, cached files, scene children).

## Limits / next

- A dying character plays at its old zone while its card already glides to the graveyard.
- Hit-testing a character uses its bounding box (animated limbs outside it do not catch clicks).
- `channeling_idle` and `stun` have no game event yet.
- glTF cannot animate the FOV; use the JSON camera format for FOV moves.
- `minAspect` keeps the board width in view on a phone in portrait; tune it with the camera position.

## Card art, attacking, sword, configs, hands

- **Card art model**: a character with no model file (or one that fails to load) uses the card's own 3D art (about 0.9 m, feet on the card); the cube only stands in when there is no art. The archer no longer maps to the test rig (the `test-rig` entry is still there: add `"archer": "test-rig"` back under `cards` to see it).
- **attacking**: a ninth category. It loops while the creature's Attack is on the stack and stops when the Attack resolves (attack / finishing_attack) or leaves the stack.
- **Sword** (`board3d.json`, optional): `"sword": { "scale": 2, "height": 1.6, "flash": true }`: size factor, metres above the card, flashing flying sword.
- **Configs** load again each time the side view opens: edit a file, switch Top view / Side view to see it. They need the game served over http(s) (GitHub Pages, `python -m http.server`): a `file://` page cannot read them and uses the defaults (console warning; `?anim3d` shows the status). GitHub Pages may serve an old copy for a few minutes.
- **Hands** are drawn in a second pass over the board (layer 1), so a board card near the camera never cuts them; the wheel over a hand scrolls it when it does not fit (never zooms).
- **Debug** (console only) `View3D.demo()` (Vs self game, characters on both sides, side view on), `View3D.debug.play(cat)`.

## Player avatars and resizing

- **Player avatars** reuse this system (`Character3D`, the entry format, transitions, the loader and the fallbacks) with their own categories (`enter`, `idle`, `idle_wounded` overlay, `dies`, `playing_card`) and their own config, `config/avatars.json`: see `Docs/AVATARS.md` and `Docs/animationGuide.md` section 5. `Character3D` now reads the categories from the normalised character (`categories`, `looping`, `die`; the card ones by default), has an overlay layer (`setOverlay`, node `__overlay` between motion and model) and two optional hooks (`prepare(model)`, `procClip(entry)`); card characters behave exactly as before.
- A resize no longer resets a camera the player moved; the own hand can be dragged sideways (`Docs/CAMERA.md`).

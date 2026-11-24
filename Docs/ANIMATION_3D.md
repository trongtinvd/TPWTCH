# 3D side view (Patch8)

The **Side view** button now shows the board in 3D with an animated character on every creature. The **Top view** is unchanged: leaving the side view removes every character, stops the camera animation and puts the original layout back.

## Files

| File | What |
|---|---|
| `config/board3d.json` | zone size (2 x 2 m), gaps (rows 1 m, front rows 4 m, columns, side zones), card fit, which card types get a character, global height offset |
| `config/camera3d.json` | seat camera (position + target, or `rotationDeg`), FOV, near / far, `minAspect` (narrow screens move back), orbit limits, the two hands (camera space), camera animation blend / speed / transitions |
| `config/characters.json` | `cards` (card id -> character), `default`, `characters` (model, animations, transitions) |
| `assets/camera/*.json`, `*.glb` | camera animations |
| `assets/samples/test-rig/` | a small sample character: model and animations in separate GLB files |
| `js/anim/anim-logic.js` | pure logic (tested by `node tests/run.js --only 3d-`) |
| `js/anim/asset-loader.js` | loaders by extension, one cache per file |
| `js/anim/procedural.js` | placeholder cube + procedural clips |
| `js/anim/character.js` | one character: mixer, random pick, transitions, fallbacks |
| `js/anim/camera-anim.js` | camera animations |
| `js/anim/view3d.js` | mode switch, layout, hands on the camera, picking, game cues, debug |

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

| Key | Default | |
|---|---|---|
| `id` | required | unique within the character (transition clips too) |
| `file` | none | GLB / glTF / FBX (if FBXLoader is on the page) / JSON clips. None: `clip` from the model's own clips, else the procedural clip |
| `clip` | first clip | clip name inside the file |
| `loop` | `repeat` for idle, channeling_idle, stun; else `once` | `repeat`, `once`, `pingpong` |
| `repetitions` | endless | for repeat / pingpong |
| `speed` | 1 | x the character's `defaults.speed` |
| `then` | `idle` (die: `hold`) | category played after a one-shot |
| `camera` | `[]` | `{ id, file, speed, space, blendIn, blendOut }`, picked at random on its own |
| `cameraChance` | 1 | 0-1, chance that a camera animation plays at all |

Categories: `enter`, `idle`, `attack`, `get_hit`, `channeling_idle`, `stun`, `die`, `finishing_attack` (empty: uses `attack`). An empty category plays its procedural clip. A random pick never repeats the previous one of that category when there is a choice.

### Transitions

Directional (`from` -> `to` only). A transition clip that loaded plays once first; otherwise the `interpolation` blends: `crossfade`, `warp` (time-warped cross-fade), `ease` (smoothstep weights), `cut`. No transition entry: the character's `defaults.interpolation`. Camera transitions are separate (`camera3d.json` `animation.transitions`, by camera animation id).

### Camera animation formats

* GLB / glTF: a camera node with an animation (position, rotation; FOV from the camera).
* JSON: `{ "format": "tpw-camera", "duration": 1.2, "keys": [ { "t": 0, "position": [x,y,z], "target": [x,y,z], "fov": 45 } ] }`.

It blends in from where the camera is, blends out back to the seat camera; the orbit controls rest meanwhile.

## Fallbacks

Each file on its own: no / broken model = cube; no / broken / non-fitting clip = the procedural clip of its category (transform only on a real model); no / broken transition clip = interpolation; no / broken camera file = the camera is not touched. No placeholder camera animation exists.

## When things play

* `enter`: a creature appears on the board while the side view is open (creatures already there when you switch stand in idle).
* `attack` / `finishing_attack`: when the sword of a resolving Attack starts flying; finishing = it destroyed a creature it hit, or took a player below 0.
* `get_hit`: when the sword arrives, or when any other damage lowers its HP.
* `die`: the creature went to the graveyard (or a token ceased to exist); it plays where the creature stood, then the character is removed. Bounce / exile / spin just remove it.
* `channeling_idle`, `stun`: not in the game yet; play them by hand (below).

## Debug

Open the page with `?anim3d`: a button row plays a category on the selected card, else on every character. Console: `View3D.debug.play('stun')`, `View3D.debug.play('attack', iid)`, `View3D.stats()` (characters, mixers, cached files, scene children).

## Limits / next

* A dying character plays at its old zone while its card already glides to the graveyard.
* Hit-testing a character uses its bounding box (animated limbs outside it do not catch clicks).
* `channeling_idle` and `stun` have no game event yet.
* glTF cannot animate the FOV; use the JSON camera format for FOV moves.
* `minAspect` keeps the board width in view on a phone in portrait; tune it with the camera position.

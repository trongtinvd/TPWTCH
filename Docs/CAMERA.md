# Cameras

Every camera setting is in a config file; nothing to change in the code.

| What                                              | File                           | Keys                                                                                                                                                                            |
| ------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top view (orthographic, looking down)             | `config/camera.json` `top`     | `height`, `rotationDeg` (turns the picture on screen), `near`, `far`, `minHalfHeight` + `halfHeightAspect` (how much table fits), `zoomMin`, `zoomMax`, `zoomSpeed`, `panLimit` |
| Side camera when the 3D view is off / unavailable | `config/camera.json` `classic` | `position`, `target` (looked at), `fov`, `near`, `far`, `maxPolarDeg`                                                                                                           |
| Seat turn                                         | `config/camera.json` `seat`    | `opponentYawDeg` (Opponent seat = this turn round the table centre, 180), `turnSpeed`                                                                                           |
| 3D side view                                      | `config/camera3d.json`         | `position` + `target`, or `rotationDeg` [x, y, z] (YXZ, degrees; then `target` is only the orbit pivot), `fov`, `near`, `far`, `minAspect`, `orbit`, `hand`                     |

Both files are written for the Player seat. They load when the page opens (served over http(s); a `file://` page keeps the defaults, with a console warning). `CameraCfg.load()` in the console reloads `config/camera.json`; the 3D file reloads each time the side view opens. Code: `js/core/camera-config.js` (defaults = the old built-in values).

## resizing keeps the camera, the hand slides

- **Resize** (opening or closing the browser's DevTools with F12, dragging a phone panel, turning the device): the cause of the old reset was `view3d.js` placing the seat camera again on every `resize` event. Now a resize only updates the projection (aspect) and the viewport (`input.js`) once the player has moved the camera (orbit, zoom or pan: the orbit controls' `start` event). A camera nobody touched still re-fits its seat for the new shape (`minAspect`: a narrow window moves it back). The seat camera is placed again only when the side view opens, the seat turns (Vs Self auto view, Switch player) or the config changes. `View3D.cameraMoved()` tells which case applies.
- **Hand drag (side view):** press on the own hand zone (not on a card) and drag left / right; the cursor shows a hand. Only the hand moves: the board, its zones and the opponent's hand stay. `config/camera3d.json` `hand.own.drag`: `enabled`, `min` / `max` (how far the hand's centre may go, as a fraction of the visible width at the hand: -0.49..0.49, so it never leaves the screen), `padding` (extra metres on each side of the hand zone to grab). The offset is remembered (`Settings` `handOffset3d`). Cards in the hand are clicked and dragged as before; the camera does not move during a hand drag.

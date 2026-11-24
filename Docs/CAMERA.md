# Cameras (Patch10)

Every camera setting is in a config file; nothing to change in the code.

| What                                              | File                           | Keys                                                                                                                                                                            |
| ------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top view (orthographic, looking down)             | `config/camera.json` `top`     | `height`, `rotationDeg` (turns the picture on screen), `near`, `far`, `minHalfHeight` + `halfHeightAspect` (how much table fits), `zoomMin`, `zoomMax`, `zoomSpeed`, `panLimit` |
| Side camera when the 3D view is off / unavailable | `config/camera.json` `classic` | `position`, `target` (looked at), `fov`, `near`, `far`, `maxPolarDeg`                                                                                                           |
| Seat turn                                         | `config/camera.json` `seat`    | `opponentYawDeg` (Opponent seat = this turn round the table centre, 180), `turnSpeed`                                                                                           |
| 3D side view                                      | `config/camera3d.json`         | `position` + `target`, or `rotationDeg` [x, y, z] (YXZ, degrees; then `target` is only the orbit pivot), `fov`, `near`, `far`, `minAspect`, `orbit`, `hand`                     |

Both files are written for the Player seat. They load when the page opens (served over http(s); a `file://` page keeps the defaults, with a console warning). `CameraCfg.load()` in the console reloads `config/camera.json`; the 3D file reloads each time the side view opens. Code: `js/core/camera-config.js` (defaults = the old built-in values).

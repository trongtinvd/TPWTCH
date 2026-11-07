# Card Game Board Prototype (three.js)

Hot-seat board prototype for the tactical card game. Open `index.html` in a browser (needs internet for the three.js CDN). No build step.

## Layout
| File | Responsibility |
|---|---|
| `index.html` | HUD/panel markup; loads scripts in order |
| `css/style.css` | All styling |
| `js/scene.js` | Renderer, camera, controls, lights, table |
| `js/cards.js` | **Content**: `Fx` effect builders + every card definition |
| `js/sim.js` | **Rules**: pure simulation (`Sim`: commands in, events out) + card API validation |
| `js/board.js` | Zone tiles, labels, deck/GY/exile, hands |
| `js/host.js` | Game host, UI state, `send()`, auto-pass, top/side view, buttons |
| `js/card-visuals.js` | Card meshes, 3D art (`SHAPES`), card textures, glow |
| `js/panels.js` | Deck/GY list, inspect panel, action menu |
| `js/view-sync.js` | Mesh registry, card target positions |
| `js/links.js` | Hover arrows between stack entries and sources |
| `js/animations.js` | Showcase animations for stack objects |
| `js/sync.js` | `buildStack()`, `sync()`, `animate()` |
| `js/input.js` | Pointer/keyboard -> commands |
| `js/tests.js` | `cardGame.selfTest()` rules tests |
| `js/main.js` | Console hook, first sync, render loop |

## Notes
- These are classic scripts sharing one global scope (works from `file://`, unlike ES modules). **Load order in `index.html` matters.**
- Rules live only in `cards.js` (data) and `sim.js` (logic); the other files are presentation.
- Run rules tests in the browser console: `cardGame.selfTest()`. Headless in Node:
  ```
  node -e "const vm=require('vm'),fs=require('fs');const c={console,structuredClone,window:{}};vm.createContext(c);vm.runInContext(['cards','sim','tests'].map(n=>fs.readFileSync('js/'+n+'.js','utf8')).join('\n')+'\n;selfTest();',c)"
  ```

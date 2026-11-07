// input.js - INPUT: pointer/keyboard -> commands only (click, drag-drop, hover, resize).
// Classic script: shares one global scope with the other js/*.js files; load order matters (see index.html).

// ---- Input: pointer -> commands only ----------------------------------------------
let pickList = null;                                // cached; rebuilt only after sync()
const pickables = () => pickList || (pickList = [...pickCards, ...zones]);
function aim(x, y){ mouse.set(x/innerWidth*2-1, -(y/innerHeight)*2+1); ray.setFromCamera(mouse, cam); }
function pickAt(x, y, list){ aim(x, y); const h = ray.intersectObjects(list || pickables())[0]; return h ? h.object : null; }
let downAt = null;
addEventListener('pointerdown', e => {
  if (e.target !== renderer.domElement){ if (!menu.contains(e.target)) closeMenu(); return; }
  downAt = {x:e.clientX, y:e.clientY};
  const o = pickAt(e.clientX, e.clientY), c = o && o.userData.card;
  dragCand = (c && c.loc === 'hand' && c.owner === ui.view && !uiCanPlay(c)) ? c : null;
  panFrom = tv.on && !dragCand ? {x:e.clientX, y:e.clientY} : null;
  if (dragCand) controls.enabled = false;           // keep the camera still while dragging a card
}, true);
addEventListener('pointermove', e => {
  aim(e.clientX, e.clientY); hoverDirty = true;
  if (e.target !== renderer.domElement && !drag) mouse.set(2, 2);   // pointer over a panel: nothing on the board is hovered
  if (panFrom && !drag && e.buttons){
    const k = 2*ortho.top/innerHeight, dx = e.clientX-panFrom.x, dy = e.clientY-panFrom.y, s = Math.sin(camAngle), c = Math.cos(camAngle);
    panFrom = {x:e.clientX, y:e.clientY};
    tv.cx = Math.max(-14, Math.min(14, tv.cx + (-c*dx - s*dy)*k)); tv.cz = Math.max(-14, Math.min(14, tv.cz + (s*dx - c*dy)*k));
    placeTop(); dirty = true;
  }
  if (downAt && !drag && !menu.hidden && Math.hypot(e.clientX-downAt.x, e.clientY-downAt.y) > 6) closeMenu();
  if (dragCand && !drag && downAt && Math.hypot(e.clientX-downAt.x, e.clientY-downAt.y) > 6){
    drag = {card: dragCand}; closeMenu(); sync();
  }
  if (drag){                                        // the card's own mesh follows the pointer just above the table
    const o = ray.ray.origin, d = ray.ray.direction, t = (1.2 - o.y) / d.y;
    meshes.get(drag.card.iid).position.set(o.x + d.x*t, 1.2, o.z + d.z*t); dirty = true;
  }
});
function endDrag(e, drop){
  const c = drag.card; drag = null; dragCand = null; controls.enabled = !tv.on;
  if (drop){
    const z = pickAt(e.clientX, e.clientY, zones);
    const onStack = !!(e.target.closest && e.target.closest('#stack'));
    if ((z || onStack) && c.loc === 'hand' && !uiCanPlay(c)){
      if (isPerm(c)){ if (z && z.userData.slot && z.userData.baseEm){ place(c, z); return; } }
      else if (onStack || z.userData.slot){ send({type:'PlayCard', iid:c.iid}); return; }
    }
  }
  sync();
}
addEventListener('pointercancel', e => { if (drag) endDrag(e, false); dragCand = null; controls.enabled = !tv.on; });
addEventListener('pointerup', e => {
  panFrom = null;
  if (drag){ endDrag(e, true); downAt = null; return; }
  dragCand = null; controls.enabled = !tv.on;
  if (!downAt || e.target !== renderer.domElement || Math.hypot(e.clientX-downAt.x, e.clientY-downAt.y) > 6){ downAt = null; return; }
  downAt = null;
  const o = pickAt(e.clientX, e.clientY), u = o ? o.userData : {};
  if (game.choice){                                 // shift choice answered on the board itself
    const k = game.choice, opt = u.slotKey && u.baseEm ? (u.slotKey === game.cards[k.iid].slot ? 'stay' : u.slotKey) : (u.card && u.card.iid === k.iid ? 'stay' : null);
    if (opt && k.options.includes(opt)){ send({type:'Choose', player:k.player, option:opt}); return; }
  }
  if (placing && o && u.slot && u.baseEm){ place(placing, o); return; }
  if (u.card && !placing){ showCard(u.card); openMenu(u.card, e.clientX, e.clientY); }
  else if (u.deckOf && !placing){ closeMenu(); showList(u.deckOf, 'deck'); }
  else if (u.gyOf && !placing){ closeMenu(); showList(u.gyOf, 'gy'); }
  else closeAll();                                  // empty space / plain zone: close every popup
});
function updateHover(){
  ray.setFromCamera(mouse, cam);
  const hit = ray.intersectObjects(pickables())[0], m = hit ? hit.object : null;
  if (m === hovered) return;
  const old = hovered; hovered = m; dirty = true; inspHold = false;
  const pc = m && m.userData.card; preview = drag ? null : pc || null; refreshInspect();
  if (pc && !drag) setLink({t:'card', iid:pc.iid}); else if (linkSrc && linkSrc.t === 'card') setLink(null);   // card -> its stack entries
  for (const x of [old, m]) if (x) x.material.emissive && applyEm(x);
  hud.innerHTML = '<b>' + disp(m ? m.userData.name : 'Hover a zone') + '</b>';
  const u = m ? m.userData : {};
  renderer.domElement.style.cursor = (u.deckOf || u.gyOf || u.card || ((placing || game.choice) && u.baseEm)) ? 'pointer' : '';
}

renderer.domElement.style.touchAction = 'none';
addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); fitOrtho();
  renderer.setSize(innerWidth, innerHeight); dirty = true;
});
controls.addEventListener('change', () => { dirty = true; hoverDirty = true; });

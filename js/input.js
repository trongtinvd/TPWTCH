// input.js - Pointer input: drag, click, hover (commands only)
// ---- Input: pointer -> commands only ----------------------------------------------
let pickList = null;                                // cached; rebuilt only after sync()
const pickables = () => pickList || (pickList = [...pickCards, ...zones.filter(z => z.visible)]);
function aim(x, y){ mouse.set((x-VX())/VW()*2-1, -((y-VY())/VH())*2+1); ray.setFromCamera(mouse, cam); }
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
    const k = 2*ortho.top/VH(), dx = e.clientX-panFrom.x, dy = e.clientY-panFrom.y, s = Math.sin(camAngle), c = Math.cos(camAngle);
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
    const z = pickAt(e.clientX, e.clientY, zones.filter(z => z.visible));
    const onStack = !!(e.target.closest && e.target.closest('#stack'));
    if ((z || onStack) && c.loc === 'hand' && !uiCanPlay(c)){
      if (c.def.playerTarget && !c.def.zoneTarget){ placing = c; sync(); return; }
      if (isPerm(c) || c.def.colTarget || c.def.zoneTarget){ if (z && z.userData.slot && z.userData.baseEm){ place(c, z); return; } }
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
    const k = game.choice, occ = u.slotKey && game.slots[u.slotKey], opt = k.kind === 'place' ? (u.slotKey && k.options.includes(u.slotKey) ? u.slotKey : null) : k.kind ? (['damage', 'pick', 'swap'].includes(k.kind) ? (u.card ? u.card.iid : occ) : null) : u.slotKey && u.baseEm ? (u.slotKey === game.cards[k.iid].slot ? 'stay' : u.slotKey) : (u.card && u.card.iid === k.iid ? 'stay' : null);
    if (opt && k.options.includes(opt)){ send({type:'Choose', player:k.player, option:opt}); return; }
  }
  const zo = u.slot ? o : (u.card && u.card.loc === 'board' && slotZones[u.card.slot]) || null;   // a card standing on a zone counts as that zone
  if (placing && zo && zo.userData.baseEm){ place(placing, zo); return; }
  if (u.card && !placing){ showCard(u.card); openMenu(u.card, e.clientX, e.clientY); }
  else if (u.deckOf && !placing){ closeMenu(); showList(u.deckOf, 'deck'); }
  else if (u.gyOf && !placing){ closeMenu(); showList(u.gyOf, 'gy'); }
  else if (u.exileOf && !placing){ closeMenu(); showList(u.exileOf, 'exile'); }
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
  renderer.domElement.style.cursor = (u.deckOf || u.gyOf || u.exileOf || u.card || ((placing || game.choice) && u.baseEm) || (placing && u.card && u.card.loc === 'board' && slotZones[u.card.slot] && slotZones[u.card.slot].userData.baseEm)) ? 'pointer' : '';
}

renderer.domElement.style.touchAction = 'none';
  const fingers = new Map(); let pinchD = 0;          // two-finger pinch zooms the top view
  const fdist = () => { const [a, b] = [...fingers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  addEventListener('pointerdown', e => { if (e.pointerType !== 'touch' || e.target !== renderer.domElement) return; fingers.set(e.pointerId, {x:e.clientX, y:e.clientY}); if (fingers.size === 2 && !drag){ pinchD = fdist(); panFrom = null; dragCand = null; downAt = null; closeMenu(); } }, true);
  addEventListener('pointermove', e => { if (!fingers.has(e.pointerId)) return; fingers.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if (fingers.size === 2 && tv.on && !drag){ const d = fdist(); if (pinchD > 0){ tv.zoom = Math.min(4, Math.max(0.6, tv.zoom * d / pinchD)); fitOrtho(); dirty = true; hoverDirty = true; } pinchD = d; panFrom = null; } }, true);
  const fingerUp = e => { fingers.delete(e.pointerId); if (fingers.size < 2) pinchD = 0; };
  addEventListener('pointerup', fingerUp, true); addEventListener('pointercancel', fingerUp, true);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false); camera.aspect = VW()/VH(); camera.updateProjectionMatrix(); fitOrtho(); dirty = true; hoverDirty = true;
});
dispatchEvent(new Event('resize'));
  controls.addEventListener('change', () => { dirty = true; hoverDirty = true; });
// input.js - Pointer input: drag, click, hover (commands only)
// ---- Input: pointer -> commands only ----------------------------------------------
const pickables = () =>
  ui.pickList ||
  (ui.pickList = [
    ...ui.pickCards,
    ...(typeof View3D !== 'undefined' ? View3D.pickProxies() : []), // Patch8: a character's pick box stands for its card
    ...zones.filter(z => z.visible),
  ]);
const front3d = hs => (typeof View3D !== 'undefined' ? View3D.front(hs) : hs[0]); // Patch9: the 3D hands are drawn on top, so they are picked first
function aim(x, y) {
  mouse.set(((x - VX()) / VW()) * 2 - 1, -((y - VY()) / VH()) * 2 + 1);
  ray.setFromCamera(mouse, cam);
}
function pickAt(x, y, list) {
  aim(x, y);
  const h = front3d(ray.intersectObjects(list || pickables()));
  return h ? h.object.userData.pickAs || h.object : null; // Patch8: a character click is a click on its card
}
function passByRightClick() {
  if (rp.on) return false;
  const k = game.choice;
  if (k && !foeChoice()) {
    // a shift choice: right click / double tap on empty space = stay where it is (exactly like clicking the zone the card stands on)
    if (k.kind) return false;
    send({ type: 'Choose', player: k.player, option: 'stay' });
    return true;
  }
  const b = FN.find(x => x.id === 'pass');
  if (b && b.on()) {
    closeMenu();
    b.run();
    return true;
  }
  // Patch5: no action point left and nothing on the stack: right click / double tap on empty space = the End turn button
  const e = FN.find(x => x.id === 'endturn');
  if (e && e.on() && !game.stack.length && !Sim.hasAP(game, ui.view)) {
    closeMenu();
    e.run();
    return true;
  }
  return false;
} // right click on empty space = the Pass button (or End turn, see above)
addEventListener(
  'pointerdown',
  e => {
    if (e.target !== renderer.domElement) {
      if (!menu.contains(e.target)) closeMenu();
      return;
    }
    ui.downAt = { x: e.clientX, y: e.clientY };
    const o = pickAt(e.clientX, e.clientY),
      c = o && o.userData.card;
    // Patch12: the side view's own hand zone (not a card on it) drags the hand sideways; the camera stays still meanwhile (Patch13: either hand)
    if (!c && e.button === 0 && typeof View3D !== 'undefined' && View3D.handGrab(o, e.clientX)) {
      ui.handDrag = true;
      ui.dragCand = null;
      panFrom = null;
      controls.enabled = false;
      return;
    }
    ui.dragCand = !rp.on && c && c.loc === 'hand' && c.owner === ui.view && !uiCanPlay(c) ? c : null;
    panFrom = tv.on && !ui.dragCand ? { x: e.clientX, y: e.clientY } : null;
    if (ui.dragCand) controls.enabled = false; // keep the camera still while dragging a card
  },
  true
);
addEventListener('pointermove', e => {
  if (ui.handDrag) {
    View3D.handDrag(e.clientX); // Patch12
    return;
  }
  aim(e.clientX, e.clientY);
  ui.hoverDirty = true;
  if (e.target !== renderer.domElement && !ui.drag) mouse.set(2, 2); // pointer over a panel: nothing on the board is hovered
  if (panFrom && !ui.drag && e.buttons) {
    const k = (2 * ortho.top) / VH(),
      dx = e.clientX - panFrom.x,
      dy = e.clientY - panFrom.y,
      r = ui.camAngle + (CameraCfg.get().top.rotationDeg * Math.PI) / 180, // the screen axes of the top view (Patch10: it may be rotated)
      s = Math.sin(r),
      c = Math.cos(r);
    panFrom = { x: e.clientX, y: e.clientY };
    const lim = CameraCfg.get().top.panLimit; // Patch10: config/camera.json
    tv.cx = Math.max(-lim, Math.min(lim, tv.cx + (-c * dx - s * dy) * k));
    tv.cz = Math.max(-lim, Math.min(lim, tv.cz + (s * dx - c * dy) * k));
    placeTop();
    ui.dirty = true;
  }
  if (ui.downAt && !ui.drag && !menu.hidden && Math.hypot(e.clientX - ui.downAt.x, e.clientY - ui.downAt.y) > 6)
    closeMenu();
  if (ui.dragCand && !ui.drag && ui.downAt && Math.hypot(e.clientX - ui.downAt.x, e.clientY - ui.downAt.y) > 6) {
    ui.drag = { card: ui.dragCand };
    closeMenu();
    sync();
  }
  if (ui.drag) {
    // the card's own mesh follows the pointer just above the table
    const o = ray.ray.origin,
      d = ray.ray.direction,
      t = (1.2 - o.y) / d.y;
    meshes.get(ui.drag.card.iid).position.set(o.x + d.x * t, 1.2, o.z + d.z * t);
    ui.dirty = true;
  }
});
function endDrag(e, drop) {
  const c = ui.drag.card;
  ui.drag = null;
  ui.dragCand = null;
  controls.enabled = !tv.on;
  if (drop) {
    const z = pickAt(
      e.clientX,
      e.clientY,
      zones.filter(z => z.visible)
    );
    const onStack = !!(e.target.closest && e.target.closest('#stack'));
    if ((z || onStack) && c.loc === 'hand' && !uiCanPlay(c)) {
      if (c.def.playerTarget && !c.def.zoneTarget) {
        ui.placing = c;
        sync();
        return;
      }
      if (isPerm(c) || c.def.colTarget || c.def.zoneTarget) {
        if (z && z.userData.slot && z.userData.baseEm) {
          place(c, z);
          return;
        }
      } else if (onStack || z.userData.slot) {
        send({ type: 'PlayCard', iid: c.iid });
        return;
      }
    }
  }
  sync();
}
// Patch12: the end of a hand drag (no click follows it)
function endHandDrag() {
  if (!ui.handDrag) return false;
  ui.handDrag = false;
  View3D.handRelease();
  controls.enabled = !tv.on;
  ui.downAt = null;
  ui.hoverDirty = true;
  return true;
}
addEventListener('pointercancel', e => {
  endHandDrag();
  if (ui.drag) endDrag(e, false);
  ui.dragCand = null;
  controls.enabled = !tv.on;
});
addEventListener('pointerup', e => {
  panFrom = null;
  if (endHandDrag()) return;
  if (ui.drag) {
    endDrag(e, true);
    ui.downAt = null;
    return;
  }
  ui.dragCand = null;
  controls.enabled = !tv.on;
  if (
    !ui.downAt ||
    e.target !== renderer.domElement ||
    Math.hypot(e.clientX - ui.downAt.x, e.clientY - ui.downAt.y) > 6
  ) {
    ui.downAt = null;
    return;
  }
  ui.downAt = null;
  const o = pickAt(e.clientX, e.clientY),
    u = o ? o.userData : {};
  if (
    e.button === 2 &&
    !u.card &&
    !u.deckOf &&
    !u.gyOf &&
    !u.exileOf &&
    !u.extraOf &&
    !ui.placing &&
    passByRightClick()
  )
    return;
  if (e.pointerType === 'touch' && !u.card && !u.deckOf && !u.gyOf && !u.exileOf && !u.extraOf && !ui.placing) {
    const now = performance.now();
    if (now - ui.lastEmptyTap < 400) {
      ui.lastEmptyTap = 0;
      if (passByRightClick()) return;
    } else ui.lastEmptyTap = now;
  } // phone: double tap on empty space = Pass (or End turn)   // (a right-drag pan moved > 6px and never gets here)
  if (game.choice && !foeChoice() && isPairChoice(game.choice)) {
    // two adjacent cards (Widow Maker): click the first, then the second; a click on the first again undoes it
    const k = game.choice,
      z = u.slotKey || (u.card && u.card.loc === 'board' && u.card.slot);
    if (z && k.options.some(o => o.split('#').includes(z))) {
      if (!ui.pairFirst) ui.pairFirst = z;
      else if (z === ui.pairFirst) ui.pairFirst = null;
      else {
        const o = k.options.find(q => q.split('#').includes(ui.pairFirst) && q.split('#').includes(z));
        if (o) {
          ui.pairFirst = null;
          send({ type: 'Choose', player: k.player, option: o });
          return;
        }
      }
      sync();
      return;
    }
  }
  if (game.choice && !foeChoice()) {
    // shift choice answered on the board itself
    const k = game.choice,
      occ = u.slotKey && game.slots[u.slotKey],
      opt =
        k.kind === 'place'
          ? u.slotKey && k.options.includes(u.slotKey)
            ? u.slotKey
            : null
          : k.kind
            ? ['damage', 'pick', 'swap', 'abtarget'].includes(k.kind) || boardPick(k)
              ? u.slotKey && k.options.includes('Z:' + u.slotKey)
                ? 'Z:' + u.slotKey
                : u.card
                  ? u.card.iid
                  : occ
              : null
            : u.slotKey && u.baseEm
              ? u.slotKey === game.cards[k.iid].slot
                ? 'stay'
                : u.slotKey
              : u.card && u.card.iid === k.iid
                ? 'stay'
                : null;
    if (opt && k.options.includes(opt)) {
      send({ type: 'Choose', player: k.player, option: opt });
      return;
    }
  }
  const zo = u.slot ? o : (u.card && u.card.loc === 'board' && slotZones[u.card.slot]) || null; // a card standing on a zone counts as that zone
  if (ui.placing && zo && zo.userData.baseEm) {
    place(ui.placing, zo);
    return;
  }
  if (u.card && !ui.placing) {
    showCard(u.card);
    if (!rp.on) openMenu(u.card, e.clientX, e.clientY); // a replay only inspects
  } else if (u.deckOf && !ui.placing) {
    closeMenu();
    showList(u.deckOf, 'deck');
  } else if (u.gyOf && !ui.placing) {
    closeMenu();
    showList(u.gyOf, 'gy');
  } else if (u.exileOf && !ui.placing) {
    closeMenu();
    showList(u.exileOf, 'exile');
  } else if (u.extraOf && !ui.placing) {
    closeMenu();
    showList(u.extraOf, 'extra');
  } else closeAll(); // empty space / plain zone: close every popup
});
function updateHover() {
  ray.setFromCamera(mouse, cam);
  const hit = front3d(ray.intersectObjects(pickables())),
    m = hit ? hit.object.userData.pickAs || hit.object : null; // Patch8: hovering a character hovers its card
  if (m === ui.hovered) return;
  const old = ui.hovered;
  ui.hovered = m;
  ui.dirty = true;
  ui.inspHold = false;
  const pc = m && m.userData.card;
  ui.preview = ui.drag ? null : pc || null;
  refreshInspect();
  if (pc && !ui.drag) setLink({ t: 'card', iid: pc.iid });
  else if (ui.linkSrc && ui.linkSrc.t === 'card') setLink(null); // card -> its stack entries
  for (const x of [old, m]) if (x) x.material.emissive && applyEm(x);
  hud.innerHTML = '<b>' + disp(m ? m.userData.name : 'Hover a zone') + '</b>';
  const u = m ? m.userData : {};
  renderer.domElement.style.cursor =
    u.deckOf ||
    u.gyOf ||
    u.exileOf ||
    u.extraOf ||
    u.card ||
    ((ui.placing || game.choice) && u.baseEm) ||
    (ui.placing && u.card && u.card.loc === 'board' && slotZones[u.card.slot] && slotZones[u.card.slot].userData.baseEm)
      ? 'pointer'
      : typeof View3D !== 'undefined' && View3D.isOn() && m && View3D.grabRole(m)
        ? 'grab' // Patch12: a hand zone slides sideways (Patch13: the opponent's too)
        : '';
}

renderer.domElement.style.touchAction = 'none';
const fingers = new Map();
const fdist = () => {
  const [a, b] = [...fingers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
};
addEventListener(
  'pointerdown',
  e => {
    if (e.pointerType !== 'touch' || e.target !== renderer.domElement) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size === 2 && !ui.drag) {
      ui.pinchD = fdist();
      panFrom = null;
      ui.dragCand = null;
      ui.downAt = null;
      closeMenu();
    }
  },
  true
);
addEventListener(
  'pointermove',
  e => {
    if (!fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size === 2 && tv.on && !ui.drag) {
      const d = fdist();
      if (ui.pinchD > 0) {
        tv.zoom = Math.min(4, Math.max(0.6, (tv.zoom * d) / ui.pinchD));
        fitOrtho();
        ui.dirty = true;
        ui.hoverDirty = true;
      }
      ui.pinchD = d;
      panFrom = null;
    }
  },
  true
);
const fingerUp = e => {
  fingers.delete(e.pointerId);
  if (fingers.size < 2) ui.pinchD = 0;
};
addEventListener('pointerup', fingerUp, true);
addEventListener('pointercancel', fingerUp, true);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = VW() / VH();
  camera.updateProjectionMatrix();
  fitOrtho();
  ui.dirty = true;
  ui.hoverDirty = true;
});
dispatchEvent(new Event('resize'));
controls.addEventListener('change', () => {
  ui.dirty = true;
  ui.hoverDirty = true;
});

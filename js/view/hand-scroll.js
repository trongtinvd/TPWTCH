// hand-scroll.js - Patch9: a big hand scrolls. While the cards fit, the hand is spread as before; past that the cards keep a
// minimum spacing and the mouse wheel over the hand (its zone or one of its cards) scrolls it. The wheel over a hand never
// zooms the scene (top view or 3D side view). The scroll is kept in cards, so it means the same in both views.
const HandScroll = (function () {
  const at = { Player: 0, Opponent: 0 }, // scroll position, in cards
    room = { Player: null, Opponent: null }; // { max } of the view that drew the hand last
  // xs of the n cards of p's hand: room = the width the card centres may use, maxSp / minSp = the widest / narrowest spacing
  function spread(p, n, width, maxSp, minSp, store) {
    const r = Anim3DLogic.scrollSpread(n, width, maxSp, minSp, at[p]);
    if (store) {
      at[p] = r.s;
      room[p] = { max: r.max };
    }
    return r.xs;
  }
  const reset = () => {
    at.Player = at.Opponent = 0;
  };
  const rc = new THREE.Raycaster(),
    v2 = new THREE.Vector2();
  rc.layers.enableAll();
  // the hand under the pointer: 'Player' | 'Opponent' | null
  function handAt(x, y) {
    if (typeof game === 'undefined' || !game || (typeof MenuUI !== 'undefined' && MenuUI.away)) return null;
    v2.set(((x - VX()) / VW()) * 2 - 1, -((y - VY()) / VH()) * 2 + 1);
    rc.setFromCamera(v2, cam);
    const objs = [],
      who = new Map();
    for (const p of ['Player', 'Opponent']) {
      const z = zones.find(q => q.userData.name === p + ' Hand');
      if (z && z.visible) {
        objs.push(z);
        who.set(z, p);
      }
      for (const c of game.piles[p].hand) {
        const m = meshes.get(c.iid);
        if (m && m.visible) {
          objs.push(m);
          who.set(m, p);
        }
      }
    }
    const h = rc.intersectObjects(objs, true)[0];
    if (!h) return null;
    for (let o = h.object; o; o = o.parent) if (who.has(o)) return who.get(o);
    return null;
  }
  addEventListener(
    'wheel',
    e => {
      if (e.target !== renderer.domElement) return;
      const p = handAt(e.clientX, e.clientY);
      if (!p) return;
      e.preventDefault();
      e.stopPropagation(); // over a hand the wheel scrolls it: no zoom
      const r = room[p];
      if (!r || r.max <= 0) return;
      const notch = Math.max(-3, Math.min(3, (e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY) / 100));
      at[p] = Math.min(r.max, Math.max(0, at[p] + notch * 1.5)); // one wheel notch = 1.5 cards
      ui.dirty = true;
      if (typeof View3D !== 'undefined' && View3D.isOn()) return; // the 3D hands are placed every frame
      sync();
    },
    { capture: true, passive: false }
  );
  return { spread, reset, handAt, get: p => at[p], max: p => (room[p] ? room[p].max : 0) };
})();

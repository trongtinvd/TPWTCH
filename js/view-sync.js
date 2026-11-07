// view-sync.js - VIEW SYNC (part 1): card mesh registry, target positions, zone emissive, table raycast helper.
// Classic script: shares one global scope with the other js/*.js files; load order matters (see index.html).

// =====================================================================
// VIEW SYNC: game state -> persistent card meshes that tween to targets.
// =====================================================================
const meshes = new Map();                           // iid -> mesh
function targets(){                                 // iid -> where the card should be drawn
  const T = new Map();
  const put = (c, x, z, y, rot, down, owner) => T.set(c.iid, {c, x, z, y: y + ((c === selected || c === placing) ? 0.25 : 0), rot, down, owner});
  for (const p of ['Player', 'Opponent']){          // hands: only the viewer sees their own
    const hand = game.piles[p].hand, n = hand.length, opp = p === 'Opponent';
    const sp = n > 1 ? Math.min(1.75, (HAND_W - CW - 0.4) / (n-1)) : 0;
    hand.forEach((c, i) => put(c, (i - (n-1)/2) * sp * (opp ? -1 : 1), opp ? -HZ : HZ, 0.1 + i*0.02, opp ? Math.PI : 0, p !== ui.view, p));
  }
  for (const k in game.slots){
    const id = game.slots[k]; if (!id) continue;
    const c = game.cards[id], z = slotZones[k];
    put(c, z.position.x, z.position.z, 0.11 + (Sim.canAttack(game, c) ? 0.2 : 0), c.owner === 'Opponent' ? Math.PI : 0, false, c.owner);   // creatures able to attack stand slightly raised
  }
  return T;
}
const lift = {Player:0, Opponent:0};
function applyEm(m){ m.material.emissive.setHex(m === hovered ? (m.userData.hoverEm || (m.userData.baseEm ? 0x44aa55 : 0x333333)) : (m.userData.baseEm || 0)); }
const tableAt = (px, py) => {                      // table point under a screen position
  const r = tmpRay; r.setFromCamera(tmpV.set(px/innerWidth*2-1, -(py/innerHeight)*2+1), cam);
  const t = (0.11 - r.ray.origin.y) / r.ray.direction.y; return {x: r.ray.origin.x + r.ray.direction.x*t, z: r.ray.origin.z + r.ray.direction.z*t};
};

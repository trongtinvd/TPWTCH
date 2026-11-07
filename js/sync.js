// sync.js - VIEW SYNC (part 2): buildStack(), sync() (state -> meshes/HUD), animate() tweening.
// Classic script: shares one global scope with the other js/*.js files; load order matters (see index.html).

function buildStack(){                              // shared stack panel: your objects on the left, the opponent's on the right
  stackEl.innerHTML = '<div class="sh">Stack \u00b7 ' + (game.stack.length ? 'bottom resolves first' : 'empty') + '</div>';
  for (let i = 0; i < game.stack.length; i++){        // oldest at the top of the panel, new objects appended at the bottom
    const o = game.stack[i], c = game.cards[o.iid], d = c.def, own = game.cards[o.src || o.iid].owner, el = document.createElement('div');
    el.className = 'sc ' + (own === 'Player' ? 'p' : 'o') + (i === game.stack.length - 1 ? ' top' : '') + (hiddenSids.has(o.sid) ? ' pend' : '');
    el.dataset.sid = o.sid; el.style.setProperty('--tc', cardColor(d));
    el.innerHTML = '<b></b><div class="sm"><span>HP ' + o.hp + '</span><span></span></div>';
    el.firstChild.textContent = o.name; el.querySelector('.sm span:last-child').textContent = NAME[own]; el.onclick = () => showCard(c); stackEl.appendChild(el);
  }
}
  function sync(){
  const seat = game.choice ? game.choice.player : game.priority;
  if (ui.autoView && game.phase === 'play' && ui.view !== seat) setView(seat);
  updateDbg(); buildStack(); applyLink();
  selected = selected && game.cards[selected.iid]; placing = placing && game.cards[placing.iid];
  if (selected && (selected.loc === 'gone' || selected.loc === 'exile')){ selected = null; inspect.hidden = true; }
  const T = targets(); pickCards = []; pickList = null;
  for (const [id, t] of T){
    let m = meshes.get(id); const mat = cardMat(t.c.def, t.down, t.rot, effHp(t.c));
    if (!m){
      m = new THREE.Mesh(cardGeo, mat); cardGroup.add(m); meshes.set(id, m);
      const o = t.c.loc === 'hand' ? sideZones[t.c.owner + 'deck'].position : {x:t.x, z:t.z};   // drawn cards fly out of the deck
      m.position.set(o.x, t.y, o.z); m.userData.by = t.y;
    } else if (m.material !== mat) m.material = mat;
    Object.assign(m.userData, {name: t.down ? 'Face-down card' : t.c.def.name, card: t.down ? null : t.c, tx:t.x, tz:t.z, ty:t.y, owner:t.owner, dying:false});
    setGlow(m, !t.down && canUse(t.c));
    if (!t.down) pickCards.push(m);
  }
  for (const [id, m] of meshes) if (!T.has(id)){    // left the table: glide to its pile, then disappear
    const c = game.cards[id];
    if (c.loc === 'stack'){ cardGroup.remove(m); meshes.delete(id); continue; }   // the showcase animation carries it to the stack instead
    const z = sideZones[c.owner + (c.loc === 'gy' ? 'gy' : 'deck')];
    Object.assign(m.userData, {tx:z.position.x, tz:z.position.z, ty:0.11, dying:true, card:null}); setGlow(m, false);
  }
  for (const p of ['Player', 'Opponent']){
    sideZones[p+'deck'].userData.relabel(game.piles[p].deck.length + ' cards');
    sideZones[p+'gy'].userData.relabel(game.piles[p].gy.length + ' cards');
  }
  const held = placing || (drag && drag.card), free = held && isPerm(held) ? new Set(Sim.freeSlots(game, held)) : null;
  const ch = game.choice, chCur = ch ? game.cards[ch.iid].slot : null;   // shift choice: highlight left / right / current zone
  const valid = ch ? zones.filter(z => ch.options.includes(z.userData.slotKey) || z.userData.slotKey === chCur) : !held ? [] : free ? zones.filter(z => free.has(z.userData.slotKey)) : zones.filter(z => z.userData.slot);
  zones.forEach(z => { const cur = ch && z.userData.slotKey === chCur; z.userData.baseEm = valid.includes(z) ? (cur ? 0x7a5c14 : 0x1f6b2f) : 0; z.userData.hoverEm = cur ? 0xc99a2a : 0; applyEm(z); });
  stackEl.classList.toggle('drop', !!(drag && !isPerm(drag.card)));
  statusEl.textContent = game.phase === 'deck' ? deckStatus() : drag ? 'Drop ' + drag.card.def.name + (isPerm(drag.card) ? ' on a highlighted zone' : ' on the board or the stack') :
    game.choice ? NAME[game.choice.player] + ': ' + game.choice.prompt + ' Click a green zone to shift there, or the amber zone to stay.' :
    placing ? 'Placing ' + placing.def.name + ': click a highlighted zone (Esc to cancel)' :
    NAME[game.active] + '\u2019s turn' + (game.attackPhase ? ' (attack phase)' : '') + (game.majorUsed ? ' (major action used)' : '') + ' \u00b7 ' + (ui.note ? ui.note + ' \u00b7 ' : '') + (game.stack.length ? 'Stack (top last): ' + game.stack.map(o => o.name + ' [HP ' + o.hp + ']').join(' \u2192 ') + ' \u00b7 ' : 'Stack empty \u00b7 ') +
    NAME[game.priority] + ' has priority' + (ui.view !== game.priority ? ' (viewing ' + NAME[ui.view] + ')' : '');
  for (const p of ['Player', 'Opponent']){          // life bars
    const row = document.querySelector('#hp [data-p="' + p + '"]'), L = Math.max(0, game.life[p]);
    row.querySelector('i').style.width = (L / game.maxLife * 100) + '%'; row.querySelector('b').textContent = L;
  }
  if (openList) buildList();
  if (selected && selected.loc === 'hand' && selected.owner !== ui.view) selected = null;
  refreshInspect();
  dirty = true; hoverDirty = true;
}
function animate(){                                 // returns true while anything is still moving
  let busy = false, gl = 0; pulse = false;
  if (links.length){ busy = true; updateLink(); }
  for (const m of meshes.values()) if (m.userData.glow) gl++;
  if (gl){ pulse = true; glowMat.opacity = 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(performance.now() / 1000 * 2.6), 2); }   // pulse only: rendered at ~30 fps below   // periodic pulse
  if (camAngle !== camGoal){
    camAngle += (camGoal - camAngle) * 0.12; if (Math.abs(camGoal - camAngle) < 0.002) camAngle = camGoal;
    const c = Math.cos(camAngle), s = Math.sin(camAngle);
    camera.position.set(3*c + 22*s, 29, -3*s + 22*c);
    controls.target.set(0, 0, 0); busy = true; if (tv.on) placeTop();
  }
  for (const p of ['Player', 'Opponent']){
    const t = p === game.priority ? 0.45 : 0;
    if (lift[p] !== t){ lift[p] += (t - lift[p]) * 0.15; if (Math.abs(t - lift[p]) < 0.002) lift[p] = t; busy = true; }
  }
  for (const p of ['Player', 'Opponent']) pads[p].material.color.lerpColors(GROUND_DIM, GROUND_LIT, lift[p] / 0.45);
  zones.forEach(z => { const L = z.userData.owner ? lift[z.userData.owner] : 0; z.position.y = L; z.userData.plane.position.y = 0.065 + L; });
  for (const [id, m] of meshes){
    if (drag && drag.card.iid === id){ busy = true; continue; }    // follows the pointer
    const u = m.userData, dx = u.tx - m.position.x, dz = u.tz - m.position.z, dy = u.ty - u.by;
    if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) > 0.003){ m.position.x += dx*0.25; m.position.z += dz*0.25; u.by += dy*0.25; busy = true; }
    else { m.position.x = u.tx; m.position.z = u.tz; u.by = u.ty; if (u.dying){ cardGroup.remove(m); meshes.delete(id); continue; } }
    m.position.y = u.by + (u.owner ? lift[u.owner] : 0);
  }
  return busy;
}

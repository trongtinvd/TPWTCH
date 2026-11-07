// links.js - HOVER LINKS: stack entry <-> source card/player highlight arrows.
// Classic script: shares one global scope with the other js/*.js files; load order matters (see index.html).

// ---- Hover links. Hover an entry, a card or an HP bar: everything related pulses green and a thin arrow joins them ----
const v3 = new THREE.Vector3(), arrowSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
arrowSvg.id = 'arrow';
arrowSvg.innerHTML = '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#3fe07a"/></marker></defs>';
document.body.appendChild(arrowSvg);
const revealEl = document.createElement('div'); revealEl.id = 'reveal'; revealEl.hidden = true; document.body.appendChild(revealEl);
const ringMat = new THREE.MeshBasicMaterial({map:glowTex, color:0x3fe07a, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, opacity:0}), srcRing = new THREE.Mesh(glowGeo, ringMat);
srcRing.rotation.x = -Math.PI/2; srcRing.raycast = () => {}; srcRing.visible = false; scene.add(srcRing);
let linkSrc = null, linkKey = '', links = []; const lines = [];
function lineAt(i){ while (lines.length <= i){ const l = document.createElementNS('http://www.w3.org/2000/svg', 'line'); l.setAttribute('stroke', '#3fe07a'); l.setAttribute('stroke-width', '1.5'); l.setAttribute('marker-end', 'url(#ah)'); arrowSvg.appendChild(l); lines.push(l); } return lines[i]; }
function project(x, y, z){ cam.updateMatrixWorld(); v3.set(x, y, z).project(cam); return {x:(v3.x + 1)/2*innerWidth, y:(1 - v3.y)/2*innerHeight}; }
function screenOf(c){                               // where a card is on screen (its mesh, else its pile)
  const m = meshes.get(c.iid), p = m ? m.position : sideZones[c.owner + (c.loc === 'deck' || c.loc === 'hand' ? 'deck' : 'gy')].position;
  return project(p.x, p.y || 0.11, p.z);
}
function setLink(src){
  const k = src ? src.t + (src.sid ?? src.iid ?? src.p) : ''; if (k === linkKey) return;
  linkKey = k; linkSrc = src; applyLink(); dirty = true;
}
function applyLink(){
  document.querySelectorAll('.hl, .hpr.pulseG').forEach(e => e.classList.remove('hl', 'pulseG'));
  revealEl.hidden = true; srcRing.visible = false; lines.forEach(l => l.setAttribute('visibility', 'hidden')); links = [];
  const H = linkSrc; if (!H) return;
  const owner = o => game.cards[o.src || o.iid].owner;
  const list = H.t === 'entry' ? game.stack.filter(o => o.sid === H.sid)
    : H.t === 'card' ? game.stack.filter(o => o.kind !== 'spell' && o.src === H.iid)      // abilities / triggers that came from this card
    : game.stack.filter(o => o.kind === 'spell' && owner(o) === H.p);                    // spells this player cast
  for (const o of list){
    const el = stackEl.querySelector('[data-sid="' + o.sid + '"]'); if (!el || el.classList.contains('pend')) continue;
    el.classList.add('hl', 'pulseG'); const src = game.cards[o.src || o.iid]; let k;
    if (H.t === 'player' || o.kind === 'spell'){ const row = document.querySelector('#hp [data-p="' + owner(o) + '"]'); row.classList.add('pulseG'); k = {el, box:row}; }   // a spell points at its caster
    else if (src.loc === 'board' && meshes.has(src.iid)) k = {el, mesh:meshes.get(src.iid)};
    else {                                          // hand / deck / GY / exile: reveal the card so the origin is visible
      revealEl.innerHTML = '<img><b></b><span></span>'; revealEl.querySelector('img').src = artURL(src.def);
      revealEl.querySelector('b').textContent = src.def.name; revealEl.querySelector('span').textContent = 'from ' + (src.loc === 'gy' ? 'graveyard' : src.loc);
      revealEl.style.setProperty('--tc', cardColor(src.def)); revealEl.hidden = false; k = {el, box:revealEl};
    }
    links.push(k);
  }
}
function updateLink(){                              // every frame while linked (camera and cards may move)
  let ringed = false;
  links.forEach((k, i) => {
    const a = k.el.getBoundingClientRect(), ay = (a.top + a.bottom)/2; let tx, ty;
    if (k.mesh){ const p = k.mesh.position; ({x:tx, y:ty} = project(p.x, p.y, p.z)); if (!ringed){ ringed = true; srcRing.position.set(p.x, p.y + 0.06, p.z); } }
    else { const b = k.box.getBoundingClientRect(); tx = Math.min(Math.max(a.right, b.left), b.right); ty = Math.min(Math.max(ay, b.top), b.bottom); }
    const ax = tx > a.right ? a.right : tx < a.left ? a.left : (a.left + a.right)/2, l = lineAt(i);
    l.setAttribute('x1', ax); l.setAttribute('y1', ay); l.setAttribute('x2', tx); l.setAttribute('y2', ty); l.setAttribute('visibility', 'visible');
  });
  srcRing.visible = ringed; ringMat.opacity = 0.35 + 0.65*Math.pow(0.5 + 0.5*Math.sin(performance.now()/1000*6), 2);
}
stackEl.addEventListener('pointermove', e => { const el = e.target.closest && e.target.closest('.sc'); setLink(el ? {t:'entry', sid:+el.dataset.sid} : null); });
stackEl.addEventListener('pointerleave', () => setLink(null));
document.querySelectorAll('#hp .hpr').forEach(r => { r.addEventListener('pointerenter', () => setLink({t:'player', p:r.dataset.p})); r.addEventListener('pointerleave', () => setLink(null)); });

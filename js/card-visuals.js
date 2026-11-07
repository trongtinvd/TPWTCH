// card-visuals.js - CARD VISUALS: card meshes, 3D artwork (SHAPES), card face textures, playable-card glow.
// Classic script: shares one global scope with the other js/*.js files; load order matters (see index.html).

// ---- Card meshes ------------------------------------------------------------
const CW = 1.6, CD = 2.3, cardGeo = new THREE.BoxGeometry(CW, 0.08, CD);
const matCache = {}, sideMat = new THREE.MeshStandardMaterial({color:0x1b1d24});
const effHp = c => c.def.hp - (c.loc === 'board' ? Sim.totalDamage(c) : 0);   // HP left after damage counters
// ---- Simple 3D artwork: each card name maps to a small model, rendered once to a canvas ----
const mk = (geo, color, x, y, z, rx, rz, em) => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color, roughness:.5, metalness:.15, emissive:em || 0})); m.position.set(x || 0, y || 0, z || 0); m.rotation.x = rx || 0; m.rotation.z = rz || 0; return m; };
const Bx = (w, h, d) => new THREE.BoxGeometry(w, h, d), Sp = r => new THREE.SphereGeometry(r, 20, 14), Cl = (a, b, h) => new THREE.CylinderGeometry(a, b, h, 18), Cn = (r, h, s) => new THREE.ConeGeometry(r, h, s || 18), Tr = (r, t, arc) => new THREE.TorusGeometry(r, t, 10, 32, arc || Math.PI*2);
const H = Math.PI/2, ring = (n, f) => Array.from({length:n}, (_, i) => f(i/n*Math.PI*2));
const SHAPES = {
  soldier: () => [mk(Cl(.3,.4,.9),0xb8bfcc), mk(Sp(.27),0xf0cfa8,0,.72,0), mk(new THREE.SphereGeometry(.3,16,10,0,Math.PI*2,0,H),0x6b7280,0,.78,0), mk(Cl(.03,.03,2),0x8b5a2b,.6,.2,0), mk(Cn(.09,.3),0xe8eef5,.6,1.3,0)],
  knight: () => [mk(Bx(.8,1,.5),0xaab4c8), mk(Bx(.5,.45,.5),0x8d98ad,0,.85,0), mk(Cn(.12,.45),0xd4524f,0,1.3,0), mk(Bx(.08,.7,.55),0xe0b341,-.5,.1,0), mk(Bx(.08,1.1,.08),0xeef2f8,.55,.3,0), mk(Bx(.35,.06,.08),0x8b5a2b,.55,-.2,0)],
  giant: () => [mk(Bx(1.3,1.4,.8),0x9a7b5c), mk(Sp(.4),0xe0b98f,0,1.1,0), mk(Cl(.2,.2,1.1),0x9a7b5c,-.85,.1,0), mk(Cl(.2,.2,1.1),0x9a7b5c,.85,.1,0), mk(Cl(.12,.22,1.2),0x6e4a26,1.1,.7,0)],
  barrier: () => [mk(Bx(.5,1.1,.2),0x9b6b3a,-.6,0,0), mk(Bx(.5,1.3,.2),0xa97a47,0,.1,0), mk(Bx(.5,1.1,.2),0x9b6b3a,.6,0,0), mk(Bx(1.9,.18,.12),0x6e4a26,0,.15,.15)],
  ward: () => [mk(Cl(.8,.8,.12),0x4aa87a,0,0,0,H), mk(Tr(.8,.07),0xe0c36a), mk(Sp(.2),0xe8e8f0,0,0,.1)],
  aura: () => [mk(Sp(.35),0xfff0a0,0,0,0,0,0,0x887733), mk(Tr(.7,.05),0xffd86b,0,0,0,H), mk(Tr(.95,.04),0xffd86b,0,0,0,1.1), mk(Tr(.95,.04),0xffd86b,0,0,0,0,1.1)],
  heal: () => [mk(Bx(.5,1.5,.5),0xffffff), mk(Bx(1.5,.5,.5),0xffffff)],
  zap: () => [mk(Bx(.35,.9,.2),0xffe14d,.2,.65,0,0,.45,0x665500), mk(Bx(.35,.9,.2),0xffe14d,-.05,0,0,0,-.45,0x665500), mk(Cn(.25,.7),0xffe14d,-.3,-.7,0,0,Math.PI,0x665500)],
  archer: () => [mk(Tr(.9,.07,Math.PI),0x8b5a2b,0,0,0,0,H), mk(Cl(.015,.015,1.8),0xeeeeee), mk(Cl(.03,.03,1.6),0xd8c8a8,.1,0,0,0,H), mk(Cn(.08,.25),0xdde3ea,1,0,0,0,-H)],
  guard: () => [mk(Cl(.5,.55,1.4),0x9aa3b5)].concat([[1,1],[1,-1],[-1,1],[-1,-1]].map(p => mk(Bx(.25,.3,.25),0x8a93a5,p[0]*.33,.85,p[1]*.33)), [mk(Cl(.4,.4,.08),0xe0b341,0,0,.52,H)]),
  wolf: () => [mk(Bx(1.3,.55,.5),0x8c929c), mk(Bx(.5,.45,.45),0xa0a6b0,.85,.25,0), mk(Bx(.3,.2,.25),0x777c85,1.15,.15,0), mk(Cn(.1,.25),0x6f747d,.8,.55,.15), mk(Cn(.1,.25),0x6f747d,.8,.55,-.15), mk(Cn(.1,.6),0x8c929c,-.85,.2,0,0,1.2)].concat([[1,1],[1,-1],[-1,1],[-1,-1]].map(p => mk(Cl(.08,.08,.5),0x6f747d,p[0]*.45,-.45,p[1]*.18))),
  scout: () => [mk(Cn(.5,1.3),0x4d5a4a), mk(Sp(.22),0xf0cfa8,0,.8,0), mk(Cn(.28,.45),0x3b473a,0,.95,0), mk(Bx(.06,.7,.06),0xeef2f8,.55,.1,0,0,-.5)],
  banner: () => [mk(Cl(.04,.04,2.1),0x8b5a2b,-.5,0,0), mk(Sp(.09),0xe0b341,-.5,1.1,0), mk(Bx(1,.7,.06),0xd4524f,0,.7,0)],
  trap: () => [mk(Cl(.9,.9,.12),0x6b6f78,0,-.3,0), mk(Cl(.25,.25,.08),0xb8892b,0,-.2,0)].concat(ring(8, a => mk(Cn(.1,.5,8),0xc8ccd6,Math.cos(a)*.6,.05,Math.sin(a)*.6))),
  charm: () => [mk(Tr(.7,.04),0xe0b341,0,.3,0), mk(Sp(.1),0xe0b341,0,-.4,0), mk(new THREE.OctahedronGeometry(.3),0x6fd3ff,0,-.65,0,0,0,0x113344)],
  bolt: () => [mk(Cl(.05,.05,1.8),0xd8c8a8,0,0,0,0,H), mk(Cn(.12,.4),0xdde3ea,1.1,0,0,0,-H), mk(Bx(.35,.25,.03),0xd4524f,-.8,0,0), mk(Bx(.35,.03,.25),0xd4524f,-.8,0,0)],
  mend: () => [mk(Cl(.5,.5,.6),0xf4efe6,0,0,0,H), mk(Cl(.51,.51,.12),0xd4524f,0,0,0,H), mk(Bx(1.1,.04,.5),0xf4efe6,.95,-.48,0)],
  fireball: () => [mk(Sp(.55),0xff7a1a,0,0,0,0,0,0xaa3300), mk(Sp(.35),0xffd54a,0,0,0,0,0,0xaa8800)].concat(ring(8, a => mk(Cn(.22,.9),0xff9a2a,Math.cos(a)*.75,Math.sin(a)*.75,0,0,a-H,0x662200))),
  rally: () => [mk(Cl(.08,.08,1),0xe0b341,-.6,0,0,0,H), mk(Cl(.65,.1,1.1),0xe0b341,.5,0,0,0,-H), mk(Sp(.1),0xe0b341,-1.1,0,0)],
  hummingbird: () => [mk(Sp(.38),0xd4363a), mk(Sp(.22),0xe04a4a,.45,.3,0), mk(Cn(.04,.55),0x2a2a2a,.95,.3,0,0,-H), mk(Bx(.1,.9,.55),0xb02a2e,-.1,.35,.3,0,.5), mk(Bx(.1,.9,.55),0xb02a2e,-.1,.35,-.3,0,.5), mk(Cn(.12,.6),0x8f2226,-.6,-.15,0,0,H)],
  blast: () => [mk(Sp(.65),0x2a2d36,0,-.1,0), mk(Cl(.05,.05,.5),0x8b5a2b,.25,.7,0,0,-.5), mk(Sp(.13),0xffe14d,.42,.97,0,0,0,0xffaa00)]
};
const artCache = {}, artURLs = {};
let artR = null, artScene = null, artCam = null;
function artCanvas(def){
  if (artCache[def.id]) return artCache[def.id];
  if (!artR){
    artR = new THREE.WebGLRenderer({antialias:true, alpha:true, preserveDrawingBuffer:true}); artR.setPixelRatio(1); artR.setSize(256, 256);
    artScene = new THREE.Scene(); artScene.add(new THREE.AmbientLight(0xffffff, .75));
    const L = new THREE.DirectionalLight(0xffffff, .9); L.position.set(2, 3, 4); artScene.add(L);
    artCam = new THREE.PerspectiveCamera(30, 1, .1, 50); artCam.position.set(0, 1.2, 5.4); artCam.lookAt(0, 0, 0);
  }
  const key = def.id.replace(/^tok-(.+)-\d+$/, '$1');   // ability tokens reuse their source card's model
  const inner = new THREE.Group(); (SHAPES[key] ? SHAPES[key]() : [mk(Sp(.7), 0xcccccc)]).forEach(p => inner.add(p));
  const bb = new THREE.Box3().setFromObject(inner), r = bb.getSize(new THREE.Vector3()).length()/2;
  inner.position.sub(bb.getCenter(new THREE.Vector3()));
  const pivot = new THREE.Group(); pivot.add(inner); pivot.scale.setScalar(1.15/r); pivot.rotation.y = -.55;
  artScene.add(pivot); artR.render(artScene, artCam); artScene.remove(pivot);
  const c = document.createElement('canvas'); c.width = c.height = 256; c.getContext('2d').drawImage(artR.domElement, 0, 0);
  return artCache[def.id] = c;
}
const artURL = def => artURLs[def.id] || (artURLs[def.id] = artCanvas(def).toDataURL());
// Pre-render all artwork once (cards + ability tokens), then release the second WebGL context
DEFS.forEach(d => { artCanvas(d); (d.abilities || []).forEach((_, i) => artCanvas({id:'tok-' + d.id + '-' + i})); (d.triggers || []).forEach((_, i) => artCanvas({id:'tok-' + d.id + '-' + (100 + i)})); });
artR.dispose(); artR.forceContextLoss(); artR = null;
function cardMat(def, faceDown, rot, hp){         // on the table a card shows only: name, power, effective HP
  const key = (faceDown ? 'fd' : def.id + '|' + hp) + '|' + rot;
  if (matCache[key]) return matCache[key];
  const c = document.createElement('canvas'); c.width = 160; c.height = 230;
  const g = c.getContext('2d');
  g.fillStyle = faceDown ? '#3b3f4d' : cardColor(def); g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 6; g.strokeRect(3, 3, c.width-6, c.height-6);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (faceDown){ g.font = 'bold 64px sans-serif'; g.fillText('?', c.width/2, c.height/2); }
  else {
    g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(22, 42, 116, 116); g.drawImage(artCanvas(def), 24, 44, 112, 112);
    g.fillStyle = '#fff';
    let sz = 30; do { g.font = 'bold ' + sz + 'px sans-serif'; sz--; } while (g.measureText(def.name).width > c.width*0.86 && sz > 10);
    g.fillText(def.name, c.width/2, 22);
    g.font = 'bold 20px sans-serif';
    if (def.type === 'creature'){ g.textAlign = 'left'; g.fillText('PWR ' + def.atk, 14, c.height - 26); }   // cards without power show no PWR
    g.textAlign = 'right'; g.fillStyle = hp < def.hp ? '#ffd0d0' : '#fff'; g.fillText('HP ' + hp, c.width - 14, c.height - 26);
  }
  const tex = new THREE.CanvasTexture(c); tex.center.set(0.5, 0.5); tex.rotation = rot; tex.anisotropy = 4;
  return matCache[key] = [sideMat, sideMat, new THREE.MeshBasicMaterial({map: tex}), sideMat, sideMat, sideMat];
}
const cardGroup = new THREE.Group(); scene.add(cardGroup);
// ---- Pulsing border glow on cards the viewer can play or use right now ----
const glowTex = (() => { const c = document.createElement('canvas'); c.width = 168; c.height = 224; const g = c.getContext('2d'); g.shadowColor = '#ffe27a'; g.shadowBlur = 16; g.strokeStyle = '#fff1a8'; g.lineWidth = 4; for (let i = 0; i < 3; i++) g.strokeRect(20, 20, 128, 184); return new THREE.CanvasTexture(c); })();
const glowMat = new THREE.MeshBasicMaterial({map:glowTex, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, opacity:0}), glowGeo = new THREE.PlaneGeometry(CW + 0.5, CD + 0.5);
function setGlow(m, on){
  const g = m.userData.glow;
  if (on && !g){ const p = new THREE.Mesh(glowGeo, glowMat); p.rotation.x = -Math.PI/2; p.position.y = 0.05; p.raycast = () => {}; m.add(p); m.userData.glow = p; }
  else if (!on && g){ m.remove(g); m.userData.glow = null; }
}
const canUse = c => c.owner === ui.view && (c.loc === 'hand' ? !Sim.canPlay(game, c) : c.loc === 'board' && (c.def.abilities || []).some((a, i) => !Sim.canActivate(game, c, i)));
let pickCards = [];

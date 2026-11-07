// animations.js - SHOWCASE ANIMATIONS: ghost cards flying to/from the stack; fxJobs/fxRun.
// Classic script: shares one global scope with the other js/*.js files; load order matters (see index.html).

// ---- Showcase animations. The simulation has already moved on; the screen keeps the OLD state until they finish ----
const hiddenSids = new Set(); const fxReset = () => hiddenSids.clear();
function fly(def, sub, from, toFn, s0, s1){
  const g = document.createElement('div'); g.className = 'ghost'; g.style.setProperty('--tc', cardColor(def));
  g.innerHTML = '<img><b></b><i></i>'; g.querySelector('img').src = artURL(def); g.querySelector('b').textContent = def.name; g.querySelector('i').textContent = sub;
  document.body.appendChild(g);
  const to = toFn(), mid = {x:innerWidth/2, y:innerHeight/2}, at = (p, s) => 'translate(' + (p.x - 70) + 'px,' + (p.y - 98) + 'px) scale(' + s + ')';
  const a = g.animate([                             // 0-33% move + grow, 33-70% hold, 70-100% travel to the destination
    {transform:at(from, s0), opacity:.9, offset:0, easing:'ease-out'}, {transform:at(mid, 1.7), opacity:1, offset:.33},
    {transform:at(mid, 1.7), opacity:1, offset:.7, easing:'ease-in'}, {transform:at(to || mid, s1), opacity:to ? .85 : 0, offset:1}], {duration:1700, fill:'forwards'});
  return Promise.race([a.finished, new Promise(r => setTimeout(r, 2600))]).catch(() => {}).then(() => g.remove());
}
const stackSlot = (own, i) => {                     // where the next entry will appear in the stack panel
  const b = stackEl.getBoundingClientRect(), last = [...stackEl.querySelectorAll('.sc')].pop();
  return {x:b.left + b.width * (own === 'Player' ? 0.4 : 0.6), y:Math.min(b.bottom - 40, (last ? last.getBoundingClientRect().bottom : b.top + 24) + 28 + i*44)};
};
const subOf = (src, o) => o.kind === 'spell' ? src.def.timing + ' spell' : ((src.def[o.list] || [])[o.ab] || {}).name || 'Trigger';
async function enterJob(pre, o, i){
  const src = pre.cards[o.src || o.iid], m = o.kind === 'spell' ? meshes.get(src.iid) : null;
  const from = screenOf(src); if (m){ m.visible = false; dirty = true; }            // the hand card is carried by the ghost
  await fly(src.def, subOf(src, o), from, () => stackSlot(src.owner, i), 0.45, 0.32);
}
async function leaveJob(pre, o){
  const src = pre.cards[o.src || o.iid], el = stackEl.querySelector('[data-sid="' + o.sid + '"]'), b = (el || stackEl).getBoundingClientRect();
  hiddenSids.add(o.sid); if (el) el.style.visibility = 'hidden'; setLink(null);
  await fly(src.def, subOf(src, o), {x:(b.left + b.right)/2, y:(b.top + b.bottom)/2},
    () => o.kind === 'spell' ? project(sideZones[src.owner + 'gy'].position.x, 0.11, sideZones[src.owner + 'gy'].position.z) : (src.loc === 'board' && meshes.has(src.iid) ? screenOf(src) : null), 0.32, 0.45);
}
function fxJobs(pre, post){                         // stack diff: gone = resolved/countered (leave), new = enter
  const A = new Set(pre.stack.map(o => o.sid)), B = new Set(post.stack.map(o => o.sid)), jobs = []; let n = 0;
  pre.stack.forEach(o => { if (!B.has(o.sid)) jobs.push(() => leaveJob(pre, o)); });
  post.stack.forEach(o => { if (!A.has(o.sid)){ const i = n++; jobs.push(() => enterJob(pre, o, i)); } });
  return jobs;
}
async function fxRun(jobs, done){
  fxBusy = true;
  for (const j of jobs){ await new Promise(r => setTimeout(r, 30)); try { await j(); } catch (e) { console.error(e); } }
  hiddenSids.clear(); fxBusy = false; done();
}

// camera-anim.js - Patch8: camera animations of the 3D side view. One plays at a time; it drives the camera position, rotation and
// FOV, blends in from wherever the camera is and blends out back to the seat camera ("base"). A newer one takes over with the
// transition configured for that pair (camera.json animation.transitions), else with its own blend-in. Nothing here ever invents a
// camera move: an asset that did not load is simply not played and the camera stays as it is.
const CameraAnim3D = (function () {
  let active = null,
    base = null, // { pos, quat, fov }: where the camera returns to
    lastId = null;
  const P = () => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 45 }),
    tmpM = new THREE.Matrix4(),
    up = new THREE.Vector3(0, 1, 0),
    vA = new THREE.Vector3(),
    vB = new THREE.Vector3(),
    rig = new THREE.Object3D(),
    sampleOut = P(),
    blendA = P();
  const smooth = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const snap = () => ({ pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov });
  function lerpPose(out, a, b, w) {
    out.pos.copy(a.pos).lerp(b.pos, w);
    out.quat.copy(a.quat).slerp(b.quat, w);
    out.fov = a.fov + (b.fov - a.fov) * w;
    return out;
  }
  // the pose of the asset at time t, in world space (anchor: the character's feet and facing, the seat, or nothing)
  function sample(A, t, anchor, out) {
    if (A.asset.kind === 'keys') {
      const K = A.asset.keys;
      let i = 0;
      while (i < K.length - 1 && K[i + 1].t <= t) i++;
      const a = K[i],
        b = K[Math.min(i + 1, K.length - 1)],
        w = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
      vA.fromArray(a.position).lerp(vB.fromArray(b.position), w).applyMatrix4(anchor);
      const ta = a.target || [0, 0, 0],
        tb = b.target || ta;
      vB.fromArray(ta).lerp(new THREE.Vector3().fromArray(tb), w).applyMatrix4(anchor);
      out.pos.copy(vA);
      tmpM.lookAt(vA, vB, up);
      out.quat.setFromRotationMatrix(tmpM);
      const fa = a.fov != null ? a.fov : base.fov,
        fb = b.fov != null ? b.fov : fa;
      out.fov = fa + (fb - fa) * w;
      return out;
    }
    // a camera node animated in a glTF file
    const g = A.asset;
    if (!g.mixer) {
      g.mixer = new THREE.AnimationMixer(g.scene);
      g.action = g.mixer.clipAction(g.clip);
      g.action.play();
    }
    rig.matrixAutoUpdate = false;
    rig.matrix.copy(anchor);
    if (g.scene.parent !== rig) rig.add(g.scene);
    g.mixer.setTime(t);
    rig.updateMatrixWorld(true);
    g.camera.matrixWorld.decompose(out.pos, out.quat, vA);
    out.fov = g.camera.isPerspectiveCamera ? g.camera.fov : base.fov;
    return out;
  }
  function apply(p) {
    camera.position.copy(p.pos);
    camera.quaternion.copy(p.quat);
    if (camera.fov !== p.fov) {
      camera.fov = p.fov;
      camera.updateProjectionMatrix();
    }
  }
  // asset: a loaded camera asset; o: { id, speed, anchor (Matrix4), blendIn, blendOut }
  function play(asset, o) {
    if (!asset) return false; // no asset: the camera is left alone
    const from = snap();
    if (!active) base = from;
    const tr = Anim3DLogic.findTransition(o.transitions, lastId, o.id),
      blendIn = tr ? (tr.interpolation.method === 'cut' ? 0 : tr.interpolation.duration) : o.blendIn;
    active = {
      asset,
      id: o.id,
      t: 0,
      speed: o.speed || 1,
      dur: Math.max(0.01, asset.duration || 0.01),
      anchor: (o.anchor || new THREE.Matrix4()).clone(),
      blendIn: active && tr && tr.interpolation.method === 'cut' ? 0 : blendIn,
      blendOut: o.blendOut,
      from,
    };
    lastId = o.id;
    return true;
  }
  function update(dt) {
    if (!active) return false;
    const A = active;
    A.t += dt * A.speed;
    if (A.t >= A.dur) {
      apply(base);
      active = null;
      return true;
    }
    sample(A, A.t, A.anchor, sampleOut);
    const wIn = A.blendIn > 0 ? smooth(A.t / A.blendIn) : 1,
      wOut = A.blendOut > 0 ? smooth((A.dur - A.t) / A.blendOut) : 1;
    lerpPose(blendA, A.from, sampleOut, wIn);
    apply(lerpPose(sampleOut, base, blendA, wOut));
    return true;
  }
  function stop() {
    if (active && base) apply(base);
    active = null;
  }
  // the seat camera moved (auto view) while an animation plays: it returns to the new seat
  function setBase(pos, quat, fov) {
    if (!base) base = P();
    base.pos.copy(pos);
    base.quat.copy(quat);
    base.fov = fov;
  }
  return { play, update, stop, setBase, owns: () => !!active, current: () => (active ? active.id : null) };
})();

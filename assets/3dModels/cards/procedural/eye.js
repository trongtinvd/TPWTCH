// eye.js - Patch10: a procedural card model (an example of a model made by code). Registers CardModelScripts.eye(THREE, params).
// params: color (iris), size. The model draws its own selection animation (userData.select) and frees what it made (userData.dispose).
(window.CardModelScripts = window.CardModelScripts || {}).eye = function (THREE, params) {
  const size = typeof params.size === 'number' ? params.size : 0.6,
    root = new THREE.Group(),
    mats = [],
    geos = [];
  const mat = o => (mats.push(o), o),
    geo = g => (geos.push(g), g);
  const white = new THREE.Mesh(
    geo(new THREE.SphereGeometry(size, 32, 20)),
    mat(new THREE.MeshStandardMaterial({ color: 0xf3ecd8, roughness: 0.35 }))
  );
  white.position.y = size * 1.4;
  const iris = new THREE.Mesh(
    geo(new THREE.SphereGeometry(size * 0.45, 24, 16)),
    mat(new THREE.MeshStandardMaterial({ color: params.color || '#c9a24a', roughness: 0.3, emissive: 0x000000 }))
  );
  iris.position.set(0, 0, size * 0.9);
  iris.scale.z = 0.3;
  const pupil = new THREE.Mesh(
    geo(new THREE.SphereGeometry(size * 0.2, 16, 12)),
    mat(new THREE.MeshStandardMaterial({ color: 0x111111 }))
  );
  pupil.position.set(0, 0, size * 1.0);
  pupil.scale.z = 0.3;
  white.add(iris, pupil);
  const base = new THREE.Mesh(
    geo(new THREE.CylinderGeometry(size * 0.5, size * 0.8, size * 0.5, 24)),
    mat(new THREE.MeshStandardMaterial({ color: 0x1d2741, roughness: 0.8 }))
  );
  base.position.y = size * 0.25;
  root.add(base, white);
  root.userData.select = t => {
    // the eye opens wide and glows, then settles
    const k = Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
    iris.material.emissive.setRGB(0.6 * k, 0.45 * k, 0.1 * k);
    pupil.scale.setScalar(1 - 0.5 * k);
    pupil.scale.z = 0.3;
    white.rotation.y = Math.sin(t * Math.PI * 2) * 0.4 * (1 - t);
  };
  root.userData.dispose = () => {
    mats.forEach(m => m.dispose());
    geos.forEach(g => g.dispose());
  };
  return root;
};

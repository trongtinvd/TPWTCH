// card-model-template.js - TEMPLATE (Patch11): a card model made by code, for the 3D card preview (?anim3d).
// 1. Copy this file into assets/3dModels/cards/procedural/ and rename the builder ("templateModel").
// 2. Add to assets/3dModels/cards/index.json: "<card id>": { "type": "script", "path": "procedural/<file>.js", "builder": "<name>" }
// The builder gets THREE and the entry's "params" and returns a THREE.Object3D, feet at y = 0, facing +Z.
// Optional: userData.select(t), t = 0..1 over the selection, draws its own selection animation; userData.dispose() frees what it made.
(window.CardModelScripts = window.CardModelScripts || {}).templateModel = function (THREE, params) {
  const root = new THREE.Group(),
    geo = new THREE.BoxGeometry(0.6, 1, 0.6),
    mat = new THREE.MeshStandardMaterial({ color: params.color || '#3f7fd8', roughness: 0.5 });
  const body = new THREE.Mesh(geo, mat);
  body.position.y = 0.5;
  root.add(body);
  root.userData.select = t => {
    body.rotation.y = t * Math.PI * 2; // one turn
    mat.emissive.setScalar(0.3 * Math.sin(Math.PI * t)); // a flash
  };
  root.userData.dispose = () => {
    geo.dispose();
    mat.dispose();
  };
  return root;
};

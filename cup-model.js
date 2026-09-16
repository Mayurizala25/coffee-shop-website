// Procedural reusable coffee cup — matches the product reference.
// Parts are separate objects so the lid can move independently.

export function buildCup(THREE) {
  const mat = {
    lid: new THREE.MeshStandardMaterial({ name: 'matte_black_lid', color: '#33302e', roughness: 0.58, metalness: 0.2 }),
    body: new THREE.MeshStandardMaterial({ name: 'tan_body', color: '#c49468', roughness: 0.7, metalness: 0.03 }),
    inner: new THREE.MeshStandardMaterial({ name: 'inner_wall', color: '#a97a52', roughness: 0.85, metalness: 0.02, side: THREE.DoubleSide }),
    sleeve: new THREE.MeshStandardMaterial({ name: 'cream_sleeve', color: '#e7c58f', roughness: 0.72, metalness: 0.02 }),
    bean: new THREE.MeshStandardMaterial({ name: 'bean_brown', color: '#6d4028', roughness: 0.55, metalness: 0.04 }),
    coffee: new THREE.MeshStandardMaterial({ name: 'coffee', color: '#2b1408', roughness: 0.22, metalness: 0.12 })
  };

  const lathe = (pts, name, material, seg = 96) => {
    const m = new THREE.Mesh(
      new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg),
      material
    );
    m.name = name;
    m.castShadow = m.receiveShadow = true;
    return m;
  };

  const cup = new THREE.Group();
  cup.name = 'reusable_coffee_cup';

  // body: tapered tumbler, rounded base, open mouth with an inner wall
  cup.add(lathe([
    [0.0000, 0.0000], [0.0200, 0.0000], [0.0285, 0.0022], [0.0325, 0.0066],
    [0.0344, 0.0120], [0.0368, 0.0230], [0.0408, 0.0500], [0.0456, 0.0850],
    [0.0492, 0.1105], [0.0498, 0.1150], [0.0492, 0.1166], [0.0476, 0.1170]
  ], 'cup_body', mat.body));
  cup.add(lathe([
    [0.0476, 0.1170], [0.0468, 0.1100], [0.0430, 0.0800], [0.0392, 0.0500],
    [0.0352, 0.0250], [0.0330, 0.0185], [0.0300, 0.0155], [0.0000, 0.0150]
  ], 'cup_interior', mat.inner));

  // cream sleeve, slightly proud of the body
  cup.add(lathe([
    [0.0382, 0.0295], [0.0416, 0.0318], [0.0437, 0.0500], [0.0474, 0.0775],
    [0.0489, 0.0828], [0.0489, 0.0852], [0.0456, 0.0858], [0.0382, 0.0295]
  ], 'cup_sleeve', mat.sleeve));

  // coffee surface inside the cup
  const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.0405, 0.0380, 0.004, 64), mat.coffee);
  coffee.name = 'coffee_surface';
  coffee.position.y = 0.070;
  coffee.receiveShadow = true;
  cup.add(coffee);

  // --- lid: three concentric soft-edged rings + oval sip pad ---
  function disc(y0, y1, r, rb, rt) {
    const pts = [[0, y0]];
    const n = 8;
    for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i / n) * (Math.PI / 2); pts.push([r - rb + rb * Math.cos(a), y0 + rb + rb * Math.sin(a)]); }
    for (let i = 0; i <= n; i++) { const a = (i / n) * (Math.PI / 2); pts.push([r - rt + rt * Math.cos(a), y1 - rt + rt * Math.sin(a)]); }
    pts.push([0, y1]);
    return pts;
  }
  const lid = new THREE.Group();
  lid.name = 'cup_lid';
  lid.add(lathe(disc(0.1060, 0.1360, 0.0560, 0.0028, 0.0070), 'lid_flange', mat.lid));
  lid.add(lathe(disc(0.1345, 0.1460, 0.0478, 0.0022, 0.0045), 'lid_step', mat.lid));
  lid.add(lathe(disc(0.1450, 0.1530, 0.0385, 0.0018, 0.0032), 'lid_top', mat.lid));
  // inner plug that seats into the cup mouth
  lid.add(lathe([
    [0.0000, 0.1060], [0.0450, 0.1060], [0.0452, 0.1035], [0.0430, 0.1020], [0.0000, 0.1020]
  ], 'lid_plug', mat.lid));

  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.0150, 0.0155, 0.0040, 72), mat.lid);
  pad.name = 'lid_sip_pad';
  pad.scale.set(1.45, 1, 1);
  pad.position.y = 0.1528;
  pad.rotation.y = 0.42;
  pad.castShadow = pad.receiveShadow = true;
  lid.add(pad);

  const slitMat = new THREE.MeshStandardMaterial({ name: 'lid_slit_shadow', color: '#1d1b1a', roughness: 0.85, metalness: 0.08 });
  const slit = new THREE.Mesh(new THREE.BoxGeometry(0.0026, 0.0030, 0.0165), slitMat);
  slit.name = 'lid_sip_slit';
  slit.position.set(0, 0.1545, 0);
  slit.rotation.y = 0.42;
  lid.add(slit);
  cup.add(lid);

  // --- coffee-bean badge, wrapped onto the sleeve wall ---
  const RX = 0.0104, RY = 0.0182, CREASE = 0.0052;
  const SLEEVE_R = 0.0442, SLEEVE_SLOPE = 0.183, PROUD = 0.0022, TILT = -0.28;
  function lobeGeom(side, dx) {
    const sh = new THREE.Shape();
    if (side === 'left') {
      sh.absellipse(0, 0, RX, RY, Math.PI / 2, 3 * Math.PI / 2, false);
      sh.quadraticCurveTo(CREASE, 0, 0, RY);
    } else {
      sh.absellipse(0, 0, RX, RY, -Math.PI / 2, Math.PI / 2, false);
      sh.quadraticCurveTo(CREASE * 2.1, 0, 0, -RY);
    }
    const g = new THREE.ExtrudeGeometry(sh, {
      depth: 0.0034, bevelEnabled: true, bevelThickness: 0.0013,
      bevelSize: 0.0013, bevelSegments: 3, curveSegments: 48
    });
    const p = g.attributes.position, c = Math.cos(TILT), s = Math.sin(TILT);
    for (let i = 0; i < p.count; i++) {
      const x0 = p.getX(i) + dx, y0 = p.getY(i), z0 = p.getZ(i);
      const x = x0 * c - y0 * s, y = x0 * s + y0 * c;
      const r = SLEEVE_R + SLEEVE_SLOPE * y + PROUD + z0;
      const ang = x / SLEEVE_R;
      p.setXYZ(i, Math.sin(ang) * r, y, Math.cos(ang) * r);
    }
    g.computeVertexNormals();
    return g;
  }
  const badge = new THREE.Group();
  badge.name = 'coffee_bean_badge';
  ['left', 'right'].forEach((side, i) => {
    const lobe = new THREE.Mesh(lobeGeom(side, side === 'left' ? -0.0026 : 0.0026), mat.bean);
    lobe.name = 'bean_lobe_' + (i + 1);
    lobe.castShadow = lobe.receiveShadow = true;
    badge.add(lobe);
  });
  badge.position.set(0, 0.0575, 0);
  cup.add(badge);

  return { cup, lid, badge, coffee, mat };
}

/** A single loose coffee bean: creased ellipsoid, ~22 mm long. */
export function buildBean(THREE, material) {
  const g = new THREE.SphereGeometry(0.011, 28, 20);
  g.scale(0.74, 1, 0.64);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const f = Math.exp(-Math.pow(x / 0.0030, 2));
    p.setZ(i, z * (1 - 0.52 * f));
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.name = 'coffee_bean';
  m.castShadow = m.receiveShadow = true;
  return m;
}

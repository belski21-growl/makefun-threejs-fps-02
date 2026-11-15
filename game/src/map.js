// SPDX-License-Identifier: MIT
// AURORA RELAY — NORTHLIGHT's own map. A 48 x 40 m snowy alpine relay station at
// night: three lanes (west ridge / mid causeway / east dock) split by rock-and-steel
// partitions with door gaps, a frozen pond at mid, two charge sites up north — the
// Beacon relay dish (west) and the Depot fuel store (east). Crates, containers and
// low snow walls are the cover. No real place is copied.
// Waypoints are a graph; edges are kept only when a 2D segment test proves the lane
// between two nodes is clear of colliders, so bots never path through a wall.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const SITES = {
  beacon: { x: -14, z: -12, radius: 4.5, label: 'BEACON' },
  depot: { x: 14, z: -12, radius: 4.5, label: 'DEPOT' },
};

const NODES = [
  [-4, 17], [4, 17], [-4, -17], [4, -17],
  [-18, 14], [-18, 6], [-18, -2], [-18, -10],
  [18, 14], [18, 6], [18, -2], [18, -10],
  [0, 14], [0, 8], [0, 2], [0, -4], [0, -10],
  [-12, 8], [12, 6], [-12, -4], [12, -6],
  [-14, -12], [14, -12], [-6, -12], [6, -12],
  [-20, 0], [20, 0],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of ['snow', 'surface', 'hairline', 'rock', 'muted', 'amber']) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'snow' ? 0.95 : 0.88,
      metalness: name === 'surface' ? 0.25 : 0.04,
    });
  }
  const beaconMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.1,
    emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.35,
  });
  const depotMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.amber), roughness: 0.5, metalness: 0.1,
    emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 0.35,
  });
  const pondMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#9fd8e8'), roughness: 0.15, metalness: 0.55,
  });
  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material] ?? materials.surface);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // Snow floor and perimeter (5 m rock walls, open sky so moonlight reaches in).
  box(48.4, 0.4, 40.4, 0, -0.2, 0, 'snow');
  box(0.4, 5, 40.4, -24.2, 2.5, 0, 'rock');
  box(0.4, 5, 40.4, 24.2, 2.5, 0, 'rock');
  box(48.4, 5, 0.4, 0, 2.5, -20.2, 'rock');
  box(48.4, 5, 0.4, 0, 2.5, 20.2, 'rock');

  // Lane partitions with door gaps — the gaps are the sightlines.
  // West partition x=-8: gaps at z -8..-4 and 4..8.
  box(0.5, 4.4, 12, -8, 2.2, -14, 'hairline');
  box(0.5, 4.4, 8, -8, 2.2, 0, 'hairline');
  box(0.5, 4.4, 10, -8, 2.2, 13, 'hairline');
  // East partition x=+8: gaps at z -12..-8 and 0..4.
  box(0.5, 4.4, 8, 8, 2.2, -16, 'hairline');
  box(0.5, 4.4, 8, 8, 2.2, -4, 'hairline');
  box(0.5, 4.4, 14, 8, 2.2, 11, 'hairline');
  // South cross wall z=+10 with a wide mid door; north cross wall z=-14, mid open.
  box(16, 4.4, 0.5, -16, 2.2, 10, 'hairline');
  box(16, 4.4, 0.5, 16, 2.2, 10, 'hairline');
  box(10, 4.4, 0.5, -19, 2.2, -14, 'hairline');
  box(10, 4.4, 0.5, 19, 2.2, -14, 'hairline');

  // Frozen pond at mid (visual plate, no collider — you walk over the ice).
  const pond = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.06, 24), pondMat);
  pond.position.set(0, 0.03, 2);
  pond.receiveShadow = true;
  group.add(pond);

  // Containers (tall cover) and crates (low cover).
  box(2.4, 2.4, 6, -18, 1.2, -6, 'surface');
  box(2.4, 2.4, 6, 18, 1.2, -6, 'surface');
  box(2.4, 2.4, 6, -18, 1.2, 10, 'surface');
  box(2.4, 2.4, 6, 18, 1.2, 10, 'surface');
  box(1.2, 1.2, 1.2, -3, 0.6, -2, 'hairline');
  box(1.2, 1.2, 1.2, 3, 0.6, -2, 'hairline');
  box(1.2, 1.2, 1.2, -12, 0.6, 2, 'hairline');
  box(1.2, 1.2, 1.2, 12, 0.6, 2, 'hairline');
  box(1.2, 1.2, 1.2, -4, 0.6, 12, 'hairline');
  box(1.2, 1.2, 1.2, 4, 0.6, 12, 'hairline');
  box(1.2, 1.2, 1.2, -20, 0.6, -2, 'hairline');
  box(1.2, 1.2, 1.2, 20, 0.6, -2, 'hairline');
  // Low snow walls near the sites and mid.
  box(3.6, 1.1, 0.6, -8, 0.55, -12, 'snow');
  box(3.6, 1.1, 0.6, 8, 0.55, -12, 'snow');
  box(0.6, 1.1, 3.6, 0, 0.55, -6, 'snow');
  box(0.6, 1.1, 3.6, -14, 0.55, 4, 'snow');
  box(0.6, 1.1, 3.6, 14, 0.55, 4, 'snow');
  // Watchtower legs + platform at mid-south (platform is visual; legs collide).
  box(0.6, 3.2, 0.6, -2, 1.6, 14, 'surface');
  box(0.6, 3.2, 0.6, 2, 1.6, 14, 'surface');
  box(0.6, 3.2, 0.6, -2, 1.6, 17, 'surface');
  box(0.6, 3.2, 0.6, 2, 1.6, 17, 'surface');
  const platform = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.3, 4.4), materials.surface);
  platform.position.set(0, 3.35, 15.5);
  platform.castShadow = true;
  group.add(platform);

  // BEACON site: relay dish on a mast + glowing site plate.
  const beaconPlate = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 7), beaconMat);
  beaconPlate.position.set(SITES.beacon.x, 0.04, SITES.beacon.z);
  beaconPlate.receiveShadow = true;
  group.add(beaconPlate);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 7, 10), materials.surface);
  mast.position.set(SITES.beacon.x - 3, 3.5, SITES.beacon.z - 1.5);
  mast.castShadow = true;
  group.add(mast);
  const dish = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.6, 20, 1, true), materials.muted);
  dish.position.set(SITES.beacon.x - 3, 7.4, SITES.beacon.z - 1.5);
  dish.rotation.x = -0.7;
  dish.castShadow = true;
  group.add(dish);
  const beaconPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 5.6, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 1.2, roughness: 0.4 }),
  );
  beaconPole.position.set(SITES.beacon.x, 2.8, SITES.beacon.z);
  group.add(beaconPole);

  // DEPOT site: fuel tanks + glowing site plate.
  const depotPlate = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 7), depotMat);
  depotPlate.position.set(SITES.depot.x, 0.04, SITES.depot.z);
  depotPlate.receiveShadow = true;
  group.add(depotPlate);
  for (const [tx, tz] of [[11.5, -14.5], [16.5, -14.5]]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 3.2, 16), materials.rock);
    tank.position.set(tx, 1.6, tz);
    tank.castShadow = true;
    tank.receiveShadow = true;
    group.add(tank);
    colliders.push(new THREE.Box3().setFromObject(tank));
    shootables.push(tank);
  }
  const depotPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 5.6, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.amber), emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 1.2, roughness: 0.4 }),
  );
  depotPole.position.set(SITES.depot.x, 2.8, SITES.depot.z);
  group.add(depotPole);

  // Aurora ribbons high in the sky (translucent, slow sway handled by main loop
  // through the returned aurora list) + a star field.
  const aurora = [];
  const ribbonMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.1,
    side: THREE.DoubleSide, depthWrite: false,
  });
  for (let i = 0; i < 3; i += 1) {
    const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(70, 6 + i * 3, 24, 1), ribbonMat);
    // Wave the ribbon so it reads as aurora, not a glass pane.
    const pos = ribbon.geometry.attributes.position;
    for (let v = 0; v < pos.count; v += 1) {
      pos.setY(v, pos.getY(v) + Math.sin(pos.getX(v) * 0.12 + i * 2.1) * 1.6);
    }
    ribbon.geometry.computeVertexNormals();
    ribbon.position.set(-10 + i * 12, 26 + i * 4, -34 - i * 6);
    ribbon.rotation.x = -0.5;
    ribbon.rotation.z = 0.12 * (i - 1);
    group.add(ribbon);
    aurora.push(ribbon);
  }
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(420 * 3);
  for (let i = 0; i < 420; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const r = 55 + Math.random() * 30;
    starPos[i * 3] = Math.cos(a) * r;
    starPos[i * 3 + 1] = 18 + Math.random() * 40;
    starPos[i * 3 + 2] = Math.sin(a) * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdfeaff, size: 0.2, sizeAttenuation: true }));
  group.add(stars);

  // Night lighting: cold moon key, cool hemisphere fill, a soft ambient lift so
  // shadowed wall faces stay readable, warm depot lamps.
  scene.add(new THREE.HemisphereLight(new THREE.Color('#27405e'), new THREE.Color('#0a0f16'), 1.35));
  scene.add(new THREE.AmbientLight(new THREE.Color('#223349'), 0.55));
  const moon = new THREE.DirectionalLight(new THREE.Color('#cfe4ff'), 1.9);
  moon.position.set(-16, 24, 12);
  moon.target.position.set(0, 0, -4);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -30;
  moon.shadow.camera.right = 30;
  moon.shadow.camera.top = 30;
  moon.shadow.camera.bottom = -30;
  moon.shadow.camera.far = 70;
  moon.shadow.bias = -0.0006;
  scene.add(moon, moon.target);
  const beaconLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 16, 16);
  beaconLight.position.set(SITES.beacon.x, 5, SITES.beacon.z);
  scene.add(beaconLight);
  const depotLight = new THREE.PointLight(new THREE.Color(PALETTE.amber), 16, 16);
  depotLight.position.set(SITES.depot.x, 5, SITES.depot.z);
  scene.add(depotLight);

  // Waypoint graph: keep an edge only when the segment clears every collider in 2D.
  function segmentClear(ax, az, bx, bz) {
    const m = 0.5;
    for (const c of colliders) {
      if (c.max.y < 0.3) continue;
      const minX = c.min.x - m;
      const maxX = c.max.x + m;
      const minZ = c.min.z - m;
      const maxZ = c.max.z + m;
      const dx = bx - ax;
      const dz = bz - az;
      let t0 = 0;
      let t1 = 1;
      let ok = true;
      for (const [p, d, lo, hi] of [[ax, dx, minX, maxX], [az, dz, minZ, maxZ]]) {
        if (Math.abs(d) < 1e-9) {
          if (p < lo || p > hi) { ok = false; break; }
        } else {
          let a = (lo - p) / d;
          let b = (hi - p) / d;
          if (a > b) { const t = a; a = b; b = t; }
          if (a > t0) t0 = a;
          if (b < t1) t1 = b;
          if (t0 > t1) { ok = false; break; }
        }
      }
      if (ok) return false;
    }
    return true;
  }

  const nodes = NODES.map(([x, z]) => ({ x, z }));
  const neighbors = nodes.map(() => []);
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      if (dist > 11 || !segmentClear(a.x, a.z, b.x, b.z)) continue;
      neighbors[i].push(j);
      neighbors[j].push(i);
    }
  }

  function nearestNode(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      const d = Math.hypot(nodes[i].x - x, nodes[i].z - z);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // BFS path between node indices.
  function findPath(from, to) {
    if (from === to) return [to];
    const prev = new Array(nodes.length).fill(-1);
    const queue = [from];
    prev[from] = from;
    while (queue.length) {
      const cur = queue.shift();
      for (const n of neighbors[cur]) {
        if (prev[n] !== -1) continue;
        prev[n] = cur;
        if (n === to) {
          const path = [to];
          let c = to;
          while (c !== from) { c = prev[c]; path.unshift(c); }
          return path;
        }
        queue.push(n);
      }
    }
    return [to];
  }

  return {
    colliders,
    shootables,
    group,
    sites: SITES,
    aurora,
    nodes,
    neighbors,
    nearestNode,
    findPath,
    spawns: {
      // Spawn slots sit clear of the lane partitions (x = ±8) — a spawn on a
      // partition line embeds the fighter in the wall and no move ever succeeds.
      raider: [[-4, 17], [0, 17.5], [4, 17], [-6, 16], [6, 16]],
      warden: [[-4, -17], [0, -17.5], [4, -17], [-6, -16], [6, -16]],
    },
  };
}

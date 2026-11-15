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
import { createTextures } from './textures.js';
import { mulberry32 } from './rng.js';

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
  // Procedural textures (seeded, deterministic): snow sparkles on the floor,
  // rock on the perimeter, brushed metal on containers, concrete partitions.
  const tex = createTextures(1337);
  const repTex = (base, x, y) => {
    const t = base.clone();
    t.repeat.set(x, y);
    t.needsUpdate = true;
    return t;
  };
  const std = (map, roughness, metalness, extra = {}) => new THREE.MeshStandardMaterial({
    map, color: 0xffffff, roughness, metalness, ...extra,
  });
  const materials = {
    snow: std(repTex(tex.snow, 12, 10), 0.92, 0.02),
    snowWall: std(repTex(tex.snow, 2, 1), 0.92, 0.02),
    surface: std(repTex(tex.metal, 2, 1), 0.5, 0.6),
    metalSmall: std(repTex(tex.metal, 1, 1), 0.5, 0.6),
    hairline: std(repTex(tex.concrete, 3, 1), 0.9, 0.05),
    rock: std(repTex(tex.rock, 6, 1), 0.95, 0.03),
    muted: std(repTex(tex.metal, 1, 1), 0.6, 0.4),
    amber: new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE.amber), roughness: 0.5, metalness: 0.1,
      emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 0.35,
    }),
  };
  const beaconMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.1,
    emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.35,
  });
  const depotMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.amber), roughness: 0.5, metalness: 0.1,
    emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 0.35,
  });
  const pondMat = new THREE.MeshStandardMaterial({
    map: repTex(tex.ice, 2, 2), color: 0xffffff, roughness: 0.18, metalness: 0.4,
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

  // Visual-only decoration: renders and stops bullets, but never collides and
  // never enters the waypoint graph — the playable layout is unchanged.
  function deco(mesh, shootable = true) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (shootable) shootables.push(mesh);
    return mesh;
  }
  function decoBox(w, h, d, x, y, z, material, ry = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material] ?? materials.surface);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    return deco(mesh);
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
  box(1.2, 1.2, 1.2, -3, 0.6, -2, 'metalSmall');
  box(1.2, 1.2, 1.2, 3, 0.6, -2, 'metalSmall');
  box(1.2, 1.2, 1.2, -12, 0.6, 2, 'metalSmall');
  box(1.2, 1.2, 1.2, 12, 0.6, 2, 'metalSmall');
  box(1.2, 1.2, 1.2, -4, 0.6, 12, 'metalSmall');
  box(1.2, 1.2, 1.2, 4, 0.6, 12, 'metalSmall');
  box(1.2, 1.2, 1.2, -20, 0.6, -2, 'metalSmall');
  box(1.2, 1.2, 1.2, 20, 0.6, -2, 'metalSmall');
  // Low snow walls near the sites and mid.
  box(3.6, 1.1, 0.6, -8, 0.55, -12, 'snowWall');
  box(3.6, 1.1, 0.6, 8, 0.55, -12, 'snowWall');
  box(0.6, 1.1, 3.6, 0, 0.55, -6, 'snowWall');
  box(0.6, 1.1, 3.6, -14, 0.55, 4, 'snowWall');
  box(0.6, 1.1, 3.6, 14, 0.55, 4, 'snowWall');
  // Watchtower legs + platform at mid-south (platform is visual; legs collide).
  box(0.6, 3.2, 0.6, -2, 1.6, 14, 'surface');
  box(0.6, 3.2, 0.6, 2, 1.6, 14, 'surface');
  box(0.6, 3.2, 0.6, -2, 1.6, 17, 'surface');
  box(0.6, 3.2, 0.6, 2, 1.6, 17, 'surface');
  const platform = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.3, 4.4), materials.surface);
  platform.position.set(0, 3.35, 15.5);
  platform.castShadow = true;
  group.add(platform);
  // Railing around the platform + ladder rungs up the south leg (visual).
  const railMat = materials.metalSmall;
  for (const [rx, rz, rw, rd] of [[0, 13.4, 5.4, 0.08], [0, 17.6, 5.4, 0.08], [-2.66, 15.5, 0.08, 4.2], [2.66, 15.5, 0.08, 4.2]]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.08, rd), railMat);
    rail.position.set(rx, 4.45, rz);
    deco(rail, false);
  }
  for (const [px, pz] of [[-2.66, 13.4], [2.66, 13.4], [-2.66, 17.6], [2.66, 17.6]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), railMat);
    post.position.set(px, 3.95, pz);
    deco(post, false);
  }
  for (let i = 0; i < 6; i += 1) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), railMat);
    rung.position.set(2, 0.5 + i * 0.5, 17.35);
    deco(rung, false);
  }

  // BEACON site: relay dish on a mast + glowing site plate.
  const beaconPlate = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 7), beaconMat);
  beaconPlate.position.set(SITES.beacon.x, 0.04, SITES.beacon.z);
  beaconPlate.receiveShadow = true;
  group.add(beaconPlate);
  // Hazard-stripe border framing the Beacon plate.
  const hazardMat = std(repTex(tex.hazard, 6, 1), 0.7, 0.1);
  for (const [bw, bd, bx, bz] of [[9.5, 0.3, 0, -3.65], [9.5, 0.3, 0, 3.65], [0.3, 7, -4.75, 0], [0.3, 7, 4.75, 0]]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.03, bd), hazardMat);
    strip.position.set(SITES.beacon.x + bx, 0.05, SITES.beacon.z + bz);
    strip.receiveShadow = true;
    group.add(strip);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 7, 10), materials.surface);
  mast.position.set(SITES.beacon.x - 3, 3.5, SITES.beacon.z - 1.5);
  mast.castShadow = true;
  group.add(mast);
  const dish = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.6, 20, 1, true), materials.muted);
  dish.position.set(SITES.beacon.x - 3, 7.4, SITES.beacon.z - 1.5);
  dish.rotation.x = -0.7;
  dish.castShadow = true;
  group.add(dish);
  // Dish support struts + feed arm + a small red tip light (visual).
  const strutMat = materials.metalSmall;
  for (const [sx, sz] of [[-1.4, -0.9], [1.4, -0.9], [0, 1.4]]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), strutMat);
    strut.position.set(SITES.beacon.x - 3 + sx * 0.7, 6.4, SITES.beacon.z - 1.5 + sz * 0.7);
    strut.rotation.z = sx * 0.35;
    strut.rotation.x = -sz * 0.25;
    deco(strut, false);
  }
  const feedArm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6), strutMat);
  feedArm.position.set(SITES.beacon.x - 3, 7.4, SITES.beacon.z - 2.6);
  feedArm.rotation.x = 1.1;
  deco(feedArm, false);
  const tipLight = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff5a4e }));
  tipLight.position.set(SITES.beacon.x - 3, 8.6, SITES.beacon.z - 1.5);
  group.add(tipLight);
  const tipGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex.glow, color: 0xff5a4e, transparent: true, opacity: 0.7, depthWrite: false, fog: false,
  }));
  tipGlow.position.copy(tipLight.position);
  tipGlow.scale.setScalar(1.1);
  group.add(tipGlow);
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
  for (const [bw, bd, bx, bz] of [[9.5, 0.3, 0, -3.65], [9.5, 0.3, 0, 3.65], [0.3, 7, -4.75, 0], [0.3, 7, 4.75, 0]]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.03, bd), hazardMat);
    strip.position.set(SITES.depot.x + bx, 0.05, SITES.depot.z + bz);
    strip.receiveShadow = true;
    group.add(strip);
  }
  for (const [tx, tz] of [[11.5, -14.5], [16.5, -14.5]]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 3.2, 16), materials.surface);
    tank.position.set(tx, 1.6, tz);
    tank.castShadow = true;
    tank.receiveShadow = true;
    group.add(tank);
    colliders.push(new THREE.Box3().setFromObject(tank));
    shootables.push(tank);
    // Hazard band around the tank waist (visual).
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.43, 1.43, 0.35, 16, 1, true),
      new THREE.MeshStandardMaterial({ map: repTex(tex.hazard, 8, 1), roughness: 0.7, metalness: 0.1 }));
    band.position.set(tx, 1.6, tz);
    group.add(band);
  }
  // Pipes between the tanks + a valve wheel (visual).
  const pipeMat = materials.metalSmall;
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 5.2, 8), pipeMat);
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(14, 0.7, -14.5);
  deco(pipe);
  const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.4, 8), pipeMat);
  riser.position.set(11.5, 0.7, -13.2);
  deco(riser);
  const valve = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 8, 16), pipeMat);
  valve.position.set(14, 1.5, -13.05);
  deco(valve, false);
  const depotPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 5.6, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.amber), emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 1.2, roughness: 0.4 }),
  );
  depotPole.position.set(SITES.depot.x, 2.8, SITES.depot.z);
  group.add(depotPole);

  // Extra dressing, all visual-only (deco): floodlight poles with real
  // spotlights, edge crates, fuel barrels, a south fence, snow drifts and
  // scattered rocks. Nothing here collides or enters the waypoint graph.
  const floodHeadMat = new THREE.MeshStandardMaterial({
    color: 0xdfe8f0, emissive: 0xcfe4ff, emissiveIntensity: 1.6, roughness: 0.4,
  });
  for (const [px, pz, tx, tz] of [[-20, 6, -8, 0], [20, -6, 8, 0]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.5, 8), materials.metalSmall);
    pole.position.set(px, 2.75, pz);
    deco(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.32), floodHeadMat);
    head.position.set(px, 5.6, pz);
    head.lookAt(tx, 0, tz);
    deco(head, false);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex.glow, color: 0xcfe4ff, transparent: true, opacity: 0.5, depthWrite: false, fog: false,
    }));
    halo.position.set(px, 5.6, pz);
    halo.scale.setScalar(3.2);
    group.add(halo);
    const spot = new THREE.SpotLight(0xd6e6ff, 120, 32, 0.7, 0.6, 1.8);
    spot.position.set(px, 5.6, pz);
    spot.target.position.set(tx, 0, tz);
    scene.add(spot, spot.target);
  }
  decoBox(1.2, 1.2, 1.2, -21.5, 0.6, -16, 'metalSmall', 0.4);
  decoBox(1.2, 1.2, 1.2, 21.5, 0.6, 16, 'metalSmall', -0.3);
  decoBox(1.2, 1.2, 1.2, -21.5, 0.6, 16, 'metalSmall', 0.9);
  decoBox(1.2, 1.2, 1.2, 21.5, 0.6, -16, 'metalSmall', 0.2);
  decoBox(1.2, 1.2, 1.2, -6, 0.6, -18.5, 'metalSmall', 0.5);
  decoBox(1.2, 1.2, 1.2, 6, 0.6, 18.5, 'metalSmall', -0.6);
  for (const [bx, bz] of [[18.5, 14], [-18.5, -14], [10, 18], [-10, -18]]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 14), materials.surface);
    barrel.position.set(bx, 0.55, bz);
    deco(barrel);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.14, 14, 1, true),
      new THREE.MeshStandardMaterial({ map: repTex(tex.hazard, 4, 1), roughness: 0.7, metalness: 0.1 }));
    band.position.set(bx, 0.55, bz);
    group.add(band);
  }
  // South fence: posts + two rails along the spawn wall (visual).
  for (let fx = -20; fx <= 20; fx += 4) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.2, 0.09), materials.metalSmall);
    post.position.set(fx, 0.6, 19);
    deco(post, false);
  }
  for (const ry of [0.5, 1.05]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(40, 0.07, 0.07), materials.metalSmall);
    rail.position.set(0, ry, 19);
    deco(rail, false);
  }
  // Snow drifts against the walls + scattered rocks.
  const driftRng = mulberry32(4242);
  for (let i = 0; i < 10; i += 1) {
    const drift = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6),
      new THREE.MeshStandardMaterial({ map: repTex(tex.snow, 1, 1), color: 0xffffff, roughness: 0.95, metalness: 0 }));
    const alongWall = driftRng() < 0.5;
    const t = -22 + driftRng() * 44;
    drift.position.set(alongWall ? t : (driftRng() < 0.5 ? -22.5 : 22.5), -0.15, alongWall ? (driftRng() < 0.5 ? -18.8 : 18.8) : t);
    drift.scale.set(1.6 + driftRng() * 1.6, 0.35 + driftRng() * 0.25, 1 + driftRng() * 0.8);
    drift.receiveShadow = true;
    group.add(drift);
  }
  for (let i = 0; i < 8; i += 1) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28 + driftRng() * 0.3, 0),
      new THREE.MeshStandardMaterial({ map: repTex(tex.rock, 1, 1), color: 0xffffff, roughness: 0.95, metalness: 0 }));
    const side = driftRng();
    rock.position.set(side < 0.5 ? -22 + driftRng() * 2 : 20 + driftRng() * 2, 0.18, -18 + driftRng() * 36);
    rock.rotation.set(driftRng() * 3, driftRng() * 3, 0);
    deco(rock);
  }

  // Gradient night-sky dome (replaces the flat background colour) + a moon
  // disc with a soft halo. The dome is BackSide, fog-free, renders first.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vDir;
      void main() {
        float h = normalize(vDir).y;
        vec3 horizon = vec3(0.10, 0.20, 0.30);
        vec3 mid = vec3(0.043, 0.086, 0.149);
        vec3 zenith = vec3(0.012, 0.02, 0.045);
        vec3 c = h > 0.12
          ? mix(mid, zenith, smoothstep(0.12, 0.65, h))
          : mix(horizon, mid, smoothstep(-0.05, 0.12, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(150, 24, 16), skyMat);
  skyDome.renderOrder = -1;
  skyDome.frustumCulled = false;
  group.add(skyDome);
  const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(3.4, 32),
    new THREE.MeshBasicMaterial({ color: 0xe9f2ff, fog: false }));
  moonDisc.position.set(-58, 64, -88);
  moonDisc.lookAt(0, 0, 0);
  group.add(moonDisc);
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex.glow, color: 0xbfd8ff, transparent: true, opacity: 0.55, depthWrite: false, fog: false,
  }));
  moonGlow.position.copy(moonDisc.position);
  moonGlow.scale.setScalar(28);
  group.add(moonGlow);

  // Aurora ribbons: a real shader now — flowing bands that shimmer and drift
  // with time (uTime is driven by the main loop through auroraUniforms),
  // additive over the sky. The CPU sway in main.js still applies on top.
  const aurora = [];
  const auroraUniforms = { uTime: { value: 0 } };
  const ribbonMat = new THREE.ShaderMaterial({
    uniforms: auroraUniforms,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    vertexShader: `
      varying vec2 vUv;
      uniform float uTime;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.y += sin(p.x * 0.15 + uTime * 0.22) * 0.9;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      void main() {
        float n = sin(vUv.x * 9.0 + uTime * 0.35 + sin(vUv.x * 23.0 + uTime * 0.23) * 0.9);
        float band = smoothstep(0.05, 0.9, n * 0.5 + 0.5);
        float vfade = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
        // Fade the ribbon ends so it never reads as a hard rectangular card.
        float hfade = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        vec3 col = mix(vec3(0.10, 0.85, 0.55), vec3(0.35, 0.45, 1.0),
          vUv.y * 0.7 + 0.15 * sin(uTime * 0.12));
        gl_FragColor = vec4(col, band * vfade * hfade * 0.42);
      }`,
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
  // Two seeded star layers (deterministic sky) with soft round sprites.
  const starRng = mulberry32(20261115);
  function starLayer(count, size, opacity) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const a = starRng() * Math.PI * 2;
      const r = 95 + starRng() * 40;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 12 + starRng() * 60;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xdfeaff, size, map: tex.flake, transparent: true, opacity,
      depthWrite: false, sizeAttenuation: true, fog: false,
    }));
    stars.frustumCulled = false;
    group.add(stars);
    return stars;
  }
  starLayer(520, 0.55, 0.8);
  starLayer(130, 1.1, 0.95);

  // Night lighting: cold moon key, cool hemisphere fill, a soft ambient lift so
  // shadowed wall faces stay readable, warm depot lamps.
  scene.add(new THREE.HemisphereLight(new THREE.Color('#27405e'), new THREE.Color('#0a0f16'), 1.1));
  scene.add(new THREE.AmbientLight(new THREE.Color('#223349'), 0.55));
  const moon = new THREE.DirectionalLight(new THREE.Color('#cfe4ff'), 2.4);
  // Cool fill from the east so faces turned away from the moon never go
  // near-black (the old "dinding gelap total" problem under ACES).
  const fill = new THREE.DirectionalLight(new THREE.Color('#6f86b8'), 0.6);
  fill.position.set(20, 18, 10);
  scene.add(fill);
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
  const beaconLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 24, 18);
  beaconLight.position.set(SITES.beacon.x, 5, SITES.beacon.z);
  scene.add(beaconLight);
  const depotLight = new THREE.PointLight(new THREE.Color(PALETTE.amber), 24, 18);
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
    auroraUniforms,
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

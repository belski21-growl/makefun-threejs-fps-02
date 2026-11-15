// SPDX-License-Identifier: MIT
// Pooled visual effects: tracers, muzzle sparks, impact puffs, explosions and
// falling snow. Fixed pools, no allocation in the hot loop — a fired effect reuses
// the oldest slot. Snow is two Points clouds (near large flakes, far small ones)
// whose vertices recycle.
import * as THREE from 'three';
import { createTextures } from './textures.js';

const TRACERS = 24;
const SPARKS = 40;
const PUFFS = 12;

export function createEffects(scene) {
  const tex = createTextures(1337);
  // Tracers: thin stretched boxes, one per pool slot, hidden when idle.
  const tracers = [];
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 });
  for (let i = 0; i < TRACERS; i += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 1), tracerMat);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerIdx = 0;

  // Sparks: small points that fly out and fade.
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkVel = new Float32Array(SPARKS * 3);
  const sparkLife = new Float32Array(SPARKS);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    color: 0xffc46b, size: 0.12, transparent: true, opacity: 0.95,
  }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkIdx = 0;

  // Explosion flash: one sphere + one light, reused.
  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0 }),
  );
  blast.visible = false;
  scene.add(blast);
  const blastLight = new THREE.PointLight(0xff8a2a, 0, 18);
  scene.add(blastLight);
  let blastLife = 0;

  // Snow: two layers for depth — near large flakes, far small ones — drifting
  // down inside a 70 x 24 x 70 box around the map, vertices recycled.
  function makeSnow(count, size, opacity) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const speed = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      pos[i * 3] = (Math.random() - 0.5) * 70;
      pos[i * 3 + 1] = Math.random() * 24;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 70;
      speed[i] = 1.2 + Math.random() * 1.8;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xeaf2f8, size, map: tex.flake, transparent: true, opacity,
      depthWrite: false, sizeAttenuation: true,
    }));
    points.frustumCulled = false;
    scene.add(points);
    return { geo, pos, speed, count };
  }
  const snowNear = makeSnow(350, 0.14, 0.85);
  const snowFar = makeSnow(700, 0.06, 0.55);

  // Muzzle flash: one pooled point light + glow sprite, fired at any muzzle
  // (player or bot) and decayed in step().
  const muzzleLight = new THREE.PointLight(0xffc46b, 0, 10, 1.8);
  scene.add(muzzleLight);
  const muzzleSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex.glow, color: 0xffd27a, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  muzzleSprite.scale.setScalar(0.9);
  scene.add(muzzleSprite);
  let muzzleLife = 0;

  // Impact dust: pooled soft sprites that bloom and fade where a bullet
  // strikes a wall — snow dust, not fire.
  const puffs = [];
  for (let i = 0; i < PUFFS; i += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex.puff, transparent: true, opacity: 0, depthWrite: false,
    }));
    sprite.visible = false;
    scene.add(sprite);
    puffs.push({ sprite, life: 0 });
  }
  let puffIdx = 0;

  const tmpMid = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();

  function tracer(from, to) {
    const slot = tracers[tracerIdx];
    tracerIdx = (tracerIdx + 1) % TRACERS;
    tmpDir.subVectors(to, from);
    const len = tmpDir.length();
    if (len < 0.1) return;
    slot.mesh.position.copy(from).addScaledVector(tmpDir, 0.5);
    slot.mesh.lookAt(to);
    slot.mesh.scale.set(1, 1, len);
    slot.mesh.visible = true;
    slot.life = 0.07;
  }

  function burst(pos, count, spread, up) {
    for (let n = 0; n < count; n += 1) {
      const i = sparkIdx;
      sparkIdx = (sparkIdx + 1) % SPARKS;
      sparkPos[i * 3] = pos.x;
      sparkPos[i * 3 + 1] = pos.y;
      sparkPos[i * 3 + 2] = pos.z;
      sparkVel[i * 3] = (Math.random() - 0.5) * spread;
      sparkVel[i * 3 + 1] = Math.random() * up;
      sparkVel[i * 3 + 2] = (Math.random() - 0.5) * spread;
      sparkLife[i] = 0.35 + Math.random() * 0.25;
    }
    sparkGeo.attributes.position.needsUpdate = true;
  }

  function explosion(pos) {
    blast.position.copy(pos);
    blast.visible = true;
    blastLife = 0.5;
    blastLight.position.copy(pos);
    blastLight.position.y += 1;
    blastLight.intensity = 60;
    burst(pos, 24, 7, 5);
  }

  function muzzle(pos) {
    muzzleLight.position.copy(pos);
    muzzleLight.intensity = 26;
    muzzleSprite.position.copy(pos);
    muzzleSprite.material.opacity = 0.9;
    muzzleLife = 0.06;
  }

  function puff(pos) {
    const slot = puffs[puffIdx];
    puffIdx = (puffIdx + 1) % PUFFS;
    slot.sprite.position.copy(pos);
    slot.sprite.scale.setScalar(0.3);
    slot.sprite.material.opacity = 0.55;
    slot.sprite.visible = true;
    slot.life = 0.6;
  }

  function stepSnow(layer, dt) {
    const { pos, speed, count, geo } = layer;
    for (let i = 0; i < count; i += 1) {
      pos[i * 3 + 1] -= speed[i] * dt;
      pos[i * 3] += Math.sin(pos[i * 3 + 1] * 0.7 + i) * dt * 0.4;
      if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = 24;
    }
    geo.attributes.position.needsUpdate = true;
  }

  function step(dt) {
    for (const slot of tracers) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      if (slot.life <= 0) slot.mesh.visible = false;
    }
    let anySpark = false;
    for (let i = 0; i < SPARKS; i += 1) {
      if (sparkLife[i] <= 0) continue;
      anySpark = true;
      sparkLife[i] -= dt;
      sparkPos[i * 3] += sparkVel[i * 3] * dt;
      sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
      sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
      sparkVel[i * 3 + 1] -= 9 * dt;
      if (sparkLife[i] <= 0 || sparkPos[i * 3 + 1] < 0.02) {
        sparkLife[i] = 0;
        sparkPos[i * 3 + 1] = -10;
      }
    }
    if (anySpark) sparkGeo.attributes.position.needsUpdate = true;
    if (blastLife > 0) {
      blastLife -= dt;
      const t = Math.max(0, blastLife / 0.5);
      blast.scale.setScalar(1 + (1 - t) * 6);
      blast.material.opacity = t * 0.75;
      blastLight.intensity = t * 60;
      if (blastLife <= 0) {
        blast.visible = false;
        blastLight.intensity = 0;
      }
    }
    if (muzzleLife > 0) {
      muzzleLife -= dt;
      muzzleLight.intensity = Math.max(0, muzzleLife / 0.06) * 26;
      muzzleSprite.material.opacity = Math.max(0, muzzleLife / 0.06) * 0.9;
      if (muzzleLife <= 0) {
        muzzleLight.intensity = 0;
        muzzleSprite.material.opacity = 0;
      }
    }
    for (const slot of puffs) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      const t = Math.max(0, slot.life / 0.6);
      slot.sprite.scale.setScalar(0.3 + (1 - t) * 0.9);
      slot.sprite.material.opacity = t * 0.55;
      if (slot.life <= 0) slot.sprite.visible = false;
    }
    stepSnow(snowNear, dt);
    stepSnow(snowFar, dt);
  }

  return { tracer, burst, explosion, muzzle, puff, step };
}

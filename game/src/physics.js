// SPDX-License-Identifier: MIT
// Shared body physics: an upright capsule (feet at position.y) moved one axis at a
// time against the world's AABB colliders, so a wall never swallows a fighter.
// Player and bots both step through here. The probe Box3 is reused; nothing is
// allocated per step.
import * as THREE from 'three';

const GRAVITY = 22;

export function createMover(colliders) {
  const probe = new THREE.Box3();

  function overlaps(x, y, z, radius, height, lift) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + height - lift, z + radius);
    for (let i = 0; i < colliders.length; i += 1) {
      if (probe.intersectsBox(colliders[i])) return colliders[i];
    }
    return null;
  }

  // body: { position, velocity, radius, height, onGround }. dt is the fixed step.
  function move(body, dt, wantJump) {
    const { position, velocity } = body;
    if (wantJump && body.onGround) {
      velocity.y = 6.4;
      body.onGround = false;
    }
    velocity.y -= GRAVITY * dt;

    const nx = position.x + velocity.x * dt;
    if (!overlaps(nx, position.y, position.z, body.radius, body.height, 0.04)) position.x = nx;
    else velocity.x = 0;
    const nz = position.z + velocity.z * dt;
    if (!overlaps(position.x, position.y, nz, body.radius, body.height, 0.04)) position.z = nz;
    else velocity.z = 0;

    position.y += velocity.y * dt;
    body.onGround = false;
    const hit = overlaps(position.x, position.y, position.z, body.radius, body.height, 0);
    if (hit && velocity.y <= 0) {
      position.y = hit.max.y;
      velocity.y = 0;
      body.onGround = true;
    } else if (hit) {
      position.y = hit.min.y - body.height;
      velocity.y = 0;
    }
    if (position.y < 0) {
      position.y = 0;
      velocity.y = 0;
      body.onGround = true;
    }
    velocity.y = Math.max(-30, velocity.y);
    return body.onGround;
  }

  return { move, overlaps };
}

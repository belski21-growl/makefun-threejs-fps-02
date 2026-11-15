// SPDX-License-Identifier: MIT
// The player: first-person movement with acceleration, friction, gravity, jump and
// crouch, stepped through the shared mover. Eye height drops when crouched; the
// camera follows body + eye. Recoil is applied to pitch/yaw and recovered by the
// caller through look().
import * as THREE from 'three';

const WALK_SPEED = 4.6;
const CROUCH_SPEED = 2.4;
const ACCEL = 34;
const FRICTION = 10;

export function createPlayer(mover) {
  const state = {
    body: {
      position: new THREE.Vector3(0, 0, 17),
      velocity: new THREE.Vector3(),
      radius: 0.36,
      height: 1.72,
      onGround: true,
    },
    yaw: Math.PI,
    pitch: 0,
    crouched: false,
    eye: 1.62,
  };
  let bobPhase = 0;

  function reset(x, z) {
    state.body.position.set(x, 0, z);
    state.body.velocity.set(0, 0, 0);
    // Yaw 0 faces north (-z), toward the sites: camera forward is
    // (-sin yaw, -cos yaw), so 0 looks down the map, not at the spawn wall.
    state.yaw = 0;
    state.pitch = 0;
    state.crouched = false;
    state.eye = 1.62;
  }

  function look(dx, dy, sens) {
    state.yaw -= dx * sens;
    state.pitch -= dy * sens;
    const limit = Math.PI / 2 - 0.02;
    state.pitch = Math.max(-limit, Math.min(limit, state.pitch));
  }

  function recoil(pitchKick, yawKick) {
    state.pitch += pitchKick;
    state.yaw += yawKick;
    const limit = Math.PI / 2 - 0.02;
    state.pitch = Math.max(-limit, Math.min(limit, state.pitch));
  }

  function step(dt, keys) {
    const wantCrouch = keys.has('ControlLeft') || keys.has('KeyC');
    state.crouched = wantCrouch;
    const targetEye = wantCrouch ? 1.05 : 1.62;
    state.eye += (targetEye - state.eye) * Math.min(1, dt * 12);
    state.body.height = wantCrouch ? 1.15 : 1.72;

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sin = Math.sin(state.yaw);
    const cos = Math.cos(state.yaw);
    // Camera forward on the ground plane is (-sin(yaw), 0, -cos(yaw)).
    let mx = -sin * forward + cos * strafe;
    let mz = -cos * forward - sin * strafe;
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
    }
    const speed = wantCrouch ? CROUCH_SPEED : WALK_SPEED;
    const { velocity } = state.body;
    velocity.x += mx * ACCEL * dt;
    velocity.z += mz * ACCEL * dt;
    // Friction only on the ground plane; gravity is handled by the mover.
    const damp = Math.max(0, 1 - FRICTION * dt);
    velocity.x *= damp;
    velocity.z *= damp;
    const hSpeed = Math.hypot(velocity.x, velocity.z);
    if (hSpeed > speed) {
      velocity.x = (velocity.x / hSpeed) * speed;
      velocity.z = (velocity.z / hSpeed) * speed;
    }
    const wantJump = keys.has('Space');
    mover.move(state.body, dt, wantJump);
    bobPhase += hSpeed * dt * 1.6;
  }

  function groundSpeed() {
    return Math.hypot(state.body.velocity.x, state.body.velocity.z);
  }

  return {
    state,
    reset,
    look,
    recoil,
    step,
    groundSpeed,
    get bobPhase() { return bobPhase; },
  };
}

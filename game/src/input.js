// SPDX-License-Identifier: MIT
// Keyboard + mouse input: WASD movement, Shift walk is the default (tactical pace),
// Space jump, Control/C crouch, mouse look through pointer lock, left button fire,
// right button aim (scoped weapons zoom), R reload, B buy menu, G grenade, E use
// (plant / defuse), 1/2 weapon slots. Look deltas and one-shot keys are consumed
// per fixed step so the sim never sees a stale press twice.
export function createInput(canvas, onLockChange) {
  const state = {
    keys: new Set(),
    firing: false,
    aiming: false,
    locked: false,
  };
  let lookX = 0;
  let lookY = 0;
  const pressed = new Set();

  function onKeyDown(event) {
    if (event.repeat) return;
    state.keys.add(event.code);
    pressed.add(event.code);
    if (event.code === 'Space') event.preventDefault();
  }
  function onKeyUp(event) {
    state.keys.delete(event.code);
  }
  function onMouseMove(event) {
    if (!state.locked) return;
    lookX += event.movementX;
    lookY += event.movementY;
  }
  function onMouseDown(event) {
    if (!state.locked) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.aiming = true;
  }
  function onMouseUp(event) {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.aiming = false;
  }
  function onLock() {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      state.firing = false;
      state.aiming = false;
    }
    onLockChange(state.locked);
  }
  function onContextMenu(event) {
    event.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLock);
  canvas.addEventListener('contextmenu', onContextMenu);

  return {
    state,
    takeLook() {
      const out = { x: lookX, y: lookY };
      lookX = 0;
      lookY = 0;
      return out;
    },
    takePressed() {
      const out = new Set(pressed);
      pressed.clear();
      return out;
    },
    requestLock() {
      // A denied/ungestured lock rejects (headless, permission) — swallow it:
      // the game already hides the overlay and runs without the lock.
      try {
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch { /* ignore */ }
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
  };
}

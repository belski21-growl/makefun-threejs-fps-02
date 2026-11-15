// SPDX-License-Identifier: MIT
// NORTHLIGHT loadout: five original weapons plus a frost frag. Hitscan with
// per-weapon damage, fire rate, spread and recoil; spread grows while moving and
// blooms with every shot, so stopping to aim pays. The viewmodel is a small
// procedural gun (box barrel + sight) parented to the camera — no asset files.
import * as THREE from 'three';

export const WEAPONS = {
  mako: {
    id: 'mako', name: 'Mako P9', kind: 'pistol', price: 0,
    damage: 26, headMult: 3, mag: 12, reserve: 48, auto: false,
    interval: 0.16, reloadTime: 1.1, spread: 0.011, moveSpread: 0.02,
    kick: 0.011, zoom: 1, range: 60,
  },
  tempest: {
    id: 'tempest', name: 'Tempest AR-7', kind: 'rifle', price: 2900,
    damage: 30, headMult: 3, mag: 25, reserve: 75, auto: true,
    interval: 0.115, reloadTime: 2.1, spread: 0.009, moveSpread: 0.026,
    kick: 0.016, zoom: 1, range: 90,
  },
  squall: {
    id: 'squall', name: 'Squall-9', kind: 'smg', price: 1400,
    damage: 21, headMult: 3, mag: 30, reserve: 90, auto: true,
    interval: 0.075, reloadTime: 1.7, spread: 0.016, moveSpread: 0.032,
    kick: 0.011, zoom: 1, range: 55,
  },
  breaker: {
    id: 'breaker', name: 'Breaker-12', kind: 'shotgun', price: 2100,
    damage: 9, headMult: 2, mag: 6, reserve: 24, auto: false,
    interval: 0.85, reloadTime: 2.6, spread: 0.05, moveSpread: 0.05,
    kick: 0.05, zoom: 1, range: 30, pellets: 8,
  },
  glacier: {
    id: 'glacier', name: 'Glacier .338', kind: 'dmr', price: 4800,
    damage: 68, headMult: 3, mag: 10, reserve: 20, auto: false,
    interval: 1.05, reloadTime: 2.8, spread: 0.001, moveSpread: 0.05,
    kick: 0.05, zoom: 3, range: 120, scoped: true,
  },
};

export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;

export function createLoadout(camera) {
  const owned = new Set(['mako']);
  let current = makeSlot(WEAPONS.mako);
  let grenades = 0;
  let bloom = 0;
  let cooldown = 0;
  let reloading = 0;
  let flash = 0;

  // Procedural viewmodel: dark receiver, barrel, sight post, grip. One group,
  // rebuilt per weapon switch (cheap, off the hot path).
  const view = new THREE.Group();
  const flashQuad = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false }),
  );
  camera.add(view);
  view.add(flashQuad);
  // The viewmodel sits close to the camera: shrink it so it reads as a gun in
  // hand, not a wall of dark metal.
  view.scale.setScalar(0.55);

  function buildViewmodel(def) {
    while (view.children.length > 1) {
      const child = view.children[0];
      view.remove(child);
    }
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c222c, roughness: 0.55, metalness: 0.5 });
    const mid = new THREE.MeshStandardMaterial({ color: 0x39465a, roughness: 0.6, metalness: 0.4 });
    const long = def.kind === 'dmr' || def.kind === 'rifle' ? 0.62 : def.kind === 'shotgun' ? 0.55 : 0.34;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, long), dark);
    receiver.position.set(0.22, -0.2, -0.55);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), mid);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.22, -0.19, -0.55 - long / 2 - 0.12);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.05), mid);
    sight.position.set(0.22, -0.12, -0.55);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), dark);
    grip.position.set(0.22, -0.3, -0.38);
    grip.rotation.x = 0.35;
    view.add(receiver, barrel, sight, grip);
    if (def.scoped) {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 10), dark);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0.22, -0.11, -0.6);
      view.add(scope);
    }
    flashQuad.position.set(0.22, -0.19, -0.55 - long / 2 - 0.28);
  }

  function makeSlot(def) {
    return { def, mag: def.mag, reserve: def.reserve };
  }

  buildViewmodel(current.def);

  function spread(moveSpeed, aiming) {
    const base = current.def.spread + current.def.moveSpread * Math.min(1, moveSpeed / 4.6);
    const scoped = aiming && current.def.scoped ? 0.35 : 1;
    return (base + bloom) * scoped;
  }

  function fire() {
    if (cooldown > 0 || reloading > 0 || current.mag <= 0) return false;
    current.mag -= 1;
    cooldown = current.def.interval;
    bloom = Math.min(0.05, bloom + current.def.spread * 0.9);
    flash = 1;
    return true;
  }

  function reload() {
    if (reloading > 0 || current.mag === current.def.mag || current.reserve <= 0) return false;
    reloading = current.def.reloadTime;
    return true;
  }

  function step(dt) {
    cooldown = Math.max(0, cooldown - dt);
    bloom = Math.max(0, bloom - dt * 0.03);
    flash = Math.max(0, flash - dt * 14);
    flashQuad.material.opacity = flash * 0.9;
    if (reloading > 0) {
      reloading -= dt;
      if (reloading <= 0) {
        reloading = 0;
        const need = current.def.mag - current.mag;
        const take = Math.min(need, current.reserve);
        current.mag += take;
        current.reserve -= take;
      }
    }
    // Idle sway of the viewmodel while walking is driven by the caller via bob().
  }

  function bob(amount) {
    view.position.y = Math.sin(amount) * 0.006;
    view.position.x = Math.cos(amount * 0.5) * 0.004;
  }

  return {
    get current() { return current; },
    get grenades() { return grenades; },
    owned(id) { return owned.has(id); },
    buy(id) {
      const def = WEAPONS[id];
      if (!def) return false;
      if (owned.has(id)) {
        current = makeSlot(def);
        return true;
      }
      owned.add(id);
      current = makeSlot(def);
      return true;
    },
    switchTo(id) {
      const def = WEAPONS[id];
      if (!def || !owned.has(id)) return false;
      if (current.def.id === id) return true;
      current = makeSlot(def);
      reloading = 0;
      bloom = 0;
      buildViewmodel(def);
      return true;
    },
    refillAmmo() {
      owned.clear();
      owned.add('mako');
      current = makeSlot(WEAPONS.mako);
      grenades = 0;
      reloading = 0;
      bloom = 0;
      buildViewmodel(current.def);
    },
    buyGrenade() { grenades += 1; },
    useGrenade() {
      if (grenades <= 0) return false;
      grenades -= 1;
      return true;
    },
    fire,
    reload,
    step,
    spread,
    bob,
  };
}

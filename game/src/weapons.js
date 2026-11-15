// SPDX-License-Identifier: MIT
// NORTHLIGHT loadout: five original weapons plus a frost frag. Hitscan with
// per-weapon damage, fire rate, spread and recoil; spread grows while moving and
// blooms with every shot, so stopping to aim pays. The viewmodel is a small
// procedural gun (box barrel + sight) parented to the camera — no asset files.
import * as THREE from 'three';
import { createTextures } from './textures.js';

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

  // Procedural viewmodel: a detailed code-built gun per weapon kind — receiver,
  // barrel with muzzle brake, handguard + rails, magazine, stock, grip, sights
  // (scope on the DMR), charging handle and a glowing sight dot. One group,
  // rebuilt per weapon switch (cheap, off the hot path).
  const view = new THREE.Group();
  const glowTex = createTextures(1337).glow;
  // Small cool fill light riding with the camera so the gun reads at night
  // instead of a black silhouette (viewmodel faces rarely catch the moon).
  const vmLight = new THREE.PointLight(0xcfe0f0, 1.2, 2.5, 2);
  vmLight.position.set(0.3, 0.15, -0.7);
  camera.add(vmLight);
  const flashQuad = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  camera.add(view);
  view.add(flashQuad);
  // The viewmodel sits close to the camera: shrink it so it reads as a gun in
  // hand, not a wall of dark metal.
  view.scale.setScalar(0.55);

  function buildViewmodel(def) {
    // Remove every part except the flash quad (the old loop removed
    // children[0] — the flash quad itself — and left a stale grip behind).
    for (let i = view.children.length - 1; i >= 0; i -= 1) {
      const child = view.children[i];
      if (child !== flashQuad) view.remove(child);
    }
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c222c, roughness: 0.45, metalness: 0.65 });
    const mid = new THREE.MeshStandardMaterial({ color: 0x39465a, roughness: 0.5, metalness: 0.55 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.9, metalness: 0.05 });
    const long = def.kind === 'dmr' ? 0.66 : def.kind === 'rifle' ? 0.6 : def.kind === 'shotgun' ? 0.55 : def.kind === 'smg' ? 0.44 : 0.3;
    const z0 = -0.55;
    const add = (geo, mat, x, y, z, rx = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (rx) m.rotation.x = rx;
      if (rz) m.rotation.z = rz;
      view.add(m);
      return m;
    };
    // Receiver + top rail + ejection port slot.
    add(new THREE.BoxGeometry(0.09, 0.13, long), dark, 0.22, -0.2, z0);
    add(new THREE.BoxGeometry(0.095, 0.02, long * 0.9), mid, 0.22, -0.128, z0);
    add(new THREE.BoxGeometry(0.012, 0.05, 0.16), mid, 0.265, -0.19, z0 + 0.02);
    // Barrel + muzzle brake (wider tip ring).
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), mid, 0.22, -0.19, z0 - long / 2 - 0.12, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.028, 0.028, 0.07, 8), dark, 0.22, -0.19, z0 - long / 2 - 0.26, Math.PI / 2);
    // Handguard (rifles/SMG/shotgun) with side rails.
    if (def.kind !== 'pistol') {
      add(new THREE.BoxGeometry(0.1, 0.1, long * 0.55), mid, 0.22, -0.2, z0 - long * 0.2);
      add(new THREE.BoxGeometry(0.11, 0.02, long * 0.5), dark, 0.22, -0.145, z0 - long * 0.2);
      add(new THREE.BoxGeometry(0.02, 0.02, long * 0.5), dark, 0.165, -0.2, z0 - long * 0.2);
      add(new THREE.BoxGeometry(0.02, 0.02, long * 0.5), dark, 0.275, -0.2, z0 - long * 0.2);
    }
    // Magazine (angled), grip, trigger, stock.
    add(new THREE.BoxGeometry(0.07, def.kind === 'pistol' ? 0.12 : 0.2, 0.1), dark, 0.22, -0.32, z0 + 0.06, def.kind === 'pistol' ? 0.15 : 0.28);
    add(new THREE.BoxGeometry(0.07, 0.16, 0.09), gripMat, 0.22, -0.3, -0.38, 0.35);
    add(new THREE.BoxGeometry(0.015, 0.05, 0.02), dark, 0.22, -0.27, -0.45);
    if (def.kind !== 'pistol') {
      add(new THREE.BoxGeometry(0.08, 0.1, 0.2), dark, 0.22, -0.21, z0 + long / 2 + 0.08);
    }
    // Charging handle on the left side.
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 6), mid, 0.17, -0.17, z0 + 0.1, 0, Math.PI / 2);
    // Sights: front post + rear notch; DMR gets a scope tube instead.
    if (def.scoped) {
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 10), dark, 0.22, -0.11, -0.6, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 10), mid, 0.22, -0.11, -0.68, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6), mid, 0.22, -0.075, -0.6, Math.PI / 2);
    } else {
      add(new THREE.BoxGeometry(0.015, 0.05, 0.03), mid, 0.22, -0.115, z0 - long / 2 + 0.04);
      add(new THREE.BoxGeometry(0.05, 0.04, 0.02), mid, 0.22, -0.115, z0 + long / 2 - 0.06);
    }
    // Glowing sight dot so the aim point reads at night.
    add(new THREE.SphereGeometry(0.008, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x2fe6a8 }), 0.22, -0.1, z0 - long / 2 + 0.04);
    // Foregrip on SMG/rifle, pump on the shotgun.
    if (def.kind === 'smg' || def.kind === 'rifle') {
      add(new THREE.BoxGeometry(0.05, 0.12, 0.06), gripMat, 0.22, -0.29, z0 - long * 0.25, 0.25);
    } else if (def.kind === 'shotgun') {
      add(new THREE.BoxGeometry(0.09, 0.07, 0.2), gripMat, 0.22, -0.24, z0 - long * 0.3);
    }
    flashQuad.position.set(0.22, -0.19, z0 - long / 2 - 0.28);
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

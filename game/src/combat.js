// SPDX-License-Identifier: MIT
// Combat: hitscan shooting, frost-frag grenades and the pulse charge. Hits are
// checked against analytic spheres (head r=0.30, body r=0.52) so the first-person
// player needs no body mesh; a wall hit (three.js raycast against the map's
// shootables) always beats a body hit behind it. Armour absorbs half the damage.
// The charge: carried → planted (4 s hold at a site) → 35 s fuse → detonation or
// defuse (5 s hold). No friendly fire.
import * as THREE from 'three';

const PLANT_SECONDS = 4;
const DEFUSE_SECONDS = 5;
const FUSE_SECONDS = 35;
const GRENADE_FUSE = 1.5;
const GRENADE_RADIUS = 7;

export function createCombat(scene, world, effects, audio, rng, hooks) {
  const fighters = [];
  const raycaster = new THREE.Raycaster();
  const tmpHead = new THREE.Vector3();
  const tmpChest = new THREE.Vector3();
  const tmpHit = new THREE.Vector3();
  const tmpTo = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();
  const grenades = [];

  const bomb = {
    state: 'idle',
    pos: new THREE.Vector3(),
    site: null,
    fuse: FUSE_SECONDS,
    plantProgress: 0,
    defuseProgress: 0,
    carrier: null,
    lastBeep: -1,
  };

  function registerFighter(fighter) {
    fighters.push(fighter);
  }

  function raySphere(origin, dir, center, radius) {
    tmpTo.subVectors(center, origin);
    const tca = tmpTo.dot(dir);
    if (tca < 0) return Infinity;
    const d2 = tmpTo.lengthSq() - tca * tca;
    const r2 = radius * radius;
    if (d2 > r2) return Infinity;
    return tca - Math.sqrt(r2 - d2);
  }

  function wallDistance(origin, dir, range) {
    raycaster.set(origin, dir);
    raycaster.far = range;
    const hits = raycaster.intersectObjects(world.shootables, false);
    return hits.length ? hits[0].distance : Infinity;
  }

  function hasLineOfSight(from, to) {
    tmpTo.subVectors(to, from);
    const dist = tmpTo.length();
    if (dist < 0.01) return true;
    tmpTo.multiplyScalar(1 / dist);
    return wallDistance(from, tmpTo, dist) >= dist - 0.05;
  }

  function applyDamage(victim, damage, attacker, isHead) {
    if (!victim.alive) return;
    const toArmor = Math.min(victim.armor, damage * 0.5);
    victim.armor -= toArmor;
    victim.health -= (damage - toArmor);
    if (victim.isPlayer) hooks.onPlayerHurt();
    if (victim.health > 0) return;
    victim.health = 0;
    victim.alive = false;
    if (victim.group) victim.group.visible = false;
    if (bomb.carrier === victim) {
      bomb.carrier = null;
      bomb.state = 'dropped';
      bomb.pos.copy(victim.pos());
      bomb.pos.y = 0.3;
    }
    hooks.onKill(attacker, victim, isHead);
  }

  function shoot(origin, dir, def, attacker) {
    const pellets = def.pellets ?? 1;
    let hitAny = false;
    effects.muzzle(origin);
    for (let p = 0; p < pellets; p += 1) {
      const spreadDir = tmpDir.copy(dir);
      if (pellets > 1 || def.spread > 0.02) {
        spreadDir.x += (rng.next() * 2 - 1) * def.spread;
        spreadDir.y += (rng.next() * 2 - 1) * def.spread;
        spreadDir.z += (rng.next() * 2 - 1) * def.spread;
        spreadDir.normalize();
      }
      const wall = wallDistance(origin, spreadDir, def.range);
      let bestT = Math.min(wall, def.range);
      let bestVictim = null;
      let bestHead = false;
      for (const fighter of fighters) {
        if (fighter === attacker || !fighter.alive || fighter.team === attacker.team) continue;
        fighter.headPos(tmpHead);
        fighter.chestPos(tmpChest);
        const tHead = raySphere(origin, spreadDir, tmpHead, 0.3);
        const tBody = raySphere(origin, spreadDir, tmpChest, 0.52);
        if (tHead < bestT) { bestT = tHead; bestVictim = fighter; bestHead = true; }
        if (tBody < bestT) { bestT = tBody; bestVictim = fighter; bestHead = false; }
      }
      const end = tmpHit.copy(origin).addScaledVector(spreadDir, bestT);
      effects.tracer(origin, end);
      if (bestVictim) {
        hitAny = true;
        effects.burst(end, 5, 2.5, 2);
        const damage = def.damage * (bestHead ? def.headMult : 1);
        if (attacker.isPlayer) hooks.onPlayerHit(bestVictim, bestHead);
        applyDamage(bestVictim, damage, attacker, bestHead);
      } else if (wall < def.range) {
        effects.burst(end, 4, 2, 1.5);
        effects.puff(end);
      }
    }
    audio.shot(def.kind);
    hooks.onNoise(origin, 26);
    return hitAny;
  }

  function throwGrenade(origin, dir, attacker) {
    const pos = origin.clone();
    const vel = dir.clone().multiplyScalar(15);
    vel.y += 3.5;
    grenades.push({ pos, vel, fuse: GRENADE_FUSE, attacker });
    audio.shot('smg');
  }

  function explodeGrenade(g) {
    effects.explosion(g.pos);
    audio.explosion();
    hooks.onNoise(g.pos, 34);
    for (const fighter of fighters) {
      if (!fighter.alive || fighter === g.attacker) continue;
      const d = fighter.pos().distanceTo(g.pos);
      if (d > GRENADE_RADIUS) continue;
      if (!hasLineOfSight(tmpHead.copy(g.pos).setY(g.pos.y + 0.4), fighter.chestPos(tmpChest))) continue;
      const damage = 95 * (1 - d / GRENADE_RADIUS) + 15;
      applyDamage(fighter, damage, g.attacker, false);
    }
  }

  function setCarrier(fighter) {
    bomb.carrier = fighter;
    bomb.state = 'carried';
    bomb.plantProgress = 0;
    bomb.defuseProgress = 0;
  }

  function setTargetSite(key) {
    bomb.site = key;
  }

  function plantTick(dt, planter) {
    if (bomb.state !== 'carried' || bomb.carrier !== planter || !bomb.site) return false;
    const site = world.sites[bomb.site];
    const p = planter.pos();
    if (Math.hypot(p.x - site.x, p.z - site.z) > site.radius) {
      bomb.plantProgress = 0;
      return false;
    }
    bomb.plantProgress += dt;
    if (Math.floor(bomb.plantProgress * 2) !== Math.floor((bomb.plantProgress - dt) * 2)) audio.plantBeep();
    if (bomb.plantProgress >= PLANT_SECONDS) {
      bomb.state = 'planted';
      bomb.pos.set(site.x, 0.3, site.z);
      bomb.fuse = FUSE_SECONDS;
      bomb.lastBeep = -1;
      bomb.carrier = null;
      hooks.onBombPlanted();
      return true;
    }
    return false;
  }

  function defuseTick(dt, defuser) {
    if (bomb.state !== 'planted') return false;
    bomb.defuseProgress += dt;
    if (bomb.defuseProgress >= DEFUSE_SECONDS) {
      bomb.state = 'defused';
      bomb.defuseProgress = 0;
      hooks.onBombDefused(defuser);
      return true;
    }
    return false;
  }

  function resetBomb() {
    bomb.state = 'idle';
    bomb.site = null;
    bomb.fuse = FUSE_SECONDS;
    bomb.plantProgress = 0;
    bomb.defuseProgress = 0;
    bomb.carrier = null;
    grenades.length = 0;
  }

  function step(dt) {
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.vel.y -= 14 * dt;
      g.pos.addScaledVector(g.vel, dt);
      if (g.pos.y < 0.05) {
        g.pos.y = 0.05;
        g.vel.y = Math.abs(g.vel.y) * 0.45;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      }
      if (g.fuse <= 0) {
        explodeGrenade(g);
        grenades.splice(i, 1);
      }
    }
    if (bomb.state === 'planted') {
      bomb.fuse -= dt;
      const whole = Math.ceil(bomb.fuse);
      if (whole !== bomb.lastBeep && whole <= 10) {
        bomb.lastBeep = whole;
        audio.plantBeep();
      }
      if (bomb.fuse <= 0) {
        bomb.state = 'exploded';
        effects.explosion(bomb.pos);
        audio.explosion();
        for (const fighter of fighters) {
          if (!fighter.alive) continue;
          const d = fighter.pos().distanceTo(bomb.pos);
          if (d < 11) applyDamage(fighter, 400, null, false);
        }
        hooks.onBombExploded();
      }
    }
    if (bomb.state === 'dropped') {
      // A living Raider walking over the dropped charge picks it up.
      for (const fighter of fighters) {
        if (fighter.team !== 'raider' || !fighter.alive) continue;
        if (fighter.pos().distanceTo(bomb.pos) < 1.6) {
          setCarrier(fighter);
          break;
        }
      }
    }
  }

  return {
    fighters,
    bomb,
    registerFighter,
    shoot,
    throwGrenade,
    setCarrier,
    setTargetSite,
    plantTick,
    defuseTick,
    resetBomb,
    step,
    hasLineOfSight,
    PLANT_SECONDS,
    DEFUSE_SECONDS,
  };
}

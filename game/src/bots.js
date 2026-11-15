// SPDX-License-Identifier: MIT
// Bots: 5 Wardens defend the two sites, 4 Raiders attack with the player. Each bot
// is a small procedural humanoid (team-coloured torso, visor head, gun) driven by a
// state machine — push / hold / engage / investigate / plant / defuse / retake /
// guard. Vision is range + view cone + a real line-of-sight raycast (walls block
// sight); hearing is the noise events combat emits. Aim error scales with the
// bot's skill, the target's speed and the distance, and every shot is a burst with
// a reaction delay, so duels are winnable by a player who stops to aim.
import * as THREE from 'three';
import { WEAPONS } from './weapons.js';
import { PALETTE } from './palette.js';

const WARDEN_NAMES = ['Sable', 'Ivo', 'Maren', 'Tove', 'Rurik'];
const RAIDER_NAMES = ['Ash', 'Bram', 'Liv', 'Nils'];
const RAIDER_GUNS = ['tempest', 'squall', 'breaker', 'glacier'];
const WARDEN_GUNS = ['tempest', 'squall', 'tempest', 'glacier', 'squall'];
// Warden hold posts: two at Beacon, two at Depot, one roaming mid.
const WARDEN_POSTS = [
  { x: -12, z: -9 }, { x: -17, z: -14 }, { x: 12, z: -9 }, { x: 17, z: -14 }, { x: 0, z: -4 },
];

export function createBots(scene, world, mover, rng, api) {
  const bots = [];
  const eyeTmp = new THREE.Vector3();
  const targetTmp = new THREE.Vector3();
  const dirTmp = new THREE.Vector3();
  const toTmp = new THREE.Vector3();

  function buildMesh(team) {
    const group = new THREE.Group();
    const suit = new THREE.MeshStandardMaterial({
      color: new THREE.Color(team === 'raider' ? PALETTE.raider : PALETTE.warden),
      roughness: 0.8, metalness: 0.05,
    });
    const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#141a22'), roughness: 0.7, metalness: 0.2 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), suit);
    torso.position.y = 1.08;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), dark);
    head.position.y = 1.58;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.02),
      new THREE.MeshBasicMaterial({ color: team === 'raider' ? 0xffb27a : 0x9fdcff }));
    visor.position.set(0, 1.6, 0.17);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.72, 0.2), dark);
    legL.position.set(-0.14, 0.36, 0);
    const legR = legL.clone();
    legR.position.x = 0.14;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.62), dark);
    gun.position.set(0.2, 1.2, 0.3);
    group.add(torso, head, visor, legL, legR, gun);
    group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
      }
    });
    scene.add(group);
    return { group, torso, head };
  }

  function makeBot(team, index, name, gunId) {
    const { group, torso, head } = buildMesh(team);
    const bot = {
      id: `${team}-${index}`,
      name,
      team,
      alive: true,
      health: 100,
      armor: team === 'warden' ? 50 : 0,
      isPlayer: false,
      body: {
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        radius: 0.36,
        height: 1.72,
        onGround: true,
      },
      group,
      torso,
      head,
      hitMeshes: [torso, head],
      yaw: 0,
      gun: WEAPONS[gunId],
      skill: 0.55 + rng.next() * 0.3,
      state: team === 'warden' ? 'hold' : 'push',
      post: team === 'warden' ? WARDEN_POSTS[index] : null,
      path: [],
      pathIdx: 0,
      pathTarget: -1,
      target: null,
      seenAt: -10,
      reactionAt: 0,
      burstLeft: 0,
      burstTimer: 0,
      thinkTimer: rng.next() * 0.12,
      strafeDir: 1,
      strafeTimer: 0,
      investigatePos: null,
      plantProgress: 0,
      defuseProgress: 0,
      carrier: false,
      speed: 3.4 + rng.next() * 0.6,
      pos() { return this.body.position; },
      headPos(out) { const p = this.body.position; return out.set(p.x, p.y + 1.55, p.z); },
      chestPos(out) { const p = this.body.position; return out.set(p.x, p.y + 1.0, p.z); },
    };
    bots.push(bot);
    return bot;
  }

  WARDEN_NAMES.forEach((name, i) => makeBot('warden', i, name, WARDEN_GUNS[i]));
  RAIDER_NAMES.forEach((name, i) => makeBot('raider', i, name, RAIDER_GUNS[i]));

  function reset() {
    for (const bot of bots) {
      const spawn = world.spawns[bot.team][bots.indexOf(bot) % 5];
      bot.body.position.set(spawn[0], 0, spawn[1]);
      bot.body.velocity.set(0, 0, 0);
      bot.alive = true;
      bot.health = 100;
      bot.armor = bot.team === 'warden' ? 50 : 0;
      bot.group.visible = true;
      bot.state = bot.team === 'warden' ? 'hold' : 'push';
      bot.path = [];
      bot.pathIdx = 0;
      bot.pathTarget = -1;
      bot.target = null;
      bot.burstLeft = 0;
      bot.investigatePos = null;
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      bot.carrier = false;
      bot.yaw = bot.team === 'warden' ? 0 : Math.PI;
      bot.group.position.copy(bot.body.position);
      bot.group.rotation.y = bot.yaw;
    }
  }

  function setPath(bot, x, z) {
    const from = world.nearestNode(bot.body.position.x, bot.body.position.z);
    const to = world.nearestNode(x, z);
    if (to === bot.pathTarget && bot.path.length) return;
    bot.pathTarget = to;
    bot.path = world.findPath(from, to);
    bot.pathIdx = 0;
  }

  function followPath(bot, dt) {
    if (!bot.path.length || bot.pathIdx >= bot.path.length) return true;
    const node = world.nodes[bot.path[bot.pathIdx]];
    const dx = node.x - bot.body.position.x;
    const dz = node.z - bot.body.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.6) {
      bot.pathIdx += 1;
      return bot.pathIdx >= bot.path.length;
    }
    const speed = bot.state === 'engage' ? bot.speed * 0.55 : bot.speed;
    bot.body.velocity.x = (dx / dist) * speed;
    bot.body.velocity.z = (dz / dist) * speed;
    // Mesh front is +z rotated by yaw, so facing (dx, dz) means yaw = atan2(dx, dz).
    bot.yaw = Math.atan2(dx, dz);
    mover.move(bot.body, dt, false);
    return false;
  }

  function canSee(bot, fighter) {
    const eye = bot.headPos(eyeTmp);
    const target = api.fighterEye(fighter, targetTmp);
    const dist = eye.distanceTo(target);
    if (dist > 55) return false;
    toTmp.subVectors(target, eye).normalize();
    const facing = new THREE.Vector3(Math.sin(bot.yaw), 0, Math.cos(bot.yaw));
    // Wide cone up close, narrow at range — a bot notices a sprinting flank.
    const cone = dist < 6 ? -0.2 : 0.25;
    if (facing.dot(toTmp) < cone) return false;
    return api.hasLineOfSight(eye, target);
  }

  function think(bot, dt, elapsed) {
    bot.thinkTimer -= dt;
    if (bot.thinkTimer > 0) return;
    bot.thinkTimer = 0.12;
    if (bot.target && !bot.target.alive) {
      bot.target = null;
      bot.state = bot.team === 'warden' ? 'hold' : 'push';
    }
    // Perception: nearest visible enemy.
    let nearest = null;
    let nearestD = Infinity;
    for (const fighter of api.fighters()) {
      if (fighter.team === bot.team || !fighter.alive) continue;
      const d = bot.body.position.distanceTo(fighter.pos());
      if (d < nearestD && canSee(bot, fighter)) {
        nearest = fighter;
        nearestD = d;
      }
    }
    if (nearest) {
      if (bot.target !== nearest) {
        bot.reactionAt = elapsed + 0.35 + (1 - bot.skill) * 0.5 + rng.next() * 0.25;
      }
      bot.target = nearest;
      bot.seenAt = elapsed;
      bot.state = 'engage';
    } else if (bot.target && elapsed - bot.seenAt > 1.6) {
      bot.target = null;
      bot.state = bot.team === 'warden' ? 'hold' : 'push';
      if (bot.team === 'raider') {
        const site = api.bomb().site ? world.sites[api.bomb().site] : world.sites.beacon;
        setPath(bot, site.x, site.z);
      }
    }

    const bomb = api.bomb();
    if (bot.team === 'warden' && bomb.state === 'planted') {
      bot.state = 'retake';
      setPath(bot, bomb.pos.x, bomb.pos.z);
    } else if (bot.team === 'raider' && bomb.state === 'planted') {
      bot.state = 'guard';
      const site = world.sites[bomb.site];
      setPath(bot, site.x + rng.range(-3, 3), site.z + rng.range(-2, 2));
    }
    if (bot.team === 'warden' && bot.state === 'hold' && bot.post) {
      const d = Math.hypot(bot.body.position.x - bot.post.x, bot.body.position.z - bot.post.z);
      if (d > 0.8) setPath(bot, bot.post.x, bot.post.z);
    }
    if (bot.team === 'raider' && (bot.state === 'push' || bot.state === 'guard') && bomb.site) {
      const site = world.sites[bomb.site];
      const d = Math.hypot(bot.body.position.x - site.x, bot.body.position.z - site.z);
      if (d > site.radius && bot.pathIdx >= bot.path.length) setPath(bot, site.x, site.z);
    }
  }

  function shootAt(bot, dt, elapsed) {
    if (!bot.target || !bot.target.alive) return;
    if (elapsed < bot.reactionAt) return;
    bot.burstTimer -= dt;
    if (bot.burstLeft <= 0) {
      if (bot.burstTimer > 0) return;
      bot.burstLeft = 3 + Math.floor(rng.next() * 3);
      bot.burstTimer = 0.13;
      bot.strafeDir = rng.next() < 0.5 ? -1 : 1;
      bot.strafeTimer = 0.5 + rng.next() * 0.6;
    }
    if (bot.burstTimer > 0) return;
    bot.burstTimer = 0.13;
    bot.burstLeft -= 1;
    const eye = bot.headPos(eyeTmp);
    const target = api.fighterEye(bot.target, targetTmp);
    const dist = eye.distanceTo(target);
    dirTmp.subVectors(target, eye).normalize();
    // Aim error: skill, distance, target speed. A still target at 10 m is easy;
    // a sprinting one at 40 m is not.
    const targetSpeed = bot.target.body ? Math.hypot(bot.target.body.velocity.x, bot.target.body.velocity.z) : 0;
    const err = (1 - bot.skill) * 0.05 + dist * 0.0009 + targetSpeed * 0.006;
    dirTmp.x += (rng.next() * 2 - 1) * err;
    dirTmp.y += (rng.next() * 2 - 1) * err * 0.7;
    dirTmp.z += (rng.next() * 2 - 1) * err;
    dirTmp.normalize();
    // Face the target while firing (mesh front is +z rotated by yaw).
    bot.yaw = Math.atan2(dirTmp.x, dirTmp.z);
    api.shoot(eye, dirTmp, bot.gun, bot);
  }

  function stepBot(bot, dt, elapsed) {
    if (!bot.alive) return;
    think(bot, dt, elapsed);
    const bomb = api.bomb();

    if (bot.state === 'engage' && bot.target && bot.target.alive) {
      // Strafe while duelling, keep the target in the view cone.
      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) {
        bot.strafeDir *= -1;
        bot.strafeTimer = 0.5 + rng.next() * 0.7;
      }
      const eye = bot.headPos(eyeTmp);
      const target = api.fighterEye(bot.target, targetTmp);
      dirTmp.subVectors(target, eye).normalize();
      const strafe = new THREE.Vector3(-dirTmp.z, 0, dirTmp.x).multiplyScalar(bot.strafeDir * 1.6);
      bot.body.velocity.x = strafe.x;
      bot.body.velocity.z = strafe.z;
      bot.yaw = Math.atan2(dirTmp.x, dirTmp.z);
      mover.move(bot.body, dt, false);
      shootAt(bot, dt, elapsed);
    } else if (bot.state === 'plant' || (bot.carrier && bomb.state === 'carried' && bomb.site)) {
      const site = world.sites[bomb.site];
      const d = Math.hypot(bot.body.position.x - site.x, bot.body.position.z - site.z);
      if (d > 1.5) {
        setPath(bot, site.x, site.z);
        followPath(bot, dt);
      } else {
        bot.body.velocity.set(0, 0, 0);
        if (api.plantBomb(bot, dt)) bot.state = 'guard';
      }
    } else if (bot.state === 'retake' && bomb.state === 'planted') {
      const d = Math.hypot(bot.body.position.x - bomb.pos.x, bot.body.position.z - bomb.pos.z);
      if (d > 2) {
        followPath(bot, dt);
      } else {
        // Defuse only when no living Raider is near the site.
        const raidersNear = api.fighters().some((f) => f.team === 'raider' && f.alive
          && Math.hypot(f.pos().x - bomb.pos.x, f.pos().z - bomb.pos.z) < 12);
        if (!raidersNear) api.defuseBomb(bot, dt);
      }
    } else if (bot.state === 'investigate' && bot.investigatePos) {
      const d = Math.hypot(bot.body.position.x - bot.investigatePos.x, bot.body.position.z - bot.investigatePos.z);
      if (d < 1.2) {
        bot.state = bot.team === 'warden' ? 'hold' : 'push';
        bot.investigatePos = null;
      } else {
        setPath(bot, bot.investigatePos.x, bot.investigatePos.z);
        followPath(bot, dt);
      }
    } else if (bot.state === 'guard') {
      // Hold near the planted site; small shuffle between nearby nodes.
      if (bot.pathIdx >= bot.path.length && rng.next() < 0.002) {
        const site = world.sites[bomb.site];
        setPath(bot, site.x + rng.range(-4, 4), site.z + rng.range(-3, 3));
      }
      followPath(bot, dt);
    } else {
      followPath(bot, dt);
    }

    // Carrier bookkeeping: a Raider bot that picks the dropped charge up plants it.
    if (bot.carrier && bot.team === 'raider' && bomb.state === 'carried' && bomb.carrier === bot) {
      bot.state = 'plant';
    }
    bot.group.position.copy(bot.body.position);
    bot.group.rotation.y = bot.yaw;
  }

  function stepAll(dt, elapsed) {
    for (const bot of bots) stepBot(bot, dt, elapsed);
  }

  function onNoise(pos, radius, now) {
    for (const bot of bots) {
      if (!bot.alive || bot.state === 'engage') continue;
      const d = Math.hypot(bot.body.position.x - pos.x, bot.body.position.z - pos.z);
      if (d > radius) continue;
      if (bot.team === 'warden' && bot.state === 'hold' && rng.next() < 0.6) {
        bot.state = 'investigate';
        bot.investigatePos = { x: pos.x, z: pos.z };
        bot.path = [];
      }
    }
  }

  function aliveCount(team) {
    let n = 0;
    for (const bot of bots) if (bot.team === team && bot.alive) n += 1;
    return n;
  }

  return { bots, reset, stepAll, onNoise, aliveCount };
}

// SPDX-License-Identifier: MIT
// NORTHLIGHT boot and loop: a fixed 60 Hz simulation feeding a render at the
// display rate. Wires the map, player, loadout, bots, combat, match and HUD
// together, and nothing else lives here. The player is a Raider: they carry the
// pulse charge and plant it at Beacon or Depot while Wardens defend. ?shot=start|
// play|end&seed=N stages a deterministic frame for a capture, renders it twice,
// freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { makeRng } from './rng.js';
import { createMover } from './physics.js';
import { createWorld } from './map.js';
import { createPlayer } from './player.js';
import { createLoadout } from './weapons.js';
import { createBots } from './bots.js';
import { createCombat } from './combat.js';
import { createMatch, BUY_SECONDS } from './rounds.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createPost } from './post.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const qualityLow = params.get('quality') === 'low';
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const rng = makeRng(seed);
const errors = [];

window.addEventListener('error', (event) => {
  const message = String(event.message || event.error || 'error');
  errors.push(message);
  window.__shotError = message;
});

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !qualityLow;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 35, 85);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

// Post pipeline (bloom + ACES composite + vignette/grain). The composer owns
// the tone curve, so the renderer runs un-tonemapped in that path; ?quality=low
// skips the composer and renders straight to the canvas with ACES on.
const post = qualityLow ? null : createPost(renderer, scene, camera);
if (qualityLow) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
} else {
  renderer.toneMapping = THREE.NoToneMapping;
  const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
  post.setSize(buf.x, buf.y, 1);
}
function renderFrame() {
  if (post) post.render();
  else renderer.render(scene, camera);
}

const world = createWorld(scene);
const mover = createMover(world.colliders);
const player = createPlayer(mover);
const loadout = createLoadout(camera);
const effects = createEffects(scene);
const audio = createAudio();

const playerFighter = {
  id: 'you',
  name: 'You',
  team: 'raider',
  alive: true,
  health: 100,
  armor: 0,
  isPlayer: true,
  body: player.state.body,
  hitMeshes: [],
  pos() { return player.state.body.position; },
  headPos(out) { const p = player.state.body.position; return out.set(p.x, p.y + player.state.eye, p.z); },
  chestPos(out) { const p = player.state.body.position; return out.set(p.x, p.y + player.state.eye - 0.55, p.z); },
};

// The pulse charge: a small glowing case that rides with its carrier, drops where
// its carrier falls, and sits on the site once planted.
const chargeMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.42, 0.3, 0.3),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 1.4, roughness: 0.4 }),
);
chargeMesh.visible = false;
scene.add(chargeMesh);

const combat = createCombat(scene, world, effects, audio, rng, {
  onPlayerHit(victim, isHead) {
    hud.hitMarker(false);
    audio.hit();
  },
  onPlayerHurt() {
    hud.damageFlash();
    audio.hurt();
  },
  onPlayerDown() {
    hud.setSpectate(true);
    hud.showBanner('You are down', 'Your squad fights on — the charge may still go off.', 3000);
  },
  onKill(attacker, victim, headshot) {
    const attackerName = !attacker ? 'Charge' : attacker.isPlayer ? 'You' : attacker.name;
    hud.killfeed(attackerName, victim.isPlayer ? 'You' : victim.name, headshot);
    if (attacker && attacker.isPlayer) {
      match.addKillReward();
      audio.kill();
      hud.hitMarker(true, 220);
    }
  },
  onNoise(pos, radius) {
    bots.onNoise(pos, radius, elapsed);
  },
  onBombPlanted() {
    hud.bombStatus('CHARGE PLANTED — DEFEND THE SITE', 'planted');
    hud.showBanner('Charge planted', 'Hold the site until it detonates.', 3000);
  },
  onBombDefused(defuser) {
    hud.bombStatus('', '');
    hud.showBanner('Charge defused', `${defuser.isPlayer ? 'You defused' : `${defuser.name} defused`} the charge.`, 3000);
  },
  onBombExploded() {
    hud.bombStatus('', '');
  },
});

const bots = createBots(scene, world, mover, rng, {
  fighters: () => combat.fighters,
  fighterEye(fighter, out) {
    if (fighter.isPlayer) {
      const p = fighter.body.position;
      return out.set(p.x, p.y + player.state.eye, p.z);
    }
    const p = fighter.body.position;
    return out.set(p.x, p.y + 1.55, p.z);
  },
  shoot: (origin, dir, def, bot) => combat.shoot(origin, dir, def, bot),
  bomb: () => combat.bomb,
  plantBomb: (bot, dt) => combat.plantTick(dt, bot),
  defuseBomb: (bot, dt) => combat.defuseTick(dt, bot),
  hasLineOfSight: (from, to) => combat.hasLineOfSight(from, to),
});

// Register every fighter for hitscan: the bots themselves, plus the player
// (analytic spheres in combat.shoot, no body mesh — this is a first-person view).
for (const bot of bots.bots) combat.registerFighter(bot);
combat.registerFighter(playerFighter);

const match = createMatch({
  onRoundStart(round) {
    resetRound();
    document.getElementById('round-num').textContent = `ROUND ${round}`;
    hud.showBanner(`Round ${round}`, round === 1 ? 'Plant the charge at Beacon or Depot. First to 4 rounds.' : 'Buy up — B opens the shop.', 2600);
  },
  onLiveStart() {
    hud.hideBanner();
  },
  onRoundEnd(winner, reason) {
    const won = winner === 'raider';
    hud.showBanner(won ? 'Round won' : 'Round lost', reason, 3800);
    if (won) audio.roundWin();
    else audio.roundLose();
    hud.setSpectate(false);
  },
  onMatchEnd(winner) {
    hud.showMatchEnd(winner, match.state.score);
  },
});

const hud = createHud({
  onBuy(id) {
    if (match.state.phase !== 'buy') return;
    if (id === 'grenade') {
      if (!match.buyGrenade()) { audio.denied(); return; }
      loadout.buyGrenade();
    } else if (id === 'armor') {
      if (!match.buyArmor()) { audio.denied(); return; }
      playerFighter.armor = 100;
    } else {
      if (!match.buyWeapon(id)) { audio.denied(); return; }
      loadout.buy(id);
      loadout.switchTo(id);
    }
    audio.buy();
    hud.setMoney(match.state.money);
    hud.setAmmo(loadout.current.mag, loadout.current.reserve, loadout.current.def.name, loadout.grenades);
  },
  onBuyClose() {
    closeBuy();
  },
});

const input = createInput(renderer.domElement, onLockChange);

const raycaster = new THREE.Raycaster();
raycaster.far = 100;
const shootDir = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const camDir = new THREE.Vector3();

let elapsed = 0;
let stepCount = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let dryTimer = 0;
let spectateBot = null;

function pickSite() {
  return rng.pick(['beacon', 'depot']);
}

function resetRound() {
  // Player takes the fifth Raider spawn; the four Raider bots take slots 0-3.
  const spawn = world.spawns.raider[4];
  player.reset(spawn[0], spawn[1]);
  playerFighter.alive = true;
  playerFighter.health = 100;
  playerFighter.armor = 0;
  loadout.refillAmmo();
  loadout.switchTo('mako');
  combat.resetBomb();
  bots.reset();
  // The player carries the charge; the target site is drawn per round.
  const site = pickSite();
  combat.setTargetSite(site);
  combat.setCarrier(playerFighter);
  spectateBot = null;
  hud.setSpectate(false);
  hud.setDefuse(null);
  hud.bombStatus(`PLANT THE CHARGE AT ${world.sites[site].label}`, '');
  hud.setHealth(100, 0);
  hud.setAmmo(loadout.current.mag, loadout.current.reserve, loadout.current.def.name, 0);
  hud.setMoney(match.state.money);
}

function openBuy() {
  if (match.state.phase !== 'buy') return;
  match.setBuyOpen(true);
  hud.showBuy(match.state.money);
  input.releaseLock();
}

function closeBuy() {
  match.setBuyOpen(false);
  hud.hideBuy();
  if (started && match.state.phase !== 'matchEnd') input.requestLock();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    if (match.state.phase === 'lobby') match.startMatch();
  } else if (match.state.phase === 'live' && !match.state.buyOpen && playerFighter.alive && match.state.phase !== 'matchEnd') {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  // Hide the overlay here, not only on pointer lock: a failed lock (headless,
  // permissions) must never leave the start screen over a live round.
  hud.hideOverlay();
  if (match.state.phase === 'matchEnd') {
    match.startMatch();
    input.requestLock();
    return;
  }
  if (match.state.phase === 'lobby') match.startMatch();
  input.requestLock();
});

// Clicking the game re-locks the pointer after Esc or a failed lock.
renderer.domElement.addEventListener('click', () => {
  if (shot) return;
  if (match.state.phase !== 'live' && match.state.phase !== 'buy') return;
  if (match.state.buyOpen) return;
  if (!input.state.locked) input.requestLock();
});

function syncCamera() {
  if (!playerFighter.alive && spectateBot && spectateBot.alive) {
    const p = spectateBot.body.position;
    camera.position.set(p.x, p.y + 1.55, p.z);
    // Camera forward is the opposite of a mesh's +z front at the same yaw.
    camera.rotation.set(0, spectateBot.yaw + Math.PI, 0, 'YXZ');
    return;
  }
  camera.position.set(player.state.body.position.x, player.state.body.position.y + player.state.eye, player.state.body.position.z);
  camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
}

function playerShoot() {
  const def = loadout.current.def;
  if (!loadout.fire()) {
    if (dryTimer <= 0) {
      audio.dryFire();
      dryTimer = 0.25;
    }
    return;
  }
  camera.getWorldDirection(camDir);
  const spread = loadout.spread(player.groundSpeed(), input.state.aiming && def.scoped);
  shootDir.copy(camDir);
  shootDir.x += (rng.next() * 2 - 1) * spread;
  shootDir.y += (rng.next() * 2 - 1) * spread;
  shootDir.z += (rng.next() * 2 - 1) * spread;
  shootDir.normalize();
  muzzle.copy(camera.position).addScaledVector(camDir, 0.6);
  combat.shoot(muzzle, shootDir, def, playerFighter);
  player.recoil(def.kick * (0.9 + rng.next() * 0.2), (rng.next() * 2 - 1) * def.kick * 0.35);
}

function step(dt) {
  elapsed += dt;
  stepCount += 1;
  dryTimer = Math.max(0, dryTimer - dt);
  const phase = match.state.phase;
  const live = phase === 'live';
  const frozenPhase = phase === 'buy' || phase === 'result' || phase === 'matchEnd' || phase === 'lobby';

  // You can walk during the buy phase (Counter-Strike lets you); shooting and
  // reloading only once the round is live.
  if (playerFighter.alive && (live || phase === 'buy')) {
    const look = input.takeLook();
    const sens = input.state.aiming && loadout.current.def.scoped ? 0.0011 : 0.0022;
    player.look(look.x, look.y, sens);
    player.step(dt, input.state.keys);
    if (live && input.state.firing) playerShoot();
    if (live && input.state.keys.has('KeyR') && loadout.reload()) audio.reload();
  } else {
    input.takeLook();
  }
  loadout.step(dt);
  loadout.bob(player.bobPhase);

  // Aim zoom for the scoped DMR.
  const wantFov = input.state.aiming && loadout.current.def.scoped && playerFighter.alive ? 74 / loadout.current.def.zoom : 74;
  if (Math.abs(camera.fov - wantFov) > 0.1) {
    camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
  }

  // One-shot keys.
  const pressed = input.takePressed();
  if (pressed.has('KeyB')) {
    if (match.state.buyOpen) closeBuy();
    else if (phase === 'buy') openBuy();
  }
  if (pressed.has('Digit1') && live && playerFighter.alive) {
    const primary = ['tempest', 'squall', 'breaker', 'glacier'].find((id) => loadout.owned(id));
    if (primary) loadout.switchTo(primary);
  }
  if (pressed.has('Digit2') && live && playerFighter.alive) loadout.switchTo('mako');
  if (pressed.has('KeyG') && live && playerFighter.alive && loadout.grenades > 0) {
    camera.getWorldDirection(camDir);
    muzzle.copy(camera.position).addScaledVector(camDir, 0.6);
    if (loadout.useGrenade()) combat.throwGrenade(muzzle, camDir, playerFighter);
  }

  if (live) bots.stepAll(dt, elapsed);
  if (live || phase === 'result') combat.step(dt);
  effects.step(dt);

  // Plant: hold E at the target site while carrying the charge.
  if (live && playerFighter.alive && combat.bomb.state === 'carried' && combat.bomb.carrier === playerFighter) {
    const site = world.sites[combat.bomb.site];
    const d = Math.hypot(playerFighter.pos().x - site.x, playerFighter.pos().z - site.z);
    if (d < site.radius && input.state.keys.has('KeyE')) {
      combat.plantTick(dt, playerFighter);
    } else {
      combat.bomb.plantProgress = 0;
    }
  }

  // Defuse: hold E near the planted charge (a Raider can only watch).
  if (live && playerFighter.alive && combat.bomb.state === 'planted') {
    const d = playerFighter.pos().distanceTo(combat.bomb.pos);
    if (d < 2.5 && input.state.keys.has('KeyE')) {
      combat.defuseTick(dt, playerFighter);
      hud.setDefuse(combat.bomb.defuseProgress / 5);
    } else {
      combat.bomb.defuseProgress = 0;
      hud.setDefuse(null);
    }
  } else {
    hud.setDefuse(null);
  }

  if (!playerFighter.alive && !spectateBot) {
    spectateBot = bots.bots.find((b) => b.team === 'raider' && b.alive) ?? null;
  }

  match.step(dt, {
    raiderAlive: (playerFighter.alive ? 1 : 0) + bots.aliveCount('raider'),
    wardenAlive: bots.aliveCount('warden'),
    playerAlive: playerFighter.alive,
    bombState: combat.bomb.state,
  });

  // Charge mesh follows its carrier / drop / planted spot.
  if (combat.bomb.state === 'carried' && combat.bomb.carrier) {
    const p = combat.bomb.carrier.pos();
    chargeMesh.visible = true;
    chargeMesh.position.set(p.x, p.y + 1.0, p.z);
    chargeMesh.rotation.y = elapsed * 0.8;
  } else if (combat.bomb.state === 'dropped' || combat.bomb.state === 'planted') {
    chargeMesh.visible = true;
    chargeMesh.position.copy(combat.bomb.pos);
    chargeMesh.position.y = 0.35;
  } else {
    chargeMesh.visible = false;
  }

  // Aurora ribbons drift slowly; the shader bands flow with the same clock.
  for (let i = 0; i < world.aurora.length; i += 1) {
    world.aurora[i].rotation.z = 0.12 * (i - 1) + Math.sin(elapsed * 0.05 + i * 2) * 0.03;
  }
  if (world.auroraUniforms) world.auroraUniforms.uTime.value = elapsed;

  // HUD (cached writes — unchanged values never touch the DOM).
  hud.setHealth(playerFighter.health, playerFighter.armor);
  hud.setAmmo(loadout.current.mag, loadout.current.reserve, loadout.current.def.name, loadout.grenades);
  hud.setMoney(match.state.money);
  hud.setTimer(match.state.phaseLeft, phase);
  hud.setScore(match.state.score.raider, match.state.score.warden, match.state.round);
  const spreadPx = 3 + loadout.spread(player.groundSpeed(), input.state.aiming) * 900;
  hud.setCrosshairSpread(spreadPx);
  if (combat.bomb.state === 'planted') {
    hud.bombStatus(`CHARGE PLANTED — ${Math.max(0, combat.bomb.fuse).toFixed(0)}s`, 'planted');
  } else if (combat.bomb.state === 'carried' && combat.bomb.carrier === playerFighter) {
    hud.bombStatus(`PLANT THE CHARGE AT ${world.sites[combat.bomb.site].label}`, '');
  }
  if (frozenPhase) {
    // Keep the sim still during buy / result so the scene holds for the player.
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderFrame();
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const p = player.state.body.position;
  const dx = point.x - p.x;
  const dy = point.y - (p.y + player.state.eye);
  const dz = point.z - p.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  player.state.yaw = Math.atan2(-dx, -dz);
  player.state.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderFrame();
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  match.startMatch();
  if (name === 'start') {
    // Buy phase, camera inside the west lane looking at the Beacon dish and
    // its glowing site plate under the aurora, buy menu open.
    player.reset(-13, -5);
    settle(30);
    aimAt(new THREE.Vector3(-17, 5, -13.5));
    hud.hideBanner();
    hud.showBuy(match.state.money);
    hud.setScore(0, 0, 1);
    hud.setTimer(BUY_SECONDS, 'buy');
  } else if (name === 'play') {
    match.state.phase = 'live';
    match.state.phaseLeft = 83;
    match.state.score = { raider: 1, warden: 0 };
    match.state.round = 2;
    match.state.money = 3250;
    // Stage a firefight on the mid causeway: player behind the pond, a Warden
    // crossing the north gap.
    player.reset(-2, 8);
    const warden = bots.bots.find((b) => b.team === 'warden');
    warden.body.position.set(2, 0, -6);
    warden.group.position.set(2, 0, -6);
    warden.yaw = 0;
    settle(10);
    loadout.buy('tempest');
    loadout.switchTo('tempest');
    aimAt(new THREE.Vector3(2, 1.2, -6));
    playerShoot();
    settle(8);
    aimAt(new THREE.Vector3(2.4, 1.1, -6));
    playerShoot();
    settle(8);
    hud.hideBanner();
    hud.setHealth(100, 0);
  } else {
    // end: charge planted at Beacon, player guarding the site as a Warden
    // pushes in from the east gap, score 2-1.
    match.state.phase = 'live';
    match.state.phaseLeft = 61;
    match.state.score = { raider: 2, warden: 1 };
    match.state.round = 4;
    match.state.money = 4100;
    combat.bomb.state = 'planted';
    combat.bomb.site = 'beacon';
    combat.bomb.pos.set(-14, 0.3, -12);
    combat.bomb.fuse = 22;
    combat.bomb.carrier = null;
    player.reset(-6, -8);
    settle(10);
    const warden = bots.bots.find((b) => b.team === 'warden' && b.name === 'Maren');
    warden.body.position.set(-4, 0, -12);
    warden.group.position.set(-4, 0, -12);
    warden.yaw = 0;
    aimAt(new THREE.Vector3(-4, 1.2, -12));
    hud.showBanner('Charge planted', 'Hold the site until it detonates.', 60000);
    loadout.buy('tempest');
    loadout.switchTo('tempest');
    hud.setAmmo(loadout.current.mag, loadout.current.reserve, loadout.current.def.name, loadout.grenades);
  }
  syncCamera();
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (post) {
    const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
    post.setSize(buf.x, buf.y, 1);
  }
});

// Debug handle for smoke tests: phase, score, money, player position, captured errors.
window.__nl = {
  get phase() { return match.state.phase; },
  get score() { return { ...match.state.score }; },
  get money() { return match.state.money; },
  get pos() { const p = player.state.body.position; return [p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2)]; },
  get vel() { const v = player.state.body.velocity; return [v.x.toFixed(2), v.y.toFixed(2), v.z.toFixed(2)]; },
  get steps() { return stepCount; },
  get keys() { return [...input.state.keys]; },
  get alive() { return { raider: (playerFighter.alive ? 1 : 0) + bots.aliveCount('raider'), warden: bots.aliveCount('warden') }; },
  get errors() { return errors; },
};

syncCamera();
hud.showOverlay('start');
if (shot) runShot(shot);
else requestAnimationFrame(frame);

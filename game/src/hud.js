// SPDX-License-Identifier: MIT
// The HUD: health/armour, ammo, money, timer, score, killfeed, crosshair that
// widens with spread, hitmarker, damage vignette, round banner, charge status,
// defuse bar, buy menu and the start/pause/match-end overlays. Writes are cached —
// an unchanged value never touches the DOM.
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';

const BUY_ITEMS = [
  ['tempest', 'Tempest AR-7 — rifle'],
  ['squall', 'Squall-9 — SMG'],
  ['breaker', 'Breaker-12 — shotgun'],
  ['glacier', 'Glacier .338 — scoped DMR'],
  ['grenade', 'Frost frag grenade'],
  ['armor', 'Kevlar vest'],
];

export function createHud(hooks) {
  const $ = (id) => document.getElementById(id);
  const cache = {};
  let bannerTimer = 0;
  let hitTimer = 0;
  let damageTimer = 0;

  function setText(id, value) {
    if (cache[id] === value) return;
    cache[id] = value;
    const el = $(id);
    if (el) el.textContent = value;
  }

  function buildBuy() {
    const menu = $('buy-menu');
    const list = $('buy-list');
    list.innerHTML = '';
    for (const [id, label] of BUY_ITEMS) {
      const price = id === 'grenade' ? GRENADE_PRICE : id === 'armor' ? ARMOR_PRICE : WEAPONS[id].price;
      const row = document.createElement('div');
      row.className = 'buy-row';
      row.innerHTML = `<button data-buy="${id}">${label}</button><span class="buy-price">$${price}</span>`;
      list.appendChild(row);
    }
    menu.addEventListener('click', (event) => {
      const button = event.target.closest('[data-buy]');
      if (!button) return;
      hooks.onBuy(button.dataset.buy);
    });
    $('buy-close').addEventListener('click', () => hooks.onBuyClose());
  }
  buildBuy();

  function showOverlay(kind) {
    const overlay = $('overlay');
    overlay.classList.remove('hidden');
    if (kind === 'start') {
      $('overlay-title').textContent = 'NORTHLIGHT';
      $('overlay-sub').textContent = 'Aurora Relay — Raiders plant the pulse charge at Beacon or Depot. Wardens hold the sites. First to 4 rounds.';
      $('play-btn').textContent = 'CLICK TO PLAY';
    } else {
      $('overlay-title').textContent = 'PAUSED';
      $('overlay-sub').textContent = 'Click to resume. B opens the buy menu during the buy phase.';
      $('play-btn').textContent = 'RESUME';
    }
    $('match-end').classList.add('hidden');
  }

  function hideOverlay() {
    $('overlay').classList.add('hidden');
  }

  function showMatchEnd(winner, score) {
    hideOverlay();
    const panel = $('match-end');
    panel.classList.remove('hidden');
    $('match-end-title').textContent = winner === 'raider' ? 'RAIDERS WIN THE MATCH' : 'WARDENS WIN THE MATCH';
    $('match-end-score').textContent = `Raiders ${score.raider} — ${score.warden} Wardens`;
  }

  function showBanner(title, sub, ms) {
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub;
    $('banner').classList.remove('hidden');
    clearTimeout(bannerTimer);
    if (ms > 0) bannerTimer = setTimeout(hideBanner, ms);
  }

  function hideBanner() {
    $('banner').classList.add('hidden');
  }

  function showBuy(money) {
    $('buy-menu').classList.remove('hidden');
    setText('buy-money', `$${money}`);
  }

  function hideBuy() {
    $('buy-menu').classList.add('hidden');
  }

  function setHealth(health, armor) {
    setText('health-num', String(Math.max(0, Math.ceil(health))));
    setText('armor-num', String(Math.max(0, Math.ceil(armor))));
    const bar = $('health-bar');
    const pct = Math.max(0, Math.min(100, health));
    if (cache.healthBar !== pct) {
      cache.healthBar = pct;
      bar.style.width = `${pct}%`;
    }
  }

  function setAmmo(mag, reserve, name, grenades) {
    setText('ammo-mag', String(mag));
    setText('ammo-reserve', String(reserve));
    setText('weapon-name', name);
    setText('grenade-count', `◉ ×${grenades}`);
  }

  function setMoney(money) {
    setText('money', `$${money}`);
  }

  function setTimer(seconds, phase) {
    const s = Math.max(0, Math.ceil(seconds));
    setText('timer', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    const label = phase === 'buy' ? 'BUY' : phase === 'live' ? 'LIVE' : phase === 'result' ? 'ROUND OVER' : '';
    setText('timer-phase', label);
  }

  function setScore(raider, warden, round) {
    setText('score-raider', String(raider));
    setText('score-warden', String(warden));
    setText('round-num', `ROUND ${round}`);
  }

  function setCrosshairSpread(px) {
    const value = Math.round(px);
    if (cache.spread === value) return;
    cache.spread = value;
    document.documentElement.style.setProperty('--spread', `${value}px`);
  }

  function hitMarker(kill) {
    const el = $('hitmarker');
    el.classList.remove('hidden');
    el.classList.toggle('kill', kill);
    clearTimeout(hitTimer);
    hitTimer = setTimeout(() => el.classList.add('hidden'), kill ? 350 : 180);
  }

  function damageFlash() {
    const el = $('damage');
    el.classList.remove('hidden');
    el.style.opacity = '0.55';
    clearTimeout(damageTimer);
    damageTimer = setTimeout(() => {
      el.style.opacity = '0';
      el.classList.add('hidden');
    }, 450);
  }

  function killfeed(attacker, victim, headshot) {
    const feed = $('killfeed');
    const row = document.createElement('div');
    row.className = 'kill-row';
    row.textContent = `${attacker} ${headshot ? '◎' : '✕'} ${victim}`;
    feed.prepend(row);
    while (feed.children.length > 5) feed.removeChild(feed.lastChild);
    setTimeout(() => row.remove(), 6000);
  }

  function bombStatus(text, cls) {
    setText('bomb-status', text);
    const el = $('bomb-status');
    el.className = cls ? `bomb-${cls}` : '';
  }

  function setDefuse(progress) {
    const bar = $('defuse');
    if (progress === null) {
      bar.classList.add('hidden');
      return;
    }
    bar.classList.remove('hidden');
    $('defuse-fill').style.width = `${Math.round(progress * 100)}%`;
  }

  function setSpectate(on) {
    $('spectate').classList.toggle('hidden', !on);
  }

  return {
    onPlay(callback) {
      $('play-btn').addEventListener('click', callback);
      $('rematch-btn').addEventListener('click', callback);
    },
    showOverlay,
    hideOverlay,
    showMatchEnd,
    showBanner,
    hideBanner,
    showBuy,
    hideBuy,
    setHealth,
    setAmmo,
    setMoney,
    setTimer,
    setScore,
    setCrosshairSpread,
    hitMarker,
    damageFlash,
    killfeed,
    bombStatus,
    setDefuse,
    setSpectate,
  };
}

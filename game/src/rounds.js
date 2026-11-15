// SPDX-License-Identifier: MIT
// The match: buy phase → live round → result → next round, first to 4 (max 7).
// Raiders attack two sites with a pulse charge; Wardens defend. A round is won by
// elimination, by the charge detonating, by a defuse, or by the clock (defenders
// win a timeout). Economy: $800 start, +$300 a kill, +$3,250 a win, +$1,900 a
// loss (+$500 per loss in a row).
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';

export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const RESULT_SECONDS = 4;
export const ROUNDS_TO_WIN = 4;
export const MAX_ROUNDS = 7;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const KILL_REWARD = 300;

export function createMatch(hooks) {
  const state = {
    phase: 'lobby',
    phaseLeft: 0,
    round: 1,
    score: { raider: 0, warden: 0 },
    money: 800,
    lossStreak: 0,
    buyOpen: false,
    site: 'beacon',
  };
  let roundEnded = false;

  function startMatch() {
    state.phase = 'buy';
    state.phaseLeft = BUY_SECONDS;
    state.round = 1;
    state.score = { raider: 0, warden: 0 };
    state.money = 800;
    state.lossStreak = 0;
    state.buyOpen = false;
    roundEnded = false;
    hooks.onRoundStart(1);
  }

  function endRound(winner, reason) {
    if (roundEnded || state.phase !== 'live') return;
    roundEnded = true;
    state.phase = 'result';
    state.phaseLeft = RESULT_SECONDS;
    const won = winner === 'raider';
    state.score[winner] += 1;
    if (won) {
      state.money += WIN_REWARD;
      state.lossStreak = 0;
    } else {
      state.money += LOSS_REWARD + state.lossStreak * 500;
      state.lossStreak += 1;
    }
    hooks.onRoundEnd(winner, reason);
  }

  function step(dt, counts) {
    if (state.phase === 'lobby' || state.phase === 'matchEnd') return;
    state.phaseLeft -= dt;
    if (state.phase === 'buy') {
      if (state.phaseLeft <= 0) {
        state.phase = 'live';
        state.phaseLeft = ROUND_SECONDS;
        state.buyOpen = false;
        hooks.onLiveStart();
      }
      return;
    }
    if (state.phase === 'live') {
      if (counts.raiderAlive === 0) return endRound('warden', 'Raiders eliminated.');
      if (counts.wardenAlive === 0) return endRound('raider', 'Wardens eliminated.');
      if (counts.bombState === 'exploded') return endRound('raider', 'The charge detonated.');
      if (counts.bombState === 'defused') return endRound('warden', 'Charge defused.');
      if (state.phaseLeft <= 0) return endRound('warden', 'Time expired — site held.');
      return;
    }
    if (state.phase === 'result') {
      if (state.phaseLeft > 0) return;
      if (state.score.raider >= ROUNDS_TO_WIN || state.score.warden >= ROUNDS_TO_WIN
        || state.round >= MAX_ROUNDS) {
        state.phase = 'matchEnd';
        hooks.onMatchEnd(state.score.raider > state.score.warden ? 'raider' : 'warden');
        return;
      }
      state.round += 1;
      state.phase = 'buy';
      state.phaseLeft = BUY_SECONDS;
      roundEnded = false;
      hooks.onRoundStart(state.round);
    }
  }

  function buyWeapon(id) {
    const def = WEAPONS[id];
    if (!def) return false;
    if (state.money < def.price) return false;
    state.money -= def.price;
    return true;
  }

  function buyGrenade() {
    if (state.money < GRENADE_PRICE) return false;
    state.money -= GRENADE_PRICE;
    return true;
  }

  function buyArmor() {
    if (state.money < ARMOR_PRICE) return false;
    state.money -= ARMOR_PRICE;
    return true;
  }

  function addKillReward() {
    state.money += KILL_REWARD;
  }

  function setBuyOpen(open) {
    state.buyOpen = open;
  }

  return {
    state,
    startMatch,
    step,
    buyWeapon,
    buyGrenade,
    buyArmor,
    addKillReward,
    setBuyOpen,
  };
}

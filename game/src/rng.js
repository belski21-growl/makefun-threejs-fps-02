// SPDX-License-Identifier: MIT
// Deterministic RNG (mulberry32) so a ?seed= URL replays the same bots, spread and
// shot staging. One stream per session; the shot modes seed it fixed.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const random = mulberry32(seed);
  return {
    next: random,
    range(min, max) {
      return min + random() * (max - min);
    },
    int(min, max) {
      return min + Math.floor(random() * (max - min + 1));
    },
    pick(list) {
      return list[Math.floor(random() * list.length)];
    },
  };
}

// SPDX-License-Identifier: MIT
// Synthesised WebAudio sounds — no audio files, no network. Every method is a
// no-op until unlock() runs from a user gesture, so headless captures stay silent
// and safe. One shared noise buffer, reused; nothing is allocated per shot.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 0.5;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
  }

  function noise(dur, freq, gain, type = 'lowpass') {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter).connect(g).connect(master);
    src.start();
    src.stop(ctx.currentTime + dur);
  }

  function tone(freq, dur, gain, type = 'sine', slideTo = null) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(g).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  const SHOT_FREQ = { pistol: 900, rifle: 700, smg: 1100, shotgun: 420, dmr: 320 };

  return {
    unlock,
    shot(kind) {
      noise(0.12, SHOT_FREQ[kind] ?? 700, 0.5);
      tone(140, 0.09, 0.25, 'square', 60);
    },
    dryFire() { tone(1200, 0.05, 0.12, 'square'); },
    reload() { tone(500, 0.06, 0.15, 'square'); tone(700, 0.06, 0.15, 'square'); },
    hit() { tone(1800, 0.06, 0.2, 'sine'); },
    kill() { tone(880, 0.09, 0.2, 'sine'); tone(1320, 0.14, 0.2, 'sine'); },
    hurt() { noise(0.15, 300, 0.4); tone(90, 0.15, 0.3, 'sawtooth', 50); },
    denied() { tone(220, 0.12, 0.2, 'square'); },
    buy() { tone(660, 0.07, 0.18, 'sine'); tone(990, 0.1, 0.18, 'sine'); },
    click() { tone(800, 0.04, 0.12, 'sine'); },
    plantBeep() { tone(1100, 0.08, 0.2, 'sine'); },
    defuseTick() { tone(1400, 0.05, 0.12, 'sine'); },
    explosion() {
      noise(0.9, 240, 0.9);
      tone(70, 0.8, 0.5, 'sine', 30);
    },
    roundWin() {
      tone(523, 0.14, 0.2, 'sine'); tone(659, 0.14, 0.2, 'sine'); tone(784, 0.25, 0.22, 'sine');
    },
    roundLose() {
      tone(392, 0.18, 0.2, 'sine'); tone(311, 0.3, 0.2, 'sine');
    },
  };
}

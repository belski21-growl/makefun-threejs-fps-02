// SPDX-License-Identifier: MIT
// Procedural canvas textures for NORTHLIGHT: snow, rock, metal panels, concrete,
// ice and hazard stripes, plus soft radial sprites for glows and snowflakes. No
// image files, no network — everything is drawn once at load from a seeded RNG
// so the look is deterministic for a given seed. Textures are CanvasTextures
// with sRGB colour space; callers clone them when they need a different repeat.
import * as THREE from 'three';
import { mulberry32 } from './rng.js';

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return [canvas, canvas.getContext('2d')];
}

function speckle(ctx, size, rng, count, colors, alphaMin, alphaMax, rMin, rMax) {
  for (let i = 0; i < count; i += 1) {
    const c = colors[Math.floor(rng() * colors.length)];
    ctx.globalAlpha = alphaMin + rng() * (alphaMax - alphaMin);
    ctx.fillStyle = c;
    const r = rMin + rng() * (rMax - rMin);
    ctx.beginPath();
    ctx.arc(rng() * size, rng() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function blotch(ctx, size, rng, count, color, alpha, rMin, rMax) {
  for (let i = 0; i < count; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const r = rMin + rng() * (rMax - rMin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function crack(ctx, size, rng, count, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  for (let i = 0; i < count; i += 1) {
    let x = rng() * size;
    let y = rng() * size;
    ctx.globalAlpha = 0.25 + rng() * 0.3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 4 + Math.floor(rng() * 5);
    for (let s = 0; s < steps; s += 1) {
      x += (rng() - 0.5) * size * 0.35;
      y += (rng() - 0.5) * size * 0.35;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function toTexture(canvas, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function snowCanvas(rng) {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size);
  ctx.fillStyle = '#c9d7e3';
  ctx.fillRect(0, 0, size, size);
  // Soft blue-grey drifts so the floor is not one flat tone.
  blotch(ctx, size, rng, 14, '#aebfd0', 0.25, 30, 80);
  blotch(ctx, size, rng, 10, '#e8f1f8', 0.3, 20, 60);
  speckle(ctx, size, rng, 2200, ['#ffffff', '#dfe9f2', '#b3c4d4', '#9fb2c6'], 0.15, 0.5, 0.5, 1.8);
  // Sparkle: a few near-white glints that catch the moonlight.
  speckle(ctx, size, rng, 60, ['#ffffff', '#f4fbff'], 0.7, 1, 0.5, 1.1);
  return canvas;
}

function rockCanvas(rng) {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size);
  ctx.fillStyle = '#39434f';
  ctx.fillRect(0, 0, size, size);
  blotch(ctx, size, rng, 16, '#2b333e', 0.35, 24, 70);
  blotch(ctx, size, rng, 10, '#4a5563', 0.3, 20, 55);
  speckle(ctx, size, rng, 1800, ['#2c3540', '#4d5a68', '#5d6a78', '#232b34'], 0.2, 0.55, 0.5, 2.2);
  crack(ctx, size, rng, 7, '#1d242d', 1.2);
  return canvas;
}

function metalCanvas(rng) {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size);
  ctx.fillStyle = '#2e3a49';
  ctx.fillRect(0, 0, size, size);
  // Brushed vertical streaks.
  for (let i = 0; i < 90; i += 1) {
    ctx.globalAlpha = 0.04 + rng() * 0.06;
    ctx.fillStyle = rng() < 0.5 ? '#46586c' : '#232e3c';
    ctx.fillRect(rng() * size, 0, 1 + rng() * 2, size);
  }
  ctx.globalAlpha = 1;
  // Panel seams + rivets.
  ctx.fillStyle = '#1a222d';
  for (const y of [0, 64, 128, 192]) {
    ctx.fillRect(0, y, size, 3);
    for (let x = 8; x < size; x += 32) {
      ctx.beginPath();
      ctx.arc(x, y + 8, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = '#1a222d';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x - 0.7, y + 7.3, 0.8, 0, Math.PI * 2);
      ctx.fillStyle = '#5a6b7d';
      ctx.fill();
    }
  }
  // Faint rust tint near the seams.
  blotch(ctx, size, rng, 8, '#6b4a2f', 0.12, 12, 34);
  speckle(ctx, size, rng, 500, ['#3a4a5c', '#26313e'], 0.15, 0.4, 0.5, 1.5);
  return canvas;
}

function concreteCanvas(rng) {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size);
  ctx.fillStyle = '#4a4f55';
  ctx.fillRect(0, 0, size, size);
  blotch(ctx, size, rng, 12, '#3a3f45', 0.3, 26, 64);
  blotch(ctx, size, rng, 8, '#5b6167', 0.25, 20, 50);
  speckle(ctx, size, rng, 2400, ['#3c4147', '#585e64', '#33383d', '#6a7076'], 0.2, 0.5, 0.5, 1.6);
  crack(ctx, size, rng, 5, '#2e3236', 1);
  return canvas;
}

function iceCanvas(rng) {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size);
  ctx.fillStyle = '#a8d4e2';
  ctx.fillRect(0, 0, size, size);
  blotch(ctx, size, rng, 10, '#c4e6ef', 0.35, 24, 60);
  blotch(ctx, size, rng, 8, '#8fbccd', 0.3, 20, 50);
  // White fracture lines radiating across the ice.
  ctx.strokeStyle = '#eef8fc';
  for (let i = 0; i < 9; i += 1) {
    let x = rng() * size;
    let y = rng() * size;
    ctx.globalAlpha = 0.35 + rng() * 0.35;
    ctx.lineWidth = 0.8 + rng() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 5; s += 1) {
      x += (rng() - 0.5) * 90;
      y += (rng() - 0.5) * 90;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Trapped air bubbles.
  speckle(ctx, size, rng, 70, ['#eaf7fb', '#ffffff'], 0.4, 0.8, 1, 2.6);
  return canvas;
}

function hazardCanvas() {
  const size = 128;
  const [canvas, ctx] = makeCanvas(size);
  ctx.fillStyle = '#14181f';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#ffb35c';
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(Math.PI / 4);
  for (let x = -size; x < size; x += 32) {
    ctx.fillRect(x, -size, 16, size * 2);
  }
  ctx.restore();
  return canvas;
}

function radialCanvas(size, stops) {
  const [canvas, ctx] = makeCanvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

export function createTextures(seed = 1337) {
  const rng = mulberry32(seed);
  return {
    snow: toTexture(snowCanvas(rng)),
    rock: toTexture(rockCanvas(rng)),
    metal: toTexture(metalCanvas(rng)),
    concrete: toTexture(concreteCanvas(rng)),
    ice: toTexture(iceCanvas(rng)),
    hazard: toTexture(hazardCanvas()),
    // Soft round sprite for glows, muzzle flashes and lamp halos.
    glow: toTexture(radialCanvas(128, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']])),
    // Soft round dot for snowflakes and stars.
    flake: toTexture(radialCanvas(64, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']])),
    // Grey dust puff for bullet impacts.
    puff: toTexture(radialCanvas(128, [[0, 'rgba(210,220,230,0.85)'], [0.6, 'rgba(190,200,212,0.4)'], [1, 'rgba(190,200,212,0)']])),
  };
}

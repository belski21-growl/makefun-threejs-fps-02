// SPDX-License-Identifier: MIT
// NORTHLIGHT — a three.js tactical FPS for make.fun's threejs-fps-02 bounty.
// The entrypoint (Node 22, standard library only): it copies this repository's
// game/ and screenshots/ to /output and writes /output/dossier.json with the
// kit's vendored buildDossier, exactly as the starter does. Outside the grader,
// MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// The program is deterministic: same repository, same bytes out, every run.
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const GAME_MAX_FILES = 993;
const GAME_MAX_BYTES = 50331648;
const SHOTS_MAX = 4;
const SHOT_MAX_BYTES = 262144;

function fail(message) {
  throw new Error(`NORTHLIGHT main.ts: ${message}`);
}

function countEntries(dir) {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) {
      const sub = countEntries(path);
      files += sub.files;
      bytes += sub.bytes;
    } else if (name.isFile()) {
      files += 1;
      bytes += statSync(path).size;
    } else {
      fail(`game/ holds a non-file, non-directory entry: ${path}`);
    }
  }
  return { files, bytes };
}

const gameDir = join(here, 'game');
if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing');
const game = countEntries(gameDir);
if (game.files > GAME_MAX_FILES) fail(`game/ holds ${game.files} files, over the ${GAME_MAX_FILES} cap`);
if (game.bytes > GAME_MAX_BYTES) fail(`game/ is ${game.bytes} bytes, over the ${GAME_MAX_BYTES} cap`);

const shotsDir = join(here, 'screenshots');
if (!existsSync(shotsDir)) fail('screenshots/ is missing');
const shots = readdirSync(shotsDir).filter((name) => !name.startsWith('.')).sort();
if (shots.length < 3 || shots.length > SHOTS_MAX) {
  fail(`screenshots/ holds ${shots.length} images, need 3 or 4`);
}
for (const name of shots) {
  const size = statSync(join(shotsDir, name)).size;
  if (size > SHOT_MAX_BYTES) fail(`screenshots/${name} is ${size} bytes, over the ${SHOT_MAX_BYTES} cap`);
}

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes;
// the others refuse an entry the scorer would refuse.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648 }),
);

// Post-write guard: the dossier the gate compares must exist and fit its own cap.
const dossierBytes = statSync(join(out, 'dossier.json')).size;
if (dossierBytes > 1572864) fail(`dossier.json is ${dossierBytes} bytes, over the 1.5 MiB cap`);

console.log(`NORTHLIGHT: game/ ${game.files} files, ${game.bytes} bytes; screenshots ${shots.join(', ')}; dossier ${dossierBytes} bytes written to ${join(out, 'dossier.json')}`);

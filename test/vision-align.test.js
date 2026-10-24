import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateShift, shiftBackground } from '../app/src/vision/align.js';

const W = 64;
const H = 48;

function makeScene() {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      const grain = ((x * 13 + y * 7) % 37) * 2;
      rgba[i] = 120 + grain;
      rgba[i + 1] = 90 + grain;
      rgba[i + 2] = 60 + grain;
      rgba[i + 3] = 255;
      if (x > 18 && x < 30 && y > 12 && y < 26) {
        rgba[i] = 210;
        rgba[i + 1] = 40;
        rgba[i + 2] = 40;
      }
      if (x > 40 && x < 50 && y > 30 && y < 40) {
        rgba[i] = 40;
        rgba[i + 1] = 80;
        rgba[i + 2] = 200;
      }
    }
  }
  return rgba;
}

function toBackground(rgba) {
  const bg = new Float32Array(W * H * 3);
  for (let p = 0; p < W * H; p += 1) {
    bg[p * 3] = rgba[p * 4];
    bg[p * 3 + 1] = rgba[p * 4 + 1];
    bg[p * 3 + 2] = rgba[p * 4 + 2];
  }
  return bg;
}

function shiftFrame(rgba, dx, dy) {
  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < H; y += 1) {
    const sy = Math.min(H - 1, Math.max(0, y - dy));
    for (let x = 0; x < W; x += 1) {
      const sx = Math.min(W - 1, Math.max(0, x - dx));
      const to = (y * W + x) * 4;
      const from = (sy * W + sx) * 4;
      out[to] = rgba[from];
      out[to + 1] = rgba[from + 1];
      out[to + 2] = rgba[from + 2];
      out[to + 3] = 255;
    }
  }
  return out;
}

test('estima la traslación de la cámara con error de ±1 px', () => {
  const scene = makeScene();
  const background = toBackground(scene);
  const moved = shiftFrame(scene, 5, -3);
  const result = estimateShift(moved, background, W, H);
  assert.ok(Math.abs(result.dx - 5) <= 1, `dx=${result.dx}`);
  assert.ok(Math.abs(result.dy + 3) <= 1, `dy=${result.dy}`);
});

test('sin movimiento devuelve (0,0)', () => {
  const scene = makeScene();
  const background = toBackground(scene);
  const result = estimateShift(scene, background, W, H);
  assert.equal(result.dx, 0);
  assert.equal(result.dy, 0);
});

test('shiftBackground desplaza el modelo y replica bordes', () => {
  const background = toBackground(makeScene());
  const row = 10 * W * 3;
  const before = background[row + 30 * 3];
  shiftBackground(background, W, H, 2, 0);
  assert.equal(background[row + 32 * 3], before);
  // Los píxeles del borde se replican en lugar de quedar negros.
  assert.ok(background[row + 0] > 0);
  assert.ok(background[row + 2 * 3] > 0);
});

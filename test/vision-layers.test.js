import test from 'node:test';
import assert from 'node:assert/strict';
import { createLayersExtractor, classifyShape } from '../app/src/vision/layers.js';

const W = 40;
const H = 40;

function scene(bands) {
  const rgba = new Uint8ClampedArray(W * H * 4);
  const binary = new Uint8Array(W * H);
  for (const band of bands) {
    for (let y = band.y0; y <= band.y1; y += 1) {
      for (let x = 8; x <= 31; x += 1) {
        const i = (y * W + x) * 4;
        rgba[i] = band.color[0];
        rgba[i + 1] = band.color[1];
        rgba[i + 2] = band.color[2];
        rgba[i + 3] = 255;
        binary[y * W + x] = 1;
      }
    }
  }
  return { rgba, binary };
}

const blob = { x0: 8, y0: 5, x1: 31, y1: 34, w: 24, h: 30, area: 24 * 30, cx: 20, cy: 20, fill: 1, aspect: 0.8 };

test('una torre de tres colores produce tres capas ordenadas', () => {
  const { rgba, binary } = scene([
    { y0: 5, y1: 14, color: [220, 40, 40] },
    { y0: 15, y1: 24, color: [250, 210, 30] },
    { y0: 25, y1: 34, color: [40, 90, 220] },
  ]);
  const extractor = createLayersExtractor(W, H);
  const layers = extractor.extract({ rgba, binary, blob });
  assert.equal(layers.length, 3);
  assert.deepEqual(layers.map((layer) => layer.color), ['red', 'yellow', 'blue']);
  assert.ok(layers[0].y < layers[1].y && layers[1].y < layers[2].y);
});

test('una banda fina de transición no crea un bloque fantasma', () => {
  const { rgba, binary } = scene([
    { y0: 5, y1: 19, color: [220, 40, 40] },
    { y0: 20, y1: 20, color: [240, 240, 240] },
    { y0: 21, y1: 34, color: [220, 40, 40] },
  ]);
  const extractor = createLayersExtractor(W, H);
  const layers = extractor.extract({ rgba, binary, blob });
  assert.equal(layers.length, 1);
  assert.equal(layers[0].color, 'red');
});

test('sin máscara suficiente cae al color del centro', () => {
  const rgba = new Uint8ClampedArray(W * H * 4).fill(0);
  const i = (20 * W + 20) * 4;
  rgba[i] = 40;
  rgba[i + 1] = 200;
  rgba[i + 2] = 80;
  rgba[i + 3] = 255;
  const binary = new Uint8Array(W * H);
  const extractor = createLayersExtractor(W, H);
  const layers = extractor.extract({ rgba, binary, blob });
  assert.equal(layers.length, 1);
  assert.equal(layers[0].color, 'green');
  assert.ok(layers[0].confidence < 0.5);
});

test('la silueta distingue cubo, torre y tablón', () => {
  assert.equal(classifyShape({ aspect: 1 }), 'cube');
  assert.equal(classifyShape({ aspect: 0.4 }), 'tower');
  assert.equal(classifyShape({ aspect: 2.4 }), 'plank');
});

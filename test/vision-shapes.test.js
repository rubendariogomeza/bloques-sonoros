import test from 'node:test';
import assert from 'node:assert/strict';
import { createMorphology } from '../app/src/vision/morphology.js';
import { createLabeler } from '../app/src/vision/components.js';

const W = 21;
const H = 21;

function blank() {
  return new Uint8Array(W * H);
}

function fill(mask, x0, y0, x1, y1, value = 1) {
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) mask[y * W + x] = value;
}

test('la apertura elimina píxeles sueltos', () => {
  const mask = blank();
  mask[10 * W + 10] = 1;
  const morph = createMorphology(W, H);
  morph.openClose(mask);
  assert.equal(mask.reduce((a, b) => a + b, 0), 0);
});

test('el cierre rellena huecos de un bloque', () => {
  const mask = blank();
  fill(mask, 6, 6, 14, 14);
  mask[10 * W + 10] = 0;
  const morph = createMorphology(W, H);
  morph.openClose(mask);
  assert.equal(mask[10 * W + 10], 1);
  assert.equal(mask[6 * W + 6], 1);
});

test('etiqueta dos componentes separadas con área y caja correctas', () => {
  const mask = blank();
  fill(mask, 2, 2, 5, 5); // 16 px
  fill(mask, 10, 10, 18, 12); // 27 px
  const labeler = createLabeler(W, H);
  const blobs = labeler.label(mask, { minArea: 5 });
  assert.equal(blobs.length, 2);
  const [large, small] = blobs;
  assert.equal(large.area, 27);
  assert.equal(large.w, 9);
  assert.equal(large.h, 3);
  assert.equal(small.area, 16);
  assert.equal(small.x0, 2);
  assert.equal(small.y0, 2);
});

test('descarta blobs por debajo del área mínima', () => {
  const mask = blank();
  fill(mask, 2, 2, 3, 3); // 4 px
  fill(mask, 10, 10, 18, 12); // 27 px
  const labeler = createLabeler(W, H);
  const blobs = labeler.label(mask, { minArea: 10 });
  assert.equal(blobs.length, 1);
  assert.equal(blobs[0].area, 27);
});

test('conectividad en diagonal une una torre inclinada', () => {
  const mask = blank();
  fill(mask, 5, 5, 7, 7);
  fill(mask, 7, 8, 9, 10);
  const labeler = createLabeler(W, H);
  const blobs = labeler.label(mask, { minArea: 4 });
  assert.equal(blobs.length, 1);
  assert.equal(blobs[0].area, 9 + 9);
});

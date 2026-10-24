import test from 'node:test';
import assert from 'node:assert/strict';
import { SCALES, xToColumn, columnCenter, yToDegree, yToSemitones, semitonesToRate } from '../app/src/sequencer/pattern.js';
import { COLOR_CLASSES } from '../app/src/core/config.js';
import { KITS, defaultMapping, sanitizeMapping, kitSampleIds } from '../app/src/audio/kits.js';
import { SAMPLE_IDS } from '../app/src/audio/synth.js';

test('x normalizado cae siempre en una columna válida', () => {
  assert.equal(xToColumn(0, 16), 0);
  assert.equal(xToColumn(0.999, 16), 15);
  assert.equal(xToColumn(1, 16), 15);
  assert.equal(xToColumn(-2, 16), 0);
  assert.equal(xToColumn(4, 16), 15);
  assert.equal(xToColumn(0.5, 8), 4);
  assert.equal(columnCenter(0, 16), 0.03125);
});

test('arriba suena agudo y abajo grave', () => {
  const top = yToSemitones(0.02, SCALES.pentatonic, 2);
  const middle = yToSemitones(0.5, SCALES.pentatonic, 2);
  const bottom = yToSemitones(0.98, SCALES.pentatonic, 2);
  assert.ok(top > middle && middle > bottom);
  assert.equal(bottom, 0);
  const degree = yToDegree(0.5, 6);
  assert.ok(degree >= 0 && degree < 6);
});

test('los semitonos se convierten en factor de reproducción', () => {
  assert.equal(semitonesToRate(0), 1);
  assert.ok(Math.abs(semitonesToRate(12) - 2) < 1e-12);
  assert.ok(Math.abs(semitonesToRate(-12) - 0.5) < 1e-12);
});

test('todos los kits cubren los 10 colores con samples existentes', () => {
  for (const kit of KITS) {
    for (const color of COLOR_CLASSES) {
      assert.ok(kit.mapping[color], `${kit.id} sin sonido para ${color}`);
      assert.ok(SAMPLE_IDS.includes(kit.mapping[color]), `${kit.id}/${color} apunta a sample inexistente`);
    }
    for (const id of kitSampleIds(kit)) assert.ok(SAMPLE_IDS.includes(id));
  }
});

test('sanitizeMapping rellena huecos y descarta ids inválidos', () => {
  const kit = KITS[0];
  const mapping = sanitizeMapping(kit, { red: 'no-existe', blue: 'cowbell' });
  assert.equal(mapping.red, kit.mapping.red);
  assert.equal(mapping.blue, 'cowbell');
  assert.deepEqual(Object.keys(mapping).sort(), [...COLOR_CLASSES].sort());
  assert.deepEqual(defaultMapping('melodic'), KITS[1].mapping);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { SCALES, xToColumn, columnCenter, yToDegree, yToSemitones, semitonesToRate } from '../app/src/sequencer/pattern.js';
import { COLOR_CLASSES } from '../app/src/core/config.js';
import { KITS, defaultMapping, sanitizeMapping, kitSampleIds, GRID_KIT, GRID_KIT_ID, PITCHED_SAMPLE_IDS, isPitchedSample, sanitizePitchedMapping } from '../app/src/audio/kits.js';
import { SAMPLE_IDS, SAMPLE_BASE_MIDI } from '../app/src/audio/synth.js';
import { MELODY_SAMPLE_IDS } from '../app/src/audio/melody.js';

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
  assert.deepEqual(defaultMapping('melodic'), KITS.find((kit) => kit.id === 'melodic').mapping);
});

test('la melodía carga sus timbres aunque el kit sea de percusión', () => {
  const percussion = KITS.find((kit) => kit.mode === 'percussion');
  // El kit por defecto no trae la paleta melódica: sin extras la melodía sería muda.
  assert.ok(!kitSampleIds(percussion).includes('marimba'));

  const ids = kitSampleIds(percussion, MELODY_SAMPLE_IDS);
  for (const id of MELODY_SAMPLE_IDS) {
    assert.ok(ids.includes(id), `la melodía necesita ${id}`);
  }
  for (const id of ids) assert.ok(SAMPLE_IDS.includes(id), `${id} no existe en el sintetizador`);
});

test('cada timbre de la melodía tiene altura de referencia', () => {
  for (const id of MELODY_SAMPLE_IDS) {
    assert.ok(SAMPLE_IDS.includes(id), `${id} no existe`);
    assert.equal(typeof SAMPLE_BASE_MIDI[id], 'number', `${id} no se puede afinar`);
  }
});

test('el kit de la parrilla solo usa instrumentos afinados', () => {
  assert.equal(GRID_KIT.id, GRID_KIT_ID);
  assert.equal(GRID_KIT.mode, 'melodic');
  for (const color of COLOR_CLASSES) {
    const sampleId = GRID_KIT.mapping[color];
    assert.ok(isPitchedSample(sampleId), `${color} → ${sampleId} no tiene altura`);
    assert.ok(PITCHED_SAMPLE_IDS.includes(sampleId));
  }
  // El kit cubre toda la paleta afinada sin repetir instrumento.
  assert.deepEqual(new Set(kitSampleIds(GRID_KIT)), new Set(PITCHED_SAMPLE_IDS));
});

test('sanitizePitchedMapping descarta percusión y rellena huecos', () => {
  const mapping = sanitizePitchedMapping({ red: 'kick', blue: 'cello', green: 'no-existe' });
  assert.equal(mapping.red, GRID_KIT.mapping.red);
  assert.equal(mapping.blue, 'cello');
  assert.equal(mapping.green, GRID_KIT.mapping.green);
  assert.deepEqual(Object.keys(mapping).sort(), [...COLOR_CLASSES].sort());
  for (const color of COLOR_CLASSES) assert.ok(isPitchedSample(mapping[color]));
  assert.deepEqual(sanitizePitchedMapping(), { ...GRID_KIT.mapping });
  assert.deepEqual(defaultMapping(GRID_KIT_ID), { ...GRID_KIT.mapping });
});

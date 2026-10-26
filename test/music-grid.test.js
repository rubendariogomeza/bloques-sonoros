import test from 'node:test';
import assert from 'node:assert/strict';
import { GRID_ROWS } from '../app/src/core/config.js';
import { KEY_MIDI, PENTATONIC } from '../app/src/music/song.js';
import { pentatonicMidi, degreeForMidi, gridMidi, gridLadder } from '../app/src/music/grid.js';
import { SAMPLE_BASE_MIDI } from '../app/src/audio/synth.js';

const PITCHED = Object.keys(SAMPLE_BASE_MIDI);

function isPentatonic(midi) {
  const pc = (((midi - KEY_MIDI) % 12) + 12) % 12;
  return PENTATONIC.includes(pc);
}

test('toda nota de la escalera pertenece a la pentatónica de Do', () => {
  for (const id of PITCHED) {
    const ladder = gridLadder(SAMPLE_BASE_MIDI[id], GRID_ROWS);
    for (const midi of ladder) {
      assert.ok(isPentatonic(midi), `${id}: ${midi} fuera de la pentatónica`);
    }
  }
});

test('la fila 0 es la más aguda y la última la más grave', () => {
  for (const id of PITCHED) {
    const ladder = gridLadder(SAMPLE_BASE_MIDI[id], GRID_ROWS);
    for (let i = 1; i < ladder.length; i += 1) {
      assert.ok(ladder[i - 1] > ladder[i], `${id}: la escalera no desciende`);
    }
  }
});

test('la fila central conserva la nota natural del instrumento', () => {
  const middle = Math.floor((GRID_ROWS - 1) / 2);
  for (const id of PITCHED) {
    assert.equal(
      gridMidi(SAMPLE_BASE_MIDI[id], middle, GRID_ROWS),
      SAMPLE_BASE_MIDI[id],
      `${id} cambia de registro`,
    );
  }
});

test('pentatonicMidi recorre grados negativos sin salirse de la escala', () => {
  for (let degree = -20; degree <= 20; degree += 1) {
    assert.ok(isPentatonic(pentatonicMidi(degree)), `grado ${degree}`);
  }
  assert.equal(pentatonicMidi(0), KEY_MIDI);
  assert.equal(pentatonicMidi(5), KEY_MIDI + 12);
});

test('degreeForMidi y pentatonicMidi son coherentes en la pentatónica', () => {
  for (let degree = -10; degree <= 10; degree += 1) {
    assert.equal(pentatonicMidi(degreeForMidi(pentatonicMidi(degree))), pentatonicMidi(degree));
  }
});

test('la fila se recorta a los límites de la parrilla', () => {
  const base = SAMPLE_BASE_MIDI.marimba;
  assert.equal(gridMidi(base, -5, GRID_ROWS), gridMidi(base, 0, GRID_ROWS));
  assert.equal(gridMidi(base, 99, GRID_ROWS), gridMidi(base, GRID_ROWS - 1, GRID_ROWS));
});

test('la escalera funciona con cualquier número de filas', () => {
  for (const rows of [1, 2, 5, 8, 12]) {
    const ladder = gridLadder(SAMPLE_BASE_MIDI.bell, rows);
    assert.equal(ladder.length, rows);
    for (const midi of ladder) assert.ok(isPentatonic(midi), `${rows} filas: ${midi}`);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KEY_MIDI,
  PROGRESSION,
  chordPitchClasses,
  degreeToMidi,
  renderBar,
  scalePitchClasses,
} from '../app/src/music/song.js';
import { BASE_INTENT } from '../app/src/music/variation.js';

const STEPS = 16;

function allIntents() {
  const list = [];
  for (const register of [0, 1, 2]) {
    for (const density of [0, 1, 2]) {
      for (const timbre of [0, 1, 2]) {
        for (const bass of [false, true]) {
          for (const ornament of [0, 1, 2]) {
            list.push({ register, density, timbre, bass, ornament });
          }
        }
      }
    }
  }
  return list;
}

test('toda variación se queda dentro de la escala y del acorde', () => {
  for (const intent of allIntents()) {
    for (let bar = 0; bar < 8; bar += 1) {
      const allowed = new Set([...scalePitchClasses(), ...chordPitchClasses(bar)]);
      for (const note of renderBar(bar, intent, { stepsPerBar: STEPS })) {
        assert.ok(Number.isInteger(note.midi), 'midi entero');
        assert.ok(note.midi >= 0 && note.midi <= 127, `midi fuera de rango: ${note.midi}`);
        assert.ok(allowed.has(((note.midi % 12) + 12) % 12), `nota fuera de armonía: ${note.midi} en compás ${bar}`);
        assert.ok(note.step >= 0 && note.step < STEPS, `paso fuera de compás: ${note.step}`);
        assert.ok(note.gain > 0 && note.gain <= 1);
      }
    }
  }
});

test('la melodía base llena el compás y va ordenada', () => {
  const notes = renderBar(0, BASE_INTENT, { stepsPerBar: STEPS });
  assert.ok(notes.length >= 5);
  for (let i = 1; i < notes.length; i += 1) assert.ok(notes[i].step >= notes[i - 1].step);
  assert.equal(notes.at(-1).step, 12);
});

test('más densidad añade notas, no las quita', () => {
  const counts = [0, 1, 2].map(
    (density) => renderBar(0, { ...BASE_INTENT, density }, { stepsPerBar: STEPS }).filter((n) => n.voice === 'lead').length,
  );
  assert.ok(counts[0] < counts[1], `${counts[0]} < ${counts[1]}`);
  assert.ok(counts[1] < counts[2], `${counts[1]} < ${counts[2]}`);
});

test('el registro sube o baja la melodía una octava', () => {
  const low = renderBar(0, { ...BASE_INTENT, register: 0 }, { stepsPerBar: STEPS })[0].midi;
  const mid = renderBar(0, { ...BASE_INTENT, register: 1 }, { stepsPerBar: STEPS })[0].midi;
  const high = renderBar(0, { ...BASE_INTENT, register: 2 }, { stepsPerBar: STEPS })[0].midi;
  assert.equal(mid - low, 12);
  assert.equal(high - mid, 12);
});

test('el bajo solo suena con base ancha y toca la fundamental del acorde', () => {
  const withoutBass = renderBar(0, { ...BASE_INTENT, bass: false }, { stepsPerBar: STEPS });
  assert.equal(withoutBass.filter((note) => note.voice === 'bass').length, 0);

  for (let bar = 0; bar < PROGRESSION.length; bar += 1) {
    const notes = renderBar(bar, { ...BASE_INTENT, bass: true }, { stepsPerBar: STEPS });
    const bass = notes.filter((note) => note.voice === 'bass');
    assert.equal(bass.length, 1);
    assert.equal(bass[0].step, 0);
    assert.equal(((bass[0].midi % 12) + 12) % 12, ((KEY_MIDI + PROGRESSION[bar].root) % 12 + 12) % 12);
  }
});

test('el arpegio cierra el compás con notas del acorde', () => {
  const notes = renderBar(0, { ...BASE_INTENT, ornament: 1 }, { stepsPerBar: STEPS });
  const lastBeat = notes.filter((note) => note.step >= 12);
  assert.equal(lastBeat.length, 3);
  const allowed = new Set(chordPitchClasses(0));
  for (const note of lastBeat) assert.ok(allowed.has(((note.midi % 12) + 12) % 12));
});

test('la rejilla de 8 pasos también cabe en el compás', () => {
  const notes = renderBar(1, { ...BASE_INTENT, density: 2 }, { stepsPerBar: 8 });
  assert.ok(notes.length > 0);
  for (const note of notes) assert.ok(note.step >= 0 && note.step < 8);
});

test('los grados pentatónicos saltan de octava al pasar de La', () => {
  assert.equal(degreeToMidi(0), KEY_MIDI);
  assert.equal(degreeToMidi(4), KEY_MIDI + 9);
  assert.equal(degreeToMidi(5), KEY_MIDI + 12);
});

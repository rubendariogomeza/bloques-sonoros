import test from 'node:test';
import assert from 'node:assert/strict';
import { accentMidi, createMelodyPlayer, isPitched, midiToRate } from '../app/src/audio/melody.js';
import { SAMPLE_BASE_MIDI } from '../app/src/audio/synth.js';
import { renderBar } from '../app/src/music/song.js';
import { BASE_INTENT } from '../app/src/music/variation.js';

function fakeAudio() {
  const calls = [];
  return {
    calls,
    playNote(sampleId, options) {
      calls.push({ sampleId, ...options });
      return true;
    },
  };
}

test('afina con playbackRate sobre la nota real del sample', () => {
  assert.equal(midiToRate(72, 'marimba'), 1);
  assert.ok(Math.abs(midiToRate(60, 'marimba') - 0.5) < 1e-9);
  assert.ok(Math.abs(midiToRate(84, 'bell') - 2 ** (3 / 12)) < 1e-9);
  assert.ok(Math.abs(midiToRate(45, 'bass') - 1) < 1e-9);
});

test('solo los samples con altura definida sirven de acento', () => {
  assert.equal(isPitched('marimba'), true);
  assert.equal(isPitched('bell'), true);
  assert.equal(isPitched('kick'), false);
});

test('el acento sube de grave a agudo de izquierda a derecha', () => {
  let previous = 0;
  for (let column = 0; column < 16; column += 1) {
    const midi = accentMidi(column, 16);
    assert.ok(midi >= previous);
    assert.ok([0, 2, 4, 7, 9].includes(midi % 12));
    previous = midi;
  }
});

test('el acento cae en la pentatónica con cualquier timbre', () => {
  for (const [sampleId, base] of Object.entries(SAMPLE_BASE_MIDI)) {
    for (let column = 0; column < 16; column += 1) {
      const midi = accentMidi(column, 16, base);
      assert.ok(
        [0, 2, 4, 7, 9].includes(((midi % 12) + 12) % 12),
        `${sampleId} en la columna ${column} suena fuera de escala: ${midi}`,
      );
      assert.ok(midiToRate(midi, sampleId) >= 0.5 && midiToRate(midi, sampleId) <= 2.5, `${sampleId} fuera de registro`);
    }
  }
});

test('el reproductor agenda todas las notas del compás una sola vez', () => {
  const audio = fakeAudio();
  const player = createMelodyPlayer({ audio, stepsPerBar: 16 });
  const intent = { ...BASE_INTENT, register: 1, density: 1, timbre: 0, bass: true, ornament: 0 };

  player.beginBar({ bar: 0, intent, stepsPerBar: 16 });
  for (let step = 0; step < 16; step += 1) {
    player.playStep({ bar: 0, step, intent, stepsPerBar: 16, when: step * 0.1 });
  }

  const expected = renderBar(0, intent, { stepsPerBar: 16 });
  assert.equal(audio.calls.length, expected.length);
  assert.deepEqual(audio.calls.map((call) => call.midi), expected.map((note) => note.midi));
  assert.ok(audio.calls.every((call) => call.when >= 0 && call.when < 1.6));
});

test('el timbre y el bajo eligen el sample correcto', () => {
  const audio = fakeAudio();
  const player = createMelodyPlayer({ audio, stepsPerBar: 16 });
  const intent = { ...BASE_INTENT, timbre: 1, bass: true };

  player.playStep({ bar: 0, step: 0, intent, stepsPerBar: 16, when: 0 });

  const lead = audio.calls.find((call) => call.sampleId === 'bell');
  const bass = audio.calls.find((call) => call.sampleId === 'bass');
  assert.ok(lead, 'la campana lleva la melodía');
  assert.ok(bass, 'el bajo suena en el paso 0');
});

test('cambiar de compás recarga la melodía sin repetir notas', () => {
  const audio = fakeAudio();
  const player = createMelodyPlayer({ audio, stepsPerBar: 16 });
  const intent = { ...BASE_INTENT, bass: false };

  player.playStep({ bar: 0, step: 0, intent, stepsPerBar: 16, when: 0 });
  const firstBar = audio.calls.length;
  player.playStep({ bar: 1, step: 0, intent, stepsPerBar: 16, when: 2.5 });

  assert.equal(player.currentBar, 1);
  assert.ok(audio.calls.length > firstBar);
});

test('un acento con sample no afinado cae en el carillón', () => {
  const audio = fakeAudio();
  const player = createMelodyPlayer({ audio, stepsPerBar: 16 });
  player.playAccent({ sampleId: 'kick', column: 3, columns: 16, when: 1 });

  assert.equal(audio.calls.length, 1);
  assert.equal(audio.calls[0].sampleId, 'chime');
});

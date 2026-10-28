import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PORTRAIT_MOTIFS,
  createPortraitTracker,
  describePortrait,
  intentFromPortrait,
  motifOffset,
} from '../app/src/music/portrait.js';
import { chordPitchClasses, renderBar, scalePitchClasses } from '../app/src/music/song.js';

const STEPS = 16;
const LOUD_CUES = Object.freeze({ mouth: 1, smile: 1, eyes: 0, tilt: 1, motion: 1 });

function pitchClass(midi) {
  return ((midi % 12) + 12) % 12;
}

test('la misma semilla produce siempre la misma variación', () => {
  const a = intentFromPortrait(321, { mouth: 0.4, smile: 0.5, eyes: 0.6, tilt: 0.2 });
  const b = intentFromPortrait(321, { mouth: 0.4, smile: 0.5, eyes: 0.6, tilt: 0.2 });
  assert.deepEqual(a, b);
  assert.equal(a.seed, 321);
  assert.equal(a.portrait, true);
  assert.equal(a.empty, false);
});

test('las dimensiones quedan acotadas para cualquier semilla', () => {
  for (let seed = 0; seed < 1024; seed += 1) {
    for (const cues of [{}, LOUD_CUES]) {
      const intent = intentFromPortrait(seed, cues);
      assert.ok(intent.register >= 0 && intent.register <= 2, `register ${intent.register}`);
      assert.ok(intent.density >= 0 && intent.density <= 2, `density ${intent.density}`);
      assert.ok(intent.timbre >= 0 && intent.timbre <= 2, `timbre ${intent.timbre}`);
      assert.equal(typeof intent.bass, 'boolean');
      assert.ok(intent.ornament >= 0 && intent.ornament <= 2, `ornament ${intent.ornament}`);
      assert.ok(intent.motif >= 0 && intent.motif < PORTRAIT_MOTIFS, `motif ${intent.motif}`);
    }
  }
});

test('semillas distintas reparten canciones distintas', () => {
  const signatures = new Set();
  const motifs = new Set();
  for (let seed = 0; seed < 1024; seed += 1) {
    const intent = intentFromPortrait(seed, {});
    signatures.add(intent.signature);
    motifs.add(intent.motif);
  }
  assert.ok(signatures.size > 400, `solo ${signatures.size} combinaciones`);
  assert.equal(motifs.size, PORTRAIT_MOTIFS, 'los cinco contornos aparecen');
});

test('los gestos cambian la música sin salirse de rango', () => {
  const base = intentFromPortrait(200, {});
  const open = intentFromPortrait(200, { mouth: 1 });
  assert.equal(open.density, Math.min(2, base.density + 1));

  const smile = intentFromPortrait(200, { smile: 1 });
  assert.equal(smile.ornament, 2);

  const closedEyes = intentFromPortrait(200, { eyes: 0 });
  assert.equal(closedEyes.register, Math.max(0, base.register - 1));

  const tilted = intentFromPortrait(200, { tilt: 1 });
  assert.equal(tilted.motif, (base.motif + 1) % PORTRAIT_MOTIFS);
});

test('toda semilla y todo gesto se quedan en la pentatónica o en el acorde', () => {
  for (let seed = 0; seed < 1024; seed += 1) {
    for (const cues of [{}, LOUD_CUES]) {
      const intent = intentFromPortrait(seed, cues);
      for (let bar = 0; bar < 8; bar += 1) {
        const allowed = new Set([...scalePitchClasses(), ...chordPitchClasses(bar)]);
        for (const note of renderBar(bar, intent, { stepsPerBar: STEPS })) {
          assert.ok(Number.isInteger(note.midi));
          assert.ok(note.midi >= 0 && note.midi <= 127, `midi ${note.midi}`);
          assert.ok(allowed.has(pitchClass(note.midi)), `nota fuera de armonía: ${note.midi}`);
          assert.ok(note.step >= 0 && note.step < STEPS);
        }
      }
    }
  }
});

test('el contorno 0 no desplaza la melodía base', () => {
  for (let index = 0; index < 10; index += 1) assert.equal(motifOffset(0, index), 0);
  assert.equal(motifOffset(3, 0), 1);
  assert.equal(motifOffset(1, 1), 1);
});

test('el tracker acepta la primera cara y exige estabilidad para cambiarla', () => {
  const tracker = createPortraitTracker({ holdMs: 900 });
  assert.equal(tracker.current, null);
  assert.equal(tracker.update(12, 0), 12, 'la primera cara entra al instante');
  assert.equal(tracker.update(12, 200), 12);

  assert.equal(tracker.update(77, 300), 12, 'todavía no hay 900 ms');
  assert.equal(tracker.pending, 77);
  assert.equal(tracker.update(77, 800), 12);
  assert.equal(tracker.update(77, 1199), 12);
  assert.equal(tracker.update(77, 1200), 77, '900 ms estables confirman el cambio');

  tracker.reset();
  assert.equal(tracker.current, null);
  assert.equal(tracker.update(5, 0), 5);
});

test('una firma que vuelve atrás cancela el candidato', () => {
  const tracker = createPortraitTracker({ holdMs: 900 });
  tracker.update(10, 0);
  tracker.update(20, 100);
  tracker.update(10, 400);
  assert.equal(tracker.pending, null);
  tracker.update(20, 500);
  assert.equal(tracker.update(20, 1000), 10, 'el candidato volvió a empezar en 500');
});

test('el HUD describe el retrato o avisa de que no hay cara', () => {
  assert.equal(describePortrait(null), 'Retrato · esperando cara');
  assert.equal(describePortrait({ empty: true }), 'Retrato · esperando cara');
  assert.match(describePortrait(intentFromPortrait(64, {})), /^Retrato · /);
});

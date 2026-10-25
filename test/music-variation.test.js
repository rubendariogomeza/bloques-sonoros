import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_INTENT,
  createIntentTracker,
  describeIntent,
  intentFromStructure,
} from '../app/src/music/variation.js';

function structure(overrides = {}) {
  return {
    empty: false,
    coverage: 0.2,
    topHeight: 0.5,
    mass: 0.15,
    baseWidth: 0.2,
    symmetry: 0.8,
    dominantColor: 'yellow',
    ...overrides,
  };
}

test('la pared vacía usa la melodía base', () => {
  assert.equal(intentFromStructure(null), BASE_INTENT);
  assert.equal(intentFromStructure(structure({ empty: true })), BASE_INTENT);
  assert.equal(intentFromStructure(structure({ coverage: 0.001 })), BASE_INTENT);
  assert.equal(describeIntent(BASE_INTENT), 'Melodía base');
});

test('la altura de la estructura elige el registro', () => {
  assert.equal(intentFromStructure(structure({ topHeight: 0.2 })).register, 2);
  assert.equal(intentFromStructure(structure({ topHeight: 0.5 })).register, 1);
  assert.equal(intentFromStructure(structure({ topHeight: 0.8 })).register, 0);
});

test('la densidad sale de la superficie ocupada', () => {
  assert.equal(intentFromStructure(structure({ mass: 0.05 })).density, 0);
  assert.equal(intentFromStructure(structure({ mass: 0.15 })).density, 1);
  assert.equal(intentFromStructure(structure({ mass: 0.4 })).density, 2);
});

test('el color dominante elige el timbre', () => {
  assert.equal(intentFromStructure(structure({ dominantColor: 'yellow' })).timbre, 0);
  assert.equal(intentFromStructure(structure({ dominantColor: 'blue' })).timbre, 1);
  assert.equal(intentFromStructure(structure({ dominantColor: 'magenta' })).timbre, 2);
});

test('base ancha y forma irregular se oyen', () => {
  const wide = intentFromStructure(structure({ baseWidth: 0.7 }));
  assert.equal(wide.bass, true);
  assert.equal(intentFromStructure(structure({ baseWidth: 0.1 })).bass, false);

  assert.equal(intentFromStructure(structure({ symmetry: 0.3 })).ornament, 1);
  assert.equal(intentFromStructure(structure({ symmetry: 0.9, mass: 0.6 })).ornament, 2);
  assert.equal(intentFromStructure(structure({ symmetry: 0.9, mass: 0.2 })).ornament, 0);
});

test('describeIntent resume la variación en una línea', () => {
  const text = describeIntent(intentFromStructure(structure({ dominantColor: 'blue', topHeight: 0.2, baseWidth: 0.8 })));
  assert.match(text, /campana/);
  assert.match(text, /agudo/);
  assert.match(text, /bajo/);
});

test('la variación solo se aplica cuando la silueta se mantiene estable', () => {
  const tracker = createIntentTracker({ holdMs: 900 });
  const stable = structure({ topHeight: 0.2, dominantColor: 'blue' });

  assert.equal(tracker.update(stable, 0).signature, 'base');
  assert.equal(tracker.update(stable, 500).signature, 'base');
  const applied = tracker.update(stable, 1000);
  assert.notEqual(applied.signature, 'base');
  assert.equal(applied.register, 2);
  assert.equal(applied.timbre, 1);
});

test('un cambio fugaz no reescribe la canción', () => {
  const tracker = createIntentTracker({ holdMs: 900 });
  const tall = structure({ topHeight: 0.2 });
  const short = structure({ topHeight: 0.9 });

  tracker.update(tall, 0);
  tracker.update(tall, 900);
  assert.notEqual(tracker.current.signature, 'base');

  const before = tracker.current.signature;
  tracker.update(short, 1000);
  tracker.update(tall, 1200);
  assert.equal(tracker.current.signature, before);
  assert.equal(tracker.pending, null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransport } from '../app/src/sequencer/transport.js';

test('deriva la duración del barrido del BPM y del compás', () => {
  const transport = createTransport({ bpm: 120, columns: 16, sweepBeats: 4 });
  assert.equal(transport.sweepDuration, 2);
  assert.equal(transport.stepDuration, 0.125);
});

test('la posición avanza de forma lineal y reinicia al llegar al final (HU-06)', () => {
  const transport = createTransport({ bpm: 120, columns: 16 });
  transport.start(10);
  assert.equal(transport.progressAt(10), 0);
  assert.equal(transport.progressAt(10.5), 0.25);
  assert.equal(transport.progressAt(11), 0.5);
  assert.ok(Math.abs(transport.progressAt(13) - 0.5) < 1e-9, 'segundo barrido');
  assert.equal(transport.passAt(13), 1);
  assert.equal(transport.columnAt(10.5), 4);
});

test('cambiar el BPM conserva la posición actual (HU-07)', () => {
  const transport = createTransport({ bpm: 120, columns: 16 });
  transport.start(0);
  const before = transport.progressAt(1.5);
  const boundariesBefore = transport.boundaryAt(1.5);
  transport.setBpm(75, 1.5);
  assert.ok(Math.abs(transport.progressAt(1.5) - before) < 1e-9);
  assert.ok(Math.abs(transport.boundaryAt(1.5) - boundariesBefore) < 1e-9);
  assert.equal(transport.sweepDuration, (4 * 60) / 75);
  assert.ok(transport.timeOfBoundary(transport.nextBoundaryAfter(1.5)) > 1.5);
});

test('las fronteras siguen siendo continuas tras el cambio de tempo', () => {
  const transport = createTransport({ bpm: 120, columns: 16 });
  transport.start(0);
  const nextBefore = transport.nextBoundaryAfter(0.8);
  const timeBefore = transport.timeOfBoundary(nextBefore);
  transport.setBpm(60, 0.8);
  const timeAfter = transport.timeOfBoundary(nextBefore);
  assert.ok(timeAfter > 0.8);
  assert.notEqual(Math.round(timeBefore * 1000), Math.round(timeAfter * 1000));
  // El orden temporal de las fronteras no se invierte.
  assert.ok(transport.timeOfBoundary(nextBefore + 1) > timeAfter);
});

test('10 minutos simulados sin drift acumulado', () => {
  const transport = createTransport({ bpm: 96, columns: 16, sweepBeats: 4 });
  transport.start(0);
  const duration = 600;
  const boundary = Math.round(transport.totalAt(duration) * 16);
  const time = transport.timeOfBoundary(boundary);
  assert.ok(Math.abs(time - duration) <= 1e-6, `error ${time - duration}`);
  assert.ok(Math.abs(transport.progressAt(duration) - transport.progressAt(boundary / 16 / transport.totalAt(duration) * duration)) < 1e-9);
});

test('cambiar columnas mantiene la posición y recalcula los pasos', () => {
  const transport = createTransport({ bpm: 100, columns: 16 });
  transport.start(0);
  const before = transport.progressAt(1.2);
  transport.setColumns(8, 1.2);
  assert.ok(Math.abs(transport.progressAt(1.2) - before) < 1e-9);
  assert.equal(transport.columns, 8);
  assert.ok(Math.abs(transport.stepDuration - transport.sweepDuration / 8) < 1e-12);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransport } from '../app/src/sequencer/transport.js';
import { createScheduler } from '../app/src/sequencer/scheduler.js';

function harness() {
  let clock = 0;
  const steps = [];
  const timers = [];
  const transport = createTransport({ bpm: 120, columns: 16, sweepBeats: 4 });
  const scheduler = createScheduler({
    transport,
    clock: () => clock,
    onStep: (step) => steps.push(step),
    setTimer: (fn) => {
      timers.push(fn);
      return timers.length;
    },
    clearTimer: () => {},
    lookahead: 0.15,
    stagger: 0.05,
  });

  function advance(dt, times = 1) {
    for (let i = 0; i < times; i += 1) {
      clock += dt;
      const pending = timers.splice(0);
      for (const fn of pending) fn();
    }
  }

  return {
    scheduler,
    transport,
    steps,
    advance,
    get clock() {
      return clock;
    },
  };
}

test('programa pasos por delante del reloj de audio', () => {
  const { scheduler, steps, advance } = harness();
  scheduler.start();
  assert.equal(steps.length, 1);
  assert.equal(steps[0].boundary, 0);
  assert.equal(steps[0].column, 0);
  assert.ok(Math.abs(steps[0].time - 0.05) < 1e-9);

  advance(0.1);
  assert.equal(steps.length, 2);
  assert.equal(steps[1].column, 1);
  assert.ok(Math.abs(steps[1].time - steps[0].time - 0.125) < 1e-9);
  scheduler.stop();
});

test('el BPM nuevo no reinicia ni duplica pasos', () => {
  const { scheduler, steps, advance } = harness();
  scheduler.start();
  advance(0.1);
  const before = steps.length;
  scheduler.setBpm(60);
  // A 60 BPM el paso dura 0,25 s: hay que avanzar varios ticks para ver el siguiente.
  advance(0.1, 4);
  assert.ok(steps.length > before);
  const boundaries = steps.map((step) => step.boundary);
  assert.deepEqual(boundaries, [...boundaries].sort((a, b) => a - b));
  assert.equal(new Set(boundaries).size, boundaries.length);
  for (let i = 1; i < steps.length; i += 1) {
    assert.ok(steps[i].time > steps[i - 1].time, 'los tiempos deben crecer');
  }
  scheduler.stop();
});

test('un salto de reloj no dispara una ráfaga de notas atrasadas', () => {
  const { scheduler, steps, advance, clock } = harness();
  scheduler.start();
  steps.length = 0;
  advance(5);
  assert.ok(steps.length <= 6, `pasos disparados: ${steps.length}`);
  for (const step of steps) assert.ok(step.time >= clock - 0.25);
  scheduler.stop();
});

test('pausa y reanudación conservan la numeración de pasos', () => {
  const { scheduler, steps, advance } = harness();
  scheduler.start();
  advance(0.3);
  const lastBoundary = scheduler.nextBoundary;
  scheduler.stop();
  const count = steps.length;
  advance(0.2);
  assert.equal(steps.length, count, 'detenido no debe programar');
  scheduler.start({ reset: false });
  advance(0.1);
  assert.ok(steps.length > count);
  assert.ok(steps[count].boundary >= lastBoundary);
  scheduler.stop();
});

test('el lookahead ampliado cubre pestañas en segundo plano', () => {
  const { scheduler, steps, advance } = harness();
  scheduler.start();
  steps.length = 0;
  scheduler.setLookahead(1.6);
  advance(1);
  const horizon = steps[steps.length - 1].time;
  assert.ok(horizon > 1.4, `último paso en ${horizon}`);
  scheduler.stop();
});

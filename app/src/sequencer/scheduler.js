/**
 * Scheduler de lookahead.
 *
 * `setTimeout` cada 25 ms solo despierta al planificador; la verdad temporal es
 * `AudioContext.currentTime`. Las notas se programan con hasta 120 ms de
 * antelación (1,6 s si la pestaña está en segundo plano), lo que evita el drift
 * del `setInterval` y los huecos por throttling.
 */
import { mod } from '../core/util.js';

export const LOOKAHEAD_FOREGROUND = 0.12;
export const LOOKAHEAD_BACKGROUND = 1.6;
export const TICK_MS = 25;

export function createScheduler({
  transport,
  onStep,
  clock,
  lookahead = LOOKAHEAD_FOREGROUND,
  tickMs = TICK_MS,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (handle) => clearTimeout(handle),
  stagger = 0.06,
} = {}) {
  if (typeof onStep !== 'function') throw new Error('createScheduler requiere onStep');
  if (typeof clock !== 'function') throw new Error('createScheduler requiere clock');

  let running = false;
  let nextBoundary = 0;
  let timer = null;
  let horizon = lookahead;
  let stepCount = 0;

  function scheduleWindow(now) {
    const limit = now + horizon;
    let guard = 0;
    while (guard < 512) {
      guard += 1;
      const time = transport.timeOfBoundary(nextBoundary);
      if (time > limit) break;
      // Notas cuyo instante ya pasó (pestaña dormida) se descartan: no se agolpan.
      if (time >= now - 0.25) {
        onStep({
          boundary: nextBoundary,
          column: mod(nextBoundary, transport.columns),
          pass: Math.floor(nextBoundary / transport.columns),
          time,
        });
        stepCount += 1;
      }
      nextBoundary += 1;
    }
  }

  function tick() {
    if (!running) return;
    scheduleWindow(clock());
    timer = setTimer(tick, tickMs);
  }

  function start({ at, reset = true } = {}) {
    if (running) return;
    const now = clock();
    const startAt = at ?? now + stagger;
    if (reset) {
      transport.start(startAt);
      nextBoundary = 0;
      stepCount = 0;
    } else {
      // Reanudación: la posición y las fronteras se conservan porque el reloj de
      // AudioContext se detuvo junto con el motor.
      nextBoundary = Math.max(nextBoundary, transport.nextBoundaryAfter(now));
    }
    running = true;
    scheduleWindow(now);
    timer = setTimer(tick, tickMs);
  }

  function stop() {
    running = false;
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  /** Recalcula la próxima frontera tras un salto de reloj o cambio de rejilla. */
  function resync() {
    if (!running) return;
    nextBoundary = Math.max(nextBoundary, transport.nextBoundaryAfter(clock()));
  }

  function setLookahead(value) {
    horizon = Math.max(0.02, value);
  }

  function setBpm(next) {
    transport.setBpm(next, clock());
    resync();
  }

  function setColumns(next) {
    transport.setColumns(next, clock());
    resync();
  }

  return {
    start,
    stop,
    resync,
    setLookahead,
    setBpm,
    setColumns,
    get running() {
      return running;
    },
    get lookahead() {
      return horizon;
    },
    get stepsScheduled() {
      return stepCount;
    },
    get nextBoundary() {
      return nextBoundary;
    },
  };
}

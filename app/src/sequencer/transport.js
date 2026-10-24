/**
 * Reloj musical del secuenciador.
 *
 * Matemática pura, sin Web Audio: el scheduler es el único que consulta
 * `AudioContext.currentTime`. La posición se modela como una recta:
 *
 *   total(t) = anclaTotal + (t - anclaTiempo) / duraciónBarrido
 *
 * Cada frontera de paso `N` ocurre en:
 *
 *   timeOfBoundary(N) = anclaTiempo + (N / columnas - anclaTotal) * duraciónBarrido
 *
 * Al cambiar BPM se reancla `(t, total)` en el instante actual: la posición no
 * salta (HU-07) y los números de paso siguen siendo continuos, así que el
 * scheduler no repite ni pierde notas.
 */
import { clamp, mod } from '../core/util.js';

export const MIN_BPM = 50;
export const MAX_BPM = 190;

export function createTransport({ bpm = 96, columns = 16, sweepBeats = 4 } = {}) {
  let bpmValue = clamp(bpm, MIN_BPM, MAX_BPM);
  let columnsValue = Math.max(1, Math.round(columns));
  let sweepBeatsValue = Math.max(1, sweepBeats);
  let sweepDuration = (sweepBeatsValue * 60) / bpmValue;
  let anchorTime = 0;
  let anchorTotal = 0;

  const totalAt = (time) => anchorTotal + (time - anchorTime) / sweepDuration;

  return {
    get bpm() {
      return bpmValue;
    },
    get columns() {
      return columnsValue;
    },
    get sweepBeats() {
      return sweepBeatsValue;
    },
    get sweepDuration() {
      return sweepDuration;
    },
    get stepDuration() {
      return sweepDuration / columnsValue;
    },
    get anchorTime() {
      return anchorTime;
    },
    get anchorTotal() {
      return anchorTotal;
    },
    totalAt,
    progressAt: (time) => mod(totalAt(time), 1),
    boundaryAt: (time) => totalAt(time) * columnsValue,
    passAt: (time) => Math.floor(totalAt(time)),
    columnAt: (time) => Math.floor(mod(totalAt(time) * columnsValue, columnsValue)),
    nextBoundaryAfter: (time, epsilon = 1e-6) => Math.ceil(totalAt(time) * columnsValue + epsilon),
    timeOfBoundary: (boundary) =>
      anchorTime + (boundary / columnsValue - anchorTotal) * sweepDuration,

    /** Reancla conservando la posición actual. */
    setBpm(next, now) {
      const total = totalAt(now);
      bpmValue = clamp(next, MIN_BPM, MAX_BPM);
      sweepDuration = (sweepBeatsValue * 60) / bpmValue;
      anchorTime = now;
      anchorTotal = total;
      return bpmValue;
    },

    setColumns(next, now) {
      const total = totalAt(now);
      columnsValue = Math.max(1, Math.round(next));
      anchorTime = now;
      anchorTotal = total;
      return columnsValue;
    },

    setSweepBeats(next, now) {
      const total = totalAt(now);
      const progress = mod(total, 1);
      sweepBeatsValue = Math.max(1, next);
      sweepDuration = (sweepBeatsValue * 60) / bpmValue;
      anchorTime = now;
      anchorTotal = Math.floor(total) + progress;
      return sweepBeatsValue;
    },

    /** Arranca (o reinicia) en `now` desde el inicio del barrido. */
    start(now = 0) {
      anchorTime = now;
      anchorTotal = 0;
    },
  };
}

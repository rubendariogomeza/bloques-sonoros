/** Mapeos espaciales y escalas musicales (puro). */
import { clamp, mod } from '../core/util.js';

export const SCALES = Object.freeze({
  pentatonic: Object.freeze({ id: 'pentatonic', name: 'Pentatónica', steps: [0, 2, 4, 7, 9] }),
  major: Object.freeze({ id: 'major', name: 'Mayor', steps: [0, 2, 4, 5, 7, 9, 11] }),
  minor: Object.freeze({ id: 'minor', name: 'Menor', steps: [0, 2, 3, 5, 7, 8, 10] }),
  blues: Object.freeze({ id: 'blues', name: 'Blues', steps: [0, 3, 5, 6, 7, 10] }),
});

export function xToColumn(x, columns) {
  return clamp(Math.floor(x * columns), 0, columns - 1);
}

export function columnCenter(column, columns) {
  return (column + 0.5) / columns;
}

/** 0 = arriba (agudo), 1 = abajo (grave). */
export function yToDegree(y, degrees) {
  const inverted = clamp(1 - y, 0, 0.999999);
  return Math.min(degrees - 1, Math.floor(inverted * degrees));
}

/** Semitonos respecto a la fundamental para una altura y una escala dadas. */
export function yToSemitones(y, scale = SCALES.pentatonic, octaves = 2) {
  const steps = scale.steps ?? SCALES.pentatonic.steps;
  const total = steps.length * octaves;
  const degree = yToDegree(y, total);
  const octave = Math.floor(degree / steps.length);
  return steps[mod(degree, steps.length)] + octave * 12;
}

export function semitonesToRate(semitones) {
  return 2 ** (semitones / 12);
}

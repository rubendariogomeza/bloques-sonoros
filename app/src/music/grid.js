/**
 * Altura de cada fila de la parrilla.
 *
 * La fila 0 es la de arriba (agudo) y la última la de abajo (grave). Todas las
 * notas salen de la pentatónica de Do: cualquier combinación de bloques y filas
 * es consonante por construcción, sin corregir nada sobre la marcha.
 *
 * Cada instrumento conserva su registro: la escalera de ocho grados se centra en
 * la nota natural del sample, así el bajo se queda grave y la campana aguda.
 */
import { GRID_ROWS } from '../core/config.js';
import { clamp } from '../core/util.js';
import { KEY_MIDI, PENTATONIC } from './song.js';

/** Nota MIDI del grado pentatónico `degree` (puede ser negativo) en la tonalidad. */
export function pentatonicMidi(degree, keyMidi = KEY_MIDI) {
  const steps = PENTATONIC.length;
  const octave = Math.floor(degree / steps);
  const step = PENTATONIC[((degree % steps) + steps) % steps];
  return keyMidi + octave * 12 + step;
}

/** Grado pentatónico más cercano a una nota MIDI. */
export function degreeForMidi(midi, keyMidi = KEY_MIDI) {
  return Math.round(((midi - keyMidi) / 12) * PENTATONIC.length);
}

/**
 * Nota de una fila para un instrumento cuya nota natural es `baseMidi`.
 * @returns {number} nota MIDI dentro de la pentatónica de Do
 */
export function gridMidi(baseMidi, row, rows = GRID_ROWS, keyMidi = KEY_MIDI) {
  const safeRows = Math.max(1, Math.round(rows));
  const safeRow = clamp(Math.round(row), 0, safeRows - 1);
  const base = Number.isFinite(baseMidi) ? baseMidi : keyMidi;
  // La fila central queda sobre la nota natural del instrumento.
  const topDegree = degreeForMidi(base, keyMidi) + Math.floor((safeRows - 1) / 2);
  return pentatonicMidi(topDegree - safeRow, keyMidi);
}

/** Escalera completa de arriba a abajo, útil para pruebas y diagnóstico. */
export function gridLadder(baseMidi, rows = GRID_ROWS, keyMidi = KEY_MIDI) {
  const safeRows = Math.max(1, Math.round(rows));
  return Array.from({ length: safeRows }, (_, row) => gridMidi(baseMidi, row, safeRows, keyMidi));
}

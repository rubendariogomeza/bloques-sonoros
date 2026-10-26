/**
 * Kits de sonido. Cada kit mapea los 10 colores del kit físico a un sample y
 * declara si la altura del bloque influye en la nota.
 */
import { COLOR_CLASSES } from '../core/config.js';
import { SAMPLE_IDS, SAMPLE_LABELS, SAMPLE_BASE_MIDI } from './synth.js';
import { SCALES } from '../sequencer/pattern.js';

export const KITS = Object.freeze([
  Object.freeze({
    id: 'percussion',
    name: 'Percusión del aula',
    description: 'Batería, palmas y maderas. El kit de arranque.',
    mode: 'percussion',
    scale: 'pentatonic',
    mapping: Object.freeze({
      red: 'kick',
      orange: 'tomLow',
      yellow: 'snare',
      green: 'hat',
      cyan: 'openhat',
      blue: 'clap',
      purple: 'cowbell',
      magenta: 'rim',
      white: 'shaker',
      black: 'wood',
    }),
  }),
  Object.freeze({
    id: 'grid',
    name: 'Parrilla',
    description: 'Diez instrumentos afinados, uno por color. La fila elige la nota.',
    mode: 'melodic',
    scale: 'pentatonic',
    mapping: Object.freeze({
      red: 'marimba',
      orange: 'kalimba',
      yellow: 'bell',
      green: 'pluck',
      cyan: 'glass',
      blue: 'chime',
      purple: 'musicbox',
      magenta: 'cello',
      white: 'flute',
      black: 'bass',
    }),
  }),
  Object.freeze({
    id: 'melodic',
    name: 'Marimba mágica',
    description: 'La altura del bloque elige la nota: arriba suena agudo.',
    mode: 'melodic',
    scale: 'pentatonic',
    mapping: Object.freeze({
      red: 'marimba',
      orange: 'marimba',
      yellow: 'bell',
      green: 'pluck',
      cyan: 'bell',
      blue: 'marimba',
      purple: 'chime',
      magenta: 'pluck',
      white: 'bell',
      black: 'bass',
    }),
  }),
  Object.freeze({
    id: 'nature',
    name: 'Bosque sonoro',
    description: 'Maderas, agua y campanas para paisajes tranquilos.',
    mode: 'percussion',
    scale: 'pentatonic',
    mapping: Object.freeze({
      red: 'wood',
      orange: 'water',
      yellow: 'chime',
      green: 'shaker',
      cyan: 'water',
      blue: 'bell',
      purple: 'chime',
      magenta: 'pluck',
      white: 'shaker',
      black: 'wood',
    }),
  }),
]);

export const KIT_IDS = KITS.map((kit) => kit.id);

export const GRID_KIT_ID = 'grid';
export const GRID_KIT = getKit(GRID_KIT_ID);

/** Samples con altura definida: los únicos que pueden sonar en la parrilla. */
export const PITCHED_SAMPLE_IDS = Object.freeze(Object.keys(SAMPLE_BASE_MIDI));

export function isPitchedSample(sampleId) {
  return Object.hasOwn(SAMPLE_BASE_MIDI, sampleId);
}

export function getKit(kitId) {
  return KITS.find((kit) => kit.id === kitId) ?? KITS[0];
}

export function kitSampleIds(kit = KITS[0], extraIds = []) {
  return [...new Set([...Object.values(kit.mapping), ...extraIds])];
}

export function kitScale(kit) {
  return SCALES[kit?.scale] ?? SCALES.pentatonic;
}

export function defaultMapping(kitId) {
  return { ...getKit(kitId).mapping };
}

/** Rellena huecos y descarta muestras inexistentes de un mapeo guardado. */
export function sanitizeMapping(kit, candidate = {}) {
  const mapping = {};
  for (const color of COLOR_CLASSES) {
    const value = candidate[color];
    mapping[color] = SAMPLE_IDS.includes(value) ? value : kit.mapping[color] ?? 'wood';
  }
  return mapping;
}

/**
 * Mapeo de la parrilla: solo instrumentos con altura. Si un ajuste guardado
 * apunta a percusión, cae en el instrumento por defecto de ese color.
 */
export function sanitizePitchedMapping(candidate = {}) {
  const mapping = {};
  for (const color of COLOR_CLASSES) {
    const value = candidate[color];
    mapping[color] = isPitchedSample(value) ? value : GRID_KIT.mapping[color];
  }
  return mapping;
}

export const SAMPLE_OPTIONS = SAMPLE_IDS.filter((id) => id !== 'click').map((id) => ({
  id,
  label: SAMPLE_LABELS[id] ?? id,
}));

/** Lista de la hoja de Sonidos cuando manda la parrilla. */
export const PITCHED_SAMPLE_OPTIONS = PITCHED_SAMPLE_IDS.map((id) => ({
  id,
  label: SAMPLE_LABELS[id] ?? id,
}));

export function sampleLabel(sampleId) {
  return SAMPLE_LABELS[sampleId] ?? sampleId;
}

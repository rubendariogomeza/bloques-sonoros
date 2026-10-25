/**
 * Kits de sonido. Cada kit mapea los 10 colores del kit físico a un sample y
 * declara si la altura del bloque influye en la nota.
 */
import { COLOR_CLASSES } from '../core/config.js';
import { SAMPLE_IDS, SAMPLE_LABELS } from './synth.js';
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

export const SAMPLE_OPTIONS = SAMPLE_IDS.filter((id) => id !== 'click').map((id) => ({
  id,
  label: SAMPLE_LABELS[id] ?? id,
}));

export function sampleLabel(sampleId) {
  return SAMPLE_LABELS[sampleId] ?? sampleId;
}

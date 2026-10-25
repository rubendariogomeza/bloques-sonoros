/**
 * Constantes compartidas. Un solo lugar para límites y valores por defecto.
 */

export const APP = Object.freeze({
  name: 'Bloques Sonoros',
  subtitle: 'Secuenciador musical tangible',
  version: '0.1.0',
});

export const STORAGE_KEYS = Object.freeze({
  license: 'mt.license.v1',
  settings: 'mt.settings.v1',
  device: 'mt.device.v1',
});

/** Columnas = pasos por barrido. 16 equivale a semicorcheas en un compás de 4/4. */
export const COLUMN_CHOICES = Object.freeze([8, 12, 16, 24]);
export const SWEEP_BEATS = 4;

export const LIMITS = Object.freeze({
  bpm: Object.freeze([50, 190]),
  volume: Object.freeze([0, 1]),
  /** Voces simultáneas máximas. Más que esto satura en móviles de gama media. */
  voices: 48,
  /** Frecuencia objetivo del pipeline de visión. */
  visionFps: 20,
  /** Ancho de muestreo del frame de visión. */
  visionWidth: 320,
});

export const DEFAULTS = Object.freeze({
  bpm: 96,
  columns: 16,
  kitId: 'percussion',
  volume: 0.85,
  /** 0 = detecta solo cambios grandes, 1 = muy sensible. */
  sensitivity: 0.5,
  showStats: false,
  /** Compensación de latencia cámara → audio, en milisegundos. */
  inputOffsetMs: 0,
  /** Melodía guiada: la estructura varía la canción en vez de disparar notas sueltas. */
  melody: true,
  /** Acentos suaves al cruzar bloques, siempre dentro de la escala. */
  accents: true,
  /** Reproducir un clic de referencia al iniciar cada barrido. */
  metronome: false,
  muted: false,
});

/** Colores canónicos del kit físico. El orden define la paleta de la UI. */
export const COLOR_CLASSES = Object.freeze([
  'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'magenta', 'white', 'black',
]);

export const COLOR_LABELS = Object.freeze({
  red: 'Rojo',
  orange: 'Naranja',
  yellow: 'Amarillo',
  green: 'Verde',
  cyan: 'Cian',
  blue: 'Azul',
  purple: 'Morado',
  magenta: 'Rosa',
  white: 'Blanco',
  black: 'Negro',
});

export const COLOR_HEX = Object.freeze({
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#facc15',
  green: '#22c55e',
  cyan: '#06b6d4',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  magenta: '#ec4899',
  white: '#e5e7eb',
  black: '#1f2937',
});

/**
 * Constantes compartidas. Un solo lugar para límites y valores por defecto.
 */

export const APP = Object.freeze({
  name: 'Bloques Sonoros',
  subtitle: 'Secuenciador musical tangible',
  version: '0.1.0',
});

/**
 * Modo de pruebas con el kit físico.
 *
 * `true` desactiva la pantalla de licencia por QR y habilita la cámara sin
 * canjear ningún código. Sirve para enviar un enlace de prueba a quien tiene
 * los cubos. Vuelve a `false` para producción: el bloqueo por QR sigue intacto.
 */
export const TEST_MODE = true;

export const STORAGE_KEYS = Object.freeze({
  license: 'mt.license.v1',
  settings: 'mt.settings.v1',
  device: 'mt.device.v1',
});

/** Columnas = pasos por barrido. 16 equivale a semicorcheas en un compás de 4/4. */
export const COLUMN_CHOICES = Object.freeze([8, 12, 16, 24]);
export const SWEEP_BEATS = 4;

/**
 * Filas de la parrilla de color. Cada fila es un grado pentatónico: arriba
 * agudo, abajo grave. Ocho filas cubren algo más de una octava.
 */
export const GRID_ROWS = 8;

/**
 * Modos de juego. La parrilla manda; Retrato es el cuarto modo y los otros dos
 * quedan como alternativas.
 */
export const PLAY_MODES = Object.freeze(['grid', 'portrait', 'melody', 'blocks']);

export const PLAY_MODE_LABELS = Object.freeze({
  grid: 'Parrilla',
  portrait: 'Retrato',
  melody: 'Melodía',
  blocks: 'Bloques',
});

/**
 * Retrato sonoro: la cara más grande de la escena elige una canción estable a
 * partir de rasgos agregados (tono de piel, pelo, proporción, línea de ojos).
 * La firma vive solo en memoria: no se guarda ni se envía.
 */
export const PORTRAIT = Object.freeze({
  holdMs: 900,
  minArea: 0.012,
  maxArea: 0.5,
  minFill: 0.35,
  minAspect: 0.55,
  maxAspect: 1.75,
  confirmHits: 2,
  ttlMs: 300,
});

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
  /** `grid`: cada cuadro suena con el instrumento de su color. */
  playMode: 'grid',
  /** Consentimiento explícito para procesar caras (solo en el dispositivo). */
  portraitConsent: false,
  /** Acentos suaves al cruzar bloques (solo en el modo melodía). */
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
  black: '#161616',
});

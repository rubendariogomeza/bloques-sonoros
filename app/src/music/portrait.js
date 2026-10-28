/**
 * De una firma de rostro a una canción.
 *
 * La firma (semilla 0..1023) elige de forma determinista las cinco dimensiones
 * que ya usa la melodía reactiva: registro, densidad, timbre, bajo y adorno. La
 * expresión añade una capa de gesto —boca abierta, sonrisa, ojos cerrados— que
 * se aplica al empezar el compás, nunca a mitad de nota.
 *
 * Todo sigue dentro de la pentatónica de Do: ninguna cara puede desafinar.
 */
import { clamp } from '../core/util.js';
import { describeIntent } from './variation.js';

/** Contornos melódicos disponibles. Cada uno desplaza grados pentatónicos. */
export const PORTRAIT_MOTIFS = 5;

const MOTIF_OFFSETS = Object.freeze([
  Object.freeze([0, 0, 0, 0, 0]),
  Object.freeze([0, 1, 0, -1, 0]),
  Object.freeze([0, 2, 1, 2, 0]),
  Object.freeze([1, 0, -1, 0, 1]),
  Object.freeze([0, -1, 1, 0, -1]),
]);

/** Mezcla de bits: la semilla elige cada dimensión sin correlaciones visibles. */
function mix(value, salt) {
  let x = (value + Math.imul(salt, 0x9e3779b9)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

/**
 * Variación estable de un rostro + modulación de su expresión.
 * @param {number} seed 0..1023
 * @param {{mouth?:number, smile?:number, eyes?:number, tilt?:number, motion?:number}} cues
 */
export function intentFromPortrait(seed, cues = {}) {
  const value = Math.abs(Math.round(Number(seed) || 0)) % 1024;
  let register = mix(value, 1) % 3;
  let density = mix(value, 2) % 3;
  const timbre = mix(value, 3) % 3;
  const bass = (mix(value, 4) & 1) === 1;
  let ornament = mix(value, 5) % 3;
  let motif = mix(value, 6) % PORTRAIT_MOTIFS;

  const mouth = clamp(Number(cues.mouth) || 0, 0, 1);
  const smile = clamp(Number(cues.smile) || 0, 0, 1);
  const eyesValue = Number(cues.eyes);
  const eyes = clamp(Number.isFinite(eyesValue) ? eyesValue : 0.5, 0, 1);
  const tilt = clamp(Number(cues.tilt) || 0, -1, 1);

  // Gesto: cambios acotados, nunca de tonalidad.
  if (mouth > 0.55) density = Math.min(2, density + 1);
  if (smile > 0.82) ornament = 2;
  else if (smile > 0.6) ornament = Math.max(ornament, 1);
  if (eyes < 0.22) register = Math.max(0, register - 1);
  if (Math.abs(tilt) > 0.55) motif = (motif + 1) % PORTRAIT_MOTIFS;

  return {
    register,
    density,
    timbre,
    bass,
    ornament,
    motif,
    seed: value,
    signature: `${value}|${register}|${density}|${timbre}|${bass ? 1 : 0}|${ornament}|${motif}`,
    empty: false,
    portrait: true,
  };
}

/** Desplazamiento pentatónico del contorno `motif` para la nota `index`. */
export function motifOffset(motif, index) {
  const offsets = MOTIF_OFFSETS[clamp(Math.round(motif) || 0, 0, PORTRAIT_MOTIFS - 1)];
  return offsets[Math.abs(index) % offsets.length];
}

/**
 * Confirma una firma nueva solo si se mantiene `holdMs` estable. La primera
 * cara se acepta de inmediato para no arrancar en silencio; cambiar de persona
 * exige estabilidad, igual que la variación por silueta.
 */
export function createPortraitTracker({ holdMs = 900 } = {}) {
  let current = null;
  let candidate = null;
  let since = 0;

  function update(seed, now) {
    const next = Math.abs(Math.round(Number(seed) || 0)) % 1024;
    if (current == null) {
      current = next;
      candidate = null;
      return current;
    }
    if (next === current) {
      candidate = null;
      return current;
    }
    if (candidate !== next) {
      candidate = next;
      since = now;
      return current;
    }
    if (now - since >= holdMs) {
      current = next;
      candidate = null;
    }
    return current;
  }

  function reset() {
    current = null;
    candidate = null;
    since = 0;
  }

  return {
    update,
    reset,
    get current() {
      return current;
    },
    get pending() {
      return candidate;
    },
  };
}

/** Texto corto para el HUD: «Retrato · campana · agudo · corcheas». */
export function describePortrait(intent) {
  if (!intent || intent.empty) return 'Retrato · esperando cara';
  return `Retrato · ${describeIntent(intent)}`;
}

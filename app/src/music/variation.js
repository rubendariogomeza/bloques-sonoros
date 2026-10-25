/**
 * De la silueta a la música.
 *
 * La estructura no dispara notas una a una (con muchos bloques eso suena a
 * caos): elige una **variación** de la melodía. Cada dimensión es un cambio
 * audible pero acotado, y todas las notas siguen perteneciendo a la escala y al
 * acorde del compás, así que ninguna combinación desafina.
 *
 * La variación se confirma solo si la silueta se mantiene estable: mover un
 * bloque no debe reescribir la canción a mitad de compás.
 */
export const REGISTER_LABELS = Object.freeze(['grave', 'medio', 'agudo']);
export const DENSITY_LABELS = Object.freeze(['negras', 'corcheas', 'semicorcheas']);
export const TIMBRE_LABELS = Object.freeze(['marimba', 'campana', 'pizzicato']);
export const ORNAMENT_LABELS = Object.freeze(['sin adorno', 'arpegio', 'trino']);

const WARM = new Set(['red', 'orange', 'yellow']);
const COOL = new Set(['green', 'cyan', 'blue', 'purple']);

/** Variación neutra: la que suena con la pared vacía. */
export const BASE_INTENT = Object.freeze({
  register: 1,
  density: 1,
  timbre: 0,
  bass: false,
  ornament: 0,
  signature: 'base',
  empty: true,
});

/** Umbrales de silueta → variación. Ajustables sin tocar la música. */
export const THRESHOLDS = Object.freeze({
  coverage: 0.004,
  registerHigh: 0.34,
  registerMid: 0.62,
  densityLow: 0.08,
  densityHigh: 0.26,
  base: 0.45,
  symmetry: 0.5,
  full: 0.45,
});

export function intentFromStructure(structure, thresholds = THRESHOLDS) {
  if (!structure || structure.empty || structure.coverage < thresholds.coverage) return BASE_INTENT;

  const register =
    structure.topHeight < thresholds.registerHigh ? 2 : structure.topHeight < thresholds.registerMid ? 1 : 0;
  const density =
    structure.mass < thresholds.densityLow ? 0 : structure.mass < thresholds.densityHigh ? 1 : 2;
  const color = structure.dominantColor;
  const timbre = WARM.has(color) ? 0 : COOL.has(color) ? 1 : 2;
  const bass = structure.baseWidth > thresholds.base;
  const ornament = structure.symmetry < thresholds.symmetry ? 1 : structure.mass > thresholds.full ? 2 : 0;

  return {
    register,
    density,
    timbre,
    bass,
    ornament,
    signature: `${register}|${density}|${timbre}|${bass ? 1 : 0}|${ornament}`,
    empty: false,
  };
}

/** Texto corto para el HUD: «Campana · agudo · corcheas · bajo». */
export function describeIntent(intent = BASE_INTENT) {
  if (!intent || intent.empty) return 'Melodía base';
  const parts = [TIMBRE_LABELS[intent.timbre] ?? TIMBRE_LABELS[0], REGISTER_LABELS[intent.register] ?? 'medio'];
  if (intent.density !== 1) parts.push(DENSITY_LABELS[intent.density] ?? 'corcheas');
  if (intent.ornament !== 0) parts.push(ORNAMENT_LABELS[intent.ornament] ?? '');
  if (intent.bass) parts.push('bajo');
  return parts.filter(Boolean).join(' · ');
}

/**
 * Confirma una variación solo cuando la silueta lleva `holdMs` estable.
 * Devolver siempre la variación vigente: el llamador la aplica al empezar el
 * compás, nunca a mitad de nota.
 */
export function createIntentTracker({ holdMs = 900 } = {}) {
  let current = BASE_INTENT;
  let candidate = null;
  let since = 0;

  function update(structure, now) {
    const next = intentFromStructure(structure);
    if (next.signature === current.signature) {
      candidate = null;
      return current;
    }
    if (!candidate || candidate.signature !== next.signature) {
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
    current = BASE_INTENT;
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

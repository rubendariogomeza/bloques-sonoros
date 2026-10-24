/** Utilidades puras y pequeñas. Sin DOM, sin efectos. */

export const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);

export const lerp = (a, b, t) => a + (b - a) * t;

export const mod = (value, n) => ((value % n) + n) % n;

/** Media móvil exponencial in-place sobre un acumulador. */
export const ema = (previous, next, alpha) => previous + (next - previous) * alpha;

export const createId = (prefix = 'id') =>
  `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;

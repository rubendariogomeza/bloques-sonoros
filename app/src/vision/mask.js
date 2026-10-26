/**
 * Máscara de primer plano con umbral dinámico, histéresis y decaimiento temporal.
 *
 * Distancia usada: luma absoluta + cromaticidad normalizada. La cromaticidad es
 * invariante a la exposición, de modo que subir el brillo de la habitación no
 * convierte el fondo en "objeto" pero sí permite separar un bloque del mismo
 * brillo si su color difiere.
 */
import { ema } from '../core/util.js';

export const MASK_ON = 128;

export function createMaskProcessor(width, height) {
  const pixels = width * height;
  const soft = new Uint8Array(pixels);
  const binary = new Uint8Array(pixels);
  const residual = new Float32Array(pixels);

  let threshold = 0.1;
  let coverage = 0;

  function reset() {
    soft.fill(0);
    binary.fill(0);
    residual.fill(0);
    threshold = 0.1;
    coverage = 0;
  }

  /**
   * @param {Uint8ClampedArray} rgba frame actual
   * @param {ReturnType<import('./background.js').createBackgroundModel>} model
   * @param {{sensitivity?:number}} options
   */
  function update(rgba, model, { sensitivity = 0.5 } = {}) {
    const { bg, light, noise } = model;
    const n = Math.min(pixels, rgba.length >> 2);

    // Umbral: base por sensibilidad + ruido medido del sensor en este instante.
    const base = 0.048 + (1 - sensitivity) * 0.11;
    const dynamic = base + noise * 2.4;
    threshold = ema(threshold, dynamic, 0.18);
    const enter = threshold;
    const exit = threshold * 0.62;

    let foreground = 0;
    for (let p = 0; p < n; p += 1) {
      const j = p * 4;
      const i = p * 3;
      const r = rgba[j];
      const g = rgba[j + 1];
      const b = rgba[j + 2];

      const rBg = bg[i] * light;
      const gBg = bg[i + 1] * light;
      const bBg = bg[i + 2] * light;

      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const lumaBg = 0.299 * rBg + 0.587 * gBg + 0.114 * bBg;
      const dLuma = Math.abs(luma - lumaBg) / 255;

      const sumNow = r + g + b + 1e-3;
      const sumBg = rBg + gBg + bBg + 1e-3;
      const dChroma =
        (Math.abs(r / sumNow - rBg / sumBg) +
          Math.abs(g / sumNow - gBg / sumBg) +
          Math.abs(b / sumNow - bBg / sumBg)) *
        0.5;

      // La saturación distingue un bloque rojo de una mesa de madera naranja:
      // mismo brillo y tono parecido, pero el bloque está mucho más saturado.
      // Las sombras conservan la saturación del fondo, así que no se cuelan.
      const maxNow = r > g ? (r > b ? r : b) : g > b ? g : b;
      const minNow = r < g ? (r < b ? r : b) : g < b ? g : b;
      const maxBg = rBg > gBg ? (rBg > bBg ? rBg : bBg) : gBg > bBg ? gBg : bBg;
      const minBg = rBg < gBg ? (rBg < bBg ? rBg : bBg) : gBg < bBg ? gBg : bBg;
      const dSat = Math.abs((maxNow - minNow) / (maxNow + 1e-3) - (maxBg - minBg) / (maxBg + 1e-3));

      const d = 0.5 * dLuma + 0.45 * dChroma + 0.55 * dSat;
      // Sombra: mismo color, solo más oscuro. No es un bloque y no debe cambiar
      // la silueta (ni, por tanto, la variación musical).
      const ratio = luma / (lumaBg + 1e-3);
      const shadow = ratio > 0.3 && ratio < 0.92 && dChroma < 0.028;
      residual[p] = shadow ? 0 : d;

      let value = soft[p];
      if (shadow) value = Math.max(0, value - 90);
      else if (d > enter) value = Math.min(255, value + 120);
      else if (d < exit) value = Math.max(0, value - 90);
      else value = Math.max(0, value - 12);
      soft[p] = value;

      if (value >= MASK_ON) {
        binary[p] = 1;
        foreground += 1;
      } else {
        binary[p] = 0;
      }
    }

    coverage = n > 0 ? foreground / n : 0;
    return { soft, binary, threshold, coverage, residual };
  }

  return {
    width,
    height,
    soft,
    binary,
    residual,
    get threshold() {
      return threshold;
    },
    get coverage() {
      return coverage;
    },
    update,
    reset,
  };
}

/**
 * Modelo de fondo por píxel con deriva de iluminación.
 *
 * Estrategia:
 * - La calibración promedia N frames del área vacía (HU-03).
 * - La adaptación es EMA lento y solo sobre píxeles que hoy se consideran fondo,
 *   para que un bloque apoyado durante minutos no se "coma" el modelo.
 * - Se estima además un factor de luz global sobre los píxeles de fondo; así un
 *   cambio de exposición se corrige en 2-3 frames (HU-05) sin esperar al EMA.
 *
 * Todo el estado vive en typed arrays reutilizados: cero allocations por frame.
 */
import { ema } from '../core/util.js';

export function createBackgroundModel(width, height) {
  const pixels = width * height;
  const bg = new Float32Array(pixels * 3);
  const accumulator = new Float32Array(pixels * 3);
  const lightHistogram = new Uint16Array(24);
  const lightSums = new Float32Array(24);
  let calibrationFrames = 0;
  let ready = false;
  let light = 1;
  let noise = 0.01;

  /** Inicia una captura limpia. La calibración en caliente no borra el fondo actual. */
  function beginCalibration() {
    accumulator.fill(0);
    calibrationFrames = 0;
  }

  /** Acumula un frame RGBA. Devuelve true cuando hay al menos un frame. */
  function addCalibrationFrame(rgba) {
    const n = Math.min(pixels, rgba.length >> 2);
    for (let p = 0; p < n; p += 1) {
      const i = p * 3;
      const j = p * 4;
      const weight = 1 / (calibrationFrames + 1);
      accumulator[i] += (rgba[j] - accumulator[i]) * weight;
      accumulator[i + 1] += (rgba[j + 1] - accumulator[i + 1]) * weight;
      accumulator[i + 2] += (rgba[j + 2] - accumulator[i + 2]) * weight;
    }
    calibrationFrames += 1;
    // Fondo provisional desde el primer frame: el profesor ve resultado inmediato.
    bg.set(accumulator);
    light = 1;
    return true;
  }

  function commitCalibration() {
    if (calibrationFrames === 0) return false;
    bg.set(accumulator);
    noise = 0.01;
    light = 1;
    ready = true;
    return true;
  }

  /** Recalibración instantánea con el frame actual (HU-04). Sin promedios. */
  function snapshot(rgba) {
    const n = Math.min(pixels, rgba.length >> 2);
    for (let p = 0; p < n; p += 1) {
      const i = p * 3;
      const j = p * 4;
      bg[i] = rgba[j];
      bg[i + 1] = rgba[j + 1];
      bg[i + 2] = rgba[j + 2];
    }
    calibrationFrames = 1;
    noise = 0.01;
    light = 1;
    ready = true;
  }

  /**
   * Adapta el fondo. `softMask` es la confianza de primer plano (0..255).
   * `alpha` controla la velocidad de adaptación local (≈2 % por frame).
   */
  function adapt(rgba, softMask, { alpha = 0.02, lightAlpha = 0.18, maxLight = 1.65 } = {}) {
    if (!ready) return;
    const n = Math.min(pixels, rgba.length >> 2, softMask.length);

    // 1) Deriva global de iluminación: moda del cociente de luminancia.
    //    Se usan todos los píxeles y se elige el bin más votado, de modo que un
    //    bloque que ocupa parte de la mesa no arrastra la estimación.
    const BINS = 24;
    const MIN_RATIO = 0.45;
    const MAX_RATIO = 1.9;
    const histogram = lightHistogram;
    const sums = lightSums;
    histogram.fill(0);
    sums.fill(0);
    let samples = 0;
    for (let p = 0; p < n; p += 2) {
      const j = p * 4;
      const i = p * 3;
      const lumaNow = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
      const lumaBg = 0.299 * bg[i] + 0.587 * bg[i + 1] + 0.114 * bg[i + 2];
      if (lumaBg < 8) continue;
      const ratio = lumaNow / lumaBg;
      if (ratio < MIN_RATIO || ratio > MAX_RATIO) continue;
      const bin = Math.min(BINS - 1, Math.floor(((ratio - MIN_RATIO) / (MAX_RATIO - MIN_RATIO)) * BINS));
      histogram[bin] += 1;
      sums[bin] += ratio;
      samples += 1;
    }
    if (samples > pixels * 0.05) {
      let best = 0;
      for (let bin = 1; bin < BINS; bin += 1) {
        if (histogram[bin] > histogram[best]) best = bin;
      }
      if (histogram[best] > 0) {
        const observed = sums[best] / histogram[best];
        const target = Math.min(maxLight, Math.max(1 / maxLight, observed));
        light = ema(light, target, lightAlpha);
      }
    }

    // 2) EMA por píxel solo donde hay fondo seguro. Se normaliza por el factor de
    //    luz para que el modelo guarde reflectancia y no exposición: si sube la
    //    luz de la habitación, `light` lo explica y el fondo no se "quema".
    const invLight = 1 / light;
    let residualSum = 0;
    let residualCount = 0;
    for (let p = 0; p < n; p += 1) {
      const j = p * 4;
      const i = p * 3;
      const r = rgba[j] * invLight;
      const g = rgba[j + 1] * invLight;
      const b = rgba[j + 2] * invLight;
      const lumaNow = 0.299 * r + 0.587 * g + 0.114 * b;
      const lumaBg = 0.299 * bg[i] + 0.587 * bg[i + 1] + 0.114 * bg[i + 2];
      const delta = Math.abs(lumaNow - lumaBg) / 255;
      if (softMask[p] > 32) continue;
      if (delta < 0.09) {
        bg[i] += (r - bg[i]) * alpha;
        bg[i + 1] += (g - bg[i + 1]) * alpha;
        bg[i + 2] += (b - bg[i + 2]) * alpha;
        residualSum += delta;
        residualCount += 1;
      }
    }

    if (residualCount > pixels * 0.05) {
      const observed = residualSum / residualCount;
      noise = ema(noise, observed, 0.05);
    }
  }

  return {
    width,
    height,
    bg,
    get ready() {
      return ready;
    },
    get light() {
      return light;
    },
    get noise() {
      return noise;
    },
    get calibrationFrames() {
      return calibrationFrames;
    },
    beginCalibration,
    addCalibrationFrame,
    commitCalibration,
    snapshot,
    adapt,
    reset() {
      ready = false;
      calibrationFrames = 0;
      light = 1;
      noise = 0.01;
      bg.fill(0);
      accumulator.fill(0);
    },
  };
}

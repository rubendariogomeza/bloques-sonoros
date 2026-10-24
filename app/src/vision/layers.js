/**
 * Descomposición vertical de un blob en capas de color.
 *
 * Una torre de tres bloques aparece como un único blob alto. Clasificamos el
 * color fila por fila y agrupamos filas contiguas del mismo color: cada banda
 * es un bloque físico, con su altura normalizada (0 arriba, 1 abajo).
 */
import { classifyRgbFast, COLOR_ORDER } from './color.js';

const MAX_LAYERS = 6;
const MAX_SAMPLES_PER_ROW = 40;

export function createLayersExtractor(width, height) {
  const rowHistogram = new Float32Array(COLOR_ORDER.length);
  const rowColor = new Int8Array(height);

  /**
   * @returns {Array<{color:string, y:number, heightRatio:number, confidence:number}>}
   */
  function extract({ rgba, binary, blob }, { minBandRatio = 0.1, minConfidence = 0.34 } = {}) {
    const rows = blob.y1 - blob.y0 + 1;
    rowColor.fill(-1, blob.y0, blob.y1 + 1);

    for (let y = blob.y0; y <= blob.y1; y += 1) {
      rowHistogram.fill(0);
      const rowStart = y * width;
      const stepX = Math.max(1, Math.ceil((blob.x1 - blob.x0 + 1) / MAX_SAMPLES_PER_ROW));
      let samples = 0;
      for (let x = blob.x0; x <= blob.x1; x += stepX) {
        if (binary[rowStart + x] === 0) continue;
        const i = (rowStart + x) * 4;
        const cls = classifyRgbFast(rgba[i], rgba[i + 1], rgba[i + 2]);
        rowHistogram[COLOR_ORDER.indexOf(cls)] += 1;
        samples += 1;
      }
      if (samples < 3) continue;
      let best = 0;
      for (let k = 1; k < rowHistogram.length; k += 1) {
        if (rowHistogram[k] > rowHistogram[best]) best = k;
      }
      const confidence = rowHistogram[best] / samples;
      if (confidence >= minConfidence) rowColor[y] = best;
    }

    // Agrupa filas contiguas del mismo color.
    const bands = [];
    let start = -1;
    let current = -1;
    for (let y = blob.y0; y <= blob.y1 + 1; y += 1) {
      const cls = y <= blob.y1 ? rowColor[y] : -2;
      if (cls !== current) {
        if (current >= 0 && start >= 0) bands.push({ start, end: y - 1, cls: current });
        current = cls;
        start = y;
      }
    }

    // Absorbe bandas demasiado finas (bordes, brillos, transiciones) en la vecina mayor.
    const minBand = Math.max(2, Math.round(rows * minBandRatio));
    for (let i = 0; i < bands.length; i += 1) {
      const band = bands[i];
      if (band.end - band.start + 1 >= minBand) continue;
      const previous = bands[i - 1];
      const next = bands[i + 1];
      const target =
        previous && next
          ? previous.end - previous.start >= next.end - next.start
            ? previous
            : next
          : previous || next;
      if (target) {
        target.start = Math.min(target.start, band.start);
        target.end = Math.max(target.end, band.end);
        bands.splice(i, 1);
        i -= 1;
      }
    }

    // Al absorber una banda intermedia, las dos vecinas pueden quedar del mismo
    // color: se fusionan para no reportar dos bloques donde hay uno.
    const coalesced = [];
    for (const band of bands) {
      const last = coalesced[coalesced.length - 1];
      if (last && last.cls === band.cls && last.end + 1 >= band.start) {
        last.end = Math.max(last.end, band.end);
      } else {
        coalesced.push({ ...band });
      }
    }

    const layers = [];
    for (const band of coalesced) {
      if (band.cls < 0) continue;
      if (band.end - band.start + 1 < minBand * 0.6) continue;
      const centerY = (band.start + band.end) / 2;
      layers.push({
        color: COLOR_ORDER[band.cls],
        y: centerY / height,
        heightRatio: (band.end - band.start + 1) / rows,
        confidence: 1,
      });
      if (layers.length >= MAX_LAYERS) break;
    }

    if (layers.length === 0) {
      // Blob sin color dominante estable: usa el color del centro como respaldo.
      const y = Math.round(blob.cy);
      const x = Math.round(blob.cx);
      const i = (y * width + x) * 4;
      const color = classifyRgbFast(rgba[i], rgba[i + 1], rgba[i + 2]);
      return [{ color, y: blob.cy / height, heightRatio: 1, confidence: 0.2 }];
    }
    return layers;
  }

  return { extract };
}

/** Silueta del bloque: cubo, torre o tablón. Se usa para el feedback visual. */
export function classifyShape(blob) {
  if (blob.aspect > 1.55) return 'plank';
  if (1 / blob.aspect > 1.55) return 'tower';
  return 'cube';
}

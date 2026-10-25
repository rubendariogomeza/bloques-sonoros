/**
 * Silueta de la estructura.
 *
 * Los bloques reales se tocan y se fusionan en un único blob: separarlos pieza a
 * pieza es frágil (sombras, piezas del mismo color, perspectivas). La música no
 * necesita piezas, necesita la forma. Este módulo mide la estructura completa
 * sobre la máscara de primer plano: ocupación por columna, altura, base, color
 * dominante y simetría.
 *
 * El objeto devuelto se reutiliza en cada frame (sin allocations en el bucle).
 */
import { classifyRgbFast, COLOR_ORDER } from './color.js';

const NEUTRAL = new Set(['white', 'black']);

export function createStructureExtractor(width, height, columns = 16) {
  const colorCount = COLOR_ORDER.length;
  const colorIndex = new Map(COLOR_ORDER.map((color, index) => [color, index]));
  const pixelCount = width * height;

  let counts = new Int32Array(columns);
  let tops = new Int32Array(columns);
  let bottoms = new Int32Array(columns);
  let hist = new Int32Array(columns * colorCount);
  let columnWidth = width / columns;

  const structure = {
    columns: Array.from({ length: columns }, (_, index) => ({
      index,
      fill: 0,
      top: 1,
      bottom: 0,
      height: 0,
      color: null,
    })),
    colorWeights: Object.fromEntries(COLOR_ORDER.map((color) => [color, 0])),
    dominantColor: null,
    coverage: 0,
    mass: 0,
    topHeight: 1,
    baseWidth: 0,
    symmetry: 1,
    span: { x0: 0, x1: 0, y0: 0, y1: 0 },
    empty: true,
  };

  function reset() {
    for (const column of structure.columns) {
      column.fill = 0;
      column.top = 1;
      column.bottom = 0;
      column.height = 0;
      column.color = null;
    }
    for (const color of COLOR_ORDER) structure.colorWeights[color] = 0;
    structure.dominantColor = null;
    structure.coverage = 0;
    structure.mass = 0;
    structure.topHeight = 1;
    structure.baseWidth = 0;
    structure.symmetry = 1;
    structure.span = { x0: 0, x1: 0, y0: 0, y1: 0 };
    structure.empty = true;
  }

  function columnColor(column) {
    const base = column * colorCount;
    let best = -1;
    let bestCount = 0;
    let neutralBest = -1;
    let neutralCount = 0;
    for (let i = 0; i < colorCount; i += 1) {
      const value = hist[base + i];
      if (value === 0) continue;
      if (NEUTRAL.has(COLOR_ORDER[i])) {
        if (value > neutralCount) {
          neutralCount = value;
          neutralBest = i;
        }
      } else if (value > bestCount) {
        bestCount = value;
        best = i;
      }
    }
    const chosen = best >= 0 ? best : neutralBest;
    return chosen >= 0 ? COLOR_ORDER[chosen] : null;
  }

  /**
   * @param {Uint8Array} binary máscara morfológica (0 / 128)
   * @param {Uint8ClampedArray} rgba frame actual
   */
  function measure(binary, rgba) {
    counts.fill(0);
    tops.fill(height);
    bottoms.fill(-1);
    hist.fill(0);

    let total = 0;
    let x0 = width;
    let x1 = -1;
    let y0 = height;
    let y1 = -1;

    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      const sampleColor = (y & 1) === 0;
      for (let x = 0; x < width; x += 1) {
        const index = row + x;
        if (binary[index] === 0) continue;
        const column = Math.min(columns - 1, (x / columnWidth) | 0);
        counts[column] += 1;
        total += 1;
        if (y < tops[column]) tops[column] = y;
        if (y > bottoms[column]) bottoms[column] = y;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        // El color se muestrea en una rejilla 2×2: suficiente para la silueta.
        if (sampleColor && (x & 1) === 0) {
          const p = index * 4;
          hist[column * colorCount + colorIndex.get(classifyRgbFast(rgba[p], rgba[p + 1], rgba[p + 2]))] += 1;
        }
      }
    }

    if (total === 0) {
      reset();
      return structure;
    }

    let massSum = 0;
    let occupied = 0;
    let topSum = 0;
    let baseCount = 0;

    for (let column = 0; column < columns; column += 1) {
      const cell = structure.columns[column];
      const area = counts[column];
      cell.fill = area / (columnWidth * height);
      cell.top = area ? tops[column] / height : 1;
      cell.bottom = area ? (bottoms[column] + 1) / height : 0;
      cell.height = area ? (bottoms[column] - tops[column] + 1) / height : 0;
      cell.color = columnColor(column);
      massSum += cell.fill;
      if (area > 0) {
        occupied += 1;
        topSum += cell.top;
      }
      if (cell.bottom > 0.7) baseCount += 1;
    }

    let sampled = 0;
    for (const color of COLOR_ORDER) structure.colorWeights[color] = 0;
    for (let column = 0; column < columns; column += 1) {
      const base = column * colorCount;
      for (let i = 0; i < colorCount; i += 1) {
        const value = hist[base + i];
        if (value === 0) continue;
        structure.colorWeights[COLOR_ORDER[i]] += value;
        sampled += value;
      }
    }
    let dominant = null;
    let dominantWeight = 0;
    for (const color of COLOR_ORDER) {
      if (NEUTRAL.has(color)) continue;
      const weight = sampled ? structure.colorWeights[color] / sampled : 0;
      structure.colorWeights[color] = weight;
      if (weight > dominantWeight) {
        dominantWeight = weight;
        dominant = color;
      }
    }
    for (const color of NEUTRAL) {
      structure.colorWeights[color] = sampled ? structure.colorWeights[color] / sampled : 0;
    }

    let asymmetry = 0;
    const half = Math.floor(columns / 2);
    for (let column = 0; column < half; column += 1) {
      asymmetry += Math.abs(structure.columns[column].fill - structure.columns[columns - 1 - column].fill);
    }
    const meanFill = massSum / columns;

    structure.dominantColor = dominant;
    structure.coverage = total / pixelCount;
    structure.mass = meanFill;
    structure.topHeight = occupied ? topSum / occupied : 1;
    structure.baseWidth = baseCount / columns;
    structure.symmetry = half > 0 && meanFill > 0 ? Math.max(0, 1 - asymmetry / half / (meanFill + 1e-3)) : 1;
    structure.span = {
      x0: x0 / width,
      x1: (x1 + 1) / width,
      y0: y0 / height,
      y1: (y1 + 1) / height,
    };
    structure.empty = false;
    return structure;
  }

  function setColumns(next) {
    const value = Math.max(1, Math.round(next));
    if (value === columns) return;
    columns = value;
    counts = new Int32Array(columns);
    tops = new Int32Array(columns);
    bottoms = new Int32Array(columns);
    hist = new Int32Array(columns * colorCount);
    columnWidth = width / columns;
    structure.columns = Array.from({ length: columns }, (_, index) => ({
      index,
      fill: 0,
      top: 1,
      bottom: 0,
      height: 0,
      color: null,
    }));
    reset();
  }

  return {
    measure,
    setColumns,
    get structure() {
      return structure;
    },
    get columns() {
      return columns;
    },
  };
}

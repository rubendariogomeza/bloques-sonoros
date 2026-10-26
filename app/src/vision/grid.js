/**
 * Parrilla de color sobre el área de juego.
 *
 * Divide el frame en columnas × filas y, en cada cuadro, mide dos cosas sobre la
 * máscara de primer plano:
 *
 * 1. **Ocupación**: qué parte del cuadro se separa del fondo calibrado. Una
 *    pared vacía da 0 en todos los cuadros, así que no suena nada.
 * 2. **Color dominante**: se clasifica solo dentro de los píxeles ocupados. Si
 *    se mirara el cuadro entero, una pared blanca dispararía el instrumento
 *    blanco sin parar.
 *
 * Un cuadro se confirma con dos frames seguidos y se mantiene `ttlMs` para que
 * un parpadeo de detección no corte la nota. Las filas contiguas del mismo color
 * se colapsan: un bloque que cruza la frontera de dos filas suena una vez.
 *
 * El objeto `grid` y sus cuadros se reutilizan en cada frame (sin allocations
 * en el bucle de visión).
 */
import { GRID_ROWS } from '../core/config.js';
import { classifyRgbFast, COLOR_ORDER } from './color.js';

export const GRID_MIN_OCCUPANCY = 0.12;
export const GRID_CONFIRM_HITS = 2;
export const GRID_TTL_MS = 340;
/** Suavizado de la ocupación entre frames (0 = nada, 1 = solo el frame actual). */
const OCCUPANCY_ALPHA = 0.6;

export function createGridExtractor(
  width,
  height,
  {
    columns = 16,
    rows = GRID_ROWS,
    minOccupancy = GRID_MIN_OCCUPANCY,
    confirmHits = GRID_CONFIRM_HITS,
    ttlMs = GRID_TTL_MS,
  } = {},
) {
  const colorCount = COLOR_ORDER.length;
  const colorIndex = new Map(COLOR_ORDER.map((color, index) => [color, index]));
  const neutralWhite = colorIndex.get('white');
  const neutralBlack = colorIndex.get('black');

  let columnsValue = Math.max(1, Math.round(columns));
  let rowsValue = Math.max(1, Math.round(rows));

  let cellCount = 0;
  let colOfX = null;
  let rowOfY = null;
  let totals = null;
  let counts = null;
  let hist = null;
  let occupancy = null;
  let hits = null;
  let lastSeen = null;
  let activeFlags = null;
  let lastColor = null;
  let cells = null;

  const grid = {
    columns: columnsValue,
    rows: rowsValue,
    cells: [],
    active: [],
    activeCount: 0,
    coverage: 0,
  };

  function rebuild() {
    cellCount = columnsValue * rowsValue;
    colOfX = new Int32Array(width);
    rowOfY = new Int32Array(height);
    totals = new Int32Array(cellCount);
    counts = new Int32Array(cellCount);
    hist = new Int32Array(cellCount * colorCount);
    occupancy = new Float32Array(cellCount);
    hits = new Int32Array(cellCount);
    lastSeen = new Float64Array(cellCount);
    activeFlags = new Uint8Array(cellCount);
    lastColor = new Array(cellCount).fill(null);

    const colBounds = new Int32Array(columnsValue + 1);
    for (let c = 0; c <= columnsValue; c += 1) colBounds[c] = Math.round((c * width) / columnsValue);
    const rowBounds = new Int32Array(rowsValue + 1);
    for (let r = 0; r <= rowsValue; r += 1) rowBounds[r] = Math.round((r * height) / rowsValue);

    for (let c = 0; c < columnsValue; c += 1) {
      for (let x = colBounds[c]; x < colBounds[c + 1]; x += 1) colOfX[x] = c;
    }
    for (let r = 0; r < rowsValue; r += 1) {
      for (let y = rowBounds[r]; y < rowBounds[r + 1]; y += 1) rowOfY[y] = r;
    }

    cells = new Array(cellCount);
    for (let c = 0; c < columnsValue; c += 1) {
      for (let r = 0; r < rowsValue; r += 1) {
        const index = c * rowsValue + r;
        cells[index] = {
          index,
          column: c,
          row: r,
          occupancy: 0,
          color: null,
          active: false,
          playing: false,
        };
        const cellWidth = colBounds[c + 1] - colBounds[c];
        const cellHeight = rowBounds[r + 1] - rowBounds[r];
        totals[index] = Math.max(1, cellWidth * cellHeight);
      }
    }

    grid.columns = columnsValue;
    grid.rows = rowsValue;
    grid.cells = cells;
    grid.active = [];
    grid.activeCount = 0;
    grid.coverage = 0;
  }

  function reset() {
    if (!cells) return;
    occupancy.fill(0);
    hits.fill(0);
    lastSeen.fill(0);
    activeFlags.fill(0);
    lastColor.fill(null);
    for (const cell of cells) {
      cell.occupancy = 0;
      cell.color = null;
      cell.active = false;
      cell.playing = false;
    }
    grid.active.length = 0;
    grid.activeCount = 0;
    grid.coverage = 0;
  }

  /** Color mayoritario del cuadro; los neutros ceden ante cualquier color. */
  function dominantColor(index) {
    const base = index * colorCount;
    let best = -1;
    let bestCount = 0;
    let neutral = -1;
    let neutralCount = 0;
    for (let i = 0; i < colorCount; i += 1) {
      const value = hist[base + i];
      if (value === 0) continue;
      if (i === neutralWhite || i === neutralBlack) {
        if (value > neutralCount) {
          neutralCount = value;
          neutral = i;
        }
      } else if (value > bestCount) {
        bestCount = value;
        best = i;
      }
    }
    const chosen = best >= 0 ? best : neutral;
    return chosen >= 0 ? COLOR_ORDER[chosen] : null;
  }

  /**
   * @param {Uint8Array} binary máscara morfológica (0 / 1)
   * @param {Uint8ClampedArray} rgba frame actual
   * @param {number} now instante en milisegundos (para el TTL)
   */
  function measure(binary, rgba, now = 0) {
    counts.fill(0);
    hist.fill(0);

    let occupied = 0;
    for (let y = 0; y < height; y += 1) {
      const rowBase = y * width;
      const cellRow = rowOfY[y];
      const sampleRow = (y & 1) === 0;
      for (let x = 0; x < width; x += 1) {
        const p = rowBase + x;
        if (binary[p] === 0) continue;
        // Índice estable: columna * filas + fila (igual que `cells`).
        const cell = colOfX[x] * rowsValue + cellRow;
        counts[cell] += 1;
        occupied += 1;
        // Muestreo 2×2 dentro de lo ocupado: suficiente para el color y barato.
        if (sampleRow && (x & 1) === 0) {
          const q = p * 4;
          hist[cell * colorCount + colorIndex.get(classifyRgbFast(rgba[q], rgba[q + 1], rgba[q + 2]))] += 1;
        }
      }
    }

    for (let index = 0; index < cellCount; index += 1) {
      const cell = cells[index];
      const raw = counts[index] / totals[index];
      const smoothed = occupancy[index] * (1 - OCCUPANCY_ALPHA) + raw * OCCUPANCY_ALPHA;
      occupancy[index] = smoothed;

      const color = dominantColor(index) ?? lastColor[index];
      if (color) lastColor[index] = color;

      if (smoothed >= minOccupancy) {
        if (hits[index] < confirmHits) hits[index] += 1;
        lastSeen[index] = now;
      } else if (hits[index] > 0) {
        hits[index] -= 1;
      }

      if (!activeFlags[index] && hits[index] >= confirmHits) activeFlags[index] = 1;
      else if (activeFlags[index] && now - lastSeen[index] > ttlMs) {
        activeFlags[index] = 0;
        hits[index] = 0;
      }

      cell.occupancy = Math.round(smoothed * 1000) / 1000;
      cell.color = color;
      cell.active = activeFlags[index] === 1;
      cell.playing = false;
    }

    // Un bloque que cruza dos filas del mismo color suena una sola vez: en cada
    // tramo vertical contiguo se queda el cuadro con más ocupación.
    for (let c = 0; c < columnsValue; c += 1) {
      const base = c * rowsValue;
      let r = 0;
      while (r < rowsValue) {
        const cell = cells[base + r];
        if (!cell.active) {
          r += 1;
          continue;
        }
        let best = cell;
        let end = r + 1;
        while (end < rowsValue) {
          const next = cells[base + end];
          if (!next.active || next.color !== cell.color) break;
          if (next.occupancy > best.occupancy) best = next;
          end += 1;
        }
        best.playing = true;
        r = end;
      }
    }

    const active = grid.active;
    active.length = 0;
    for (let index = 0; index < cellCount; index += 1) {
      if (cells[index].playing) active.push(cells[index]);
    }
    grid.activeCount = active.length;
    grid.coverage = occupied / (width * height);
    return grid;
  }

  function setColumns(next) {
    const value = Math.max(1, Math.round(next));
    if (value === columnsValue) return;
    columnsValue = value;
    rebuild();
  }

  function setRows(next) {
    const value = Math.max(1, Math.round(next));
    if (value === rowsValue) return;
    rowsValue = value;
    rebuild();
  }

  rebuild();

  return {
    measure,
    reset,
    setColumns,
    setRows,
    get grid() {
      return grid;
    },
    get columns() {
      return columnsValue;
    },
    get rows() {
      return rowsValue;
    },
  };
}

/**
 * Modelo de ocupación por columna.
 *
 * Convierte detecciones ruidosas (20 Hz) en estado musical estable:
 * - confirmación por `hits` consecutivos (evita falsos positivos de un frame),
 * - TTL para que un parpadeo de detección no corte el sonido,
 * - una entrada por color y columna (la polifonía es el conjunto de colores).
 */
import { clamp, lerp } from '../core/util.js';

export function createColumnModel({
  columns = 16,
  confirmHits = 2,
  ttlMs = 340,
  smoothing = 0.35,
} = {}) {
  /** @type {Array<Map<string, {color:string,hits:number,lastSeen:number,y:number,shape:string,confidence:number}>>} */
  let grid = createGrid(columns);

  function createGrid(size) {
    return Array.from({ length: size }, () => new Map());
  }

  function observe(layers, now) {
    const seen = new Set();
    for (const layer of layers) {
      if (!layer.color) continue;
      const column = clamp(Math.floor(layer.column ?? 0), 0, columns - 1);
      const key = `${column}:${layer.color}`;
      const bucket = grid[column];
      const entry = bucket.get(layer.color) ?? {
        color: layer.color,
        hits: 0,
        lastSeen: now,
        y: layer.y ?? 0.5,
        shape: layer.shape ?? 'cube',
        confidence: 0,
      };
      entry.hits = Math.min(confirmHits + 4, entry.hits + 1);
      entry.lastSeen = now;
      entry.y = entry.hits <= 1 ? layer.y ?? entry.y : lerp(entry.y, layer.y ?? entry.y, smoothing);
      entry.shape = layer.shape ?? entry.shape;
      entry.confidence = Math.max(entry.confidence * 0.7, layer.confidence ?? 0.5);
      bucket.set(layer.color, entry);
      seen.add(key);
    }

    for (let column = 0; column < columns; column += 1) {
      for (const [color, entry] of grid[column]) {
        if (seen.has(`${column}:${color}`)) continue;
        entry.hits = Math.max(0, entry.hits - 1);
        if (now - entry.lastSeen > ttlMs || entry.hits === 0) grid[column].delete(color);
      }
    }
  }

  /** Columnas con al menos un bloque confirmado. */
  function active(now) {
    const result = [];
    for (let column = 0; column < columns; column += 1) {
      const entries = [];
      for (const entry of grid[column].values()) {
        if (entry.hits < confirmHits) continue;
        if (now - entry.lastSeen > ttlMs) continue;
        entries.push({ ...entry, column, x: (column + 0.5) / columns });
      }
      if (entries.length > 0) {
        entries.sort((a, b) => a.y - b.y);
        result.push({ column, x: (column + 0.5) / columns, entries });
      }
    }
    return result;
  }

  /** Lista plana para dibujar en pantalla. */
  function blocks(now) {
    const flat = [];
    for (const { column, entries } of active(now)) {
      for (const entry of entries) {
        flat.push({
          id: `${column}:${entry.color}`,
          column,
          x: (column + 0.5) / columns,
          y: entry.y,
          color: entry.color,
          shape: entry.shape,
          confidence: entry.confidence,
        });
      }
    }
    return flat;
  }

  function count(now) {
    let total = 0;
    for (const { entries } of active(now)) total += entries.length;
    return total;
  }

  function setColumns(next) {
    if (next === columns) return;
    const previous = grid;
    const previousColumns = columns;
    columns = next;
    grid = createGrid(columns);
    for (let column = 0; column < previousColumns; column += 1) {
      for (const entry of previous[column].values()) {
        const mapped = Math.min(columns - 1, Math.floor((column / previousColumns) * columns));
        grid[mapped].set(entry.color, { ...entry });
      }
    }
  }

  function clear() {
    grid = createGrid(columns);
  }

  return {
    observe,
    active,
    blocks,
    count,
    setColumns,
    clear,
    get columns() {
      return columns;
    },
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { createGridExtractor } from '../app/src/vision/grid.js';

const WIDTH = 32;
const HEIGHT = 32;
const COLUMNS = 4;
const ROWS = 4;
const CELL_W = WIDTH / COLUMNS;
const CELL_H = HEIGHT / ROWS;

function createScene() {
  const binary = new Uint8Array(WIDTH * HEIGHT);
  const rgba = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  return { binary, rgba };
}

function paintPixel(rgba, x, y, [r, g, b]) {
  const p = (y * WIDTH + x) * 4;
  rgba[p] = r;
  rgba[p + 1] = g;
  rgba[p + 2] = b;
  rgba[p + 3] = 255;
}

/** Pinta una franja vertical de un cuadro: `fromRow`/`toRow` en 0..1. */
function fillCell(scene, column, row, rgb, { fromRow = 0, toRow = 1 } = {}) {
  const { binary, rgba } = scene;
  const x0 = column * CELL_W;
  const y0 = row * CELL_H;
  const startY = y0 + Math.floor(CELL_H * fromRow);
  const endY = y0 + Math.floor(CELL_H * toRow);
  for (let y = startY; y < endY; y += 1) {
    for (let x = x0; x < x0 + CELL_W; x += 1) {
      binary[y * WIDTH + x] = 1;
      paintPixel(rgba, x, y, rgb);
    }
  }
}

function extractor(options = {}) {
  return createGridExtractor(WIDTH, HEIGHT, {
    columns: COLUMNS,
    rows: ROWS,
    minOccupancy: 0.1,
    confirmHits: 2,
    ttlMs: 100,
    ...options,
  });
}

/** Alimenta varios frames seguidos y devuelve el instante siguiente. */
function feed(ext, scene, frames, startAt = 0, step = 20) {
  let now = startAt;
  for (let i = 0; i < frames; i += 1) {
    ext.measure(scene.binary, scene.rgba, now);
    now += step;
  }
  return now;
}

test('pared vacía: ninguna celda activa ni sonando', () => {
  const ext = extractor();
  const scene = createScene();
  feed(ext, scene, 3);
  const grid = ext.grid;
  assert.equal(grid.activeCount, 0);
  assert.equal(grid.coverage, 0);
  for (const cell of grid.cells) {
    assert.equal(cell.active, false);
    assert.equal(cell.color, null);
    assert.equal(cell.playing, false);
  }
});

test('un bloque enciende su cuadro con el color correcto', () => {
  const ext = extractor();
  const scene = createScene();
  fillCell(scene, 1, 2, [20, 60, 240]);
  feed(ext, scene, 2);
  const cell = ext.grid.cells[1 * ROWS + 2];
  assert.equal(ext.grid.activeCount, 1);
  assert.equal(cell.active, true);
  assert.equal(cell.playing, true);
  assert.equal(cell.color, 'blue');
  assert.ok(cell.occupancy >= 0.1);
});

test('el color se mide solo dentro de la máscara', () => {
  const ext = extractor();
  const scene = createScene();
  // Todo el frame teñido de rojo, pero solo un cuadro ocupado y azul.
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) paintPixel(scene.rgba, x, y, [240, 20, 20]);
  }
  fillCell(scene, 0, 0, [20, 60, 240]);
  feed(ext, scene, 2);
  assert.equal(ext.grid.cells[0].color, 'blue');
});

test('un bloque blanco también enciende su cuadro', () => {
  const ext = extractor();
  const scene = createScene();
  fillCell(scene, 1, 1, [240, 240, 240]);
  feed(ext, scene, 2);
  const cell = ext.grid.cells[1 * ROWS + 1];
  assert.equal(cell.color, 'white');
  assert.equal(cell.active, true);
});

test('un cuadro deja de sonar si el bloque desaparece (TTL)', () => {
  const ext = extractor();
  const scene = createScene();
  fillCell(scene, 2, 1, [20, 200, 60]);
  const now = feed(ext, scene, 2);
  const cell = ext.grid.cells[2 * ROWS + 1];
  assert.equal(cell.active, true);

  // Se retira el bloque: la ocupación cae y el TTL apaga el cuadro.
  scene.binary.fill(0);
  feed(ext, scene, 6, now, 60);
  assert.equal(cell.active, false);
  assert.equal(ext.grid.activeCount, 0);
});

test('un bloque que cruza dos filas del mismo color suena una vez', () => {
  const ext = extractor();
  const scene = createScene();
  fillCell(scene, 1, 0, [20, 60, 240]);
  fillCell(scene, 1, 1, [20, 60, 240], { fromRow: 0, toRow: 0.5 });
  feed(ext, scene, 2);
  const top = ext.grid.cells[1 * ROWS + 0];
  const bottom = ext.grid.cells[1 * ROWS + 1];
  assert.equal(top.active, true);
  assert.equal(bottom.active, true);
  assert.equal(ext.grid.activeCount, 1);
  assert.equal(top.playing, true);
  assert.equal(bottom.playing, false);
});

test('dos colores distintos en filas contiguas suenan los dos', () => {
  const ext = extractor();
  const scene = createScene();
  fillCell(scene, 3, 2, [20, 60, 240]);
  fillCell(scene, 3, 3, [250, 220, 10]);
  feed(ext, scene, 2);
  const first = ext.grid.cells[3 * ROWS + 2];
  const second = ext.grid.cells[3 * ROWS + 3];
  assert.equal(ext.grid.activeCount, 2);
  assert.equal(first.playing, true);
  assert.equal(second.playing, true);
  assert.equal(first.color, 'blue');
  assert.equal(second.color, 'yellow');
});

test('columnas distintas se siguen por separado', () => {
  const ext = extractor();
  const scene = createScene();
  fillCell(scene, 0, 0, [20, 60, 240]);
  fillCell(scene, 2, 3, [250, 220, 10]);
  feed(ext, scene, 2);
  assert.equal(ext.grid.activeCount, 2);
  assert.equal(ext.grid.cells[0].column, 0);
  assert.equal(ext.grid.cells[2 * ROWS + 3].column, 2);
});

test('cambiar columnas reconstruye la parrilla sin celdas fantasma', () => {
  const ext = extractor();
  const scene = createScene();
  fillCell(scene, 1, 1, [20, 60, 240]);
  feed(ext, scene, 2);
  assert.ok(ext.grid.activeCount > 0);

  ext.setColumns(8);
  assert.equal(ext.grid.columns, 8);
  assert.equal(ext.grid.cells.length, 8 * ROWS);
  assert.equal(ext.grid.activeCount, 0);
});

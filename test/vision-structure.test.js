import test from 'node:test';
import assert from 'node:assert/strict';
import { createStructureExtractor } from '../app/src/vision/structure.js';

const WIDTH = 16;
const HEIGHT = 16;
const COLUMNS = 4;

function paint(rgba, x, y, [r, g, b]) {
  const p = (y * WIDTH + x) * 4;
  rgba[p] = r;
  rgba[p + 1] = g;
  rgba[p + 2] = b;
  rgba[p + 3] = 255;
}

/** Torre en la columna 0 y media torre en la 1, como una estructura real. */
function scene() {
  const binary = new Uint8Array(WIDTH * HEIGHT);
  const rgba = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      if (x < 4) {
        binary[y * WIDTH + x] = 128;
        paint(rgba, x, y, [250, 220, 10]);
      } else if (x < 8 && y >= 8) {
        binary[y * WIDTH + x] = 128;
        paint(rgba, x, y, [20, 60, 240]);
      }
    }
  }
  return { binary, rgba };
}

test('mide ocupación, altura y base de la silueta', () => {
  const extractor = createStructureExtractor(WIDTH, HEIGHT, COLUMNS);
  const { binary, rgba } = scene();
  const structure = extractor.measure(binary, rgba);

  assert.equal(structure.empty, false);
  assert.equal(structure.coverage, 0.375);
  assert.equal(structure.mass, 0.375);
  assert.equal(structure.topHeight, 0.25);
  assert.equal(structure.baseWidth, 0.5);
  assert.equal(structure.symmetry, 0);
  assert.equal(structure.columns[0].fill, 1);
  assert.equal(structure.columns[1].fill, 0.5);
  assert.equal(structure.columns[0].top, 0);
  assert.equal(structure.columns[1].top, 0.5);
  assert.equal(structure.columns[2].fill, 0);
});

test('elige el color dominante ignorando el fondo', () => {
  const extractor = createStructureExtractor(WIDTH, HEIGHT, COLUMNS);
  const { binary, rgba } = scene();
  const structure = extractor.measure(binary, rgba);

  assert.equal(structure.dominantColor, 'yellow');
  assert.equal(structure.columns[0].color, 'yellow');
  assert.equal(structure.columns[1].color, 'blue');
  assert.equal(structure.columns[3].color, null);
  // La torre amarilla tiene el doble de superficie que la azul: 2/3 del color muestreado.
  assert.ok(Math.abs(structure.colorWeights.yellow - 2 / 3) < 1e-9);
});

test('una pared vacía devuelve una silueta vacía', () => {
  const extractor = createStructureExtractor(WIDTH, HEIGHT, COLUMNS);
  const binary = new Uint8Array(WIDTH * HEIGHT);
  const rgba = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  const structure = extractor.measure(binary, rgba);

  assert.equal(structure.empty, true);
  assert.equal(structure.coverage, 0);
  assert.equal(structure.mass, 0);
  assert.equal(structure.dominantColor, null);
});

test('reutiliza el objeto entre frames y respeta el cambio de rejilla', () => {
  const extractor = createStructureExtractor(WIDTH, HEIGHT, COLUMNS);
  const { binary, rgba } = scene();
  const first = extractor.measure(binary, rgba);
  const second = extractor.measure(binary, rgba);

  assert.equal(first, second);

  extractor.setColumns(8);
  assert.equal(extractor.columns, 8);
  assert.equal(extractor.structure.columns.length, 8);
  assert.equal(extractor.structure.empty, true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createColumnModel } from '../app/src/vision/columns.js';

const layer = (column, color, y = 0.7) => ({ column, color, y, shape: 'cube', confidence: 0.9 });

test('una detección aislada no suena: hace falta confirmación', () => {
  const model = createColumnModel({ columns: 16, confirmHits: 2, ttlMs: 300 });
  model.observe([layer(3, 'red')], 1000);
  assert.equal(model.active(1000).length, 0);
  model.observe([layer(3, 'red')], 1050);
  const active = model.active(1050);
  assert.equal(active.length, 1);
  assert.equal(active[0].column, 3);
  assert.equal(active[0].entries[0].color, 'red');
});

test('el TTL mantiene el bloque vivo entre parpadeos y luego lo suelta', () => {
  const model = createColumnModel({ columns: 16, confirmHits: 2, ttlMs: 300 });
  model.observe([layer(5, 'blue')], 0);
  model.observe([layer(5, 'blue')], 50);
  assert.equal(model.count(50), 1);
  assert.equal(model.count(200), 1, 'sigue vivo dentro del TTL');
  assert.equal(model.count(400), 0, 'se libera al superar el TTL');
});

test('una torre devuelve todos los colores de la misma columna', () => {
  const model = createColumnModel({ columns: 16, confirmHits: 1, ttlMs: 300 });
  const layers = [layer(7, 'red', 0.5), layer(7, 'blue', 0.65), layer(7, 'white', 0.8)];
  model.observe(layers, 0);
  model.observe(layers, 40);
  const [column] = model.active(40);
  assert.equal(column.column, 7);
  assert.deepEqual(
    column.entries.map((entry) => entry.color),
    ['red', 'blue', 'white'],
  );
  assert.equal(model.count(40), 3);
});

test('columnas distintas conviven y se ordenan por altura', () => {
  const model = createColumnModel({ columns: 16, confirmHits: 1, ttlMs: 300 });
  model.observe([layer(2, 'red', 0.3), layer(2, 'green', 0.8), layer(9, 'yellow', 0.6)], 0);
  model.observe([layer(2, 'red', 0.3), layer(2, 'green', 0.8), layer(9, 'yellow', 0.6)], 30);
  const active = model.active(30);
  assert.equal(active.length, 2);
  const blocks = model.blocks(30);
  assert.equal(blocks.length, 3);
  assert.equal(blocks.filter((block) => block.column === 2).length, 2);
});

test('cambiar la rejilla reubica los bloques vivos', () => {
  const model = createColumnModel({ columns: 16, confirmHits: 1, ttlMs: 300 });
  model.observe([layer(15, 'red')], 0);
  model.observe([layer(15, 'red')], 20);
  model.setColumns(8);
  const active = model.active(20);
  assert.equal(active.length, 1);
  assert.equal(active[0].column, 7);
});

test('clear vacía el estado musical', () => {
  const model = createColumnModel({ columns: 16, confirmHits: 1 });
  model.observe([layer(1, 'red')], 0);
  model.clear();
  assert.equal(model.count(0), 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackgroundModel } from '../app/src/vision/background.js';
import { createMaskProcessor } from '../app/src/vision/mask.js';

const W = 24;
const H = 18;
const WOOD = [186, 146, 96];

function makeFrame({ scale = 1, patch = null } = {}) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let p = 0; p < W * H; p += 1) {
    data[p * 4] = WOOD[0] * scale;
    data[p * 4 + 1] = WOOD[1] * scale;
    data[p * 4 + 2] = WOOD[2] * scale;
    data[p * 4 + 3] = 255;
  }
  if (patch) {
    for (let y = patch.y0; y <= patch.y1; y += 1) {
      for (let x = patch.x0; x <= patch.x1; x += 1) {
        const i = (y * W + x) * 4;
        data[i] = patch.color[0];
        data[i + 1] = patch.color[1];
        data[i + 2] = patch.color[2];
      }
    }
  }
  return data;
}

function calibrate(model) {
  model.beginCalibration();
  for (let i = 0; i < 5; i += 1) model.addCalibrationFrame(makeFrame());
  assert.equal(model.commitCalibration(), true);
}

function step(mask, model, frame) {
  const result = mask.update(frame, model, { sensitivity: 0.5 });
  model.adapt(frame, mask.soft);
  return result;
}

test('un frame idéntico al fondo no produce primer plano', () => {
  const model = createBackgroundModel(W, H);
  const mask = createMaskProcessor(W, H);
  calibrate(model);
  for (let i = 0; i < 3; i += 1) step(mask, model, makeFrame());
  assert.equal(mask.coverage, 0);
});

test('el primer frame de un cambio fuerte aún no confirma el bloque (histéresis)', () => {
  const model = createBackgroundModel(W, H);
  const mask = createMaskProcessor(W, H);
  calibrate(model);
  const frame = makeFrame({ patch: { x0: 6, y0: 5, x1: 12, y1: 11, color: [220, 40, 40] } });
  const first = step(mask, model, frame);
  assert.ok(first.threshold > 0);
  assert.equal(first.binary.reduce((acc, v) => acc + v, 0), 0);
  const second = step(mask, model, frame);
  assert.ok(second.binary.reduce((acc, v) => acc + v, 0) > 20);
});

test('un cambio global de luz se absorbe sin perder el bloque (HU-05)', () => {
  const model = createBackgroundModel(W, H);
  const mask = createMaskProcessor(W, H);
  calibrate(model);

  // Solo luz: la mesa vacía se aclara un 28 %.
  for (let i = 0; i < 40; i += 1) step(mask, model, makeFrame({ scale: 1.28 }));
  assert.ok(model.light > 1.15, `factor de luz ${model.light}`);
  assert.ok(mask.coverage < 0.03, `cobertura ${mask.coverage}`);

  // Con el mismo brillo, aparece un bloque rojo: debe seguir detectándose.
  const blockFrame = makeFrame({
    scale: 1.28,
    patch: { x0: 8, y0: 4, x1: 14, y1: 10, color: [220 * 1.28, 40 * 1.28, 40 * 1.28] },
  });
  for (let i = 0; i < 20; i += 1) step(mask, model, blockFrame);
  assert.ok(mask.coverage > 0.1, `cobertura con bloque ${mask.coverage}`);
  assert.ok(mask.binary[7 * W + 11] === 1, 'el centro del bloque debe ser primer plano');

  // El fondo se sigue adaptando: el bloque no se "come" el modelo.
  for (let i = 0; i < 60; i += 1) step(mask, model, blockFrame);
  assert.ok(mask.binary[7 * W + 11] === 1, 'el bloque no debe desaparecer por adaptación');
});

test('al retirar el bloque la máscara se apaga', () => {
  const model = createBackgroundModel(W, H);
  const mask = createMaskProcessor(W, H);
  calibrate(model);
  const blockFrame = makeFrame({ patch: { x0: 6, y0: 4, x1: 14, y1: 12, color: [40, 90, 220] } });
  for (let i = 0; i < 6; i += 1) step(mask, model, blockFrame);
  assert.ok(mask.coverage > 0.05);
  for (let i = 0; i < 6; i += 1) step(mask, model, makeFrame());
  assert.ok(mask.coverage < 0.02);
});

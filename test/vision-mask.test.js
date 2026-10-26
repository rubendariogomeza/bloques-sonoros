import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackgroundModel } from '../app/src/vision/background.js';
import { createMaskProcessor } from '../app/src/vision/mask.js';

const WALL = [200, 190, 170];

function frame(...pixels) {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b], index) => {
    data[index * 4] = r;
    data[index * 4 + 1] = g;
    data[index * 4 + 2] = b;
    data[index * 4 + 3] = 255;
  });
  return data;
}

function calibrated(pixelCount) {
  const model = createBackgroundModel(pixelCount, 1);
  model.beginCalibration();
  model.addCalibrationFrame(frame(...Array.from({ length: pixelCount }, () => WALL)));
  model.commitCalibration();
  return model;
}

test('una sombra sobre la pared no es un bloque', () => {
  const model = calibrated(1);
  const mask = createMaskProcessor(1, 1);
  const shadow = WALL.map((value) => Math.round(value * 0.6));

  mask.update(frame(shadow), model, { sensitivity: 0.5 });

  assert.equal(mask.binary[0], 0);
});

test('una sombra fuerte tampoco entra en la máscara', () => {
  const model = calibrated(1);
  const mask = createMaskProcessor(1, 1);
  const shadow = WALL.map((value) => Math.round(value * 0.35));

  mask.update(frame(shadow), model, { sensitivity: 0.5 });

  assert.equal(mask.binary[0], 0);
});

test('un bloque oscuro sí es un bloque', () => {
  const model = calibrated(1);
  const mask = createMaskProcessor(1, 1);

  mask.update(frame([18, 18, 18]), model, { sensitivity: 0.5 });
  mask.update(frame([18, 18, 18]), model, { sensitivity: 0.5 });

  assert.equal(mask.binary[0], 1);
});

test('un bloque de color se detecta aunque esté en penumbra', () => {
  const model = calibrated(1);
  const mask = createMaskProcessor(1, 1);

  mask.update(frame([20, 60, 200]), model, { sensitivity: 0.5 });
  mask.update(frame([20, 60, 200]), model, { sensitivity: 0.5 });

  assert.equal(mask.binary[0], 1);
});

test('un cambio global de luz se compensa con el factor de luz', () => {
  const model = calibrated(1);
  const mask = createMaskProcessor(1, 1);
  const brighter = frame(WALL.map((value) => Math.round(value * 1.3)));
  // La adaptación estima la deriva de exposición; con unos frames converge.
  for (let i = 0; i < 12; i += 1) model.adapt(brighter, new Uint8Array([0]));

  assert.ok(model.light > 1.15, `factor de luz: ${model.light}`);
  mask.update(brighter, model, { sensitivity: 0.5 });
  assert.equal(mask.binary[0], 0);
});

test('un bloque rojo sobre una mesa de madera no se confunde con el fondo', () => {
  const WOOD = [197, 115, 88];
  const model = createBackgroundModel(1, 1);
  model.beginCalibration();
  model.addCalibrationFrame(frame(WOOD));
  model.commitCalibration();
  const mask = createMaskProcessor(1, 1);

  // Rojo saturado con un brillo parecido al de la madera: la saturación lo separa.
  mask.update(frame([239, 68, 68]), model, { sensitivity: 0.5 });
  mask.update(frame([239, 68, 68]), model, { sensitivity: 0.5 });

  assert.equal(mask.binary[0], 1);
});

test('la sombra de un bloque sobre madera sigue sin ser un bloque', () => {
  const WOOD = [197, 115, 88];
  const model = createBackgroundModel(1, 1);
  model.beginCalibration();
  model.addCalibrationFrame(frame(WOOD));
  model.commitCalibration();
  const mask = createMaskProcessor(1, 1);
  const shadow = WOOD.map((value) => Math.round(value * 0.6));

  mask.update(frame(shadow), model, { sensitivity: 0.5 });
  mask.update(frame(shadow), model, { sensitivity: 0.5 });

  assert.equal(mask.binary[0], 0);
});

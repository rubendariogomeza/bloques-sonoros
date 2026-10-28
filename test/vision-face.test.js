import test from 'node:test';
import assert from 'node:assert/strict';
import { createFaceExtractor, isSkin } from '../app/src/vision/face.js';

const W = 160;
const H = 120;

const SKIN_LIGHT = [232, 190, 160];
const SKIN_MEDIUM = [192, 138, 99];
const SKIN_DARK = [110, 75, 55];
const HAIR_DARK = [40, 26, 18];
const HAIR_BLOND = [201, 146, 47];
const ORANGE_BLOCK = [249, 115, 22];

function paint(rgba, binary, cx, cy, rx, ry, color) {
  const [r, g, b] = color;
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(H - 1, Math.ceil(cy + ry));
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(W - 1, Math.ceil(cx + rx));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const q = (y * W + x) * 4;
      rgba[q] = r;
      rgba[q + 1] = g;
      rgba[q + 2] = b;
      rgba[q + 3] = 255;
      binary[y * W + x] = 1;
    }
  }
}

/** Escena mínima: fondo neutro fuera de la máscara + cara opcional. */
function scene({
  skin = SKIN_LIGHT,
  hair = HAIR_DARK,
  cx = W / 2,
  cy = H * 0.56,
  mouthH = 2,
  smileLift = 0,
  eyeH = 4,
} = {}) {
  const rgba = new Uint8ClampedArray(W * H * 4);
  const binary = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i += 1) {
    rgba[i * 4] = 120;
    rgba[i * 4 + 1] = 120;
    rgba[i * 4 + 2] = 120;
    rgba[i * 4 + 3] = 255;
  }
  // Pelo: óvalo algo mayor que la cara.
  paint(rgba, binary, cx, cy - 4, 38, 46, hair);
  // Cara.
  paint(rgba, binary, cx, cy, 34, 42, skin);
  // Ojos: dos puntos oscuros en la banda superior.
  paint(rgba, binary, cx - 13, cy - 6, 5, eyeH, [28, 20, 16]);
  paint(rgba, binary, cx + 13, cy - 6, 5, eyeH, [28, 20, 16]);
  // Boca: alto controlado por el test (2 px = cerrada).
  paint(rgba, binary, cx, cy + 22, 12, mouthH, [140, 52, 64]);
  // Sonrisa: las comisuras suben respecto al centro de la boca.
  if (smileLift > 0) {
    paint(rgba, binary, cx - 11, cy + 22 - smileLift, 3, 1.6, [140, 52, 64]);
    paint(rgba, binary, cx + 11, cy + 22 - smileLift, 3, 1.6, [140, 52, 64]);
  }
  return { rgba, binary };
}

test('la piel se separa de los bloques saturados y del fondo azul', () => {
  assert.equal(isSkin(...SKIN_LIGHT), true);
  assert.equal(isSkin(...SKIN_MEDIUM), true);
  assert.equal(isSkin(...SKIN_DARK), true);
  assert.equal(isSkin(...ORANGE_BLOCK), false, 'un bloque naranja no es una cara');
  assert.equal(isSkin(40, 90, 200), false);
  assert.equal(isSkin(30, 160, 70), false);
});

test('una cara se confirma tras dos frames y publica su caja', () => {
  const face = createFaceExtractor(W, H);
  const { rgba, binary } = scene();
  face.measure(binary, rgba, 0);
  assert.equal(face.face.present, false, 'un frame no basta');
  face.measure(binary, rgba, 50);
  const result = face.face;
  assert.equal(result.present, true);
  assert.ok(result.cx > 0.4 && result.cx < 0.6, `centro ${result.cx}`);
  assert.ok(result.aspect > 0.55 && result.aspect < 1.75);
  assert.ok(result.fill >= 0.35);
  assert.ok(result.area > 0.012 && result.area < 0.5);
  // La línea de ojos se mide dentro de la caja, no en píxeles absolutos.
  assert.ok(result.eyes.line > 0.25 && result.eyes.line < 0.58, `línea de ojos ${result.eyes.line}`);
  assert.notEqual(result.signature, 'none');
  assert.ok(Number.isInteger(result.seed) && result.seed >= 0 && result.seed < 1024);
});

test('la misma cara produce la misma firma y otra cara produce otra', () => {
  const a = createFaceExtractor(W, H);
  const first = scene();
  a.measure(first.binary, first.rgba, 0);
  a.measure(first.binary, first.rgba, 40);
  const seedA = a.face.seed;
  const signatureA = a.face.signature;

  a.measure(first.binary, first.rgba, 80);
  assert.equal(a.face.seed, seedA, 'la firma no cambia entre frames');
  assert.equal(a.face.signature, signatureA);

  const b = createFaceExtractor(W, H);
  const other = scene({ skin: SKIN_DARK, hair: HAIR_BLOND, cy: H * 0.5 });
  b.measure(other.binary, other.rgba, 0);
  b.measure(other.binary, other.rgba, 40);
  assert.notEqual(b.face.signature, signatureA);
  assert.notEqual(b.face.seed, seedA);
});

test('sin primer plano no hay cara y el TTL la apaga', () => {
  const face = createFaceExtractor(W, H);
  const { rgba, binary } = scene();
  face.measure(binary, rgba, 0);
  face.measure(binary, rgba, 40);
  assert.equal(face.face.present, true);

  const empty = new Uint8Array(W * H);
  face.measure(empty, rgba, 120);
  assert.equal(face.face.present, true, 'un parpadeo no corta la nota');
  assert.equal(face.face.stale, true);

  face.measure(empty, rgba, 600);
  assert.equal(face.face.present, false);
  assert.equal(face.face.stale, false);
});

test('la cara más grande gana cuando hay varias personas', () => {
  const face = createFaceExtractor(W, H);
  const { rgba, binary } = scene({ cx: 44, cy: H * 0.56 });
  // Segunda cara más pequeña a la derecha.
  paint(rgba, binary, 124, H * 0.5, 18, 22, SKIN_MEDIUM);
  face.measure(binary, rgba, 0);
  face.measure(binary, rgba, 40);
  assert.equal(face.face.present, true);
  assert.ok(face.face.cx < 0.5, `debe elegir la cara grande: ${face.face.cx}`);
});

test('boca abierta, sonrisa y ojos cerrados mueven sus señales de gesto', () => {
  function track(options) {
    const extractor = createFaceExtractor(W, H);
    const frame = scene(options);
    for (let i = 0; i < 8; i += 1) extractor.measure(frame.binary, frame.rgba, i * 40);
    return extractor.face;
  }

  const neutral = track({ mouthH: 2 });
  const open = track({ mouthH: 9 });
  const smiling = track({ mouthH: 2, smileLift: 6 });
  const blinking = track({ mouthH: 2, eyeH: 0.6 });

  assert.ok(open.mouth.open > neutral.mouth.open, 'boca abierta = más apertura');
  assert.ok(smiling.mouth.smile > neutral.mouth.smile, 'sonrisa = comisuras altas');
  assert.ok(blinking.eyes.open < neutral.eyes.open, 'ojos cerrados = menos apertura');
  assert.ok(blinking.cues.eyes < 0.3, `el gesto llega suavizado: ${blinking.cues.eyes}`);
  assert.ok(open.cues.mouth > 0.55, 'la apertura supera el umbral de la densidad');
  assert.ok(smiling.cues.smile > 0.6, 'la sonrisa supera el umbral del adorno');
});

test('reset borra la cara y el gesto', () => {
  const face = createFaceExtractor(W, H);
  const { rgba, binary } = scene();
  face.measure(binary, rgba, 0);
  face.measure(binary, rgba, 40);
  face.reset();
  assert.equal(face.face.present, false);
  assert.equal(face.face.cues.mouth, 0);
  assert.equal(face.face.cues.eyes, 0.5);
});

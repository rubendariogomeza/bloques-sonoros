/**
 * Retrato sonoro: una cara → una canción.
 *
 * Heurística propia, sin modelos externos:
 *
 * 1. La máscara de primer plano (fondo ya calibrado) se cruza con un detector
 *    de piel en YCbCr. Así la pared y la madera no cuentan.
 * 2. La componente conexa más grande que parece una cara (área, proporción y
 *    relleno) es el rostro candidato.
 * 3. Dentro de su caja se miden pelo, ojos y boca. Con esos rasgos agregados se
 *    construye una **firma cuantizada** y una semilla determinista.
 *
 * La firma es efímera: vive en este objeto y se pierde al cerrar la sesión. No
 * se guarda en disco, no se envía y no identifica a nadie.
 *
 * Solo se sigue la cara más grande (la persona más cerca de la cámara). El
 * objeto `face` y sus subobjetos se reutilizan en cada frame.
 */
import { PORTRAIT } from '../core/config.js';
import { clamp } from '../core/util.js';
import { createLabeler } from './components.js';

/** Piel en YCbCr: cubre tonos claros y oscuros sin etiquetarlos. */
export function isSkin(r, g, b) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  if (y < 35 || y > 248) return false;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  if (cb < 76 || cb > 128 || cr < 132 || cr > 176) return false;
  // Naranjas muy saturados (bloques, cartón) quedan fuera; la piel es más suave.
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 || (max - min) / max < 0.72;
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function lumaOf(r, g, b) {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Píxel de boca: oscuro o rojizo; la piel iluminada queda fuera. */
function isMouthPixel(r, g, b) {
  const luma = lumaOf(r, g, b);
  const red = r > g * 1.22 && r > b * 1.12 && luma < 0.72;
  return luma < 0.46 || red;
}

export function createFaceExtractor(width, height, options = {}) {
  const config = { ...PORTRAIT, ...options };
  const pixels = width * height;
  const skin = new Uint8Array(pixels);
  const labeler = createLabeler(width, height);
  const minArea = Math.max(64, Math.round(pixels * config.minArea));
  const maxArea = Math.round(pixels * config.maxArea);

  let hits = 0;
  let active = false;
  let lastSeen = 0;
  let lastCx = 0;
  let lastCy = 0;
  let hasLast = false;

  const face = {
    present: false,
    stale: false,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    cx: 0,
    cy: 0,
    area: 0,
    fill: 0,
    aspect: 1,
    confidence: 0,
    signature: 'none',
    seed: 0,
    skin: { luma: 0.5, cb: 128, cr: 150 },
    hair: { luma: 0.5, coverage: 0 },
    eyes: { open: 0.5, line: 0.3, distance: 0.3 },
    mouth: { open: 0, width: 0.25, smile: 0 },
    tilt: 0,
    motion: 0,
    cues: { mouth: 0, smile: 0, eyes: 0.5, tilt: 0, motion: 0 },
  };

  function reset() {
    hits = 0;
    active = false;
    lastSeen = 0;
    hasLast = false;
    face.present = false;
    face.stale = false;
    face.motion = 0;
    face.cues.mouth = 0;
    face.cues.smile = 0;
    face.cues.eyes = 0.5;
    face.cues.tilt = 0;
    face.cues.motion = 0;
  }

  function buildSkinMask(binary, rgba) {
    for (let p = 0; p < pixels; p += 1) {
      if (binary[p] === 0) {
        skin[p] = 0;
        continue;
      }
      const q = p * 4;
      skin[p] = isSkin(rgba[q], rgba[q + 1], rgba[q + 2]) ? 1 : 0;
    }
  }

  function pickFace(blobs) {
    let best = null;
    let bestScore = 0;
    for (const blob of blobs) {
      const areaRatio = blob.area / pixels;
      if (areaRatio < config.minArea || areaRatio > config.maxArea) continue;
      if (blob.aspect < config.minAspect || blob.aspect > config.maxAspect) continue;
      if (blob.fill < config.minFill) continue;
      if (blob.h < height * 0.12 || blob.w < width * 0.08) continue;
      const score = blob.area * blob.fill * (1 - Math.abs(blob.aspect - 1) / 2);
      if (score > bestScore) {
        bestScore = score;
        best = blob;
      }
    }
    return best;
  }

  function measureFeatures(binary, rgba, blob) {
    const { x0, y0, x1, y1, w, h } = blob;
    const x0i = Math.max(0, x0);
    const y0i = Math.max(0, y0);
    const x1i = Math.min(width - 1, x1);
    const y1i = Math.min(height - 1, y1);

    // Piel: media de luma, Cb y Cr dentro de la caja.
    let skinCount = 0;
    let skinLuma = 0;
    let skinCb = 0;
    let skinCr = 0;
    for (let y = y0i; y <= y1i; y += 2) {
      const row = y * width;
      for (let x = x0i; x <= x1i; x += 2) {
        const p = row + x;
        if (skin[p] === 0) continue;
        const q = p * 4;
        const r = rgba[q];
        const g = rgba[q + 1];
        const b = rgba[q + 2];
        skinCount += 1;
        skinLuma += lumaOf(r, g, b);
        skinCb += 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        skinCr += 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      }
    }
    if (skinCount > 0) {
      skinLuma /= skinCount;
      skinCb /= skinCount;
      skinCr /= skinCount;
    } else {
      skinLuma = 0.5;
      skinCb = 128;
      skinCr = 150;
    }

    // Pelo: franja superior, píxeles de primer plano que no son piel.
    const hairTop = Math.max(0, Math.round(y0 - h * 0.2));
    const hairBottom = Math.min(height - 1, Math.round(y0 + h * 0.18));
    let hairCount = 0;
    let hairTotal = 0;
    let hairLuma = 0;
    for (let y = hairTop; y <= hairBottom; y += 2) {
      const row = y * width;
      for (let x = x0i; x <= x1i; x += 2) {
        const p = row + x;
        if (binary[p] === 0) continue;
        hairTotal += 1;
        if (skin[p] === 1) continue;
        const q = p * 4;
        const luma = lumaOf(rgba[q], rgba[q + 1], rgba[q + 2]);
        if (luma > 0.78) continue;
        hairCount += 1;
        hairLuma += luma;
      }
    }
    const hairCoverage = hairTotal > 0 ? hairCount / hairTotal : 0;
    hairLuma = hairCount > 0 ? hairLuma / hairCount : 0.85;

    // Ojos: dos mitades de la banda superior; lo oscuro es pupila/ceja.
    const eyeTop = y0i + Math.round(h * 0.18);
    const eyeBottom = y0i + Math.round(h * 0.5);
    const eyeLeft = x0i + Math.round(w * 0.12);
    const eyeRight = x1i - Math.round(w * 0.12);
    const eyeMid = Math.round((eyeLeft + eyeRight) / 2);
    const eye = { open: 0, line: 0.3, distance: 0.3, tilt: 0 };
    let leftCx = 0;
    let leftCy = 0;
    let rightCx = 0;
    let rightCy = 0;
    let leftFound = false;
    let rightFound = false;
    for (let side = 0; side < 2; side += 1) {
      const from = side === 0 ? eyeLeft : eyeMid + 1;
      const to = side === 0 ? eyeMid : eyeRight;
      let count = 0;
      let sumX = 0;
      let sumY = 0;
      let minY = height;
      let maxY = 0;
      let total = 0;
      for (let y = eyeTop; y <= eyeBottom; y += 1) {
        const row = y * width;
        for (let x = from; x <= to; x += 1) {
          total += 1;
          const q = (row + x) * 4;
          if (lumaOf(rgba[q], rgba[q + 1], rgba[q + 2]) >= 0.34) continue;
          count += 1;
          sumX += x;
          sumY += y;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      if (count < 4) continue;
      const cx = sumX / count;
      const cy = sumY / count;
      const spread = clamp((maxY - minY + 1) / Math.max(1, h * 0.12), 0, 1);
      const density = clamp(count / Math.max(1, total) / 0.1, 0, 1);
      const open = clamp(0.65 * spread + 0.35 * density, 0, 1);
      if (side === 0) {
        leftCx = cx;
        leftCy = cy;
        leftFound = true;
        eye.open = open;
      } else {
        rightCx = cx;
        rightCy = cy;
        rightFound = true;
        eye.open = (eye.open + open) / 2;
      }
    }
    if (leftFound && rightFound) {
      // La línea de ojos es relativa a la caja: `cy` viene en píxeles absolutos.
      eye.line = clamp(((leftCy + rightCy) / 2 - y0i) / h, 0, 1);
      eye.distance = clamp(Math.abs(rightCx - leftCx) / w, 0, 1);
      eye.tilt = clamp(Math.atan2(rightCy - leftCy, Math.max(1, rightCx - leftCx)) / (Math.PI / 6), -1, 1);
    }

    // Boca: banda inferior; oscuro/rojo. La apertura y el ancho dan la expresión.
    // La banda se queda dentro de la piel: el borde del pelo no debe contarse.
    const mouthTop = y0i + Math.round(h * 0.6);
    const mouthBottom = y0i + Math.round(h * 0.88);
    const mouthLeft = x0i + Math.round(w * 0.28);
    const mouthRight = x1i - Math.round(w * 0.28);
    let mouthCount = 0;
    let mouthMinX = width;
    let mouthMaxX = 0;
    let mouthMinY = height;
    let mouthMaxY = 0;
    for (let y = mouthTop; y <= mouthBottom; y += 1) {
      const row = y * width;
      for (let x = mouthLeft; x <= mouthRight; x += 1) {
        const q = (row + x) * 4;
        if (!isMouthPixel(rgba[q], rgba[q + 1], rgba[q + 2])) continue;
        mouthCount += 1;
        if (x < mouthMinX) mouthMinX = x;
        if (x > mouthMaxX) mouthMaxX = x;
        if (y < mouthMinY) mouthMinY = y;
        if (y > mouthMaxY) mouthMaxY = y;
      }
    }

    // Apertura = alto de la parte central de la boca; una línea fina es 0.
    const mouthWidth = mouthCount > 4 ? (mouthMaxX - mouthMinX + 1) / w : 0.2;

    // Sonrisa = las comisuras quedan por encima del centro de la boca.
    let cornerSumY = 0;
    let cornerN = 0;
    let centerSumY = 0;
    let centerN = 0;
    let centerMinY = height;
    let centerMaxY = 0;
    if (mouthCount > 4) {
      const spanX = Math.max(1, mouthMaxX - mouthMinX + 1);
      for (let y = mouthMinY; y <= mouthMaxY; y += 1) {
        const row = y * width;
        for (let x = mouthMinX; x <= mouthMaxX; x += 1) {
          const q = (row + x) * 4;
          if (!isMouthPixel(rgba[q], rgba[q + 1], rgba[q + 2])) continue;
          const rel = (x - mouthMinX) / spanX;
          if (rel < 0.22 || rel > 0.78) {
            cornerSumY += y;
            cornerN += 1;
          } else if (rel > 0.38 && rel < 0.62) {
            centerSumY += y;
            centerN += 1;
            if (y < centerMinY) centerMinY = y;
            if (y > centerMaxY) centerMaxY = y;
          }
        }
      }
    }
    const mouthHeight = centerN > 0 ? centerMaxY - centerMinY + 1 : mouthMaxY - mouthMinY + 1;
    const mouthOpen = mouthCount > 4 ? clamp((mouthHeight / h - 0.022) / 0.06, 0, 1) : 0;
    const smile =
      cornerN > 0 && centerN > 0
        ? clamp((centerSumY / centerN - cornerSumY / cornerN) / Math.max(1, h * 0.03), 0, 1)
        : 0;

    // Movimiento: desplazamiento del centro entre frames (feedback de gesto).
    const cx = blob.cx / width;
    const cy = blob.cy / height;
    const motionRaw = hasLast ? clamp(Math.hypot(cx - lastCx, cy - lastCy) * 14, 0, 1) : 0;
    face.motion = face.motion * 0.55 + motionRaw * 0.45;
    lastCx = cx;
    lastCy = cy;
    hasLast = true;

    face.x = x0 / width;
    face.y = y0 / height;
    face.w = w / width;
    face.h = h / height;
    face.cx = cx;
    face.cy = cy;
    face.area = blob.area / pixels;
    face.fill = blob.fill;
    face.aspect = blob.aspect;
    face.confidence = clamp(blob.fill * (1 - Math.abs(blob.aspect - 1) / 1.6), 0, 1);
    face.skin.luma = skinLuma;
    face.skin.cb = skinCb;
    face.skin.cr = skinCr;
    face.hair.luma = hairLuma;
    face.hair.coverage = hairCoverage;
    face.eyes.open = eye.open;
    face.eyes.line = eye.line;
    face.eyes.distance = eye.distance;
    face.mouth.open = mouthOpen;
    face.mouth.width = mouthWidth;
    face.mouth.smile = smile;
    face.tilt = eye.tilt;

    // Firma cuantizada: cinco rasgos estables, sin guardar la imagen.
    const skinLumaBin = Math.min(5, Math.floor(skinLuma * 6));
    const skinCrBin = clamp(Math.floor((skinCr - 133) / 8), 0, 4);
    const hairBin = hairLuma < 0.18 ? 0 : hairLuma < 0.35 ? 1 : hairLuma < 0.55 ? 2 : 3;
    const aspectBin = clamp(Math.floor((blob.aspect - 0.55) / 0.3), 0, 3);
    const eyeLineBin = clamp(Math.floor((eye.line - 0.15) / 0.1), 0, 3);
    const eyeDistBin = clamp(Math.floor(eye.distance / 0.12), 0, 3);
    face.signature = `${skinLumaBin}|${skinCrBin}|${hairBin}|${aspectBin}|${eyeLineBin}|${eyeDistBin}`;
    face.seed = fnv1a(face.signature) % 1024;

    // Suavizado de expresión: la música se decide por compás, no por frame.
    const alpha = 0.35;
    face.cues.mouth = face.cues.mouth * (1 - alpha) + mouthOpen * alpha;
    face.cues.smile = face.cues.smile * (1 - alpha) + smile * alpha;
    face.cues.eyes = face.cues.eyes * (1 - alpha) + eye.open * alpha;
    face.cues.tilt = face.cues.tilt * (1 - alpha) + eye.tilt * alpha;
    face.cues.motion = face.cues.motion * (1 - alpha) + face.motion * alpha;
  }

  /**
   * @param {Uint8Array} binary máscara morfológica (0/1)
   * @param {Uint8ClampedArray} rgba frame actual
   * @param {number} now instante en milisegundos
   */
  function measure(binary, rgba, now = 0) {
    buildSkinMask(binary, rgba);
    const blob = pickFace(labeler.label(skin, { minArea, maxArea }));

    if (blob) {
      hits = Math.min(config.confirmHits, hits + 1);
      lastSeen = now;
      measureFeatures(binary, rgba, blob);
      if (hits >= config.confirmHits) {
        active = true;
        face.present = true;
        face.stale = false;
      }
      return face;
    }

    if (active && now - lastSeen <= config.ttlMs) {
      face.present = true;
      face.stale = true;
      // Sin cara nueva, la expresión se relaja y el gesto se apaga.
      face.cues.mouth *= 0.8;
      face.cues.smile *= 0.8;
      face.cues.eyes = face.cues.eyes * 0.8 + 0.5 * 0.2;
      face.cues.tilt *= 0.8;
      face.cues.motion *= 0.6;
      face.motion *= 0.6;
      return face;
    }

    active = false;
    hits = 0;
    hasLast = false;
    face.present = false;
    face.stale = false;
    face.motion = 0;
    face.cues.mouth = 0;
    face.cues.smile = 0;
    face.cues.eyes = 0.5;
    face.cues.tilt = 0;
    face.cues.motion = 0;
    return face;
  }

  return {
    measure,
    reset,
    get face() {
      return face;
    },
  };
}

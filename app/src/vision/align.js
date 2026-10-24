/**
 * Alineación gruesa de la cámara respecto al fondo calibrado.
 *
 * HU-04 pide recalibrar al instante cuando el soporte se mueve "sin detener la
 * música". Volver a fotografiar el fondo borraría los bloques que están sobre la
 * mesa, así que estimamos la traslación dominante y desplazamos el modelo de
 * fondo: los bloques siguen detectándose y el tempo no se toca.
 *
 * Estimamos el desplazamiento con los perfiles de luminancia (suma por columna y
 * suma por fila). Integrar toda una línea convierte el detalle de alta frecuencia
 * en una señal suave con un pico claro, y la correlación normalizada ignora los
 * cambios de exposición. Un desplazamiento horizontal no altera las sumas por
 * fila (y viceversa), así que los dos ejes se resuelven por separado.
 *
 * Convención: `frame(x, y) ≈ background(x - dx, y - dy)`.
 */

const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;

function lumaAt(bytes, index) {
  return LUMA_R * bytes[index] + LUMA_G * bytes[index + 1] + LUMA_B * bytes[index + 2];
}

/** Correlación normalizada de `a[v]` contra `b[v - shift]` dentro de [lo, hi). */
function profileScore(a, b, lo, hi, shift) {
  let n = 0;
  let sumA = 0;
  let sumB = 0;
  let sqA = 0;
  let sqB = 0;
  let cross = 0;
  for (let v = lo; v < hi; v += 1) {
    const u = v - shift;
    if (u < lo || u >= hi) continue;
    const av = a[v];
    const bv = b[u];
    n += 1;
    sumA += av;
    sumB += bv;
    sqA += av * av;
    sqB += bv * bv;
    cross += av * bv;
  }
  if (n === 0) return 0;
  const varA = sqA - (sumA * sumA) / n;
  const varB = sqB - (sumB * sumB) / n;
  const denom = Math.sqrt(Math.max(0, varA) * Math.max(0, varB));
  // Sin textura no hay señal para alinear: cualquier desplazamiento empata.
  if (denom < 1e-6) return 0;
  return (cross - (sumA * sumB) / n) / denom;
}

function bestShift(now, ref, lo, hi, limit) {
  // Ante un empate preferimos no mover el modelo.
  let best = { shift: 0, score: profileScore(now, ref, lo, hi, 0) };
  for (let shift = -limit; shift <= limit; shift += 1) {
    const score = profileScore(now, ref, lo, hi, shift);
    if (score > best.score) best = { shift, score };
  }
  return best;
}

export function estimateShift(rgba, bg, width, height, { maxShift = 0.12 } = {}) {
  const limitX = Math.max(2, Math.round(width * maxShift));
  const limitY = Math.max(2, Math.round(height * maxShift));
  const x0 = limitX;
  const x1 = width - limitX;
  const y0 = limitY;
  const y1 = height - limitY;
  if (x1 - x0 < 4 || y1 - y0 < 4) return { dx: 0, dy: 0, score: 0 };

  const columnsNow = new Float32Array(width);
  const columnsBg = new Float32Array(width);
  const rowsNow = new Float32Array(height);
  const rowsBg = new Float32Array(height);

  for (let y = y0; y < y1; y += 1) {
    const row = y * width;
    for (let x = x0; x < x1; x += 1) {
      const now = lumaAt(rgba, (row + x) * 4);
      const ref = lumaAt(bg, (row + x) * 3);
      columnsNow[x] += now;
      columnsBg[x] += ref;
      rowsNow[y] += now;
      rowsBg[y] += ref;
    }
  }

  const horizontal = bestShift(columnsNow, columnsBg, x0, x1, limitX);
  const vertical = bestShift(rowsNow, rowsBg, y0, y1, limitY);

  return {
    dx: horizontal.shift,
    dy: vertical.shift,
    score: Math.min(horizontal.score, vertical.score),
  };
}

/** Desplaza el modelo de fondo in-place, replicando bordes. */
export function shiftBackground(bg, width, height, dx, dy) {
  if (dx === 0 && dy === 0) return;
  const copy = bg.slice();
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(height - 1, Math.max(0, y - dy));
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(width - 1, Math.max(0, x - dx));
      const target = (y * width + x) * 3;
      const source = (sy * width + sx) * 3;
      bg[target] = copy[source];
      bg[target + 1] = copy[source + 1];
      bg[target + 2] = copy[source + 2];
    }
  }
}

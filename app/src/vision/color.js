/**
 * Clasificación de color del kit.
 *
 * El kit físico usa colores saturados; el clasificador trabaja en HSV para que
 * un cambio de exposición (que escala R, G y B por igual) no altere el matiz.
 */

/**
 * Clasificación sin allocations para bucles por frame.
 * Los neutros se separan por valor/saturación; el resto por franjas de matiz.
 */
export function classifyRgbFast(r, g, b) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = rr > gg ? (rr > bb ? rr : bb) : gg > bb ? gg : bb;
  const min = rr < gg ? (rr < bb ? rr : bb) : gg < bb ? gg : bb;
  const delta = max - min;
  if (max < 0.14) return 'black';
  const s = max <= 0 ? 0 : delta / max;
  if (s < 0.2) return max > 0.62 ? 'white' : 'black';
  let h;
  if (max === rr) h = (60 * ((gg - bb) / delta)) % 360;
  else if (max === gg) h = 60 * ((bb - rr) / delta + 2);
  else h = 60 * ((rr - gg) / delta + 4);
  if (h < 0) h += 360;
  if (h < 16 || h >= 344) return 'red';
  if (h < 42) return 'orange';
  if (h < 68) return 'yellow';
  if (h < 158) return 'green';
  if (h < 196) return 'cyan';
  if (h < 252) return 'blue';
  if (h < 292) return 'purple';
  return 'magenta';
}

/** Orden estable compartido con el histograma (no depende de config.js para evitar ciclos). */
export const COLOR_ORDER = [
  'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'magenta', 'white', 'black',
];

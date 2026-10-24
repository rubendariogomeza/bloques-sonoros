/**
 * Morfología binaria separable 3×3 (mínimo/máximo por filas y columnas).
 * Abre para eliminar píxeles sueltos y cierra para rellenar huecos del bloque.
 */
export function createMorphology(width, height) {
  const pixels = width * height;
  const tmp = new Uint8Array(pixels);

  function pass(src, dst, horizontal, takeMin) {
    const outer = horizontal ? height : width;
    const inner = horizontal ? width : height;
    for (let o = 0; o < outer; o += 1) {
      for (let i = 0; i < inner; i += 1) {
        const a = inner > 1 ? (i > 0 ? i - 1 : i) : i;
        const c = inner > 1 ? (i < inner - 1 ? i + 1 : i) : i;
        const base = horizontal ? o * width : o;
        const step = horizontal ? 1 : width;
        const v1 = src[base + a * step];
        const v2 = src[base + i * step];
        const v3 = src[base + c * step];
        let value;
        if (takeMin) value = v1 < v2 ? (v1 < v3 ? v1 : v3) : v2 < v3 ? v2 : v3;
        else value = v1 > v2 ? (v1 > v3 ? v1 : v3) : v2 > v3 ? v2 : v3;
        dst[base + i * step] = value;
      }
    }
  }

  function erode(mask) {
    pass(mask, tmp, true, true);
    pass(tmp, mask, false, true);
  }

  function dilate(mask) {
    pass(mask, tmp, true, false);
    pass(tmp, mask, false, false);
  }

  /** Apertura seguida de cierre: limpia ruido y compacta el bloque. */
  function openClose(mask) {
    erode(mask);
    dilate(mask);
    dilate(mask);
    erode(mask);
  }

  return { erode, dilate, openClose };
}

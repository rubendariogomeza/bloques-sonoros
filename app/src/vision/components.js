/**
 * Etiquetado de componentes conexas (8-vecindad) con BFS iterativo.
 * Sin recursión: una torre de 8 bloques no debe romper la pila.
 */

const MAX_BLOBS = 96;

export function createLabeler(width, height) {
  const pixels = width * height;
  const labels = new Int32Array(pixels);
  const queue = new Int32Array(pixels);

  let blobs = [];

  function label(binary, { minArea = 60, maxArea = pixels * 0.5 } = {}) {
    labels.fill(0);
    blobs = [];
    let next = 0;

    for (let start = 0; start < pixels; start += 1) {
      if (binary[start] === 0 || labels[start] !== 0) continue;
      next += 1;
      let head = 0;
      let tail = 0;
      queue[tail] = start;
      tail += 1;
      labels[start] = next;

      let x0 = width;
      let y0 = height;
      let x1 = 0;
      let y1 = 0;
      let area = 0;
      let sumX = 0;
      let sumY = 0;

      while (head < tail) {
        const index = queue[head];
        head += 1;
        const x = index % width;
        const y = (index - x) / width;
        area += 1;
        sumX += x;
        sumY += y;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;

        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const neighbour = ny * width + nx;
            if (binary[neighbour] === 0 || labels[neighbour] !== 0) continue;
            labels[neighbour] = next;
            queue[tail] = neighbour;
            tail += 1;
          }
        }
      }

      if (area < minArea || area > maxArea) continue;
      const w = x1 - x0 + 1;
      const h = y1 - y0 + 1;
      blobs.push({
        id: next,
        x0,
        y0,
        x1,
        y1,
        w,
        h,
        area,
        cx: sumX / area,
        cy: sumY / area,
        fill: area / (w * h),
        aspect: w / Math.max(1, h),
      });
      if (blobs.length >= MAX_BLOBS) break;
    }

    blobs.sort((a, b) => b.area - a.area);
    return blobs;
  }

  return { label, get labels() { return labels; }, get blobs() { return blobs; } };
}

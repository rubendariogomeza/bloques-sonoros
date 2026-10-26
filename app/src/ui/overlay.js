/**
 * Render del overlay sobre el video: línea de barrido, rejilla de columnas,
 * cajas de detección y destellos. La cámara se dibuja aquí para que la línea y
 * el video compartan exactamente el mismo sistema de coordenadas (HU-11).
 */
import { COLOR_HEX } from '../core/config.js';

const FLASH_MS = 420;

export function createOverlay(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const view = { width: 0, height: 0, dpr: 1 };
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (width === view.width && height === view.height && dpr === view.dpr) return;
    view.width = width;
    view.height = height;
    view.dpr = dpr;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  window.addEventListener('orientationchange', resize);
  resize();

  function drawCover(source) {
    const sw = source.videoWidth || source.naturalWidth || source.width;
    const sh = source.videoHeight || source.naturalHeight || source.height;
    if (!sw || !sh) return false;
    const scale = Math.max(view.width / sw, view.height / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    ctx.drawImage(source, (view.width - dw) / 2, (view.height - dh) / 2, dw, dh);
    return true;
  }

  function drawGrid(columns, rows, activeColumn, showRows) {
    const { width, height } = view;
    const columnWidth = width / columns;
    const rowHeight = height / rows;
    ctx.save();
    // Banda de la columna que está sonando.
    if (activeColumn >= 0) {
      const gradient = ctx.createLinearGradient(activeColumn * columnWidth, 0, (activeColumn + 1) * columnWidth, 0);
      gradient.addColorStop(0, 'rgba(255, 209, 102, 0.02)');
      gradient.addColorStop(0.5, 'rgba(255, 209, 102, 0.13)');
      gradient.addColorStop(1, 'rgba(255, 209, 102, 0.02)');
      ctx.fillStyle = gradient;
      ctx.fillRect(activeColumn * columnWidth, 0, columnWidth, height);
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 10]);
    const top = showRows ? 0 : height * 0.14;
    const bottom = showRows ? height : height * 0.94;
    for (let i = 1; i < columns; i += 1) {
      const x = Math.round(i * columnWidth) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
    }
    if (showRows) {
      // La parrilla completa: cada fila es un grado pentatónico.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      for (let r = 1; r < rows; r += 1) {
        const y = Math.round(r * rowHeight) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  /** Cuadros activos teñidos con su color: lo que se ve es lo que suena. */
  function drawCells(grid) {
    if (!grid) return;
    const { width, height } = view;
    const cellWidth = width / grid.columns;
    const cellHeight = height / grid.rows;
    for (const cell of grid.active) {
      const color = COLOR_HEX[cell.color] ?? '#ffd166';
      const x = cell.column * cellWidth;
      const y = cell.row * cellHeight;
      ctx.save();
      ctx.fillStyle = hexToRgba(color, 0.2);
      ctx.strokeStyle = hexToRgba(color, 0.82);
      ctx.lineWidth = 2;
      ctx.shadowColor = hexToRgba(color, 0.45);
      ctx.shadowBlur = 12;
      roundRect(ctx, x + 2, y + 2, cellWidth - 4, cellHeight - 4, Math.min(10, cellWidth * 0.2));
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawSweep(progress) {
    const { width, height } = view;
    const x = progress * width;
    ctx.save();
    const trail = ctx.createLinearGradient(x - Math.min(180, width * 0.22), 0, x, 0);
    trail.addColorStop(0, 'rgba(255, 209, 102, 0)');
    trail.addColorStop(0.7, 'rgba(255, 209, 102, 0.16)');
    trail.addColorStop(1, 'rgba(255, 228, 160, 0.5)');
    ctx.fillStyle = trail;
    ctx.fillRect(x - Math.min(180, width * 0.22), 0, Math.min(180, width * 0.22), height);

    ctx.shadowColor = 'rgba(255, 209, 102, 0.9)';
    ctx.shadowBlur = 22;
    ctx.strokeStyle = 'rgba(255, 236, 190, 0.95)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();

    ctx.shadowBlur = 12;
    ctx.fillStyle = '#fff6dd';
    ctx.beginPath();
    ctx.arc(x, height * 0.5, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBlocks(blocks, columns) {
    const { width, height } = view;
    const base = Math.min(width / columns, height * 0.2);
    for (const block of blocks) {
      const color = COLOR_HEX[block.color] ?? '#ffffff';
      const cx = block.x * width;
      const cy = block.y * height;
      const size = Math.max(18, base * 0.86);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = hexToRgba(color, 0.18);
      ctx.lineWidth = 2.5;
      ctx.shadowColor = hexToRgba(color, 0.65);
      ctx.shadowBlur = 16;
      roundRect(ctx, cx - size / 2, cy - size / 2, size, size, Math.max(6, size * 0.22));
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawFlashes(flashes, columns, now) {
    const { width, height } = view;
    const columnWidth = width / columns;
    for (const flash of flashes) {
      const age = now - flash.at;
      if (age > FLASH_MS) continue;
      const t = age / FLASH_MS;
      const alpha = (1 - t) * 0.5;
      const color = COLOR_HEX[flash.color] ?? '#ffd166';
      const cx = (flash.column + 0.5) * columnWidth;
      ctx.save();
      const radius = columnWidth * (0.6 + t * 0.9);
      const gradient = ctx.createRadialGradient(cx, height * 0.55, 0, cx, height * 0.55, radius * 2.2);
      gradient.addColorStop(0, hexToRgba(color, alpha));
      gradient.addColorStop(0.5, hexToRgba(color, alpha * 0.35));
      gradient.addColorStop(1, hexToRgba(color, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(cx - radius * 2.2, 0, radius * 4.4, height);
      ctx.restore();
    }
  }

  function drawVignette() {
    const { width, height } = view;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(5, 4, 10, 0.55)');
    gradient.addColorStop(0.16, 'rgba(5, 4, 10, 0.08)');
    gradient.addColorStop(0.78, 'rgba(5, 4, 10, 0.05)');
    gradient.addColorStop(1, 'rgba(5, 4, 10, 0.65)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  /**
   * @param {{source?:any, progress:number, columns:number, rows:number, blocks:Array,
   *          flashes:Array, grid?:any, playMode?:string, calibrated:boolean,
   *          running:boolean, now:number}} frame
   */
  function draw(frame) {
    const {
      source,
      progress = 0,
      columns = 16,
      rows = 8,
      blocks = [],
      flashes = [],
      grid = null,
      playMode = 'grid',
      calibrated = true,
      running = true,
      now = 0,
    } = frame;
    ctx.fillStyle = '#06050b';
    ctx.fillRect(0, 0, view.width, view.height);
    const hasFrame = source ? drawCover(source) : false;

    if (!hasFrame) {
      drawPlaceholder();
      return;
    }

    const gridMode = playMode === 'grid';
    drawGrid(columns, rows, running ? Math.floor(progress * columns) % columns : -1, gridMode);
    if (!calibrated) {
      ctx.fillStyle = 'rgba(6, 5, 11, 0.42)';
      ctx.fillRect(0, 0, view.width, view.height);
    }
    if (gridMode) drawCells(grid);
    else drawBlocks(blocks, columns);
    if (running) drawSweep(progress);
    if (!reducedMotion) drawFlashes(flashes, columns, now);
    drawVignette();
  }

  function drawPlaceholder() {
    const { width, height } = view;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let x = 0; x < width; x += 48) {
      ctx.fillRect(x, 0, 1, height);
    }
    for (let y = 0; y < height; y += 48) {
      ctx.fillRect(0, y, width, 1);
    }
    ctx.restore();
  }

  function dispose() {
    observer.disconnect();
    window.removeEventListener('orientationchange', resize);
  }

  return { draw, resize, dispose, get view() { return view; } };
}

function roundRect(target, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  target.beginPath();
  target.moveTo(x + radius, y);
  target.arcTo(x + w, y, x + w, y + h, radius);
  target.arcTo(x + w, y + h, x, y + h, radius);
  target.arcTo(x, y + h, x, y, radius);
  target.arcTo(x, y, x + w, y, radius);
  target.closePath();
}

function hexToRgba(hex, alpha) {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

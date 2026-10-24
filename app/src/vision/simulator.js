/**
 * Escena sintética para desarrollo, QA y demostración sin kit físico.
 *
 * Genera un video falso (mesa de madera + bloques) que atraviesa exactamente el
 * mismo pipeline de visión que la cámara. Incluye deriva de iluminación para
 * ejercitar la tolerancia de HU-05.
 */
import { COLOR_HEX } from '../core/config.js';
import { clamp } from '../core/util.js';

const PALETTE = Object.keys(COLOR_HEX);

function shade(hex, amount) {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = clamp(((value >> 16) & 255) + amount, 0, 255);
  const g = clamp(((value >> 8) & 255) + amount, 0, 255);
  const b = clamp((value & 255) + amount, 0, 255);
  return `rgb(${r} ${g} ${b})`;
}

export function createSimulator({ width = 640, height = 480, columns = 16 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });

  const backdrop = document.createElement('canvas');
  backdrop.width = width;
  backdrop.height = height;
  drawBackdrop(backdrop.getContext('2d'));

  /** @type {Array<{column:number, y:number, color:string, size:number}>} */
  let blocks = [];
  let lightPhase = 0;
  let lightDrift = 0.16;

  function blockSize() {
    return Math.max(18, Math.round((width / columns) * 0.58));
  }

  function drawBackdrop(target) {
    const gradient = target.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#c89a63');
    gradient.addColorStop(0.45, '#b5854f');
    gradient.addColorStop(1, '#96683b');
    target.fillStyle = gradient;
    target.fillRect(0, 0, width, height);

    // Vetas de madera: líneas suaves de bajo contraste (fondo estático realista).
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    target.strokeStyle = 'rgba(90, 57, 26, 0.18)';
    for (let i = 0; i < 42; i += 1) {
      const y = random() * height;
      const amp = 2 + random() * 8;
      target.beginPath();
      target.moveTo(0, y);
      for (let x = 0; x <= width; x += 40) {
        target.lineTo(x, y + Math.sin((x / width) * Math.PI * 2 + i) * amp);
      }
      target.lineWidth = 0.6 + random() * 1.4;
      target.stroke();
    }

    // Viñeta y borde del tapete.
    const vignette = target.createRadialGradient(width / 2, height / 2, height * 0.2, width / 2, height / 2, height * 0.78);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(40,22,8,0.35)');
    target.fillStyle = vignette;
    target.fillRect(0, 0, width, height);
  }

  function blockRect(block) {
    const size = block.size;
    const cx = ((block.column + 0.5) / columns) * width;
    return { x: cx - size / 2, y: block.y * height - size / 2, size, cx, cy: block.y * height };
  }

  function drawBlock(block) {
    const { x, y, size } = blockRect(block);
    const base = COLOR_HEX[block.color] ?? '#ef4444';
    const radius = Math.max(3, size * 0.12);

    ctx.save();
    ctx.shadowColor = 'rgba(30, 16, 4, 0.35)';
    ctx.shadowBlur = size * 0.22;
    ctx.shadowOffsetY = size * 0.12;

    // Cara frontal.
    ctx.fillStyle = base;
    roundRect(ctx, x, y, size, size, radius);
    ctx.fill();

    // Cara superior iluminada.
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = shade(base, 34);
    roundRect(ctx, x + size * 0.06, y + size * 0.06, size * 0.88, size * 0.2, radius * 0.6);
    ctx.fill();

    // Brillo lateral.
    ctx.fillStyle = shade(base, -28);
    roundRect(ctx, x + size * 0.82, y + size * 0.28, size * 0.1, size * 0.6, radius * 0.5);
    ctx.fill();
    ctx.restore();
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

  function render() {
    ctx.drawImage(backdrop, 0, 0);
    const sorted = [...blocks].sort((a, b) => a.y - b.y);
    for (const block of sorted) drawBlock(block);

    // Deriva de iluminación (simula nubes o fluorescentes calentando).
    const level = Math.sin(lightPhase) * lightDrift;
    if (level !== 0) {
      ctx.fillStyle = level > 0 ? `rgba(255, 246, 225, ${level})` : `rgba(0, 0, 0, ${-level})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  function addBlock({ column, y = 0.7, color = 'red' } = {}) {
    const col = clamp(Math.floor(column), 0, columns - 1);
    const existing = blocks.filter((block) => block.column === col);
    if (existing.length >= 6) return null;
    const size = blockSize();
    const stackGap = (size / height) * 1.04;
    const lowest = existing.reduce((min, block) => Math.min(min, block.y), 1);
    const centerY = existing.length === 0 ? clamp(y, 0.25, 0.9) : lowest - stackGap;
    const block = { column: col, y: clamp(centerY, 0.08, 0.95), color: pick(PALETTE, color), size };
    blocks.push(block);
    render();
    return block;
  }

  function removeAt(nx, ny) {
    const targetX = nx * width;
    const targetY = ny * height;
    let bestIndex = -1;
    let bestDistance = Infinity;
    blocks.forEach((block, index) => {
      const rect = blockRect(block);
      const distance = Math.hypot(rect.cx - targetX, rect.cy - targetY);
      if (distance < rect.size * 0.9 && distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0) {
      blocks.splice(bestIndex, 1);
      render();
      return true;
    }
    return false;
  }

  function pick(list, preferred) {
    return list.includes(preferred) ? preferred : list[Math.floor(Math.random() * list.length)];
  }

  function seedDemo() {
    blocks = [];
    // Posiciones relativas: la misma melodía visual funciona con 8, 16 o 24 columnas.
    const pattern = [
      { at: 0, color: 'red' },
      { at: 0.125, color: 'yellow' },
      { at: 0.25, color: 'green' },
      { at: 0.25, color: 'yellow' },
      { at: 0.375, color: 'blue' },
      { at: 0.5, color: 'magenta' },
      { at: 0.625, color: 'white' },
      { at: 0.625, color: 'red' },
      { at: 0.625, color: 'cyan' },
      { at: 0.75, color: 'orange' },
      { at: 0.875, color: 'purple' },
    ];
    const baseY = 0.76;
    for (const item of pattern) {
      addBlock({ column: Math.floor(item.at * columns), color: item.color, y: baseY });
    }
    render();
  }

  function tick(dtMs) {
    lightPhase += dtMs / 1000 / 6;
    render();
  }

  function setLightDrift(value) {
    lightDrift = clamp(value, 0, 0.4);
  }

  /** Cambia la rejilla conservando la posición relativa de los bloques. */
  function setColumns(next) {
    const target = Math.max(1, Math.round(next));
    if (target === columns) return;
    blocks = blocks.map((block) => ({
      ...block,
      column: clamp(Math.round((block.column / columns) * target), 0, target - 1),
    }));
    columns = target;
    render();
  }

  function clear() {
    blocks = [];
    render();
  }

  function dispose() {
    blocks = [];
  }

  render();

  return {
    element: canvas,
    kind: 'simulator',
    width,
    height,
    ready: true,
    addBlock,
    removeAt,
    clear,
    seedDemo,
    tick,
    render,
    setLightDrift,
    setColumns,
    dispose,
    get blocks() {
      return blocks.map((block) => ({ ...block }));
    },
  };
}

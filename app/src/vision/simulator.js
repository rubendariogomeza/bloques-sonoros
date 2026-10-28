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

/**
 * Caras sintéticas para probar Retrato sin cámara. Cada preset cambia piel,
 * pelo y proporciones: el mismo pipeline que la cámara debe producir otra
 * semilla y, por tanto, otra canción.
 */
const FACES = Object.freeze([
  Object.freeze({ skin: '#e8bea0', skinLight: '#f4d6bd', hair: '#2b1b12', brow: '#3a2418', eye: '#2a1d16', mouth: '#8d3440', aspect: 0.82, eyeGap: 0.2, lip: 1 }),
  Object.freeze({ skin: '#c08a63', skinLight: '#d7a67f', hair: '#171310', brow: '#241a13', eye: '#1c1512', mouth: '#7c2b34', aspect: 0.92, eyeGap: 0.23, lip: 0.9 }),
  Object.freeze({ skin: '#6e4b37', skinLight: '#8a6148', hair: '#0f0b09', brow: '#1b1310', eye: '#140f0d', mouth: '#6a2530', aspect: 0.78, eyeGap: 0.19, lip: 1.1 }),
  Object.freeze({ skin: '#f0cbaa', skinLight: '#fbe4cb', hair: '#c9922f', brow: '#8f6520', eye: '#3a2a1c', mouth: '#a04a52', aspect: 0.74, eyeGap: 0.21, lip: 0.85 }),
  Object.freeze({ skin: '#8a5a3c', skinLight: '#a87452', hair: '#3b2a1a', brow: '#2a1d12', eye: '#1a120e', mouth: '#73272f', aspect: 0.96, eyeGap: 0.24, lip: 1 }),
  Object.freeze({ skin: '#d9a98a', skinLight: '#ecc4a8', hair: '#5b3a24', brow: '#3f2718', eye: '#241812', mouth: '#8a3a44', aspect: 0.86, eyeGap: 0.22, lip: 0.95 }),
]);

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

  // Pared neutra para el modo retrato: fondo liso, sin textura que parezca piel.
  const wall = document.createElement('canvas');
  wall.width = width;
  wall.height = height;
  drawWall(wall.getContext('2d'));

  /** @type {Array<{column:number, y:number, color:string, size:number}>} */
  let blocks = [];
  let scene = 'blocks';
  let faceVisible = true;
  let blocksVisible = true;
  let faceIndex = 0;
  let facePhase = 0;
  let lightPhase = 0;
  let lightDrift = 0.16;

  function blockSize() {
    // Un bloque debe ocupar buena parte de su cuadro de la parrilla: si es muy
    // pequeño, la ocupación medida se queda por debajo del umbral y la celda
    // nunca suena en el simulador.
    return Math.max(20, Math.round((width / columns) * 0.72));
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

  function drawWall(target) {
    const gradient = target.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#d5d2cc');
    gradient.addColorStop(0.6, '#c9c6c0');
    gradient.addColorStop(1, '#b9b6b0');
    target.fillStyle = gradient;
    target.fillRect(0, 0, width, height);

    // Junta de baldosas: una línea tenue, no una textura que parezca un objeto.
    target.strokeStyle = 'rgba(120, 116, 110, 0.25)';
    target.lineWidth = 2;
    target.beginPath();
    target.moveTo(0, height * 0.78);
    target.lineTo(width, height * 0.78);
    target.stroke();
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

  function ellipse(target, x, y, rx, ry) {
    target.beginPath();
    target.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
  }

  /** Expresión animada y suave: la música la lee al empezar cada compás. */
  function expression() {
    const t = facePhase;
    const blink = Math.sin(t * 1.7) > 0.985 ? 0.12 : 1;
    return {
      mouthOpen: 0.2 + 0.45 * (0.5 + 0.5 * Math.sin(t * 0.9)),
      smile: 0.25 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.31 + 1.2)),
      eyesOpen: blink,
      tilt: Math.sin(t * 0.21) * 0.7,
    };
  }

  function drawFace(expr) {
    const preset = FACES[faceIndex % FACES.length];
    const cx = width * 0.5;
    const cy = height * 0.52;
    const faceH = height * 0.6;
    const faceW = faceH * preset.aspect;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(expr.tilt * 0.07);

    // Pelo: un óvalo algo mayor detrás de la cara.
    ctx.fillStyle = preset.hair;
    ellipse(ctx, 0, -faceH * 0.03, faceW * 0.56, faceH * 0.56);
    ctx.fill();

    // Cara.
    const skin = ctx.createRadialGradient(-faceW * 0.12, -faceH * 0.14, faceW * 0.08, 0, 0, faceW * 0.72);
    skin.addColorStop(0, preset.skinLight);
    skin.addColorStop(1, preset.skin);
    ctx.fillStyle = skin;
    ellipse(ctx, 0, faceH * 0.05, faceW * 0.5, faceH * 0.5);
    ctx.fill();

    // Orejas.
    ctx.fillStyle = preset.skin;
    for (const dir of [-1, 1]) {
      ellipse(ctx, dir * faceW * 0.49, faceH * 0.06, faceW * 0.06, faceH * 0.1);
      ctx.fill();
    }

    // Ojos: esclerótica clara y pupila oscura (lo que mide la heurística).
    const eyeY = -faceH * 0.06;
    const eyeDx = faceW * preset.eyeGap;
    const eyeRx = faceW * 0.105;
    const eyeRy = Math.max(1.5, faceH * 0.055 * expr.eyesOpen);
    for (const dir of [-1, 1]) {
      ctx.fillStyle = '#f7f2ec';
      ellipse(ctx, dir * eyeDx, eyeY, eyeRx, eyeRy);
      ctx.fill();
      ctx.fillStyle = preset.eye;
      ellipse(ctx, dir * eyeDx, eyeY, eyeRx * 0.44, Math.max(1.2, eyeRy * 0.9));
      ctx.fill();
    }

    // Cejas.
    ctx.strokeStyle = preset.brow;
    ctx.lineWidth = Math.max(2, faceH * 0.016);
    ctx.lineCap = 'round';
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(dir * eyeDx - eyeRx * 0.9, eyeY - faceH * 0.1);
      ctx.quadraticCurveTo(dir * eyeDx, eyeY - faceH * 0.13, dir * eyeDx + eyeRx * 0.9, eyeY - faceH * 0.09);
      ctx.stroke();
    }

    // Nariz: una sombra suave, sin contorno duro.
    ctx.fillStyle = 'rgba(60, 32, 20, 0.16)';
    ellipse(ctx, 0, faceH * 0.1, faceW * 0.055, faceH * 0.035);
    ctx.fill();

    // Boca: ancho y apertura cambian con el gesto; la sonrisa levanta las comisuras.
    const mouthW = faceW * 0.36;
    const mouthY = faceH * 0.24;
    const mouthH = Math.max(2, faceH * (0.012 + expr.mouthOpen * 0.085));
    ctx.fillStyle = preset.mouth;
    ellipse(ctx, 0, mouthY, mouthW / 2, mouthH / 2);
    ctx.fill();
    if (expr.smile > 0.45) {
      const lift = (expr.smile - 0.45) * faceH * 0.09;
      for (const dir of [-1, 1]) {
        ellipse(ctx, dir * mouthW * 0.5, mouthY - lift, mouthW * 0.07, Math.max(1.5, mouthH * 0.32));
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function render() {
    ctx.drawImage(scene === 'face' ? wall : backdrop, 0, 0);
    if (scene === 'face') {
      if (faceVisible) drawFace(expression());
    } else if (blocksVisible) {
      const sorted = [...blocks].sort((a, b) => a.y - b.y);
      for (const block of sorted) drawBlock(block);
    }

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
    if (scene === 'face') facePhase += dtMs / 1000;
    render();
  }

  /** Cambia entre la mesa de bloques y la pared con una cara. */
  function setScene(next) {
    scene = next === 'face' ? 'face' : 'blocks';
    render();
  }

  function showFace(visible) {
    faceVisible = Boolean(visible);
    render();
  }

  function showBlocks(visible) {
    blocksVisible = Boolean(visible);
    render();
  }

  /** Siguiente cara sintética: otra piel, otro pelo y otra canción. */
  function cycleFace() {
    faceIndex = (faceIndex + 1) % FACES.length;
    facePhase = 0;
    render();
    return faceIndex;
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
    setScene,
    showFace,
    showBlocks,
    cycleFace,
    setLightDrift,
    setColumns,
    dispose,
    get blocks() {
      return blocks.map((block) => ({ ...block }));
    },
    get faceIndex() {
      return faceIndex;
    },
    get scene() {
      return scene;
    },
  };
}

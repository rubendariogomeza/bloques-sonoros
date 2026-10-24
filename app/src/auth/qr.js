/**
 * Lector de QR offline.
 *
 * Usa `BarcodeDetector` cuando existe (Chrome/Android, rápido y nativo) y cae a
 * jsQR vendorizado en el resto de navegadores. Todo ocurre en el dispositivo.
 */
const SCAN_INTERVAL_MS = 120;
const DECODE_WIDTH = 480;

export function createQrScanner({ video } = {}) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  let detector = null;
  let running = false;
  let timer = null;
  let handler = null;
  let lastValue = '';
  let lastValueAt = 0;

  async function ensureDetector() {
    if (detector) return detector;
    if (!('BarcodeDetector' in window)) return null;
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats?.();
      if (supported && !supported.includes('qr_code')) return null;
      detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      return detector;
    } catch {
      return null;
    }
  }

  function decodeWithJsQr() {
    const jsQR = globalThis.jsQR;
    if (typeof jsQR !== 'function') return null;
    if (!video.videoWidth) return null;
    const ratio = video.videoHeight / video.videoWidth;
    canvas.width = DECODE_WIDTH;
    canvas.height = Math.round(DECODE_WIDTH * ratio);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(image.data, image.width, image.height, {
      inversionAttempts: 'dontInvert',
    });
    return result?.data ?? null;
  }

  async function scanOnce(scanDetector) {
    if (scanDetector) {
      try {
        const codes = await scanDetector.detect(video);
        if (codes?.length) return codes[0].rawValue ?? null;
        return null;
      } catch {
        return decodeWithJsQr();
      }
    }
    return decodeWithJsQr();
  }

  async function tick() {
    if (!running) return;
    const started = performance.now();
    try {
      if (video.readyState >= 2 && video.videoWidth) {
        const scanDetector = await ensureDetector();
        const value = await scanOnce(scanDetector);
        if (value) {
          const now = performance.now();
          // Evita spam del mismo código mientras el profesor lo acerca.
          if (value !== lastValue || now - lastValueAt > 2500) {
            lastValue = value;
            lastValueAt = now;
            handler?.(value);
          }
        }
      }
    } catch {
      /* frame ilegible: se reintenta en el siguiente tick */
    }
    if (!running) return;
    const elapsed = performance.now() - started;
    timer = setTimeout(tick, Math.max(40, SCAN_INTERVAL_MS - elapsed));
  }

  function start(onValue) {
    if (running) return;
    handler = onValue;
    running = true;
    lastValue = '';
    tick();
  }

  function stop() {
    running = false;
    if (timer) clearTimeout(timer);
    timer = null;
  }

  /** Alternativa sin cámara: decodifica una foto del manual. */
  async function scanImage(file) {
    const bitmap = await createImageBitmap(file);
    const max = 900;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const jsQR = globalThis.jsQR;
    const result = typeof jsQR === 'function' ? jsQR(image.data, image.width, image.height) : null;
    bitmap.close?.();
    return result?.data ?? null;
  }

  function dispose() {
    stop();
    handler = null;
  }

  return { start, stop, scanImage, dispose, get active() { return running; } };
}

const fileCanvas = document.createElement('canvas');
const fileContext = fileCanvas.getContext('2d', { willReadFrequently: true });

/** Decodifica un QR desde una imagen subida (sin cámara). */
export async function decodeImageFile(file) {
  const jsQR = globalThis.jsQR;
  if (typeof jsQR !== 'function') return null;
  const bitmap = await createImageBitmap(file);
  const max = 1000;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  fileCanvas.width = Math.round(bitmap.width * scale);
  fileCanvas.height = Math.round(bitmap.height * scale);
  fileContext.drawImage(bitmap, 0, 0, fileCanvas.width, fileCanvas.height);
  const image = fileContext.getImageData(0, 0, fileCanvas.width, fileCanvas.height);
  const result = jsQR(image.data, image.width, image.height);
  bitmap.close?.();
  return result?.data ?? null;
}

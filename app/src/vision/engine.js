/**
 * Motor de visión: fuente de frames → fondo → máscara → morfología → blobs →
 * capas → columnas. El bucle lo conduce `main.js` (un solo rAF para toda la app).
 */
import { createBackgroundModel } from './background.js';
import { createMaskProcessor } from './mask.js';
import { createMorphology } from './morphology.js';
import { createLabeler } from './components.js';
import { createLayersExtractor, classifyShape } from './layers.js';
import { createColumnModel } from './columns.js';
import { createStructureExtractor } from './structure.js';
import { createGridExtractor } from './grid.js';
import { estimateShift, shiftBackground } from './align.js';
import { GRID_ROWS } from '../core/config.js';
import { clamp } from '../core/util.js';

const MAX_BLOBS_PER_FRAME = 16;

function resolveElement(source) {
  if (!source) return null;
  return source.element ?? source;
}

export function createVisionEngine({
  source,
  width = 320,
  height = 240,
  columns = 16,
  rows = GRID_ROWS,
  sensitivity = 0.5,
  fps = 20,
  minAreaRatio = 0.0012,
  trackBlobs = true,
  trackStructure = true,
  trackGrid = true,
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true, alpha: false });

  const model = createBackgroundModel(width, height);
  const maskProcessor = createMaskProcessor(width, height);
  const morphology = createMorphology(width, height);
  const labeler = createLabeler(width, height);
  const layersExtractor = createLayersExtractor(width, height);
  const columnModel = createColumnModel({ columns });
  const structureExtractor = createStructureExtractor(width, height, columns);
  const gridExtractor = createGridExtractor(width, height, { columns, rows });

  const pixels = width * height;
  const minArea = Math.max(24, Math.round(pixels * minAreaRatio));
  const maxArea = Math.round(pixels * 0.45);

  let frameInterval = 1000 / Math.max(1, fps);
  let lastFrameAt = -Infinity;
  let calibration = null;
  let pendingAlign = false;
  let lastShift = { dx: 0, dy: 0 };
  let frameMs = 0;
  let measuredFps = 0;
  let started = false;
  // Aspecto visible del escenario: el recorte debe ser el mismo que pinta el
  // overlay para que la parrilla caiga exactamente sobre lo que ve el profesor.
  let viewAspect = width / height;
  let blobsEnabled = Boolean(trackBlobs);
  let structureEnabled = Boolean(trackStructure);
  let gridEnabled = Boolean(trackGrid);

  function drawFrame() {
    const element = resolveElement(source);
    if (!element) return false;
    const sw = element.videoWidth || element.naturalWidth || element.width || 0;
    const sh = element.videoHeight || element.naturalHeight || element.height || 0;
    if (!sw || !sh) return false;

    // Recorte central tipo "cover": el mismo que pinta el overlay, así la
    // parrilla y las columnas coinciden con lo que se ve en pantalla.
    const targetAspect = viewAspect;
    const sourceAspect = sw / sh;
    let cw = sw;
    let ch = sh;
    if (sourceAspect > targetAspect) cw = sh * targetAspect;
    else ch = sw / targetAspect;
    const cx = (sw - cw) / 2;
    const cy = (sh - ch) / 2;

    context.drawImage(element, cx, cy, cw, ch, 0, 0, width, height);
    return true;
  }

  function process(now) {
    if (!started) return null;
    const delta = now - lastFrameAt;
    if (delta < frameInterval) return null;
    const startedAt = performance.now();
    if (delta > 0 && delta < 2000) measuredFps = measuredFps * 0.85 + (1000 / delta) * 0.15;
    lastFrameAt = now;

    if (!drawFrame()) return null;
    const image = context.getImageData(0, 0, width, height);
    const rgba = image.data;

    if (calibration) {
      model.addCalibrationFrame(rgba);
      calibration.got += 1;
      if (calibration.got >= calibration.needed) {
        model.commitCalibration();
        maskProcessor.reset();
        columnModel.clear();
        gridExtractor.reset();
        calibration.resolve(true);
        calibration = null;
      }
      return { blocks: [], structure: null, grid: null, stats: stats(0, 0), calibrating: true };
    }

    if (!model.ready) return { blocks: [], structure: null, grid: null, stats: stats(0, 0) };

    if (pendingAlign) {
      pendingAlign = false;
      lastShift = estimateShift(rgba, model.bg, width, height);
      shiftBackground(model.bg, width, height, lastShift.dx, lastShift.dy);
      maskProcessor.reset();
    }

    maskProcessor.update(rgba, model, { sensitivity });
    morphology.openClose(maskProcessor.binary);
    // La parrilla se mide sobre la máscara completa: cuadro ocupado = hay algo.
    const grid = gridEnabled ? gridExtractor.measure(maskProcessor.binary, rgba, now) : null;
    const structure = structureEnabled ? structureExtractor.measure(maskProcessor.binary, rgba) : null;

    let blobs = [];
    const detectedLayers = [];
    let blobCount = 0;
    if (blobsEnabled) {
      blobs = labeler.label(maskProcessor.binary, { minArea, maxArea });
      for (const blob of blobs) {
        if (blobCount >= MAX_BLOBS_PER_FRAME) break;
        if (blob.fill < 0.22) continue;
        blobCount += 1;
        const shape = classifyShape(blob);
        const layers = layersExtractor.extract({ rgba, binary: maskProcessor.binary, blob });
        for (const layer of layers) {
          detectedLayers.push({
            column: clamp(Math.floor((blob.cx / width) * columnModel.columns), 0, columnModel.columns - 1),
            color: layer.color,
            y: layer.y,
            shape,
            confidence: layer.confidence,
          });
        }
      }
      columnModel.observe(detectedLayers, now);
    }

    model.adapt(rgba, maskProcessor.soft);

    frameMs = frameMs * 0.8 + (performance.now() - startedAt) * 0.2;

    return {
      blocks: blobsEnabled ? columnModel.blocks(now) : [],
      structure,
      grid,
      stats: stats(blobCount, detectedLayers.length, blobs),
    };
  }

  function stats(blobCount, layerCount, blobs = []) {
    return {
      fps: Math.round(measuredFps),
      frameMs: Math.round(frameMs * 10) / 10,
      coverage: Math.round(maskProcessor.coverage * 1000) / 1000,
      threshold: Math.round(maskProcessor.threshold * 1000) / 1000,
      light: Math.round(model.light * 100) / 100,
      blobs: blobCount,
      layers: layerCount,
      blocks: columnModel.count(performance.now()),
      calibrated: model.ready,
      shift: lastShift,
      sizes: blobs.slice(0, 6).map((blob) => ({
        area: blob.area,
        w: blob.w,
        h: blob.h,
        fill: Math.round(blob.fill * 100) / 100,
      })),
    };
  }

  /** Calibración completa; requiere que el área esté vacía (HU-03). */
  function calibrate({ frames = 10, timeoutMs = 6000 } = {}) {
    if (calibration) return Promise.reject(new Error('Ya hay una calibración en curso'));
    model.beginCalibration();
    maskProcessor.reset();
    const element = resolveElement(source);
    if (!element) return Promise.reject(new Error('No hay fuente de video'));
    return new Promise((resolve, reject) => {
      let remaining = timeoutMs;
      const arm = () => {
        timer = setTimeout(() => {
          // Pestaña en segundo plano: el rAF está dormido, no es un fallo de la cámara.
          if (typeof document !== 'undefined' && document.hidden) {
            remaining = Math.min(remaining, 1000);
            arm();
            return;
          }
          calibration = null;
          reject(new Error('Tiempo de calibración agotado: revisa la cámara'));
        }, remaining);
      };
      let timer = null;
      arm();
      calibration = {
        needed: frames,
        got: 0,
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
      };
    });
  }

  /**
   * Calibración de un solo frame, sin depender del bucle de render.
   * El simulador siempre arranca con la mesa vacía, así que no hay nada que promediar.
   */
  function calibrateOnce() {
    if (!drawFrame()) return false;
    const image = context.getImageData(0, 0, width, height);
    model.beginCalibration();
    model.addCalibrationFrame(image.data);
    model.commitCalibration();
    maskProcessor.reset();
    columnModel.clear();
    gridExtractor.reset();
    return true;
  }

  /** Recalibración en caliente: compensa el movimiento de la cámara (HU-04). */
  function recalibrateFast() {
    if (!model.ready) return false;
    pendingAlign = true;
    return true;
  }

  function setSensitivity(value) {
    sensitivity = clamp(value, 0, 1);
  }

  function setColumns(next) {
    columnModel.setColumns(next);
    structureExtractor.setColumns(next);
    gridExtractor.setColumns(next);
  }

  /** Activa solo los analizadores que el modo de juego necesita. */
  function setTrackers({ blobs, structure, grid } = {}) {
    if (blobs != null && Boolean(blobs) !== blobsEnabled) {
      blobsEnabled = Boolean(blobs);
      if (!blobsEnabled) columnModel.clear();
    }
    if (structure != null) structureEnabled = Boolean(structure);
    if (grid != null) {
      gridEnabled = Boolean(grid);
      if (!gridEnabled) gridExtractor.reset();
    }
  }

  /** Aspecto del escenario visible; define el recorte que se procesa. */
  function setViewAspect(value) {
    if (Number.isFinite(value) && value > 0.1 && value < 10) viewAspect = value;
  }

  function setFps(next) {
    frameInterval = 1000 / Math.max(1, next);
  }

  function start() {
    started = true;
  }

  function stop() {
    started = false;
  }

  function dispose() {
    stop();
    calibration = null;
    columnModel.clear();
    gridExtractor.reset();
  }

  return {
    canvas,
    start,
    stop,
    process,
    calibrate,
    calibrateOnce,
    recalibrateFast,
    setSensitivity,
    setColumns,
    setTrackers,
    setViewAspect,
    setFps,
    dispose,
    get columns() {
      return columnModel;
    },
    get calibrating() {
      return Boolean(calibration);
    },
    get ready() {
      return model.ready;
    },
    get stats() {
      return stats(0, 0);
    },
  };
}

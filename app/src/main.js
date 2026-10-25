/**
 * Punto de entrada de la PWA. Conecta licencia, cámara, visión, transporte,
 * audio y UI. Un único bucle de animación gobierna visión y overlay.
 */
import { DEFAULTS, LIMITS, COLUMN_CHOICES, COLOR_CLASSES, COLOR_LABELS, STORAGE_KEYS, SWEEP_BEATS, TEST_MODE } from './core/config.js';
import { clamp } from './core/util.js';
import { storage } from './platform/storage.js';
import { createApiClient, redeemMessage } from './auth/api.js';
import { createLicenseManager, DEMO_MINUTES } from './auth/license.js';
import { createQrScanner, decodeImageFile } from './auth/qr.js';
import { startCamera, cameraErrorMessage } from './vision/camera.js';
import { createSimulator } from './vision/simulator.js';
import { createVisionEngine } from './vision/engine.js';
import { createTransport } from './sequencer/transport.js';
import { createScheduler, LOOKAHEAD_BACKGROUND, LOOKAHEAD_FOREGROUND } from './sequencer/scheduler.js';
import { createAudioEngine } from './audio/engine.js';
import { createMelodyPlayer } from './audio/melody.js';
import { BASE_INTENT, createIntentTracker, describeIntent } from './music/variation.js';
import { KITS, KIT_IDS, getKit, defaultMapping, sampleLabel } from './audio/kits.js';
import { createOverlay } from './ui/overlay.js';
import { createHud } from './ui/hud.js';
import { createDock } from './ui/dock.js';
import { createSheets } from './ui/sheets.js';
import { createViews } from './ui/views.js';

const stage = document.getElementById('stage');
const hudRoot = document.getElementById('hud');
const bannerRoot = document.getElementById('banner');
const dockRoot = document.getElementById('dock');
const screensRoot = document.getElementById('screens');
const sheetRoot = document.getElementById('sheet-root');
const toastsRoot = document.getElementById('toasts');

const overlay = createOverlay(stage);
const hud = createHud({ hudRoot, bannerRoot, toastRoot: toastsRoot });
const api = createApiClient();
const license = createLicenseManager({ storage, api, testMode: TEST_MODE });
const audio = createAudioEngine();
const settings = loadSettings();
const transport = createTransport({ bpm: settings.bpm, columns: settings.columns, sweepBeats: SWEEP_BEATS });

let views = null;
let dock = null;
let sheets = null;
let kitsSheet = null;
let scheduler = null;
let session = null;
let scanSession = null;
let animation = 0;
let idleAt = performance.now();
let lastHudAt = 0;
let lastLicenseCheck = 0;
let cursor = 0;
let saveTimer = null;
let redeeming = false;

const live = {
  blocks: [],
  flashes: [],
  stats: null,
  progress: 0,
  calibrated: false,
  calibrating: false,
  mode: 'camera',
  intent: BASE_INTENT,
};

const intentTracker = createIntentTracker({ holdMs: 900 });
const melody = createMelodyPlayer({ audio, stepsPerBar: settings.columns });

const palette = [...COLOR_CLASSES];

/* ------------------------------------------------------------------------- */
/* Ajustes                                                                   */
/* ------------------------------------------------------------------------- */

function loadSettings() {
  const stored = storage.get(STORAGE_KEYS.settings, {}) ?? {};
  const merged = { ...DEFAULTS, ...stored };
  const mappingStore = merged.mappings && typeof merged.mappings === 'object' ? merged.mappings : {};
  return {
    bpm: clamp(Math.round(Number(merged.bpm) || DEFAULTS.bpm), LIMITS.bpm[0], LIMITS.bpm[1]),
    columns: COLUMN_CHOICES.includes(Number(merged.columns)) ? Number(merged.columns) : DEFAULTS.columns,
    kitId: KIT_IDS.includes(merged.kitId) ? merged.kitId : DEFAULTS.kitId,
    volume: clamp(Number(merged.volume) ?? DEFAULTS.volume, LIMITS.volume[0], LIMITS.volume[1]),
    sensitivity: clamp(Number(merged.sensitivity) ?? DEFAULTS.sensitivity, 0, 1),
    latencyMs: clamp(Math.round(Number(merged.latencyMs) || 0), 0, 300),
    metronome: Boolean(merged.metronome),
    melody: merged.melody !== false,
    accents: merged.accents !== false,
    showStats: Boolean(merged.showStats),
    muted: Boolean(merged.muted),
    mappings: mappingStore,
  };
}

function saveSettings() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    storage.set(STORAGE_KEYS.settings, settings);
  }, 250);
}

function mappingFor(kitId) {
  return settings.mappings[kitId] ?? defaultMapping(kitId);
}

/* ------------------------------------------------------------------------- */
/* Sesión: cámara o simulador + motor de visión + audio                      */
/* ------------------------------------------------------------------------- */

async function startSession(mode = 'camera') {
  await teardownSession();
  const wantsCamera = mode === 'camera' && license.features().camera;
  const loading = views.showLoading({
    title: 'Preparando el aula',
    detail: wantsCamera ? 'Conectando la cámara…' : 'Preparando los bloques virtuales…',
  });

  let source;
  try {
    if (wantsCamera) {
      const camera = await startCamera();
      source = {
        element: camera.element,
        kind: 'camera',
        ready: true,
        stop: () => camera.stop(),
      };
    } else {
      const simulator = createSimulator({ columns: settings.columns });
      source = simulator;
    }
  } catch (error) {
    const message = cameraErrorMessage(error);
    views.showOnboarding({ mode: license.mode ?? 'kit', message, kind: 'error' });
    return { ok: false, message };
  }

  try {
    loading.setDetail('Cargando sonidos…');
    await audio.init();
    await audio.loadKit(settings.kitId, (done, total) => {
      loading.setDetail(`Cargando sonidos… ${done}/${total}`);
    });
  } catch (error) {
    source.stop?.();
    const message = error?.message ?? 'No pudimos iniciar el audio.';
    views.showOnboarding({ mode: license.mode ?? 'kit', message, kind: 'error' });
    return { ok: false, message };
  }

  audio.setVolume(settings.volume);
  audio.setMuted(settings.muted);
  audio.setMapping(mappingFor(settings.kitId));

  const engine = createVisionEngine({
    source,
    columns: settings.columns,
    sensitivity: settings.sensitivity,
    fps: LIMITS.visionFps,
  });
  engine.start();

  session = { source, engine, mode: source.kind === 'camera' ? 'camera' : 'simulator' };
  live.mode = session.mode;
  live.calibrated = false;
  live.calibrating = false;
  live.blocks = [];
  live.flashes = [];
  live.progress = 0;
  live.intent = BASE_INTENT;
  intentTracker.reset();
  melody.reset();

  transport.setColumns(settings.columns, audio.currentTime);
  transport.setBpm(settings.bpm, audio.currentTime);
  scheduler = createScheduler({
    transport,
    clock: () => audio.currentTime,
    onStep: handleStep,
    lookahead: LOOKAHEAD_FOREGROUND,
  });

  views.hide();
  dockRoot.hidden = false;
  updateChrome();
  startLoop();
  document.body.dataset.view = 'live';

  if (session.mode === 'simulator') {
    // El simulador arranca con la mesa vacía: un frame basta y no depende del rAF.
    live.calibrated = session.engine.calibrateOnce();
    source.seedDemo();
    await play();
  } else {
    hud.banner('Retira los bloques y toca <b>Calibrar</b> para que la app aprenda el fondo de la pared.', {
      kind: 'warn',
      action: { label: 'Calibrar ahora', onClick: () => calibrateNow() },
    });
  }

  return { ok: true };
}

async function teardownSession() {
  if (animation) cancelAnimationFrame(animation);
  animation = 0;
  scheduler?.stop();
  scheduler = null;
  session?.engine?.dispose();
  session?.source?.stop?.();
  session = null;
  live.blocks = [];
  live.flashes = [];
  live.stats = null;
  live.calibrated = false;
  live.calibrating = false;
  hud.clearBanner();
  await audio.suspend().catch(() => {});
}

async function goLocked({ message = '', kind = 'info' } = {}) {
  await teardownSession();
  dockRoot.hidden = true;
  kitsSheet = null;
  sheets?.close();
  document.body.dataset.view = 'locked';
  views.showLicense({ message, kind });
}

/* ------------------------------------------------------------------------- */
/* Transporte y audio                                                        */
/* ------------------------------------------------------------------------- */

async function play() {
  if (!scheduler) return;
  await audio.resume().catch(() => {});
  const resuming = scheduler.stepsScheduled > 0;
  if (!resuming) {
    intentTracker.reset();
    melody.reset();
  }
  scheduler.start({ reset: !resuming });
  updateChrome();
}

async function togglePlay() {
  if (!scheduler) return;
  if (scheduler.running) {
    scheduler.stop();
    await audio.suspend().catch(() => {});
  } else {
    await play();
  }
  updateChrome();
}

function handleStep({ column, time, pass }) {
  if (!session) return;
  const now = performance.now();
  const when = time + settings.latencyMs / 1000;
  const intent = live.intent ?? BASE_INTENT;
  const active = session.engine.columns.active(now);
  const found = active.find((item) => item.column === column);

  if (settings.melody) {
    // La variación se aplica al empezar el compás: nunca a mitad de nota.
    if (column === 0) melody.beginBar({ bar: pass, intent, stepsPerBar: settings.columns });
    melody.playStep({ bar: pass, step: column, intent, stepsPerBar: settings.columns, when });
  }

  if (!found) {
    if (settings.metronome) audio.click(when);
    return;
  }

  const mapping = settings.melody ? audio.getMapping() : null;
  const accents = settings.melody && settings.accents && column % 2 === 0;
  let accentCount = 0;

  for (const entry of found.entries) {
    if (settings.melody) {
      // El acento es un adorno: dos por paso como máximo para no tapar la melodía.
      if (accents && accentCount < 2) {
        melody.playAccent({ sampleId: mapping[entry.color], column, columns: settings.columns, when });
        accentCount += 1;
      }
    } else {
      audio.playColor(entry.color, {
        when,
        y: entry.y,
        column,
        columns: settings.columns,
        gain: 0.92,
      });
    }
    live.flashes.push({ column, color: entry.color, at: now });
  }
  if (live.flashes.length > 64) live.flashes.splice(0, live.flashes.length - 64);
  if (settings.metronome) audio.click(when);
}

/* ------------------------------------------------------------------------- */
/* Calibración (HU-03 / HU-04 / HU-05)                                       */
/* ------------------------------------------------------------------------- */

async function calibrateNow({ quiet = false, autoPlay = true } = {}) {
  if (!session) return false;
  dock?.setCalibrating(true);
  if (!quiet) hud.banner('Mantén la pared <b>vacía</b> un momento…', { kind: 'info' });
  try {
    await session.engine.calibrate({ frames: 10, timeoutMs: 6000 });
    live.calibrated = true;
    hud.clearBanner();
    if (!quiet) hud.notify('Fondo calibrado. Ya puedes colocar bloques.', { kind: 'ok' });
    if (autoPlay && !scheduler?.running) await play();
    return true;
  } catch (error) {
    hud.banner(`No pudimos calibrar: ${error?.message ?? 'intenta de nuevo'}`, { kind: 'error' });
    return false;
  } finally {
    dock?.setCalibrating(false);
    updateChrome();
  }
}

function fastRecalibrate() {
  if (!session) return;
  if (!session.engine.recalibrateFast()) {
    hud.notify('Primero calibra el fondo con la pared vacía.', { kind: 'error' });
    return;
  }
  hud.notify('Recalibrando sin cortar la música…', { kind: 'info', timeout: 2200 });
}

/* ------------------------------------------------------------------------- */
/* Bucle de render                                                           */
/* ------------------------------------------------------------------------- */

function startLoop() {
  if (animation) cancelAnimationFrame(animation);
  let lastTs = performance.now();

  const frame = (ts) => {
    animation = requestAnimationFrame(frame);
    const dt = Math.min(80, ts - lastTs);
    lastTs = ts;
    if (!session) return;

    if (session.mode === 'simulator') session.source.tick(dt);

    const result = session.engine.process(ts);
    if (result) {
      live.blocks = result.blocks;
      live.stats = result.stats;
      live.calibrating = Boolean(result.calibrating);
      live.calibrated = Boolean(result.stats?.calibrated) && !result.calibrating;
      if (result.structure) live.intent = intentTracker.update(result.structure, ts);
    }

    live.progress = transport.progressAt(audio.currentTime);
    overlay.draw({
      source: session.source.element,
      progress: live.progress,
      columns: settings.columns,
      blocks: live.blocks,
      flashes: live.flashes,
      calibrated: live.calibrated,
      running: Boolean(scheduler?.running),
      now: ts,
    });

    const now = performance.now();
    if (live.flashes.length) live.flashes = live.flashes.filter((flash) => now - flash.at < 600);
    if (ts - lastHudAt > 240) {
      lastHudAt = ts;
      updateChrome();
    }
    if (now - lastLicenseCheck > 8000) {
      checkDemoExpiry(now);
    }
    if (!sheets?.isOpen && now - idleAt > 4200) document.body.classList.add('is-idle');
  };

  animation = requestAnimationFrame(frame);
}

function checkDemoExpiry(now) {
  if (!session) return;
  if (license.mode === 'demo' && !license.current()) {
    lastLicenseCheck = now;
    goLocked({
      message: `La prueba de ${DEMO_MINUTES} minutos terminó. Activa tu kit para continuar.`,
      kind: 'error',
    });
  }
}

function stateLabel() {
  if (!session) return { label: 'Sin sesión', kind: 'error' };
  if (live.calibrating) return { label: 'Calibrando', kind: 'warn' };
  if (!live.calibrated) return { label: 'Sin calibrar', kind: 'warn' };
  if (scheduler?.running) return { label: 'En vivo', kind: 'live' };
  return { label: 'En pausa', kind: 'warn' };
}

function updateChrome() {
  dock?.update({
    playing: Boolean(scheduler?.running),
    bpm: settings.bpm,
    muted: settings.muted,
    calibrated: live.calibrated,
    mode: live.mode,
  });
  hud.update({
    state: stateLabel(),
    bpm: settings.bpm,
    blocks: live.blocks.length,
    fps: live.stats?.fps ?? 0,
    mode: live.mode,
    showStats: settings.showStats,
    variation: settings.melody ? describeIntent(live.intent) : null,
  });
}

/* ------------------------------------------------------------------------- */
/* Mutaciones de ajustes                                                     */
/* ------------------------------------------------------------------------- */

function setBpm(value) {
  settings.bpm = clamp(Math.round(value), LIMITS.bpm[0], LIMITS.bpm[1]);
  if (scheduler) scheduler.setBpm(settings.bpm);
  else transport.setBpm(settings.bpm, audio.currentTime);
  saveSettings();
  updateChrome();
}

function setColumns(value) {
  if (!COLUMN_CHOICES.includes(value)) return;
  settings.columns = value;
  session?.engine.setColumns(value);
  if (session?.mode === 'simulator') session.source.setColumns(value);
  if (scheduler) scheduler.setColumns(value);
  else transport.setColumns(value, audio.currentTime);
  saveSettings();
  updateChrome();
  hud.notify(`Rejilla de ${value} pasos`, { timeout: 1600 });
}

function setSensitivity(value) {
  settings.sensitivity = clamp(value, 0, 1);
  session?.engine.setSensitivity(settings.sensitivity);
  saveSettings();
}

function setLatency(ms) {
  settings.latencyMs = clamp(Math.round(ms), 0, 300);
  saveSettings();
}

function setVolume(value) {
  settings.volume = clamp(value, 0, 1);
  audio.setVolume(settings.volume);
  saveSettings();
}

function setMetronome(value) {
  settings.metronome = Boolean(value);
  saveSettings();
}

function setMelody(value) {
  settings.melody = Boolean(value);
  melody.reset();
  saveSettings();
  updateChrome();
}

function setAccents(value) {
  settings.accents = Boolean(value);
  saveSettings();
}

function setStats(value) {
  settings.showStats = Boolean(value);
  saveSettings();
  updateChrome();
}

function toggleMute() {
  settings.muted = !settings.muted;
  audio.setMuted(settings.muted);
  saveSettings();
  updateChrome();
}

async function changeKit(kitId) {
  if (!KIT_IDS.includes(kitId) || kitId === settings.kitId) return;
  try {
    await audio.loadKit(kitId);
    audio.setMapping(mappingFor(kitId));
    settings.kitId = kitId;
    saveSettings();
    kitsSheet?.refresh();
    hud.notify(`Kit: ${getKit(kitId).name}`, { kind: 'ok' });
  } catch (error) {
    hud.notify(error?.message ?? 'No pudimos cargar el kit.', { kind: 'error' });
  }
}

function changeMapping(color, sampleId) {
  const next = audio.setMappingEntry(color, sampleId);
  settings.mappings[settings.kitId] = next;
  saveSettings();
  hud.notify(`${COLOR_LABELS[color]} → ${sampleLabel(sampleId)}`, { timeout: 1600 });
}

function resetMapping() {
  const mapping = defaultMapping(settings.kitId);
  audio.setMapping(mapping);
  settings.mappings[settings.kitId] = mapping;
  saveSettings();
  kitsSheet?.refresh();
  hud.notify('Sonidos restablecidos.', { kind: 'ok' });
}

async function changeMode(mode) {
  if (mode === live.mode) return;
  if (mode === 'camera' && !license.features().camera) {
    hud.notify('Activa un kit para usar la cámara. La prueba solo tiene bloques virtuales.', { kind: 'error' });
    return;
  }
  const wasPlaying = Boolean(scheduler?.running);
  sheets?.close();
  const result = await startSession(mode === 'camera' ? 'camera' : 'simulator');
  if (result.ok && !wasPlaying) {
    scheduler?.stop();
    await audio.suspend().catch(() => {});
    updateChrome();
  }
}

async function signOut() {
  if (license.testMode) {
    // Sin licencia real no hay nada que revocar: se vuelve al inicio de la prueba.
    await teardownSession();
    views.showOnboarding({ mode: 'test' });
    return;
  }
  if (license.mode === 'demo') {
    license.endDemo();
  } else {
    const confirmed = window.confirm('¿Desactivar este kit en este dispositivo? Necesitarás el código del manual para volver a entrar.');
    if (!confirmed) return;
    license.clear();
  }
  await goLocked();
}

/* ------------------------------------------------------------------------- */
/* Licencia y escaneo (HU-01)                                                */
/* ------------------------------------------------------------------------- */

async function redeemToken(rawToken) {
  const result = await license.redeem(rawToken);
  if (!result.ok) return { ok: false, message: redeemMessage(result.code) };
  hud.notify('¡Kit activado! Bienvenido a la clase.', { kind: 'ok' });
  stopScan();
  views.showOnboarding({ mode: 'kit' });
  return { ok: true };
}

async function beginScan({ video, onStatus }) {
  stopScan();
  onStatus('Pidiendo permiso a la cámara…');
  let camera;
  try {
    camera = await startCamera({ width: 960, height: 720 });
  } catch (error) {
    onStatus(cameraErrorMessage(error), 'error');
    return;
  }

  video.srcObject = camera.stream;
  video.muted = true;
  video.playsInline = true;
  try {
    await video.play();
  } catch {
    /* iOS necesita el gesto que ya ocurrió */
  }

  const scanner = createQrScanner({ video });
  scanSession = { camera, scanner };
  onStatus('Apunta al QR del manual y mantén el pulso firme.');

  scanner.start(async (value) => {
    if (redeeming) return;
    redeeming = true;
    onStatus('Código leído. Validando con el kit…');
    const result = await redeemToken(value);
    redeeming = false;
    if (!result.ok) onStatus(result.message, 'error');
  });
}

function stopScan() {
  if (!scanSession) return;
  scanSession.scanner.dispose();
  scanSession.camera.stop();
  scanSession = null;
}

async function uploadScan(file, onStatus) {
  onStatus('Leyendo la foto…');
  let value = null;
  try {
    value = await decodeImageFile(file);
  } catch {
    value = null;
  }
  if (!value) {
    onStatus('No encontramos un QR en la foto. Acércala más e intenta otra vez.', 'error');
    return;
  }
  stopScan();
  onStatus('Código leído. Validando…');
  const result = await redeemToken(value);
  if (!result.ok) onStatus(result.message, 'error');
}

function startDemo() {
  license.startDemo();
  dockRoot.hidden = true;
  views.showOnboarding({ mode: 'demo' });
}

/* ------------------------------------------------------------------------- */
/* Bloques virtuales                                                         */
/* ------------------------------------------------------------------------- */

function stageToSource(nx, ny) {
  if (!session) return { x: nx, y: ny };
  const element = session.source.element;
  const sourceWidth = element.videoWidth || element.width || 1;
  const sourceHeight = element.videoHeight || element.height || 1;
  const { width, height } = overlay.view;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const offsetX = (width - drawWidth) / 2;
  const offsetY = (height - drawHeight) / 2;
  return {
    x: clamp((nx * width - offsetX) / scale / sourceWidth, 0, 1),
    y: clamp((ny * height - offsetY) / scale / sourceHeight, 0, 1),
  };
}

stage.addEventListener('pointerdown', (event) => {
  // El primer toque tras el reposo solo devuelve los controles: no debe colocar un bloque.
  if (document.body.classList.contains('is-idle')) return;
  if (!session || session.mode !== 'simulator') return;
  const rect = stage.getBoundingClientRect();
  const point = stageToSource((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
  if (session.source.removeAt(point.x, point.y)) {
    hud.notify('Bloque retirado', { timeout: 1200 });
    return;
  }
  const color = palette[cursor % palette.length];
  cursor += 1;
  session.source.addBlock({ column: Math.floor(point.x * settings.columns), y: point.y, color });
});

function seedDemo() {
  if (session?.mode !== 'simulator') return;
  session.source.seedDemo();
  hud.notify('Patrón de ejemplo colocado. Toca para añadir o quitar bloques.', { kind: 'ok' });
}

/* ------------------------------------------------------------------------- */
/* Ciclo de vida de la interfaz                                              */
/* ------------------------------------------------------------------------- */

function markActive() {
  idleAt = performance.now();
  document.body.classList.remove('is-idle');
}

const handlers = {
  onTogglePlay: () => togglePlay(),
  onBpm: (value) => setBpm(value),
  onCalibrate: () => calibrateNow(),
  onRecalibrate: () => fastRecalibrate(),
  onOpenKits: () => {
    kitsSheet = sheets.openKits({
      kitId: settings.kitId,
      mapping: audio.getMapping(),
      kits: KITS,
    });
  },
  onOpenSettings: () => {
    sheets.openSettings({
      columns: settings.columns,
      sensitivity: settings.sensitivity,
      latencyMs: settings.latencyMs,
      volume: settings.volume,
      metronome: settings.metronome,
      melody: settings.melody,
      accents: settings.accents,
      showStats: settings.showStats,
      mode: live.mode,
      cameraAllowed: license.features().camera,
      testMode: license.testMode,
    });
  },
  onToggleMute: () => toggleMute(),
  onSeedDemo: () => seedDemo(),
  onKit: (id) => changeKit(id),
  onMapping: (color, sampleId) => changeMapping(color, sampleId),
  onResetMapping: () => resetMapping(),
  onColumns: (value) => setColumns(value),
  onSensitivity: (value) => setSensitivity(value),
  onLatency: (value) => setLatency(value),
  onVolume: (value) => setVolume(value),
  onMetronome: (value) => setMetronome(value),
  onMelody: (value) => setMelody(value),
  onAccents: (value) => setAccents(value),
  onStats: (value) => setStats(value),
  onMode: (mode) => changeMode(mode),
  onSignOut: () => signOut(),
  getKitId: () => settings.kitId,
  getMapping: () => audio.getMapping(),
  onStart: (mode) => startSession(mode),
  onScan: (payload) => beginScan(payload),
  onStopScan: () => stopScan(),
  onManual: (token) => redeemToken(token),
  onUpload: (file, onStatus) => uploadScan(file, onStatus),
  onDemo: () => startDemo(),
};

sheets = createSheets({ root: sheetRoot, handlers });
dock = createDock(dockRoot, handlers);
views = createViews(screensRoot, handlers);

document.addEventListener('pointerdown', markActive, { passive: true });
document.addEventListener('keydown', markActive);
document.addEventListener('wheel', markActive, { passive: true });
window.addEventListener('resize', markActive);

document.addEventListener('visibilitychange', () => {
  if (!scheduler) return;
  scheduler.setLookahead(document.hidden ? LOOKAHEAD_BACKGROUND : LOOKAHEAD_FOREGROUND);
  if (!document.hidden) {
    scheduler.resync();
    audio.resume().catch(() => {});
  }
});

window.addEventListener('beforeunload', () => {
  stopScan();
  scheduler?.stop();
  session?.engine?.dispose();
  session?.source?.stop?.();
  audio.dispose();
});

/* ------------------------------------------------------------------------- */
/* Arranque                                                                  */
/* ------------------------------------------------------------------------- */

async function boot() {
  registerServiceWorker();
  if (!license.isUnlocked()) {
    views.showLicense();
    return;
  }
  views.showOnboarding({ mode: license.mode });
  if (license.mode === 'kit') {
    const result = await license.verify();
    if (!result.ok && !result.transient && views.mounted) {
      await goLocked({
        message: 'Este kit ya está activado en otro dispositivo. Usa el código de tu manual o escribe al soporte.',
        kind: 'error',
      });
    }
  }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register('./sw.js');
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          hud.notify('Versión nueva lista. Cierra y abre la app para actualizar.', { timeout: 7000 });
        }
      });
    });
  } catch {
    /* modo sin service worker (HTTP no seguro, navegador antiguo) */
  }
}

boot();

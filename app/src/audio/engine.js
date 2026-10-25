/**
 * Motor de audio. Propiedad de todas las voces, del bus maestro y del reloj.
 *
 * Reglas:
 * - El AudioContext se crea solo tras un gesto del usuario (HU-02).
 * - Cada disparo programa un `AudioBufferSourceNode` en un instante absoluto.
 * - La polifonía es ilimitada dentro de un techo de 48 voces simultáneas.
 */
import { clamp } from '../core/util.js';
import { getKit, kitSampleIds, kitScale, sanitizeMapping } from './kits.js';
import { renderSample, SAMPLE_BASE_MIDI } from './synth.js';
import { semitonesToRate, yToSemitones } from '../sequencer/pattern.js';

export const MAX_VOICES = 48;

export function createAudioEngine({ renderer = renderSample } = {}) {
  let context = null;
  let master = null;
  let compressor = null;
  let buffers = new Map();
  let kit = getKit('percussion');
  let mapping = sanitizeMapping(kit);
  let volume = 0.85;
  let muted = false;
  let voices = 0;
  let disposed = false;

  function assertAlive() {
    if (disposed) throw new Error('El motor de audio ya fue liberado');
  }

  async function init() {
    assertAlive();
    if (context) {
      if (context.state === 'suspended') await context.resume();
      return context;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) throw new Error('Este navegador no soporta Web Audio.');
    context = new Ctor({ latencyHint: 'interactive' });
    compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.2;
    master = context.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(compressor);
    compressor.connect(context.destination);
    if (context.state === 'suspended') await context.resume();
    return context;
  }

  /** Renderiza en paralelo los samples que falten (kit + extras de la melodía). */
  async function loadKit(nextKitId, onProgress, { extraIds = [] } = {}) {
    assertAlive();
    const ctx = await init();
    const next = getKit(nextKitId);
    const ids = kitSampleIds(next, extraIds);
    let done = 0;
    const missing = ids.filter((id) => !buffers.has(id));
    await Promise.all(
      missing.map(async (id) => {
        const buffer = await renderer(id, ctx.sampleRate);
        buffers.set(id, buffer);
        done += 1;
        onProgress?.(done, missing.length, id);
      }),
    );
    kit = next;
    mapping = sanitizeMapping(next);
    return next;
  }

  function setMapping(next) {
    mapping = sanitizeMapping(kit, next);
    return mapping;
  }

  function setMappingEntry(color, sampleId) {
    mapping = sanitizeMapping(kit, { ...mapping, [color]: sampleId });
    return mapping;
  }

  function getMapping() {
    return { ...mapping };
  }

  function playSample(sampleId, { when, gain = 1, rate = 1, pan = 0 } = {}) {
    if (!context || voices >= MAX_VOICES) return false;
    const buffer = buffers.get(sampleId);
    if (!buffer) return false;
    const time = Math.max(context.currentTime + 0.001, when ?? context.currentTime);

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = clamp(rate, 0.25, 4);
    const voiceGain = context.createGain();
    voiceGain.gain.value = clamp(gain, 0, 1.5);

    let node = source.connect(voiceGain);
    if (pan !== 0 && context.createStereoPanner) {
      const panner = context.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      node = node.connect(panner);
    }
    node.connect(master);

    voices += 1;
    source.onended = () => {
      voices = Math.max(0, voices - 1);
      try {
        source.disconnect();
        voiceGain.disconnect();
      } catch {
        /* el nodo pudo ser recolectado */
      }
    };
    source.start(time);
    return true;
  }

  /**
   * Dispara el sonido de un color en una columna.
   * En kits melódicos la altura del bloque define la nota.
   */
  function playColor(color, { when, y = 0.5, gain = 0.9, column = 0, columns = 16 } = {}) {
    const sampleId = mapping[color];
    if (!sampleId) return false;
    let rate = 1;
    if (kit.mode === 'melodic') {
      rate = semitonesToRate(yToSemitones(y, kitScale(kit), 2));
    }
    const pan = columns > 1 ? ((column + 0.5) / columns) * 2 - 1 : 0;
    return playSample(sampleId, { when, gain, rate, pan: pan * 0.35 });
  }

  function click(when) {
    return playSample('click', { when, gain: 0.25 });
  }

  /**
   * Toca un sample melódico a una altura concreta.
   * La afinación se resuelve con `playbackRate`, sin renderizar un buffer por nota.
   */
  function playNote(sampleId, { when, midi = 69, gain = 0.6, pan = 0 } = {}) {
    const base = SAMPLE_BASE_MIDI[sampleId];
    if (base == null) return playSample(sampleId, { when, gain, pan });
    return playSample(sampleId, { when, gain, rate: 2 ** ((midi - base) / 12), pan });
  }

  function setVolume(next) {
    volume = clamp(next, 0, 1);
    if (master) master.gain.setTargetAtTime(muted ? 0 : volume, context.currentTime, 0.02);
  }

  function setMuted(next) {
    muted = Boolean(next);
    if (master) master.gain.setTargetAtTime(muted ? 0 : volume, context.currentTime, 0.02);
  }

  async function resume() {
    if (context && context.state !== 'running') await context.resume();
  }

  async function suspend() {
    if (context && context.state === 'running') await context.suspend();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    buffers.clear();
    if (context) {
      context.close().catch(() => {});
      context = null;
    }
    master = null;
    compressor = null;
  }

  return {
    init,
    loadKit,
    playColor,
    playNote,
    playSample,
    click,
    setMapping,
    setMappingEntry,
    getMapping,
    setVolume,
    setMuted,
    resume,
    suspend,
    dispose,
    get context() {
      return context;
    },
    get currentTime() {
      return context ? context.currentTime : 0;
    },
    get state() {
      return context ? context.state : 'closed';
    },
    get kit() {
      return kit;
    },
    get volume() {
      return volume;
    },
    get muted() {
      return muted;
    },
    get voiceCount() {
      return voices;
    },
    get isReady() {
      return Boolean(context) && buffers.size > 0;
    },
  };
}

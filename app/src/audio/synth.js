/**
 * Sintetizador de samples.
 *
 * Los sonidos se renderizan con `OfflineAudioContext` al arrancar: cero assets,
 * cero licencias de audio, cero red. Cada buffer queda en memoria y se dispara
 * con `AudioBufferSourceNode`, que es la única forma de garantizar precisión
 * muestral en la Web Audio API.
 */
export const SAMPLE_LABELS = Object.freeze({
  kick: 'Bombo',
  snare: 'Caja',
  hat: 'Charles cerrado',
  openhat: 'Charles abierto',
  clap: 'Palmas',
  tomLow: 'Tom grave',
  tomMid: 'Tom medio',
  tomHigh: 'Tom agudo',
  rim: 'Aro',
  cowbell: 'Cencerro',
  wood: 'Madera',
  shaker: 'Sonaja',
  marimba: 'Marimba',
  bell: 'Campana',
  bass: 'Bajo',
  pluck: 'Pizzicato',
  water: 'Agua',
  chime: 'Carillón',
});

/**
 * Altura real de cada sample melódico, en nota MIDI.
 *
 * El motor afina por `playbackRate`: conociendo la nota de origen se puede pedir
 * una nota concreta y la melodía deja de depender del sample elegido.
 */
export const SAMPLE_BASE_MIDI = Object.freeze({
  marimba: 72, // Do5 · 523,25 Hz
  bell: 81, // La5 · 880 Hz
  pluck: 64, // Mi4 · 329,6 Hz
  bass: 45, // La2 · 110 Hz
  chime: 84, // Do6 aproximado
});

const NOISE_SECONDS = 1.2;

function makeGain(ctx, out, peak, attack, decay, start = 0) {
  const gain = ctx.createGain();
  const safePeak = Math.max(0.0002, peak);
  const safeAttack = Math.max(0.0008, attack);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(safePeak, start + safeAttack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + safeAttack + decay);
  gain.connect(out);
  return gain;
}

function makeNoise(ctx, seconds = NOISE_SECONDS) {
  const length = Math.max(1, Math.ceil(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  return source;
}

function tone(ctx, out, { type = 'sine', from, to, duration, peak, decay, attack = 0.004 }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, 0);
  if (to && to !== from) osc.frequency.exponentialRampToValueAtTime(to, Math.min(duration, 0.5));
  const gain = makeGain(ctx, out, peak, attack, decay);
  osc.connect(gain);
  osc.start(0);
  osc.stop(Math.min(duration, attack + decay + 0.05));
  return osc;
}

export const SYNTH_DEFS = Object.freeze({
  kick: {
    duration: 0.55,
    build(ctx, out) {
      tone(ctx, out, { from: 196, to: 46, duration: 0.5, peak: 0.95, decay: 0.4 });
      const noise = makeNoise(ctx, 0.03);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2200;
      const gain = makeGain(ctx, out, 0.18, 0.001, 0.022);
      noise.connect(filter).connect(gain);
      noise.start(0);
      noise.stop(0.03);
    },
  },

  snare: {
    duration: 0.35,
    build(ctx, out) {
      const noise = makeNoise(ctx, 0.25);
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 1500;
      const gain = makeGain(ctx, out, 0.55, 0.002, 0.17);
      noise.connect(highpass).connect(gain);
      noise.start(0);
      noise.stop(0.25);
      tone(ctx, out, { type: 'triangle', from: 190, to: 150, duration: 0.15, peak: 0.32, decay: 0.11 });
    },
  },

  hat: {
    duration: 0.12,
    build(ctx, out) {
      const noise = makeNoise(ctx, 0.1);
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 7200;
      const gain = makeGain(ctx, out, 0.3, 0.001, 0.055);
      noise.connect(highpass).connect(gain);
      noise.start(0);
      noise.stop(0.1);
    },
  },

  openhat: {
    duration: 0.45,
    build(ctx, out) {
      const noise = makeNoise(ctx, 0.42);
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 6400;
      const gain = makeGain(ctx, out, 0.26, 0.002, 0.36);
      noise.connect(highpass).connect(gain);
      noise.start(0);
      noise.stop(0.42);
    },
  },

  clap: {
    duration: 0.4,
    build(ctx, out) {
      const offsets = [0, 0.012, 0.024];
      for (const offset of offsets) {
        const noise = makeNoise(ctx, 0.12);
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 1250;
        band.Q.value = 1.1;
        const gain = makeGain(ctx, out, 0.42, 0.001, 0.035, offset);
        noise.connect(band).connect(gain);
        noise.start(offset);
        noise.stop(offset + 0.06);
      }
      const tail = makeNoise(ctx, 0.3);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1100;
      const gain = makeGain(ctx, out, 0.2, 0.005, 0.22, 0.03);
      tail.connect(band).connect(gain);
      tail.start(0.03);
      tail.stop(0.3);
    },
  },

  tomLow: {
    duration: 0.55,
    build(ctx, out) {
      tone(ctx, out, { from: 120, to: 78, duration: 0.5, peak: 0.7, decay: 0.42 });
    },
  },

  tomMid: {
    duration: 0.5,
    build(ctx, out) {
      tone(ctx, out, { from: 176, to: 112, duration: 0.45, peak: 0.65, decay: 0.36 });
    },
  },

  tomHigh: {
    duration: 0.45,
    build(ctx, out) {
      tone(ctx, out, { from: 248, to: 160, duration: 0.4, peak: 0.6, decay: 0.3 });
    },
  },

  rim: {
    duration: 0.16,
    build(ctx, out) {
      tone(ctx, out, { type: 'square', from: 1750, to: 1500, duration: 0.08, peak: 0.22, decay: 0.03 });
      const noise = makeNoise(ctx, 0.05);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 2800;
      const gain = makeGain(ctx, out, 0.25, 0.001, 0.03);
      noise.connect(band).connect(gain);
      noise.start(0);
      noise.stop(0.05);
    },
  },

  cowbell: {
    duration: 0.4,
    build(ctx, out) {
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 900;
      band.Q.value = 1.4;
      band.connect(out);
      const gain = makeGain(ctx, band, 0.3, 0.003, 0.28);
      for (const frequency of [560, 845]) {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = frequency;
        const partial = ctx.createGain();
        partial.gain.value = 0.5;
        osc.connect(partial).connect(gain);
        osc.start(0);
        osc.stop(0.35);
      }
    },
  },

  wood: {
    duration: 0.18,
    build(ctx, out) {
      tone(ctx, out, { from: 1400, to: 1180, duration: 0.12, peak: 0.55, decay: 0.06, attack: 0.001 });
      const noise = makeNoise(ctx, 0.04);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 3200;
      const gain = makeGain(ctx, out, 0.2, 0.001, 0.025);
      noise.connect(band).connect(gain);
      noise.start(0);
      noise.stop(0.04);
    },
  },

  shaker: {
    duration: 0.2,
    build(ctx, out) {
      const noise = makeNoise(ctx, 0.18);
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 5200;
      const gain = makeGain(ctx, out, 0.24, 0.012, 0.11);
      noise.connect(highpass).connect(gain);
      noise.start(0);
      noise.stop(0.18);
    },
  },

  marimba: {
    duration: 0.9,
    build(ctx, out) {
      tone(ctx, out, { from: 523.25, to: 523.25, duration: 0.85, peak: 0.55, decay: 0.7 });
      tone(ctx, out, { from: 1046.5, to: 1046.5, duration: 0.5, peak: 0.16, decay: 0.35 });
      tone(ctx, out, { from: 1568, to: 1568, duration: 0.3, peak: 0.07, decay: 0.18 });
    },
  },

  bell: {
    duration: 1.3,
    build(ctx, out) {
      tone(ctx, out, { from: 880, to: 880, duration: 1.2, peak: 0.4, decay: 1.1 });
      tone(ctx, out, { from: 1320, to: 1320, duration: 1.0, peak: 0.2, decay: 0.8 });
      tone(ctx, out, { from: 1760, to: 1760, duration: 0.8, peak: 0.12, decay: 0.6 });
      tone(ctx, out, { from: 2640, to: 2640, duration: 0.5, peak: 0.05, decay: 0.35 });
    },
  },

  bass: {
    duration: 0.7,
    build(ctx, out) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 110;
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(700, 0);
      lowpass.frequency.exponentialRampToValueAtTime(220, 0.45);
      lowpass.Q.value = 4;
      const gain = makeGain(ctx, lowpass, 0.42, 0.006, 0.5);
      osc.connect(lowpass).connect(gain);
      osc.start(0);
      osc.stop(0.6);
    },
  },

  pluck: {
    duration: 0.45,
    build(ctx, out) {
      tone(ctx, out, { type: 'triangle', from: 330, to: 330, duration: 0.4, peak: 0.4, decay: 0.28 });
      tone(ctx, out, { type: 'sine', from: 660, to: 660, duration: 0.3, peak: 0.14, decay: 0.18 });
    },
  },

  water: {
    duration: 0.6,
    build(ctx, out) {
      const noise = makeNoise(ctx, 0.55);
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(1600, 0);
      lowpass.frequency.exponentialRampToValueAtTime(320, 0.5);
      const gain = makeGain(ctx, out, 0.35, 0.01, 0.45);
      noise.connect(lowpass).connect(gain);
      noise.start(0);
      noise.stop(0.55);
      tone(ctx, out, { from: 420, to: 180, duration: 0.5, peak: 0.18, decay: 0.4 });
    },
  },

  chime: {
    duration: 1.1,
    build(ctx, out) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, 0);
      osc.frequency.exponentialRampToValueAtTime(1560, 0.18);
      const gain = makeGain(ctx, out, 0.28, 0.004, 0.9);
      osc.connect(gain);
      osc.start(0);
      osc.stop(1.0);
      tone(ctx, out, { from: 2340, to: 2340, duration: 0.6, peak: 0.06, decay: 0.5 });
    },
  },

  click: {
    duration: 0.1,
    build(ctx, out) {
      tone(ctx, out, { from: 1800, to: 1800, duration: 0.05, peak: 0.25, decay: 0.02, attack: 0.001 });
    },
  },
});

export const SAMPLE_IDS = Object.freeze(Object.keys(SYNTH_DEFS));

/** Renderiza un sample completo a un AudioBuffer. */
export async function renderSample(sampleId, sampleRate = 44100) {
  const def = SYNTH_DEFS[sampleId];
  if (!def) throw new Error(`Sample desconocido: ${sampleId}`);
  const OfflineCtor = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!OfflineCtor) throw new Error('OfflineAudioContext no disponible');
  const length = Math.max(1, Math.ceil(def.duration * sampleRate));
  const ctx = new OfflineCtor(1, length, sampleRate);
  const out = ctx.createGain();
  out.gain.value = 1;
  out.connect(ctx.destination);
  def.build(ctx, out);
  return ctx.startRendering();
}

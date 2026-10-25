/**
 * Reproductor de la melodía.
 *
 * Traduce una variación a notas concretas y las agenda dentro de la ventana de
 * lookahead del scheduler, igual que cualquier otro sample: la precisión sigue
 * viviendo en `AudioContext.currentTime`, no en `setTimeout`.
 */
import { clamp } from '../core/util.js';
import { SAMPLE_BASE_MIDI } from './synth.js';
import { KEY_MIDI, PENTATONIC, renderBar } from '../music/song.js';

/** Timbre solista y acompañante según el color dominante de la estructura. */
const TIMBRES = Object.freeze([
  Object.freeze({ lead: 'marimba', harmony: 'marimba' }),
  Object.freeze({ lead: 'bell', harmony: 'marimba' }),
  Object.freeze({ lead: 'pluck', harmony: 'bell' }),
]);

/**
 * Samples que la melodía usa siempre, aunque el kit elegido sea de percusión.
 * El kit define el modo bloque → sonido; la melodía guiada tiene su propia paleta.
 */
export const MELODY_SAMPLE_IDS = Object.freeze(['marimba', 'bell', 'pluck', 'bass', 'chime']);

/** Do6: referencia del acento cuando el sample no tiene altura definida. */
const ACCENT_BASE = 84;
/** Seis grados pentatónicos: una octava de recorrido, tasa de reproducción 1–2×. */
const ACCENT_DEGREES = 6;

export function isPitched(sampleId) {
  return Object.hasOwn(SAMPLE_BASE_MIDI, sampleId);
}

export function midiToRate(midi, sampleId) {
  const base = SAMPLE_BASE_MIDI[sampleId] ?? 69;
  return 2 ** ((midi - base) / 12);
}

/** Nota del acento según la columna: izquierda grave, derecha aguda. */
export function accentMidi(column, columns, base = ACCENT_BASE) {
  const safeColumns = Math.max(1, columns);
  const degree = clamp(Math.floor(((column + 0.5) / safeColumns) * ACCENT_DEGREES), 0, ACCENT_DEGREES - 1);
  const semitone = PENTATONIC[degree % PENTATONIC.length] + 12 * Math.floor(degree / PENTATONIC.length);
  // La octava se ancla a la tonalidad y se acerca al sample: el acento cae
  // siempre en la pentatónica y nunca se vuelve chillón.
  const root = KEY_MIDI + 12 * Math.round((base - KEY_MIDI) / 12);
  return root + semitone;
}

export function createMelodyPlayer({ audio, stepsPerBar = 16 } = {}) {
  let bar = -1;
  let steps = Math.max(4, Math.round(stepsPerBar));
  let notes = [];
  let cursor = 0;

  function load({ bar: barIndex, intent, stepsPerBar: nextSteps }) {
    bar = barIndex;
    steps = Math.max(4, Math.round(nextSteps ?? steps));
    notes = renderBar(barIndex, intent, { stepsPerBar: steps });
    cursor = 0;
  }

  function beginBar({ bar: barIndex, intent, stepsPerBar: nextSteps }) {
    load({ bar: barIndex, intent, stepsPerBar: nextSteps });
  }

  function sampleOf(note, intent) {
    if (note.voice === 'bass') return 'bass';
    const timbre = TIMBRES[clamp(intent?.timbre ?? 0, 0, TIMBRES.length - 1)] ?? TIMBRES[0];
    return note.voice === 'harmony' ? timbre.harmony : timbre.lead;
  }

  /**
   * Agenda las notas que empiezan exactamente en este paso.
   * @returns {number} notas programadas
   */
  function playStep({ bar: barIndex, step, intent, stepsPerBar: nextSteps, when }) {
    if (barIndex !== bar || (nextSteps != null && Math.max(4, Math.round(nextSteps)) !== steps)) {
      load({ bar: barIndex, intent, stepsPerBar: nextSteps });
    }
    while (cursor < notes.length && notes[cursor].step < step) cursor += 1;
    let played = 0;
    while (cursor < notes.length && notes[cursor].step === step) {
      const note = notes[cursor];
      cursor += 1;
      audio.playNote(sampleOf(note, intent), {
        when,
        midi: note.midi,
        gain: note.gain,
        pan: clamp((note.midi - KEY_MIDI) / 24, -1, 1) * 0.3,
      });
      played += 1;
    }
    return played;
  }

  /** Acento puntual al cruzar un bloque: siempre en la pentatónica. */
  function playAccent({ sampleId, column, columns, when, gain = 0.3 }) {
    const id = isPitched(sampleId) ? sampleId : 'chime';
    // Se afina alrededor de la nota natural del sample para no volverlo chillón.
    const base = SAMPLE_BASE_MIDI[id] ?? ACCENT_BASE;
    return audio.playNote(id, { when, midi: accentMidi(column, columns, base), gain });
  }

  function reset() {
    bar = -1;
    notes = [];
    cursor = 0;
  }

  return {
    beginBar,
    playStep,
    playAccent,
    reset,
    get currentBar() {
      return bar;
    },
    get stepsPerBar() {
      return steps;
    },
  };
}

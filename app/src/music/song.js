/**
 * La canción: una melodía pentatónica de cuatro compases que nunca desafina.
 *
 * Regla de oro: todo lo que suena pertenece a la pentatónica de Do (Do, Re, Mi,
 * Sol, La) o a las notas del acorde del compás. Por eso cualquier variación
 * —registro, densidad, adorno, bajo— es consonante por construcción, sin
 * necesidad de corregir notas sobre la marcha.
 */
import { mod } from '../core/util.js';
import { BASE_INTENT } from './variation.js';

/** Do5: centro del registro de la melodía. */
export const KEY_MIDI = 72;
export const BEATS_PER_BAR = 4;
export const PENTATONIC = Object.freeze([0, 2, 4, 7, 9]);

/** I – V – vi – IV en Do: la progresión de casi todas las canciones infantiles. */
export const PROGRESSION = Object.freeze([
  Object.freeze({ root: 0, third: 4, fifth: 7 }),
  Object.freeze({ root: 7, third: 11, fifth: 14 }),
  Object.freeze({ root: 9, third: 12, fifth: 16 }),
  Object.freeze({ root: 5, third: 9, fifth: 12 }),
]);

/** Melodía base: [grado pentatónico, duración en negras]. */
const MELODY = Object.freeze([
  Object.freeze([[0, 1], [2, 0.5], [4, 0.5], [3, 1], [2, 1]]),
  Object.freeze([[4, 1], [3, 0.5], [2, 0.5], [1, 1], [0, 1]]),
  Object.freeze([[2, 1], [4, 0.5], [5, 0.5], [4, 1], [2, 1]]),
  Object.freeze([[3, 1], [2, 0.5], [1, 0.5], [0, 2]]),
]);

const GAIN = Object.freeze({ lead: 0.6, echo: 0.3, harmony: 0.26, bass: 0.42, arp: 0.4, trill: 0.26 });

export function degreeToMidi(degree, octaveShift = 0) {
  const octave = Math.floor(degree / PENTATONIC.length);
  return KEY_MIDI + octaveShift * 12 + octave * 12 + PENTATONIC[mod(degree, PENTATONIC.length)];
}

export function chordOf(bar) {
  return PROGRESSION[mod(bar, PROGRESSION.length)];
}

/**
 * Notas del compás para una variación concreta.
 * @returns {Array<{step:number, midi:number, gain:number, voice:'lead'|'harmony'|'bass'}>}
 */
export function renderBar(bar, intent = BASE_INTENT, { stepsPerBar = 16 } = {}) {
  const steps = Math.max(4, Math.round(stepsPerBar));
  const stepScale = steps / BEATS_PER_BAR;
  const shift = (intent.register ?? 1) - 1;
  const chord = chordOf(bar);
  const pattern = MELODY[mod(bar, MELODY.length)];
  const toStep = (beat) => Math.round(beat * stepScale);
  const midiOf = (degree) => degreeToMidi(degree, shift);

  const notes = [];
  const base = [];
  let beat = 0;
  for (const [degree, length] of pattern) {
    base.push({ beat, degree, length });
    beat += length;
  }

  const ornament = intent.ornament ?? 0;
  const arpeggioBeat = BEATS_PER_BAR - 1;
  const keep = (note) => {
    if (ornament === 1 && note.beat >= arpeggioBeat) return false;
    if (intent.density === 0 && !Number.isInteger(note.beat)) return false;
    return true;
  };

  for (const note of base) {
    if (!keep(note)) continue;
    const step = toStep(note.beat);
    notes.push({ step, midi: midiOf(note.degree), gain: GAIN.lead, voice: 'lead' });

    // Corcheas → semicorcheas: eco suave del mismo grado, sin añadir armonía nueva.
    if (intent.density === 2 && step + Math.round(stepScale / 2) < steps) {
      notes.push({ step: step + Math.round(stepScale / 2), midi: midiOf(note.degree), gain: GAIN.echo, voice: 'lead' });
    }

    // Trino: alterna el grado superior en las notas largas.
    if (ornament === 2 && note.length >= 1) {
      const trillStep = toStep(note.beat + 0.5);
      if (trillStep < steps) notes.push({ step: trillStep, midi: midiOf(note.degree + 1), gain: GAIN.trill, voice: 'lead' });
    }

    // Base ancha de la estructura → tercera paralela suave sobre cada negra.
    if (intent.bass && Number.isInteger(note.beat)) {
      notes.push({ step, midi: midiOf(note.degree + 2), gain: GAIN.harmony, voice: 'harmony' });
    }
  }

  if (ornament === 1) {
    const tones = [chord.root, chord.third, chord.fifth];
    tones.forEach((tone, index) => {
      const step = toStep(arpeggioBeat + index * 0.25);
      if (step >= steps) return;
      notes.push({ step, midi: KEY_MIDI + shift * 12 + 12 + tone, gain: GAIN.arp, voice: 'lead' });
    });
  }

  if (intent.bass) {
    notes.push({ step: 0, midi: KEY_MIDI - 36 + chord.root, gain: GAIN.bass, voice: 'bass' });
  }

  notes.sort((a, b) => a.step - b.step);
  return notes;
}

/** Notas del acorde en clase de altura, para validar armonía en pruebas. */
export function chordPitchClasses(bar) {
  const chord = chordOf(bar);
  return [chord.root, chord.third, chord.fifth].map((tone) => mod(KEY_MIDI + tone, 12));
}

export function scalePitchClasses() {
  return PENTATONIC.map((tone) => mod(KEY_MIDI + tone, 12));
}

/** Hojas modales: kits de sonido, ajustes y ayuda. */
import { COLOR_CLASSES, COLOR_HEX, COLOR_LABELS, COLUMN_CHOICES, APP } from '../core/config.js';
import { KITS, SAMPLE_OPTIONS } from '../audio/kits.js';
import { el, clear, setPressed } from './dom.js';

export function createSheets({ root, handlers }) {
  let closeHandler = null;
  let lastFocused = null;

  function close() {
    root.hidden = true;
    clear(root);
    closeHandler = null;
    lastFocused?.focus?.({ preventScroll: true });
    lastFocused = null;
  }

  function open(node, onClose) {
    clear(root);
    lastFocused = document.activeElement;
    closeHandler = onClose ?? null;
    root.append(node);
    root.hidden = false;
    node.querySelector('[data-close]')?.focus({ preventScroll: true });
  }

  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function trapFocus(event) {
    if (event.key !== 'Tab' || root.hidden) return;
    const items = [...root.querySelectorAll(FOCUSABLE)].filter((node) => node.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  root.addEventListener('click', (event) => {
    if (event.target === root) close();
    if (event.target.closest('[data-close]')) close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !root.hidden) {
      closeHandler?.();
      close();
    } else {
      trapFocus(event);
    }
  });

  function head(title) {
    return el('header', { class: 'sheet__head' }, [
      el('div', { class: 'sheet__title', text: title }),
      el('button', { class: 'icon-btn', type: 'button', 'data-close': true, 'aria-label': 'Cerrar' }, ['✕']),
    ]);
  }

  function openKits(state) {
    const kitList = el('div', { class: 'kits' });

    const mappingList = el('div', { class: 'mapping' });

    function renderMapping(mapping) {
      clear(mappingList);
      for (const color of COLOR_CLASSES) {
        const select = el(
          'select',
          {
            class: 'select',
            'aria-label': `Sonido para el bloque ${COLOR_LABELS[color]}`,
            onchange: (event) => handlers.onMapping(color, event.target.value),
          },
          SAMPLE_OPTIONS.map((option) =>
            el('option', {
              value: option.id,
              text: option.label,
              selected: option.id === mapping[color],
            }),
          ),
        );
        mappingList.append(
          el('div', { class: 'mapping__row' }, [
            el('span', { class: 'swatch', style: { background: COLOR_HEX[color] } }),
            el('span', { class: 'mapping__name', text: COLOR_LABELS[color] }),
            select,
          ]),
        );
      }
    }

    function renderKits() {
      clear(kitList);
      for (const kit of KITS) {
        const card = el(
          'button',
          {
            class: 'kit-card',
            type: 'button',
            'aria-pressed': String(kit.id === state.kitId),
            onclick: async () => {
              if (kit.id === state.kitId) return;
              card.disabled = true;
              await handlers.onKit(kit.id);
              card.disabled = false;
            },
          },
          [el('strong', { text: kit.name }), el('span', { text: kit.description })],
        );
        kitList.append(card);
      }
    }

    renderKits();
    renderMapping(state.mapping);

    const node = el('section', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Sonidos de los bloques' }, [
      head('Sonidos de los bloques'),
      el('div', { class: 'sheet__body' }, [
        el('div', null, [
          el('div', { class: 'section-title', text: 'Kit' }),
          kitList,
        ]),
        el('div', null, [
          el('div', { class: 'section-title', text: 'Color → sonido' }),
          mappingList,
          el('p', { class: 'setting__hint', text: 'En los kits melódicos, la altura del bloque también elige la nota.' }),
        ]),
      ]),
      el('div', { class: 'sheet__foot' }, [
        el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => handlers.onResetMapping() }, ['Restablecer kit']),
        el('button', { class: 'btn btn--sm', type: 'button', 'data-close': true }, ['Listo']),
      ]),
    ]);

    // Mantiene el resaltado del kit tras un cambio asíncrono.
    open(node);
    return {
      refresh() {
        state.kitId = handlers.getKitId();
        renderKits();
        renderMapping(handlers.getMapping());
      },
    };
  }

  function openSettings(state) {
    const columnsValue = el('span', { class: 'setting__value', text: String(state.columns) });
    const columnsGroup = el('div', { class: 'segmented', 'data-el': 'columns' });
    for (const option of COLUMN_CHOICES) {
      columnsGroup.append(
        el(
          'button',
          {
            type: 'button',
            text: String(option),
            'aria-pressed': String(option === state.columns),
            onclick: (event) => {
              handlers.onColumns(option);
              for (const button of columnsGroup.children) setPressed(button, Number(button.textContent) === option);
              columnsValue.textContent = String(option);
              event.currentTarget.blur();
            },
          },
        ),
      );
    }

    function slider({ label, hint, min, max, step, value, format, onInput }) {
      const output = el('span', { class: 'setting__value', text: format(value) });
      const input = el('input', {
        type: 'range',
        min,
        max,
        step,
        value,
        'aria-label': label,
        oninput: (event) => {
          const next = Number(event.target.value);
          output.textContent = format(next);
          onInput(next);
        },
      });
      return el('div', { class: 'setting' }, [
        el('div', { class: 'setting__head' }, [el('div', { class: 'setting__label', text: label }), output]),
        input,
        hint ? el('div', { class: 'setting__hint', text: hint }) : null,
      ]);
    }

    function toggle({ label, hint, checked, onChange }) {
      const input = el('input', {
        type: 'checkbox',
        checked,
        onchange: (event) => onChange(event.target.checked),
      });
      return el('div', { class: 'setting' }, [
        el('label', { class: 'switch' }, [
          el('span', null, [
            el('div', { class: 'setting__label', text: label }),
            hint ? el('div', { class: 'setting__hint', text: hint }) : null,
          ]),
          input,
          el('span', { class: 'switch__track', 'aria-hidden': 'true' }),
        ]),
      ]);
    }

    const modeGroup = el('div', { class: 'segmented' });
    for (const [value, label] of [
      ['camera', 'Cámara'],
      ['simulator', 'Bloques virtuales'],
    ]) {
      modeGroup.append(
        el(
          'button',
          {
            type: 'button',
            text: label,
            'aria-pressed': String(state.mode === value),
            disabled: value === 'camera' && state.mode === 'simulator' && !state.cameraAllowed,
            onclick: () => handlers.onMode(value),
          },
        ),
      );
    }

    const node = el('section', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Ajustes de la clase' }, [
      head('Ajustes de la clase'),
      el('div', { class: 'sheet__body' }, [
        el('div', { class: 'setting' }, [
          el('div', { class: 'setting__head' }, [el('div', { class: 'setting__label', text: 'Rejilla del compás' }), columnsValue]),
          columnsGroup,
          el('div', { class: 'setting__hint', text: 'Cada columna es un paso. 8 es más fácil de leer; 24 da más detalle.' }),
        ]),
        slider({
          label: 'Sensibilidad de detección',
          hint: 'Súbela si los bloques claros pasan desapercibidos; bájala si hay sombras que suenan solas.',
          min: 0,
          max: 100,
          step: 1,
          value: Math.round(state.sensitivity * 100),
          format: (value) => `${value}%`,
          onInput: (value) => handlers.onSensitivity(value / 100),
        }),
        slider({
          label: 'Compensación de cámara',
          hint: 'Retrasa el audio para alinear lo que ves con lo que suena (0–300 ms).',
          min: 0,
          max: 300,
          step: 10,
          value: state.latencyMs,
          format: (value) => `${value} ms`,
          onInput: (value) => handlers.onLatency(value),
        }),
        slider({
          label: 'Volumen',
          min: 0,
          max: 100,
          step: 1,
          value: Math.round(state.volume * 100),
          format: (value) => `${value}%`,
          onInput: (value) => handlers.onVolume(value / 100),
        }),
        toggle({
          label: 'Melodía guiada',
          hint: 'La forma de los bloques cambia la canción sin romper la armonía. Desactívalo para volver al modo bloque → sonido.',
          checked: state.melody,
          onChange: (checked) => handlers.onMelody(checked),
        }),
        toggle({
          label: 'Acentos de los bloques',
          hint: 'Un toque suave cada vez que la línea cruza un bloque, siempre dentro de la escala.',
          checked: state.accents,
          onChange: (checked) => handlers.onAccents(checked),
        }),
        toggle({
          label: 'Clic de referencia',
          hint: 'Un pulso suave al inicio de cada barrido para seguir el tempo.',
          checked: state.metronome,
          onChange: (checked) => handlers.onMetronome(checked),
        }),
        toggle({
          label: 'Mostrar rendimiento',
          hint: 'FPS y milisegundos por frame, para diagnosticar equipos lentos.',
          checked: state.showStats,
          onChange: (checked) => handlers.onStats(checked),
        }),
        el('div', { class: 'setting' }, [
          el('div', { class: 'setting__head' }, [el('div', { class: 'setting__label', text: 'Fuente de video' })]),
          modeGroup,
          el('div', { class: 'setting__hint', text: 'Los bloques virtuales sirven para probar sin cámara o sin kit.' }),
        ]),
        el('div', { class: 'setting' }, [
          el('div', { class: 'setting__head' }, [el('div', { class: 'setting__label', text: 'Calibración' })]),
          el('div', { class: 'dock__group' }, [
            el('button', { class: 'btn btn--sm', type: 'button', onclick: () => handlers.onCalibrate() }, ['Calibrar con la mesa vacía']),
            el('button', { class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => handlers.onRecalibrate() }, ['Recalibrar rápido']),
          ]),
          el('div', { class: 'setting__hint', text: 'La recalibración rápida compensa movimientos de la cámara sin detener la música.' }),
        ]),
        el('button', {
          class: 'btn btn--ghost btn--wide',
          type: 'button',
          onclick: () => {
            close();
            openHelp();
          },
        }, ['Cómo se juega']),
        el('button', { class: 'btn btn--danger btn--wide', type: 'button', onclick: () => handlers.onSignOut() }, [
          state.mode === 'demo' ? 'Salir de la prueba' : 'Desactivar este kit en este dispositivo',
        ]),
        el('p', { class: 'fineprint', text: `${APP.name} v${APP.version} · El video nunca sale de este dispositivo.` }),
      ]),
    ]);

    open(node);
    return {
      updateMode(mode) {
        [...modeGroup.children].forEach((button, index) => {
          setPressed(button, (index === 0 ? 'camera' : 'simulator') === mode);
        });
      },
    };
  }

  function openHelp() {
    const node = el('section', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Cómo se juega' }, [
      head('Cómo se juega'),
      el('div', { class: 'sheet__body' }, [
        el('ol', { class: 'muted', style: { lineHeight: '1.7', paddingLeft: '18px' } }, [
          el('li', { text: 'Apoya el celular en la base del kit mirando la mesa, sin moverlo durante la clase.' }),
          el('li', { text: 'Retira los bloques y toca Calibrar: la app aprende el fondo vacío.' }),
          el('li', { text: 'Coloca bloques en las columnas. Cada color tiene su sonido; apilar varios suena a la vez.' }),
          el('li', { text: 'Si la cámara se mueve, toca ⟳ para recalibrar sin cortar la música.' }),
        ]),
        el('p', { class: 'fineprint', text: 'Los niños solo tocan los bloques: el feedback es el sonido.' }),
      ]),
      el('div', { class: 'sheet__foot' }, [el('button', { class: 'btn btn--wide', type: 'button', 'data-close': true }, ['Entendido'])]),
    ]);
    open(node);
  }

  return { openKits, openSettings, openHelp, close, get isOpen() { return !root.hidden; } };
}

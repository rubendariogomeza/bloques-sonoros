/** Hojas modales: kits de sonido, ajustes y ayuda. */
import { COLOR_CLASSES, COLOR_HEX, COLOR_LABELS, COLUMN_CHOICES, PLAY_MODES, PLAY_MODE_LABELS, APP } from '../core/config.js';
import { KITS, SAMPLE_OPTIONS, PITCHED_SAMPLE_OPTIONS } from '../audio/kits.js';
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
    if (state.playMode === 'portrait') return openPortraitSounds();
    const gridMode = state.playMode === 'grid';
    const options = gridMode ? PITCHED_SAMPLE_OPTIONS : SAMPLE_OPTIONS;
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
            onchange: (event) => {
              const value = event.target.value;
              if (gridMode) handlers.onGridMapping(color, value);
              else handlers.onMapping(color, value);
            },
          },
          options.map((option) =>
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
      if (gridMode) return;
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
    renderMapping(gridMode ? state.gridMapping : state.mapping);

    const node = el('section', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': gridMode ? 'Sonidos de la parrilla' : 'Sonidos de los bloques' }, [
      head(gridMode ? 'Sonidos de la parrilla' : 'Sonidos de los bloques'),
      el('div', { class: 'sheet__body' }, [
        gridMode
          ? el('p', { class: 'setting__hint', text: 'En la parrilla cada color es un instrumento afinado y la fila elige la nota. Solo aparecen instrumentos con altura.' })
          : el('div', null, [
              el('div', { class: 'section-title', text: 'Kit' }),
              kitList,
            ]),
        el('div', null, [
          el('div', { class: 'section-title', text: 'Color → instrumento' }),
          mappingList,
          el('p', {
            class: 'setting__hint',
            text: gridMode
              ? 'Si dos colores se confunden con la luz, asígnales el mismo instrumento.'
              : 'En los kits melódicos, la altura del bloque también elige la nota.',
          }),
        ]),
      ]),
      el('div', { class: 'sheet__foot' }, [
        el(
          'button',
          {
            class: 'btn btn--ghost btn--sm',
            type: 'button',
            onclick: () => (gridMode ? handlers.onResetGridMapping() : handlers.onResetMapping()),
          },
          [gridMode ? 'Restablecer parrilla' : 'Restablecer kit'],
        ),
        el('button', { class: 'btn btn--sm', type: 'button', 'data-close': true }, ['Listo']),
      ]),
    ]);

    // Mantiene el resaltado del kit tras un cambio asíncrono.
    open(node);
    return {
      refresh() {
        state.kitId = handlers.getKitId();
        renderKits();
        renderMapping(gridMode ? handlers.getGridMapping() : handlers.getMapping());
      },
    };
  }

  /** Retrato no usa el kit de bloques: su paleta es fija y armónica. */
  function openPortraitSounds() {
    const node = el(
      'section',
      { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Sonidos de Retrato' },
      [
        head('Sonidos de Retrato'),
        el('div', { class: 'sheet__body' }, [
          el('p', {
            class: 'setting__hint',
            text: 'Retrato no usa el kit de bloques. Cada rostro elige su propia combinación entre marimba, campana y pizzicato, con registro, densidad, bajo y adorno.',
          }),
          el('ul', { class: 'muted', style: { lineHeight: '1.7', paddingLeft: '18px' } }, [
            el('li', { text: 'Rasgos del rostro (tono de piel, pelo, proporción, ojos) → canción estable.' }),
            el('li', { text: 'Boca abierta → más notas. Sonrisa → adorno. Ojos cerrados → registro grave.' }),
            el('li', { text: 'Mover la cabeza añade acentos suaves, siempre en la escala.' }),
            el('li', { text: 'Sin cara en cámara no suena nada: no hay melodía de fondo.' }),
          ]),
          el('p', {
            class: 'setting__hint',
            text: 'Todo se procesa en este dispositivo. La cámara no guarda ni envía caras y la firma se borra al cerrar la sesión.',
          }),
        ]),
        el('div', { class: 'sheet__foot' }, [
          el('button', { class: 'btn btn--wide', type: 'button', 'data-close': true }, ['Entendido']),
        ]),
      ],
    );
    open(node);
    return { refresh() {} };
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

    const playModeGroup = el('div', { class: 'segmented' });
    const playModeButtons = [];
    let pendingMode = null;

    const consentBox = el('div', { class: 'consent', hidden: true }, [
      el('p', { class: 'consent__title', text: 'Retrato sonoro' }),
      el('p', {
        class: 'consent__text',
        text: 'La cámara mirará la cara más grande de la escena para elegir la canción. Todo se procesa en este dispositivo: no se guarda, no se envía y no identifica a nadie. La firma se borra al cerrar la sesión.',
      }),
      el('div', { class: 'dock__group' }, [
        el(
          'button',
          {
            class: 'btn btn--ghost btn--sm',
            type: 'button',
            onclick: () => {
              pendingMode = null;
              consentBox.hidden = true;
            },
          },
          ['Ahora no'],
        ),
        el(
          'button',
          {
            class: 'btn btn--sm',
            type: 'button',
            onclick: () => {
              state.portraitConsent = true;
              handlers.onPortraitConsent(true);
              consentBox.hidden = true;
              const target = pendingMode;
              pendingMode = null;
              if (target) applyPlayMode(target);
            },
          },
          ['Activar Retrato'],
        ),
      ]),
    ]);

    function applyPlayMode(value) {
      state.playMode = value;
      handlers.onPlayMode(value);
      playModeButtons.forEach((item, index) => setPressed(item, PLAY_MODES[index] === value));
    }

    for (const value of PLAY_MODES) {
      const button = el('button', {
        type: 'button',
        text: PLAY_MODE_LABELS[value],
        'aria-pressed': String(state.playMode === value),
        onclick: () => {
          if (state.playMode === value) return;
          if (value === 'portrait' && !state.portraitConsent) {
            pendingMode = value;
            consentBox.hidden = false;
            consentBox.scrollIntoView?.({ block: 'nearest' });
            return;
          }
          applyPlayMode(value);
        },
      });
      playModeButtons.push(button);
      playModeGroup.append(button);
    }

    const node = el('section', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Ajustes de la clase' }, [
      head('Ajustes de la clase'),
      el('div', { class: 'sheet__body' }, [
        el('div', { class: 'setting' }, [
          el('div', { class: 'setting__head' }, [el('div', { class: 'setting__label', text: 'Modo de juego' })]),
          playModeGroup,
          consentBox,
          el('div', {
            class: 'setting__hint',
            text: 'Parrilla: cada cuadro suena con el instrumento de su color; pared vacía, silencio. Retrato: la cara más grande elige una canción propia y sin cara no suena nada. Melodía: la forma de la estructura cambia la canción. Bloques: cada color dispara su sonido.',
          }),
        ]),
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
          label: 'Acentos de los bloques',
          hint: 'En Melodía y Retrato: un toque suave al cruzar un bloque o mover la cabeza, siempre dentro de la escala.',
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
            el('button', { class: 'btn btn--sm', type: 'button', onclick: () => handlers.onCalibrate() }, ['Calibrar con la pared vacía']),
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
          state.testMode
            ? 'Volver al inicio de la prueba'
            : state.mode === 'demo'
              ? 'Salir de la prueba'
              : 'Desactivar este kit en este dispositivo',
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
          el('li', { text: 'Apoya el celular en el soporte del kit mirando la pared, sin moverlo durante la clase.' }),
          el('li', { text: 'Retira los bloques y toca Calibrar: la app aprende el fondo vacío.' }),
          el('li', { text: 'Con la pared vacía no suena nada. Cada bloque que colocas enciende su cuadro: el color elige el instrumento y la fila, la nota.' }),
          el('li', { text: 'La línea recorre las columnas y hace sonar los cuadros ocupados. Varios bloques en la misma columna suenan juntos, como un acorde.' }),
          el('li', { text: 'Si la cámara se mueve, toca ⟳ para recalibrar sin cortar la música.' }),
          el('li', { text: 'En Ajustes puedes cambiar entre Parrilla, Retrato, Melodía y Bloques. Retrato necesita el consentimiento del profesor: la cámara no guarda ni envía caras.' }),
        ]),
        el('p', { class: 'fineprint', text: 'Los niños solo tocan los bloques: el feedback es el sonido.' }),
      ]),
      el('div', { class: 'sheet__foot' }, [el('button', { class: 'btn btn--wide', type: 'button', 'data-close': true }, ['Entendido'])]),
    ]);
    open(node);
  }

  return { openKits, openSettings, openHelp, close, get isOpen() { return !root.hidden; } };
}

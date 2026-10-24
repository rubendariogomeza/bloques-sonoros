/** Pantallas de bloqueo (licencia) y onboarding de permisos. */
import { el, clear, setText } from './dom.js';

function logo() {
  return el('div', { class: 'logo' }, [
    el('div', { class: 'logo__mark', 'aria-hidden': 'true' }, ['♪']),
    el('div', null, [
      el('div', { class: 'logo__name', text: 'Bloques Sonoros' }),
      el('div', { class: 'logo__sub', text: 'Secuenciador musical tangible' }),
    ]),
  ]);
}

export function createViews(root, handlers) {
  let removeKeyHandler = null;

  function mount(node) {
    clear(root);
    root.dataset.visible = 'true';
    root.append(node);
    document.body.dataset.view = 'locked';
  }

  function hide() {
    clear(root);
    root.dataset.visible = 'false';
    document.body.dataset.view = 'live';
  }

  function statusNode(text = '', kind = 'info') {
    const node = el('p', { class: 'status' });
    setStatus(node, text, kind);
    return node;
  }

  function setStatus(node, text, kind = 'info') {
    node.textContent = text;
    node.className = `status${kind === 'error' ? ' status--error' : kind === 'ok' ? ' status--ok' : ''}`;
  }

  function showLoading({ title = 'Preparando el aula', detail = 'Un momento…' } = {}) {
    const detailNode = el('p', { class: 'muted', text: detail });
    mount(
      el('section', { class: 'screen' }, [
        el('div', { class: 'card' }, [logo(), el('h1', { text: title }), detailNode]),
      ]),
    );
    return { setDetail: (text) => setText(detailNode, text) };
  }

  function showLicense({ message = '', kind = 'info' } = {}) {
    const status = statusNode(message, kind);
    const panel = el('div', { class: 'auth-panel', hidden: true });
    const actions = el('div', { class: 'auth-actions' });
    const closedHint = el('p', { class: 'fineprint', text: 'Un código activa una instalación. Después funciona sin internet.' });

    const scanBtn = el('button', { class: 'btn btn--primary btn--wide', type: 'button' }, ['Escanear el QR del manual']);
    const manualBtn = el('button', { class: 'btn btn--ghost btn--wide', type: 'button' }, ['Escribir el código']);
    const demoBtn = el('button', { class: 'btn btn--text', type: 'button' }, ['Probar con bloques virtuales']);
    actions.append(scanBtn, manualBtn, demoBtn);

    const card = el('div', { class: 'card' }, [
      logo(),
      el('h1', { text: 'Desbloquea tu kit' }),
      el('p', { class: 'muted', text: 'Escanea el código QR impreso en el manual para activar el motor musical en este dispositivo.' }),
      actions,
      panel,
      status,
      closedHint,
    ]);

    mount(el('section', { class: 'screen' }, [card]));

    function showPanel(node) {
      clear(panel);
      panel.append(node);
      panel.hidden = false;
      actions.hidden = true;
      closedHint.hidden = true;
    }

    function resetPanel() {
      panel.hidden = true;
      clear(panel);
      actions.hidden = false;
      closedHint.hidden = false;
      setStatus(status, '');
      handlers.onStopScan?.();
    }

    scanBtn.addEventListener('click', async () => {
      const video = el('video', { playsinline: true, muted: true, autoplay: true });
      video.muted = true;
      const scanStatus = statusNode('Pidiendo permiso a la cámara…');
      const frame = el('div', { class: 'scanner' }, [video, el('div', { class: 'scanner__frame' })]);
      const cancel = el('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, ['Cancelar']);
      const fileInput = el('input', { type: 'file', accept: 'image/*', hidden: true });
      const upload = el('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, ['Subir una foto']);
      upload.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        setStatus(scanStatus, 'Leyendo la foto…');
        await handlers.onUpload(file, (text, kind) => setStatus(scanStatus, text, kind));
      });
      cancel.addEventListener('click', resetPanel);
      showPanel(
        el('div', null, [
          el('h2', { text: 'Apunta al QR del manual' }),
          frame,
          scanStatus,
          el('div', { class: 'dock__group', style: { marginTop: '12px', justifyContent: 'space-between' } }, [cancel, upload]),
          fileInput,
        ]),
      );
      try {
        await handlers.onScan({
          video,
          onStatus: (text, kind) => setStatus(scanStatus, text, kind),
        });
      } catch (error) {
        setStatus(scanStatus, error?.message ?? 'No pudimos abrir la cámara.', 'error');
      }
    });

    manualBtn.addEventListener('click', () => {
      const input = el('input', {
        class: 'input',
        type: 'text',
        inputmode: 'text',
        autocomplete: 'off',
        autocapitalize: 'characters',
        spellcheck: 'false',
        placeholder: 'MT-XXXX-XXXX-XXXX-C',
        'aria-label': 'Código del kit',
      });
      const submit = el('button', { class: 'btn btn--primary btn--wide', type: 'button' }, ['Activar kit']);
      const feedback = statusNode();
      const cancel = el('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, ['Volver']);

      async function activate() {
        const value = input.value.trim();
        if (!value) {
          setStatus(feedback, 'Escribe el código del manual.', 'error');
          input.focus();
          return;
        }
        submit.disabled = true;
        submit.textContent = 'Validando…';
        const result = await handlers.onManual(value);
        submit.disabled = false;
        submit.textContent = 'Activar kit';
        if (!result.ok) {
          setStatus(feedback, result.message, 'error');
          input.focus();
          input.select();
        }
      }

      submit.addEventListener('click', activate);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') activate();
      });
      cancel.addEventListener('click', resetPanel);

      showPanel(
        el('div', null, [
          el('div', { class: 'field' }, [el('label', { text: 'Código del kit', for: 'kit-token' }), input]),
          el('div', { class: 'auth-actions', style: { marginTop: '12px' } }, [submit, cancel]),
          feedback,
        ]),
      );
      input.id = 'kit-token';
      setTimeout(() => input.focus(), 30);
    });

    demoBtn.addEventListener('click', () => handlers.onDemo());
  }

  function showOnboarding({ mode = 'kit', message = '', kind = 'info' } = {}) {
    const isDemo = mode === 'demo';
    const status = statusNode(message, kind);
    const primary = el('button', { class: 'btn btn--primary btn--wide', type: 'button' }, [
      isDemo ? 'Entrar con bloques virtuales' : 'Iniciar sesión musical',
    ]);
    const simBtn = el('button', { class: 'btn btn--ghost btn--wide', type: 'button' }, ['Empezar con bloques virtuales']);
    const back = el('button', { class: 'btn btn--text btn--wide', type: 'button' }, ['Usar otro kit']);

    const permissions = el('ul', { class: 'permissions' }, [
      el('li', { class: 'permission' }, [
        el('span', { class: 'permission__icon', 'aria-hidden': 'true' }, ['◉']),
        el('span', null, [
          el('div', { class: 'permission__title', text: 'Cámara' }),
          el('div', { class: 'permission__text', text: 'Para ver los bloques sobre la mesa. El video se procesa aquí y nunca se sube a internet.' }),
        ]),
      ]),
      el('li', { class: 'permission' }, [
        el('span', { class: 'permission__icon', 'aria-hidden': 'true' }, ['♪']),
        el('span', null, [
          el('div', { class: 'permission__title', text: 'Sonido' }),
          el('div', { class: 'permission__text', text: 'El navegador lo pedirá al primer toque. Sube el volumen del dispositivo.' }),
        ]),
      ]),
      el('li', { class: 'permission' }, [
        el('span', { class: 'permission__icon', 'aria-hidden': 'true' }, ['▦']),
        el('span', null, [
          el('div', { class: 'permission__title', text: 'Mesa despejada' }),
          el('div', { class: 'permission__text', text: 'Al entrar, retira los bloques y toca Calibrar una sola vez.' }),
        ]),
      ]),
    ]);

    const card = el('div', { class: 'card' }, [
      logo(),
      el('div', { class: 'dock__group', style: { marginBottom: '10px', gap: '8px', flexWrap: 'wrap' } }, [
        isDemo ? el('span', { class: 'badge badge--demo', text: 'Prueba · 20 min' }) : el('span', { class: 'badge', text: 'Kit activado' }),
      ]),
      el('h1', { text: isDemo ? 'Todo listo para probar' : 'Vamos a sonar' }),
      el('p', { class: 'muted', text: isDemo
        ? 'Esta prueba usa bloques virtuales: toca la pantalla para colocarlos.'
        : 'Un toque para pedir los permisos y arrancar el motor musical.' }),
      permissions,
      primary,
      el('div', { class: 'auth-actions' }, isDemo ? [back] : [simBtn, back]),
      status,
      el('p', { class: 'fineprint', text: 'Consejo: usa la cámara trasera y apoya el teléfono en la base del kit.' }),
    ]);

    mount(el('section', { class: 'screen' }, [card]));

    primary.addEventListener('click', async () => {
      if (primary.disabled) return;
      primary.disabled = true;
      const original = primary.textContent;
      primary.textContent = 'Preparando…';
      setStatus(status, '');
      const result = await handlers.onStart(isDemo ? 'simulator' : 'camera');
      primary.disabled = false;
      primary.textContent = original;
      if (!result?.ok) setStatus(status, result?.message ?? 'No pudimos iniciar la sesión.', 'error');
    });

    simBtn.addEventListener('click', async () => {
      simBtn.disabled = true;
      const result = await handlers.onStart('simulator');
      simBtn.disabled = false;
      if (!result?.ok) setStatus(status, result?.message ?? 'No pudimos abrir los bloques virtuales.', 'error');
    });

    back.addEventListener('click', () => handlers.onSignOut());
  }

  return {
    showLicense,
    showOnboarding,
    showLoading,
    hide,
    setStatus,
    get mounted() {
      return root.dataset.visible === 'true';
    },
    dispose() {
      removeKeyHandler?.();
    },
  };
}

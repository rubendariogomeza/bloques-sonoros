/** HUD: estado del sistema en una línea y mensajes contextuales. */
import { el, clear, setText } from './dom.js';

export function createHud({ hudRoot, bannerRoot, toastRoot }) {
  clear(hudRoot);

  const brand = el('div', { class: 'hud__brand' }, [
    el('span', { class: 'brand-mark', 'aria-hidden': 'true' }),
    el('span', { text: 'Bloques Sonoros' }),
  ]);

  const stateChip = el('span', { class: 'chip' }, [
    el('span', { class: 'dot', 'aria-hidden': 'true' }),
    el('b', { text: 'Esperando' }),
  ]);
  const bpmChip = el('span', { class: 'chip chip--optional' }, [
    el('span', { text: 'BPM' }),
    el('b', { text: '96' }),
  ]);
  const blocksChip = el('span', { class: 'chip' }, [
    el('span', { text: 'Bloques' }),
    el('b', { text: '0' }),
  ]);  const statsChip = el('span', { class: 'chip chip--optional' }, [
    el('b', { text: '—' }),
    el('span', { text: 'fps' }),
  ]);
  const modeChip = el('span', { class: 'chip chip--warn', hidden: true }, [el('span', { text: 'Virtual' })]);
  const variationChip = el('span', { class: 'chip chip--optional chip--variation', hidden: true }, [
    el('b', { text: 'Melodía base' }),
  ]);

  hudRoot.append(
    brand,
    el('div', { class: 'hud__chips' }, [stateChip, bpmChip, blocksChip, variationChip, statsChip, modeChip]),
  );

  const bpmValue = bpmChip.querySelector('b');
  const blocksLabel = blocksChip.querySelector('span');
  const blocksValue = blocksChip.querySelector('b');
  const statsValue = statsChip.querySelector('b');
  const stateValue = stateChip.querySelector('b');
  const dot = stateChip.querySelector('.dot');
  const variationValue = variationChip.querySelector('b');

  let bannerTimer = null;

  function update({ state, bpm, blocks, blocksLabel: blocksCaption, fps, mode, showStats, variation }) {
    if (bpm != null) setText(bpmValue, String(Math.round(bpm)));
    if (blocksCaption) setText(blocksLabel, blocksCaption);
    if (blocks != null) setText(blocksValue, String(blocks));
    if (fps != null) setText(statsValue, String(fps));
    if (variation !== undefined) {
      variationChip.hidden = !variation;
      if (variation) setText(variationValue, variation);
    }
    if (state) {
      setText(stateValue, state.label);
      stateChip.classList.toggle('chip--live', state.kind === 'live');
      stateChip.classList.toggle('chip--warn', state.kind === 'warn');
      stateChip.classList.toggle('chip--danger', state.kind === 'error');
      dot.hidden = false;
    }
    if (mode) {
      modeChip.hidden = false;
      setText(modeChip.firstElementChild, mode === 'camera' ? 'Cámara' : 'Virtual');
      modeChip.classList.toggle('chip--warn', mode !== 'camera');
    }
    if (showStats != null) statsChip.classList.toggle('chip--hidden', !showStats);
  }

  function notify(message, { kind = 'info', timeout = 4200 } = {}) {
    const node = el('div', { class: `toast toast--${kind}`, text: message });
    toastRoot.append(node);
    setTimeout(() => node.remove(), timeout);
  }

  function banner(message, { kind = 'info', action } = {}) {
    clear(bannerRoot);
    if (!message) {
      bannerRoot.hidden = true;
      return;
    }
    const text = el('span', { html: message });
    bannerRoot.className = `banner banner--${kind}`;
    bannerRoot.append(text);
    if (action) {
      bannerRoot.append(
        el('button', { class: 'btn btn--sm btn--ghost', type: 'button', onclick: action.onClick }, action.label),
      );
    }
    bannerRoot.hidden = false;
    if (bannerTimer) clearTimeout(bannerTimer);
    if (timeoutFor(kind)) {
      bannerTimer = setTimeout(() => {
        bannerRoot.hidden = true;
      }, timeoutFor(kind));
    }
  }

  function timeoutFor(kind) {
    return kind === 'error' ? 0 : 6000;
  }

  function clearBanner() {
    bannerRoot.hidden = true;
    clear(bannerRoot);
  }

  return { update, notify, banner, clearBanner };
}

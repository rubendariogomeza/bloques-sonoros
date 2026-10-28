/** Dock inferior: los controles del profesor, siempre a un toque. */

export function createDock(root, handlers) {
  root.innerHTML = `
    <div class="dock__group">
      <button class="btn btn--primary btn--round" data-act="play" aria-label="Reproducir" title="Reproducir / pausar">▶</button>
      <div class="bpm">
        <div>
          <div class="bpm__label">Tempo</div>
          <div class="bpm__row">
            <button class="icon-btn" data-act="bpm-down" type="button" aria-label="Bajar tempo">−</button>
            <output class="bpm__value" data-el="bpm">96</output>
            <button class="icon-btn" data-act="bpm-up" type="button" aria-label="Subir tempo">+</button>
          </div>
        </div>
        <input type="range" min="50" max="190" step="1" value="96" data-el="bpm-range" aria-label="Velocidad en pulsos por minuto" />
      </div>
    </div>
    <div class="dock__spacer"></div>
    <div class="dock__group">
      <button class="btn btn--sm" data-act="seed" type="button" hidden>Bloques demo</button>
      <button class="btn" data-act="calibrate" type="button">Calibrar</button>
      <button class="icon-btn" data-act="recalibrate" type="button" title="Recalibrar rápido sin cortar la música" aria-label="Recalibrar rápido">⟳</button>
      <button class="btn" data-act="kits" type="button">Sonidos</button>
      <button class="btn btn--ghost" data-act="settings" type="button" aria-label="Ajustes">Ajustes</button>
      <button class="icon-btn" data-act="mute" type="button" aria-label="Silenciar" title="Silenciar">🔊</button>
    </div>
  `;

  const playBtn = root.querySelector('[data-act="play"]');
  const bpmValue = root.querySelector('[data-el="bpm"]');
  const bpmRange = root.querySelector('[data-el="bpm-range"]');
  const calibrateBtn = root.querySelector('[data-act="calibrate"]');
  const seedBtn = root.querySelector('[data-act="seed"]');
  const muteBtn = root.querySelector('[data-act="mute"]');

  let currentBpm = 96;
  let currentMode = 'camera';
  let currentPlayMode = 'grid';

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-act]');
    if (!button) return;
    const act = button.dataset.act;
    if (act === 'play') handlers.onTogglePlay();
    else if (act === 'bpm-down') handlers.onBpm(Math.max(50, currentBpm - 1));
    else if (act === 'bpm-up') handlers.onBpm(Math.min(190, currentBpm + 1));
    else if (act === 'calibrate') handlers.onCalibrate();
    else if (act === 'recalibrate') handlers.onRecalibrate();
    else if (act === 'kits') handlers.onOpenKits();
    else if (act === 'settings') handlers.onOpenSettings();
    else if (act === 'mute') handlers.onToggleMute();
    else if (act === 'seed') handlers.onSeedDemo();
  });

  bpmRange.addEventListener('input', () => {
    handlers.onBpm(Number(bpmRange.value));
  });

  function update({ playing, bpm, muted, calibrated, mode, playMode }) {
    if (bpm != null) {
      currentBpm = Math.round(bpm);
      bpmValue.textContent = String(currentBpm);
      if (document.activeElement !== bpmRange) bpmRange.value = String(currentBpm);
    }
    if (playing != null) {
      playBtn.textContent = playing ? '❚❚' : '▶';
      playBtn.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
      playBtn.classList.toggle('btn--primary', !playing);
      playBtn.classList.toggle('btn--violet', playing);
    }
    if (muted != null) {
      muteBtn.textContent = muted ? '🔇' : '🔊';
      muteBtn.setAttribute('aria-label', muted ? 'Activar sonido' : 'Silenciar');
    }
    if (calibrated != null) {
      calibrateBtn.classList.toggle('btn--violet', !calibrated);
      calibrateBtn.classList.toggle('btn--ghost', calibrated);
      calibrateBtn.textContent = calibrated ? 'Recalibrar fondo' : 'Calibrar';
    }
    if (mode != null) currentMode = mode;
    if (playMode != null) currentPlayMode = playMode;
    // Los bloques virtuales solo tienen sentido en los modos de bloques.
    seedBtn.hidden = currentMode !== 'simulator' || currentPlayMode === 'portrait';
  }

  function setCalibrating(value) {
    calibrateBtn.disabled = value;
    calibrateBtn.textContent = value ? 'Calibrando…' : 'Calibrar';
  }

  return { update, setCalibrating };
}

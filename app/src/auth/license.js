/**
 * Licencia local del kit.
 *
 * - Real: token canjeado contra el servidor, guardado en localStorage → acceso
 *   permanente y offline (HU-01 criterio 3).
 * - Demo: sesión temporal en sessionStorage, solo bloques virtuales, para probar
 *   sin hardware ni consumir un código.
 */
import { STORAGE_KEYS } from '../core/config.js';
import { createId } from '../core/util.js';
import { isWellFormed, normalizeToken } from './token.js';

export const DEMO_MINUTES = 20;

export function createLicenseManager({ storage, api, testMode = false }) {
  let deviceId = storage.get(STORAGE_KEYS.device, null);
  if (!deviceId) {
    deviceId = `dev_${createId('d').slice(2)}`;
    storage.set(STORAGE_KEYS.device, deviceId);
  }

  function readLicense() {
    const value = storage.get(STORAGE_KEYS.license, null);
    if (!value || typeof value !== 'object') return null;
    if (!value.token || !value.redeemedAt) return null;
    return value;
  }

  function readDemo() {
    try {
      const raw = sessionStorage.getItem('mt.demo');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.expiresAt || parsed.expiresAt < Date.now()) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writeDemo(record) {
    try {
      if (record) sessionStorage.setItem('mt.demo', JSON.stringify(record));
      else sessionStorage.removeItem('mt.demo');
    } catch {
      /* navegación privada sin sessionStorage: la demo durará lo que la pestaña */
    }
  }

  function current() {
    const real = readLicense();
    if (real) return { ...real, mode: 'kit' };
    const demo = readDemo();
    if (demo) return { ...demo, mode: 'demo' };
    // Modo de pruebas: acceso directo con cámara, sin canje ni vencimiento.
    if (testMode) return { mode: 'test', startedAt: Date.now() };
    return null;
  }

  function isUnlocked() {
    return testMode || Boolean(current());
  }

  function features() {
    const active = current();
    return {
      camera: active?.mode === 'kit' || active?.mode === 'test',
      simulator: true,
      duration: active?.mode === 'demo' ? Math.max(0, active.expiresAt - Date.now()) : Infinity,
    };
  }

  async function redeem(rawToken) {
    const token = normalizeToken(rawToken);
    if (!token || !isWellFormed(token)) {
      return { ok: false, code: 'malformed', message: 'Código inválido' };
    }
    const result = await api.redeem(token, deviceId);
    if (!result.ok) return result;
    const record = {
      token,
      deviceId,
      redeemedAt: result.license?.redeemedAt ?? new Date().toISOString(),
      issuedAt: result.license?.issuedAt ?? null,
    };
    storage.set(STORAGE_KEYS.license, record);
    writeDemo(null);
    return { ok: true, license: { ...record, mode: 'kit' } };
  }

  function startDemo() {
    const record = {
      startedAt: Date.now(),
      expiresAt: Date.now() + DEMO_MINUTES * 60 * 1000,
    };
    writeDemo(record);
    return { ...record, mode: 'demo' };
  }

  function endDemo() {
    writeDemo(null);
  }

  function clear() {
    storage.remove(STORAGE_KEYS.license);
    endDemo();
  }

  /** Verifica contra el servidor sin bloquear el arranque offline. */
  async function verify() {
    const active = readLicense();
    if (!active) return { ok: false, code: 'none' };
    const result = await api.verify(active.token, deviceId);
    if (result.ok) return { ok: true };
    if (result.code === 'invalid' || result.code === 'used') {
      // El servidor dice que este dispositivo no es el dueño: se revoca localmente.
      storage.remove(STORAGE_KEYS.license);
      return { ok: false, code: result.code };
    }
    return { ok: false, code: result.code, transient: true };
  }

  return {
    current,
    isUnlocked,
    features,
    redeem,
    startDemo,
    endDemo,
    clear,
    verify,
    get deviceId() {
      return deviceId;
    },
    get mode() {
      return current()?.mode ?? null;
    },
    get testMode() {
      return testMode;
    },
  };
}

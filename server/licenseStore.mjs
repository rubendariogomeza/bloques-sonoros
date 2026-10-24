/**
 * Inventario de licencias del kit físico.
 *
 * Solo se guarda el hash SHA-256 (con pepper) del token: una filtración del JSON
 * no permite reutilizar códigos. El canje es atómico y de un solo uso.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isWellFormed, normalizeToken, randomToken } from '../app/src/auth/token.js';

export const DEFAULT_PEPPER = 'dev-pepper-cambia-esto-en-produccion';

export function createLicenseStore({ file, pepper = DEFAULT_PEPPER, now = () => new Date() } = {}) {
  if (!file) throw new Error('createLicenseStore requiere un archivo de datos');

  let state = null;
  let queue = Promise.resolve();

  const hash = (token) => createHash('sha256').update(`${pepper}:${token}`).digest('hex');

  async function load() {
    if (state) return state;
    try {
      const raw = await readFile(file, 'utf8');
      state = JSON.parse(raw);
    } catch (error) {
      if (error.code === 'ENOENT') state = { version: 1, tokens: {} };
      else throw error;
    }
    if (!state.tokens || typeof state.tokens !== 'object') state.tokens = {};
    return state;
  }

  async function persist() {
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(state, null, 2), 'utf8');
    await rename(temporary, file);
  }

  /** Serializa las escrituras: dos canjes simultáneos no pueden quemar el mismo token. */
  function enqueue(task) {
    const run = queue.then(task, task);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function createTokens(count = 1, label = 'kit') {
    const tokens = [];
    await enqueue(async () => {
      await load();
      const createdAt = now().toISOString();
      for (let i = 0; i < count; i += 1) {
        let token = randomToken();
        while (!isWellFormed(token) || state.tokens[hash(token)]) token = randomToken();
        state.tokens[hash(token)] = {
          label,
          createdAt,
          redeemedAt: null,
          deviceId: null,
        };
        tokens.push(token);
      }
      await persist();
    });
    return tokens;
  }

  async function redeem(rawToken, deviceId) {
    const token = normalizeToken(rawToken);
    if (!token || !isWellFormed(token)) {
      return { ok: false, code: 'malformed_token', status: 400 };
    }
    return enqueue(async () => {
      await load();
      const record = state.tokens[hash(token)];
      if (!record) return { ok: false, code: 'unknown_token', status: 404 };

      if (record.redeemedAt) {
        if (deviceId && record.deviceId === deviceId) {
          return { ok: true, license: licenseOf(record, token, deviceId), reused: true, status: 200 };
        }
        return { ok: false, code: 'already_redeemed', status: 409 };
      }

      record.redeemedAt = now().toISOString();
      record.deviceId = deviceId ?? 'unknown';
      await persist();
      return { ok: true, license: licenseOf(record, token, record.deviceId), status: 200 };
    });
  }

  async function verify(rawToken, deviceId) {
    const token = normalizeToken(rawToken);
    if (!token || !isWellFormed(token)) {
      return { ok: false, code: 'malformed_token', status: 400 };
    }
    await load();
    const record = state.tokens[hash(token)];
    if (!record) return { ok: false, code: 'unknown_token', status: 404 };
    if (!record.redeemedAt) return { ok: false, code: 'not_redeemed', status: 409 };
    if (!safeEqual(record.deviceId, deviceId)) {
      return { ok: false, code: 'already_redeemed', status: 409 };
    }
    return { ok: true, license: licenseOf(record, token, deviceId), status: 200 };
  }

  async function stats() {
    await load();
    const records = Object.values(state.tokens);
    return {
      total: records.length,
      redeemed: records.filter((record) => record.redeemedAt).length,
      available: records.filter((record) => !record.redeemedAt).length,
    };
  }

  return { createTokens, redeem, verify, stats, file };
}

function licenseOf(record, token, deviceId) {
  return {
    token,
    deviceId,
    issuedAt: record.createdAt,
    redeemedAt: record.redeemedAt,
    kit: record.label ?? 'kit',
  };
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

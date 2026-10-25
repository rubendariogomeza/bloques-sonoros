import test from 'node:test';
import assert from 'node:assert/strict';
import { createLicenseManager } from '../app/src/auth/license.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get: (key, fallback) => (map.has(key) ? map.get(key) : fallback),
    set: (key, value) => map.set(key, value),
    remove: (key) => map.delete(key),
  };
}

const api = {
  redeem: async () => ({ ok: false, code: 'offline' }),
  verify: async () => ({ ok: false, code: 'offline' }),
};

test('el modo prueba entra sin licencia y habilita la cámara', () => {
  const license = createLicenseManager({ storage: fakeStorage(), api, testMode: true });

  assert.equal(license.isUnlocked(), true);
  assert.equal(license.mode, 'test');
  assert.equal(license.testMode, true);
  assert.equal(license.features().camera, true);
  assert.equal(license.features().simulator, true);
  assert.equal(license.features().duration, Infinity);
});

test('sin modo prueba la app sigue bloqueada', () => {
  const license = createLicenseManager({ storage: fakeStorage(), api });

  assert.equal(license.isUnlocked(), false);
  assert.equal(license.mode, null);
  assert.equal(license.testMode, false);
  assert.equal(license.features().camera, false);
});

test('una licencia real manda sobre el modo prueba', () => {
  const storage = fakeStorage({
    'mt.license.v1': { token: 'MT-AAAA-AAAA-AAAA-C', redeemedAt: '2026-10-24T00:00:00.000Z' },
  });
  const license = createLicenseManager({ storage, api, testMode: true });

  assert.equal(license.mode, 'kit');
  assert.equal(license.features().camera, true);
  assert.equal(license.features().duration, Infinity);
});

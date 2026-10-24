import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLicenseStore } from '../server/licenseStore.mjs';
import { randomToken } from '../app/src/auth/token.js';

async function withStore(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mt-license-'));
  try {
    const file = path.join(dir, 'licenses.json');
    const store = createLicenseStore({ file, pepper: 'pepper-de-prueba' });
    await run(store, file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('genera códigos válidos y solo persiste el hash', async () => {
  await withStore(async (store, file) => {
    const [token] = await store.createTokens(1, 'lote-test');
    assert.match(token, /^MT-/);
    const raw = await readFile(file, 'utf8');
    assert.ok(!raw.includes(token), 'el token en claro no debe guardarse');
    assert.equal(JSON.parse(raw).tokens[Object.keys(JSON.parse(raw).tokens)[0]].label, 'lote-test');
  });
});

test('el canje es de un solo uso por dispositivo', async () => {
  await withStore(async (store) => {
    const [token] = await store.createTokens(1);
    const first = await store.redeem(token, 'device-A');
    assert.equal(first.ok, true);
    assert.equal(first.license.token, token);
    assert.ok(first.license.redeemedAt);

    const sameDevice = await store.redeem(token, 'device-A');
    assert.equal(sameDevice.ok, true);
    assert.equal(sameDevice.reused, true);

    const otherDevice = await store.redeem(token, 'device-B');
    assert.equal(otherDevice.ok, false);
    assert.equal(otherDevice.code, 'already_redeemed');
    assert.equal(otherDevice.status, 409);
  });
});

test('rechaza códigos inexistentes y mal formados', async () => {
  await withStore(async (store) => {
    const [token] = await store.createTokens(1);
    // Un código con checksum válido pero que nunca se emitió: el inventario no lo conoce.
    let unknown = randomToken();
    while (unknown === token) unknown = randomToken();
    const notFound = await store.redeem(unknown, 'device-A');
    assert.equal(notFound.code, 'unknown_token');
    assert.equal(notFound.status, 404);

    const malformed = await store.redeem('hola', 'device-A');
    assert.equal(malformed.code, 'malformed_token');
    assert.equal(malformed.status, 400);
  });
});

test('verify solo acepta al dispositivo que canjeó', async () => {
  await withStore(async (store) => {
    const [token] = await store.createTokens(1);
    assert.equal((await store.verify(token, 'device-A')).code, 'not_redeemed');
    await store.redeem(token, 'device-A');
    assert.equal((await store.verify(token, 'device-A')).ok, true);
    assert.equal((await store.verify(token, 'device-B')).ok, false);
  });
});

test('los canjes concurrentes no queman dos veces el mismo código', async () => {
  await withStore(async (store) => {
    const [a, b] = await store.createTokens(2);
    const results = await Promise.all([
      store.redeem(a, 'device-1'),
      store.redeem(b, 'device-2'),
      store.redeem(a, 'device-3'),
      store.redeem(b, 'device-4'),
    ]);
    assert.equal(results.filter((result) => result.ok).length, 2);
    const stats = await store.stats();
    assert.equal(stats.redeemed, 2);
    assert.equal(stats.available, 0);
  });
});

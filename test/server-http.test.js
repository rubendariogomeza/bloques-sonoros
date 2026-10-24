import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppServer } from '../server/app.mjs';
import { createLicenseStore } from '../server/licenseStore.mjs';
import { randomToken } from '../app/src/auth/token.js';

const appDir = fileURLToPath(new URL('../app', import.meta.url));

let server;
let store;
let base;
let dir;
let token;

before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'mt-http-'));
  store = createLicenseStore({ file: path.join(dir, 'licenses.json'), pepper: 'test' });
  [token] = await store.createTokens(1, 'http-test');
  server = createAppServer({ appDir, store, logger: { error() {} } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
});

const post = (pathname, body) =>
  fetch(`${base}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

test('sirve el shell con cabeceras de seguridad', async () => {
  const response = await fetch(`${base}/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
  const html = await response.text();
  assert.match(html, /Bloques Sonoros/);
  assert.match(html, /src\/main\.js/);
});

test('sirve módulos y el vendor de QR con MIME correcto', async () => {
  const main = await fetch(`${base}/src/main.js`);
  assert.equal(main.status, 200);
  assert.match(main.headers.get('content-type'), /text\/javascript/);

  const vendor = await fetch(`${base}/vendor/jsqr.js`);
  assert.equal(vendor.status, 200);
  assert.match(vendor.headers.get('content-type'), /text\/javascript/);
});

test('bloquea traversal de directorios', async () => {
  const response = await fetch(`${base}/%2e%2e/package.json`);
  assert.ok([403, 404].includes(response.status), `status ${response.status}`);
  const raw = await fetch(`${base}/package.json`);
  assert.equal(raw.status, 404);
});

test('health informa el inventario', async () => {
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.total, 1);
  assert.equal(body.redeemed, 0);
});

test('el canje HTTP otorga licencia una sola vez por dispositivo', async () => {
  const ok = await post('/api/license/redeem', { token, deviceId: 'device-http-A' });
  assert.equal(ok.status, 200);
  const payload = await ok.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.license.token, token);

  const other = await post('/api/license/redeem', { token, deviceId: 'device-http-B' });
  assert.equal(other.status, 409);
  assert.equal((await other.json()).error, 'already_redeemed');

  const again = await post('/api/license/redeem', { token, deviceId: 'device-http-A' });
  assert.equal(again.status, 200);
});

test('verify responde al dispositivo correcto y rechaza al resto', async () => {
  const same = await post('/api/license/verify', { token, deviceId: 'device-http-A' });
  assert.equal(same.status, 200);
  const foreign = await post('/api/license/verify', { token, deviceId: 'device-http-Z' });
  assert.equal(foreign.status, 409);
});

test('códigos inexistentes o mal formados no pasan', async () => {
  const [other] = await store.createTokens(1, 'otro');
  let unknownToken = randomToken();
  while (unknownToken === other) unknownToken = randomToken();
  const unknown = await post('/api/license/redeem', {
    token: unknownToken,
    deviceId: 'x',
  });
  assert.equal(unknown.status, 404);

  const malformed = await post('/api/license/redeem', { token: 'MT-123', deviceId: 'x' });
  assert.equal(malformed.status, 400);
});

test('limita la tasa de peticiones de licencia', async () => {
  let limited = false;
  for (let i = 0; i < 45; i += 1) {
    const response = await post('/api/license/verify', { token, deviceId: 'device-http-A' });
    if (response.status === 429) {
      limited = true;
      break;
    }
  }
  assert.equal(limited, true, 'debería activarse el rate limit');
});

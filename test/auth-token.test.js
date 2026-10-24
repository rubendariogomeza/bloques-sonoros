import test from 'node:test';
import assert from 'node:assert/strict';
import { checksumChar, isWellFormed, normalizeToken, maskToken, randomToken } from '../app/src/auth/token.js';

test('normaliza entrada humana con espacios y minúsculas', () => {
  const token = 'MT-A1B2-C3D4-E5F6-7';
  assert.equal(normalizeToken('mt a1b2 c3d4 e5f6 7'), token);
  assert.equal(normalizeToken(token), token);
  assert.equal(normalizeToken(''), '');
  assert.equal(normalizeToken('MT-123'), '');
  assert.equal(normalizeToken(null), '');
});

test('el checksum detecta errores de tecleo', () => {
  const token = randomToken();
  assert.ok(isWellFormed(token));
  const body = token.slice(3).replace(/-/g, '');
  assert.equal(checksumChar(body.slice(0, 12)), body[12]);

  const broken = token.slice(0, 5) + (token[5] === 'A' ? 'B' : 'A') + token.slice(6);
  assert.equal(isWellFormed(broken), false);
});

test('los tokens generados son únicos y canónicos', () => {
  const tokens = new Set();
  for (let i = 0; i < 200; i += 1) tokens.add(randomToken());
  assert.equal(tokens.size, 200);
  for (const token of tokens) {
    assert.match(token, /^MT(-[0-9A-HJKMNP-TV-Z]{4}){3}-[0-9A-HJKMNP-TV-Z]$/);
    assert.equal(normalizeToken(token.toLowerCase()), token);
  }
});

test('maskToken no filtra el código completo', () => {
  const masked = maskToken('MT-A1B2-C3D4-E5F6-7');
  assert.ok(masked.startsWith('MT-A1B2'));
  assert.ok(!masked.includes('C3D4'));
});

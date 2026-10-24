/**
 * Formato de licencia del kit físico.
 *
 *   MT-XXXX-XXXX-XXXX-C
 *
 * - 12 caracteres aleatorios en alfabeto Crockford base32 (~60 bits de entropía).
 * - 1 caracter de control para detectar errores de tecleo antes de llamar al backend.
 *
 * El checksum no es seguridad: la autoridad es el servidor, que guarda solo el
 * hash del token y lo marca como consumido de forma atómica.
 */
export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const TOKEN_PREFIX = 'MT';
const BODY_LENGTH = 12;

export function checksumChar(body) {
  let acc = 0;
  for (let i = 0; i < body.length; i += 1) {
    const index = ALPHABET.indexOf(body[i]);
    if (index < 0) return null;
    acc += index * (i + 1);
  }
  return ALPHABET[acc % ALPHABET.length];
}

/** Normaliza entrada humana: mayúsculas, sin separadores, sin prefijo duplicado. */
export function normalizeToken(input) {
  if (typeof input !== 'string') return '';
  const cleaned = input.toUpperCase().replace(/[^0-9A-Z]/g, '');
  const body = cleaned.startsWith(TOKEN_PREFIX) ? cleaned.slice(TOKEN_PREFIX.length) : cleaned;
  if (body.length !== BODY_LENGTH + 1) return '';
  return `${TOKEN_PREFIX}-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}-${body.slice(12)}`;
}

export function isWellFormed(token) {
  const normalized = normalizeToken(token);
  if (!normalized) return false;
  const body = normalized.slice(3).replace(/-/g, '');
  return checksumChar(body.slice(0, BODY_LENGTH)) === body[BODY_LENGTH];
}

export function randomToken() {
  const bytes = new Uint8Array(BODY_LENGTH);
  crypto.getRandomValues?.(bytes);
  let body = '';
  for (let i = 0; i < BODY_LENGTH; i += 1) {
    body += ALPHABET[(bytes[i] ?? Math.floor(Math.random() * 256)) % ALPHABET.length];
  }
  const normalized = normalizeToken(`${TOKEN_PREFIX}${body}${checksumChar(body)}`);
  return normalized || '';
}

/** Formato canónico para logs, sin exponer el token completo. */
export function maskToken(token) {
  const normalized = normalizeToken(token);
  if (!normalized) return 'MT-????';
  return `${normalized.slice(0, 7)}••••-${normalized.slice(-1)}`;
}

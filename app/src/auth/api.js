/** Cliente de la API de licencias. Mismo origen por defecto. */

export function createApiClient({ base = '', fetchImpl = (...args) => globalThis.fetch(...args), timeoutMs = 8000 } = {}) {
  const root = base.replace(/\/$/, '');

  async function post(path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${root}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
        credentials: 'same-origin',
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      return { status: response.status, ok: response.ok, payload };
    } catch (error) {
      return {
        status: 0,
        ok: false,
        payload: null,
        error: error?.name === 'AbortError' ? 'timeout' : 'network',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async redeem(token, deviceId) {
      const result = await post('/api/license/redeem', { token, deviceId });
      if (result.ok) return { ok: true, license: result.payload?.license, status: result.status };
      return { ok: false, code: errorCode(result), status: result.status, error: result.error };
    },

    async verify(token, deviceId) {
      const result = await post('/api/license/verify', { token, deviceId });
      if (result.ok) return { ok: true, license: result.payload?.license, status: result.status };
      return { ok: false, code: errorCode(result), status: result.status, error: result.error };
    },

    async health() {
      const result = await post('/api/health', {});
      return result.ok;
    },

    get base() {
      return root;
    },
  };
}

function errorCode(result) {
  if (result.error) return result.error;
  const code = result.payload?.error;
  if (code === 'already_redeemed') return 'used';
  if (code === 'unknown_token') return 'invalid';
  if (code === 'rate_limited') return 'rate';
  if (result.status >= 500) return 'server';
  return 'invalid';
}

export function redeemMessage(code) {
  switch (code) {
    case 'used':
      return 'Este código ya se usó en otro dispositivo. Cada kit activa una sola instalación.';
    case 'invalid':
      return 'El código no existe en el inventario. Revisa las letras o escribe al soporte del kit.';
    case 'network':
      return 'Sin conexión con el servidor de licencias. Conéctate a internet para activar el kit.';
    case 'timeout':
      return 'El servidor tardó demasiado. Revisa tu conexión y vuelve a intentar.';
    case 'rate':
      return 'Demasiados intentos seguidos. Espera un minuto antes de volver a probar.';
    case 'malformed':
      return 'El código no tiene el formato del kit (MT-XXXX-XXXX-XXXX-C).';
    default:
      return 'No pudimos activar el kit. Vuelve a intentarlo en unos segundos.';
  }
}

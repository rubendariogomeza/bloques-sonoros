/**
 * Servidor HTTP: app estática + API de licencias.
 * Solo biblioteca estándar de Node (sin dependencias, sin build).
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.md': 'text/markdown; charset=utf-8',
};

const MAX_BODY = 8 * 1024;
const RATE_LIMIT = { windowMs: 60_000, max: 30 };

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(self), microphone=(), geolocation=()',
  'content-security-policy':
    "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

export function createAppServer({ appDir, store, logger = console } = {}) {
  if (!appDir) throw new Error('createAppServer requiere appDir');
  const root = path.resolve(appDir);
  const buckets = new Map();

  function send(res, status, body, headers = {}) {
    const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    res.writeHead(status, {
      ...SECURITY_HEADERS,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    });
    res.end(payload);
  }

  function rateLimited(ip) {
    const now = Date.now();
    const bucket = buckets.get(ip) ?? { count: 0, resetAt: now + RATE_LIMIT.windowMs };
    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + RATE_LIMIT.windowMs;
    }
    bucket.count += 1;
    buckets.set(ip, bucket);
    if (buckets.size > 5000) {
      for (const [key, value] of buckets) if (value.resetAt < now) buckets.delete(key);
    }
    return bucket.count > RATE_LIMIT.max;
  }

  function readJson(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY) {
          reject(Object.assign(new Error('body too large'), { status: 413 }));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (size === 0) return resolve({});
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(Object.assign(new Error('invalid json'), { status: 400 }));
        }
      });
      req.on('error', reject);
    });
  }

  async function handleApi(req, res, url) {
    const ip = req.socket.remoteAddress ?? 'unknown';
    if (req.method === 'POST' && rateLimited(ip)) {
      send(res, 429, { error: 'rate_limited' });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      send(res, 200, { ok: true, ...(store ? await store.stats() : {}) });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/health') {
      send(res, 200, { ok: true, ...(store ? await store.stats() : {}) });
      return;
    }

    if (!store) {
      send(res, 503, { error: 'store_unavailable' });
      return;
    }

    if (req.method === 'POST' && (url.pathname === '/api/license/redeem' || url.pathname === '/api/license/verify')) {
      let body;
      try {
        body = await readJson(req);
      } catch (error) {
        send(res, error.status ?? 400, { error: 'bad_request' });
        return;
      }
      const token = typeof body.token === 'string' ? body.token : '';
      const deviceId = typeof body.deviceId === 'string' ? body.deviceId.slice(0, 120) : '';
      const action = url.pathname.endsWith('redeem') ? store.redeem : store.verify;
      const result = await action(token, deviceId);
      if (result.ok) send(res, 200, { ok: true, license: result.license });
      else send(res, result.status, { ok: false, error: result.code });
      return;
    }

    send(res, 404, { error: 'not_found' });
  }

  async function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, { error: 'method_not_allowed' });
      return;
    }

    const pathname = decodeURIComponent(url.pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filePath = path.resolve(root, relative);

    if (!filePath.startsWith(root + path.sep) && filePath !== path.join(root, 'index.html')) {
      send(res, 403, { error: 'forbidden' });
      return;
    }

    let info;
    try {
      info = await stat(filePath);
    } catch {
      send(res, 404, { error: 'not_found' });
      return;
    }
    if (!info.isFile()) {
      send(res, 404, { error: 'not_found' });
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const isShell = extension === '.html' || filePath.endsWith('sw.js');
    const body = await readFile(filePath);
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'content-type': MIME[extension] ?? 'application/octet-stream',
      'cache-control': isShell ? 'no-cache' : 'public, max-age=0, must-revalidate',
      'content-length': body.length,
    });
    if (req.method === 'HEAD') res.end();
    else res.end(body);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    try {
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else await serveStatic(req, res, url);
    } catch (error) {
      logger.error?.('[server]', error);
      if (!res.headersSent) send(res, 500, { error: 'internal_error' });
      else res.end();
    }
  });

  return server;
}

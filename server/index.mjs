/** Arranque del servidor de desarrollo/despliegue. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppServer } from './app.mjs';
import { createLicenseStore, DEFAULT_PEPPER } from './licenseStore.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? '0.0.0.0';

const store = createLicenseStore({
  file: path.join(here, 'data', 'licenses.json'),
  pepper: process.env.MT_PEPPER ?? DEFAULT_PEPPER,
});

const server = createAppServer({
  appDir: path.join(projectRoot, 'app'),
  store,
});

const stats = await store.stats();
if (stats.total === 0) {
  const [token] = await store.createTokens(1, 'token-de-desarrollo');
  console.log('');
  console.log('  Inventario vacío: se creó un código de prueba de un solo uso.');
  console.log(`  Código: ${token}`);
  console.log('  Escanéalo o escríbelo para activar el kit en este proyecto.');
  console.log('');
}

if (process.env.MT_PEPPER == null) {
  console.log('  Aviso: usa MT_PEPPER en producción para firmar los hashes del inventario.');
}

server.listen(port, host, () => {
  console.log(`Bloques Sonoros en http://localhost:${port}`);
  console.log(`Inventario: ${store.file}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

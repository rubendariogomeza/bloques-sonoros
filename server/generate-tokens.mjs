#!/usr/bin/env node
/**
 * Generador de códigos de un solo uso para los kits físicos.
 *
 *   node server/generate-tokens.mjs --count 25 --label "lote-septiembre"
 *   node server/generate-tokens.mjs --count 5 --out server/data/lote.txt
 *
 * Imprime los códigos en claro (una sola vez) y guarda solo su hash.
 */
import { parseArgs } from 'node:util';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createLicenseStore, DEFAULT_PEPPER } from './licenseStore.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const { values } = parseArgs({
  options: {
    count: { type: 'string', default: '10' },
    label: { type: 'string', default: 'kit' },
    out: { type: 'string' },
    file: { type: 'string' },
  },
  allowPositionals: false,
});

const count = Math.max(1, Math.min(5000, Number(values.count) || 10));
const store = createLicenseStore({
  file: values.file ? path.resolve(values.file) : path.join(here, 'data', 'licenses.json'),
  pepper: process.env.MT_PEPPER ?? DEFAULT_PEPPER,
});

const tokens = await store.createTokens(count, values.label);
const stats = await store.stats();

const lines = [
  `# Bloques Sonoros · lote "${values.label}" · ${new Date().toISOString()}`,
  `# ${count} códigos nuevos · inventario: ${stats.total} (${stats.available} disponibles, ${stats.redeemed} canjeados)`,
  '',
  ...tokens,
  '',
];

if (values.out) {
  await writeFile(path.resolve(values.out), lines.join('\n'), 'utf8');
  console.log(`Guardados ${tokens.length} códigos en ${path.resolve(values.out)}`);
  console.log('Imprímelos en los manuales: el servidor solo conserva su hash.');
} else {
  console.log(lines.join('\n'));
}

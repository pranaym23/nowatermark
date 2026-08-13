/**
 * Emit sample files with known metadata for manual QA in a real browser.
 *
 *   pnpm fixtures
 *
 * Writes to tests/fixtures/samples/ (git-ignored). The unit tests build these
 * in memory instead — this script exists so you can drag a real file with
 * known contents into the running site.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildJpegFixture, buildPngFixture, buildWebpFixture } from './build.ts';

const outDir = join(dirname(fileURLToPath(import.meta.url)), 'samples');
mkdirSync(outDir, { recursive: true });

const files: Array<[string, Uint8Array]> = [
  ['loaded.jpg', buildJpegFixture()],
  ['rotated.jpg', buildJpegFixture({ orientation: 6 })],
  ['clean.jpg', buildJpegFixture({
    withExif: false,
    withXmp: false,
    withIptc: false,
    withC2pa: false,
    withComment: false,
  })],
  ['loaded.png', buildPngFixture()],
  ['loaded.webp', buildWebpFixture()],
  ['lossless.webp', buildWebpFixture({ lossless: true })],
];

for (const [name, bytes] of files) {
  writeFileSync(join(outDir, name), bytes);
  console.log(`${name.padEnd(16)} ${bytes.length} bytes`);
}
console.log(`\nWrote ${files.length} files to ${outDir}`);

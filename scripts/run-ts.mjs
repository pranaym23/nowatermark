/**
 * Run a TypeScript script that imports from `src/lib/`.
 *
 * Node's `--experimental-strip-types` cannot follow the extensionless imports
 * that `src/lib/` uses internally, and esbuild's CLI shim is broken in this
 * install, so bundle through esbuild's JS API and import the result.
 *
 *   node scripts/run-ts.mjs <script.ts> [args...]
 */

import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const [entry, ...args] = process.argv.slice(2);
if (!entry) {
  console.error('usage: run-ts.mjs <script.ts> [args...]');
  process.exit(1);
}

const outfile = resolve('node_modules/.cache/run-ts.mjs');

await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  outfile,
  logLevel: 'warning',
});

process.argv = [process.argv[0], resolve(entry), ...args];
await import(pathToFileURL(outfile).href);

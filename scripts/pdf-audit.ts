/**
 * Real-PDF validation harness (V2 build plan, Phase 0.2).
 *
 * `collectPdfMetadata` has only ever been run against fixtures we wrote
 * ourselves, which means it has only ever seen PDFs shaped the way we imagined
 * PDFs are shaped. Before the capability matrix makes a public claim about PDF
 * coverage, the parser has to meet files produced by Word, Acrobat, LaTeX,
 * scanners, phone cameras and every other producer in the wild.
 *
 * Run:
 *   node --experimental-strip-types scripts/pdf-audit.ts <dir> [<dir> ...]
 *
 * Privacy: this reads files from wherever you point it, and those are very
 * likely to be personal documents. So it records *shapes and counts only* —
 * never a metadata value, never a filename, never a path. What it prints could
 * be pasted into a public issue without leaking anything. Do not relax that:
 * the point of the harness is to justify a claim, and a harness that exfiltrates
 * the user's documents to justify a privacy claim would be self-refuting.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { collectPdfMetadata } from '../src/lib/metadata/pdf';
import { readPdf } from '../src/lib/pdf/document';

interface Row {
  bytes: number;
  ms: number;
  ok: boolean;
  threw?: string;
  degraded: boolean;
  encrypted: boolean;
  linearized: boolean;
  revisions: number;
  staleMetadata: boolean;
  /** Which /Info fields were populated — the key, never the value. */
  infoFields: string[];
  customKeyCount: number;
  xmpPackets: number;
  hasJavaScript: boolean;
  hasEmbeddedFiles: boolean;
  hasC2pa: boolean;
  warnings: string[];
}

const MAX_BYTES = 128 * 1024 * 1024;

async function* walk(dir: string, depth = 0): AsyncGenerator<string> {
  if (depth > 8) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // Unreadable directory: not our business to report.
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path, depth + 1);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) yield path;
  }
}

async function audit(path: string): Promise<Row | null> {
  const info = await stat(path).catch(() => null);
  if (!info || info.size === 0 || info.size > MAX_BYTES) return null;

  const bytes = new Uint8Array(await readFile(path));
  const started = performance.now();

  try {
    const doc = await readPdf(bytes);
    const meta = await collectPdfMetadata(bytes);
    const ms = performance.now() - started;

    const fields = meta.current
      ? Object.entries(meta.current)
          .filter(([key, value]) => key !== 'customKeys' && Boolean(value))
          .map(([key]) => key)
      : [];

    return {
      bytes: bytes.length,
      ms,
      ok: true,
      degraded: meta.degraded,
      encrypted: meta.encrypted,
      linearized: doc.linearized,
      revisions: meta.revisionCount,
      staleMetadata: meta.staleMetadata,
      infoFields: fields,
      customKeyCount: meta.current?.customKeys.length ?? 0,
      xmpPackets: meta.xmpPackets.length,
      hasJavaScript: meta.hasJavaScript,
      hasEmbeddedFiles: meta.hasEmbeddedFiles,
      hasC2pa: meta.hasC2pa,
      // Warnings are our own fixed strings, so they carry nothing from the file.
      warnings: meta.warnings,
    };
  } catch (error) {
    return {
      bytes: bytes.length,
      ms: performance.now() - started,
      ok: false,
      threw: error instanceof Error ? `${error.name}: ${error.message}` : 'unknown',
      degraded: true,
      encrypted: false,
      linearized: false,
      revisions: 0,
      staleMetadata: false,
      infoFields: [],
      customKeyCount: 0,
      xmpPackets: 0,
      hasJavaScript: false,
      hasEmbeddedFiles: false,
      hasC2pa: false,
      warnings: [],
    };
  }
}

function percent(n: number, total: number): string {
  return total === 0 ? '0.0%' : `${((n / total) * 100).toFixed(1)}%`;
}

function tally(rows: Row[], pick: (r: Row) => boolean, label: string): string {
  const n = rows.filter(pick).length;
  return `  ${label.padEnd(28)} ${String(n).padStart(5)}  ${percent(n, rows.length).padStart(7)}`;
}

async function main(): Promise<void> {
  const dirs = process.argv.slice(2);
  if (dirs.length === 0) {
    console.error('usage: pdf-audit.ts <dir> [<dir> ...]');
    process.exitCode = 1;
    return;
  }

  const rows: Row[] = [];
  for (const dir of dirs) {
    for await (const path of walk(dir)) {
      const row = await audit(path);
      if (row) rows.push(row);
      if (rows.length % 25 === 0 && rows.length > 0) {
        process.stderr.write(`\r  scanned ${rows.length}...`);
      }
    }
  }
  process.stderr.write('\r');

  if (rows.length === 0) {
    console.error('No readable PDFs found.');
    process.exitCode = 1;
    return;
  }

  const threw = rows.filter((r) => !r.ok);
  const parsed = rows.filter((r) => r.ok);
  const times = rows.map((r) => r.ms).sort((a, b) => a - b);
  const at = (q: number) => times[Math.min(times.length - 1, Math.floor(times.length * q))]!;

  console.log(`\nPDF audit — ${rows.length} files\n`);

  console.log('Parse outcome');
  console.log(tally(rows, (r) => r.ok && !r.degraded, 'clean parse'));
  console.log(tally(rows, (r) => r.ok && r.degraded, 'degraded'));
  console.log(tally(rows, (r) => !r.ok, 'threw'));
  console.log(tally(rows, (r) => r.encrypted, 'encrypted'));

  console.log('\nStructure');
  console.log(tally(rows, (r) => r.revisions > 1, 'multiple revisions'));
  console.log(tally(rows, (r) => r.staleMetadata, 'stale metadata in old rev'));
  console.log(tally(rows, (r) => r.linearized, 'linearized'));

  console.log('\nFindings');
  console.log(tally(rows, (r) => r.infoFields.length > 0, 'any /Info field'));
  console.log(tally(rows, (r) => r.infoFields.includes('author'), 'author'));
  console.log(tally(rows, (r) => r.customKeyCount > 0, 'custom /Info keys'));
  console.log(tally(rows, (r) => r.xmpPackets > 0, 'XMP packet'));
  console.log(tally(rows, (r) => r.hasJavaScript, 'JavaScript'));
  console.log(tally(rows, (r) => r.hasEmbeddedFiles, 'embedded files'));
  console.log(tally(rows, (r) => r.hasC2pa, 'C2PA'));

  console.log('\nTiming (ms)');
  console.log(`  median ${at(0.5).toFixed(1)}  p95 ${at(0.95).toFixed(1)}  max ${at(1).toFixed(1)}`);
  const slow = rows.filter((r) => r.ms > 1000).length;
  console.log(`  over 1s: ${slow} (${percent(slow, rows.length)})`);

  if (threw.length > 0) {
    console.log('\nExceptions');
    const byMessage = new Map<string, number>();
    for (const row of threw) {
      byMessage.set(row.threw!, (byMessage.get(row.threw!) ?? 0) + 1);
    }
    for (const [message, count] of [...byMessage].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(4)}  ${message}`);
    }
  }

  const warned = new Map<string, number>();
  for (const row of parsed) {
    for (const warning of row.warnings) {
      // Collapse the counted variants so the tally stays readable.
      const key = warning.replace(/\d+/g, 'N');
      warned.set(key, (warned.get(key) ?? 0) + 1);
    }
  }
  if (warned.size > 0) {
    console.log('\nWarnings issued');
    for (const [warning, count] of [...warned].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(4)}  ${warning}`);
    }
  }

  const degradedRate = (rows.length - parsed.filter((r) => !r.degraded).length) / rows.length;
  console.log(
    `\nVerdict: ${percent(rows.length - (rows.length - parsed.filter((r) => !r.degraded).length), rows.length)} of real files parse cleanly.`,
  );
  console.log(
    degradedRate > 0.1
      ? 'Above the 10% threshold — the capability matrix must qualify its PDF claim.'
      : 'Within the 10% threshold — PDF may be claimed as supported for scanning.',
  );
}

await main();

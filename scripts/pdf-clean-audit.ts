/**
 * Real-PDF cleaning audit (V2 item 6).
 *
 * Fixtures prove the cleaner works on documents we wrote. They prove nothing
 * about documents Word, Acrobat, LaTeX and a decade of scanners wrote. A PDF
 * cleaner that damages a real file is worse than one that declines to run, so
 * this measures the refusal rate as carefully as the success rate — a high
 * refusal rate is a working safety valve, not a failure.
 *
 * Run:
 *   pnpm pdf:clean-audit <dir> [<dir> ...]
 *
 * Privacy: identical rules to pdf-audit.ts. Shapes and counts only — never a
 * filename, a path, or a metadata value.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { cleanPdfBytes } from '../src/lib/cleaners/pdf';
import { collectPdfMetadata } from '../src/lib/metadata/pdf';
import { readPdf } from '../src/lib/pdf/document';

const MAX_BYTES = 64 * 1024 * 1024;

async function* walk(dir: string, depth = 0): AsyncGenerator<string> {
  if (depth > 8) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path, depth + 1);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) yield path;
  }
}

interface Row {
  cleaned: boolean;
  refusedReason?: string;
  threw?: string;
  /** Output grew relative to input, as a ratio. */
  sizeRatio?: number;
  /** Verification that ran on a successful clean. */
  parsedBack?: boolean;
  revisionsAfter?: number;
  authorGone?: boolean;
  ms: number;
}

/** Collapse a refusal message to a stable bucket. */
function bucketReason(warnings: string[]): string {
  const text = warnings.join(' ').toLowerCase();
  if (text.includes('encrypted')) return 'encrypted';
  if (text.includes('cannot rebuild safely')) return 'unsupported structure';
  if (text.includes('did not parse back')) return 'output did not parse';
  if (text.includes('revisions rather than one')) return 'output had extra revisions';
  if (text.includes('metadata survived')) return 'metadata survived';
  if (text.includes('xmp packet survived')) return 'xmp survived';
  if (text.includes('still present in the rebuilt')) return 'value found in output bytes';
  return 'other';
}

async function audit(path: string): Promise<Row | null> {
  const info = await stat(path).catch(() => null);
  if (!info || info.size === 0 || info.size > MAX_BYTES) return null;

  const bytes = new Uint8Array(await readFile(path));
  const started = performance.now();

  try {
    const before = await collectPdfMetadata(bytes);
    const outcome = await cleanPdfBytes(bytes);
    const ms = performance.now() - started;

    if (!outcome.ok) {
      return { cleaned: false, refusedReason: bucketReason(outcome.warnings), ms };
    }

    const doc = await readPdf(outcome.bytes);
    const after = await collectPdfMetadata(outcome.bytes);

    const author = before.current?.author?.trim();
    const authorGone =
      !author || author.length < 4
        ? true
        : !new TextDecoder('latin1').decode(outcome.bytes).includes(author);

    return {
      cleaned: true,
      sizeRatio: outcome.bytes.length / bytes.length,
      parsedBack: !doc.degraded,
      revisionsAfter: after.revisionCount,
      authorGone,
      ms,
    };
  } catch (error) {
    return {
      cleaned: false,
      threw: error instanceof Error ? `${error.name}: ${error.message}` : 'unknown',
      ms: performance.now() - started,
    };
  }
}

function pct(n: number, total: number): string {
  return total === 0 ? '0.0%' : `${((n / total) * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const dirs = process.argv.slice(2);
  if (dirs.length === 0) {
    console.error('usage: pdf-clean-audit.ts <dir> [<dir> ...]');
    process.exitCode = 1;
    return;
  }

  const rows: Row[] = [];
  for (const dir of dirs) {
    for await (const path of walk(dir)) {
      const row = await audit(path);
      if (row) rows.push(row);
      if (rows.length % 25 === 0 && rows.length > 0) {
        process.stderr.write(`\r  ${rows.length}...`);
      }
    }
  }
  process.stderr.write('\r');

  if (rows.length === 0) {
    console.error('No readable PDFs found.');
    process.exitCode = 1;
    return;
  }

  const cleaned = rows.filter((r) => r.cleaned);
  const threw = rows.filter((r) => r.threw);

  console.log(`\nPDF clean audit — ${rows.length} files\n`);
  console.log(`  cleaned            ${String(cleaned.length).padStart(5)}  ${pct(cleaned.length, rows.length)}`);
  console.log(`  refused            ${String(rows.length - cleaned.length - threw.length).padStart(5)}  ${pct(rows.length - cleaned.length - threw.length, rows.length)}`);
  console.log(`  threw              ${String(threw.length).padStart(5)}  ${pct(threw.length, rows.length)}`);

  const reasons = new Map<string, number>();
  for (const row of rows) {
    if (row.cleaned || row.threw) continue;
    const key = row.refusedReason ?? 'other';
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
  if (reasons.size > 0) {
    console.log('\nWhy it refused');
    for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(5)}  ${reason}`);
    }
  }

  if (cleaned.length > 0) {
    const bad = cleaned.filter((r) => !r.parsedBack).length;
    const multi = cleaned.filter((r) => (r.revisionsAfter ?? 1) !== 1).length;
    const leaked = cleaned.filter((r) => r.authorGone === false).length;
    const ratios = cleaned.map((r) => r.sizeRatio ?? 1).sort((a, b) => a - b);

    console.log('\nVerification of cleaned output');
    console.log(`  did not parse back   ${bad}`);
    console.log(`  not exactly 1 revision ${multi}`);
    console.log(`  author still in bytes  ${leaked}`);
    console.log(
      `  size ratio  median ${ratios[Math.floor(ratios.length / 2)]?.toFixed(2)}  max ${ratios[ratios.length - 1]?.toFixed(2)}`,
    );

    if (bad || multi || leaked) {
      console.log('\n  ⚠ At least one cleaned file failed verification. That should be');
      console.log('    impossible — the cleaner is supposed to discard those itself.');
      process.exitCode = 1;
    } else {
      console.log('\n  Every cleaned file parsed back, had exactly one revision, and');
      console.log('  contained no trace of its original author string.');
    }
  }

  if (threw.length > 0) {
    console.log('\nExceptions');
    const byMessage = new Map<string, number>();
    for (const row of threw) byMessage.set(row.threw!, (byMessage.get(row.threw!) ?? 0) + 1);
    for (const [message, count] of [...byMessage].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(4)}  ${message}`);
    }
  }
}

await main();

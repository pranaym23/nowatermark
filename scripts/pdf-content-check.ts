/**
 * Does cleaning preserve what the reader actually sees?
 *
 * The clean audit proves the output parses. Parsing is not rendering: a PDF can
 * be structurally valid and blank. This compares page count and the raw bytes
 * of every content stream, before and after, which is the closest thing to
 * "looks the same" that can be checked without a renderer.
 *
 * Counts only. No filenames, no paths, no content.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { cleanPdfBytes } from '../src/lib/cleaners/pdf';
import { getObject, readPdf, type PdfDocument } from '../src/lib/pdf/document';
import { dictOf, numberOf, type PdfValue } from '../src/lib/pdf/lexer';

async function pagesOf(doc: PdfDocument): Promise<{ count: number; streams: string[] }> {
  const trailer = doc.revisions[0]?.trailer;
  const rootRef = trailer?.get('Root');
  if (!rootRef || rootRef.kind !== 'ref') return { count: 0, streams: [] };
  const root = dictOf((await getObject(doc, rootRef.num, 0)) ?? undefined);
  const pagesRef = root?.get('Pages');
  if (!pagesRef || pagesRef.kind !== 'ref') return { count: 0, streams: [] };
  const pages = dictOf((await getObject(doc, pagesRef.num, 0)) ?? undefined);

  const streams: string[] = [];
  const walk = async (nodeRef: PdfValue | undefined, depth: number): Promise<void> => {
    if (!nodeRef || nodeRef.kind !== 'ref' || depth > 32) return;
    const node = dictOf((await getObject(doc, nodeRef.num, 0)) ?? undefined);
    if (!node) return;
    const kids = node.get('Kids');
    if (kids?.kind === 'array') {
      for (const kid of kids.items) await walk(kid, depth + 1);
      return;
    }
    const contents = node.get('Contents');
    const refs = contents?.kind === 'array' ? contents.items : contents ? [contents] : [];
    for (const ref of refs) {
      if (ref.kind !== 'ref') continue;
      const obj = await getObject(doc, ref.num, 0);
      if (obj?.kind === 'stream') {
        const raw = doc.bytes.subarray(obj.start, obj.end);
        // Cheap stable digest; we only need equality, not cryptography.
        let h = 0;
        for (let i = 0; i < raw.length; i++) h = (h * 31 + raw[i]!) >>> 0;
        streams.push(`${raw.length}:${h}`);
      }
    }
  };
  await walk(pagesRef, 0);
  return { count: numberOf(pages?.get('Count')) ?? 0, streams };
}

async function* walkDir(dir: string, depth = 0): AsyncGenerator<string> {
  if (depth > 8) return;
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walkDir(p, depth + 1);
    else if (e.isFile() && e.name.toLowerCase().endsWith('.pdf')) yield p;
  }
}

let checked = 0, pageMismatch = 0, streamMismatch = 0, identical = 0;

for (const dir of process.argv.slice(2)) {
  for await (const path of walkDir(dir)) {
    const info = await stat(path).catch(() => null);
    if (!info || info.size === 0 || info.size > 64 * 1024 * 1024) continue;
    const bytes = new Uint8Array(await readFile(path));
    try {
      const outcome = await cleanPdfBytes(bytes);
      if (!outcome.ok) continue;
      const a = await pagesOf(await readPdf(bytes));
      const b = await pagesOf(await readPdf(outcome.bytes));
      checked++;
      if (a.count !== b.count) pageMismatch++;
      else if (a.streams.join('|') !== b.streams.join('|')) streamMismatch++;
      else identical++;
    } catch { /* counted by the clean audit */ }
    if (checked % 50 === 0 && checked) process.stderr.write(`\r  ${checked}...`);
  }
}
process.stderr.write('\r');

console.log(`\nContent preservation — ${checked} cleaned files\n`);
console.log(`  identical pages and content streams  ${identical}`);
console.log(`  page count changed                   ${pageMismatch}`);
console.log(`  content stream bytes changed         ${streamMismatch}`);
if (pageMismatch || streamMismatch) {
  console.log('\n  ⚠ Cleaning altered what the reader sees. That is a bug.');
  process.exitCode = 1;
}

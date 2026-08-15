/**
 * PDF re-serialiser — writes a whole new document, never an incremental update.
 *
 * This is the dangerous file in the project, and the reason is worth stating
 * before the code.
 *
 * A PDF is append-only. The obvious way to "remove" metadata is to write a new
 * empty /Info and append it with a fresh xref, and every viewer will then show
 * no author. The original /Info is still in the file, earlier in the byte
 * stream, perfectly readable. Worse, **our own verification would pass**:
 * `clean.ts` re-scans its output, the parser follows the current xref to the
 * new /Info, finds it empty, and reports "Removed". That would be a false claim
 * confirmed by our own machinery, on the one promise this product calls
 * non-negotiable.
 *
 * So this rebuilds from scratch: walk the object graph reachable from the
 * current Root, drop the metadata carriers, renumber what remains, and emit a
 * single-revision file with one xref table. Nothing from an older revision can
 * survive, because nothing is copied except objects we deliberately walked to.
 *
 * Content streams are copied byte-for-byte. Nothing is re-deflated, so page
 * content, fonts and images are bit-identical to the original.
 *
 * **It refuses far more than it accepts.** Every case it does not fully
 * understand returns null and the caller keeps the original file. A PDF cleaner
 * that damages someone's document is worse than one that declines to run.
 */

import { asciiBytes, concat } from '../bytes';
import { decodeStream, getObject, type PdfDocument } from './document';
import { dictOf, numberOf, type PdfValue } from './lexer';

/** Metadata keys removed from the catalog and from every object we emit. */
const STRIP_KEYS = new Set(['Metadata', 'PieceInfo', 'LastModified']);

/** How many objects we are willing to walk before deciding a file is hostile. */
const MAX_OBJECTS = 50_000;

export interface SerialiseResult {
  bytes: Uint8Array;
  /** Objects written, for the report. */
  objectCount: number;
}

/** Escape a PDF literal string. */
function literalString(bytes: Uint8Array): Uint8Array {
  const out: number[] = [0x28]; // (
  for (const b of bytes) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) out.push(0x5c); // ( ) \
    out.push(b);
  }
  out.push(0x29); // )
  return new Uint8Array(out);
}

/** Write a name, re-escaping anything outside the safe range. */
function nameBytes(name: string): Uint8Array {
  let out = '/';
  for (const ch of name) {
    const code = ch.charCodeAt(0);
    const unsafe =
      code < 0x21 || code > 0x7e || '()<>[]{}/%#'.includes(ch);
    out += unsafe ? '#' + code.toString(16).padStart(2, '0') : ch;
  }
  return asciiBytes(out);
}

/**
 * Serialise one value.
 *
 * `remap` translates old object numbers to new ones. A reference to an object
 * we did not keep becomes `null`, which is valid PDF and is what the spec says
 * a dangling reference means anyway.
 */
function writeValue(
  value: PdfValue,
  remap: Map<number, number>,
  streams: Map<number, Uint8Array>,
): Uint8Array {
  switch (value.kind) {
    case 'null':
      return asciiBytes('null');
    case 'bool':
      return asciiBytes(value.value ? 'true' : 'false');
    case 'number':
      return asciiBytes(Number.isInteger(value.value) ? String(value.value) : String(value.value));
    case 'string':
      return literalString(value.bytes);
    case 'name':
      return nameBytes(value.value);
    case 'ref': {
      const mapped = remap.get(value.num);
      return asciiBytes(mapped === undefined ? 'null' : `${mapped} 0 R`);
    }
    case 'array': {
      const parts: Uint8Array[] = [asciiBytes('[')];
      value.items.forEach((item, i) => {
        if (i > 0) parts.push(asciiBytes(' '));
        parts.push(writeValue(item, remap, streams));
      });
      parts.push(asciiBytes(']'));
      return concat(parts);
    }
    case 'dict':
      return writeDict(value.map, remap, streams);
    case 'stream':
      // Streams are written by writeObject, which has the payload to hand.
      return writeDict(value.dict, remap, streams);
  }
}

function writeDict(
  map: Map<string, PdfValue>,
  remap: Map<number, number>,
  streams: Map<number, Uint8Array>,
): Uint8Array {
  const parts: Uint8Array[] = [asciiBytes('<<')];
  for (const [key, value] of map) {
    if (STRIP_KEYS.has(key)) continue;
    parts.push(nameBytes(key));
    parts.push(asciiBytes(' '));
    parts.push(writeValue(value, remap, streams));
    parts.push(asciiBytes(' '));
  }
  parts.push(asciiBytes('>>'));
  return concat(parts);
}

/**
 * Walk everything reachable from the catalog, in the *current* revision only.
 *
 * Anything an older revision can still see but the current one cannot is
 * unreachable from here, which is precisely how the stale metadata gets left
 * behind rather than copied forward.
 */
async function collectReachable(
  doc: PdfDocument,
  rootNum: number,
): Promise<Map<number, PdfValue> | null> {
  const objects = new Map<number, PdfValue>();
  const queue: number[] = [rootNum];
  const seen = new Set<number>([rootNum]);

  while (queue.length > 0) {
    if (objects.size > MAX_OBJECTS) return null;
    const num = queue.shift()!;

    const value = await getObject(doc, num, 0);
    if (!value) {
      // A dangling reference is survivable — it serialises as null.
      continue;
    }
    objects.set(num, value);

    for (const ref of refsIn(value)) {
      if (!seen.has(ref)) {
        seen.add(ref);
        queue.push(ref);
      }
    }
  }

  return objects;
}

/** Every indirect reference inside a value, one level deep into containers. */
function refsIn(value: PdfValue): number[] {
  const out: number[] = [];
  const visit = (v: PdfValue, depth: number): void => {
    if (depth > 64) return;
    switch (v.kind) {
      case 'ref':
        out.push(v.num);
        break;
      case 'array':
        for (const item of v.items) visit(item, depth + 1);
        break;
      case 'dict':
        for (const [key, item] of v.map) {
          // Do not follow into metadata we are about to drop.
          if (STRIP_KEYS.has(key)) continue;
          visit(item, depth + 1);
        }
        break;
      case 'stream':
        for (const [key, item] of v.dict) {
          if (STRIP_KEYS.has(key)) continue;
          visit(item, depth + 1);
        }
        break;
      default:
        break;
    }
  };
  visit(value, 0);
  return out;
}

/**
 * Rebuild the document with no /Info, no XMP and exactly one revision.
 *
 * Returns null whenever the result would not be trustworthy. Every such path is
 * a deliberate refusal, not an oversight.
 */
export async function reserialisePdf(doc: PdfDocument): Promise<SerialiseResult | null> {
  // Encrypted documents would need their strings and streams decrypted and
  // re-encrypted to stay readable. Not attempted.
  if (doc.encrypted) return null;
  if (doc.degraded) return null;
  if (doc.revisions.length === 0) return null;

  const trailer = doc.revisions[0]!.trailer;
  const rootRef = trailer.get('Root');
  if (!rootRef || rootRef.kind !== 'ref') return null;

  const objects = await collectReachable(doc, rootRef.num);
  if (!objects || objects.size === 0) return null;

  // A catalog we cannot read means we cannot know what we are keeping.
  const rootValue = objects.get(rootRef.num);
  if (!dictOf(rootValue)) return null;

  /*
   * Stream payloads, resolved before renumbering.
   *
   * A stream whose /Length is an indirect reference has to be inlined: the
   * length must be a direct number in the output, because the object holding it
   * may not survive.
   */
  const streams = new Map<number, Uint8Array>();
  for (const [num, value] of objects) {
    if (value.kind !== 'stream') continue;

    let raw = doc.bytes.subarray(value.start, value.end);

    const lengthValue = value.dict.get('Length');
    if (lengthValue?.kind === 'ref') {
      const resolved = await getObject(doc, lengthValue.num, 0);
      const length = numberOf(resolved ?? undefined);
      if (length === undefined || length < 0 || value.start + length > doc.bytes.length) {
        return null;
      }
      raw = doc.bytes.subarray(value.start, value.start + length);
    }
    streams.set(num, raw);
  }

  /*
   * Object streams are expanded, not copied. Their contents are already being
   * emitted as ordinary objects, so carrying the container forward would write
   * every one of them into the file a second time — including any we chose to
   * drop.
   */
  for (const [num, value] of [...objects]) {
    if (value.kind === 'stream') {
      const type = value.dict.get('Type');
      if (type?.kind === 'name' && (type.value === 'ObjStm' || type.value === 'XRef')) {
        objects.delete(num);
        streams.delete(num);
      }
    }
  }

  // Sequential numbering from 1, in a stable order.
  const oldNumbers = [...objects.keys()].sort((a, b) => a - b);
  const remap = new Map<number, number>();
  oldNumbers.forEach((old, i) => remap.set(old, i + 1));

  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let position = 0;

  const push = (bytes: Uint8Array) => {
    parts.push(bytes);
    position += bytes.length;
  };

  // A binary comment on line 2 marks the file as binary for transfer tools.
  push(asciiBytes('%PDF-1.7\n'));
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  for (const old of oldNumbers) {
    const value = objects.get(old)!;
    const num = remap.get(old)!;
    offsets.push(position);

    push(asciiBytes(`${num} 0 obj\n`));

    if (value.kind === 'stream') {
      const payload = streams.get(old);
      if (!payload) return null;

      // /Length must describe the bytes we are actually writing.
      const dict = new Map(value.dict);
      dict.set('Length', { kind: 'number', value: payload.length });
      push(writeDict(dict, remap, streams));
      push(asciiBytes('\nstream\n'));
      push(payload);
      push(asciiBytes('\nendstream'));
    } else {
      push(writeValue(value, remap, streams));
    }

    push(asciiBytes('\nendobj\n'));
  }

  const xrefAt = position;
  const count = oldNumbers.length + 1;

  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  push(asciiBytes(xref));

  /*
   * No /Info and no /ID. /Info is the metadata dictionary this whole exercise
   * exists to remove; /ID is a pair of file identifiers derived from the
   * original document, and carrying it forward would leave a fingerprint of the
   * file we were asked to clean.
   */
  push(
    asciiBytes(
      `trailer\n<< /Size ${count} /Root ${remap.get(rootRef.num)} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`,
    ),
  );

  return { bytes: concat(parts), objectCount: oldNumbers.length };
}

/** Re-exported so the cleaner can inspect a stream without importing document.ts. */
export { decodeStream };

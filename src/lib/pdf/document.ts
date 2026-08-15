/**
 * PDF document structure: the cross-reference chain, revisions and object
 * resolution.
 *
 * The thing that matters most here is the **revision chain**. A PDF is
 * append-only: saving it again writes a new body and a new xref that points
 * back at the old one via /Prev. Every earlier revision is still in the file,
 * and every earlier /Info dictionary is still readable. Software that "removes"
 * PDF metadata by appending an update leaves all of it recoverable.
 *
 * So this counts and reports revisions rather than only reading the newest one.
 * A user whose file has three prior revisions needs to know that before they
 * trust any cleaner — including a future version of ours.
 */

import {
  PdfLexer,
  dictOf,
  lastIndexOfAscii,
  nameOf,
  numberOf,
  type PdfValue,
} from './lexer';

export interface XrefEntry {
  offset: number;
  /** 2 = stored inside an object stream. */
  type: 0 | 1 | 2;
  /** For type 2: the object stream's object number and the index within it. */
  streamNum?: number;
  streamIndex?: number;
}

export interface Revision {
  /** Byte offset of this revision's xref section. */
  xrefOffset: number;
  trailer: Map<string, PdfValue>;
  /** Entries this revision itself wrote. */
  own: Map<number, XrefEntry>;
  /**
   * How the document looked *at* this revision: this revision's entries laid
   * over every older one. Resolving a prior revision's /Info through the merged
   * current xref would silently return the newest object instead — which is the
   * incremental-update trap, just from the other side.
   */
  view: Map<number, XrefEntry>;
}

export interface PdfDocument {
  bytes: Uint8Array;
  /** Newest first. */
  revisions: Revision[];
  xref: Map<number, XrefEntry>;
  encrypted: boolean;
  linearized: boolean;
  warnings: string[];
  /** True when the xref chain could not be followed and we fell back. */
  degraded: boolean;
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  for (const format of ['deflate', 'deflate-raw'] as const) {
    try {
      const ds = new DecompressionStream(format);
      const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(ds);
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      // Try the next framing.
    }
  }
  return null;
}

/** Decode a stream's bytes when we understand its filter chain. */
export async function decodeStream(
  bytes: Uint8Array,
  value: PdfValue,
): Promise<Uint8Array | null> {
  if (value.kind !== 'stream') return null;
  const raw = bytes.subarray(value.start, value.end);

  const filter = value.dict.get('Filter');
  const names: string[] = [];
  if (filter?.kind === 'name') names.push(filter.value);
  else if (filter?.kind === 'array') {
    for (const f of filter.items) {
      const n = nameOf(f);
      if (n) names.push(n);
    }
  }

  if (names.length === 0) return raw;
  if (names.length === 1 && names[0] === 'FlateDecode') {
    const out = await inflate(raw);
    if (!out) return null;
    // Predictors would need undoing; only report when there is none.
    const parms = dictOf(value.dict.get('DecodeParms'));
    const predictor = numberOf(parms?.get('Predictor')) ?? 1;
    return predictor <= 1 ? out : null;
  }
  return null;
}

function parseClassicXref(
  bytes: Uint8Array,
  offset: number,
  xref: Map<number, XrefEntry>,
): Map<string, PdfValue> | null {
  const lexer = new PdfLexer(bytes, offset);
  lexer.skip();
  if (!lexer.takeKeyword('xref')) return null;

  for (;;) {
    lexer.skip();
    if (lexer.peekKeyword('trailer')) break;

    const start = lexer.parse();
    const count = lexer.parse();
    if (start?.kind !== 'number' || count?.kind !== 'number') return null;

    for (let i = 0; i < count.value; i++) {
      lexer.skip();
      const off = lexer.parse();
      const gen = lexer.parse();
      lexer.skip();
      const free = lexer.takeKeyword('f');
      if (!free) lexer.takeKeyword('n');
      if (off?.kind !== 'number' || gen?.kind !== 'number') return null;

      const num = start.value + i;
      if (!free && !xref.has(num)) xref.set(num, { offset: off.value, type: 1 });
    }
  }

  lexer.skip();
  if (!lexer.takeKeyword('trailer')) return null;
  const trailer = lexer.parse();
  return dictOf(trailer ?? undefined) ?? null;
}

async function parseXrefStream(
  bytes: Uint8Array,
  offset: number,
  xref: Map<number, XrefEntry>,
): Promise<Map<string, PdfValue> | null> {
  const lexer = new PdfLexer(bytes, offset);
  lexer.skip();
  // `N G obj`
  const num = lexer.parse();
  const gen = lexer.parse();
  if (num?.kind !== 'number' || gen?.kind !== 'number') return null;
  lexer.skip();
  if (!lexer.takeKeyword('obj')) return null;

  const value = lexer.parse();
  if (!value || value.kind !== 'stream') return null;
  if (nameOf(value.dict.get('Type')) !== 'XRef') return null;

  const data = await decodeStream(bytes, value);
  if (!data) return null;

  const wValue = value.dict.get('W');
  if (wValue?.kind !== 'array') return null;
  const w = wValue.items.map((i) => numberOf(i) ?? 0);
  const rowLen = w.reduce((a, b) => a + b, 0);
  if (rowLen <= 0) return null;

  const size = numberOf(value.dict.get('Size')) ?? 0;
  const indexValue = value.dict.get('Index');
  const index: number[] =
    indexValue?.kind === 'array'
      ? indexValue.items.map((i) => numberOf(i) ?? 0)
      : [0, size];

  let p = 0;
  for (let pair = 0; pair + 1 < index.length; pair += 2) {
    const first = index[pair]!;
    const count = index[pair + 1]!;
    for (let i = 0; i < count && p + rowLen <= data.length; i++) {
      const fields: number[] = [];
      for (const width of w) {
        let v = 0;
        for (let k = 0; k < width; k++) v = v * 256 + data[p++]!;
        fields.push(width === 0 ? 1 : v);
      }
      const objNum = first + i;
      const type = fields[0]!;
      if (!xref.has(objNum)) {
        if (type === 1) xref.set(objNum, { offset: fields[1]!, type: 1 });
        else if (type === 2) {
          xref.set(objNum, {
            offset: -1,
            type: 2,
            streamNum: fields[1],
            streamIndex: fields[2],
          });
        }
      }
    }
  }

  return value.dict;
}

export async function readPdf(bytes: Uint8Array): Promise<PdfDocument> {
  const warnings: string[] = [];
  const xref = new Map<number, XrefEntry>();
  const revisions: Revision[] = [];
  let degraded = false;

  const startxrefAt = lastIndexOfAscii(bytes, 'startxref');
  let offset = -1;
  if (startxrefAt >= 0) {
    const lexer = new PdfLexer(bytes, startxrefAt + 'startxref'.length);
    const v = lexer.parse();
    if (v?.kind === 'number') offset = v.value;
  }

  const seen = new Set<number>();
  while (offset >= 0 && offset < bytes.length && !seen.has(offset)) {
    seen.add(offset);

    // Each revision parses into its own map so the views can be composed below.
    const own = new Map<number, XrefEntry>();
    let trailer = parseClassicXref(bytes, offset, own);
    if (!trailer) trailer = await parseXrefStream(bytes, offset, own);
    if (!trailer) {
      warnings.push('Part of this file’s cross-reference table could not be read.');
      degraded = true;
      break;
    }

    // /XRefStm marks a hybrid file: a classic table with a stream alongside.
    const hybrid = numberOf(trailer.get('XRefStm'));
    if (hybrid !== undefined && !seen.has(hybrid)) {
      seen.add(hybrid);
      await parseXrefStream(bytes, hybrid, own);
    }

    revisions.push({ xrefOffset: offset, trailer, own, view: new Map() });

    const prev = numberOf(trailer.get('Prev'));
    offset = prev !== undefined ? prev : -1;
  }

  /*
   * `revisions` is newest-first. Compose each revision's view by walking from
   * the oldest forwards, so a newer entry overrides an older one only for the
   * revisions that could actually see it.
   */
  const accumulated = new Map<number, XrefEntry>();
  for (let i = revisions.length - 1; i >= 0; i--) {
    for (const [num, entry] of revisions[i]!.own) accumulated.set(num, entry);
    revisions[i]!.view = new Map(accumulated);
  }
  for (const [num, entry] of revisions[0]?.view ?? []) xref.set(num, entry);

  if (revisions.length === 0) {
    warnings.push('This file’s cross-reference table could not be located.');
    degraded = true;
  }

  const encrypted = revisions.some((r) => r.trailer.has('Encrypt'));
  const linearized = lastIndexOfAscii(bytes.subarray(0, Math.min(2048, bytes.length)), 'Linearized') >= 0;

  return { bytes, revisions, xref, encrypted, linearized, warnings, degraded };
}

/**
 * Resolve an object by number, following object streams when needed.
 *
 * `revision` selects whose view to resolve through: 0 is the current document,
 * higher numbers are older revisions. Reading an old revision's metadata
 * through the current view would return the newest object and report the file
 * as clean when it is not.
 */
export async function getObject(
  doc: PdfDocument,
  num: number,
  revision = 0,
): Promise<PdfValue | null> {
  const view = doc.revisions[revision]?.view ?? doc.xref;
  const entry = view.get(num);
  if (!entry) return null;

  if (entry.type === 1) {
    const lexer = new PdfLexer(doc.bytes, entry.offset);
    lexer.skip();
    const objNum = lexer.parse();
    const gen = lexer.parse();
    if (objNum?.kind !== 'number' || gen?.kind !== 'number') return null;
    lexer.skip();
    if (!lexer.takeKeyword('obj')) return null;
    return lexer.parse();
  }

  if (entry.type === 2 && entry.streamNum !== undefined) {
    const container = await getObject(doc, entry.streamNum, revision);
    if (!container || container.kind !== 'stream') return null;
    const data = await decodeStream(doc.bytes, container);
    if (!data) return null;

    const n = numberOf(container.dict.get('N')) ?? 0;
    const first = numberOf(container.dict.get('First')) ?? 0;

    const header = new PdfLexer(data, 0);
    for (let i = 0; i < n; i++) {
      const objNum = header.parse();
      const objOff = header.parse();
      if (objNum?.kind !== 'number' || objOff?.kind !== 'number') return null;
      if (objNum.value === num) {
        return new PdfLexer(data, first + objOff.value).parse();
      }
    }
    return null;
  }

  return null;
}

export async function resolve(
  doc: PdfDocument,
  v: PdfValue | undefined,
  revision = 0,
): Promise<PdfValue | null> {
  if (!v) return null;
  if (v.kind !== 'ref') return v;
  return getObject(doc, v.num, revision);
}

/**
 * PDF metadata collection.
 *
 * Reads the /Info dictionary and XMP packet of **every revision**, not only the
 * newest. See the note in `../pdf/document.ts`: a PDF saved again keeps its
 * previous revisions in the file, so a tool that clears the current /Info leaves
 * the old one sitting there, readable. Reporting only the newest would mean
 * telling a user their file is clean while their name is still in it.
 */

import { decodeStream, readPdf, resolve, type PdfDocument } from '../pdf/document';
import { dictOf, indexOfAsciiIn, nameOf, textOf, type PdfValue } from '../pdf/lexer';

export interface PdfInfoFields {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modDate?: string;
  /** Any non-standard keys the producer added. */
  customKeys: string[];
}

export interface PdfMetadata {
  /** Newest first, one per revision that carries an /Info dictionary. */
  infos: PdfInfoFields[];
  /** Merged view of the newest revision, for the headline report. */
  current?: PdfInfoFields;
  /** True when an older revision carries metadata the newest one does not. */
  staleMetadata: boolean;
  revisionCount: number;
  xmpPackets: string[];
  hasJavaScript: boolean;
  hasEmbeddedFiles: boolean;
  hasC2pa: boolean;
  encrypted: boolean;
  linearized: boolean;
  degraded: boolean;
  warnings: string[];
}

const INFO_KEYS: Readonly<Record<string, keyof PdfInfoFields>> = {
  Title: 'title',
  Author: 'author',
  Subject: 'subject',
  Keywords: 'keywords',
  Creator: 'creator',
  Producer: 'producer',
  CreationDate: 'creationDate',
  ModDate: 'modDate',
};

function readInfo(map: Map<string, PdfValue>): PdfInfoFields {
  const out: PdfInfoFields = { customKeys: [] };
  for (const [key, value] of map) {
    const field = INFO_KEYS[key];
    if (field && field !== 'customKeys') {
      const text = textOf(value)?.trim();
      if (text) out[field] = text;
    } else if (!field && key !== 'Trapped') {
      out.customKeys.push(key);
    }
  }
  return out;
}

function hasContent(info: PdfInfoFields): boolean {
  return Boolean(
    info.title ||
      info.author ||
      info.subject ||
      info.keywords ||
      info.creator ||
      info.producer ||
      info.creationDate ||
      info.modDate ||
      info.customKeys.length > 0,
  );
}

/**
 * Find XMP packets by scanning the raw bytes.
 *
 * Deliberately not done through the object graph: an XMP packet in a *prior*
 * revision may be unreachable from the current xref, and that is exactly the
 * copy we most want to report.
 */
function findXmpPackets(bytes: Uint8Array): string[] {
  const out: string[] = [];
  let from = 0;
  for (let guard = 0; guard < 32; guard++) {
    const start = indexOfAsciiIn(bytes, '<x:xmpmeta', from);
    if (start < 0) break;
    const end = indexOfAsciiIn(bytes, '</x:xmpmeta>', start);
    if (end < 0) break;
    const stop = end + '</x:xmpmeta>'.length;
    out.push(new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(start, stop)));
    from = stop;
  }
  return out;
}

async function walkForFeatures(doc: PdfDocument): Promise<{
  js: boolean;
  embedded: boolean;
  c2pa: boolean;
}> {
  let js = false;
  let embedded = false;
  let c2pa = false;

  for (const [index, revision] of doc.revisions.entries()) {
    const root = dictOf((await resolve(doc, revision.trailer.get('Root'), index)) ?? undefined);
    if (!root) continue;

    if (root.has('OpenAction')) {
      const action = dictOf((await resolve(doc, root.get('OpenAction'), index)) ?? undefined);
      if (action && (nameOf(action.get('S')) === 'JavaScript' || action.has('JS'))) js = true;
    }

    const names = dictOf((await resolve(doc, root.get('Names'), index)) ?? undefined);
    if (names?.has('JavaScript')) js = true;
    if (names?.has('EmbeddedFiles')) embedded = true;

    if (root.has('AcroForm')) {
      const form = dictOf((await resolve(doc, root.get('AcroForm'), index)) ?? undefined);
      if (form?.has('XFA')) js = true;
    }
  }

  // C2PA in a PDF lives in a /Metadata-adjacent JUMBF payload; the marker is
  // reliable enough for a presence report.
  if (indexOfAsciiIn(doc.bytes, 'c2pa', 0) >= 0 || indexOfAsciiIn(doc.bytes, 'jumb', 0) >= 0) {
    c2pa = true;
  }

  return { js, embedded, c2pa };
}

export async function collectPdfMetadata(bytes: Uint8Array): Promise<PdfMetadata> {
  const doc = await readPdf(bytes);
  const warnings = [...doc.warnings];

  // Revision 0 is the newest. Tracking the index is what lets us tell "your
  // name is in the current metadata" apart from the more alarming "your name is
  // only in an old revision you thought you had removed".
  const found: { revision: number; fields: PdfInfoFields }[] = [];
  for (let i = 0; i < doc.revisions.length; i++) {
    const info = dictOf(
      (await resolve(doc, doc.revisions[i]!.trailer.get('Info'), i)) ?? undefined,
    );
    if (!info) continue;
    const fields = readInfo(info);
    if (hasContent(fields)) found.push({ revision: i, fields });
  }

  const infos = found.map((f) => f.fields);
  const current = found.find((f) => f.revision === 0)?.fields;
  /** Metadata survives in a revision that is not the current one. */
  const staleMetadata = found.some((f) => f.revision > 0);

  const xmpPackets = findXmpPackets(bytes);
  const features = doc.encrypted
    ? { js: false, embedded: false, c2pa: false }
    : await walkForFeatures(doc);

  if (doc.encrypted) {
    warnings.push(
      'This PDF is encrypted. We can report its structure but cannot read its metadata, and we will not attempt to modify it.',
    );
  }
  if (doc.revisions.length > 1) {
    warnings.push(
      `This PDF contains ${doc.revisions.length - 1} earlier revision${doc.revisions.length === 2 ? '' : 's'}. Everything in them is still in the file and still readable.`,
    );
  }

  return {
    infos,
    current,
    staleMetadata,
    revisionCount: doc.revisions.length,
    xmpPackets,
    hasJavaScript: features.js,
    hasEmbeddedFiles: features.embedded,
    hasC2pa: features.c2pa,
    encrypted: doc.encrypted,
    linearized: doc.linearized,
    degraded: doc.degraded,
    warnings,
  };
}

/** Decoded object-stream helper re-exported for tests. */
export { decodeStream };

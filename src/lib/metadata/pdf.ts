/**
 * PDF metadata collection.
 *
 * Reads the /Info dictionary and XMP packet of **every revision**, not only the
 * newest. See the note in `../pdf/document.ts`: a PDF saved again keeps its
 * previous revisions in the file, so a tool that clears the current /Info leaves
 * the old one sitting there, readable. Reporting only the newest would mean
 * telling a user their file is clean while their name is still in it.
 */

import { ascii, u32be } from '../bytes';
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

/**
 * Structural search for a JUMBF superbox.
 *
 * A bare search for the ASCII `jumb` is not a detection. It is four bytes: a
 * compressed stream of any size hits it by chance, and the literal string
 * appears in every PDF that merely *discusses* C2PA — a page of our own
 * documentation, exported to PDF, would report itself as carrying Content
 * Credentials.
 *
 * So require the ISO-BMFF box shape instead. A JUMBF superbox is a 4-byte
 * big-endian length, the type `jumb`, and then, as its first child, a
 * description box typed `jumd`. Three independent constraints — a plausible
 * length that fits inside the file, and two type strings at fixed offsets from
 * each other — is a signature rather than a coincidence.
 */
function findJumbfSuperbox(bytes: Uint8Array): boolean {
  let from = 0;
  for (let guard = 0; guard < 4096; guard++) {
    const at = indexOfAsciiIn(bytes, 'jumb', from);
    if (at < 0) return false;
    from = at + 4;

    // The length field sits immediately before the type.
    if (at < 4) continue;
    const start = at - 4;
    const length = u32be(bytes, start);
    // A superbox holds at least its own header plus a description box header.
    if (length < 16 || start + length > bytes.length) continue;
    // First child must be the description box.
    if (at + 12 > bytes.length) continue;
    if (ascii(bytes, at + 8, 4) !== 'jumd') continue;

    return true;
  }
  return false;
}

/**
 * The C2PA spec attaches a PDF manifest as an associated file whose
 * /AFRelationship is /C2PA_Manifest. That is a declaration in the object graph,
 * so unlike a byte search it cannot be triggered by page content.
 */
async function hasC2paAssociatedFile(
  doc: PdfDocument,
  root: Map<string, PdfValue>,
  revision: number,
): Promise<boolean> {
  const af = await resolve(doc, root.get('AF'), revision);
  if (!af) return false;

  const specs = af.kind === 'array' ? af.items : [af];
  for (const spec of specs.slice(0, 64)) {
    const dict = dictOf((await resolve(doc, spec, revision)) ?? undefined);
    if (nameOf(dict?.get('AFRelationship')) === 'C2PA_Manifest') return true;
  }
  return false;
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

    if (!c2pa && (await hasC2paAssociatedFile(doc, root, index))) c2pa = true;
  }

  // Fall back to the container shape for producers that embed the manifest
  // without declaring the association.
  if (!c2pa && findJumbfSuperbox(doc.bytes)) c2pa = true;

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

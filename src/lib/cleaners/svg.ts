/**
 * SVG cleaner.
 *
 * Works by deleting byte ranges from the original text and copying everything
 * else through unchanged. There is no parse-and-reserialise step, so attribute
 * order, whitespace, indentation and line endings all survive — a cleaned file
 * diffs against its original as exactly the removals we reported and nothing
 * more.
 *
 * Embedded raster images are cleaned by handing their decoded bytes to the
 * existing JPEG/PNG/WebP cleaners. Those copy the compressed image data
 * byte-for-byte, so the no-recompression rule holds through the nesting.
 */

import { detectType } from '../filetype';
import { bytesToBase64, readSvg, type Region } from '../metadata/svg';
import { cleanJpegBytes } from './jpeg';
import { cleanPngBytes } from './png';
import { cleanWebpBytes } from './webp';
import type { CleanContext, RawCleanOutcome } from './types';

/** A range to delete, or to replace with new text. */
interface Edit extends Region {
  replacement?: string;
}

function applyEdits(text: string, edits: Edit[]): string {
  if (edits.length === 0) return text;

  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: string[] = [];
  let cursor = 0;

  for (const edit of sorted) {
    // Overlapping ranges would corrupt the output; the later one is already
    // covered by the earlier, so skip it.
    if (edit.start < cursor) continue;
    out.push(text.slice(cursor, edit.start));
    if (edit.replacement !== undefined) out.push(edit.replacement);
    cursor = edit.end;
  }
  out.push(text.slice(cursor));
  return out.join('');
}

function cleanEmbedded(bytes: Uint8Array, ctx: CleanContext): Uint8Array | null {
  const type = detectType(bytes);
  switch (type) {
    case 'jpeg': {
      const r = cleanJpegBytes(bytes, ctx.preserveOrientation);
      return r.ok ? r.bytes : null;
    }
    case 'png': {
      const r = cleanPngBytes(bytes, ctx.preserveOrientation);
      return r.ok ? r.bytes : null;
    }
    case 'webp': {
      const r = cleanWebpBytes(bytes, ctx.preserveOrientation);
      return r.ok ? r.bytes : null;
    }
    default:
      return null;
  }
}

export function cleanSvgBytes(bytes: Uint8Array, ctx: CleanContext): RawCleanOutcome {
  const read = readSvg(bytes);
  if ('error' in read) return { ok: false, warnings: [read.error] };

  const { text, meta } = read;
  const warnings = [...meta.warnings];
  const edits: Edit[] = [];

  for (const r of meta.metadataElements) edits.push(r);
  for (const r of meta.titleElements) edits.push(r);
  for (const r of meta.descElements) edits.push(r);
  for (const r of meta.scriptElements) edits.push(r);
  for (const c of meta.comments) edits.push({ start: c.start, end: c.end });
  for (const a of meta.editorAttrs) edits.push({ start: a.start, end: a.end });
  for (const a of meta.editorNamespaces) edits.push({ start: a.start, end: a.end });
  for (const a of meta.eventAttrs) edits.push({ start: a.start, end: a.end });

  for (const a of meta.remoteRefs) {
    edits.push({ start: a.start, end: a.end });
  }
  if (meta.remoteRefs.length > 0) {
    warnings.push(
      `Removed ${meta.remoteRefs.length} reference${meta.remoteRefs.length === 1 ? '' : 's'} to content on another server. That content was never inside this file, and fetching it would have revealed the viewer's IP address.`,
    );
  }
  if (meta.scriptElements.length > 0 || meta.eventAttrs.length > 0) {
    warnings.push('Removed script that would have run when this file was opened.');
  }

  // Embedded rasters: clean the payload, keep the data URI wrapper intact.
  let cleanedEmbedded = 0;
  let failedEmbedded = 0;
  for (const image of meta.embeddedImages) {
    const cleaned = cleanEmbedded(image.bytes, ctx);
    if (!cleaned) {
      failedEmbedded++;
      continue;
    }
    edits.push({ ...image.payload, replacement: bytesToBase64(cleaned) });
    cleanedEmbedded++;
  }
  if (cleanedEmbedded > 0) {
    warnings.push(
      `Cleaned ${cleanedEmbedded} image${cleanedEmbedded === 1 ? '' : 's'} embedded inside this SVG.`,
    );
  }
  if (failedEmbedded > 0) {
    warnings.push(
      `${failedEmbedded} embedded image${failedEmbedded === 1 ? '' : 's'} could not be cleaned and ${failedEmbedded === 1 ? 'was' : 'were'} left as ${failedEmbedded === 1 ? 'it was' : 'they were'}.`,
    );
  }

  const output = applyEdits(text, edits);

  return {
    ok: true,
    bytes: new TextEncoder().encode(output),
    warnings,
  };
}

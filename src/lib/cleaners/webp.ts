/**
 * WebP metadata cleaner.
 *
 * Three things must stay consistent or the output is malformed (PRD §18.1):
 *  1. the VP8X flag bits announcing EXIF / XMP presence,
 *  2. the RIFF size field in the header,
 *  3. the pad byte that follows every odd-length chunk.
 */

import { concat, writeU32le } from '../bytes';
import { buildOrientationTiff, orientationNeedsPreserving, parseExif } from '../metadata/exif';
import {
  VP8X_FLAG_EXIF,
  VP8X_FLAG_XMP,
  shouldKeepWebpChunk,
  walkWebp,
} from '../metadata/webp';
import { shouldRemove, type CleanContext, type RawCleanOutcome } from './types';

/** Which signal each strippable WebP chunk belongs to (V2 R5). */
const WEBP_CHUNK_SIGNAL: Readonly<Record<string, string>> = {
  EXIF: 'exif',
  'XMP ': 'xmp',
  C2PA: 'c2pa',
};

function buildWebpChunk(fourcc: string, data: Uint8Array): Uint8Array {
  const padded = data.length % 2 === 1;
  const out = new Uint8Array(8 + data.length + (padded ? 1 : 0));
  for (let i = 0; i < 4; i++) out[i] = fourcc.charCodeAt(i);
  writeU32le(out, 4, data.length);
  out.set(data, 8);
  return out; // trailing pad byte is already zero
}

export function cleanWebpBytes(
  b: Uint8Array,
  preserveOrientation: boolean,
  ctx?: CleanContext,
): RawCleanOutcome {
  const structure = walkWebp(b);
  const warnings = [...structure.warnings];

  if (!structure.valid) {
    return { ok: false, warnings: ['This file is not a valid WebP.'] };
  }
  if (structure.chunks.length === 0) {
    return { ok: false, warnings: ['This WebP contains no readable chunks.'] };
  }

  let orientationPreserved: number | undefined;
  if (preserveOrientation) {
    const exifChunk = structure.chunks.find((c) => c.fourcc === 'EXIF');
    if (exifChunk) {
      let start = exifChunk.dataStart;
      if (b[start] === 0x45 && b[start + 1] === 0x78 && b[start + 2] === 0x69) start += 6; // "Exi"
      const exif = parseExif(b.subarray(start, exifChunk.dataEnd));
      if (exif && orientationNeedsPreserving(exif.orientation)) {
        orientationPreserved = exif.orientation;
      }
    }
  }

  const body: Uint8Array[] = [];

  for (const chunk of structure.chunks) {
    if (!shouldKeepWebpChunk(chunk.fourcc)) {
      // A preset may spare a block it did not name (V2 R5).
      const signal = WEBP_CHUNK_SIGNAL[chunk.fourcc];
      if (!(ctx && signal && !shouldRemove(ctx, signal))) continue;
    }

    if (chunk.fourcc === 'VP8X') {
      // Copy the header, then correct the flag bits to match what survives.
      const vp8x = b.slice(chunk.offset, chunk.paddedEnd);
      const flagsIndex = 8; // fourcc(4) + size(4)
      if (vp8x.length > flagsIndex) {
        let flags = vp8x[flagsIndex]!;
        flags &= ~VP8X_FLAG_XMP;
        if (orientationPreserved === undefined) flags &= ~VP8X_FLAG_EXIF;
        else flags |= VP8X_FLAG_EXIF;
        vp8x[flagsIndex] = flags;
      }
      body.push(vp8x);
      continue;
    }

    body.push(b.subarray(chunk.offset, chunk.paddedEnd));
  }

  // EXIF and XMP belong at the end of the chunk sequence.
  if (orientationPreserved !== undefined) {
    body.push(buildWebpChunk('EXIF', buildOrientationTiff(orientationPreserved)));
    if (structure.vp8xDataStart < 0) {
      // Without a VP8X header there is nowhere to declare the EXIF chunk, and
      // a simple-format WebP with a trailing EXIF chunk is not well-formed.
      body.pop();
      orientationPreserved = undefined;
      warnings.push(
        'This WebP has no extended header, so the rotation tag could not be preserved. The image may appear rotated.',
      );
    }
  }

  let payloadLength = 4; // "WEBP"
  for (const part of body) payloadLength += part.length;

  const header = new Uint8Array(12);
  header.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  writeU32le(header, 4, payloadLength);
  header.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"

  return { ok: true, bytes: concat([header, ...body]), warnings, orientationPreserved };
}

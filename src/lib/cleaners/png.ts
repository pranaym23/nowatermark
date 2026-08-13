/**
 * PNG metadata cleaner.
 *
 * Surviving chunks are copied verbatim, checksum included — IDAT is never
 * touched, so the compressed image data is bit-identical to the original.
 * The only chunk we synthesise is a minimal eXIf carrying Orientation.
 */

import { concat, writeU32be } from '../bytes';
import { crc32 } from '../crc32';
import { buildOrientationTiff, orientationNeedsPreserving, parseExif } from '../metadata/exif';
import { PNG_SIGNATURE, shouldKeepPngChunk, walkPng } from '../metadata/png';
import type { RawCleanOutcome } from './types';

function buildChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  writeU32be(out, 0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  // The CRC covers the type field and the data, but not the length.
  writeU32be(out, 8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function cleanPngBytes(b: Uint8Array, preserveOrientation: boolean): RawCleanOutcome {
  const structure = walkPng(b);
  const warnings = [...structure.warnings];

  if (!structure.valid) {
    return { ok: false, warnings: ['This file is not a valid PNG.'] };
  }
  if (structure.chunks.length === 0) {
    return { ok: false, warnings: ['This PNG contains no readable chunks.'] };
  }

  let orientationPreserved: number | undefined;
  if (preserveOrientation) {
    const exifChunk = structure.chunks.find((c) => c.type === 'eXIf');
    if (exifChunk) {
      const exif = parseExif(b.subarray(exifChunk.dataStart, exifChunk.dataEnd));
      if (exif && orientationNeedsPreserving(exif.orientation)) {
        orientationPreserved = exif.orientation;
      }
    }
  }

  const parts: Uint8Array[] = [new Uint8Array(PNG_SIGNATURE)];
  let sawIhdr = false;
  let sawIend = false;

  for (const chunk of structure.chunks) {
    if (!shouldKeepPngChunk(chunk.type)) continue;
    parts.push(b.subarray(chunk.offset, chunk.totalEnd));

    if (chunk.type === 'IHDR') {
      sawIhdr = true;
      // eXIf must precede IDAT; directly after IHDR is always valid.
      if (orientationPreserved !== undefined) {
        parts.push(buildChunk('eXIf', buildOrientationTiff(orientationPreserved)));
      }
    }
    if (chunk.type === 'IEND') sawIend = true;
  }

  if (!sawIhdr) {
    return { ok: false, warnings: ['This PNG is missing its header chunk.'] };
  }
  if (!sawIend) {
    // A truncated file can lose IEND; re-adding it keeps decoders happy.
    parts.push(buildChunk('IEND', new Uint8Array(0)));
    warnings.push('The PNG was missing its end marker, which has been restored.');
  }

  return { ok: true, bytes: concat(parts), warnings, orientationPreserved };
}

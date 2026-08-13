/**
 * JPEG metadata cleaner — no recompression.
 *
 * Rebuilds the marker-segment prefix from the strip/keep policy and copies the
 * scan data (SOS to end of file) byte-for-byte. Pixel data is never decoded,
 * so quality and file structure are untouched (PRD §18, §44).
 */

import { concat } from '../bytes';
import { buildOrientationTiff, orientationNeedsPreserving, parseExif } from '../metadata/exif';
import { classifyJpegSegment, collectJpegMetadata, walkJpeg } from '../metadata/jpeg';
import type { RawCleanOutcome } from './types';

/** FF E1 <len> "Exif\0\0" <26-byte TIFF> */
function buildOrientationApp1(orientation: number): Uint8Array {
  const tiff = buildOrientationTiff(orientation);
  const payloadLength = 6 + tiff.length; // identifier + TIFF
  const segLength = payloadLength + 2; // length field includes itself
  const out = new Uint8Array(segLength + 2);
  out[0] = 0xff;
  out[1] = 0xe1;
  out[2] = (segLength >> 8) & 0xff;
  out[3] = segLength & 0xff;
  out.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 4); // "Exif\0\0"
  out.set(tiff, 10);
  return out;
}

export function cleanJpegBytes(b: Uint8Array, preserveOrientation: boolean): RawCleanOutcome {
  const structure = walkJpeg(b);
  const warnings = [...structure.warnings];

  if (!structure.valid) {
    return { ok: false, warnings: ['This file is not a valid JPEG.'] };
  }
  if (structure.scanStart < 0) {
    return { ok: false, warnings: ['This JPEG has no image data to preserve.'] };
  }

  let orientationPreserved: number | undefined;
  if (preserveOrientation) {
    const meta = collectJpegMetadata(b, structure);
    if (meta.exifTiff) {
      const exif = parseExif(meta.exifTiff);
      if (exif && orientationNeedsPreserving(exif.orientation)) {
        orientationPreserved = exif.orientation;
      }
    }
  }

  const kept: Uint8Array[] = [];
  let firstIsJfif = false;

  for (const seg of structure.segments) {
    if (seg.offset >= structure.scanStart) break;
    const { kind, keep } = classifyJpegSegment(b, seg);
    if (!keep) continue;
    if (kind === 'jfif' && kept.length === 0) firstIsJfif = true;
    kept.push(b.subarray(seg.offset, seg.dataEnd));
  }

  if (orientationPreserved !== undefined) {
    // EXIF belongs immediately after SOI, or after APP0 when a JFIF header is
    // present — both orderings are accepted in practice.
    kept.splice(firstIsJfif ? 1 : 0, 0, buildOrientationApp1(orientationPreserved));
  }

  const bytes = concat([
    new Uint8Array([0xff, 0xd8]),
    ...kept,
    b.subarray(structure.scanStart, b.length),
  ]);

  return { ok: true, bytes, warnings, orientationPreserved };
}

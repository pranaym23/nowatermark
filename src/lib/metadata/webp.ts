/**
 * WebP RIFF walker.
 *
 * Layout: "RIFF" <u32le size> "WEBP" then a sequence of chunks, each
 * <fourcc><u32le size><data> padded to an even length.
 *
 * Two things make WebP cleaning easy to get wrong (PRD §18.1):
 *  1. The VP8X header carries flag bits announcing that EXIF/XMP chunks exist.
 *     Removing the chunks without clearing the bits produces a file some
 *     decoders reject.
 *  2. The RIFF size field must be recomputed, and the odd-size padding byte
 *     preserved, or the container is malformed.
 */

import { ascii, u24le, u32le } from '../bytes';

export interface WebpChunk {
  fourcc: string;
  /** Offset of the fourcc. */
  offset: number;
  dataStart: number;
  dataEnd: number;
  /** dataEnd plus the pad byte when the payload length is odd. */
  paddedEnd: number;
}

export interface WebpStructure {
  valid: boolean;
  chunks: WebpChunk[];
  width?: number;
  height?: number;
  isAnimated: boolean;
  hasAlpha: boolean;
  /** Offset of the VP8X payload, or -1. */
  vp8xDataStart: number;
  warnings: string[];
}

export const VP8X_FLAG_ICC = 0x20;
export const VP8X_FLAG_ALPHA = 0x10;
export const VP8X_FLAG_EXIF = 0x08;
export const VP8X_FLAG_XMP = 0x04;
export const VP8X_FLAG_ANIMATION = 0x02;

/** Chunks that carry metadata and are always removed. */
export const WEBP_STRIP = new Set(['EXIF', 'XMP ', 'C2PA']);

/** Chunks required to render the image. */
export const WEBP_KEEP = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP']);

export function shouldKeepWebpChunk(fourcc: string): boolean {
  if (WEBP_STRIP.has(fourcc)) return false;
  return WEBP_KEEP.has(fourcc);
}

export function walkWebp(b: Uint8Array): WebpStructure {
  const warnings: string[] = [];
  const chunks: WebpChunk[] = [];
  const out: WebpStructure = {
    valid: false,
    chunks,
    isAnimated: false,
    hasAlpha: false,
    vp8xDataStart: -1,
    warnings,
  };

  if (b.length < 12 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') {
    warnings.push('Not a WebP file.');
    return out;
  }
  out.valid = true;

  const declared = u32le(b, 4) + 8;
  if (declared > b.length) warnings.push('WebP declares a larger size than the file contains.');
  const limit = Math.min(b.length, Math.max(declared, 12));

  let pos = 12;
  while (pos + 8 <= limit) {
    const fourcc = ascii(b, pos, 4);
    const size = u32le(b, pos + 4);
    const dataStart = pos + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > b.length) {
      warnings.push('WebP chunk extends past the end of the file.');
      break;
    }
    const paddedEnd = dataEnd + (size % 2);
    chunks.push({ fourcc, offset: pos, dataStart, dataEnd, paddedEnd });

    switch (fourcc) {
      case 'VP8X': {
        out.vp8xDataStart = dataStart;
        if (size >= 10) {
          const flags = b[dataStart]!;
          out.isAnimated = (flags & VP8X_FLAG_ANIMATION) !== 0;
          out.hasAlpha = (flags & VP8X_FLAG_ALPHA) !== 0;
          out.width = u24le(b, dataStart + 4) + 1;
          out.height = u24le(b, dataStart + 7) + 1;
        }
        break;
      }
      case 'ANIM':
        out.isAnimated = true;
        break;
      case 'ALPH':
        out.hasAlpha = true;
        break;
      case 'VP8 ': {
        // Lossy: 3-byte frame tag, 3-byte sync code, then 14-bit dimensions.
        if (out.width === undefined && size >= 10) {
          const sync = dataStart + 3;
          if (b[sync] === 0x9d && b[sync + 1] === 0x01 && b[sync + 2] === 0x2a) {
            out.width = (b[sync + 3]! | (b[sync + 4]! << 8)) & 0x3fff;
            out.height = (b[sync + 5]! | (b[sync + 6]! << 8)) & 0x3fff;
          }
        }
        break;
      }
      case 'VP8L': {
        // Lossless: 0x2f signature then 14-bit width-1 and height-1.
        if (out.width === undefined && size >= 5 && b[dataStart] === 0x2f) {
          const bits = u32le(b, dataStart + 1);
          out.width = (bits & 0x3fff) + 1;
          out.height = ((bits >>> 14) & 0x3fff) + 1;
          out.hasAlpha ||= ((bits >>> 28) & 1) === 1;
        }
        break;
      }
    }

    pos = paddedEnd;
  }

  // Without an image chunk there is nothing to preserve — treat as corrupt
  // rather than reporting partial results (PRD §18.3).
  if (!chunks.some((c) => c.fourcc === 'VP8 ' || c.fourcc === 'VP8L')) {
    warnings.push('WebP contains no image data.');
    out.valid = false;
  }
  return out;
}

export interface WebpMetadata {
  /** TIFF block from the EXIF chunk. */
  exifTiff?: Uint8Array;
  xmp?: string;
  jumbf?: Uint8Array;
  hasIcc: boolean;
  unknownChunks: string[];
}

export function collectWebpMetadata(b: Uint8Array, structure: WebpStructure): WebpMetadata {
  const meta: WebpMetadata = { hasIcc: false, unknownChunks: [] };
  for (const chunk of structure.chunks) {
    switch (chunk.fourcc) {
      case 'EXIF': {
        let start = chunk.dataStart;
        // Some encoders include the JPEG-style "Exif\0\0" prefix here.
        if (ascii(b, start, 4) === 'Exif') start += 6;
        meta.exifTiff = b.subarray(start, chunk.dataEnd);
        break;
      }
      case 'XMP ':
        meta.xmp = new TextDecoder('utf-8', { fatal: false }).decode(
          b.subarray(chunk.dataStart, chunk.dataEnd),
        );
        break;
      case 'C2PA':
        meta.jumbf = b.subarray(chunk.dataStart, chunk.dataEnd);
        break;
      case 'ICCP':
        meta.hasIcc = true;
        break;
      default:
        if (!WEBP_KEEP.has(chunk.fourcc) && !WEBP_STRIP.has(chunk.fourcc)) {
          meta.unknownChunks.push(chunk.fourcc);
        }
    }
  }
  return meta;
}

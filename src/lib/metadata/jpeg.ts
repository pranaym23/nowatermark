/**
 * JPEG segment walker.
 *
 * A JPEG is SOI, then a sequence of marker segments, then SOS followed by
 * entropy-coded scan data running to EOI. Metadata lives exclusively in the
 * marker segments before SOS, so the cleaner rewrites that prefix and copies
 * everything from SOS onward byte-for-byte. That is what makes progressive
 * JPEGs safe and guarantees no recompression (PRD §18.1, §44).
 */

import { ascii, indexOfAscii, startsWith, u16be, u32be } from '../bytes';
import { EXIF_IDENTIFIER } from './exif';
import { XMP_EXTENSION_ID, XMP_NAMESPACE_ID } from './xmp';

export const SOI = 0xd8;
export const EOI = 0xd9;
export const SOS = 0xda;

export interface JpegSegment {
  /** Second byte of the marker, e.g. 0xE1 for APP1. */
  marker: number;
  /** Offset of the leading 0xFF. */
  offset: number;
  /** Start of the payload (past the 2-byte length field). */
  dataStart: number;
  /** End of the payload, exclusive. */
  dataEnd: number;
}

export interface JpegStructure {
  valid: boolean;
  segments: JpegSegment[];
  /**
   * Offset of the SOS marker. Everything from here to the end of the file is
   * copied verbatim by the cleaner. -1 when the file has no scan.
   */
  scanStart: number;
  width?: number;
  height?: number;
  warnings: string[];
}

function isSof(marker: number): boolean {
  // SOF0..SOF15 excluding DHT (C4), JPG (C8) and DAC (CC).
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/** Markers that carry no length field. */
function isStandalone(marker: number): boolean {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9);
}

export function walkJpeg(b: Uint8Array): JpegStructure {
  const warnings: string[] = [];
  const segments: JpegSegment[] = [];
  const out: JpegStructure = { valid: false, segments, scanStart: -1, warnings };

  if (b.length < 4 || b[0] !== 0xff || b[1] !== SOI) {
    warnings.push('Not a JPEG file.');
    return out;
  }
  out.valid = true;

  let pos = 2;
  while (pos + 1 < b.length) {
    // Markers may be preceded by any number of 0xFF fill bytes.
    if (b[pos] !== 0xff) {
      warnings.push('Unexpected byte where a JPEG marker was expected.');
      break;
    }
    let markerPos = pos;
    while (markerPos + 1 < b.length && b[markerPos + 1] === 0xff) markerPos++;
    const marker = b[markerPos + 1]!;

    if (marker === EOI) break;

    if (isStandalone(marker)) {
      pos = markerPos + 2;
      continue;
    }

    if (markerPos + 4 > b.length) {
      warnings.push('JPEG ended inside a marker segment.');
      break;
    }
    const length = u16be(b, markerPos + 2);
    if (length < 2) {
      warnings.push('JPEG segment declared an invalid length.');
      break;
    }
    const dataStart = markerPos + 4;
    const dataEnd = markerPos + 2 + length;
    if (dataEnd > b.length) {
      warnings.push('JPEG segment extends past the end of the file.');
      break;
    }

    segments.push({ marker, offset: markerPos, dataStart, dataEnd });

    if (isSof(marker) && dataEnd - dataStart >= 5) {
      out.height = u16be(b, dataStart + 1);
      out.width = u16be(b, dataStart + 3);
    }

    if (marker === SOS) {
      out.scanStart = markerPos;
      break;
    }
    pos = dataEnd;
  }

  if (out.scanStart < 0) warnings.push('JPEG contained no scan data.');
  return out;
}

export type JpegSegmentKind =
  | 'jfif'
  | 'exif'
  | 'xmp'
  | 'xmp-extension'
  | 'icc'
  | 'iptc'
  | 'jumbf'
  | 'adobe'
  | 'comment'
  | 'app-unknown'
  | 'structural';

export interface JpegClassification {
  kind: JpegSegmentKind;
  /** Whether Standard Clean preserves this segment. */
  keep: boolean;
}

/**
 * Strip/keep decision for one segment (PRD §18.1).
 *
 * APP0 JFIF, APP2 ICC and APP14 Adobe are kept: removing the colour profile
 * shifts colours, and removing the Adobe marker breaks colour interpretation
 * on Adobe-encoded (notably CMYK) JPEGs.
 */
export function classifyJpegSegment(b: Uint8Array, seg: JpegSegment): JpegClassification {
  const { marker, dataStart } = seg;

  if (marker === 0xe0) return { kind: 'jfif', keep: true };

  if (marker === 0xe1) {
    if (startsWith(b, dataStart, 'Exif')) return { kind: 'exif', keep: false };
    if (startsWith(b, dataStart, XMP_EXTENSION_ID.slice(0, -1))) {
      return { kind: 'xmp-extension', keep: false };
    }
    if (startsWith(b, dataStart, XMP_NAMESPACE_ID.slice(0, -1))) return { kind: 'xmp', keep: false };
    return { kind: 'app-unknown', keep: false };
  }

  if (marker === 0xe2) {
    if (startsWith(b, dataStart, 'ICC_PROFILE')) return { kind: 'icc', keep: true };
    return { kind: 'app-unknown', keep: false };
  }

  if (marker === 0xeb) return { kind: 'jumbf', keep: false };
  if (marker === 0xed) return { kind: 'iptc', keep: false };

  if (marker === 0xee) {
    if (startsWith(b, dataStart, 'Adobe')) return { kind: 'adobe', keep: true };
    return { kind: 'app-unknown', keep: false };
  }

  if (marker === 0xfe) return { kind: 'comment', keep: false };

  // Any remaining APPn is metadata of some kind: strip by default.
  if (marker >= 0xe0 && marker <= 0xef) return { kind: 'app-unknown', keep: false };

  return { kind: 'structural', keep: true };
}

export interface JpegMetadata {
  /** TIFF block from the APP1 EXIF segment, identifier already stripped. */
  exifTiff?: Uint8Array;
  /** Concatenated XMP packet, including any Extended XMP chunks. */
  xmp?: string;
  hasExtendedXmp: boolean;
  /** Raw Photoshop IRB payload from APP13. */
  iptc?: Uint8Array;
  /** Concatenated JUMBF payload from APP11 segments. */
  jumbf?: Uint8Array;
  hasIcc: boolean;
  hasAdobe: boolean;
  comments: string[];
  /** Count of APPn segments we did not recognise. */
  unknownAppSegments: number;
}

/**
 * Extended XMP is split across multiple APP1 segments. Each carries the
 * namespace, a 32-byte GUID, a 4-byte total length and a 4-byte offset.
 */
function reassembleExtendedXmp(chunks: { offset: number; data: Uint8Array }[]): string {
  if (chunks.length === 0) return '';
  chunks.sort((a, z) => a.offset - z.offset);
  const total = chunks.reduce((max, c) => Math.max(max, c.offset + c.data.length), 0);
  const buf = new Uint8Array(total);
  for (const c of chunks) {
    if (c.offset + c.data.length <= total) buf.set(c.data, c.offset);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(buf);
}

export function collectJpegMetadata(b: Uint8Array, structure: JpegStructure): JpegMetadata {
  const meta: JpegMetadata = {
    hasExtendedXmp: false,
    hasIcc: false,
    hasAdobe: false,
    comments: [],
    unknownAppSegments: 0,
  };
  const jumbfParts: Uint8Array[] = [];
  const extendedChunks: { offset: number; data: Uint8Array }[] = [];
  let mainXmp = '';

  for (const seg of structure.segments) {
    const { kind } = classifyJpegSegment(b, seg);
    const payload = b.subarray(seg.dataStart, seg.dataEnd);

    switch (kind) {
      case 'exif': {
        // "Exif\0\0" then the TIFF block.
        const tiffStart = seg.dataStart + EXIF_IDENTIFIER.length;
        if (tiffStart < seg.dataEnd) meta.exifTiff = b.subarray(tiffStart, seg.dataEnd);
        break;
      }
      case 'xmp': {
        const start = seg.dataStart + XMP_NAMESPACE_ID.length;
        if (start < seg.dataEnd) {
          mainXmp += new TextDecoder('utf-8', { fatal: false }).decode(b.subarray(start, seg.dataEnd));
        }
        break;
      }
      case 'xmp-extension': {
        meta.hasExtendedXmp = true;
        // namespace + GUID(32) + fullLength(4) + offset(4)
        const head = seg.dataStart + XMP_EXTENSION_ID.length + 32;
        if (head + 8 <= seg.dataEnd) {
          const offset = u32be(b, head + 4);
          extendedChunks.push({ offset, data: b.subarray(head + 8, seg.dataEnd) });
        }
        break;
      }
      case 'iptc':
        meta.iptc = payload;
        break;
      case 'jumbf': {
        // APP11: 2-byte common identifier "JP", box instance, packet sequence,
        // then the JUMBF box data.
        const skip = ascii(b, seg.dataStart, 2) === 'JP' ? 10 : 0;
        const start = Math.min(seg.dataStart + skip, seg.dataEnd);
        jumbfParts.push(b.subarray(start, seg.dataEnd));
        break;
      }
      case 'icc':
        meta.hasIcc = true;
        break;
      case 'adobe':
        meta.hasAdobe = true;
        break;
      case 'comment':
        meta.comments.push(new TextDecoder('utf-8', { fatal: false }).decode(payload));
        break;
      case 'app-unknown':
        meta.unknownAppSegments++;
        break;
    }
  }

  const extended = reassembleExtendedXmp(extendedChunks);
  const combined = mainXmp + extended;
  if (combined.trim().length > 0) meta.xmp = combined;

  if (jumbfParts.length > 0) {
    let total = 0;
    for (const p of jumbfParts) total += p.length;
    const merged = new Uint8Array(total);
    let o = 0;
    for (const p of jumbfParts) {
      merged.set(p, o);
      o += p.length;
    }
    meta.jumbf = merged;
  }

  return meta;
}

/** Some encoders append an XMP packet after EOI; report it so we can warn. */
export function hasTrailingXmp(b: Uint8Array, scanStart: number): boolean {
  if (scanStart < 0) return false;
  return indexOfAscii(b, '<x:xmpmeta', scanStart) >= 0;
}

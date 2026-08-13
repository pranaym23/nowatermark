/**
 * PNG chunk walker.
 *
 * A PNG is an 8-byte signature followed by length/type/data/CRC chunks.
 * Surviving chunks are copied verbatim including their CRC, so the cleaner
 * never needs to recompute a checksum except for chunks it synthesises.
 *
 * Strip/keep policy (PRD §18.1): the explicit strip list below, plus any
 * unrecognised *ancillary* chunk — ancillary chunks are optional by
 * definition, so dropping them cannot break decoding. Critical chunks
 * (uppercase first letter) and the explicit keep list are always preserved,
 * which is what protects colour profiles (iCCP) and APNG animation.
 */

import { ascii, u32be } from '../bytes';

export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export interface PngChunk {
  type: string;
  /** Offset of the 4-byte length field. */
  offset: number;
  dataStart: number;
  dataEnd: number;
  /** End of the chunk including its 4-byte CRC. */
  totalEnd: number;
}

export interface PngStructure {
  valid: boolean;
  chunks: PngChunk[];
  width?: number;
  height?: number;
  isAnimated: boolean;
  warnings: string[];
}

/** Chunks that carry metadata and are always removed. */
export const PNG_STRIP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME', 'caBX', 'dSIG']);

/** Ancillary chunks that must survive cleaning. */
export const PNG_KEEP = new Set([
  'tRNS',
  'gAMA',
  'cHRM',
  'sRGB',
  'iCCP',
  'sBIT',
  'pHYs',
  'bKGD',
  'acTL',
  'fcTL',
  'fdAT',
]);

function isCritical(type: string): boolean {
  const c = type.charCodeAt(0);
  return c >= 0x41 && c <= 0x5a; // uppercase
}

export function shouldKeepPngChunk(type: string): boolean {
  if (PNG_STRIP.has(type)) return false;
  if (isCritical(type)) return true;
  if (PNG_KEEP.has(type)) return true;
  return false; // unknown ancillary chunk
}

export function walkPng(b: Uint8Array): PngStructure {
  const warnings: string[] = [];
  const chunks: PngChunk[] = [];
  const out: PngStructure = { valid: false, chunks, isAnimated: false, warnings };

  if (b.length < 8) {
    warnings.push('Not a PNG file.');
    return out;
  }
  for (let i = 0; i < 8; i++) {
    if (b[i] !== PNG_SIGNATURE[i]) {
      warnings.push('Not a PNG file.');
      return out;
    }
  }
  out.valid = true;

  let pos = 8;
  while (pos + 8 <= b.length) {
    const length = u32be(b, pos);
    const type = ascii(b, pos + 4, 4);
    const dataStart = pos + 8;
    const dataEnd = dataStart + length;
    const totalEnd = dataEnd + 4;
    if (length > b.length || dataEnd > b.length) {
      warnings.push('PNG chunk extends past the end of the file.');
      break;
    }
    if (totalEnd > b.length) {
      warnings.push('PNG chunk is missing its checksum.');
      break;
    }

    chunks.push({ type, offset: pos, dataStart, dataEnd, totalEnd });

    if (type === 'IHDR' && length >= 8) {
      out.width = u32be(b, dataStart);
      out.height = u32be(b, dataStart + 4);
    }
    if (type === 'acTL') out.isAnimated = true;
    if (type === 'IEND') break;

    pos = totalEnd;
  }

  // A PNG without a header chunk is unusable: refuse it rather than reporting
  // partial results from a truncated file (PRD §18.3).
  if (!chunks.some((c) => c.type === 'IHDR')) {
    warnings.push('PNG is missing its header chunk.');
    out.valid = false;
  } else if (!chunks.some((c) => c.type === 'IDAT')) {
    warnings.push('PNG contains no image data.');
    out.valid = false;
  }
  return out;
}

/** Inflate a zlib stream. Returns null when the data cannot be decompressed. */
export async function inflate(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

export interface PngTextEntry {
  keyword: string;
  text: string;
  chunkType: 'tEXt' | 'zTXt' | 'iTXt';
  compressed: boolean;
  /** True when the value could not be decompressed. */
  truncated: boolean;
  byteLength: number;
}

const MAX_TEXT_BYTES = 512 * 1024;

async function parseTextChunk(b: Uint8Array, chunk: PngChunk): Promise<PngTextEntry | null> {
  const type = chunk.type as 'tEXt' | 'zTXt' | 'iTXt';
  const data = b.subarray(chunk.dataStart, chunk.dataEnd);
  const nul = data.indexOf(0);
  if (nul < 0) return null;
  const keyword = ascii(data, 0, nul);
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const byteLength = data.length;

  if (type === 'tEXt') {
    const body = data.subarray(nul + 1, Math.min(data.length, nul + 1 + MAX_TEXT_BYTES));
    return { keyword, text: decoder.decode(body), chunkType: type, compressed: false, truncated: false, byteLength };
  }

  if (type === 'zTXt') {
    const body = data.subarray(nul + 2); // skip compression method byte
    const raw = await inflate(body);
    if (!raw) {
      return { keyword, text: '', chunkType: type, compressed: true, truncated: true, byteLength };
    }
    return {
      keyword,
      text: decoder.decode(raw.subarray(0, MAX_TEXT_BYTES)),
      chunkType: type,
      compressed: true,
      truncated: false,
      byteLength,
    };
  }

  // iTXt: keyword \0 compressionFlag compressionMethod language \0 translated \0 text
  let p = nul + 1;
  if (p + 2 > data.length) return null;
  const compressionFlag = data[p]!;
  p += 2;
  const langEnd = data.indexOf(0, p);
  if (langEnd < 0) return null;
  p = langEnd + 1;
  const transEnd = data.indexOf(0, p);
  if (transEnd < 0) return null;
  p = transEnd + 1;
  const body = data.subarray(p);

  if (compressionFlag === 1) {
    const raw = await inflate(body);
    if (!raw) {
      return { keyword, text: '', chunkType: type, compressed: true, truncated: true, byteLength };
    }
    return {
      keyword,
      text: decoder.decode(raw.subarray(0, MAX_TEXT_BYTES)),
      chunkType: type,
      compressed: true,
      truncated: false,
      byteLength,
    };
  }
  return {
    keyword,
    text: decoder.decode(body.subarray(0, MAX_TEXT_BYTES)),
    chunkType: type,
    compressed: false,
    truncated: false,
    byteLength,
  };
}

export interface PngMetadata {
  text: PngTextEntry[];
  /** Raw TIFF block from an eXIf chunk. */
  exifTiff?: Uint8Array;
  /** XMP packet from an iTXt chunk with the XMP keyword. */
  xmp?: string;
  /** JUMBF payload from a caBX chunk. */
  jumbf?: Uint8Array;
  hasIcc: boolean;
  modifiedTime?: string;
  /** Ancillary chunks we do not recognise and will therefore strip. */
  unknownAncillary: string[];
}

export async function collectPngMetadata(b: Uint8Array, structure: PngStructure): Promise<PngMetadata> {
  const meta: PngMetadata = { text: [], hasIcc: false, unknownAncillary: [] };

  for (const chunk of structure.chunks) {
    switch (chunk.type) {
      case 'tEXt':
      case 'zTXt':
      case 'iTXt': {
        const entry = await parseTextChunk(b, chunk);
        if (entry) {
          if (entry.keyword === 'XML:com.adobe.xmp' && entry.text) meta.xmp = entry.text;
          else meta.text.push(entry);
        }
        break;
      }
      case 'eXIf':
        meta.exifTiff = b.subarray(chunk.dataStart, chunk.dataEnd);
        break;
      case 'caBX':
        meta.jumbf = b.subarray(chunk.dataStart, chunk.dataEnd);
        break;
      case 'iCCP':
        meta.hasIcc = true;
        break;
      case 'tIME': {
        if (chunk.dataEnd - chunk.dataStart >= 7) {
          const d = b.subarray(chunk.dataStart, chunk.dataEnd);
          const year = (d[0]! << 8) | d[1]!;
          const pad = (n: number) => String(n).padStart(2, '0');
          meta.modifiedTime = `${year}-${pad(d[2]!)}-${pad(d[3]!)} ${pad(d[4]!)}:${pad(d[5]!)}:${pad(d[6]!)}`;
        }
        break;
      }
      default:
        if (!isCritical(chunk.type) && !PNG_KEEP.has(chunk.type) && !PNG_STRIP.has(chunk.type)) {
          meta.unknownAncillary.push(chunk.type);
        }
    }
  }

  return meta;
}

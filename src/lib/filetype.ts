/**
 * File-type detection by magic bytes.
 *
 * Never trust the file extension or the browser-reported MIME type — both are
 * attacker- and user-controlled, and both are routinely wrong for images saved
 * by AI tools (PRD §61.1).
 */

import { ascii, startsWith, startsWithBytes } from './bytes';
import {
  FORMATS,
  SCANNABLE_FORMATS,
  isScannable,
  type ScannableFormat,
} from './formats';
import type { CleanableFormat } from './types';

export type DetectedType = CleanableFormat | 'gif' | 'avif' | 'heic' | 'tiff' | 'bmp' | 'unknown';

/**
 * Formats the engine will process, derived from the registry rather than
 * hand-listed — see the note in `formats.ts` about half-added formats.
 */
export const SUPPORTED_FORMATS: readonly ScannableFormat[] = SCANNABLE_FORMATS;

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export function detectType(b: Uint8Array): DetectedType {
  if (b.length === 0) return 'unknown';

  /*
   * The 12-byte floor applies only to the binary signatures — the longest of
   * them (RIFF/WEBP) needs 12 bytes to check. It must not gate the text
   * sniffing below: a short Markdown file is still a Markdown file, and
   * returning 'unknown' for one made the clean pipeline fail its own re-scan.
   */
  if (b.length >= 12) {
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
    if (startsWithBytes(b, 0, PNG_SIG)) return 'png';
    if (startsWith(b, 0, 'RIFF') && startsWith(b, 8, 'WEBP')) return 'webp';
    if (startsWith(b, 0, 'GIF87a') || startsWith(b, 0, 'GIF89a')) return 'gif';
    if (startsWith(b, 0, '%PDF-')) return 'pdf';
    if (startsWith(b, 0, 'BM')) return 'bmp';
    if (startsWith(b, 0, 'II\x2a\x00') || startsWith(b, 0, 'MM\x00\x2a')) return 'tiff';

    // ISO-BMFF family: size(4) then 'ftyp' then a brand.
    if (startsWith(b, 4, 'ftyp')) {
      const brand = ascii(b, 8, 4);
      if (brand === 'avif' || brand === 'avis') return 'avif';
      if (brand.startsWith('hei') || brand === 'mif1' || brand === 'msf1') return 'heic';
    }
  }

  // SVG is text. Real files routinely open with an XML declaration, a DOCTYPE
  // or an editor's licence comment before the root element, so sniff a window
  // rather than only the first token.
  const head = ascii(b, 0, Math.min(1024, b.length)).replace(/^\xef\xbb\xbf/, '').trimStart();
  if (head.startsWith('<svg')) return 'svg';
  if (/^<(\?xml|!--|!DOCTYPE)/i.test(head) && /<svg[\s>]/i.test(head)) return 'svg';

  // Plain text carries no magic bytes, so this is decided by content — never by
  // the extension. Anything that decodes as UTF-8 with no NUL or stray control
  // bytes is treated as Markdown; for a .txt or .csv that simply means the
  // frontmatter locator finds nothing, which is the correct answer.
  if (looksLikeText(b)) return 'markdown';

  return 'unknown';
}

function looksLikeText(b: Uint8Array): boolean {
  if (b.length === 0) return false;

  const sample = b.subarray(0, Math.min(4096, b.length));
  for (const byte of sample) {
    // Allow tab, LF, VT, FF, CR; reject NUL and the other C0 controls.
    if (byte === 0x00) return false;
    if (byte < 0x09) return false;
    if (byte > 0x0d && byte < 0x20) return false;
  }

  try {
    // Decode the whole buffer: sampling could split a multi-byte sequence and
    // report a false negative.
    new TextDecoder('utf-8', { fatal: true }).decode(b);
    return true;
  } catch {
    return false;
  }
}

export function isSupported(t: DetectedType): t is ScannableFormat {
  return isScannable(t);
}

/** Canonical MIME type for a registered format, for the download Blob. */
export function mimeFor(format: CleanableFormat): string {
  return FORMATS[format].mime;
}

export function extensionFor(format: CleanableFormat): string {
  return FORMATS[format].extension;
}

/** Friendly name used in error copy, including for formats we cannot process. */
export const TYPE_LABEL: Record<DetectedType, string> = {
  jpeg: FORMATS.jpeg.label,
  png: FORMATS.png.label,
  webp: FORMATS.webp.label,
  svg: FORMATS.svg.label,
  markdown: FORMATS.markdown.label,
  pdf: FORMATS.pdf.label,
  gif: 'GIF',
  avif: 'AVIF',
  heic: 'HEIC',
  tiff: 'TIFF',
  bmp: 'BMP',
  unknown: 'unrecognised file',
};

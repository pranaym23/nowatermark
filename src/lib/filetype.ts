/**
 * File-type detection by magic bytes.
 *
 * Never trust the file extension or the browser-reported MIME type — both are
 * attacker- and user-controlled, and both are routinely wrong for images saved
 * by AI tools (PRD §61.1).
 */

import { ascii, startsWith, startsWithBytes } from './bytes';
import type { ImageFormat } from './types';

export type DetectedType =
  | ImageFormat
  | 'gif'
  | 'avif'
  | 'heic'
  | 'tiff'
  | 'bmp'
  | 'pdf'
  | 'svg'
  | 'unknown';

/** Formats V1 can scan and clean. */
export const SUPPORTED_FORMATS: readonly ImageFormat[] = ['jpeg', 'png', 'webp'];

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export function detectType(b: Uint8Array): DetectedType {
  if (b.length < 12) return 'unknown';

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

  // SVG is text; sniff the first bytes past any BOM/whitespace.
  const head = ascii(b, 0, Math.min(256, b.length)).replace(/^﻿/, '').trimStart();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg';

  return 'unknown';
}

export function isSupported(t: DetectedType): t is ImageFormat {
  return (SUPPORTED_FORMATS as readonly string[]).includes(t);
}

/** Canonical MIME type for a supported format, for the download Blob. */
export function mimeFor(format: ImageFormat): string {
  switch (format) {
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
  }
}

export function extensionFor(format: ImageFormat): string {
  return format === 'jpeg' ? 'jpg' : format;
}

/** Friendly name used in error copy, including for formats we cannot process. */
export const TYPE_LABEL: Record<DetectedType, string> = {
  jpeg: 'JPEG',
  png: 'PNG',
  webp: 'WebP',
  gif: 'GIF',
  avif: 'AVIF',
  heic: 'HEIC',
  tiff: 'TIFF',
  bmp: 'BMP',
  pdf: 'PDF',
  svg: 'SVG',
  unknown: 'unrecognised file',
};

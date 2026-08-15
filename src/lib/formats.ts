/**
 * The format registry — the single place a file format is declared.
 *
 * Adding a format is a registration here plus a scanner (and, when we can
 * clean it, a cleaner). The `support` field is the gate: nothing downstream
 * accepts a format the registry has not opened, so a format cannot be
 * half-added — accepted by the file picker with no engine behind it.
 *
 * The derived types below do the enforcing at compile time:
 *   - flipping `support` to 'scan' widens ScannableFormat, so scan.ts must
 *     register a scanner or fail to build;
 *   - flipping it to 'clean' widens CleanableNowFormat, so clean.ts must
 *     register a cleaner or fail to build.
 */

import type { CleanableFormat } from './types';

export interface FormatSpec {
  label: string;
  /** Canonical MIME type, used for the download Blob and the file picker. */
  mime: string;
  /** Download extension, without the dot. */
  extension: string;
  /** Drives UI copy — "image" is not a safe word for every format. */
  kind: 'image' | 'text' | 'document';
  /**
   * 'none'  — detected and named in errors, but not processed.
   * 'scan'  — we can report what is in it, but not clean it.
   * 'clean' — we can report and remove.
   */
  support: 'none' | 'scan' | 'clean';
}

/**
 * Order matters: it determines the order of ACCEPTED_MIME and therefore what
 * the OS file picker shows first.
 */
export const FORMATS = {
  jpeg: { label: 'JPEG', mime: 'image/jpeg', extension: 'jpg', kind: 'image', support: 'clean' },
  png: { label: 'PNG', mime: 'image/png', extension: 'png', kind: 'image', support: 'clean' },
  webp: { label: 'WebP', mime: 'image/webp', extension: 'webp', kind: 'image', support: 'clean' },
  svg: { label: 'SVG', mime: 'image/svg+xml', extension: 'svg', kind: 'text', support: 'clean' },
  markdown: { label: 'Markdown', mime: 'text/markdown', extension: 'md', kind: 'text', support: 'clean' },
  pdf: { label: 'PDF', mime: 'application/pdf', extension: 'pdf', kind: 'document', support: 'clean' },
} as const satisfies Record<CleanableFormat, FormatSpec>;

type Registry = typeof FORMATS;

/** Formats the scan pipeline will accept. */
export type ScannableFormat = {
  [K in keyof Registry]: Registry[K]['support'] extends 'none' ? never : K;
}[keyof Registry];

/** Formats that must have a cleaner registered in clean.ts. */
export type CleanableNowFormat = {
  [K in keyof Registry]: Registry[K]['support'] extends 'clean' ? K : never;
}[keyof Registry];

const ENTRIES = Object.entries(FORMATS) as [CleanableFormat, FormatSpec][];

export const SCANNABLE_FORMATS: readonly ScannableFormat[] = ENTRIES.filter(
  ([, s]) => s.support !== 'none',
).map(([f]) => f) as ScannableFormat[];

export const CLEANABLE_FORMATS: readonly CleanableNowFormat[] = ENTRIES.filter(
  ([, s]) => s.support === 'clean',
).map(([f]) => f) as CleanableNowFormat[];

export function formatSpec(format: CleanableFormat): FormatSpec {
  return FORMATS[format];
}

export function isScannable(format: string): format is ScannableFormat {
  return (SCANNABLE_FORMATS as readonly string[]).includes(format);
}

export function isCleanable(format: string): format is CleanableNowFormat {
  return (CLEANABLE_FORMATS as readonly string[]).includes(format);
}

/**
 * Where, inside each format, the scanner actually looks — and what it cannot
 * reach.
 *
 * This exists because "we support PDF" is not a useful claim on its own. A
 * reader deciding whether to trust the result needs to know which parts of the
 * container were opened. Keyed over the registry, so adding a format is a build
 * error until its coverage is described.
 */
export interface FormatCoverage {
  /** Container regions the scanner opens. */
  inspects: readonly string[];
  /** Honest statement of what is not covered. Never leave this empty. */
  limits: readonly string[];
}

export const FORMAT_COVERAGE: Record<CleanableFormat, FormatCoverage> = {
  jpeg: {
    inspects: ['APP1 EXIF', 'APP1 XMP', 'APP13 IPTC/Photoshop', 'APP11 JUMBF (C2PA)', 'COM comments'],
    limits: ['Pixel-domain watermarks cannot be measured', 'Thumbnails inside EXIF are removed with it'],
  },
  png: {
    inspects: ['tEXt, zTXt and iTXt chunks', 'eXIf chunk', 'XMP in iTXt', 'caBX chunk (C2PA)'],
    limits: ['Pixel-domain watermarks cannot be measured'],
  },
  webp: {
    inspects: ['EXIF chunk', 'XMP chunk', 'C2PA chunk', 'RIFF container structure'],
    limits: ['Pixel-domain watermarks cannot be measured'],
  },
  svg: {
    inspects: ['XML comments', 'metadata and RDF elements', 'script elements and event handlers', 'external references', 'embedded data: URI images'],
    limits: ['An embedded raster image is scanned, but its own pixel content is not analysed'],
  },
  markdown: {
    inspects: ['YAML frontmatter', 'HTML comments', 'hidden Unicode in body text'],
    limits: ['Linked and transcluded files are not followed'],
  },
  pdf: {
    inspects: [
      'the /Info dictionary of every revision, not only the newest',
      'XMP packets anywhere in the file',
      'document JavaScript and embedded files',
      'C2PA associated files and JUMBF containers',
      'the cross-reference chain and revision history',
    ],
    limits: [
      'Encrypted PDFs are refused rather than modified',
      'A document whose structure cannot be rebuilt safely is refused, not guessed at',
      'Text content itself is not analysed',
      'Embedded file attachments are carried over and must be checked separately',
    ],
  },
};

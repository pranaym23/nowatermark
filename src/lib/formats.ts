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
  pdf: { label: 'PDF', mime: 'application/pdf', extension: 'pdf', kind: 'document', support: 'scan' },
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

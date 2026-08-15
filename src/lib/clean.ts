/**
 * Clean orchestrator.
 *
 * The removal report is derived by re-scanning our own output and diffing it
 * against the original scan (PRD §21, §43). Nothing is reported as removed
 * because a cleaner claims to have removed it — only because a second,
 * independent scan can no longer find it. That is what makes the "Removed ✓"
 * marks trustworthy, and it is why an unverifiable signal like SynthID can
 * never accidentally be reported as gone.
 */

import { cleanJpegBytes } from './cleaners/jpeg';
import { cleanPdfBytes } from './cleaners/pdf';
import { cleanPngBytes } from './cleaners/png';
import { cleanMarkdownBytes } from './cleaners/markdown';
import { cleanSvgBytes } from './cleaners/svg';
import { cleanWebpBytes } from './cleaners/webp';
import type { Cleaner, RawCleanOutcome } from './cleaners/types';
import { extensionFor, mimeFor } from './filetype';
import { isCleanable, type CleanableNowFormat } from './formats';
import { splitExtension } from './sanitize';
import { signalById } from './signals';
import { scanImage, type ScanInput } from './scan';
import {
  DEFAULT_CLEAN_OPTIONS,
  allSignals,
  type CleanOptions,
  type CleanResult,
  type CleanableFormat,
  type ScanResult,
  type SignalStatus,
} from './types';

/**
 * `rewritten_unverified` is deliberately not a form of `removed`.
 *
 * Rewriting text to disrupt a statistical watermark cannot be verified — we
 * have no detector, so we cannot confirm any detector now fails. The result is
 * a changed document, not a confirmed removal, and the UI must say so. It never
 * appears in `removedSignals`. See CLAUDE.md non-negotiable #4.
 */
export type SignalOutcome =
  | 'removed'
  | 'kept'
  | 'remaining'
  | 'unverifiable'
  | 'rewritten_unverified'
  | 'absent';

export interface SignalComparison {
  id: string;
  label: string;
  beforeStatus: SignalStatus;
  afterStatus: SignalStatus;
  outcome: SignalOutcome;
  note?: string;
}

export interface CleanOutcome {
  result: CleanResult;
  before: ScanResult;
  /** Present only when cleaning succeeded. */
  after?: ScanResult;
  comparisons: SignalComparison[];
  /** Suggested download filename. */
  filename: string;
  /** Orientation value re-embedded to keep the image upright, if any. */
  orientationPreserved?: number;
  sizeBefore: number;
  sizeAfter?: number;
}

/**
 * The cleaner registry.
 *
 * Typed as a total Record over CleanableNowFormat, so marking a format
 * `support: 'clean'` in the registry without adding a cleaner here is a build
 * error rather than a runtime surprise. The raster cleaners keep their own
 * positional signature; the adapters below are the only thing that knows it.
 */
const CLEANERS: Record<CleanableNowFormat, Cleaner> = {
  jpeg: (bytes, ctx) => cleanJpegBytes(bytes, ctx.preserveOrientation, ctx),
  png: (bytes, ctx) => cleanPngBytes(bytes, ctx.preserveOrientation, ctx),
  webp: (bytes, ctx) => cleanWebpBytes(bytes, ctx.preserveOrientation, ctx),
  pdf: (bytes) => cleanPdfBytes(bytes),
  svg: cleanSvgBytes,
  markdown: cleanMarkdownBytes,
};

async function runCleaner(
  bytes: Uint8Array,
  format: CleanableFormat,
  preserveOrientation: boolean,
  blocks?: ReadonlySet<string>,
): Promise<RawCleanOutcome> {
  if (!isCleanable(format)) {
    // Scannable but not cleanable — we can say what is in the file but not
    // change it. The caller reports this as a failed clean, original intact.
    return { ok: false, warnings: [] };
  }
  return CLEANERS[format](bytes, { preserveOrientation, blocks });
}

export function cleanedFilename(original: string, format: CleanableFormat): string {
  const { base } = splitExtension(original);
  return `${base}-clean.${extensionFor(format)}`;
}

function compare(
  before: ScanResult,
  after: ScanResult,
  orientationPreserved: number | undefined,
  blocks: ReadonlySet<string> | undefined,
): SignalComparison[] {
  const afterById = new Map(allSignals(after).map((s) => [s.id, s]));

  return allSignals(before).map((b) => {
    const a = afterById.get(b.id);
    const afterStatus: SignalStatus = a?.status ?? 'unknown';
    const spec = signalById(b.id);
    let outcome: SignalOutcome;
    let note: string | undefined;

    if (b.status === 'unable_to_verify') {
      outcome = 'unverifiable';
    } else if (b.status !== 'detected') {
      outcome = 'absent';
    } else if (afterStatus !== 'detected') {
      outcome = 'removed';
    } else if (b.id === 'exif' && orientationPreserved !== undefined) {
      outcome = 'kept';
      note = 'Kept 1 field: image rotation';
    } else if (spec && !spec.remove) {
      outcome = 'kept';
      note = 'Preserved on purpose';
    } else if (blocks && !blocks.has(b.id)) {
      /*
       * The user's preset did not ask for this block. Reporting it as
       * "could not be removed" would be a straight falsehood — nothing was
       * attempted — and it would read as a failure of the tool rather than as
       * the choice the user actually made.
       */
      outcome = 'kept';
      note = 'Kept — this preset does not remove it';
    } else {
      outcome = 'remaining';
      note = 'This could not be removed from this file.';
    }

    return { id: b.id, label: b.label, beforeStatus: b.status, afterStatus, outcome, note };
  });
}

export async function cleanImage(
  bytes: Uint8Array,
  input: ScanInput,
  options: CleanOptions = {},
): Promise<CleanOutcome> {
  const { preserveOrientation } = { ...DEFAULT_CLEAN_OPTIONS, ...options };
  // Absent means "everything removable" — the historical behaviour, and what
  // every caller that predates presets expects.
  const blocks = options.blocks ? new Set(options.blocks) : undefined;
  const before = await scanImage(bytes, input);
  const format = before.file.format!;
  const filename = cleanedFilename(input.name, format);

  const outcome = await runCleaner(bytes, format, preserveOrientation, blocks);

  if (!outcome.ok) {
    return {
      result: {
        success: false,
        removedSignals: [],
        remainingSignals: [],
        // The original is never touched — this is the message the UI shows.
        warnings: [
          "We couldn't clean this file safely. Your original file has not been changed.",
          ...outcome.warnings,
        ],
      },
      before,
      comparisons: [],
      filename,
      sizeBefore: bytes.length,
    };
  }

  const cleanedBytes = outcome.bytes;
  const after = await scanImage(cleanedBytes, {
    name: filename,
    type: mimeFor(format),
    size: cleanedBytes.length,
  });

  const comparisons = compare(before, after, outcome.orientationPreserved, blocks);
  const removedSignals = comparisons.filter((c) => c.outcome === 'removed').map((c) => c.id);
  const remainingSignals = comparisons
    .filter((c) => c.outcome === 'remaining' || c.outcome === 'unverifiable' || c.outcome === 'kept')
    .map((c) => c.id);

  const warnings = [...outcome.warnings];
  if (outcome.orientationPreserved !== undefined) {
    warnings.push(
      'A single EXIF field was kept so the image stays the right way up. You can remove it too in the options below.',
    );
  }
  const stubborn = comparisons.filter((c) => c.outcome === 'remaining');
  for (const s of stubborn) {
    warnings.push(`${s.label} could not be removed from this file.`);
  }

  return {
    result: {
      success: true,
      blob: new Blob([cleanedBytes as BlobPart], { type: mimeFor(format) }),
      removedSignals,
      remainingSignals,
      warnings,
    },
    before,
    after,
    comparisons,
    filename,
    orientationPreserved: outcome.orientationPreserved,
    sizeBefore: bytes.length,
    sizeAfter: cleanedBytes.length,
  };
}

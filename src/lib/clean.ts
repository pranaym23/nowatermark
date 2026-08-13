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
import { cleanPngBytes } from './cleaners/png';
import { cleanWebpBytes } from './cleaners/webp';
import { extensionFor, mimeFor } from './filetype';
import { splitExtension } from './sanitize';
import { signalById } from './signals';
import { scanImage, type ScanInput } from './scan';
import {
  DEFAULT_CLEAN_OPTIONS,
  allSignals,
  type CleanOptions,
  type CleanResult,
  type ImageFormat,
  type ScanResult,
  type SignalStatus,
} from './types';

export type SignalOutcome = 'removed' | 'kept' | 'remaining' | 'unverifiable' | 'absent';

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

function runCleaner(bytes: Uint8Array, format: ImageFormat, preserveOrientation: boolean) {
  switch (format) {
    case 'jpeg':
      return cleanJpegBytes(bytes, preserveOrientation);
    case 'png':
      return cleanPngBytes(bytes, preserveOrientation);
    case 'webp':
      return cleanWebpBytes(bytes, preserveOrientation);
  }
}

export function cleanedFilename(original: string, format: ImageFormat): string {
  const { base } = splitExtension(original);
  return `${base}-clean.${extensionFor(format)}`;
}

function compare(
  before: ScanResult,
  after: ScanResult,
  orientationPreserved: number | undefined,
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
  const before = await scanImage(bytes, input);
  const format = before.file.format!;
  const filename = cleanedFilename(input.name, format);

  const outcome = runCleaner(bytes, format, preserveOrientation);

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

  const comparisons = compare(before, after, outcome.orientationPreserved);
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

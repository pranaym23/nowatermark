/**
 * The normalised model every scanner and cleaner speaks.
 *
 * Presentation components consume ScanResult / CleanResult only — no
 * format-specific parsing logic may live in the UI layer (PRD §42).
 */

export type SignalStatus =
  | 'detected'
  | 'not_detected'
  | 'unknown'
  | 'unable_to_verify';

export type Removable = true | false | 'unknown';

/** UI labels map 1:1 to status values (PRD §15, §42). */
export const STATUS_LABEL: Record<SignalStatus, string> = {
  detected: 'Detected',
  not_detected: 'Not detected',
  unknown: 'Unknown',
  unable_to_verify: 'Unable to verify',
};

export interface SignalResult {
  id: string;
  label: string;
  status: SignalStatus;
  /** Human-readable value, already sanitised for display. */
  value?: string;
  description: string;
  removable: Removable;
  /** Longer explanation shown in the expandable panel (PRD §16). */
  detail?: string;
}

export type ImageFormat = 'jpeg' | 'png' | 'webp';

export interface ScannedFile {
  name: string;
  type: string;
  size: number;
  width?: number;
  height?: number;
  /** Format as determined by magic bytes, not by extension or MIME. */
  format?: ImageFormat;
}

export interface ScanResult {
  file: ScannedFile;
  provenance: SignalResult[];
  metadata: SignalResult[];
  privacy: SignalResult[];
  hiddenSignals: SignalResult[];
  /** Non-fatal problems, e.g. a segment that could not be parsed. */
  warnings: string[];
}

export interface CleanResult {
  success: boolean;
  blob?: Blob;
  removedSignals: string[];
  remainingSignals: string[];
  warnings: string[];
}

/** Options for Standard Clean. */
export interface CleanOptions {
  /**
   * Preserve EXIF Orientation when it is not 1, by writing a minimal
   * orientation-only block (PRD §18.2). Default true — stripping it makes
   * rotated photos display sideways in most viewers.
   */
  preserveOrientation?: boolean;
}

export const DEFAULT_CLEAN_OPTIONS: Required<CleanOptions> = {
  preserveOrientation: true,
};

/** Count of signals a user would consider "found something". */
export function countDetected(result: ScanResult): number {
  const groups = [result.provenance, result.metadata, result.privacy, result.hiddenSignals];
  let n = 0;
  for (const g of groups) {
    for (const s of g) if (s.status === 'detected') n++;
  }
  return n;
}

export function allSignals(result: ScanResult): SignalResult[] {
  return [...result.provenance, ...result.metadata, ...result.privacy, ...result.hiddenSignals];
}

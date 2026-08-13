/** Message contract between the UI and the processing worker. */

import type { CleanOptions, ScanResult } from '../types';
import type { SignalComparison } from '../clean';
import type { ScanErrorCode } from '../scan';

export interface FileMeta {
  name: string;
  type: string;
  size: number;
}

export type WorkerRequest =
  | { id: number; kind: 'scan'; bytes: ArrayBuffer; file: FileMeta }
  | { id: number; kind: 'clean'; bytes: ArrayBuffer; file: FileMeta; options: CleanOptions };

/** Clean result with the Blob replaced by transferable bytes. */
export interface CleanPayload {
  success: boolean;
  removedSignals: string[];
  remainingSignals: string[];
  warnings: string[];
  comparisons: SignalComparison[];
  before: ScanResult;
  after?: ScanResult;
  filename: string;
  orientationPreserved?: number;
  sizeBefore: number;
  sizeAfter?: number;
  mimeType: string;
  cleanedBytes?: ArrayBuffer;
}

export type WorkerResponse =
  | { id: number; ok: true; kind: 'scan'; payload: ScanResult }
  | { id: number; ok: true; kind: 'clean'; payload: CleanPayload }
  | { id: number; ok: false; error: { code: ScanErrorCode | 'internal'; message: string } };

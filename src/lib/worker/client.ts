/**
 * Worker client.
 *
 * Spawns the processing worker lazily and falls back to running on the main
 * thread where Workers are unavailable, so the tool degrades rather than
 * breaking (PRD §41).
 */

import type { CleanOptions, ScanResult } from '../types';
import type { CleanPayload, FileMeta, WorkerRequest, WorkerResponse } from './protocol';

export interface ProcessingError {
  code: string;
  message: string;
}

export class ProcessingFailure extends Error {
  readonly code: string;
  constructor(error: ProcessingError) {
    super(error.message);
    this.name = 'ProcessingFailure';
    this.code = error.code;
  }
}

type Pending = {
  resolve: (value: never) => void;
  reject: (reason: unknown) => void;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
let workerUnavailable = false;

function ensureWorker(): Worker | null {
  if (workerUnavailable) return null;
  if (worker) return worker;
  if (typeof Worker === 'undefined') {
    workerUnavailable = true;
    return null;
  }
  try {
    worker = new Worker(new URL('./processor.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.ok) entry.resolve(message.payload as never);
      else entry.reject(new ProcessingFailure(message.error));
    };
    worker.onerror = () => {
      // A worker-level failure invalidates everything in flight.
      for (const [, entry] of pending) {
        entry.reject(
          new ProcessingFailure({ code: 'internal', message: 'Processing stopped unexpectedly.' }),
        );
      }
      pending.clear();
      worker?.terminate();
      worker = null;
      workerUnavailable = true;
    };
    return worker;
  } catch {
    workerUnavailable = true;
    return null;
  }
}

function send<T>(request: Omit<WorkerRequest, 'id'>): Promise<T> | null {
  const active = ensureWorker();
  if (!active) return null;
  const id = nextId++;
  const message = { ...request, id } as WorkerRequest;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: never) => void, reject });
    active.postMessage(message, [message.bytes]);
  });
}

/** Main-thread fallback, used when Workers are unavailable. */
async function runInline<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const { ScanError } = await import('../scan');
    if (err instanceof ScanError) {
      throw new ProcessingFailure({ code: err.code, message: err.message });
    }
    throw new ProcessingFailure({
      code: 'internal',
      message: err instanceof Error ? err.message : 'Something went wrong.',
    });
  }
}

export async function scanFileBytes(bytes: ArrayBuffer, file: FileMeta): Promise<ScanResult> {
  const viaWorker = send<ScanResult>({ kind: 'scan', bytes, file });
  if (viaWorker) return viaWorker;

  return runInline(async () => {
    const { scanImage } = await import('../scan');
    return scanImage(new Uint8Array(bytes), file);
  });
}

export async function cleanFileBytes(
  bytes: ArrayBuffer,
  file: FileMeta,
  options: CleanOptions,
): Promise<CleanPayload> {
  const viaWorker = send<CleanPayload>({ kind: 'clean', bytes, file, options });
  if (viaWorker) return viaWorker;

  return runInline(async () => {
    const { cleanImage } = await import('../clean');
    const { mimeFor } = await import('../filetype');
    const outcome = await cleanImage(new Uint8Array(bytes), file, options);
    const format = outcome.before.file.format!;
    return {
      success: outcome.result.success,
      removedSignals: outcome.result.removedSignals,
      remainingSignals: outcome.result.remainingSignals,
      warnings: outcome.result.warnings,
      comparisons: outcome.comparisons,
      before: outcome.before,
      after: outcome.after,
      filename: outcome.filename,
      orientationPreserved: outcome.orientationPreserved,
      sizeBefore: outcome.sizeBefore,
      sizeAfter: outcome.sizeAfter,
      mimeType: mimeFor(format),
      cleanedBytes: outcome.result.blob ? await outcome.result.blob.arrayBuffer() : undefined,
    } satisfies CleanPayload;
  });
}

/** Release the worker when a tool page unmounts. */
export function releaseWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  pending.clear();
}

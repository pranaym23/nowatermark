/**
 * Processing worker.
 *
 * Parsing and cleaning run here so a 25 MB file never blocks the main thread
 * (PRD §3 terminology note, §20). This is a browser Web Worker — it runs on
 * the user's device and makes no network requests of any kind.
 */

import { cleanImage } from '../clean';
import { mimeFor } from '../filetype';
import { ScanError, scanImage } from '../scan';
import type { CleanPayload, WorkerRequest, WorkerResponse } from './protocol';

function post(message: WorkerResponse, transfer: Transferable[] = []): void {
  (self as unknown as Worker).postMessage(message, transfer);
}

function toError(err: unknown): { code: 'internal' | ScanError['code']; message: string } {
  if (err instanceof ScanError) return { code: err.code, message: err.message };
  return {
    code: 'internal',
    message: err instanceof Error ? err.message : 'Something went wrong while reading this file.',
  };
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const bytes = new Uint8Array(request.bytes);

  try {
    if (request.kind === 'scan') {
      const payload = await scanImage(bytes, request.file);
      post({ id: request.id, ok: true, kind: 'scan', payload });
      return;
    }

    const outcome = await cleanImage(bytes, request.file, request.options);
    const format = outcome.before.file.format!;
    const cleaned = outcome.result.blob
      ? await outcome.result.blob.arrayBuffer()
      : undefined;

    const payload: CleanPayload = {
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
      cleanedBytes: cleaned,
    };

    post({ id: request.id, ok: true, kind: 'clean', payload }, cleaned ? [cleaned] : []);
  } catch (err) {
    post({ id: request.id, ok: false, error: toError(err) });
  }
};

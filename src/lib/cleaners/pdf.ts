/**
 * PDF cleaner (Phase 2).
 *
 * Delegates the hard part to `pdf/serialise.ts`, then does the thing that makes
 * this safe to ship: **checks its own output before returning it.**
 *
 * The re-scan in `clean.ts` cannot catch the failure that matters here. If a
 * cleaner appended an incremental update, the re-scan would follow the new xref
 * to an empty /Info and report success while the author's name sat in the file
 * a few kilobytes earlier. So this verifies against the raw bytes instead:
 * the output must parse, must contain exactly one revision, and must not
 * contain any of the strings we were asked to remove — searched across the
 * whole file, not through the object graph.
 *
 * If any of that fails, it returns `ok: false` and the caller keeps the
 * original. Refusing is always available and always safe; shipping a document
 * we have damaged is not.
 */

import { indexOfAscii } from '../bytes';
import { collectPdfMetadata } from '../metadata/pdf';
import { readPdf } from '../pdf/document';
import { reserialisePdf } from '../pdf/serialise';
import type { RawCleanOutcome } from './types';

/**
 * Values worth hunting for in the output.
 *
 * Short values are skipped: a two-character Producer would match somewhere in
 * any large binary by chance, and a false alarm here would block cleaning of
 * perfectly good files.
 */
const MIN_SENTINEL_LENGTH = 4;

function sentinels(fields: Record<string, string | undefined>): string[] {
  const out: string[] = [];
  for (const value of Object.values(fields)) {
    if (typeof value === 'string' && value.trim().length >= MIN_SENTINEL_LENGTH) {
      out.push(value.trim());
    }
  }
  return out;
}

export async function cleanPdfBytes(bytes: Uint8Array): Promise<RawCleanOutcome> {
  const warnings: string[] = [];

  const before = await collectPdfMetadata(bytes);

  if (before.encrypted) {
    return {
      ok: false,
      warnings: [
        'This PDF is encrypted. Cleaning it would require decrypting and re-encrypting its contents, which we do not attempt.',
      ],
    };
  }

  const doc = await readPdf(bytes);
  const result = await reserialisePdf(doc);
  if (!result) {
    return {
      ok: false,
      warnings: [
        'This PDF uses a structure we cannot rebuild safely, so it has been left alone.',
      ],
    };
  }

  /*
   * Verification, against raw bytes.
   *
   * Everything below is a reason to throw away our own output. None of it is
   * advisory.
   */
  const after = await collectPdfMetadata(result.bytes);

  if (after.degraded) {
    return { ok: false, warnings: ['The cleaned PDF did not parse back cleanly, so it was discarded.'] };
  }

  if (after.revisionCount !== 1) {
    return {
      ok: false,
      warnings: [
        `The cleaned PDF reported ${after.revisionCount} revisions rather than one, which is the exact failure this cleaner exists to avoid. It was discarded.`,
      ],
    };
  }

  if (after.current || after.infos.length > 0) {
    return { ok: false, warnings: ['Metadata survived the rebuild, so the result was discarded.'] };
  }

  if (after.xmpPackets.length > 0) {
    return { ok: false, warnings: ['An XMP packet survived the rebuild, so the result was discarded.'] };
  }

  // The assertion the brief calls the important one: the old values must not
  // appear anywhere in the new bytes.
  const wanted = sentinels({
    title: before.current?.title,
    author: before.current?.author,
    subject: before.current?.subject,
    keywords: before.current?.keywords,
    creator: before.current?.creator,
    producer: before.current?.producer,
  });

  for (const value of wanted) {
    if (indexOfAscii(result.bytes, value, 0) >= 0) {
      return {
        ok: false,
        warnings: [
          'A metadata value was still present in the rebuilt file, so it was discarded. Your original has not been changed.',
        ],
      };
    }
  }

  if (before.revisionCount > 1) {
    warnings.push(
      `This file had ${before.revisionCount - 1} earlier revision${before.revisionCount === 2 ? '' : 's'}. They are gone from the cleaned copy: it was rebuilt from scratch rather than appended to.`,
    );
  }
  if (before.hasEmbeddedFiles) {
    warnings.push('Embedded file attachments were carried over. Check them separately.');
  }

  return { ok: true, bytes: result.bytes, warnings };
}

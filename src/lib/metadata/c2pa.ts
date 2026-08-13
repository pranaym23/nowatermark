/**
 * C2PA / Content Credentials — presence detection and light claim inspection.
 *
 * Scope is deliberately level (a) from PRD §16.1: detect the JUMBF manifest
 * container and read a few human-useful strings out of it. We do NOT verify
 * signatures against a trust list, so this module must never report a manifest
 * as "valid" or "invalid" — only "present".
 *
 * The manifest body is CBOR inside ISO-BMFF boxes. Rather than pull in a CBOR
 * decoder and the full C2PA schema for a presence check, we locate known keys
 * and read the adjacent CBOR text strings. Extraction failures degrade to
 * "present, details unavailable", which is an honest answer.
 */

import { ascii, indexOfAscii, u32be } from '../bytes';

export interface C2paInfo {
  present: boolean;
  claimGenerator?: string;
  /** Assertion labels found in the manifest, e.g. "c2pa.actions". */
  assertions: string[];
  byteLength: number;
  /** An assertion or generator string indicates generative AI involvement. */
  indicatesAi: boolean;
}

export const C2PA_ABSENT: C2paInfo = {
  present: false,
  assertions: [],
  byteLength: 0,
  indicatesAi: false,
};

/** Read a CBOR text string that begins at `pos`. Returns null if not one. */
function readCborText(b: Uint8Array, pos: number): { value: string; end: number } | null {
  if (pos >= b.length) return null;
  const head = b[pos]!;
  const major = head >> 5;
  if (major !== 3) return null; // 3 = text string
  const short = head & 0x1f;
  let len: number;
  let dataStart: number;
  if (short < 24) {
    len = short;
    dataStart = pos + 1;
  } else if (short === 24) {
    if (pos + 2 > b.length) return null;
    len = b[pos + 1]!;
    dataStart = pos + 2;
  } else if (short === 25) {
    if (pos + 3 > b.length) return null;
    len = (b[pos + 1]! << 8) | b[pos + 2]!;
    dataStart = pos + 3;
  } else if (short === 26) {
    if (pos + 5 > b.length) return null;
    len = u32be(b, pos + 1);
    dataStart = pos + 5;
  } else {
    return null;
  }
  if (len > 4096 || dataStart + len > b.length) return null;
  return { value: ascii(b, dataStart, len), end: dataStart + len };
}

/** Find `key` as a CBOR text string and read the text value that follows it. */
function readValueAfterKey(b: Uint8Array, key: string): string | undefined {
  let from = 0;
  for (;;) {
    const at = indexOfAscii(b, key, from);
    if (at < 0) return undefined;
    // The key itself is a CBOR text string, so its value starts right after.
    const value = readCborText(b, at + key.length);
    if (value && value.value.trim().length > 0) return value.value;
    from = at + key.length;
    if (from >= b.length) return undefined;
  }
}

const AI_ASSERTION_HINTS = [
  'trainedalgorithmicmedia',
  'generative-ai',
  'generativeai',
  'c2pa.training-mining',
  'digitalsourcetype',
];

/**
 * Inspect a JUMBF/C2PA payload extracted from a container.
 * `payload` should be the raw JUMBF bytes (the boxes), not the whole file.
 */
export function inspectC2pa(payload: Uint8Array): C2paInfo {
  if (payload.length === 0) return C2PA_ABSENT;

  const text = ascii(payload, 0, Math.min(payload.length, 1 << 20));

  // Assertion labels are stable ASCII identifiers; collect the distinct ones.
  const assertions = Array.from(
    new Set(
      Array.from(text.matchAll(/c2pa\.[a-z0-9][a-z0-9._-]{2,40}/gi), (m) => m[0]).filter(
        // "c2pa.assertions"/"c2pa.claim" are structural, not interesting.
        (label) => !/^c2pa\.(claim|assertions|signature|manifest)$/i.test(label),
      ),
    ),
  ).slice(0, 12);

  const generatorInfoName = (() => {
    const at = text.indexOf('claim_generator_info');
    if (at < 0) return undefined;
    // The info array holds maps with a "name" key.
    const region = payload.subarray(at, Math.min(payload.length, at + 512));
    return readValueAfterKey(region, 'name');
  })();

  const claimGenerator = generatorInfoName ?? readValueAfterKey(payload, 'claim_generator');

  const haystack = `${text.slice(0, 65536)} ${claimGenerator ?? ''}`.toLowerCase();
  const indicatesAi = AI_ASSERTION_HINTS.some((h) => haystack.includes(h));

  return {
    present: true,
    claimGenerator: claimGenerator?.trim() || undefined,
    assertions,
    byteLength: payload.length,
    indicatesAi,
  };
}

/**
 * True when the bytes look like a JUMBF superbox ("....jumb" ISO box) or
 * otherwise reference the C2PA manifest label.
 */
export function looksLikeJumbf(b: Uint8Array): boolean {
  if (b.length >= 8) {
    const type = ascii(b, 4, 4);
    if (type === 'jumb' || type === 'jumd') return true;
  }
  return indexOfAscii(b, 'jumb', 0, Math.min(b.length, 4096)) >= 0 ||
    indexOfAscii(b, 'c2pa', 0, Math.min(b.length, 4096)) >= 0;
}

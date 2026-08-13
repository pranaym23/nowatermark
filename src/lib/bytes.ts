/**
 * Byte-level primitives shared by the container walkers.
 *
 * Everything here operates on Uint8Array views and never copies unless asked.
 * No DOM, no Node APIs — this module runs identically in a Web Worker, the
 * main thread and Vitest.
 */

export function u8(b: Uint8Array, o: number): number {
  return b[o]!;
}

export function u16be(b: Uint8Array, o: number): number {
  return ((b[o]! << 8) | b[o + 1]!) >>> 0;
}

export function u16le(b: Uint8Array, o: number): number {
  return (b[o]! | (b[o + 1]! << 8)) >>> 0;
}

export function u32be(b: Uint8Array, o: number): number {
  return ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
}

export function u32le(b: Uint8Array, o: number): number {
  return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
}

/** 24-bit little-endian, used by the WebP VP8X canvas fields. */
export function u24le(b: Uint8Array, o: number): number {
  return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16)) >>> 0;
}

export function writeU32be(b: Uint8Array, o: number, v: number): void {
  b[o] = (v >>> 24) & 0xff;
  b[o + 1] = (v >>> 16) & 0xff;
  b[o + 2] = (v >>> 8) & 0xff;
  b[o + 3] = v & 0xff;
}

export function writeU32le(b: Uint8Array, o: number, v: number): void {
  b[o] = v & 0xff;
  b[o + 1] = (v >>> 8) & 0xff;
  b[o + 2] = (v >>> 16) & 0xff;
  b[o + 3] = (v >>> 24) & 0xff;
}

/** Latin-1 decode of a byte range. Used for magic numbers and segment tags. */
export function ascii(b: Uint8Array, o: number, len: number): string {
  let s = '';
  const end = Math.min(o + len, b.length);
  for (let i = o; i < end; i++) s += String.fromCharCode(b[i]!);
  return s;
}

export function asciiBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/** True when `b` at `o` begins with the given ASCII string. */
export function startsWith(b: Uint8Array, o: number, sig: string): boolean {
  if (o + sig.length > b.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (b[o + i] !== (sig.charCodeAt(i) & 0xff)) return false;
  }
  return true;
}

/** True when `b` at `o` begins with the given byte sequence. */
export function startsWithBytes(b: Uint8Array, o: number, sig: readonly number[]): boolean {
  if (o + sig.length > b.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (b[o + i] !== sig[i]) return false;
  }
  return true;
}

/** Byte-sequence search. Returns -1 when absent. */
export function indexOfSeq(hay: Uint8Array, needle: Uint8Array, from = 0, to = hay.length): number {
  if (needle.length === 0) return from;
  const last = Math.min(to, hay.length) - needle.length;
  const first = needle[0]!;
  outer: for (let i = Math.max(0, from); i <= last; i++) {
    if (hay[i] !== first) continue;
    for (let j = 1; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

export function indexOfAscii(hay: Uint8Array, needle: string, from = 0, to = hay.length): number {
  return indexOfSeq(hay, asciiBytes(needle), from, to);
}

export function concat(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/**
 * Decode a byte range as UTF-8, falling back to Latin-1 on malformed input.
 * Metadata strings are frequently mislabelled, so never throw here.
 */
export function decodeText(b: Uint8Array, o = 0, len = b.length - o): string {
  const slice = b.subarray(o, o + len);
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(slice);
  } catch {
    return ascii(slice, 0, slice.length);
  }
}

/** Strip trailing NULs and surrounding whitespace from a metadata string. */
export function trimNul(s: string): string {
  return s.replace(/\0+$/g, '').trim();
}

/**
 * Human-readable byte size. Used in the UI and in the file_size_bucket
 * analytics dimension.
 */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

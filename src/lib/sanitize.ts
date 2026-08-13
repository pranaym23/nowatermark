/**
 * Every string that reaches the UI passes through here first.
 *
 * Metadata is attacker-controlled: a crafted EXIF Software tag can contain
 * control characters, bidi overrides that reorder surrounding text, megabytes
 * of padding, or markup. React escapes HTML for us, but it does not defend
 * against the rest (PRD §40).
 *
 * Ranges are declared as code points rather than regex literals so no literal
 * control characters appear in this source file.
 */

/**
 * C0/C1 controls, zero-width characters, bidi embedding/isolate controls and
 * the BOM. Tab (0x09) and newline (0x0A) are deliberately excluded — the
 * whitespace collapse below handles them.
 */
const INVISIBLE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x0008],
  [0x000b, 0x001f],
  [0x007f, 0x009f],
  [0x200b, 0x200f], // ZWSP, ZWNJ, ZWJ, LRM, RLM
  [0x202a, 0x202e], // bidi embedding / override
  [0x2060, 0x2064], // word joiner, invisible operators
  [0x2066, 0x2069], // bidi isolates
  [0xfeff, 0xfeff], // BOM / zero-width no-break space
];

export function isInvisibleCodePoint(cp: number): boolean {
  for (const [lo, hi] of INVISIBLE_RANGES) {
    if (cp >= lo && cp <= hi) return true;
  }
  return false;
}

function stripInvisible(s: string): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined && isInvisibleCodePoint(cp)) continue;
    out += ch;
  }
  return out;
}

const MAX_LEN = 300;

export function sanitizeValue(input: string, maxLen = MAX_LEN): string {
  const s = stripInvisible(input).replace(/\s+/g, ' ').trim();
  return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
}

/** Sanitize, returning undefined for values that are empty once cleaned. */
export function sanitizeOptional(input: string | undefined, maxLen = MAX_LEN): string | undefined {
  if (input == null) return undefined;
  const s = sanitizeValue(input, maxLen);
  return s.length > 0 ? s : undefined;
}

/**
 * Filenames come from the user's disk and are echoed back in the download
 * name. Strip path separators and characters that are illegal on common
 * filesystems.
 */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'image';
  const cleaned = stripInvisible(base)
    .replace(/["<>|:*?]/g, '')
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 120) : 'image';
}

/** Split a filename into base and extension, for building the cleaned name. */
export function splitExtension(name: string): { base: string; ext: string } {
  const safe = sanitizeFilename(name);
  const dot = safe.lastIndexOf('.');
  if (dot <= 0) return { base: safe, ext: '' };
  return { base: safe.slice(0, dot), ext: safe.slice(dot + 1) };
}

/**
 * Hidden / invisible character detection and removal for the text tools.
 *
 * Runs entirely on the client; pasted text is never sent anywhere (PRD §23).
 *
 * Important correctness note: zero-width joiner (U+200D) and variation
 * selector-16 (U+FE0F) are *load-bearing* inside emoji sequences. Stripping
 * them turns a family emoji into three separate people and turns styled emoji
 * back into monochrome glyphs. This module classifies those occurrences as
 * legitimate and leaves them alone by default.
 */

export type HiddenCategory =
  | 'zero-width'
  | 'bidi-control'
  | 'variation-selector'
  | 'tag-character'
  | 'unusual-space'
  | 'control'
  | 'deprecated';

export type Risk = 'high' | 'medium' | 'low';

interface CharSpec {
  name: string;
  category: HiddenCategory;
  risk: Risk;
}

const SINGLES = new Map<number, CharSpec>([
  [0x00ad, { name: 'Soft hyphen', category: 'zero-width', risk: 'medium' }],
  [0x061c, { name: 'Arabic letter mark', category: 'bidi-control', risk: 'medium' }],
  [0x180e, { name: 'Mongolian vowel separator', category: 'zero-width', risk: 'medium' }],
  [0x200b, { name: 'Zero-width space', category: 'zero-width', risk: 'high' }],
  [0x200c, { name: 'Zero-width non-joiner', category: 'zero-width', risk: 'high' }],
  [0x200d, { name: 'Zero-width joiner', category: 'zero-width', risk: 'high' }],
  [0x200e, { name: 'Left-to-right mark', category: 'bidi-control', risk: 'medium' }],
  [0x200f, { name: 'Right-to-left mark', category: 'bidi-control', risk: 'medium' }],
  [0x2028, { name: 'Line separator', category: 'control', risk: 'low' }],
  [0x2029, { name: 'Paragraph separator', category: 'control', risk: 'low' }],
  [0x2060, { name: 'Word joiner', category: 'zero-width', risk: 'high' }],
  [0x2061, { name: 'Function application', category: 'zero-width', risk: 'medium' }],
  [0x2062, { name: 'Invisible times', category: 'zero-width', risk: 'medium' }],
  [0x2063, { name: 'Invisible separator', category: 'zero-width', risk: 'medium' }],
  [0x2064, { name: 'Invisible plus', category: 'zero-width', risk: 'medium' }],
  [0x2800, { name: 'Braille pattern blank', category: 'unusual-space', risk: 'medium' }],
  [0x3164, { name: 'Hangul filler', category: 'unusual-space', risk: 'high' }],
  [0xfeff, { name: 'Zero-width no-break space (BOM)', category: 'zero-width', risk: 'high' }],
  [0xffa0, { name: 'Halfwidth Hangul filler', category: 'unusual-space', risk: 'high' }],
]);

interface RangeSpec extends CharSpec {
  lo: number;
  hi: number;
}

const RANGES: readonly RangeSpec[] = [
  { lo: 0x0000, hi: 0x0008, name: 'Control character', category: 'control', risk: 'medium' },
  { lo: 0x000b, hi: 0x000c, name: 'Control character', category: 'control', risk: 'low' },
  { lo: 0x000e, hi: 0x001f, name: 'Control character', category: 'control', risk: 'medium' },
  { lo: 0x007f, hi: 0x009f, name: 'Control character', category: 'control', risk: 'medium' },
  { lo: 0x202a, hi: 0x202e, name: 'Bidirectional override', category: 'bidi-control', risk: 'high' },
  { lo: 0x2066, hi: 0x2069, name: 'Bidirectional isolate', category: 'bidi-control', risk: 'high' },
  { lo: 0xfe00, hi: 0xfe0f, name: 'Variation selector', category: 'variation-selector', risk: 'medium' },
  { lo: 0xe0000, hi: 0xe007f, name: 'Tag character', category: 'tag-character', risk: 'high' },
  { lo: 0xe0100, hi: 0xe01ef, name: 'Variation selector (supplement)', category: 'variation-selector', risk: 'medium' },
];

/** Spaces that render but are not U+0020 — often used to evade matching. */
const UNUSUAL_SPACES = new Set([
  0x00a0, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x202f, 0x205f, 0x3000,
]);

function classify(cp: number): CharSpec | undefined {
  const single = SINGLES.get(cp);
  if (single) return single;
  if (UNUSUAL_SPACES.has(cp)) {
    return { name: 'Unusual space character', category: 'unusual-space', risk: 'low' };
  }
  for (const r of RANGES) {
    if (cp >= r.lo && cp <= r.hi) return { name: r.name, category: r.category, risk: r.risk };
  }
  return undefined;
}

const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const REGIONAL_INDICATOR = /[\u{1F1E6}-\u{1F1FF}]/u;

function isPictographic(ch: string | undefined): boolean {
  return ch !== undefined && (PICTOGRAPHIC.test(ch) || REGIONAL_INDICATOR.test(ch));
}

export interface HiddenFinding {
  /** Code point value. */
  cp: number;
  name: string;
  category: HiddenCategory;
  risk: Risk;
  /** Index into the array of code points (not UTF-16 code units). */
  index: number;
  /**
   * True when this character is doing legitimate work — a ZWJ inside an emoji
   * sequence, or a variation selector styling the preceding pictograph.
   * Legitimate characters are preserved by default.
   */
  legitimate: boolean;
}

export interface HiddenScanResult {
  findings: HiddenFinding[];
  /** Total characters flagged, including legitimate ones. */
  total: number;
  /** Characters that would actually be removed by a default clean. */
  removable: number;
  /** Flagged characters preserved because they are part of an emoji. */
  legitimate: number;
  byCategory: Partial<Record<HiddenCategory, number>>;
  /** Code-point length of the input. */
  length: number;
}

export interface CleanTextOptions {
  /** Replace unusual spaces with a normal space instead of deleting. Default true. */
  normalizeSpaces?: boolean;
  /** Remove even emoji-legitimate ZWJ / variation selectors. Default false. */
  aggressive?: boolean;
}

/**
 * Decide whether a flagged character is legitimately part of an emoji.
 * `chars` is the code-point array; `i` is the index of the flagged character.
 */
function isLegitimate(chars: string[], i: number, cp: number): boolean {
  if (cp === 0x200d) {
    // ZWJ joins two pictographs: 👨‍👩‍👧, 🏳️‍🌈
    return isPictographic(chars[i - 1]) && isPictographic(chars[i + 1]);
  }
  if (cp === 0xfe0f || cp === 0xfe0e) {
    // Variation selector styling the preceding character.
    return isPictographic(chars[i - 1]);
  }
  if (cp >= 0xe0100 && cp <= 0xe01ef) {
    // Ideographic variation sequences follow a CJK character.
    const prev = chars[i - 1];
    return prev !== undefined && /\p{Script=Han}/u.test(prev);
  }
  return false;
}

export function scanHiddenCharacters(text: string): HiddenScanResult {
  const chars = Array.from(text);
  const findings: HiddenFinding[] = [];
  const byCategory: Partial<Record<HiddenCategory, number>> = {};

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    // Ordinary whitespace is not a finding.
    if (cp === 0x09 || cp === 0x0a || cp === 0x0d || cp === 0x20) continue;
    const spec = classify(cp);
    if (!spec) continue;
    const legitimate = isLegitimate(chars, i, cp);
    findings.push({ cp, name: spec.name, category: spec.category, risk: spec.risk, index: i, legitimate });
    byCategory[spec.category] = (byCategory[spec.category] ?? 0) + 1;
  }

  const legitimate = findings.filter((f) => f.legitimate).length;
  return {
    findings,
    total: findings.length,
    removable: findings.length - legitimate,
    legitimate,
    byCategory,
    length: chars.length,
  };
}

export interface CleanTextResult {
  text: string;
  removed: number;
  /** Characters preserved because removing them would break an emoji. */
  preserved: number;
  changed: boolean;
}

export function cleanHiddenCharacters(text: string, options: CleanTextOptions = {}): CleanTextResult {
  const { normalizeSpaces = true, aggressive = false } = options;
  const chars = Array.from(text);
  let out = '';
  let removed = 0;
  let preserved = 0;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    if (cp === 0x09 || cp === 0x0a || cp === 0x0d || cp === 0x20) {
      out += ch;
      continue;
    }
    const spec = classify(cp);
    if (!spec) {
      out += ch;
      continue;
    }
    if (spec.category === 'unusual-space') {
      if (normalizeSpaces) {
        out += ' ';
        removed++;
      } else {
        out += ch;
      }
      continue;
    }
    if (!aggressive && isLegitimate(chars, i, cp)) {
      out += ch;
      preserved++;
      continue;
    }
    removed++;
  }

  return { text: out, removed, preserved, changed: out !== text };
}

/**
 * Build a display model that marks where hidden characters sit, so the UI can
 * render the text with visible markers without doing its own parsing.
 */
export interface TextSegment {
  kind: 'text' | 'hidden';
  value: string;
  finding?: HiddenFinding;
}

export function segmentText(text: string, scan: HiddenScanResult, limit = 4000): TextSegment[] {
  const chars = Array.from(text);
  const flagged = new Map(scan.findings.map((f) => [f.index, f]));
  const segments: TextSegment[] = [];
  let buffer = '';
  const end = Math.min(chars.length, limit);

  for (let i = 0; i < end; i++) {
    const finding = flagged.get(i);
    if (finding) {
      if (buffer) {
        segments.push({ kind: 'text', value: buffer });
        buffer = '';
      }
      segments.push({ kind: 'hidden', value: chars[i]!, finding });
    } else {
      buffer += chars[i]!;
    }
  }
  if (buffer) segments.push({ kind: 'text', value: buffer });
  return segments;
}

/** Short label like "U+200B" for the UI. */
export function formatCodePoint(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

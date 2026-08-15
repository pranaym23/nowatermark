/**
 * PDF object lexer and parser.
 *
 * A PDF is an object graph, not a flat file, so nothing here can be done by
 * pattern-matching bytes. This parses the eight object types (null, boolean,
 * number, string, name, array, dictionary, stream) plus indirect references,
 * over a Uint8Array, with no dependency.
 *
 * It is deliberately tolerant of malformed input in the sense that it returns
 * null rather than throwing — a PDF that we cannot parse must be *reported*,
 * never guessed at.
 */

export type PdfValue =
  | { kind: 'null' }
  | { kind: 'bool'; value: boolean }
  | { kind: 'number'; value: number }
  | { kind: 'string'; bytes: Uint8Array }
  | { kind: 'name'; value: string }
  | { kind: 'array'; items: PdfValue[] }
  | { kind: 'dict'; map: Map<string, PdfValue> }
  | { kind: 'stream'; dict: Map<string, PdfValue>; start: number; end: number }
  | { kind: 'ref'; num: number; gen: number };

const WS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

function isWs(c: number): boolean {
  return WS.has(c);
}

function isDelim(c: number): boolean {
  return DELIM.has(c);
}

function isRegular(c: number): boolean {
  return !isWs(c) && !isDelim(c);
}

export class PdfLexer {
  readonly bytes: Uint8Array;
  pos: number;

  constructor(bytes: Uint8Array, pos = 0) {
    this.bytes = bytes;
    this.pos = pos;
  }

  /** Skip whitespace and `%` comments. */
  skip(): void {
    const b = this.bytes;
    while (this.pos < b.length) {
      const c = b[this.pos]!;
      if (isWs(c)) {
        this.pos++;
      } else if (c === 0x25) {
        while (this.pos < b.length && b[this.pos] !== 0x0a && b[this.pos] !== 0x0d) this.pos++;
      } else {
        return;
      }
    }
  }

  peekKeyword(word: string): boolean {
    const b = this.bytes;
    if (this.pos + word.length > b.length) return false;
    for (let i = 0; i < word.length; i++) {
      if (b[this.pos + i] !== word.charCodeAt(i)) return false;
    }
    const after = b[this.pos + word.length];
    return after === undefined || !isRegular(after);
  }

  takeKeyword(word: string): boolean {
    if (!this.peekKeyword(word)) return false;
    this.pos += word.length;
    return true;
  }

  private readToken(): string {
    const b = this.bytes;
    const start = this.pos;
    while (this.pos < b.length && isRegular(b[this.pos]!)) this.pos++;
    let s = '';
    for (let i = start; i < this.pos; i++) s += String.fromCharCode(b[i]!);
    return s;
  }

  private readName(): string {
    const b = this.bytes;
    this.pos++; // '/'
    let s = '';
    while (this.pos < b.length && isRegular(b[this.pos]!)) {
      let c = b[this.pos]!;
      if (c === 0x23 && this.pos + 2 < b.length) {
        const hex = String.fromCharCode(b[this.pos + 1]!, b[this.pos + 2]!);
        const v = Number.parseInt(hex, 16);
        if (Number.isFinite(v)) {
          c = v;
          this.pos += 2;
        }
      }
      s += String.fromCharCode(c);
      this.pos++;
    }
    return s;
  }

  private readLiteralString(): Uint8Array {
    const b = this.bytes;
    this.pos++; // '('
    const out: number[] = [];
    let depth = 1;
    while (this.pos < b.length) {
      const c = b[this.pos++]!;
      if (c === 0x5c) {
        const n = b[this.pos++];
        if (n === undefined) break;
        switch (n) {
          case 0x6e: out.push(0x0a); break;
          case 0x72: out.push(0x0d); break;
          case 0x74: out.push(0x09); break;
          case 0x62: out.push(0x08); break;
          case 0x66: out.push(0x0c); break;
          case 0x0a: break;
          case 0x0d: if (b[this.pos] === 0x0a) this.pos++; break;
          default:
            if (n >= 0x30 && n <= 0x37) {
              let v = n - 0x30;
              for (let k = 0; k < 2; k++) {
                const d = b[this.pos];
                if (d === undefined || d < 0x30 || d > 0x37) break;
                v = v * 8 + (d - 0x30);
                this.pos++;
              }
              out.push(v & 0xff);
            } else {
              out.push(n);
            }
        }
        continue;
      }
      if (c === 0x28) depth++;
      if (c === 0x29) {
        depth--;
        if (depth === 0) break;
      }
      out.push(c);
    }
    return new Uint8Array(out);
  }

  private readHexString(): Uint8Array {
    const b = this.bytes;
    this.pos++; // '<'
    const digits: number[] = [];
    while (this.pos < b.length && b[this.pos] !== 0x3e) {
      const c = b[this.pos++]!;
      const d =
        c >= 0x30 && c <= 0x39 ? c - 0x30 :
        c >= 0x41 && c <= 0x46 ? c - 0x37 :
        c >= 0x61 && c <= 0x66 ? c - 0x57 : -1;
      if (d >= 0) digits.push(d);
    }
    this.pos++; // '>'
    if (digits.length % 2 === 1) digits.push(0);
    const out = new Uint8Array(digits.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = (digits[i * 2]! << 4) | digits[i * 2 + 1]!;
    return out;
  }

  /** Parse one object. Returns null at end of input or on malformed syntax. */
  parse(depth = 0): PdfValue | null {
    if (depth > 64) return null;
    this.skip();
    const b = this.bytes;
    if (this.pos >= b.length) return null;

    const c = b[this.pos]!;

    if (c === 0x2f) return { kind: 'name', value: this.readName() };
    if (c === 0x28) return { kind: 'string', bytes: this.readLiteralString() };

    if (c === 0x3c) {
      if (b[this.pos + 1] === 0x3c) return this.parseDictOrStream(depth);
      return { kind: 'string', bytes: this.readHexString() };
    }

    if (c === 0x5b) {
      this.pos++;
      const items: PdfValue[] = [];
      for (;;) {
        this.skip();
        if (this.pos >= b.length) return null;
        if (b[this.pos] === 0x5d) {
          this.pos++;
          break;
        }
        const item = this.parse(depth + 1);
        if (!item) return null;
        items.push(item);
      }
      return { kind: 'array', items };
    }

    if (this.takeKeyword('null')) return { kind: 'null' };
    if (this.takeKeyword('true')) return { kind: 'bool', value: true };
    if (this.takeKeyword('false')) return { kind: 'bool', value: false };

    // A number, or the `N G R` indirect-reference form.
    if ((c >= 0x30 && c <= 0x39) || c === 0x2b || c === 0x2d || c === 0x2e) {
      const save = this.pos;
      const tok = this.readToken();
      const value = Number.parseFloat(tok);
      if (!Number.isFinite(value)) return null;

      if (/^\d+$/.test(tok)) {
        const after = this.pos;
        this.skip();
        const genStart = this.pos;
        const genTok = this.readToken();
        if (/^\d+$/.test(genTok)) {
          this.skip();
          if (this.takeKeyword('R')) {
            return { kind: 'ref', num: value, gen: Number.parseInt(genTok, 10) };
          }
        }
        this.pos = after;
        void genStart;
        void save;
      }
      return { kind: 'number', value };
    }

    return null;
  }

  private parseDictOrStream(depth: number): PdfValue | null {
    const b = this.bytes;
    this.pos += 2; // '<<'
    const map = new Map<string, PdfValue>();

    for (;;) {
      this.skip();
      if (this.pos >= b.length) return null;
      if (b[this.pos] === 0x3e && b[this.pos + 1] === 0x3e) {
        this.pos += 2;
        break;
      }
      if (b[this.pos] !== 0x2f) {
        // Junk inside a dictionary — skip a token and keep going rather than
        // abandoning the whole object.
        const before = this.pos;
        const skipped = this.parse(depth + 1);
        if (!skipped || this.pos === before) return null;
        continue;
      }
      const key = this.readName();
      const value = this.parse(depth + 1);
      if (!value) return null;
      map.set(key, value);
    }

    const save = this.pos;
    this.skip();
    if (this.takeKeyword('stream')) {
      // The keyword is followed by CRLF or LF, never by CR alone.
      if (b[this.pos] === 0x0d) this.pos++;
      if (b[this.pos] === 0x0a) this.pos++;
      const start = this.pos;

      const lengthValue = map.get('Length');
      let end = -1;
      if (lengthValue?.kind === 'number') {
        const candidate = start + lengthValue.value;
        if (candidate <= b.length) {
          const probe = new PdfLexer(b, candidate);
          probe.skip();
          if (probe.peekKeyword('endstream')) end = candidate;
        }
      }
      if (end < 0) {
        // /Length was indirect or wrong — find the terminator instead.
        end = indexOfAsciiIn(b, 'endstream', start);
        if (end < 0) return null;
        let trimmed = end;
        if (b[trimmed - 1] === 0x0a) trimmed--;
        if (b[trimmed - 1] === 0x0d) trimmed--;
        end = trimmed;
      }

      this.pos = Math.min(b.length, end);
      this.skip();
      this.takeKeyword('endstream');
      return { kind: 'stream', dict: map, start, end };
    }

    this.pos = save;
    return { kind: 'dict', map };
  }
}

export function indexOfAsciiIn(hay: Uint8Array, needle: string, from: number): number {
  const first = needle.charCodeAt(0);
  const last = hay.length - needle.length;
  outer: for (let i = Math.max(0, from); i <= last; i++) {
    if (hay[i] !== first) continue;
    for (let j = 1; j < needle.length; j++) {
      if (hay[i + j] !== needle.charCodeAt(j)) continue outer;
    }
    return i;
  }
  return -1;
}

export function lastIndexOfAscii(hay: Uint8Array, needle: string, from = hay.length): number {
  const first = needle.charCodeAt(0);
  outer: for (let i = Math.min(from, hay.length - needle.length); i >= 0; i--) {
    if (hay[i] !== first) continue;
    for (let j = 1; j < needle.length; j++) {
      if (hay[i + j] !== needle.charCodeAt(j)) continue outer;
    }
    return i;
  }
  return -1;
}

/* -------------------------------------------------------------- accessors */

export function dictOf(v: PdfValue | undefined): Map<string, PdfValue> | undefined {
  if (!v) return undefined;
  if (v.kind === 'dict') return v.map;
  if (v.kind === 'stream') return v.dict;
  return undefined;
}

export function numberOf(v: PdfValue | undefined): number | undefined {
  return v?.kind === 'number' ? v.value : undefined;
}

export function nameOf(v: PdfValue | undefined): string | undefined {
  return v?.kind === 'name' ? v.value : undefined;
}

/**
 * Decode a PDF text string. They are either UTF-16BE with a BOM or PDFDocEncoding,
 * which is close enough to Latin-1 for reporting purposes.
 */
export function textOf(v: PdfValue | undefined): string | undefined {
  if (v?.kind !== 'string') return undefined;
  const b = v.bytes;
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) {
    let s = '';
    for (let i = 2; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i]! << 8) | b[i + 1]!);
    return s;
  }
  let s = '';
  for (const byte of b) s += String.fromCharCode(byte);
  return s;
}

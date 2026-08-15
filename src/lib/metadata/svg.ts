/**
 * SVG structure walker.
 *
 * SVG is XML, so there is no compressed stream to preserve — but that makes it
 * *easier* to destroy a file by accident, not harder. Everything here reports
 * byte ranges into the original text and never rewrites it; the cleaner deletes
 * exactly the ranges it is given and copies the rest through untouched. That is
 * how "we changed only what we said we changed" is kept true.
 *
 * This is a deliberately small scanner, not an XML parser. It knows enough to
 * find element and attribute boundaries and nothing else — no entity
 * resolution, no namespace resolution, no DOM. Adding a parser dependency to
 * `src/lib/` is not an option (README: the engine has no runtime deps).
 */

export interface Region {
  start: number;
  end: number;
}

export interface SvgAttr {
  name: string;
  lower: string;
  value: string;
  /** Range covering the whitespace before the attribute through its value. */
  start: number;
  end: number;
}

export interface SvgTag {
  name: string;
  lower: string;
  closing: boolean;
  selfClosing: boolean;
  /** Index of '<'. */
  start: number;
  /** Index just past '>'. */
  end: number;
  attrs: SvgAttr[];
}

export interface SvgComment extends Region {
  text: string;
}

export interface SvgStructure {
  valid: boolean;
  tags: SvgTag[];
  comments: SvgComment[];
  warnings: string[];
}

/**
 * Editor namespaces. These carry document identity rather than drawing
 * instructions — `sodipodi:docname` is literally the author's original
 * filename, which is exactly the sort of thing this product exists to remove.
 */
const EDITOR_PREFIXES = [
  'inkscape',
  'sodipodi',
  'illustrator',
  'graph',
  'i',
  'figma',
  'sketch',
  'xd',
  'affinity',
  'vectornator',
  'krita',
  'serif',
];

const GENERATOR_COMMENT = /generator|generated|created\s+with|produced\s+by|exported\s+from/i;

/**
 * Decode SVG bytes as text.
 *
 * Refuses anything that is not UTF-8. A mis-decoded file that we then rewrite
 * would be silently corrupted, and a corrupted file is worse than an uncleaned
 * one — so this returns an error rather than guessing.
 */
export function decodeSvg(bytes: Uint8Array): { ok: true; text: string } | { ok: false; reason: string } {
  if (bytes.length >= 2) {
    const b0 = bytes[0]!;
    const b1 = bytes[1]!;
    if ((b0 === 0xff && b1 === 0xfe) || (b0 === 0xfe && b1 === 0xff)) {
      return { ok: false, reason: 'This SVG is UTF-16 encoded, which we cannot rewrite safely.' };
    }
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, reason: 'This SVG is not valid UTF-8, so we cannot rewrite it safely.' };
  }

  const declared = /<\?xml[^>]*\bencoding\s*=\s*["']([^"']+)["']/i.exec(text.slice(0, 512));
  if (declared) {
    const enc = declared[1]!.toLowerCase();
    if (enc !== 'utf-8' && enc !== 'utf8' && enc !== 'us-ascii' && enc !== 'ascii') {
      return { ok: false, reason: `This SVG declares ${declared[1]} encoding, which we cannot rewrite safely.` };
    }
  }

  return { ok: true, text };
}

function isSpace(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
}

function parseTag(text: string, start: number): SvgTag | null {
  const n = text.length;
  let i = start + 1;
  const closing = text[i] === '/';
  if (closing) i++;

  const nameStart = i;
  while (i < n && !isSpace(text[i]!) && text[i] !== '/' && text[i] !== '>') i++;
  const name = text.slice(nameStart, i);
  if (!name || !/^[A-Za-z_:][A-Za-z0-9_.:-]*$/.test(name)) return null;

  const attrs: SvgAttr[] = [];
  let selfClosing = false;

  while (i < n) {
    const wsStart = i;
    while (i < n && isSpace(text[i]!)) i++;
    if (i >= n) break;

    const c = text[i]!;
    if (c === '>') {
      i++;
      break;
    }
    if (c === '/' && text[i + 1] === '>') {
      selfClosing = true;
      i += 2;
      break;
    }

    const an = i;
    while (i < n && !isSpace(text[i]!) && text[i] !== '=' && text[i] !== '/' && text[i] !== '>') i++;
    const aname = text.slice(an, i);
    if (!aname) {
      i++;
      continue;
    }

    let value = '';
    let aend = i;
    let k = i;
    while (k < n && isSpace(text[k]!)) k++;
    if (text[k] === '=') {
      k++;
      while (k < n && isSpace(text[k]!)) k++;
      const q = text[k];
      if (q === '"' || q === "'") {
        // Quoted values are consumed whole, so a '>' inside one cannot end the tag.
        const close = text.indexOf(q, k + 1);
        if (close < 0) {
          value = text.slice(k + 1);
          aend = n;
        } else {
          value = text.slice(k + 1, close);
          aend = close + 1;
        }
      } else {
        let m = k;
        while (m < n && !isSpace(text[m]!) && text[m] !== '>') m++;
        value = text.slice(k, m);
        aend = m;
      }
      i = aend;
    }

    attrs.push({ name: aname, lower: aname.toLowerCase(), value, start: wsStart, end: aend });
  }

  return { name, lower: name.toLowerCase(), closing, selfClosing, start, end: i, attrs };
}

export function walkSvg(text: string): SvgStructure {
  const tags: SvgTag[] = [];
  const comments: SvgComment[] = [];
  const warnings: string[] = [];
  const n = text.length;
  let i = 0;
  let sawSvg = false;

  while (i < n) {
    const lt = text.indexOf('<', i);
    if (lt < 0) break;

    if (text.startsWith('<!--', lt)) {
      const close = text.indexOf('-->', lt + 4);
      if (close < 0) {
        warnings.push('An XML comment is not closed.');
        comments.push({ start: lt, end: n, text: text.slice(lt + 4) });
        break;
      }
      comments.push({ start: lt, end: close + 3, text: text.slice(lt + 4, close) });
      i = close + 3;
      continue;
    }

    if (text.startsWith('<![CDATA[', lt)) {
      const close = text.indexOf(']]>', lt + 9);
      i = close < 0 ? n : close + 3;
      continue;
    }

    if (text.startsWith('<?', lt)) {
      const close = text.indexOf('?>', lt + 2);
      i = close < 0 ? n : close + 2;
      continue;
    }

    if (text.startsWith('<!', lt)) {
      // DOCTYPE, which may carry an internal subset in square brackets.
      let j = lt + 2;
      let depth = 0;
      while (j < n) {
        const ch = text[j]!;
        if (ch === '[') depth++;
        else if (ch === ']') depth--;
        else if (ch === '>' && depth <= 0) {
          j++;
          break;
        }
        j++;
      }
      i = j;
      continue;
    }

    const tag = parseTag(text, lt);
    if (!tag) {
      i = lt + 1;
      continue;
    }
    if (tag.lower === 'svg' && !tag.closing) sawSvg = true;
    tags.push(tag);
    i = tag.end;
  }

  return { valid: sawSvg, tags, comments, warnings };
}

/** Range from an opening tag to its matching close, handling same-name nesting. */
export function elementRegion(tags: SvgTag[], index: number, textLength: number): Region {
  const open = tags[index]!;
  if (open.selfClosing) return { start: open.start, end: open.end };

  let depth = 1;
  for (let j = index + 1; j < tags.length; j++) {
    const t = tags[j]!;
    if (t.lower !== open.lower) continue;
    if (t.closing) {
      depth--;
      if (depth === 0) return { start: open.start, end: t.end };
    } else if (!t.selfClosing) {
      depth++;
    }
  }
  return { start: open.start, end: textLength };
}

export interface SvgEmbeddedImage {
  /** The href attribute carrying the data URI. */
  attr: SvgAttr;
  mime: string;
  /** Range of the base64 payload within the source text. */
  payload: Region;
  bytes: Uint8Array;
}

export interface SvgMetadata {
  metadataElements: Region[];
  titleElements: Region[];
  descElements: Region[];
  scriptElements: Region[];
  comments: SvgComment[];
  generatorComments: SvgComment[];
  editorAttrs: SvgAttr[];
  editorNamespaces: SvgAttr[];
  eventAttrs: SvgAttr[];
  remoteRefs: SvgAttr[];
  embeddedImages: SvgEmbeddedImage[];
  /** Raw XMP/RDF text, when a metadata element carries one. */
  xmpText?: string;
  /** Concatenated human-readable text, for the hidden-character scan. */
  textContent: string;
  warnings: string[];
}

function base64ToBytes(b64: string): Uint8Array | null {
  const clean = b64.replace(/\s+/g, '');
  try {
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
    return out;
  } catch {
    return null;
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

function isRemote(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v.startsWith('http://') || v.startsWith('https://') || v.startsWith('//');
}

export function collectSvgMetadata(text: string, structure: SvgStructure): SvgMetadata {
  const out: SvgMetadata = {
    metadataElements: [],
    titleElements: [],
    descElements: [],
    scriptElements: [],
    comments: structure.comments,
    generatorComments: structure.comments.filter((c) => GENERATOR_COMMENT.test(c.text)),
    editorAttrs: [],
    editorNamespaces: [],
    eventAttrs: [],
    remoteRefs: [],
    embeddedImages: [],
    textContent: '',
    warnings: [...structure.warnings],
  };

  const texts: string[] = structure.comments.map((c) => c.text);
  const { tags } = structure;

  for (let idx = 0; idx < tags.length; idx++) {
    const tag = tags[idx]!;
    if (tag.closing) continue;

    const local = tag.lower.includes(':') ? tag.lower.split(':').pop()! : tag.lower;

    if (local === 'metadata') {
      const region = elementRegion(tags, idx, text.length);
      out.metadataElements.push(region);
      const inner = text.slice(region.start, region.end);
      texts.push(inner.replace(/<[^>]*>/g, ' '));
      if (/xmpmeta|<rdf:RDF|xmlns:rdf/i.test(inner)) {
        out.xmpText = (out.xmpText ?? '') + inner;
      }
    } else if (local === 'xmpmeta') {
      const region = elementRegion(tags, idx, text.length);
      out.metadataElements.push(region);
      out.xmpText = (out.xmpText ?? '') + text.slice(region.start, region.end);
    } else if (local === 'title') {
      const region = elementRegion(tags, idx, text.length);
      out.titleElements.push(region);
      texts.push(text.slice(tag.end, region.end).replace(/<[^>]*>/g, ' '));
    } else if (local === 'desc') {
      const region = elementRegion(tags, idx, text.length);
      out.descElements.push(region);
      texts.push(text.slice(tag.end, region.end).replace(/<[^>]*>/g, ' '));
    } else if (local === 'script') {
      out.scriptElements.push(elementRegion(tags, idx, text.length));
    }

    for (const attr of tag.attrs) {
      const colon = attr.lower.indexOf(':');
      const prefix = colon > 0 ? attr.lower.slice(0, colon) : '';
      const localName = colon > 0 ? attr.lower.slice(colon + 1) : attr.lower;

      if (prefix === 'xmlns' && EDITOR_PREFIXES.includes(localName)) {
        out.editorNamespaces.push(attr);
        continue;
      }
      if (prefix && EDITOR_PREFIXES.includes(prefix)) {
        out.editorAttrs.push(attr);
        texts.push(attr.value);
        continue;
      }
      if (/^on[a-z]+$/.test(attr.lower)) {
        out.eventAttrs.push(attr);
        continue;
      }

      const isHref = localName === 'href' || attr.lower === 'src';
      if (isHref && attr.value.trim().toLowerCase().startsWith('data:image/')) {
        const raw = attr.value.trim();
        const comma = raw.indexOf(',');
        const header = raw.slice(0, comma < 0 ? raw.length : comma);
        if (comma > 0 && /;base64/i.test(header)) {
          const mime = header.slice('data:'.length).split(';')[0] ?? '';
          const b64 = raw.slice(comma + 1);
          const bytes = base64ToBytes(b64);
          if (bytes) {
            // Locate the payload inside the attribute's own range only, so a
            // repeated base64 prefix elsewhere in the file cannot be matched.
            const valueStart = text.indexOf(raw.slice(0, Math.min(32, raw.length)), attr.start);
            const payloadStart =
              valueStart >= 0 && valueStart < attr.end ? valueStart + comma + 1 : -1;
            if (payloadStart > 0) {
              out.embeddedImages.push({
                attr,
                mime,
                payload: { start: payloadStart, end: payloadStart + b64.length },
                bytes,
              });
            } else {
              out.warnings.push('An embedded image could not be located precisely and was left alone.');
            }
          } else {
            out.warnings.push('An embedded image had unreadable base64 data.');
          }
        }
        continue;
      }

      if ((isHref || attr.lower === 'src') && isRemote(attr.value)) {
        out.remoteRefs.push(attr);
      } else if (/url\(\s*['"]?(https?:)?\/\//i.test(attr.value)) {
        out.remoteRefs.push(attr);
      }
    }
  }

  out.textContent = texts.join('\n');
  return out;
}

/** Convenience wrapper used by the scanner. */
export function readSvg(bytes: Uint8Array): { text: string; structure: SvgStructure; meta: SvgMetadata } | { error: string } {
  const decoded = decodeSvg(bytes);
  if (!decoded.ok) return { error: decoded.reason };
  const structure = walkSvg(decoded.text);
  if (!structure.valid) return { error: 'This file does not contain an <svg> element.' };
  return { text: decoded.text, structure, meta: collectSvgMetadata(decoded.text, structure) };
}

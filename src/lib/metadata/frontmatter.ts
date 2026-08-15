/**
 * Markdown document-metadata locator.
 *
 * Markdown files are hand-edited source. Parsing the YAML and re-serialising it
 * would silently reorder keys, restyle quotes, normalise indentation and rewrite
 * line endings — handing the user back a file that produces a noisy diff in
 * their repo. So this finds *byte ranges* and the cleaner deletes them; every
 * byte we did not deliberately remove comes through untouched.
 *
 * That means this is a locator, not a parser. It needs to know where a key
 * begins and ends, not what it means. When it cannot determine an entry's
 * extent with confidence it says so, and the entry is reported as found but not
 * removable — the honesty rule applied to a parser's limits.
 */

export interface Region {
  start: number;
  end: number;
}

export type FrontmatterRole = 'ai' | 'tool' | 'author' | 'timestamp' | 'other';

export interface FrontmatterKey {
  /** Dotted path, e.g. `ai.model`. */
  path: string;
  /** Leaf key, lowercased. */
  key: string;
  value: string;
  role: FrontmatterRole;
  /** Range of the whole entry, including its trailing newline. */
  start: number;
  end: number;
  /** False when the entry's extent could not be determined safely. */
  confident: boolean;
}

export interface Frontmatter {
  /** The whole block, both fences included. */
  region: Region;
  keys: FrontmatterKey[];
  /** True when YAML features make surgical removal unsafe. See below. */
  unsafe: boolean;
}

/**
 * Keys that describe how the document was *made*, rather than what it says.
 * Deliberately excludes `title`, `description`, `tags`, `slug`, `layout` and
 * friends: those are the document's own content and drive the user's site
 * build. Removing them would break the file rather than clean it.
 */
const ROLES: Readonly<Record<string, FrontmatterRole>> = {
  ai: 'ai',
  ai_generated: 'ai',
  'ai-generated': 'ai',
  aigenerated: 'ai',
  ai_model: 'ai',
  generated_by: 'ai',
  'generated-by': 'ai',
  generatedby: 'ai',
  model: 'ai',
  prompt: 'ai',
  prompts: 'ai',
  negative_prompt: 'ai',
  system_prompt: 'ai',
  llm: 'ai',
  assistant: 'ai',
  chatgpt: 'ai',
  claude: 'ai',
  gpt: 'ai',
  copilot: 'ai',
  midjourney: 'ai',
  stable_diffusion: 'ai',
  seed: 'ai',
  sampler: 'ai',
  cfg_scale: 'ai',

  generator: 'tool',
  tool: 'tool',
  software: 'tool',
  engine: 'tool',
  exported_by: 'tool',
  'exported-by': 'tool',
  editor: 'tool',

  author: 'author',
  authors: 'author',
  creator: 'author',
  creators: 'author',
  byline: 'author',
  contributor: 'author',
  copyright: 'author',
  rights: 'author',

  date: 'timestamp',
  created: 'timestamp',
  created_at: 'timestamp',
  createdat: 'timestamp',
  updated: 'timestamp',
  updated_at: 'timestamp',
  modified: 'timestamp',
  lastmod: 'timestamp',
  publishdate: 'timestamp',
  published: 'timestamp',
  pubdate: 'timestamp',
  datepublished: 'timestamp',
  datemodified: 'timestamp',
};

export function roleFor(key: string): FrontmatterRole {
  return ROLES[key.toLowerCase()] ?? 'other';
}

const KEY_LINE = /^(\s*)([A-Za-z_][A-Za-z0-9_.-]*)\s*:(.*)$/;

interface Line {
  start: number;
  /** Index just past the line's terminator. */
  end: number;
  text: string;
}

function splitLines(text: string, from: number, to: number): Line[] {
  const out: Line[] = [];
  let i = from;
  while (i < to) {
    let nl = text.indexOf('\n', i);
    if (nl < 0 || nl >= to) nl = to;
    const hasCr = nl > i && text[nl - 1] === '\r';
    out.push({ start: i, end: Math.min(nl + 1, to), text: text.slice(i, hasCr ? nl - 1 : nl) });
    i = nl + 1;
  }
  return out;
}

/**
 * Locate the leading `---` fenced block, if there is one.
 *
 * Only a block at the very start of the file counts — a `---` further down is a
 * horizontal rule, and treating it as frontmatter would delete the user's prose.
 */
export function locateFrontmatter(text: string): Frontmatter | null {
  const body = text.startsWith('﻿') ? text.slice(1) : text;
  const offset = text.length - body.length;

  const first = /^---[ \t]*\r?\n/.exec(body);
  if (!first) return null;

  const contentStart = offset + first[0].length;
  const close = /\r?\n(---|\.\.\.)[ \t]*(\r?\n|$)/.exec(text.slice(contentStart));
  if (!close) return null;

  const contentEnd = contentStart + close.index + (close[0].startsWith('\r') ? 2 : 1);
  const blockEnd = contentStart + close.index + close[0].length;

  const inner = text.slice(contentStart, contentEnd);

  /*
   * YAML anchors, aliases and merge keys make one entry depend on another, so
   * deleting a key can silently change the value of a key we kept. We can still
   * report what is there, but we must not rewrite it.
   */
  const unsafe = /(^|\s)[&*][A-Za-z_]/.test(inner) || /^\s*<<\s*:/m.test(inner);

  const lines = splitLines(text, contentStart, contentEnd);
  const keys: FrontmatterKey[] = [];
  const stack: { indent: number; name: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = KEY_LINE.exec(line.text);
    if (!m) continue;

    const indent = m[1]!.length;
    const name = m[2]!;
    const rest = m[3]!.trim();

    while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) stack.pop();

    // The entry runs until the next key line at the same or shallower
    // indentation. That covers nested maps, `- item` lists and `|`/`>` block
    // scalars without needing to understand any of them.
    let end = lines[lines.length - 1]!.end;
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j]!;
      const nm = KEY_LINE.exec(next.text);
      if (nm && nm[1]!.length <= indent) {
        end = next.start;
        break;
      }
      if (j === lines.length - 1) end = next.end;
    }

    const path = [...stack.map((s) => s.name), name].join('.');
    stack.push({ indent, name });

    keys.push({
      path,
      key: name.toLowerCase(),
      value: rest,
      role: roleFor(name),
      start: line.start,
      end,
      confident: !unsafe,
    });
  }

  return { region: { start: offset, end: blockEnd }, keys, unsafe };
}

export interface HtmlMetaFinding extends Region {
  name: string;
  content: string;
}

export interface MarkdownMetadata {
  frontmatter: Frontmatter | null;
  comments: Region[];
  commentText: string[];
  jsonLd: Region[];
  jsonLdText: string[];
  metaTags: HtmlMetaFinding[];
}

const COMMENT_META = /generat|created\s+with|produced\s+by|exported|written\s+by|\bai\b|model|prompt/i;

export function collectMarkdownMetadata(text: string): MarkdownMetadata {
  const frontmatter = locateFrontmatter(text);
  const fmEnd = frontmatter?.region.end ?? 0;

  const comments: Region[] = [];
  const commentText: string[] = [];
  const jsonLd: Region[] = [];
  const jsonLdText: string[] = [];
  const metaTags: HtmlMetaFinding[] = [];

  // HTML comments, anywhere outside the frontmatter block.
  const commentRe = /<!--([\s\S]*?)-->/g;
  for (let m = commentRe.exec(text); m; m = commentRe.exec(text)) {
    if (m.index < fmEnd) continue;
    const inner = m[1]!;
    if (!COMMENT_META.test(inner)) continue;
    comments.push({ start: m.index, end: m.index + m[0].length });
    commentText.push(inner.trim());
  }

  const ldRe = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;
  for (let m = ldRe.exec(text); m; m = ldRe.exec(text)) {
    jsonLd.push({ start: m.index, end: m.index + m[0].length });
    jsonLdText.push(m[1]!.trim());
  }

  const metaRe = /<meta\b[^>]*>/gi;
  for (let m = metaRe.exec(text); m; m = metaRe.exec(text)) {
    const tag = m[0];
    const name = /\bname\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    if (!name) continue;
    if (roleFor(name) === 'other') continue;
    const content = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
    metaTags.push({ start: m.index, end: m.index + tag.length, name, content });
  }

  return { frontmatter, comments, commentText, jsonLd, jsonLdText, metaTags };
}

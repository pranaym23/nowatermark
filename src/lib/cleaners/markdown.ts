/**
 * Markdown cleaner.
 *
 * Deletes byte ranges and copies everything else through. No reserialise step,
 * so CRLF stays CRLF, indentation is preserved, and a file with no trailing
 * newline still has none.
 *
 * What it removes is deliberately narrower than for an image: a Markdown file's
 * frontmatter is *functional* — `title`, `tags` and `layout` drive the user's
 * site build. Only keys describing how the document was made are removed. See
 * `ROLES` in `../metadata/frontmatter.ts`.
 */

import { cleanHiddenCharacters } from '../unicode/hidden';
import { collectMarkdownMetadata, type Region } from '../metadata/frontmatter';
import type { CleanContext, RawCleanOutcome } from './types';

const REMOVED_ROLES = new Set(['ai', 'tool', 'author', 'timestamp']);

function applyDeletions(text: string, ranges: Region[]): string {
  if (ranges.length === 0) return text;
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: string[] = [];
  let cursor = 0;
  for (const r of sorted) {
    if (r.start < cursor) continue;
    out.push(text.slice(cursor, r.start));
    cursor = r.end;
  }
  out.push(text.slice(cursor));
  return out.join('');
}

export function cleanMarkdownBytes(bytes: Uint8Array, _ctx: CleanContext): RawCleanOutcome {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return {
      ok: false,
      warnings: ['This file is not valid UTF-8 text, so we cannot rewrite it safely.'],
    };
  }

  const meta = collectMarkdownMetadata(text);
  const warnings: string[] = [];
  const ranges: Region[] = [];

  const fm = meta.frontmatter;
  if (fm?.unsafe) {
    warnings.push(
      'This file uses YAML anchors or merge keys, where one setting can depend on another. Removing a key could silently change one we kept, so the frontmatter was left as it is.',
    );
  } else if (fm) {
    const removed = fm.keys.filter((k) => REMOVED_ROLES.has(k.role) && k.confident);
    for (const key of removed) ranges.push({ start: key.start, end: key.end });

    if (removed.length > 0) {
      const names = removed.map((k) => k.path).join(', ');
      warnings.push(
        `Removed ${removed.length} frontmatter ${removed.length === 1 ? 'key' : 'keys'}: ${names}. Your title, tags and layout settings were left alone.`,
      );
    }

    // If every key went, the fences are an empty block — take them too.
    const survivors = fm.keys.filter((k) => !removed.includes(k));
    if (fm.keys.length > 0 && survivors.length === 0) {
      ranges.length = 0;
      ranges.push(fm.region);
    }
  }

  for (const r of meta.comments) ranges.push(r);
  for (const r of meta.jsonLd) ranges.push(r);
  for (const r of meta.metaTags) ranges.push(r);

  if (meta.jsonLd.length > 0) {
    warnings.push(
      `Removed ${meta.jsonLd.length} structured-data block${meta.jsonLd.length === 1 ? '' : 's'}. These carry author and publisher details for search engines; add them back if your site needs them.`,
    );
  }

  const stripped = applyDeletions(text, ranges);

  // Hidden characters are removed from the prose itself, using the same engine
  // the pasted-text tool uses.
  const unicode = cleanHiddenCharacters(stripped);
  if (unicode.removed > 0) {
    warnings.push(
      `Removed ${unicode.removed} invisible character${unicode.removed === 1 ? '' : 's'} from the text.`,
    );
  }

  return { ok: true, bytes: new TextEncoder().encode(unicode.text), warnings };
}

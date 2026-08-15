import { describe, expect, it } from 'vitest';

import { cleanImage } from '../src/lib/clean';
import { detectType } from '../src/lib/filetype';
import { locateFrontmatter } from '../src/lib/metadata/frontmatter';
import { scanImage } from '../src/lib/scan';
import { allSignals, type ScanResult } from '../src/lib/types';

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

const input = (name = 'post.md', size = 0) => ({ name, type: 'text/markdown', size });

function statusOf(result: ScanResult, id: string) {
  return allSignals(result).find((s) => s.id === id)?.status;
}

async function cleanText(source: string, name = 'post.md'): Promise<string> {
  const bytes = enc(source);
  const outcome = await cleanImage(bytes, input(name, bytes.length));
  if (!outcome.result.blob) throw new Error(outcome.result.warnings.join('; '));
  return dec(new Uint8Array(await outcome.result.blob.arrayBuffer()));
}

const LOADED = `---
title: My Post
tags:
  - writing
  - notes
author: Jane Doe
date: 2026-08-13
generator: ChatGPT
ai_generated: true
prompt: |
  write me a blog post about
  the history of the stapler
layout: post
---

# My Post

Some prose that must survive.
`;

describe('detecting text files', () => {
  it('treats UTF-8 text with no control bytes as Markdown', () => {
    expect(detectType(enc(LOADED))).toBe('markdown');
  });

  it('still reports unknown for binary padding', () => {
    expect(detectType(new Uint8Array(64))).toBe('unknown');
  });

  // The binary signatures need 12 bytes; text does not. Gating both on that
  // floor made short files undetectable, which broke the clean pipeline's own
  // re-scan and failed the whole clean.
  it('detects text shorter than the binary-signature floor', () => {
    expect(detectType(enc('hi\n'))).toBe('markdown');
    expect(detectType(enc('# T\n'))).toBe('markdown');
  });

  it('does not mistake a real image for text', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(detectType(png)).toBe('png');
  });
});

describe('frontmatter locator', () => {
  it('ignores a --- that is a horizontal rule rather than a fence', () => {
    expect(locateFrontmatter('# Title\n\n---\n\nsome text\n')).toBeNull();
  });

  it('finds nested keys with their dotted path', () => {
    const fm = locateFrontmatter('---\nai:\n  model: gpt-4\n  seed: 12\n---\n')!;
    expect(fm.keys.map((k) => k.path)).toEqual(['ai', 'ai.model', 'ai.seed']);
  });

  it('spans a block scalar to its full extent', () => {
    const fm = locateFrontmatter(LOADED)!;
    const prompt = fm.keys.find((k) => k.key === 'prompt')!;
    const slice = LOADED.slice(prompt.start, prompt.end);
    expect(slice).toContain('history of the stapler');
    expect(slice).not.toContain('layout');
  });

  it('spans a list value without swallowing the next key', () => {
    const fm = locateFrontmatter(LOADED)!;
    const tags = fm.keys.find((k) => k.key === 'tags')!;
    const slice = LOADED.slice(tags.start, tags.end);
    expect(slice).toContain('- notes');
    expect(slice).not.toContain('author');
  });
});

describe('scanning Markdown', () => {
  it('reports the provenance keys it recognises', async () => {
    const result = await scanImage(enc(LOADED), input());
    expect(result.file.format).toBe('markdown');
    expect(statusOf(result, 'ai-generator')).toBe('detected');
    expect(statusOf(result, 'author')).toBe('detected');
    expect(statusOf(result, 'timestamp')).toBe('detected');
    expect(statusOf(result, 'software')).toBe('detected');
  });

  it('keeps statistical text watermarks permanently unverifiable', async () => {
    const result = await scanImage(enc(LOADED), input());
    expect(statusOf(result, 'claude-watermark')).toBe('unable_to_verify');
  });

  it('does not render image-only rows against a text file', async () => {
    const result = await scanImage(enc(LOADED), input());
    expect(statusOf(result, 'exif')).toBeUndefined();
    expect(statusOf(result, 'icc')).toBeUndefined();
    expect(statusOf(result, 'gps')).toBeUndefined();
  });

  it('finds hidden Unicode in the prose', async () => {
    const result = await scanImage(enc('hello​world⁠!'), input());
    expect(statusOf(result, 'hidden-unicode')).toBe('detected');
  });
});

describe('cleaning Markdown', () => {
  it('removes provenance keys and leaves the content keys alone', async () => {
    const out = await cleanText(LOADED);

    expect(out).not.toContain('generator:');
    expect(out).not.toContain('ai_generated:');
    expect(out).not.toContain('author:');
    expect(out).not.toContain('date:');
    expect(out).not.toContain('history of the stapler');

    // The document's own frontmatter drives the user's site build.
    expect(out).toContain('title: My Post');
    expect(out).toContain('layout: post');
    expect(out).toContain('- writing');
    expect(out).toContain('# My Post');
    expect(out).toContain('Some prose that must survive.');
  });

  it('verifies removal by re-scanning', async () => {
    const bytes = enc(LOADED);
    const outcome = await cleanImage(bytes, input('post.md', bytes.length));
    expect(statusOf(outcome.after!, 'ai-generator')).toBe('not_detected');
    expect(statusOf(outcome.after!, 'author')).toBe('not_detected');
    expect(outcome.result.removedSignals).toContain('author');
  });

  /* The formatting trap: a noisy diff is a defect even when nothing is lost. */

  it('preserves CRLF line endings exactly', async () => {
    const crlf = LOADED.replace(/\n/g, '\r\n');
    const out = await cleanText(crlf);
    expect(out).toContain('\r\n');
    expect(out).not.toMatch(/[^\r]\n/);
  });

  it('preserves the absence of a trailing newline', async () => {
    const out = await cleanText('---\nauthor: Jane\ntitle: T\n---\n\nbody');
    expect(out.endsWith('body')).toBe(true);
  });

  it('changes nothing at all in a file with no metadata', async () => {
    const plain = '# Hello\n\nJust prose.\n\n---\n\nMore prose.\n';
    expect(await cleanText(plain)).toBe(plain);
  });

  it('leaves every other byte identical when removing one key', async () => {
    const source = '---\ntitle: Keep\nauthor: Remove\nlayout: keep\n---\n\nBody\n';
    const out = await cleanText(source);
    expect(out).toBe('---\ntitle: Keep\nlayout: keep\n---\n\nBody\n');
  });

  it('drops the fences when every key was removed', async () => {
    const out = await cleanText('---\nauthor: Jane\ndate: 2026-01-01\n---\n\nBody\n');
    expect(out).toBe('\nBody\n');
  });

  /* Honesty: report what we cannot safely rewrite rather than guessing. */

  it('refuses to rewrite frontmatter that uses YAML anchors', async () => {
    const anchored = '---\ndefaults: &base\n  author: Jane\npost:\n  <<: *base\n---\n\nBody\n';
    const result = await scanImage(enc(anchored), input());
    expect(result.warnings.join(' ')).toContain('anchors');

    const out = await cleanText(anchored);
    expect(out).toContain('&base');
    expect(out).toContain('author: Jane');
  });

  it('removes generator comments and structured data', async () => {
    const source = '# Post\n\n<!-- generated by ChatGPT on Tuesday -->\n\n<script type="application/ld+json">{"author":"Jane"}</script>\n\nBody\n';
    const out = await cleanText(source);
    expect(out).not.toContain('generated by');
    expect(out).not.toContain('ld+json');
    expect(out).toContain('Body');
  });

  it('keeps a comment that is not a metadata breadcrumb', async () => {
    const source = '# Post\n\n<!-- TODO: rewrite this section -->\n\nBody\n';
    expect(await cleanText(source)).toBe(source);
  });

  it('strips hidden Unicode from the prose', async () => {
    const out = await cleanText('# Post\n\nhello​world\n');
    expect(out).toBe('# Post\n\nhelloworld\n');
  });

  it('names the download with an .md extension', async () => {
    const bytes = enc(LOADED);
    const outcome = await cleanImage(bytes, input('my-post.md', bytes.length));
    expect(outcome.filename).toBe('my-post-clean.md');
  });

  it('cleaning a second time is a no-op', async () => {
    const once = await cleanText(LOADED);
    expect(await cleanText(once, 'post-clean.md')).toBe(once);
  });
});

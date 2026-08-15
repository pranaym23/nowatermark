import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_REWRITE_CHARS,
  REWRITE_ENDPOINT,
  requestRewrite,
  rewritePayloadPreview,
} from '../src/lib/rewrite';
import { SIGNALS } from '../src/lib/signals';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl: (url: string, init: RequestInit) => Response) {
  const spy = vi.fn(async (url: string, init: RequestInit) => impl(url, init));
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('the rewrite boundary', () => {
  /*
   * The load-bearing guarantee: rewriting can never be reported as removal,
   * because we have no detector and cannot confirm it worked. CLAUDE.md
   * non-negotiable #4.
   */
  it('keeps statistical text watermarks unremovable in the capability matrix', () => {
    expect(SIGNALS.claudeWatermark.remove).toBe(false);
    expect(SIGNALS.claudeWatermark.verify).toBe(false);
    expect(SIGNALS.claudeWatermark.detect).toBe(false);
  });

  it('sends only the text and the mode — never a file, name or hash', async () => {
    const spy = stubFetch(() => new Response(JSON.stringify({ text: 'out' }), { status: 200 }));
    await requestRewrite({ text: 'hello', mode: 'paraphrase' });

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe(REWRITE_ENDPOINT);

    // Exactly two keys when there is no Turnstile token — JSON.stringify drops
    // the undefined one, so nothing extra rides along.
    const body = JSON.parse(String(init.body));
    expect(Object.keys(body).sort()).toEqual(['mode', 'text']);
    expect(body.text).toBe('hello');
  });

  it('goes to our own origin, not to Google directly', async () => {
    const spy = stubFetch(() => new Response(JSON.stringify({ text: 'out' }), { status: 200 }));
    await requestRewrite({ text: 'hello', mode: 'paraphrase' });

    const [url] = spy.mock.calls[0]!;
    expect(String(url).startsWith('/')).toBe(true);
    expect(String(url)).not.toContain('googleapis.com');
  });

  it('never sends credentials to the proxy', async () => {
    const spy = stubFetch(() => new Response(JSON.stringify({ text: 'out' }), { status: 200 }));
    await requestRewrite({ text: 'hello', mode: 'paraphrase' });
    expect(spy.mock.calls[0]![1].credentials).toBe('omit');
  });

  it('shows the consent UI exactly what will be sent', () => {
    const preview = rewritePayloadPreview({ text: 'secret words', mode: 'humanize' });
    expect(preview).toContain('secret words');
    expect(preview).toContain('humanize');
    expect(JSON.parse(preview)).toEqual({ text: 'secret words', mode: 'humanize' });
  });

  it('refuses over-long text before anything leaves the device', async () => {
    const spy = stubFetch(() => new Response('{}', { status: 200 }));
    const result = await requestRewrite({
      text: 'x'.repeat(MAX_REWRITE_CHARS + 1),
      mode: 'paraphrase',
    });

    expect(result.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('refuses empty text before anything leaves the device', async () => {
    const spy = stubFetch(() => new Response('{}', { status: 200 }));
    const result = await requestRewrite({ text: '   ', mode: 'paraphrase' });

    expect(result.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('reports a failure rather than returning the original as if rewritten', async () => {
    stubFetch(() => new Response(JSON.stringify({ error: 'nope' }), { status: 502 }));
    const result = await requestRewrite({ text: 'hello', mode: 'paraphrase' });

    expect(result).toEqual({ ok: false, error: 'nope' });
  });

  it('treats a malformed success body as a failure', async () => {
    stubFetch(() => new Response('not json', { status: 200 }));
    const result = await requestRewrite({ text: 'hello', mode: 'paraphrase' });
    expect(result.ok).toBe(false);
  });

  it('survives a network error without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));
    const result = await requestRewrite({ text: 'hello', mode: 'paraphrase' });
    expect(result.ok).toBe(false);
  });
});

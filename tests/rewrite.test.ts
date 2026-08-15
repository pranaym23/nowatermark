import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_REWRITE_CHARS,
  REWRITE_ENDPOINT,
  requestRewrite,
  rewritePayloadPreview,
} from '../src/lib/rewrite';
import { SIGNALS } from '../src/lib/signals';
import { RULES, checkRateLimit } from '../functions/api/_rate-limit';

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

/*
 * Rate limiting (item 7).
 *
 * This guards spend on a paid API key, so its failure modes matter: it must
 * block a burst, recover afterwards, and never grow without bound when a flood
 * of distinct addresses hits it.
 */
describe('rewrite rate limiting', () => {
  it('allows a normal burst and then blocks, with a usable retry-after', async () => {
    const env = {};
    const ip = '203.0.113.7';
    const results = [];
    for (let i = 0; i < RULES[0]!.max + 2; i++) {
      results.push(await checkRateLimit(env, ip));
    }

    const allowed = results.filter((r) => r.allowed).length;
    expect(allowed).toBe(RULES[0]!.max);

    const blocked = results[results.length - 1]!;
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.retryAfter).toBeLessThanOrEqual(RULES[0]!.windowSeconds);
  });

  it('keeps separate addresses independent', async () => {
    const env = {};
    for (let i = 0; i < RULES[0]!.max; i++) await checkRateLimit(env, '198.51.100.1');
    expect((await checkRateLimit(env, '198.51.100.1')).allowed).toBe(false);
    expect((await checkRateLimit(env, '198.51.100.2')).allowed).toBe(true);
  });

  it('treats a missing IP as one bucket rather than as a bypass', async () => {
    const env = {};
    const outcomes = [];
    for (let i = 0; i < RULES[0]!.max + 1; i++) outcomes.push(await checkRateLimit(env, null));
    expect(outcomes.some((r) => !r.allowed)).toBe(true);
  });

  it('uses KV when it is bound, so the limit survives across isolates', async () => {
    const store = new Map<string, string>();
    const env = {
      REWRITE_LIMITS: {
        get: async (k: string) => store.get(k) ?? null,
        put: async (k: string, v: string) => void store.set(k, v),
        delete: async (k: string) => void store.delete(k),
      },
    };

    const first = await checkRateLimit(env, '192.0.2.9');
    expect(first.tier).toBe('kv');
    expect(store.size).toBeGreaterThan(0);

    for (let i = 0; i < RULES[0]!.max + 2; i++) await checkRateLimit(env, '192.0.2.9');
    expect((await checkRateLimit(env, '192.0.2.9')).allowed).toBe(false);
  });

  it('falls back to the weaker check when KV throws, rather than failing open', async () => {
    const env = {
      REWRITE_LIMITS: {
        get: async () => { throw new Error('KV down'); },
        put: async () => { throw new Error('KV down'); },
        delete: async () => { throw new Error('KV down'); },
      },
    };
    const r = await checkRateLimit(env, '192.0.2.50');
    expect(r.tier).toBe('memory');
    expect(r.allowed).toBe(true);
  });
});

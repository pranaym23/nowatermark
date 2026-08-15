/**
 * Per-IP rate limiting for the rewrite endpoint.
 *
 * Turnstile proves a request came from a browser. It does not stop one real
 * browser from asking two thousand times, and every one of those calls spends
 * money on our Gemini key. This is the second layer.
 *
 * Two tiers, because Pages Functions have no shared memory:
 *
 *   1. **KV, when `REWRITE_LIMITS` is bound.** Durable and shared across
 *      isolates and regions, so the limit is real.
 *   2. **Per-isolate memory, always.** A floor for deployments with no KV
 *      binding. Cloudflare runs many isolates, so an attacker spread across
 *      them gets proportionally more — this narrows the hole, it does not close
 *      it. Do not describe it as a rate limit without that caveat.
 *
 * Deliberately *not* fail-closed, unlike the Turnstile secret. A missing bot
 * check means the key is exposed to the open internet, so refusing to run is
 * correct there. A missing KV binding means the limit is weaker, not absent,
 * and taking the feature offline for everyone because the operator has not
 * created a namespace yet would be a worse trade. The health endpoint reports
 * which tier is active so this is visible rather than assumed.
 */

export interface RateLimitEnv {
  /** Optional KV namespace. Bind it in the Pages dashboard to get real limits. */
  REWRITE_LIMITS?: KVNamespace;
}

export interface RateLimitRule {
  /** Window length in seconds. */
  windowSeconds: number;
  /** Requests allowed per IP within the window. */
  max: number;
}

/**
 * Two windows, because they stop different things: a burst, and a slow drip
 * that would still cost real money over a day.
 */
export const RULES: readonly RateLimitRule[] = [
  { windowSeconds: 60, max: 5 },
  { windowSeconds: 60 * 60 * 24, max: 100 },
];

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller may retry. Only meaningful when blocked. */
  retryAfter: number;
  /** Which tier actually enforced this — surfaced so it is never assumed. */
  tier: 'kv' | 'memory';
}

/**
 * Per-isolate counters. Bounded so a flood of distinct IPs cannot grow this
 * without limit — an unbounded Map here would turn a rate limiter into a
 * memory-exhaustion vector.
 */
const MEMORY = new Map<string, number[]>();
const MEMORY_MAX_KEYS = 10_000;

function memoryCheck(ip: string, now: number): RateLimitResult {
  if (MEMORY.size > MEMORY_MAX_KEYS) MEMORY.clear();

  const longest = Math.max(...RULES.map((r) => r.windowSeconds));
  const hits = (MEMORY.get(ip) ?? []).filter((t) => now - t < longest * 1000);

  for (const rule of RULES) {
    const inWindow = hits.filter((t) => now - t < rule.windowSeconds * 1000);
    if (inWindow.length >= rule.max) {
      const oldest = Math.min(...inWindow);
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((rule.windowSeconds * 1000 - (now - oldest)) / 1000)),
        tier: 'memory',
      };
    }
  }

  hits.push(now);
  MEMORY.set(ip, hits);
  return { allowed: true, retryAfter: 0, tier: 'memory' };
}

async function kvCheck(
  kv: KVNamespace,
  ip: string,
  now: number,
): Promise<RateLimitResult> {
  for (const rule of RULES) {
    // One bucket per window, so an expiring key cleans itself up.
    const bucket = Math.floor(now / 1000 / rule.windowSeconds);
    const key = `rl:${ip}:${rule.windowSeconds}:${bucket}`;

    const current = Number((await kv.get(key)) ?? '0');
    if (current >= rule.max) {
      const elapsed = (now / 1000) % rule.windowSeconds;
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil(rule.windowSeconds - elapsed)),
        tier: 'kv',
      };
    }

    /*
     * Read-modify-write, which KV cannot make atomic. Two simultaneous requests
     * can therefore both read the same count and each write count+1, losing one
     * increment. That is an acceptable failure for this purpose: the worst case
     * is a caller occasionally getting one extra request through, and the
     * alternative is a Durable Object, which is server compute this project
     * does not permit. It must not be relied on for anything where an exact
     * count matters.
     */
    await kv.put(key, String(current + 1), { expirationTtl: rule.windowSeconds + 60 });
  }

  return { allowed: true, retryAfter: 0, tier: 'kv' };
}

export async function checkRateLimit(
  env: RateLimitEnv,
  ip: string | null,
): Promise<RateLimitResult> {
  const now = Date.now();
  // No IP means we cannot attribute the request; treat every such caller as one
  // bucket rather than letting them bypass the limit entirely.
  const key = ip && ip.length > 0 ? ip : 'unknown';

  if (env.REWRITE_LIMITS) {
    try {
      return await kvCheck(env.REWRITE_LIMITS, key, now);
    } catch {
      // KV unavailable: fall through to the weaker check rather than either
      // failing open or taking the feature down.
    }
  }
  return memoryCheck(key, now);
}

/**
 * Minimal ambient types for Cloudflare Pages Functions.
 *
 * Declared here rather than pulling in `@cloudflare/workers-types`: this project
 * has exactly one server-side file and the surface it uses is four lines. A
 * dependency for that would be worse than the declaration.
 */

interface PagesFunctionContext<Env = unknown> {
  request: Request;
  env: Env;
  params: Record<string, string | string[]>;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  waitUntil: (promise: Promise<unknown>) => void;
}

type PagesFunction<Env = unknown> = (
  context: PagesFunctionContext<Env>,
) => Response | Promise<Response>;

/**
 * Only the three KV operations the rate limiter uses. Same reasoning as above:
 * the real namespace type has a much larger surface, and importing a dependency
 * to describe three calls would cost more than it explains.
 */
interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

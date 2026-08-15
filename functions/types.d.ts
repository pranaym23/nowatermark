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

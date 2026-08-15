/**
 * Client for the text-rewriting proxy.
 *
 * This is the one place in `src/lib/` that touches the network, and it does so
 * only with text the user explicitly chose to send, for one explicitly chosen
 * action. Everything else in this directory is pure local computation and must
 * stay that way.
 *
 * What this cannot do, and must never claim to: verify that a rewrite defeated
 * anything. There is no client-side detector for a statistical text watermark,
 * so a rewritten document is *changed*, not *cleaned*. The caller reports it as
 * `rewritten_unverified`.
 */

export type RewriteMode = 'paraphrase' | 'humanize';

export interface RewriteRequest {
  text: string;
  mode: RewriteMode;
  turnstileToken?: string;
}

export type RewriteResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

/** Mirrors MAX_INPUT_CHARS in functions/api/rewrite.ts. */
export const MAX_REWRITE_CHARS = 12_000;

export const REWRITE_ENDPOINT = '/api/rewrite';

/**
 * Exactly what leaves the device, as a string, so the consent UI can show the
 * user the real payload rather than a description of it.
 */
export function rewritePayloadPreview(req: RewriteRequest): string {
  return JSON.stringify({ text: req.text, mode: req.mode }, null, 2);
}

export async function requestRewrite(req: RewriteRequest): Promise<RewriteResult> {
  if (req.text.trim().length === 0) {
    return { ok: false, error: 'There is no text to rewrite.' };
  }
  if (req.text.length > MAX_REWRITE_CHARS) {
    return {
      ok: false,
      error: `That text is too long to rewrite. The limit is ${MAX_REWRITE_CHARS.toLocaleString()} characters.`,
    };
  }

  try {
    const res = await fetch(REWRITE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Same-origin only; never send credentials to the proxy.
      credentials: 'omit',
      body: JSON.stringify({
        text: req.text,
        mode: req.mode,
        turnstileToken: req.turnstileToken,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
    if (!res.ok || typeof data.text !== 'string') {
      return { ok: false, error: data.error ?? 'The rewriting service could not be reached.' };
    }
    return { ok: true, text: data.text };
  } catch {
    return { ok: false, error: 'The rewriting service could not be reached.' };
  }
}

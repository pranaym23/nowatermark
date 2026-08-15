/**
 * Text-rewriting proxy — the ONLY server-side code in this project.
 *
 * Why it exists: statistical text watermarks are encoded in word choice, so the
 * only known way to disrupt one is to reword the text, which needs a language
 * model. The API key cannot ship in client JavaScript — it would be public and
 * drained within days — so the call has to be made from somewhere the key can
 * stay secret.
 *
 * What it must never become: a path for file data. This endpoint accepts a
 * string the user explicitly chose to send, and nothing else. It does not
 * accept files, filenames, hashes or metadata, and it must never be extended to.
 * See CLAUDE.md, non-negotiable #1.
 *
 * It logs no request bodies. It stores nothing.
 */

interface Env {
  /** Google AI Studio key. Set as a Pages secret; never in the repo. */
  GEMINI_API_KEY?: string;
  /** Turnstile secret for the bot check. */
  TURNSTILE_SECRET_KEY?: string;
}

const MODEL = 'gemini-3.5-flash-lite';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/** Well below MAX_TEXT_LENGTH: rewriting is a different cost profile to scanning. */
const MAX_INPUT_CHARS = 12_000;

type Mode = 'paraphrase' | 'humanize';

const PROMPTS: Record<Mode, string> = {
  paraphrase:
    'Rewrite the text below so the wording is substantially different while the meaning, facts, tone and approximate length are preserved. Change sentence structure and word choice throughout. Do not add commentary, headings or quotation marks. Return only the rewritten text.',
  humanize:
    'Rewrite the text below in a more natural, varied human register. Vary sentence length, avoid formulaic transitions, and keep every fact and the overall meaning intact. Do not add commentary. Return only the rewritten text.',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
  });
}

async function verifyTurnstile(token: string, secret: string, ip: string | null): Promise<boolean> {
  try {
    const body = new FormData();
    body.append('secret', secret);
    body.append('response', token);
    if (ip) body.append('remoteip', ip);

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!env.GEMINI_API_KEY) {
    return json({ error: 'Rewriting is not configured on this deployment.' }, 503);
  }

  /*
   * Fail closed.
   *
   * An endpoint that spends our API key on anyone who posts to it will be found
   * and drained. Turnstile is the only thing standing between this key and the
   * open internet, so a deployment that has the key but not the bot check must
   * refuse to run at all — the safe default has to be enforced here, not
   * remembered by whoever sets the environment variables next.
   */
  if (!env.TURNSTILE_SECRET_KEY) {
    return json(
      { error: 'Rewriting is not available: this deployment is missing its bot protection.' },
      503,
    );
  }

  let payload: { text?: unknown; mode?: unknown; turnstileToken?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }

  const text = typeof payload.text === 'string' ? payload.text : '';
  const mode: Mode = payload.mode === 'humanize' ? 'humanize' : 'paraphrase';

  if (text.trim().length === 0) {
    return json({ error: 'No text supplied.' }, 400);
  }
  if (text.length > MAX_INPUT_CHARS) {
    return json(
      { error: `That text is too long to rewrite. The limit is ${MAX_INPUT_CHARS} characters.` },
      413,
    );
  }

  // Checked unconditionally: reaching here means the secret is configured.
  const token = typeof payload.turnstileToken === 'string' ? payload.turnstileToken : '';
  const ip = request.headers.get('cf-connecting-ip');
  if (!token || !(await verifyTurnstile(token, env.TURNSTILE_SECRET_KEY, ip))) {
    return json({ error: 'Could not verify this request came from a browser.' }, 403);
  }

  try {
    const upstream = await fetch(`${ENDPOINT}?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${PROMPTS[mode]}\n\n---\n\n${text}` }] }],
        generationConfig: { temperature: 1.0 },
      }),
    });

    if (!upstream.ok) {
      // Deliberately not echoing the upstream body: it can contain the request.
      return json({ error: 'The rewriting service did not respond successfully.' }, 502);
    }

    const data = (await upstream.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const out = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';

    if (out.trim().length === 0) {
      return json({ error: 'The rewriting service returned nothing usable.' }, 502);
    }

    return json({ text: out.trim() });
  } catch {
    return json({ error: 'Could not reach the rewriting service.' }, 502);
  }
};

/** Anything other than POST is not part of this endpoint's contract. */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }
  return context.next();
};

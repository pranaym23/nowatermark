# REPORT 10 — Statistical text-watermark rewriting, opt-in

**Status:** done. 157 tests green, build and typecheck clean.
Ships **inert and fail-closed**: safe to deploy before any key is configured.

---

## What shipped

**`functions/api/rewrite.ts`** — a Cloudflare Pages Function, the only
server-side file in the project. POST only. Takes `{ text, mode }`, calls
`gemini-3.5-flash-lite`, returns `{ text }`. Returns **503 when
`GEMINI_API_KEY` is unset**, which is how it ships: the feature is inert until
someone deliberately configures it.

It logs no request bodies, stores nothing, and never echoes the upstream error
body back (which can contain the request). Input capped at 12,000 characters.

**`src/lib/rewrite.ts`** — the client. Same-origin, `credentials: 'omit'`.

**`src/components/react/TextScanner.tsx`** — the consent flow. Two steps: press
"Rewrite with Gemini…", then see the **actual JSON request body** in a textarea
before pressing "Send and rewrite". Per use, every time. There is deliberately
no "don't ask again" and no persisted setting.

**`rewritten_unverified`** — a new `SignalOutcome`, and the reason this feature
does not violate non-negotiable #4.

## The honesty constraint held

`SIGNALS.claudeWatermark` is untouched: `detect: false, remove: false,
verify: false`. A test asserts it.

Rewriting is not a removal and is not styled as one. The outcome pill reads
**"Rewritten — unverified"** in the `--nw-unknown` colour with a `~` glyph,
deliberately not the green `✓` used for `removed`. The result panel is headed
"Rewritten — we cannot verify this defeats any detector".

Nine tests cover the boundary: only `text` and `mode` leave the device (exactly
two JSON keys), the request goes to our own origin and never to `googleapis.com`
directly, no credentials, over-long and empty input are refused **before** any
fetch, and every failure path returns an error rather than handing back the
original as though it had been rewritten.

## Copy and claims

`/privacy` gained a section — **"Text you paste — and the one thing that is
sent"** — stating plainly that this is the only exception on the site, what is
sent, that Google's terms govern it once it arrives, and that we cannot tell the
user whether it worked. The analytics section now says the rewrite sends nothing
to an analytics tool and emits no event recording its use.

The sweep found 59 matches across 19 files. **Most did not need changing**, and
that is the useful finding: nearly every claim on the site is about *files*, and
those stay absolutely true. Only the genuinely unconditional ones moved:

- homepage: "Nothing is transmitted at any point" → "No file is transmitted at
  any point", plus the exception and a link to `/privacy`
- homepage meta description and the "Are my files uploaded?" FAQ
- `/about`: the "never leaves your device" paragraph
- `/methodology`: a new limitations entry
- `TextScanner`'s own "your text is never sent anywhere" line

`CLAUDE.md` non-negotiable #1 now reads "absolute and has no exception", with
the pasted-text carve-out spelled out beneath it and dated, and the Workers ban
records its single documented exception.

## Turnstile (added after the first pass, once GEMINI_API_KEY was set)

Fully wired, and the whole thing **fails closed**:

- The Function returns 503 if `TURNSTILE_SECRET_KEY` is missing, *even when
  `GEMINI_API_KEY` is present*. An endpoint that spends the key with no bot check
  does not run. Enforced in code rather than in a note, because the note is what
  gets missed.
- The token check is now unconditional — reaching it means the secret exists.
- `src/lib/turnstile.ts` loads `api.js` **on demand**, only once the user opens
  the confirmation step. A visitor who never touches rewriting never loads a
  third-party script.
- The widget renders inside the confirm panel; "Send and rewrite" stays disabled
  until a token arrives. Tokens are single-use, so a failed request resets the
  widget.
- Without `PUBLIC_TURNSTILE_SITE_KEY` the entire panel is tree-shaken out.
  Verified both ways against `dist/`.
- CSP updated: `script-src`, `frame-src` and `connect-src` now include
  `https://challenges.cloudflare.com`. Confirmed present in the built HTML.

## Remaining blockers

1. **No rate limiting** beyond Turnstile. Budget caps on the Google side are
   worth setting regardless; assume the limiter eventually fails.
2. ~~Google's retention terms are not recorded.~~ **Resolved.** Running on the
   **paid** tier: no product-improvement or training use, logs kept up to 55 days
   (configurable to 7/14/28) for abuse detection only. Stated on `/privacy`,
   `/methodology` and the consent panel. Zero Data Retention is available on
   request from Google and would remove even the 55-day window — worth asking for
   if the feature gets used seriously.
3. **Cookie consent still does not exist.** Adding a third-party text processor
   to an EU-facing site with no consent flow is a larger exposure than the
   existing GA4 gap. Noted in CLAUDE.md open items; not solved here, as briefed.

## Risks for QA

- **The end-to-end flow has never run.** No Gemini key and no Turnstile keys
  exist locally; the client is tested against a stubbed `fetch` only. First real
  exercise will be on the deployed site.
- CSP now names `challenges.cloudflare.com` in three directives. Confirmed in the
  built HTML, **not** confirmed in a browser — per CLAUDE.md that is exactly the
  failure that is silent in the UI.
- Verify on deploy: scan an image with the network panel open and confirm **zero**
  requests carrying file data; then rewrite text and confirm exactly one request,
  to our own origin, carrying only the text the user opted to send.
- A model can change meaning while rewording. The UI warns about this; whether
  the warning is prominent enough is a judgement call worth a second opinion.

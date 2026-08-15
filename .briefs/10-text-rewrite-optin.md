# BRIEF 10 — Statistical text-watermark rewriting, as explicit opt-in

**This brief deliberately reverses two standing rules. Read all of it.**
**Repo:** the repository root (branch `main`)
**Decision owner:** Pranay, 2026-08-14. Approved with the trade-offs below known.

---

## What this is

Statistical text watermarks bias a model's word choice in a pattern a detector
can recognise. They leave no special characters, so stripping invisible Unicode
does nothing to them. The only known removal is to reword the text — which needs
a language model.

We are adding that, using Gemini `gemini-3.5-flash-lite` via Google AI Studio,
behind an explicit per-use opt-in.

## What it costs — state this plainly, do not soften it in the UI

Today `CLAUDE.md` says: *"No file data on the network, ever."* and *"Cloudflare
Workers are banned (server compute)."* **This brief breaks both**, for one
narrow feature. That was a considered product decision, not an oversight, and
the implementation must be honest about it rather than quiet about it.

The API key cannot ship in client JavaScript — it would be public and drained
within days. It needs a server-side proxy, and that proxy is server compute.

## Non-negotiables that still apply

1. **`claude-watermark` stays `remove: false`** in `src/lib/signals.ts:176`.
   Rewriting is unverifiable — we cannot confirm any detector now fails. It must
   **never** appear in a removed list. Non-negotiable #4 is untouched by this
   brief.
2. Introduce a **new outcome**, not a removal: `rewritten_unverified`, alongside
   the existing `SignalOutcome` values in `src/lib/clean.ts:29`. The UI must say
   something like *"Rewritten — we cannot verify this defeats any detector."*
   If you find yourself wanting to show a ✓, stop.
3. **Nothing file-derived crosses the network.** This is text the user pasted,
   and only text they pasted, only after they opted in for that specific action.
   No filenames, no hashes, no image bytes, ever.

## Build

**Proxy.** A Cloudflare Pages Function (same origin — avoids a CSP `connect-src`
change and a CORS preflight). Key lives in the Pages secret store, referenced as
an env var. Never logged, never echoed.

**Abuse control.** An open paraphrase endpoint backed by our API key will be
found and drained. Turnstile in front of it, plus per-IP rate limiting. There is
a `turnstile-spin` skill available that does the end-to-end setup. Budget caps on
the Google side too — assume the rate limiter will eventually fail.

**Retention.** Send nothing we would not want retained. Do not log request
bodies. Check and record what Google's terms say about retention for AI Studio
keys versus Vertex — they differ, and `/privacy` has to state the real one.

**Consent UX.** Per-use, not a remembered setting. Before the first send, show
exactly what leaves the device — the actual text — and who receives it. An opt-in
the user has to think about once is the point; a checkbox they set and forget is
not.

**CSP.** Same-origin proxy should need no `astro.config.ts` change. Verify on the
deployed URL with the console open — per `CLAUDE.md`, a CSP failure is silent in
the UI and has already caused three production incidents.

## The copy sweep — do this, and do it thoroughly

The site currently claims, in many places, that **everything runs on your
device**. Once this ships, that is conditionally false. Every instance must be
found and qualified.

```bash
rg -i "on your device|never leaves|no upload|in your browser|stays local" src/
```

Audit every hit. The homepage headline, the tool pages, the guides, the
methodology page, the footer. The accurate claim becomes something like *"All
file processing happens on your device. Text rewriting is the one exception, and
it asks first."*

**`/privacy` must be updated in the same commit as the proxy.** `CLAUDE.md` is
explicit that a false privacy claim is the most damaging possible bug on this
site — and this feature makes the current page wrong the moment it deploys.

Also note in `/privacy`: this compounds the open cookie-consent gap. GA4 already
sets cookies without asking; adding a third-party text processor to an EU-facing
site without a consent flow is a bigger exposure than either item alone. Flag it
in the report — do not try to solve consent in this brief.

## Update CLAUDE.md

In the same commit, amend the non-negotiables so the next person is not misled:

- #1 becomes "No *file* data on the network, ever" — files, bytes, hashes,
  names, metadata. Unchanged and absolute.
- Add the carve-out: pasted text, on explicit per-use opt-in, for rewriting only.
- Amend the "Cloudflare Workers are banned" line to note the one Pages Function
  and why it exists.

A rule with an undocumented exception is worse than no rule.

## Files you own

```
functions/**                       (new — the proxy)
src/components/react/TextScanner.tsx
src/lib/clean.ts                   (the new outcome only)
src/pages/privacy.astro
src/lib/site.ts                    (copy)
CLAUDE.md
astro.config.ts                    (only if CSP genuinely needs it)
```

## Files you must NOT touch

```
src/lib/signals.ts       claude-watermark stays remove: false — this is the line
src/lib/cleaners/**
src/lib/metadata/**
```

## Definition of done

```bash
pnpm build && pnpm test
rg -i "on your device|never leaves|no upload" src/    # every hit reviewed
```

Then, on the deployed URL with the network panel open: scan an image and confirm
**zero** requests carrying file data. Rewrite some text and confirm exactly one
request, to our own origin, carrying only the text the user opted to send.

Then write `.reports/10-text-rewrite-report.md`, including the retention answer
from Google's terms and the exact `/privacy` wording you landed on.

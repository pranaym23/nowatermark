# CLAUDE.md — working notes for NoWatermark.fyi

Read this before changing anything. It records the constraints that are not
obvious from the code, and the mistakes that have already been made once.

**Live:** https://nowatermark.fyi · **Repo:** github.com/pranaym23/nowatermark
**Deploy:** push to `main` → Cloudflare Pages builds and publishes automatically.

---

## What this is

A free, browser-based tool that inspects images for hidden metadata and
AI-provenance data and removes what it can. It also finds invisible Unicode in
pasted text. **Everything runs on the user's device.** There is no backend, no
database, no object storage and no external processing API.

The product's differentiator is not the cleaning — plenty of sites do that. It
is **honesty about limits**: it reports what it cannot measure instead of
implying a file is clean.

---

## Commands

```bash
pnpm install
pnpm dev            # http://localhost:4321
pnpm build          # static output to dist/
pnpm preview        # serve the build
pnpm test           # 164 tests, all must pass
pnpm typecheck      # tsc --noEmit; nothing else runs it, so run it
pnpm fixtures       # write sample files with known metadata to tests/fixtures/samples/
pnpm pdf:audit <dir>...  # run the PDF parser over a real corpus; prints aggregates only
```

Node 22 (pinned in `.node-version`), pnpm 11. **No secrets are required** to
build or run.

---

## Non-negotiables

Break any of these and the product stops being what it claims to be.

1. **No file data on the network, ever.** No upload endpoint, no server-side
   processing, no file bytes/hashes/filenames/metadata in analytics. Verify by
   scanning a file with the network panel open — only static assets, the worker
   script, local `blob:` URLs and page-level analytics may appear.
   **This rule is absolute and has no exception.**

   There is exactly one carve-out, and it is not for files: **pasted text**, on
   explicit per-use opt-in, sent to Google's Gemini API for the rewrite feature
   (`functions/api/rewrite.ts`). It asks every time, shows the exact payload
   first, and is never remembered. Anything beyond that — a file, a filename, a
   hash, a metadata value, a "just this once" telemetry event — breaks the rule.
   Decision made 2026-08-14; see `.briefs/10-text-rewrite-optin.md`.
2. **`src/lib/signals.ts` is the single source of every product claim.** The UI,
   the cleaners and `/methodology` all read from it. Never hard-code a removal
   claim in a component, and never add one for a signal whose `remove` is false.
3. **Removal is only reported when a re-scan confirms it.** `clean.ts` scans its
   own output and diffs against the original. A signal is "Removed" because a
   second independent scan cannot find it — never because a cleaner said so.
4. **SynthID and statistical text watermarks are permanently "Unable to
   verify".** They must never appear in a removed list. "Not detected" and
   "cannot be checked" are different statements and the difference is the whole
   product.
5. **No recompression.** Cleaners rewrite the container and copy compressed
   image data byte-for-byte. Tests assert this by comparing the JPEG scan
   stream, PNG `IDAT` and WebP `VP8`/`VP8L` payloads before and after.
6. **No Japanese characters anywhere in `src/`.** The design is comic-panel
   inspired; the visual language is panel layout and halftone, not Japanese
   text. Enforce with:
   `rg -lP '[\x{3000}-\x{30FF}\x{4E00}-\x{9FFF}\x{FF00}-\x{FFEF}]' src/`
7. **164 tests stay green.** A failure means the engine broke — fix the code,
   not the test. There is no CI: `pnpm build` on Cloudflare Pages is the only
   automatic gate and it does **not** typecheck, so run `pnpm typecheck` and
   `pnpm test` yourself before pushing.
8. **A format is opened in `src/lib/formats.ts` and nowhere else.** The scanner
   and cleaner tables are total `Record`s over types derived from that registry,
   so flipping a `support` flag without supplying the implementation is a build
   error. Do not route around it.

---

## The CSP will bite you. Read this.

**The Content-Security-Policy lives in `astro.config.ts` under `security.csp`,
NOT in `public/_headers`.** This has already caused two production outages that
were invisible locally, because `astro preview` does not apply `_headers`.

- **Bug 1:** a hand-written `script-src 'self'` in `_headers` blocked Astro's
  inline island-hydration scripts. The page rendered fine and the scanner never
  booted. Astro now owns the policy and hashes its own inline scripts each build.
- **Bug 2:** `style-src` listed `'unsafe-inline'` next to hashes. Browsers
  **ignore `'unsafe-inline'` when a hash is present**, so every React `style`
  attribute was blocked. Fixed with a separate `style-src-attr` via the
  `{ resource, kind: 'attribute' }` form.
- **Bug 3:** the Cloudflare Web Analytics beacon was blocked, so analytics was
  enabled but collecting nothing.

**Rule: any new third-party script — AdSense especially — must be added to
`security.csp` in `astro.config.ts`. Then load the deployed URL and check the
console. A CSP failure is silent in the UI.**

Prefer external same-origin files over inline `<script>` blocks (see
`public/ga.js`); an inline block needs a hash regenerated on every edit.

**Shiki is disabled** (`markdown.syntaxHighlight: false` in `astro.config.ts`).
It wrote its theme as a hard-coded inline style — `background-color:#24292e`
— which pinned code blocks to one dark palette in both themes and put raw hex
into the page, both forbidden by the Tantei spec. It was also the source of the
CSP warning Astro printed on every build. Code blocks are now bare
`<pre><code>` styled from tokens in `global.css`. Don't turn it back on.

---

## Architecture

```
Cloudflare Pages → static HTML/CSS/JS → browser
                                          ↓  reads local File
                                     Web Worker (on device)
                                     scan → clean → re-scan
                                          ↓  local Blob download
```

- `src/lib/` — the engine. **No runtime dependencies.** Hand-written JPEG/PNG/
  WebP container walkers, EXIF reader + minimal TIFF writer, XMP extractor,
  C2PA/JUMBF detector, hidden-Unicode scanner, SVG region scanner, Markdown
  frontmatter locator, and a PDF object/xref parser (`src/lib/pdf/`).
- `src/lib/formats.ts` — the format registry. Adding a format starts here.
- `functions/` — the single Pages Function (text-rewrite proxy). Nothing else
  server-side belongs here.
- `src/components/react/` — the interactive islands. `ScannerTabs` mounts both
  the image and text scanners on the homepage.
- `src/content/guides/` — 21 Markdown guides (content collection). Frontmatter
  carries the evidence fields: `contentType`, `cluster`, `author`, `lastTested`,
  `sources`, `changelog`. A `lab` or `comparison` page **fails the build**
  without a `lastTested` date.
- `src/pages/capabilities.astro` — the versioned capability matrix, generated
  from `formats.ts` + `signals.ts`. Content links here for claims. It must never
  gain a hand-written capability claim.
- `src/pages/[tool].astro` — one template drives all 13 tool pages from
  `src/lib/site.ts`. **Never fork the scanner per page.**

"Cloudflare Workers" are banned (server compute) with **one** documented
exception: `functions/api/rewrite.ts`, the Pages Function that proxies the text
rewrite so the Gemini API key can stay secret. A key cannot ship in client JS.
Do not add a second server-side file without the same level of deliberation.

Browser **Web Workers** are encouraged and used — different thing, runs
on-device.

---

## Design system: "Tantei"

Spec: `.design/TANTEI-SPEC.md`. Comic-panel layout — heavy black gutters,
sharp corners, halftone screentone, one stamp-red accent (`#c4271a`).

- Every colour comes from a token in `src/styles/global.css`. No hard-coded hex
  in components.
- Three theme states must all be handled: bare `:root`, the
  `prefers-color-scheme: dark` media query guarded with
  `:root:not([data-theme="light"])`, and `:root[data-theme="dark"]`.
- **WCAG AA is a release gate.** Measure computed styles in a browser, in both
  themes — do not eyeball hex values. `--nw-faint` failed at 10px once and
  shipped to QA.
- The `unable_to_verify` status renders as the **inked-out panel**
  (`.nw-evidence-panel--void`) and gets none of the decorative treatment other
  findings get. This is the honesty rule expressed visually. Do not soften it.
- Long-form guides stay calm: readability beats the concept on the pages that
  carry the traffic.

Logo: `public/logo.svg` (full), `public/favicon.svg` (bolder, theme-flipping),
`src/components/Logo.astro` (inlined, follows `currentColor`).

---

## Watch out for

- **CSS specificity.** A bare `.intake span` once outranked `.btn` and rendered
  grey-on-red button text. Prefer class selectors; check computed styles.
- **`git add -A`.** It has already swept unreviewed multi-MB files into a
  commit. Stage deliberately.
- **Guides ship no application JavaScript.** Keep it that way — they are the SEO
  engine. Verify:
  `grep -o 'src="/_astro/[^"]*"' dist/guides/what-is-synthid.html` (empty).
- **Astro `build.format: 'file'`** is deliberate. It emits `/exif-remover.html`
  so Cloudflare serves `/exif-remover` directly instead of 308-ing to
  `/exif-remover/`, which would contradict the no-trailing-slash canonicals.

---

## Analytics

Two tools, and they differ:

- **Cloudflare Web Analytics** — cookieless, auto-injected by Pages.
- **Google Analytics 4** (`G-LXNWBS7347`, `public/ga.js`) — **sets cookies**.

`/privacy` describes both accurately. If you change analytics, update that page
in the same commit — a false privacy claim is the most damaging possible bug on
this site.

The same rule covers the text-rewrite feature. It runs on the **paid** Gemini
API tier (confirmed 2026-08-14), where Google does not use prompts or responses
to improve its products or train models, and logs them for up to 55 days solely
for abuse detection. **Dropping to the unpaid tier would reverse both of those**
— unpaid content is used for training and human reviewers may read it — so the
tier is a privacy commitment, not a billing detail.

Three surfaces state these terms and must move together in one commit:
`/privacy`, `/methodology`, and the consent panel in
`src/components/react/TextScanner.tsx`.

Verified: GA sends `page_view` only. Clicking the download link does **not**
send a `file_download` event, because the href is a `blob:` URL with no
extension for GA's trigger to match. That is an implementation detail of
Google's matching, not a guarantee — disabling "File downloads" under GA4
Enhanced Measurement would make it robust.

---

## Open items

- **Cookie consent** is not built. GA4 sets cookies without asking, which
  generally requires prior consent in the EU/UK. The text-rewrite feature
  compounds this: a third-party processor on an EU-facing site with no consent
  flow is a bigger exposure than either item alone.
- **Text rewriting is off until three variables are set**, and it fails closed
  in every partial state, so there is no unsafe ordering:
  - `GEMINI_API_KEY` (secret) — without it the endpoint 503s.
  - `TURNSTILE_SECRET_KEY` (secret) — **without it the endpoint 503s even when
    the Gemini key is present.** An endpoint that spends the API key with no bot
    check must never run; this is enforced in code, not by convention.
  - `PUBLIC_TURNSTILE_SITE_KEY` (plaintext build variable) — without it the
    rewrite UI is not merely hidden, it is tree-shaken out of the bundle.
    Verified: `grep -rl "Rewrite with Gemini" dist/` is empty without it.

  Turnstile's CSP entries are already in `astro.config.ts` (`script-src`,
  `frame-src`, `connect-src`). Still confirm on the deployed URL with the console
  open — a CSP failure is silent in the UI.
- **Advertising** is stubbed (`AdSlot.astro`, `ADS_ENABLED = false`). Enabling
  it needs CSP changes in `astro.config.ts` and a privacy-page update.
- **Event-level analytics** for the scan/clean funnel does not exist. Cloudflare
  Web Analytics has no custom events API; GA4 could carry it, but any event must
  stay page-level and carry nothing file-derived.
- **SEO backlog:** `.seo/content-gaps.md` has 12 researched article briefs; 6
  are written. The rest are ready to author.

---

## Where the build is (2026-08-15)

Live on `main`, deployed and verified. Briefs and reports in `.briefs/` and
`.reports/`, numbered 06–11.

**Done:** format registry; SVG scan+clean (including images embedded as data
URIs); Markdown scan+clean; PDF **inspect-only**; opt-in text rewriting on
Gemini paid tier with Turnstile.

**V2 is in progress.** `NOWATERMARK-V2-PLAN.md` is the product contract;
`NOWATERMARK-V2-BUILD-PLAN.md` is the executable sequence and records five
amendments to the contract — read its section 1 before building against it. The
most important is **A1: R7 as originally drafted would have permitted file
upload behind a consent dialog, which reverses non-negotiable #1. It is
rewritten. Files never leave the device, consented or not.**

**Done in V2 so far:** real-PDF validation (report 11 — 733 files, 99.3% clean,
PDF now claimable for scanning); structural C2PA-in-PDF detection; the evidence
frontmatter schema and `Evidence.astro`; the versioned capability matrix at
`/capabilities`; five evidence-led guides (brief 11).

**Next, in rough priority order:**

1. **Publish-Ready Check** (R1) — one entry point across image, document and
   text. The existing scanners become its modes.
2. **Results redesign** (R2, R4) — the four-way classification and the three
   separated exposure axes. No composite score, ever.
3. **Cleanup presets** (R5) — privacy-safe / provenance-light / custom, with a
   preview before it runs. Presets read from `signals.ts`; a preset can never
   claim removal for a signal whose `remove` is false.
4. **Homepage and navigation** (R30-R32), inside Tantei — not a redesign of it.
5. **Analytics events.** Still absent, and three of the plan's success criteria
   are unmeasurable without them. Allowlist is specified in build plan 0.4;
   `/privacy` moves in the same commit.
6. **Exercise the rewrite end-to-end in a browser.** Still never run for real —
   no Turnstile challenge can be completed from a terminal.
7. **PDF Phase 2** — full re-serialise, never an incremental update. The test
   that matters asserts on raw output bytes, not on a re-scan; a re-scan
   structurally cannot catch the incremental-write trap.
8. Rate limiting beyond Turnstile, plus a Google-side budget cap.
9. Cookie consent (still open, now with a third-party processor in play).

**Tool page copy is only partly caught up.** `/ai-watermark-checker` now names
the real format list; the narrower per-format tools still describe images,
which is accurate for them. R29 (hub-and-spoke consolidation) will settle the
rest.

## Outsourcing content to agy

Brief 11 is the working template. What was learned running it:

- **agy in headless mode cannot use tools** — it auto-denies the permission and
  returns an error instead of output. Pass everything it needs inline in the
  prompt and tell it explicitly not to use tools.
- **agy drafts; it never decides what is true.** Supply a fact sheet and forbid
  any assertion outside it. Every factual line is then verified against that
  sheet by hand before the file is written into `src/content/guides/`.
- Claude owns the file writes, not agy. That keeps the verification step from
  being skippable.
- The QA pass caught real defects every time, including **an error in my own
  brief** (a wrong macOS version) that agy faithfully propagated. Verify the
  fact sheet as well as the draft.

---

## How work has been run here

Briefs in `.briefs/`, agent reports in `.reports/`, SEO research in `.seo/`.
Larger changes have been delegated to CLI agents (Codex, agy) with written
briefs and explicit file ownership to avoid collisions, then verified in a real
browser before shipping. QA is adversarial by design: assume the change is
broken until a command or a browser measurement proves otherwise.

# NoWatermark V2 — Build Plan

**Status:** executable
**Date:** 2026-08-15
**Supersedes:** nothing. Companion to `NOWATERMARK-V2-PLAN.md`, which remains the
product contract (R1–R32). This document is the build sequence for it.

Read `CLAUDE.md` first. The non-negotiables in it outrank everything here. Where
this plan and `CLAUDE.md` disagree, `CLAUDE.md` wins and this plan is wrong.

---

## 1. Amendments to the product contract

Five changes to `NOWATERMARK-V2-PLAN.md`. Everything else in that document
stands as written. These are recorded here rather than edited into the original
so the provenance of the change is visible — which is, after all, the product.

### A1 — R7 is rewritten. Files never leave the device.

R7 as drafted read "Any text **or file data** that leaves the device must
require an explicit opt-in." That authorises file upload behind a consent
dialog. `CLAUDE.md` non-negotiable #1 says no file data on the network **ever**,
"absolute and has no exception", with pasted text as the single carve-out.

**R7 (revised):** File bytes, filenames, hashes, and metadata values must never
leave the device under any circumstance, consented or otherwise. The sole
network carve-out remains pasted text sent to the rewrite endpoint on explicit
per-use opt-in, showing the exact payload and destination, never remembered. Any
future feature that would transmit file-derived data is out of scope for V2 and
requires a decision at the level of the original architecture, not a
requirement.

This closes the loophole. It is not a scope reduction: no feature in the plan
actually needed file upload.

### A2 — R13 splits into R13a and R13b.

The original R13 said "authorized named detectors **or** clearly labeled
reproducible benchmarks." Those are two products differing by roughly 50× in
cost, and one of them opens a second network carve-out.

**R13a (in V2):** A Detector Test Bench built on reproducible, dated benchmarks
run by NoWatermark against fixed corpora, published with fixtures, method,
environment and limitations. Fully static. No user content transmitted.

**R13b (deferred, separate go/no-go):** Live integration with named detector
APIs. Blocked on: authorised API terms permitting this use, cost controls, a
second Pages Function reviewed to the standard of `functions/api/rewrite.ts`,
and a privacy-surface update across `/privacy`, `/methodology` and the consent
UI. Not started in V2 without an explicit decision.

R13a is the honest version and the more citable one.

### A3 — Detector-resistance cluster keeps its evasion-intent framing.

Decision taken 2026-08-15, deliberately, for SEO/GEO reach. The cluster targets
evasion intent directly.

The guardrails in R14, R16 and R27 are what make this shippable and are now
**hard build gates**, not editorial preferences:

- No page states or implies that content can be made universally undetectable.
- No page issues, or is worded to suggest, a human-authorship certificate.
- Every page in the cluster shows measured limitations, detector disagreement,
  and a dated test.
- No fabricated or estimated detector scores. A number on this site came from a
  run we can reproduce, or it is not on the site.

A page in this cluster that fails any of the four does not ship. Enforced by the
content gate in §6.

### A4 — Named authorship is real or it is the organisation.

R23 requires a named author or reviewer. There is one person here. A fabricated
editorial masthead on a site whose product is honesty is not an option.
Byline is the real author, or `NoWatermark` as an organisation, and nothing
else.

### A5 — Sequencing: capability is validated before it is claimed.

R17's capability matrix is P0 and content is required to cite it, but PDF
coverage has never been run against a real file. Publishing the matrix first
would put unvalidated PDF claims at the centre of the trust architecture.

Order is fixed: **validate → matrix → content that cites the matrix.** Phase 0
exists for this reason.

---

## 2. What is actually here today

Measured, 2026-08-15, not assumed:

| | |
|---|---|
| Formats | 6 — JPEG/PNG/WebP/SVG/Markdown `clean`, PDF `scan` only |
| Signals | 21 in `src/lib/signals.ts` |
| Tool pages | **13** (`CLAUDE.md` says 14 — `CLAUDE.md` is wrong, fixed in Phase 0) |
| Guides | 16 |
| Tests | 157, green |
| Server code | 1 Pages Function (`functions/api/rewrite.ts`) |
| React islands | `ImageScanner`, `TextScanner`, `ScannerTabs`, `ui` |
| Content schema | `src/content.config.ts` — has `updatedDate`; no author/sources/lastTested |

Known-broken, carried in from `CLAUDE.md` and confirmed by reading the code:

- `src/lib/metadata/pdf.ts:136` — C2PA presence is a raw byte search for `c2pa`
  or `jumb` across the whole file. Both false-positive readily. **Live
  correctness bug on a provenance claim**, which is the worst category of bug
  this site can have.
- `collectPdfMetadata` has never seen a real-world PDF.
- The rewrite flow has never been exercised end-to-end in a browser.
- `src/lib/site.ts` describes the tools as image-only; SVG/Markdown/PDF shipped.
- No event-level analytics, so three of the plan's success criteria are
  currently unmeasurable.
- Cookie consent absent; V2 does not make this better.

---

## 3. Phase 0 — Correct and validate before claiming

Nothing in Phase 1 is trustworthy until this lands. No new user-facing claims.

**0.1 Narrow C2PA-in-PDF detection.** `src/lib/metadata/pdf.ts`.
Replace the byte search with a structural test: a JUMBF superbox is a 4-byte
big-endian length followed by ASCII `jumb`, containing a `jumd` description box
— require that shape and a plausible length, not the bare string. Additionally
walk the object graph for the spec'd carrier: an embedded file stream with
`/AFRelationship /C2PA_Manifest`. Presence reported only on a structural hit.
Tests: a PDF merely containing the text "c2pa" must report absent.

**0.2 Real-PDF validation harness.** New `scripts/pdf-audit.ts`.
Runs `collectPdfMetadata` across a local corpus, recording per file: parse
success, `degraded`, `encrypted`, revision count, warnings, wall time, and any
throw. Emits an aggregate report only — **no file content, paths, or metadata
values are written into the repo**. Corpus is local to the machine and never
committed. Target a few hundred real files. Output gates whether PDF appears in
the capability matrix as `scan` or as `scan (degraded on N% of real files)`.

**0.3 Content schema for evidence.** `src/content.config.ts` and
`src/pages/guides/[...slug].astro`.
Add `author`, `reviewer?`, `lastTested?`, `sources[]` (url + title + accessed),
`changelog[]` (date + note), `contentType` (`tool|guide|lab|comparison|answer`),
`cluster`. Backfill the 16 existing guides. Render byline, publish/updated
dates, last-tested marker, source list, and a correction path. Guides still ship
zero application JavaScript — verify with the `dist/guides/` grep.

**0.4 Analytics event design.** Spec first, then implement.
Allowed: `scan_start`, `scan_result`, `clean_complete`, `download_click`,
`rewrite_optin`. Each carries at most a format label and a coarse outcome
enum. **No filename, size, hash, metadata value, or signal value ever.** Write
the allowlist into `/privacy` in the same commit. This unblocks the funnel
success criteria; without it they are unmeasurable and should not be claimed.

**0.5 Truth-up existing copy.** `src/lib/site.ts` format descriptions,
`CLAUDE.md` tool count (13, not 14) and any other drifted line.

**0.6 Exercise rewrite end-to-end in a real browser.** Turnstile cannot be
completed from a terminal, so this is a manual pass with the console open,
checking CSP and the consent payload display.

**Gate:** `pnpm test` green, `pnpm typecheck` clean, PDF audit report exists.

---

## 4. Phase 1 — Product core

**1.1 Capability matrix** — `/capabilities`, generated from `signals.ts` +
`formats.ts` + the Phase 0 audit. Versioned and dated. No hand-written claims;
if the matrix and the code disagree, the build fails. (R17)

**1.2 Publish-Ready Check** — one entry point accepting image, document or text
and routing to the right flow. Becomes the canonical product page; existing
scanners become its modes, not separate products. (R1)

**1.3 Results redesign** — four-way classification (removed & verified /
reduced but unverified / not removable / unable to verify) across three
separated axes (metadata & provenance, privacy, detector risk). No composite
score. `unable_to_verify` keeps the inked-out panel exactly as specified in
`.design/TANTEI-SPEC.md`. (R2, R4)

**1.4 Cleanup presets** — privacy-safe, provenance-light, custom. Preview of
what each will change, before it runs. Presets read from `signals.ts`; a preset
can never claim removal for a signal whose `remove` is false. (R5)

**1.5 Homepage and navigation** — promise, primary input, and local-processing
proof in the first viewport, mobile and desktop. (R30–R32)

**Design constraint:** all of this is built *within* Tantei, not as a redesign
of it. Pangram informs sequence and proof density, never the visual language.
Tokens only, no hard-coded hex, all three theme states, WCAG AA measured in a
browser rather than eyeballed.

---

## 5. Phase 2 — Content engine

**2.1 Taxonomy** — the five content types from R19 wired into the collection and
the templates.

**2.2 Hub-and-spoke consolidation** — the 13 keyword tool pages resolved against
R29: keep, merge, redirect, or convert to a view of Publish-Ready Check. Each
decision recorded with its redirect. One canonical page per primary intent.

**2.3 First clusters** — sized by *how many tests we can actually run*, not by
Pangram's page count. Every claim about provider, platform or detector behaviour
traces to a primary source or a NoWatermark test with fixtures, date,
environment and limitations. (R22)

**2.4 Evasion-intent cluster** — per A3, with the four gates enforced.

---

## 6. Content outsourcing protocol (agy / Gemini 3.7 Flash)

Available and verified: `agy` with `gemini-3.7-flash-{low,medium,high}`.
`--print --output-format json --json-schema` makes it scriptable.

**The boundary is factual authority, not volume.**

| agy may | agy may not |
|---|---|
| Draft prose from a supplied fact sheet | Assert any fact not on that sheet |
| Expand clusters, suggest internal links | Decide what NoWatermark can detect or remove |
| Draft FAQs, meta titles, descriptions | Write `/privacy`, `/methodology`, consent copy |
| Mechanical QA: tone, reading level, duplicate intent, missing CTA | Touch `src/lib/`, `signals.ts`, cleaners, CSP |
| Propose structure and headings | Cite a source it selected itself |

**Workflow per article:**

1. **We** build a fact sheet: every claim, each with a primary source URL or a
   NoWatermark test ID, plus explicit "we do not know" entries.
2. agy drafts to the frontmatter contract, constrained to that sheet.
3. **Deterministic QA** — a script, not a model: frontmatter validates, every
   external claim carries a `sources[]` entry, `lastTested` present on
   research-sensitive types, no application JS in the built page, no page
   promising undetectability or authorship certification (keyword deny-list),
   no duplicate primary intent against existing pages.
4. **Human/Claude verification** of every factual line against the sheet.

A second Flash pass is used for tone and structure only. It is not adequate QA
for factual accuracy and is never the last gate before publish. A hallucinated
citation on this site is worse than a missing page.

---

## 7. Phase 3 — Feature expansion

- **Batch** (R10) — sequential and memory-bounded. The current worker reads a
  whole File; a 50-image batch on mobile OOMs without streaming. Per-file
  independent outcomes, partial success downloadable.
- **Prompt/workflow viewer** (R11) — view and export before offering removal.
- **AVIF + HEIC** (R18) — shared ISOBMFF box parser, which is the reason to do
  them together. No runtime dependencies. No recompression: `mdat` copied
  byte-for-byte while `meta` is rewritten. **Chrome cannot decode HEIC**, so the
  preview path needs a designed fallback — this is a UX decision, not an
  afterthought.
- **Destination-aware preflight** (R12) — static knowledge of what each platform
  strips, from reproducible tests. It never transmits the user's file to a
  platform to find out.

## 8. Phase 4 — Detector bench

R13a only. R13b requires the separate go/no-go in A2.

---

## 9. Standing gates

Applies to every phase, every commit:

1. `pnpm test` green — 157 and rising. A failure is a broken engine, not a
   broken test.
2. `pnpm typecheck` clean. Cloudflare does not typecheck; nothing else runs it.
3. No file data on the network. Verified with the network panel.
4. Every claim from `signals.ts`. No hard-coded removal claims.
5. Removal reported only after a confirming re-scan.
6. No recompression — scan stream / `IDAT` / `VP8` byte-identical.
7. New third-party scripts go in `security.csp` in `astro.config.ts`, then get
   checked on the deployed URL with the console open. CSP failures are silent.
8. No Japanese characters in `src/`.
9. Guides ship no application JavaScript.
10. Privacy claims move in the same commit as the behaviour they describe.

---

## 10. Deliberately not in V2

Unchanged from the product contract, plus:

- Live detector API integration (A2, R13b).
- Any file upload path, consented or not (A1).
- Cookie consent remains open. It is a real and growing exposure and is tracked,
  but it is not solved by this plan.

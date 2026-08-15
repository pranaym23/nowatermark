# BRIEF 01 — Implement the Tantei redesign

**Agent:** Codex, gpt-5.6-terra, medium effort
**Repo:** the repository root (git repo, branch `master`, clean tree)

---

## Context you need

NoWatermark.fyi is a **working, tested, shipping** static site. It is an
AI-provenance and metadata inspector: users drop a JPG/PNG/WebP, it reports
what metadata the file carries, and cleans what it can — entirely in the
browser, with no backend.

The engine is done and correct. **Your job is only the visual redesign.**

Read these first, in order:

1. `.design/TANTEI-SPEC.md` — the design spec. This is your source of truth.
2. `README.md` — architecture, especially the zero-backend and honesty rules.
3. `src/styles/global.css` — the current token system and theme pattern.
4. `src/lib/signals.ts` — the capability matrix that governs every claim.

For visual reference only, `.design/directions-manga.html` contains the
approved "Tantei" mockup. **Ignore all Japanese text in it** — the spec
supersedes it and requires the Japanese be removed. Use it for layout, panel
proportion and tone, nothing else.

## What to build

Apply the Tantei design system across the site per `.design/TANTEI-SPEC.md`
section 7. In short:

- **Homepage** (`src/pages/index.astro`) — full panel grid treatment.
- **Tool pages** (`src/pages/[tool].astro`) — header panel, scanner, results
  as evidence panels. One template drives all 14 pages.
- **Scanner UI** (`src/components/react/ImageScanner.tsx`,
  `TextScanner.tsx`, `ui.tsx`) — result rows become evidence panels; the
  `unable_to_verify` status becomes the inked-out panel (spec section 6).
- **Header / Footer / shared components** (`src/components/*.astro`).
- **Guides, methodology, privacy, terms, 404** — calm treatment. Readability
  wins over the concept on long-form pages.
- **`src/styles/global.css`** — replace the token palette with the spec's.

## Rules you must not break

1. **No Japanese characters** in any file under `src/`. See spec section 1.
2. `pnpm build` must succeed.
3. `pnpm test` must stay green — **76 tests currently pass**. If a test fails,
   the redesign broke something; fix the code, do not weaken the test.
4. Guide pages must continue to ship **zero JavaScript**. Verify with:
   `grep -o 'src="/_astro/[^"]*"' dist/guides/what-is-synthid/index.html`
   (must return nothing).
5. Every colour comes from a CSS token. No hard-coded hex in components.
6. All text/background pairs meet **WCAG AA** (4.5:1 body, 3:1 large bold).
7. Do not change any user-facing claim. `src/lib/signals.ts` and
   `STATUS_LABEL` in `src/lib/types.ts` are canonical — you may restyle the
   four statuses but must not rename or add to them.
8. Watch CSS specificity. A previous iteration had a bare element selector
   (`.intake span`) silently override a `.btn` class and render grey-on-red
   text. Prefer class selectors; check computed styles, not just source.

## Files you own (edit freely)

```
src/styles/**
src/components/**
src/layouts/**
src/pages/**
src/lib/site.ts        (copy/nav only — not the scanning logic)
```

## Files you must NOT touch

```
src/lib/**             except site.ts — the engine is done and tested
src/content/guides/**  another agent owns content
tests/**               except a genuine redesign-driven fix
public/**              another agent owns brand assets
.design/**  .briefs/**  .seo/**
```

## Definition of done

Run these and make them all pass before you finish:

```bash
pnpm build
pnpm test
grep -rlP '[\x{3000}-\x{30FF}\x{4E00}-\x{9FFF}\x{FF00}-\x{FFEF}]' src/ ; echo "^ must be empty"
```

Then write `.reports/01-build-report.md` containing:
- What you changed, by area.
- Any spec decision you had to make, and why.
- Anything you deliberately did not do.
- Known risks for the QA agent to check first.

Work directly on the current branch. Commit when done with a clear message.
Do not ask questions — make the call, note it in the report, and keep moving.

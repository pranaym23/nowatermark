# BRIEF 07 — SVG scanning and cleaning

**Depends on:** brief 06 (format generalisation) being merged.
**Repo:** the repository root (branch `main`)

---

## Why SVG first

It is the cheapest new format we can add. SVG is XML text, so there is no
compressed image stream to preserve — non-negotiable #5 ("no recompression")
is satisfied for free. Detection already exists at `src/lib/filetype.ts:48`.

## What SVG actually hides

Scan for, and report, each of these:

| Carrier | Notes |
|---|---|
| `<metadata>` blocks | Usually RDF/Dublin Core. Author, rights, dates. |
| XMP (`x:xmpmeta`) | Same reader as the raster path — reuse `metadata/xmp.ts`. |
| Generator comments | `<!-- Generator: Adobe Illustrator 28.0 ... -->` |
| `<title>` / `<desc>` | Often carries the original filename or prompt text. |
| Editor namespaces | `inkscape:`, `sodipodi:`, `illustrator:`, `figma:` attributes. |
| Hidden Unicode | In text nodes. Reuse `src/lib/unicode/hidden.ts` unchanged. |
| **Embedded rasters** | `<image href="data:image/jpeg;base64,…">` — see below. |

### The embedded raster problem — read this twice

An SVG can carry a full JPEG or PNG inside a `data:` URI, and **that payload
has its own EXIF, GPS and C2PA**. A cleaner that only strips the XML will
report a clean SVG while the user's GPS coordinates sit intact one base64
decode away. That is exactly the silent failure non-negotiable #3 exists to
prevent.

Required behaviour:

1. Decode each `data:image/*` payload.
2. Run the **existing** `cleanJpegBytes` / `cleanPngBytes` / `cleanWebpBytes`
   on it — do not write new cleaners, and do not re-encode the pixels.
3. Re-embed the cleaned bytes as base64.
4. Surface the findings as normal signals, noting they came from an embedded
   image.

If a payload is a format we cannot clean, say so — the file is reported as
partially cleaned, not clean.

## Security: SVG is executable

**Never render user-supplied SVG into the page.** SVG supports `<script>`,
`onload` handlers and external references; injecting one into our DOM is a
straightforward XSS on our own origin.

- Preview must go through `<img src="blob:…">` (which does not execute script)
  or be rasterised to canvas — never `innerHTML`, never inline `<svg>`.
- Strip `<script>`, `on*` attributes and external `href`/`xlink:href` fetches
  as part of cleaning, and **report it as a finding** — a remote reference in
  an SVG is a tracking pixel that fires when the file is opened.
- Add a CSP note to `.reports/` if anything here touches `astro.config.ts`.

## Rules you must not break

1. **No runtime dependencies.** Write a minimal XML walker, the way
   `metadata/png.ts` walks chunks. Do not add an XML parser package.
2. **Surgical edits, not parse-and-reserialise.** Preserve byte-for-byte
   everything you did not deliberately remove — whitespace, attribute order,
   line endings, the XML declaration. A reformatted file is a changed file.
3. **Re-scan verification.** Cleaning routes through `clean.ts` and the removal
   report comes from diffing a second independent scan. No exceptions.
4. **`src/lib/signals.ts` governs every claim.** Add signals there if you need
   them; never hard-code a claim in a component.
5. SVGZ (gzipped SVG) is **out of scope**. Detect it and refuse cleanly rather
   than half-handling it.

## Files you own

```
src/lib/metadata/svg.ts        (new)
src/lib/cleaners/svg.ts        (new)
src/lib/signals.ts             (additions only — do not weaken existing specs)
src/lib/filetype.ts            (register svg as cleanable)
tests/svg.test.ts              (new)
tests/fixtures/**              (add SVG samples via pnpm fixtures)
```

## Files you must NOT touch

```
src/lib/cleaners/{jpeg,png,webp}.ts   call them, do not edit them
src/lib/clean.ts               brief 06 owns the registry seam
src/content/guides/**
```

## Definition of done

```bash
pnpm fixtures
pnpm test        # 76 existing + your new ones, all green
pnpm build
```

Tests must include: an SVG with an embedded GPS-bearing JPEG proves clean after
cleaning **and** the embedded JPEG's compressed scan stream is byte-identical to
the original's; a `<script>`-bearing SVG is reported and neutralised; a cleaned
SVG still renders identically.

Then write `.reports/07-svg-report.md`.

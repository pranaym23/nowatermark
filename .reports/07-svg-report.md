# REPORT 07 — SVG scanning and cleaning

**Status:** done. 102 tests green (82 → 102, +20 SVG), `pnpm build` clean,
`pnpm typecheck` clean, guides still ship zero JS, no Japanese in `src/`.

---

## What shipped

**`src/lib/metadata/svg.ts`** — a small XML region scanner. Not a parser: it
finds element and attribute *byte ranges* and nothing else. No entity
resolution, no namespaces, no DOM, no dependency.

**`src/lib/cleaners/svg.ts`** — deletes ranges and copies the rest through.
There is no reserialise step, so attribute order, indentation, whitespace and
line endings survive untouched. Asserted by `leaves the drawing itself
untouched`.

**Two new signals** in `signals.ts` (and in `CAPABILITY_MATRIX`, so
`/methodology` picks them up automatically):

- `active-content` — scripts and `on*` handlers
- `remote-reference` — external URLs fetched on open

Both `detect/remove/verify: true`.

## What SVG turned out to be hiding

Detected and removed: `<metadata>` blocks, XMP/RDF, `<title>`, `<desc>`,
generator comments, `inkscape:`/`sodipodi:`/`illustrator:`/`figma:` attributes
and their namespace declarations, `<script>`, `on*` handlers, remote references,
and hidden Unicode in text nodes.

`sodipodi:docname` is worth calling out: it is the author's **original
filename**, sitting in plain text in every Inkscape export. The fixture uses
`secret-project-final.svg` and there is a test asserting it does not survive.

### The nesting problem is real and is handled

An `<image href="data:image/jpeg;base64,…">` carries its own EXIF, GPS, IPTC and
C2PA. Cleaning only the XML would have reported a clean file with the author's
coordinates one base64 decode away — and our re-scan would have agreed, because
the re-scan would also only have looked at the XML.

Embedded payloads are now decoded, passed to the **existing** `cleanJpegBytes` /
`cleanPngBytes` / `cleanWebpBytes`, and re-embedded. Three tests cover it:

- GPS inside an embedded JPEG is **detected** by the scan
- it is **gone** after cleaning, verified by scanning the extracted payload
- the embedded JPEG's entropy-coded scan stream is **byte-identical** before and
  after, so non-negotiable #5 holds through the nesting

Orientation preservation propagates too: an embedded rotated JPEG keeps exactly
its one rotation field, and drops it when `preserveOrientation: false`.

## Security: no change needed, and here is why

Brief 07 flagged inline SVG rendering as an XSS vector. Checked — the existing
architecture already closes it:

- `ImageScanner.tsx:85` previews via `URL.createObjectURL` into `<img src=…>`.
  SVG loaded through `<img>` runs in a restricted mode: no script execution, no
  external fetches.
- No `dangerouslySetInnerHTML` anywhere in `src/components/react/`.
- CSP already has `img-src 'self' data: blob:` and `object-src 'none'`.

**No `astro.config.ts` change was needed, so there is no new CSP risk to verify
on deploy.** Scripts are still stripped from the output — defence in depth, and
the user's cleaned file goes on to other viewers that may not be as careful.

## Decisions I made

- **All XML comments are removed**, not just generator ones. Comments never
  affect rendering, and the product already removes rights fields (`author` is
  `remove: true`, and covers EXIF `Copyright`). Leaving some comments in would
  also have produced a permanently "remaining" `embedded-text` signal and a
  confusing warning on every file.
- **Remote references are removed, not just reported.** The content was never in
  the file, so nothing is lost, and the reference is a tracking pixel. A warning
  explains it in the results.
- **SVGZ is refused**, as briefed.
- **Non-UTF-8 SVGs are refused** rather than guessed at. A mis-decoded file that
  we then rewrite is silently corrupted, which is worse than an uncleaned one.
  Covers UTF-16 BOMs and non-UTF-8 `encoding=` declarations.
- **`detectType` sniff widened** from 256 to 1024 bytes and now tolerates a
  DOCTYPE or licence comment before `<svg`. Illustrator exports open that way and
  were previously detected as `unknown`.
- Script/remote-reference rows are **only shown for formats where they apply** —
  a JPEG scan does not sprout an always-negative "no scripts found" row. Asserted
  by a test.

## Copy updated

`/methodology` said in as many words: *"PDF, SVG … are not supported"*. That
became false the moment this shipped, which is precisely the claim drift the
product exists to avoid. Fixed, along with the accept hints in
`ImageScanner.tsx` and `ScannerTabs.tsx`, the homepage FAQ and `/about`.

Added a `/methodology` line covering the nesting and remote-reference behaviour,
since both are surprising and both change the user's file.

**Left alone:** the per-tool marketing copy in `src/lib/site.ts`. Those pages
describe image tools and their claims remain true, just not exhaustive. Worth a
deliberate SEO pass rather than a find-and-replace — see risks.

## Risks for QA

- **Not yet verified in a real browser.** Everything here is asserted by tests.
  The preview path for SVG (`<img src="blob:">` with `image/svg+xml`) should be
  eyeballed, in both themes.
- The `<image>` accept list now includes `image/svg+xml`, so the OS file picker
  changes. Worth confirming on macOS and Windows.
- `src/lib/site.ts` tool descriptions still say "JPG, PNG or WebP" in ~6 places.
  Not wrong, but incomplete now.
- Very large embedded data URIs mean base64 decode + re-encode in memory. The
  25 MB `MAX_FILE_BYTES` limit applies to the SVG, but a 25 MB SVG that is mostly
  base64 will allocate several multiples of that. Untested at the limit.

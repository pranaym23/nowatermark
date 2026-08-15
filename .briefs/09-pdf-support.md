# BRIEF 09 — PDF metadata scanning and cleaning

**Depends on:** brief 06 (format generalisation) being merged.
**Size:** This is the large one. Read the staging section before starting.
**Repo:** `/Users/pranaymehrotra/agent/nw` (branch `main`)

---

## The trap that makes this hard

A PDF is not a flat file. It is an object graph with an append-only revision
history, and **writing metadata to a PDF the easy way does not remove the old
metadata — it appends a new revision on top of it.** The original bytes stay in
the file, earlier in the stream, fully recoverable.

This is why the competitor project's README insists on `qpdf --linearize`
rather than exiftool for PDFs: exiftool writes incrementally, so the "cleaned"
file still contains the author name, the GPS, the generator string, all of it,
sitting above the new trailer.

Why this matters here specifically: **our re-scan verification would pass.**
`clean.ts` scans its own output, the parser follows the current xref to the
newest `/Info` dictionary, finds it empty, and reports "Removed ✓". The claim
would be false, verified by our own machinery, on the one product promise we
have said is non-negotiable. A naive PDF implementation is the single most
dangerous change anyone could make to this codebase.

**Therefore: the cleaner must fully re-serialise the document. No incremental
updates, ever. And the test suite must assert on raw output bytes, not on a
re-scan** — see the definition of done.

## Where PDF metadata lives

All of these, and a scan that misses one is a scan that lies:

| Carrier | Notes |
|---|---|
| `/Info` dictionary | Title, Author, Subject, Keywords, Creator, Producer, dates. |
| XMP in `/Metadata` | Document-level, reuse `metadata/xmp.ts`. |
| Per-object metadata | Individual images and pages can carry their own XMP. |
| C2PA | Reuse `metadata/c2pa.ts`. |
| Embedded images | Their own EXIF/GPS. Same nesting problem as brief 07's SVG. |
| `/ID` array | File identifier, stable across revisions — a correlation handle. |
| **Prior revisions** | The whole point of this brief. Every earlier `/Info`. |
| Embedded files | `/EmbeddedFile` attachments, arbitrary payloads. |
| JavaScript | `/JS`, `/OpenAction` — report it; a PDF that phones home on open. |

## What you must write, with no dependencies

`src/lib/` has **no runtime dependencies** and that rule is not negotiable for
this brief either. You are writing, by hand:

- A tokeniser and object parser (dictionaries, arrays, streams, references).
- **Both** xref forms: classic xref tables *and* xref streams (PDF 1.5+).
- Object streams (`/ObjStm`) — objects compressed inside other objects.
- A serialiser that writes a fresh, single-revision document.

**Do not re-deflate content streams.** Copy `FlateDecode` payloads through
byte-for-byte, exactly as the JPEG cleaner copies the scan stream and the PNG
cleaner copies `IDAT`. Non-negotiable #5 applies to PDFs: we rewrite the
container, never the compressed content. Re-deflating would change every page's
bytes and, with a different zlib level, could change file size dramatically —
users would reasonably read that as "it re-rendered my document".

### Refuse cleanly

- **Encrypted PDFs** — detect `/Encrypt`, report clearly, do not attempt.
- **Linearized PDFs** — hint tables must be dropped or regenerated; dropping is
  fine and simpler, note it in a warning.
- **Damaged xref** — many real PDFs have broken xrefs and rely on reader
  recovery. Do not silently "repair" and re-emit; report and refuse.

A refusal is a good outcome. A wrong clean is not.

## Staging — do not attempt this in one pass

**Phase 1: inspect only.** Ship scanning with cleaning disabled. Report
everything in the table above, including prior revisions ("this file contains 3
earlier revisions carrying metadata"). Mark cleaning `unable_to_verify` /
unavailable. This ships real value in a fraction of the time and is exactly the
honest posture the product is built on — we tell people what is in the file even
when we cannot fix it.

**Phase 2: clean.** Only after Phase 1 is merged and the parser has been fed
real-world PDFs.

Do not start Phase 2 until Phase 1 is in `main`.

## Rules you must not break

1. No runtime dependencies in `src/lib/`.
2. **Full re-serialise. Never an incremental update.**
3. No re-deflating of content streams.
4. `src/lib/signals.ts` governs every claim.
5. `MAX_FILE_BYTES` is 25 MB (`src/lib/config.ts:7`). PDFs push this harder than
   images — check memory behaviour in the Web Worker and degrade gracefully.
6. Phase 1 must not claim any removal capability.

## Files you own

```
src/lib/pdf/**            (new — parser, serialiser, tokeniser)
src/lib/metadata/pdf.ts   (new)
src/lib/cleaners/pdf.ts   (new, Phase 2 only)
src/lib/signals.ts        (additions only)
src/lib/filetype.ts
tests/pdf.test.ts         (new)
```

## Files you must NOT touch

```
src/lib/cleaners/{jpeg,png,webp}.ts
src/lib/clean.ts          brief 06 owns the registry seam
src/content/guides/**
```

## Definition of done

```bash
pnpm test
pnpm build
```

Phase 2 tests must include this one, and it is the important one:

> Take a PDF whose `/Info` Author is a known unique string. Clean it. Assert
> that string does **not** appear anywhere in the raw output bytes — search the
> whole file, not the parsed object graph.

That single assertion is what catches the incremental-write trap, and a
re-scan-based test cannot catch it. Also assert: page content streams are
byte-identical before and after; an encrypted PDF is refused, not mangled; a
PDF with 3 prior revisions yields an output with exactly one.

Then write `.reports/09-pdf-report.md`, including which real-world PDFs you
tested against and which ones the parser refused.

# REPORT 09 — PDF, Phase 1 (inspect only)

**Status:** Phase 1 done. 147 tests green (127 → 147, +20), build, typecheck,
zero-JS guides and no-Japanese all pass. **Phase 2 (cleaning) not started, by
design.**

---

## What shipped

**`src/lib/pdf/lexer.ts`** — object lexer and parser. All eight object types
plus indirect references, over `Uint8Array`, no dependency. Returns `null`
rather than throwing: a PDF we cannot parse must be *reported*, never guessed at.

**`src/lib/pdf/document.ts`** — xref chain, revisions, object resolution.
Handles classic xref tables, xref streams (PDF 1.5+), hybrid files via
`/XRefStm`, and object streams (`/ObjStm`). FlateDecode via `DecompressionStream`,
which is native in both browsers and Node — still no dependency.

**`src/lib/metadata/pdf.ts`** — reads `/Info` and XMP across **every revision**.

**One new signal**, `prior-revisions`, `remove: false, verify: false`.

## The trap, and how the tests pin it down

A PDF is append-only. Saving again writes a new body and xref that points back
via `/Prev`; the old body stays in the file. A tool that "removes" metadata by
appending an update leaves the original **fully readable**.

The fixture reproduces this exactly: `buildPdfFixture({ withIncrementalUpdate: true })`
writes a full `/Info` (author `Jane Doe`), then appends a second revision whose
`/Info` has only the title — precisely what exiftool-style incremental writing
produces.

Tests assert the file is reported as still containing the author, that the
*current* revision genuinely does not, and that the user gets a warning saying
the earlier version is still in the file.

### I fell into a second version of the same trap, and the test caught it

First implementation merged all revisions' xref entries into one map, newest
winning. Resolving revision 1's `/Info` then returned the **newest** object —
so the scanner read the cleaned dictionary twice and reported no author.

That is the same failure the brief warns about, arriving from the other
direction: not "we wrote an incremental update", but "we read the file the way
a naive reader does". Fixed by giving each revision its own composed `view`
(its entries laid over every older one) and threading a revision index through
`getObject`/`resolve`.

Then a *third* instance: `scanPdf` was reading `meta.infos[0]`, which is the
newest revision, so the signal row still said "not detected" even though the
metadata layer had the author. Fixed by searching every revision.

Three separate places where "read the current view" was the wrong default. Worth
remembering for Phase 2 — the writing side will have the same shape.

## Phase 1 claims nothing it cannot do

There is no PDF cleaner. `support: 'scan'` in the registry, so brief 06's
compile-time guard would reject a cleaner-less `'clean'`.

- Every PDF signal is emitted with `removable: false`, asserted by a test that
  walks every signal in the result.
- Attempting a clean fails cleanly through the existing path: no blob, no
  removed signals, and the message "your original file has not been changed".
- Encrypted PDFs are detected, reported, and not touched.
- A file whose xref cannot be followed is reported as degraded, and the scan
  says the report may be incomplete rather than pretending completeness.

## Deliberately not done

- **No cleaning.** Phase 2 only after this is merged and fed real-world PDFs.
- **Predictors** on Flate streams (`/DecodeParms /Predictor`) are not undone;
  such a stream returns `null` and the object is skipped rather than
  misinterpreted.
- **Encrypted PDFs** are not decrypted.
- **C2PA in PDF** is a marker-presence check (`c2pa` / `jumb` in the bytes), not
  a parsed manifest. Honest for a presence report; would need real work to say
  more, and it currently risks a false positive on a file that merely contains
  those byte sequences. See risks.

## Risks for QA

- **Only fixture-tested.** The parser has never seen a real-world PDF. Real
  PDFs are far messier: broken xrefs, off-by-one offsets, generation-number
  reuse, producers that violate the spec routinely. **The single highest-value
  QA action is running a few hundred real PDFs through `collectPdfMetadata` and
  recording what degrades.** Brief 09 asks for that before Phase 2.
- **The C2PA check will false-positive.** Any PDF containing the ASCII `c2pa` or
  `jumb` anywhere — including in prose — reports a Content Credential. Narrow
  this before it misleads someone.
- `MAX_FILE_BYTES` is 25 MB and PDFs hit that far more often than images. Not
  tested near the limit; object-stream inflation could multiply memory use.
- `findXmpPackets` caps at 32 packets and scans raw bytes, so it can pick up an
  XMP packet inside an embedded file. Over-reporting, not under-reporting.
- Not verified in a real browser. `DecompressionStream` is well supported but
  the worker path has not been exercised with a PDF.

---

# Phase 2 — cleaning (2026-08-15)

PDF moved from inspect-only to `support: 'clean'`.

## How it works

`src/lib/pdf/serialise.ts` rebuilds the document. It walks the object graph
reachable from the **current** catalog, drops the metadata carriers, renumbers
what remains, and emits a single-revision file with one xref table. Nothing from
an older revision can survive, because nothing is copied except objects the walk
deliberately reached. Content streams are copied byte-for-byte; nothing is
re-deflated.

No `/Info` and no `/ID` are written. `/ID` is a pair of identifiers derived from
the original file, and carrying it forward would leave a fingerprint of the
document we were asked to clean.

## Why the re-scan was not enough

The brief is right that a re-scan cannot catch the incremental-write trap: an
appended update leaves the old `/Info` earlier in the file, the parser follows
the new xref, finds it empty, and reports success. So `cleaners/pdf.ts` verifies
its own output against **raw bytes** before returning it, and discards it if:

- the output does not parse back cleanly
- the output has anything other than exactly one revision
- any `/Info` field or XMP packet survived
- **any original metadata value appears anywhere in the output bytes**

Any of those returns `ok: false` and the caller keeps the original. Refusing is
always safe; shipping a damaged document is not.

## Real-world results

`pnpm pdf:clean-audit` over the same 733-file corpus as Phase 1:

| | | |
|---|---|---|
| Cleaned | 727 | **99.2%** |
| Refused | 6 | 0.8% |
| Threw | 0 | **0.0%** |

Refusals: 5 "unsupported structure" (the same files Phase 1 reported as
degraded), and **1 caught by the cleaner's own byte check** — a real file where
a metadata value survived the rebuild, and the safety valve discarded the output
rather than shipping it. That refusal is the single most reassuring line in this
report.

Of the 727 cleaned: every one parsed back, every one had exactly one revision,
and none contained its original author string anywhere in its bytes. Median
output was 0.93× the input size.

## Content preservation

`pnpm pdf:content-check` compares page count and the raw bytes of every content
stream, before and after. Parsing is not rendering — a PDF can be structurally
valid and blank — so this is the closest check to "looks the same" available
without a renderer.

**727 of 727 identical.** Zero page-count changes, zero content-stream byte
changes.

## Refused by design

- Encrypted PDFs. Cleaning would mean decrypting and re-encrypting strings and
  streams to keep them readable. Not attempted.
- Documents whose xref chain could not be followed.
- Anything where the catalog could not be read.
- Embedded file attachments are carried over rather than inspected, and the
  cleaner warns about them.

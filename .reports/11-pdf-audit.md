# Report 11 — Real-PDF validation

**Date:** 2026-08-15
**Harness:** `scripts/pdf-audit.ts` (`pnpm pdf:audit <dir> ...`)
**Corpus:** 733 PDFs from `/System/Library`, `/Library`, `/Applications`,
`~/Downloads` on the development machine. Local only; nothing about these files
is recorded beyond the aggregates below. No filenames, paths, or metadata values
left the machine or entered the repo.

This closes the item `CLAUDE.md` listed as the highest-value next action:
`collectPdfMetadata` had only ever been run against fixtures we wrote ourselves.

---

## Result

| | | |
|---|---|---|
| Clean parse | 728 | **99.3%** |
| Degraded | 5 | 0.7% |
| Threw | 0 | **0.0%** |
| Encrypted | 0 | 0.0% |

No exceptions across 733 files. Timing: median 0.2 ms, p95 3.3 ms, max 175.7 ms,
nothing over one second.

**Verdict: PDF may be claimed as supported for scanning** in the capability
matrix, without qualification. The 10% degradation threshold set in the build
plan was not approached.

## Structure

| | | |
|---|---|---|
| Multiple revisions | 36 | 4.9% |
| **Stale metadata in an older revision** | 27 | **3.7%** |
| Linearized | 11 | 1.5% |

The 3.7% is the product's whole argument for staging PDF, now measured rather
than asserted: in 27 of 733 ordinary files, metadata survives in a revision the
current one has superseded. A cleaner that rewrites only the newest `/Info`
leaves that readable. This is publishable evidence — see the content plan.

## Findings

| | | |
|---|---|---|
| Any `/Info` field | 356 | 48.6% |
| Author | 146 | 19.9% |
| Custom `/Info` keys | 32 | 4.4% |
| XMP packet | 127 | 17.3% |
| JavaScript | 0 | 0.0% |
| Embedded files | 0 | 0.0% |
| C2PA | 0 | 0.0% |

Roughly one in five ordinary PDFs on a stock machine carries a named author.

## Degradation

The five degraded files produced only our two existing xref warnings
("could not be located" ×5, "could not be read" ×3, overlapping). They are
reported honestly rather than guessed at, which is the intended behaviour.
No further work is required before claiming scan support.

---

## Note on the C2PA fix

The C2PA presence check was a raw byte search for `c2pa` or `jumb` across the
whole file (`src/lib/metadata/pdf.ts:136`), now replaced with a structural JUMBF
box test plus an `/AFRelationship /C2PA_Manifest` object-graph check.

**Measured field impact: none.** Across 953 local PDFs, the old byte search
would have matched zero files. The initial characterisation of the bug as one
that "false-positives readily" was not supported by the corpus, and is corrected
here.

The defect is nonetheless real and is now pinned by test: any PDF that merely
*discusses* Content Credentials matches the old check. NoWatermark's own
`/guides/what-is-c2pa` page, exported to PDF, would have reported itself as
carrying a C2PA manifest. Four ASCII bytes are not a signature. Fixed because a
false provenance claim is the worst class of bug this product can ship, not
because it was observed firing.

Tests added: 7 (`tests/pdf.test.ts` — "C2PA detection is structural, not a byte
search"). Suite 157 → 164.

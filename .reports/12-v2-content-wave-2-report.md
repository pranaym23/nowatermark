# Report 12 — V2 content wave 2, funnel analytics, content lint

**Date:** 2026-08-15
**Brief:** `.briefs/12-v2-content-wave-2.md`
**Drafting agent:** agy, `gemini-3.7-flash-high` — 11 jobs, run in parallel

Guides: 21 → **31**.

---

## Outsourcing, pushed harder

Eleven agy jobs: ten articles and, as an experiment, the content lint script
itself. All eleven returned usable output on the first attempt, against three
of five failing in wave 1. Three changes did it:

1. **Everything inline, and an explicit "do not use any tools."** Headless agy
   auto-denies tool permissions and returns an error string rather than output.
2. **The valid slug lists in the brief.** Every legal `relatedTools` and
   `relatedGuides` value was enumerated. Result: zero broken internal links
   across ten articles — checked exhaustively.
3. **Named the failure modes wave 1 produced** — US spellings, raw slugs as link
   text, ASCII-art diagrams, the flattened "measured" qualifier. Naming them
   stopped all four recurring.

| | Slug | Cluster |
|---|---|---|
| A | `ai-detector-false-positives` | detector-resistance |
| B | `do-ai-humanizers-work` | detector-resistance |
| C | `why-ai-detectors-disagree` | detector-resistance |
| D | `what-is-xmp` | provenance-standards |
| E | `png-text-chunks-explained` | format-workflows |
| F | `dall-e-3-metadata-explained` | ai-image-fingerprints |
| G | `does-discord-remove-exif` | platform-behaviour |
| H | `does-twitter-remove-exif` | platform-behaviour |
| I | `how-to-remove-metadata-from-svg` | format-workflows |
| J | `what-is-jumbf` | provenance-standards |

## The lint script, and what it says about outsourcing

`scripts/content-lint.ts` (`pnpm lint:content`) was drafted by agy from a spec.
It worked on the first run — and immediately proved **the spec was wrong**, in a
way worth recording.

As specified, it treated forbidden claim phrases as errors. On first run it
flagged 79 errors, and the loudest were sentences the site should be proud of:

- "No tool **guarantees** bypassing AI **detect**ion"
- "does not **certif**y **human** authorship"
- "Can You **Remove SynthID**?" — the title of the page explaining you cannot

The checks were negation-blind. The dangerous sentence and the honest one are
built from the same words, and a regex cannot separate them. A gate that flags
every correct statement gets ignored, and then it catches nothing.

Rewritten: claim checks are **WARN**, filtered by a negation test on the run-up
to the match; structural checks stay **ERROR**. Also dropped `author` and
`contentType` from the required keys, since both carry schema defaults and
requiring them flagged twelve valid files. 79 errors → 0, with 15 warnings that
are all worth a human read and all turned out fine.

**agy implemented the spec correctly. The spec was mine and it was wrong.** That
is the second time in two waves that verification caught my own error rather
than the model's, which is the argument for keeping the human in the loop
somewhere other than where you'd expect.

The lint fixes themselves were **not** outsourced. Having the model repair the
gate that catches the model's mistakes is a poor control structure.

### Two build-breakers the gate initially missed

Both YAML, both would have failed the Cloudflare build:

- An unquoted `title:` containing `": "` — two articles. Added a check; it
  caught both. The first version only scanned column zero, so it then passed a
  FAQ answer reading `They exist in three forms: uncompressed…`, which broke the
  build anyway. Extended to nested keys.
- A single-quoted scalar containing an apostrophe (`'…Google's…'`), which
  terminates the string early. **I introduced this one** while shortening
  metaTitles. Added a check for it too.

Both checks now exist because both failures happened. The gate is a record of
real bugs, not a guess at possible ones.

## Verification

`pnpm lint:content`: **0 errors, 15 warnings** across all 31 guides. Fixed along
the way, in pre-existing content: 6 US spellings, 9 metaTitles over 65
characters.

Facts checked by hand against source, per article:

- **E** — PNG chunk list matches `PNG_STRIP` exactly (`tEXt zTXt iTXt eXIf tIME
  caBX dSIG`), and correctly names the chunks that are preserved.
- **I** — SVG regions match `src/lib/metadata/svg.ts`: comments, generator
  comments, `metadata` elements, `script` elements, event handlers, remote
  references, base64 `data:` URI images.
- **J** — JUMBF box structure correct; states plainly that signatures are not
  verified and manifests are reported present, never valid.
- **D** — XMP locations per format correct against the scanners.
- **B** — carries the exact "in any way NoWatermark has measured" qualifier in
  three places. This was wave 1's recurring failure and it did not recur.
- **F** — makes no claim about what any OpenAI product writes, and says so.
- **G and H** — **neither states any Discord or Twitter/X behaviour.** Both say
  we have not tested them and route the reader to a test they can run in a
  minute on their own account. H leads on the safety framing rather than
  reusing G's structure.

Internal links: every `/guides/...` reference across all 31 files resolves.

### Pre-existing debt found, not introduced

`does-instagram-remove-exif` (wave from an earlier build) **does** assert
platform behaviour we never tested — "Instagram strips standard EXIF GPS tags on
upload". The new platform articles deliberately do not copy that pattern. The
Instagram page should either be tested or rewritten to match; it is not fixed
here because rewriting a ranking page is an editorial call, not a cleanup.

---

## Funnel analytics

`src/lib/analytics.ts`. Three events — `scan_result`, `clean_complete`,
`download_click` — unblocking the V2 success criteria that had no instrument.

The design point: **the payload is constrained by the type system, not by
convention.** Each event declares the exact keys it may carry; every value is a
closed enum or a count bucket (`'0' | '1-3' | '4-10' | '11+'`). "This file had
twelve signals" is a fact about someone's file; "this scan was in the 11+
bucket" is a fact about usage. `track()` will not compile with an undeclared
key, so the rule cannot be broken by a well-meaning one-line diff.

There is deliberately **no rewrite event**, because `/privacy` states that using
rewrite sends none. An unused declaration is an invitation, so it was removed
rather than left dangling.

**Verified in a browser** by intercepting `gtag` through a full scan and clean:

```
scan_result     surface=file  format=JPEG  outcome=ok  signals=11+
clean_complete                format=JPEG  outcome=ok  removed=4-10
download_click                format=JPEG
```

12 detected became `11+`; 10 removed became `4-10`. On the wire:
`en=scan_result&ep.surface=file&ep.format=JPEG&ep.outcome=ok&ep.signals=11%2B`.
No filename, size, hash, dimension or metadata value — the file was called
`loaded.jpg` and that string appears nowhere.

`/privacy` was updated in the same commit, per the standing rule, and now lists
all three events, their exact fields, and why the count is a range.

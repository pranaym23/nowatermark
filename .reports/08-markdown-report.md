# REPORT 08 — Markdown and plain-text scanning

**Status:** done. 127 tests green (102 → 127, +25), build, typecheck, zero-JS
guides and the no-Japanese check all pass.

---

## What shipped

**`src/lib/metadata/frontmatter.ts`** — a frontmatter *locator*. It reports byte
ranges, not values, and has no YAML semantics beyond finding where an entry
starts and stops. No dependency.

**`src/lib/cleaners/markdown.ts`** — deletes ranges, copies the rest, then runs
the existing `cleanHiddenCharacters` over the result.

Detection is by content, never by extension: valid UTF-8 with no NUL or stray
C0 control bytes. A `.txt` or `.csv` is handled the same way and the locator
simply finds no frontmatter, which is the correct answer.

## The decision worth reviewing: we do not remove everything

Unlike EXIF, a Markdown file's frontmatter is **functional** — `title`, `tags`,
`layout` and `slug` drive the user's site build. Stripping them would break the
file rather than clean it.

So the cleaner removes only keys describing **how the document was made**:

| Removed | Kept |
|---|---|
| `generator`, `tool`, `software`, `engine` | `title`, `description` |
| `model`, `prompt`, `ai_generated`, `seed`, `llm` | `tags`, `layout`, `slug`, `draft` |
| `author`, `creator`, `copyright`, `rights` | anything unrecognised |
| `date`, `created`, `updated`, `lastmod` | |

Unrecognised keys are left alone. That is conservative by design — the cost of
a false positive here is a broken site build, and the honest report is "we
removed what we recognised".

The warning names every key removed, so the user can put anything back.

## Extent, not semantics

The locator finds an entry's end by scanning to the next key line at the same or
shallower indentation. That handles nested maps, `- item` lists and `|`/`>`
block scalars without understanding any of them. Tested for all three:

- a block scalar is removed whole (`prompt: |` and both its continuation lines)
- a list value does not swallow the following key
- nested keys report a dotted path (`ai.model`)

**YAML anchors are refused.** `&anchor`, `*alias` and `<<:` merge keys mean one
entry's value can depend on another, so deleting a key can silently change a key
we kept. The scan reports what is there, marks it not removable, warns, and the
cleaner changes nothing in the frontmatter. That is the honesty rule applied to
the parser's own limits.

## Byte preservation

Asserted directly rather than inferred:

- CRLF stays CRLF (no lone `\n` anywhere in the output)
- a file with no trailing newline still has none
- removing one key leaves an exact expected string, byte for byte
- a file with no metadata is returned **identical**
- cleaning twice is a no-op

## Bug found and fixed: short files were undetectable

`detectType` opened with `if (b.length < 12) return 'unknown'`. That floor
exists for the binary signatures — RIFF/WEBP needs 12 bytes to check — but it
also gated the new text sniffing.

The consequence was not cosmetic. `cleanImage` re-scans its own output to verify
removal, so cleaning a small Markdown file produced output under 12 bytes, the
re-scan threw `unsupported-format`, and **the entire clean failed**. Caught by
the "drops the fences when every key was removed" test, whose output is 7 bytes.

The floor now wraps only the binary checks. Regression test added covering
3- and 4-byte text.

## Copy updated

- `/methodology` — supported formats, plus a new line explaining which
  frontmatter keys are removed and which are kept, and the anchors limitation.
- The scanner tab is now **"File"**, not "Image" — it accepts Markdown.
- "Drop an image here" → "Drop a file here"; "We couldn't read this image" →
  "…this file".
- `/about` and the homepage FAQ.

## Risks for QA

- **The "File" tab still lives beside a "Text" tab that takes a paste.** Two
  routes to hidden-character cleaning now exist and they behave slightly
  differently — the file route also strips frontmatter. Worth a UX look.
- **Any UTF-8 file is now accepted**, including `.json`, `.csv` and source code.
  Nothing bad happens (no frontmatter, no comments matched), and hidden-Unicode
  scanning genuinely works on them — but the accept list in the OS file picker
  now shows `text/markdown` and users may drop unexpected things.
- The JSON-LD removal is deliberate but destructive for someone who hand-wrote
  structured data into a post. It is warned about, not silent.
- Not yet verified in a real browser.

# Report 11b — V2 content wave 1

**Date:** 2026-08-15
**Brief:** `.briefs/11-v2-content-wave-1.md`
**Drafting agent:** agy, `gemini-3.7-flash-high`
**Verification:** Claude, line by line against the fact sheets

Five articles, all shipped. Raw drafts kept at `.reports/11-agy-{A..E}.md` so the
edits made during verification stay auditable.

| | Slug | Type | Cluster |
|---|---|---|---|
| A | `pdf-metadata-hides-in-old-revisions` | lab | format-workflows |
| B | `invisible-unicode-character-detector` | guide | hidden-text |
| C | `what-is-iptc-digitalsourcetype` | guide | provenance-standards |
| D | `how-to-remove-exif-data-mac` | guide | privacy-cleanup |
| E | `can-ai-detectors-be-beaten` | guide | detector-resistance |

Article A is original research — the 733-file PDF audit from report 11. It is
the first page on this site a third party could cite for a number nobody else
has.

---

## How the split worked

agy drafted from a fact sheet and was forbidden from asserting anything outside
it. Claude wrote every file, so verification could not be skipped.

**agy in headless mode cannot use tools.** It auto-denies the permission and
returns an error string instead of output; three of the first five runs produced
nothing for this reason. The fix is to inline everything it needs in the prompt
and tell it explicitly not to use tools. Worth knowing before the next wave.

## What verification caught

Every article had defects. None would have been caught by a second model pass.

1. **An error in my own brief.** The fact sheet said the corpus machine ran
   macOS 15. It runs macOS 26.5.2. agy propagated it faithfully into two
   articles. *The fact sheet needs verifying as much as the draft does.*
2. **Two overclaims of the same kind.** Articles B and E both stated flatly that
   removing hidden Unicode "does not alter statistical detector scores". The
   fact sheet licensed only "does not affect detector output in any way
   NoWatermark has measured". Corrected in both, in body and FAQ. This is
   precisely the distinction the product exists to make, and the model erased it
   twice without being asked to.
3. **An unverified platform claim.** Article C asserted that "the vast majority
   of social media networks strip metadata blocks on upload". We have not tested
   any platform. Rewritten as a mechanism to be aware of, with the untested
   status stated.
4. **Leaked instruction text.** Article A ended a paragraph with "We do not
   imply that PDF cleaning is currently available or imminent" — an instruction
   from the brief addressed to the writer, rendered as prose to the reader.
5. **Register and consistency.** US spellings (artifacts, behavior, analyzing,
   sanitize, organization) and raw URL slugs used as link text
   (`[/exif-remover](/exif-remover)`) throughout.

**What it got exactly right:** the code-point tables in article B — 19 single
code points and 9 ranges, each with category and risk — were checked character
by character against `src/lib/unicode/hidden.ts` and were correct in every
cell. Article C correctly volunteered that we have not tested which tools write
the tag. Article E passed all five hard gates unmodified: no undetectability
claim, no authorship certification, disagreement stated prominently, no accuracy
figures, no evasion instructions.

## Gate on article E

E targets evasion intent deliberately (build plan A3, decision taken 2026-08-15
for SEO/GEO reach). The four guardrails were treated as build gates rather than
editorial preferences. It passed. Its strongest section is "what to do if you
are falsely accused", which is the thing that query's traffic actually needs.

## Browser verification

Preview build, Chrome, both themes.

- No console errors, **no CSP violations** on any new page.
- Contrast, computed not eyeballed. Dark: last-tested 7.11, panel label 5.36 at
  10px, void panel 18.26, muted 7.11. Light: 7.46 / 5.07 / 18.63 / 7.46. All
  pass AA. The 10px panel label is the case `CLAUDE.md` records as having failed
  once before; it passes now.
- Code blocks after disabling Shiki: 14.82 contrast, scroll inside their own box.
- No page scrolls horizontally at mobile width.
- Guides ship **zero** application JavaScript.
- `unable_to_verify` renders as the inked-out void panel, undecorated.

**End-to-end product check.** Scanned a loaded JPEG: 12 signals found, GPS read,
C2PA manifest detected, SynthID reported unable to verify. Cleaned it: 13
signals confirmed removed by re-scan, SynthID still unable to verify and absent
from the removed list, download offered as a local `blob:` URL.

**Network during the entire scan and clean: one request.** A GA4 `page_view`
carrying page URL and title. No filename, no size, no hash, no metadata value,
and no `file_download` event. Non-negotiable #1 holds, verified in a browser
rather than assumed.

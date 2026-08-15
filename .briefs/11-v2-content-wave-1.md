# Brief 11 — V2 content wave 1

**Owner of this brief:** Claude (facts, verification, merge)
**Drafting agent:** agy, `gemini-3.7-flash-high`
**File ownership:** the drafting agent writes **only** to
`src/content/guides/<slug>.md`. It must not touch `src/lib/`, `src/components/`,
`src/pages/`, `src/styles/`, `astro.config.ts`, or anything under `functions/`.

---

## The rule that matters

**You may assert a fact only if it appears in the fact sheet for your article.**

Not "you may check it first". Not "you may use your training data". If a claim
is not in the fact sheet, either leave it out or write, in the article, that
NoWatermark has not tested it. "We have not tested this" is a publishable
sentence on this site — it is, in fact, the house style. An invented statistic
or a plausible-looking citation is the single worst thing that can be added to
this codebase, because the entire product is a claim to be honest about limits.

Do not invent: statistics, percentages, dates, study names, quotes, URLs,
detector accuracy numbers, or platform behaviours.

### Forbidden phrasings

Never write, in any form:

- that content can be made undetectable, universally or otherwise
- that any tool guarantees bypassing AI detection
- that NoWatermark certifies, verifies, or proves human authorship
- that SynthID or any statistical text watermark can be removed or confirmed
  absent — the only correct status is "unable to verify"
- that a signal was removed without the qualifier that removal is confirmed by
  re-scanning the cleaned file
- any specific detector accuracy figure

---

## Frontmatter contract

Every file starts with exactly this shape. The build **fails** if it is wrong.

```yaml
---
title: Sentence-case question or statement
metaTitle: 'Under 60 chars | NoWatermark'
description: One sentence, 140-158 chars, for the SERP snippet.
summary: One sentence for index cards. Different wording from description.
publishDate: 2026-08-15
author: NoWatermark
contentType: guide        # guide | lab | comparison | answer
cluster: <given per article>
order: 50
relatedTools: ['/exif-remover']       # must exist in src/lib/site.ts
relatedGuides: ['/guides/what-is-c2pa'] # must exist in src/content/guides/
sources:
  - title: Exact page title
    url: https://example.org/exact-url
    accessed: 2026-08-15
faq:
  - q: A question a real searcher types
    a: Two to four sentences. Answer it directly in the first one.
---
```

`contentType: lab` and `comparison` additionally **require** `lastTested:`.
Only use `sources:` entries that are given to you in the fact sheet.

## House style

- British English. Sentence case in headings.
- Open by answering the question in the first two sentences. No throat-clearing,
  no "In today's digital landscape".
- Short paragraphs. Concrete nouns. No marketing register.
- Distinguish carefully and repeatedly between three different things:
  **metadata** (removable, and we confirm it by re-scanning),
  **pixel or statistical watermarks** (we cannot measure these — "unable to
  verify"), and **server-side provenance** (a service can re-associate a file
  using its own database; nothing local can affect that).
- 1,200-1,800 words unless the fact sheet says otherwise.
- Link naturally to the related tools in prose, not only in a list at the end.
- No application JavaScript, no scripts, no iframes, no images.

---

# Fact sheets

Everything below is verified. Nothing outside it is.

---

## Article A — `pdf-metadata-hides-in-old-revisions`

- **cluster:** `format-workflows`
- **contentType:** `lab`
- **lastTested:** `2026-08-15`
- **relatedTools:** `['/exif-remover', '/ai-metadata-remover']`
- **relatedGuides:** `['/guides/how-to-remove-exif-data', '/guides/what-is-c2pa']`
- **target query:** `pdf metadata still there after removing`, `pdf author
  metadata remove`, `pdf hidden revisions`
- **sources:** none external. This is our own test. Put the method in the
  `changelog` instead:
  ```yaml
  changelog:
    - date: 2026-08-15
      note: First run. 733 PDFs from system and application directories on a macOS 15 machine, scanned with NoWatermark's PDF parser.
  ```

### Facts (all first-party, measured 2026-08-15)

Corpus: 733 PDF files found on an ordinary macOS machine, in system, library,
application and downloads directories. Scanned locally with NoWatermark's own
PDF parser. No file content left the machine.

| Measurement | Result |
|---|---|
| Parsed cleanly | 728 of 733 — 99.3% |
| Parser reported degraded structure | 5 — 0.7% |
| Parser threw an error | 0 — 0.0% |
| Encrypted | 0 |
| **More than one revision in the file** | **36 — 4.9%** |
| **Metadata present in a superseded revision** | **27 — 3.7%** |
| Linearised | 11 — 1.5% |
| Any `/Info` metadata field populated | 356 — 48.6% |
| A named author | 146 — 19.9% |
| Non-standard custom `/Info` keys | 32 — 4.4% |
| An XMP packet | 127 — 17.3% |
| Document JavaScript | 0 |
| Embedded files | 0 |
| C2PA manifest | 0 |

Timing: median 0.2 ms per file, 95th percentile 3.3 ms, slowest 175.7 ms.

### The mechanism (this is the article)

A PDF is append-only. Saving one again does not rewrite it — it appends a new
body and a new cross-reference table that points back at the previous one. Every
earlier revision is still physically in the file and still readable.

So a tool that "removes" PDF metadata by writing a new `/Info` dictionary and
appending it leaves the original `/Info` sitting earlier in the same file,
completely intact. The document viewer shows the new one. Anyone reading the
bytes can read the old one.

**This is what 3.7% of ordinary files on a normal computer look like.** Roughly
one PDF in twenty-seven carries metadata its current revision has superseded.

### What NoWatermark does about it

- It reads the `/Info` dictionary and XMP packet of **every** revision, not just
  the newest, and reports them separately. Reporting only the current revision
  would mean telling someone their file is clean while their name is still in it.
- It warns explicitly when earlier revisions exist.
- **PDF is currently inspect-only. NoWatermark does not clean PDFs yet.** Say
  this plainly. The reason is in the numbers above: cleaning a PDF correctly
  means a full re-serialisation, because an incremental update is exactly the
  bug being described. Do not imply a cleaning feature exists or is imminent.
- What a reader should do today: check the file, and if it has prior revisions
  carrying metadata, re-export it from the source application rather than
  patching it.

### Do not claim

- Do not generalise 3.7% to "all PDFs on the internet". It is one corpus of 733
  files on one machine, weighted towards software documentation. Say so.
- Do not name the specific files or applications. We did not record them.
- Do not claim other tools are broken by name. Describe the mechanism.

---

## Article B — `invisible-unicode-character-detector`

- **cluster:** `hidden-text`
- **contentType:** `guide`
- **relatedTools:** `['/claude-watermark-checker', '/claude-watermark-remover']`
- **relatedGuides:** `['/guides/hidden-unicode-characters', '/guides/does-claude-watermark-text']`
- **target query:** `invisible unicode character detector`, `find hidden
  characters in text`, `zero width space detector`
- **sources:** none required; the detector's own behaviour is the subject.

### Facts — exactly what NoWatermark detects

Single code points:

| Code point | Name | Category | Risk |
|---|---|---|---|
| U+00AD | Soft hyphen | zero-width | medium |
| U+061C | Arabic letter mark | bidi control | medium |
| U+180E | Mongolian vowel separator | zero-width | medium |
| U+200B | Zero-width space | zero-width | high |
| U+200C | Zero-width non-joiner | zero-width | high |
| U+200D | Zero-width joiner | zero-width | high |
| U+200E | Left-to-right mark | bidi control | medium |
| U+200F | Right-to-left mark | bidi control | medium |
| U+2028 | Line separator | control | low |
| U+2029 | Paragraph separator | control | low |
| U+2060 | Word joiner | zero-width | high |
| U+2061 | Function application | zero-width | medium |
| U+2062 | Invisible times | zero-width | medium |
| U+2063 | Invisible separator | zero-width | medium |
| U+2064 | Invisible plus | zero-width | medium |
| U+2800 | Braille pattern blank | unusual space | medium |
| U+3164 | Hangul filler | unusual space | high |
| U+FEFF | Zero-width no-break space (BOM) | zero-width | high |
| U+FFA0 | Halfwidth Hangul filler | unusual space | high |

Ranges:

| Range | Name | Category | Risk |
|---|---|---|---|
| U+0000-U+0008 | Control character | control | medium |
| U+000B-U+000C | Control character | control | low |
| U+000E-U+001F | Control character | control | medium |
| U+007F-U+009F | Control character | control | medium |
| U+202A-U+202E | Bidirectional override | bidi control | high |
| U+2066-U+2069 | Bidirectional isolate | bidi control | high |
| U+FE00-U+FE0F | Variation selector | variation selector | medium |
| U+E0000-U+E007F | Tag character | tag character | high |
| U+E0100-U+E01EF | Variation selector supplement | variation selector | medium |

Unusual spaces that render but are not U+0020: U+00A0, U+2000-U+200A, U+202F,
U+205F, U+3000.

### The interesting part — false positives are the hard problem

U+200D (zero-width joiner) and U+FE0F (variation selector-16) are
**load-bearing inside emoji**. The joiner is what fuses separate emoji into one:
strip it from a family emoji and you get three separate people. Variation
selector-16 is what makes an emoji render in colour rather than as a monochrome
glyph.

NoWatermark classifies those occurrences as legitimate and leaves them alone by
default. A detector that strips every invisible character breaks text it was
asked to clean. This distinction is the whole reason the tool is not a
three-line regex, and it is worth explaining properly.

Tag characters (U+E0000-U+E007F) are the highest-concern category: they can
encode arbitrary ASCII invisibly inside otherwise normal text.

### Framing

- Everything runs in the browser. Pasted text is never sent anywhere.
- Invisible characters have legitimate uses — this is a detector, not an
  accusation. Bidi controls are needed for real bidirectional text; soft hyphens
  are typographic.
- Do **not** claim invisible characters prove text came from any particular AI
  system. They are frequently the result of copy-pasting from web pages, word
  processors and PDFs.

---

## Article C — `what-is-iptc-digitalsourcetype`

- **cluster:** `provenance-standards`
- **contentType:** `guide`
- **relatedTools:** `['/ai-watermark-checker', '/ai-metadata-remover', '/c2pa-checker']`
- **relatedGuides:** `['/guides/what-is-c2pa', '/guides/how-to-check-ai-image-metadata']`
- **target query:** `trainedalgorithmicmedia`, `iptc digitalsourcetype`, `how
  are ai images tagged`
- **sources:** use these two, and no others:
  ```yaml
  sources:
    - title: IPTC NewsCodes — Digital Source Type
      url: https://cv.iptc.org/newscodes/digitalsourcetype/
      accessed: 2026-08-15
    - title: IPTC Photo Metadata Standard
      url: https://iptc.org/standards/photo-metadata/iptc-standard/
      accessed: 2026-08-15
  ```

### Facts

- IPTC maintains a controlled vocabulary called **Digital Source Type**, a set
  of fixed identifier values describing how a piece of media came into
  existence. It is published as an IPTC NewsCodes vocabulary.
- The value used for media created by a generative AI model is
  **`trainedAlgorithmicMedia`**.
- The vocabulary distinguishes this from other origins — for example media
  captured by a camera, and media composited or edited — so the point of the
  field is to say *how the file was made*, not *who made it*.
- The value is carried in **XMP**, which is an ordinary metadata block inside
  the file.
- Because it is ordinary metadata, NoWatermark can detect it, can remove it, and
  can confirm removal by re-scanning the cleaned file.
- It is also carried inside C2PA manifests as an assertion, which is a different
  mechanism with different durability — see the C2PA guide.

### The point to land

`trainedAlgorithmicMedia` is a **label a generator chose to write**, not a
measurement of the image. It is present because the tool that made the file
decided to be honest. Removing it does not change the pixels and does not affect
any statistical or pixel-level watermark such as SynthID, which NoWatermark
reports as unable to verify in all cases. Nor does it affect a provenance record
held server-side by the generator.

So: it is useful for a reader who wants to know whether a file is *declaring*
itself as AI-made, and useless as proof that a file is *not*.

### Do not claim

- Do not state which specific companies write this tag or in which products.
  We have not tested that.
- Do not give a date for when the vocabulary value was introduced.

---

## Article D — `how-to-remove-exif-data-mac`

- **cluster:** `privacy-cleanup`
- **contentType:** `guide`
- **relatedTools:** `['/exif-remover', '/ai-watermark-checker']`
- **relatedGuides:** `['/guides/how-to-remove-exif-data', '/guides/how-to-remove-location-from-iphone-photos']`
- **target query:** `remove exif data mac`, `remove photo metadata mac without
  software`, `mac remove gps from photo`
- **sources:** none. Describe only what is in the fact sheet.

### Facts

- macOS Preview has an inspector that displays image metadata, including EXIF
  and GPS when present.
- macOS Photos offers a location adjustment on an image.
- Both are provided by Apple; NoWatermark has **not** verified byte-for-byte
  what either removes. Say that explicitly rather than describing exact
  behaviour we have not measured.
- The reliable, checkable route is the one NoWatermark can speak to: open the
  file in a tool that reads the container directly, remove what is removable,
  and **re-scan the output to confirm** the field is gone. That is what
  `/exif-remover` does, in the browser, without the file leaving the machine.
- NoWatermark rewrites the container and copies the compressed image data
  byte-for-byte, so removing metadata does not recompress the photo and does not
  reduce its quality. This is verified by test.
- Supported for cleaning: JPEG, PNG, WebP, SVG, Markdown. PDF is inspect-only.

### Structure

Lead with the honest comparison: built-in macOS tools show you metadata and can
change some of it, but do not tell you what remains. The value of a checkable
tool is the re-scan. Frame the article around *verifying*, not around clicking
through menus we have not tested.

### Do not claim

- Do not write step-by-step instructions with specific menu paths, version
  numbers, or screenshots — we have not verified them and they change.
- Do not claim that any Apple tool does or does not strip a specific field.

---

## Article E — `can-ai-detectors-be-beaten`

**Read this section twice before writing. It is the one that can damage the
site.** It targets evasion intent deliberately, and it must answer that intent
honestly rather than serving it.

- **cluster:** `detector-resistance`
- **contentType:** `guide`
- **relatedTools:** `['/claude-watermark-checker', '/claude-watermark-remover']`
- **relatedGuides:** `['/guides/does-claude-watermark-text', '/guides/hidden-unicode-characters', '/guides/what-is-synthid']`
- **target query:** `can ai detectors be beaten`, `how accurate are ai
  detectors`, `ai detector false positive`
- **sources:** none. You have no permission to cite a study. Write the article
  without citations, from the fact sheet only.

### Facts

- AI text detectors are **statistical classifiers**. They estimate a
  probability that text resembles model output. They do not read a watermark, a
  tag, or a record of authorship, and a result is a probability, not a fact
  about who wrote something.
- Because they are statistical, they produce **both** false positives (human
  text flagged as AI) and false negatives. Neither can be eliminated.
- **Different detectors disagree with each other on the same text.** When two
  named detectors disagree, the honest report is the disagreement itself —
  averaging two probabilities into one number invents a certainty that neither
  tool has.
- A detector result is **not evidence of authorship** in either direction. A
  low score does not certify a human wrote something; a high score does not
  prove a machine did.
- Some AI systems embed **statistical watermarks** in the text they generate.
  NoWatermark **cannot detect these and cannot confirm their absence.** The
  status is permanently "unable to verify". This is not a limitation we intend
  to fix — a local tool cannot measure a signal whose detector is held by the
  model provider.
- NoWatermark **can** detect and remove **hidden Unicode characters** — see the
  code point table in Article B. That is ordinary character data, detectable
  and removable, and removal is confirmed by re-scanning.
- Hidden Unicode is not the same thing as a statistical watermark, and removing
  it does not affect detector output in any way NoWatermark has measured.
- NoWatermark's optional text rewriting is designed to **preserve meaning,
  facts, voice, citations and formatting**. It is not a distortion tool, and it
  is not tuned against any detector.

### What the article must do

Answer the query directly and early: *no tool can guarantee that text will pass
an AI detector, and any tool promising that is lying to you.* Then explain why
that is a property of how detectors work rather than a temporary gap.

Then give the reader something genuinely useful, which is the thing they
actually needed:

- what a detector score does and does not mean
- why two detectors disagree, and what to do when they do
- **what to do if you are wrongly accused** — this is real and common, and it is
  the most valuable section in the article. A false positive on honest work is
  a serious problem for a student or a writer. Cover: keep drafts and version
  history, ask which detector was used and what its stated error rate is, ask
  whether a second detector agrees, and point out that a probability is not a
  finding of fact.
- what is actually measurable in a file or a piece of text, and what is not

### Hard gates — the page does not ship if it fails any

1. No statement that content can be made undetectable.
2. No claim NoWatermark certifies or proves human authorship.
3. Limitations and detector disagreement are stated prominently, not buried.
4. No accuracy figures, no percentages, no named studies, no detector brand
   comparisons.
5. No instructions optimised for defeating a detector — no "use these phrasings
   to lower your score", no word-swap lists, no advice on evading academic
   integrity processes.

### Tone

Not preachy, not a lecture about cheating. The reader has a real problem —
usually "I wrote this myself and got flagged", or "I used AI to help and don't
know what that means for me". Treat them as an adult. The article earns the
ranking by being the most honest page on the query, not the most permissive.

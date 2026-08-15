# Brief 12 — V2 content wave 2

**Owner:** Claude (facts, verification, file writes)
**Drafting agent:** agy, `gemini-3.7-flash-high`
**Output:** the complete markdown file, to stdout. **agy does not write files.**

Ten articles. Same contract as brief 11, restated here in full because agy
receives this inline and cannot read other files.

---

## The rule that matters

**You may assert a fact only if it appears in the fact sheet for your article.**

Not "you may check it first" — you have no tools and must not try to use any.
If a claim is not in your fact sheet, either leave it out, or write in the
article that NoWatermark has not tested it. "We have not tested this" is a
publishable sentence here. It is the house style.

Never invent: statistics, percentages, dates, study names, quotes, URLs,
detector accuracy figures, company behaviours, or product version numbers.

### Forbidden in every article

- that content can be made undetectable, universally or otherwise
- that any tool guarantees bypassing AI detection
- that NoWatermark certifies, verifies or proves human authorship
- that SynthID or any statistical text watermark can be removed, or confirmed
  absent — the only correct status is "unable to verify"
- that a signal was removed, without the qualifier that removal is confirmed by
  re-scanning the cleaned file
- any specific detector accuracy figure
- advice aimed at defeating an academic integrity process

## Frontmatter contract

The build **fails** if this is wrong.

```yaml
---
title: Sentence-case question or statement
metaTitle: 'Under 60 chars | NoWatermark'
description: One sentence, 140-158 characters.
summary: One sentence for index cards. Different wording from description.
publishDate: 2026-08-15
author: NoWatermark
contentType: guide        # guide | lab | comparison | answer
cluster: <given per article>
order: 50
relatedTools: ['/exif-remover']
relatedGuides: ['/guides/what-is-c2pa']
sources: []
faq:
  - q: A question a real searcher types
    a: Two to four sentences. Answer it in the first one.
---
```

`contentType: lab` and `comparison` additionally require `lastTested:`.
Use only `sources:` entries given in your fact sheet. If none are given, use
`sources: []` and cite nothing.

**Valid `relatedTools`** — use only these exact slugs:
`/ai-watermark-checker`, `/ai-watermark-remover`, `/chatgpt-watermark-checker`,
`/chatgpt-watermark-remover`, `/claude-watermark-checker`,
`/claude-watermark-remover`, `/synthid-checker`, `/synthid-remover`,
`/c2pa-checker`, `/c2pa-remover`, `/content-credentials-checker`,
`/ai-metadata-remover`, `/exif-remover`

**Valid `relatedGuides`** — use only these exact paths:
`/guides/c2pa-vs-synthid`, `/guides/can-you-remove-ai-watermarks`,
`/guides/can-you-remove-synthid`, `/guides/comfyui-workflow-metadata`,
`/guides/does-chatgpt-watermark-images`, `/guides/does-claude-watermark-text`,
`/guides/does-instagram-remove-exif`, `/guides/does-midjourney-watermark-images`,
`/guides/hidden-unicode-characters`, `/guides/how-to-check-ai-image-metadata`,
`/guides/how-to-remove-exif-data`,
`/guides/how-to-remove-location-from-iphone-photos`,
`/guides/stable-diffusion-png-metadata`, `/guides/what-are-content-credentials`,
`/guides/what-is-c2pa`, `/guides/what-is-synthid`,
`/guides/pdf-metadata-hides-in-old-revisions`,
`/guides/invisible-unicode-character-detector`,
`/guides/what-is-iptc-digitalsourcetype`, `/guides/how-to-remove-exif-data-mac`,
`/guides/can-ai-detectors-be-beaten`

## House style

- British English. Sentence case in headings. **Never** write "artifacts",
  "behavior", "analyze", "sanitize", "organization", "color".
- Answer the question in the first two sentences. No throat-clearing, no "In
  today's digital landscape".
- Link in prose using descriptive text — `[EXIF remover](/exif-remover)`, never
  `[/exif-remover](/exif-remover)`.
- 1,200–1,700 words.
- No images, no scripts, no iframes. Plain markdown only. Avoid ASCII-art
  diagrams; use a table or a list.
- Always distinguish three things: **metadata** (removable, confirmed by
  re-scan), **pixel or statistical watermarks** (unable to verify, permanently),
  and **server-side provenance** (a provider's own database; nothing local
  touches it).

## Shared background you may use in any article

- NoWatermark runs entirely in the browser. No file is ever uploaded. There is
  no upload endpoint, no database, no file storage.
- Cleaning rewrites the container and copies compressed image data byte for
  byte, so nothing is recompressed and no image quality is lost. Verified by
  test.
- A removal is only reported after the cleaned output is scanned a second time
  and diffed against the original.
- Formats: **JPEG, PNG, WebP, SVG and Markdown** can be inspected and cleaned.
  **PDF is inspect-only** — NoWatermark does not clean PDFs.
- The capability matrix at `/capabilities` lists every format, what is inspected
  inside it, and what is not covered. Link to it where a reader needs specifics.

---

# Fact sheets

---

## A — `ai-detector-false-positives`

- cluster: `detector-resistance` · contentType: `guide` · sources: none
- relatedTools: `['/claude-watermark-checker']`
- relatedGuides: `['/guides/can-ai-detectors-be-beaten', '/guides/does-claude-watermark-text']`
- queries: `ai detector false positive`, `wrongly accused of using ai`,
  `ai detector said i cheated`

**Facts.** AI text detectors are statistical classifiers estimating a
probability that text resembles model output. They read no watermark, no tag and
no record of authorship. Because they are statistical they produce false
positives and false negatives, and neither can be eliminated. A score is not a
finding of fact about who wrote something. Different detectors disagree on the
same text; when they do, the disagreement is the honest result, and averaging
two probabilities invents a certainty neither tool has.

**This is the most useful article in the wave.** Its job is to help someone who
did their own work and got flagged. Cover, in practical order: keep drafts and
version history, because a progression of edits over time is evidence an
isolated final document cannot be; ask which detector was used and what error
rate its own documentation states; ask whether a second detector agrees; and
make the point that a probability is not proof. Treat the reader as an adult
with a real problem. Do not lecture about cheating.

**Do not** give accuracy figures, name detectors, cite studies, or suggest
rewording to lower a score.

---

## B — `do-ai-humanizers-work`

- cluster: `detector-resistance` · contentType: `guide` · sources: none
- relatedTools: `['/claude-watermark-checker', '/claude-watermark-remover']`
- relatedGuides: `['/guides/can-ai-detectors-be-beaten', '/guides/hidden-unicode-characters']`
- queries: `do ai humanizers work`, `ai humanizer`, `humanize ai text`

**Facts.** Answer the query directly and early: **no tool can guarantee that
text passes a detector, and any product promising undetectable output is
promising something it cannot deliver.** That is a property of how statistical
classification works, not a temporary gap.

Many commercial "humanizers" work by swapping synonyms, injecting typos, or
distorting grammar. The predictable costs: degraded prose, damaged meaning,
broken citations — and still no guarantee against any given detector.

NoWatermark's optional text rewriting is designed to preserve meaning, facts,
voice, citations and formatting. It is not a distortion tool and is not tuned
against any detector.

Separately and genuinely useful: NoWatermark **can** detect and remove hidden
Unicode characters — zero-width spaces, word joiners, bidirectional controls —
and confirm removal by re-scanning. That is ordinary character data. It is not
a statistical watermark, and removing it does not affect detector output **in
any way NoWatermark has measured**. Use that exact qualifier; do not flatten it
into "does not affect detector scores".

Statistical text watermarks remain permanently "unable to verify".

**Do not** recommend any humanizer, name one, or describe techniques for
lowering a score.

---

## C — `why-ai-detectors-disagree`

- cluster: `detector-resistance` · contentType: `guide` · sources: none
- relatedTools: `['/claude-watermark-checker']`
- relatedGuides: `['/guides/can-ai-detectors-be-beaten', '/guides/what-is-synthid']`
- queries: `why do ai detectors give different results`,
  `ai detectors disagree`, `which ai detector is accurate`

**Facts.** Each detector has its own model, its own training data and its own
threshold for calling something machine-written. There is no shared industry
standard for what an AI-like sentence is. So two tools scoring the same passage
can return very different probabilities.

The honest reading of a disagreement is that the tools are uncertain — not that
the truth lies between them. A composite or averaged score manufactures
precision that neither input had.

Contrast this with things that are **not** probabilistic: a C2PA manifest is
either present in the file or it is not; a zero-width character is either in the
string or it is not. Those are facts about bytes, and NoWatermark reports them
as such. A detector score is a different kind of statement, and the difference
is worth the whole article.

**Do not** rank detectors, name them, or give accuracy figures.

---

## D — `what-is-xmp`

- cluster: `provenance-standards` · contentType: `guide`
- relatedTools: `['/ai-watermark-checker', '/ai-metadata-remover', '/exif-remover']`
- relatedGuides: `['/guides/what-is-iptc-digitalsourcetype', '/guides/how-to-check-ai-image-metadata', '/guides/how-to-remove-exif-data']`
- queries: `what is xmp`, `xmp metadata`, `remove xmp data`
- sources:
  ```yaml
  sources:
    - title: Extensible Metadata Platform (XMP)
      url: https://www.adobe.com/products/xmp.html
      accessed: 2026-08-15
  ```

**Facts.** XMP — the Extensible Metadata Platform — is a standard for embedding
metadata inside a file as an XML/RDF packet. It originated at Adobe and is
widely used by editing and publishing software. It is an ISO standard.

Where NoWatermark finds it: a **JPEG** APP1 segment; a **PNG** `iTXt` chunk; a
**WebP** XMP chunk; an SVG `metadata` element; and, in **PDF**, XMP packets
anywhere in the file — including in superseded revisions, which is why the
PDF scanner searches raw bytes rather than only the current object graph.

What tends to live in XMP: the creating application, edit history, author and
rights fields, and — relevant to AI — the IPTC `DigitalSourceType` value
`trainedAlgorithmicMedia`, which declares that a file was made by a generative
model.

XMP is ordinary metadata: detectable, removable, and removal confirmable by
re-scanning. Removing it does not change pixels and therefore cannot affect a
pixel watermark, and cannot affect a record held on a provider's server.

**Do not** claim which specific products write XMP, or give version numbers or
dates for the standard.

---

## E — `png-text-chunks-explained`

- cluster: `format-workflows` · contentType: `guide` · sources: none
- relatedTools: `['/ai-metadata-remover', '/ai-watermark-checker']`
- relatedGuides: `['/guides/stable-diffusion-png-metadata', '/guides/comfyui-workflow-metadata', '/guides/how-to-check-ai-image-metadata']`
- queries: `png text chunk`, `png metadata`, `what is tEXt chunk`,
  `remove png metadata`

**Facts.** A PNG is a sequence of typed chunks. Each has a length, a four-letter
type, its data, and a CRC. Some chunks are critical to displaying the image;
others are ancillary and carry information about it.

Text chunks come in three forms:

| Chunk | What it is |
|---|---|
| `tEXt` | Uncompressed Latin-1 keyword/value text |
| `zTXt` | The same, compressed |
| `iTXt` | International text, UTF-8, optionally compressed; the usual carrier for XMP |

NoWatermark strips exactly these chunk types when cleaning a PNG:
**`tEXt`, `zTXt`, `iTXt`, `eXIf`, `tIME`, `caBX`, `dSIG`.**
`eXIf` carries EXIF, `tIME` the last-modification time, `caBX` a C2PA/JUMBF
manifest, `dSIG` a digital signature.

It does **not** touch the chunks that make the picture: the header, the palette,
the image data itself, or the embedded ICC colour profile — the profile is kept
deliberately, because removing it changes how the image looks.

This is why image-generation tools use PNG so heavily for prompts and settings:
a text chunk is an easy, standard place to put arbitrary strings. It is also why
that data survives sharing until something deliberately removes it.

Because cleaning drops whole chunks and copies the compressed image data
unchanged, the file gets smaller and the picture is bit-for-bit the same.

**Do not** name specific tools' chunk keywords beyond what is above, or claim
what any particular generator writes.

---

## F — `dall-e-3-metadata-explained`

- cluster: `ai-image-fingerprints` · contentType: `guide` · sources: none
- relatedTools: `['/chatgpt-watermark-checker', '/c2pa-checker', '/ai-metadata-remover']`
- relatedGuides: `['/guides/does-chatgpt-watermark-images', '/guides/what-is-c2pa', '/guides/what-are-content-credentials']`
- queries: `dall-e 3 metadata`, `dalle c2pa`, `does dall-e add metadata`

**Facts.** This article is about **mechanism**, because that is what we can
verify. Be careful and explicit about the boundary.

What we can say: images produced by AI tools have generally carried **C2PA
Content Credentials** — a signed provenance manifest stored inside the file, in
JUMBF boxes (a JPEG APP11 segment, a PNG `caBX` chunk, a dedicated WebP chunk).
Manifests may also carry the IPTC `trainedAlgorithmicMedia` declaration. All of
that is metadata: detectable, removable, and removal confirmable by re-scan.

NoWatermark detects a C2PA manifest and reads what it can from it, but **does
not verify the signature cryptographically**, so it reports a manifest as
*present*, never as *valid*.

What we must not say: exactly what any OpenAI product writes today, or when it
started or stopped. Providers change this. State that NoWatermark has not tested
specific provider outputs and that the reliable answer is to check the actual
file — which the reader can do in the browser in a few seconds.

The important reader takeaway: **metadata is fragile.** Re-encoding, screenshots
and many upload pipelines discard it, so a missing manifest is not evidence a
file was not AI-generated. And removing a manifest from your copy does nothing
to any record the provider holds on its own servers.

---

## G — `does-discord-remove-exif`

- cluster: `platform-behaviour` · contentType: `guide` · sources: none
- relatedTools: `['/exif-remover', '/ai-watermark-checker']`
- relatedGuides: `['/guides/does-instagram-remove-exif', '/guides/how-to-remove-exif-data']`
- queries: `does discord remove exif`, `discord image metadata`,
  `does discord strip location`

**Read this carefully. NoWatermark has not tested Discord.**

Write the article around that honestly, and make the honesty the value. The
structure that works:

1. The direct answer: we have not tested Discord, and we will not tell you what
   it does on the basis of what other sites assert. Platforms change their
   pipelines without announcing it, so a two-year-old blog post is not evidence
   about today.
2. The mechanism, which does not change: a platform that **re-encodes** an image
   generally discards metadata as a side effect, because the metadata is not
   part of the compressed picture data. A platform that **passes the file
   through** keeps everything. Those are the two behaviours, and different
   surfaces of the same product — a feed, a direct message, an attachment
   download, a thumbnail — can differ.
3. The thing that actually answers the question for the reader: **check it
   yourself, in about a minute.** Take a photo with known metadata, post it,
   download it back from the place a recipient would get it, and scan both
   copies. That is a test whose result applies to your account, on today's
   version, on the surface you actually use — which is strictly better than
   anything a general article can tell you.
4. The safe default: strip metadata before uploading. Then the platform's
   behaviour stops mattering.

**Do not** state what Discord does or does not strip. Not in the body, not in
the FAQ, not implied in the description.

---

## H — `does-twitter-remove-exif`

Identical treatment to G, for Twitter/X.

- cluster: `platform-behaviour` · contentType: `guide` · sources: none
- relatedTools: `['/exif-remover', '/ai-watermark-checker']`
- relatedGuides: `['/guides/does-instagram-remove-exif', '/guides/how-to-remove-exif-data']`
- queries: `does twitter remove exif`, `does x remove metadata`,
  `twitter photo location data`

**NoWatermark has not tested Twitter/X.** Same four-part structure, same
prohibition. Refer to the service as "Twitter/X" on first use, then "X".

Do not reuse sentences verbatim from article G — these are two pages and must
not read as spun duplicates. Lead with a different concrete angle: on X the
question people usually mean is whether a posted photo can reveal where they
live, so open there.

---

## I — `how-to-remove-metadata-from-svg`

- cluster: `format-workflows` · contentType: `guide` · sources: none
- relatedTools: `['/ai-metadata-remover', '/exif-remover']`
- relatedGuides: `['/guides/how-to-remove-exif-data', '/guides/how-to-check-ai-image-metadata']`
- queries: `remove metadata from svg`, `svg metadata`, `clean svg file`

**Facts.** SVG is not a binary image container — it is XML, a text file. So its
metadata is not in a header segment; it is in elements and attributes, and some
of it is executable.

NoWatermark inspects an SVG for:

- **XML comments** — commonly left by editors, and often naming the tool
- **Generator comments** specifically — comments matching wording such as
  "generator", "generated", "created with", "produced by", "exported from"
- **`metadata` elements**, including XMP/RDF carried inside them
- **`script` elements**
- **Event-handler attributes** (`onload` and similar) — an SVG can run
  JavaScript when opened
- **Remote references** — `href` or `src` attributes pointing at `http://`,
  `https://` or protocol-relative `//` URLs, and `url(...)` references to remote
  addresses. These matter for privacy: opening the file makes the viewer's
  browser fetch them, revealing their IP address and the fact they opened it.
- **Images embedded as base64 `data:` URIs** — these are scanned too, because a
  JPEG hidden inside an SVG carries its own EXIF and GPS

The last two are the reason this page exists: almost no other SVG cleaner treats
an SVG as something that can phone home or smuggle a geotagged photograph.

SVG is fully supported for cleaning, and removal is confirmed by re-scanning.

**Do not** invent attribute names beyond those listed, or claim what any
particular editor writes.

---

## J — `what-is-jumbf`

- cluster: `provenance-standards` · contentType: `guide` · sources: none
- relatedTools: `['/c2pa-checker', '/content-credentials-checker', '/c2pa-remover']`
- relatedGuides: `['/guides/what-is-c2pa', '/guides/what-are-content-credentials', '/guides/pdf-metadata-hides-in-old-revisions']`
- queries: `what is jumbf`, `jumbf box`, `c2pa jumbf`

**Facts.** JUMBF — JPEG Universal Metadata Box Format — is the container that
C2PA manifests are stored in. It is a box structure borrowed from the ISO base
media file format: each box is a four-byte big-endian length, a four-character
type, then its contents. A **superbox** of type `jumb` holds other boxes, and
its first child is always a description box of type `jumd`.

Where a JUMBF payload lives per format: **JPEG** APP11 segment; **PNG** `caBX`
chunk; **WebP** a dedicated chunk; **PDF** as an associated file, declared in the
object graph with `/AFRelationship /C2PA_Manifest`.

**A worked example worth including**, because it shows what careful detection
means. NoWatermark used to report C2PA in a PDF by searching the raw bytes for
the string `jumb` or `c2pa`. Four ASCII characters are not a signature: any PDF
that merely *discusses* Content Credentials matches, and so could a compressed
stream by chance. The check now requires the actual box shape — a plausible
length, the `jumb` type, and a `jumd` description box as its first child — plus
a look in the object graph for the declared association. Three independent
constraints instead of one string. Frame this as why a presence report should
be structural, not textual.

NoWatermark detects and reads JUMBF payloads but **does not verify the
signature**, so a manifest is reported as present, never as valid.

**Do not** give spec version numbers, publication dates, or committee details.

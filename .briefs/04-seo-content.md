# BRIEF 04 — Author the new guides

**Agent:** agy, gemini-3.6-flash-high
**Repo:** the repository root
**You own:** new files in `src/content/guides/` only. Do not modify existing
guides, and do not touch any other directory.

---

## Your input

A research agent has produced `.seo/content-gaps.md` — a ranked list of article
briefs, each with a target keyword, slug, outline and internal links. Read it,
plus `.seo/keyword-map.md` and `.seo/linking-plan.md`.

**Write the top 6 articles from that ranked list.** If a brief in that file
conflicts with anything below, this brief wins.

## The product you are writing for

**NoWatermark.fyi** inspects images for hidden metadata and AI-provenance data
and removes what it can — entirely in the user's browser. Nothing is uploaded,
no account, no storage.

It handles EXIF (GPS, device, timestamps), XMP, IPTC, PNG text chunks (where
Stable Diffusion writes prompts and ComfyUI writes workflows), C2PA / Content
Credentials, and hidden Unicode in text.

It **cannot** detect or remove SynthID (Google's pixel-embedded watermark) or
statistical text watermarks — and it says so plainly. That honesty is the
brand's entire differentiator.

## Required file format

Every article is a Markdown file at `src/content/guides/<slug>.md`. The
frontmatter schema is enforced at build time by `src/content.config.ts` — a
wrong field name will fail the build. Copy this shape exactly:

```markdown
---
title: The human-readable title
metaTitle: 'Title Tuned For Search | NoWatermark'
description: One sentence, 140-160 characters, used as the meta description.
summary: One sentence shown on guide index cards.
publishDate: 2026-08-14
order: 30
relatedTools: ['/exif-remover', '/ai-metadata-remover']
relatedGuides: ['/guides/what-is-synthid']
faq:
  - q: A real question someone types into Google.
    a: A direct answer in two or three sentences.
---

Body copy in Markdown starts here.
```

Field rules:
- `relatedTools` must be real slugs from `src/lib/site.ts`. Verify each one.
- `relatedGuides` must be real paths of existing or newly written guides.
- `order` controls index sorting; use 30-45 for these new articles.
- 3-5 FAQ entries per article.

## Writing standard

Read two existing guides first — `src/content/guides/what-is-synthid.md` and
`how-to-remove-exif-data.md` — and match their voice. Specifically:

- **Lead with the answer.** No throat-clearing preamble. The first paragraph
  answers the question in the title.
- **Plain, specific, technically accurate.** Name the actual mechanism: an
  `APP1` segment, a `parameters` text chunk, `DigitalSourceType:
  trainedAlgorithmicMedia`. Specificity is what earns links here.
- **Complete sentences, British-leaning spelling** ("colour", "recognise"),
  consistent with the existing guides.
- **1,200-1,800 words.** Long enough to be the best answer, not padded.
- Use `##` H2 sections from the brief's outline. Short paragraphs.
- Link naturally to tool pages and other guides in the body — at least three
  internal links per article, using descriptive anchor text.
- End with a concrete next step that uses the tool.

## Hard content rules

These are non-negotiable and a violation makes the article unusable:

1. **Never promise a capability the tool does not have.** No "remove SynthID",
   no "make AI content undetectable", no "bypass AI detection". When the target
   keyword implies one of these, the article's job is to give the honest answer
   and explain what *is* possible.
2. **Never say metadata absence proves anything.** Metadata is stripped
   constantly by platforms, screenshots and editors, so its absence is weak
   evidence about origin. Say so wherever it is relevant.
3. **Distinguish "not detected" from "cannot be checked."** This distinction is
   the product's core idea. Metadata absence is verifiable; SynthID absence is
   not.
4. **Do not invent statistics, study results, dates or quotes.** If you would
   need a number you cannot verify, write the sentence without it.
5. No keyword stuffing. Target keyword in the title, the first paragraph and
   one H2 is sufficient.
6. Mention that removing provenance or attribution from content the user does
   not own may be unlawful, wherever the article discusses removal.

## Definition of done

1. Six new `.md` files in `src/content/guides/`.
2. `pnpm build` succeeds — this proves the frontmatter validates and every
   `relatedTools` / `relatedGuides` path resolves. **Run it. Fix any error.**
3. Write `.seo/content-report.md` listing each article: file, target keyword,
   word count, internal links used, and anything from the research brief you
   deliberately changed or skipped, with the reason.

Do not ask questions. Make the call, note it in the report.

---

## PM notes on the research (added after reviewing `.seo/content-gaps.md`)

The research is approved. Three corrections that override it:

1. **Skip brief #9** (`invisible-unicode-character-detector`). It would cannibalise
   the existing `hidden-unicode-characters` guide — same intent, same answer.
   Write the next-highest-ranked brief instead, so you still deliver six.

2. **Brief #4 (`can-you-remove-synthid`) must lead with "no".** Its target
   keyword has removal intent we cannot satisfy. The first paragraph must state
   plainly that SynthID cannot be removed by this tool or any browser-based
   tool, and that we cannot even detect it. Only then explain what metadata
   cleaning does achieve. It links to `/synthid-remover`, which is itself an
   honest "why this does not exist" page — match that page's tone.

3. **The platform articles** (Instagram, Discord, Twitter/X) must not state
   current platform behaviour as permanent fact. Platforms change their
   pipelines. Write "as of writing" and tell the reader to verify with the tool
   on their own file — which is both honest and the strongest possible call to
   action for us.

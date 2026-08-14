# BRIEF 03 — Keyword research and content strategy

**Agent:** agy, gemini-3.6-flash-high
**Repo:** `/Users/pranaymehrotra/agent/nw`
**You own:** `.seo/` only. Do not modify any other directory.

---

## The product

**NoWatermark.fyi** is a free, browser-based tool that inspects images for
hidden metadata and AI-provenance data, and removes what it can. Everything
runs on the user's device — nothing is uploaded, no account, no storage.

It handles: EXIF (including GPS, device, timestamps), XMP, IPTC, PNG text
chunks (where Stable Diffusion and ComfyUI store prompts), C2PA / Content
Credentials, and hidden Unicode characters in text.

Critically, it is **honest about limits**: it cannot detect or remove SynthID
(Google's pixel-embedded watermark) or statistical text watermarks, and it says
so plainly rather than implying an image is clean.

## What already exists

Read these to avoid duplicating work:

- `src/lib/site.ts` — 14 tool pages with their titles, descriptions and slugs.
- `src/content/guides/` — 9 existing guides. Read the frontmatter of each.
- `README.md` — architecture and the honesty rules.

Existing guide slugs:
`what-is-c2pa`, `what-is-synthid`, `does-claude-watermark-text`,
`does-chatgpt-watermark-images`, `c2pa-vs-synthid`,
`can-you-remove-ai-watermarks`, `how-to-remove-exif-data`,
`how-to-check-ai-image-metadata`, `what-are-content-credentials`,
`hidden-unicode-characters`.

## Your task

Produce a keyword strategy grounded in what this tool genuinely does.

### 1. Keyword research

Build a keyword map across three tiers. For each keyword give: estimated
monthly search intent category (informational / commercial / transactional),
difficulty (your judgement: low/med/high), and which existing page targets it
or whether it is a gap.

- **Tier 1** — AI watermark queries: claude watermark, chatgpt watermark,
  ai watermark remover/checker, and variants.
- **Tier 2** — provenance: synthid, c2pa, content credentials, ai image metadata.
- **Tier 3** — the volume tier: exif remover, remove metadata from image,
  remove gps from photo, image metadata viewer, and long-tail variants.

Also research **adjacent long-tail** we do not yet cover, e.g. platform-specific
("does instagram remove exif"), device-specific ("remove location from iphone
photo"), and tool-specific ("stable diffusion prompt from png",
"comfyui workflow from image").

### 2. Gap analysis

Identify **10–14 new article topics** we should write, ranked by opportunity.
For each: target keyword, search intent, why we can rank (what makes our answer
better than the current results), and which existing tool page it should link
to. Prefer topics where the tool itself is the proof — an article we can end
with "check it yourself" beats a generic explainer.

### 3. Internal linking plan

Propose the link graph: which guides should link to which tool pages and to
each other. Flag any orphan pages in the current structure.

## Deliverables

Write these files:

- `.seo/keyword-map.md` — the three-tier table plus long-tail.
- `.seo/content-gaps.md` — the ranked list of 10–14 article briefs. Each brief
  must contain: working title, target keyword, secondary keywords, search
  intent, suggested slug, an outline of 4–7 H2 sections, the internal links to
  include, and the FAQ questions worth answering.
- `.seo/linking-plan.md` — the internal link graph and any orphans.

## Rules

1. **Never propose content that promises something the tool cannot do.** No
   "remove SynthID", no "make AI undetectable", no "bypass AI detection". If a
   keyword has that intent, the recommended angle must be the honest answer —
   which still captures the search and converts it to education.
2. Do not invent precise search volumes you cannot verify. Give ranked
   estimates and say they are estimates.
3. English-language, global audience.
4. Do not write the articles themselves — that is a separate agent's job. Your
   output is research and briefs.
5. Stay inside `.seo/`.

# BRIEF 02 — Logo concepts for NoWatermark

**Agent:** Codex, gpt-5.6-terra, medium effort, using the `imagegen` skill
**Repo:** the repository root

---

## The brand

**NoWatermark.fyi** — a free, browser-based tool that inspects an image and
reports what hidden metadata it carries (location, device, AI generator tags,
Content Credentials), then removes what it can. Nothing is ever uploaded;
everything runs on the user's own device.

Its differentiator is **honesty**: it clearly reports what it *cannot* measure
rather than implying an image is clean. The brand should read as credible and
technical, never as a piracy or "undetectable AI" tool.

## Visual direction (already approved)

Read `.design/TANTEI-SPEC.md` first. The site design is comic-panel inspired:
heavy black gutters, sharp-cornered panels, halftone screentone texture, and a
single stamp-red accent (`#c4271a`) on near-black ink (`#121115`) over warm
paper (`#fffefa`).

**Hard rule: no Japanese characters, and no Japanese-culture iconography.** The
influence is panel layout and print halftone only.

Avoid entirely: magnifying glasses, padlocks, shields, eyes, generic "AI"
sparkles, gradients, and anything resembling a stock security logo.

## What to produce

Generate **6 distinct logo concepts**. For each, produce a square mark that
works at 32px (favicon) and at large size.

Ideas worth exploring — you are not limited to these:
- A halftone dot that resolves into a shape only at large size (hidden-in-plain-sight).
- A comic panel / gutter cross as a monogram.
- An "N" or "NW" built from panel geometry.
- A redaction bar or ink blot as a positive mark.
- A registration/crop mark, borrowing from print production.

For each concept produce:
- A large square PNG (at least 1024x1024) on the paper colour.
- A one-line rationale.

Save all images to `.design/logos/` with descriptive names
(`01-halftone-dot.png`, etc.).

## Then

Write `.design/logos/README.md` containing:
- A numbered list of the 6 concepts, each with its filename, a one-line
  rationale, and an honest note on its weakest point.
- Your recommendation of the strongest two, and why.
- A note on which would survive being rendered as a 32px favicon.

## Constraints

- Palette: ink `#121115`, paper `#fffefa`, stamp red `#c4271a`. Monochrome-first
  — the mark must work in pure black on white before colour is added.
- The mark must be legible as a solid silhouette (no thin hairlines that
  disappear at favicon size).
- Do not modify any file outside `.design/logos/`.
- Do not touch `src/`, `public/`, `tests/`, or any other agent's directory.

Do not ask questions. Make the calls and record them in the README.

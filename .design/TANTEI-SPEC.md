# Tantei — NoWatermark design system spec

**Status:** approved direction. This file is the single source of truth for the
redesign. Where this spec and any mockup disagree, this spec wins.

**Hard rule: no Japanese characters anywhere.** No kanji, kana, or romaji
loanwords in the UI. The direction is named "Tantei" internally only — that
word must not appear in any user-facing string, class name, or file name under
`src/`. The visual language comes from comic panel layout and print halftone,
not from Japanese text.

Enforcement: no source file under `src/` may contain a character in the CJK
ranges U+3000–U+30FF, U+4E00–U+9FFF or U+FF00–U+FFEF. Ordinary typographic
punctuation (em dash, curly quotes, degree sign) is fine.

---

## 1. The idea in one line

The tool as an investigation. A file is a subject; each finding is an evidence
panel; the page is laid out as a comic panel grid with heavy black gutters.

## 2. What carries the concept

Three devices, used consistently. Everything else is ordinary UI.

1. **The panel grid.** Content sits in rectangular panels separated by thick
   black gutters. Panels are sharp-cornered (no border radius) and vary in size
   — panel size encodes importance.
2. **Screentone.** A halftone dot texture, used sparingly for emphasis on at
   most one panel per screen. Never behind body copy.
3. **The inked-out panel.** A finding we cannot measure is rendered as a solid
   black panel with reversed text. This is the most important device on the
   site — see section 6.

## 3. Colour tokens

Define these in `src/styles/global.css` and use them everywhere. No component
may hard-code a colour.

### Light (default)

```
--nw-ground:      #f2f0e8   /* page behind the panels */
--nw-paper:       #fffefa   /* panel fill */
--nw-gutter:      #121115   /* space between panels */
--nw-ink:         #121115   /* body text, borders */
--nw-muted:       #56535d   /* secondary text */
--nw-faint:       #8a8792   /* labels, captions */
--nw-rule:        #d9d5ca   /* hairlines inside a panel */
--nw-spot:        #c4271a   /* the one accent: a stamp red */
--nw-spot-soft:   #fbeae7
--nw-ok:          #1c6b45   /* removed / clear */
--nw-ok-soft:     #e6f2eb
--nw-void:        #121115   /* inked-out panel fill */
--nw-void-ink:    #fffefa   /* text on an inked-out panel */
--nw-void-spot:   #ef7060   /* accent on an inked-out panel */
--nw-tone:        #121115   /* screentone dot colour */
```

### Dark

```
--nw-ground:      #0c0c0f
--nw-paper:       #17171c
--nw-gutter:      #000000
--nw-ink:         #f1efe9
--nw-muted:       #a5a2ac
--nw-faint:       #7a7783
--nw-rule:        #2c2c34
--nw-spot:        #f0604c
--nw-spot-soft:   #2e1512
--nw-ok:          #5cbf8c
--nw-ok-soft:     #12251b
--nw-void:        #000000
--nw-void-ink:    #f1efe9
--nw-void-spot:   #f0604c
--nw-tone:        #f1efe9
```

Follow the three-state theme pattern already in `global.css`: bare `:root` for
light, `@media (prefers-color-scheme: dark)` guarded with
`:root:not([data-theme="light"])`, and `:root[data-theme="dark"]`. Never define
a colour only inside a media or attribute block.

**Every text/background pair must reach WCAG AA (4.5:1 normal, 3:1 for text
at 18.66px+ bold).** This is a release gate, not a preference.

## 4. Typography

One family, worked hard. No serif, no webfont (the CSP blocks font CDNs).

```
--nw-sans: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
--nw-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
```

| Role | Spec |
|---|---|
| Display / h1 | 800 weight, `letter-spacing: -0.04em`, `line-height: 1.02` |
| h2 | 800, `-0.03em` |
| h3 | 700, `-0.02em` |
| Body | 400, `line-height: 1.6`, max 68ch |
| Panel label | 10px, uppercase, `letter-spacing: .09em`, `--nw-faint` |
| Data value | `--nw-mono`, `font-variant-numeric: tabular-nums` |

Headlines are short and declarative — "Every file is hiding something", not a
marketing sentence. Keep `text-wrap: balance` on headings.

## 5. Components

### Panel grid
- Gutter width 5px on desktop, 4px on mobile, filled with `--nw-gutter`.
- Implement as CSS grid with `gap` and a `--nw-gutter` background on the
  container; panels get `--nw-paper`.
- **Mobile:** the grid collapses to a single column. It must genuinely reflow,
  not scale down. Below 640px, gutters may reduce but panels must stay
  full-width and readable.

### Screentone
```css
background-image: radial-gradient(circle at center, var(--nw-tone) 1.05px, transparent 1.15px);
background-size: 4px 4px;
opacity: .10;
```
Apply to an absolutely-positioned overlay inside a panel, `pointer-events: none`.
Maximum one toned panel per screen. Never behind paragraphs.

### Stamp
A rotated, outlined label in `--nw-spot`: 2px border, ~4px radius, uppercase,
`transform: rotate(-11deg)`. Use for at most one per page. English only —
e.g. `SEALED`, `CASE OPEN`. Decorative; must never be the only place a meaning
appears.

### Buttons
Sharp corners. Primary = `--nw-ink` fill with `--nw-paper` text. Accent =
`--nw-spot` fill with `--nw-paper` text. Focus ring stays visible.

### Result rows
Each signal is an evidence panel or a ruled row inside a panel: an uppercase
label, then the value in mono. Status pill retains the existing four labels.

## 6. The honesty rule, expressed visually

This is the part that must not be compromised.

`src/lib/signals.ts` already defines four statuses. The design encodes them:

| Status | Treatment |
|---|---|
| `detected` | Full weight: paper panel, `--nw-spot` status pill, may carry screentone |
| `not_detected` | Paper panel, `--nw-ok` pill, quiet |
| `unknown` | Paper panel, `--nw-faint` pill |
| `unable_to_verify` | **Inked-out panel**: `--nw-void` fill, `--nw-void-ink` text, no tone, no stamp, no shadow |

**The withholding rule:** a signal we cannot measure receives none of the
decorative treatment the others get. No screentone, no stamp, no accent
colour beyond `--nw-void-spot` on its label. It should read as absence, and it
must be visually impossible to mistake for a cleared/removed result.

Copy for that state stays exactly as the code already produces it. Do not
invent new status strings; `STATUS_LABEL` in `src/lib/types.ts` is canonical.

## 7. Where it applies

| Surface | Treatment |
|---|---|
| Homepage | Full panel grid: hero panel, intake panel, tool cards as panels |
| Tool pages (14) | Header panel, scanner, results as evidence panels |
| Guide pages (9+) | **Calm.** Single column, panel used only for the header and pull-quotes. Long-form reading beats the concept here. |
| Methodology / privacy / terms | Calm, same as guides |
| 404 | One panel, one stamp |

Guides are the traffic engine. If the panel treatment hurts readability on a
2,000-word article, the treatment loses. Body copy stays on `--nw-paper` with
generous leading and no tone behind it.

## 8. Out of scope for this pass

- No changes to `src/lib/**` logic, scanners, cleaners or the worker.
- No changes to `src/content/guides/*.md` (a separate agent owns content).
- No new runtime dependencies.
- Do not touch `tests/**` except to fix a test the redesign genuinely breaks.

## 9. Non-negotiables

1. No Japanese characters, anywhere.
2. `pnpm build` succeeds and `pnpm test` stays green (76 tests).
3. Guide pages continue to ship zero JavaScript.
4. All colour pairs meet WCAG AA.
5. Every colour comes from a token; no hard-coded hex in components.
6. The scanner keeps working: file → scan → clean → download, offline.
7. No claim anywhere that contradicts `src/lib/signals.ts`.

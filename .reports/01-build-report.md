# Build 01 report — visual redesign

## What changed

- Replaced the shared palette with the approved light/dark ink, paper, gutter,
  stamp, and evidence tokens in `src/styles/global.css`.
- Added the panel-grid, screentone, stamp, calm-reading, evidence-panel, and
  mobile reflow primitives. Existing component-facing colour variables now
  resolve to those tokens.
- Reworked the homepage into a comic-panel hero/intake layout and converted its
  tool, guide, privacy, and capability sections to sharp paper panels.
- Restyled the single tool-page template, site header/footer, 404, guide index,
  guide headers, and long-form policy/methodology/about headers.
- Updated scanner controls and results so findings render as evidence panels.
  `unable_to_verify` is now a black reversed inked-out panel; all canonical
  status labels and scanner logic remain unchanged.

## Design decisions

- The site keeps its existing copy and the approved English-only content. The
  home headline was shortened to a declarative line to fit the approved display
  typography while the product claim beneath it remains unchanged.
- The primary action uses ink rather than red; red is reserved for the single
  stamped/found-signal accent, keeping attention on evidence and the honesty
  state.
- Long-form pages use only a restrained header panel so paragraphs retain an
  uninterrupted paper reading surface.

## Deliberately not changed

- No scanner, cleaner, worker, capability-matrix, or status-label logic.
- No guide content, public assets, tests, or dependencies.
- Browser visual inspection could not run because no browser binding was
  available in this environment.

## Simplification and review

- A three-lens simplification pass consolidated duplicated content and dark-mode
  token declarations and replaced a broad void-panel colour override with
  scoped evidence variables. It found no performance concerns.
- Code review: skipped (ce-code-review unavailable). The review skill is not
  callable through this harness; a manual diff scan and the independent
  simplification pass found and resolved the maintainability issues above.

## Verification

- `pnpm build` passed.
- `pnpm test` passed: 76 tests.
- Guide output has no `src="/_astro/..."` script references.
- `rg -lP '[\\x{3000}-\\x{30FF}\\x{4E00}-\\x{9FFF}\\x{FF00}-\\x{FFEF}]' src/`
  returned no files. The brief's macOS `grep -P` form is unsupported here.
- `git diff --check` passed.

## QA risks to check first

- Confirm panel-grid spacing and header navigation at widths below 640px.
- Confirm dark-mode contrast, especially muted labels on evidence panels.
- Exercise a scan with an `unable_to_verify` signal to ensure its black panel
  is visually distinct from a clean result.
- Confirm the upload button text remains readable when drag-over state is active.

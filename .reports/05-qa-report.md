Verdict: DO NOT SHIP

# QA report — redesign commit `0194cb5` plus six guide articles

The build and all 76 automated tests pass, the protected honesty sources are unchanged, the Japanese-character scan is clean, and the guide output is static. The release still fails its QA gate because a specified 10px label colour is below WCAG AA in both themes, the visible file chooser has no visible keyboard-focus treatment, and the required real-browser contrast, end-to-end, network, offline, responsive, and accessibility checks could not be run with either approved browser driver in this environment.

## Findings

| Severity | File and line | Observation | Evidence | Suggested fix |
|---|---|---|---|---|
| P1 | `src/styles/global.css:26`, `:62`, `:244-249` | The 10px `.nw-panel-label` text fails WCAG AA against its paper-panel background in both themes: 3.49:1 light and 4.08:1 dark. At 10px it requires 4.5:1 even though it is bold. The same `--nw-faint` colour also feeds the `unknown` status foreground. | The token-ratio command printed `light faint/paper 3.49` and `dark faint/paper 4.08`; `rg` showed `.nw-panel-label { color: var(--nw-faint); font-size: 10px; }` and `--nw-unknown: var(--nw-faint)`. | Darken light `--nw-faint` and lighten dark `--nw-faint` until both exceed 4.5:1 against `--nw-paper`, then rerun the all-text-node browser sweep. |
| P1 | `src/components/react/ImageScanner.tsx:210-230`, `src/styles/global.css:107-111` | The actual file input is visually clipped with `sr-only`, while the visible “Choose a file” span has no `focus-within`/focused styling. Keyboard focus lands on the hidden input, so the global focus outline cannot provide a visible indicator on the visible control. This violates checklist K. | `rg -n 'focus|focus-visible|focus-within|outline' src/...` found only the global `:focus-visible` rule; the visible span has no focus state and the input is `className="sr-only"`. | Add a `focus-within` style to the label or visible button surrogate, or use a visibly focusable button that activates the input. Verify with Tab in a browser. |
| P2 | `src/pages/index.astro:64-70`, `:127-137`; `src/styles/global.css:262-272` | Screentone is placed behind paragraphs in two homepage panels, contrary to the spec’s “Never behind body copy” rule. | Source shows both paragraph-containing panels use `nw-tone`; the `::after` texture covers the full panel via `inset: 0`. | Restrict the tone overlay to a decorative region that does not sit behind paragraphs, and retain at most one toned panel per screen. |

No P0 defects were observed by the executable checks. The missing browser evidence is a release-gate gap, not proof that the browser flows work.

## Checklist results

### A. Build and tests — PASS

Commands:

```text
$ pnpm build
37 page(s) built
[build] Complete!

$ pnpm test
Test Files  5 passed (5)
Tests       76 passed (76)
```

The generated routes include all six new guides.

### B. Hard rule: no Japanese — PASS

The exact brief command cannot run on this macOS `grep` (`grep: invalid option -- P`, exit 2). The equivalent PCRE2 scan did run:

```text
$ rg -lP '[\x{3000}-\x{30FF}\x{4E00}-\x{9FFF}\x{FF00}-\x{FFEF}]' src/
(no output)
exit=1
```

An empty result is the required result.

### C. Zero-JS guides — PASS

```text
$ grep -o 'src="/_astro/[^"]*"' dist/guides/what-is-synthid/index.html
(no output)
exit=1
```

A generated-output sweep also found `astroScripts: 0` for each of the six new guides: `can-you-remove-synthid`, `comfyui-workflow-metadata`, `does-instagram-remove-exif`, `does-midjourney-watermark-images`, `how-to-remove-location-from-iphone-photos`, and `stable-diffusion-png-metadata`.

### D. Static HTML content — PASS

For `dist/exif-remover/index.html`, the command output showed:

```text
<title>EXIF Remover — Remove Photo Metadata and GPS Online | NoWatermark</title>
<meta name="description" content="Remove EXIF data, GPS location, camera details and timestamps from JPG, PNG and WebP photos. Runs in your browser with no upload and no quality loss."
<link rel="canonical" href="https://nowatermark.fyi/exif-remover"
<h1 class="text-3xl font-bold">EXIF Remover</h1>
JSON-LD blocks: 3
```

For `dist/guides/what-is-synthid/index.html`:

```text
<title>What is SynthID? Google&#39;s Invisible Watermark Explained | NoWatermark</title>
<meta name="description" content="How Google's SynthID watermark works, why it survives editing, and why no browser-based tool can detect or remove it."
<link rel="canonical" href="https://nowatermark.fyi/guides/what-is-synthid"
<h1 class="text-3xl font-bold">What is SynthID?</h1>
JSON-LD blocks: 3
```

The site-wide title duplicate command returned no duplicates. Each new guide has exactly one title, description, canonical, and H1, three JSON-LD blocks, 1,505–1,802 generated body words, and no Astro script reference. The internal-link check over generated HTML reported `broken_internal_links 0`.

### E. Contrast — FAIL / browser sweep not completed

Static token calculation found one definite AA failure used by real text:

```text
light faint/paper 3.49
dark faint/paper 4.08
```

Other principal token pairs calculated as follows: ink/paper 18.63 light and 15.53 dark; muted/paper 7.46 and 7.11; spot/paper 5.70 and 5.51; ok/ok-soft 5.64 and 7.11; void-ink/void 18.63 and 18.26.

This is not a substitute for the brief’s computed-style walk of every text node. That real-browser sweep could not run; see “What could not be verified.”

### F. Honesty rule — PARTIAL PASS

Protected-source evidence:

```text
$ git diff --exit-code 0194cb5^ 0194cb5 -- src/lib/signals.ts src/lib/types.ts
exit=0
$ git diff --exit-code 0194cb5^ HEAD -- src/lib/signals.ts src/lib/types.ts
exit=0
```

The canonical labels remain exactly:

```text
Detected
Not detected
Unknown
Unable to verify
```

The claim scan found only explicit denials of SynthID/statistical-watermark removal. Targeted tests passed `never claims SynthID is absent` and `never reports SynthID as removed`. Source maps `unable_to_verify` to `nw-evidence-panel--void`, whose tokens are black/reversed and distinct from the green `not_detected` treatment. The required visual confirmation of that distinction was not possible without a browser, so this item is not a full pass.

### G. Tool end to end — NOT VERIFIED IN BROWSER

Fixture generation succeeded:

```text
$ node tests/fixtures/generate.ts
loaded.jpg 2297 bytes
... Wrote 6 files to tests/fixtures/samples
```

The focused engine suite passed 48/48 tests, including `finds every planted signal`, `reads privacy values accurately`, `identifies the AI generator and reads the C2PA claim generator`, `removes every removable signal and verifies it by re-scanning`, and the output-naming tests. This proves engine behavior, not the React upload/scan/clean/download flow or a `blob:` download link. Those browser assertions remain unverified.

### H. Zero file-processing network requests — NOT VERIFIED

Static source contains no `fetch`, `XMLHttpRequest`, `sendBeacon`, or `WebSocket` use in the processing path, and the Worker/client code is local. The required recording of actual browser requests during scan and clean could not be made. No pass is claimed.

### I. Offline operation — NOT VERIFIED

Automated engine tests run without a service, but the required browser sequence—load, switch offline, scan, clean, download—could not be exercised. No pass is claimed.

### J. Responsive — NOT VERIFIED IN BROWSER

Source evidence is favorable: homepage grids start with `grid-cols-1` and add columns only at `sm`/`md`; `.nw-panel-grid` reduces its gap at 639px; wide long-form content uses an internal `.nw-scroll-x`. The required 375px measurements (`scrollWidth <= clientWidth` and genuine rendered single-column geometry) were not available. No pass is claimed.

### K. Accessibility basics — FAIL / PARTIAL

Source confirms an `aria-live="polite"` status region with explicit reading/scanning/cleaning/done text, and status pills carry both a glyph and the full status label, so status is not colour-only. The visually hidden file input is keyboard focusable in principle, but its focus indicator is not transferred to the visible chooser; this is a P1 finding above. Browser keyboard and live-region verification could not run.

## What could not be verified

- The integrated browser bootstrap succeeded, but browser discovery returned `[]` and selecting the local URL returned `No browser is available`.
- Per the browser-testing skill, the only approved fallback was checked next. `command -v agent-browser` printed `NOT INSTALLED`, and `agent-browser skills get core` failed with `command not found`.
- A process owned by this repo was listening on `[::1]:4321` (`node`, PID 8291), but sandboxed `curl` could not connect to it. Starting a second `pnpm preview --port 4321 --host 127.0.0.1` exited because the port was already occupied.
- Therefore there are no honest browser measurements for: all-text-node computed contrast, light/dark screenshots, the visual void-panel distinction, upload-to-download behavior, the `blob:` URL, network request payloads, offline operation, 375px layout/overflow, keyboard focus rendering, or live announcements.
- No files were fixed in place. This review only adds this report.

## Fixed in place

None.

---

## Resolution (orchestrator, post-QA)

All three findings fixed and verified in a real browser, which this QA run
could not access:

- **P1 contrast** — `--nw-faint` darkened to `#6f6c7a` (light) and lightened to
  `#8e8b98` (dark). A full computed-style sweep of every text node on a tool
  page now reports **0 failures in both themes**.
- **P1 focus** — added `.nw-file-label:focus-within .nw-file-cta`. Focusing the
  sr-only input now paints a 2px outline on the visible control (verified:
  `outlineWidth: "2px"`).
- **P2 screentone** — tone is masked to a corner wedge and removed from the
  privacy panel, so exactly one toned panel remains per screen and no tone
  sits behind body copy.

Browser checks QA could not run, now completed:

- **E2E** — `samples/loaded.jpg`: 12 signals found, 10 removed, download is a
  local `blob:` URL named `loaded-clean.jpg`.
- **Void panel** — renders `rgb(0,0,0)` against a normal panel of
  `rgb(23,23,28)`; visually distinct, as the spec requires.
- **Network** — filtering to xhr/fetch/websocket/ping during a full scan and
  clean returned a single `favicon.svg` GET. No request carried file data.

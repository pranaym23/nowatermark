# REPORT 06 — Format generalisation

**Status:** done. 82 tests green (76 existing, unchanged, + 6 new), `pnpm build`
clean, `tsc --noEmit` clean.

---

## What moved

**New: `src/lib/formats.ts`** — the format registry. One entry per format with
`label`, `mime`, `extension`, `kind` and a `support` gate of `none` / `scan` /
`clean`. All six formats (jpeg, png, webp, svg, markdown, pdf) are *described*;
only the three raster ones are *open*.

The registry derives two types by mapped conditional over the `as const` object:

- `ScannableFormat` — everything with `support !== 'none'`
- `CleanableNowFormat` — everything with `support === 'clean'`

`scan.ts` holds `SCANNERS: Record<ScannableFormat, Scanner>` and `clean.ts`
holds `CLEANERS: Record<CleanableNowFormat, Cleaner>`. Both are **total**
records, so flipping a `support` flag without supplying the implementation is a
compile error, not a runtime surprise.

Verified by temporarily flipping `svg` to `'scan'`:

```
src/lib/scan.ts(301,7): error TS2741: Property 'svg' is missing in type
  '{ jpeg: ...; png: ...; webp: ... }' but required in type
  'Record<ScannableFormat, Scanner>'.
```

That is the half-add guard working. **Briefs 07–09 rely on it.**

## The seams for briefs 07–09

1. Add your format's entry to `FORMATS` (or flip its `support`).
2. `tsc` tells you exactly what is missing.
3. Register a scanner in `scan.ts` `SCANNERS`, and a cleaner in `clean.ts`
   `CLEANERS` if `support: 'clean'`.

`Cleaner` is now `(bytes, ctx: CleanContext) => RawCleanOutcome`. The three
raster cleaners were **not** edited — thin adapters in `clean.ts` translate
their positional `preserveOrientation` argument.

`runCleaner` returns `{ ok: false, warnings: [] }` for a scannable-but-not-
cleanable format, which the existing failure path already renders as "we
couldn't clean this file safely, your original has not been changed". That is
the behaviour PDF Phase 1 (brief 09) wants for free.

Also added `scanFile` / kept `scanImage` as an alias, so briefs 08–09 do not
have to call `scanImage` on a Markdown file.

## Two pre-existing bugs found and fixed

`tsc --noEmit` was **already failing on `main`** before this work. Confirmed by
stashing. There is no `.github/workflows/`, no `typecheck` script, and
Cloudflare Pages only runs `pnpm build` — which uses esbuild and strips types
without checking them. So nothing anywhere was typechecking this repo.

1. **`ImageScanner.tsx:17`** imported `SignalCategory` from `lib/types`, which
   never exported it. It lives in `lib/signals`. Latent because no gate ran.
2. **`worker/client.ts:114`** typed `send()` as `Omit<WorkerRequest, 'id'>`.
   `Omit` over a discriminated union collapses it to the shared keys, silently
   dropping `options` from the `clean` variant. Replaced with a distributive
   omit. The runtime `{...request, id} as WorkerRequest` cast meant this never
   misbehaved in practice, but the cast was hiding it.

**Added `pnpm typecheck`.** Without it the exhaustiveness guarantee above is
decorative. Worth wiring into the deploy path — see risks.

## Behaviour changes

None intended, none found. `ACCEPTED_MIME` is now derived but asserted
byte-identical to the old hand-written string in `tests/formats.test.ts`. The
76 original tests pass unedited — `git diff tests/` is empty.

## Risks for whoever QAs this

- **`pnpm typecheck` is not enforced anywhere.** No CI exists. The registry's
  compile-time guarantee only holds if someone runs it. Recommend a minimal
  GitHub Actions workflow, or at least adding it to the build script.
- Registry key **order** determines `ACCEPTED_MIME` order and therefore what the
  OS file picker shows first. Reordering `FORMATS` is a user-visible change.
- `TYPE_LABEL` now includes `markdown`, and `DetectedType` includes it, but
  `detectType` never returns it yet. Brief 08 adds the sniffing.

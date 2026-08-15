# BRIEF 06 — Generalise the engine beyond raster images

**Prerequisite for briefs 07, 08 and 09. Land this alone, first.**
**Repo:** `/Users/pranaymehrotra/agent/nw` (branch `main`)

---

## Why this exists

We are adding SVG, Markdown and PDF support. Each of those needs the same
core change: the engine currently assumes *every input is one of three raster
image formats*. If three agents each discover that independently, they will
each refactor the same six files differently and collide.

So this brief does the widening once, changes **no user-visible behaviour**,
and leaves three clean seams for the format briefs to plug into.

**Nothing about this brief should change what the site does.** Same formats
accepted, same results, same copy. It is a pure refactor. If a user could tell
the difference, you have gone too far.

## The problem, concretely

```
src/lib/types.ts:36      export type ImageFormat = 'jpeg' | 'png' | 'webp'
src/lib/filetype.ts:24   SUPPORTED_FORMATS = ['jpeg', 'png', 'webp']
src/lib/config.ts:15     ACCEPTED_MIME = 'image/jpeg,image/png,image/webp'
src/lib/clean.ts:54      runCleaner() — a 3-arm switch on ImageFormat
src/lib/clean.ts:112     `before.file.format!` — non-null assertion
src/lib/worker/protocol.ts   message types carry image assumptions
```

`filetype.ts` already *detects* `pdf`, `svg`, `gif`, `tiff`, `heic` and `avif`
(lines 14–20) and already has labels for them (`TYPE_LABEL`, line 74). Detection
is not the problem — the pipeline downstream of it is.

## What to build

1. **Introduce `CleanableFormat`** in `src/lib/types.ts`:

   ```ts
   export type ImageFormat = 'jpeg' | 'png' | 'webp';        // keep, still used
   export type TextFormat  = 'svg' | 'markdown';             // brief 07, 08
   export type DocFormat   = 'pdf';                          // brief 09
   export type CleanableFormat = ImageFormat | TextFormat | DocFormat;
   ```

   `ScannedFile.format` widens to `CleanableFormat`. `ImageFormat` stays and
   keeps its meaning — the raster cleaners are genuinely image-only and should
   not be forced to pretend otherwise.

2. **Make the cleaner lookup a registry, not a switch.** Replace `runCleaner`
   with a table keyed by format, so a new format is a registration rather than
   an edit to `clean.ts`:

   ```ts
   type Cleaner = (bytes: Uint8Array, opts: CleanContext) => RawCleanOutcome;
   const CLEANERS: Partial<Record<CleanableFormat, Cleaner>> = { jpeg, png, webp };
   ```

   A format with no registered cleaner must fail the same way an unsupported
   file does today — cleanly, with the original untouched.

3. **Widen `RawCleanOutcome`** (`src/lib/cleaners/types.ts`) so
   `orientationPreserved` is optional in a way that reads as image-specific
   rather than universal. Do not add format-specific fields to the shared type;
   if a format needs to report something extra, extend `warnings`.

4. **`SUPPORTED_FORMATS` and `ACCEPTED_MIME` become derived**, not hand-written
   lists — both should fall out of whatever is registered, so a format cannot be
   half-added (accepted by the file picker but with no cleaner behind it).

5. **Worker protocol** (`src/lib/worker/protocol.ts`): remove image assumptions
   from the message types. Keep the fallback-to-main-thread path working.

6. **UI copy audit.** Grep `src/components/` and `src/pages/` for hard-coded
   "image", "photo", "JPG/PNG/WebP" in *scanner-mechanic* copy and route it
   through a single helper. **Do not touch marketing or guide copy** — the tool
   pages are still image tools today and their headlines must not change.

## Rules you must not break

1. **No new runtime dependencies in `src/lib/`.** Non-negotiable.
2. `pnpm build` succeeds, `pnpm test` stays green at **76 tests**. This refactor
   should not require editing a single test assertion. If it does, you have
   changed behaviour — stop and reconsider.
3. Re-scan verification (`clean.ts` header comment) is load-bearing. The registry
   must not let a cleaner self-report success — the diff against a second scan
   stays the only source of "Removed".
4. `src/lib/signals.ts` is untouched. No new signals in this brief.
5. No format is *enabled* here. At the end of this brief the site still accepts
   exactly JPEG, PNG and WebP.

## Files you own

```
src/lib/types.ts
src/lib/clean.ts
src/lib/config.ts
src/lib/filetype.ts
src/lib/cleaners/types.ts
src/lib/worker/**
src/components/react/**   (mechanic copy only)
```

## Files you must NOT touch

```
src/lib/signals.ts        the capability matrix — briefs 07-09 add to it
src/lib/cleaners/{jpeg,png,webp}.ts   working, tested, byte-exact
src/lib/metadata/**
src/content/guides/**
tests/**                  this refactor should need no test changes
```

## Definition of done

```bash
pnpm build
pnpm test                 # 76 green, zero assertions edited
git diff --stat tests/    # must be empty
```

Then write `.reports/06-format-generalisation-report.md`: what moved, the shape
of the registry seam, and anything briefs 07–09 now need to know.

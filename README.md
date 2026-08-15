# NoWatermark.fyi

Free browser-based tools for inspecting and removing metadata and AI-provenance
information from images and text.

**No file is ever uploaded.** Every scan and clean runs on the user's device.
There is no backend, no database and no object storage.

One optional feature crosses the network: rewriting *pasted text* to disturb a
statistical watermark, which needs a language model we cannot run in a browser.
It is opt-in per use, shows the exact payload first, and never touches files.
See "The one exception" below.

---

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:4321
pnpm build        # static output in dist/
pnpm preview      # serve the built site
pnpm test         # unit + integration tests
pnpm fixtures     # write sample files with known metadata to tests/fixtures/samples
```

Requires Node 20+ and pnpm. **No environment variables and no secrets are
needed** — `.env.example` documents only optional analytics/ads integrations.

---

## Zero-backend architecture

```
Cloudflare Pages  →  static HTML/CSS/JS  →  browser
                                              ↓
                                    reads local File
                                              ↓
                                     Web Worker (on device)
                                     scan → clean → re-scan
                                              ↓
                                       local Blob download
```

The normal user flow makes **no server request that carries file data**: no
upload endpoint, no database, no external API for anything file-derived. That
holds for every format, without exception.

This is verified, not asserted. See `tests/decodable.test.ts` and the offline
check below.

### The one exception

`functions/api/rewrite.ts` is a Cloudflare Pages Function — the only server-side
code in the project. It proxies Google's Gemini API so the API key can stay
secret, and it carries **only text the user explicitly chose to send**: never a
file, filename, hash or metadata value.

It fails closed. Without `GEMINI_API_KEY` it returns 503; without
`TURNSTILE_SECRET_KEY` it returns 503 even when the Gemini key is present, so an
endpoint that spends the key with no bot check cannot run. Without
`PUBLIC_TURNSTILE_SITE_KEY` the UI is tree-shaken out of the bundle entirely.

It runs on Gemini's **paid** tier, where Google does not train on the content.
Rewriting is never reported as a removal — there is no detector we can run, so
the result is `rewritten_unverified`, not "Removed".

### Verifying it yourself

1. Load any tool page.
2. Disconnect from the internet.
3. Scan, clean and download a file.

Everything works, because it was always working locally. Alternatively, open the
network panel while using a tool: you will see static assets, the worker script,
and a local `blob:` URL for the preview — nothing carrying your file.

### Why browser Web Workers are fine

The architecture bans **Cloudflare Workers** (server-side compute). Browser
**Web Workers** are a different thing entirely and run on the user's device;
parsing happens in one so a 25 MB file does not block the UI.

---

## How scanning and cleaning work

### Scanning

Format is determined by **magic bytes**, never by extension or the reported MIME
type. The container is then walked and its metadata blocks extracted:

| Format | Metadata locations read |
|---|---|
| JPEG | APP1 EXIF, APP1 XMP (incl. multi-segment Extended XMP), APP13 IPTC, APP11 JUMBF/C2PA, COM |
| PNG | `tEXt` / `zTXt` / `iTXt` (inflated), `eXIf`, `tIME`, `caBX` |
| WebP | `EXIF`, `XMP `, `C2PA`, plus VP8X flags |
| SVG | `<metadata>`, XMP/RDF, `<title>`, `<desc>`, generator comments, editor namespaces, `<script>` and `on*` handlers, remote refs, **and images embedded as data URIs, which are unpacked and cleaned in place** |
| Markdown | YAML frontmatter provenance keys, JSON-LD, HTML comments and `<meta>` tags, hidden Unicode |
| PDF | `/Info` and XMP **across every revision**, prior-revision count, `/Encrypt`, document JavaScript, embedded files — **inspect only, no cleaner** |

### Cleaning — no recompression

Cleaners operate at the **container level** and copy compressed image data
byte-for-byte. Nothing is decoded, nothing is re-encoded, so output pixels are
bit-identical to the input. Tests assert this directly by comparing the JPEG
scan stream, PNG `IDAT` and WebP `VP8`/`VP8L` payloads before and after.

**Kept on purpose:**

- **ICC colour profiles** (JPEG APP2, PNG `iCCP`, WebP `ICCP`) — removing them
  visibly shifts colours.
- **JFIF (APP0) and Adobe (APP14) markers** — removing APP14 breaks colour
  interpretation on Adobe-encoded, notably CMYK, JPEGs.
- **EXIF Orientation**, when it is not 1. Phones store rotation in a tag rather
  than rotating pixels; stripping all EXIF makes portrait photos display
  sideways. A minimal orientation-only block is re-embedded, the UI says so, and
  a checkbox lets the user strip it anyway.

**WebP specifics:** removing `EXIF`/`XMP ` chunks also clears the corresponding
VP8X flag bits, recomputes the RIFF size, and preserves odd-length chunk
padding. Skipping any of those produces files some decoders reject.

### Verification is the product

The before/after report is produced by **re-scanning the cleaner's own output**
and diffing it against the original scan. A signal is reported as removed only
because a second, independent scan can no longer find it — never because a
cleaner claimed it. This is what makes the "Removed ✓" marks trustworthy, and
why an unverifiable signal can never accidentally be reported as gone.

---

## The honesty rule

`src/lib/signals.ts` is the single source of truth for what the product claims.
Scanners, cleaners, the UI and `/methodology` all read from it, so a product
claim cannot drift from the implementation.

Three statuses, and the distinction between the last two is the whole point:

- **Detected** — found in the file.
- **Not detected** — we looked in the places it lives and it was not there.
- **Unable to verify** — we have no way to look.

SynthID and statistical text watermarks are permanently **Unable to verify**.
They never appear in a removed list. Never add a removal claim for a signal
whose `remove` flag is `false`.

---

## Known limitations

- C2PA manifests are detected and partially parsed, but signatures are **not**
  validated against a trust list. Never report a manifest as valid or invalid.
- **Durable Content Credentials** can be re-associated with an image by a
  provider after the manifest is stripped, via invisible watermark or content
  fingerprint. Removal cleans your copy of the file, not anyone else's records.
- Pixel-embedded watermarks (SynthID) are neither detectable nor removable.
- Statistical text watermarks are not detectable client-side by anyone.
- Scans JPG, PNG, WebP, SVG, Markdown and PDF. Cleans all but PDF.
  Not AVIF/HEIC/GIF/TIFF/audio/video.
- **PDF is inspect-only by design.** A PDF is append-only, so a "cleaner" that
  appends an update leaves the original metadata readable. Doing it correctly
  means rewriting the whole document; until then we report rather than pretend.
- Markdown cleaning removes provenance keys only — `title`, `tags` and `layout`
  drive the user's site build and are left alone. YAML anchors are reported and
  not rewritten, since deleting one key can silently change another.
- Max input 25 MB — a browser memory limit, not a server one.

---

## Project layout

```
src/
├── lib/
│   ├── signals.ts        capability matrix — the source of product claims
│   ├── scan.ts           scan orchestrator → ScanResult
│   ├── clean.ts          clean + re-scan + diff → CleanResult
│   ├── filetype.ts       magic-byte detection
│   ├── metadata/         jpeg, png, webp walkers + exif, xmp, c2pa readers
│   ├── cleaners/         per-format container rewriters
│   ├── unicode/hidden.ts invisible-character scanner
│   ├── worker/           Web Worker + client (with main-thread fallback)
│   └── site.ts           tool-page content and navigation
├── components/react/     ImageScanner, TextScanner islands
├── content/guides/       Markdown guides (content collection)
├── pages/                index, [tool], guides/, methodology, privacy, terms
└── styles/global.css     design tokens, light + dark

tests/
├── fixtures/base/        real images from real encoders (committed)
├── fixtures/build.ts     injects known metadata into them
└── *.test.ts             scan, clean, unicode, filetype, decodable
```

Guide pages load **no application JavaScript** — the React scanner bundle is
only sent on pages that have a tool. Every page does carry two small async
analytics tags (Cloudflare Web Analytics, Google Analytics); neither blocks
rendering and neither receives any file-derived data.

---

## Libraries

The scanning and cleaning core has **no runtime dependencies**. The JPEG, PNG
and WebP walkers, the EXIF reader/writer, the XMP extractor and the C2PA
detector are all hand-written (~1,500 lines).

This deviates from the PRD's suggestion of `exifr` for reading, deliberately:
the cleaner needs byte-level container and EXIF understanding regardless (the
orientation-preservation path writes a TIFF block), owning it keeps the tool
bundle small and guarantees no network access, and there is no third-party code
in the path that touches user files. Readers are isolated behind
`src/lib/metadata/*` so a library could be swapped in behind the same interface.

Before adding any dependency: check maintenance, licence, browser support,
bundle size, confirm it performs no network upload, test empirically, and put it
behind an internal adapter.

---

## Testing

```bash
pnpm test
```

- **Unit** — parsers and cleaners against fixtures with known metadata.
- **Byte-level** — asserts image data is unchanged by cleaning.
- **Honesty** — asserts SynthID is never reported as removed, and that every
  signal in `removedSignals` is genuinely absent from the re-scan.
- **Decoder** (`decodable.test.ts`) — writes cleaned files to disk and opens
  them with a real OS decoder, catching mistakes our own parsers would share.
  Self-skips where the tool is unavailable.

Fixtures are built by injecting known metadata into real base images. The
container manipulation in `tests/fixtures/build.ts` is written independently of
`src/lib`, so a shared bug cannot make a test pass by agreeing with itself.

---

## Deployment (Cloudflare Pages)

**Live at https://nowatermark.fyi.** Deployment is automatic: push to `main` and
Cloudflare Pages builds and publishes. There is no manual `wrangler` step.

| Setting | Value |
|---|---|
| Project | `nowatermark` (Git-connected) |
| Build command | `pnpm build` |
| Output directory | `dist` |
| Production branch | `main` |
| Node | 22, pinned in `.node-version` |
| Environment variables | none — the app requires no secrets |

`public/_headers` sets security headers and immutable caching for hashed assets.

### The CSP is NOT in _headers

It is generated per page by Astro (`security.csp` in `astro.config.ts`) so the
hashes for Astro's inline hydration scripts stay correct on every build. Two
production outages were caused by getting this wrong, and neither was visible
locally because `astro preview` does not apply `_headers`.

**Any new third-party script must be added to `security.csp`, then verified by
loading the deployed URL and checking the console.** A CSP failure is silent.

### Analytics

- **Cloudflare Web Analytics** — cookieless, auto-injected by Pages.
- **Google Analytics 4** — `G-LXNWBS7347`, configured in `public/ga.js`. It
  **sets cookies**, unlike the Cloudflare beacon; `/privacy` says so explicitly.
  If you operate where prior consent is required for analytics cookies, that
  consent gate is not built yet.

Neither ever receives file-derived data — files never leave the device, so there
is nothing for analytics to collect. Both are additive: if either is blocked,
every tool still works.

Event-level funnel tracking does not exist. Cloudflare Web Analytics has no
custom events API; GA4 could carry it, but any event must stay page-level.

### SEO

- Sitemap: `https://nowatermark.fyi/sitemap-index.xml`, regenerated each build
  and declared in `robots.txt`. Submit that URL to Google Search Console and
  Bing Webmaster Tools.
- `build.format: 'file'` is deliberate — it emits `/exif-remover.html` so
  Cloudflare serves `/exif-remover` without a 308 to `/exif-remover/`, matching
  the no-trailing-slash canonicals.
- Research and the remaining article backlog live in `.seo/`.

---

## Working on this

See **`CLAUDE.md`** for the non-negotiables, the CSP gotchas, the design system
and the known traps. Read it before changing anything.

# NoWatermark.fyi — Product Requirements Document

**Version:** 0.3  
**Date:** August 2026  
**Domain:** `nowatermark.fyi`  
**Domain/DNS:** Cloudflare  
**Hosting:** Cloudflare Pages  
**Product type:** Free web utility / SEO-driven consumer tool  
**Primary monetization:** Display advertising  
**Secondary future monetization:** Pro tools, batch processing, API

---

# 1. Product Summary

NoWatermark.fyi is a free web tool for inspecting and cleaning metadata and AI-provenance information from digital content.

The initial product focuses primarily on images.

A user should be able to:

1. Drag an image into the site.
2. See what metadata and provenance information the image contains.
3. Understand which signals are removable.
4. Remove supported metadata locally in the browser.
5. Download the cleaned image.
6. Verify what remains after cleaning.

The site should also provide dedicated SEO tools and educational pages around:

- ChatGPT image watermarks
- Claude text watermarks
- SynthID
- C2PA
- Content Credentials
- AI metadata
- EXIF
- hidden Unicode characters
- AI provenance

The long-term product vision is:

> **Upload anything and see what AI or metadata fingerprints it contains.**

NoWatermark.fyi should become a provider-neutral toolkit covering OpenAI, Anthropic, Google, Adobe/C2PA and future provenance standards.

---

# 2. Core Product Principle

The site must clearly distinguish between:

## A. Removable metadata

Examples:

- EXIF
- XMP
- IPTC
- PNG text chunks
- software/generator information
- timestamps
- author information
- device information
- GPS information
- C2PA manifests where technically removable

These can often be removed without substantially altering the actual content.

## B. Embedded or statistical signals

Examples may include:

- SynthID
- statistical text watermarks
- model-specific robust watermarking techniques

The product must **not claim these have been removed unless we can reliably test and validate removal**.

This distinction is fundamental to the credibility of NoWatermark.fyi.

---

# 3. Critical Infrastructure Principle

NoWatermark.fyi V1 must be designed as a **zero-backend application**.

The normal user flow must require:

- no server-side file upload
- no Cloudflare Worker request
- no Cloudflare Pages Function request
- no database query
- no object storage
- no external AI API
- no paid processing service

The intended architecture is:

```text
Cloudflare Pages
      ↓
serves HTML / CSS / JavaScript
      ↓
User's browser
      ↓
reads local file
      ↓
scans metadata
      ↓
cleans metadata
      ↓
rescans result
      ↓
creates local download
```

Uploaded files must **never leave the user's device during normal V1 operation**.

This architecture is required for:

1. privacy
2. performance
3. scalability
4. near-zero infrastructure cost
5. compatibility with Cloudflare's Free plan
6. avoiding compute costs as traffic grows

## Terminology note: Workers

The prohibition on "Workers" refers to **Cloudflare Workers** (server-side compute).

Browser **Web Workers** are a different technology and are **encouraged**: parsing and cleaning should run off the main thread in a Web Worker so the UI stays responsive on large files. This does not violate the zero-backend principle — Web Workers run entirely on the user's device.

---

# 4. Cloudflare Free-Tier Requirement

V1 should be capable of running entirely within Cloudflare's free hosting infrastructure.

The architecture should assume:

### Cloudflare Pages

Used for:

- static HTML
- CSS
- JavaScript
- fonts
- icons
- SEO content
- guides
- landing pages
- sitemap
- robots.txt

Static serving should be the default.

### Cloudflare Workers / Pages Functions

Core application functionality must **not depend on Workers or Pages Functions**.

Server-side functionality may only be introduced when there is a clear requirement that cannot reasonably be executed in the browser.

Examples of potentially acceptable future server-side functionality:

- contact form
- API product
- server-side external watermark verification
- billing
- authenticated Pro features

These are not part of V1.

### Databases

No database in V1.

Do not introduce:

- D1
- PostgreSQL
- Supabase
- Firebase
- MongoDB
- Redis

unless explicitly required in a future phase.

### File Storage

Do not introduce:

- Cloudflare R2
- S3
- file upload storage
- temporary upload storage

Uploaded files stay entirely local.

---

# 5. Infrastructure Cost Goal

Target V1 monthly application infrastructure cost:

> **$0/month excluding domain registration/renewal**

Expected:

```text
Cloudflare Pages           $0
Static bandwidth           $0
SSL                        $0
Database                   $0
Object storage             $0
Backend compute            $0
AI APIs                    $0
Cloudflare Web Analytics   $0
```

Do not introduce a recurring infrastructure expense unless the product requirement explicitly justifies it.

---

# 6. Positioning

Primary positioning:

> **See what your file reveals.**

Secondary:

> **Find and clean AI metadata and provenance information.**

Supporting copy:

> Check images for AI metadata, Content Credentials, EXIF and other provenance information. Clean supported metadata directly in your browser.

Avoid positioning such as:

- "Make AI content completely undetectable."
- "Defeat every AI detector."
- "Guaranteed SynthID removal."
- "Bypass Claude detection."
- "100% undetectable."

Do not make technical claims we cannot verify.

---

# 7. Target Users

## AI image users

People generating images using:

- ChatGPT
- Gemini
- other AI image generators

They want to know what information is embedded in the resulting files.

## Creators and marketers

People publishing AI-assisted creative work who want to understand:

- metadata
- privacy information
- provenance
- Content Credentials

## Privacy-conscious users

People who want to remove:

- GPS
- timestamps
- device information
- editing software
- author information

## Developers and technical users

People researching:

- C2PA
- SynthID
- AI provenance
- metadata standards

---

# 8. Product Goals

## Primary goals

1. Launch a genuinely useful free tool.
2. Perform V1 processing locally in the browser.
3. Maintain $0 hosting/processing cost at normal usage levels.
4. Minimize infrastructure complexity.
5. Create a strong SEO architecture.
6. Establish credibility around AI provenance.
7. Capture rapidly growing watermark-related search traffic.
8. Make every tool usable without registration.

## Business goals

The eventual flywheel should be:

```text
Google search
      ↓
Useful free tool
      ↓
Additional related page/tool
      ↓
Multiple pageviews
      ↓
Display advertising
      ↓
Organic backlinks
      ↓
Higher domain authority
      ↓
More search traffic
```

---

# 9. Non-Goals for V1

V1 should NOT attempt to:

- remove visible logos from third-party photographs
- remove photographers' signatures
- remove ownership marks from copyrighted media
- implement Photoshop-style generative watermark removal
- guarantee removal of SynthID
- guarantee removal of Claude's statistical text watermark
- build user accounts
- build subscriptions
- store uploaded files
- build a database
- create a native mobile app
- support video
- support audio
- build a public API
- require Cloudflare Workers for normal tool operation
- require Pages Functions for normal tool operation
- call an LLM for every user request

---

# 10. Recommended Technical Stack

Optimize for:

- Cloudflare
- static deployment
- SEO
- client-side processing
- minimal JavaScript
- zero backend
- very low maintenance

## Framework

**Astro + TypeScript**

Use React only for interactive islands where necessary.

Reasons:

- static-first architecture
- excellent SEO
- minimal client JavaScript
- ideal for large numbers of informational pages
- interactive scanners can load only when needed

## Styling

**Tailwind CSS**

## Hosting

**Cloudflare Pages**

## Package manager

**pnpm**

## Repository

Single repository.

Suggested structure:

```text
/
├── src/
│   ├── components/
│   ├── layouts/
│   ├── lib/
│   │   ├── metadata/
│   │   ├── cleaners/
│   │   ├── provenance/
│   │   ├── unicode/
│   │   └── analytics/
│   ├── pages/
│   │   ├── index.astro
│   │   ├── guides/
│   │   └── [tool pages]
│   └── styles/
│
├── public/
├── tests/
├── astro.config.*
├── package.json
└── README.md
```

---

# 11. Backend Prohibition

Claude must NOT implement architecture like:

```text
POST /api/upload
POST /api/scan-image
POST /api/remove-metadata
POST /api/download
```

for V1.

Specifically, do not build:

```text
Browser
   ↓
Cloudflare Worker
   ↓
Process image
   ↓
Return cleaned image
```

Instead:

```text
Browser
   ↓
Local ArrayBuffer / Blob
   ↓
Local parser
   ↓
Local cleaner
   ↓
Local Blob
   ↓
Download
```

Server processing requires an explicit future product decision.

---

# 12. Homepage

URL:

```text
/
```

Primary H1:

> AI Watermark & Metadata Checker

Supporting text:

> See what AI and metadata fingerprints are hiding inside your files.

Primary interaction:

> Drop an image here

Secondary:

> or choose a file

Privacy message immediately underneath:

> 🔒 Your file stays on your device.

Supported initially:

- JPG / JPEG
- PNG
- WebP

Initial recommended maximum:

**25 MB**

This is a browser UX/performance limit, not a Cloudflare upload limit, because the image is never uploaded.

---

# 13. Core User Flow

## Step 1 — File selection

User selects or drops image.

Use browser APIs:

```text
File
Blob
ArrayBuffer
FileReader where needed
```

No network request should occur.

Immediately show:

- thumbnail
- filename
- format
- resolution
- file size

Then:

> Scanning file…

---

# 13.1 Scanner State Machine

The tool UI is a state machine:

```text
idle → reading → scanning → results
results → cleaning → verifying → done
any state → error
```

Rules:

- only one job at a time
- selecting a new file from any state resets to `reading`
- entering `error` never modifies or discards the user's original file
- every state has a visible UI representation (no silent processing)

---

# 14. Network Isolation

The scanner and cleaner should operate correctly even if the network becomes unavailable after the application has loaded.

Ideal test:

1. Load NoWatermark.fyi.
2. Disable internet connection.
3. Upload image.
4. Scan succeeds.
5. Clean succeeds.
6. Download succeeds.

This is a strong technical verification that core processing is local.

---

# 15. Scan Results

Results should be divided into understandable categories.

Example:

# Your image contains 7 metadata signals

### AI provenance

| Signal | Status |
|---|---|
| C2PA / Content Credentials | Detected |
| AI generator metadata | Detected |
| SynthID | Unable to verify locally |

### Privacy metadata

| Signal | Value |
|---|---|
| GPS | None |
| Creation date | Aug 13, 2026 |
| Device | None |
| Software | ChatGPT |

### File metadata

| Type | Status |
|---|---|
| EXIF | Detected |
| XMP | Detected |
| IPTC | None |

Use simple statuses:

- **Detected**
- **Not detected**
- **Unknown**
- **Unable to verify**

Do not present "Not detected" when the technology cannot actually establish absence.

---

# 16. Explanation Layer

Each signal needs an expandable explanation.

Example:

### C2PA / Content Credentials

> C2PA is a provenance standard that can record where media originated and how it has been edited.

Then:

**Can NoWatermark remove this?**

Possible answer:

> Supported C2PA-related metadata can be removed from this file.

OR:

> NoWatermark cannot currently verify whether an embedded watermark remains after metadata cleaning.

The product must educate users rather than treating every watermark as equivalent.

---

# 16.1 C2PA Scope in V1

Be precise about what "C2PA support" means. It has three distinct levels:

## A. Detection and parsing (V1, local)

Detect the manifest container (JPEG APP11 JUMBF segments, PNG `caBX` chunks, WebP chunk) and parse basic claim information locally. This works offline.

## B. Cryptographic trust verification (out of scope for V1)

Fully validating manifest signatures against C2PA trust lists may require network access and current trust data. V1 must not label a manifest "valid" or "invalid" — only "present", with parsed details where available.

## C. Durable Content Credentials

Some providers can restore Content Credentials after metadata is stripped, by matching an invisible watermark or content fingerprint against a cloud database. Removing the manifest removes it from the file; it does not prevent this recovery.

The C2PA explanation in the UI must state this:

> Removing the C2PA manifest removes it from the file itself. Some services can still re-associate provenance using invisible watermarks or content fingerprints. NoWatermark cannot verify or remove those.

---

# 17. Cleaning Action

Primary button:

> **Clean Metadata**

Supporting copy:

> Remove supported metadata while preserving the image.

Possible supported items:

- EXIF
- XMP
- IPTC
- GPS
- timestamps
- device information
- software information
- supported provenance metadata

Do not list a technology as removable unless the implementation genuinely supports it.

---

# 18. Standard Cleaning Mode

Default.

Goal:

Remove metadata without changing image pixels or recompressing wherever possible.

## JPEG

Attempt removal of supported APP metadata segments without recompression.

## PNG

Remove relevant ancillary metadata chunks while preserving the underlying image data.

## WebP

Remove supported EXIF/XMP metadata while preserving encoded image data when possible.

---

# 18.1 Format-Specific Strip/Keep Rules

Standard Clean must operate on explicit strip/keep lists. Stripping the wrong segment corrupts images or shifts colors. These tables are the initial implementation spec; keep them in sync with the Capability Matrix.

## JPEG

| Segment | Action | Reason |
|---|---|---|
| APP1 (EXIF) | Strip | Metadata — see Orientation policy below |
| APP1 (XMP + Extended XMP) | Strip | Metadata; Extended XMP spans multiple APP1 segments — find them all |
| APP13 (Photoshop IRB / IPTC) | Strip | Metadata |
| APP11 (JUMBF / C2PA) | Strip | Provenance manifest |
| COM | Strip | Comments |
| APP0 (JFIF) | Keep | Structural |
| APP2 (ICC profile) | Keep | Color fidelity — stripping shifts colors |
| APP14 (Adobe) | Keep | Color transform info — stripping breaks colors on Adobe-encoded JPEGs |
| DQT / DHT / SOF / SOS / DRI / structural | Keep | Image data |

Unknown APPn segments: strip by default. Never modify anything between SOS and EOI.

## PNG

Strip:

```text
tEXt, zTXt, iTXt (incl. XMP), eXIf, tIME, caBX (C2PA)
```

Keep:

```text
IHDR, PLTE, IDAT, IEND, tRNS, gAMA, cHRM, sRGB, iCCP,
sBIT, pHYs, bKGD, acTL / fcTL / fdAT (APNG)
```

`iCCP` is the color profile — keep it for the same reason as JPEG APP2.

## WebP

Strip: `EXIF` and `XMP ` chunks (and C2PA JUMBF chunk if present).

Keep: `VP8 `, `VP8L`, `VP8X`, `ALPH`, `ICCP`, `ANIM`, `ANMF`.

After stripping, the cleaner MUST:

1. clear the EXIF and XMP flag bits in the VP8X header
2. recompute the RIFF file size field
3. preserve even-byte chunk padding

Skipping step 1 or 2 produces files some decoders reject.

---

# 18.2 EXIF Orientation Policy

Many photos store rotation in the EXIF Orientation tag. Stripping all EXIF makes those images display rotated in most viewers — a classic EXIF-remover bug.

Standard Clean behavior:

1. Read Orientation before cleaning.
2. If Orientation is 1 or absent, strip EXIF entirely.
3. If Orientation ≠ 1, default to preserving orientation by writing a minimal EXIF block containing only the Orientation tag. Tell the user: "Kept 1 field: image rotation."
4. Offer a toggle to strip it anyway, with a warning that the image may appear rotated.

Aggressive Clean may instead bake the rotation into the pixels (re-encode) and strip everything.

Never silently ship an image that renders rotated.

---

# 18.3 Edge Cases

Define behavior explicitly:

- **Animated WebP / APNG:** preserve animation chunks; clean metadata only.
- **Multi-segment metadata:** Extended XMP (JPEG) and multiple APP1 segments must all be located and removed.
- **CMYK / Adobe JPEGs:** must keep APP14; include a color-fidelity check in tests.
- **Progressive JPEG:** supported; cleaning must not touch scan data.
- **Truncated/corrupt files:** show the corrupt-file error; never emit a partial output.
- **Already-clean files:** show a positive "No removable metadata found" state, not an error.
- **Files just over the size limit:** clear error, no partial processing.

---

# 19. Aggressive Clean

Architect for this but do not prioritize for launch.

Potential process:

```text
decode
↓
canvas / ImageBitmap
↓
re-render
↓
re-encode
```

Explain:

> Aggressive Clean recreates the image and may slightly change compression or file size.

Never silently re-encode an image.

---

# 20. Browser Resource Management

Because all processing happens locally, the application must handle memory carefully.

Requirements:

- revoke object URLs after use
- avoid unnecessary ArrayBuffer copies
- release image references after processing
- avoid keeping both large original and multiple intermediate copies indefinitely
- prevent multiple simultaneous huge-file jobs
- show graceful errors if browser memory becomes insufficient

Do not introduce server processing merely to avoid client-side optimization work.

---

# 21. Post-Clean Verification

After cleaning, automatically scan the output again locally.

Show:

### Before

7 metadata signals

### After

1 unverifiable signal

Example:

```text
EXIF                 Removed ✓
XMP                  Removed ✓
Software metadata    Removed ✓
C2PA metadata        Removed ✓
SynthID              Unable to verify
```

Then:

> Download Clean Image

The download must use a locally generated Blob/Object URL.

No server round-trip.

---

# 22. Privacy Architecture

Privacy should be one of the strongest selling points.

Prominent claim:

> **Files never leave your browser.**

Requirements:

- no file uploads
- no image content logging
- no image hashes sent to analytics
- no filenames sent to analytics
- no extracted metadata values sent to analytics
- no storage
- no account required

Privacy badge:

> 🔒 Processed locally

Expanded copy:

> Your image is analyzed directly in your browser. NoWatermark does not upload or store it.

---

# 23. Text Utility

Text should exist primarily for SEO and basic inspection.

Routes:

```text
/claude-watermark-checker
/claude-watermark-remover
```

Initial functionality should detect:

- zero-width spaces
- zero-width joiners
- zero-width non-joiners
- unusual invisible Unicode
- BOM characters
- variation selectors where relevant
- suspicious hidden formatting characters

Processing must also occur locally.

User pastes text.

Example:

```text
Hidden characters: 4
Suspicious Unicode: 2
Claude statistical watermark: Cannot verify
```

Button:

> Clean Hidden Characters

Do NOT send pasted text to an API.

Do NOT send pasted text to analytics.

Prominent disclaimer:

> Claude's watermark is not simply invisible Unicode. NoWatermark does not currently claim to detect or remove Anthropic's statistical watermark.

---

# 24. Initial SEO Landing Pages

Create dedicated pages for:

```text
/claude-watermark-remover
/claude-watermark-checker
/claude-watermark
/chatgpt-watermark-remover
/chatgpt-watermark-checker
/chatgpt-image-watermark
/synthid-checker
/synthid-remover
/c2pa-checker
/c2pa-remover
/ai-watermark-remover
/ai-watermark-checker
/ai-metadata-remover
/exif-remover
/content-credentials-checker
```

Pages may share underlying scanner functionality.

They must contain genuinely different explanatory content.

Do not generate thin keyword-swapped pages.

## "Remover" pages for non-removable signals

`/synthid-remover` and `/claude-watermark-remover` target searches for things the Capability Matrix says NoWatermark cannot remove.

These pages must:

- lead with the honest answer ("Can you remove SynthID?" → what is and isn't technically possible)
- explain what the checker/cleaner can genuinely do
- link to the working tools

They must never imply removal capability the Capability Matrix does not support. Honest "remover" pages are still valuable — they capture the search and convert it into education plus a real metadata clean.

---

# 25. Informational Content

Create:

```text
/guides/
```

Initial guides:

```text
/guides/does-claude-watermark-text
/guides/how-claude-watermark-works
/guides/does-chatgpt-watermark-images
/guides/what-is-synthid
/guides/how-synthid-works
/guides/c2pa-vs-synthid
/guides/what-are-content-credentials
/guides/how-to-check-ai-image-metadata
/guides/how-to-remove-exif-data
/guides/can-you-remove-ai-watermarks
```

Each guide should link to relevant tools.

---

# 26. Static-First SEO Architecture

All informational pages should be statically generated during deployment.

Search-engine crawlers must receive meaningful HTML without depending on client-side JavaScript.

Do NOT use a client-side SPA architecture for the whole site.

Preferred:

```text
Astro static HTML
+
interactive islands
```

rather than:

```text
React SPA
+
client-side rendering everything
```

The scanner may be interactive.

The SEO content must remain static HTML.

---

# 27. SEO Requirements

Every indexable page needs:

- unique title
- unique meta description
- clear H1
- canonical URL
- OpenGraph metadata
- social-card metadata
- internal links
- breadcrumb navigation where appropriate
- structured data where relevant

Generate:

```text
/sitemap.xml
/robots.txt
```

Potential structured data:

- `SoftwareApplication`
- `WebApplication`
- `Article`
- `BreadcrumbList`
- FAQ markup only where currently appropriate and useful

Avoid schema spam.

---

# 28. Page Templates

## ToolPage

```ts
{
  title,
  description,
  h1,
  intro,
  toolComponent,
  explanation,
  faq,
  relatedTools,
  relatedGuides
}
```

## GuidePage

```ts
{
  title,
  description,
  publishDate,
  updatedDate,
  sections,
  faq,
  relatedTools
}
```

---

# 29. Internal Linking Strategy

Each tool page should link to related tools and guides.

Example:

ChatGPT Watermark Checker:

```text
AI Watermark Checker
C2PA Checker
SynthID Checker
EXIF Remover
```

Related guides:

```text
Does ChatGPT watermark images?
What is C2PA?
What is SynthID?
```

Avoid orphan pages.

---

# 30. Brand

Brand:

# NoWatermark

Domain:

`nowatermark.fyi`

Descriptor:

> AI provenance & metadata tools

Tone:

- straightforward
- credible
- technically literate
- privacy-conscious
- slightly playful

Avoid:

- hacker aesthetics
- piracy aesthetics
- "undetectable AI" language
- scammy converter aesthetics
- academic-cheating positioning

---

# 31. Visual Direction

Aim for the visual quality of modern developer-focused utilities.

Characteristics:

- white space
- neutral palette
- excellent typography
- crisp cards
- subtle borders
- minimal gradients
- subtle micro-interactions
- strong hierarchy

The upload scanner should dominate the homepage.

Maximum desktop width:

Approximately `1100–1200px`.

Mobile-first.

---

# 32. Header

Logo:

> NoWatermark

Navigation:

```text
Tools
Guides
About
```

Tools menu:

```text
AI Watermark Checker
ChatGPT Checker
Claude Checker
SynthID Checker
C2PA Checker
Metadata Remover
EXIF Remover
```

Primary CTA:

> Check a File

---

# 33. Homepage Structure

## Hero

> AI Watermark & Metadata Checker

> See what your file reveals.

Upload area.

---

## Demo result

Example:

```text
C2PA                 Detected
EXIF                 Detected
Software             ChatGPT
GPS                  None
SynthID              Unable to verify
```

---

## What NoWatermark checks

### AI provenance

C2PA, Content Credentials and AI-generator metadata.

### Private metadata

Location, timestamps, devices and creator information.

### Hidden information

Invisible Unicode and hidden metadata.

---

## Popular tools

6–8 cards.

---

## Privacy

> Your files stay yours.

Explain browser processing.

---

## Educational section

> Not every AI watermark works the same way.

Explain metadata vs embedded watermark.

---

## Popular guides

---

## FAQ

---

# 34. Advertising Architecture

Do not make V1 dependent on AdSense approval.

Pre-build optional advertisement slots.

Examples:

```text
<AdSlot position="after-tool" />
<AdSlot position="article-middle" />
```

Until configured, these should render nothing.

Do NOT:

- place ads beside Download buttons
- make ads resemble product controls
- create accidental-click patterns
- block tool usage behind ad interaction
- overload pages with ads

Advertising should never require image content to be uploaded.

---

# 35. Analytics

Use:

**Cloudflare Web Analytics**

## Important constraint

Cloudflare Web Analytics is **pageview-based**. It reports visits, referrers, paths and Core Web Vitals. It does **not** support custom events, so the funnel events below cannot be recorded with it.

## V1 approach

- ship Cloudflare Web Analytics for traffic + Core Web Vitals only
- use pageview proxies where possible (tool page views by URL)
- defer event-level funnel tracking

If event-level tracking becomes a requirement, make an explicit decision between:

- a privacy-focused hosted provider (Plausible, Fathom — paid, conflicts with the $0 goal)
- GA4 (free, supports custom events, weaker privacy story)
- a minimal self-hosted counter (requires a Pages Function — a documented exception to the zero-backend rule)

## Desired events, once an event system exists

```text
tool_view
file_selected
scan_started
scan_completed
clean_started
clean_completed
download_clicked
related_tool_clicked
guide_clicked
```

Allowed metadata:

```text
tool_type
file_type
file_size_bucket
signal_count
clean_success
```

Never send:

- filenames
- file bytes
- images
- image hashes
- pasted text
- extracted EXIF values
- GPS information
- author information
- timestamps contained in files

---

# 36. Analytics Failure Independence

The tool must continue functioning if:

- analytics are blocked
- cookies are disabled
- ad blockers are present
- analytics scripts fail
- advertising fails

Analytics and monetization are enhancements, not application dependencies.

---

# 37. Error Handling

## Unsupported format

> This file type isn't supported yet.

## Oversized file

> This file is too large to process comfortably in your browser.

## Corrupt file

> We couldn't read this image.

## Parser failure

> Some metadata could not be inspected.

## Cleaner failure

Never modify the original.

> We couldn't clean this file safely. Your original file has not been changed.

---

# 38. Accessibility

Minimum:

- keyboard-accessible upload
- proper labels
- focus states
- ARIA processing announcements
- strong contrast
- semantic headings
- no color-only status indication

---

# 39. Performance

Performance is a core acquisition requirement.

Priorities:

1. static HTML
2. minimal JS
3. lazy-load metadata libraries
4. no scanner libraries on unrelated guide pages
5. optimized fonts
6. no heavyweight hero assets
7. tool code loads only when useful
8. no unnecessary network calls

Target excellent Core Web Vitals.

---

# 40. Security

Implement:

- Content Security Policy
- appropriate Cloudflare/security headers
- strict MIME/file validation
- no execution of uploaded files
- sanitize metadata before rendering
- sanitize text before rendering
- no arbitrary HTML injection
- safe Blob downloads

Treat every selected file as untrusted.

CSP note: the policy must allow the Cloudflare Web Analytics beacon. Enabling AdSense later will require significantly loosening CSP — keep the CSP in one configuration file so that change is isolated and reviewable.

---

# 41. Browser Support

Prioritize:

- Chrome
- Safari
- Firefox
- Edge
- mobile Safari
- mobile Chrome

Gracefully degrade unsupported APIs.

---

# 42. Metadata Processing Architecture

Normalized representation:

```ts
interface ScanResult {
  file: {
    name: string;
    type: string;
    size: number;
    width?: number;
    height?: number;
  };

  provenance: SignalResult[];
  metadata: SignalResult[];
  privacy: SignalResult[];
  hiddenSignals: SignalResult[];
}

interface SignalResult {
  id: string;
  label: string;

  status:
    | "detected"
    | "not_detected"
    | "unknown"
    | "unable_to_verify";

  value?: string;
  description: string;

  removable:
    | true
    | false
    | "unknown";
}
```

Status values map 1:1 to the UI labels in the Scan Results section: "Detected", "Not detected", "Unknown", "Unable to verify". Do not invent additional presentation states.

Independent scanners:

```text
scanExif()
scanXmp()
scanIptc()
scanC2pa()
scanPngChunks()
scanWebpMetadata()
```

No metadata-specific parsing logic should live inside presentation components.

---

# 42.1 AI-Generator Detection Heuristics

"AI generator metadata" detection should check, at minimum:

- XMP `digitalSourceType` = `trainedAlgorithmicMedia` (the IPTC standard marker for AI-generated content)
- C2PA claim generator (e.g. "OpenAI", "Adobe Firefly")
- EXIF/XMP `Software` / `CreatorTool` values from known generators (ChatGPT, DALL·E, Midjourney, Firefly, Gemini, etc.)
- PNG text chunks written by generation tools: `parameters` (Stable Diffusion / A1111), `prompt` / `workflow` (ComfyUI), `Comment` containing JSON (NovelAI)
- generator-specific XMP namespaces

Maintain the list of known generator signatures in one data file so it can grow without code changes.

---

# 43. Cleaner Architecture

Modular cleaners:

```text
cleanJpegMetadata()
cleanPngMetadata()
cleanWebpMetadata()
cleanHiddenUnicode()
```

Return:

```ts
interface CleanResult {
  success: boolean;
  blob?: Blob;

  removedSignals: string[];
  remainingSignals: string[];
  warnings: string[];
}
```

Immediately scan returned Blob again locally.

---

# 44. No-Recompression Preference

Prefer metadata removal without image recompression.

Do not automatically:

```text
image
→ canvas
→ JPEG/WebP
```

unless necessary.

Reasons:

- may reduce quality
- changes encoded content
- changes file size
- may alter pixel data
- isn't necessary for many metadata operations

Byte-level manipulation should be attempted first.

---

# 45. Capability Matrix

Maintain central configuration.

| Signal | Detect | Remove | Verify |
|---|---|---|---|
| EXIF | Yes | Yes | Yes |
| XMP | Yes | Yes | Yes |
| IPTC | Yes | Yes | Yes |
| GPS | Yes | Yes | Yes |
| C2PA | Target | Target | Target |
| SynthID | No | No | No |
| Hidden Unicode | Yes | Yes | Yes |
| Claude statistical watermark | No | No | No |

The UI should derive product claims from actual capability.

Never hard-code unsupported marketing claims.

---

# 46. Trust Layer

Create:

```text
/methodology
```

Explain:

- what is inspected
- what can be removed
- what cannot be verified
- how browser processing works
- which formats are supported
- known technical limitations

Transparency is a product feature.

---

# 47. Footer

### Tools

- Watermark Checker
- ChatGPT Checker
- Claude Checker
- SynthID Checker
- C2PA Checker
- Metadata Remover

### Learn

- What is SynthID?
- What is C2PA?
- Does ChatGPT watermark images?
- Does Claude watermark text?

### NoWatermark

- Methodology
- Privacy
- Terms
- Contact

---

# 48. Privacy Page

URL:

```text
/privacy
```

Clearly explain:

- local browser processing
- files are not uploaded
- no file storage
- analytics
- advertising once enabled
- cookies if introduced

Use understandable language rather than pure legal boilerplate.

---

# 49. Terms

URL:

```text
/terms
```

Clarify:

- users must have rights to process content
- results come without guarantees
- absence of detected metadata does not prove absence of every watermark
- NoWatermark does not guarantee content is undetectable
- users remain responsible for disclosure/compliance obligations
- removing provenance or attribution information from content the user does not own may be unlawful in some jurisdictions; responsibility rests with the user

---

# 50. MVP Success Criteria

V1 is ready when:

## Product

- JPG works
- PNG works
- WebP works
- preview works
- metadata scan works
- supported cleaning works
- download works
- cleaned output is rescanned
- before/after results work
- files remain local

## Text

- paste scanner works
- invisible Unicode detection works
- hidden-character cleaning works
- no pasted text leaves browser
- Claude limitations clearly stated

## Infrastructure

- Cloudflare Pages deployment succeeds
- no database exists
- no object storage exists
- normal image processing invokes zero server-side requests
- scanning works after internet is disconnected
- cleaning works after internet is disconnected
- downloading works after internet is disconnected
- no paid API is required

## SEO

At minimum:

```text
/
/ai-watermark-remover
/ai-watermark-checker
/chatgpt-watermark-remover
/chatgpt-watermark-checker
/claude-watermark-remover
/claude-watermark-checker
/synthid-checker
/c2pa-checker
/ai-metadata-remover
/exif-remover
```

Guides:

```text
/guides/does-claude-watermark-text
/guides/does-chatgpt-watermark-images
/guides/what-is-synthid
/guides/what-is-c2pa
/guides/c2pa-vs-synthid
```

Technical:

- sitemap works
- robots.txt works
- canonical URLs correct
- mobile responsive
- privacy page exists
- terms exist
- analytics does not contain user content

---

# 51. Development Phases

## Phase 1 — Foundation

Build:

- Astro project
- Tailwind
- design system
- homepage
- header/footer
- ToolPage
- GuidePage
- SEO configuration
- sitemap
- Cloudflare Pages deployment

**No backend.**

---

## Phase 2 — Local Image Scanner

Implement:

- drag/drop
- file picker
- JPG scanning
- PNG scanning
- WebP scanning
- normalized result model
- scanner UI
- offline-after-load test

**No server calls.**

---

## Phase 3 — Local Metadata Cleaner

Implement:

- JPEG cleaner
- PNG cleaner
- WebP cleaner
- local output Blob
- automatic rescan
- before/after
- local download

**No server calls.**

This is the first fully useful version.

---

## Phase 4 — SEO Tool Pages

Expose underlying tool through appropriate dedicated pages.

Do not fork scanner implementations.

---

## Phase 5 — Text Utility

Implement:

- paste box
- invisible Unicode scanner
- visualization
- local cleaner
- Claude limitation notice

**No LLM API.**

---

## Phase 6 — Content

Publish initial guides.

Create strong internal linking.

---

## Phase 7 — Analytics

Add Cloudflare Web Analytics.

Keep analytics privacy-safe and non-essential.

---

## Phase 8 — Advertising

Only after useful traffic exists:

- configure AdSense
- enable predefined slots
- monitor UX
- monitor Core Web Vitals

---

# 52. Future Backend Trigger

Do not introduce backend infrastructure until a specific feature requires it.

Possible future triggers:

### Verified proprietary watermark checking

If detection requires calling an authorized external verification API.

### B2B API

If customers need server-to-server scanning.

### Accounts

If paid users need saved preferences/history.

### Billing

If Pro subscriptions launch.

### Batch jobs

Only if browser processing becomes technically insufficient.

At that point, create a separate architecture decision document before introducing Workers/storage/database infrastructure.

---

# 53. Future Product Roadmap

Do NOT implement yet.

## Advanced provenance

- stronger C2PA inspection
- provider-specific provenance
- SynthID verification where legitimately available
- model-specific detectors

## Batch processing

Multiple files / ZIP.

Potential paid feature.

Prefer local processing first.

## Browser extension

Right-click:

> Inspect AI provenance

## API

Potential:

```http
POST /api/v1/inspect
```

This would be a separate paid/backend product, not part of the free client architecture.

## Additional formats

- PDF
- SVG
- AVIF
- HEIC
- audio
- video

---

# 54. Future Monetization

## Free

- individual scanning
- metadata cleaning
- educational tools
- advertising

## Pro

Potential:

```text
$5–10/month
```

Features:

- no ads
- batch processing
- larger files
- presets
- extension

## API

Usage-based.

Potential customers:

- CMS systems
- publishers
- marketplaces
- media organizations
- developers

---

# 55. Primary Product Metric

Early stage:

> **Successful tool sessions from organic search**

Successful session:

```text
organic visitor
→ selects/pastes content
→ scan completes
```

Note: recording this funnel requires custom events, which Cloudflare Web Analytics does not support (see Analytics section). Until an event system exists, use proxies: organic clicks to tool pages (Google Search Console) and tool-page views (Cloudflare Web Analytics).

Secondary:

```text
clean completion rate
download rate
pages/session
organic impressions
organic clicks
returning visitors
```

Later:

```text
page RPM
revenue/session
revenue/organic visitor
```

---

# 56. SEO Product Strategy

NoWatermark should behave like:

> **A collection of excellent utilities with authoritative educational content**

not:

> a blog with a weak tool attached.

Potential moat:

```text
useful tools
+
technical credibility
+
SEO authority
+
backlinks
+
provider-neutral provenance knowledge
+
very low cost structure
```

---

# 57. Initial Keyword Priorities

## Tier 1

```text
claude watermark
claude watermark remover
claude watermark checker
remove claude watermark
chatgpt watermark
chatgpt watermark remover
chatgpt watermark checker
AI watermark remover
AI watermark checker
```

## Tier 2

```text
SynthID
SynthID checker
SynthID remover
C2PA checker
C2PA remover
Content Credentials checker
AI metadata remover
AI image metadata
```

## Tier 3

```text
EXIF remover
metadata remover
image metadata checker
remove metadata from image
```

---

# 58. Brand/SEO Rule

Brand:

**NoWatermark**

Not:

> No Watermark AI Remover Free Online

SEO relevance should come from:

- URL
- title
- H1
- page content
- functionality
- internal links
- authority
- backlinks

Avoid keyword stuffing.

---

# 59. Recommended Homepage Metadata

Title:

> AI Watermark Checker & Metadata Remover | NoWatermark

Description:

> Check images for AI provenance, C2PA, Content Credentials and hidden metadata. Remove supported metadata privately in your browser.

H1:

> AI Watermark & Metadata Checker

Hero:

> See what your file reveals.

CTA:

> Drop an image here

Privacy:

> 🔒 Processed locally in your browser

---

# 60. Claude Implementation Instructions

Treat this PRD as the source of truth.

Implementation priorities:

1. correctness
2. privacy
3. zero-backend architecture
4. SEO
5. performance
6. simplicity
7. visual polish

When unspecified:

- choose the simplest maintainable solution
- prefer browser APIs
- avoid infrastructure
- avoid dependencies without justification
- avoid premature abstraction
- keep static pages static
- lazy-load interactive tooling

Do NOT add:

- authentication
- databases
- storage
- Workers
- Pages Functions
- subscriptions
- server uploads
- AI APIs

unless specifically required.

If Claude believes server-side processing is required, it must first document:

1. why browser processing is insufficient
2. expected traffic implications
3. Cloudflare Free-plan implications
4. alternative client-side approaches considered

Do not silently introduce backend infrastructure.

---

# 61. Library Selection Rules

Before adding any metadata/provenance library:

1. inspect maintenance status
2. inspect license
3. verify browser compatibility
4. verify bundle size
5. confirm it performs no network upload
6. test functionality empirically
7. isolate it behind an internal adapter

Do not trust package marketing claims.

---

# 61.1 Recommended Starting Libraries

Subject to the rules above:

## Reading / display

**`exifr`** — browser-friendly, tree-shakeable EXIF/XMP/IPTC/ICC parsing. Use it for extracting values to show the user.

## Cleaning

**Write our own byte-level container walkers** (JPEG segment walker, PNG chunk walker, WebP RIFF walker), driven by the strip/keep tables in Section 18.1.

The formats are simple containers; existing "strip metadata" libraries mostly recompress, don't cover all three formats, or are unmaintained. Owning the cleaner is what makes reliable no-recompression cleaning possible.

## C2PA

Presence detection via our own JUMBF/box scan (Section 16.1). The official `c2pa` JS library (WASM, large) may be lazy-loaded later for manifest detail display — evaluate bundle impact first.

## File-type detection

Magic-byte sniffing (own code, trivial). Never trust file extension or reported MIME type.

## Execution

Run all parsing and cleaning inside a Web Worker.

---

# 62. Expected Deliverables

Claude should create:

## Application

Fully working repository.

## Documentation

`README.md` with:

- installation
- development
- build
- Cloudflare deployment
- architecture
- browser-processing explanation
- supported formats
- metadata libraries
- known limitations
- zero-backend architecture rationale

## Environment

```text
.env.example
```

The core application should require **zero secrets**.

## Tests

Recommended stack: **Vitest** for unit tests (parsers/cleaners against fixture files) and **Playwright** for E2E (upload → scan → clean → download, including the offline test via `context.setOffline(true)`).

Commit small fixture images under `tests/fixtures/`, generated by a documented `exiftool` script, so expected metadata is known exactly.

Include:

- EXIF detection
- EXIF removal
- PNG metadata
- JPEG metadata
- WebP metadata
- hidden Unicode detection
- hidden Unicode removal
- before/after rescanning
- no-network processing test where feasible

## Deployment

Must successfully deploy to:

```text
https://nowatermark.fyi
```

via Cloudflare Pages.

---

# 63. Critical Technical Acceptance Rule

Core V1 file processing must generate:

> **zero file-processing network requests**

For a normal scan and clean session, DevTools Network should show no request containing:

- file contents
- image bytes
- file hashes
- metadata
- generated output

Only ordinary website assets, analytics and advertising may use the network.

---

# 64. Critical Product Acceptance Rule

At all times:

> **Never claim that a watermark has been removed unless NoWatermark can technically verify that claim.**

Example:

> Metadata cleaned successfully.

> SynthID status: Unable to verify.

---

# 65. Definition of V1

V1 should answer one question extremely well:

> **What hidden information is in this file, and which parts can I safely remove?**

And it should answer that question:

> **entirely inside the user's browser.**

That is both a product promise and an architectural requirement.
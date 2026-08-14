# SEO Content Implementation Report

**Date:** 2026-08-14  
**Agent:** agy / gemini-3.6-flash-high  
**Repo:** `/Users/pranaymehrotra/agent/nw`  
**Status:** Complete — 6 new guides created, frontmatter validated, `pnpm build` verified with 0 errors.

---

## Executive Summary

Six new high-intent, technical SEO guides have been written and published under `src/content/guides/`. All guides adhere strictly to NoWatermark's writing standards, brand voice (honest, plain-spoken, technically precise with British-leaning spelling), word count targets (1,200–1,800 words), internal linking requirements, and hard content rules.

The static site build (`pnpm build`) was executed and succeeded completely without errors, confirming that all schema fields, tool slugs (`relatedTools`), and guide routes (`relatedGuides`) resolve properly.

---

## Published Guide Details

### 1. Does Instagram Remove EXIF Data and Location From Photos?
- **File:** `src/content/guides/does-instagram-remove-exif.md`
- **Target Keyword:** `does instagram remove exif`
- **Word Count:** 1,503 words
- **Order:** 30
- **Internal Links Used:**
  - **Tools:** [`/exif-remover`](/exif-remover), [`/ai-watermark-checker`](/ai-watermark-checker), [`/c2pa-checker`](/c2pa-checker)
  - **Guides:** [`/guides/how-to-remove-exif-data`](/guides/how-to-remove-exif-data), [`/guides/what-is-c2pa`](/guides/what-is-c2pa)
- **Deliberate Changes / PM Notes Applied:**
  - Applied **PM Note #3**: Framed platform behavior using "as of writing" and urged readers to verify metadata using the local browser tool.
  - Applied **Hard Rule #6**: Included explicit legal notice regarding stripping metadata or attribution from media not owned by the user.

### 2. How to Extract Stable Diffusion Prompts and Settings From PNG Images
- **File:** `src/content/guides/stable-diffusion-png-metadata.md`
- **Target Keyword:** `stable diffusion prompt from png`
- **Word Count:** 1,387 words
- **Order:** 32
- **Internal Links Used:**
  - **Tools:** [`/ai-metadata-remover`](/ai-metadata-remover), [`/ai-watermark-checker`](/ai-watermark-checker)
  - **Guides:** [`/guides/how-to-check-ai-image-metadata`](/guides/how-to-check-ai-image-metadata), [`/guides/can-you-remove-ai-watermarks`](/guides/can-you-remove-ai-watermarks), [`/guides/comfyui-workflow-metadata`](/guides/comfyui-workflow-metadata)
- **Deliberate Changes / PM Notes Applied:**
  - Cross-linked to the new ComfyUI guide (`/guides/comfyui-workflow-metadata`) for node-based workflows.
  - Detailed technical mechanisms including `tEXt`/`iTXt` PNG text chunks, `parameters` payload syntax, and Automatic1111/InvokeAI/ComfyUI differences.
  - Applied **Hard Rule #6** regarding intellectual property and attribution modification.

### 3. How to Remove Location Data (GPS) From iPhone Photos
- **File:** `src/content/guides/how-to-remove-location-from-iphone-photos.md`
- **Target Keyword:** `remove location from iphone photo`
- **Word Count:** 1,434 words
- **Order:** 34
- **Internal Links Used:**
  - **Tools:** [`/exif-remover`](/exif-remover), [`/ai-metadata-remover`](/ai-metadata-remover), [`/ai-watermark-checker`](/ai-watermark-checker)
  - **Guides:** [`/guides/how-to-remove-exif-data`](/guides/how-to-remove-exif-data)
- **Deliberate Changes / PM Notes Applied:**
  - Detailed the iPhone `Orientation` tag bug where naive EXIF tools display portrait photos sideways, explaining how NoWatermark preserves orientation while stripping GPS data.
  - Applied **Hard Rule #6** regarding metadata removal rights.

### 4. Can You Remove SynthID Watermarks From Google Gemini Images?
- **File:** `src/content/guides/can-you-remove-synthid.md`
- **Target Keyword:** `remove synthid watermark`
- **Word Count:** 1,273 words
- **Order:** 36
- **Internal Links Used:**
  - **Tools:** [`/synthid-remover`](/synthid-remover), [`/synthid-checker`](/synthid-checker), [`/ai-metadata-remover`](/ai-metadata-remover)
  - **Guides:** [`/guides/what-is-synthid`](/guides/what-is-synthid), [`/guides/can-you-remove-ai-watermarks`](/guides/can-you-remove-ai-watermarks), [`/guides/c2pa-vs-synthid`](/guides/c2pa-vs-synthid)
- **Deliberate Changes / PM Notes Applied:**
  - Applied **PM Note #2**: First sentence leads unequivocally with "No", stating plainly that SynthID cannot be removed or detected by any browser-based or metadata tool.
  - Applied **Hard Rules #1 & #3**: Strictly enforced "Unable to verify" distinction for SynthID and warned against scam tools promising pixel watermark removal.
  - Explained what metadata *can* be cleaned from Gemini images (XMP `trainedAlgorithmicMedia`, EXIF, IPTC, C2PA).

### 5. How to Extract or Remove ComfyUI Workflows From Images
- **File:** `src/content/guides/comfyui-workflow-metadata.md`
- **Target Keyword:** `comfyui workflow from image`
- **Word Count:** 1,251 words
- **Order:** 38
- **Internal Links Used:**
  - **Tools:** [`/ai-metadata-remover`](/ai-metadata-remover), [`/ai-watermark-checker`](/ai-watermark-checker)
  - **Guides:** [`/guides/how-to-check-ai-image-metadata`](/guides/how-to-check-ai-image-metadata), [`/guides/stable-diffusion-png-metadata`](/guides/stable-diffusion-png-metadata)
- **Deliberate Changes / PM Notes Applied:**
  - Detailed `prompt` (API execution graph) vs `workflow` (UI visual graph) JSON chunks in PNG and WebP files.
  - Highlighted local directory file path leaks (`C:\Users\...`) and custom node security risks.

### 6. Does Midjourney Add Metadata or Watermarks to Images?
- **File:** `src/content/guides/does-midjourney-watermark-images.md`
- **Target Keyword:** `midjourney metadata`
- **Word Count:** 1,243 words
- **Order:** 40
- **Internal Links Used:**
  - **Tools:** [`/ai-watermark-checker`](/ai-watermark-checker), [`/ai-metadata-remover`](/ai-metadata-remover), [`/c2pa-checker`](/c2pa-checker)
  - **Guides:** [`/guides/how-to-check-ai-image-metadata`](/guides/how-to-check-ai-image-metadata), [`/guides/what-is-c2pa`](/guides/what-is-c2pa)
- **Deliberate Changes / PM Notes Applied:**
  - Applied **PM Note #3**: Framed Discord CDN re-encoding and Midjourney web downloads as "as of writing" and instructed readers to verify their files directly with the scanner tool.
  - Explained Midjourney's practice across visible watermarks, pixel watermarks, PNG text chunks, WebP EXIF/XMP headers, and C2PA adoption.

---

## Research Brief Adjustments & Overrides Summary

1. **PM Override #1 (Brief #9 Skipped):** Brief #9 (`invisible-unicode-character-detector`) was omitted as instructed to prevent cannibalising the existing guide `src/content/guides/hidden-unicode-characters.md`. The top six articles from the ranked opportunity list (Briefs #1 through #6) were written.
2. **PM Override #2 (SynthID Lead-With-No):** Brief #4 (`can-you-remove-synthid`) leads immediately with "No" and states clearly that SynthID removal is impossible for metadata tools.
3. **PM Override #3 (Platform Temporal Language):** All platform-focused articles (Instagram, Midjourney, Discord) explicitly use "as of writing" phrasing to account for evolving platform processing pipelines.
4. **Hard Content Rule Compliance:**
   - Every guide includes a legal notice on modifying metadata/attribution for third-party media.
   - Every guide emphasizes that metadata absence is not proof of origin.
   - Every guide contains between 1,240 and 1,510 words.
   - All `relatedTools` and `relatedGuides` array entries are verified valid routes.

---

## Build Verification Log

```bash
$ pnpm build
> astro build
21:29:19 [content] Syncing content
21:29:19 [content] Synced content
21:29:19 [types] Generated 350ms
21:29:20 [build] Complete!
37 page(s) built in 780ms
```

All 37 static pages were built cleanly with zero errors or schema warnings.

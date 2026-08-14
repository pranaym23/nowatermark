# Internal Linking Plan & Orphan Analysis

> **Site:** NoWatermark.fyi  
> **Goal:** Optimize internal link architecture, eliminate orphan pages, create tight topic clusters between tools and guides, and maximize topical authority.

---

## 1. Audit of Current Site Link Structure

### Current Tool Pages (13 Tools)

| Tool Page | Linked Related Tools | Linked Related Guides | Link Health & Gaps |
| :--- | :--- | :--- | :--- |
| [`/ai-watermark-checker`](file:///Users/pranaymehrotra/agent/nw/src/lib/site.ts#L54) | `/c2pa-checker`, `/synthid-checker`, `/chatgpt-watermark-checker`, `/exif-remover` | `/guides/what-is-synthid`, `/guides/what-is-c2pa`, `/guides/can-you-remove-ai-watermarks` | **Good.** High authority hub. |
| [`/ai-watermark-remover`](file:///Users/pranaymehrotra/agent/nw/src/lib/site.ts#L104) | `/ai-metadata-remover`, `/exif-remover`, `/c2pa-remover`, `/ai-watermark-checker` | `/guides/can-you-remove-ai-watermarks`, `/guides/what-is-c2pa`, `/guides/how-to-remove-exif-data` | **Good.** |
| [`/chatgpt-watermark-checker`](file:///Users/pranaymehrotra/agent/nw/src/lib/site.ts#L157) | `/chatgpt-watermark-remover`, `/c2pa-checker`, `/ai-watermark-checker`, `/content-credentials-checker` | `/guides/does-chatgpt-watermark-images`, `/guides/what-is-c2pa`, `/guides/how-to-check-ai-image-metadata` | **Good.** |
| [`/chatgpt-watermark-remover`](file:///Users/pranaymehrotra/agent/nw/src/lib/site.ts#L204) | `/chatgpt-watermark-checker`, `/ai-watermark-remover`, `/c2pa-remover`, `/ai-metadata-remover` | `/guides/does-chatgpt-watermark-images`, `/guides/can-you-remove-ai-watermarks` | **Good.** |
| [`/claude-watermark-checker`](file:///Users/pranaymehrotra/agent/nw/src/lib/site.ts#L245) | `/claude-watermark-remover`, `/ai-watermark-checker` | `/guides/does-claude-watermark-text`, `/guides/can-you-remove-ai-watermarks` | **Missing Link:** Should link to `/guides/hidden-unicode-characters`. |
| [`/claude-watermark-remover`](file:///Users/pranaymehrotra/agent/nw/src/lib/site.ts#L298) | `/claude-watermark-checker`, `/ai-watermark-remover` | `/guides/does-claude-watermark-text` | **Missing Link:** Should link to `/guides/hidden-unicode-characters`. |
| [`/synthid-checker`](file:///Users/pranaymehrotra/agent/nw/src/lib/site.ts#L338) | `/synthid-remover`, `/ai-watermark-checker`, `/c2pa-checker` | `/guides/what-is-synthid`, `/guides/c2pa-vs-synthid`, `/guides/can-you-remove-ai-watermarks` | **Good.** |
| [`/synthid-remover`](file:///Users/pranaymehrotra/agent/nw/src/lib/site.ts#L381) | `/synthid-checker`, `/ai-watermark-remover`, `/ai-metadata-remover` | `/guides/what-is-synthid`, `/guides/can-you-remove-ai-watermarks` | **Missing Link:** Should link to `/guides/c2pa-vs-synthid`. |
| [`/c2pa-checker`](file:///Users/pranaymehrotra/agent/nw/src/lib/site.ts#L438) | `/c2pa-remover`, `/content-credentials-checker`, `/ai-watermark-checker`, `/chatgpt-watermark-checker` | `/guides/what-is-c2pa`, `/guides/c2pa-vs-synthid`, `/guides/what-are-content-credentials` | **Good.** |
| [`/c2pa-remover`](file:///Users/pranaymehrotra/agent/nw/src/lib/site.ts#L493) | `/c2pa-checker`, `/ai-watermark-remover`, `/ai-metadata-remover` | `/guides/what-is-c2pa`, `/guides/what-are-content-credentials` | **Good.** |
| [`/content-credentials-checker`](file:///Users/pranaymehrotra/agent/nw/src/lib/site.ts#L534) | `/c2pa-checker`, `/c2pa-remover`, `/ai-watermark-checker` | `/guides/what-are-content-credentials`, `/guides/what-is-c2pa` | **Good.** |
| [`/ai-metadata-remover`](file:///Users/pranaymehrotra/agent/nw/src/lib/site.ts#L574) | `/exif-remover`, `/ai-watermark-remover`, `/ai-watermark-checker` | `/guides/how-to-check-ai-image-metadata`, `/guides/how-to-remove-exif-data` | **Missing Link:** Should link to proposed Stable Diffusion & ComfyUI guides. |
| [`/exif-remover`](file:///Users/pranaymehrotra/agent/nw/src/lib/site.ts#L620) | `/ai-metadata-remover`, `/ai-watermark-remover`, `/ai-watermark-checker` | `/guides/how-to-remove-exif-data`, `/guides/how-to-check-ai-image-metadata` | **Missing Link:** Should link to proposed iPhone/Mac/Instagram guides. |

---

## 2. Orphan Page Identification & Flagging

### 🚩 Critical Near-Orphan Identified: `/guides/hidden-unicode-characters`

- **Status:** **Near-Orphan**
- **Incoming Links in Codebase:**
  - **Tool Pages (`src/lib/site.ts`):** **0 tools** list `/guides/hidden-unicode-characters` in `relatedGuides`.
  - **Footer Navigation (`FOOTER_LEARN`):** Not listed in footer.
  - **Other Guides:** Only linked from [`/guides/does-claude-watermark-text`](file:///Users/pranaymehrotra/agent/nw/src/content/guides/does-claude-watermark-text.md).
- **Impact:** Low internal PageRank flow, delayed search engine indexing.
- **Remediation Plan:**
  1. Add `/guides/hidden-unicode-characters` to `relatedGuides` on both [`/claude-watermark-checker`](file:///Users/pranaymehrotra/agent/nw/src/lib/site.ts#L245) and [`/claude-watermark-remover`](file:///Users/pranaymehrotra/agent/nw/src/lib/site.ts#L298) in `src/lib/site.ts`.
  2. Cross-link from proposed brief [`/guides/invisible-unicode-character-detector`](file:///Users/pranaymehrotra/agent/nw/.seo/content-gaps.md#brief-9-how-to-detect-and-clean-invisible-unicode-characters-in-text).

---

## 3. Topic Clusters & Link Graph Strategy

We organize all tools and guides (existing + 12 proposed briefs) into **4 Primary Link Clusters**.

```
                         [ HOME PAGE / NAV ]
                                 │
    ┌────────────────┬───────────┴───────────┬────────────────┐
    ▼                ▼                       ▼                ▼
┌─────────┐    ┌──────────┐            ┌───────────┐    ┌────────────┐
│ Cluster │    │ Cluster  │            │  Cluster  │    │  Cluster   │
│    1    │    │    2     │            │     3     │    │     4      │
│   AI    │    │ C2PA &   │            │ EXIF, GPS │    │ AI Text &  │
│ Proven- │    │ Proven-  │            │ & Privacy │    │ Invisible  │
│  ance   │    │  ance    │            │ Metadata  │    │  Unicode   │
└─────────┘    └──────────┘            └───────────┘    └────────────┘
```

---

### Cluster 1: General AI Watermarks & Vendor Provenance (ChatGPT, SynthID, Midjourney)

#### Core Tools:
- `/ai-watermark-checker`
- `/ai-watermark-remover`
- `/chatgpt-watermark-checker`
- `/chatgpt-watermark-remover`
- `/synthid-checker`
- `/synthid-remover`

#### Existing Guides:
- `/guides/what-is-synthid`
- `/guides/does-chatgpt-watermark-images`
- `/guides/c2pa-vs-synthid`
- `/guides/can-you-remove-ai-watermarks`

#### Proposed Guides (Briefs):
- `/guides/can-you-remove-synthid` *(Brief #4)*
- `/guides/does-midjourney-watermark-images` *(Brief #6)*
- `/guides/dall-e-3-metadata-explained` *(Brief #10)*

#### Link Map:
- `/synthid-remover` ↔ `/guides/can-you-remove-synthid` ↔ `/guides/what-is-synthid`
- `/chatgpt-watermark-checker` ↔ `/guides/does-chatgpt-watermark-images` ↔ `/guides/dall-e-3-metadata-explained`
- `/ai-watermark-checker` ↔ `/guides/does-midjourney-watermark-images`

---

### Cluster 2: C2PA, Content Credentials & Industry Standards

#### Core Tools:
- `/c2pa-checker`
- `/c2pa-remover`
- `/content-credentials-checker`

#### Existing Guides:
- `/guides/what-is-c2pa`
- `/guides/what-are-content-credentials`
- `/guides/c2pa-vs-synthid`

#### Proposed Guides (Briefs):
- `/guides/what-is-iptc-digitalsourcetype` *(Brief #11)*

#### Link Map:
- `/c2pa-checker` ↔ `/guides/what-is-c2pa` ↔ `/guides/what-are-content-credentials`
- `/c2pa-checker` ↔ `/guides/what-is-iptc-digitalsourcetype`

---

### Cluster 3: EXIF, GPS, Social Platforms & Local OS Workflows

#### Core Tools:
- `/exif-remover`
- `/ai-metadata-remover`

#### Existing Guides:
- `/guides/how-to-remove-exif-data`
- `/guides/how-to-check-ai-image-metadata`

#### Proposed Guides (Briefs):
- `/guides/does-instagram-remove-exif` *(Brief #1)*
- `/guides/stable-diffusion-png-metadata` *(Brief #2)*
- `/guides/how-to-remove-location-from-iphone-photos` *(Brief #3)*
- `/guides/comfyui-workflow-metadata` *(Brief #5)*
- `/guides/does-discord-remove-exif` *(Brief #7)*
- `/guides/how-to-remove-exif-data-mac` *(Brief #8)*
- `/guides/does-twitter-remove-exif` *(Brief #12)*

#### Link Map:
- `/exif-remover` ↔ `/guides/how-to-remove-exif-data`
- `/exif-remover` ↔ `/guides/does-instagram-remove-exif` ↔ `/guides/does-discord-remove-exif` ↔ `/guides/does-twitter-remove-exif`
- `/exif-remover` ↔ `/guides/how-to-remove-location-from-iphone-photos` ↔ `/guides/how-to-remove-exif-data-mac`
- `/ai-metadata-remover` ↔ `/guides/stable-diffusion-png-metadata` ↔ `/guides/comfyui-workflow-metadata`

---

### Cluster 4: AI Text, Invisible Unicode & Cleaners

#### Core Tools:
- `/claude-watermark-checker`
- `/claude-watermark-remover`

#### Existing Guides:
- `/guides/does-claude-watermark-text`
- `/guides/hidden-unicode-characters` *(Rescued Near-Orphan)*

#### Proposed Guides (Briefs):
- `/guides/invisible-unicode-character-detector` *(Brief #9)*

#### Link Map:
- `/claude-watermark-checker` ↔ `/guides/does-claude-watermark-text`
- `/claude-watermark-checker` ↔ `/guides/hidden-unicode-characters`
- `/claude-watermark-checker` ↔ `/guides/invisible-unicode-character-detector`

---

## 4. Navigation & Footer Link Expansion Recommendations

To ensure optimal PageRank distribution to high-opportunity guides and tools:

### Footer Learn Section (`FOOTER_LEARN` in `src/lib/site.ts`)
**Current:**
1. What is SynthID?
2. What is C2PA?
3. Does ChatGPT watermark images?
4. Does Claude watermark text?

**Recommended Addition:**
5. Does Instagram remove EXIF? (`/guides/does-instagram-remove-exif`)
6. Remove iPhone photo location (`/guides/how-to-remove-location-from-iphone-photos`)
7. Hidden Unicode characters (`/guides/hidden-unicode-characters`)

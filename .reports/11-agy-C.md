---
title: What is IPTC Digital Source Type?
metaTitle: 'What is IPTC Digital Source Type? | NoWatermark'
description: Learn how the IPTC Digital Source Type metadata vocabulary tags AI media with trainedAlgorithmicMedia, where it is stored in XMP, and what its limits are.
summary: An explanation of IPTC Digital Source Type metadata, how trainedAlgorithmicMedia tags AI images in XMP packets, and why presence does not equal proof.
publishDate: 2026-08-15
author: NoWatermark
contentType: guide
cluster: provenance-standards
order: 50
relatedTools: ['/ai-watermark-checker', '/ai-metadata-remover', '/c2pa-checker']
relatedGuides: ['/guides/what-is-c2pa', '/guides/how-to-check-ai-image-metadata']
sources:
  - title: IPTC NewsCodes — Digital Source Type
    url: https://cv.iptc.org/newscodes/digitalsourcetype/
    accessed: 2026-08-15
  - title: IPTC Photo Metadata Standard
    url: https://iptc.org/standards/photo-metadata/iptc-standard/
    accessed: 2026-08-15
faq:
  - q: What is IPTC Digital Source Type?
    a: IPTC Digital Source Type is a controlled metadata vocabulary that identifies how a media file came into existence. It specifies the creation method rather than the creator, distinguishing between camera captures, edits, and algorithmic generation. The values are published as part of the IPTC NewsCodes vocabulary and stored inside ordinary metadata containers.
  - q: What does trainedAlgorithmicMedia mean?
    a: The value trainedAlgorithmicMedia is the IPTC Digital Source Type identifier used for media produced by a generative AI model. It indicates that the image or file was synthesised using algorithmic models trained on data. It is a self-reported label written into the file's metadata by the software that created it.
  - q: Can IPTC Digital Source Type metadata be removed?
    a: Yes. Because IPTC Digital Source Type is stored inside ordinary XMP metadata blocks, it can be stripped by metadata removal tools or standard image re-encoding. Stripping this metadata removes the label from your local copy of the file, which can be confirmed by re-scanning the cleaned output. However, removing it does not alter pixel-level watermarks or any records stored on a remote server.
  - q: Does the absence of trainedAlgorithmicMedia mean an image is not AI-generated?
    a: No. The absence of trainedAlgorithmicMedia only proves that the specific metadata tag is not present in the file. A generator may choose not to write the tag, or subsequent editing, social platforms, and screenshots may strip the metadata. The tag is useful as a declaration of AI origin when present, but its absence provides no proof that a file was made by a human.
---

IPTC Digital Source Type is a standardised metadata vocabulary used to record how a piece of media came into existence. Maintained by the International Press Telecommunications Council (IPTC) as an IPTC NewsCodes vocabulary, it defines a controlled list of terms to distinguish media captured directly by a camera from composited artwork, edited photographs, and content produced by generative artificial intelligence.

The structure is designed to answer a single question: *how was this file made?* It does not declare *who* made the file, assign copyright ownership, or assess image quality. Instead, it provides software tools, publishers, and archival systems with a uniform way to categorise the technical origin of visual media.

## The trainedAlgorithmicMedia identifier

Within the IPTC Digital Source Type vocabulary, the specific identifier assigned to media created by generative artificial intelligence models is `trainedAlgorithmicMedia`.

When an application outputs an image synthesised by an AI model, it can write `trainedAlgorithmicMedia` into the file's metadata container. This term explicitly distinguishes algorithmic generation from other standard IPTC source types, such as original photographic captures taken with a physical sensor or human-made digital illustrations.

The key characteristic of `trainedAlgorithmicMedia` is that it is a self-reported label. It exists in an image only because the software that created the file chose to write that specific entry into the metadata header. It is not derived from an automated scan of the pixels, nor does it represent an algorithmic measurement of visual patterns. It is an honest declaration authored by the generating pipeline at the moment of creation.

NoWatermark has not tested which specific commercial tools or generative software products actively write this tag into their outputs. The standard exists as an open specification for any tool to adopt, but whether an individual software package implements it remains entirely at the discretion of its developers.

## Where the metadata lives inside a file

IPTC photo metadata, including Digital Source Type fields, is stored inside an Extensible Metadata Platform (XMP) packet.

XMP is an ISO standard data structure embedded directly inside standard image containers, including JPEG, PNG, and WebP files. In a JPEG file, XMP data is typically stored within an `APP1` marker segment. In a PNG file, it is contained in a text chunk, and in a WebP file, it resides in a dedicated RIFF chunk.

Inside the XMP packet, the Digital Source Type property is written as a structured URI referencing the IPTC NewsCodes vocabulary. A parser reading the file inspects this packet, extracts the property, and reads the assigned value.

Because an XMP packet is an ordinary data block embedded within the file container, it can be read by standard inspection utilities, such as our [AI Watermark Checker](/ai-watermark-checker). If you want to understand how other generator tags and structural headers are laid out across various file formats, see our [guide on checking AI image metadata](/guides/how-to-check-ai-image-metadata).

In addition to standalone XMP packets, Digital Source Type values can also appear inside Coalition for Content Provenance and Authenticity (C2PA) manifests. In a C2PA implementation, `trainedAlgorithmicMedia` is recorded as an assertion within a signed provenance structure. While both formats use the same IPTC vocabulary term, a C2PA manifest binds the assertion cryptographically to a signing certificate, creating a distinct record with different structural durability. For a complete technical breakdown of how manifests operate, consult our [guide to C2PA](/guides/what-is-c2pa) or test your files with our browser-based [C2PA Checker](/c2pa-checker).

## Three separate layers of provenance

When assessing visual media for AI provenance signals, it is essential to distinguish between three completely different mechanisms: metadata, pixel watermarks, and server-side provenance records.

```
+-------------------------------------------------------------------------+
| THREE DISTINCT PROVENANCE MECHANISMS                                    |
+-------------------------------------------------------------------------+
| 1. Metadata (XMP / IPTC)                                                |
|    - Standard data blocks (e.g. trainedAlgorithmicMedia in XMP)          |
|    - Removable locally; confirmed absent by re-scanning the output file |
+-------------------------------------------------------------------------+
| 2. Pixel or Statistical Watermarks (e.g. SynthID)                       |
|    - Embedded mathematically into pixel values or generation matrices   |
|    - Cannot be detected by local tools; status: "unable to verify"      |
+-------------------------------------------------------------------------+
| 3. Server-Side Provenance                                               |
|    - Remote fingerprints and records stored in a provider's database    |
|    - Completely unaffected by any local file edits or metadata removal  |
+-------------------------------------------------------------------------+
```

### 1. Metadata

Metadata consists of structured text and data blocks written into the file container. IPTC Digital Source Type, EXIF camera tags, PNG text chunks, and standalone XMP packets all belong to this category.

Because metadata sits alongside the image data rather than inside the pixel matrix, it can be read, modified, or stripped entirely without re-encoding or altering the compressed image bytes. When metadata is removed using a local tool like our [AI Metadata Remover](/ai-metadata-remover), the removal can be positively confirmed by re-scanning the cleaned file.

### 2. Pixel or statistical watermarks

Pixel-level watermarks, such as Google's SynthID, work on an entirely different principle. Instead of writing text fields to an XMP header, these systems alter the distribution of pixel values or modify generation math during the synthesis process.

These patterns do not sit in the file header. They are part of the image data itself. Browser-side and local utilities cannot detect these signals or verify their absence. When evaluating statistical or pixel-level watermarks, NoWatermark always reports the status as "unable to verify". We decline to claim an image is clear of pixel watermarks because verifying their presence requires the proprietary detection service held by the model provider.

### 3. Server-side provenance

Server-side provenance relies on external databases managed by generation platforms or provenance networks. When an image is created, the service may compute an image hash or perceptual fingerprint and store it in its own private database alongside generation records.

Even if an image has every byte of metadata stripped, a remote platform holding the perceptual fingerprint can still recognise the file upon re-upload. No local tool, metadata editor, or file cleaner can alter, delete, or affect a record held on someone else's server.

Understanding these three layers makes it clear what IPTC Digital Source Type is: it is purely Layer 1 (metadata).

## What Digital Source Type can and cannot tell you

Because `trainedAlgorithmicMedia` is an ordinary metadata label, understanding its practical utility requires understanding its boundaries.

### When the label is present

If an image contains the `trainedAlgorithmicMedia` value in its XMP packet, you know that an application involved in creating or exporting the file explicitly declared it as synthetic. It provides a direct, standardised indication that the file was produced by an artificial intelligence model.

For publishers, archival platforms, and content evaluators, this offers a structured, machine-readable declaration without needing heuristic guesswork or statistical estimation.

### When the label is absent

If an image lacks the `trainedAlgorithmicMedia` tag, that absence **does not prove** that the image is human-made or authentic.

There are several straightforward reasons why an AI-generated file might not carry the tag:

1. **The creator application never wrote it.** Many AI generation tools, custom scripts, and open-source models do not populate IPTC metadata fields.
2. **Intermediate software stripped the metadata.** Many image editors, file converters, and operating system utilities discard non-essential XMP packets during resaving or export.
3. **Web platforms re-encoded the file.** The vast majority of social media networks, messaging applications, and content delivery networks strip metadata blocks on upload to reduce bandwidth or protect user privacy.
4. **The image was captured via screenshot.** Taking a screenshot captures raw display pixels, discarding every metadata header, XMP block, and container tag from the original file.

For these reasons, the absence of `trainedAlgorithmicMedia` means only that the tag was not found. Treating a missing tag as proof of human authorship is a fundamental misunderstanding of how file metadata operates.

## Detecting and removing IPTC metadata

Checking for IPTC Digital Source Type metadata can be done directly in your browser without uploading your files to any remote server.

Our [AI Watermark Checker](/ai-watermark-checker) inspects the internal container structure of your image, locates the XMP packet, and reads any populated IPTC fields. If `trainedAlgorithmicMedia` or other Digital Source Type identifiers are found, the scanner displays the exact field and its raw value.

If you need to remove IPTC metadata from an image, our [AI Metadata Remover](/ai-metadata-remover) reconstructs the file container to omit XMP packets, EXIF blocks, and custom generator chunks. Because the tool rewrites the container and copies the compressed image data byte-for-byte, it removes the metadata without recompressing the picture or altering image quality.

Crucially, whenever metadata is stripped, the removal must always be confirmed by re-scanning the output file to verify that the target records are no longer present in the container.

Cleaning the metadata removes the `trainedAlgorithmicMedia` tag from your local copy of the file. However, as noted above, removing metadata:
- Does **not** alter the underlying pixels of the image.
- Does **not** remove or affect pixel-level or statistical watermarks such as SynthID (which remain permanently "unable to verify").
- Does **not** modify or delete any server-side provenance records or database fingerprints maintained by the original generator.

## Summary of limits

IPTC Digital Source Type provides an open, standardised vocabulary for declaring how media was created. Its role in the modern media ecosystem is straightforward:

- It is a controlled vocabulary defining terms like `trainedAlgorithmicMedia` for generative artificial intelligence.
- It is stored as standard text in XMP packets embedded in JPEG, PNG, and WebP containers, as well as in C2PA assertions.
- It is a self-reported label, not an empirical measurement of image pixels.
- It can be detected, inspected, and stripped locally as ordinary metadata, with removal confirmed by re-scanning the cleaned file.
- It has no effect on pixel-level watermarks or remote server-side provenance records.
- Its presence confirms a declaration of AI origin; its absence proves nothing.

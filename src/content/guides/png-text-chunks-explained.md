---
title: 'PNG text chunks explained: how metadata is stored and removed'
metaTitle: 'PNG Text Chunks Explained | NoWatermark'
description: PNG images store prompts, timestamps, and metadata inside tEXt, zTXt, and iTXt chunks. Learn how chunk structures work and how to safely clean them.
summary: An explanation of PNG chunk architecture, how text and metadata chunks store ancillary data, and how to strip them without altering image pixels.
publishDate: 2026-08-15
author: NoWatermark
contentType: guide
cluster: format-workflows
order: 50
relatedTools: ['/ai-metadata-remover', '/ai-watermark-checker']
relatedGuides: ['/guides/stable-diffusion-png-metadata', '/guides/comfyui-workflow-metadata', '/guides/how-to-check-ai-image-metadata']
sources: []
faq:
  - q: What are PNG text chunks?
    a: PNG text chunks are structured blocks within a PNG file that store textual information such as keywords, modification notes, or embedded metadata packets. They exist in three forms — uncompressed Latin-1 `tEXt`, compressed Latin-1 `zTXt`, and international UTF-8 `iTXt`.
  - q: Does stripping PNG metadata affect image quality?
    a: No, stripping ancillary text chunks does not alter image quality because the compressed picture data and colour profiles are preserved without recompression. Cleaning simply drops the non-essential chunks and copies the image data byte for byte.
  - q: Why do AI tools store generation prompts in PNG text chunks?
    a: Image-generation software uses PNG text chunks because they provide a standardized, flexible location to embed arbitrary strings like prompts and generation parameters. This textual data travels alongside the image until an application or cleaning tool deliberately removes it.
---

PNG text chunks are dedicated data blocks inside a PNG file designed to store textual information, keywords, and embedded metadata without modifying the visible image. A Portable Network Graphics (PNG) file is structured as a sequential series of typed chunks, allowing applications to attach descriptive parameters, software records, and workflow data directly to the image container.

Understanding how PNG chunks function is essential for anyone inspecting file contents or seeking to remove sensitive embedded information. Many image-generation systems and graphic design applications rely heavily on PNG text chunks to record generation prompts, software configurations, timestamps, and provenance manifests. Because these chunks are independent of the compressed pixel data, they can be inspected and stripped entirely without degrading visual quality.

---

## The architecture of a PNG file

A PNG file is not a single contiguous block of pixels; it is a stream of discrete, typed segments known as chunks. Every PNG file begins with a standard eight-byte signature that identifies the file format, followed immediately by a sequence of chunks that contain either core rendering instructions or ancillary information.

Each individual chunk adheres to a strict four-part binary structure:

1. **Length**: A four-byte unsigned integer indicating the exact byte length of the chunk's data field.
2. **Chunk type**: A four-character ASCII name (such as `IHDR`, `IDAT`, or `tEXt`) defining the purpose of the chunk.
3. **Chunk data**: The payload bytes appropriate to the chunk type, matching the length specified in the length field.
4. **CRC (Cyclic Redundancy Check)**: A four-byte check value calculated over the chunk type and data fields to detect file corruption.

PNG chunks fall into two primary functional categories: **critical chunks** and **ancillary chunks**.

```
+-------------------------------------------------------------+
|                     PNG Chunk Structure                     |
+-----------------+------------------+---------------+--------+
| Length (4 bytes)| Type (4 chars)   | Data (N bytes)| CRC    |
+-----------------+------------------+---------------+--------+
```

### Critical chunks versus ancillary chunks

Critical chunks are strictly required for an image viewer or browser to display the file. If an application encounters an unrecognised critical chunk, it cannot render the image. Standard critical chunks include the image header (`IHDR`), which defines dimensions and colour depth, the palette table (`PLTE`) for indexed images, the image data chunks (`IDAT`) containing compressed pixel information, and the image trailer (`IEND`), which marks the end of the file.

Ancillary chunks, by contrast, carry optional metadata that is not required to display the picture. Conforming PNG decoders can safely ignore ancillary chunks if they do not recognise them or choose not to process them. Text chunks, modification timestamps, colour profiles, and digital signatures are all ancillary chunks. Because ancillary chunks are modular, they can be inserted, inspected, modified, or removed without corrupting the underlying image data.

---

## The three types of PNG text chunks

The PNG specification defines three distinct chunk types for embedding textual metadata: `tEXt`, `zTXt`, and `iTXt`. Each format serves a specific purpose regarding character encoding and data compression.

| Chunk type | Name | Character encoding | Compression | Primary use case |
|---|---|---|---|---|
| `tEXt` | Textual data | Latin-1 (ISO/IEC 8859-1) | Uncompressed | Short, plain text keyword-value pairs |
| `zTXt` | Compressed textual data | Latin-1 (ISO/IEC 8859-1) | Deflate/zlib compressed | Larger text blocks, settings, and logs |
| `iTXt` | International textual data | UTF-8 | Optional deflate compression | Multilingual text, UTF-8 strings, and XMP packets |

### 1. The `tEXt` chunk

The `tEXt` chunk represents the simplest method for storing text in a PNG file. It consists of a Latin-1 keyword, followed by a null separator byte (a zero byte), and the uncompressed text string associated with that keyword. 

Keywords in `tEXt` chunks are generally short identifier strings (such as `Title`, `Author`, `Description`, or `Comment`). Because `tEXt` chunks do not support compression or multi-byte character sets, they are typically limited to relatively brief passages using the Latin-1 character set.

### 2. The `zTXt` chunk

The `zTXt` chunk functions identically to the `tEXt` chunk in terms of character encoding and keyword-value pairing, but it compresses the text payload using standard deflate compression.

A `zTXt` chunk contains a Latin-1 keyword, a null separator byte, a compression method indicator byte, and the compressed text stream. This chunk type is particularly useful when software applications need to store extensive blocks of text, configuration profiles, or multi-line parameter lists without unnecessarily inflating the file size.

### 3. The `iTXt` chunk

The `iTXt` (International Text) chunk extends textual storage to the global UTF-8 character encoding and provides flexible compression options. 

An `iTXt` chunk contains:
- A UTF-8 keyword
- A null separator byte
- A compression flag indicating whether the text payload is compressed
- A compression method byte
- An optional language tag string
- A translated keyword string
- A null separator byte
- The text payload (in uncompressed UTF-8 or compressed deflate format)

Because `iTXt` supports full UTF-8 and optional compression, it is the standard carrier for embedding Extensible Metadata Platform (XMP) packets within PNG files. Applications that write structured XML/RDF metadata into PNG containers place the entire serialised XMP schema inside an `iTXt` chunk using the keyword `XML:com.adobe.xmp`.

---

## Why image generators and software use PNG text chunks

PNG text chunks provide an open, standardized mechanism for software to record contextual parameters alongside an image. For generative AI platforms, creative suites, and workflow automation tools, text chunks offer an effortless way to attach arbitrary strings directly to exported assets.

When an AI image generator produces a PNG, it frequently stores the input prompt, negative prompt, seed values, model identifiers, sampling settings, and complete workflow graphs within `tEXt`, `zTXt`, or `iTXt` chunks. For a deeper look at workflow parameters in specific environments, read our guides on [Stable Diffusion PNG metadata](/guides/stable-diffusion-png-metadata) and [ComfyUI workflow metadata](/guides/comfyui-workflow-metadata).

Because text chunks are embedded directly within the container, this metadata persists when the file is copied, archived, or shared via methods that transfer the raw file intact. However, because metadata is completely separate from the image pixels, it remains fragile: third-party platforms that re-encode images routinely drop ancillary chunks during processing.

---

## Other ancillary chunks that store metadata

Text chunks are not the only ancillary chunks that hold descriptive information. PNG files often contain other specialized chunks that carry provenance, timestamps, or device parameters:

- **`eXIf`**: Holds raw Exchangeable Image File Format (EXIF) metadata, including camera settings, software tags, and geolocation coordinates.
- **`tIME`**: Records the timestamp of the last image modification, stored as year, month, day, hour, minute, and second.
- **`caBX`**: Stores C2PA (Coalition for Content Provenance and Authenticity) manifests in JUMBF format, providing signed provenance and digital source declarations.
- **`dSIG`**: Holds digital signature data applied to authenticate the file.

---

## Critical chunks and image fidelity: what must remain

When cleaning metadata from a PNG file, not all ancillary data should be discarded. A precise metadata stripper must distinguish between non-essential metadata and chunks that dictate how an image is rendered.

```
+--------------------------------------------------------------------------+
|                        PNG Container Processing                          |
+--------------------------------------------------------------------------+
|  STRIPPED ANCILLARY CHUNKS       |  PRESERVED CRITICAL & COLOUR DATA     |
|  - tEXt (Plain text)             |  - IHDR (Header & dimensions)         |
|  - zTXt (Compressed text)        |  - PLTE (Palette, if applicable)      |
|  - iTXt (UTF-8 text & XMP)       |  - IDAT (Compressed pixel data)       |
|  - eXIf (EXIF metadata)          |  - iCCP (Embedded ICC colour profile) |
|  - tIME (Modification time)      |  - IEND (Trailer)                     |
|  - caBX (C2PA / JUMBF manifests) |                                       |
|  - dSIG (Digital signatures)     |                                       |
+----------------------------------+---------------------------------------+
```

When [NoWatermark](/ai-metadata-remover) cleans a PNG file, it explicitly strips the following chunk types:
- `tEXt`
- `zTXt`
- `iTXt`
- `eXIf`
- `tIME`
- `caBX`
- `dSIG`

Crucially, the cleaning process does **not** touch the chunks that make the picture: the header (`IHDR`), the palette (`PLTE`), the raw compressed image data (`IDAT`), the file trailer (`IEND`), or the embedded ICC colour profile (`iCCP`). 

Preserving the ICC colour profile is an intentional design choice. Removing an embedded colour profile strips the colour space definitions needed to render tones accurately, causing the image to appear washed out or oversaturated depending on the viewing display. By keeping the colour profile and copying the compressed image data byte for byte, the picture remains visually identical and bit-for-bit unchanged.

---

## How safe metadata stripping works

Traditional image editing tools often "clean" an image by opening it in an internal canvas and re-exporting it as a new file. This re-encoding approach is destructive: it decodes the image, runs it through a compression algorithm again, and introduces compression artefacts or alterations in colour values.

Safe metadata cleaning operates at the container level:

1. **Parsing chunk boundaries**: The cleaner reads the PNG header and iterates through each chunk by evaluating its length, type, payload, and CRC.
2. **Filtering metadata chunks**: Chunks matching `tEXt`, `zTXt`, `iTXt`, `eXIf`, `tIME`, `caBX`, or `dSIG` are excluded from the output stream.
3. **Byte-for-byte stream copying**: The critical image chunks and colour profiles are copied directly into the new file container without decoding or recompressing the pixel streams.
4. **Verifying by re-scanning**: The resulting file is scanned a second time to verify that targeted chunks were completely dropped and that the image stream remains structurally intact.

Because non-essential chunks are omitted while the compressed image data remains unaltered, the resulting file is smaller and the visual rendering is identical to the original.

To inspect how different formats are handled across our tools, review our complete [capability matrix](/capabilities), or consult our guide on [how to check AI image metadata](/guides/how-to-check-ai-image-metadata).

---

## Understanding the boundaries: metadata versus watermarks

When managing image privacy and provenance, it is vital to distinguish between three distinct concepts:

```
+-------------------------------------------------------------------------------+
|                           Three Layers of Provenance                          |
+-------------------------+----------------------------+------------------------+
| 1. Container Metadata   | 2. Pixel Watermarks        | 3. Server Provenance   |
+-------------------------+----------------------------+------------------------+
| tEXt, iTXt, EXIF, C2PA  | Statistical / SynthID      | Provider databases     |
| Removable in container  | Permanent / In pixels      | Stored on remote host  |
| Confirmed by re-scan    | Unable to verify           | Untouched by local ops |
+-------------------------+----------------------------+------------------------+
```

1. **Container metadata (Removable)**: Information stored in structured chunks like `tEXt`, `zTXt`, `iTXt`, `eXIf`, and `caBX`. This data lives purely in the container headers. It can be fully removed locally, and removal can be confirmed by re-scanning the cleaned file.
2. **Pixel or statistical watermarks (Unable to verify)**: Algorithmic watermarks (such as SynthID or high-frequency pixel modifications) embedded directly into the visual pixel values. These modifications cannot be confirmed absent or removed by rewriting file containers; their status remains permanently "unable to verify".
3. **Server-side provenance (External records)**: Records, hashes, or audit logs stored on an external provider's private servers. Stripping metadata from a local file copy has no effect on records maintained in a remote database.

---

## How to check and clean PNG files locally

You can inspect and remove PNG text chunks using NoWatermark's privacy-focused tools:

1. **Inspect the file**: Open the [AI watermark checker](/ai-watermark-checker) to scan the PNG container. The tool parses chunk headers, identifies embedded `tEXt`, `zTXt`, or `iTXt` chunks, and checks for `eXIf` and `caBX` provenance data.
2. **Strip metadata**: Use the [AI metadata remover](/ai-metadata-remover) to drop metadata chunks while preserving the image data and ICC colour profiles.
3. **Verify locally**: The application automatically re-scans the cleaned output file, diffing the remaining chunks against the original to confirm removal.

All processing occurs entirely within your browser using client-side JavaScript. No file is ever uploaded to a remote server, there is no upload endpoint, and no file data is stored.

---

## Summary

PNG text chunks (`tEXt`, `zTXt`, and `iTXt`) provide a versatile method for storing text, workflow records, and XMP metadata directly inside an image file. Because these chunks are ancillary, they can be removed alongside `eXIf`, `tIME`, `caBX`, and `dSIG` chunks without affecting the underlying picture data or colour profiles. 

Cleaning a PNG at the container level ensures that sensitive prompts and metadata are stripped cleanly while preserving visual quality bit for bit.

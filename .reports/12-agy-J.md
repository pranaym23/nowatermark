---
title: What is JUMBF and how does it store C2PA manifests?
metaTitle: 'What Is JUMBF? Metadata Boxes Explained | NoWatermark'
description: Learn what JUMBF is, how it packages C2PA provenance manifests across file formats, and why structural detection avoids false matches in images and PDFs.
summary: An explanation of the JPEG Universal Metadata Box Format, how JUMBF houses C2PA manifests across binary containers, and why parsing box hierarchies matters.
publishDate: 2026-08-15
author: NoWatermark
contentType: guide
cluster: provenance-standards
order: 50
relatedTools: ['/c2pa-checker', '/content-credentials-checker', '/c2pa-remover']
relatedGuides: ['/guides/what-is-c2pa', '/guides/what-are-content-credentials', '/guides/pdf-metadata-hides-in-old-revisions']
sources: []
faq:
  - q: What is JUMBF used for?
    a: JUMBF is a binary container format used to embed C2PA provenance manifests and Content Credentials inside media files. It wraps assertions, cryptographic signatures, and metadata into structured boxes across different image and document formats.
  - q: Where is JUMBF data stored inside image files?
    a: JUMBF payloads are embedded in format-specific metadata containers. They are stored in APP11 segments in JPEG files, caBX chunks in PNG files, dedicated chunks in WebP files, and associated file streams in PDF documents.
  - q: Does detecting a JUMBF box prove a file is authentic?
    a: No, detecting a JUMBF box only confirms that a provenance container is present. Because client-side tools like NoWatermark do not verify cryptographic signatures, manifests are reported as present rather than valid.
  - q: Can JUMBF metadata be removed from a file?
    a: Yes, JUMBF is standard file metadata that can be removed by stripping its containing chunks or segments. In supported image formats, cleaning rewrites the file container to drop the metadata while preserving picture data byte for byte.
---

JUMBF (JPEG Universal Metadata Box Format) is a standardised binary container format used to embed C2PA provenance manifests and Content Credentials inside media files. It organises complex metadata into a hierarchy of nested, typed structures called boxes, adapted from the ISO base media file format.

When digital cameras, editing suites, or generative models attach provenance records to an asset, they do not simply append raw text to the file. Instead, they package assertions, thumbnails, edit histories, and digital signatures into JUMBF structures. Understanding how JUMBF works is essential for anyone inspecting provenance metadata, debugging file pipelines, or managing the privacy of their media files.

To understand digital provenance, one must always distinguish three completely separate mechanisms:
1. **Metadata**: Structured headers, chunks, and container boxes (such as EXIF, XMP, and JUMBF) that travel inside the file container. Metadata is fully detectable, removable, and confirmed absent by re-scanning the cleaned file.
2. **Pixel or statistical watermarks**: Patterns embedded directly into pixel values or mathematical token probabilities (such as SynthID). These remain permanently in an "unable to verify" state because no client-side tool can guarantee their absence.
3. **Server-side provenance**: Records, hashes, and audit logs stored on a service provider's private infrastructure. No local tool or container modification can reach or alter a remote database.

JUMBF belongs entirely to the first category: it is structured container metadata.

---

## The architecture of a JUMBF box

JUMBF borrows its structural design from the ISO base media file format, which has long been used in media streaming containers. Rather than relying on unstructured binary blobs or freeform XML strings, JUMBF defines a rigid, modular format based on elementary units known as **boxes**.

Every standard JUMBF box follows a strict three-part binary layout:

| Field | Size | Description |
|---|---|---|
| **Box Length** | 4 bytes | A 32-bit big-endian unsigned integer defining the total byte length of the box, including the header. |
| **Box Type** | 4 bytes | A 4-character ASCII sequence identifying the purpose and payload type of the box. |
| **Box Payload** | Variable | The internal payload data or child boxes defined by the length field. |

Because the length is written as a four-byte big-endian integer at the very beginning of the header, any parser can determine exactly how many bytes to read or skip to reach the next box in the sequence.

### Superboxes and the description box requirement

In JUMBF, complex data structures are constructed using **superboxes**. A superbox is simply a box whose payload consists entirely of other child boxes. 

A JUMBF superbox uses the box type `jumb`. Inside any `jumb` superbox, the format enforces a strict structural rule:
- **The very first child box must always be a description box of type `jumd`.**

The `jumd` description box acts as a manifest header for the superbox. It defines the payload type, label, tracking identifiers, and category of the data contained in the subsequent sibling boxes within the `jumb` wrapper. If a parser encounters a `jumb` container where the first child is anything other than a `jumd` box, the structure is invalid according to the specification.

Following the initial `jumd` description box, a `jumb` superbox can house various child boxes carrying JSON payloads, CBOR assertions, embedded thumbnails, cryptographic hashes, or nested sub-superboxes.

---

## Where JUMBF payloads live across file formats

Different file formats store metadata in different ways. Because JUMBF is a universal metadata packaging format, it is designed to be embedded within the native metadata carrier of each host file format. 

When you inspect an image or document using our [C2PA checker](/c2pa-checker) or [Content Credentials checker](/content-credentials-checker), the parser looks for JUMBF containers inside specific format locations:

| File Format | JUMBF Carrier Location | Mechanism |
|---|---|---|
| **JPEG** | `APP11` Marker Segment | Stored inside one or more application marker segments dedicated to JUMBF payloads. |
| **PNG** | `caBX` Chunk | Packaged inside an ancillary `caBX` chunk alongside standard PNG chunk streams. |
| **WebP** | Dedicated Chunk | Stored in a specialised container chunk defined for provenance payloads. |
| **PDF** | Associated File Stream | Embedded as an associated file declared in the PDF object graph with `/AFRelationship /C2PA_Manifest`. |

In image containers like JPEG, PNG, and WebP, the JUMBF payload sits alongside other metadata carriers such as EXIF and XMP. For more details on overall metadata architecture, see our guide on [what C2PA is](/guides/what-is-c2pa) and our overview of [Content Credentials](/guides/what-are-content-credentials).

---

## The danger of naive detection: Why structural parsing matters

Detecting JUMBF payloads requires precise structural validation rather than simple text searching. Many basic metadata scanners make the mistake of searching raw file bytes for ASCII strings like `"jumb"` or `"c2pa"`. This naive approach causes severe false positives.

Four ASCII characters do not constitute a reliable signature. A plain four-character string can appear inside a file for completely benign reasons:
- A technical document, research paper, or blog article in PDF format might discuss Content Credentials, containing the words "c2pa" or "jumb" repeatedly throughout its text.
- A compressed image or font stream inside a file can easily generate the byte sequence `0x6A 0x75 0x6D 0x62` (`jumb`) purely by mathematical coincidence.

### The NoWatermark PDF detection case study

Our own scanner design illustrates why structural verification is necessary. In earlier internal revisions, NoWatermark checked for C2PA provenance in PDF files by searching the raw byte stream for the strings `jumb` or `c2pa`. During testing, this naive method produced false positive detections on ordinary PDF documents that merely discussed provenance standards in their written text, as well as documents containing random compressed streams matching the character sequence.

To eliminate false positives entirely, NoWatermark replaced string matching with strict structural parsing. The PDF inspection engine now enforces three independent constraints simultaneously:

1. **Plausible Length**: The parser reads the candidate header and verifies that the four-byte big-endian integer defines a plausible, consistent box length that does not exceed the bounds of the surrounding stream.
2. **Superbox and Description Box Hierarchy**: The parser verifies that the outer container is an authentic `jumb` superbox whose very first child box is structurally valid and typed as a `jumd` description box.
3. **Object Graph Association**: The parser inspects the PDF object graph to confirm that the stream is formally declared as an associated file with the dictionary key `/AFRelationship /C2PA_Manifest`.

By requiring all three structural conditions to be satisfied, the scanner confirms the genuine presence of a C2PA manifest rather than an accidental string match. For an in-depth look at PDF metadata complexity, read our guide on how [PDF metadata hides in old revisions](/guides/pdf-metadata-hides-in-old-revisions).

---

## Detection boundaries: Presence versus validity

When inspecting a file that contains JUMBF payloads, it is vital to understand what a scanner can and cannot certify.

NoWatermark detects, extracts, and parses JUMBF payloads directly in your web browser. However, **NoWatermark does not verify digital signatures cryptographically**. 

Cryptographic verification requires validating digital certificates against public key infrastructure (PKI) trust lists, checking revocation registries, and running intensive cryptographic validation routines. Because NoWatermark is a lightweight, privacy-first diagnostic tool that runs locally, it reports whether a JUMBF manifest is **present** in the file container, never whether it is **valid**.

A status of *present* tells you:
- A structurally compliant JUMBF superbox exists in the file.
- The manifest assertions and structure can be read and inspected.
- The file carries provenance claims declaring its origin or edit history.

A status of *present* does **not** certify that the underlying digital certificate is unrevoked, that the signature chain is trusted, or that the file represents verified human authorship.

---

## Removing JUMBF payloads from media files

Because JUMBF is standard container metadata, it can be stripped when you need to protect your privacy, remove workflow histories, or minimise file overhead.

When using our [C2PA remover](/c2pa-remover) or general metadata tools, the cleaning process works entirely at the container layer:

1. **Local Browser Processing**: Everything executes locally inside your web browser. Your files are never uploaded to any remote server, database, or cloud storage endpoint.
2. **Container Rewriting**: The cleaner parses the container structure, strips the JUMBF carriers (such as the `APP11` segment in JPEG, the `caBX` chunk in PNG, or the dedicated chunk in WebP), and copies the compressed picture data byte for byte.
3. **Zero Quality Loss**: Because image data is copied verbatim without re-encoding or recompression, image quality remains bit-for-bit identical to the original.
4. **Verification by Re-Scan**: A removal is only reported after the cleaned output is scanned a second time in memory and diffed against the original file to confirm the JUMBF boxes are completely gone.

### Format capabilities and limitations

Cleaning capabilities depend on the specific file format:
- **Cleaned and Inspected**: JPEG, PNG, WebP, SVG, and Markdown files can be inspected and cleaned.
- **Inspect-Only**: **PDF is inspect-only**. NoWatermark does not clean or rewrite PDF files due to the complexity of incremental revisions and object stream dependencies.

To see the complete list of supported formats, inspected fields, and operational boundaries, visit our [capability matrix](/capabilities).

---

## Summary

JUMBF is the foundational container format that makes C2PA provenance and Content Credentials portable across digital media. By structuring metadata into typed, hierarchical boxes—beginning with a mandatory `jumd` description box inside an outer `jumb` superbox—it provides an extensible carrier for cryptographic assertions. 

However, because four-character box types can occur by coincidence, reliable tools must parse container hierarchies structurally rather than relying on crude text searches. While JUMBF manifests can be detected and cleanly stripped from supported image formats, their presence represents metadata rather than verified proof of authorship.

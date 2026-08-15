---
title: What is XMP metadata?
metaTitle: 'What Is XMP Metadata? | NoWatermark'
description: XMP is an ISO standard for embedding XML metadata packets in media files. Learn where it hides, how AI tools use it, and how to inspect and remove it safely.
summary: Understand how the Extensible Metadata Platform embeds provenance, author details, and AI tags inside image containers and documents.
publishDate: 2026-08-15
author: NoWatermark
contentType: guide
cluster: provenance-standards
order: 50
relatedTools: ['/ai-watermark-checker', '/ai-metadata-remover', '/exif-remover']
relatedGuides: ['/guides/what-is-iptc-digitalsourcetype', '/guides/how-to-check-ai-image-metadata', '/guides/how-to-remove-exif-data']
sources:
  - title: Extensible Metadata Platform (XMP)
    url: https://www.adobe.com/products/xmp.html
    accessed: 2026-08-15
faq:
  - q: What is XMP metadata?
    a: XMP, or the Extensible Metadata Platform, is an ISO standard for embedding structured XML/RDF metadata packets directly inside digital files. It allows editing and publishing software to record creation details, edit histories, copyright information, and machine-generation declarations across multiple media formats.
  - q: Where is XMP stored inside different file formats?
    a: XMP is stored in specific container segments depending on the format. It resides in an APP1 marker segment in JPEG files, an iTXt chunk in PNG images, a dedicated XMP chunk in WebP files, a metadata element in SVG graphics, and across document revisions in PDF files.
  - q: Can XMP metadata declare that an image was created by AI?
    a: Yes, XMP packets frequently contain IPTC metadata fields such as DigitalSourceType set to trainedAlgorithmicMedia. This standardised declaration signals that the media was generated or modified using an algorithmic model.
  - q: Does stripping XMP metadata affect image quality?
    a: No, stripping XMP metadata does not alter image quality or recompress picture data. Container rewriting tools discard metadata chunks and copy the underlying compressed image bytes without modification.
---

XMP, or the Extensible Metadata Platform, is an open ISO standard for embedding structured metadata directly inside media files as an XML/RDF packet. It provides editing and publishing software with a standardised, extensible format to record descriptive properties, workflow histories, creator identities, and generative provenance alongside binary content.

Originally created at Adobe and subsequently established as an international standard, XMP is widely implemented across photographic tools, document processors, and modern generative media pipelines. Because it lives inside the file container rather than in external companion files, XMP travels with your content whenever it is downloaded, shared, or republished, unless it is deliberately inspected and removed.

---

## How XMP packets work

Traditional metadata formats such as standard EXIF were designed around fixed, rigid binary tables. While EXIF handles basic camera exposure values, timestamps, and hardware settings well, it struggles to represent complex nested data, custom application properties, or extensible vocabularies.

XMP resolves this by structuring information as an XML packet using the Resource Description Framework (RDF) data model. An XMP packet consists of plain text XML formatted according to well-defined schemas. This architecture allows software to store:

- **Namespaces:** Distinct schemas can coexist in the same packet without naming conflicts, allowing standard Dublin Core properties to sit alongside technical photographic fields or custom organisation attributes.
- **Hierarchical structures:** Complex data such as multi-step editing histories, component lists, or multi-author credits can be nested cleanly within ordered or unordered lists.
- **Human-readable text:** Because the packet is formatted in standard UTF-8 XML, its contents can be extracted and read without proprietary decoding tools.

When an application reads an image or document containing XMP, it parses the XML packet, identifies the relevant schema namespaces, and displays or updates the associated properties.

---

## What information lives inside XMP?

Because XMP is designed to be extensible, different applications record different categories of data within a file. In practice, the data found within XMP packets generally falls into several primary categories:

```
+-------------------------------------------------------------------+
|                            XMP PACKET                             |
+---------------------------------+---------------------------------+
| Workflow & Application Details  | Rights & Creator Properties     |
| - Creating software / engine    | - Author & copyright holder     |
| - Modification timestamps       | - Usage terms & credit lines    |
| - Edit history & processing log | - Embedded licensing URLs       |
+---------------------------------+---------------------------------+
| Photographic Properties         | Generative AI Declarations      |
| - Custom camera profiles        | - IPTC DigitalSourceType        |
| - Lens correction parameters    | - trainedAlgorithmicMedia       |
| - Non-destructive crop values   | - Synthetic provenance data     |
+---------------------------------+---------------------------------+
```

### 1. Application and workflow history
Many creative tools record the name of the creating application, the date and time the asset was exported, and a log of non-destructive edits applied during production. This can include precise adjustment parameters, colour grading profiles, and non-destructive crop boundaries.

### 2. Author and rights management
XMP commonly carries Dublin Core and IPTC rights metadata. These fields record the creator's name, copyright notices, usage terms, credit lines, and web links for licensing verification.

### 3. Generative AI declarations
In the context of machine-generated content, XMP is the primary vehicle for standardised provenance declarations. The International Press Telecommunications Council (IPTC) photo metadata standard defines specific schema properties to describe how an image was produced.

The most critical of these is the `DigitalSourceType` property. When a file is created using an AI model, editing and publishing tools can set this field to:

```xml
<Iptc4xmpExt:DigitalSourceType>
    http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia
</Iptc4xmpExt:DigitalSourceType>
```

The value `trainedAlgorithmicMedia` explicitly signals that the visual content was synthesised by a machine-learning model rather than captured through a physical lens or created manually from scratch. For a deeper breakdown of this property, see our dedicated guide to [IPTC DigitalSourceType](/guides/what-is-iptc-digitalsourcetype).

---

## Where XMP hides across different file formats

Every file format stores XMP differently. Because image and document containers have distinct architectures, parser implementations must look in specific segments, chunks, or elements to locate the embedded XML packet.

| File format | Container location | Inspection and cleaning behaviour |
|---|---|---|
| **JPEG** | `APP1` marker segment | Inspected and cleaned by container rewriting |
| **PNG** | `iTXt` ancillary chunk | Inspected and cleaned by container rewriting |
| **WebP** | Dedicated `XMP ` chunk | Inspected and cleaned by container rewriting |
| **SVG** | `<metadata>` XML element | Inspected and cleaned by container rewriting |
| **PDF** | Document object graph & superseded revision streams | **Inspect-only**; raw byte scanning across all revisions |

### JPEG images
In standard JPEG files, metadata cannot be placed arbitrarily among compressed image data. Instead, JPEG files use numbered Application Marker segments (`APP0` through `APP15`). EXIF metadata typically occupies an `APP1` segment starting with an `Exif\0\0` header, while XMP metadata occupies a separate `APP1` segment identified by the namespace URI `http://ns.adobe.com/xap/1.0/\0`.

### PNG images
PNG files consist of a series of typed chunks. XMP is stored in an international textual data chunk (`iTXt`). This chunk uses UTF-8 encoding and specifies the keyword `XML:com.adobe.xmp`, followed by the raw XML text packet.

### WebP images
WebP files use the Resource Interchange File Format (RIFF) container structure. When XMP is present, it is stored in an ancillary four-character chunk labelled `XMP `, positioned between the image header and the compressed bitstream.

### SVG graphics
Unlike binary raster images, Scalable Vector Graphics (SVG) are plain-text XML documents. XMP metadata in an SVG is stored directly inside an XML `<metadata>` element, typically nested under the root `<svg>` element and wrapping the standard RDF/XML block.

### PDF documents
PDF files present a unique challenge for metadata inspection. In a PDF, XMP packets can be attached to the document catalogue as a metadata stream, or associated with individual pages, fonts, and embedded images. 

Crucially, PDF supports incremental updates. When a PDF document is modified and saved incrementally, new revisions are appended to the end of the file without deleting earlier data streams. An XMP packet present in an older revision remains embedded in the physical file even if the active document catalogue no longer points to it.

For this reason, standard tools that only parse the active object graph miss superseded XMP packets. A thorough scanner searches the raw bytes across the entire file container to detect all historical XMP streams.

---

## The three distinct layers of provenance

When evaluating file privacy and provenance, it is vital to avoid conflating different technical mechanisms. Digital files carry three fundamentally different types of signals:

```
+--------------------------------------------------------------------------+
| 1. CONTAINER METADATA (XMP, EXIF, IPTC)                                  |
|    - Stored in headers, chunks, and XML packets                          |
|    - Fully removable without changing image quality                      |
|    - Removal is verified and confirmed by re-scanning the output file     |
+--------------------------------------------------------------------------+
| 2. PIXEL & STATISTICAL WATERMARKS                                        |
|    - Embedded mathematically into pixel values or generation patterns    |
|    - Cannot be verified as absent by local container inspection          |
|    - Local metadata cleaning does not alter image pixels                 |
+--------------------------------------------------------------------------+
| 3. SERVER-SIDE PROVENANCE RECORDS                                        |
|    - Held in a provider's private infrastructure or database             |
|    - Completely disconnected from the physical file on your device       |
|    - No local tool or file modification touches external server logs     |
+--------------------------------------------------------------------------+
```

### 1. Metadata packets
XMP, EXIF, and IPTC tags are container metadata. They exist outside the compressed image data. They are easily detected, entirely removable, and their removal can be definitively verified by re-scanning the resulting file container.

### 2. Pixel or statistical watermarks
Pixel-level modifications, frequency-domain alterations, or statistical generation watermarks are embedded directly within the visible or mathematical image data. Removing an XMP metadata segment does not alter image pixels and therefore has no impact on pixel-level watermarks. Because statistical watermarks cannot be confirmed absent through local inspection, their status remains permanently unable to verify.

### 3. Server-side records
When an online service generates a file, the provider may log the generation timestamp, account identifier, and output parameters in an internal database. Stripping XMP metadata from your local copy modifies only the file in your possession; it has no effect on records stored on an external server.

---

## How to inspect and remove XMP metadata safely

Because XMP packets can contain personal identifiers, workflow histories, and generative flags, many users choose to clean their files before distributing them.

### Safe cleaning without quality loss
Naively removing metadata by opening an image in a general photo editor and re-exporting it introduces compression loss. Every time a lossy format like JPEG or WebP is recompressed, visual artefacts accumulate and image quality degrades.

A dedicated cleaner operates at the container level:

1. **Direct chunk stripping:** The tool parses the file container, identifies metadata segments (such as the JPEG `APP1` segment, PNG `iTXt` chunk, or WebP `XMP ` chunk), and removes them entirely.
2. **Byte-for-byte data preservation:** The compressed image payload is copied exactly, ensuring zero recompression and zero loss of visual quality.
3. **Verification via re-scan:** Once the cleaned file is written, the tool immediately scans the output a second time, diffing the result against the original container to confirm that the target XMP packets are completely gone.

You can inspect your files using our [AI watermark checker](/ai-watermark-checker), strip unwanted tags with the [AI metadata remover](/ai-metadata-remover), or clean photographic tags using our [EXIF remover](/exif-remover).

### Privacy-first client-side processing
NoWatermark runs entirely inside your web browser. When you inspect or clean a file on the site:

- No file is ever uploaded to an external server.
- There is no upload endpoint, backend processing queue, or remote storage.
- All container parsing, XMP extraction, and byte-level reconstruction happen locally in client-side memory.

For a comprehensive breakdown of which formats support cleaning and which support inspection only, consult our [format capability matrix](/capabilities).

---

## Further reading

- Learn how camera properties and location tags differ from XMP in our guide on [how to remove EXIF data](/guides/how-to-remove-exif-data).
- Understand how generative models declare provenance in our overview of [how to check AI image metadata](/guides/how-to-check-ai-image-metadata).
- Explore specific metadata vocabularies in our guide to [IPTC DigitalSourceType](/guides/what-is-iptc-digitalsourcetype).

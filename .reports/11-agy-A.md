---
title: Why PDF metadata hides in superseded revisions
metaTitle: 'Why PDF Metadata Hides in Old Revisions | NoWatermark'
description: Deleting PDF metadata often fails because incremental saves append new revisions while leaving original author and creation details intact in earlier bytes.
summary: Incremental updates in PDF files preserve older metadata dictionaries inside earlier byte offsets, exposing superseded author names to raw byte inspection.
publishDate: 2026-08-15
lastTested: 2026-08-15
author: NoWatermark
contentType: lab
cluster: format-workflows
order: 50
relatedTools: ['/exif-remover', '/ai-metadata-remover']
relatedGuides: ['/guides/how-to-remove-exif-data', '/guides/what-is-c2pa']
sources: []
changelog:
  - date: 2026-08-15
    note: First run. 733 PDFs from system and application directories on a macOS 15 machine, scanned with NoWatermark's PDF parser.
faq:
  - q: Why is my author name still in a PDF after I deleted it?
    a: PDF files use an append-only revision structure where saving modifications attaches new data instead of overwriting earlier bytes. If an application updates the file incrementally, the original metadata dictionary remains intact in an earlier section of the container. Anyone inspecting the raw byte stream can still extract the superseded author name.
  - q: How do I check if a PDF contains superseded revisions?
    a: Inspect the document with a tool that scans every cross-reference table and trailer across the entire container rather than parsing only the newest trailer. If earlier revisions exist, check whether historical `/Info` dictionaries or XMP packets remain recorded in those superseded sections.
  - q: Does NoWatermark remove metadata from PDF files?
    a: NoWatermark is currently inspect-only for PDF files and does not clean them. Correctly sanitising a PDF requires full re-serialisation of the object hierarchy to avoid appending further revisions, so you should re-export the document directly from its source application instead.
---

Deleting an author name or creation timestamp from a PDF does not guarantee the data has been removed from the file. Because the PDF container uses an append-only revision architecture, saving changes often appends a new revision to the end of the file rather than overwriting existing bytes, leaving superseded metadata completely intact in earlier sections.

When a document editor "removes" metadata through an incremental update, it writes a replacement `/Info` dictionary or updated XMP packet into a newly appended body and adds a fresh cross-reference table pointing to the update. Standard PDF viewers read the latest cross-reference table and display only the newest revision, presenting a blank or updated author field. However, every earlier revision remains physically present in the byte stream. Anyone reading the raw container can locate the original dictionary and recover the author name, organisation, creation timestamp, or editing history.

In our lab scan of 733 local PDF files on macOS, 36 files (4.9%) contained multiple revisions, and 27 files (3.7%) retained metadata in a superseded revision. That represents roughly one file in every twenty-seven carrying metadata that its active revision had supposedly replaced.

## The mechanics of incremental updates

The PDF file format is structured around objects, a cross-reference table (`xref`), and a trailer dictionary. Objects contain the document content, fonts, layout streams, and metadata structures such as the `/Info` dictionary. The cross-reference table records the exact byte offset of each object in the file, allowing a reader application to find and render pages quickly.

When an author modifies and saves an existing PDF, many applications choose not to rewrite the entire file. Rewriting a large file from scratch requires re-indexing all internal object references and generating a brand new container. Instead, the application performs an incremental update:

1. The existing file contents remain untouched at their original byte positions.
2. The application appends newly created or modified objects to the end of the file.
3. The application appends a new cross-reference table that lists the byte offsets of the newly appended objects while referencing unchanged objects from earlier sections.
4. The application writes a new trailer dictionary with a `/Prev` entry pointing back to the byte offset of the preceding cross-reference table.

```
+-------------------------------------------------------+
|  Revision 1: Body Objects                             |
|  - Object 4: /Info << /Author (Original Author) >>    |
|  - Object 5: Document catalog and pages               |
+-------------------------------------------------------+
|  Revision 1: Cross-Reference Table (xref)             |
|  Revision 1: Trailer                                  |
+-------------------------------------------------------+
|  Revision 2: Appended Update                          |
|  - Object 12: /Info << /Author () >>                  |
+-------------------------------------------------------+
|  Revision 2: Appended xref (points to Object 12)      |
|  Revision 2: Trailer (/Prev points to Revision 1 xref)|
+-------------------------------------------------------+
```

Under this structure, an operation intended to clear an author field simply appends a new `/Info` object (such as Object 12 in the diagram above) where the `/Author` string is empty or omitted. The Revision 2 trailer declares Object 12 as the active `/Info` dictionary. 

When a standard reader opens this file, it navigates to the final trailer, resolves Object 12, and displays no author information in the document properties dialogue. However, Object 4 in Revision 1 has not been modified, overwritten, or erased. It sits at its original byte offset, fully readable by any tool or script that parses the entire container or scans historical revisions.

## Lab test: scanning 733 local PDF files

To measure how often superseded metadata appears in everyday environments, NoWatermark analysed a corpus of 733 PDF files stored on a macOS 15 system. The files were gathered across system directories, local libraries, installed application bundles, and user downloads directories. 

The corpus was scanned locally using NoWatermark's standalone PDF parser. All parsing ran directly on the machine; no file content or metadata was transmitted over a network. The corpus was weighted towards software documentation, technical manuals, and installed application resources.

| Measurement | Result | Share of corpus |
|---|---|---|
| Cleanly parsed | 728 of 733 | 99.3% |
| Parser reported degraded structure | 5 of 733 | 0.7% |
| Parser threw an error | 0 of 733 | 0.0% |
| Encrypted files | 0 of 733 | 0.0% |
| **More than one revision in the file** | **36 of 733** | **4.9%** |
| **Metadata present in a superseded revision** | **27 of 733** | **3.7%** |
| Linearised structure | 11 of 733 | 1.5% |
| Any `/Info` metadata field populated | 356 of 733 | 48.6% |
| Named author field populated | 146 of 733 | 19.9% |
| Non-standard custom `/Info` keys present | 32 of 733 | 4.4% |
| XMP packet present | 127 of 733 | 17.3% |
| Document JavaScript detected | 0 of 733 | 0.0% |
| Embedded files detected | 0 of 733 | 0.0% |
| C2PA provenance manifests detected | 0 of 733 | 0.0% |

Parsing performance was measured across all 733 documents:
- **Median processing time:** 0.2 ms per file
- **95th percentile:** 3.3 ms per file
- **Slowest file:** 175.7 ms

Out of 733 files, 728 parsed without structural anomalies. In 5 files (0.7%), the parser encountered degraded internal structures but was still able to extract object offsets. Zero files caused unhandled parser errors.

## Why 3.7% of scanned files retained superseded data

Across the test corpus, 36 files (4.9%) contained two or more revisions. Within those multi-revision documents, 27 files (3.7% of the total dataset) contained metadata in a superseded revision.

In these 27 files, an inspection that only examined the active trailer would misrepresent what data was physically inside the file. For example, a document whose final `/Info` dictionary contained no author name still held a populated `/Author` string inside an earlier revision object. Similarly, superseded revisions preserved older creation timestamps, software identifiers, and custom `/Info` keys that had been altered in subsequent saves.

We do not claim that this 3.7% rate applies universally across all PDFs on the internet. Our test reflects a specific corpus of 733 files residing on a single macOS machine, weighted towards software documentation. We have not tested other operating systems, enterprise document management archives, or broader web scrapes. 

However, the finding demonstrates that incremental revision metadata is not a theoretical vulnerability. It occurs naturally during routine document editing and workflow saves.

## Distinguishing metadata, watermarks, and server provenance

When managing privacy and provenance in digital documents, it is vital to distinguish between three different mechanisms that operate at different levels of the file and network stack.

```
+-------------------------------------------------------------------------+
| Metadata (Container Level)                                              |
| - /Info dictionaries, XMP packets, EXIF tags                            |
| - Directly readable in byte stream                                      |
| - Removable in supported formats; confirmed by re-scanning              |
+-------------------------------------------------------------------------+
| Pixel & Statistical Watermarks (Content Level)                          |
| - SynthID, imperceptible pixel patterns, token distribution biases      |
| - Embedded into the visual or textual signal itself                     |
| - Local tools cannot verify or confirm absence ("unable to verify")     |
+-------------------------------------------------------------------------+
| Server-Side Provenance (Infrastructure Level)                           |
| - Database records, upload hashes, account activity logs held by hosts   |
| - Stored remotely on third-party servers                                |
| - Unaffected by local file stripping or re-serialisation                |
+-------------------------------------------------------------------------+
```

### 1. Container metadata
Container metadata consists of structured data blocks defined by file format specifications. In PDFs, this includes the `/Info` dictionary and embedded XMP metadata streams. In image files, it includes EXIF, IPTC, and XMP blocks. 

Metadata is stored as standard data structures within the container. In supported image formats, cleaning tools like our [`/exif-remover`](/exif-remover) and [`/ai-metadata-remover`](/ai-metadata-remover) rewrite the container to strip these fields byte-for-byte without altering compressed image data. Removal is confirmed by re-scanning the resulting file. We explain container stripping in our guide on [how to remove EXIF data](/guides/how-to-remove-exif-data) and provenance containers in our analysis of [what is C2PA](/guides/what-is-c2pa).

### 2. Pixel or statistical watermarks
Pixel and statistical watermarks are modifications applied directly to the content signal itself. Examples include mathematical perturbations embedded across image pixels or statistical bias patterns introduced into generated text tokens (such as SynthID). 

These watermarks do not live in metadata dictionaries or container headers. A local, offline parser cannot extract, alter, or confirm the absence of a statistical watermark whose verification key or detection model is held by a service provider. For this reason, NoWatermark reports all statistical and pixel-level watermarks as "unable to verify". We do not claim to detect or remove them.

### 3. Server-side provenance
Server-side provenance refers to records maintained externally in a service provider's database. When a file is generated, uploaded, or processed through an online platform, the server can record a cryptographic hash, perceptual fingerprint, account identifier, and timestamp in its own logs. 

Nothing done to a local file can modify, erase, or disconnect a server-side database entry. If a platform re-identifies a file by matching its hash or visual fingerprint against an internal registry, that association occurs entirely on the remote server.

## Multi-revision inspection in NoWatermark

Because 3.7% of files in our testing contained metadata hidden in older revisions, a reliable inspection tool cannot rely solely on the document's final trailer. 

If a parser opens a PDF, reads only the newest cross-reference table, and checks the active `/Info` dictionary, it might report that the document contains no author metadata. The user would leave believing their file is clean, even though their full name or organization remains recorded in an unreferenced object earlier in the file.

NoWatermark's PDF parser addresses this by inspecting every revision layer:
1. It locates every cross-reference section (`xref` table or `XRef` stream) throughout the entire byte stream by following the chain of `/Prev` pointers back to the original header.
2. It resolves the trailer associated with each individual revision.
3. It parses the `/Info` dictionary and XMP metadata packet for each revision independently.
4. It presents the findings for every revision separately in the inspection report, explicitly warning the user when earlier revisions are detected.

### Why NoWatermark does not clean PDFs yet

PDF handling in NoWatermark is currently **inspect-only**. NoWatermark does not clean or strip metadata from PDF files.

The reason for this limitation stems directly from the revision mechanism described in this lab report. To clean a PDF correctly, a tool cannot simply append another incremental update containing an empty `/Info` dictionary. Doing so would compound the problem, adding a new revision layer while leaving every previous `/Info` dictionary and XMP packet sitting in the file.

Correctly sanitising a PDF requires full re-serialisation:
- Parsing the complete object tree across all revisions.
- Removing deprecated, unreferenced, and superseded objects.
- Stripping all historical `/Info` dictionaries, XMP metadata streams, and custom document properties.
- Rebuilding the page tree, content streams, and resource dictionaries from scratch.
- Writing a single, clean cross-reference table from byte offset zero.

Re-serialising arbitrary PDF files without introducing visual layout corruption, font rendering bugs, or broken annotations requires an extensive layout and font engine. Because NoWatermark strictly verifies every cleanup operation by re-scanning the output to ensure data integrity, PDF cleaning will not be offered until full re-serialisation can be performed reliably. We do not imply that PDF cleaning is currently available or imminent.

## Safe document sanitisation workflows

If you inspect a PDF and find that superseded revisions contain sensitive author names, internal paths, or historical metadata, you should not rely on quick redaction plugins or incremental save tools to fix it.

To produce a clean document today:

1. **Re-export from the original source file:** Return to the original source application (such as your word processor, layout software, or Markdown editor). Export or compile a completely new PDF document rather than saving changes over the existing file. A fresh export generates a new container with a single revision containing only the active metadata fields.
2. **Clear author properties in the source application before exporting:** Ensure that document properties, template author fields, and track-changes histories are cleared in the authoring application before running the export.
3. **Inspect the exported file:** Run the newly exported PDF through an offline multi-revision parser to confirm that the file contains exactly one revision and that no unwanted `/Info` fields or XMP packets were written to the new container.

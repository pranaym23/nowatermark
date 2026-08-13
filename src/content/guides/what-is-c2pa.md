---
title: What is C2PA?
metaTitle: 'What is C2PA? Content Provenance Explained | NoWatermark'
description: A plain explanation of C2PA — the provenance standard behind Content Credentials — how manifests are stored in images, and where the standard is weak.
summary: The provenance standard behind Content Credentials, how it is stored inside an image, and the two places it tends to break down.
publishDate: 2026-08-13
order: 10
relatedTools: ['/c2pa-checker', '/c2pa-remover', '/content-credentials-checker']
relatedGuides: ['/guides/c2pa-vs-synthid', '/guides/what-are-content-credentials']
faq:
  - q: Is C2PA the same as Content Credentials?
    a: Content Credentials is the consumer-facing brand; C2PA is the technical standard underneath it. In practice the terms are used interchangeably.
  - q: Does C2PA prove an image is real?
    a: No. It records claims made by whoever produced the file, cryptographically bound to a signer. It tells you who is asserting something, not whether the underlying picture is authentic.
  - q: Can C2PA data be removed?
    a: Yes. The manifest is a data structure inside the file and can be stripped like any other metadata. Whether that is the end of the story depends on whether durable credentials are in play.
---

C2PA is an open standard for recording where a piece of media came from and what has happened to it since. It is developed by the Coalition for Content Provenance and Authenticity, whose members include Adobe, Microsoft, Google, OpenAI, the BBC and a range of camera manufacturers.

The core idea is straightforward: rather than trying to work out an image's origin by analysing it, attach the origin to it as a signed record that travels with the file.

## What a manifest contains

A C2PA manifest is a structured record with a few distinct parts.

The **claim** states what is being asserted — typically the tool that produced the file, identified by a `claim_generator` string such as an application name and version.

**Assertions** describe specific facts: that the content was created with a generative AI model, that particular edits were applied, or that certain regions were modified. Assertions carry standard labels like `c2pa.actions`, which is how a reader knows what kind of statement it is looking at.

A **signature** binds the claim and assertions to a signing certificate, so a validator can check that the record has not been altered since it was produced and can see who vouches for it.

Optionally, a manifest can reference earlier manifests, forming a chain that describes an editing history across multiple tools.

## Where it lives inside an image

Manifests are serialised as JUMBF — a box-structured container format borrowed from the JPEG 2000 family — and then embedded in whatever the host format provides for arbitrary data.

In a **JPEG**, that is an APP11 marker segment. In a **PNG**, a `caBX` chunk. In a **WebP**, a dedicated RIFF chunk. Because a manifest can be larger than a single JPEG segment allows, it may be split across several APP11 segments that a reader has to reassemble.

Our [C2PA Checker](/c2pa-checker) locates these structures and reads what it can from them, entirely inside your browser.

## The two weak points

**Manifests are easy to lose.** Any tool that rewrites a file without understanding C2PA will discard the manifest. Most social platforms re-encode uploads and strip metadata. A screenshot discards everything. In practice a large fraction of images that once carried credentials no longer do — which means a missing manifest tells you almost nothing.

**Presence is not validity.** Reading a manifest and validating it are different operations. Full validation requires checking the signature against current trust lists, which is not something a static web page can do honestly. This is why our checker reports a manifest as *detected* rather than *valid* — we can see it is there, and we decline to pass judgement on its cryptographic standing.

## Durable Content Credentials

The fragility problem is well understood by the standard's authors, which is why "durable" credentials exist. The approach pairs the embedded manifest with an invisible watermark and a content fingerprint, both stored in a provider's database. If the manifest is stripped, a matching service can look up the image and re-associate the provenance record.

This has a consequence worth stating plainly: removing a manifest from a file removes it from *your copy of that file*. It does not remove it from anyone else's records, and it does not prevent recovery by a service that holds a fingerprint. Our [C2PA Remover](/c2pa-remover) says exactly this, because a tool that implies otherwise would be misleading you.

## What C2PA is good for

Despite the weaknesses, the standard does something no detector can: it lets a producer make a positive, checkable claim about their own content. A newsroom can attest that an image came from its camera and passed through its editing pipeline. That is genuinely valuable, and it is a different problem from trying to catch undisclosed synthetic media after the fact.

Understanding which problem you are solving is most of the battle.

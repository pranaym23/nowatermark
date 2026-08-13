---
title: What is SynthID?
metaTitle: "What is SynthID? Google's Invisible Watermark Explained | NoWatermark"
description: How Google's SynthID watermark works, why it survives editing, and why no browser-based tool can detect or remove it.
summary: Google's imperceptible watermark lives in the pixels, not the metadata — which changes everything about what you can do with it.
publishDate: 2026-08-13
order: 11
relatedTools: ['/synthid-checker', '/synthid-remover', '/ai-watermark-checker']
relatedGuides: ['/guides/c2pa-vs-synthid', '/guides/can-you-remove-ai-watermarks']
faq:
  - q: Can I check an image for SynthID?
    a: Not with any tool that runs in your browser. Detection requires Google's own detector and the corresponding model keys, which are not publicly available.
  - q: Does removing metadata remove SynthID?
    a: No. SynthID is embedded in the image content. Metadata cleaning does not modify image content at all, so it has no effect on it whatsoever.
  - q: Will a screenshot remove SynthID?
    a: It is specifically designed to survive that kind of transformation. Assume it does.
---

SynthID is Google DeepMind's watermarking technology for AI-generated content. It matters here because it works in a fundamentally different way from every other signal this site can inspect — and that difference determines what is and is not possible.

## Metadata versus embedded watermarks

Almost everything NoWatermark can read is **metadata**: structured records attached alongside the picture. EXIF blocks, XMP packets, C2PA manifests, PNG text chunks. Metadata is separable from image content, which is precisely why it can be read cleanly and removed cleanly.

SynthID is not metadata. It modifies the image content itself, adjusting pixel values in a pattern that a matching detector can recognise statistically but a human eye cannot see. The watermark is not attached to the picture. It *is* the picture, slightly rearranged.

## Why that makes it robust

Because the signal is distributed across the image rather than stored in one place, the usual ways of losing metadata do nothing to it.

Re-saving the file does not help — the watermark is in the pixels being saved. Stripping metadata does not help, for the same reason. Screenshotting does not help, because the screenshot captures the watermarked pixels. Cropping removes part of the signal but typically leaves enough. Resizing, compression and colour adjustment are all transformations the technique is explicitly designed to survive.

Google has extended the approach to text and audio as well, using the same principle: bias the generated output in a recoverable pattern rather than annotate it after the fact.

## Why we cannot detect it

Detection requires the detector. SynthID's verification depends on model-specific information held by Google, and there is no public detector a web page could call — nor would calling one fit an architecture where your file never leaves your device.

So our [SynthID Checker](/synthid-checker) does not have a detector, and says so. Every scan reports SynthID as **Unable to verify**, for every image, permanently. That status is not a placeholder awaiting a better implementation; it is an accurate statement about a capability we do not have and cannot acquire client-side.

We could show a green "not detected" badge instead. It would look more useful and it would be a lie, because we never looked.

## Why we cannot remove it

The same reasoning applies in reverse. Our cleaners work at the container level and copy compressed image data byte-for-byte — that is what makes cleaning lossless. It also means the pixels come out identical, watermark included.

Could aggressive editing degrade it? In principle, any watermark can be destroyed by enough distortion, but robust watermarks are built to survive the transformations people actually apply, and destroying one reliably tends to mean visibly damaging the image. More to the point: we could not verify the outcome. A tool that cannot measure a result should not sell you that result. See [Can you remove AI watermarks?](/guides/can-you-remove-ai-watermarks) for the fuller argument.

## What to do with this

Treat SynthID as a fixed property of any image produced by a Google AI product. Metadata cleaning is still worth doing — it removes GPS, device identifiers, timestamps, prompts and generator tags, all of which are real privacy exposures — but do it understanding what it does not touch.

The useful mental model: cleaning metadata is like removing the label from a bottle. It does not change what is inside.

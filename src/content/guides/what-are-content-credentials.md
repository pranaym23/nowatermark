---
title: What are Content Credentials?
metaTitle: 'What Are Content Credentials? A Plain Explanation | NoWatermark'
description: Content Credentials explained without jargon — what they record, why they go missing so often, and what "durable" credentials change.
summary: The consumer-facing name for C2PA provenance, why the little "cr" icon disappears so often, and what durable credentials mean for removal.
publishDate: 2026-08-13
order: 22
relatedTools: ['/content-credentials-checker', '/c2pa-checker', '/c2pa-remover']
relatedGuides: ['/guides/what-is-c2pa', '/guides/c2pa-vs-synthid']
faq:
  - q: What does the "cr" icon mean?
    a: It indicates the image carries Content Credentials. Clicking it in a supporting viewer shows the attached provenance record.
  - q: Why do my Content Credentials keep disappearing?
    a: Most platforms and editors that do not support C2PA discard the manifest when they re-encode or re-save a file. This is the normal case, not the exception.
  - q: Are Content Credentials proof an image is real?
    a: No. They record claims by whoever produced the file. They tell you who is asserting something and that the assertion has not been altered — not whether the picture is authentic.
---

Content Credentials is the consumer-facing name for provenance information attached to a media file. Under the hood it is the C2PA standard; the friendlier name exists because "C2PA manifest" is not something you can put in a product UI.

You may have seen the small **cr** icon in the corner of an image in a supporting application. That indicates a credential is attached, and clicking it reveals what the record says.

## What a credential records

At minimum, the tool that produced the file. Often more: the edits applied, whether generative AI was involved, and which earlier files contributed to it. The record is signed, so a validator can confirm it has not been altered since it was created and can see which certificate vouches for it.

The design intent is worth naming. Content Credentials are not an AI detector. They are a mechanism for a producer to make a **positive, checkable claim** about their own content — the inverse of trying to catch undisclosed synthetic media after the fact.

## Why they go missing constantly

This is the part that surprises people, and it is the most practically important thing on this page.

Credentials are stored as metadata inside the file. Any tool that rewrites the file without understanding C2PA discards them. In practice that means:

- Most social platforms re-encode uploads and strip metadata.
- Messaging apps compress images and strip metadata.
- A screenshot produces an entirely new file with none of the original's metadata.
- Editors without C2PA support drop the manifest when you save.

None of that is anyone tampering with anything. It is the ordinary life of an image on the internet. So a missing credential is weak evidence of essentially nothing, while a present credential is genuinely informative.

You can check any image for yourself with the [Content Credentials Checker](/content-credentials-checker).

## Durable Content Credentials

Because fragility was obvious from the start, the ecosystem developed "durable" credentials. The approach pairs the embedded manifest with two backups: an invisible watermark in the pixels, and a content fingerprint stored in a provider's database.

If the manifest is stripped, a matching service can identify the image and re-associate the provenance record with it.

This has a direct consequence for removal, and we would rather say it plainly than let a tool imply otherwise. Removing a manifest removes it **from your copy of the file**. It does not remove it from a provider's database, and it does not prevent a matching service from recovering it. Our [C2PA Remover](/c2pa-remover) states this on the page, because a removal tool that lets you believe the record is gone entirely is misleading you about what it achieved.

## Present is not the same as valid

One more distinction. Reading a manifest is easy; validating it is not. Full validation means checking the signature chain against current trust lists — which needs live trust data and a complete validator.

Our checkers therefore report a manifest as **detected**, never as **valid**. We can see it is there and read some of what it says. We decline to pass judgement on its cryptographic standing, because we have not actually verified it, and saying otherwise would be the single most misleading thing a provenance tool could do.

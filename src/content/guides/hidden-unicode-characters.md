---
title: Hidden Unicode characters explained
metaTitle: 'Hidden Unicode: Zero-Width and Tag Characters | NoWatermark'
description: What invisible Unicode characters are, how they hide information in ordinary text, and how to remove them without breaking emoji.
summary: Zero-width spaces, bidi overrides and tag characters — what they do, why they turn up in your text, and how to strip them safely.
publishDate: 2026-08-13
order: 23
relatedTools: ['/claude-watermark-checker', '/claude-watermark-remover']
relatedGuides: ['/guides/does-claude-watermark-text']
faq:
  - q: Are invisible characters always malicious?
    a: No. Most are legitimate — soft hyphens control line breaking, joiners build emoji, bidi marks handle mixed-direction text. Context decides.
  - q: Will removing them break my emoji?
    a: Not if the cleaner is careful. Zero-width joiners inside emoji sequences and variation selectors attached to pictographs must be preserved, which ours does by default.
  - q: How do these end up in my text?
    a: Copying from web pages, PDFs, word processors and messaging apps. It is extremely common and usually accidental.
---

Unicode contains a number of characters that occupy a position in a string but render as nothing at all. They are genuinely useful — and they are also the mechanism behind most "hidden message in text" tricks.

## The main categories

**Zero-width characters.** The zero-width space (U+200B), non-joiner (U+200C), joiner (U+200D) and word joiner (U+2060). Originally for controlling line breaks and script shaping. Because they survive copy and paste and are completely invisible, a sequence of them can encode arbitrary binary data inside ordinary-looking text.

**Bidirectional controls.** U+202A–U+202E and the isolate controls U+2066–U+2069 change the direction in which surrounding text is displayed. A right-to-left override can make `exe.txt` display as `txt.exe`, which is exactly as useful for disguising things as it sounds.

**Tag characters.** The block at U+E0000–U+E007F mirrors ASCII invisibly. It was deprecated for its original purpose and later partly repurposed for regional flag emoji, but the practical property remains: you can encode an entire readable message that renders as absolutely nothing.

**Variation selectors.** U+FE00–U+FE0F and the supplement at U+E0100–U+E01EF select alternate glyph forms. U+FE0F is what makes an emoji render in colour rather than as a monochrome symbol.

**Unusual spaces.** Non-breaking space, en and em spaces, the Hangul filler (U+3164), the Braille blank (U+2800). These render as blank but are not U+0020, so they slip past naive matching.

**The byte-order mark**, U+FEFF, which frequently ends up embedded mid-string where it does nothing but cause confusion.

## Why they show up in your text

Usually by accident. Copying from a web page, a PDF, a word processor or a messaging app routinely drags along zero-width characters, non-breaking spaces and stray BOMs. Publishing systems insert them for typographic control.

They cause real, mundane problems: search fails to match, string comparison fails, diffs show changes where none are visible, and validation rejects input for no apparent reason.

## The emoji trap

Here is where most cleaners go wrong.

Zero-width joiners and variation selectors do essential work inside emoji. A family emoji is several people joined by ZWJs. The rainbow flag is a white flag joined to a rainbow. A red heart is a heart character plus U+FE0F.

Strip every ZWJ and every variation selector, and your family emoji becomes three separate people, and your coloured emoji turn monochrome. A tool that mangles content while claiming to clean it is not doing its job.

Our [checker](/claude-watermark-checker) classifies each occurrence in context. A ZWJ sitting between two pictographs is doing legitimate work and is preserved. A ZWJ between two letters is not, and is removed. The results distinguish the two, so you can see what was kept and why.

## What this has to do with AI

Not much, honestly, and that is the point.

People arrive looking for an "AI text watermark" and find articles about invisible characters. The two are unrelated. A statistical watermark is encoded in a model's word choices and leaves no special characters behind — removing invisible Unicode has no effect on it whatsoever. [Does Claude watermark text?](/guides/does-claude-watermark-text) works through this in detail.

Checking your text for hidden characters is still worth doing. Just do it for the real reasons: they are used to smuggle payloads, they are used to disguise text, and they break things constantly.

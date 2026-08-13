---
title: Does Claude watermark text?
metaTitle: 'Does Claude Watermark Text? An Honest Answer | NoWatermark'
description: What a statistical text watermark actually is, why it is not invisible Unicode, and what you can genuinely check in AI-written text.
summary: Two very different things get called "AI text watermarks". Only one of them is something you can find in your browser.
publishDate: 2026-08-13
order: 12
relatedTools: ['/claude-watermark-checker', '/claude-watermark-remover']
relatedGuides: ['/guides/can-you-remove-ai-watermarks']
faq:
  - q: Does Claude add invisible characters to its output?
    a: Not as a watermarking mechanism. Invisible characters do turn up in text from many sources — copied web pages, PDFs, editors — so checking is still worthwhile, but finding one is not evidence of AI authorship.
  - q: Can any tool detect AI-written text reliably?
    a: No. Statistical AI-text detectors have high false-positive rates and regularly misclassify human writing, particularly from non-native English speakers. We do not offer one.
  - q: What does your Claude tool actually do then?
    a: It finds and removes invisible Unicode characters, and it explains clearly that this is unrelated to statistical watermarking.
---

This question gets asked a lot, and it usually contains a hidden assumption worth unpicking: that "watermarked text" means there is something in the characters you could find and delete.

There are two separate concepts here, and conflating them is the source of most of the confusion.

## Concept one: invisible Unicode

Unicode contains many characters that render as nothing. Zero-width spaces, zero-width joiners and non-joiners, word joiners, the byte-order mark, bidirectional controls, and a block of "tag characters" originally intended for language tagging that can encode arbitrary text invisibly.

These are real characters. They occupy positions in a string, survive copy and paste, and can absolutely be used to hide a payload inside text that looks completely ordinary.

They are also **easy to find**, because you just have to look at the code points. That is what our [Claude Watermark Checker](/claude-watermark-checker) does, and it is a genuinely useful check — invisible characters show up in text copied from web pages, PDFs, word processors and messaging apps all the time, where they break search and comparison in maddening ways.

But their presence is not evidence of AI authorship, and their absence is not evidence of the opposite.

## Concept two: statistical watermarking

A statistical watermark works completely differently. At each step of generation, a language model chooses the next token from a probability distribution. A watermarking scheme uses a secret key to split the vocabulary into a favoured and a disfavoured set, and nudges selection toward the favoured set.

Over a long enough passage, the proportion of favoured tokens drifts away from what chance would produce. A detector holding the same key can measure that drift and calculate how surprising it would be in unwatermarked text.

The critical property: **this leaves no special characters behind**. The output is ordinary words in ordinary Unicode. The signal is in *which words were chosen*, distributed across the whole passage. There is nothing to strip out.

## What this means practically

Removing invisible Unicode does nothing to a statistical watermark. They operate on completely different layers — one on characters, the other on word choice.

No tool running in your browser can detect a statistical watermark, because detection requires the key. And a tool that cannot detect something cannot confirm it removed it.

So when our text tools say they do not claim to detect or remove statistical watermarks, that is not caution for its own sake. It is the only accurate thing to say.

## Has Anthropic deployed one?

Anthropic has not published a consumer-facing statistical text watermark for Claude. But note that the answer barely matters for what you can do: even if one existed, it would be undetectable to any browser tool, and it would be unaffected by removing hidden characters.

If you need text that is genuinely free of a statistical watermark, the only reliable approach is to rewrite it substantially in your own words — enough to change the token choices, not just paraphrase around them.

## The check that is worth running

Paste your text into the [checker](/claude-watermark-checker) anyway. Not because it will find an AI watermark, but because invisible characters and bidirectional controls are real, they do appear in text from all sorts of places, and they cause real problems. Our cleaner removes them while preserving the zero-width joiners that emoji legitimately need — so your family emoji survives the process intact.

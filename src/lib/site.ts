/**
 * Site structure and tool-page content.
 *
 * Every tool page shares one scanner implementation but carries its own
 * explanatory content (PRD §24). Nothing here may promise a capability the
 * matrix in ./signals.ts does not support.
 */

import { SITE_URL } from './site-url';
import type { SignalCategory } from './signals';

export const SITE = {
  name: 'NoWatermark',
  url: SITE_URL,
  descriptor: 'AI provenance & metadata tools',
  tagline: 'See what your file reveals.',
  contactEmail: 'hello@nowatermark.fyi',
} as const;

export interface FaqItem {
  q: string;
  a: string;
}

export interface Section {
  heading: string;
  body: string[];
}

export interface ToolDef {
  slug: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  /** Which interactive island the page mounts. */
  tool: 'image' | 'text';
  focus?: SignalCategory;
  navLabel?: string;
  /** Short label for tool cards. */
  cardTitle: string;
  cardBlurb: string;
  sections: Section[];
  faq: FaqItem[];
  relatedTools: string[];
  relatedGuides: string[];
  featured?: boolean;
}

const LOCAL_NOTE =
  'The scan runs entirely inside your browser. Your file is read from disk into memory, inspected there, and never uploaded — you can disconnect from the internet after this page loads and everything still works.';

export const TOOLS: ToolDef[] = [
  {
    slug: '/ai-watermark-checker',
    title: 'AI Watermark Checker — Check Images for AI Metadata | NoWatermark',
    description:
      'Check any JPG, PNG or WebP for AI provenance data, Content Credentials, generator metadata and hidden EXIF. Runs entirely in your browser.',
    h1: 'AI Watermark Checker',
    intro:
      'Find out what an image says about where it came from. This checker reads the provenance and metadata records inside a file and explains what each one means.',
    tool: 'image',
    focus: 'provenance',
    navLabel: 'AI Watermark Checker',
    cardTitle: 'AI Watermark Checker',
    cardBlurb: 'See every provenance and metadata signal in an image.',
    featured: true,
    sections: [
      {
        heading: 'What this tool actually checks',
        body: [
          'It reads the structured records embedded in the file: C2PA manifests, XMP packets, EXIF blocks, IPTC records, and the text chunks that image generators write into PNGs. These are the places where an AI tool leaves its name, and where a camera leaves your location.',
          'It reports what it finds and, just as importantly, what it cannot determine. A signal that no browser-side tool can measure is labelled "Unable to verify" rather than "Not detected", because those two statements mean very different things.',
        ],
      },
      {
        heading: 'Two different kinds of watermark',
        body: [
          'Most things people call an "AI watermark" are metadata: a name in a field, a manifest attached to the file. Metadata is separable from the picture, so it can be read and removed cleanly.',
          'A smaller category is embedded in the pixels themselves. Google\'s SynthID works this way. It survives metadata stripping, it survives re-saving, and detecting it requires the vendor\'s own detector. No tool that runs in your browser can tell you whether it is there.',
          'A checker that blurs this distinction is not being helpful. This one keeps them separate.',
        ],
      },
      { heading: 'Privacy', body: [LOCAL_NOTE] },
    ],
    faq: [
      {
        q: 'Can this detect every AI watermark?',
        a: 'No. It detects metadata-based provenance — C2PA, generator tags, XMP declarations and similar. It cannot detect watermarks embedded in pixel data, such as SynthID, and it will tell you so rather than implying the image is clear.',
      },
      {
        q: 'Does a clean result mean the image is not AI-generated?',
        a: 'No. It means no AI metadata was found. Metadata is easily removed — by a screenshot, by a social platform, or by a tool like this one — so its absence proves nothing about origin.',
      },
      {
        q: 'Is my image uploaded?',
        a: 'No. Processing happens in your browser. There is no upload endpoint, no server-side processing and no storage. You can verify this by opening your browser\'s network panel while you scan.',
      },
    ],
    relatedTools: ['/c2pa-checker', '/synthid-checker', '/chatgpt-watermark-checker', '/exif-remover'],
    relatedGuides: ['/guides/what-is-synthid', '/guides/what-is-c2pa', '/guides/can-you-remove-ai-watermarks'],
  },
  {
    slug: '/ai-watermark-remover',
    title: 'AI Watermark Remover — Remove AI Metadata From Images | NoWatermark',
    description:
      'Remove AI provenance metadata, Content Credentials, EXIF and generator tags from images in your browser. No upload, no re-encoding, no quality loss.',
    h1: 'AI Watermark Remover',
    intro:
      'Remove the metadata that identifies how an image was made — cleanly, without re-encoding the picture, and without sending the file anywhere.',
    tool: 'image',
    focus: 'provenance',
    navLabel: 'AI Watermark Remover',
    cardTitle: 'AI Watermark Remover',
    cardBlurb: 'Strip AI provenance metadata without touching image quality.',
    featured: true,
    sections: [
      {
        heading: 'What gets removed',
        body: [
          'C2PA manifests, XMP packets including AI-generation declarations, EXIF blocks, IPTC records, PNG text chunks holding prompts and settings, and JPEG comments. After cleaning, the result is scanned a second time and the report you see reflects that second scan, not an assumption.',
          'Two things are deliberately kept. The colour profile stays, because removing it visibly shifts colours. And if your photo carries a rotation tag, a single EXIF field is preserved so it does not display sideways — you can switch that off if you would rather strip everything.',
        ],
      },
      {
        heading: 'What cannot be removed',
        body: [
          'Watermarks encoded into pixel data survive metadata removal, because they are part of the image rather than attached to it. SynthID is the prominent example. This tool does not touch pixels at all, so it cannot affect them, and it will not claim otherwise.',
          'Content Credentials add a further wrinkle: some providers can re-attach provenance after the manifest is gone, by matching the image against a database using an invisible watermark or a content fingerprint. Removing the manifest removes it from your copy of the file. It does not remove it from their records.',
        ],
      },
      {
        heading: 'No re-encoding',
        body: [
          'The cleaner works at the container level. For a JPEG it rewrites the marker segments and copies the compressed scan data byte-for-byte; for a PNG it drops metadata chunks and leaves IDAT untouched; for a WebP it rewrites the chunk list and fixes the header. Your pixels come out bit-identical, so there is no generational quality loss from cleaning.',
        ],
      },
    ],
    faq: [
      {
        q: 'Will this make my image undetectable as AI?',
        a: 'No, and you should be sceptical of any tool that claims it will. Removing metadata removes one category of evidence. Pixel-level watermarks, model-specific artefacts and statistical detectors are unaffected.',
      },
      {
        q: 'Does cleaning reduce image quality?',
        a: 'No. The compressed image data is copied unchanged — nothing is decoded or re-compressed. The file gets smaller only because the metadata is gone.',
      },
      {
        q: 'Is it legal to remove this metadata?',
        a: 'For your own files, generally yes. Removing attribution or provenance information from work you do not own may be unlawful in some jurisdictions, and some platforms require AI disclosure regardless of metadata. You are responsible for how you use the output.',
      },
    ],
    relatedTools: ['/ai-metadata-remover', '/exif-remover', '/c2pa-remover', '/ai-watermark-checker'],
    relatedGuides: ['/guides/can-you-remove-ai-watermarks', '/guides/what-is-c2pa', '/guides/how-to-remove-exif-data'],
  },
  {
    slug: '/chatgpt-watermark-checker',
    title: 'ChatGPT Watermark Checker — Inspect ChatGPT Image Metadata | NoWatermark',
    description:
      'Check whether an image carries ChatGPT or DALL·E metadata, C2PA Content Credentials or generator tags. Free, private, runs in your browser.',
    h1: 'ChatGPT Watermark Checker',
    intro:
      'Check an image for the metadata OpenAI attaches to generated pictures, including C2PA Content Credentials and generator tags.',
    tool: 'image',
    focus: 'provenance',
    navLabel: 'ChatGPT Checker',
    cardTitle: 'ChatGPT Checker',
    cardBlurb: 'Look for OpenAI provenance data in an image.',
    featured: true,
    sections: [
      {
        heading: 'What ChatGPT puts in an image',
        body: [
          'Images generated through ChatGPT have generally shipped with C2PA Content Credentials — a signed manifest naming the generating tool — and in some cases XMP fields declaring the content as synthetic, using the IPTC value trainedAlgorithmicMedia.',
          'This is metadata, sitting alongside the picture rather than inside it. It is easy to read, and easy to lose: many platforms strip it during upload, and a screenshot discards it entirely.',
        ],
      },
      {
        heading: 'What a negative result tells you',
        body: [
          'Very little, on its own. If an image passed through a social platform, was screenshotted, or was saved by an editor that does not carry credentials forward, the metadata is gone even though the image is still AI-generated.',
          'That asymmetry matters: finding Content Credentials is meaningful evidence, but not finding them is close to no evidence at all.',
        ],
      },
      { heading: 'Privacy', body: [LOCAL_NOTE] },
    ],
    faq: [
      {
        q: 'Does ChatGPT put an invisible watermark in images?',
        a: 'OpenAI has focused publicly on C2PA Content Credentials, which are metadata. Providers do not always document pixel-level watermarking, so absence of metadata should not be read as proof that nothing else is present.',
      },
      {
        q: 'Why does my ChatGPT image show no metadata?',
        a: 'Most likely it was stripped somewhere along the way — by a messaging app, a social platform, a screenshot, or an editor. That is extremely common.',
      },
      {
        q: 'Can I remove what you find?',
        a: 'Yes, for everything metadata-based. Use the AI Watermark Remover, which cleans the file and then re-scans it to show you what actually went.',
      },
    ],
    relatedTools: ['/chatgpt-watermark-remover', '/c2pa-checker', '/ai-watermark-checker', '/content-credentials-checker'],
    relatedGuides: ['/guides/does-chatgpt-watermark-images', '/guides/what-is-c2pa', '/guides/how-to-check-ai-image-metadata'],
  },
  {
    slug: '/chatgpt-watermark-remover',
    title: 'ChatGPT Watermark Remover — Remove ChatGPT Image Metadata | NoWatermark',
    description:
      'Remove ChatGPT and DALL·E metadata, C2PA Content Credentials and EXIF from images locally in your browser. No upload and no quality loss.',
    h1: 'ChatGPT Watermark Remover',
    intro:
      'Remove the Content Credentials and generator metadata attached to ChatGPT images, without re-encoding the picture.',
    tool: 'image',
    focus: 'provenance',
    cardTitle: 'ChatGPT Remover',
    cardBlurb: 'Clear OpenAI provenance metadata from an image.',
    sections: [
      {
        heading: 'What this removes',
        body: [
          'The C2PA manifest, XMP declarations including trainedAlgorithmicMedia, and any EXIF or generator fields naming the tool. The cleaned file is re-scanned automatically and the report shows what a fresh scan can no longer find.',
        ],
      },
      {
        heading: 'An honest limit',
        body: [
          'Content Credentials are designed to be recoverable. Where a provider supports durable credentials, provenance can be re-associated with an image later using an invisible watermark or a content fingerprint held in their database — even though the manifest is no longer in your file.',
          'So this removes the credential from the file you hold. It does not erase the fact that the image was generated, and it cannot reach anyone else\'s records.',
        ],
      },
    ],
    faq: [
      {
        q: 'Will removing metadata make an AI image pass as a photograph?',
        a: 'No. It removes one signal. Detection approaches that look at the pixels are unaffected, and disclosure obligations do not disappear because a field was deleted.',
      },
      {
        q: 'Does this change the image?',
        a: 'Not a single pixel. The compressed image data is copied unchanged; only the metadata segments are dropped.',
      },
    ],
    relatedTools: ['/chatgpt-watermark-checker', '/ai-watermark-remover', '/c2pa-remover', '/ai-metadata-remover'],
    relatedGuides: ['/guides/does-chatgpt-watermark-images', '/guides/can-you-remove-ai-watermarks'],
  },
  {
    slug: '/claude-watermark-checker',
    title: 'Claude Watermark Checker — Check Text for Hidden Characters | NoWatermark',
    description:
      'Check text for invisible Unicode characters, zero-width spaces and bidirectional controls. Explains honestly what a statistical watermark is and why this cannot detect one.',
    h1: 'Claude Watermark Checker',
    intro:
      'Check pasted text for invisible characters. This finds hidden Unicode — and explains clearly why that is not the same thing as a statistical text watermark.',
    tool: 'text',
    focus: 'hidden',
    navLabel: 'Claude Checker',
    cardTitle: 'Claude Checker',
    cardBlurb: 'Find invisible characters hiding in text.',
    featured: true,
    sections: [
      {
        heading: 'Start with the honest answer',
        body: [
          'If you are here because you read that AI text carries a hidden watermark, the important thing to know is that there are two unrelated ideas with similar names.',
          'The first is invisible Unicode: real characters such as zero-width spaces that render as nothing but survive copy and paste. This tool finds and removes them, and they genuinely do appear in text pasted from all sorts of sources.',
          'The second is a statistical watermark, which biases a model\'s word choices in a pattern a matching detector can recognise later. It leaves no special characters at all. Nothing running in your browser can detect it, and this tool does not claim to.',
        ],
      },
      {
        heading: 'Why invisible characters matter anyway',
        body: [
          'Zero-width characters and Unicode tag characters can carry a payload inside otherwise ordinary text, and bidirectional overrides can make text display in a different order from how it is stored — a trick used to disguise filenames and links.',
          'They also break search, matching and diffing in confusing ways. Finding them is useful whatever their origin.',
        ],
      },
      {
        heading: 'Emoji are safe',
        body: [
          'Zero-width joiners and variation selectors do real work inside emoji: they are what turn separate figures into a single family emoji, and what make a heart render in colour. A naive cleaner breaks those. This one recognises them and leaves them alone.',
        ],
      },
    ],
    faq: [
      {
        q: 'Does Claude watermark its text?',
        a: 'Anthropic has not published a consumer-facing statistical text watermark for Claude. Regardless, a statistical watermark would be invisible to a browser tool like this one — so this checker reports only what it can genuinely measure: hidden characters.',
      },
      {
        q: 'Can you detect AI-written text?',
        a: 'No, and this tool does not attempt it. Statistical AI-text detectors are unreliable and frequently misclassify human writing. We would rather report nothing than report a guess.',
      },
      {
        q: 'Is my text sent anywhere?',
        a: 'No. It stays in the page. There is no API call, and no analytics event carries your text or anything derived from it.',
      },
    ],
    relatedTools: ['/claude-watermark-remover', '/ai-watermark-checker'],
    relatedGuides: ['/guides/does-claude-watermark-text', '/guides/can-you-remove-ai-watermarks'],
  },
  {
    slug: '/claude-watermark-remover',
    title: 'Claude Watermark Remover — Remove Hidden Characters From Text | NoWatermark',
    description:
      'Remove zero-width spaces, bidirectional controls and hidden Unicode from text, in your browser. Includes an honest explanation of what cannot be removed.',
    h1: 'Claude Watermark Remover',
    intro:
      'Remove invisible Unicode characters from pasted text. Read the limits below first — they are the important part of this page.',
    tool: 'text',
    focus: 'hidden',
    cardTitle: 'Claude Remover',
    cardBlurb: 'Strip hidden characters out of text safely.',
    sections: [
      {
        heading: 'What this can remove',
        body: [
          'Zero-width spaces, joiners and non-joiners, word joiners, the byte-order mark, bidirectional embedding and override controls, Unicode tag characters, and stray control characters. Unusual space characters are normalised to ordinary spaces.',
          'Emoji sequences are preserved: the joiners and variation selectors that emoji depend on are recognised and kept, so cleaning does not silently mangle them.',
        ],
      },
      {
        heading: 'What this cannot remove',
        body: [
          'A statistical watermark, if one is present, is encoded in which words a model chose — not in any character you could delete. Removing invisible Unicode does nothing to it. No client-side tool can detect one, so none can confirm its removal either.',
          'If you need text that is genuinely free of a statistical watermark, the only reliable approach is substantially rewriting it yourself.',
        ],
      },
    ],
    faq: [
      {
        q: 'Will this make AI text undetectable?',
        a: 'No. It removes invisible characters, which is a real and useful thing to do, but it is unrelated to how AI-text detection works.',
      },
      {
        q: 'Will it break my emoji?',
        a: 'No. Zero-width joiners inside emoji sequences and variation selectors attached to pictographs are preserved by default.',
      },
    ],
    relatedTools: ['/claude-watermark-checker', '/ai-watermark-remover'],
    relatedGuides: ['/guides/does-claude-watermark-text'],
  },
  {
    slug: '/synthid-checker',
    title: 'SynthID Checker — What You Can and Cannot Check | NoWatermark',
    description:
      'An honest look at SynthID: what it is, why no browser tool can detect it, and what you can actually check in a Google AI image.',
    h1: 'SynthID Checker',
    intro:
      'SynthID cannot be detected by any tool running in your browser, including this one. Here is what that means, and what you can genuinely check instead.',
    tool: 'image',
    focus: 'provenance',
    navLabel: 'SynthID Checker',
    cardTitle: 'SynthID Checker',
    cardBlurb: 'Understand SynthID, and check what is actually checkable.',
    sections: [
      {
        heading: 'Why this page does not have a detector',
        body: [
          'SynthID embeds a signal directly into image content in a way designed to survive resizing, cropping, compression and screenshots. Detecting it requires Google\'s own detector and the corresponding model keys. That capability is not available to a web page.',
          'We could show you a confident-looking result anyway. We would rather tell you the truth: the scanner below reports SynthID as "Unable to verify", every time, for every image. That status never changes, because our ability to measure it never changes.',
        ],
      },
      {
        heading: 'What you can check',
        body: [
          'Plenty, as it turns out. Google AI images often carry metadata that is entirely readable: IPTC DigitalSourceType declarations, XMP fields naming Gemini or Imagen, C2PA manifests, and ordinary EXIF. The scanner below finds all of it.',
          'If you want to know whether a specific file has been through a Google AI product, that metadata is usually the practical answer — while remembering that its absence proves nothing.',
        ],
      },
      {
        heading: 'The honest bottom line',
        body: [
          'Assume any image from a Google AI product carries SynthID, whatever metadata cleaning reports. Cleaning metadata does not touch it, and no result on this site should be read as evidence that it is gone.',
        ],
      },
    ],
    faq: [
      {
        q: 'Can I remove SynthID?',
        a: 'Not with this tool, and not with any metadata cleaner. SynthID lives in the pixels; metadata cleaning does not modify pixels at all. Heavy editing may degrade any pixel watermark, but nothing here can confirm that, so we make no such claim.',
      },
      {
        q: 'Why does the scanner always say "Unable to verify"?',
        a: 'Because that is accurate. Saying "not detected" would imply we looked and found nothing, when in fact we have no way to look.',
      },
      {
        q: 'Is there a real SynthID detector?',
        a: 'Google operates detection for its own content through its own tooling. There is no browser-side equivalent, and anything claiming to be one is not doing what it says.',
      },
    ],
    relatedTools: ['/synthid-remover', '/ai-watermark-checker', '/c2pa-checker'],
    relatedGuides: ['/guides/what-is-synthid', '/guides/c2pa-vs-synthid', '/guides/can-you-remove-ai-watermarks'],
  },
  {
    slug: '/synthid-remover',
    title: 'SynthID Remover — Why It Does Not Exist | NoWatermark',
    description:
      'There is no browser-based SynthID remover, and tools claiming otherwise are misleading you. Here is what is actually possible, explained plainly.',
    h1: 'Can you remove SynthID?',
    intro:
      'Short answer: not with a metadata tool, and not in your browser. This page explains why, and what you can actually do.',
    tool: 'image',
    focus: 'provenance',
    cardTitle: 'SynthID Removal',
    cardBlurb: 'The honest answer about removing SynthID.',
    sections: [
      {
        heading: 'Why metadata cleaning cannot touch it',
        body: [
          'Metadata and image content are separate things. A metadata cleaner rewrites the container — the segments and chunks wrapped around the compressed picture — and leaves the picture itself byte-for-byte identical. That is a feature: it is what makes cleaning lossless.',
          'It also means that anything encoded in the picture is completely untouched. SynthID is encoded in the picture.',
        ],
      },
      {
        heading: 'What about heavy editing?',
        body: [
          'Pixel watermarks are built to survive ordinary transformations, and are typically robust to resizing, cropping, compression and colour adjustment. Editing aggressive enough to reliably destroy such a watermark would visibly damage the image, and no browser tool can verify success either way.',
          'Which is the real point: even if a transformation did degrade the watermark, nothing here could confirm it. A tool that cannot measure an outcome should not sell you that outcome.',
        ],
      },
      {
        heading: 'What you can do here',
        body: [
          'You can strip every metadata-based signal from the file, and see exactly which ones went, verified by a second scan. That is genuinely useful for privacy — GPS, device, timestamps and generator tags all go — and it is honestly bounded.',
        ],
      },
    ],
    faq: [
      {
        q: 'Other sites offer a SynthID remover. Are they lying?',
        a: 'They are at best removing metadata and describing it inaccurately. If a tool cannot detect SynthID, it cannot verify that it removed it, so any confirmation it shows you is not based on measurement.',
      },
      {
        q: 'So what is the scanner below for?',
        a: 'Removing everything that genuinely can be removed, and telling you plainly what remains unverifiable.',
      },
    ],
    relatedTools: ['/synthid-checker', '/ai-watermark-remover', '/ai-metadata-remover'],
    relatedGuides: ['/guides/what-is-synthid', '/guides/can-you-remove-ai-watermarks'],
  },
  {
    slug: '/c2pa-checker',
    title: 'C2PA Checker — Inspect Content Credentials in an Image | NoWatermark',
    description:
      'Check an image for a C2PA manifest and read its claim generator and assertions. Runs locally in your browser, with no signature-validation overclaiming.',
    h1: 'C2PA Checker',
    intro:
      'Check whether an image carries a C2PA manifest — the provenance record behind Content Credentials — and see what it says.',
    tool: 'image',
    focus: 'provenance',
    navLabel: 'C2PA Checker',
    cardTitle: 'C2PA Checker',
    cardBlurb: 'Detect and read Content Credentials manifests.',
    featured: true,
    sections: [
      {
        heading: 'What C2PA is',
        body: [
          'C2PA is an open standard for recording where a piece of media came from and what happened to it. A manifest embedded in the file can name the tool that created it, list the edits applied, and carry a cryptographic signature binding those claims to an issuer.',
          'In images it is stored as JUMBF boxes: an APP11 segment in a JPEG, a caBX chunk in a PNG, a dedicated chunk in a WebP. This tool finds those and reads what it can from them.',
        ],
      },
      {
        heading: 'Present is not the same as valid',
        body: [
          'This checker reports a manifest as present and shows details such as the claim generator. It does not verify the cryptographic signature against a trust list, which would require current trust data and a full validator.',
          'So you will never see "valid" or "invalid" here — only "detected", with what we could read. Reporting a signature as valid without actually validating it would be worse than useless.',
        ],
      },
      {
        heading: 'Durable Content Credentials',
        body: [
          'It is worth knowing that C2PA is designed with recovery in mind. Where a provider supports durable credentials, provenance can be re-associated with an image later using an invisible watermark or content fingerprint, even after the manifest has been stripped.',
          'Removing a manifest therefore removes it from your file, not from the world.',
        ],
      },
    ],
    faq: [
      {
        q: 'Why does the manifest show no details?',
        a: 'Manifests are CBOR inside nested boxes, and this tool reads a deliberately small subset — enough to confirm presence and usually identify the generator. When a field cannot be read, it is reported as unavailable rather than guessed at.',
      },
      {
        q: 'Does a missing manifest mean the image is untouched?',
        a: 'No. Manifests are commonly stripped by platforms and editors that do not support them. Absence tells you very little.',
      },
      {
        q: 'Can I remove a C2PA manifest?',
        a: 'Yes — see the C2PA Remover. The removal is verified by re-scanning the cleaned file.',
      },
    ],
    relatedTools: ['/c2pa-remover', '/content-credentials-checker', '/ai-watermark-checker', '/chatgpt-watermark-checker'],
    relatedGuides: ['/guides/what-is-c2pa', '/guides/c2pa-vs-synthid', '/guides/what-are-content-credentials'],
  },
  {
    slug: '/c2pa-remover',
    title: 'C2PA Remover — Remove Content Credentials From an Image | NoWatermark',
    description:
      'Remove the C2PA manifest and Content Credentials from JPG, PNG and WebP files in your browser, with removal verified by a second scan.',
    h1: 'C2PA Remover',
    intro:
      'Remove a C2PA manifest from an image. The cleaned file is re-scanned automatically so you can see the manifest is genuinely gone.',
    tool: 'image',
    focus: 'provenance',
    cardTitle: 'C2PA Remover',
    cardBlurb: 'Strip Content Credentials manifests from a file.',
    sections: [
      {
        heading: 'How removal works',
        body: [
          'The manifest lives in a dedicated container structure — an APP11 segment, a caBX chunk, or a WebP chunk. Removing it is a matter of rewriting the container without that structure, which leaves the compressed image data untouched.',
          'Because nothing is decoded or re-compressed, the picture is bit-identical afterwards. Only the file size changes.',
        ],
      },
      {
        heading: 'What removal does not achieve',
        body: [
          'It removes the record from this copy of the file. Where a provider supports durable credentials, the provenance may still be recoverable from their side using an invisible watermark or fingerprint. And any pixel-level watermark is entirely unaffected.',
          'Removing provenance from content you do not own may also carry legal risk in some jurisdictions. That is your call to make, but it should be an informed one.',
        ],
      },
    ],
    faq: [
      {
        q: 'How do I know it worked?',
        a: 'The tool scans its own output and shows you the before-and-after. A signal is only marked as removed when the second scan can no longer find it.',
      },
      {
        q: 'Does this affect image quality?',
        a: 'No. The image data is copied unchanged.',
      },
    ],
    relatedTools: ['/c2pa-checker', '/ai-watermark-remover', '/ai-metadata-remover'],
    relatedGuides: ['/guides/what-is-c2pa', '/guides/what-are-content-credentials'],
  },
  {
    slug: '/content-credentials-checker',
    title: 'Content Credentials Checker — Read Image Provenance | NoWatermark',
    description:
      'Check an image for Content Credentials and see what the attached provenance record says. Free, private and entirely browser-based.',
    h1: 'Content Credentials Checker',
    intro:
      'Content Credentials are the consumer-facing name for C2PA provenance. This checks whether an image carries one and shows what it contains.',
    tool: 'image',
    focus: 'provenance',
    cardTitle: 'Content Credentials',
    cardBlurb: 'Read the provenance record attached to an image.',
    sections: [
      {
        heading: 'Credentials, in plain terms',
        body: [
          'A Content Credential is a record travelling with a file that says where it came from: which tool made it, sometimes which edits were applied, and who vouches for that record. The idea is that provenance should be attached to media rather than inferred from it.',
          'Under the hood it is a C2PA manifest, so this page and the C2PA Checker read exactly the same structure — they differ in how they explain it.',
        ],
      },
      {
        heading: 'Why credentials go missing',
        body: [
          'Credentials are fragile in practice. Platforms that re-encode uploads often discard them, editors that do not support C2PA drop them, and a screenshot loses everything. So a missing credential usually reflects the journey a file took, not a claim about its origin.',
          'This is the core weakness of provenance-by-attachment, and the reason durable credentials — recoverable via watermark or fingerprint — exist at all.',
        ],
      },
    ],
    faq: [
      {
        q: 'Is this different from the C2PA Checker?',
        a: 'It reads the same data. Content Credentials is the public-facing brand; C2PA is the underlying standard.',
      },
      {
        q: 'Can you tell me whether the credential is trustworthy?',
        a: 'No. Signature validation against a trust list is out of scope here, so presence is reported without any judgement about validity.',
      },
    ],
    relatedTools: ['/c2pa-checker', '/c2pa-remover', '/ai-watermark-checker'],
    relatedGuides: ['/guides/what-are-content-credentials', '/guides/what-is-c2pa'],
  },
  {
    slug: '/ai-metadata-remover',
    title: 'AI Metadata Remover — Strip Generator Tags From Images | NoWatermark',
    description:
      'Remove AI generator metadata, prompts and settings from PNG, JPG and WebP images. Includes Stable Diffusion parameters and ComfyUI workflows.',
    h1: 'AI Metadata Remover',
    intro:
      'Remove the metadata that AI image tools write into their output — including the prompt, the model, the sampler settings and the whole workflow graph.',
    tool: 'image',
    focus: 'metadata',
    navLabel: 'Metadata Remover',
    cardTitle: 'AI Metadata Remover',
    cardBlurb: 'Remove prompts, model names and generation settings.',
    featured: true,
    sections: [
      {
        heading: 'Your prompt is probably in the file',
        body: [
          'PNG files can carry arbitrary text records, and generation tools use them liberally. Stable Diffusion interfaces write the full prompt, negative prompt, seed, sampler, steps and model hash into a text chunk called "parameters". ComfyUI stores an entire workflow graph under "prompt" and "workflow". InvokeAI and NovelAI have their own equivalents.',
          'None of this is visible when you look at the image, and all of it travels with the file when you share it.',
        ],
      },
      {
        heading: 'What gets removed',
        body: [
          'Every PNG text chunk, JPEG comment, XMP packet, EXIF block, IPTC record and C2PA manifest. The colour profile is kept, because removing it changes how the image looks.',
          'After cleaning, the result is scanned again and you see the difference — including confirmation that the prompt text is no longer present anywhere in the file.',
        ],
      },
    ],
    faq: [
      {
        q: 'Does this remove the prompt from a Stable Diffusion PNG?',
        a: 'Yes. The parameters chunk and every other text record is removed, and the re-scan confirms it.',
      },
      {
        q: 'Will the image still open normally?',
        a: 'Yes. Only metadata chunks are dropped; the header, palette, image data and colour profile are preserved.',
      },
      {
        q: 'What about the workflow in a ComfyUI image?',
        a: 'Removed as well — it is stored in the same kind of text chunk.',
      },
    ],
    relatedTools: ['/exif-remover', '/ai-watermark-remover', '/ai-watermark-checker'],
    relatedGuides: ['/guides/how-to-check-ai-image-metadata', '/guides/how-to-remove-exif-data'],
  },
  {
    slug: '/exif-remover',
    title: 'EXIF Remover — Remove Photo Metadata and GPS Online | NoWatermark',
    description:
      'Remove EXIF data, GPS location, camera details and timestamps from JPG, PNG and WebP photos. Runs in your browser with no upload and no quality loss.',
    h1: 'EXIF Remover',
    intro:
      'Remove the location, device and timestamp data your camera writes into photographs — without uploading anything and without re-compressing the image.',
    tool: 'image',
    focus: 'privacy',
    navLabel: 'EXIF Remover',
    cardTitle: 'EXIF Remover',
    cardBlurb: 'Strip GPS, device and timestamp data from photos.',
    featured: true,
    sections: [
      {
        heading: 'What EXIF gives away',
        body: [
          'GPS coordinates precise enough to identify a home or a workplace. The make and model of your camera or phone, sometimes with a serial number in the maker note. The exact date and time the shutter fired. The software used to edit it, and occasionally your name in the artist or copyright field.',
          'None of it is visible in the picture, and most people never realise it is travelling with the file.',
        ],
      },
      {
        heading: 'The rotation problem',
        body: [
          'Most EXIF removers have a bug worth knowing about. Phones usually record the camera\'s physical orientation in an EXIF tag rather than rotating the pixels, and viewers apply that rotation when displaying the image. Strip all EXIF and the tag goes with it, so a portrait photo suddenly displays sideways.',
          'This tool checks for that case. If your photo carries a rotation, it keeps exactly one field — the orientation — and tells you it did. Everything else goes. You can switch that off if you would rather have nothing at all.',
        ],
      },
      {
        heading: 'No quality loss',
        body: [
          'Many online EXIF removers decode and re-encode the image, which loses quality every time. This one does not decode anything: the compressed image data is copied byte-for-byte and only the metadata is rewritten. Run it a hundred times and the pixels are identical.',
        ],
      },
    ],
    faq: [
      {
        q: 'Does this remove GPS location?',
        a: 'Yes. GPS is part of the EXIF block, and the re-scan afterwards confirms it is gone.',
      },
      {
        q: 'Will my photo be rotated incorrectly afterwards?',
        a: 'No, not by default. If the photo carries a rotation tag, a minimal orientation record is preserved so it displays correctly, and the report tells you that one field was kept.',
      },
      {
        q: 'Does it work on PNG and WebP too?',
        a: 'Yes. PNG stores EXIF in an eXIf chunk and WebP in an EXIF chunk; both are handled, along with their other metadata containers.',
      },
      {
        q: 'Is the photo uploaded to a server?',
        a: 'No. It is read and rewritten in your browser. No file is transmitted, which you can confirm in your browser\'s network panel.',
      },
    ],
    relatedTools: ['/ai-metadata-remover', '/ai-watermark-remover', '/ai-watermark-checker'],
    relatedGuides: ['/guides/how-to-remove-exif-data', '/guides/how-to-check-ai-image-metadata'],
  },
];

export function toolBySlug(slug: string): ToolDef | undefined {
  return TOOLS.find((t) => t.slug === slug);
}

export const FEATURED_TOOLS = TOOLS.filter((t) => t.featured);

/** Tools listed in the header menu. */
export const NAV_TOOLS = TOOLS.filter((t) => t.navLabel);

export interface FooterLink {
  href: string;
  label: string;
}

export const FOOTER_TOOLS: FooterLink[] = [
  { href: '/ai-watermark-checker', label: 'AI Watermark Checker' },
  { href: '/chatgpt-watermark-checker', label: 'ChatGPT Checker' },
  { href: '/claude-watermark-checker', label: 'Claude Checker' },
  { href: '/synthid-checker', label: 'SynthID Checker' },
  { href: '/c2pa-checker', label: 'C2PA Checker' },
  { href: '/ai-metadata-remover', label: 'Metadata Remover' },
  { href: '/exif-remover', label: 'EXIF Remover' },
];

export const FOOTER_LEARN: FooterLink[] = [
  { href: '/guides/what-is-synthid', label: 'What is SynthID?' },
  { href: '/guides/what-is-c2pa', label: 'What is C2PA?' },
  { href: '/guides/does-chatgpt-watermark-images', label: 'Does ChatGPT watermark images?' },
  { href: '/guides/does-claude-watermark-text', label: 'Does Claude watermark text?' },
];

export const FOOTER_SITE: FooterLink[] = [
  { href: '/methodology', label: 'Methodology' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/about', label: 'About' },
];

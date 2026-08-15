/**
 * The capability matrix (PRD §45) and the canonical signal vocabulary.
 *
 * This is the single place that decides what NoWatermark claims it can do.
 * Scanners, cleaners, the UI and the /methodology page all read from here, so
 * a product claim can never drift from the implementation. Never hard-code a
 * removal claim in a component.
 */

export type SignalCategory = 'provenance' | 'metadata' | 'privacy' | 'hidden';

/**
 * The three exposure axes (V2 R4).
 *
 * These answer three different questions that users conflate, and that a single
 * score would destroy:
 *
 *   provenance — does this file say where it came from?
 *   privacy    — does this file say something about *you*?
 *   detector   — could something still identify this as machine-made?
 *
 * A file can be spotless on one axis and loud on another, and averaging them
 * into one number would be a fabrication. They are reported separately and
 * never combined. `category` is about where a signal lives in the file; `axis`
 * is about what it exposes. They are not the same question.
 */
export type ExposureAxis = 'provenance' | 'privacy' | 'detector';

export const AXIS_LABEL: Record<ExposureAxis, string> = {
  provenance: 'Provenance exposure',
  privacy: 'Privacy exposure',
  detector: 'Detector risk',
};

export const AXIS_DESCRIPTION: Record<ExposureAxis, string> = {
  provenance: 'What this file declares about the tool or model that made it.',
  privacy: 'What this file reveals about you, your device, and where you were.',
  detector: 'What might still mark this as machine-made after cleaning.',
};

/**
 * The four outcomes a signal can have (V2 R2).
 *
 * The last two are the ones that matter. "Detected only" means the signal is
 * there and we will not pretend we can take it out. "Unable to verify" means we
 * cannot tell whether it is there at all — that is not a "no", and it will
 * never become one.
 */
export type SignalVerdict =
  | 'removable_verified'
  | 'removable_unverified'
  | 'detect_only'
  | 'unable_to_verify';

export const VERDICT_LABEL: Record<SignalVerdict, string> = {
  removable_verified: 'Removable, verified',
  removable_unverified: 'Removable, not verified',
  detect_only: 'Detected only',
  unable_to_verify: 'Unable to verify',
};

export function verdictOf(s: Pick<SignalSpec, 'detect' | 'remove' | 'verify'>): SignalVerdict {
  if (!s.detect) return 'unable_to_verify';
  if (s.remove && s.verify) return 'removable_verified';
  if (s.remove) return 'removable_unverified';
  return 'detect_only';
}

export interface SignalSpec {
  id: string;
  label: string;
  category: SignalCategory;
  /** Which of the three exposure questions this signal answers (R4). */
  axis: ExposureAxis;
  /** One-line description shown next to the result. */
  description: string;
  /** Expanded explanation for the disclosure panel (PRD §16). */
  detail: string;
  /** Can we find it? */
  detect: boolean;
  /** Can we remove it? */
  remove: boolean;
  /** Can we confirm afterwards that it is gone? */
  verify: boolean;
}

function spec(s: SignalSpec): SignalSpec {
  return s;
}

export const SIGNALS = {
  c2pa: spec({
    id: 'c2pa',
    axis: 'provenance',
    label: 'C2PA / Content Credentials',
    category: 'provenance',
    description: 'A signed record of where a file came from and how it was edited.',
    detail:
      'C2PA is an open provenance standard. A manifest embedded in the file can record the tool that produced it, the edits applied, and who signed the record. NoWatermark detects and reads the manifest locally, but does not verify its cryptographic signature, so it reports the manifest as present rather than valid. Removing the manifest deletes it from this file. Some services can still re-associate provenance using an invisible watermark or a content fingerprint held in their own database — NoWatermark cannot detect or affect that.',
    detect: true,
    remove: true,
    verify: true,
  }),
  aiGenerator: spec({
    id: 'ai-generator',
    axis: 'provenance',
    label: 'AI generator metadata',
    category: 'provenance',
    description: 'Tags naming the AI tool or model that produced the image.',
    detail:
      'Generators frequently record themselves in ordinary metadata: an XMP DigitalSourceType of trainedAlgorithmicMedia, a Software or CreatorTool value naming the product, or PNG text chunks holding the prompt and settings. These are plain metadata fields, so they can be removed completely and the removal can be verified.',
    detect: true,
    remove: true,
    verify: true,
  }),
  synthid: spec({
    id: 'synthid',
    axis: 'detector',
    label: 'SynthID',
    category: 'provenance',
    description: "Google's imperceptible watermark, embedded in the pixels themselves.",
    detail:
      'SynthID embeds a signal directly into image content rather than into metadata, and detecting it requires Google\'s own detector. NoWatermark cannot detect it, cannot remove it, and — importantly — cannot tell you that it is absent. Any image from a Google AI product should be assumed to carry it regardless of what metadata cleaning reports.',
    detect: false,
    remove: false,
    verify: false,
  }),
  exif: spec({
    id: 'exif',
    axis: 'privacy',
    label: 'EXIF',
    category: 'metadata',
    description: 'Camera, device, timestamp and settings data.',
    detail:
      'EXIF is the metadata block cameras and phones write into photographs. It commonly holds the device make and model, timestamps, exposure settings, lens information and — when location services were enabled — GPS coordinates. It is fully removable, with one deliberate exception: the Orientation tag, which tells viewers how to rotate the image.',
    detect: true,
    remove: true,
    verify: true,
  }),
  xmp: spec({
    id: 'xmp',
    axis: 'provenance',
    label: 'XMP',
    category: 'metadata',
    description: "Adobe's XML metadata block, used by editors and AI tools.",
    detail:
      'XMP is an XML packet embedded in the file. Editing software uses it for edit history and rights information; AI tools increasingly use it to declare that content is synthetic. It can span several segments in a JPEG, all of which NoWatermark locates and removes.',
    detect: true,
    remove: true,
    verify: true,
  }),
  iptc: spec({
    id: 'iptc',
    axis: 'privacy',
    label: 'IPTC',
    category: 'metadata',
    description: 'Captions, keywords and rights information used by publishers.',
    detail:
      'IPTC data is stored in a Photoshop resource block and is used across the publishing industry for captions, credits, keywords and usage terms. It is fully removable.',
    detect: true,
    remove: true,
    verify: true,
  }),
  embeddedText: spec({
    id: 'embedded-text',
    axis: 'provenance',
    label: 'Embedded text records',
    category: 'metadata',
    description: 'PNG text chunks and JPEG comments, often holding prompts.',
    detail:
      'PNG files can carry arbitrary text records, and image generators use them heavily — Stable Diffusion writes the full prompt and sampler settings into a "parameters" chunk, and ComfyUI stores an entire workflow graph. JPEG comment segments are the equivalent. All of it is removable.',
    detect: true,
    remove: true,
    verify: true,
  }),
  gps: spec({
    id: 'gps',
    axis: 'privacy',
    label: 'GPS location',
    category: 'privacy',
    description: 'Coordinates recorded when the photo was taken.',
    detail:
      'GPS coordinates in EXIF can identify a home, workplace or route with high precision. They are removed along with the rest of the EXIF block.',
    detect: true,
    remove: true,
    verify: true,
  }),
  timestamp: spec({
    id: 'timestamp',
    axis: 'privacy',
    label: 'Timestamps',
    category: 'privacy',
    description: 'When the file was created or last modified.',
    detail:
      'Creation and modification timestamps can reveal working patterns and can link a file to other files made at the same moment. Removed with the metadata blocks that carry them.',
    detect: true,
    remove: true,
    verify: true,
  }),
  device: spec({
    id: 'device',
    axis: 'privacy',
    label: 'Device',
    category: 'privacy',
    description: 'Camera or phone make and model.',
    detail:
      'Device identifiers narrow down who produced a file, and maker-note blocks can include serial numbers. Removed with EXIF.',
    detect: true,
    remove: true,
    verify: true,
  }),
  software: spec({
    id: 'software',
    axis: 'privacy',
    label: 'Software',
    category: 'privacy',
    description: 'The application that created or last edited the file.',
    detail:
      'The Software and CreatorTool fields name the editing or generation tool. This is often the clearest indication that an image came from an AI product. Removed with EXIF and XMP.',
    detect: true,
    remove: true,
    verify: true,
  }),
  author: spec({
    id: 'author',
    axis: 'privacy',
    label: 'Author and rights',
    category: 'privacy',
    description: 'Creator name, copyright and ownership fields.',
    detail:
      'Artist, copyright, creator and rights fields identify a person or organisation. Note that stripping attribution from work you do not own may be unlawful — see our terms.',
    detect: true,
    remove: true,
    verify: true,
  }),
  activeContent: spec({
    id: 'active-content',
    axis: 'privacy',
    label: 'Active content',
    category: 'privacy',
    description: 'Script that runs when the file is opened.',
    detail:
      'Unlike a photo, an SVG is a document that can carry scripts and event handlers. They run when the file is opened in a browser, which means the file can act — reporting that it was viewed, or reaching out to a server. NoWatermark removes scripts and event handlers, and confirms by re-scanning that none remain.',
    detect: true,
    remove: true,
    verify: true,
  }),
  remoteReference: spec({
    id: 'remote-reference',
    axis: 'privacy',
    label: 'Remote references',
    category: 'privacy',
    description: 'Links to content fetched from another server on open.',
    detail:
      'A reference to an external URL makes the viewer\'s browser contact that server whenever the file is opened, revealing their IP address and the fact that they opened it. It is the same mechanism as a tracking pixel in an email. NoWatermark removes these references; the content they pointed at was never inside the file.',
    detect: true,
    remove: true,
    verify: true,
  }),
  priorRevisions: spec({
    id: 'prior-revisions',
    axis: 'privacy',
    label: 'Earlier revisions',
    category: 'privacy',
    description: 'Previous versions of the document, still inside the file.',
    detail:
      'A PDF is append-only: saving it again writes a new version on top of the old one rather than replacing it. Every earlier revision stays in the file and stays readable, including its metadata. This is why tools that "remove" PDF metadata by saving an update leave the original recoverable — and why removing it properly means rewriting the whole document. NoWatermark can currently report earlier revisions but not remove them.',
    detect: true,
    remove: false,
    verify: false,
  }),
  hiddenUnicode: spec({
    id: 'hidden-unicode',
    axis: 'detector',
    label: 'Hidden Unicode characters',
    category: 'hidden',
    description: 'Invisible characters that can carry a payload inside text.',
    detail:
      'Zero-width spaces, bidirectional controls and Unicode tag characters render as nothing but survive copy and paste. They are used both for benign formatting and for hiding information inside otherwise ordinary text. NoWatermark finds and removes them, while preserving the zero-width joiners and variation selectors that emoji legitimately need.',
    detect: true,
    remove: true,
    verify: true,
  }),
  claudeWatermark: spec({
    id: 'claude-watermark',
    axis: 'detector',
    label: 'Statistical text watermarks',
    category: 'hidden',
    description: 'Watermarks encoded in word choice rather than in characters.',
    detail:
      'A statistical text watermark biases a model\'s word selection in a pattern a detector can recognise later. It leaves no special characters behind, so removing invisible Unicode does nothing to it, and no client-side tool can confirm whether one is present. NoWatermark does not claim to detect or remove it.',
    detect: false,
    remove: false,
    verify: false,
  }),
  icc: spec({
    id: 'icc',
    axis: 'privacy',
    label: 'Colour profile (ICC)',
    category: 'metadata',
    description: 'Colour interpretation data — preserved on purpose.',
    detail:
      'An ICC profile tells displays how to interpret the colours in the file. It contains no personal or provenance information, and removing it visibly shifts colours, so NoWatermark deliberately keeps it.',
    detect: true,
    remove: false,
    verify: true,
  }),
} as const satisfies Record<string, SignalSpec>;

export type SignalId = (typeof SIGNALS)[keyof typeof SIGNALS]['id'];

export const SIGNAL_LIST: readonly SignalSpec[] = Object.values(SIGNALS);

export function signalById(id: string): SignalSpec | undefined {
  return SIGNAL_LIST.find((s) => s.id === id);
}

/**
 * Cleanup presets (V2 R5).
 *
 * A preset is a **goal**, not a switch list: "make this safe to post" rather
 * than "uncheck IPTC". Each names the metadata blocks it drops.
 *
 * The granularity is deliberate and needs saying out loud, because it is the
 * one place a user could be misled. Cleaners work on whole container blocks —
 * an entire EXIF segment, an entire XMP packet — not on individual tags inside
 * them. GPS, camera model and timestamp all live inside EXIF, so there is no
 * honest way to offer "remove my location but keep my camera settings" without
 * rewriting the TIFF structure, which we do not do. A preset therefore either
 * drops a block or keeps it, and `summary` says exactly which.
 *
 * `blocks` are the removable metadata containers, keyed by the signal id that
 * represents each one. A preset can never list a signal whose `remove` is
 * false — enforced by a test.
 */
export type PresetId = 'everything' | 'privacy-safe' | 'provenance-light';

export interface CleanPreset {
  id: PresetId;
  label: string;
  /** One line, imperative, describing the goal rather than the mechanism. */
  goal: string;
  /** Exactly what this drops and what it deliberately leaves behind. */
  summary: string;
  /** Metadata blocks to remove, by signal id. */
  blocks: readonly string[];
}

/** Every removable container block, in the order the UI lists them. */
export const CLEANABLE_BLOCKS = ['exif', 'iptc', 'xmp', 'c2pa', 'embedded-text'] as const;

export const CLEAN_PRESETS: readonly CleanPreset[] = [
  {
    id: 'everything',
    label: 'Everything removable',
    goal: 'Strip every metadata block this file carries.',
    summary:
      'Removes EXIF, IPTC, XMP, Content Credentials and embedded text records. The colour profile and image data are always preserved, so the picture is unchanged.',
    blocks: [...CLEANABLE_BLOCKS],
  },
  {
    id: 'privacy-safe',
    label: 'Privacy-safe',
    goal: 'Remove what identifies you, your device and where you were.',
    summary:
      'Removes EXIF and IPTC — the blocks holding GPS coordinates, camera and phone identifiers, timestamps and authorship. Deliberately keeps Content Credentials, so a file that declares itself AI-made still does.',
    blocks: ['exif', 'iptc'],
  },
  {
    id: 'provenance-light',
    label: 'Provenance-light',
    goal: 'Remove what declares which tool or model made this.',
    summary:
      'Removes Content Credentials, XMP and embedded text records, including prompts and workflow data. Deliberately keeps EXIF, so camera settings survive — run Privacy-safe as well if you also want your location gone.',
    blocks: ['c2pa', 'xmp', 'embedded-text'],
  },
];

export function presetById(id: string): CleanPreset | undefined {
  return CLEAN_PRESETS.find((p) => p.id === id);
}

/** Signals we can genuinely remove — the basis for every removal claim. */
export const REMOVABLE_SIGNAL_IDS: readonly string[] = SIGNAL_LIST.filter((s) => s.remove).map(
  (s) => s.id,
);

/**
 * Version stamp for the public capability matrix (V2 R17).
 *
 * A capability claim without a date is not checkable. Bump both whenever a
 * `detect`/`remove`/`verify` flag changes, a format's support level changes, or
 * a limitation is added or withdrawn.
 */
export const CAPABILITY_VERSION = '2.0';
export const CAPABILITY_UPDATED = '2026-08-15';

/**
 * Evidence behind the coverage claims — what was actually run, and when.
 *
 * The build plan's rule is that capability is validated before it is claimed,
 * so anything asserted in the matrix should be traceable to a line here.
 */
export interface ValidationNote {
  subject: string;
  date: string;
  summary: string;
}

export const VALIDATION_NOTES: readonly ValidationNote[] = [
  {
    subject: 'PDF inspection',
    date: '2026-08-15',
    summary:
      '733 real-world PDFs scanned locally: 99.3% parsed cleanly, no exceptions, median 0.2 ms. 3.7% carried metadata in a revision the current one had superseded.',
  },
  {
    subject: 'PDF cleaning',
    date: '2026-08-15',
    summary:
      '727 of 733 real PDFs rebuilt successfully, 6 refused, none damaged. Every cleaned file parsed back, held exactly one revision, and contained no trace of its original author string. Page counts and content-stream bytes were identical before and after in all 727.',
  },
  {
    subject: 'Lossless cleaning',
    date: '2026-08-15',
    summary:
      'Tests compare the JPEG scan stream, PNG IDAT and WebP VP8/VP8L payloads before and after cleaning and require them to be byte-identical.',
  },
  {
    subject: 'Verified removal',
    date: '2026-08-15',
    summary:
      'Every removal claim is produced by scanning the cleaned output a second time and diffing against the original scan, never by a cleaner reporting its own success.',
  },
];

/** Rows for the public capability matrix on /methodology. */
export interface CapabilityRow {
  label: string;
  detect: boolean | 'target';
  remove: boolean | 'target';
  verify: boolean | 'target';
  note?: string;
}

export const CAPABILITY_MATRIX: readonly CapabilityRow[] = [
  { label: 'EXIF', detect: true, remove: true, verify: true },
  { label: 'XMP', detect: true, remove: true, verify: true },
  { label: 'IPTC', detect: true, remove: true, verify: true },
  { label: 'GPS', detect: true, remove: true, verify: true },
  { label: 'PNG text chunks', detect: true, remove: true, verify: true },
  {
    label: 'C2PA / Content Credentials',
    detect: true,
    remove: true,
    verify: true,
    note: 'Presence only — signatures are not cryptographically verified, and cloud-side recovery is out of scope.',
  },
  { label: 'AI generator metadata', detect: true, remove: true, verify: true },
  { label: 'Hidden Unicode', detect: true, remove: true, verify: true },
  {
    label: 'PDF document metadata',
    detect: true,
    remove: true,
    verify: true,
    note: 'The document is rebuilt from scratch, never appended to, and the output is checked against its raw bytes before it is offered.',
  },
  {
    label: 'PDF earlier revisions',
    detect: true,
    remove: true,
    verify: true,
    note: 'Previous versions left in the file by incremental saves. A rebuild drops them entirely — the cleaned file has exactly one revision.',
  },
  {
    label: 'SVG active content',
    detect: true,
    remove: true,
    verify: true,
    note: 'Scripts and event handlers in SVG files.',
  },
  {
    label: 'SVG remote references',
    detect: true,
    remove: true,
    verify: true,
    note: 'External URLs that the viewer\'s browser would fetch on open.',
  },
  {
    label: 'SynthID',
    detect: false,
    remove: false,
    verify: false,
    note: 'Embedded in pixels. We cannot confirm presence or absence.',
  },
  {
    label: 'Statistical text watermarks',
    detect: false,
    remove: false,
    verify: false,
    note: 'Encoded in word choice. Not detectable client-side.',
  },
];

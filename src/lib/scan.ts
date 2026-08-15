/**
 * Scan orchestrator.
 *
 * Turns raw file bytes into the normalised ScanResult the UI renders. All
 * format-specific knowledge lives in ./metadata/*; this module only decides
 * what to report and — critically — when we are entitled to say "not
 * detected" versus "unable to verify" (PRD §15, §64).
 */

import { formatBytes } from './bytes';
import { MAX_FILE_BYTES } from './config';
import { detectType, isSupported, TYPE_LABEL, type DetectedType } from './filetype';
import type { ScannableFormat } from './formats';
import { C2PA_ABSENT, inspectC2pa, type C2paInfo } from './metadata/c2pa';
import { ORIENTATION_LABEL, parseExif, type ExifData } from './metadata/exif';
import { GENERATOR_PNG_KEYS, matchGenerator } from './metadata/generators';
import { collectJpegMetadata, walkJpeg } from './metadata/jpeg';
import { collectPngMetadata, walkPng } from './metadata/png';
import { collectMarkdownMetadata } from './metadata/frontmatter';
import { collectPdfMetadata } from './metadata/pdf';
import { readSvg } from './metadata/svg';
import { collectWebpMetadata, walkWebp } from './metadata/webp';
import { parseXmp, type XmpData } from './metadata/xmp';
import { sanitizeOptional, sanitizeValue } from './sanitize';
import { SIGNALS, type SignalSpec } from './signals';
import type { ImageFormat, ScanResult, SignalResult, SignalStatus } from './types';
import { scanHiddenCharacters } from './unicode/hidden';

export type ScanErrorCode = 'empty' | 'too-large' | 'unsupported-format' | 'corrupt';

export class ScanError extends Error {
  readonly code: ScanErrorCode;
  readonly detectedType?: DetectedType;

  constructor(code: ScanErrorCode, message: string, detectedType?: DetectedType) {
    super(message);
    this.name = 'ScanError';
    this.code = code;
    this.detectedType = detectedType;
  }
}

interface TextRecord {
  keyword: string;
  text: string;
  source: string;
}

interface Extracted {
  format: ScannableFormat;
  width?: number;
  height?: number;
  exif?: ExifData;
  xmp?: XmpData;
  hasIptc: boolean;
  c2pa: C2paInfo;
  hasIcc: boolean;
  hasExtendedXmp: boolean;
  textRecords: TextRecord[];
  modifiedTime?: string;
  unknownBlocks: string[];
  isAnimated: boolean;
  warnings: string[];
  /**
   * Document-format concepts. Left undefined for formats where they do not
   * apply, so a JPEG scan does not sprout a "no scripts found" row it has no
   * business showing.
   */
  activeContent?: number;
  remoteRefs?: number;
  /** Extra prose to include in the hidden-character sweep. */
  extraText?: string;
}

async function extract(bytes: Uint8Array, format: ImageFormat): Promise<Extracted> {
  const base: Extracted = {
    format,
    hasIptc: false,
    c2pa: C2PA_ABSENT,
    hasIcc: false,
    hasExtendedXmp: false,
    textRecords: [],
    unknownBlocks: [],
    isAnimated: false,
    warnings: [],
  };

  if (format === 'jpeg') {
    const structure = walkJpeg(bytes);
    // No scan segment means the file is truncated or not really a JPEG.
    if (!structure.valid || structure.scanStart < 0) {
      throw new ScanError('corrupt', 'We could not read this image.');
    }
    const meta = collectJpegMetadata(bytes, structure);
    base.width = structure.width;
    base.height = structure.height;
    base.warnings = structure.warnings;
    base.exif = meta.exifTiff ? (parseExif(meta.exifTiff) ?? undefined) : undefined;
    base.xmp = meta.xmp ? parseXmp(meta.xmp) : undefined;
    base.hasIptc = meta.iptc !== undefined && meta.iptc.length > 0;
    base.c2pa = meta.jumbf ? inspectC2pa(meta.jumbf) : C2PA_ABSENT;
    base.hasIcc = meta.hasIcc;
    base.hasExtendedXmp = meta.hasExtendedXmp;
    base.textRecords = meta.comments
      .filter((c) => c.trim().length > 0)
      .map((c) => ({ keyword: 'Comment', text: c, source: 'JPEG comment' }));
    if (meta.unknownAppSegments > 0) {
      base.unknownBlocks.push(`${meta.unknownAppSegments} unrecognised APP segment(s)`);
    }
    return base;
  }

  if (format === 'png') {
    const structure = walkPng(bytes);
    if (!structure.valid) throw new ScanError('corrupt', 'We could not read this image.');
    const meta = await collectPngMetadata(bytes, structure);
    base.width = structure.width;
    base.height = structure.height;
    base.isAnimated = structure.isAnimated;
    base.warnings = structure.warnings;
    base.exif = meta.exifTiff ? (parseExif(meta.exifTiff) ?? undefined) : undefined;
    base.xmp = meta.xmp ? parseXmp(meta.xmp) : undefined;
    base.c2pa = meta.jumbf ? inspectC2pa(meta.jumbf) : C2PA_ABSENT;
    base.hasIcc = meta.hasIcc;
    base.modifiedTime = meta.modifiedTime;
    base.textRecords = meta.text.map((t) => ({
      keyword: t.keyword,
      text: t.truncated ? '' : t.text,
      source: t.chunkType,
    }));
    if (meta.unknownAncillary.length > 0) {
      base.unknownBlocks.push(`Unrecognised chunks: ${meta.unknownAncillary.join(', ')}`);
    }
    return base;
  }

  const structure = walkWebp(bytes);
  if (!structure.valid) throw new ScanError('corrupt', 'We could not read this image.');
  const meta = collectWebpMetadata(bytes, structure);
  base.width = structure.width;
  base.height = structure.height;
  base.isAnimated = structure.isAnimated;
  base.warnings = structure.warnings;
  base.exif = meta.exifTiff ? (parseExif(meta.exifTiff) ?? undefined) : undefined;
  base.xmp = meta.xmp ? parseXmp(meta.xmp) : undefined;
  base.c2pa = meta.jumbf ? inspectC2pa(meta.jumbf) : C2PA_ABSENT;
  base.hasIcc = meta.hasIcc;
  if (meta.unknownChunks.length > 0) {
    base.unknownBlocks.push(`Unrecognised chunks: ${meta.unknownChunks.join(', ')}`);
  }
  return base;
}

function make(
  spec: SignalSpec,
  status: SignalStatus,
  value?: string,
  removableOverride?: SignalResult['removable'],
): SignalResult {
  return {
    id: spec.id,
    label: spec.label,
    status,
    value: value ? sanitizeValue(value) : undefined,
    description: spec.description,
    detail: spec.detail,
    removable: removableOverride ?? (spec.remove ? true : false),
  };
}

function detectedIf(condition: boolean): SignalStatus {
  return condition ? 'detected' : 'not_detected';
}

/** Which generator, if any, the metadata points at. */
function findGenerator(x: Extracted): string | undefined {
  if (x.xmp?.generator) return x.xmp.generator;
  const fromExif = matchGenerator(x.exif?.software) ?? matchGenerator(x.exif?.make);
  if (fromExif) return fromExif;
  if (x.c2pa.claimGenerator) {
    return matchGenerator(x.c2pa.claimGenerator) ?? x.c2pa.claimGenerator;
  }
  for (const record of x.textRecords) {
    const byKey = GENERATOR_PNG_KEYS[record.keyword.toLowerCase()];
    if (byKey) return byKey;
    const byValue = matchGenerator(record.text.slice(0, 2000));
    if (byValue) return byValue;
  }
  return undefined;
}

function buildProvenance(x: Extracted): SignalResult[] {
  const out: SignalResult[] = [];

  // C2PA: absence in the file itself is verifiable, so not_detected is honest.
  if (x.c2pa.present) {
    const bits = [`${formatBytes(x.c2pa.byteLength)} manifest`];
    if (x.c2pa.claimGenerator) bits.push(x.c2pa.claimGenerator);
    out.push(make(SIGNALS.c2pa, 'detected', bits.join(' · ')));
  } else {
    out.push(make(SIGNALS.c2pa, 'not_detected'));
  }

  const generator = findGenerator(x);
  const aiDeclared = x.xmp?.indicatesAi === true;
  const aiValue = aiDeclared
    ? [x.xmp?.digitalSourceLabel, generator].filter(Boolean).join(' · ')
    : generator;
  out.push(make(SIGNALS.aiGenerator, detectedIf(Boolean(generator) || aiDeclared), aiValue));

  // We have no local detector, so absence can never be asserted (PRD §64).
  out.push(make(SIGNALS.synthid, 'unable_to_verify', undefined, 'unknown'));

  return out;
}

function buildMetadata(x: Extracted): SignalResult[] {
  const out: SignalResult[] = [];

  const exifValue = x.exif ? `${x.exif.tagCount} field${x.exif.tagCount === 1 ? '' : 's'}` : undefined;
  out.push(make(SIGNALS.exif, detectedIf(Boolean(x.exif)), exifValue));

  const xmpValue = x.xmp
    ? [formatBytes(x.xmp.byteLength), x.hasExtendedXmp ? 'extended' : null].filter(Boolean).join(' · ')
    : undefined;
  out.push(make(SIGNALS.xmp, detectedIf(Boolean(x.xmp)), xmpValue));

  out.push(make(SIGNALS.iptc, detectedIf(x.hasIptc)));

  const records = x.textRecords.filter((r) => r.keyword || r.text);
  const recordValue =
    records.length > 0
      ? records
          .slice(0, 4)
          .map((r) => r.keyword || r.source)
          .join(', ')
      : undefined;
  out.push(make(SIGNALS.embeddedText, detectedIf(records.length > 0), recordValue));

  // Deliberately preserved, so it is reported as present but not removable.
  out.push(make(SIGNALS.icc, detectedIf(x.hasIcc), undefined, false));

  return out;
}

function formatGps(lat: number, lon: number): string {
  const fmt = (v: number, pos: string, neg: string) =>
    `${Math.abs(v).toFixed(5)}° ${v >= 0 ? pos : neg}`;
  return `${fmt(lat, 'N', 'S')}, ${fmt(lon, 'E', 'W')}`;
}

function buildPrivacy(x: Extracted): SignalResult[] {
  const e = x.exif;
  const out: SignalResult[] = [];

  out.push(make(SIGNALS.gps, detectedIf(Boolean(e?.gps)), e?.gps ? formatGps(e.gps.lat, e.gps.lon) : undefined));

  const timestamp =
    sanitizeOptional(e?.dateTimeOriginal) ??
    sanitizeOptional(e?.dateTime) ??
    sanitizeOptional(x.xmp?.createDate) ??
    sanitizeOptional(x.modifiedTime);
  out.push(make(SIGNALS.timestamp, detectedIf(Boolean(timestamp)), timestamp));

  const device = [e?.make, e?.model].filter(Boolean).join(' ').trim();
  const deviceValue = sanitizeOptional(device || undefined);
  out.push(make(SIGNALS.device, detectedIf(Boolean(deviceValue)), deviceValue));

  const software = sanitizeOptional(e?.software) ?? sanitizeOptional(x.xmp?.creatorTool);
  out.push(make(SIGNALS.software, detectedIf(Boolean(software)), software));

  const author =
    sanitizeOptional(e?.artist) ??
    sanitizeOptional(x.xmp?.creator) ??
    sanitizeOptional(e?.copyright) ??
    sanitizeOptional(x.xmp?.rights);
  out.push(make(SIGNALS.author, detectedIf(Boolean(author)), author));

  // Document formats only — a raster image cannot carry either of these, and
  // showing an always-negative row would be noise rather than information.
  if (x.activeContent !== undefined) {
    const value = x.activeContent > 0 ? `${x.activeContent} script or handler` : undefined;
    out.push(make(SIGNALS.activeContent, detectedIf(x.activeContent > 0), value));
  }
  if (x.remoteRefs !== undefined) {
    const value = x.remoteRefs > 0 ? `${x.remoteRefs} external URL` : undefined;
    out.push(make(SIGNALS.remoteReference, detectedIf(x.remoteRefs > 0), value));
  }

  return out;
}

/** Hidden characters can also hide inside a file's own text metadata. */
function buildHidden(x: Extracted): SignalResult[] {
  const haystack = [
    ...x.textRecords.map((r) => r.text),
    x.xmp?.description ?? '',
    x.xmp?.title ?? '',
    x.exif?.imageDescription ?? '',
    x.extraText ?? '',
  ].join('\n');

  const scan = scanHiddenCharacters(haystack);
  const value = scan.removable > 0 ? `${scan.removable} in embedded text` : undefined;
  return [make(SIGNALS.hiddenUnicode, detectedIf(scan.removable > 0), value)];
}

export interface ScanInput {
  name: string;
  type: string;
  size: number;
}

/**
 * A scanner turns raw bytes into the normalised ScanResult. One per format
 * family — the three raster formats share `scanRasterImage` because they share
 * an extraction model, but a text or document format brings its own.
 */
type Scanner = (bytes: Uint8Array, input: ScanInput) => Promise<ScanResult>;

/**
 * Typed as a total Record over ScannableFormat: opening a format in the
 * registry without registering a scanner here is a build error.
 */
const SCANNERS: Record<ScannableFormat, Scanner> = {
  jpeg: (bytes, input) => scanRasterImage(bytes, input, 'jpeg'),
  png: (bytes, input) => scanRasterImage(bytes, input, 'png'),
  webp: (bytes, input) => scanRasterImage(bytes, input, 'webp'),
  svg: scanSvg,
  markdown: scanMarkdown,
  pdf: scanPdf,
};

/**
 * PDF, Phase 1: inspect only.
 *
 * There is no PDF cleaner yet and this must not imply there is one. Every
 * signal is reported with `removable: false` — we can tell you what is in the
 * file, and saying so while admitting we cannot fix it is the honest position,
 * not a gap to paper over.
 */
async function scanPdf(bytes: Uint8Array, input: ScanInput): Promise<ScanResult> {
  const meta = await collectPdfMetadata(bytes);
  const warnings = [...meta.warnings];

  /*
   * Search every revision, not just the newest. A file whose current /Info has
   * been emptied by an incremental update still contains the original, and
   * reporting only the current one would tell the user their name is gone when
   * it is still sitting in the file.
   */
  const anyField = (field: 'author' | 'creator' | 'producer' | 'creationDate' | 'modDate') => {
    for (const i of meta.infos) {
      const v = i[field];
      if (v) return v;
    }
    return undefined;
  };

  const xmp = meta.xmpPackets.length > 0 ? parseXmp(meta.xmpPackets.join('\n')) : undefined;

  const generator =
    matchGenerator(anyField('creator')) ?? matchGenerator(anyField('producer')) ?? xmp?.generator;

  const author = sanitizeOptional(anyField('author') ?? xmp?.creator);
  const timestamp = sanitizeOptional(
    anyField('creationDate') ?? anyField('modDate') ?? xmp?.createDate,
  );
  const software = sanitizeOptional(anyField('creator') ?? anyField('producer'));

  const textBits = meta.infos
    .flatMap((i) => [i.title, i.subject, i.keywords, ...i.customKeys])
    .filter(Boolean) as string[];

  if (meta.staleMetadata) {
    warnings.push(
      'Metadata from an earlier version of this document is still present. Software that removes PDF metadata by saving an update leaves the original readable — check the revision count above.',
    );
  }
  if (meta.degraded) {
    warnings.push('Parts of this PDF could not be read, so this report may be incomplete.');
  }

  // Phase 1: nothing here is removable, so say so on every row.
  const ro = false as const;

  return {
    file: { name: input.name, type: input.type, size: input.size, format: 'pdf' },
    provenance: [
      make(SIGNALS.c2pa, detectedIf(meta.hasC2pa), undefined, ro),
      make(SIGNALS.aiGenerator, detectedIf(Boolean(generator)), generator, ro),
      make(SIGNALS.synthid, 'unable_to_verify', undefined, 'unknown'),
    ],
    metadata: [
      make(
        SIGNALS.xmp,
        detectedIf(meta.xmpPackets.length > 0),
        meta.xmpPackets.length > 0 ? `${meta.xmpPackets.length} packet(s)` : undefined,
        ro,
      ),
      make(
        SIGNALS.embeddedText,
        detectedIf(textBits.length > 0),
        textBits.length > 0 ? textBits.slice(0, 3).join(', ') : undefined,
        ro,
      ),
    ],
    privacy: [
      make(SIGNALS.author, detectedIf(Boolean(author)), author, ro),
      make(SIGNALS.timestamp, detectedIf(Boolean(timestamp)), timestamp, ro),
      make(SIGNALS.software, detectedIf(Boolean(software)), software, ro),
      make(
        SIGNALS.activeContent,
        detectedIf(meta.hasJavaScript),
        meta.hasJavaScript ? 'JavaScript in the document' : undefined,
        ro,
      ),
      make(
        SIGNALS.priorRevisions,
        detectedIf(meta.revisionCount > 1),
        meta.revisionCount > 1 ? `${meta.revisionCount - 1} earlier revision(s)` : undefined,
        ro,
      ),
    ],
    hiddenSignals: [],
    warnings,
  };
}

/**
 * Markdown gets its own result builders rather than reusing the raster ones.
 * A text file has no EXIF, no ICC profile and no colour data, and rendering
 * "EXIF: Not detected" against a blog post is noise dressed up as information.
 * The signal specs still come from `signals.ts`, so no claim drifts.
 */
async function scanMarkdown(bytes: Uint8Array, input: ScanInput): Promise<ScanResult> {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ScanError('corrupt', 'This file is not valid UTF-8 text.');
  }

  const meta = collectMarkdownMetadata(text);
  const warnings: string[] = [];
  const keys = meta.frontmatter?.keys ?? [];

  const byRole = (role: string) => keys.filter((k) => k.role === role);
  const valuesOf = (role: string) =>
    byRole(role)
      .map((k) => k.value)
      .filter((v) => v.length > 0);

  const aiKeys = byRole('ai');
  const toolKeys = byRole('tool');

  const generator =
    matchGenerator(valuesOf('tool')[0]) ??
    matchGenerator(valuesOf('ai')[0]) ??
    meta.metaTags.map((t) => matchGenerator(t.content)).find(Boolean) ??
    meta.commentText.map((c) => matchGenerator(c)).find(Boolean) ??
    meta.jsonLdText.map((c) => matchGenerator(c)).find(Boolean);

  const aiDetected = aiKeys.length > 0 || Boolean(generator);
  const aiValue = aiDetected
    ? [generator, aiKeys.length > 0 ? `${aiKeys.length} frontmatter key${aiKeys.length === 1 ? '' : 's'}` : null]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  if (meta.frontmatter?.unsafe) {
    warnings.push(
      'This file uses YAML anchors or merge keys. We can report what is in the frontmatter but cannot rewrite it safely.',
    );
  }

  const textRecordCount = meta.comments.length + meta.jsonLd.length + meta.metaTags.length;
  const recordLabels = [
    meta.comments.length > 0 ? `${meta.comments.length} comment` : null,
    meta.jsonLd.length > 0 ? `${meta.jsonLd.length} structured-data block` : null,
    meta.metaTags.length > 0 ? `${meta.metaTags.length} meta tag` : null,
  ].filter(Boolean) as string[];

  const author = sanitizeOptional(valuesOf('author')[0]);
  const timestamp = sanitizeOptional(valuesOf('timestamp')[0]);
  const software = sanitizeOptional(valuesOf('tool')[0]);

  const unsafe = meta.frontmatter?.unsafe === true;
  const removable = (role: string): SignalResult['removable'] =>
    unsafe && byRole(role).length > 0 ? false : true;

  const hidden = scanHiddenCharacters(text);

  return {
    file: { name: input.name, type: input.type, size: input.size, format: 'markdown' },
    provenance: [
      make(SIGNALS.aiGenerator, detectedIf(aiDetected), aiValue),
      // Non-negotiable #4: this is the signal that actually matters for a text
      // file, and it is permanently unverifiable.
      make(SIGNALS.claudeWatermark, 'unable_to_verify', undefined, 'unknown'),
    ],
    metadata: [
      make(
        SIGNALS.embeddedText,
        detectedIf(textRecordCount > 0),
        recordLabels.length > 0 ? recordLabels.join(', ') : undefined,
      ),
    ],
    privacy: [
      make(SIGNALS.author, detectedIf(Boolean(author)), author, removable('author')),
      make(SIGNALS.timestamp, detectedIf(Boolean(timestamp)), timestamp, removable('timestamp')),
      make(SIGNALS.software, detectedIf(Boolean(software)), software, removable('tool')),
    ],
    hiddenSignals: [
      make(
        SIGNALS.hiddenUnicode,
        detectedIf(hidden.removable > 0),
        hidden.removable > 0 ? `${hidden.removable} in the text` : undefined,
      ),
    ],
    warnings,
  };
}

/**
 * Metadata carried by a raster image embedded in another file as a data URI.
 *
 * An SVG can wrap a full JPEG, and that JPEG keeps its own EXIF and GPS. If we
 * only stripped the XML we would report a clean file while the author's
 * coordinates sat one base64 decode away — so nested payloads are extracted and
 * reported as first-class findings.
 */
async function extractEmbedded(bytes: Uint8Array): Promise<Extracted | null> {
  const type = detectType(bytes);
  if (type !== 'jpeg' && type !== 'png' && type !== 'webp') return null;
  try {
    return await extract(bytes, type);
  } catch {
    return null;
  }
}

async function scanSvg(bytes: Uint8Array, input: ScanInput): Promise<ScanResult> {
  const read = readSvg(bytes);
  if ('error' in read) throw new ScanError('corrupt', read.error);

  const { text, structure, meta } = read;

  const x: Extracted = {
    format: 'svg',
    hasIptc: false,
    c2pa: C2PA_ABSENT,
    hasIcc: false,
    hasExtendedXmp: false,
    textRecords: [],
    unknownBlocks: [],
    isAnimated: false,
    warnings: [...meta.warnings],
    activeContent: meta.scriptElements.length + meta.eventAttrs.length,
    remoteRefs: meta.remoteRefs.length,
    extraText: meta.textContent,
  };

  if (meta.xmpText) x.xmp = parseXmp(meta.xmpText);

  for (const region of meta.titleElements) {
    x.textRecords.push({
      keyword: 'Title',
      text: stripTags(text.slice(region.start, region.end)),
      source: 'SVG <title>',
    });
  }
  for (const region of meta.descElements) {
    x.textRecords.push({
      keyword: 'Description',
      text: stripTags(text.slice(region.start, region.end)),
      source: 'SVG <desc>',
    });
  }
  for (const comment of meta.generatorComments) {
    x.textRecords.push({ keyword: 'Comment', text: comment.text.trim(), source: 'XML comment' });
  }
  for (const attr of meta.editorAttrs) {
    x.textRecords.push({ keyword: attr.name, text: attr.value, source: 'Editor attribute' });
  }

  // Fold in anything hiding inside embedded rasters.
  let embeddedWithMetadata = 0;
  for (const image of meta.embeddedImages) {
    const nested = await extractEmbedded(image.bytes);
    if (!nested) continue;
    if (!x.exif && nested.exif) x.exif = nested.exif;
    if (!x.xmp && nested.xmp) x.xmp = nested.xmp;
    if (nested.hasIptc) x.hasIptc = true;
    if (nested.hasIcc) x.hasIcc = true;
    if (nested.c2pa.present && !x.c2pa.present) x.c2pa = nested.c2pa;
    for (const record of nested.textRecords) {
      x.textRecords.push({ ...record, source: `Embedded image · ${record.source}` });
    }
    if (nested.exif || nested.xmp || nested.c2pa.present || nested.hasIptc) {
      embeddedWithMetadata++;
    }
  }
  if (embeddedWithMetadata > 0) {
    x.warnings.push(
      `${embeddedWithMetadata} image${embeddedWithMetadata === 1 ? '' : 's'} embedded inside this SVG carr${embeddedWithMetadata === 1 ? 'ies' : 'y'} their own metadata.`,
    );
  }

  const root = structure.tags.find((t) => t.lower === 'svg' && !t.closing);
  x.width = numericAttr(root, 'width');
  x.height = numericAttr(root, 'height');

  return {
    file: {
      name: input.name,
      type: input.type,
      size: input.size,
      width: x.width,
      height: x.height,
      format: 'svg',
    },
    provenance: buildProvenance(x),
    metadata: buildMetadata(x),
    privacy: buildPrivacy(x),
    hiddenSignals: buildHidden(x),
    warnings: x.warnings,
  };
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').trim();
}

function numericAttr(tag: { attrs: { lower: string; value: string }[] } | undefined, name: string) {
  const raw = tag?.attrs.find((a) => a.lower === name)?.value;
  if (!raw) return undefined;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && /^[\d.]+(px)?$/.test(raw.trim()) ? Math.round(n) : undefined;
}

export async function scanImage(bytes: Uint8Array, input: ScanInput): Promise<ScanResult> {
  if (bytes.length === 0) {
    throw new ScanError('empty', 'This file is empty.');
  }
  if (bytes.length > MAX_FILE_BYTES) {
    throw new ScanError('too-large', 'This file is too large to process comfortably in your browser.');
  }

  const detected = detectType(bytes);
  if (!isSupported(detected)) {
    throw new ScanError(
      'unsupported-format',
      `${TYPE_LABEL[detected]} files aren't supported yet.`,
      detected,
    );
  }

  return SCANNERS[detected](bytes, input);
}

/** Canonical name — `scanImage` is kept as an alias for existing callers. */
export const scanFile = scanImage;

async function scanRasterImage(
  bytes: Uint8Array,
  input: ScanInput,
  format: ImageFormat,
): Promise<ScanResult> {
  const x = await extract(bytes, format);

  const orientationNote =
    x.exif?.orientation && x.exif.orientation !== 1
      ? `Rotation: ${ORIENTATION_LABEL[x.exif.orientation] ?? `Orientation ${x.exif.orientation}`}`
      : undefined;

  const warnings = [...x.warnings, ...(x.exif?.warnings ?? [])];
  if (orientationNote) warnings.push(orientationNote);
  for (const block of x.unknownBlocks) warnings.push(block);

  return {
    file: {
      name: input.name,
      type: input.type,
      size: input.size,
      width: x.width,
      height: x.height,
      format: x.format,
    },
    provenance: buildProvenance(x),
    metadata: buildMetadata(x),
    privacy: buildPrivacy(x),
    hiddenSignals: buildHidden(x),
    warnings,
  };
}

/** Orientation of the scanned file, used by the cleaner UI messaging. */
export async function readOrientation(bytes: Uint8Array): Promise<number | undefined> {
  const detected = detectType(bytes);
  // Orientation is an EXIF concept, so this is raster-only by definition.
  if (detected !== 'jpeg' && detected !== 'png' && detected !== 'webp') return undefined;
  try {
    const x = await extract(bytes, detected);
    return x.exif?.orientation;
  } catch {
    return undefined;
  }
}

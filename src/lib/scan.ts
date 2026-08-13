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
import { C2PA_ABSENT, inspectC2pa, type C2paInfo } from './metadata/c2pa';
import { ORIENTATION_LABEL, parseExif, type ExifData } from './metadata/exif';
import { GENERATOR_PNG_KEYS, matchGenerator } from './metadata/generators';
import { collectJpegMetadata, walkJpeg } from './metadata/jpeg';
import { collectPngMetadata, walkPng } from './metadata/png';
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
  format: ImageFormat;
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

  return out;
}

/** Hidden characters can also hide inside a file's own text metadata. */
function buildHidden(x: Extracted): SignalResult[] {
  const haystack = [
    ...x.textRecords.map((r) => r.text),
    x.xmp?.description ?? '',
    x.xmp?.title ?? '',
    x.exif?.imageDescription ?? '',
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

  const x = await extract(bytes, detected);

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
  if (!isSupported(detected)) return undefined;
  try {
    const x = await extract(bytes, detected);
    return x.exif?.orientation;
  } catch {
    return undefined;
  }
}

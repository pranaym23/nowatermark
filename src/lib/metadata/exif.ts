/**
 * Minimal TIFF/EXIF reader and writer.
 *
 * Scope is deliberately narrow: the tags NoWatermark actually shows the user
 * (device, software, timestamps, authorship, GPS) plus Orientation, which the
 * cleaner needs in order to avoid shipping sideways photos (PRD §18.2).
 *
 * Operates on the TIFF block — i.e. starting at the "II"/"MM" byte-order mark,
 * with the EXIF identifier already stripped by the caller. All offsets inside
 * a TIFF are relative to that origin.
 *
 * Never throws on malformed input: unparseable structures are reported through
 * `warnings` so the UI can say "some metadata could not be inspected" rather
 * than failing the whole scan (PRD §37).
 */

import { trimNul, u16be, u16le, u32be, u32le } from '../bytes';

export interface GpsPosition {
  lat: number;
  lon: number;
  altitude?: number;
}

export interface ExifData {
  orientation?: number;
  make?: string;
  model?: string;
  software?: string;
  dateTime?: string;
  dateTimeOriginal?: string;
  artist?: string;
  copyright?: string;
  lensModel?: string;
  cameraOwner?: string;
  imageDescription?: string;
  hostComputer?: string;
  hasMakerNote: boolean;
  gps?: GpsPosition;
  /** Total number of IFD entries seen, across every IFD. */
  tagCount: number;
  warnings: string[];
}

// IFD0 / IFD1
const TAG_IMAGE_DESCRIPTION = 0x010e;
const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_ORIENTATION = 0x0112;
const TAG_SOFTWARE = 0x0131;
const TAG_DATETIME = 0x0132;
const TAG_ARTIST = 0x013b;
const TAG_HOST_COMPUTER = 0x013c;
const TAG_COPYRIGHT = 0x8298;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;

// ExifIFD
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_MAKER_NOTE = 0x927c;
const TAG_CAMERA_OWNER = 0xa430;
const TAG_LENS_MODEL = 0xa434;

// GPS IFD
const TAG_GPS_LAT_REF = 0x0001;
const TAG_GPS_LAT = 0x0002;
const TAG_GPS_LON_REF = 0x0003;
const TAG_GPS_LON = 0x0004;
const TAG_GPS_ALT_REF = 0x0005;
const TAG_GPS_ALT = 0x0006;

const TYPE_SIZES: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  6: 1, // SBYTE
  7: 1, // UNDEFINED
  8: 2, // SSHORT
  9: 4, // SLONG
  10: 8, // SRATIONAL
  11: 4, // FLOAT
  12: 8, // DOUBLE
};

interface Cursor {
  b: Uint8Array;
  le: boolean;
}

function rd16(c: Cursor, o: number): number {
  return c.le ? u16le(c.b, o) : u16be(c.b, o);
}

function rd32(c: Cursor, o: number): number {
  return c.le ? u32le(c.b, o) : u32be(c.b, o);
}

interface Entry {
  tag: number;
  type: number;
  count: number;
  /** Absolute offset of the entry's data within the TIFF block. */
  dataOffset: number;
  byteLength: number;
}

function readEntry(c: Cursor, o: number): Entry | null {
  if (o + 12 > c.b.length) return null;
  const tag = rd16(c, o);
  const type = rd16(c, o + 2);
  const count = rd32(c, o + 4);
  const unit = TYPE_SIZES[type];
  if (!unit) return null;
  // count is untrusted; reject absurd values before multiplying.
  if (count > 0x0fffffff) return null;
  const byteLength = unit * count;
  const dataOffset = byteLength <= 4 ? o + 8 : rd32(c, o + 8);
  if (dataOffset < 0 || dataOffset + byteLength > c.b.length) return null;
  return { tag, type, count, dataOffset, byteLength };
}

function readAscii(c: Cursor, e: Entry): string {
  let s = '';
  for (let i = 0; i < e.byteLength; i++) {
    const ch = c.b[e.dataOffset + i]!;
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return trimNul(s);
}

function readShort(c: Cursor, e: Entry): number | undefined {
  if (e.count < 1) return undefined;
  if (e.type === 3) return rd16(c, e.dataOffset);
  if (e.type === 4) return rd32(c, e.dataOffset);
  return undefined;
}

function readRational(c: Cursor, o: number): number {
  const num = rd32(c, o);
  const den = rd32(c, o + 4);
  return den === 0 ? 0 : num / den;
}

/** GPS coordinates are stored as degrees/minutes/seconds rationals. */
function readGpsCoord(c: Cursor, e: Entry): number | undefined {
  if (e.type !== 5 || e.count < 3) return undefined;
  const deg = readRational(c, e.dataOffset);
  const min = readRational(c, e.dataOffset + 8);
  const sec = readRational(c, e.dataOffset + 16);
  return deg + min / 60 + sec / 3600;
}

/**
 * Walk one IFD, invoking `onEntry` per entry. Returns the next-IFD offset.
 */
function walkIfd(c: Cursor, offset: number, onEntry: (e: Entry) => void, warnings: string[]): number {
  if (offset <= 0 || offset + 2 > c.b.length) return 0;
  const count = rd16(c, offset);
  // A corrupt count can point far past the buffer; bound it.
  const maxEntries = Math.floor((c.b.length - offset - 2) / 12);
  const n = Math.min(count, maxEntries);
  if (n < count) warnings.push('EXIF directory was truncated.');
  for (let i = 0; i < n; i++) {
    const e = readEntry(c, offset + 2 + i * 12);
    if (e) onEntry(e);
  }
  const nextOff = offset + 2 + n * 12;
  if (nextOff + 4 > c.b.length) return 0;
  return rd32(c, nextOff);
}

/**
 * Parse a TIFF block. `tiff` must start at the byte-order mark.
 * Returns null when the block is not a recognisable TIFF header.
 */
export function parseExif(tiff: Uint8Array): ExifData | null {
  if (tiff.length < 8) return null;
  const b0 = tiff[0]!;
  const b1 = tiff[1]!;
  let le: boolean;
  if (b0 === 0x49 && b1 === 0x49) le = true;
  else if (b0 === 0x4d && b1 === 0x4d) le = false;
  else return null;

  const c: Cursor = { b: tiff, le };
  if (rd16(c, 2) !== 42) return null;

  const out: ExifData = { hasMakerNote: false, tagCount: 0, warnings: [] };
  const warnings = out.warnings;

  let exifIfdOffset = 0;
  let gpsIfdOffset = 0;

  const handleRoot = (e: Entry) => {
    out.tagCount++;
    switch (e.tag) {
      case TAG_MAKE:
        out.make = readAscii(c, e) || undefined;
        break;
      case TAG_MODEL:
        out.model = readAscii(c, e) || undefined;
        break;
      case TAG_ORIENTATION:
        out.orientation = readShort(c, e);
        break;
      case TAG_SOFTWARE:
        out.software = readAscii(c, e) || undefined;
        break;
      case TAG_DATETIME:
        out.dateTime = readAscii(c, e) || undefined;
        break;
      case TAG_ARTIST:
        out.artist = readAscii(c, e) || undefined;
        break;
      case TAG_HOST_COMPUTER:
        out.hostComputer = readAscii(c, e) || undefined;
        break;
      case TAG_IMAGE_DESCRIPTION:
        out.imageDescription = readAscii(c, e) || undefined;
        break;
      case TAG_COPYRIGHT:
        out.copyright = readAscii(c, e) || undefined;
        break;
      case TAG_EXIF_IFD:
        exifIfdOffset = readShort(c, e) ?? 0;
        break;
      case TAG_GPS_IFD:
        gpsIfdOffset = readShort(c, e) ?? 0;
        break;
    }
  };

  // IFD0, then any thumbnail IFDs. Bound the chain against loops.
  let ifdOffset = rd32(c, 4);
  const seen = new Set<number>();
  let guard = 0;
  while (ifdOffset > 0 && !seen.has(ifdOffset) && guard++ < 8) {
    seen.add(ifdOffset);
    ifdOffset = walkIfd(c, ifdOffset, handleRoot, warnings);
  }

  if (exifIfdOffset > 0) {
    walkIfd(
      c,
      exifIfdOffset,
      (e) => {
        out.tagCount++;
        switch (e.tag) {
          case TAG_DATETIME_ORIGINAL:
            out.dateTimeOriginal = readAscii(c, e) || undefined;
            break;
          case TAG_MAKER_NOTE:
            out.hasMakerNote = e.byteLength > 0;
            break;
          case TAG_CAMERA_OWNER:
            out.cameraOwner = readAscii(c, e) || undefined;
            break;
          case TAG_LENS_MODEL:
            out.lensModel = readAscii(c, e) || undefined;
            break;
        }
      },
      warnings,
    );
  }

  if (gpsIfdOffset > 0) {
    let lat: number | undefined;
    let lon: number | undefined;
    let latRef = 'N';
    let lonRef = 'E';
    let alt: number | undefined;
    let altRef = 0;
    walkIfd(
      c,
      gpsIfdOffset,
      (e) => {
        out.tagCount++;
        switch (e.tag) {
          case TAG_GPS_LAT_REF:
            latRef = readAscii(c, e) || 'N';
            break;
          case TAG_GPS_LAT:
            lat = readGpsCoord(c, e);
            break;
          case TAG_GPS_LON_REF:
            lonRef = readAscii(c, e) || 'E';
            break;
          case TAG_GPS_LON:
            lon = readGpsCoord(c, e);
            break;
          case TAG_GPS_ALT_REF:
            altRef = readShort(c, e) ?? 0;
            break;
          case TAG_GPS_ALT:
            if (e.type === 5 && e.count >= 1) alt = readRational(c, e.dataOffset);
            break;
        }
      },
      warnings,
    );
    if (lat !== undefined && lon !== undefined) {
      const signedLat = latRef.toUpperCase().startsWith('S') ? -lat : lat;
      const signedLon = lonRef.toUpperCase().startsWith('W') ? -lon : lon;
      out.gps = { lat: signedLat, lon: signedLon };
      if (alt !== undefined) out.gps.altitude = altRef === 1 ? -alt : alt;
    }
  }

  return out;
}

/** Orientation values other than 1 mean the viewer must rotate/flip. */
export function orientationNeedsPreserving(o: number | undefined): boolean {
  return typeof o === 'number' && o >= 2 && o <= 8;
}

export const ORIENTATION_LABEL: Record<number, string> = {
  1: 'Normal',
  2: 'Mirrored horizontally',
  3: 'Rotated 180°',
  4: 'Mirrored vertically',
  5: 'Mirrored and rotated 90° CCW',
  6: 'Rotated 90° CW',
  7: 'Mirrored and rotated 90° CW',
  8: 'Rotated 90° CCW',
};

/**
 * Build a TIFF block containing exactly one tag: Orientation.
 *
 * Layout (little-endian, 26 bytes):
 *   0  "II" 0x2A 0x00          byte order + magic
 *   4  08 00 00 00             offset of IFD0
 *   8  01 00                   entry count
 *  10  12 01 03 00 01 00 00 00 tag=0x0112 type=SHORT count=1
 *  18  vv 00 00 00             inline value
 *  22  00 00 00 00             next-IFD offset (none)
 */
export function buildOrientationTiff(orientation: number): Uint8Array {
  const t = new Uint8Array(26);
  t.set([0x49, 0x49, 0x2a, 0x00], 0);
  t.set([0x08, 0x00, 0x00, 0x00], 4);
  t.set([0x01, 0x00], 8);
  t.set([0x12, 0x01], 10); // tag 0x0112
  t.set([0x03, 0x00], 12); // type SHORT
  t.set([0x01, 0x00, 0x00, 0x00], 14); // count 1
  t[18] = orientation & 0xff;
  t[19] = 0;
  // bytes 20..25 remain zero: value padding + next-IFD offset
  return t;
}

/** "Exif\0\0" + TIFF block — the payload of a JPEG APP1 EXIF segment. */
export const EXIF_IDENTIFIER = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);

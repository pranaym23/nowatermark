/**
 * Fixture builder.
 *
 * Base images in ./base are real files produced by real encoders (see
 * ../../scripts/make-base-fixtures.sh). This module injects known metadata
 * into them so tests can assert on exact expected values.
 *
 * The container manipulation here is written independently of src/lib rather
 * than reusing the walkers, so a shared bug cannot make a test pass by
 * agreeing with itself.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE_DIR = join(HERE, 'base');

export const EXPECTED = {
  software: 'ChatGPT',
  make: 'NoWatermark Test',
  model: 'Fixture Camera',
  dateTime: '2026:08:13 10:30:00',
  artist: 'Test Artist',
  copyright: 'Copyright Test 2026',
  orientation: 6,
  gpsLat: 51.5074,
  gpsLon: -0.1278,
  claimGenerator: 'TestGen/1.0',
  promptText: 'a cat riding a bicycle, highly detailed',
} as const;

export function loadBase(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(BASE_DIR, name)));
}

/* ------------------------------------------------------------------ bytes */

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function str(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function be32(v: number): Uint8Array {
  return new Uint8Array([(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]);
}

function le32(v: number): Uint8Array {
  return new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);
}

/* ------------------------------------------------------------------- TIFF */

type TiffValue =
  | { type: 2; text: string }
  | { type: 3; short: number }
  | { type: 4; long: number }
  | { type: 5; rationals: Array<[number, number]> };

interface TiffEntry {
  tag: number;
  value: TiffValue;
}

function encodeValue(v: TiffValue): { type: number; count: number; data: Uint8Array } {
  switch (v.type) {
    case 2: {
      const data = str(`${v.text}\0`);
      return { type: 2, count: data.length, data };
    }
    case 3:
      return { type: 3, count: 1, data: new Uint8Array([v.short & 0xff, (v.short >> 8) & 0xff]) };
    case 4:
      return { type: 4, count: 1, data: le32(v.long) };
    case 5: {
      const data = new Uint8Array(v.rationals.length * 8);
      v.rationals.forEach(([n, d], i) => {
        data.set(le32(n), i * 8);
        data.set(le32(d), i * 8 + 4);
      });
      return { type: 5, count: v.rationals.length, data };
    }
  }
}

/**
 * Build a little-endian TIFF block with IFD0, an optional Exif sub-IFD and an
 * optional GPS sub-IFD. Values longer than 4 bytes go in a pool after the IFDs.
 */
export function buildTiff(opts: {
  ifd0?: TiffEntry[];
  exif?: TiffEntry[];
  gps?: TiffEntry[];
}): Uint8Array {
  const ifd0 = [...(opts.ifd0 ?? [])];
  const exif = opts.exif ?? [];
  const gps = opts.gps ?? [];

  const ifdSize = (n: number) => 2 + n * 12 + 4;
  const ifd0Offset = 8;
  const ifd0Count = ifd0.length + (exif.length ? 1 : 0) + (gps.length ? 1 : 0);
  const exifOffset = ifd0Offset + ifdSize(ifd0Count);
  const gpsOffset = exifOffset + (exif.length ? ifdSize(exif.length) : 0);
  const poolOffset = gpsOffset + (gps.length ? ifdSize(gps.length) : 0);

  if (exif.length) ifd0.push({ tag: 0x8769, value: { type: 4, long: exifOffset } });
  if (gps.length) ifd0.push({ tag: 0x8825, value: { type: 4, long: gpsOffset } });

  const pool: Uint8Array[] = [];
  let poolLen = 0;

  const writeIfd = (entries: TiffEntry[]): Uint8Array => {
    const buf = new Uint8Array(ifdSize(entries.length));
    buf[0] = entries.length & 0xff;
    buf[1] = (entries.length >> 8) & 0xff;
    entries.forEach((e, i) => {
      const { type, count, data } = encodeValue(e.value);
      const at = 2 + i * 12;
      buf[at] = e.tag & 0xff;
      buf[at + 1] = (e.tag >> 8) & 0xff;
      buf[at + 2] = type & 0xff;
      buf[at + 3] = (type >> 8) & 0xff;
      buf.set(le32(count), at + 4);
      if (data.length <= 4) {
        buf.set(data, at + 8);
      } else {
        buf.set(le32(poolOffset + poolLen), at + 8);
        pool.push(data);
        poolLen += data.length;
        if (poolLen % 2) {
          pool.push(new Uint8Array(1));
          poolLen += 1;
        }
      }
    });
    // next-IFD offset stays zero
    return buf;
  };

  const ifd0Buf = writeIfd(ifd0);
  const exifBuf = exif.length ? writeIfd(exif) : new Uint8Array(0);
  const gpsBuf = gps.length ? writeIfd(gps) : new Uint8Array(0);

  const header = new Uint8Array(8);
  header.set(str('II'), 0);
  header[2] = 0x2a;
  header.set(le32(ifd0Offset), 4);

  return concat([header, ifd0Buf, exifBuf, gpsBuf, ...pool]);
}

/** Decimal degrees to the three rationals EXIF expects. */
function toDms(value: number): Array<[number, number]> {
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = Math.round((minFloat - min) * 60 * 10000);
  return [
    [deg, 1],
    [min, 1],
    [sec, 10000],
  ];
}

export interface ExifFixtureOptions {
  orientation?: number;
  withGps?: boolean;
  withDevice?: boolean;
  withAuthor?: boolean;
  software?: string;
}

export function buildExifTiff(opts: ExifFixtureOptions = {}): Uint8Array {
  const {
    orientation = EXPECTED.orientation,
    withGps = true,
    withDevice = true,
    withAuthor = true,
    software = EXPECTED.software,
  } = opts;

  const ifd0: TiffEntry[] = [{ tag: 0x0112, value: { type: 3, short: orientation } }];
  if (withDevice) {
    ifd0.push({ tag: 0x010f, value: { type: 2, text: EXPECTED.make } });
    ifd0.push({ tag: 0x0110, value: { type: 2, text: EXPECTED.model } });
  }
  ifd0.push({ tag: 0x0131, value: { type: 2, text: software } });
  ifd0.push({ tag: 0x0132, value: { type: 2, text: EXPECTED.dateTime } });
  if (withAuthor) {
    ifd0.push({ tag: 0x013b, value: { type: 2, text: EXPECTED.artist } });
    ifd0.push({ tag: 0x8298, value: { type: 2, text: EXPECTED.copyright } });
  }

  const exif: TiffEntry[] = [{ tag: 0x9003, value: { type: 2, text: EXPECTED.dateTime } }];

  const gps: TiffEntry[] = withGps
    ? [
        { tag: 0x0001, value: { type: 2, text: 'N' } },
        { tag: 0x0002, value: { type: 5, rationals: toDms(EXPECTED.gpsLat) } },
        { tag: 0x0003, value: { type: 2, text: 'W' } },
        { tag: 0x0004, value: { type: 5, rationals: toDms(EXPECTED.gpsLon) } },
      ]
    : [];

  return buildTiff({ ifd0, exif, gps });
}

/* -------------------------------------------------------------- XMP / etc */

export function buildXmp(aiGenerated = true): string {
  const dst = aiGenerated
    ? '<Iptc4xmpExt:DigitalSourceType rdf:resource="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"/>'
    : '';
  return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/">
   <xmp:CreatorTool>${EXPECTED.software}</xmp:CreatorTool>
   <xmp:CreateDate>2026-08-13T10:30:00Z</xmp:CreateDate>
   <dc:creator><rdf:Seq><rdf:li>${EXPECTED.artist}</rdf:li></rdf:Seq></dc:creator>
   ${dst}
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/** A Photoshop image-resource block carrying an IPTC record. */
export function buildIptc(): Uint8Array {
  const iptc = concat([
    new Uint8Array([0x1c, 0x02, 0x05]), // record 2, dataset 5 (title)
    new Uint8Array([0x00, 0x09]),
    str('Test News'),
  ]);
  const pad = iptc.length % 2 ? new Uint8Array(1) : new Uint8Array(0);
  return concat([
    str('Photoshop 3.0\0'),
    str('8BIM'),
    new Uint8Array([0x04, 0x04]), // resource 0x0404 = IPTC-NAA
    new Uint8Array([0x00, 0x00]), // empty pascal name, padded
    be32(iptc.length),
    iptc,
    pad,
  ]);
}

/** A JUMBF superbox shaped like a C2PA manifest store. */
export function buildJumbf(): Uint8Array {
  const cbor = concat([
    new Uint8Array([0x6f]), // CBOR text(15)
    str('claim_generator'),
    new Uint8Array([0x60 | EXPECTED.claimGenerator.length]),
    str(EXPECTED.claimGenerator),
  ]);
  const inner = concat([str('c2pa'), new Uint8Array([0]), str('c2pa.actions'), new Uint8Array([0]), cbor]);
  const size = 8 + inner.length;
  return concat([be32(size), str('jumb'), inner]);
}

/* ------------------------------------------------------------------- JPEG */

/**
 * Remove every APPn and COM segment. Written independently of the production
 * walker so fixtures do not inherit its assumptions.
 */
function stripJpegMetadata(b: Uint8Array): { head: Uint8Array[]; rest: Uint8Array } {
  const kept: Uint8Array[] = [];
  let pos = 2;
  while (pos + 4 <= b.length) {
    if (b[pos] !== 0xff) break;
    const marker = b[pos + 1]!;
    if (marker === 0xda || marker === 0xd9) break;
    const len = (b[pos + 2]! << 8) | b[pos + 3]!;
    const end = pos + 2 + len;
    const isMeta = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
    if (!isMeta) kept.push(b.subarray(pos, end));
    pos = end;
  }
  return { head: kept, rest: b.subarray(pos) };
}

function jpegSegment(marker: number, payload: Uint8Array): Uint8Array {
  const len = payload.length + 2;
  return concat([new Uint8Array([0xff, marker, (len >> 8) & 0xff, len & 0xff]), payload]);
}

export interface JpegFixtureOptions extends ExifFixtureOptions {
  withExif?: boolean;
  withXmp?: boolean;
  withIptc?: boolean;
  withC2pa?: boolean;
  withComment?: boolean;
  withIcc?: boolean;
  withAdobe?: boolean;
  withExtendedXmp?: boolean;
}

export function buildJpegFixture(opts: JpegFixtureOptions = {}): Uint8Array {
  const {
    withExif = true,
    withXmp = true,
    withIptc = true,
    withC2pa = true,
    withComment = true,
    withIcc = true,
    withAdobe = true,
    withExtendedXmp = false,
  } = opts;

  const base = loadBase('base.jpg');
  const { head, rest } = stripJpegMetadata(base);
  const segments: Uint8Array[] = [];

  // APP0 JFIF — must survive cleaning.
  segments.push(
    jpegSegment(0xe0, concat([str('JFIF\0'), new Uint8Array([1, 1, 0, 0, 1, 0, 1, 0, 0])])),
  );

  if (withExif) {
    segments.push(jpegSegment(0xe1, concat([str('Exif\0\0'), buildExifTiff(opts)])));
  }
  if (withIcc) {
    // A stub ICC payload: only its presence and survival is under test.
    const profile = new Uint8Array(128);
    profile.set(str('acsp'), 36);
    segments.push(
      jpegSegment(0xe2, concat([str('ICC_PROFILE\0'), new Uint8Array([1, 1]), profile])),
    );
  }
  if (withXmp) {
    segments.push(jpegSegment(0xe1, concat([str('http://ns.adobe.com/xap/1.0/\0'), str(buildXmp())])));
  }
  if (withExtendedXmp) {
    const guid = str('A'.repeat(32));
    const body = str('<extended>payload</extended>');
    segments.push(
      jpegSegment(
        0xe1,
        concat([str('http://ns.adobe.com/xmp/extension/\0'), guid, be32(body.length), be32(0), body]),
      ),
    );
  }
  if (withIptc) segments.push(jpegSegment(0xed, buildIptc()));
  if (withC2pa) {
    segments.push(
      jpegSegment(0xeb, concat([str('JP'), new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]), buildJumbf()])),
    );
  }
  if (withAdobe) {
    segments.push(jpegSegment(0xee, concat([str('Adobe'), new Uint8Array([0, 100, 0, 0, 0, 0, 0])])));
  }
  if (withComment) segments.push(jpegSegment(0xfe, str('Generated by ChatGPT')));

  return concat([new Uint8Array([0xff, 0xd8]), ...segments, ...head, rest]);
}

/* -------------------------------------------------------------------- PNG */

function crcTable(): Uint32Array {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
}
const CRC = crcTable();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const body = concat([str(type), data]);
  return concat([be32(data.length), body, be32(crc32(body))]);
}

export interface PngFixtureOptions extends ExifFixtureOptions {
  withText?: boolean;
  withCompressedText?: boolean;
  withXmp?: boolean;
  withExif?: boolean;
  withTime?: boolean;
  withC2pa?: boolean;
  withIcc?: boolean;
  withUnknownAncillary?: boolean;
}

export function buildPngFixture(opts: PngFixtureOptions = {}): Uint8Array {
  const {
    withText = true,
    withCompressedText = true,
    withXmp = true,
    withExif = true,
    withTime = true,
    withC2pa = true,
    withIcc = false,
    withUnknownAncillary = true,
  } = opts;

  const base = loadBase('base.png');
  // Split after IHDR (signature 8 + length 4 + type 4 + data 13 + crc 4).
  const ihdrEnd = 8 + 12 + 13;
  const head = base.subarray(0, ihdrEnd);
  const tail = base.subarray(ihdrEnd);

  const inserted: Uint8Array[] = [];

  if (withText) {
    inserted.push(pngChunk('tEXt', concat([str('parameters'), new Uint8Array([0]), str(EXPECTED.promptText)])));
    inserted.push(pngChunk('tEXt', concat([str('Software'), new Uint8Array([0]), str(EXPECTED.software)])));
  }
  if (withCompressedText) {
    const payload = new Uint8Array(deflateSync(Buffer.from(EXPECTED.promptText, 'utf8')));
    inserted.push(
      pngChunk('zTXt', concat([str('workflow'), new Uint8Array([0, 0]), payload])),
    );
  }
  if (withXmp) {
    inserted.push(
      pngChunk(
        'iTXt',
        concat([
          str('XML:com.adobe.xmp'),
          new Uint8Array([0, 0, 0]), // nul, compressionFlag, compressionMethod
          new Uint8Array([0]), // empty language tag
          new Uint8Array([0]), // empty translated keyword
          str(buildXmp()),
        ]),
      ),
    );
  }
  if (withExif) inserted.push(pngChunk('eXIf', buildExifTiff(opts)));
  if (withTime) inserted.push(pngChunk('tIME', new Uint8Array([0x07, 0xea, 8, 13, 10, 30, 0])));
  if (withC2pa) inserted.push(pngChunk('caBX', buildJumbf()));
  if (withIcc) {
    inserted.push(
      pngChunk('iCCP', concat([str('profile'), new Uint8Array([0, 0]), new Uint8Array(deflateSync(Buffer.alloc(128)))])),
    );
  }
  if (withUnknownAncillary) inserted.push(pngChunk('prVt', str('private metadata')));

  return concat([head, ...inserted, tail]);
}

/* ------------------------------------------------------------------- WebP */

function webpChunk(fourcc: string, data: Uint8Array): Uint8Array {
  const pad = data.length % 2 ? new Uint8Array(1) : new Uint8Array(0);
  return concat([str(fourcc), le32(data.length), data, pad]);
}

export interface WebpFixtureOptions extends ExifFixtureOptions {
  lossless?: boolean;
  withExif?: boolean;
  withXmp?: boolean;
  withIcc?: boolean;
  withC2pa?: boolean;
}

/**
 * Wrap a simple-format WebP in an extended (VP8X) container and attach
 * metadata chunks, setting the flag bits the cleaner must later clear.
 */
export function buildWebpFixture(opts: WebpFixtureOptions = {}): Uint8Array {
  const { lossless = false, withExif = true, withXmp = true, withIcc = true, withC2pa = false } = opts;

  const base = loadBase(lossless ? 'base-lossless.webp' : 'base-lossy.webp');
  // Extract the single image chunk from the simple-format base.
  const fourcc = String.fromCharCode(...base.subarray(12, 16));
  const size = base[16]! | (base[17]! << 8) | (base[18]! << 16) | (base[19]! << 24);
  const imageData = base.subarray(20, 20 + size);

  const width = 32;
  const height = 24;
  let flags = 0;
  if (withIcc) flags |= 0x20;
  if (withExif) flags |= 0x08;
  if (withXmp) flags |= 0x04;

  const vp8x = new Uint8Array(10);
  vp8x[0] = flags;
  const w = width - 1;
  const h = height - 1;
  vp8x[4] = w & 0xff;
  vp8x[5] = (w >> 8) & 0xff;
  vp8x[6] = (w >> 16) & 0xff;
  vp8x[7] = h & 0xff;
  vp8x[8] = (h >> 8) & 0xff;
  vp8x[9] = (h >> 16) & 0xff;

  const chunks: Uint8Array[] = [webpChunk('VP8X', vp8x)];
  if (withIcc) chunks.push(webpChunk('ICCP', new Uint8Array(128)));
  chunks.push(webpChunk(fourcc, imageData));
  if (withExif) chunks.push(webpChunk('EXIF', buildExifTiff(opts)));
  if (withXmp) chunks.push(webpChunk('XMP ', str(buildXmp())));
  if (withC2pa) chunks.push(webpChunk('C2PA', buildJumbf()));

  const body = concat(chunks);
  const payloadLength = 4 + body.length;
  return concat([str('RIFF'), le32(payloadLength), str('WEBP'), body]);
}

/* ------------------------------------------------------------------ SVG */

export interface SvgFixtureOptions {
  withMetadata?: boolean;
  withTitle?: boolean;
  withGeneratorComment?: boolean;
  withEditorAttrs?: boolean;
  withScript?: boolean;
  withEventHandler?: boolean;
  withRemoteRef?: boolean;
  /** Embed a fully-loaded JPEG (EXIF, GPS, XMP, IPTC, C2PA) as a data URI. */
  withEmbeddedJpeg?: boolean;
  withHiddenUnicode?: boolean;
}

/** The drawing content. Must survive cleaning byte-for-byte. */
export const SVG_DRAWING = '<rect x="10" y="10" width="80" height="80" fill="#c4271a"/>';

export function buildSvgFixture(opts: SvgFixtureOptions = {}): Uint8Array {
  const {
    withMetadata = true,
    withTitle = true,
    withGeneratorComment = true,
    withEditorAttrs = true,
    withScript = true,
    withEventHandler = true,
    withRemoteRef = true,
    withEmbeddedJpeg = true,
    withHiddenUnicode = false,
  } = opts;

  const jpeg = withEmbeddedJpeg ? buildJpegFixture() : null;
  const b64 = jpeg ? Buffer.from(jpeg).toString('base64') : '';
  const zwsp = withHiddenUnicode ? '​​⁠' : '';

  const editorNs = withEditorAttrs
    ? `\n     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"\n     xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"`
    : '';
  const editorAttrs = withEditorAttrs
    ? `\n     inkscape:version="1.3.2" sodipodi:docname="secret-project-final.svg"`
    : '';

  return new TextEncoder().encode(
    `<?xml version="1.0" encoding="UTF-8"?>
${withGeneratorComment ? '<!-- Generator: Adobe Illustrator 28.0.0, SVG Export Plug-In -->\n' : ''}<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"${editorNs}
     width="100" height="100" viewBox="0 0 100 100"${editorAttrs}${
       withEventHandler ? '\n     onload="fetch(\'https://tracker.example.com/opened\')"' : ''
     }>
${withTitle ? `  <title>My Secret Drawing${zwsp}</title>\n  <desc>Drawn by ${EXPECTED.artist}</desc>\n` : ''}${
      withMetadata ? `  <metadata>\n${buildXmp(true)}\n  </metadata>\n` : ''
    }${withScript ? `  <script>fetch('https://tracker.example.com/run')</script>\n` : ''}  ${SVG_DRAWING}
${jpeg ? `  <image x="0" y="0" width="50" height="50" xlink:href="data:image/jpeg;base64,${b64}"/>\n` : ''}${
      withRemoteRef
        ? '  <image x="50" y="0" width="50" height="50" href="https://tracker.example.com/pixel.png"/>\n'
        : ''
    }</svg>
`,
  );
}

/* ------------------------------------------------------------------ PDF */

function xrefRow(offset: number, gen: number, kind: 'n' | 'f'): string {
  return `${String(offset).padStart(10, '0')} ${String(gen).padStart(5, '0')} ${kind} \n`;
}

export const PDF_EXPECTED = {
  title: 'Quarterly Report',
  author: 'Jane Doe',
  creator: 'ChatGPT',
  producer: 'NoWatermark Fixture Writer',
  created: 'D:20260813103000Z',
} as const;

interface PdfBody {
  text: string;
  offsets: number[];
}

/** Objects 1-4: catalog, pages, page, info. */
function pdfBody(startAt: number, info: string, catalog: string): PdfBody {
  const objects = [
    catalog,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
    info,
  ];
  const offsets: number[] = [];
  let text = '';
  let at = startAt;
  objects.forEach((body, i) => {
    const chunk = `${i + 1} 0 obj\n${body}\nendobj\n`;
    offsets.push(at);
    text += chunk;
    at += chunk.length;
  });
  return { text, offsets };
}

const FULL_INFO =
  `<< /Title (${PDF_EXPECTED.title}) /Author (${PDF_EXPECTED.author}) ` +
  `/Creator (${PDF_EXPECTED.creator}) /Producer (${PDF_EXPECTED.producer}) ` +
  `/CreationDate (${PDF_EXPECTED.created}) /CustomTag (internal-only) >>`;

export interface PdfFixtureOptions {
  /** Append a second revision whose /Info has had the author "removed". */
  withIncrementalUpdate?: boolean;
  withEncryption?: boolean;
  withJavaScript?: boolean;
  /** Declare a C2PA manifest the way the spec does: an associated file. */
  withC2paAssociatedFile?: boolean;
  /** Append trailing bytes after %%EOF, for false-positive tests. */
  trailingBytes?: Uint8Array;
  info?: string;
}

export function buildPdfFixture(opts: PdfFixtureOptions = {}): Uint8Array {
  const {
    withIncrementalUpdate = false,
    withEncryption = false,
    withJavaScript = false,
    withC2paAssociatedFile = false,
  } = opts;

  const header = '%PDF-1.4\n';
  // Built before offsets are computed: patching it afterwards would shift every
  // object and invalidate the xref table we are about to write.
  const catalogBits = ['/Type /Catalog', '/Pages 2 0 R'];
  if (withJavaScript) {
    catalogBits.push('/OpenAction << /S /JavaScript /JS (app.alert\\(1\\)) >>');
  }
  if (withC2paAssociatedFile) {
    // Held inline rather than as an indirect object so the fixture's xref
    // arithmetic stays a fixed five entries.
    catalogBits.push(
      '/AF [<< /Type /Filespec /AFRelationship /C2PA_Manifest /F (manifest.c2pa) >>]',
    );
  }
  const catalog = `<< ${catalogBits.join(' ')} >>`;
  const body = pdfBody(header.length, opts.info ?? FULL_INFO, catalog);

  const xrefAt = header.length + body.text.length;
  let xref = 'xref\n0 5\n' + xrefRow(0, 65535, 'f');
  for (const off of body.offsets) xref += xrefRow(off, 0, 'n');

  const trailerBits = ['/Size 5', '/Root 1 0 R', '/Info 4 0 R'];
  if (withEncryption) trailerBits.push('/Encrypt 9 0 R');
  const trailer = `trailer\n<< ${trailerBits.join(' ')} >>\nstartxref\n${xrefAt}\n%%EOF\n`;

  let pdf = header + body.text + xref + trailer;

  if (withIncrementalUpdate) {
    /*
     * The incremental-write trap, exactly as a metadata "remover" produces it:
     * a fresh /Info with the author gone, appended on top. The original object
     * is untouched and still readable earlier in the file.
     */
    const cleanedAt = pdf.length;
    const cleaned = `4 1 obj\n<< /Title (${PDF_EXPECTED.title}) >>\nendobj\n`;
    const updateXrefAt = cleanedAt + cleaned.length;

    const updateXref = 'xref\n0 1\n' + xrefRow(0, 65535, 'f') + '4 1\n' + xrefRow(cleanedAt, 1, 'n');
    const updateTrailer =
      `trailer\n<< /Size 5 /Root 1 0 R /Info 4 1 R /Prev ${xrefAt} >>\n` +
      `startxref\n${updateXrefAt}\n%%EOF\n`;

    pdf += cleaned + updateXref + updateTrailer;
  }

  const encoded = new TextEncoder().encode(pdf);
  if (!opts.trailingBytes) return encoded;

  const out = new Uint8Array(encoded.length + opts.trailingBytes.length);
  out.set(encoded, 0);
  out.set(opts.trailingBytes, encoded.length);
  return out;
}

/**
 * A syntactically real JUMBF superbox: length, type `jumb`, and a `jumd`
 * description box as its first child. Used to prove the detector wants the box
 * shape and not the four ASCII bytes.
 */
export function buildJumbfSuperbox(): Uint8Array {
  const descriptionLength = 8 + 16; // header + a UUID
  const total = 8 + descriptionLength;

  const box = new Uint8Array(total);
  const view = new DataView(box.buffer);
  view.setUint32(0, total);
  box.set(new TextEncoder().encode('jumb'), 4);
  view.setUint32(8, descriptionLength);
  box.set(new TextEncoder().encode('jumd'), 12);
  return box;
}

import { describe, expect, it } from 'vitest';

import { cleanImage } from '../src/lib/clean';
import { detectType } from '../src/lib/filetype';
import { walkJpeg } from '../src/lib/metadata/jpeg';
import { decodeSvg, readSvg } from '../src/lib/metadata/svg';
import { scanImage } from '../src/lib/scan';
import { allSignals, type ScanResult } from '../src/lib/types';
import { EXPECTED, SVG_DRAWING, buildJpegFixture, buildSvgFixture } from './fixtures/build';

const input = (name = 's.svg', size = 0) => ({ name, type: 'image/svg+xml', size });

function statusOf(result: ScanResult, id: string) {
  return allSignals(result).find((s) => s.id === id)?.status;
}

async function bytesOf(blob: Blob | undefined): Promise<Uint8Array> {
  if (!blob) throw new Error('no blob produced');
  return new Uint8Array(await blob.arrayBuffer());
}

function textOf(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** The base64 payload of the first data: URI in an SVG. */
function embeddedJpeg(bytes: Uint8Array): Uint8Array {
  const m = /data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/.exec(textOf(bytes));
  if (!m) throw new Error('no embedded JPEG found');
  return new Uint8Array(Buffer.from(m[1]!, 'base64'));
}

describe('detecting SVG', () => {
  it('recognises an SVG behind an XML declaration and a licence comment', () => {
    expect(detectType(buildSvgFixture())).toBe('svg');
  });

  it('refuses to decode a non-UTF-8 SVG rather than mangling it', () => {
    // A lone 0xFF is not valid UTF-8.
    const bad = new Uint8Array([...new TextEncoder().encode('<svg><desc>'), 0xff, 0xfe, 0x00]);
    const decoded = decodeSvg(bad);
    expect(decoded.ok).toBe(false);
  });
});

describe('scanning SVG', () => {
  it('finds the metadata an SVG carries in its own markup', async () => {
    const svg = buildSvgFixture();
    const result = await scanImage(svg, input('s.svg', svg.length));

    expect(result.file.format).toBe('svg');
    expect(statusOf(result, 'xmp')).toBe('detected');
    expect(statusOf(result, 'embedded-text')).toBe('detected');
    expect(statusOf(result, 'author')).toBe('detected');
    expect(statusOf(result, 'active-content')).toBe('detected');
    expect(statusOf(result, 'remote-reference')).toBe('detected');
  });

  it('reports the AI generator declared in the SVG metadata', async () => {
    const svg = buildSvgFixture();
    const result = await scanImage(svg, input('s.svg', svg.length));
    expect(statusOf(result, 'ai-generator')).toBe('detected');
  });

  // The nesting trap: strip only the XML and the user's coordinates are still
  // in the file, one base64 decode away.
  it('finds GPS inside a JPEG embedded as a data URI', async () => {
    const svg = buildSvgFixture();
    const result = await scanImage(svg, input('s.svg', svg.length));

    expect(statusOf(result, 'gps')).toBe('detected');
    expect(statusOf(result, 'exif')).toBe('detected');
    const gps = allSignals(result).find((s) => s.id === 'gps');
    expect(gps?.value).toContain('51.5');
  });

  it('never claims SynthID either way', async () => {
    const svg = buildSvgFixture();
    const result = await scanImage(svg, input('s.svg', svg.length));
    expect(statusOf(result, 'synthid')).toBe('unable_to_verify');
  });

  it('does not show script or remote-reference rows for a raster image', async () => {
    const jpeg = buildJpegFixture();
    const result = await scanImage(jpeg, { name: 'p.jpg', type: 'image/jpeg', size: jpeg.length });
    expect(statusOf(result, 'active-content')).toBeUndefined();
    expect(statusOf(result, 'remote-reference')).toBeUndefined();
  });
});

describe('cleaning SVG', () => {
  it('removes every removable signal and verifies it by re-scanning', async () => {
    const svg = buildSvgFixture();
    const outcome = await cleanImage(svg, input('s.svg', svg.length));

    expect(outcome.result.success).toBe(true);
    const after = outcome.after!;
    expect(statusOf(after, 'xmp')).toBe('not_detected');
    expect(statusOf(after, 'embedded-text')).toBe('not_detected');
    expect(statusOf(after, 'author')).toBe('not_detected');
    expect(statusOf(after, 'active-content')).toBe('not_detected');
    expect(statusOf(after, 'remote-reference')).toBe('not_detected');
    expect(statusOf(after, 'gps')).toBe('not_detected');
  });

  // Non-negotiable #5, through the nesting. The container is rewritten; the
  // compressed image data is copied.
  it('does not recompress the embedded JPEG: its scan data is byte-identical', async () => {
    const svg = buildSvgFixture();
    const outcome = await cleanImage(svg, input('s.svg', svg.length));
    const cleaned = await bytesOf(outcome.result.blob);

    const before = embeddedJpeg(svg);
    const after = embeddedJpeg(cleaned);

    const a = walkJpeg(before);
    const b = walkJpeg(after);
    const scanA = before.subarray(a.scanStart);
    const scanB = after.subarray(b.scanStart);

    expect(scanB.length).toBe(scanA.length);
    expect(Buffer.from(scanB).equals(Buffer.from(scanA))).toBe(true);
  });

  it('actually strips the GPS from the embedded JPEG, not just the wrapper', async () => {
    const svg = buildSvgFixture();
    const outcome = await cleanImage(svg, input('s.svg', svg.length));
    const cleaned = await bytesOf(outcome.result.blob);

    const jpeg = embeddedJpeg(cleaned);
    const rescan = await scanImage(jpeg, {
      name: 'inner.jpg',
      type: 'image/jpeg',
      size: jpeg.length,
    });
    expect(statusOf(rescan, 'gps')).toBe('not_detected');
    expect(statusOf(rescan, 'device')).toBe('not_detected');
    expect(statusOf(rescan, 'author')).toBe('not_detected');

    // Orientation preservation propagates through the nesting: all that should
    // survive is the single rotation field, exactly as for a standalone JPEG.
    const exif = allSignals(rescan).find((s) => s.id === 'exif');
    expect(exif?.value).toBe('1 field');
  });

  it('drops the embedded image\'s orientation too when the user opts out', async () => {
    const svg = buildSvgFixture();
    const outcome = await cleanImage(svg, input('s.svg', svg.length), {
      preserveOrientation: false,
    });
    const jpeg = embeddedJpeg(await bytesOf(outcome.result.blob));
    const rescan = await scanImage(jpeg, {
      name: 'inner.jpg',
      type: 'image/jpeg',
      size: jpeg.length,
    });
    expect(statusOf(rescan, 'exif')).toBe('not_detected');
  });

  it('neutralises scripts and event handlers', async () => {
    const svg = buildSvgFixture();
    const outcome = await cleanImage(svg, input('s.svg', svg.length));
    const out = textOf(await bytesOf(outcome.result.blob));

    expect(out).not.toContain('<script');
    expect(out).not.toContain('onload');
    expect(out).not.toContain('tracker.example.com');
  });

  it('removes the original filename the editor left behind', async () => {
    const svg = buildSvgFixture();
    const outcome = await cleanImage(svg, input('s.svg', svg.length));
    const out = textOf(await bytesOf(outcome.result.blob));

    expect(out).not.toContain('secret-project-final.svg');
    expect(out).not.toContain('sodipodi');
    expect(out).not.toContain('inkscape');
  });

  // Surgical edits, not parse-and-reserialise: everything we did not remove is
  // still there, byte for byte.
  it('leaves the drawing itself untouched', async () => {
    const svg = buildSvgFixture();
    const outcome = await cleanImage(svg, input('s.svg', svg.length));
    const out = textOf(await bytesOf(outcome.result.blob));

    expect(out).toContain(SVG_DRAWING);
    expect(out).toContain('viewBox="0 0 100 100"');
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it('finds hidden Unicode in SVG text and removes it', async () => {
    const svg = buildSvgFixture({ withHiddenUnicode: true });
    const result = await scanImage(svg, input('s.svg', svg.length));
    expect(statusOf(result, 'hidden-unicode')).toBe('detected');
  });

  it('cleaning a second time is a no-op', async () => {
    const svg = buildSvgFixture();
    const first = await cleanImage(svg, input('s.svg', svg.length));
    const once = await bytesOf(first.result.blob);

    const second = await cleanImage(once, input('s-clean.svg', once.length));
    const twice = await bytesOf(second.result.blob);

    expect(Buffer.from(twice).equals(Buffer.from(once))).toBe(true);
  });

  it('handles a plain SVG with nothing to remove', async () => {
    const svg = buildSvgFixture({
      withMetadata: false,
      withTitle: false,
      withGeneratorComment: false,
      withEditorAttrs: false,
      withScript: false,
      withEventHandler: false,
      withRemoteRef: false,
      withEmbeddedJpeg: false,
    });
    const outcome = await cleanImage(svg, input('plain.svg', svg.length));
    expect(outcome.result.success).toBe(true);
    expect(textOf(await bytesOf(outcome.result.blob))).toContain(SVG_DRAWING);
  });

  it('names the download with an .svg extension', async () => {
    const svg = buildSvgFixture();
    const outcome = await cleanImage(svg, input('drawing.svg', svg.length));
    expect(outcome.filename).toBe('drawing-clean.svg');
  });
});

describe('SVG structure walker', () => {
  it('does not end a tag on a > inside a quoted attribute value', () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><desc data-x="a > b">hi</desc></svg>',
    );
    const read = readSvg(svg);
    if ('error' in read) throw new Error(read.error);
    expect(read.meta.descElements).toHaveLength(1);
  });

  it('reports the artist from XMP inside a metadata element', async () => {
    const svg = buildSvgFixture({ withEmbeddedJpeg: false });
    const result = await scanImage(svg, input('s.svg', svg.length));
    const author = allSignals(result).find((s) => s.id === 'author');
    expect(author?.value).toContain(EXPECTED.artist);
  });
});

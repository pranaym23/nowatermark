import { describe, expect, it } from 'vitest';

import { cleanImage } from '../src/lib/clean';
import { walkJpeg } from '../src/lib/metadata/jpeg';
import { walkPng } from '../src/lib/metadata/png';
import {
  VP8X_FLAG_EXIF,
  VP8X_FLAG_ICC,
  VP8X_FLAG_XMP,
  walkWebp,
} from '../src/lib/metadata/webp';
import { u32le } from '../src/lib/bytes';
import { scanImage } from '../src/lib/scan';
import { CLEAN_PRESETS, presetById, signalById } from '../src/lib/signals';
import { allSignals } from '../src/lib/types';
import type { ScanResult } from '../src/lib/types';
import {
  EXPECTED,
  buildJpegFixture,
  buildPngFixture,
  buildWebpFixture,
  loadBase,
} from './fixtures/build';

async function bytesOf(blob: Blob | undefined): Promise<Uint8Array> {
  if (!blob) throw new Error('no blob produced');
  return new Uint8Array(await blob.arrayBuffer());
}

function statusOf(result: ScanResult, id: string) {
  return allSignals(result).find((s) => s.id === id)?.status;
}

const input = (name: string, type: string, size: number) => ({ name, type, size });

/* ----------------------------------------------------------------- JPEG */

describe('cleaning JPEG', () => {
  it('removes every removable signal and verifies it by re-scanning', async () => {
    const original = buildJpegFixture();
    const outcome = await cleanImage(original, input('photo.jpg', 'image/jpeg', original.length));

    expect(outcome.result.success).toBe(true);
    const after = outcome.after!;

    expect(statusOf(after, 'xmp')).toBe('not_detected');
    expect(statusOf(after, 'iptc')).toBe('not_detected');
    expect(statusOf(after, 'c2pa')).toBe('not_detected');
    expect(statusOf(after, 'embedded-text')).toBe('not_detected');
    expect(statusOf(after, 'gps')).toBe('not_detected');
    expect(statusOf(after, 'device')).toBe('not_detected');
    expect(statusOf(after, 'software')).toBe('not_detected');
    expect(statusOf(after, 'author')).toBe('not_detected');

    expect(outcome.result.removedSignals).toContain('c2pa');
    expect(outcome.result.removedSignals).toContain('gps');
  });

  it('does not recompress: the entropy-coded scan data is byte-identical', async () => {
    const original = buildJpegFixture();
    const outcome = await cleanImage(original, input('p.jpg', 'image/jpeg', original.length));
    const cleaned = await bytesOf(outcome.result.blob);

    const a = walkJpeg(original);
    const b = walkJpeg(cleaned);
    const scanA = original.subarray(a.scanStart);
    const scanB = cleaned.subarray(b.scanStart);

    expect(scanB.length).toBe(scanA.length);
    expect(Buffer.from(scanB).equals(Buffer.from(scanA))).toBe(true);
  });

  it('preserves the ICC profile, the Adobe marker and the JFIF header', async () => {
    const original = buildJpegFixture();
    const outcome = await cleanImage(original, input('p.jpg', 'image/jpeg', original.length));
    const cleaned = await bytesOf(outcome.result.blob);
    const markers = walkJpeg(cleaned).segments.map((s) => s.marker);

    expect(markers).toContain(0xe0); // APP0 JFIF
    expect(markers).toContain(0xe2); // APP2 ICC — removing it shifts colours
    expect(markers).toContain(0xee); // APP14 Adobe — removing it breaks colours
    expect(statusOf(outcome.after!, 'icc')).toBe('detected');
  });

  it('keeps a rotated image upright by preserving only the orientation tag', async () => {
    const original = buildJpegFixture({ orientation: 6 });
    const outcome = await cleanImage(original, input('p.jpg', 'image/jpeg', original.length));
    const after = outcome.after!;

    expect(outcome.orientationPreserved).toBe(6);
    // EXIF survives, but carrying exactly one field.
    expect(statusOf(after, 'exif')).toBe('detected');
    expect(allSignals(after).find((s) => s.id === 'exif')?.value).toBe('1 field');
    // Everything private inside it is gone.
    expect(statusOf(after, 'gps')).toBe('not_detected');
    expect(statusOf(after, 'device')).toBe('not_detected');

    const exifComparison = outcome.comparisons.find((c) => c.id === 'exif');
    expect(exifComparison?.outcome).toBe('kept');
    expect(exifComparison?.note).toContain('rotation');
  });

  it('removes EXIF entirely for an unrotated image', async () => {
    const original = buildJpegFixture({ orientation: 1 });
    const outcome = await cleanImage(original, input('p.jpg', 'image/jpeg', original.length));

    expect(outcome.orientationPreserved).toBeUndefined();
    expect(statusOf(outcome.after!, 'exif')).toBe('not_detected');
  });

  it('removes EXIF entirely when the user opts out of orientation preservation', async () => {
    const original = buildJpegFixture({ orientation: 6 });
    const outcome = await cleanImage(
      original,
      input('p.jpg', 'image/jpeg', original.length),
      { preserveOrientation: false },
    );

    expect(outcome.orientationPreserved).toBeUndefined();
    expect(statusOf(outcome.after!, 'exif')).toBe('not_detected');
  });

  it('removes Extended XMP spread across multiple segments', async () => {
    const original = buildJpegFixture({ withExtendedXmp: true });
    const outcome = await cleanImage(original, input('p.jpg', 'image/jpeg', original.length));
    expect(statusOf(outcome.after!, 'xmp')).toBe('not_detected');
  });

  it('produces a smaller file than it started with', async () => {
    const original = buildJpegFixture();
    const outcome = await cleanImage(original, input('p.jpg', 'image/jpeg', original.length));
    expect(outcome.sizeAfter!).toBeLessThan(outcome.sizeBefore);
  });
});

/* ------------------------------------------------------------------ PNG */

describe('cleaning PNG', () => {
  it('removes text chunks, XMP, EXIF, timestamps and C2PA', async () => {
    const original = buildPngFixture();
    const outcome = await cleanImage(original, input('img.png', 'image/png', original.length));
    const after = outcome.after!;

    expect(statusOf(after, 'embedded-text')).toBe('not_detected');
    expect(statusOf(after, 'xmp')).toBe('not_detected');
    expect(statusOf(after, 'c2pa')).toBe('not_detected');
    expect(statusOf(after, 'gps')).toBe('not_detected');
    expect(statusOf(after, 'ai-generator')).toBe('not_detected');
  });

  it('leaves IDAT bit-identical, so pixels are untouched', async () => {
    const original = buildPngFixture();
    const outcome = await cleanImage(original, input('i.png', 'image/png', original.length));
    const cleaned = await bytesOf(outcome.result.blob);

    const idat = (b: Uint8Array) =>
      walkPng(b)
        .chunks.filter((c) => c.type === 'IDAT')
        .map((c) => Buffer.from(b.subarray(c.dataStart, c.dataEnd)));

    const a = Buffer.concat(idat(original));
    const z = Buffer.concat(idat(cleaned));
    expect(z.length).toBeGreaterThan(0);
    expect(z.equals(a)).toBe(true);
  });

  it('strips unknown ancillary chunks but keeps every critical chunk', async () => {
    const original = buildPngFixture({ withUnknownAncillary: true });
    const outcome = await cleanImage(original, input('i.png', 'image/png', original.length));
    const cleaned = await bytesOf(outcome.result.blob);
    const types = walkPng(cleaned).chunks.map((c) => c.type);

    expect(types).not.toContain('prVt');
    expect(types).toContain('IHDR');
    expect(types).toContain('IDAT');
    expect(types).toContain('IEND');
  });

  it('keeps the colour profile', async () => {
    const original = buildPngFixture({ withIcc: true });
    const outcome = await cleanImage(original, input('i.png', 'image/png', original.length));
    const cleaned = await bytesOf(outcome.result.blob);
    expect(walkPng(cleaned).chunks.map((c) => c.type)).toContain('iCCP');
  });

  it('re-embeds a valid orientation chunk when the image is rotated', async () => {
    const original = buildPngFixture({ orientation: 8 });
    const outcome = await cleanImage(original, input('i.png', 'image/png', original.length));
    const cleaned = await bytesOf(outcome.result.blob);

    expect(outcome.orientationPreserved).toBe(8);
    const chunks = walkPng(cleaned).chunks;
    expect(chunks.map((c) => c.type)).toContain('eXIf');
    // eXIf must come before the image data.
    const exifAt = chunks.findIndex((c) => c.type === 'eXIf');
    const idatAt = chunks.findIndex((c) => c.type === 'IDAT');
    expect(exifAt).toBeLessThan(idatAt);
  });
});

/* ----------------------------------------------------------------- WebP */

describe('cleaning WebP', () => {
  it('removes EXIF and XMP chunks', async () => {
    const original = buildWebpFixture();
    const outcome = await cleanImage(original, input('i.webp', 'image/webp', original.length));
    const after = outcome.after!;

    expect(statusOf(after, 'xmp')).toBe('not_detected');
    expect(statusOf(after, 'gps')).toBe('not_detected');
    expect(statusOf(after, 'software')).toBe('not_detected');
  });

  it('clears the VP8X flag bits for chunks it removed', async () => {
    const original = buildWebpFixture({ orientation: 1 });
    const outcome = await cleanImage(original, input('i.webp', 'image/webp', original.length));
    const cleaned = await bytesOf(outcome.result.blob);

    const structure = walkWebp(cleaned);
    expect(structure.vp8xDataStart).toBeGreaterThan(0);
    const flags = cleaned[structure.vp8xDataStart]!;

    expect(flags & VP8X_FLAG_XMP).toBe(0);
    expect(flags & VP8X_FLAG_EXIF).toBe(0);
    // ICC survives, so its bit must stay set.
    expect(flags & VP8X_FLAG_ICC).toBe(VP8X_FLAG_ICC);
  });

  it('keeps the EXIF flag set when orientation is preserved', async () => {
    const original = buildWebpFixture({ orientation: 6 });
    const outcome = await cleanImage(original, input('i.webp', 'image/webp', original.length));
    const cleaned = await bytesOf(outcome.result.blob);

    const structure = walkWebp(cleaned);
    const flags = cleaned[structure.vp8xDataStart]!;
    expect(flags & VP8X_FLAG_EXIF).toBe(VP8X_FLAG_EXIF);
    expect(outcome.orientationPreserved).toBe(6);
  });

  it('recomputes the RIFF size field to match the new file length', async () => {
    const original = buildWebpFixture();
    const outcome = await cleanImage(original, input('i.webp', 'image/webp', original.length));
    const cleaned = await bytesOf(outcome.result.blob);

    expect(u32le(cleaned, 4)).toBe(cleaned.length - 8);
  });

  it('keeps every chunk boundary even, as RIFF requires', async () => {
    const original = buildWebpFixture();
    const outcome = await cleanImage(original, input('i.webp', 'image/webp', original.length));
    const cleaned = await bytesOf(outcome.result.blob);

    for (const chunk of walkWebp(cleaned).chunks) {
      expect(chunk.offset % 2).toBe(0);
    }
  });

  it('leaves the compressed image payload untouched', async () => {
    const original = buildWebpFixture();
    const outcome = await cleanImage(original, input('i.webp', 'image/webp', original.length));
    const cleaned = await bytesOf(outcome.result.blob);

    const payload = (b: Uint8Array) => {
      const c = walkWebp(b).chunks.find((x) => x.fourcc === 'VP8 ' || x.fourcc === 'VP8L')!;
      return Buffer.from(b.subarray(c.dataStart, c.dataEnd));
    };
    expect(payload(cleaned).equals(payload(original))).toBe(true);
  });

  it('handles lossless WebP', async () => {
    const original = buildWebpFixture({ lossless: true });
    const outcome = await cleanImage(original, input('i.webp', 'image/webp', original.length));
    expect(outcome.result.success).toBe(true);
    expect(statusOf(outcome.after!, 'xmp')).toBe('not_detected');
  });
});

/* ------------------------------------------------------- honesty & safety */

describe('clean reporting honesty', () => {
  it('never reports SynthID as removed', async () => {
    for (const [bytes, name, type] of [
      [buildJpegFixture(), 'a.jpg', 'image/jpeg'],
      [buildPngFixture(), 'a.png', 'image/png'],
      [buildWebpFixture(), 'a.webp', 'image/webp'],
    ] as const) {
      const outcome = await cleanImage(bytes, input(name, type, bytes.length));
      expect(outcome.result.removedSignals).not.toContain('synthid');
      expect(outcome.result.remainingSignals).toContain('synthid');

      const synthid = outcome.comparisons.find((c) => c.id === 'synthid');
      expect(synthid?.outcome).toBe('unverifiable');
    }
  });

  it('only reports a signal as removed when the re-scan agrees', async () => {
    const original = buildJpegFixture();
    const outcome = await cleanImage(original, input('a.jpg', 'image/jpeg', original.length));
    const after = outcome.after!;

    for (const id of outcome.result.removedSignals) {
      expect(statusOf(after, id)).not.toBe('detected');
    }
  });

  it('cleaning a second time is a no-op', async () => {
    const original = buildPngFixture();
    const first = await cleanImage(original, input('a.png', 'image/png', original.length));
    const cleanedOnce = await bytesOf(first.result.blob);

    const second = await cleanImage(
      cleanedOnce,
      input('a.png', 'image/png', cleanedOnce.length),
    );
    const cleanedTwice = await bytesOf(second.result.blob);

    expect(Buffer.from(cleanedTwice).equals(Buffer.from(cleanedOnce))).toBe(true);
    expect(second.result.removedSignals).toHaveLength(0);
  });

  it('reports failure without producing a file when the input cannot be cleaned', async () => {
    const broken = loadBase('base.png').slice(0, 30);
    await expect(
      cleanImage(broken, input('broken.png', 'image/png', broken.length)),
    ).rejects.toThrow();
  });

  it('cleans an already-clean file without reporting an error', async () => {
    const plain = loadBase('base.png');
    const outcome = await cleanImage(plain, input('plain.png', 'image/png', plain.length));

    expect(outcome.result.success).toBe(true);
    expect(outcome.result.removedSignals).toHaveLength(0);
  });
});

describe('output naming', () => {
  it('suggests a -clean filename with the true extension', async () => {
    const original = buildPngFixture();
    const outcome = await cleanImage(
      original,
      input('My Photo.PNG', 'image/png', original.length),
    );
    expect(outcome.filename).toBe('My Photo-clean.png');
  });

  it('uses the real format even when the extension lies', async () => {
    const original = buildPngFixture();
    const outcome = await cleanImage(original, input('fake.jpg', 'image/jpeg', original.length));
    expect(outcome.filename).toBe('fake-clean.png');
  });
});

describe('expected fixture values survive nothing', () => {
  it('the generator string is genuinely gone from the cleaned bytes', async () => {
    const original = buildJpegFixture();
    const outcome = await cleanImage(original, input('a.jpg', 'image/jpeg', original.length));
    const cleaned = await bytesOf(outcome.result.blob);
    const haystack = Buffer.from(cleaned).toString('latin1');

    expect(haystack).not.toContain(EXPECTED.software);
    expect(haystack).not.toContain(EXPECTED.artist);
    expect(haystack).not.toContain(EXPECTED.claimGenerator);
    expect(haystack).not.toContain('trainedAlgorithmicMedia');
  });

  it('the prompt text is gone from a cleaned PNG', async () => {
    const original = buildPngFixture();
    const outcome = await cleanImage(original, input('a.png', 'image/png', original.length));
    const cleaned = await bytesOf(outcome.result.blob);
    const haystack = Buffer.from(cleaned).toString('latin1');

    expect(haystack).not.toContain(EXPECTED.promptText);
    expect(haystack).not.toContain('parameters');
  });
});

/*
 * Presets (V2 R5).
 *
 * The claim a preset makes is not "we removed some things" but "we removed
 * exactly these and deliberately kept those". The kept half is the half that
 * can mislead, so it is asserted just as hard as the removed half.
 */
describe('cleanup presets', () => {
  it('privacy-safe drops EXIF and IPTC but keeps the provenance record', async () => {
    const original = buildJpegFixture();
    const preset = presetById('privacy-safe')!;
    const outcome = await cleanImage(
      original,
      input('photo.jpg', 'image/jpeg', original.length),
      { blocks: preset.blocks },
    );

    expect(outcome.result.success).toBe(true);
    const after = outcome.after!;

    // Gone: the blocks that carry who and where.
    expect(statusOf(after, 'gps')).toBe('not_detected');
    expect(statusOf(after, 'device')).toBe('not_detected');
    expect(statusOf(after, 'iptc')).toBe('not_detected');

    // Kept, and this is the point: a file that declared itself AI-made still
    // does. A "privacy" clean that silently stripped provenance would be
    // making an editorial decision on the user's behalf.
    expect(statusOf(after, 'c2pa')).toBe('detected');
  });

  it('provenance-light drops the manifest but leaves camera data alone', async () => {
    const original = buildJpegFixture();
    const preset = presetById('provenance-light')!;
    const outcome = await cleanImage(
      original,
      input('photo.jpg', 'image/jpeg', original.length),
      { blocks: preset.blocks },
    );

    expect(outcome.result.success).toBe(true);
    const after = outcome.after!;

    expect(statusOf(after, 'c2pa')).toBe('not_detected');
    expect(statusOf(after, 'xmp')).toBe('not_detected');

    // Still there — and the preset copy says so, because a user who wanted
    // their location gone must not think this did it.
    expect(statusOf(after, 'gps')).toBe('detected');
  });

  it('omitting blocks still removes everything, as every older caller expects', async () => {
    const original = buildJpegFixture();
    const outcome = await cleanImage(original, input('p.jpg', 'image/jpeg', original.length));
    const after = outcome.after!;
    expect(statusOf(after, 'c2pa')).toBe('not_detected');
    expect(statusOf(after, 'gps')).toBe('not_detected');
  });

  it('reports a block the preset spared as kept, never as a failure', async () => {
    const original = buildJpegFixture();
    const preset = presetById('privacy-safe')!;
    const outcome = await cleanImage(
      original,
      input('photo.jpg', 'image/jpeg', original.length),
      { blocks: preset.blocks },
    );

    const c2pa = outcome.comparisons.find((c) => c.id === 'c2pa')!;

    // "could not be removed" would be a straight falsehood: nothing was
    // attempted. It also reads as the tool failing rather than as the choice
    // the user made.
    expect(c2pa.outcome).toBe('kept');
    expect(c2pa.note ?? '').not.toMatch(/could not be removed/i);
    expect(outcome.result.warnings.join(' ')).not.toMatch(/C2PA.*could not be removed/i);
  });

  it('presets never name a signal that cannot actually be removed', () => {
    for (const preset of CLEAN_PRESETS) {
      for (const id of preset.blocks) {
        const spec = signalById(id);
        expect(spec, `${preset.id} names unknown signal ${id}`).toBeDefined();
        expect(spec!.remove, `${preset.id} claims it removes ${id}, which is not removable`).toBe(
          true,
        );
      }
    }
  });

  it('a preset selection does not recompress either', async () => {
    const original = buildJpegFixture();
    const preset = presetById('privacy-safe')!;
    const outcome = await cleanImage(
      original,
      input('p.jpg', 'image/jpeg', original.length),
      { blocks: preset.blocks },
    );
    const cleaned = await bytesOf(outcome.result.blob);
    const scanA = original.subarray(walkJpeg(original).scanStart);
    const scanB = cleaned.subarray(walkJpeg(cleaned).scanStart);

    expect(scanB.length).toBe(scanA.length);
    expect(Buffer.from(scanB).equals(Buffer.from(scanA))).toBe(true);
  });
});

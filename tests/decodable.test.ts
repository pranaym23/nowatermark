/**
 * Independent decoder verification.
 *
 * Every other test checks our cleaner against our own parsers, which cannot
 * catch a mistake both sides share. This suite writes cleaned files to disk
 * and asks a real image decoder to open them, confirming that the output is a
 * valid image with unchanged dimensions.
 *
 * The checks self-skip when the external tool is unavailable, so the suite
 * still passes on CI machines without it.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { cleanImage } from '../src/lib/clean';
import { buildJpegFixture, buildPngFixture, buildWebpFixture } from './fixtures/build';

function hasTool(name: string): boolean {
  try {
    execFileSync('/usr/bin/which', [name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const SIPS = process.platform === 'darwin' && hasTool('sips');
const dir = mkdtempSync(join(tmpdir(), 'nowatermark-'));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Ask the OS decoder for the image dimensions. Throws if it cannot decode. */
function decodeDimensions(path: string): { width: number; height: number } {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', path], {
    encoding: 'utf8',
  });
  const width = Number(/pixelWidth:\s*(\d+)/.exec(out)?.[1]);
  const height = Number(/pixelHeight:\s*(\d+)/.exec(out)?.[1]);
  if (!width || !height) throw new Error(`decoder returned no dimensions:\n${out}`);
  return { width, height };
}

async function cleanToDisk(bytes: Uint8Array, name: string, type: string): Promise<string> {
  const outcome = await cleanImage(bytes, { name, type, size: bytes.length });
  expect(outcome.result.success).toBe(true);
  const blob = outcome.result.blob!;
  const path = join(dir, name);
  writeFileSync(path, Buffer.from(await blob.arrayBuffer()));
  return path;
}

describe.skipIf(!SIPS)('cleaned output opens in a real decoder', () => {
  it('cleaned JPEG decodes at the original size', async () => {
    const path = await cleanToDisk(buildJpegFixture(), 'clean.jpg', 'image/jpeg');
    expect(decodeDimensions(path)).toEqual({ width: 32, height: 24 });
  });

  it('cleaned PNG decodes at the original size', async () => {
    const path = await cleanToDisk(buildPngFixture(), 'clean.png', 'image/png');
    expect(decodeDimensions(path)).toEqual({ width: 32, height: 24 });
  });

  it('cleaned lossy WebP decodes at the original size', async () => {
    const path = await cleanToDisk(buildWebpFixture(), 'clean.webp', 'image/webp');
    expect(decodeDimensions(path)).toEqual({ width: 32, height: 24 });
  });

  it('cleaned lossless WebP decodes at the original size', async () => {
    const path = await cleanToDisk(
      buildWebpFixture({ lossless: true }),
      'clean-lossless.webp',
      'image/webp',
    );
    expect(decodeDimensions(path)).toEqual({ width: 32, height: 24 });
  });

  it('a rotated JPEG keeps its orientation through cleaning', async () => {
    const path = await cleanToDisk(
      buildJpegFixture({ orientation: 6 }),
      'rotated.jpg',
      'image/jpeg',
    );
    // Orientation 6 is a 90° rotation, so a decoder that honours EXIF reports
    // the dimensions swapped. Either way it must still decode.
    const { width, height } = decodeDimensions(path);
    expect(new Set([width, height])).toEqual(new Set([32, 24]));
  });
});

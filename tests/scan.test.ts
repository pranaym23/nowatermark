import { describe, expect, it } from 'vitest';

import { ScanError, scanImage } from '../src/lib/scan';
import { allSignals } from '../src/lib/types';
import type { ScanResult, SignalResult } from '../src/lib/types';
import {
  EXPECTED,
  buildJpegFixture,
  buildPngFixture,
  buildWebpFixture,
  loadBase,
} from './fixtures/build';

function signal(result: ScanResult, id: string): SignalResult {
  const found = allSignals(result).find((s) => s.id === id);
  if (!found) throw new Error(`no signal ${id}`);
  return found;
}

const input = (name: string, type: string, size: number) => ({ name, type, size });

async function scan(bytes: Uint8Array, name = 'test.jpg', type = 'image/jpeg') {
  return scanImage(bytes, input(name, type, bytes.length));
}

describe('scanning JPEG', () => {
  it('finds every planted signal', async () => {
    const bytes = buildJpegFixture();
    const result = await scan(bytes);

    expect(signal(result, 'exif').status).toBe('detected');
    expect(signal(result, 'xmp').status).toBe('detected');
    expect(signal(result, 'iptc').status).toBe('detected');
    expect(signal(result, 'c2pa').status).toBe('detected');
    expect(signal(result, 'embedded-text').status).toBe('detected');
    expect(signal(result, 'icc').status).toBe('detected');
  });

  it('reads privacy values accurately', async () => {
    const result = await scan(buildJpegFixture());

    expect(signal(result, 'device').value).toBe(`${EXPECTED.make} ${EXPECTED.model}`);
    expect(signal(result, 'software').value).toBe(EXPECTED.software);
    expect(signal(result, 'author').value).toBe(EXPECTED.artist);
    expect(signal(result, 'timestamp').value).toContain('2026');

    const gps = signal(result, 'gps');
    expect(gps.status).toBe('detected');
    // London: 51.5074 N, 0.1278 W
    expect(gps.value).toMatch(/51\.507\d+° N/);
    expect(gps.value).toMatch(/0\.127\d+° W/);
  });

  it('identifies the AI generator and reads the C2PA claim generator', async () => {
    const result = await scan(buildJpegFixture());

    const ai = signal(result, 'ai-generator');
    expect(ai.status).toBe('detected');
    expect(ai.value).toContain('generative AI');

    expect(signal(result, 'c2pa').value).toContain(EXPECTED.claimGenerator);
  });

  it('reports image dimensions from the container, without decoding', async () => {
    const result = await scan(buildJpegFixture());
    expect(result.file.width).toBe(32);
    expect(result.file.height).toBe(24);
  });

  it('reports a clean file as clean rather than erroring', async () => {
    const bytes = buildJpegFixture({
      withExif: false,
      withXmp: false,
      withIptc: false,
      withC2pa: false,
      withComment: false,
    });
    const result = await scan(bytes);

    expect(signal(result, 'exif').status).toBe('not_detected');
    expect(signal(result, 'c2pa').status).toBe('not_detected');
    expect(signal(result, 'gps').status).toBe('not_detected');
  });

  it('finds Extended XMP split across multiple segments', async () => {
    const result = await scan(buildJpegFixture({ withExtendedXmp: true }));
    expect(signal(result, 'xmp').value).toContain('extended');
  });
});

describe('scanning PNG', () => {
  it('finds text chunks, XMP, EXIF and C2PA', async () => {
    const result = await scan(buildPngFixture(), 'test.png', 'image/png');

    expect(signal(result, 'embedded-text').status).toBe('detected');
    expect(signal(result, 'xmp').status).toBe('detected');
    expect(signal(result, 'exif').status).toBe('detected');
    expect(signal(result, 'c2pa').status).toBe('detected');
  });

  it('recognises a Stable Diffusion parameters chunk as an AI generator', async () => {
    const result = await scan(buildPngFixture(), 'test.png', 'image/png');
    expect(signal(result, 'ai-generator').status).toBe('detected');
  });

  it('decompresses zTXt chunks', async () => {
    const result = await scan(buildPngFixture(), 'test.png', 'image/png');
    expect(signal(result, 'embedded-text').value).toContain('workflow');
  });

  it('reads PNG dimensions', async () => {
    const result = await scan(buildPngFixture(), 'test.png', 'image/png');
    expect(result.file.width).toBe(32);
    expect(result.file.height).toBe(24);
  });
});

describe('scanning WebP', () => {
  it('finds EXIF and XMP in an extended-format file', async () => {
    const result = await scan(buildWebpFixture(), 'test.webp', 'image/webp');

    expect(signal(result, 'exif').status).toBe('detected');
    expect(signal(result, 'xmp').status).toBe('detected');
    expect(signal(result, 'icc').status).toBe('detected');
    expect(result.file.width).toBe(32);
    expect(result.file.height).toBe(24);
  });

  it('handles lossless WebP too', async () => {
    const result = await scan(buildWebpFixture({ lossless: true }), 'test.webp', 'image/webp');
    expect(signal(result, 'exif').status).toBe('detected');
  });

  it('reads dimensions from a plain simple-format WebP', async () => {
    const result = await scan(loadBase('base-lossy.webp'), 'plain.webp', 'image/webp');
    expect(result.file.width).toBe(32);
    expect(result.file.height).toBe(24);
  });
});

describe('honesty rules', () => {
  it('never claims SynthID is absent', async () => {
    for (const bytes of [buildJpegFixture(), buildPngFixture(), buildWebpFixture()]) {
      const result = await scan(bytes);
      const synthid = signal(result, 'synthid');
      expect(synthid.status).toBe('unable_to_verify');
      expect(synthid.removable).toBe('unknown');
    }
  });

  it('marks the colour profile as detected but not removable', async () => {
    const result = await scan(buildJpegFixture());
    const icc = signal(result, 'icc');
    expect(icc.status).toBe('detected');
    expect(icc.removable).toBe(false);
  });
});

describe('error handling', () => {
  it('rejects unsupported formats by name', async () => {
    const gif = new Uint8Array(32);
    gif.set(Buffer.from('GIF89a'), 0);
    await expect(scan(gif, 'x.gif', 'image/gif')).rejects.toMatchObject({
      code: 'unsupported-format',
    });
  });

  it('rejects empty files', async () => {
    await expect(scan(new Uint8Array(0))).rejects.toBeInstanceOf(ScanError);
  });

  it('rejects a truncated image rather than returning partial results', async () => {
    const truncated = buildPngFixture().subarray(0, 20);
    await expect(scan(truncated, 'x.png', 'image/png')).rejects.toBeInstanceOf(ScanError);
  });

  it('strips hostile invisible characters out of displayed metadata', async () => {
    const RLO = String.fromCharCode(0x202e); // right-to-left override
    const ZWSP = String.fromCharCode(0x200b);
    const bytes = buildJpegFixture({ software: `Evil ${RLO}txt.exe${ZWSP}` });
    const result = await scan(bytes);

    const software = signal(result, 'software');
    expect(software.value).toBeDefined();
    expect(software.value).not.toContain(RLO);
    expect(software.value).not.toContain(ZWSP);
    expect(software.value).toContain('Evil');
  });
});

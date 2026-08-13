import { describe, expect, it } from 'vitest';

import { detectType, isSupported } from '../src/lib/filetype';
import { loadBase } from './fixtures/build';

describe('magic-byte detection', () => {
  it('identifies the three supported formats from real files', () => {
    expect(detectType(loadBase('base.jpg'))).toBe('jpeg');
    expect(detectType(loadBase('base.png'))).toBe('png');
    expect(detectType(loadBase('base-lossy.webp'))).toBe('webp');
    expect(detectType(loadBase('base-lossless.webp'))).toBe('webp');
  });

  it('ignores the extension and MIME type entirely', () => {
    // A PNG renamed to .jpg is still a PNG.
    const png = loadBase('base.png');
    expect(detectType(png)).toBe('png');
    expect(isSupported(detectType(png))).toBe(true);
  });

  it('recognises unsupported formats so the UI can name them', () => {
    const gif = new Uint8Array([...Buffer.from('GIF89a'), 0, 0, 0, 0, 0, 0]);
    expect(detectType(gif)).toBe('gif');

    const pdf = new Uint8Array([...Buffer.from('%PDF-1.7'), 0, 0, 0, 0]);
    expect(detectType(pdf)).toBe('pdf');

    const avif = new Uint8Array(16);
    avif.set(Buffer.from('....ftypavif'), 0);
    expect(detectType(avif)).toBe('avif');

    expect(isSupported(detectType(gif))).toBe(false);
  });

  it('reports unknown for short or meaningless input', () => {
    expect(detectType(new Uint8Array(4))).toBe('unknown');
    expect(detectType(new Uint8Array(64))).toBe('unknown');
  });
});

import { describe, expect, it } from 'vitest';

import { ACCEPTED_MIME } from '../src/lib/config';
import {
  CLEANABLE_FORMATS,
  FORMATS,
  SCANNABLE_FORMATS,
  isCleanable,
  isScannable,
} from '../src/lib/formats';
import { SUPPORTED_FORMATS, extensionFor, mimeFor } from '../src/lib/filetype';

describe('format registry', () => {
  it('exposes exactly the formats the engine can process today', () => {
    expect([...SCANNABLE_FORMATS]).toEqual(['jpeg', 'png', 'webp', 'svg', 'markdown', 'pdf']);
    expect([...CLEANABLE_FORMATS]).toEqual(['jpeg', 'png', 'webp', 'svg', 'markdown']);
  });

  // The accept list is derived, so it must never drift from the registry —
  // offering a format the engine then rejects is a broken file picker.
  it('derives the accept list from the registry', () => {
    expect(ACCEPTED_MIME).toBe(
      'image/jpeg,image/png,image/webp,image/svg+xml,text/markdown,application/pdf',
    );
  });

  it('keeps SUPPORTED_FORMATS in step with the registry', () => {
    expect([...SUPPORTED_FORMATS]).toEqual([...SCANNABLE_FORMATS]);
  });

  // The whole point of the registry: a format cannot be opened for cleaning
  // without also being scannable, or the clean pipeline would have nothing to
  // diff its output against and could not verify a removal.
  it('never marks a format cleanable without making it scannable', () => {
    for (const format of CLEANABLE_FORMATS) {
      expect(isScannable(format)).toBe(true);
    }
  });

  it('gives every registered format a distinct mime and a usable extension', () => {
    const mimes = new Set<string>();
    for (const [format, spec] of Object.entries(FORMATS)) {
      expect(spec.extension, `${format} extension`).toMatch(/^[a-z0-9]+$/);
      expect(mimes.has(spec.mime), `${format} mime is duplicated`).toBe(false);
      mimes.add(spec.mime);
    }
  });

  it('resolves mime and extension for every registered format, not just images', () => {
    expect(mimeFor('jpeg')).toBe('image/jpeg');
    expect(extensionFor('jpeg')).toBe('jpg');
    // Registered but not yet open for processing — lookups must still work,
    // because error copy and future briefs depend on them.
    expect(mimeFor('pdf')).toBe('application/pdf');
    expect(extensionFor('markdown')).toBe('md');
    // PDF is open for scanning but has no cleaner yet (brief 09, Phase 1).
    expect(isScannable('pdf')).toBe(true);
    expect(isCleanable('pdf')).toBe(false);
  });
});

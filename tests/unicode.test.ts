import { describe, expect, it } from 'vitest';

import {
  cleanHiddenCharacters,
  formatCodePoint,
  scanHiddenCharacters,
  segmentText,
} from '../src/lib/unicode/hidden';

const ZWSP = String.fromCodePoint(0x200b);
const ZWNJ = String.fromCodePoint(0x200c);
const ZWJ = String.fromCodePoint(0x200d);
const BOM = String.fromCodePoint(0xfeff);
const RLO = String.fromCodePoint(0x202e);
const VS16 = String.fromCodePoint(0xfe0f);
const SOFT_HYPHEN = String.fromCodePoint(0x00ad);
const NBSP = String.fromCodePoint(0x00a0);
const TAG_A = String.fromCodePoint(0xe0061);
const HANGUL_FILLER = String.fromCodePoint(0x3164);

describe('detecting hidden characters', () => {
  it('finds zero-width characters and the BOM', () => {
    const text = `Hello${ZWSP}world${ZWNJ}!${BOM}`;
    const scan = scanHiddenCharacters(text);

    expect(scan.total).toBe(3);
    expect(scan.removable).toBe(3);
    expect(scan.byCategory['zero-width']).toBe(3);
  });

  it('finds bidirectional overrides', () => {
    const scan = scanHiddenCharacters(`invoice${RLO}fdp.exe`);
    expect(scan.byCategory['bidi-control']).toBe(1);
    expect(scan.findings[0]?.risk).toBe('high');
  });

  it('finds Unicode tag characters, which can smuggle whole messages', () => {
    const scan = scanHiddenCharacters(`normal text${TAG_A.repeat(5)}`);
    expect(scan.byCategory['tag-character']).toBe(5);
    expect(scan.findings.every((f) => f.risk === 'high')).toBe(true);
  });

  it('flags filler and unusual space characters', () => {
    const scan = scanHiddenCharacters(`a${HANGUL_FILLER}b${NBSP}c${SOFT_HYPHEN}d`);
    expect(scan.byCategory['unusual-space']).toBeGreaterThanOrEqual(2);
    expect(scan.total).toBe(3);
  });

  it('reports nothing for ordinary text', () => {
    const scan = scanHiddenCharacters('The quick brown fox.\nSecond line\twith a tab.');
    expect(scan.total).toBe(0);
    expect(scan.removable).toBe(0);
  });

  it('counts code points, not UTF-16 units', () => {
    const scan = scanHiddenCharacters('👍 ok');
    expect(scan.length).toBe(4);
  });
});

describe('emoji are not collateral damage', () => {
  it('recognises the ZWJ inside a family emoji as legitimate', () => {
    const family = `👨${ZWJ}👩${ZWJ}👧`;
    const scan = scanHiddenCharacters(family);

    expect(scan.total).toBe(2);
    expect(scan.legitimate).toBe(2);
    expect(scan.removable).toBe(0);
  });

  it('preserves emoji ZWJ sequences when cleaning', () => {
    const family = `👨${ZWJ}👩${ZWJ}👧`;
    const result = cleanHiddenCharacters(`Hi ${family}${ZWSP} there`);

    expect(result.text).toContain(family);
    expect(result.removed).toBe(1); // only the ZWSP
    expect(result.preserved).toBe(2);
  });

  it('preserves variation selector-16 that styles an emoji', () => {
    const heart = `❤${VS16}`;
    const result = cleanHiddenCharacters(heart);
    expect(result.text).toBe(heart);
    expect(result.changed).toBe(false);
  });

  it('removes a variation selector that is not attached to a pictograph', () => {
    const result = cleanHiddenCharacters(`abc${VS16}`);
    expect(result.text).toBe('abc');
    expect(result.removed).toBe(1);
  });

  it('aggressive mode removes even legitimate joiners, as documented', () => {
    const family = `👨${ZWJ}👩`;
    const result = cleanHiddenCharacters(family, { aggressive: true });
    expect(result.text).not.toContain(ZWJ);
    expect(result.removed).toBe(1);
  });
});

describe('cleaning text', () => {
  it('removes hidden characters and leaves visible text intact', () => {
    const result = cleanHiddenCharacters(`Hello${ZWSP}${BOM}world${RLO}!`);
    expect(result.text).toBe('Helloworld!');
    expect(result.removed).toBe(3);
    expect(result.changed).toBe(true);
  });

  it('normalises unusual spaces to ordinary spaces by default', () => {
    const result = cleanHiddenCharacters(`a${NBSP}b`);
    expect(result.text).toBe('a b');
  });

  it('can leave unusual spaces alone', () => {
    const result = cleanHiddenCharacters(`a${NBSP}b`, { normalizeSpaces: false });
    expect(result.text).toBe(`a${NBSP}b`);
  });

  it('keeps newlines and tabs', () => {
    const text = 'line one\n\tindented';
    expect(cleanHiddenCharacters(text).text).toBe(text);
  });

  it('reports no change for text that is already clean', () => {
    const result = cleanHiddenCharacters('nothing to see here');
    expect(result.changed).toBe(false);
    expect(result.removed).toBe(0);
  });

  it('cleaning twice changes nothing further', () => {
    const once = cleanHiddenCharacters(`a${ZWSP}b${TAG_A}c`);
    const twice = cleanHiddenCharacters(once.text);
    expect(twice.text).toBe(once.text);
    expect(twice.changed).toBe(false);
  });
});

describe('display helpers', () => {
  it('segments text so the UI can mark hidden characters in place', () => {
    const scan = scanHiddenCharacters(`ab${ZWSP}cd`);
    const segments = segmentText(`ab${ZWSP}cd`, scan);

    expect(segments.map((s) => s.kind)).toEqual(['text', 'hidden', 'text']);
    expect(segments[0]?.value).toBe('ab');
    expect(segments[1]?.finding?.cp).toBe(0x200b);
    expect(segments[2]?.value).toBe('cd');
  });

  it('formats code points the way the standard writes them', () => {
    expect(formatCodePoint(0x200b)).toBe('U+200B');
    expect(formatCodePoint(0xe0061)).toBe('U+E0061');
  });
});

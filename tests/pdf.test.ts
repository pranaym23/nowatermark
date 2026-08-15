import { describe, expect, it } from 'vitest';

import { cleanImage } from '../src/lib/clean';
import { detectType } from '../src/lib/filetype';
import { collectPdfMetadata } from '../src/lib/metadata/pdf';
import { readPdf } from '../src/lib/pdf/document';
import { PdfLexer, textOf } from '../src/lib/pdf/lexer';
import { scanImage } from '../src/lib/scan';
import { allSignals, type ScanResult } from '../src/lib/types';
import { PDF_EXPECTED, buildJumbfSuperbox, buildPdfFixture } from './fixtures/build';

const input = (name = 'doc.pdf', size = 0) => ({ name, type: 'application/pdf', size });

function statusOf(result: ScanResult, id: string) {
  return allSignals(result).find((s) => s.id === id)?.status;
}

function valueOf(result: ScanResult, id: string) {
  return allSignals(result).find((s) => s.id === id)?.value;
}

describe('PDF object lexer', () => {
  const parse = (s: string) => new PdfLexer(new TextEncoder().encode(s)).parse();

  it('parses the object types it needs', () => {
    expect(parse('/Name')).toEqual({ kind: 'name', value: 'Name' });
    expect(parse('42')).toEqual({ kind: 'number', value: 42 });
    expect(parse('true')).toEqual({ kind: 'bool', value: true });
    expect(parse('3 0 R')).toEqual({ kind: 'ref', num: 3, gen: 0 });
  });

  it('does not mistake two numbers for a reference', () => {
    expect(parse('3 0')).toEqual({ kind: 'number', value: 3 });
  });

  it('decodes escapes and nested parentheses in literal strings', () => {
    expect(textOf(parse('(a\\(b\\)c)') ?? undefined)).toBe('a(b)c');
    expect(textOf(parse('(line\\nbreak)') ?? undefined)).toBe('line\nbreak');
    expect(textOf(parse('(\\101)') ?? undefined)).toBe('A');
  });

  it('decodes UTF-16BE text strings', () => {
    expect(textOf(parse('<FEFF00480069>') ?? undefined)).toBe('Hi');
  });

  it('decodes #-escaped names', () => {
    expect(parse('/A#20B')).toEqual({ kind: 'name', value: 'A B' });
  });

  it('parses a dictionary with a nested dictionary', () => {
    const v = parse('<< /A 1 /B << /C /D >> >>');
    expect(v?.kind).toBe('dict');
    if (v?.kind !== 'dict') return;
    expect(v.map.get('A')).toEqual({ kind: 'number', value: 1 });
    expect(v.map.get('B')?.kind).toBe('dict');
  });
});

describe('PDF structure', () => {
  it('is detected by magic bytes', () => {
    expect(detectType(buildPdfFixture())).toBe('pdf');
  });

  it('follows the xref table and finds one revision', async () => {
    const doc = await readPdf(buildPdfFixture());
    expect(doc.revisions).toHaveLength(1);
    expect(doc.degraded).toBe(false);
    expect(doc.encrypted).toBe(false);
  });

  it('follows the /Prev chain through an incremental update', async () => {
    const doc = await readPdf(buildPdfFixture({ withIncrementalUpdate: true }));
    expect(doc.revisions).toHaveLength(2);
  });

  it('notices encryption', async () => {
    const doc = await readPdf(buildPdfFixture({ withEncryption: true }));
    expect(doc.encrypted).toBe(true);
  });
});

describe('scanning PDF', () => {
  it('reports the /Info metadata', async () => {
    const pdf = buildPdfFixture();
    const result = await scanImage(pdf, input('doc.pdf', pdf.length));

    expect(result.file.format).toBe('pdf');
    expect(statusOf(result, 'author')).toBe('detected');
    expect(valueOf(result, 'author')).toContain(PDF_EXPECTED.author);
    expect(statusOf(result, 'timestamp')).toBe('detected');
    expect(statusOf(result, 'software')).toBe('detected');
    expect(statusOf(result, 'ai-generator')).toBe('detected');
  });

  it('reports custom /Info keys as embedded text', async () => {
    const pdf = buildPdfFixture();
    const result = await scanImage(pdf, input('doc.pdf', pdf.length));
    expect(statusOf(result, 'embedded-text')).toBe('detected');
  });

  it('finds document JavaScript', async () => {
    const pdf = buildPdfFixture({ withJavaScript: true });
    const result = await scanImage(pdf, input('doc.pdf', pdf.length));
    expect(statusOf(result, 'active-content')).toBe('detected');
  });

  it('keeps SynthID unverifiable', async () => {
    const pdf = buildPdfFixture();
    const result = await scanImage(pdf, input('doc.pdf', pdf.length));
    expect(statusOf(result, 'synthid')).toBe('unable_to_verify');
  });

  /*
   * The whole reason PDF is staged. A "metadata remover" that appends an update
   * leaves the original /Info readable earlier in the file. Reading only the
   * newest revision would report this file as having no author.
   */
  describe('the incremental-update trap', () => {
    it('reports the earlier revision', async () => {
      const pdf = buildPdfFixture({ withIncrementalUpdate: true });
      const result = await scanImage(pdf, input('doc.pdf', pdf.length));

      expect(statusOf(result, 'prior-revisions')).toBe('detected');
      expect(valueOf(result, 'prior-revisions')).toContain('1');
    });

    it('still finds the author that the update pretended to remove', async () => {
      const pdf = buildPdfFixture({ withIncrementalUpdate: true });
      const meta = await collectPdfMetadata(pdf);

      // The newest revision genuinely has no author...
      expect(meta.current?.author).toBeUndefined();
      // ...but the file does, and that is what the user needs told.
      expect(meta.staleMetadata).toBe(true);
      expect(meta.infos.some((i) => i.author === PDF_EXPECTED.author)).toBe(true);

      const result = await scanImage(pdf, input('doc.pdf', pdf.length));
      expect(statusOf(result, 'author')).toBe('detected');
      expect(result.warnings.join(' ')).toContain('earlier');
    });

    it('says so in a warning the user can act on', async () => {
      const pdf = buildPdfFixture({ withIncrementalUpdate: true });
      const result = await scanImage(pdf, input('doc.pdf', pdf.length));
      expect(result.warnings.join(' ')).toMatch(/still (in the file|present)/i);
    });
  });

  /*
   * C2PA presence used to be a raw byte search for "c2pa" or "jumb" across the
   * whole file. Four ASCII bytes are not a signature: a compressed stream hits
   * them by chance, and any PDF that merely *writes about* Content Credentials
   * claims to carry them. Reporting provenance that is not there is the worst
   * class of bug this product can ship, so these tests pin the shape.
   */
  describe('C2PA detection is structural, not a byte search', () => {
    const asBytes = (s: string) => new TextEncoder().encode(s);

    it('ignores a PDF that only mentions c2pa and jumb in its text', async () => {
      const pdf = buildPdfFixture({
        trailingBytes: asBytes('\n% notes on c2pa manifests and jumb boxes\n'),
      });
      const meta = await collectPdfMetadata(pdf);
      expect(meta.hasC2pa).toBe(false);
    });

    it('ignores a bare jumb marker with no box around it', async () => {
      const meta = await collectPdfMetadata(
        buildPdfFixture({ trailingBytes: asBytes('jumbjumbjumb') }),
      );
      expect(meta.hasC2pa).toBe(false);
    });

    it('ignores a box whose declared length runs past the end of the file', async () => {
      const box = buildJumbfSuperbox();
      new DataView(box.buffer).setUint32(0, 0x7fffffff);
      const meta = await collectPdfMetadata(buildPdfFixture({ trailingBytes: box }));
      expect(meta.hasC2pa).toBe(false);
    });

    it('ignores a jumb box whose first child is not a description box', async () => {
      const box = buildJumbfSuperbox();
      box.set(asBytes('junk'), 12);
      const meta = await collectPdfMetadata(buildPdfFixture({ trailingBytes: box }));
      expect(meta.hasC2pa).toBe(false);
    });

    it('finds a well-formed JUMBF superbox', async () => {
      const meta = await collectPdfMetadata(
        buildPdfFixture({ trailingBytes: buildJumbfSuperbox() }),
      );
      expect(meta.hasC2pa).toBe(true);
    });

    it('finds a manifest declared as an associated file', async () => {
      const meta = await collectPdfMetadata(buildPdfFixture({ withC2paAssociatedFile: true }));
      expect(meta.hasC2pa).toBe(true);
    });

    it('does not report C2PA for an ordinary PDF', async () => {
      const meta = await collectPdfMetadata(buildPdfFixture());
      expect(meta.hasC2pa).toBe(false);
    });
  });
});

describe('PDF Phase 1 claims nothing it cannot do', () => {
  it('marks every finding as not removable', async () => {
    const pdf = buildPdfFixture({ withIncrementalUpdate: true, withJavaScript: true });
    const result = await scanImage(pdf, input('doc.pdf', pdf.length));

    for (const signal of allSignals(result)) {
      if (signal.id === 'synthid') {
        expect(signal.removable).toBe('unknown');
        continue;
      }
      expect(signal.removable, `${signal.id} must not claim removability`).toBe(false);
    }
  });

  it('refuses to clean, and says the original is untouched', async () => {
    const pdf = buildPdfFixture();
    const outcome = await cleanImage(pdf, input('doc.pdf', pdf.length));

    expect(outcome.result.success).toBe(false);
    expect(outcome.result.blob).toBeUndefined();
    expect(outcome.result.removedSignals).toEqual([]);
    expect(outcome.result.warnings.join(' ')).toContain('has not been changed');
  });

  it('reports an encrypted PDF instead of attempting it', async () => {
    const pdf = buildPdfFixture({ withEncryption: true });
    const result = await scanImage(pdf, input('doc.pdf', pdf.length));
    expect(result.warnings.join(' ')).toContain('encrypted');
  });
});

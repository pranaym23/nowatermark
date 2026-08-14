/**
 * Hidden-character scanner and cleaner for pasted text.
 *
 * Pasted text never leaves the browser: no API call, no analytics event, no
 * storage (PRD §23). Everything below is synchronous local string work.
 */

import { useMemo, useState } from 'react';

import { MAX_TEXT_LENGTH } from '../../lib/config';
import {
  cleanHiddenCharacters,
  formatCodePoint,
  scanHiddenCharacters,
  segmentText,
  type HiddenCategory,
} from '../../lib/unicode/hidden';
import { Button, Notice } from './ui';

const CATEGORY_LABEL: Record<HiddenCategory, string> = {
  'zero-width': 'Zero-width characters',
  'bidi-control': 'Bidirectional controls',
  'variation-selector': 'Variation selectors',
  'tag-character': 'Unicode tag characters',
  'unusual-space': 'Unusual spaces',
  control: 'Control characters',
  deprecated: 'Deprecated formatting',
};

export default function TextScanner() {
  const [text, setText] = useState('');
  const [cleaned, setCleaned] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const scan = useMemo(() => scanHiddenCharacters(text), [text]);
  const segments = useMemo(
    () => (text.length > 0 && text.length <= MAX_TEXT_LENGTH ? segmentText(text, scan) : []),
    [text, scan],
  );

  const categories = Object.entries(scan.byCategory) as Array<[HiddenCategory, number]>;

  const runClean = () => {
    const result = cleanHiddenCharacters(text);
    setCleaned(result.text);
    setCopied(false);
  };

  const copy = async () => {
    if (cleaned == null) return;
    try {
      await navigator.clipboard.writeText(cleaned);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label htmlFor="nw-text" className="text-sm font-medium">
          Paste your text
        </label>
        <textarea
          id="nw-text"
          value={text}
          onChange={(e) => {
            setText(e.target.value.slice(0, MAX_TEXT_LENGTH));
            setCleaned(null);
          }}
          rows={8}
          placeholder="Paste text here to check it for invisible characters…"
          className="nw-evidence-panel mt-2 w-full resize-y p-3.5 font-mono text-sm"
          style={{
            backgroundColor: 'var(--nw-surface)',
            border: '1px solid var(--nw-border-strong)',
            color: 'var(--nw-text)',
          }}
        />
        <p className="mt-1.5 text-xs" style={{ color: 'var(--nw-text-muted)' }}>
          🔒 Processed locally in your browser. Your text is never sent anywhere.
        </p>
      </div>

      {text.length > 0 ? (
        <>
          <div className="nw-evidence-panel overflow-hidden">
            <header
              className="px-4 py-3"
              style={{
                backgroundColor: 'var(--nw-surface-muted)',
                borderBottom: '1px solid var(--nw-border)',
              }}
            >
              <h3 className="text-sm font-semibold">
                {scan.removable === 0
                  ? 'No hidden characters found'
                  : `Found ${scan.removable} hidden character${scan.removable === 1 ? '' : 's'}`}
              </h3>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--nw-text-muted)' }}>
                {scan.length.toLocaleString()} characters scanned
                {scan.legitimate > 0
                  ? ` · ${scan.legitimate} kept as part of emoji`
                  : ''}
              </p>
            </header>

            {categories.length > 0 ? (
              <ul>
                {categories.map(([category, count]) => (
                  <li
                    key={category}
                    className="flex items-center justify-between gap-3 border-b px-4 py-2.5 last:border-b-0"
                    style={{ borderColor: 'var(--nw-border)' }}
                  >
                    <span className="text-sm">{CATEGORY_LABEL[category]}</span>
                    <span className="font-mono text-xs tabular-nums" style={{ color: 'var(--nw-text-muted)' }}>
                      {count}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-sm" style={{ color: 'var(--nw-text-muted)' }}>
                This text contains only ordinary visible characters.
              </p>
            )}
          </div>

          {scan.total > 0 && segments.length > 0 ? (
            <div className="nw-evidence-panel p-4">
              <h3 className="text-sm font-semibold">Where they are</h3>
              <p
                className="mt-2 max-h-64 overflow-auto p-3 font-mono text-sm break-words whitespace-pre-wrap"
                style={{ backgroundColor: 'var(--nw-surface-muted)' }}
              >
                {segments.map((segment, i) =>
                  segment.kind === 'text' ? (
                    <span key={i}>{segment.value}</span>
                  ) : (
                    <mark
                      key={i}
                      title={`${segment.finding!.name} (${formatCodePoint(segment.finding!.cp)})`}
                      className="rounded px-1 text-[0.7rem] font-semibold"
                      style={{
                        backgroundColor: segment.finding!.legitimate
                          ? 'var(--nw-clear-bg)'
                          : 'var(--nw-detected-bg)',
                        color: segment.finding!.legitimate
                          ? 'var(--nw-clear)'
                          : 'var(--nw-detected)',
                      }}
                    >
                      {formatCodePoint(segment.finding!.cp)}
                    </mark>
                  ),
                )}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={runClean} disabled={scan.removable === 0}>
              Clean hidden characters
            </Button>
            {scan.removable === 0 ? (
              <span className="text-xs" style={{ color: 'var(--nw-text-muted)' }}>
                Nothing to remove.
              </span>
            ) : null}
          </div>
        </>
      ) : null}

      {cleaned !== null ? (
        <div className="nw-evidence-panel p-4">
          <h3 className="text-sm font-semibold">Cleaned text</h3>
          <textarea
            readOnly
            value={cleaned}
            rows={8}
            className="nw-evidence-panel mt-2 w-full resize-y p-3.5 font-mono text-sm"
            style={{
              backgroundColor: 'var(--nw-surface-muted)',
              border: '1px solid var(--nw-border)',
              color: 'var(--nw-text)',
            }}
          />
          <div className="mt-3 flex items-center gap-3">
            <Button variant="secondary" onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy cleaned text'}
            </Button>
          </div>
        </div>
      ) : null}

      <Notice>
        <p className="text-sm font-medium">This does not remove statistical text watermarks.</p>
        <p className="mt-1 text-sm">
          A statistical watermark is encoded in a model’s word choices, not in invisible characters.
          Removing hidden Unicode has no effect on it, and no browser-side tool can confirm whether
          one is present. NoWatermark does not claim to detect or remove Anthropic’s statistical
          watermark.
        </p>
      </Notice>
    </div>
  );
}

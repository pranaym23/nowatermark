/**
 * Hidden-character scanner and cleaner for pasted text.
 *
 * Scanning and hidden-character cleaning are local: no API call, no analytics
 * event, no storage (PRD §23). Pure synchronous string work.
 *
 * The one exception is the rewrite panel at the bottom, which sends the pasted
 * text to Google's Gemini API through our own proxy. It is opt-in per use, it
 * shows the exact payload first, and its result is labelled as unverified —
 * there is no client-side detector for a statistical watermark, so we cannot
 * claim the rewrite worked. See functions/api/rewrite.ts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { MAX_TEXT_LENGTH } from '../../lib/config';
import {
  cleanHiddenCharacters,
  formatCodePoint,
  scanHiddenCharacters,
  segmentText,
  type HiddenCategory,
} from '../../lib/unicode/hidden';
import {
  requestRewrite,
  rewritePayloadPreview,
  type RewriteMode,
} from '../../lib/rewrite';
import { REWRITE_ENABLED, TURNSTILE_SITE_KEY, loadTurnstile } from '../../lib/turnstile';
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

  /*
   * Rewriting state. `showPayload` gates the send behind seeing the actual
   * request body — the consent is per use and is never remembered, so there is
   * deliberately no "don't ask again".
   */
  const [showPayload, setShowPayload] = useState(false);
  const [mode, setMode] = useState<RewriteMode>('paraphrase');
  const [rewriting, setRewriting] = useState(false);
  const [rewritten, setRewritten] = useState<string | null>(null);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileFailed, setTurnstileFailed] = useState(false);
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

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

  /*
   * The widget is rendered only once the user has opened the confirmation step,
   * so a visitor who never touches the rewrite feature never loads a
   * third-party script.
   */
  useEffect(() => {
    if (!showPayload || !REWRITE_ENABLED) return;
    let cancelled = false;

    void loadTurnstile().then((api) => {
      if (cancelled || !api || !turnstileRef.current || widgetIdRef.current) {
        if (!cancelled && !api) setTurnstileFailed(true);
        return;
      }
      widgetIdRef.current = api.render(turnstileRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token) => setTurnstileToken(token),
        'error-callback': () => setTurnstileFailed(true),
        'expired-callback': () => setTurnstileToken(null),
      });
    });

    return () => {
      cancelled = true;
      const id = widgetIdRef.current;
      if (id && window.turnstile) window.turnstile.remove(id);
      widgetIdRef.current = null;
      setTurnstileToken(null);
    };
  }, [showPayload]);

  const runRewrite = useCallback(async () => {
    if (!turnstileToken) return;
    setRewriting(true);
    setRewriteError(null);
    const result = await requestRewrite({ text, mode, turnstileToken });
    setRewriting(false);
    if (result.ok) {
      setRewritten(result.text);
      setShowPayload(false);
    } else {
      setRewriteError(result.error);
      // A token is single-use; a retry needs a fresh one.
      if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
      setTurnstileToken(null);
    }
  }, [text, mode, turnstileToken]);

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
            setRewritten(null);
            setRewriteError(null);
            setShowPayload(false);
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
          🔒 Scanning and cleaning happen locally in your browser. Nothing is sent unless you
          explicitly use the rewrite option below.
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
        <p className="text-sm font-medium">Cleaning above does not touch statistical text watermarks.</p>
        <p className="mt-1 text-sm">
          A statistical watermark is encoded in a model’s word choices, not in invisible characters.
          Removing hidden Unicode has no effect on it, and no browser-side tool can confirm whether
          one is present — so we cannot tell you whether your text carries one.
        </p>
      </Notice>

      {REWRITE_ENABLED && text.trim().length > 0 ? (
        <section
          className="nw-evidence-panel p-4"
          style={{ borderColor: 'var(--nw-border-strong)' }}
        >
          <h3 className="text-sm font-semibold">Rewrite this text (sends it to Google)</h3>
          <p className="mt-1.5 text-sm">
            The only known way to disturb a statistical watermark is to reword the text. That needs
            a language model, which we cannot run on your device — so this one feature, and nothing
            else on this site, sends your text to Google’s Gemini API.
          </p>

          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            <li>Only the text in the box above is sent. No file, no filename, nothing else.</li>
            <li>It happens only when you press the button below, every time. Nothing is remembered.</li>
            <li>
              <strong>We cannot verify it worked.</strong> There is no detector we can run, so a
              rewritten text is changed, not confirmed clean.
            </li>
            <li>
              Google’s handling of the text is governed by their terms — see our{' '}
              <a href="/privacy" className="underline">
                privacy page
              </a>
              .
            </li>
          </ul>

          {rewriteError ? (
            <p className="mt-3 text-sm" style={{ color: 'var(--nw-detected)' }}>
              {rewriteError}
            </p>
          ) : null}

          {!showPayload ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={() => setShowPayload(true)} disabled={rewriting}>
                Rewrite with Gemini…
              </Button>
              <span className="text-xs" style={{ color: 'var(--nw-text-muted)' }}>
                You will see exactly what is sent before anything leaves your device.
              </span>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-sm font-medium">This is exactly what will be sent:</p>
              <textarea
                readOnly
                rows={6}
                value={rewritePayloadPreview({ text, mode })}
                className="nw-evidence-panel mt-2 w-full resize-y p-3 font-mono text-xs"
                style={{
                  backgroundColor: 'var(--nw-surface-muted)',
                  border: '1px solid var(--nw-border)',
                  color: 'var(--nw-text)',
                }}
              />
              <div ref={turnstileRef} className="mt-3" />
              {turnstileFailed ? (
                <p className="mt-2 text-sm" style={{ color: 'var(--nw-detected)' }}>
                  The bot check could not load, so we cannot send this. If you block third-party
                  scripts, that is why — everything else on this page still works.
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="text-sm">
                  Style{' '}
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as RewriteMode)}
                    className="ml-1 p-1 text-sm"
                    style={{
                      backgroundColor: 'var(--nw-surface)',
                      border: '1px solid var(--nw-border-strong)',
                      color: 'var(--nw-text)',
                    }}
                  >
                    <option value="paraphrase">Paraphrase</option>
                    <option value="humanize">More natural</option>
                  </select>
                </label>
                <Button onClick={() => void runRewrite()} disabled={rewriting || !turnstileToken}>
                  {rewriting ? 'Sending…' : 'Send and rewrite'}
                </Button>
                {!turnstileToken && !turnstileFailed ? (
                  <span className="text-xs" style={{ color: 'var(--nw-text-muted)' }}>
                    Waiting for the bot check…
                  </span>
                ) : null}
                <Button
                  variant="secondary"
                  onClick={() => setShowPayload(false)}
                  disabled={rewriting}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {rewritten !== null ? (
            <div className="mt-4">
              <h4 className="text-sm font-semibold">
                Rewritten — we cannot verify this defeats any detector
              </h4>
              <textarea
                readOnly
                value={rewritten}
                rows={8}
                className="nw-evidence-panel mt-2 w-full resize-y p-3.5 font-mono text-sm"
                style={{
                  backgroundColor: 'var(--nw-surface-muted)',
                  border: '1px solid var(--nw-border)',
                  color: 'var(--nw-text)',
                }}
              />
              <p className="mt-2 text-xs" style={{ color: 'var(--nw-text-muted)' }}>
                Check it carefully before using it. Rewriting changes wording, and a model can
                change meaning while doing so.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

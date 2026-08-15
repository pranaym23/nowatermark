/**
 * The image scanner and cleaner.
 *
 * Everything here runs on the user's device. The component never issues a
 * network request: it reads the File, hands the bytes to a Web Worker, and
 * builds the download from a local Blob (PRD §3, §11, §63).
 *
 * Memory discipline (PRD §20): the original ArrayBuffer is never retained —
 * it is re-read from the File for each operation and transferred to the
 * worker — and every object URL is revoked when it stops being current.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { formatBytes } from '../../lib/bytes';
import { ACCEPTED_MIME, MAX_FILE_BYTES, SLOW_FILE_BYTES } from '../../lib/config';
import { allSignals, countDetected, type ScanResult } from '../../lib/types';
import { bucket, formatLabel, track } from '../../lib/analytics';
import { CLEAN_PRESETS, presetById, type PresetId, type SignalCategory } from '../../lib/signals';
import type { CleanPayload } from '../../lib/worker/protocol';
import { ProcessingFailure, cleanFileBytes, releaseWorker, scanFileBytes } from '../../lib/worker/client';
import { Button, ExposureSummary, Notice, OutcomePill, ResultGroup, Spinner } from './ui';

type Phase = 'idle' | 'reading' | 'scanning' | 'results' | 'cleaning' | 'done' | 'error';

const BUSY: readonly Phase[] = ['reading', 'scanning', 'cleaning'];

const GROUPS: Array<{ key: SignalCategory; title: string; description: string }> = [
  {
    key: 'provenance',
    title: 'AI provenance',
    description: 'Content Credentials and generator fingerprints.',
  },
  { key: 'privacy', title: 'Private information', description: 'Location, devices, people, times.' },
  { key: 'metadata', title: 'Metadata blocks', description: 'The containers this data lives in.' },
  { key: 'hidden', title: 'Hidden characters', description: 'Invisible text inside metadata.' },
];

export interface ImageScannerProps {
  /** Category to surface first on a focused tool page. */
  focus?: SignalCategory;
}

export default function ImageScanner({ focus }: ImageScannerProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [clean, setClean] = useState<CleanPayload | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preserveOrientation, setPreserveOrientation] = useState(true);
  const [preset, setPreset] = useState<PresetId>('everything');
  const [dragging, setDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  /** Guards against a slow scan resolving after the user picked another file. */
  const runIdRef = useRef(0);

  const busy = BUSY.includes(phase);

  // Revoke object URLs as soon as they stop being current.
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); }, [downloadUrl]);
  useEffect(() => () => releaseWorker(), []);

  const reset = useCallback(() => {
    runIdRef.current++;
    setPhase('idle');
    setFile(null);
    setPreviewUrl(null);
    setScan(null);
    setClean(null);
    setDownloadUrl(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const handleFile = useCallback(async (chosen: File) => {
    const run = ++runIdRef.current;

    setFile(chosen);
    setScan(null);
    setClean(null);
    setDownloadUrl(null);
    setError(null);
    setPreviewUrl(URL.createObjectURL(chosen));
    setPhase('reading');

    if (chosen.size > MAX_FILE_BYTES) {
      setError(
        `This file is too large to process comfortably in your browser (${formatBytes(chosen.size)}). The limit is ${formatBytes(MAX_FILE_BYTES)}.`,
      );
      setPhase('error');
      return;
    }

    try {
      const bytes = await chosen.arrayBuffer();
      if (run !== runIdRef.current) return;
      setPhase('scanning');

      const result = await scanFileBytes(bytes, {
        name: chosen.name,
        type: chosen.type,
        size: chosen.size,
      });
      if (run !== runIdRef.current) return;

      setScan(result);
      setPhase('results');

      // Format label and a count *bucket* only. See src/lib/analytics.ts for
      // why an exact signal count is not permitted here.
      track('scan_result', {
        surface: 'file',
        format: formatLabel(result.file.format),
        outcome: 'ok',
        signals: bucket(countDetected(result)),
      });
    } catch (err) {
      if (run !== runIdRef.current) return;
      setError(
        err instanceof ProcessingFailure ? err.message : 'We couldn’t read this file.',
      );
      setPhase('error');
      track('scan_result', {
        surface: 'file',
        format: 'unknown',
        outcome: 'error',
        signals: '0',
      });
    }
  }, []);

  const runClean = useCallback(async () => {
    if (!file) return;
    const run = ++runIdRef.current;
    setPhase('cleaning');
    setError(null);

    try {
      // Re-read rather than holding a second copy of a large buffer.
      const bytes = await file.arrayBuffer();
      if (run !== runIdRef.current) return;

      const payload = await cleanFileBytes(
        bytes,
        { name: file.name, type: file.type, size: file.size },
        { preserveOrientation, blocks: presetById(preset)?.blocks },
      );
      if (run !== runIdRef.current) return;

      setClean(payload);

      if (payload.cleanedBytes) {
        const blob = new Blob([payload.cleanedBytes], { type: payload.mimeType });
        setDownloadUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return URL.createObjectURL(blob);
        });
      }
      setPhase(payload.success ? 'done' : 'results');
      if (!payload.success) setError(payload.warnings[0] ?? null);

      track('clean_complete', {
        format: formatLabel(scan?.file.format),
        outcome: payload.success ? 'ok' : 'error',
        removed: bucket(payload.removedSignals.length),
      });
    } catch (err) {
      if (run !== runIdRef.current) return;
      setError(
        err instanceof ProcessingFailure
          ? err.message
          : 'We couldn’t clean this file safely. Your original file has not been changed.',
      );
      setPhase('results');
    }
    // `scan` is read for the format label, so it belongs in the deps — without
    // it the callback would close over a stale result after a second file.
  }, [file, preserveOrientation, preset, scan]);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      const dropped = event.dataTransfer.files?.[0];
      if (dropped) void handleFile(dropped);
    },
    [handleFile],
  );

  const groups = useMemo(() => {
    if (!scan) return [];
    const ordered = focus
      ? [...GROUPS].sort((a, b) => (a.key === focus ? -1 : b.key === focus ? 1 : 0))
      : GROUPS;
    return ordered.map((g) => ({
      ...g,
      signals:
        g.key === 'hidden'
          ? scan.hiddenSignals
          : g.key === 'provenance'
            ? scan.provenance
            : g.key === 'privacy'
              ? scan.privacy
              : scan.metadata,
    }));
  }, [scan, focus]);

  const activePreset = presetById(preset) ?? CLEAN_PRESETS[0]!;
  const detectedCount = scan ? countDetected(scan) : 0;
  const status = STATUS_TEXT[phase];

  return (
    <div className="flex flex-col gap-5">
      {/* Screen readers get every phase change (PRD §38). */}
      <p className="sr-only" role="status" aria-live="polite">
        {error ?? status}
      </p>

      {!file || phase === 'error' ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className="nw-intake px-6 py-12 text-center transition-colors"
          style={{
            borderColor: dragging ? 'var(--nw-accent)' : 'var(--nw-border-strong)',
            backgroundColor: dragging ? 'var(--nw-surface-muted)' : 'var(--nw-surface)',
          }}
        >
          <label className="nw-file-label inline-flex cursor-pointer flex-col items-center gap-3">
            <span className="text-lg font-semibold">Drop a file here</span>
            <span className="text-sm" style={{ color: 'var(--nw-text-muted)' }}>
              or choose a file
            </span>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_MIME}
              className="sr-only"
              onChange={(e) => {
                const chosen = e.target.files?.[0];
                if (chosen) void handleFile(chosen);
              }}
            />
            <span
              className="nw-file-cta nw-button mt-1 px-4 py-2 text-sm"
              style={{ backgroundColor: 'var(--nw-accent)', color: 'var(--nw-accent-contrast)' }}
            >
              Choose a file
            </span>
          </label>

          <p className="mt-5 text-sm font-medium">🔒 Your file stays on your device.</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--nw-text-muted)' }}>
            JPG, PNG, WebP, SVG, Markdown and PDF · up to {formatBytes(MAX_FILE_BYTES)} · nothing is uploaded
          </p>
        </div>
      ) : null}

      {error ? (
        <Notice tone="warn">
          <p className="font-medium">{error}</p>
          <p className="mt-1 text-xs">Your original file has not been changed.</p>
          <button className="mt-2 text-sm underline" onClick={reset} type="button">
            Try another file
          </button>
        </Notice>
      ) : null}

      {file && phase !== 'error' ? (
        <div className="nw-evidence-panel flex items-center gap-4 p-4">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt=""
              className="h-16 w-16 shrink-0 object-cover"
              style={{ border: '1px solid var(--nw-border)' }}
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--nw-text-muted)' }}>
              {scan?.file.format?.toUpperCase() ?? '—'}
              {scan?.file.width ? ` · ${scan.file.width}×${scan.file.height}` : ''} ·{' '}
              {formatBytes(file.size)}
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="shrink-0 text-sm underline"
            style={{ color: 'var(--nw-text-muted)' }}
            disabled={busy}
          >
            Clear
          </button>
        </div>
      ) : null}

      {busy ? (
        <div className="flex items-center gap-3 px-1">
          <Spinner label={status} />
          {file && file.size > SLOW_FILE_BYTES ? (
            <span className="text-xs" style={{ color: 'var(--nw-text-muted)' }}>
              Large file — this may take a moment.
            </span>
          ) : null}
        </div>
      ) : null}

      {scan && !clean ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold">
              {detectedCount === 0
                ? 'No removable metadata found'
                : `Found ${detectedCount} metadata signal${detectedCount === 1 ? '' : 's'}`}
            </h2>
            <p className="text-xs" style={{ color: 'var(--nw-text-muted)' }}>
              Scanned locally · nothing was uploaded
            </p>
          </div>

          {/*
            The three axes come first and are never combined into a score
            (R4). A file can be clean on one and loud on another, and the
            detector column usually reads "cannot be measured" — a true answer
            no single number could carry.
          */}
          <ExposureSummary signals={allSignals(scan)} />

          <div className="flex flex-col gap-4">
            {groups.map((g) => (
              <ResultGroup key={g.key} title={g.title} description={g.description} signals={g.signals} />
            ))}
          </div>

          <div className="nw-evidence-panel flex flex-col gap-3 p-4">
            <div>
              <h3 className="text-sm font-semibold">Clean metadata</h3>
              <p className="mt-1 text-sm" style={{ color: 'var(--nw-text-muted)' }}>
                Removes supported metadata while preserving the image. Nothing is re-encoded, so
                image quality is untouched.
              </p>
            </div>

            {/*
              Presets (R5). Each says what it drops AND what it deliberately
              leaves behind, shown before the button is pressed — a "privacy"
              clean that silently stripped provenance, or a "provenance" clean
              that left GPS in place without saying so, would both mislead.
            */}
            <fieldset className="flex flex-col gap-2">
              <legend className="nw-panel-label mb-1.5">What should this do?</legend>
              {CLEAN_PRESETS.map((p) => (
                <label key={p.id} className="flex items-start gap-2.5 text-sm">
                  <input
                    type="radio"
                    name="clean-preset"
                    value={p.id}
                    checked={preset === p.id}
                    onChange={() => setPreset(p.id)}
                    className="mt-0.5"
                  />
                  <span>
                    {p.label}
                    <span className="block text-xs" style={{ color: 'var(--nw-text-muted)' }}>
                      {p.goal}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            <Notice>
              <p className="text-xs">
                <span className="font-medium">Before you run it: </span>
                {activePreset.summary}
              </p>
            </Notice>

            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={preserveOrientation}
                onChange={(e) => setPreserveOrientation(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Keep image rotation
                <span className="block text-xs" style={{ color: 'var(--nw-text-muted)' }}>
                  Preserves a single EXIF field so rotated photos stay upright. Turn this off to
                  strip EXIF completely — the image may then appear sideways.
                </span>
              </span>
            </label>

            <div>
              <Button onClick={() => void runClean()} disabled={busy || detectedCount === 0}>
                Clean metadata
              </Button>
              {detectedCount === 0 ? (
                <p className="mt-2 text-xs" style={{ color: 'var(--nw-text-muted)' }}>
                  There is nothing removable in this file.
                </p>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {clean ? (
        <CleanReport
          clean={clean}
          downloadUrl={downloadUrl}
          onReset={reset}
          onRerun={() => void runClean()}
          preserveOrientation={preserveOrientation}
          onPreserveOrientationChange={setPreserveOrientation}
          busy={busy}
        />
      ) : null}
    </div>
  );
}

const STATUS_TEXT: Record<Phase, string> = {
  idle: 'Ready. Choose an image to scan.',
  reading: 'Reading file…',
  scanning: 'Scanning file…',
  results: 'Scan complete.',
  cleaning: 'Cleaning metadata…',
  done: 'Cleaning complete.',
  error: 'Something went wrong.',
};

function CleanReport({
  clean,
  downloadUrl,
  onReset,
  onRerun,
  preserveOrientation,
  onPreserveOrientationChange,
  busy,
}: {
  clean: CleanPayload;
  downloadUrl: string | null;
  onReset: () => void;
  onRerun: () => void;
  preserveOrientation: boolean;
  onPreserveOrientationChange: (value: boolean) => void;
  busy: boolean;
}) {
  const shown = clean.comparisons.filter((c) => c.outcome !== 'absent');
  const removed = clean.removedSignals.length;
  const before = clean.before ? countDetected(clean.before) : 0;
  const after = clean.after ? countDetected(clean.after) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="nw-evidence-panel overflow-hidden">
        <header
          className="px-4 py-3"
          style={{ backgroundColor: 'var(--nw-surface-muted)', borderBottom: '1px solid var(--nw-border)' }}
        >
          <h3 className="text-sm font-semibold">
            Removed {removed} signal{removed === 1 ? '' : 's'}
          </h3>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--nw-text-muted)' }}>
            Before: {before} detected · After: {after} detected · verified by re-scanning the result
          </p>
        </header>

        <ul>
          {shown.map((c) => (
            <li
              key={c.id}
              className="flex items-start justify-between gap-3 border-b px-4 py-2.5 last:border-b-0"
              style={{ borderColor: 'var(--nw-border)' }}
            >
              <span className="min-w-0">
                <span className="text-sm">{c.label}</span>
                {c.note ? (
                  <span className="block text-xs" style={{ color: 'var(--nw-text-muted)' }}>
                    {c.note}
                  </span>
                ) : null}
              </span>
              <OutcomePill outcome={c.outcome} />
            </li>
          ))}
        </ul>
      </div>

      {clean.sizeAfter !== undefined ? (
        <p className="px-1 text-xs" style={{ color: 'var(--nw-text-muted)' }}>
          {formatBytes(clean.sizeBefore)} → {formatBytes(clean.sizeAfter)} · image data unchanged,
          not re-encoded
        </p>
      ) : null}

      <Notice>
        <p className="text-sm">
          Metadata cleaning cannot affect watermarks embedded in the pixels themselves, such as
          SynthID. Those are reported as <strong>Unable to verify</strong> above, and we make no
          claim about them either way.
        </p>
      </Notice>

      <div className="flex flex-wrap items-center gap-3">
        {downloadUrl ? (
          <a
            href={downloadUrl}
            download={clean.filename}
            className="nw-button inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm"
            style={{ backgroundColor: 'var(--nw-accent)', color: 'var(--nw-accent-contrast)' }}
            /*
             * GA's own "file download" trigger cannot see this: the href is a
             * blob: URL with no extension to match. So the event is sent
             * explicitly — and carries the format label and nothing else. The
             * filename sitting right there in `download` must never join it.
             */
            onClick={() => track('download_click', { format: formatLabel(clean.before.file.format) })}
          >
            Download clean image
          </a>
        ) : null}
        <Button variant="secondary" onClick={onReset}>
          Scan another file
        </Button>
      </div>

      <details className="nw-evidence-panel p-4 text-sm">
        <summary className="cursor-pointer font-medium">Cleaning options</summary>
        <label className="mt-3 flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={preserveOrientation}
            onChange={(e) => onPreserveOrientationChange(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Keep image rotation
            <span className="block text-xs" style={{ color: 'var(--nw-text-muted)' }}>
              Turn this off to strip EXIF completely. Rotated photos may then display sideways.
            </span>
          </span>
        </label>
        <div className="mt-3">
          <Button variant="secondary" onClick={onRerun} disabled={busy}>
            Clean again with these options
          </Button>
        </div>
      </details>
    </div>
  );
}

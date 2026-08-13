/**
 * Shared presentational pieces for the interactive tools.
 *
 * Status is never communicated by colour alone — every pill carries a text
 * label and a distinct glyph (PRD §38).
 */

import type { ReactNode } from 'react';

import { STATUS_LABEL, type SignalResult, type SignalStatus } from '../../lib/types';
import type { SignalOutcome } from '../../lib/clean';

const STATUS_STYLE: Record<SignalStatus, { bg: string; fg: string; glyph: string }> = {
  detected: { bg: 'var(--nw-detected-bg)', fg: 'var(--nw-detected)', glyph: '●' },
  not_detected: { bg: 'var(--nw-clear-bg)', fg: 'var(--nw-clear)', glyph: '○' },
  unknown: { bg: 'var(--nw-unknown-bg)', fg: 'var(--nw-unknown)', glyph: '?' },
  unable_to_verify: { bg: 'var(--nw-unknown-bg)', fg: 'var(--nw-unknown)', glyph: '?' },
};

export function StatusPill({ status }: { status: SignalStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: style.bg, color: style.fg }}
    >
      <span aria-hidden="true">{style.glyph}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}

const OUTCOME_STYLE: Record<SignalOutcome, { label: string; fg: string; glyph: string }> = {
  removed: { label: 'Removed', fg: 'var(--nw-clear)', glyph: '✓' },
  kept: { label: 'Kept', fg: 'var(--nw-text-muted)', glyph: '•' },
  remaining: { label: 'Still present', fg: 'var(--nw-detected)', glyph: '!' },
  unverifiable: { label: 'Unable to verify', fg: 'var(--nw-unknown)', glyph: '?' },
  absent: { label: 'Not present', fg: 'var(--nw-text-muted)', glyph: '–' },
};

export function OutcomePill({ outcome }: { outcome: SignalOutcome }) {
  const style = OUTCOME_STYLE[outcome];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium whitespace-nowrap"
      style={{ color: style.fg }}
    >
      <span aria-hidden="true">{style.glyph}</span>
      {style.label}
    </span>
  );
}

/** One scan result, with its explanation behind a disclosure. */
export function SignalRow({ signal }: { signal: SignalResult }) {
  return (
    <details className="group border-b last:border-b-0" style={{ borderColor: 'var(--nw-border)' }}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 hover:bg-[var(--nw-surface-muted)]">
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span
              className="text-[0.7rem] transition-transform group-open:rotate-90"
              aria-hidden="true"
              style={{ color: 'var(--nw-text-muted)' }}
            >
              ▶
            </span>
            <span className="text-sm font-medium">{signal.label}</span>
          </span>
          {signal.value ? (
            <span
              className="mt-0.5 block truncate pl-5 font-mono text-xs"
              style={{ color: 'var(--nw-text-muted)' }}
              title={signal.value}
            >
              {signal.value}
            </span>
          ) : null}
        </span>
        <StatusPill status={signal.status} />
      </summary>
      <div className="px-4 pb-4 pl-9 text-sm" style={{ color: 'var(--nw-text-muted)' }}>
        <p>{signal.detail ?? signal.description}</p>
        <p className="mt-2 text-xs">
          <span className="font-medium" style={{ color: 'var(--nw-text)' }}>
            Can NoWatermark remove this?{' '}
          </span>
          {signal.removable === true
            ? 'Yes — this is ordinary metadata and removal is verified by re-scanning the result.'
            : signal.removable === false
              ? 'No — this is preserved deliberately, because removing it would damage the image.'
              : 'We cannot tell. NoWatermark makes no claim either way about this signal.'}
        </p>
      </div>
    </details>
  );
}

export function ResultGroup({
  title,
  description,
  signals,
}: {
  title: string;
  description: string;
  signals: SignalResult[];
}) {
  if (signals.length === 0) return null;
  const detected = signals.filter((s) => s.status === 'detected').length;

  return (
    <section className="nw-card overflow-hidden">
      <header
        className="flex items-baseline justify-between gap-3 px-4 py-3"
        style={{ backgroundColor: 'var(--nw-surface-muted)', borderBottom: '1px solid var(--nw-border)' }}
      >
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--nw-text-muted)' }}>
            {description}
          </p>
        </div>
        <span className="shrink-0 text-xs tabular-nums" style={{ color: 'var(--nw-text-muted)' }}>
          {detected} found
        </span>
      </header>
      <div>
        {signals.map((s) => (
          <SignalRow key={s.id} signal={s} />
        ))}
      </div>
    </section>
  );
}

export function Button({
  children,
  variant = 'primary',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55';
  const style =
    variant === 'primary'
      ? { backgroundColor: 'var(--nw-accent)', color: 'var(--nw-accent-contrast)' }
      : {
          backgroundColor: 'var(--nw-surface)',
          color: 'var(--nw-text)',
          border: '1px solid var(--nw-border-strong)',
        };
  return (
    <button className={base} style={style} {...rest}>
      {children}
    </button>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn';
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-lg border px-3.5 py-3 text-sm"
      style={{
        backgroundColor: tone === 'warn' ? 'var(--nw-detected-bg)' : 'var(--nw-surface-muted)',
        borderColor: tone === 'warn' ? 'var(--nw-detected)' : 'var(--nw-border)',
        color: 'var(--nw-text)',
      }}
    >
      {children}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--nw-text-muted)' }}>
      <span
        className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

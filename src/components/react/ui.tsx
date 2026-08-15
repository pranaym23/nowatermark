/**
 * Shared presentational pieces for the interactive tools.
 *
 * Status is never communicated by colour alone — every pill carries a text
 * label and a distinct glyph (PRD §38).
 */

import type { ReactNode } from 'react';

import { STATUS_LABEL, type SignalResult, type SignalStatus } from '../../lib/types';
import type { SignalOutcome } from '../../lib/clean';
import {
  AXIS_DESCRIPTION,
  AXIS_LABEL,
  VERDICT_LABEL,
  signalById,
  verdictOf,
  type ExposureAxis,
  type SignalVerdict,
} from '../../lib/signals';

/** Axis for a scanned signal, read from signals.ts rather than duplicated. */
export function axisOf(signal: SignalResult): ExposureAxis {
  return signalById(signal.id)?.axis ?? 'privacy';
}

/**
 * The four-way verdict for a scanned signal (R2).
 *
 * Taken from the spec in signals.ts, not from the scan, so a component can
 * never invent a removal claim. `unable_to_verify` on the result itself wins,
 * because that is a statement about this particular file.
 */
function verdictOfSignal(signal: SignalResult): SignalVerdict {
  if (signal.status === 'unable_to_verify') return 'unable_to_verify';
  const spec = signalById(signal.id);
  return spec ? verdictOf(spec) : 'detect_only';
}

const VERDICT_EXPLANATION: Record<SignalVerdict, string> = {
  removable_verified:
    'This is ordinary metadata. It can be removed, and the removal is confirmed by scanning the cleaned file a second time.',
  removable_unverified:
    'This can be removed, but we cannot independently confirm afterwards that it is gone, so we will not claim that it is.',
  detect_only:
    'We can find this and show it to you, but we cannot remove it — either because removing it would damage the file, or because it is not ours to remove.',
  unable_to_verify:
    'We cannot determine whether this is present at all. That is not the same as it being absent, and it will not become a "no" later.',
};

export const AXIS_ORDER: readonly ExposureAxis[] = ['privacy', 'provenance', 'detector'];

/**
 * The three exposure axes, side by side (R4).
 *
 * There is deliberately no total, no score and no grade. A file can be spotless
 * on privacy and loud on provenance, and a single number would erase exactly
 * the distinction the reader needs. The detector column in particular usually
 * reads "cannot be measured", which is a true answer that no score could
 * represent honestly.
 */
export function ExposureSummary({ signals }: { signals: SignalResult[] }) {
  const axes = AXIS_ORDER.map((axis) => {
    const inAxis = signals.filter((s) => axisOf(s) === axis);
    return {
      axis,
      detected: inAxis.filter((s) => s.status === 'detected').length,
      unverifiable: inAxis.filter((s) => s.status === 'unable_to_verify').length,
      total: inAxis.length,
    };
  }).filter((a) => a.total > 0);

  if (axes.length === 0) return null;

  return (
    <section aria-label="Exposure by type" className="nw-panel-grid grid-cols-1 sm:grid-cols-3">
      {axes.map(({ axis, detected, unverifiable }) => {
        const void_ = detected === 0 && unverifiable > 0;
        return (
          <div
            key={axis}
            className={`nw-evidence-panel p-4${void_ ? ' nw-evidence-panel--void' : ''}`}
          >
            <p className="nw-panel-label">{AXIS_LABEL[axis]}</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums">
              {void_ ? '—' : detected}
              {!void_ && (
                <span className="ms-1.5 text-xs font-medium" style={{ color: 'var(--nw-evidence-muted)' }}>
                  found
                </span>
              )}
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--nw-evidence-muted)' }}>
              {void_
                ? 'Cannot be measured on this device.'
                : unverifiable > 0
                  ? `${AXIS_DESCRIPTION[axis]} ${unverifiable} signal${unverifiable === 1 ? '' : 's'} here cannot be checked at all.`
                  : AXIS_DESCRIPTION[axis]}
            </p>
          </div>
        );
      })}
    </section>
  );
}

const STATUS_STYLE: Record<SignalStatus, { bg: string; fg: string; glyph: string }> = {
  detected: { bg: 'var(--nw-detected-bg)', fg: 'var(--nw-detected)', glyph: '●' },
  not_detected: { bg: 'var(--nw-clear-bg)', fg: 'var(--nw-clear)', glyph: '○' },
  unknown: { bg: 'var(--nw-unknown-bg)', fg: 'var(--nw-unknown)', glyph: '?' },
  unable_to_verify: { bg: 'var(--nw-void)', fg: 'var(--nw-void-ink)', glyph: '?' },
};

export function StatusPill({ status }: { status: SignalStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <span
      className="nw-status inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1 text-xs whitespace-nowrap"
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
  /*
   * Deliberately not styled as a success. A rewrite changes the text but we
   * have no detector to confirm it defeated anything, so this must never read
   * like the green "Removed ✓" beside it.
   */
  rewritten_unverified: {
    label: 'Rewritten — unverified',
    fg: 'var(--nw-unknown)',
    glyph: '~',
  },
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
    <details className={`nw-evidence-panel group ${signal.status === 'unable_to_verify' ? 'nw-evidence-panel--void' : ''}`}>
      <summary className={`flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 ${signal.status === 'unable_to_verify' ? '' : 'hover:bg-[var(--nw-surface-muted)]'}`}>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span
              className="text-[0.7rem] transition-transform group-open:rotate-90"
              aria-hidden="true"
              style={{ color: 'var(--nw-evidence-muted)' }}
            >
              ▶
            </span>
            <span className="text-sm font-medium">{signal.label}</span>
          </span>
          {signal.value ? (
            <span
              className="mt-0.5 block truncate pl-5 font-mono text-xs"
              style={{ color: 'var(--nw-evidence-muted)' }}
              title={signal.value}
            >
              {signal.value}
            </span>
          ) : null}
        </span>
        <StatusPill status={signal.status} />
      </summary>
      <div className="px-4 pb-4 pl-9 text-sm" style={{ color: 'var(--nw-evidence-muted)' }}>
        <p>{signal.detail ?? signal.description}</p>
        <p className="mt-2 text-xs">
          <span className="font-medium" style={{ color: 'var(--nw-evidence-text)' }}>
            {VERDICT_LABEL[verdictOfSignal(signal)]}.{' '}
          </span>
          {VERDICT_EXPLANATION[verdictOfSignal(signal)]}
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
    <section className="nw-evidence-panel overflow-hidden">
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
      <div className="grid gap-2 p-2">
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
    'nw-button inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-55';
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
      className="nw-evidence-panel px-3.5 py-3 text-sm"
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

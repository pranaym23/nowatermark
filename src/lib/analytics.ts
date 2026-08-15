/**
 * Funnel analytics — the whole surface, deliberately tiny.
 *
 * Three of the V2 success criteria (how many guide readers start a tool, how
 * many scans reach a result) cannot be measured at all without this. But the
 * site's first non-negotiable is that no file data reaches the network, and an
 * analytics layer is exactly where that rule gets broken by accident — someone
 * adds a `filename` to "help debug", and the product's central promise is gone
 * in a one-line diff.
 *
 * So the payload is not a free-form object. Every event is declared here with
 * the exact keys it may carry, and every value is a **closed enum or a bucket**
 * — never a measurement taken from the user's file. The type system is the
 * enforcement: `track()` will not compile with a key that is not on the list.
 *
 * What may be sent:
 *   - which format was chosen, by label (JPEG, PNG, …) — a fixed set of six
 *   - a coarse outcome (ok / unsupported / error)
 *   - a count bucket ('0', '1-3', '4-10', '11+') — never an exact count, since
 *     an exact signal count is a fact about the user's specific file
 *
 * What may never be sent, under any circumstance:
 *   filenames, file sizes, hashes, dimensions, metadata values, signal values,
 *   GPS, timestamps from the file, prompts, pasted text, or any free string.
 *
 * If a future event needs something not expressible here, that is a signal to
 * stop and think, not to widen the type.
 */

/** Formats, by label. A closed set — nothing user-derived. */
type FormatLabel = 'JPEG' | 'PNG' | 'WebP' | 'SVG' | 'Markdown' | 'PDF' | 'unknown';

type Outcome = 'ok' | 'unsupported' | 'error';

/**
 * Counts are bucketed. "This file had 12 signals" is a fact about someone's
 * file; "this scan was in the 11+ bucket" is a fact about usage.
 */
export type CountBucket = '0' | '1-3' | '4-10' | '11+';

export function bucket(n: number): CountBucket {
  if (n <= 0) return '0';
  if (n <= 3) return '1-3';
  if (n <= 10) return '4-10';
  return '11+';
}

/** Which input mode the user is in. */
type Surface = 'file' | 'text';

interface EventMap {
  /** A file or text input was accepted and work began. */
  scan_start: { surface: Surface; format: FormatLabel };
  /** A scan finished. */
  scan_result: { surface: Surface; format: FormatLabel; outcome: Outcome; signals: CountBucket };
  /** A clean finished. */
  clean_complete: { format: FormatLabel; outcome: Outcome; removed: CountBucket };
  /** The user took the cleaned result. */
  download_click: { format: FormatLabel };
  /*
   * There is deliberately no rewrite event. /privacy states that using the
   * rewrite option "sends no event recording that you used it", and that
   * sentence is only true while this map has nothing for it. Adding one here
   * means editing /privacy in the same commit — so it is left out rather than
   * declared and unused, because an unused declaration is an invitation.
   */
}

type EventName = keyof EventMap;

declare global {
  interface Window {
    gtag?: (command: 'event', name: string, params: Record<string, string>) => void;
  }
}

/**
 * Send one event.
 *
 * Fails silently and completely: analytics must never be able to break a scan,
 * and a blocked or absent gtag is a normal state, not an error worth surfacing.
 */
export function track<K extends EventName>(name: K, params: EventMap[K]): void {
  if (typeof window === 'undefined') return;
  try {
    // Values are already closed enums by construction; String() is belt and
    // braces against a caller reaching this with a widened type at runtime.
    const safe: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) safe[key] = String(value);
    window.gtag?.('event', name, safe);
  } catch {
    // Never let telemetry surface to the user.
  }
}

/** Map an internal format id to the label the events use. */
export function formatLabel(format: string | undefined): FormatLabel {
  switch (format) {
    case 'jpeg':
      return 'JPEG';
    case 'png':
      return 'PNG';
    case 'webp':
      return 'WebP';
    case 'svg':
      return 'SVG';
    case 'markdown':
      return 'Markdown';
    case 'pdf':
      return 'PDF';
    default:
      return 'unknown';
  }
}

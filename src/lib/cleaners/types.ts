/** Internal result shape shared by every cleaner. */
export type RawCleanOutcome =
  | {
      ok: true;
      bytes: Uint8Array;
      warnings: string[];
      /**
       * Raster images only: set when a minimal orientation record was
       * re-embedded (PRD §18.2). Formats with no concept of orientation leave
       * this undefined and report anything else they need via `warnings` —
       * do not add per-format fields to this shared type.
       */
      orientationPreserved?: number;
    }
  | {
      ok: false;
      warnings: string[];
    };

/**
 * Everything a cleaner is allowed to know about the request. Kept deliberately
 * small: a cleaner sees bytes and options, never the filename or the scan
 * result, so it cannot make removal claims of its own — those come only from
 * the re-scan diff in `clean.ts`.
 */
export interface CleanContext {
  preserveOrientation: boolean;
  /**
   * Metadata blocks the caller asked to remove, by signal id (V2 R5).
   *
   * `undefined` means "every removable block" — the historical behaviour. A
   * cleaner that does not understand a block must leave it alone rather than
   * guess, so the default is expressed as absence rather than as a full set.
   */
  blocks?: ReadonlySet<string>;
}

/**
 * Should this block be removed?
 *
 * Centralised so every cleaner treats "no selection given" identically: an
 * unset `blocks` means remove everything removable, which is what every
 * existing caller and test expects.
 */
export function shouldRemove(ctx: CleanContext, signalId: string): boolean {
  return ctx.blocks === undefined || ctx.blocks.has(signalId);
}

/**
 * PDF cleaning has to re-parse its own output to verify it, so a cleaner may be
 * asynchronous. The raster cleaners stay synchronous and are simply awaited.
 */
export type Cleaner = (
  bytes: Uint8Array,
  ctx: CleanContext,
) => RawCleanOutcome | Promise<RawCleanOutcome>;

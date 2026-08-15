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
}

export type Cleaner = (bytes: Uint8Array, ctx: CleanContext) => RawCleanOutcome;

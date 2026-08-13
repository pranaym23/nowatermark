/** Internal result shape shared by the three container cleaners. */
export type RawCleanOutcome =
  | {
      ok: true;
      bytes: Uint8Array;
      warnings: string[];
      /** Set when a minimal orientation record was re-embedded (PRD §18.2). */
      orientationPreserved?: number;
    }
  | {
      ok: false;
      warnings: string[];
    };

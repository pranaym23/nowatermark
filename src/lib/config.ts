/** Product-level limits and constants. */

/**
 * Recommended maximum input size (PRD §12). This is a browser memory/UX
 * limit, not an upload limit — nothing is ever uploaded.
 */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Files above this get a "this may take a moment" hint before processing. */
export const SLOW_FILE_BYTES = 8 * 1024 * 1024;

/** Largest pasted text the text tools will process interactively. */
export const MAX_TEXT_LENGTH = 500_000;

export const ACCEPTED_MIME = 'image/jpeg,image/png,image/webp';

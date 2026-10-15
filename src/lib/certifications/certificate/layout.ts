/**
 * The sheet's arithmetic (ledger 0391, surface f), pure so a test can hold
 * it: the holder's name is set at the largest size that keeps the whole name
 * on ONE line of a landscape Letter sheet, capped so a short name is not a
 * banner, and the on-screen sheet is scaled into whatever width it is given.
 */

/** 11in by 8.5in at CSS's 96 dots per inch. */
export const SHEET_WIDTH_PX = 1056;
export const SHEET_HEIGHT_PX = 816;
export const SHEET_ASPECT = 11 / 8.5;

const NAME_MAX_IN = 0.7;
const NAME_MIN_IN = 0.3;
/** The run the name may take across the sheet, between the inner margins. */
const NAME_WIDTH_IN = 9.2;
/** Rajdhani bold's average advance, as a fraction of the font size (measured generously). */
const NAME_ADVANCE = 0.52;

/**
 * The name's font size in inches. A name of 32 characters lands at 0.55in,
 * a short one at the 0.7in cap, and nothing below 0.3in: the stylesheet's
 * ellipsis is the backstop for a name the floor cannot hold.
 */
export function nameSizeIn(name: string): number {
	const chars = Math.max(name.trim().length, 8);
	const fit = NAME_WIDTH_IN / (chars * NAME_ADVANCE);
	return Math.max(NAME_MIN_IN, Math.min(NAME_MAX_IN, Math.round(fit * 100) / 100));
}

/** The scale that fits the sheet into a frame `frameWidthPx` wide, never above 1. */
export function sheetScale(frameWidthPx: number): number {
	if (!Number.isFinite(frameWidthPx) || frameWidthPx <= 0) return 1;
	return Math.min(1, frameWidthPx / SHEET_WIDTH_PX);
}

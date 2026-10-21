/**
 * THE ONE ANSWER TO "IS THIS NAME BLANK" for tournament team, player and
 * tournament names (report a5fc5e64). `trim()` only removes whitespace, so a
 * name made of zero-width spaces, a braille blank or a Hangul filler passed as
 * "not empty" and showed up as a nameless entry in the bracket. A name needs at
 * least one character a person can see.
 */
const INVISIBLE =
	/[\s ͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯⠀　ㅤ︀-️﻿ﾠ]/g;

/** True when the text holds at least one visible character. */
export function hasVisibleText(raw: string | null | undefined): boolean {
	return (raw ?? '').replace(INVISIBLE, '').length > 0;
}

/**
 * The name to send: ends trimmed, runs of space squeezed to one, invisible
 * characters at the ends dropped. A blank name comes back as the empty string,
 * so `if (!cleanName(x))` is the whole check.
 */
export function cleanName(raw: string | null | undefined): string {
	const text = raw ?? '';
	if (!hasVisibleText(text)) return '';
	// Zero-width space, word joiner and BOM are never part of a real name. The
	// joiners (U+200C, U+200D) are left alone: emoji and some scripts need them.
	return text
		.replace(/[\u200b\u2060\ufeff]/g, '')
		.trim()
		.replace(/\s+/g, ' ');
}

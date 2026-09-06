/**
 * WHAT AN ENTRY THUMBNAIL DOES WHEN IT IS NOT A PICTURE.
 *
 * `tournament_entries.thumbnail_url` (0062) is a free text column capped at 600
 * characters with NO scheme check of any kind -- unlike an image BANNER, whose
 * `background_value` is refused by `_tournament_normalize_background` unless it
 * matches `^https://`. So the one field a spectator page hands straight to an
 * `<img src>` is the one field nothing validates.
 *
 * Before this module both `EntryChip` and `EntryBanner` wrote
 * `<img src={entry.thumbnail_url}>` with no `onerror`, which gave a bracket on
 * a projector exactly two outcomes for anything that is not a working picture:
 * the browser's own broken-image glyph, or -- for a blocked scheme -- nothing
 * at all, silently, in a box the layout had already reserved.
 *
 * FOUR STATES, AND THE POINT IS THAT THEY ARE FOUR RATHER THAN TWO:
 *
 *   present   a URL we will hand to the browser, and it loaded.
 *   absent    no URL at all. The ordinary case for a walk-up a host typed in;
 *             it is not a fault and must not be marked as one.
 *   refused   a URL we will NOT hand to the browser. It never reaches the
 *             `src` attribute -- the element is not rendered, rather than
 *             rendered with a blanked value, which is the rule the classroom's
 *             own figure path already follows.
 *   failed    a URL we did hand over, that did not load. An entry whose object
 *             was deleted, a typo'd external host, a network that dropped it.
 *
 * WHAT `refused` MEANS IS DELIBERATELY NARROW: not a web URL. `http:` and
 * `https:` are handed over; `javascript:`, `data:`, `blob:`, `file:` and
 * anything `URL()` cannot parse are not. In particular an ordinary EXTERNAL
 * https image is still rendered, because 0062's own column comment -- "Public
 * URL or a path in the public 'tournament-thumbs' bucket" -- says an off-project
 * URL is a designed case, and a render path is not the place to reverse that.
 *
 * `http:` IS ALLOWED THROUGH ON PURPOSE, AND THE FIRST DRAFT OF THIS MODULE HAD
 * IT WRONG. An https-only rule reads well and breaks local development
 * outright: the local Supabase stack answers on `http://127.0.0.1:54421`, so
 * `getPublicUrl()` returns an http URL there and every thumbnail in every local
 * pass would have rendered as a REFUSAL -- a fault tile shown for a picture
 * that is perfectly fine. On production, where the page is https, the browser
 * blocks a mixed-content image itself and fires `error` on the element, so such
 * a URL lands in `failed`: a stated tile rather than the silent empty box it
 * used to be. That is the right home for it. A scheme the browser will not even
 * attempt is a refusal; a scheme it attempts and rejects is a failure, and the
 * element's own event is what tells the two apart rather than a guess made
 * here about what protocol the document is on.
 *
 * AND SVG IS NOT REFUSED HERE, WHICH IS NOT AN OVERSIGHT. `CLAUDE.md`'s figure
 * rule refuses SVG for an AUTHORED image because such a figure is resolved
 * same-origin and could be navigated to; an `<img>` element decodes an image or
 * fails, script does not run in it, and an SVG loaded through one is inert by
 * specification -- the same measurement the classroom-files rule rests on.
 * Refusing it here would cost a picture and buy nothing.
 *
 * THIS MODULE IS THE ONE DECISION. The two components paint the box at their
 * own size, because the chip's thumbnail is 1.5rem and the banner's is a
 * clamp() up to 9rem and neither can be told from the other; what they must not
 * do is each decide separately what a bad URL is.
 */

export type ThumbnailState = 'present' | 'absent' | 'refused' | 'failed';

/**
 * The value that may reach an `src` attribute, or null. Null is the whole
 * refusal: a caller that renders `{#if thumbnailSrc(u)}` cannot accidentally
 * emit the rejected string, which is what `src={u}` guarded by a separate
 * boolean would eventually do.
 */
export function thumbnailSrc(url: string | null | undefined): string | null {
	const raw = (url ?? '').trim();
	if (!raw) return null;
	// Parsed rather than prefix-matched: `https:/\evil` and a leading control
	// character both survive a `startsWith('https://')` test and are not what
	// they look like. An unparseable value is refused, which is the safe
	// direction -- URL() is the same thing the browser will do with it. A
	// RELATIVE path is refused for the same reason and costs nothing: every
	// value this column has ever held comes from `getPublicUrl()`, which is
	// absolute.
	let parsed: URL;
	try {
		parsed = new URL(raw);
	} catch {
		return null;
	}
	return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? raw : null;
}

/** True when there IS a URL and we are declining to render it. */
export function thumbnailRefused(url: string | null | undefined): boolean {
	return (url ?? '').trim().length > 0 && thumbnailSrc(url) === null;
}

/**
 * The state before the browser has had its say. `failed` is not reachable from
 * here and never can be: only the element's own `error` event knows, so a
 * component ORs it in. Written this way so the two components share the half
 * that is decidable and cannot disagree about it.
 */
export function thumbnailState(
	url: string | null | undefined,
	loadFailed = false
): ThumbnailState {
	if (thumbnailRefused(url)) return 'refused';
	if (thumbnailSrc(url) === null) return 'absent';
	return loadFailed ? 'failed' : 'present';
}

/**
 * The mark each non-picture state wears. A GLYPH and a WORD for every one of
 * them, because colour is never the only signal and a tooltip is not
 * discoverable on a phone or a projector.
 *
 * `absent` carries no glyph of its own: the caller draws the entrant's INITIAL
 * there, which is more useful than any mark and is what both surfaces already
 * did. It is decorative -- the display name is beside it -- so it stays
 * `aria-hidden`, while the two fault states carry a real label, because "there
 * is a picture and you are not seeing it" is not something the name says.
 */
export const THUMBNAIL_MARK = {
	refused: { glyph: '!', label: 'Picture not shown: unsupported link' },
	failed: { glyph: '?', label: 'Picture could not be loaded' }
} as const;

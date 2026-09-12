/**
 * THE MOSAIC ARITHMETIC: what shape a gallery card is, how many columns the
 * mosaic gets, and what a coverless app is painted.
 *
 * Pure and client-safe on purpose -- no DOM, no Svelte, no `?raw` -- so every
 * number below is assertable without a browser, which is the only way the
 * clamp can be argued about rather than eyeballed.
 *
 * ===========================================================================
 * WHY A CLAMP EXISTS AT ALL
 * ===========================================================================
 *
 * The card IS the uploaded thumbnail now, at whatever shape the student
 * uploaded, so the gallery's layout is downstream of a file somebody picked on
 * their phone. NOTHING CONSTRAINS THAT FILE TODAY: `student_apps.cover_path`
 * is the only cover column in the schema (0130), no width, height or mime is
 * stored anywhere, and `$lib/upload-limits.ts` records the cover row as
 * `guards: ['bucket']` -- "nothing checks a size before sending". So a 1:9
 * upload is not a hypothetical, it is simply an upload nobody has made yet.
 *
 * Unclamped, one of those owns the gallery: in a 343px column at 375px a 1:9
 * cover is 3087px tall, which is four and a half phone screens of one app.
 * The other end is just as bad and less obvious -- a 9:1 cover in the same
 * column is 38px tall, a sliver that can hold neither a picture nor a name.
 */

/**
 * THE PERMITTED RANGE OF WIDTH/HEIGHT, AND BOTH ENDS ARE MEASURED FROM WHAT A
 * STUDENT ACTUALLY UPLOADS RATHER THAN CHOSEN AS ROUND NUMBERS.
 *
 *   min 0.5625 is 9:16 -- A PHONE SCREENSHOT IN PORTRAIT, which is the
 *     tallest thing anybody legitimately hands in. Going below it admits no
 *     real shape and costs the gallery: the property this number buys is that
 *     at 375px, in the 343px column the grid actually gets, the tallest
 *     possible card is 343 / 0.5625 = 610px -- SHORTER THAN THE 667px
 *     VIEWPORT OF THE SMALLEST PHONE IN COMMON USE. So one upload can never
 *     occupy a whole screen, and there is always a next card in view.
 *
 *   max 2 is 2:1 -- one notch wider than the 16:9 (1.778) a browser window,
 *     a desktop app window and a landscape phone all sit at or under, so
 *     every real landscape screenshot passes through unclamped. At the
 *     narrowest column the mosaic produces (~243px at 1440) a 2:1 card is
 *     121px tall, which still reads as a picture and still holds a name.
 *
 * A MODERN TALL PHONE (1179x2556 is 0.461) IS CLAMPED, DELIBERATELY, and the
 * cost is stated rather than hidden: `object-fit: cover` crops roughly the top
 * and bottom 9% of such a screenshot on the card. Losing a strip of a very
 * tall screenshot is a much smaller price than one card filling a phone
 * screen, and the detail pane shows the app itself at full size anyway.
 */
export const FOUNDRY_COVER_ASPECT = {
	min: 0.5625,
	max: 2,
	/**
	 * WHAT A CARD IS BEFORE ITS IMAGE HAS LOADED, and what a GENERATED cover
	 * is permanently. 3:2 sits near the middle of the permitted range, so the
	 * layout shift when a real measurement replaces it is the smallest
	 * available in the worst case either way.
	 */
	fallback: 1.5
} as const;

/**
 * The card's aspect ratio for an image of this natural size, or NULL when the
 * browser has not got a usable measurement yet.
 *
 * NULL RATHER THAN THE FALLBACK, so the caller decides what an unmeasured card
 * is. A function that quietly substituted 3:2 for a broken image would make
 * "never measured" and "measured as 3:2" the same answer, and only one of them
 * should ever be corrected later.
 *
 * A zero or negative side is what a decode failure and a detached image both
 * report, and `naturalWidth` is 0 on an image that has not loaded -- so the
 * guard is the ordinary path here, not a defensive flourish.
 */
export function clampCoverAspect(
	naturalWidth: number,
	naturalHeight: number
): number | null {
	if (!Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight)) return null;
	if (naturalWidth <= 0 || naturalHeight <= 0) return null;
	const raw = naturalWidth / naturalHeight;
	if (!Number.isFinite(raw) || raw <= 0) return null;
	return Math.min(FOUNDRY_COVER_ASPECT.max, Math.max(FOUNDRY_COVER_ASPECT.min, raw));
}

/** Whether a natural size would be clamped, i.e. whether the card crops it. */
export function coverAspectIsClamped(naturalWidth: number, naturalHeight: number): boolean {
	const clamped = clampCoverAspect(naturalWidth, naturalHeight);
	if (clamped === null) return false;
	return clamped !== naturalWidth / naturalHeight;
}

/**
 * THE COLUMN CEILING FOR A MULTICOL MOSAIC, WHICH IS NOT THE SAME PROBLEM A
 * GRID HAS.
 *
 * `CLAUDE.md` states the mechanism this implements: panels of unequal height
 * go in a MULTI-COLUMN container and never in a grid, because a grid ROW is as
 * tall as its tallest member -- which in a mosaic of arbitrary shapes means a
 * 2:1 card beside a 9:16 one kills most of a row. It also states the trap:
 * `auto-fit` COLLAPSES a track nothing was placed in, and multicol does not --
 * it cuts every column the width holds and leaves the spare ones empty.
 *
 * So the count is capped at the number of cards there actually are. Three apps
 * in a five-column container is three narrow columns and two columns of void.
 */
export function foundryMosaicColumns(cardCount: number, maxColumns: number): number {
	if (!Number.isFinite(cardCount) || cardCount <= 0) return 1;
	return Math.max(1, Math.min(Math.floor(maxColumns), Math.floor(cardCount)));
}

/**
 * THE HEAT BAND, IN DEGREES, THAT A GENERATED COVER MAY NEVER LAND IN.
 *
 * `forge.css` gives the amber `--fg-heat-*` scale ONE meaning in this room --
 * IN PROGRESS -- and says nothing else may wear it. Its five stops measure
 * 21.7deg (ember), 22deg (crust), 30.8deg (heat), 35.2deg (core), so the band
 * below covers all of them with margin on both sides. A generated cover that
 * came out amber would be a published app painted the colour this room
 * reserves for a build that is still moving.
 */
export const FOUNDRY_HEAT_HUE_BAND = { from: 15, to: 50 } as const;

/**
 * A STABLE HUE FOR AN APP WITH NO COVER, DERIVED FROM ITS OWN ID.
 *
 * DETERMINISTIC IS THE WHOLE POINT: the same app is the same colour on every
 * load, on every device and for every viewer, so a student recognises their
 * own app in a list the way they would recognise its art. A random hue would
 * make the fallback a different app every time the page was opened.
 *
 * IT IS ALSO WHY THIS IS NOT ONE FLAT COLOUR. The complaint that produced this
 * work was that every card looked the same; a single fallback plate reproduces
 * that exactly for every app that has no cover, which is an ordinary state
 * because `foundryPublishBlockers` requires a description and never a cover.
 */
export function foundryGeneratedHue(seed: string): number {
	// FNV-1a, 32-bit. A named, ordinary hash rather than a hand-rolled sum:
	// the property that matters is that two adjacent uuids land far apart, and
	// a character sum does the opposite.
	let h = 0x811c9dc5;
	for (let i = 0; i < seed.length; i++) {
		h ^= seed.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	const band = FOUNDRY_HEAT_HUE_BAND.to - FOUNDRY_HEAT_HUE_BAND.from;
	const hue = h % (360 - band);
	return hue < FOUNDRY_HEAT_HUE_BAND.from ? hue : hue + band;
}

/** Whether a hue is inside the reserved heat band. The sweep's own predicate. */
export function hueIsHeat(hue: number): boolean {
	const h = ((hue % 360) + 360) % 360;
	return h >= FOUNDRY_HEAT_HUE_BAND.from && h < FOUNDRY_HEAT_HUE_BAND.to;
}

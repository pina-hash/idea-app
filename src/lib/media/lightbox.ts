/**
 * THE CLASSROOM LIGHTBOX'S PURE HALF (ledger 0297, package ITEM).
 *
 * Every picture in the classroom opens large in ONE viewer
 * (`Lightbox.svelte`): a body figure, an image attachment, an imageZone photo,
 * a hand-in, the grading console's views of those, and the notebook's photo
 * pages, which were the first caller (`PhotoViewer.svelte` is a thin wrapper
 * over it now). This module is what that viewer decides without a browser:
 * which key does what, how far one press of a pan control moves, whether a
 * view is zoomed in far enough that panning means anything, and how a retry
 * busts the cache on a URL that may already carry a query string.
 *
 * NO DOM, NO SVELTE. The arithmetic of pan and zoom is `$lib/panzoom`'s and is
 * not restated here; this only chooses WHICH of its operations a control asks
 * for, so a key and a button can never apply different arithmetic.
 */

import { clampPan, type Size, type View } from '$lib/panzoom/transform';

/**
 * ONE PICTURE THE VIEWER CAN SHOW.
 *
 * `src` is the SAME URL the thumbnail already loaded -- for a classroom file
 * that is the app's own proxy, which answers `Content-Disposition: attachment`
 * on a foreign origin, and CLAUDE.md records (measured in Chromium) that an
 * `<img>` decodes that response. So the large view costs no serve-route
 * change, and neither does Download: it is an `<a href>` to the same URL.
 */
export interface LightboxImage {
	/** Stable identity. A change of `src` under the same key refits as well. */
	key: string;
	src: string;
	/** The picture described, for a reader who cannot see it. Required. */
	alt: string;
	/** What the top bar names; the alt text when absent. */
	caption?: string | null;
	/** Where Download points. Null or absent REMOVES the control. */
	downloadHref?: string | null;
	/** The suggested filename, honoured on a same-origin link. */
	downloadName?: string | null;
	/** A second way to the bytes when the picture will not decode (the
	 *  notebook's Drive link). Absent means Download is the fallback. */
	openHref?: string | null;
	openLabel?: string | null;
}

/** What a key press asks the viewer to do, or null for nothing. */
export type LightboxAction =
	| 'prev'
	| 'next'
	| 'first'
	| 'last'
	| 'zoom-in'
	| 'zoom-out'
	| 'fit'
	| 'pan-left'
	| 'pan-right'
	| 'pan-up'
	| 'pan-down';

/**
 * THE KEY MAP, AND IT IS THE BUTTONS' OWN VOCABULARY.
 *
 * Plain arrows move between pictures, because that is what a gallery's arrows
 * do everywhere else and a student expects it. SHIFT with an arrow pans a
 * zoomed picture, so a keyboard reaches every part of an enlarged photo
 * without a drag. `+`, `-` and `0` are the zoom controls. Escape is the
 * browser's own: a native `<dialog>` closes on it with no code of ours.
 */
export function lightboxKeyAction(key: string, shiftKey: boolean): LightboxAction | null {
	if (shiftKey) {
		if (key === 'ArrowLeft') return 'pan-left';
		if (key === 'ArrowRight') return 'pan-right';
		if (key === 'ArrowUp') return 'pan-up';
		if (key === 'ArrowDown') return 'pan-down';
	}
	switch (key) {
		case 'ArrowLeft':
			return 'prev';
		case 'ArrowRight':
			return 'next';
		case 'Home':
			return 'first';
		case 'End':
			return 'last';
		case '+':
		case '=':
			return 'zoom-in';
		case '-':
		case '_':
			return 'zoom-out';
		case '0':
			return 'fit';
		default:
			return null;
	}
}

/** One press of a zoom control. The wheel and a pinch are continuous; this is
 *  the discrete step a button and a key take, and it is PhotoViewer's own. */
export const LIGHTBOX_ZOOM_STEP = 1.4;

/**
 * HOW FAR ONE PRESS OF A PAN CONTROL MOVES, as a fraction of the stage.
 *
 * A quarter of the visible box: enough that four presses cross a view, small
 * enough that the point being read stays on screen through the move. This is
 * the single-pointer alternative to dragging (WCAG 2.2, 2.5.7), so it has to be
 * usable on its own rather than a token gesture.
 */
export const LIGHTBOX_PAN_FRACTION = 0.25;

/**
 * THE VIEW AFTER ONE PAN PRESS. Pressing "Move right" shows what is to the
 * RIGHT of the picture, which moves the content LEFT -- the direction a
 * reader means, not the direction the transform moves. Clamped by the shared
 * engine, so a press at an edge changes nothing rather than opening a gap.
 */
export function lightboxPan(
	view: View,
	direction: 'left' | 'right' | 'up' | 'down',
	stage: Size,
	content: Size
): View {
	const dx = stage.w * LIGHTBOX_PAN_FRACTION;
	const dy = stage.h * LIGHTBOX_PAN_FRACTION;
	const move =
		direction === 'left'
			? { tx: view.tx + dx, ty: view.ty }
			: direction === 'right'
				? { tx: view.tx - dx, ty: view.ty }
				: direction === 'up'
					? { tx: view.tx, ty: view.ty + dy }
					: { tx: view.tx, ty: view.ty - dy };
	return clampPan({ s: view.s, ...move }, stage, content);
}

/**
 * WHETHER PANNING MEANS ANYTHING RIGHT NOW: the picture, at this scale, is
 * bigger than the stage on at least one axis. The pan controls render only
 * then, so a fitted picture is never offered four buttons that do nothing.
 * Half a pixel of slack so a fit that rounds to the stage's own size is not
 * read as an overflow.
 */
export function lightboxCanPan(view: View, stage: Size, content: Size): boolean {
	if (!(stage.w > 0 && stage.h > 0 && content.w > 0 && content.h > 0)) return false;
	return content.w * view.s > stage.w + 0.5 || content.h * view.s > stage.h + 0.5;
}

/**
 * A RETRY'S CACHE-BUSTING URL. The classroom's public proxy URL already carries
 * `?public=1`, so a retry appending a second `?` would ask the route for a
 * different path. Tick 0 is the URL unchanged, which is what every first load
 * uses and what the thumbnail beside it already fetched.
 */
export function lightboxRetrySrc(src: string, tick: number): string {
	if (!tick) return src;
	return `${src}${src.includes('?') ? '&' : '?'}r=${tick}`;
}

/** "3 of 12", or nothing for a single picture. */
export function lightboxCountLabel(index: number, total: number): string | null {
	if (total <= 1) return null;
	return `${index + 1} of ${total}`;
}

/**
 * A HANDLE FOR ANY LIST OF PICTURES: which one is open, and the three moves.
 * The callers that own a list of thumbnails (an attachment list, a photo zone,
 * a body with figures) each hold one of these in `$state`; the viewer itself
 * only ever reads `index` and calls back. A clamp rather than a wrap at the
 * ends, because "Next" on the last photograph taking a student back to the
 * first reads as the list starting over.
 */
export function lightboxStep(index: number | null, delta: number, total: number): number | null {
	if (index === null || total <= 0) return null;
	return Math.max(0, Math.min(total - 1, index + delta));
}

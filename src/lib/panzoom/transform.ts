/**
 * Pan/zoom transform arithmetic -- pure, DOM-free, framework-free.
 *
 * Extracted verbatim from `src/lib/gauntlet/DrawingViewer.svelte`, whose model
 * this still is: content is laid out at INTRINSIC size inside one wrapper and
 * every pan/zoom is a single `translate(tx,ty) scale(s)` on that wrapper
 * (transform-origin 0 0). Overlays positioned in the same wrapper therefore
 * cannot drift from the content at any zoom, which is the whole reason the
 * transform is shared rather than per-layer.
 *
 * NOTHING HERE TOUCHES THE DOM, and that split is not cosmetic: the behavior
 * these functions define is checked by a generated sweep of tens of thousands of
 * geometries (`tests/panzoom-transform.test.ts`), and a sweep cannot run against
 * code that needs a browser. The listener/ResizeObserver half lives beside this
 * in `./controller.ts`.
 *
 * This module deliberately carries no chrome, no colors, no markup, and imports
 * nothing from any feature area.
 */

/** A box: a stage viewport in CSS px, or a content box in world units. */
export interface Size {
	w: number;
	h: number;
}

/** The one shared view transform. */
export interface View {
	s: number;
	tx: number;
	ty: number;
}

/**
 * Fit margin: the fitted content leaves a margin inside the stage, so it reads
 * as framed rather than full-bleed.
 */
export const FIT_MARGIN = 0.92;

/**
 * Scale at which the WHOLE content fits inside the stage, with the fit margin.
 *
 * Answers 1 rather than 0/NaN whenever the geometry is not yet known -- a stage
 * that has not been measured, or content whose intrinsic size has not been read.
 * Callers rely on that: it keeps every bound below finite before the first fit.
 */
export function fitScale(stage: Size, content: Size, margin = FIT_MARGIN): number {
	const ready = content.w > 0 && content.h > 0;
	return stage.w && stage.h && ready
		? Math.min(stage.w / content.w, stage.h / content.h) * margin
		: 1;
}

/**
 * Upper zoom bound. Eight times the fit scale, but never below 3x absolute --
 * otherwise a large sheet fitted into a small stage (a tiny fit scale) could
 * not be zoomed into far enough to read.
 */
export function maxScale(fit: number): number {
	return Math.max(fit * 8, 3);
}

/** The live scale bounds for a stage/content pair. Fit is the floor. */
export function scaleBounds(stage: Size, content: Size, margin = FIT_MARGIN): { min: number; max: number } {
	const fit = fitScale(stage, content, margin);
	return { min: fit, max: maxScale(fit) };
}

/** Clamp a scale into the bounds. The fitted view is the most zoomed-OUT state. */
export function clampScale(v: number, bounds: { min: number; max: number }): number {
	return Math.min(bounds.max, Math.max(bounds.min, v));
}

/**
 * Keep the content pinned to the stage: centred on an axis it fits within,
 * edge-locked on an axis it overflows. There is never a gap on an overflowing
 * axis and never an off-centre rest position on a fitting one.
 */
export function clampPan(view: View, stage: Size, content: Size): View {
	const ow = content.w * view.s;
	const oh = content.h * view.s;
	return {
		s: view.s,
		tx: ow <= stage.w ? (stage.w - ow) / 2 : Math.min(0, Math.max(stage.w - ow, view.tx)),
		ty: oh <= stage.h ? (stage.h - oh) / 2 : Math.min(0, Math.max(stage.h - oh, view.ty))
	};
}

/** The fitted view: whole content, centred. Not pan-clamped -- it already is. */
export function fitView(stage: Size, content: Size, margin = FIT_MARGIN): View {
	const s = fitScale(stage, content, margin);
	return {
		s,
		tx: (stage.w - content.w * s) / 2,
		ty: (stage.h - content.h * s) / 2
	};
}

/**
 * Zoom about a point in STAGE coordinates, holding the world point under it
 * fixed. A factor that would land outside the bounds is clamped, and a zoom that
 * changes nothing returns the view UNTOUCHED -- notably without re-clamping the
 * pan, so scrolling against a bound cannot creep the content sideways.
 */
export function zoomAt(
	view: View,
	factor: number,
	px: number,
	py: number,
	stage: Size,
	content: Size,
	margin = FIT_MARGIN
): View {
	const ns = clampScale(view.s * factor, scaleBounds(stage, content, margin));
	if (ns === view.s) return view;
	return clampPan(
		{
			s: ns,
			tx: px - (px - view.tx) * (ns / view.s),
			ty: py - (py - view.ty) * (ns / view.s)
		},
		stage,
		content
	);
}

/** Pan by a stage-space delta, clamped. */
export function panBy(view: View, dx: number, dy: number, stage: Size, content: Size): View {
	return clampPan({ s: view.s, tx: view.tx + dx, ty: view.ty + dy }, stage, content);
}

/**
 * Re-frame after the stage changes size: same scale, same world point under the
 * stage centre. Preserving the framed view is what makes a resize (or a move
 * into a picture-in-picture window) read as the window changing rather than the
 * drawing jumping.
 *
 * The scale is re-clamped against the NEW bounds, because a stage that grew can
 * make the current scale narrower than the new fit.
 */
export function resizeView(
	view: View,
	oldStage: Size,
	newStage: Size,
	content: Size,
	margin = FIT_MARGIN
): View {
	const cx = oldStage.w && view.s ? (oldStage.w / 2 - view.tx) / view.s : content.w / 2;
	const cy = oldStage.h && view.s ? (oldStage.h / 2 - view.ty) / view.s : content.h / 2;
	const s = clampScale(view.s, scaleBounds(newStage, content, margin));
	return clampPan({ s, tx: newStage.w / 2 - cx * s, ty: newStage.h / 2 - cy * s }, newStage, content);
}

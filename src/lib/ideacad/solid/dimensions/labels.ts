/**
 * THE WORDS AND THE PLACES OF THE NUMBERS DRAWN IN THE VIEWPORT. What a label
 * says in the student's display unit, what its box is seeded with, what a
 * typed value means, and where labels go so none covers another. Pure: the
 * overlay (`DimensionOverlay.svelte`) measures and renders; everything it
 * decides is here and assertable in a plain test.
 *
 * THE DOCUMENT IS IN INCHES AND STAYS THERE. A student who prefers
 * millimeters reads millimeters and types millimeters (a bare `25` is 25 mm),
 * and what is stored is still inches, through `parseDimension`, which is the
 * one parser. A number that names its own unit (`1in`, `3/8"`) is taken as
 * named whatever the preference says.
 *
 * NOTHING HERE CLAMPS. A typed value that is a number goes to the document as
 * typed; the kernel or the solver is the only refusal of a value.
 */
import { editText, formatDimension, parseDimension, type DimensionUnit, type MeasuredUnit, type ParsedDimension } from './model';

export type DisplayUnit = 'in' | 'mm';
const MM_PER_INCH = 25.4;
/** A bare number: what a display unit gives its meaning to. A number that names a unit, a fraction with a word, anything else passes through. */
const BARE = /^[-+]?(\d+(\.\d*)?|\.\d+)(\s+\d+\/\d+)?$|^[-+]?\d+\/\d+$/;

/**
 * What a typed length means in the student's display unit: `25` in millimeters
 * mode is `25mm`. Angles, counts and ratios, and a length that names its own
 * unit, pass through untouched.
 */
export function typedInDisplay(text: string, unit: DimensionUnit, display: DisplayUnit): string {
	if (unit !== 'in' || display !== 'mm') return text;
	const t = text.trim();
	return BARE.test(t) ? `${t}mm` : text;
}
/** The number a label shows, in the display unit, with its mark: `⌀ 2.000 in`, `R 6.35 mm`, `45.0°`, `4 copies`. */
export function labelText(value: number, unit: DimensionUnit | MeasuredUnit, display: DisplayUnit, prefix?: string, factor = 1): string {
	const shown = value * factor, mark = prefix ? `${prefix} ` : '';
	if (unit === 'in' && display === 'mm' && Number.isFinite(shown)) return `${mark}${(shown * MM_PER_INCH).toFixed(2)} mm`;
	return `${mark}${formatDimension(shown, unit)}`;
}
/** What the box opens with: the shown number, in the display unit, with float noise trimmed and nothing else rounded away. */
export function labelEditText(value: number, unit: DimensionUnit, display: DisplayUnit, factor = 1): string {
	const shown = value * factor;
	return editText(unit === 'in' && display === 'mm' ? shown * MM_PER_INCH : shown);
}
/** A typed value back to the stored number: parsed in the display unit, then divided by the label's factor (a typed diameter stores a radius). */
export function readLabel(text: string, unit: DimensionUnit, display: DisplayUnit, factor = 1): ParsedDimension {
	const parsed = parseDimension(typedInDisplay(text, unit, display), unit);
	if (!parsed.ok || factor === 1) return parsed;
	return { ok: true, value: parsed.value / factor };
}

/* -------------------------------------------------------------- placement */
/** One label: its centre and size in overlay pixels. `x`, `y` are where it wants to be. */
export interface LabelBox { id: string; x: number; y: number; w: number; h: number }
export interface Bounds { left: number; top: number; right: number; bottom: number }
/** The space kept clear between two labels, in pixels. */
export const LABEL_SPACING = 4;
const overlap = (a: LabelBox, b: LabelBox, pad: number) => ({ dx: (a.w + b.w) / 2 + pad - Math.abs(a.x - b.x), dy: (a.h + b.h) / 2 + pad - Math.abs(a.y - b.y) });
/**
 * Labels moved apart so none covers another, in their own order: the first
 * keeps its place, and each later one is nudged, along whichever axis clears
 * it with the smaller move, away from what it overlaps, until it touches
 * nothing (or the pass gives up, which the overlay never sees at the sizes it
 * draws). Then every label is kept inside `bounds`. `obstacles` are boxes a
 * label must not sit on and that never move themselves: the panels and
 * toolbars drawn over the model. Deterministic: the same input always lands
 * the same way, so labels do not shuffle between frames.
 */
export function spreadLabels(boxes: readonly LabelBox[], bounds?: Bounds, pad = LABEL_SPACING, obstacles: readonly LabelBox[] = []): LabelBox[] {
	/* Chrome over the model (a panel, a toolbar) is placed first and never moves, so a label is pushed out from under it rather than drawn where a press cannot reach it. */
	const placed: LabelBox[] = [...obstacles], out: LabelBox[] = [];
	const keep = (b: LabelBox): LabelBox => {
		if (!bounds) return b;
		const halfW = b.w / 2, halfH = b.h / 2;
		const x = Math.min(Math.max(b.x, bounds.left + halfW), Math.max(bounds.left + halfW, bounds.right - halfW));
		const y = Math.min(Math.max(b.y, bounds.top + halfH), Math.max(bounds.top + halfH, bounds.bottom - halfH));
		return { ...b, x, y };
	};
	for (const original of boxes) {
		let box = keep({ ...original });
		for (let round = 0; round < 64; round++) {
			const hit = placed.find((p) => { const o = overlap(box, p, pad); return o.dx > 0.01 && o.dy > 0.01; });
			if (!hit) break;
			const o = overlap(box, hit, pad), clear = (b: LabelBox) => { const a = overlap(b, hit, pad); return a.dx <= 0.01 || a.dy <= 0.01; };
			/* The smaller move wins, to the near side; a tie, and a label sitting exactly on another, goes down, which is the direction a reader's eye continues. A label pinned against a bound cannot move that way, so the other axis, then the other side, are tried before the pass goes round again. */
			const nearY = keep({ ...box, y: box.y + (box.y < hit.y ? -o.dy : o.dy) }), nearX = keep({ ...box, x: box.x + (box.x < hit.x ? -o.dx : o.dx) });
			const farY = keep({ ...box, y: box.y < hit.y ? hit.y + (hit.h + box.h) / 2 + pad : hit.y - (hit.h + box.h) / 2 - pad });
			const farX = keep({ ...box, x: box.x < hit.x ? hit.x + (hit.w + box.w) / 2 + pad : hit.x - (hit.w + box.w) / 2 - pad });
			const order = o.dy <= o.dx ? [nearY, nearX, farY, farX] : [nearX, nearY, farX, farY];
			/* Prefer a move that clears everything already placed, so a label is not handed back and forth between a panel and a neighbour. */
			const free = (b: LabelBox) => placed.every((p) => { const a = overlap(b, p, pad); return a.dx <= 0.01 || a.dy <= 0.01; });
			box = order.find(free) ?? order.find(clear) ?? order[0];
		}
		placed.push(box); out.push(box);
	}
	return out;
}
/** How far a label sits from the point it names, along the anchor's `away`, in pixels. */
export const LABEL_OFFSET = 30;
/**
 * Where a label wants to be on screen: the anchor's point, pushed `offset`
 * pixels along the screen direction of `away` (read off two projected points,
 * so the push follows the camera). An anchor with no direction stays on its
 * point.
 */
export function labelTarget(point: { x: number; y: number }, ahead: { x: number; y: number } | null, offset = LABEL_OFFSET): { x: number; y: number } {
	if (!ahead) return point;
	const dx = ahead.x - point.x, dy = ahead.y - point.y, n = Math.hypot(dx, dy);
	if (!(n > 1e-3)) return point;
	return { x: point.x + dx / n * offset, y: point.y + dy / n * offset };
}

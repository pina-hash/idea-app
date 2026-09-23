/**
 * THE WORDS BESIDE THE CURSOR. One place turns a drag value or a drawing in
 * progress into the sentence the workspace floats at the pointer, so every
 * drag reads the same way and a number is never formatted twice: the
 * formatting is `dimensions/model.ts`'s and this module only chooses the
 * words around it.
 *
 * THIS MODULE IS THE DIMENSIONAL-CONTROL SURFACE'S. The value shown for each
 * tool, the unit it carries, and what a typed override is asked for all live
 * here; the workspace only positions the text.
 *
 * WHAT A DRAG IS WORTH DEPENDS ON THE TOOL AND ON WHAT WAS GRABBED. The
 * workspace's `commandFor` decides a select-tool drag on a face is a push and
 * on an edge is a move, and an extrude-tool drag on a face is still a push;
 * `dragReadout` takes the grabbed entity's kind as context so the word beside
 * the cursor is the word in the tree afterwards. Without the context (an
 * older caller) the tool alone decides, which is right for every tool but
 * `select` on an edge.
 *
 * NOTHING HERE CLAMPS OR ROUNDS THE VALUE ITSELF: a negative extrude reads as
 * a negative number, and a value the kernel refuses is refused by the kernel
 * in the feature row, not by the readout.
 */
import type { EntityKind } from '../types';
import type { Tool, DragValue } from '../viewport';
import { formatDimension, type DimensionUnit } from '../dimensions/model';
export { INCH_DECIMALS } from '../dimensions/model';

/**
 * THE DISPLAY UNIT, a student's preference: lengths beside the cursor read in
 * inches or millimeters. The document always stores inches; this changes the
 * words, and what a bare number typed into the value box means.
 */
export type DisplayUnit = 'in' | 'mm';
export const DISPLAY_UNITS: readonly DisplayUnit[] = ['in', 'mm'];
export const readoutSettings: { unit: DisplayUnit } = { unit: 'in' };
const MM_PER_INCH = 25.4;
export const inches = (n: number) => (readoutSettings.unit === 'mm' && Number.isFinite(n) ? `${(n * MM_PER_INCH).toFixed(2)} mm` : formatDimension(n, 'in'));
export const degrees = (n: number) => formatDimension(n, 'deg');

/** What the drag started on, from the gesture's own selection. */
export interface DragContext { kind?: EntityKind }
const free = (v: DragValue) => inches(Math.hypot(...v.delta));
/** The readout for what was grabbed rather than for the tool: a sketch extrudes, a face pushes, an edge or a corner moves. */
function bySelection(v: DragValue, ctx: DragContext, sketchWord = 'Extrude'): string {
	if (ctx.kind === 'edge' || ctx.kind === 'vertex') return `Move ${free(v)}`;
	if (ctx.kind === 'sketch') return `${sketchWord} ${sketchWord === 'Revolve' ? degrees(v.angle) : inches(v.distance)}`;
	return `Push ${inches(v.distance)}`;
}
function move(v: DragValue): string {
	const h = v.handle;
	const snap = v.snapped ? ` to ${v.snapped.to}` : '';
	if (!h) return `Move ${inches(v.distance)}`;
	if (h.mode === 'ring') return `Rotate ${degrees(v.angle)} ${h.label}${snap}`;
	if (h.mode === 'free') return `Move ${free(v)} free${snap}`;
	if (h.mode === 'plane') return `Move ${free(v)} in ${h.label}${snap}`;
	return `Move ${inches(v.distance)} along ${h.label}${snap}`;
}
/** Every tool, so a tool added to the union is a compile error here until its words are stated. */
const DRAG: Record<Tool, (v: DragValue, ctx: DragContext) => string> = {
	select: (v, ctx) => bySelection(v, ctx),
	rectangle: (v, ctx) => bySelection(v, ctx),
	circle: (v, ctx) => bySelection(v, ctx),
	line: (v, ctx) => bySelection(v, ctx),
	polygon: (v, ctx) => bySelection(v, ctx),
	arc: (v, ctx) => bySelection(v, ctx),
	extrude: (v, ctx) => (ctx.kind && ctx.kind !== 'sketch' ? bySelection(v, ctx) : `Extrude ${inches(v.distance)}`),
	revolve: (v, ctx) => (ctx.kind && ctx.kind !== 'sketch' ? bySelection(v, ctx, 'Revolve') : `Revolve ${degrees(v.angle)}`),
	fillet: (v) => `Fillet R ${inches(Math.abs(v.distance))}`,
	chamfer: (v) => `Chamfer ${inches(Math.abs(v.distance))}`,
	shell: (v) => `Shell ${inches(Math.abs(v.distance))}`,
	move,
	rotate: (v) => `Rotate ${degrees(v.angle)}${v.handle?.label ? ` ${v.handle.label}` : ''}${v.snapped ? ` to ${v.snapped.to}` : ''}`,
	scale: (v) => `Scale ${formatDimension(1 + v.distance, 'factor')}`,
	'linear-pattern': (v) => `${formatDimension(v.count, 'count')} × ${inches(v.distance)}`,
	'circular-pattern': (v) => `${formatDimension(v.count, 'count')} × ${degrees(360 / v.count)}`,
	measure: (v, ctx) => bySelection(v, ctx),
	hole: (v, ctx) => bySelection(v, ctx),
	mate: (v, ctx) => bySelection(v, ctx),
	reference: (v, ctx) => bySelection(v, ctx),
	/* Selection-only tools: a press selects and the panel builds the feature, so a drag under them reads as what was grabbed. */
	draft: (v, ctx) => bySelection(v, ctx),
	sweep: (v, ctx) => bySelection(v, ctx),
	loft: (v, ctx) => bySelection(v, ctx)
};
/** What a drag is worth right now, for the tool that started it and the thing it started on. */
export function dragReadout(tool: Tool, value: DragValue, context: DragContext = {}): string {
	return (DRAG[tool] ?? DRAG.select)(value, context);
}

/** The unit a typed override is parsed in for this tool: degrees for a turn, a count for a pattern, a ratio for a scale, inches otherwise. */
export function numericUnit(tool: Tool): DimensionUnit {
	if (tool === 'revolve' || tool === 'rotate') return 'deg';
	if (tool === 'linear-pattern' || tool === 'circular-pattern') return 'count';
	if (tool === 'scale') return 'factor';
	return 'in';
}
const PROMPTS: Partial<Record<Tool, string>> = { extrude: 'Extrude distance (in)', revolve: 'Revolve angle (deg)', fillet: 'Fillet radius (in)', chamfer: 'Chamfer distance (in)', shell: 'Shell thickness (in)', move: 'Move distance (in)', rotate: 'Rotate angle (deg)', scale: 'Scale factor', 'linear-pattern': 'Copies', 'circular-pattern': 'Copies' };
/** The label on the number entry a digit opens: what is being typed and in what unit. */
export function numericPrompt(tool: Tool): string { const p = PROMPTS[tool] ?? 'Exact value (in)'; return readoutSettings.unit === 'mm' ? p.replace('(in)', '(mm)') : p; }
/**
 * What a typed length means in the student's display unit: a bare number in
 * millimeters mode is millimeters, so `25` becomes `25mm` before it is parsed.
 * A number that already names its unit, and every angle, count and ratio,
 * passes through untouched.
 */
export function withDisplayUnit(text: string, unit: DimensionUnit): string {
	if (unit !== 'in' || readoutSettings.unit !== 'mm') return text;
	const t = text.trim();
	return /^[-+]?(\d+(\.\d*)?|\.\d+)(\s+\d+\/\d+)?$|^[-+]?\d+\/\d+$/.test(t) ? `${t}mm` : text;
}

/**
 * What a drawing in progress is worth. `du`/`dv` are the plane offsets from
 * the drawing's first point and `segment` the length from its last point; the
 * optional fields say more when the drawing tool passes them -- the segment's
 * own plane offsets (`su`, `sv`) give a line its angle, `sides` the polygon
 * its count, `radius` an arc its radius once the start is placed and `sweep`
 * its angle once the end is being chosen.
 */
export interface DrawingInput { tool: string; du: number; dv: number; segment: number; su?: number; sv?: number; sides?: number; radius?: number; sweep?: number }
export function drawingReadout(input: DrawingInput): string {
	const { tool, du, dv, segment } = input;
	if (tool === 'circle') return `⌀ ${inches(2 * Math.hypot(du, dv))}`;
	if (tool === 'rectangle') return readoutSettings.unit === 'mm' ? `${(Math.abs(du) * MM_PER_INCH).toFixed(2)} × ${(Math.abs(dv) * MM_PER_INCH).toFixed(2)} mm` : `${Math.abs(du).toFixed(3)} × ${Math.abs(dv).toFixed(3)} in`;
	if (tool === 'polygon') return `R ${inches(Math.hypot(du, dv))} · ${input.sides ?? 6} sides`;
	if (tool === 'arc') {
		const radius = input.radius ?? segment;
		return input.sweep !== undefined ? `R ${inches(radius)} · ${degrees(input.sweep)}` : `R ${inches(radius)}`;
	}
	if (input.su !== undefined && input.sv !== undefined && (input.su !== 0 || input.sv !== 0)) {
		const angle = ((Math.atan2(input.sv, input.su) * 180) / Math.PI + 360) % 360;
		return `${inches(segment)} at ${degrees(angle)}`;
	}
	return inches(segment);
}

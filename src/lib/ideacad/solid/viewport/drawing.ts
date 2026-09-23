/**
 * THE DRAWING TOOLS' STATE MACHINE: what a press, a move, a release and a key
 * mean while a rectangle, circle, polygon, line chain or arc is being drawn
 * on a plane WITH NO SKETCH OPEN. The viewport owns pointer capture,
 * raycasting and the guide group; this owns the drawing itself and hands the
 * finished ENTITY COLLECTION back through `host.draft`, which the workspace
 * turns into a sketch feature on the plane it was drawn on.
 *
 * THIS MODULE IS THE SKETCHING SURFACE'S. The entities it emits are the same
 * drafts `sketch/editor.ts` builds inside an open sketch (a rectangle carries
 * its horizontal/vertical constraints, an arc its chord so the first drawing
 * closes), so a shape drawn here and one drawn while editing are one shape.
 * The v1 `Sketch` profile is no longer emitted: `host.finish` stays in the
 * contract only because the viewport still names it, and a host without
 * `draft` is told so rather than handed a profile nothing converts any more.
 *
 * `drawingSettings` is the one module-level knob: the polygon side count the
 * sketch panel writes and both the drag-drawn polygon and the in-sketch one
 * read. Any whole number of three or more; nothing is clamped above.
 */
import { dot, sub } from '../math';
import { drop, lift } from '../sketch/model';
import { arcEntities, circleEntities, polygonEntities, polylineEntities, rectangleEntities, type SketchDraft } from '../sketch/editor';
import type { PlaneRef, SketchPlane, Vec2, Vec3 } from '../types';
import { drawingReadout, readoutSettings } from './readout';
import { hasTyped, startTypedDraw, typeKey, typedPoint, typedReadout, typesIntoField, type TypedDraw } from '../dimensions/typed-draw';

export type DrawTool = 'rectangle' | 'circle' | 'line' | 'polygon' | 'arc';
export const DRAW_TOOLS: readonly DrawTool[] = ['rectangle', 'circle', 'line', 'polygon', 'arc'];
export const isDrawTool = (tool: string): tool is DrawTool => (DRAW_TOOLS as readonly string[]).includes(tool);
/** The plane a drawing tool draws on, and how the document will name it. */
export interface DrawPlane { plane: SketchPlane; ref: PlaneRef }
/** Settings the sketch panel writes and every polygon reads. */
export const drawingSettings: { polygonSides: number } = { polygonSides: 6 };
/** Whether a side count can make a polygon: a whole number, three or more. Nothing above is refused. */
export const polygonSidesOk = (sides: number) => Number.isInteger(sides) && sides >= 3;
export const POLYGON_SIDES_REFUSAL = 'A polygon needs a whole number of sides, at least 3.';

export interface DrawingHost {
	/** The world point under a pointer event on `plane`, or null when the ray misses it. */
	planeHit(e: { clientX: number; clientY: number }, plane: SketchPlane): Vec3 | null;
	zoom(): number;
	/** Replace the transient guide with this polyline. */
	guide(points: Vec3[], color?: string): void;
	clearGuides(): void;
	error(message: string): void;
	/** RETIRED: the v1 profile path. Never called; kept only because the viewport's host literal still names it. */
	/** A finished entity collection, which the workspace turns into a sketch feature. */
	draft?(draft: SketchDraft, ref: PlaneRef): void;
	capture(e: PointerEvent): void;
	pointer(): { x: number; y: number };
}

/** What a rectangle with no width or no height is told. */
export const FLAT_RECTANGLE_REFUSAL = 'That rectangle has no width or no height. Drag across the plane from corner to corner, or turn the view to face it.';
/** `typed` holds the sizes typed while this shape is drawn (friction F007): a rectangle's width and height, a circle's diameter, a polygon's radius, a line segment's length and angle. */
interface Drawing { tool: DrawTool; plane: SketchPlane; ref: PlaneRef; start: Vec3; current: Vec3; points: Vec3[]; typed: TypedDraw | null }
/** Tools drawn by a press and a second point: a drag, or a click, a move and a second click. */
const DRAG_TOOLS: readonly DrawTool[] = ['rectangle', 'circle', 'polygon'];

export class DrawingTool {
	private drawing: Drawing | null = null;
	constructor(private host: DrawingHost) {}
	get active() { return !!this.drawing; }
	/** The plane the current drawing is on, so a second press of a line chain lands on the same one. */
	get plane(): DrawPlane | null { return this.drawing ? { plane: this.drawing.plane, ref: this.drawing.ref } : null; }
	/** A press with a drawing tool on `drawPlane`. Returns true when the press was consumed. */
	down(e: PointerEvent, tool: DrawTool, drawPlane: DrawPlane): boolean {
		const p = this.host.planeHit(e, drawPlane.plane);
		if (!p) return false;
		/* A second press finishes a rectangle, circle or polygon begun with a click, at the typed size if one was typed: click, move, type, click, as SolidWorks draws. */
		if (this.drawing && DRAG_TOOLS.includes(this.drawing.tool) && this.drawing.tool === tool) { this.drawing.current = p; this.finishTyped(); return true; }
		if (this.drawing && (tool === 'line' || tool === 'arc')) {
			const d = this.drawing;
			if (hasTyped(d.typed)) { const typed = this.typedCurrent(); d.points.push(typed); d.current = typed; d.typed = startTypedDraw(tool); this.redraw(); return true; }
			d.points.push(p); d.current = p;
			if (tool === 'arc' && d.points.length === 3) this.finishPolyline();
			else if (d.points.length > 3 && Math.hypot(...sub(p, d.points[0])) < 0.08 / this.host.zoom()) { d.points.pop(); this.finishPolyline(); }
			else this.redraw();
			return true;
		}
		this.drawing = { tool, plane: drawPlane.plane, ref: drawPlane.ref, start: p, current: p, points: [p], typed: startTypedDraw(tool) };
		this.host.capture(e);
		return true;
	}
	move(e: PointerEvent): boolean {
		if (!this.drawing) return false;
		const p = this.host.planeHit(e, this.drawing.plane);
		if (p) { this.drawing.current = p; this.redraw(); }
		return true;
	}
	/** A release. Drag tools (rectangle, circle, polygon) finish here; line and arc chains finish on their own presses or Enter. */
	up(): boolean {
		const d = this.drawing;
		if (!d || d.tool === 'line' || d.tool === 'arc') return false;
		/* A release after a drag finishes the shape (at the typed size, if one was typed); a release where the press began keeps drawing, so the second point can be a click. */
		if (Math.hypot(...sub(d.current, d.start)) > 1e-6 || hasTyped(d.typed)) this.finishTyped();
		return true;
	}
	key(e: KeyboardEvent): boolean {
		if (this.typedKey(e)) return true;
		if (e.key === 'Enter' && this.drawing) { this.finishPolyline(); return true; }
		return false;
	}
	/**
	 * A key typed while a shape is drawn: a digit (and then a unit) into the
	 * active size, Tab to the next size, Backspace to take one off, Enter to
	 * finish at the typed size (a line places its point and keeps going).
	 * False for anything else, so Escape and a shortcut keep their meaning.
	 */
	typedKey(e: KeyboardEvent): boolean {
		const d = this.drawing; if (!d?.typed || e.ctrlKey || e.metaKey || e.altKey) return false;
		const field = d.typed.fields[d.typed.active];
		if (e.key === 'Tab' || (e.key === 'Backspace' && field.text) || typesIntoField(e.key, field.text)) { d.typed = typeKey(d.typed, e.key, e.shiftKey); this.redraw(); return true; }
		if (e.key === 'Enter' && hasTyped(d.typed)) {
			if (d.tool === 'line') { const p = this.typedCurrent(); d.points.push(p); d.current = p; d.typed = startTypedDraw('line'); this.redraw(); return true; }
			this.finishTyped(); return true;
		}
		return false;
	}
	/** The pointer with every typed size made true: the second point the shape is drawn to. */
	private typedCurrent(): Vec3 {
		const d = this.drawing!; if (!d.typed || !hasTyped(d.typed)) return d.current;
		const from = d.tool === 'line' || d.tool === 'arc' ? d.points[d.points.length - 1] : d.start;
		return lift(d.plane, typedPoint(d.typed, drop(d.plane, from), drop(d.plane, d.current), readoutSettings.unit));
	}
	/** Finish a rectangle, circle or polygon at its typed (or pointed) size. */
	private finishTyped() {
		const d = this.drawing; if (!d) return;
		d.current = this.typedCurrent();
		if (Math.hypot(...sub(d.current, d.start)) <= 1e-6) return;
		if (d.tool === 'polygon' && !polygonSidesOk(drawingSettings.polygonSides)) { this.host.error(POLYGON_SIDES_REFUSAL); return; }
		/* A rectangle dragged along a line (a plane seen edge on does this) encloses nothing: said now, rather than a sketch that cannot become a solid. */
		if (d.tool === 'rectangle') { const [du, dv] = this.offsets(d.current); if (Math.abs(du) < 1e-9 || Math.abs(dv) < 1e-9) { this.cancel(); this.host.error(FLAT_RECTANGLE_REFUSAL); return; } }
		this.emit(this.drawnDraft(), d.ref);
	}
	cancel() { this.drawing = null; this.host.clearGuides(); }
	/** The live readout of what is being drawn, in inches, at the pointer. */
	readout(): { text: string; point: { x: number; y: number } } | null {
		const d = this.drawing; if (!d) return null;
		if (d.typed && hasTyped(d.typed)) { const from = d.tool === 'line' || d.tool === 'arc' ? d.points[d.points.length - 1] : d.start; return { text: typedReadout(d.typed, drop(d.plane, from), drop(d.plane, d.current), readoutSettings.unit), point: this.host.pointer() }; }
		const [du, dv] = this.offsets(d.current), last = d.points[d.points.length - 1], [su, sv] = this.offsets(d.current, last);
		const input = { tool: d.tool, du, dv, segment: Math.hypot(...sub(d.current, last)), su, sv, sides: drawingSettings.polygonSides, ...(d.tool === 'arc' && d.points.length >= 2 ? { radius: Math.hypot(...sub(d.points[1], d.points[0])) } : {}) };
		return { text: drawingReadout(input), point: this.host.pointer() };
	}
	/** Plane offsets of a world point from the drawing's start (or from `from`). */
	private offsets(p: Vec3, from = this.drawing!.start): Vec2 { const plane = this.drawing!.plane, d = sub(p, from); return [dot(d, plane.u), dot(d, plane.v)]; }
	/** The finished shape as sketch entities in the plane's own (u, v). */
	private drawnDraft(): SketchDraft {
		const d = this.drawing!, plane = d.plane, at = (p: Vec3) => drop(plane, p), start = at(d.start), current = at(this.typedCurrent());
		if (d.tool === 'circle') return circleEntities(start, Math.hypot(current[0] - start[0], current[1] - start[1]));
		if (d.tool === 'rectangle') return rectangleEntities(start, current);
		if (d.tool === 'polygon') return polygonEntities(start, current, drawingSettings.polygonSides);
		if (d.tool === 'arc' && d.points.length >= 3) return arcEntities(at(d.points[0]), at(d.points[1]), at(d.points[2]));
		return polylineEntities(d.points.map(at));
	}
	/** The outline of the shape in progress, for the guide. */
	private outline(): Vec3[] {
		const d = this.drawing!;
		if (d.tool === 'line' || d.tool === 'arc') return [...d.points, this.typedCurrent()];
		const draft = this.drawnDraft(), up = (p: Vec2): Vec3 => lift(d.plane, p);
		const circle = draft.entities.find((e) => e.type === 'circle');
		if (circle && circle.type === 'circle') { const c = draft.entities.find((e) => e.id === circle.center); const cx = c?.type === 'point' ? c.x : 0, cy = c?.type === 'point' ? c.y : 0; return Array.from({ length: 65 }, (_, i) => up([cx + circle.radius * Math.cos(i / 64 * Math.PI * 2), cy + circle.radius * Math.sin(i / 64 * Math.PI * 2)])); }
		const corners = draft.entities.filter((e) => e.type === 'point').map((p) => up([p.x, p.y]));
		return [...corners, corners[0]];
	}
	private redraw() { this.host.guide(this.outline()); }
	private emit(draft: SketchDraft, ref: PlaneRef) {
		this.drawing = null; this.host.clearGuides();
		if (!this.host.draft) { this.host.error('This viewport cannot take a drawn shape.'); return; }
		this.host.draft(draft, ref);
	}
	private finishPolyline() {
		if (!this.drawing) return;
		if (this.drawing.points.length < 3) { this.host.error('Close a shape with three points.'); return; }
		this.emit(this.drawnDraft(), this.drawing.ref);
	}
}

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
import { drawingReadout } from './readout';

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

interface Drawing { tool: DrawTool; plane: SketchPlane; ref: PlaneRef; start: Vec3; current: Vec3; points: Vec3[] }

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
		if (this.drawing && (tool === 'line' || tool === 'arc')) {
			const d = this.drawing;
			d.points.push(p); d.current = p;
			if (tool === 'arc' && d.points.length === 3) this.finishPolyline();
			else if (d.points.length > 3 && Math.hypot(...sub(p, d.points[0])) < 0.08 / this.host.zoom()) { d.points.pop(); this.finishPolyline(); }
			else this.redraw();
			return true;
		}
		this.drawing = { tool, plane: drawPlane.plane, ref: drawPlane.ref, start: p, current: p, points: [p] };
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
		if (Math.hypot(...sub(d.current, d.start)) > 1e-6) {
			if (d.tool === 'polygon' && !polygonSidesOk(drawingSettings.polygonSides)) { this.host.error(POLYGON_SIDES_REFUSAL); return true; }
			this.emit(this.drawnDraft(), d.ref);
		}
		return true;
	}
	key(e: KeyboardEvent): boolean {
		if (e.key === 'Enter' && this.drawing) { this.finishPolyline(); return true; }
		return false;
	}
	cancel() { this.drawing = null; this.host.clearGuides(); }
	/** The live readout of what is being drawn, in inches, at the pointer. */
	readout(): { text: string; point: { x: number; y: number } } | null {
		const d = this.drawing; if (!d) return null;
		const [du, dv] = this.offsets(d.current), last = d.points[d.points.length - 1], [su, sv] = this.offsets(d.current, last);
		const input = { tool: d.tool, du, dv, segment: Math.hypot(...sub(d.current, last)), su, sv, sides: drawingSettings.polygonSides, ...(d.tool === 'arc' && d.points.length >= 2 ? { radius: Math.hypot(...sub(d.points[1], d.points[0])) } : {}) };
		return { text: drawingReadout(input), point: this.host.pointer() };
	}
	/** Plane offsets of a world point from the drawing's start (or from `from`). */
	private offsets(p: Vec3, from = this.drawing!.start): Vec2 { const plane = this.drawing!.plane, d = sub(p, from); return [dot(d, plane.u), dot(d, plane.v)]; }
	/** The finished shape as sketch entities in the plane's own (u, v). */
	private drawnDraft(): SketchDraft {
		const d = this.drawing!, plane = d.plane, at = (p: Vec3) => drop(plane, p), start = at(d.start), current = at(d.current);
		if (d.tool === 'circle') return circleEntities(start, Math.hypot(current[0] - start[0], current[1] - start[1]));
		if (d.tool === 'rectangle') return rectangleEntities(start, current);
		if (d.tool === 'polygon') return polygonEntities(start, current, drawingSettings.polygonSides);
		if (d.tool === 'arc' && d.points.length >= 3) return arcEntities(at(d.points[0]), at(d.points[1]), at(d.points[2]));
		return polylineEntities(d.points.map(at));
	}
	/** The outline of the shape in progress, for the guide. */
	private outline(): Vec3[] {
		const d = this.drawing!;
		if (d.tool === 'line' || d.tool === 'arc') return [...d.points, d.current];
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

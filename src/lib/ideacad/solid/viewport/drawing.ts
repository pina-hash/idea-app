/**
 * THE DRAWING TOOLS' STATE MACHINE: what a press, a move, a release and a key
 * mean while a rectangle, circle, polygon, line chain or arc is being drawn
 * on a plane. The viewport owns pointer capture, raycasting and the guide
 * group; this owns the drawing itself and hands a finished profile back
 * through the host.
 *
 * THIS MODULE IS THE SKETCHING SURFACE'S. It still emits the v1 `Sketch`
 * profile the reducer converts into entities (`host.finish`); the surface
 * moves it onto `host.draft`, which takes an entity collection directly, and
 * adds polygon side counts, snapping, splines and the rest. `DrawPlane` says
 * which plane is drawn on and how the document names it.
 */
import { add, dot, scale, sub } from '../math';
import type { PlaneRef, Sketch, SketchPlane, Vec3 } from '../types';
import type { SketchDraft } from '../sketch/editor';
import { drawingReadout } from './readout';

export type DrawTool = 'rectangle' | 'circle' | 'line' | 'polygon' | 'arc';
export const DRAW_TOOLS: readonly DrawTool[] = ['rectangle', 'circle', 'line', 'polygon', 'arc'];
export const isDrawTool = (tool: string): tool is DrawTool => (DRAW_TOOLS as readonly string[]).includes(tool);
/** The plane a drawing tool draws on, and how the document will name it. */
export interface DrawPlane { plane: SketchPlane; ref: PlaneRef }

export interface DrawingHost {
	/** The world point under a pointer event on `plane`, or null when the ray misses it. */
	planeHit(e: { clientX: number; clientY: number }, plane: SketchPlane): Vec3 | null;
	zoom(): number;
	/** Replace the transient guide with this polyline. */
	guide(points: Vec3[], color?: string): void;
	clearGuides(): void;
	error(message: string): void;
	/** A finished v1 profile, which the workspace turns into a sketch feature. */
	finish(sketch: Sketch, ref: PlaneRef): void;
	/** A finished entity collection. Optional until the sketching surface switches over. */
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
		if (Math.hypot(...sub(d.current, d.start)) > 1e-6) { this.host.finish(this.drawnSketch(), d.ref); this.drawing = null; this.host.clearGuides(); }
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
		const du = dot(sub(d.current, d.start), d.plane.u), dv = dot(sub(d.current, d.start), d.plane.v);
		return { text: drawingReadout({ tool: d.tool, du, dv, segment: Math.hypot(...sub(d.current, d.points[d.points.length - 1])) }), point: this.host.pointer() };
	}
	private drawnSketch(): Sketch {
		const d = this.drawing!, plane = d.plane, du = dot(sub(d.current, d.start), plane.u), dv = dot(sub(d.current, d.start), plane.v);
		const sketch: Sketch = { id: crypto.randomUUID(), name: 'Sketch', plane, profile: { type: 'polygon', points: [] } };
		if (d.tool === 'circle') sketch.profile = { type: 'circle', center: d.start, radius: Math.hypot(du, dv) };
		else if (d.tool === 'rectangle') sketch.profile = { type: 'polygon', points: [d.start, add(d.start, scale(plane.u, du)), d.current, add(d.start, scale(plane.v, dv))] };
		else if (d.tool === 'polygon') { const radius = Math.hypot(du, dv), angle = Math.atan2(dv, du); sketch.profile = { type: 'polygon', points: Array.from({ length: 6 }, (_, i) => add(d.start, add(scale(plane.u, radius * Math.cos(angle + i * Math.PI / 3)), scale(plane.v, radius * Math.sin(angle + i * Math.PI / 3))))) }; }
		else if (d.tool === 'arc' && d.points.length >= 3) { const center = d.points[0], start = d.points[1], end = d.points[2]; const r = Math.hypot(...sub(start, center)), direction = sub(end, center), length = Math.hypot(...direction); const onCircle = add(center, scale(direction, r / length)); sketch.profile = { type: 'wire', segments: [{ type: 'arc', start, end: onCircle, center }, { type: 'line', start: onCircle, end: start }] }; }
		else sketch.profile = { type: 'polygon', points: [...d.points] };
		return sketch;
	}
	private redraw() {
		const d = this.drawing!;
		let points: Vec3[];
		if (d.tool === 'line' || d.tool === 'arc') points = [...d.points, d.current];
		else {
			const s = this.drawnSketch();
			if (s.profile.type === 'polygon') points = [...s.profile.points, s.profile.points[0]];
			else if (s.profile.type === 'circle') { const { center, radius } = s.profile; points = Array.from({ length: 65 }, (_, i) => add(center, add(scale(d.plane.u, radius * Math.cos(i / 64 * Math.PI * 2)), scale(d.plane.v, radius * Math.sin(i / 64 * Math.PI * 2))))); }
			else points = [...d.points, d.current];
		}
		this.host.guide(points);
	}
	private finishPolyline() {
		if (!this.drawing) return;
		if (this.drawing.points.length < 3) { this.host.error('Close a shape with three points.'); return; }
		this.host.finish(this.drawnSketch(), this.drawing.ref);
		this.drawing = null;
		this.host.clearGuides();
	}
}

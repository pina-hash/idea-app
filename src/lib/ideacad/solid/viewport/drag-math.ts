/**
 * WHAT A POINTER MOVEMENT IS WORTH, IN MODEL UNITS. Pure arithmetic over the
 * geometry the viewport hands in, so it is testable with no canvas and so the
 * part-movement surface can change what a handle means without touching the
 * pointer pipeline.
 *
 * THIS MODULE IS THE PART-MOVEMENT SURFACE'S. Snapping to reference geometry
 * and to other bodies, the fine-control modifier, plane handles (`plane`) and
 * screen-space rotation rings (`ring`) are all decided here; the viewport
 * only supplies the projection helpers below.
 */
import type { Vec3 } from '../types';
import type { TriadHandle } from './triad';
import type { DragValue } from '../viewport';

export interface DragInput {
	/** The world point the drag started on and the axis it runs along. */
	start: Vec3;
	axis: Vec3;
	handle?: TriadHandle | null;
	/** The pointer at press and now, in client pixels. */
	origin: { x: number; y: number };
	pointer: { x: number; y: number };
	/** The pointer now, relative to the canvas, for the readout position. */
	offset: { x: number; y: number };
	canvas: { width: number; height: number };
	zoom: number;
	/** Client-pixel position of a world point. */
	toScreen: (p: Vec3) => { x: number; y: number };
	/** The world point under a client position on the view plane through `through`. */
	viewPlanePoint: (client: { x: number; y: number }, through: Vec3) => Vec3 | null;
	/** Held modifiers, for fine control and snapping decisions. */
	modifiers?: { shift?: boolean; ctrl?: boolean; alt?: boolean };
}

/** The drag's value: distance along the axis (screen-projected), the free delta in the view plane, an angle and a count from vertical travel. */
export function dragValue(input: DragInput): DragValue {
	const a = input.toScreen(input.start), b = input.toScreen([input.start[0] + input.axis[0], input.start[1] + input.axis[1], input.start[2] + input.axis[2]]);
	const vx = b.x - a.x, vy = b.y - a.y, l = vx * vx + vy * vy;
	const dx = input.pointer.x - input.origin.x, dy = input.pointer.y - input.origin.y;
	const startPoint = input.viewPlanePoint(input.origin, input.start), endPoint = input.viewPlanePoint(input.pointer, input.start);
	const distance = l > 4 ? (dx * vx + dy * vy) / l : (-dy * 6) / input.canvas.height / input.zoom;
	const delta: Vec3 = startPoint && endPoint ? [endPoint[0] - startPoint[0], endPoint[1] - startPoint[1], endPoint[2] - startPoint[2]] : [0, 0, 0];
	return {
		distance,
		delta,
		angle: (-dy / input.canvas.height) * 360,
		count: Math.max(2, 2 + Math.round(-dy / 35)),
		point: input.offset,
		handle: input.handle
	};
}

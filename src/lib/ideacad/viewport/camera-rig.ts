/**
 * The rig: the one statement of how `CameraState` becomes a three.js camera.
 *
 * `controls-math.ts` is pure and already tested, and it is the authority on
 * every value in `CameraState`. What it does NOT say is how those values sit
 * in a scene, and that mapping is not free to choose -- `zoomOrthoAboutCursor`
 * asserts a specific invariant, and a rig that reads `rotationCenter`
 * differently breaks it silently. Its own test pins:
 *
 *     (cursorX - width / 2) / orthoZoom + rotationCenter.x   is unchanged
 *
 * so `orthoZoom` is PIXELS PER WORLD UNIT and `rotationCenter.x/y` is a pan
 * offset measured along the camera's OWN right and up axes, not a world point.
 * Both facts are forced by that one equation, and both are what the functions
 * below encode. An `OrthographicCamera` whose frustum is the canvas in PIXELS
 * makes `camera.zoom` literally pixels per world unit, which is why the
 * frustum is written that way rather than in world units with a scale factor.
 *
 * `rotationCenter.z` is the pivot's distance along the view axis and is left
 * alone by every pan: a pan that moved it would change what a later rotation
 * turns about.
 */
import { type CameraState, type Quaternion, type Vec3, STANDARD_VIEWS } from './controls-math';

/** Rotate a vector by a quaternion. The one implementation; `three` is not imported here. */
export function applyQuaternion(v: Vec3, q: Quaternion): Vec3 {
	const ix = q.w * v.x + q.y * v.z - q.z * v.y;
	const iy = q.w * v.y + q.z * v.x - q.x * v.z;
	const iz = q.w * v.z + q.x * v.y - q.y * v.x;
	const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
	return {
		x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
		y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
		z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x
	};
}

/** The camera's own axes, in world space, for a given orientation. */
export function cameraBasis(q: Quaternion) {
	return {
		right: applyQuaternion({ x: 1, y: 0, z: 0 }, q),
		up: applyQuaternion({ x: 0, y: 1, z: 0 }, q),
		/** Toward the viewer. A camera looks down its own -Z, as three.js does. */
		forward: applyQuaternion({ x: 0, y: 0, z: 1 }, q)
	};
}

/**
 * Where the camera sits. The pivot is the model anchor; the pan offset is
 * applied along the camera's own right and up, and the camera then backs off
 * along its view axis by `rotationCenter.z + distance` so the pivot stays in
 * front of it at every orientation.
 */
export function cameraPosition(state: CameraState, anchor: Vec3): Vec3 {
	const b = cameraBasis(state.quaternion);
	const out = state.rotationCenter.z + state.distance;
	return {
		x: anchor.x + b.right.x * state.rotationCenter.x + b.up.x * state.rotationCenter.y + b.forward.x * out,
		y: anchor.y + b.right.y * state.rotationCenter.x + b.up.y * state.rotationCenter.y + b.forward.y * out,
		z: anchor.z + b.right.z * state.rotationCenter.x + b.up.z * state.rotationCenter.y + b.forward.z * out
	};
}

/**
 * The world point under a canvas pixel, on the plane through the anchor.
 *
 * This is `zoomOrthoAboutCursor`'s invariant written out in world space, and
 * it is what a browser probe can assert against the REAL camera: pick a pixel,
 * read the point, wheel-zoom, read it again. Anything but equality means the
 * rig and the math module have stopped agreeing.
 */
export function worldUnderCursor(
	state: CameraState,
	anchor: Vec3,
	cursor: { x: number; y: number },
	viewport: { width: number; height: number }
): Vec3 {
	const b = cameraBasis(state.quaternion);
	const u = (cursor.x - viewport.width / 2) / state.orthoZoom + state.rotationCenter.x;
	const v = (viewport.height / 2 - cursor.y) / state.orthoZoom + state.rotationCenter.y;
	return {
		x: anchor.x + b.right.x * u + b.up.x * v,
		y: anchor.y + b.right.y * u + b.up.y * v,
		z: anchor.z + b.right.z * u + b.up.z * v
	};
}

/**
 * A pan in pixels. Dragging right moves the MODEL right, so the camera moves
 * left, which is a decrease in the offset -- SolidWorks' direction, and the
 * opposite of dragging the camera around.
 */
export function panByPixels(state: CameraState, dx: number, dy: number): CameraState {
	return {
		...state,
		rotationCenter: {
			...state.rotationCenter,
			x: state.rotationCenter.x - dx / state.orthoZoom,
			y: state.rotationCenter.y + dy / state.orthoZoom
		}
	};
}

/**
 * Zoom to fit: the zoom at which a sphere of `radius` about the anchor fills
 * the smaller dimension with a margin, and the pan cleared so the model is
 * centred. `FIT_MARGIN` is the fraction of the pane left as air; 0.86 is the
 * fraction USED, so a fitted model does not touch the toolbar or the triad.
 */
export const FIT_FILL = 0.86;
export function fitZoom(radius: number, viewport: { width: number; height: number }): number {
	const smallest = Math.max(1, Math.min(viewport.width, viewport.height));
	return (smallest * FIT_FILL) / Math.max(radius * 2, 1e-6);
}
export function fitted(state: CameraState, radius: number, viewport: { width: number; height: number }): CameraState {
	return {
		...state,
		orthoZoom: fitZoom(radius, viewport),
		rotationCenter: { x: 0, y: 0, z: state.rotationCenter.z }
	};
}

/**
 * The name under the triad. Read from the quaternion rather than remembered
 * from the last button pressed: a state remembered says "Front" after a drag
 * off Front, which is the readout lying about where the camera is.
 */
export function viewName(q: Quaternion, tolerance = 1e-3): string {
	for (const [name, target] of Object.entries(STANDARD_VIEWS)) {
		/* |dot| because q and -q are the same orientation. */
		const dot = Math.abs(q.x * target.x + q.y * target.y + q.z * target.z + q.w * target.w);
		if (1 - dot <= tolerance) return name;
	}
	return 'Custom';
}

/** Wheel notches to a zoom factor. One notch in is `step`; out is its reciprocal. */
export function wheelFactor(deltaY: number, step = 1.25, reversed = false): number {
	const inward = reversed ? deltaY > 0 : deltaY < 0;
	return inward ? step : 1 / step;
}

/**
 * What a caller may ask a LIVE viewport. Every answer comes off the real
 * camera and the real canvas rather than off the state a caller already holds,
 * so a rig that stopped agreeing with `controls-math.ts` is measurable from
 * outside instead of rendering plausibly and wrongly.
 */
export interface ViewportProbe {
	box(): { width: number; height: number };
	canvas(): { width: number; height: number };
	state(): CameraState;
	/** The model's extent on screen, in canvas pixels, from the real vertices
	 *  through the real camera -- see `Viewport.svelte` for why this cannot be
	 *  derived from `radius` and `orthoZoom`. */
	projected(): { x: number; y: number; width: number; height: number };
	radius(): number;
	anchor(): Vec3;
	under(x: number, y: number): Vec3;
	drawCalls(): number;
	triangles(): number;
}

/**
 * The half-turn that points the rotation arrow the right way.
 *
 * `docs/prompts/0145-ideacad.md` line 356 defines the field as
 * `rotation: 'cw' | 'ccw'  // viewed from above`, and that qualifier is the
 * whole of the decision. The arrow's arc is built running +X toward +Z; the
 * Top view looks DOWN the +Y axis with screen-up at -Z, so +Z paints downward
 * and that sweep reads right-then-bottom-then-left, which is CLOCKWISE on
 * screen. So `cw` needs no turn and `ccw` needs half of one.
 *
 * A HALF TURN AND NEVER A NEGATIVE SCALE: mirroring reverses the winding of
 * every face with it, and the arrow would start culling itself for exactly one
 * of the two documents -- visible only to whoever happened to open a `ccw`
 * blade.
 *
 * Shipped inverted, and it took the Top view plus that line of the spec to
 * see: a `cw` document drew a counter-clockwise arrow, which is the readout
 * telling a student the opposite of what their own document says.
 */
export function spinArrowTurn(rotation: 'cw' | 'ccw'): number {
	return rotation === 'cw' ? 0 : Math.PI;
}

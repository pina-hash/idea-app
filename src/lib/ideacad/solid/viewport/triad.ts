/**
 * THE MOVE TRIAD: axis arrows, plane handles, rotation rings and the free-drag
 * centre a body is moved with. `SolidViewport` calls `buildTriad` to draw it
 * and `triadHandle` to interpret a press on it; everything about how it looks
 * and what a handle means lives here, and what a handle is WORTH lives in
 * `drag-math.ts`.
 *
 * WHAT IS DRAWN, PER TOOL. Move: three arrows (X red, Y green, Z blue, each
 * with its letter drawn as a sprite so the word is there), three plane
 * handles (a square between each pair of arrows, coloured by the third axis,
 * which is the plane's normal), three rotation rings (a circle about each
 * axis) and a centre sphere for a free drag. Rotate: the three rings and the
 * letters. Scale: the three arrows and the letters.
 *
 * EVERY SIZE IS A FRACTION OF `scale`, which the viewport passes as
 * `1 / camera.zoom`: one unit of scale is the frustum's own unit, so the
 * triad is the same size on screen whatever the zoom (at a 816px-high canvas
 * one unit is 136px).
 *
 * HIT TESTING IS DONE BY INVISIBLE, FATTER TWINS. A thin shaft or a thin ring
 * is a target a finger cannot land on, and the raycaster does not read
 * `visible`, so every handle has a fat mesh that is never rendered
 * (`userData.hit`) while its visible geometry is taken OUT of the pick path
 * (`raycast` replaced by a no-op). A ring's twin is a flat band in its own
 * plane, so an edge-on ring offers no area and cannot steal the press meant
 * for the arrow it lines up with. The viewport already raycasts the triad
 * group before the model and reads `userData.handle` off whatever it hit.
 * The arrows' hit cylinders start `hitStart` out from the centre so the
 * centre sphere is what a press on the middle grabs.
 *
 * Every object carries `userData.selection` (the body) because the viewport's
 * `down` reads it off every hit, and `userData.handle.center`, which is what a
 * ring's angle is measured around.
 */
import * as THREE from 'three';
import type { Selection, Vec3 } from '../types';
import { canvasLabel, type LabelTexture } from './reference-layer';

/** What a press on a handle means to the gesture that follows. */
export interface TriadHandle {
	/** `axis`: move along `axis`; `plane`: move in the plane whose normal is `axis`; `ring`: rotate about `axis`; `free`: move in the view plane. */
	mode: 'axis' | 'plane' | 'ring' | 'free';
	axis: Vec3;
	/** A word for the readout: `X`, `XY`, `about Z`, `free`. */
	label: string;
	/** The triad's centre: what a ring turns about and where a free drag is judged from. */
	center?: Vec3;
}
export interface TriadOptions { tool: 'move' | 'rotate' | 'scale'; selection: Selection; center: Vec3; scale: number; label?: LabelTexture }
export const AXIS_COLOURS: Record<'x' | 'y' | 'z', string> = { x: '#ff7878', y: '#83edac', z: '#80caff' };
export const FREE_COLOUR = '#e7f6ff';
/** Every dimension as a fraction of `scale`. The tests read these; the browser drive measures their pixels. */
export const TRIAD = {
	/** Shaft length; the head adds `head` beyond it. */
	arrow: 1, shaft: 0.028, head: 0.2, headRadius: 0.075,
	/** The arrow's hit cylinder: its radius, and where it starts out from the centre. */
	hitRadius: 0.1, hitStart: 0.18,
	/** A plane handle's centre offset along each of its two axes, and its side. */
	plane: 0.36, planeSide: 0.2,
	/** A ring's radius, its drawn tube and its hit tube. */
	ring: 0.8, ringTube: 0.018, ringHit: 0.09,
	/** The centre sphere and its hit sphere. */
	centre: 0.065, centreHit: 0.14,
	/** A letter's height and its gap beyond the arrow head (or beyond the ring, for the rotate tool). */
	letter: 0.15, letterGap: 0.16
} as const;
const AXES: { axis: Vec3; key: 'x' | 'y' | 'z'; letter: 'X' | 'Y' | 'Z' }[] = [
	{ axis: [1, 0, 0], key: 'x', letter: 'X' }, { axis: [0, 1, 0], key: 'y', letter: 'Y' }, { axis: [0, 0, 1], key: 'z', letter: 'Z' }
];
/** Visible geometry is taken out of the pick path; the fat invisible twin answers instead. */
export const NO_RAYCAST: THREE.Object3D['raycast'] = () => {};
const Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0);
/** The letter textures are made once per factory and reused across every rebuild (the triad is rebuilt on every wheel event). */
const letterCache = new WeakMap<LabelTexture, Map<string, ReturnType<LabelTexture>>>();
function letterTexture(make: LabelTexture, text: string) {
	let cache = letterCache.get(make);
	if (!cache) { cache = new Map(); letterCache.set(make, cache); }
	if (!cache.has(text)) cache.set(text, make(text));
	return cache.get(text) ?? null;
}

/** Draw the triad into `group` (already emptied). Every object carries `userData.handle` for `hit`. */
export function buildTriad(group: THREE.Group, options: TriadOptions) {
	const s = options.scale, center = new THREE.Vector3(...options.center), tool = options.tool, make = options.label ?? canvasLabel;
	const material = (color: string, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
	const tag = (object: THREE.Object3D, handle: TriadHandle, hit: boolean) => {
		object.userData = { selection: options.selection, handle, axis: handle.axis, ...(hit ? { hit: true } : {}) };
		if (hit) object.visible = false; else { object.raycast = NO_RAYCAST; object.renderOrder = 20; }
		group.add(object);
		return object;
	};
	const along = (axis: Vec3, distance: number) => center.clone().addScaledVector(new THREE.Vector3(...axis), distance);
	const orient = (object: THREE.Object3D, from: THREE.Vector3, axis: Vec3) => object.quaternion.setFromUnitVectors(from, new THREE.Vector3(...axis));
	const handleOf = (mode: TriadHandle['mode'], axis: Vec3, label: string): TriadHandle => ({ mode, axis, label, center: options.center });
	const arrows = tool !== 'rotate', rings = tool !== 'scale', planes = tool === 'move', free = tool === 'move';
	for (const { axis, key, letter } of AXES) {
		const color = AXIS_COLOURS[key];
		if (arrows) {
			const handle = handleOf('axis', axis, letter);
			const shaft = new THREE.Mesh(new THREE.CylinderGeometry(TRIAD.shaft * s, TRIAD.shaft * s, TRIAD.arrow * s, 12), material(color));
			orient(shaft, Y, axis); shaft.position.copy(along(axis, (TRIAD.arrow * s) / 2)); tag(shaft, handle, false);
			const head = new THREE.Mesh(new THREE.ConeGeometry(TRIAD.headRadius * s, TRIAD.head * s, 16), material(color));
			orient(head, Y, axis); head.position.copy(along(axis, TRIAD.arrow * s + (TRIAD.head * s) / 2)); tag(head, handle, false);
			const reach = (TRIAD.arrow + TRIAD.head - TRIAD.hitStart) * s;
			const hit = new THREE.Mesh(new THREE.CylinderGeometry(TRIAD.hitRadius * s, TRIAD.hitRadius * s, reach, 8), material(color));
			orient(hit, Y, axis); hit.position.copy(along(axis, TRIAD.hitStart * s + reach / 2)); tag(hit, handle, true);
		}
		if (rings) {
			const handle = handleOf('ring', axis, `about ${letter}`);
			const ring = new THREE.Mesh(new THREE.TorusGeometry(TRIAD.ring * s, TRIAD.ringTube * s, 8, 72), material(color, 0.9));
			orient(ring, Z, axis); ring.position.copy(center); tag(ring, handle, false);
			/* The hit target is a FLAT annulus in the ring's plane, not a fat torus: seen edge-on a ring cannot be dragged, and a torus's tube would then sit over whichever arrow the edge-on ring lines up with (from the top view, the ring about Y over the X arrow) and take its press. A flat band has no area edge-on and the arrow answers. */
			const hit = new THREE.Mesh(new THREE.RingGeometry((TRIAD.ring - TRIAD.ringHit) * s, (TRIAD.ring + TRIAD.ringHit) * s, 48, 1), material(color));
			orient(hit, Z, axis); hit.position.copy(center); tag(hit, handle, true);
		}
		/* The letter: beyond the arrow head, or beyond the ring when there is no arrow. It is a handle too, so a press on the word grabs the axis (or its ring). */
		const made = letterTexture(make, letter);
		if (made) {
			const handle = arrows ? handleOf('axis', axis, letter) : handleOf('ring', axis, `about ${letter}`);
			const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: made.texture, color, transparent: true, depthTest: false, depthWrite: false }));
			sprite.position.copy(along(axis, (arrows ? TRIAD.arrow + TRIAD.head : TRIAD.ring) * s + TRIAD.letterGap * s));
			sprite.scale.set(TRIAD.letter * s * made.aspect, TRIAD.letter * s, 1);
			sprite.center.set(0.5, 0.5);
			sprite.userData = { selection: options.selection, handle, axis, label: letter };
			sprite.renderOrder = 21;
			group.add(sprite);
		}
	}
	if (planes) {
		for (const [a, b, n] of [[AXES[0], AXES[1], AXES[2]], [AXES[0], AXES[2], AXES[1]], [AXES[1], AXES[2], AXES[0]]] as const) {
			const handle = handleOf('plane', n.axis, `${a.letter}${b.letter}`), color = AXIS_COLOURS[n.key];
			const at = center.clone().addScaledVector(new THREE.Vector3(...a.axis), TRIAD.plane * s).addScaledVector(new THREE.Vector3(...b.axis), TRIAD.plane * s);
			const square = new THREE.Mesh(new THREE.PlaneGeometry(TRIAD.planeSide * s, TRIAD.planeSide * s), material(color, 0.38));
			orient(square, Z, n.axis); square.position.copy(at);
			/* The square is both the picture and the target: it is already as wide as a fingertip. */
			square.userData = { selection: options.selection, handle, axis: handle.axis, hit: true };
			square.renderOrder = 20; group.add(square);
			const outline = new THREE.LineSegments(new THREE.EdgesGeometry(square.geometry), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false }));
			outline.quaternion.copy(square.quaternion); outline.position.copy(at); tag(outline, handle, false);
		}
	}
	if (free) {
		const handle = handleOf('free', [0, 0, 1], 'free');
		const ball = new THREE.Mesh(new THREE.SphereGeometry(TRIAD.centre * s, 16, 12), material(FREE_COLOUR));
		ball.position.copy(center); tag(ball, handle, false);
		const hit = new THREE.Mesh(new THREE.SphereGeometry(TRIAD.centreHit * s, 10, 8), material(FREE_COLOUR));
		hit.position.copy(center); tag(hit, handle, true);
	}
}
/** The handle under a raycast hit on the triad group, or null. */
export function triadHandle(hit: THREE.Intersection | undefined): TriadHandle | null {
	return (hit?.object.userData.handle as TriadHandle | undefined) ?? null;
}
/** The handles a built triad offers, one per distinct mode and label, for a test or a legend. */
export function triadHandles(group: THREE.Group): TriadHandle[] {
	const seen = new Map<string, TriadHandle>();
	for (const o of group.children) { const h = o.userData.handle as TriadHandle | undefined; if (h) seen.set(`${h.mode}:${h.label}`, h); }
	return [...seen.values()];
}

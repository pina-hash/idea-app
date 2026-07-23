/**
 * GREENLINE track VISUALS: the one place the drivable surface becomes geometry.
 *
 * The rig-visual.ts convention, applied to the track. `GreenlineRace.svelte`
 * built the ribbon mesh, edge lines, boundary walls and gate panes inline; the
 * piece-chain builder's 3D preview needs exactly those, and a second
 * implementation would be free to disagree with the road the game actually
 * renders and collides. So the geometry construction lives here and BOTH mount
 * it: what an author sees in the builder is by construction the surface the
 * race sweeps.
 *
 * The chain is unchanged and single: `compileSurface` -> `buildRuntime` ->
 * `leftEdge3`/`rightEdge3` -> these builders (and, in the race, the physics
 * Trimesh off the SAME two edge arrays). Nothing here recomputes a pose, a
 * sweep, an elevation or a bank; it reads the runtime the compiler produced.
 *
 * Geometry only, materials at the call site: the race dresses its ribbon in
 * worn asphalt under night lighting, the builder wants a flat readable surface,
 * and neither should have to inherit the other's look to share a shape.
 *
 * three.js is passed IN (the rig-visual.ts pattern) rather than imported, so
 * this module stays free of a static three dependency and both callers keep
 * their dynamic browser-only import.
 */

import type * as THREE_NS from 'three';
import type { GateRuntime, RibbonRuntime, TrackRuntime } from './track-runtime';
import { surfaceYAt } from './track-runtime';
import type { TrackBoundary } from './track-schema';

type ThreeModule = typeof THREE_NS;

/** Ribbon surface sits this far above the swept centerline plane, meters. */
export const RIBBON_LIFT_M = 0.03;
/** Painted edge lines sit this far above the swept edge, meters. */
export const EDGE_LINE_LIFT_M = 0.06;
/** Texture tiling distance along the centerline, meters. */
const RIBBON_TILE_M = 13.5;
/** Braking-zone wear ramp length before a gate, meters. */
const WEAR_APPROACH_M = 30;
/** Braking-zone wear ramp length past a gate (closed paths), meters. */
const WEAR_PAST_M = 9;

/**
 * The swept road surface for ONE path (the main line or a branch spur; a
 * branch is real road and gets the same treatment). Returns geometry with:
 * - `position` from the 3D sweep (`leftEdge3`/`rightEdge3` — the same arrays
 *   the physics Trimesh is built from, lifted `RIBBON_LIFT_M` so the paint
 *   never z-fights the collision surface),
 * - `uv` running with cumulative centerline distance, so a texture tiles by
 *   real meters rather than by sample count,
 * - `color` carrying the rubbered-in braking-zone darkening near gates,
 * - indices wound so the right-hand-rule normals point UP. That winding is
 *   load-bearing: the original faced DOWN, which FrontSide culling silently
 *   hid — invisible against the apron on a flat track, but a see-through hole
 *   on an elevated span.
 *
 * A closed path emits one extra duplicated ring carrying the end-of-loop u, so
 * the closing quad does not smear the texture backwards.
 */
export function buildRibbonGeometry(
	THREE: ThreeModule,
	path: RibbonRuntime,
	gates: GateRuntime[]
): THREE_NS.BufferGeometry {
	const nP = path.center.length;
	const closed = path.closed;
	const cum: number[] = [0];
	for (let i = 1; i < nP; i++)
		cum[i] =
			cum[i - 1] +
			Math.hypot(path.center[i].x - path.center[i - 1].x, path.center[i].z - path.center[i - 1].z);
	const total = closed
		? cum[nP - 1] +
			Math.hypot(path.center[0].x - path.center[nP - 1].x, path.center[0].z - path.center[nP - 1].z)
		: cum[nP - 1];
	// Only gates that actually sit on THIS path get a wear ramp on it, so a
	// branch does not inherit rubber from a gate 200 m away on the main line.
	const gateS: number[] = [];
	for (const g of gates) {
		let best = 0;
		let bd = Infinity;
		for (let i = 0; i < nP; i++) {
			const d = (path.center[i].x - g.gate.x) ** 2 + (path.center[i].z - g.gate.z) ** 2;
			if (d < bd) {
				bd = d;
				best = i;
			}
		}
		if (bd <= (path.maxHalfWidth + 12) ** 2) gateS.push(cum[best]);
	}
	const wearAt = (s: number) => {
		let w = 0;
		for (const gs of gateS) {
			const d = closed ? (((gs - s) % total) + total) % total : Math.max(0, gs - s);
			if (d < WEAR_APPROACH_M) w = Math.max(w, 1 - d / WEAR_APPROACH_M);
			else if (closed && total - d < WEAR_PAST_M)
				w = Math.max(w, (1 - (total - d) / WEAR_PAST_M) * 0.5);
		}
		return w;
	};
	const rings = closed ? nP + 1 : nP;
	const verts = new Float32Array(rings * 2 * 3);
	const uvs = new Float32Array(rings * 2 * 2);
	const cols = new Float32Array(rings * 2 * 3);
	for (let i = 0; i < rings; i++) {
		const j = i % nP;
		const s = i === nP ? total : cum[i];
		verts.set(
			[path.leftEdge3[j].x, path.leftEdge3[j].y + RIBBON_LIFT_M, path.leftEdge3[j].z],
			i * 6
		);
		verts.set(
			[path.rightEdge3[j].x, path.rightEdge3[j].y + RIBBON_LIFT_M, path.rightEdge3[j].z],
			i * 6 + 3
		);
		uvs.set([s / RIBBON_TILE_M, 0], i * 4);
		uvs.set([s / RIBBON_TILE_M, 1], i * 4 + 2);
		const tone = 1 - 0.5 * wearAt(s);
		cols.set([tone, tone, tone], i * 6);
		cols.set([tone, tone, tone], i * 6 + 3);
	}
	const idx: number[] = [];
	for (let i = 0; i < rings - 1; i++)
		idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
	geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
	geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
	geo.setIndex(idx);
	geo.computeVertexNormals();
	return geo;
}

/**
 * The two painted edge lines of a path, as point lists ready for a Line. A
 * closed path repeats its first point so the loop shuts.
 */
export function edgeLinePoints(path: RibbonRuntime): { x: number; y: number; z: number }[][] {
	return [path.leftEdge3, path.rightEdge3].map((edge) => {
		const loop = path.closed ? [...edge, edge[0]] : edge;
		return loop.map((p) => ({ x: p.x, y: p.y + EDGE_LINE_LIFT_M, z: p.z }));
	});
}

/** A boundary loop as an upright wall band from y 0 to `height`. */
export function buildBoundaryGeometry(
	THREE: ThreeModule,
	boundary: TrackBoundary,
	height = 0.9
): THREE_NS.BufferGeometry {
	const m = boundary.points.length;
	const verts = new Float32Array(m * 2 * 3);
	for (let i = 0; i < m; i++) {
		verts.set([boundary.points[i].x, 0, boundary.points[i].z], i * 6);
		verts.set([boundary.points[i].x, height, boundary.points[i].z], i * 6 + 3);
	}
	const idx: number[] = [];
	const last = boundary.closed ? m : m - 1;
	for (let i = 0; i < last; i++) {
		const j = (i + 1) % m;
		idx.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
	geo.setIndex(idx);
	return geo;
}

/**
 * A gate marker: two posts and a translucent pane across the gate line. The
 * visual sits on the LOCAL surface height (relief tracks); the crossing math
 * itself stays top-down 2D and is unaffected by height. The materials come
 * back so a caller can recolor one live (the race highlights the next
 * checkpoint this way).
 */
export function buildGatePane(
	THREE: ThreeModule,
	rt: TrackRuntime,
	g: GateRuntime,
	color: number,
	opacity: number,
	postGeo?: THREE_NS.BufferGeometry
): {
	group: THREE_NS.Group;
	mat: THREE_NS.MeshBasicMaterial;
	postMat: THREE_NS.MeshBasicMaterial;
} {
	const group = new THREE.Group();
	const gy = surfaceYAt(rt, g.gate.x, g.gate.z);
	const mat = new THREE.MeshBasicMaterial({
		color,
		transparent: true,
		opacity,
		side: THREE.DoubleSide,
		depthWrite: false
	});
	const postMat = new THREE.MeshBasicMaterial({ color });
	const posts = postGeo ?? new THREE.CylinderGeometry(0.22, 0.22, 2.6, 10);
	for (const [px, pz] of [
		[g.ax, g.az],
		[g.bx, g.bz]
	]) {
		const post = new THREE.Mesh(posts, postMat);
		post.position.set(px, gy + 1.3, pz);
		group.add(post);
	}
	const pane = new THREE.Mesh(new THREE.PlaneGeometry(g.gate.halfWidth * 2, 2.6), mat);
	pane.position.set(g.gate.x, gy + 1.3, g.gate.z);
	pane.rotation.y = Math.atan2(g.dx, g.dz);
	group.add(pane);
	return { group, mat, postMat };
}

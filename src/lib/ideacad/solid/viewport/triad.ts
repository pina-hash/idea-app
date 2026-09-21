/**
 * THE MOVE TRIAD: axis arrows, plane handles, rotation rings and the free-drag
 * centre a body is moved with. `SolidViewport` calls `build` to draw it and
 * `hit` to interpret a press on it; everything about how it looks and what a
 * handle means lives here.
 *
 * THIS MODULE IS THE PART-MOVEMENT SURFACE'S TO REPLACE. The spine version
 * draws the three axis arrows the 2026-09-15 modeler had, so nothing is lost
 * until the real triad lands; the contract below is what the viewport reads.
 */
import * as THREE from 'three';
import type { Selection, Vec3 } from '../types';

/** What a press on a handle means to the gesture that follows. */
export interface TriadHandle {
	/** `axis`: move along `axis`; `plane`: move in the plane whose normal is `axis`; `ring`: rotate about `axis`; `free`: move in the view plane. */
	mode: 'axis' | 'plane' | 'ring' | 'free';
	axis: Vec3;
	/** A word for the readout: `X`, `XY`, `about Z`, `free`. */
	label: string;
}
export interface TriadOptions { tool: 'move' | 'rotate' | 'scale'; selection: Selection; center: Vec3; scale: number }
export const AXIS_COLOURS: Record<'x' | 'y' | 'z', string> = { x: '#ff7878', y: '#83edac', z: '#80caff' };
/** Draw the triad into `group` (already emptied). Every object carries `userData.handle` for `hit`. */
export function buildTriad(group: THREE.Group, options: TriadOptions) {
	const center = new THREE.Vector3(...options.center), length = options.scale;
	const axes: [Vec3, string, string][] = [[[1, 0, 0], AXIS_COLOURS.x, 'X'], [[0, 1, 0], AXIS_COLOURS.y, 'Y'], [[0, 0, 1], AXIS_COLOURS.z, 'Z']];
	for (const [axis, color, label] of axes) {
		const arrow = new THREE.ArrowHelper(new THREE.Vector3(...axis), center, length, color, length * 0.18, length * 0.08);
		const handle: TriadHandle = { mode: options.tool === 'rotate' ? 'ring' : 'axis', axis, label: options.tool === 'rotate' ? `about ${label}` : label };
		arrow.userData = { selection: options.selection, handle, axis };
		arrow.traverse((o) => (o.userData = { selection: options.selection, handle, axis }));
		group.add(arrow);
	}
}
/** The handle under a raycast hit on the triad group, or null. */
export function triadHandle(hit: THREE.Intersection | undefined): TriadHandle | null {
	return (hit?.object.userData.handle as TriadHandle | undefined) ?? null;
}

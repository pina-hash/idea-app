/**
 * THE ONE LINE FACTORY THE VIEWPORT LAYERS SHARE. Every layer module
 * (`sketch-layer`, `reference-layer`, `drawing`) builds its polylines through
 * this, so a change to how a guide or an entity is drawn is one edit.
 */
import * as THREE from 'three';
import type { Vec3 } from '../types';

export function polyline(points: readonly Vec3[], color: string, opacity = 1, depthTest = true): THREE.Line {
	return new THREE.Line(
		new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p))),
		new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest })
	);
}
/** Dispose an object's geometry and materials, recursively. */
export function disposeObject(object: THREE.Object3D) {
	object.traverse((child) => {
		const mesh = child as THREE.Mesh;
		mesh.geometry?.dispose();
		if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
		else mesh.material?.dispose();
	});
}

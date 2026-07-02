/**
 * Procedural machined-part geometries for the volumetric VIEWPORT background
 * (the floating hero parts) and the /dev/visuals harness (which exports one as
 * a sample STL). Pure geometry builders: `three` is browser-only and always
 * dynamically imported by callers, so the namespace and the merge util are
 * passed in rather than imported here (keeps this module SSR-safe to import).
 *
 * Each part is a union of primitive solids (no CSG: bores and keyways are
 * suggested with collars, ribs, and bosses, which read correctly at ambient
 * scale). Every geometry is centered and normalized to a bounding-sphere
 * radius of 1 so callers scale uniformly.
 */
import type * as ThreeNS from 'three';

type Three = typeof ThreeNS;
type Merge = (
	geometries: ThreeNS.BufferGeometry[],
	useGroups?: boolean
) => ThreeNS.BufferGeometry | null;

/**
 * Merge primitive solids into one geometry. Everything is de-indexed first:
 * mergeGeometries refuses mixed indexed/non-indexed inputs (ExtrudeGeometry is
 * non-indexed while Box/Cylinder/Torus are indexed).
 */
function mergeSolids(
	merge: Merge,
	parts: ThreeNS.BufferGeometry[]
): ThreeNS.BufferGeometry | null {
	const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
	const merged = merge(flat);
	flat.forEach((p) => p.dispose());
	parts.forEach((p) => p.dispose());
	return merged;
}

/** Center a merged solid and scale it to bounding-sphere radius 1. */
function normalize(geo: ThreeNS.BufferGeometry): ThreeNS.BufferGeometry {
	geo.center();
	geo.computeBoundingSphere();
	const r = geo.boundingSphere?.radius || 1;
	geo.scale(1 / r, 1 / r, 1 / r);
	geo.computeVertexNormals();
	geo.computeBoundingSphere();
	return geo;
}

/** Hex boss: hex prism, chamfer collar, round boss, counterbore ring on top. */
function hexBoss(THREE: Three, merge: Merge): ThreeNS.BufferGeometry {
	const parts: ThreeNS.BufferGeometry[] = [];
	parts.push(new THREE.CylinderGeometry(1, 1, 0.62, 6));
	const collar = new THREE.CylinderGeometry(0.6, 0.74, 0.12, 32);
	collar.translate(0, 0.37, 0);
	parts.push(collar);
	const boss = new THREE.CylinderGeometry(0.5, 0.5, 0.36, 32);
	boss.translate(0, 0.58, 0);
	parts.push(boss);
	const bore = new THREE.TorusGeometry(0.28, 0.05, 10, 36);
	bore.rotateX(Math.PI / 2);
	bore.translate(0, 0.76, 0);
	parts.push(bore);
	return normalize(mergeSolids(merge, parts) ?? new THREE.CylinderGeometry(1, 1, 0.62, 6));
}

/** Stepped flange: turned disc + steps + shaft, bolt bosses, keyway, chamfer. */
function steppedFlange(THREE: Three, merge: Merge): ThreeNS.BufferGeometry {
	const parts: ThreeNS.BufferGeometry[] = [];
	const disc = new THREE.CylinderGeometry(1.05, 1.05, 0.22, 48);
	disc.translate(0, -0.62, 0);
	parts.push(disc);
	for (let i = 0; i < 6; i++) {
		const a = (i * Math.PI * 2) / 6;
		const bolt = new THREE.CylinderGeometry(0.08, 0.08, 0.3, 16);
		bolt.translate(Math.cos(a) * 0.82, -0.62, Math.sin(a) * 0.82);
		parts.push(bolt);
	}
	const step = new THREE.CylinderGeometry(0.6, 0.6, 0.4, 40);
	step.translate(0, -0.32, 0);
	parts.push(step);
	const shaft = new THREE.CylinderGeometry(0.33, 0.33, 0.9, 32);
	shaft.translate(0, 0.3, 0);
	parts.push(shaft);
	const key = new THREE.BoxGeometry(0.1, 0.5, 0.06);
	key.translate(0, 0.42, 0.33);
	parts.push(key);
	const nose = new THREE.CylinderGeometry(0.24, 0.33, 0.14, 32);
	nose.translate(0, 0.82, 0);
	parts.push(nose);
	return normalize(mergeSolids(merge, parts) ?? new THREE.CylinderGeometry(1, 1, 0.5, 40));
}

/** L-bracket: base plate + upright + gusset rib + bolt bosses. */
function lBracket(THREE: Three, merge: Merge): ThreeNS.BufferGeometry {
	const parts: ThreeNS.BufferGeometry[] = [];
	const plate = new THREE.BoxGeometry(1.7, 0.16, 1.0);
	parts.push(plate);
	const upright = new THREE.BoxGeometry(0.16, 1.3, 1.0);
	upright.translate(-0.77, 0.65, 0);
	parts.push(upright);
	// Gusset rib: a right-triangle profile extruded thin.
	const tri = new THREE.Shape();
	tri.moveTo(0, 0);
	tri.lineTo(0.85, 0);
	tri.lineTo(0, 0.85);
	tri.closePath();
	const rib = new THREE.ExtrudeGeometry(tri, { depth: 0.08, bevelEnabled: false });
	rib.translate(-0.69, 0.08, -0.04);
	parts.push(rib);
	for (const z of [-0.32, 0.32]) {
		const boss = new THREE.CylinderGeometry(0.12, 0.12, 0.22, 20);
		boss.translate(0.42, 0.08, z);
		parts.push(boss);
		const side = new THREE.CylinderGeometry(0.12, 0.12, 0.22, 20);
		side.rotateZ(Math.PI / 2);
		side.translate(-0.77, 1.05, z);
		parts.push(side);
	}
	return normalize(mergeSolids(merge, parts) ?? new THREE.BoxGeometry(1.5, 0.2, 1));
}

/** The three hero parts, normalized to unit bounding-sphere radius. */
export function heroPartGeometries(THREE: Three, merge: Merge): ThreeNS.BufferGeometry[] {
	return [hexBoss(THREE, merge), steppedFlange(THREE, merge), lBracket(THREE, merge)];
}

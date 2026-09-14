import type { BladeConfig } from './materials';
import { featureOf, type BladeTree } from './tree';
import { appendExtrusion, appendJoined, appendRevolve, regularHexagon, rotated } from './mesh';

const IN_CM = 2.54;
const HEX_EXTENSION_MIN_IN = 0.5;

export interface RuleResult {
	id: string;
	label: string;
	value: number;
	limit: string;
	pass: boolean;
}
export interface SolidMesh {
	vertices: { x: number; y: number; z: number }[];
	faces: [number, number, number][];
	voxel?: { step: number; cells: number; repairDeltas: number[] };
}
export interface Evaluation {
	diameterIn: number;
	fullHeightIn: number;
	hexExtensionIn: number;
	massG: number;
	comHeightIn: number;
	inertiaGcm2: number;
	radiusOfGyrationCm: number;
	rules: RuleResult[];
	unverifiedStandardParts: boolean;
	geometry: {
		stations: { r: number; z: number }[];
		bladePolygon: { x: number; y: number }[];
		bladeCount: number;
		bladeZ: number;
		hexAcrossFlats: number;
		hexHeight: number;
		collar: { outerRadius: number; height: number };
		spinBolt: { present: boolean; radius: number; height: number };
		solid: SolidMesh;
	};
}

export function frustumProperties(r1: number, r2: number, h: number, density: number) {
	const volume = (Math.PI * h * (r1 * r1 + r1 * r2 + r2 * r2)) / 3;
	const mass = volume * density;
	const inertia =
		Math.abs(r2 - r1) < 1e-9
			? 0.5 * mass * r1 * r1
			: (3 / 10) * mass * (r2 ** 5 - r1 ** 5) / (r2 ** 3 - r1 ** 3);
	const centroid = (h * (r1 * r1 + 2 * r1 * r2 + 3 * r2 * r2)) / (4 * (r1 * r1 + r1 * r2 + r2 * r2));
	return { volume, mass, inertia, centroid };
}

export function polygonProperties(points: { x: number; y: number }[]) {
	let area2 = 0, ix = 0, iy = 0, cx6 = 0, cy6 = 0;
	for (let i = 0; i < points.length; i++) {
		const a = points[i], b = points[(i + 1) % points.length], c = a.x * b.y - b.x * a.y;
		area2 += c; cx6 += (a.x + b.x) * c; cy6 += (a.y + b.y) * c;
		ix += (a.y * a.y + a.y * b.y + b.y * b.y) * c;
		iy += (a.x * a.x + a.x * b.x + b.x * b.x) * c;
	}
	const sign = Math.sign(area2) || 1, area = Math.abs(area2) / 2;
	return { area, cx: cx6 / (3 * area2), cy: cy6 / (3 * area2), polar: sign * (ix + iy) / 12 };
}

export function bladePlanform(rootWidth: number, tipWidth: number, length: number, sweepDeg: number, mountRadius: number) {
	const shift = Math.tan((sweepDeg * Math.PI) / 180) * length;
	return [
		{ x: mountRadius, y: -rootWidth / 2 }, { x: mountRadius, y: rootWidth / 2 },
		{ x: mountRadius + length, y: shift + tipWidth / 2 }, { x: mountRadius + length, y: shift - tipWidth / 2 }
	];
}

const FACE_NEIGHBORS = [
	[1, 0, 0],
	[-1, 0, 0],
	[0, 1, 0],
	[0, -1, 0],
	[0, 0, 1],
	[0, 0, -1]
] as const;

function closesEdgeContact(filled: Set<string>, i: number, j: number, k: number) {
	for (let a = 0; a < FACE_NEIGHBORS.length; a++) {
		const [ax, ay, az] = FACE_NEIGHBORS[a];
		if (!filled.has(`${i + ax},${j + ay},${k + az}`)) continue;
		for (let b = a + 1; b < FACE_NEIGHBORS.length; b++) {
			const [bx, by, bz] = FACE_NEIGHBORS[b];
			if (ax * bx + ay * by + az * bz !== 0) continue;
			if (
				filled.has(`${i + bx},${j + by},${k + bz}`) &&
				!filled.has(`${i + ax + bx},${j + ay + by},${k + az + bz}`)
			) return true;
		}
	}
	return false;
}

export function repairVoxelEdgeContacts(filled: Set<string>, nx: number, ny: number, nz: number) {
	const deltas: number[] = [];
	const maxRepairPasses = Math.max(nx, ny, nz);
	let previousAdded = Number.POSITIVE_INFINITY;
	for (let pass = 0; pass < maxRepairPasses; pass++) {
		const add: string[] = [];
		for (let k=1;k<nz-1;k++) for (let j=1;j<ny-1;j++) for (let i=1;i<nx-1;i++) {
			const key=`${i},${j},${k}`; if (filled.has(key)) continue;
			if (closesEdgeContact(filled, i, j, k)) add.push(key);
		}
		if (add.length === 0) return deltas;
		if (add.length >= previousAdded) throw new Error(`Voxel edge-contact repair diverged: pass ${pass + 1} would add ${add.length} cells after ${previousAdded}.`);
		for (const key of add) filled.add(key);
		deltas.push(add.length);
		previousAdded = add.length;
	}
	throw new Error(`Voxel edge-contact repair did not converge within ${maxRepairPasses} passes.`);
}

export function evaluate(tree: BladeTree, config: BladeConfig): Evaluation {
	const body = featureOf(tree, 'revolve'), hex = featureOf(tree, 'hexBoss'), sketch = featureOf(tree, 'bladeSketch');
	const pattern = featureOf(tree, 'circularPattern'), mount = featureOf(tree, 'mount');
	const mat = config.materials.find((x) => x.id === tree.materials.body)!;
	const stock = config.stock.find((x) => x.id === tree.materials.bladeStock)!;
	let mass = 0, I = 0, mz = 0, maxR = 0;
	for (let i = 1; i < body.stations.length; i++) {
		const a = body.stations[i - 1], b = body.stations[i];
		const q = frustumProperties(a.r * IN_CM, b.r * IN_CM, (b.z - a.z) * IN_CM, mat.densityGcm3 * tree.materials.bodySolidFraction);
		mass += q.mass; I += q.inertia; mz += q.mass * (a.z * IN_CM + q.centroid); maxR = Math.max(maxR, a.r, b.r);
	}
	const side = hex.acrossFlats * IN_CM / Math.sqrt(3), area = 3 * Math.sqrt(3) * side * side / 2;
	const hmass = area * hex.height * IN_CM * mat.densityGcm3 * tree.materials.bodySolidFraction;
	const bodyTop = body.stations.at(-1)!.z;
	mass += hmass; I += (5 / 12) * hmass * side * side; mz += hmass * (bodyTop + hex.height / 2) * IN_CM;
	maxR = Math.max(maxR, hex.acrossFlats / Math.sqrt(3));
	const poly = bladePlanform(sketch.rootWidth, sketch.tipWidth, sketch.length, sketch.sweepDeg, sketch.mountRadius);
	const pp = polygonProperties(poly.map((p) => ({ x: p.x * IN_CM, y: p.y * IN_CM })));
	const bmass = stock.densityGcm3 * stock.thicknessIn * IN_CM * pp.area;
	mass += bmass * pattern.count; I += stock.densityGcm3 * stock.thicknessIn * IN_CM * pp.polar * pattern.count;
	mz += bmass * pattern.count * (mount.z + stock.thicknessIn / 2) * IN_CM;
	maxR = Math.max(maxR, ...poly.map((p) => Math.hypot(p.x, p.y)));
	for (const part of config.standardParts) { mass += part.massG; mz += part.massG * bodyTop * IN_CM / 2; }
	const collarHeight = Math.max(0.125, Math.min(0.5, bodyTop * 0.1));
	const collarOuterRadius = hex.acrossFlats / Math.sqrt(3) + 0.5;
	const collarPresent = hex.suppressed !== true;
	const spinPresent = tree.spinBolt !== false;
	const spinRadius = Math.min(0.125, body.stations[0].r), spinHeight = Math.min(0.25, bodyTop * 0.08);
	const zTop = collarPresent ? bodyTop + Math.max(hex.height, collarHeight) : bodyTop;
	const buildSolid = () => {
		const mesh: SolidMesh = { vertices: [], faces: [] };
		appendRevolve(mesh, body.stations);
		const bodyFaceCount = mesh.faces.length;
		const joinedBodyFaces = new Set<number>();
		if (collarPresent) {
			appendJoined(mesh, () => appendExtrusion(mesh, regularHexagon(hex.acrossFlats), bodyTop, bodyTop + hex.height), 192, bodyFaceCount, joinedBodyFaces);
			appendJoined(mesh, () => appendRevolve(mesh, [{ r: collarOuterRadius, z: bodyTop }, { r: collarOuterRadius, z: bodyTop + collarHeight }]), 192, bodyFaceCount, joinedBodyFaces);
		}
		if (spinPresent) appendJoined(mesh, () => appendRevolve(mesh, [{ r: spinRadius, z: body.stations[0].z - spinHeight }, { r: spinRadius, z: body.stations[0].z }]), 192, bodyFaceCount, joinedBodyFaces);
		for (let n = 0; n < pattern.count; n++) appendJoined(mesh, () => appendExtrusion(mesh, rotated(poly, 2 * Math.PI * n / pattern.count), mount.z, mount.z + stock.thicknessIn), 192, bodyFaceCount, joinedBodyFaces);
		const signedVolume6 = mesh.faces.reduce((sum, [a, b, c]) => {
			const A = mesh.vertices[a], B = mesh.vertices[b], C = mesh.vertices[c];
			return sum + A.x * (B.y * C.z - B.z * C.y) + A.y * (B.z * C.x - B.x * C.z) + A.z * (B.x * C.y - B.y * C.x);
		}, 0);
		if (signedVolume6 < 0) mesh.faces = mesh.faces.map(([a, b, c]) => [a, c, b]);
		return mesh;
	};
	const com = mass ? mz / mass : 0, diameterIn = maxR * 2, fullHeightIn = bodyTop, hexExtensionIn = hex.height;
	const forward = tree.rotation === 'cw' ? sketch.sweepDeg > 0 : sketch.sweepDeg < 0;
	const rules: RuleResult[] = [
		{ id:'diameter', label:'Diameter', value:diameterIn, limit:`≤ ${config.rules.maxDiameterIn} in`, pass:diameterIn<=config.rules.maxDiameterIn },
		{ id:'height', label:'Full height', value:fullHeightIn, limit:`${config.rules.minHeightIn}–${config.rules.maxHeightIn} in`, pass:fullHeightIn>=config.rules.minHeightIn&&fullHeightIn<=config.rules.maxHeightIn },
		{ id:'hex-extension', label:'Hex extension', value:hexExtensionIn, limit:`≥ ${HEX_EXTENSION_MIN_IN} in (no maximum)`, pass:hexExtensionIn>=HEX_EXTENSION_MIN_IN },
		{ id:'mass', label:'Mass', value:mass, limit:`≤ ${config.rules.maxMassG} g`, pass:mass<=config.rules.maxMassG },
		{ id:'engagement', label:'Engagement', value:sketch.sweepDeg, limit:'Inspector verifies visually', pass:forward }
	];
	let solid: SolidMesh | undefined;
	return { diameterIn, fullHeightIn, hexExtensionIn, massG:mass, comHeightIn:com/IN_CM, inertiaGcm2:I, radiusOfGyrationCm:mass?Math.sqrt(I/mass):0, rules, unverifiedStandardParts:config.standardParts.some((x)=>!x.verified)||config.launcher.acrossFlatsIn===null, geometry:{ stations:body.stations, bladePolygon:poly, bladeCount:pattern.count, bladeZ:mount.z, hexAcrossFlats:hex.acrossFlats, hexHeight:hex.height, collar:{outerRadius:collarPresent ? collarOuterRadius : 0,height:collarPresent ? collarHeight : 0}, spinBolt:{present:spinPresent,radius:spinRadius,height:spinHeight}, get solid() { return solid ??= buildSolid(); } } };
}

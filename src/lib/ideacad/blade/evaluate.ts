import type { BladeConfig } from './materials';
import { featureOf, type BladeTree } from './tree';

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

function insidePolygon(x: number, y: number, polygon: { x: number; y: number }[]) {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const a = polygon[i], b = polygon[j];
		if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
	}
	return inside;
}

/** A boundary mesh of the actual union, rather than intersecting feature shells. */
function unionMesh(inside: (x: number, y: number, z: number) => boolean, radius: number, zMin: number, zMax: number): SolidMesh {
	const step = Math.max((radius * 2) / 48, (zMax - zMin) / 48, 0.04);
	const nx = Math.ceil((radius * 2) / step) + 2, ny = nx, nz = Math.ceil((zMax - zMin) / step) + 2;
	const x0 = -nx * step / 2, y0 = x0, base = zMin - step;
	const filled = new Set<string>();
	for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
		if (inside(x0 + (i + 0.5) * step, y0 + (j + 0.5) * step, base + (k + 0.5) * step)) filled.add(`${i},${j},${k}`);
	}
	/* A sampled union can leave two occupied cells touching at only an edge or a
	   point. Close those zero-width contacts before skinning; they are not a
	   printable connection and their boundary is not a 2-manifold. */
	for (let pass = 0; pass < 8; pass++) {
		const add: string[] = [];
		for (let k=1;k<nz-1;k++) for (let j=1;j<ny-1;j++) for (let i=1;i<nx-1;i++) {
			const key=`${i},${j},${k}`; if (filled.has(key)) continue;
			const neighbors=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
			const occupied=neighbors.filter(([a,b,c])=>filled.has(`${i+a},${j+b},${k+c}`));
			if (occupied.length >= 2 && occupied.some((a,n)=>occupied.some((b,m)=>m>n && a[0]*b[0]+a[1]*b[1]+a[2]*b[2]===0))) add.push(key);
		}
		for (const key of add) filled.add(key);
	}
	const vertices: SolidMesh['vertices'] = [], faces: SolidMesh['faces'] = [], ids = new Map<string, number>();
	const vertex = (i: number, j: number, k: number) => {
		const key = `${i},${j},${k}`; let id = ids.get(key);
		if (id === undefined) { id = vertices.length; ids.set(key, id); vertices.push({ x: x0 + i * step, y: y0 + j * step, z: base + k * step }); }
		return id;
	};
	const sides = [
		[1,0,0, [[1,0,0],[1,1,0],[1,1,1],[1,0,1]]], [-1,0,0, [[0,0,0],[0,0,1],[0,1,1],[0,1,0]]],
		[0,1,0, [[0,1,0],[0,1,1],[1,1,1],[1,1,0]]], [0,-1,0, [[0,0,0],[1,0,0],[1,0,1],[0,0,1]]],
		[0,0,1, [[0,0,1],[1,0,1],[1,1,1],[0,1,1]]], [0,0,-1, [[0,0,0],[0,1,0],[1,1,0],[1,0,0]]]
	] as const;
	for (const key of filled) {
		const [i,j,k] = key.split(',').map(Number);
		for (const [di,dj,dk,corners] of sides) if (!filled.has(`${i+di},${j+dj},${k+dk}`)) {
			const q = corners.map(([a,b,c]) => vertex(i+a,j+b,k+c));
			faces.push([q[0],q[1],q[2]], [q[0],q[2],q[3]]);
		}
	}
	return { vertices, faces };
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
	const spinPresent = tree.spinBolt !== false;
	const spinRadius = Math.min(0.125, body.stations[0].r), spinHeight = Math.min(0.25, bodyTop * 0.08);
	const radiusAt = (z: number) => {
		for (let i = 1; i < body.stations.length; i++) { const a = body.stations[i-1], b = body.stations[i]; if (z <= b.z) return a.r + (b.r-a.r)*(z-a.z)/(b.z-a.z); }
		return 0;
	};
	const rotate = (x: number, y: number, angle: number) => ({ x: x*Math.cos(angle)+y*Math.sin(angle), y: -x*Math.sin(angle)+y*Math.cos(angle) });
	const zTop = bodyTop + hex.height + collarHeight;
	const buildSolid = () => unionMesh((x,y,z) => {
		const r = Math.hypot(x,y);
		if (z >= body.stations[0].z && z <= bodyTop && r <= radiusAt(z)) return true;
		if (z >= bodyTop && z <= bodyTop + hex.height && Math.max(Math.abs(x), Math.abs(0.5*x + Math.sqrt(3)/2*y), Math.abs(0.5*x - Math.sqrt(3)/2*y)) <= hex.acrossFlats/2) return true;
		if (z >= bodyTop + hex.height - collarHeight/2 && z <= zTop && r <= collarOuterRadius) return true;
		if (spinPresent && z >= body.stations[0].z-spinHeight && z <= body.stations[0].z && r <= spinRadius) return true;
		if (z >= mount.z && z <= mount.z + stock.thicknessIn) for (let n=0;n<pattern.count;n++) { const p=rotate(x,y,2*Math.PI*n/pattern.count); if (insidePolygon(p.x,p.y,poly)) return true; }
		return false;
	}, maxR, body.stations[0].z - (spinPresent ? spinHeight : 0), zTop);
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
	return { diameterIn, fullHeightIn, hexExtensionIn, massG:mass, comHeightIn:com/IN_CM, inertiaGcm2:I, radiusOfGyrationCm:mass?Math.sqrt(I/mass):0, rules, unverifiedStandardParts:config.standardParts.some((x)=>!x.verified)||config.launcher.acrossFlatsIn===null, geometry:{ stations:body.stations, bladePolygon:poly, bladeCount:pattern.count, bladeZ:mount.z, hexAcrossFlats:hex.acrossFlats, hexHeight:hex.height, collar:{outerRadius:collarOuterRadius,height:collarHeight}, spinBolt:{present:spinPresent,radius:spinRadius,height:spinHeight}, get solid() { return solid ??= buildSolid(); } } };
}

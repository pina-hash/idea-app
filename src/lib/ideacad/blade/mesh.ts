import type { SolidMesh } from './evaluate';

export interface Point2 { x: number; y: number }

function faceCentre(mesh: SolidMesh, face: [number, number, number]) {
	const [a, b, c] = face.map((index) => mesh.vertices[index]);
	return { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3, z: (a.z + b.z + c.z) / 3 };
}

/**
 * Join a newly appended analytic shell to the existing shell by opening the
 * nearest triangle on each and sewing the two boundary loops together. The
 * openings lie inside the authored overlap, so the seam is an internal
 * connection rather than a visible bridge or a voxel/boolean approximation.
 */
export function appendJoined(mesh: SolidMesh, append: () => void, firstBaseFace = 0, lastBaseFace = mesh.faces.length, usedBaseFaces = new Set<number>()) {
	const firstNewFace = mesh.faces.length;
	append();
	if (firstNewFace === 0) return;
	let baseIndex = firstBaseFace, newIndex = firstNewFace, nearest = Number.POSITIVE_INFINITY;
	const baseCentres = mesh.faces.slice(firstBaseFace, lastBaseFace).map((face) => faceCentre(mesh, face));
	const newCentres = mesh.faces.slice(firstNewFace).map((face) => faceCentre(mesh, face));
	for (let i = firstBaseFace; i < lastBaseFace; i++) {
		if (usedBaseFaces.has(i)) continue;
		const a = baseCentres[i - firstBaseFace];
		for (let j = firstNewFace; j < mesh.faces.length; j++) {
			const b = newCentres[j - firstNewFace];
			const distance = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
			if (distance < nearest) { nearest = distance; baseIndex = i; newIndex = j; }
		}
	}
	const base = mesh.faces[baseIndex], joined = mesh.faces[newIndex];
	usedBaseFaces.add(baseIndex);
	// Reverse the second loop so both ends inherit the winding of the faces removed.
	const [a, b, c] = base;
	const reversed = [joined[0], joined[2], joined[1]];
	let aligned = reversed;
	let alignment = Number.POSITIVE_INFINITY;
	for (let offset = 0; offset < 3; offset++) {
		const candidate = [reversed[offset], reversed[(offset + 1) % 3], reversed[(offset + 2) % 3]];
		const score = [a, b, c].reduce((sum, index, i) => {
			const p = mesh.vertices[index], q = mesh.vertices[candidate[i]];
			return sum + (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2;
		}, 0);
		if (score < alignment) { alignment = score; aligned = candidate; }
	}
	const [d, f, e] = aligned;
	mesh.faces[baseIndex] = [a, b, f];
	mesh.faces[newIndex] = [a, f, d];
	mesh.faces.push([b, c, e], [b, e, f], [c, a, d], [c, d, e]);
}

/** Append a closed polyline-of-revolution solid. Radii may be zero. */
export function appendRevolve(mesh: SolidMesh, profile: { r: number; z: number }[], segments = 96) {
	const rings: number[][] = [];
	for (const point of profile) {
		const ring: number[] = [];
		for (let n = 0; n < segments; n++) {
			const angle = 2 * Math.PI * n / segments;
			ring.push(mesh.vertices.push({ x: point.r * Math.cos(angle), y: point.r * Math.sin(angle), z: point.z }) - 1);
		}
		rings.push(ring);
	}
	for (let p = 1; p < rings.length; p++) for (let n = 0; n < segments; n++) {
		const next = (n + 1) % segments;
		mesh.faces.push([rings[p - 1][n], rings[p][n], rings[p][next]], [rings[p - 1][n], rings[p][next], rings[p - 1][next]]);
	}
	const cap = (ring: number[], z: number, top: boolean) => {
		const centre = mesh.vertices.push({ x: 0, y: 0, z }) - 1;
		for (let n = 0; n < segments; n++) {
			const next = (n + 1) % segments;
			mesh.faces.push(top ? [centre, ring[n], ring[next]] : [centre, ring[next], ring[n]]);
		}
	};
	cap(rings[0], profile[0].z, false);
	cap(rings.at(-1)!, profile.at(-1)!.z, true);
}

/** Append a closed, straight extrusion of a simple counter-clockwise polygon. */
export function appendExtrusion(mesh: SolidMesh, polygon: Point2[], z0: number, z1: number) {
	if (polygon.reduce((sum, point, i) => {
		const next = polygon[(i + 1) % polygon.length];
		return sum + point.x * next.y - next.x * point.y;
	}, 0) < 0) polygon = [...polygon].reverse();
	const bottom = polygon.map((p) => mesh.vertices.push({ ...p, z: z0 }) - 1);
	const top = polygon.map((p) => mesh.vertices.push({ ...p, z: z1 }) - 1);
	for (let i = 1; i < polygon.length - 1; i++) {
		mesh.faces.push([bottom[0], bottom[i + 1], bottom[i]], [top[0], top[i], top[i + 1]]);
	}
	for (let i = 0; i < polygon.length; i++) {
		const next = (i + 1) % polygon.length;
		mesh.faces.push([bottom[i], bottom[next], top[next]], [bottom[i], top[next], top[i]]);
	}
}

export function regularHexagon(acrossFlats: number): Point2[] {
	const radius = acrossFlats / Math.sqrt(3);
	return Array.from({ length: 6 }, (_, i) => {
		const angle = i * Math.PI / 3 + Math.PI / 6;
		return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
	});
}

export function rotated(points: Point2[], angle: number): Point2[] {
	return points.map(({ x, y }) => ({ x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) }));
}

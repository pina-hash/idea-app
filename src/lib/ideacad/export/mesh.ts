import type { Evaluation } from '../blade/evaluate';
import { evaluationGeometries } from '../geometry';

export const MILLIMETRES_PER_INCH = 25.4;

export interface Triangle {
	a: [number, number, number];
	b: [number, number, number];
	c: [number, number, number];
}

/**
 * The export triangle soup comes from the renderer's geometry factory.  Keeping
 * that call here is intentional: an export must never quietly become a second
 * implementation of the blade sketch or extrusion.
 */
export function evaluatedBladeTriangles(evaluation: Evaluation): Triangle[] {
	const geometries = evaluationGeometries(evaluation);
	try {
		const geometry = geometries.blade;
		const position = geometry.getAttribute('position');
		const index = geometry.getIndex();
		const vertex = (i: number): [number, number, number] => [
			position.getX(i) * MILLIMETRES_PER_INCH,
			position.getY(i) * MILLIMETRES_PER_INCH,
			position.getZ(i) * MILLIMETRES_PER_INCH
		];
		const triangles: Triangle[] = [];
		const count = index?.count ?? position.count;
		for (let i = 0; i < count; i += 3) {
			const at = (offset: number) => (index ? index.getX(i + offset) : i + offset);
			triangles.push({ a: vertex(at(0)), b: vertex(at(1)), c: vertex(at(2)) });
		}
		return triangles;
	} finally {
		geometries.body.dispose();
		geometries.hex.dispose();
		geometries.blade.dispose();
		geometries.edges.dispose();
	}
}

export function triangleNormal({ a, b, c }: Triangle): [number, number, number] {
	const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
	const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
	const cross: [number, number, number] = [
		ab[1] * ac[2] - ab[2] * ac[1],
		ab[2] * ac[0] - ab[0] * ac[2],
		ab[0] * ac[1] - ab[1] * ac[0]
	];
	const length = Math.hypot(...cross);
	return length === 0 ? [0, 0, 0] : cross.map((value) => value / length) as [number, number, number];
}

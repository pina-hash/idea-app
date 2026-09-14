import type { Evaluation } from '../blade/evaluate';
import { evaluatedBladeTriangles, triangleNormal } from './mesh';

/** Binary STL of the evaluated viewport blade, expressed in millimetres. */
export function exportBinaryStl(evaluation: Evaluation): Uint8Array {
	const triangles = evaluatedBladeTriangles(evaluation);
	const bytes = new Uint8Array(84 + triangles.length * 50);
	const header = new TextEncoder().encode('IdeaCAD binary STL; units=millimetres');
	bytes.set(header.subarray(0, 80));
	const view = new DataView(bytes.buffer);
	view.setUint32(80, triangles.length, true);
	triangles.forEach((triangle, triangleIndex) => {
		let offset = 84 + triangleIndex * 50;
		for (const vector of [triangleNormal(triangle), triangle.a, triangle.b, triangle.c]) {
			for (const value of vector) {
				view.setFloat32(offset, value, true);
				offset += 4;
			}
		}
		view.setUint16(offset, 0, true);
	});
	return bytes;
}

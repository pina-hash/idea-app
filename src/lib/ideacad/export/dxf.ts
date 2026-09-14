import type { Evaluation } from '../blade/evaluate';
import { MILLIMETRES_PER_INCH } from './mesh';

const pair = (code: number, value: string | number) => `${code}\n${value}\n`;

/** ASCII DXF containing one closed, true-scale blade profile in millimetres. */
export function exportBladeDxf(evaluation: Evaluation): Uint8Array {
	let dxf = pair(0, 'SECTION') + pair(2, 'HEADER');
	dxf += pair(9, '$INSUNITS') + pair(70, 4); // AutoCAD enum 4 = millimetres
	dxf += pair(0, 'ENDSEC') + pair(0, 'SECTION') + pair(2, 'ENTITIES');
	dxf += pair(0, 'LWPOLYLINE') + pair(100, 'AcDbEntity') + pair(8, 'BLADE');
	dxf += pair(100, 'AcDbPolyline') + pair(90, evaluation.geometry.bladePolygon.length) + pair(70, 1);
	for (const point of evaluation.geometry.bladePolygon) {
		dxf += pair(10, point.x * MILLIMETRES_PER_INCH) + pair(20, point.y * MILLIMETRES_PER_INCH);
	}
	dxf += pair(0, 'ENDSEC') + pair(0, 'EOF');
	return new TextEncoder().encode(dxf);
}

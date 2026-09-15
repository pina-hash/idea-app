import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/lib/ideacad/blade/evaluate';
import { DEFAULT_BLADE_CONFIG, DEFAULT_BLADE_TREE } from '../src/lib/ideacad/blade/materials';
import { exportBinaryStl, exportBladeDxf, exportManifest, exportThreeMf } from '../src/lib/ideacad/export';
import { evaluatedBladeTriangles, MILLIMETRES_PER_INCH } from '../src/lib/ideacad/export/mesh';

const evaluation = evaluate(DEFAULT_BLADE_TREE, DEFAULT_BLADE_CONFIG);
const extent = (points: number[][]) => points[0]!.map((_, axis) => ({
	min: Math.min(...points.map((point) => point[axis]!)),
	max: Math.max(...points.map((point) => point[axis]!))
}));
const key = (point: number[]) => point.map((value) => value.toFixed(5)).join(',');

describe('IdeaCAD manufacturing export round trips', () => {
	it('round-trips binary STL triangles, bounds, normals and watertight edges', () => {
		const source = evaluatedBladeTriangles(evaluation);
		const bytes = exportBinaryStl(evaluation);
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		const count = view.getUint32(80, true);
		expect(bytes.byteLength).toBe(84 + count * 50);
		expect(count).toBe(source.length);

		const points: number[][] = [];
		const edges = new Map<string, number>();
		let signedVolume6 = 0;
		for (let triangle = 0; triangle < count; triangle++) {
			const offset = 84 + triangle * 50;
			const normal = [0, 1, 2].map((axis) => view.getFloat32(offset + axis * 4, true));
			const vertices = [0, 1, 2].map((vertex) => [0, 1, 2].map((axis) => view.getFloat32(offset + 12 + vertex * 12 + axis * 4, true)));
			points.push(...vertices);
			const [a, b, c] = vertices;
			const cross = [(b![1]!-a![1]!)*(c![2]!-a![2]!)-(b![2]!-a![2]!)*(c![1]!-a![1]!), (b![2]!-a![2]!)*(c![0]!-a![0]!)-(b![0]!-a![0]!)*(c![2]!-a![2]!), (b![0]!-a![0]!)*(c![1]!-a![1]!)-(b![1]!-a![1]!)*(c![0]!-a![0]!)];
		expect(normal[0]! * cross[0]! + normal[1]! * cross[1]! + normal[2]! * cross[2]!).toBeGreaterThan(0);
			signedVolume6 += a![0]! * (b![1]! * c![2]! - b![2]! * c![1]!) + a![1]! * (b![2]! * c![0]! - b![0]! * c![2]!) + a![2]! * (b![0]! * c![1]! - b![1]! * c![0]!);
			for (const [from, to] of [[a!, b!], [b!, c!], [c!, a!]]) {
				const edge = [key(from), key(to)].sort().join('|');
				edges.set(edge, (edges.get(edge) ?? 0) + 1);
			}
		}
		expect(signedVolume6).toBeGreaterThan(0);
		expect([...edges.values()].every((uses) => uses === 2)).toBe(true);
		const sourcePoints = source.flatMap(({ a, b, c }) => [a, b, c]);
		expect(extent(points)).toEqual(extent(sourcePoints).map(({ min, max }) => ({ min: expect.closeTo(min, 4), max: expect.closeTo(max, 4) })));
	});

	it('round-trips the closed DXF polyline at true millimetre extents', () => {
		const text = new TextDecoder().decode(exportBladeDxf(evaluation));
		const lines = text.trim().split('\n');
		const pairs = Array.from({ length: lines.length / 2 }, (_, i) => [Number(lines[i * 2]), lines[i * 2 + 1]!] as const);
		const polyline = pairs.findIndex(([code, value]) => code === 0 && value === 'LWPOLYLINE');
		expect(polyline).toBeGreaterThan(-1);
		expect(pairs.slice(polyline).find(([code]) => code === 70)?.[1]).toBe('1');
		const points: number[][] = [];
		for (let i = polyline; i < pairs.length; i++) if (pairs[i]![0] === 10) points.push([Number(pairs[i]![1]), Number(pairs[i + 1]![1])]);
		expect(points).toHaveLength(evaluation.geometry.bladePolygon.length);
		const source = evaluation.geometry.bladePolygon.map(({ x, y }) => [x * MILLIMETRES_PER_INCH, y * MILLIMETRES_PER_INCH]);
		expect(extent(points)).toEqual(extent(source));
		expect(text).toContain('$INSUNITS\n70\n4\n');
	});

	it('packages a standards-shaped millimetre and colour 3MF', () => {
		const bytes = exportThreeMf(evaluation, 'Competition blade', '#123456');
		expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(0x04034b50);
		const archiveText = new TextDecoder().decode(bytes);
		expect(archiveText).toContain('<model unit="millimeter"');
		expect(archiveText).toContain('displaycolor="#123456"');
		expect(archiveText.match(/<triangle /g)).toHaveLength(evaluatedBladeTriangles(evaluation).length);
		expect(archiveText).toContain('[Content_Types].xml');
	});

	it('captures traceability fields and rule results in the manifest', () => {
		const manifest = JSON.parse(new TextDecoder().decode(exportManifest(evaluation, { partName: 'A-side blade', material: 'AR500', stockThicknessMm: 3.175 })));
		expect(manifest).toMatchObject({ partName: 'A-side blade', material: 'AR500', stockThicknessMm: 3.175, massG: null });
		expect(manifest.rules).toEqual(evaluation.rules.map(rule=>rule.id==='mass'?{...rule,value:null,pass:null}:rule));
	});
});

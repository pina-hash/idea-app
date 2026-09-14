// tests/ideacad-viewport-solid.test.ts
//
// THE RENDERER READS THE SOLID NOW, AND THIS IS THE PROOF THAT WHAT REACHES THE
// GPU IS STILL A SOLID.
//
// Ledger 0254 built `Evaluation.geometry.solid`: one watertight, outward-wound
// boundary mesh for the whole part. Nothing rendered it. `Viewport.svelte` built
// its own meshes from the convenience fields beside it, so the collar and the
// spin bolt were in the model and not on screen, and each part was an open shell
// whose inside showed wherever two of them met.
//
// `solidBuffers` is the one translation from that mesh into the buffers a
// `BufferGeometry` takes. Two things about it can be wrong in ways NOTHING ON
// SCREEN REPORTS, which is the repo's own test for whether a test is worth
// writing:
//
//  1. THE AXIS RELABEL. The kernel spins about part `z`; the scene is Y-up. The
//     obvious relabel `(x,y,z) -> (x,z,y)` is a MIRROR, and a mirrored mesh has
//     every triangle wound backwards -- so with backface culling on, the model
//     renders as its own hollow interior, and the reflex fix for that is
//     `DoubleSide`, which makes an open shell and a closed solid look identical.
//     That is precisely the dodge that let the old renderer pass review. The
//     assertion is therefore on the SIGNED VOLUME of the buffers actually
//     emitted, which is negative for a mirror and positive for a rotation, and
//     it is checked against the sign of the kernel's own mesh rather than
//     against a number typed here.
//
//  2. WATERTIGHTNESS SURVIVING THE TRANSLATION. Vertices are shared by grid key
//     in the kernel's output; an index buffer that duplicated or dropped one
//     would tear the surface open with no visual tell from most angles.
//     `openEdges` counts undirected edges not incident to exactly two faces and
//     must be zero.
//
// THE NEGATIVE CONTROLS ARE THE POINT. Every absence assertion below is paired
// with a mesh that is DELIBERATELY broken in exactly the way being ruled out --
// a mirrored solid, a punctured one -- because an emptiness check over a
// translation that returned nothing at all would pass just as quietly.
//
// The crease-threshold case is a MEASUREMENT rather than a pinned constant: the
// solid is a sampled union, so its raw faces have six axis-aligned normals and a
// raw dihedral filter is degenerate (every crease is 0 or 90 degrees). What is
// asserted is the PROPERTY that makes the smoothed filter worth having -- that
// it is not degenerate, that it strictly narrows as the threshold rises, and
// that the raw one does not.

import { describe, expect, it } from 'vitest';
import { solidBuffers, CREASE_DEGREES } from '../src/lib/ideacad/viewport/Viewport.svelte';
import { evaluate, type SolidMesh } from '../src/lib/ideacad/blade/evaluate';
import {
	DEFAULT_BLADE_CONFIG,
	DEFAULT_BLADE_TREE
} from '../src/lib/ideacad/blade/materials';
import { featureOf, type BladeTree } from '../src/lib/ideacad/blade/tree';

/** The shipped default, evaluated once: the solid costs ~0.75s to sample. */
const solid = evaluate(DEFAULT_BLADE_TREE, DEFAULT_BLADE_CONFIG).geometry.solid;

/** Signed volume straight off a `SolidMesh`, in the kernel's OWN frame. The
 *  expected sign for the translated buffers comes from this rather than from a
 *  literal, so the pair cannot agree by both being wrong. */
function kernelVolume(mesh: SolidMesh) {
	let volume = 0;
	for (const [a, b, c] of mesh.faces) {
		const A = mesh.vertices[a], B = mesh.vertices[b], C = mesh.vertices[c];
		volume +=
			(A.x * (B.y * C.z - B.z * C.y) - A.y * (B.x * C.z - B.z * C.x) + A.z * (B.x * C.y - B.y * C.x)) / 6;
	}
	return volume;
}

/** The mirror this translation must NOT be. Negating one kernel axis reverses
 *  every triangle's winding without moving a single index. */
const mirrored = (mesh: SolidMesh): SolidMesh => ({
	vertices: mesh.vertices.map((v) => ({ x: v.x, y: -v.y, z: v.z })),
	faces: mesh.faces
});

/** A hole, made the way a real one would arrive: a triangle simply missing. */
const punctured = (mesh: SolidMesh): SolidMesh => ({
	vertices: mesh.vertices,
	faces: mesh.faces.slice(1)
});

describe('solidBuffers: what actually reaches the GPU', () => {
	const buffers = solidBuffers(solid);

	it('carries every vertex and every triangle of the kernel mesh', () => {
		expect(solid.vertices.length).toBeGreaterThan(1000);
		expect(solid.faces.length).toBeGreaterThan(1000);
		expect(buffers.positions.length).toBe(solid.vertices.length * 3);
		expect(buffers.normals.length).toBe(solid.vertices.length * 3);
		expect(buffers.indices.length).toBe(solid.faces.length * 3);
		expect(buffers.triangles).toBe(solid.faces.length);
	});

	it('is closed, and a punctured mesh is not -- the positive control', () => {
		expect(buffers.openEdges).toBe(0);
		expect(solidBuffers(punctured(solid)).openEdges).toBeGreaterThan(0);
	});

	it('keeps the outward winding, and a mirrored relabel would not', () => {
		expect(kernelVolume(solid)).toBeGreaterThan(0);
		expect(buffers.signedVolume).toBeGreaterThan(0);
		/* A rotation preserves volume exactly, so the scene frame must agree with
		   the kernel frame and not merely share its sign. The tolerance is
		   RELATIVE because the buffers are `Float32Array` and the kernel works in
		   doubles: measured, the two differ by 9.5e-7 on a volume of 30.68, which
		   is 3e-8 relative and is float32 storage, not a translation error. An
		   absolute `toBeCloseTo(..., 6)` fails on exactly that and would have to
		   be loosened every time the part got bigger. */
		expect(Math.abs(buffers.signedVolume - kernelVolume(solid)) / kernelVolume(solid)).toBeLessThan(1e-6);
		expect(solidBuffers(mirrored(solid)).signedVolume).toBeLessThan(0);
	});

	it('relabels the axes as a rotation: part z becomes scene y, part y becomes scene -z', () => {
		for (let i = 0; i < solid.vertices.length; i += 997) {
			const v = solid.vertices[i];
			expect(buffers.positions[i * 3]).toBeCloseTo(v.x, 5);
			expect(buffers.positions[i * 3 + 1]).toBeCloseTo(v.z, 5);
			expect(buffers.positions[i * 3 + 2]).toBeCloseTo(-v.y, 5);
		}
	});

	it('emits unit normals, which is what smooth shading needs', () => {
		let worst = 0;
		for (let i = 0; i < buffers.normals.length; i += 3) {
			const length = Math.hypot(buffers.normals[i], buffers.normals[i + 1], buffers.normals[i + 2]);
			worst = Math.max(worst, Math.abs(length - 1));
		}
		expect(worst).toBeLessThan(1e-5);
	});

	it('draws crease segments, in pairs of endpoints', () => {
		expect(buffers.creases.length).toBeGreaterThan(0);
		expect(buffers.creases.length % 6).toBe(0);
	});
});

describe('the crease filter discriminates where a raw dihedral filter cannot', () => {
	/** The raw filter, written here rather than imported, because the claim IS
	 *  that the raw one is degenerate -- so it has to be computed independently
	 *  of the code under test for the comparison to mean anything. */
	function rawCreaseCount(mesh: SolidMesh, degrees: number) {
		const normals = mesh.faces.map(([a, b, c]) => {
			const A = mesh.vertices[a], B = mesh.vertices[b], C = mesh.vertices[c];
			const ux = B.x - A.x, uy = B.y - A.y, uz = B.z - A.z;
			const vx = C.x - A.x, vy = C.y - A.y, vz = C.z - A.z;
			const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
			const length = Math.hypot(n[0], n[1], n[2]) || 1;
			return [n[0] / length, n[1] / length, n[2] / length];
		});
		const seen = new Map<string, number[]>();
		mesh.faces.forEach(([a, b, c], f) => {
			for (const [p, q] of [[a, b], [b, c], [c, a]]) {
				const key = p < q ? `${p}_${q}` : `${q}_${p}`;
				const at = seen.get(key);
				if (at) at.push(f);
				else seen.set(key, [f]);
			}
		});
		const limit = Math.cos((degrees * Math.PI) / 180);
		let kept = 0;
		for (const faces of seen.values()) {
			if (faces.length !== 2) continue;
			const [f, g] = faces;
			const dot =
				normals[f][0] * normals[g][0] + normals[f][1] * normals[g][1] + normals[f][2] * normals[g][2];
			if (dot < limit) kept++;
		}
		return kept;
	}

	it('is degenerate over the raw faces: the same edges at every threshold', () => {
		const counts = [15, 30, 60, 89].map((d) => rawCreaseCount(solid, d));
		expect(new Set(counts).size).toBe(1);
		expect(counts[0]).toBeGreaterThan(1000);
	});

	it('narrows strictly over the smoothed normals, which is why it is usable', () => {
		const counts = [15, 20, 25, 30, 40].map((d) => solidBuffers(solid, d).creases.length / 6);
		for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThan(counts[i - 1]);
		expect(counts[0]).toBeGreaterThan(0);
	});

	it('keeps the shipped threshold far below the raw filter it replaces', () => {
		const shipped = solidBuffers(solid, CREASE_DEGREES).creases.length / 6;
		expect(shipped).toBeGreaterThan(0);
		/* The old /10 ratio measured the 48.7%-dilated solid, whose rounded cube
		 * buried real feature edges. The repaired rotor measures 736 smoothed
		 * edges against 5,444 raw staircase edges: still strongly discriminating,
		 * without making the broken shape the acceptance fixture. */
		expect(shipped).toBeLessThan(rawCreaseCount(solid, CREASE_DEGREES) / 5);
	});
});

describe('across the tree shapes the kernel supports', () => {
	/** 0254 proved the SOLID over 3-8 stations and 2-8 blades. The claim here is
	 *  narrower and is this bundle's own: whatever the kernel hands over, the
	 *  translation leaves closed and outward-wound. Four corners of that space,
	 *  because each solid costs most of a second to sample. */
	const cases: [string, (tree: BladeTree) => void][] = [
		['3 stations, 2 blades', (t) => {
			featureOf(t, 'revolve').stations = [
				{ r: 0.12, z: 0.125 }, { r: 1.5, z: 1.5 }, { r: 0.7, z: 2.95 }
			];
			featureOf(t, 'circularPattern').count = 2;
		}],
		['8 blades', (t) => { featureOf(t, 'circularPattern').count = 8; }],
		['no spin bolt', (t) => { t.spinBolt = false; }],
		['reversed sweep', (t) => { featureOf(t, 'bladeSketch').sweepDeg *= -1; }]
	];

	for (const [name, mutate] of cases) {
		it(`${name}: closed and outward-wound`, () => {
			const tree = structuredClone(DEFAULT_BLADE_TREE) as BladeTree;
			mutate(tree);
			const buffers = solidBuffers(evaluate(tree, DEFAULT_BLADE_CONFIG).geometry.solid);
			expect(buffers.openEdges).toBe(0);
			expect(buffers.signedVolume).toBeGreaterThan(0);
			expect(buffers.triangles).toBeGreaterThan(1000);
		});
	}
});

describe('the solid is read once per evaluation, not once per frame', () => {
	it('memoises, so the rebuild path can afford it and the draw path need not', () => {
		const evaluation = evaluate(DEFAULT_BLADE_TREE, DEFAULT_BLADE_CONFIG);
		const first = evaluation.geometry.solid;
		const second = evaluation.geometry.solid;
		/* Same OBJECT, not merely equal: `build()` reads `geometry.solid` and
		   `paint()`/`draw()` must not, and this is the property that makes the
		   cost of getting that wrong survivable rather than invisible. */
		expect(second).toBe(first);
	});
});

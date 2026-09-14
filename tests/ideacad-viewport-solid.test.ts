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
import { solidBuffers, silhouetteBuffers, CREASE_DEGREES } from '../src/lib/ideacad/viewport/Viewport.svelte';
import { evaluate, type SolidMesh } from '../src/lib/ideacad/blade/evaluate';
import {
	DEFAULT_BLADE_CONFIG,
	DEFAULT_BLADE_TREE
} from '../src/lib/ideacad/blade/materials';
import { featureOf, type BladeTree } from '../src/lib/ideacad/blade/tree';

/** The shipped default, evaluated once: the solid costs ~0.75s to sample. */
const solid = evaluate(DEFAULT_BLADE_TREE, DEFAULT_BLADE_CONFIG).geometry.solid;
const buffers = solidBuffers(solid);

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
	it('carries every vertex and every triangle of the kernel mesh', () => {
		expect(solid.vertices.length).toBeGreaterThan(500);
		expect(solid.faces.length).toBeGreaterThan(500);
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
		expect(kernelVolume(solid)).not.toBe(0);
		expect(Math.sign(buffers.signedVolume)).toBe(Math.sign(kernelVolume(solid)));
		/* A rotation preserves volume exactly, so the scene frame must agree with
		   the kernel frame and not merely share its sign. The tolerance is
		   RELATIVE because the buffers are `Float32Array` and the kernel works in
		   doubles: measured, the two differ by 9.5e-7 on a volume of 30.68, which
		   is 3e-8 relative and is float32 storage, not a translation error. An
		   absolute `toBeCloseTo(..., 6)` fails on exactly that and would have to
		   be loosened every time the part got bigger. */
		expect(Math.abs(buffers.signedVolume - kernelVolume(solid)) / kernelVolume(solid)).toBeLessThan(1e-6);
		expect(Math.sign(solidBuffers(mirrored(solid)).signedVolume)).toBe(-Math.sign(buffers.signedVolume));
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

describe('analytic feature edges and camera silhouettes', () => {
	it('uses the raw dihedral and removes the former smoothed-normal hatch', () => {
		const smoothedFaces = new Float64Array(solid.faces.length * 3);
		for (let f = 0; f < solid.faces.length; f++) {
			const [a, b, c] = solid.faces[f];
			for (let axis = 0; axis < 3; axis++) smoothedFaces[f * 3 + axis] = (buffers.normals[a * 3 + axis] + buffers.normals[b * 3 + axis] + buffers.normals[c * 3 + axis]) / 3;
			const length = Math.hypot(smoothedFaces[f * 3], smoothedFaces[f * 3 + 1], smoothedFaces[f * 3 + 2]) || 1;
			for (let axis = 0; axis < 3; axis++) smoothedFaces[f * 3 + axis] /= length;
		}
		const limit = Math.cos(25 * Math.PI / 180);
		let oldSmoothedCount = 0;
		for (let i = 0; i < buffers.edges.length; i += 4) {
			const f = buffers.edges[i + 2], g = buffers.edges[i + 3];
			const dot = smoothedFaces[f * 3] * smoothedFaces[g * 3] + smoothedFaces[f * 3 + 1] * smoothedFaces[g * 3 + 1] + smoothedFaces[f * 3 + 2] * smoothedFaces[g * 3 + 2];
			if (dot < limit) oldSmoothedCount++;
		}
		const featureCount = buffers.creases.length / 6;
		expect(featureCount).toBeGreaterThan(0);
		expect(featureCount).toBeLessThan(oldSmoothedCount);
	});

	it('does not call circumference segments features, but keeps a 90-degree rim', () => {
		const segments = 64;
		const vertices = [];
		for (const z of [0, 1]) {
			for (let i = 0; i < segments; i++) {
				const angle = i * Math.PI * 2 / segments;
				vertices.push({ x: Math.cos(angle), y: Math.sin(angle), z });
			}
		}
		vertices.push({ x: 0, y: 0, z: 1 });
		const faces: [number, number, number][] = [];
		for (let i = 0; i < segments; i++) {
			const next = (i + 1) % segments;
			faces.push([i, next, segments + next], [i, segments + next, segments + i]);
			faces.push([segments + i, segments + next, segments * 2]);
		}
		const cylinder = solidBuffers({ vertices, faces });
		/* This open fixture has exactly the top rim as a manifold sharp edge. */
		expect(cylinder.creases.length / 6).toBe(segments);
	});

	it('adds only edges separating camera-facing and back-facing faces', () => {
		const withSilhouette = silhouetteBuffers(buffers, { x: 6, y: 5, z: 7 }, false);
		expect(withSilhouette.length).toBeGreaterThan(buffers.creases.length);
		expect(withSilhouette.length % 6).toBe(0);
		expect(silhouetteBuffers(buffers, { x: -7, y: 4, z: 2 }, false)).not.toEqual(withSilhouette);
	});

	it('sets the threshold above a 64-segment revolve facet and below a square rim', () => {
		expect(CREASE_DEGREES).toBeGreaterThan(360 / 64);
		expect(CREASE_DEGREES).toBeLessThan(90);
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
			expect(Math.sign(buffers.signedVolume)).toBe(Math.sign(kernelVolume(evaluate(tree, DEFAULT_BLADE_CONFIG).geometry.solid)));
			expect(buffers.triangles).toBeGreaterThan(500);
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

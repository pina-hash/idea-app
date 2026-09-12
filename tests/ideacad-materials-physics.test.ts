/**
 * THE PHYSICS HAS TO MOVE WHEN THE MATERIAL DOES, AND THAT IS THE PROOF THE
 * LIBRARY IS WIRED RATHER THAN DECORATIVE.
 *
 * A control that changes a stored id while the readouts stay put is the failure
 * mode here, and it looks identical on screen to one that works: the select
 * moves, the document saves, and the mass never budges. It happens whenever the
 * config the pickers read and the config `evaluate()` reads stop being the same
 * object -- which is exactly what `bladeConfigWithMaterials` exists to prevent.
 *
 * SO THE ASSERTIONS ARE DIFFERENCES, NEVER ABSOLUTE FIGURES. A pinned number
 * here would be a value derived from the implementation under test, which
 * CLAUDE.md refuses; a rule that FLIPS between two materials at ONE geometry is
 * a statement about the engine that no arithmetic of this test produces.
 */
import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/lib/ideacad/blade/evaluate';
import {
	DEFAULT_BLADE_CONFIG,
	DEFAULT_BLADE_TREE,
	bladeConfigWithMaterials,
	type MaterialRow
} from '../src/lib/ideacad/blade/materials';
import type { BladeTree } from '../src/lib/ideacad/blade/tree';

const row = (slug: string, name: string, d: number, th: number[]): MaterialRow => ({
	id: slug,
	slug,
	owner: null,
	name,
	density_g_cm3: d,
	thicknesses_in: th,
	note: null,
	source: 'a named published source',
	source_verified: false,
	retired_at: null
});

/** 0208's seed, as the read returns it. */
const SEED: MaterialRow[] = [
	row('stainless-steel', 'Stainless steel (304)', 8.0, [0.024, 0.03, 0.048, 0.0625, 0.09, 0.125]),
	row('galvanized-steel', 'Galvanized steel', 7.85, [0.0276, 0.0336, 0.0396, 0.0516, 0.0635, 0.0785]),
	row('steel', 'Carbon or unknown steel', 7.85, [0.0625, 0.125, 0.1875, 0.25]),
	row('aluminum', '6061 aluminum', 2.7, [0.0625, 0.125, 0.1875, 0.25]),
	row('polycarbonate', 'Polycarbonate', 1.2, [0.0625, 0.093, 0.125, 0.1875, 0.25]),
	row('wood', 'Wood (Baltic birch plywood)', 0.68, [0.118, 0.236, 0.472])
];

/** ONE geometry, every time. Only the two material ids ever move. */
function readingFor(body: string, bladeStock: string) {
	const tree: BladeTree = structuredClone(DEFAULT_BLADE_TREE);
	tree.materials.body = body;
	tree.materials.bladeStock = bladeStock;
	const cfg = bladeConfigWithMaterials(DEFAULT_BLADE_CONFIG, SEED, [tree.materials]);
	const e = evaluate(tree, cfg);
	return { massG: e.massG, inertia: e.inertiaGcm2, massRule: e.rules.find((r) => r.id === 'mass')! };
}

/** The geometry is identical across every reading below. */
function geometryOf(body: string, bladeStock: string) {
	const tree: BladeTree = structuredClone(DEFAULT_BLADE_TREE);
	tree.materials.body = body;
	tree.materials.bladeStock = bladeStock;
	const cfg = bladeConfigWithMaterials(DEFAULT_BLADE_CONFIG, SEED, [tree.materials]);
	const e = evaluate(tree, cfg);
	return { d: e.diameterIn, h: e.fullHeightIn, hex: e.hexExtensionIn };
}

describe('the same blade in two materials', () => {
	const al = readingFor('aluminum', 'aluminum-0125');
	const ss = readingFor('stainless-steel', 'stainless-steel-0125');

	it('is the same geometry in both, so the difference is the material and nothing else', () => {
		expect(geometryOf('aluminum', 'aluminum-0125')).toEqual(geometryOf('stainless-steel', 'stainless-steel-0125'));
	});

	it('weighs what the density ratio says it should', () => {
		expect(ss.massG).toBeGreaterThan(al.massG);
		/* 8.00 / 2.70 is 2.96. Every part scales with its own density, so the
		   whole reading scales by that ratio -- checked as a band rather than a
		   pinned figure, because the figure would come from the code under test. */
		expect(ss.massG / al.massG).toBeGreaterThan(2.5);
		expect(ss.massG / al.massG).toBeLessThan(3.2);
	});

	it('turns a different rotational inertia with it', () => {
		expect(ss.inertia).toBeGreaterThan(al.inertia);
		expect(ss.inertia / al.inertia).toBeGreaterThan(2.5);
		expect(ss.inertia / al.inertia).toBeLessThan(3.2);
	});
});

describe('a rule check that passes in polycarbonate fails in steel at the same geometry', () => {
	const pc = readingFor('polycarbonate', 'polycarbonate-0125');
	const st = readingFor('steel', 'steel-0125');

	it('is one geometry, judged twice', () => {
		expect(geometryOf('polycarbonate', 'polycarbonate-0125')).toEqual(geometryOf('steel', 'steel-0125'));
	});

	it('passes in polycarbonate', () => {
		expect(pc.massRule.pass).toBe(true);
		expect(pc.massG).toBeLessThanOrEqual(DEFAULT_BLADE_CONFIG.rules.maxMassG);
	});

	it('fails in steel', () => {
		expect(st.massRule.pass).toBe(false);
		expect(st.massG).toBeGreaterThan(DEFAULT_BLADE_CONFIG.rules.maxMassG);
	});
});

describe('the thickness control moves the numbers on its own', () => {
	/* THE MATERIAL HELD, THE THICKNESS CHANGED. A check that only ever varied
	   the material would pass on a build where the thickness select wrote an id
	   nothing read. */
	const thin = readingFor('polycarbonate', 'steel-00625');
	const thick = readingFor('polycarbonate', 'steel-025');

	it('a thicker sheet is a heavier blade', () => {
		expect(thick.massG).toBeGreaterThan(thin.massG);
	});

	it('and carries more rotational inertia', () => {
		expect(thick.inertia).toBeGreaterThan(thin.inertia);
	});

	it('and the difference is the blades alone, which is a small share of the whole', () => {
		/* The body is unchanged, so this must NOT scale like the material check
		   above. A build where the thickness select secretly changed the body
		   material would blow straight through this bound. */
		expect(thick.massG / thin.massG).toBeLessThan(1.5);
	});
});

describe('an unresolved material is zero mass and never NaN', () => {
	it('still returns a number for every readout', () => {
		const r = readingFor('unobtanium', 'unobtanium-0125');
		expect(Number.isFinite(r.massG)).toBe(true);
		expect(Number.isFinite(r.inertia)).toBe(true);
		/* The positive control: the SAME geometry in a real material is heavier,
		   so "finite" is not being satisfied by an engine that returns 0 for
		   everything. */
		expect(r.massG).toBeLessThan(readingFor('wood', 'wood-0118').massG);
	});
});

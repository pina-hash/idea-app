// tests/ideacad-solid-appearance-materials.test.ts
//
// THE MATERIALS-AND-COLOUR SURFACE'S PURE HALF, plus one drive of the real
// reducer through the real kernel. What is pinned:
//
//   * THE DENSITY CITATION DISCIPLINE: every STOCK_MATERIALS density is null
//     or carries a MatWeb / Bambu Lab source, asked through `hasCitedDensity`,
//     the predicate `bodyMass` multiplies by. The POSITIVE CONTROLS are fake
//     rows -- a number with no source, and a number with a source elsewhere --
//     which the same predicate refuses; without them a sweep over a list
//     where every row happens to pass proves nothing about the predicate.
//   * THE FOUR CITED NUMBERS AND THEIR HOSTS, written here from the file as it
//     stood BEFORE this surface touched it (2026-09-21), so a later edit that
//     "tidies" a density reddens. The expected values do not come from the
//     module under test.
//   * EVERY MATERIAL HAS A COLOUR, `#rrggbb` lowercase, unique, and never the
//     machined-stock default -- so assigning a material is a visible change.
//   * `bodyColour` precedence in all three cases, `materialColourFor`,
//     `describeAppearance`'s sentences, `parseHexColour`, the palette's words.
//   * Through the REAL ENGINE: a colour set by `metadata` lands lowercase on the
//     projection, `bodyColour` reads it over the material's, clearing restores
//     the material's, and `fixed` lands and lifts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SolidEngine } from '../src/lib/ideacad/solid/engine';
import { STOCK_MATERIALS, approvedDensitySource, bodyMass, densitySourceName, hasCitedDensity } from '../src/lib/ideacad/solid/advisory';
import { BODY_COLOUR_PALETTE, DEFAULT_BODY_COLOUR, bodyColour, colourName, describeAppearance, materialColourFor, parseHexColour } from '../src/lib/ideacad/solid/appearance';
import type { FeatureOf } from '../src/lib/ideacad/solid/types';

const HEX = /^#[0-9a-f]{6}$/;
/** The cited rows as they stood before this surface, from the committed file and not from the module. */
const CITED_BEFORE: Record<string, { densityGcm3: number; host: 'MatWeb' }> = {
	'aluminum-6061-t6': { densityGcm3: 2.7, host: 'MatWeb' },
	'steel-1018': { densityGcm3: 7.87, host: 'MatWeb' },
	'stainless-304': { densityGcm3: 8, host: 'MatWeb' },
	'polycarbonate-et2613': { densityGcm3: 1.2, host: 'MatWeb' }
};

describe('density citation discipline', () => {
	it('every stock density is null or cited to MatWeb or Bambu Lab, and a fake uncited row fails the same predicate', () => {
		expect(STOCK_MATERIALS.length).toBeGreaterThan(0);
		let cited = 0, absent = 0;
		for (const m of STOCK_MATERIALS) {
			const ok = m.densityGcm3 === null || hasCitedDensity(m);
			expect(ok, `${m.id} carries a density with no approved source`).toBe(true);
			if (m.densityGcm3 === null) absent++; else cited++;
		}
		expect(cited).toBe(4);
		expect(absent).toBe(STOCK_MATERIALS.length - 4);
		/* Positive controls: the predicate must refuse these, or the sweep above is vacuous. */
		expect(hasCitedDensity({ densityGcm3: 2.7, source: null })).toBe(false);
		expect(hasCitedDensity({ densityGcm3: 2.7, source: 'https://en.wikipedia.org/wiki/6061_aluminium_alloy' })).toBe(false);
		expect(hasCitedDensity({ densityGcm3: NaN, source: 'https://www.matweb.com/x' })).toBe(false);
		expect(hasCitedDensity({ densityGcm3: 2.7, source: 'https://www.matweb.com/x' })).toBe(true);
		expect(hasCitedDensity({ densityGcm3: 1.24, source: 'https://bambulab.com/en/filament/pla-basic' })).toBe(true);
		expect(approvedDensitySource('not a url')).toBe(false);
	});
	it('keeps every cited number and host exactly as it was', () => {
		for (const [id, before] of Object.entries(CITED_BEFORE)) {
			const m = STOCK_MATERIALS.find((x) => x.id === id);
			expect(m, id).toBeDefined();
			expect(m!.densityGcm3).toBe(before.densityGcm3);
			expect(m!.source).not.toBeNull();
			expect(densitySourceName(m!.source!)).toBe(before.host);
		}
		expect(STOCK_MATERIALS.filter((m) => m.densityGcm3 !== null).map((m) => m.id).sort()).toEqual(Object.keys(CITED_BEFORE).sort());
		expect(densitySourceName('https://bambulab.com/en/filament/pla-basic')).toBe('Bambu Lab');
		expect(densitySourceName('https://www.matweb.com/search/datasheet.aspx?matguid=x')).toBe('MatWeb');
	});
	it('multiplies only by a cited density, and never for a printed material', () => {
		const at = (materialId: string | null) => bodyMass({ id: 'b', name: 'B', materialId, role: 'part', createdBy: 'x', volume: 1, bounds: [], centerOfMass: [0, 0, 0], inertia: [], faces: [], edges: [], vertices: [], mesh: { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() } });
		expect(at('aluminum-6061-t6').grams).toBeCloseTo(16.387064 * 2.7, 8);
		expect(at('aluminum-6061-t6').estimated).toBe(true);
		expect(at('carbon-steel').grams).toBeNull();
		expect(at('printed-pla').grams).toBeNull();
		expect(at('no-such-material').grams).toBeNull();
		expect(at(null).grams).toBeNull();
	});
});

describe('material colours', () => {
	it('every material carries a unique lowercase #rrggbb colour that is not machined stock', () => {
		const seen = new Set<string>();
		for (const m of STOCK_MATERIALS) {
			expect(m.color, m.id).toMatch(HEX);
			expect(m.color, m.id).not.toBe(DEFAULT_BODY_COLOUR);
			expect(seen.has(m.color), `${m.id} shares a colour`).toBe(false);
			seen.add(m.color);
		}
		expect(seen.size).toBe(STOCK_MATERIALS.length);
	});
	it('materialColourFor answers the row colour, and null for no material or an id no row carries', () => {
		expect(materialColourFor('aluminum-6061-t6')).toBe(STOCK_MATERIALS.find((m) => m.id === 'aluminum-6061-t6')!.color);
		expect(materialColourFor(null)).toBeNull();
		expect(materialColourFor(undefined)).toBeNull();
		expect(materialColourFor('')).toBeNull();
		expect(materialColourFor('retired-material')).toBeNull();
	});
});

describe('bodyColour precedence', () => {
	it('own colour, then material colour, then machined stock', () => {
		const alu = materialColourFor('aluminum-6061-t6')!;
		expect(bodyColour({ color: '#d24a3a', materialId: 'aluminum-6061-t6' }, alu)).toBe('#d24a3a');
		expect(bodyColour({ color: null, materialId: 'aluminum-6061-t6' }, alu)).toBe(alu);
		expect(bodyColour({ materialId: 'aluminum-6061-t6' }, alu)).toBe(alu);
		expect(bodyColour({ color: null, materialId: null }, null)).toBe(DEFAULT_BODY_COLOUR);
		expect(bodyColour({ materialId: null })).toBe(DEFAULT_BODY_COLOUR);
		/* An override with no material is still the override. */
		expect(bodyColour({ color: '#4c9ad6', materialId: null }, null)).toBe('#4c9ad6');
	});
});

describe('describeAppearance', () => {
	const alu = STOCK_MATERIALS.find((m) => m.id === 'aluminum-6061-t6')!;
	it('names the rung that applies', () => {
		expect(describeAppearance({ color: '#d24a3a', materialId: alu.id }, alu)).toBe("Drawn in the body's own colour, overriding 6061-T6/T651 aluminum");
		expect(describeAppearance({ color: null, materialId: alu.id }, alu)).toBe("Drawn in 6061-T6/T651 aluminum's colour");
		expect(describeAppearance({ color: null, materialId: null }, undefined)).toBe('No material: drawn as machined stock');
		expect(describeAppearance({ color: '#d24a3a', materialId: null }, undefined)).toBe("Drawn in the body's own colour");
		expect(describeAppearance({ color: null, materialId: 'retired-material' }, undefined)).toBe('Unknown material: drawn as machined stock');
	});
	it('the three sentences are distinct and none is a substring of another', () => {
		const s = [describeAppearance({ color: '#d24a3a', materialId: alu.id }, alu), describeAppearance({ color: null, materialId: alu.id }, alu), describeAppearance({ color: null, materialId: null }, undefined)];
		expect(new Set(s).size).toBe(3);
		for (const a of s) for (const b of s) if (a !== b) expect(a.includes(b)).toBe(false);
	});
});

describe('the palette and the hex parser', () => {
	it('every swatch has a word, a unique id and a unique lowercase hex', () => {
		expect(BODY_COLOUR_PALETTE.length).toBeGreaterThanOrEqual(6);
		expect(new Set(BODY_COLOUR_PALETTE.map((c) => c.id)).size).toBe(BODY_COLOUR_PALETTE.length);
		expect(new Set(BODY_COLOUR_PALETTE.map((c) => c.hex)).size).toBe(BODY_COLOUR_PALETTE.length);
		for (const c of BODY_COLOUR_PALETTE) { expect(c.name.trim().length).toBeGreaterThan(0); expect(c.hex).toMatch(HEX); }
	});
	it('parses the six-digit form with or without #, the three-digit shorthand, and refuses everything else', () => {
		expect(parseHexColour('#FF8800')).toBe('#ff8800');
		expect(parseHexColour('ff8800')).toBe('#ff8800');
		expect(parseHexColour('  #ff8800  ')).toBe('#ff8800');
		expect(parseHexColour('#f80')).toBe('#ff8800');
		expect(parseHexColour('f80')).toBe('#ff8800');
		for (const bad of ['', '#', 'red', '#gg8800', '#ff88', '#ff88000', '#ff 880', 'rgb(1,2,3)']) expect(parseHexColour(bad), bad).toBeNull();
		/* Every parse lands on the shape the reducer stores. */
		for (const good of ['#ABCDEF', 'abcdef', '#abc']) expect(parseHexColour(good)).toMatch(HEX);
	});
	it('colourName answers the palette word, else the hex', () => {
		expect(colourName('#d24a3a')).toBe('Signal red');
		expect(colourName('#D24A3A')).toBe('Signal red');
		expect(colourName('#123456')).toBe('#123456');
	});
});

describe('through the real engine', () => {
	const source = readFileSync('static/ideacad/kernels/remus-9307e73.wasm');
	const profile: FeatureOf<'sketch'> = { id: 'box', name: 'Box', type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities: [{ id: 'p0', type: 'point', x: 0, y: 0 }, { id: 'p1', type: 'point', x: 1, y: 0 }, { id: 'p2', type: 'point', x: 1, y: 1 }, { id: 'p3', type: 'point', x: 0, y: 1 }, { id: 'l0', type: 'line', a: 'p0', b: 'p1' }, { id: 'l1', type: 'line', a: 'p1', b: 'p2' }, { id: 'l2', type: 'line', a: 'p2', b: 'p3' }, { id: 'l3', type: 'line', a: 'p3', b: 'p0' }], constraints: [] };
	it('a colour set by metadata lands lowercase, wins over the material, clears back to it, and fixed lands and lifts', async () => {
		const e = await SolidEngine.create(source);
		try {
			await e.apply({ type: 'add-feature', feature: profile });
			let m = await e.apply({ type: 'add-feature', feature: { id: 'x', name: 'Extrude', type: 'extrude', sketch: profile.id, distance: 1, operation: 'new' } });
			const id = m.bodies[0].id;
			expect(m.bodies[0].color).toBeUndefined();
			expect(bodyColour(m.bodies[0], materialColourFor(m.bodies[0].materialId))).toBe(DEFAULT_BODY_COLOUR);
			m = await e.apply({ type: 'metadata', bodyId: id, materialId: 'aluminum-6061-t6' });
			const alu = materialColourFor('aluminum-6061-t6')!;
			expect(bodyColour(m.bodies[0], materialColourFor(m.bodies[0].materialId))).toBe(alu);
			expect(describeAppearance(m.bodies[0], STOCK_MATERIALS.find((x) => x.id === m.bodies[0].materialId))).toBe("Drawn in 6061-T6/T651 aluminum's colour");
			m = await e.apply({ type: 'metadata', bodyId: id, color: '#D24A3A' });
			expect(m.bodies[0].color).toBe('#d24a3a');
			expect(bodyColour(m.bodies[0], alu)).toBe('#d24a3a');
			expect(describeAppearance(m.bodies[0], STOCK_MATERIALS.find((x) => x.id === m.bodies[0].materialId))).toBe("Drawn in the body's own colour, overriding 6061-T6/T651 aluminum");
			/* The reducer's own refusal for a value the parser would have caught first. */
			await expect(e.apply({ type: 'metadata', bodyId: id, color: 'red' })).rejects.toThrow('Choose a colour.');
			m = await e.apply({ type: 'metadata', bodyId: id, color: null });
			expect(m.bodies[0].color).toBeUndefined();
			expect(bodyColour(m.bodies[0], alu)).toBe(alu);
			m = await e.apply({ type: 'metadata', bodyId: id, fixed: true });
			expect(m.bodies[0].fixed).toBe(true);
			m = await e.apply({ type: 'metadata', bodyId: id, fixed: false });
			expect(m.bodies[0].fixed).toBeUndefined();
		} finally { e.destroy(); }
	});
});

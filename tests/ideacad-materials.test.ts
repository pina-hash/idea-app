/**
 * THE MATERIAL LIBRARY'S PURE LAYER (0208).
 *
 * WHAT WOULD FAIL SILENTLY HERE, which is the whole bar for adding a test at
 * all: an id that stops resolving. `ideacad_concepts.features` stores a material
 * and a stock as STRINGS, written before 0208 existed, and `evaluate()`
 * non-null-asserts both lookups -- so a rule change that renamed
 * `steel-0125` produces a saved concept whose mass comes back NaN, on a surface
 * nobody looks at until a student opens last term's work. Nothing type-checks
 * that, and nothing on screen says which id went missing.
 *
 * The second silent one is the RESOLUTION/SELECTION split. A retired material
 * that disappeared from the resolution set would change a stored concept's mass
 * with no error anywhere; a retired material that stayed in the SELECTION set
 * would quietly keep being handed out. The two are asserted against each other
 * rather than separately, because the bug is always that one of them drifted.
 */
import { describe, expect, it } from 'vitest';
import {
	DEFAULT_BLADE_CONFIG,
	MATERIAL_THICKNESS_MAX_IN,
	MATERIAL_UNRESOLVED_NAME,
	bladeConfigWithMaterials,
	bladeStockChoices,
	formatThicknessIn,
	materialChoices,
	materialLibrary,
	parseThicknessList,
	splitStockId,
	stockIdAfterMaterialChange,
	stockIdFor,
	stocksOf,
	thicknessKey,
	type MaterialRow
} from '../src/lib/ideacad/blade/materials';

const row = (
	slug: string,
	name: string,
	density: number,
	thicknesses: number[],
	extra: Partial<MaterialRow> = {}
): MaterialRow => ({
	id: slug,
	slug,
	owner: null,
	name,
	density_g_cm3: density,
	thicknesses_in: thicknesses,
	note: null,
	source: 'a named published source',
	source_verified: false,
	retired_at: null,
	...extra
});

/** 0208's seed, as the read returns it. Copied as DATA, not imported from SQL. */
const SEED: MaterialRow[] = [
	row('stainless-steel', 'Stainless steel (304)', 8.0, [0.024, 0.03, 0.048, 0.0625, 0.09, 0.125]),
	row('galvanized-steel', 'Galvanized steel', 7.85, [0.0276, 0.0336, 0.0396, 0.0516, 0.0635, 0.0785]),
	row('steel', 'Carbon or unknown steel', 7.85, [0.0625, 0.125, 0.1875, 0.25]),
	row('aluminum', '6061 aluminum', 2.7, [0.0625, 0.125, 0.1875, 0.25]),
	row('polycarbonate', 'Polycarbonate', 1.2, [0.0625, 0.093, 0.125, 0.1875, 0.25]),
	row('wood', 'Wood (Baltic birch plywood)', 0.68, [0.118, 0.236, 0.472]),
	row('pla', 'PLA (3D printed)', 1.24, [], { retired_at: '2026-09-12T00:00:00Z' }),
	row('petg', 'PETG (3D printed)', 1.27, [], { retired_at: '2026-09-12T00:00:00Z' })
];

/**
 * THE DEPLOYED STOCK IDS, TAKEN FROM `DEFAULT_BLADE_CONFIG` RATHER THAN TYPED.
 * A list retyped here would be a list of what somebody believed the ids were;
 * read off the shipping constant, it is what the app actually wrote into
 * `ideacad_concepts.features` before 0208 existed.
 */
const DEPLOYED_STOCK_IDS = DEFAULT_BLADE_CONFIG.stock.map((s) => s.id);
const DEPLOYED_MATERIAL_IDS = DEFAULT_BLADE_CONFIG.materials.map((m) => m.id);

describe('the stock id is derived, and the derivation is what keeps stored trees working', () => {
	it('reproduces every stock id the deployed config already carries', () => {
		expect(DEPLOYED_STOCK_IDS.length).toBeGreaterThan(0);
		const produced = SEED.flatMap((r) => stocksOf(r).map((s) => s.id));
		for (const id of DEPLOYED_STOCK_IDS) expect(produced).toContain(id);
	});

	it('spells a thickness the one way that produces those ids', () => {
		expect(thicknessKey(0.125)).toBe('0125');
		expect(thicknessKey(0.1875)).toBe('01875');
		expect(stockIdFor('steel', 0.125)).toBe('steel-0125');
		expect(stockIdFor('aluminum', 0.125)).toBe('aluminum-0125');
		/* The negative control for the rule: a fixed-decimal spelling is the
		   plausible alternative and it produces a DIFFERENT id, which is exactly
		   the silent breakage this test exists for. */
		expect(stockIdFor('steel', 0.125)).not.toBe(`steel-${(0.125).toFixed(4).replace('.', '')}`);
	});

	it('splits a stored id against the slugs rather than at the last hyphen', () => {
		const lib = materialLibrary(SEED);
		expect(splitStockId('stainless-steel-0125', lib)).toMatchObject({ thicknessIn: 0.125 });
		expect(splitStockId('stainless-steel-0125', lib)?.row.slug).toBe('stainless-steel');
		/* Split at the last hyphen this would be material `stainless-steel-0125`
		   minus nothing, or material `stainless` -- both of which lose the row. */
		expect(splitStockId('steel-01875', lib)?.row.slug).toBe('steel');
		expect(splitStockId('steel-0999', lib)).toBeNull();
	});

	it('formats a thickness without trailing zeros or an exponent', () => {
		expect(formatThicknessIn(0.125)).toBe('0.125');
		expect(formatThicknessIn(0.25)).toBe('0.25');
		expect(formatThicknessIn(0.0276)).toBe('0.0276');
	});
});

describe('resolution is total, so evaluate() can never be handed an id it cannot find', () => {
	it('keeps every id the deployed config carries even with a library present', () => {
		const cfg = bladeConfigWithMaterials(DEFAULT_BLADE_CONFIG, SEED);
		for (const id of DEPLOYED_MATERIAL_IDS) expect(cfg.materials.some((m) => m.id === id)).toBe(true);
		for (const id of DEPLOYED_STOCK_IDS) expect(cfg.stock.some((s) => s.id === id)).toBe(true);
		expect(cfg.unresolvedMaterials).toEqual([]);
	});

	it('keeps a RETIRED material resolvable, which is what stops retiring breaking a saved part', () => {
		const cfg = bladeConfigWithMaterials(DEFAULT_BLADE_CONFIG, SEED, [{ body: 'pla' }]);
		const pla = cfg.materials.find((m) => m.id === 'pla');
		expect(pla).toBeDefined();
		expect(pla?.densityGcm3).toBe(1.24);
		expect(cfg.unresolvedMaterials).toEqual([]);
		/* The paired positive control: the SAME row is withheld from the picker
		   for anyone not already on it. Either assertion alone passes on a
		   version where retirement does nothing, or on one where it deletes. */
		expect(materialChoices(SEED, 'steel').map((c) => c.value)).not.toContain('pla');
	});

	it('places a zero-density placeholder for an id nothing explains, and names it', () => {
		const cfg = bladeConfigWithMaterials(DEFAULT_BLADE_CONFIG, SEED, [
			{ body: 'unobtanium', bladeStock: 'unobtanium-0125' }
		]);
		expect(cfg.unresolvedMaterials).toEqual(['unobtanium', 'unobtanium-0125']);
		expect(cfg.materials.find((m) => m.id === 'unobtanium')).toMatchObject({
			name: MATERIAL_UNRESOLVED_NAME,
			densityGcm3: 0
		});
		expect(cfg.stock.find((s) => s.id === 'unobtanium-0125')).toMatchObject({ densityGcm3: 0, thicknessIn: 0 });
	});

	it('resolves an id that only a SIBLING concept names, because compare evaluates them all against one config', () => {
		const cfg = bladeConfigWithMaterials(DEFAULT_BLADE_CONFIG, SEED, [
			{ body: 'steel', bladeStock: 'steel-0125' },
			{ body: 'wood', bladeStock: 'wood-0236' }
		]);
		expect(cfg.materials.some((m) => m.id === 'wood')).toBe(true);
		expect(cfg.stock.some((s) => s.id === 'wood-0236')).toBe(true);
		expect(cfg.unresolvedMaterials).toEqual([]);
	});

	it('has a library that is not vacuous: every seeded slug reaches the resolution set', () => {
		const cfg = bladeConfigWithMaterials(DEFAULT_BLADE_CONFIG, SEED);
		expect(SEED.length).toBe(8);
		for (const r of SEED) expect(cfg.materials.some((m) => m.id === r.slug)).toBe(true);
	});
});

describe('selection offers live materials, plus whatever the part is already on', () => {
	it('offers every live material and no retired one', () => {
		const offered = materialChoices(SEED, 'steel').map((c) => c.value);
		expect(offered).toContain('steel');
		expect(offered).toContain('wood');
		expect(offered).not.toContain('pla');
		expect(offered).not.toContain('petg');
		expect(offered.length).toBe(6);
	});

	it('offers the retired one to the part that is on it, marked retired', () => {
		const offered = materialChoices(SEED, 'pla');
		const pla = offered.find((c) => c.value === 'pla');
		expect(pla).toBeDefined();
		expect(pla?.retired).toBe(true);
		expect(pla?.label).toContain('(retired)');
		expect(offered.length).toBe(7);
	});

	it('names an id it cannot explain rather than dropping it from the picker', () => {
		const offered = materialChoices(SEED, 'unobtanium');
		expect(offered[0].value).toBe('unobtanium');
		expect(offered[0].label).toContain(MATERIAL_UNRESOLVED_NAME.toLowerCase());
	});

	it('keeps a material with no stock thicknesses out of the BLADE picker', () => {
		/* `pla` has none, so a blade cut from it is not a thing to offer -- but it
		   is still a legitimate BODY material, which is why the two pickers ask
		   different questions of the same rows. */
		const blade = bladeStockChoices(SEED, 'steel-0125').materials.map((c) => c.value);
		expect(blade).not.toContain('pla');
		expect(blade).toContain('steel');
		expect(materialChoices(SEED, 'steel').map((c) => c.value)).not.toContain('pla');
	});

	it('offers only the chosen material own thicknesses', () => {
		const pick = bladeStockChoices(SEED, 'wood-0236');
		expect(pick.materialSlug).toBe('wood');
		expect(pick.thicknessIn).toBe(0.236);
		expect(pick.thicknesses.map((t) => t.thicknessIn)).toEqual([0.118, 0.236, 0.472]);
		expect(pick.thicknesses.map((t) => t.value)).toEqual(['wood-0118', 'wood-0236', 'wood-0472']);
		expect(pick.unresolved).toBe(false);
	});

	it('reports an unresolved stock id rather than silently showing the first material', () => {
		const pick = bladeStockChoices(SEED, 'unobtanium-0125');
		expect(pick.unresolved).toBe(true);
		expect(pick.thicknesses).toEqual([]);
		expect(pick.materials[0].value).toBe('unobtanium-0125');
	});

	it('marks a custom material as the student own and never as a shared one', () => {
		const mine = row('custom-abc', 'My PETG at 40%', 0.53, [0.125], { owner: 'u1', id: 'custom-abc' });
		const choice = materialChoices([...SEED, mine], null).find((c) => c.value === 'custom-abc');
		expect(choice?.custom).toBe(true);
		expect(materialChoices(SEED, null).every((c) => !c.custom)).toBe(true);
	});
});

describe('changing the blade material keeps the nearest thickness it actually comes in', () => {
	it('lands on the nearest, not the first', () => {
		/* 0.25 in steel -> polycarbonate, whose list is
		   0.0625 / 0.093 / 0.125 / 0.1875 / 0.25. The first is 0.0625, which is a
		   quarter of the sheet they were looking at. */
		expect(stockIdAfterMaterialChange(SEED, 'polycarbonate', 'steel-025')).toBe('polycarbonate-025');
		expect(stockIdAfterMaterialChange(SEED, 'wood', 'steel-025')).toBe('wood-0236');
		expect(stockIdAfterMaterialChange(SEED, 'galvanized-steel', 'steel-0625')).not.toBeNull();
	});

	it('breaks a tie towards the thicker sheet', () => {
		const twoSided = [row('t', 'T', 1, [0.1, 0.2])];
		expect(stockIdAfterMaterialChange(twoSided, 't', 'x-015')).toBe('t-01');
		/* An id nothing explains has no thickness to be near, so the first entry
		   is the honest answer rather than a guess. */
		expect(stockIdAfterMaterialChange(SEED, 'steel', null)).toBe('steel-00625');
	});

	it('answers null for a material nobody cuts blades from, so no id is invented', () => {
		expect(stockIdAfterMaterialChange(SEED, 'pla', 'steel-0125')).toBeNull();
	});
});

describe('a typed thickness list is parsed once, and refuses rather than coercing', () => {
	it('sorts, dedupes and accepts an ordinary list', () => {
		expect(parseThicknessList('0.25, 0.125 0.125')).toEqual({ thicknesses: [0.125, 0.25], refusal: null });
	});
	it('refuses an empty list, a word, a negative, and anything over the ceiling', () => {
		expect(parseThicknessList('   ').refusal).toMatch(/at least one thickness/);
		expect(parseThicknessList('thick').refusal).toMatch(/not a thickness/);
		expect(parseThicknessList('-1').refusal).toMatch(/not a thickness/);
		expect(parseThicknessList(`${MATERIAL_THICKNESS_MAX_IN + 1}`).refusal).toMatch(/ceiling/);
		expect(parseThicknessList(`${MATERIAL_THICKNESS_MAX_IN}`).refusal).toBeNull();
	});
});

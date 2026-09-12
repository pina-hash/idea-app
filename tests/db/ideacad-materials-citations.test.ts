/**
 * THE CORRECTION FILE IS RUN AGAINST THE DATABASE `0208` BUILT, and both of its
 * halves are proven: the citation half WRITES on a blind paste, and the density
 * half does NOT.
 *
 * WHAT FAILS SILENTLY, which is the whole bar for a test here. Three things,
 * and none of them is visible until the worst moment.
 *
 *   1. A STRING TOO LONG FOR ITS COLUMN. `ideacad_materials` caps `source` at
 *      300 characters, `note` at 400 and `name` at 60. A correction file is not
 *      executed by anything in this repo -- it is pasted by hand into the
 *      Supabase SQL editor against production -- so an over-long sentence is
 *      discovered by Mr. Pina, mid-paste, as a constraint violation, with some
 *      statements already committed. Running the real file here is the only
 *      thing that can find it first.
 *
 *   2. A DENSITY SHIPPING IN THE COMMITTED FILE. The density form is all NULL
 *      on purpose: this container reached no published source, so a number in
 *      it would be a number nobody checked, pasted straight into the value a
 *      student's part is graded on. `where v.density_g_cm3 is not null` is what
 *      makes a blind paste write zero rows, and nothing else in the repo asserts
 *      that property.
 *
 *   3. THE SLUG MOVING WITH THE NAME. Section 3 renames the wood row to the
 *      species it always was. A stock id is the SLUG plus the thickness, so a
 *      rename that touched the slug would orphan every concept saved against it
 *      -- the lookup returns nothing, `evaluate()` non-null-asserts it, and the
 *      mass comes back NaN with nothing on screen naming what went missing.
 *
 * THE POSITIVE CONTROL IS NOT OPTIONAL HERE. "A blind paste writes no density"
 * is an ABSENCE, and an absence passes just as well when the statement is
 * broken, when the slugs do not match, or when the file did not run at all. So
 * the same file with ONE density filled in is run against a second database and
 * must write exactly that row.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { startTestDb, type TestDb } from './harness';
import {
	DEFAULT_BLADE_CONFIG,
	splitStockId,
	type MaterialRow
} from '../../src/lib/ideacad/blade/materials';

const ALL_MIGRATIONS = readdirSync(new URL('../../supabase/migrations', import.meta.url))
	.filter((file) => file.endsWith('.sql'))
	.sort();
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

/* THE REAL FILE, READ OFF DISK. A transcript of it here would be a test that
   the transcript is pasteable, which is the defect `ideacad-materials-seed-
   resolves.test.ts` was written to close one file over. */
const CORRECTION_PATH = new URL('../../supabase/data/0194-material-citation-model.sql', import.meta.url);
const CORRECTION_SQL = readFileSync(CORRECTION_PATH, 'utf8');

const DEPLOYED_STOCK_IDS = DEFAULT_BLADE_CONFIG.stock.map((s) => s.id);

let db: TestDb;
let control: TestDb;

const readGlobals = async (target: TestDb): Promise<MaterialRow[]> => {
	const { rows } = await target.sql<Record<string, unknown>>(
		`select slug, name, density_g_cm3, thicknesses_in, note, source, source_verified, retired_at
		   from public.ideacad_materials
		  where owner is null
		  order by slug`
	);
	/* `numeric` and `numeric[]` arrive as strings through node-postgres. Coerce
	   HERE, once: a per-assertion coercion is how one of them ends up comparing
	   "7.85" against 7.85 and passing for the wrong reason. */
	return rows.map((r) => ({
		...r,
		density_g_cm3: Number(r.density_g_cm3),
		thicknesses_in: (r.thicknesses_in as unknown[]).map(Number)
	})) as MaterialRow[];
};

const bySlug = (rows: readonly MaterialRow[], slug: string): MaterialRow => {
	const hit = rows.find((r) => r.slug === slug);
	if (!hit) throw new Error(`no seeded global row for ${slug}`);
	return hit;
};

let before: MaterialRow[];
let after: MaterialRow[];

beforeAll(async () => {
	db = await startTestDb([FIXTURE_COMPLETION, ...ALL_MIGRATIONS]);
	before = await readGlobals(db);
	/* THE BLIND PASTE. The whole file, exactly as it sits on disk, exactly as it
	   goes into the SQL editor -- including the two read-only audit selects,
	   which is what a paste actually does. */
	await db.sql(CORRECTION_SQL);
	after = await readGlobals(db);
}, 600_000);

afterAll(async () => {
	await db?.stop();
	await control?.stop();
});

describe('the 0194 correction file, pasted blind against the chain 0208 built', () => {
	it('applies at all -- no string in it is too long for its column', async () => {
		/* The assertion is that `beforeAll` did not throw. Made explicit rather
		   than left implicit, because a `beforeAll` failure reads as a broken
		   harness and this one would mean a file Mr. Pina cannot paste. */
		expect(before.length).toBeGreaterThan(0);
		expect(after.length).toBe(before.length);
		for (const row of after) {
			expect(row.source.length).toBeLessThanOrEqual(300);
			expect(row.source.trim().length).toBeGreaterThan(0);
			expect((row.note ?? '').length).toBeLessThanOrEqual(400);
			expect(row.name.length).toBeLessThanOrEqual(60);
		}
	});

	it('writes NO density and clears NO verification flag', async () => {
		for (const row of after) {
			const was = bySlug(before, row.slug);
			expect(row.density_g_cm3, `density moved on ${row.slug}`).toBe(was.density_g_cm3);
			expect(row.source_verified, `source_verified moved on ${row.slug}`).toBe(false);
		}
		/* and the seeded figures are still the seeded figures, named, so this
		   cannot pass by both readings being empty */
		expect(bySlug(after, 'stainless-steel').density_g_cm3).toBe(8);
		expect(bySlug(after, 'aluminum').density_g_cm3).toBe(2.7);
	});

	it('DOES correct the citations, which is the half that needs no document', async () => {
		/* Removing an attribution a document cannot support takes a claim away;
		   asserting a number adds one. That asymmetry is why this half writes on
		   a blind paste and the density half does not. */
		const procurementSpecs: ReadonlyArray<[string, string]> = [
			['stainless-steel', 'A240'],
			['galvanized-steel', 'A653'],
			['steel', 'A36']
		];
		for (const [slug, spec] of procurementSpecs) {
			const was = bySlug(before, slug);
			const now = bySlug(after, slug);
			/* the positive control on the mutation: 0208 really did cite it as the
			   source, so "no longer cited as the source" is a change and not a
			   string that was never there */
			expect(was.source, `0208 did not cite ${spec} for ${slug}`).toContain(spec);
			expect(now.source).not.toBe(was.source);
			expect(now.source).toContain('NOT SOURCED');
			/* the spec may still be NAMED -- the correction explains why it is not
			   the source -- so the assertion is about the claim, not the string */
			expect(now.source).toContain(spec);
		}

		/* B209 is dropped outright and the Aluminum Association half is kept:
		   0208 cited two documents for aluminium and the second one is right. */
		expect(bySlug(before, 'aluminum').source).toContain('B209');
		expect(bySlug(after, 'aluminum').source).toContain('Aluminum Standards and Data');
		expect(bySlug(after, 'aluminum').source).toContain('REMOVED');

		/* and the shape of the number is now stated in the data, which is what a
		   material with no single true density needs and has no column for */
		expect(bySlug(after, 'stainless-steel').note).toContain('RANGE');
		expect(bySlug(after, 'steel').note).toContain('ESTIMATE');
		expect(bySlug(after, 'wood').note).toContain('ESTIMATE');
	});

	it('renames the wood row to its species and does NOT move the slug', async () => {
		expect(bySlug(before, 'wood').name).toBe('Wood (Baltic birch plywood)');
		expect(bySlug(after, 'wood').name).toBe('Baltic birch plywood');
		/* THE HALF THAT MATTERS. The slug is the join key. */
		expect(after.map((r) => r.slug).sort()).toEqual(before.map((r) => r.slug).sort());
	});

	it('leaves every deployed stock id resolving, thicknesses untouched', async () => {
		expect(DEPLOYED_STOCK_IDS.length).toBeGreaterThan(0);
		for (const id of DEPLOYED_STOCK_IDS) {
			expect(splitStockId(id, after), `${id} stopped resolving after the paste`).not.toBeNull();
		}
		for (const row of after) {
			expect(row.thicknesses_in).toEqual(bySlug(before, row.slug).thicknesses_in);
		}
		/* the resolver is not answering yes to everything */
		expect(splitStockId('unobtanium-0125', after)).toBeNull();
	});

	it('is re-appliable: a second paste moves nothing', async () => {
		/* Re-pasting a correction is ordinary -- somebody pastes it twice, or a
		   first attempt failed partway. Section 3 is gated on the OLD name, so the
		   second run must find nothing to rename rather than renaming something
		   else. */
		await db.sql(CORRECTION_SQL);
		const twice = await readGlobals(db);
		for (const row of twice) {
			const once = bySlug(after, row.slug);
			expect(row.name).toBe(once.name);
			expect(row.source).toBe(once.source);
			expect(row.note).toBe(once.note);
			expect(row.density_g_cm3).toBe(once.density_g_cm3);
			expect(row.source_verified).toBe(false);
		}
	});

	it('leaves a row somebody has already verified completely alone', async () => {
		/* Section 2 is gated on `source_verified = false`, so a citation an admin
		   has checked and signed off is THEIRS. Without the gate, re-pasting this
		   file would overwrite a verified citation with "NOT SOURCED" -- which is
		   the one way a correction file can destroy work rather than add to it. */
		await db.sql(
			`update public.ideacad_materials
			    set source = 'ASM Handbook Vol. 1, p. 871, read 2026-09-13', source_verified = true
			  where owner is null and slug = 'aluminum'`
		);
		await db.sql(CORRECTION_SQL);
		const guarded = await readGlobals(db);
		expect(bySlug(guarded, 'aluminum').source).toBe('ASM Handbook Vol. 1, p. 871, read 2026-09-13');
		expect(bySlug(guarded, 'aluminum').source_verified).toBe(true);
		/* and the unverified rows around it still take the correction */
		expect(bySlug(guarded, 'steel').source).toContain('NOT SOURCED');

		await db.sql(
			`update public.ideacad_materials
			    set source = $1, source_verified = false
			  where owner is null and slug = 'aluminum'`,
			[bySlug(after, 'aluminum').source]
		);
	});
});

describe('THE POSITIVE CONTROL: the same file with one density filled in', () => {
	it('writes exactly that row, so "writes nothing" above is not vacuous', async () => {
		control = await startTestDb([FIXTURE_COMPLETION, ...ALL_MIGRATIONS]);
		const filled = CORRECTION_SQL.replace(
			"('polycarbonate',      null::numeric,   null::text)",
			"('polycarbonate',      1.1234::numeric, 'a document somebody opened'::text)"
		);
		/* the substitution has to have BITTEN, or the control proves nothing */
		expect(filled).not.toBe(CORRECTION_SQL);

		await control.sql(filled);
		const rows = await readGlobals(control);
		expect(bySlug(rows, 'polycarbonate').density_g_cm3).toBe(1.1234);
		expect(bySlug(rows, 'polycarbonate').source).toBe('a document somebody opened');
		expect(bySlug(rows, 'polycarbonate').source_verified).toBe(true);
		/* and ONLY that row: the other seven are still untouched and unverified */
		for (const row of rows.filter((r) => r.slug !== 'polycarbonate')) {
			expect(row.source_verified, `${row.slug} was written too`).toBe(false);
		}
	});
});

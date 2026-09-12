/**
 * EVERY STOCK ID THE DEPLOYED APP ALREADY WROTE STILL RESOLVES AGAINST THE ROWS
 * `0208` ACTUALLY SEEDED -- asked of the REAL migration on a REAL Postgres.
 *
 * WHAT FAILS SILENTLY, which is the whole bar for a test here. A material and a
 * stock are stored in `ideacad_concepts.features` as STRINGS, written before
 * 0208 existed, and `evaluate()` non-null-asserts both lookups: an id that stops
 * resolving is a rail of NaN on a surface nobody opens until a student opens
 * last term's work. Nothing type-checks it and nothing on screen names the id
 * that went missing.
 *
 * WHY THIS EXISTS BESIDE `tests/ideacad-materials.test.ts` RATHER THAN INSIDE
 * IT. That file asks the same question of a `SEED` fixture whose own header
 * says it is "Copied as DATA, not imported from SQL" -- a hand-typed transcript
 * of the migration. So it proves the RESOLVER agrees with the transcript, and
 * stays green if the transcript and the migration disagree. The expected value
 * and the thing under test are the same typing. This file closes exactly that:
 * the rows come out of the database the migration built, and the ids come off
 * `DEFAULT_BLADE_CONFIG`, which is what the app actually wrote.
 *
 * AND IT IS THE GUARD ON THE EDIT THAT IS COMING. Materials are admin-managed
 * now, so the seeded thickness lists are about to be corrected by hand against
 * what is in the shop. Dropping 0.1875 from the steel row is a one-character
 * edit that silently orphans every concept saved on `steel-01875`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { startTestDb, createUser, type SeededUser, type TestDb } from './harness';
import {
	DEFAULT_BLADE_CONFIG,
	splitStockId,
	stockIdFor,
	type MaterialRow
} from '../../src/lib/ideacad/blade/materials';

const ALL_MIGRATIONS = readdirSync(new URL('../../supabase/migrations', import.meta.url))
	.filter((file) => file.endsWith('.sql'))
	.sort();
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

/* READ OFF THE SHIPPING CONSTANT, NEVER RETYPED. A list typed here would be a
   list of what somebody believed the deployed ids were. */
const DEPLOYED_STOCK_IDS = DEFAULT_BLADE_CONFIG.stock.map((s) => s.id);
const DEPLOYED_MATERIAL_IDS = DEFAULT_BLADE_CONFIG.materials.map((m) => m.id);

let db: TestDb;
let reader: SeededUser;

/** The seeded shared library, as a client read returns it. */
const readSeed = async (): Promise<MaterialRow[]> =>
	db.asUser(reader.id, async (q) => {
		const { rows } = await q<Record<string, unknown>>(
			`select id, slug, owner, name, density_g_cm3, thicknesses_in, note, source,
			        source_verified, retired_at
			   from public.ideacad_materials
			  where owner is null
			  order by slug`
		);
		/* `numeric` and `numeric[]` arrive as strings through node-postgres, and
		   the resolver is written against numbers. Coerce HERE, once, rather than
		   in each assertion: a per-assertion coercion is how one of them ends up
		   comparing "0.1875" to 0.1875 and passing for the wrong reason. */
		return rows.map((r) => ({
			...r,
			density_g_cm3: Number(r.density_g_cm3),
			thicknesses_in: (r.thicknesses_in as unknown[]).map(Number)
		})) as MaterialRow[];
	});

beforeAll(async () => {
	db = await startTestDb([FIXTURE_COMPLETION, ...ALL_MIGRATIONS]);
	reader = await createUser(db, 'seed.reader@boscotech.net', 'Seed Reader');
}, 600_000);

afterAll(async () => db?.stop());

describe("0208's seed, read back from the database it built", () => {
	it('resolves every stock id the deployed config already carries, and is not answering yes to everything', async () => {
		const seed = await readSeed();
		expect(seed.length).toBeGreaterThan(0);
		expect(DEPLOYED_STOCK_IDS.length).toBeGreaterThan(0);

		for (const id of DEPLOYED_STOCK_IDS) {
			const hit = splitStockId(id, seed);
			expect(hit, `deployed stock id ${id} no longer resolves against the seeded rows`).not.toBeNull();
			/* The id has to come back out of the pair it resolved to, or a resolver
			   that returned the FIRST row for everything would pass the line above. */
			expect(stockIdFor(hit!.row.slug, hit!.thicknessIn)).toBe(id);
		}

		/* THE POSITIVE CONTROL. Without it, a resolver that answered non-null for
		   every string would satisfy every assertion above. */
		expect(splitStockId('steel-9999', seed)).toBeNull();
		expect(splitStockId('unobtanium-0125', seed)).toBeNull();
	});

	it('carries every material id the deployed config already carries', async () => {
		const seed = await readSeed();
		const slugs = new Set(seed.map((r) => r.slug));
		expect(DEPLOYED_MATERIAL_IDS.length).toBeGreaterThan(0);
		for (const id of DEPLOYED_MATERIAL_IDS) {
			expect(slugs.has(id), `deployed material id ${id} is not in the seeded library`).toBe(true);
		}
		expect(slugs.has('unobtanium')).toBe(false);
	});

	it('BITES when a thickness is dropped, which is the edit this guards against', async () => {
		/* The instrument's own proof, on the database rather than on a fixture:
		   remove 0.1875 from the steel row exactly as a hand-edit in the admin
		   console would, and confirm `steel-01875` stops resolving. A guard that
		   has never refused anything has not been tested. */
		const before = await readSeed();
		expect(splitStockId('steel-01875', before)).not.toBeNull();

		await db.sql(
			`update public.ideacad_materials
			    set thicknesses_in = array[0.0625, 0.125, 0.250]::numeric[]
			  where owner is null and slug = 'steel'`
		);
		const mutated = await readSeed();
		expect(splitStockId('steel-01875', mutated)).toBeNull();
		/* and only that one moved */
		expect(splitStockId('steel-0125', mutated)).not.toBeNull();
		expect(splitStockId('aluminum-0125', mutated)).not.toBeNull();

		await db.sql(
			`update public.ideacad_materials
			    set thicknesses_in = array[0.0625, 0.125, 0.1875, 0.250]::numeric[]
			  where owner is null and slug = 'steel'`
		);
		const restored = await readSeed();
		expect(splitStockId('steel-01875', restored)).not.toBeNull();
	});

	it('seeds every density UNVERIFIED, which is what the UNVERIFIED chip renders from', async () => {
		/* 0208 landed every row false deliberately: the session that wrote it had
		   no network route to any of the named documents. Ledger 0191 could not
		   reach one either, so this still reads false for all eight; clearing a
		   flag is the act of somebody with the source in front of them, and when
		   one is cleared in production this assertion is about the SEED, not about
		   that row. Every row also names a source, which is the half that makes
		   the flag checkable at all. */
		const seed = await readSeed();
		for (const row of seed) {
			expect(row.source_verified, `${row.slug} was seeded as verified`).toBe(false);
			expect(String(row.source ?? '').trim().length, `${row.slug} names no source`).toBeGreaterThan(0);
		}
	});
});

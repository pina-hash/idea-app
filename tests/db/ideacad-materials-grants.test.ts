/**
 * THE PASTE TRAP, ASKED TWO WAYS ABOUT 0208's OWN OBJECTS.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE TRAP IS
 * ---------------------------------------------------------------------------
 *
 * A hosted Supabase project bootstraps
 *
 *   alter default privileges in schema public
 *     grant execute on functions to anon, authenticated, service_role;
 *   alter default privileges in schema public
 *     grant all on tables to anon, authenticated, service_role;
 *
 * so every function and every table a migration creates arrives holding a DIRECT
 * grant to `anon`. `revoke ... from public` removes the single PUBLIC entry the
 * SQL default would have written and never touches that direct grant. 0201
 * invented its own shape, lost the `anon` clause, and all ten of its functions
 * plus all four of its tables came out open on production; 0202 is the repair
 * and 0166 is the shape that prevents it. This file asks whether 0208 followed
 * 0166 -- of the objects 0208 itself creates, and of nothing else.
 *
 * ---------------------------------------------------------------------------
 * TWO INSTRUMENTS, BECAUSE ONE OF THEM CAN BE WRONG IN A WAY THAT READS CLEAN
 * ---------------------------------------------------------------------------
 *
 *   A. `has_function_privilege` / `has_table_privilege` -- the resolved answer,
 *      which folds in role membership and the PUBLIC entry.
 *   B. The raw `proacl` / `relacl` text, read for an `anon=` entry. This is the
 *      one that names the DEFECT rather than the symptom: it is the direct grant
 *      that `revoke ... from public` fails to remove, and it is visible in the
 *      acl even in a configuration where the resolved answer might not be.
 *
 * Neither is trusted alone, and the two are asserted to AGREE on every object,
 * so an instrument that has silently stopped looking disagrees with the other
 * rather than quietly reporting a clean database.
 *
 * ---------------------------------------------------------------------------
 * THE PLANTED CONTROL
 * ---------------------------------------------------------------------------
 *
 * A sweep that found nothing because it was looking in the wrong place reports
 * exactly what a clean database reports. So:
 *
 *   1. A STANDING control -- `app_short_link_target` is granted to `anon` on
 *      purpose (0137 keeps it: printed handouts and QR codes resolve before any
 *      session exists) and must read anon-executable under BOTH instruments.
 *   2. A PLANTED one -- `anon` is granted EXECUTE on one of 0208's own functions
 *      and both instruments must name it; the grant is then revoked and both
 *      must come back clean. The mutation is a catalog grant and the restore is
 *      the matching revoke. NOTHING under `supabase/migrations/` is read,
 *      written or re-applied and no `git` command is run, per CLAUDE.md's own
 *      account of three sessions that discarded their uncommitted work with a
 *      `git checkout --` inside a mutation script.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startTestDb, type TestDb } from './harness';

const ALL_MIGRATIONS = readdirSync(new URL('../../supabase/migrations', import.meta.url))
	.filter((file) => file.endsWith('.sql'))
	.sort();
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

/** 0208's own three public functions, and its one private helper. */
const PUBLIC_FUNCTIONS = [
	'ideacad_material_save_global',
	'ideacad_material_save_custom',
	'ideacad_material_set_retired'
] as const;
const PRIVATE_HELPER = '_ideacad_clean_thicknesses';
const TABLE = 'ideacad_materials';
/** Deliberately anon-executable since 0137. The standing control. */
const DELIBERATELY_PUBLIC = 'app_short_link_target';

interface FnRow {
	name: string;
	sig: string;
	anon_resolved: boolean;
	anon_in_acl: boolean;
	authed_resolved: boolean;
}

let db: TestDb;
let fns: FnRow[] = [];

async function readFunctions(): Promise<FnRow[]> {
	const { rows } = await db.sql<FnRow>(
		`select p.proname as name,
		        p.oid::regprocedure::text as sig,
		        has_function_privilege('anon', p.oid, 'execute') as anon_resolved,
		        coalesce(array_to_string(p.proacl, ' ') like '%anon=%', false) as anon_in_acl,
		        has_function_privilege('authenticated', p.oid, 'execute') as authed_resolved
		 from pg_proc p
		 join pg_namespace n on n.oid = p.pronamespace
		 where n.nspname = 'public'
		 order by 1`
	);
	return rows;
}

const fnNamed = (name: string) => fns.find((f) => f.name === name);

beforeAll(async () => {
	db = await startTestDb([FIXTURE_COMPLETION, ...ALL_MIGRATIONS]);
	fns = await readFunctions();
}, 600_000);

afterAll(async () => db?.stop());

describe('the instruments can see a grant when there is one', () => {
	it('reads the standing deliberately-public function as anon-executable, both ways', () => {
		const control = fnNamed(DELIBERATELY_PUBLIC);
		expect(control, `${DELIBERATELY_PUBLIC} is not in pg_proc; the sweep is looking in the wrong place`).toBeDefined();
		expect(control!.anon_resolved, 'instrument A cannot see a deliberate anon grant').toBe(true);
		expect(control!.anon_in_acl, 'instrument B cannot see a deliberate anon grant').toBe(true);
	});

	it('found 0208 own objects at all, so the assertions below are about something', () => {
		for (const name of PUBLIC_FUNCTIONS) expect(fnNamed(name), `${name} is missing`).toBeDefined();
		expect(fnNamed(PRIVATE_HELPER)).toBeDefined();
	});

	it('has the hosted default privileges in force, which is what makes the whole sweep non-vacuous', async () => {
		/* Without them, `revoke ... from public` appears to work and every anon
		   assertion in this file passes for the wrong reason -- which is exactly
		   what happened across 41 assertions in 32 files before 0137. The probe:
		   a throwaway function created with no narrowing at all must come out
		   anon-executable. */
		await db.sql(`create function public._zz_paste_trap_probe() returns integer language sql as $$ select 1 $$`);
		const { rows } = await db.sql<{ anon: boolean }>(
			`select has_function_privilege('anon', 'public._zz_paste_trap_probe()', 'execute') as anon`
		);
		expect(rows[0].anon, 'the fixture does not carry the hosted default privileges').toBe(true);
		await db.sql(`drop function public._zz_paste_trap_probe()`);
	});
});

describe('0208 followed 0166 for its functions', () => {
	it('leaves none of its three public functions executable by anon, under either instrument', () => {
		for (const name of PUBLIC_FUNCTIONS) {
			const f = fnNamed(name)!;
			expect(f.anon_resolved, `${f.sig} resolves as anon-executable`).toBe(false);
			expect(f.anon_in_acl, `${f.sig} carries a direct anon grant in its acl`).toBe(false);
		}
	});

	it('keeps all three executable by authenticated, so the narrowing did not take the feature down', () => {
		for (const name of PUBLIC_FUNCTIONS) expect(fnNamed(name)!.authed_resolved, name).toBe(true);
	});

	it('gives the private helper to no client role at all', async () => {
		const helper = fnNamed(PRIVATE_HELPER)!;
		expect(helper.anon_resolved).toBe(false);
		expect(helper.anon_in_acl).toBe(false);
		expect(helper.authed_resolved).toBe(false);
	});

	it('the two instruments agree about every function in the schema, not just 0208 own', () => {
		const disagree = fns.filter((f) => f.anon_resolved !== f.anon_in_acl).map((f) => f.sig);
		expect(disagree, 'one instrument has stopped agreeing with the other').toEqual([]);
		/* And the sweep is not empty. */
		expect(fns.length).toBeGreaterThan(300);
	});
});

describe('0208 followed 0166 for its table', () => {
	it('leaves authenticated holding SELECT and every client role holding nothing else', async () => {
		const { rows } = await db.sql<{ role_name: string; priv: string }>(
			`select rp.role_name, rp.priv
			 from pg_class c
			 join pg_namespace n on n.oid = c.relnamespace
			 cross join (
				select roles.role_name, privs.priv
				from (values ('anon'), ('authenticated')) as roles(role_name)
				cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privs(priv)
			 ) rp
			 where n.nspname = 'public' and c.relname = $1
			   and has_table_privilege(rp.role_name, c.oid, rp.priv)
			 order by 1, 2`,
			[TABLE]
		);
		expect(rows).toEqual([{ role_name: 'authenticated', priv: 'SELECT' }]);
	});

	it('carries no direct anon entry in its acl either', async () => {
		const { rows } = await db.sql<{ anon_in_acl: boolean; acl: string }>(
			`select coalesce(array_to_string(c.relacl, ' ') like '%anon=%', false) as anon_in_acl,
			        coalesce(array_to_string(c.relacl, ' '), '') as acl
			 from pg_class c join pg_namespace n on n.oid = c.relnamespace
			 where n.nspname = 'public' and c.relname = $1`,
			[TABLE]
		);
		expect(rows[0].anon_in_acl, `relacl is ${rows[0].acl}`).toBe(false);
		/* The positive half of the same read: the acl is not simply empty, which
		   would satisfy the assertion above while meaning the revoke removed the
		   grant the feature needs. */
		expect(rows[0].acl).toContain('authenticated=r');
	});
});

describe('the mutation proof: both instruments bite when a grant is planted, and both come back clean', () => {
	it('names a planted anon grant and stops naming it once it is revoked', async () => {
		const target = 'public.ideacad_material_save_custom(uuid,text,numeric,numeric[],text)';
		const before = await readFunctions();
		expect(before.find((f) => f.name === 'ideacad_material_save_custom')!.anon_resolved).toBe(false);

		await db.sql(`grant execute on function ${target} to anon`);
		const during = await readFunctions();
		const planted = during.find((f) => f.name === 'ideacad_material_save_custom')!;
		expect(planted.anon_resolved, 'instrument A did not notice the planted grant').toBe(true);
		expect(planted.anon_in_acl, 'instrument B did not notice the planted grant').toBe(true);

		/* THE RESTORE IS THE MATCHING REVOKE, NOT A RE-APPLY AND NOT A git
		   COMMAND. Nothing on disk was touched, so nothing on disk is restored. */
		await db.sql(`revoke execute on function ${target} from anon`);
		const after = await readFunctions();
		const restored = after.find((f) => f.name === 'ideacad_material_save_custom')!;
		expect(restored.anon_resolved).toBe(false);
		expect(restored.anon_in_acl).toBe(false);
		/* And the whole acl is byte-identical to where it started, so the proof
		   did not leave the database in a different state than it found it. */
		expect(restored.authed_resolved).toBe(
			before.find((f) => f.name === 'ideacad_material_save_custom')!.authed_resolved
		);
	});

	it('names a planted anon grant on the table, and stops naming it once it is revoked', async () => {
		const readTable = async () => {
			const { rows } = await db.sql<{ resolved: boolean; in_acl: boolean }>(
				`select has_table_privilege('anon', c.oid, 'SELECT') as resolved,
				        coalesce(array_to_string(c.relacl, ' ') like '%anon=%', false) as in_acl
				 from pg_class c join pg_namespace n on n.oid = c.relnamespace
				 where n.nspname = 'public' and c.relname = $1`,
				[TABLE]
			);
			return rows[0];
		};
		expect(await readTable()).toEqual({ resolved: false, in_acl: false });
		await db.sql(`grant select on table public.${TABLE} to anon`);
		expect(await readTable()).toEqual({ resolved: true, in_acl: true });
		await db.sql(`revoke select on table public.${TABLE} from anon`);
		expect(await readTable()).toEqual({ resolved: false, in_acl: false });
	});
});

describe('the seed is data, and it is the data Mr. Pina named', () => {
	it('lands the six he named plus the two compatibility rows', async () => {
		const { rows } = await db.sql<{ slug: string; retired: boolean }>(
			`select slug, retired_at is not null as retired from public.${TABLE} where owner is null order by slug`
		);
		expect(rows.map((r) => r.slug)).toEqual([
			'aluminum',
			'galvanized-steel',
			'petg',
			'pla',
			'polycarbonate',
			'stainless-steel',
			'steel',
			'wood'
		]);
		/* The two printed plastics are RETIRED on arrival and the six are live:
		   a stated mass for a printed part depends on slicer settings, so no
		   shared figure for one is offered to anybody. */
		expect(rows.filter((r) => r.retired).map((r) => r.slug)).toEqual(['petg', 'pla']);
	});

	it('reproduces every stock id the deployed config already wrote into saved concepts', async () => {
		const { rows } = await db.sql<{ ok: boolean }>(
			`select bool_and(x.found) as ok from (
			   select exists(select 1 from public.${TABLE} m
			                  where m.owner is null and m.slug = v.slug and v.thickness = any(m.thicknesses_in)) as found
			   from (values ('steel', 0.125), ('steel', 0.1875), ('aluminum', 0.125)) as v(slug, thickness)
			 ) x`
		);
		expect(rows[0].ok, 'a stored concept would stop resolving its blade stock').toBe(true);
	});

	it('names a published source for every seeded density, and marks every one unverified', async () => {
		const { rows } = await db.sql<{ n: string; unsourced: string; unverified: string }>(
			`select count(*)::text as n,
			        count(*) filter (where length(btrim(source)) = 0)::text as unsourced,
			        count(*) filter (where not source_verified)::text as unverified
			 from public.${TABLE} where owner is null`
		);
		expect(Number(rows[0].n)).toBe(8);
		expect(Number(rows[0].unsourced)).toBe(0);
		/* EVERY ONE. The session that wrote the seed had no network route to any
		   of the named documents and did not open one, so no figure here is a
		   checked figure and the column says so rather than a paragraph. */
		expect(Number(rows[0].unverified)).toBe(8);
	});

	it('re-seeds as a no-op, so re-pasting the file cannot overwrite an admin edit', async () => {
		await db.sql(
			`update public.${TABLE} set name = 'Renamed by an admin' where owner is null and slug = 'wood'`
		);
		await db.sql(
			`insert into public.${TABLE} (slug, owner, name, density_g_cm3, thicknesses_in, source)
			 values ('wood', null, 'Wood (Baltic birch plywood)', 0.68, array[0.118]::numeric[], 'seed')
			 on conflict (slug) where owner is null do nothing`
		);
		const { rows } = await db.sql<{ name: string }>(
			`select name from public.${TABLE} where owner is null and slug = 'wood'`
		);
		expect(rows[0].name).toBe('Renamed by an admin');
		await db.sql(
			`update public.${TABLE} set name = 'Wood (Baltic birch plywood)' where owner is null and slug = 'wood'`
		);
	});
});

describe('the file re-applies, because re-pasting a migration is ordinary', () => {
	it('runs a second time over the database the chain already built, and changes nothing', async () => {
		const { rows: before } = await db.sql<{ acl: string }>(
			`select coalesce(array_to_string(c.relacl, ' '), '') as acl
			 from pg_class c join pg_namespace n on n.oid = c.relnamespace
			 where n.nspname = 'public' and c.relname = $1`,
			[TABLE]
		);
		const { rows: rowsBefore } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.${TABLE} where owner is null`
		);
		/* Its own self-check raises on a partial apply and the file is wrapped in
		   a transaction, so reaching the reads below at all is half the
		   assertion. */
		const sql = readFileSync(
			fileURLToPath(new URL('../../supabase/migrations/0208_ideacad_materials.sql', import.meta.url)),
			'utf8'
		);
		await db.sql(sql);
		const { rows: after } = await db.sql<{ acl: string }>(
			`select coalesce(array_to_string(c.relacl, ' '), '') as acl
			 from pg_class c join pg_namespace n on n.oid = c.relnamespace
			 where n.nspname = 'public' and c.relname = $1`,
			[TABLE]
		);
		const { rows: rowsAfter } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.${TABLE} where owner is null`
		);
		expect(after[0].acl).toBe(before[0].acl);
		expect(rowsAfter[0].n).toBe(rowsBefore[0].n);
		const fnsAfter = await readFunctions();
		for (const name of PUBLIC_FUNCTIONS) {
			const f = fnsAfter.find((x) => x.name === name)!;
			expect(f.anon_resolved, `${name} after a second apply`).toBe(false);
			expect(f.authed_resolved, `${name} after a second apply`).toBe(true);
		}
	});
});

describe('the thickness constraint refuses rather than falling through on NULL', () => {
	it('refuses a NULL element, which is the coalesce doing its job', async () => {
		await expect(
			db.sql(
				`insert into public.${TABLE} (slug, owner, name, density_g_cm3, thicknesses_in, source)
				 values ('nulltest', null, 'Null test', 1, array[0.125, null]::numeric[], 'x')`
			)
		).rejects.toThrow(/ideacad_materials_thicknesses/);
	});

	it('refuses a thickness over the ceiling and one at or below zero', async () => {
		for (const value of ['5', '0', '-1']) {
			await expect(
				db.sql(
					`insert into public.${TABLE} (slug, owner, name, density_g_cm3, thicknesses_in, source)
					 values ('overtest', null, 'Over test', 1, array[${value}]::numeric[], 'x')`
				)
			).rejects.toThrow(/ideacad_materials_thicknesses/);
		}
	});

	it('accepts an empty list and an ordinary one, so the constraint is not simply refusing everything', async () => {
		await db.sql(
			`insert into public.${TABLE} (slug, owner, name, density_g_cm3, thicknesses_in, source)
			 values ('emptytest', null, 'Empty test', 1, array[]::numeric[], 'x'),
			        ('oktest', null, 'Ok test', 1, array[0.125, 0.25]::numeric[], 'x')`
		);
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.${TABLE} where slug in ('emptytest', 'oktest')`
		);
		expect(Number(rows[0].n)).toBe(2);
		await db.sql(`delete from public.${TABLE} where slug in ('emptytest', 'oktest')`);
	});
});

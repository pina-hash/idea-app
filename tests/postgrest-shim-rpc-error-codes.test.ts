// tests/postgrest-shim-rpc-error-codes.test.ts
//
// A MISSING FUNCTION AND A LIVE ONE RAISING ARE TWO ANSWERS, AND THE FIXTURE
// USED TO GIVE ONE.
//
// `tests/db/postgrest-shim.ts` returned `{ code: 'PGRST202' }` for EVERY throw
// out of an RPC call. `PGRST202` is the one code this codebase degrades on --
// deliberately, and on that code ALONE, in `$lib/server/admin.ts`,
// `$lib/classroom/transports.ts`, `$lib/gauntlet/knowledge-clock.ts`,
// `$lib/server/gauntlet-authoring.ts`, the short-link load and the reference
// load. The rule exists so a runtime error INSIDE a function fails closed
// instead of falling through to a weaker read. A fixture that answers PGRST202
// for a refusal makes that rule untestable in the one direction that matters,
// and it is not a hypothetical: a mutant that degraded on ANY error rather than
// on PGRST202 alone survived all ten database-driven assertions of the roster
// read, because through this shim there was no other error for it to have.
//
// WHAT POSTGREST ACTUALLY DOES, which is what the shim now does. A call it
// cannot resolve against its schema cache -- no such function, or no overload
// matching the named arguments -- is `PGRST202`. A call that RESOLVED and then
// raised is reported with the SQLSTATE as the code: `P0001` for a `raise
// exception`, `42501` for a permission denial, class 23 for a constraint.
// Postgres draws exactly that line itself with `42883` (undefined_function), so
// the discriminator is the driver's own SQLSTATE and not a list this fixture
// maintains.
//
// THIS FILE IS ABOUT THE FIXTURE, NOT ABOUT A FEATURE, which is why the second
// half drives a REAL shipped transport rather than asserting on the shim twice.
// `loadSectionRoster` is the exact call site the surviving mutant lived in, and
// the two situations it has to tell apart -- 0138 not applied yet, versus 0138
// applied and its function raising -- now produce two different answers. Under
// the conflated shim they produced the same one.
//
// THE PROBE FUNCTIONS ARE CREATED HERE RATHER THAN BORROWED FROM A MIGRATION,
// and `classroom_section_roster` is created under its REAL name and REAL
// signature. The question is what the transport does with a raise, not what
// 0138 raises about -- 0138's own semantics are proven in raw SQL by
// `tests/classroom-manager-exclusion.test.ts`, and reproducing them here would
// be a second copy of them. Creating the probe is the same instrument
// `postgrest-shim-rpc-shape.test.ts` already uses for `shim_shape_probe`.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDb, createUser, type TestDb, type SeededUser } from './db/harness';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import { loadSectionRoster } from '../src/lib/classroom/transports';
import { isTransientSqlstate, rpcErrorStatus } from '../src/lib/pg-errors';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The same short chain `postgrest-shim-rpc-shape.test.ts` uses: it owns a
 * set-returning function (`admin_list`) and a scalar one (`is_admin`), which is
 * everything the shim half needs. 0137 last, per the harness note.
 */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0137_anon_execute_sweep.sql'
] as const;

let db: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;
let student: SeededUser;

const client = () => createPostgrestShim(db, fks, student.id);

beforeAll(async () => {
	db = await startTestDb([...CHAIN]);
	fks = await loadForeignKeys(db);
	student = await createUser(db, 'stella@boscotech.net', 'Stella Gates');

	// A scalar function that RESOLVES and then raises. `P0001` is what a
	// plpgsql `raise exception` with no errcode produces, and it is the code
	// every considered refusal in this schema arrives as.
	await db.sql(`
		create function public.shim_raise_probe() returns boolean
		language plpgsql stable as $$
		begin
			raise exception 'Only a manager can read this roster.';
		end $$;
		grant execute on function public.shim_raise_probe() to authenticated;
	`);

	// The same, raising a NAMED sqlstate from the transient whitelist, so the
	// code the shim passes through is one `$lib/pg-errors` actually partitions
	// on rather than the generic one.
	await db.sql(`
		create function public.shim_conflict_probe() returns boolean
		language plpgsql stable as $$
		begin
			raise exception 'two writers raced' using errcode = '23505';
		end $$;
		grant execute on function public.shim_conflict_probe() to authenticated;
	`);

	// SET-RETURNING and raising: the set path and the scalar path share one
	// catch, and a fix applied to only one of them is the shape to guard against.
	await db.sql(`
		create function public.shim_raise_set_probe() returns table (a int)
		language plpgsql stable as $$
		begin
			raise exception 'the set path raised too';
		end $$;
		grant execute on function public.shim_raise_set_probe() to authenticated;
	`);

	// EXISTS, and the caller may not execute it. `42501` -- a real answer with a
	// real function behind it, and the one a definer helper missing its grant
	// gives (the 0070 lesson 0109 writes down).
	await db.sql(`
		create function public.shim_ungranted_probe() returns boolean
		language sql stable as $$ select true $$;
		revoke all on function public.shim_ungranted_probe()
			from public, anon, authenticated, service_role;
	`);
});

afterAll(async () => {
	await db?.stop();
});

describe('a call that never resolved is still PGRST202', () => {
	it('answers PGRST202 for a name the schema does not hold', async () => {
		const { data, error } = await client().rpc('no_such_function_anywhere');
		expect(data).toBeNull();
		expect(error?.code).toBe('PGRST202');
	});

	it('answers PGRST202 for a call naming a parameter the function lacks', async () => {
		// The 0096 signature trap. Postgres raises `42883` for this exactly as it
		// does for an unknown name, and PostgREST answers both from its schema
		// cache, so the two are ONE answer rather than two that happen to agree.
		const { error } = await client().rpc('admin_list', { p_not_a_parameter: 1 });
		expect(error?.code).toBe('PGRST202');
	});
});

describe('a call that resolved and then raised carries its own SQLSTATE', () => {
	it('reports a plpgsql raise as P0001, with the raise text', async () => {
		const { data, error } = await client().rpc('shim_raise_probe');
		expect(data).toBeNull();
		// THE FINDING. This was `PGRST202` before, which is what made a refusal
		// indistinguishable from an unapplied migration.
		expect(error?.code).toBe('P0001');
		expect(error?.code).not.toBe('PGRST202');
		expect(error?.message).toContain('Only a manager can read this roster.');
	});

	it('reports a permission denial as 42501, not as a missing function', async () => {
		const { error } = await client().rpc('shim_ungranted_probe');
		expect(error?.code).toBe('42501');
	});

	it('reports the SET path the same way -- one catch, not two', async () => {
		const { data, error } = await client().rpc('shim_raise_set_probe');
		expect(data).toBeNull();
		expect(error?.code).toBe('P0001');
		expect(error?.message).toContain('the set path raised too');
	});

	it('passes a code through unclassified, so $lib/pg-errors can read it', async () => {
		// THE REACHABILITY POINT. The transient/refusal partition that ships reads
		// exactly this field. Through the conflated shim it could never see a
		// SQLSTATE at all from a database test, so the whitelist was assertable
		// only against hand-written error objects.
		const { error } = await client().rpc('shim_conflict_probe');
		expect(error?.code).toBe('23505');
		expect(isTransientSqlstate(error?.code)).toBe(true);
		expect(rpcErrorStatus(error?.code)).toBe(503);

		// And the negative control on the same partition, from the same source.
		const refusal = await client().rpc('shim_raise_probe');
		expect(isTransientSqlstate(refusal.error?.code)).toBe(false);
		expect(rpcErrorStatus(refusal.error?.code)).toBe(400);
	});

	it('rethrows a throw carrying no SQLSTATE rather than dressing it as one', async () => {
		// A DRIVER FAILURE IS NOT A DATABASE ANSWER, and reporting one as
		// PGRST202 would put whatever load is driving it on its degrade rung over
		// a bug in the test. Driven for real rather than reasoned about: a
		// parameter node-postgres cannot serialize throws a plain `TypeError` out
		// of the query with no `code` on it at all, which is the only shape of
		// throw inside the try that is not a `DatabaseError`.
		await db.sql(`
			create function public.shim_param_probe(p_x text) returns boolean
			language sql stable as $$ select true $$;
			grant execute on function public.shim_param_probe(text) to authenticated;
		`);
		const circular: Record<string, unknown> = {};
		circular.self = circular;

		// POSITIVE CONTROL: the same call with an ordinary value answers cleanly,
		// so the rejection below is the VALUE and not the probe function.
		const fine = await client().rpc('shim_param_probe', { p_x: 'ok' });
		expect(fine.error).toBeNull();
		expect(fine.data).toBe(true);

		await expect(client().rpc('shim_param_probe', { p_x: circular })).rejects.toThrow(
			/circular structure/
		);
	});

	it('keeps a fixture defect OUTSIDE the try, where it can still propagate', async () => {
		// The other half of the same rule, and the reason `routineShape` is
		// consulted before the try opens: an unmodelled `setof <scalar>` is a gap
		// in this fixture, not an answer PostgREST gives, so it must reach the
		// test author rather than any `error` object.
		await db.sql(`
			create function public.shim_scalar_set_probe() returns setof int
			language sql stable as $$ select 1 union all select 2 $$;
			grant execute on function public.shim_scalar_set_probe() to authenticated;
		`);
		await expect(client().rpc('shim_scalar_set_probe')).rejects.toThrow(
			/set of bare scalars/
		);
	});
});

describe('the degrade rung the conflation made untestable', () => {
	/**
	 * `loadSectionRoster` degrades to the plain table select on PGRST202 ALONE,
	 * and fails closed on anything else. Both rungs are driven with a NULL
	 * section, which is the home feed's call: its degraded answer is
	 * `{ rows: [], managesReady: false }` and reads no table at all, so the
	 * assertion is about the transport's error branch and not about whether
	 * `classroom_enrollments` happens to exist on this chain.
	 */
	const asClient = () => client() as unknown as SupabaseClient;

	it('POSITIVE CONTROL: with 0138 unapplied it DEGRADES, and says it could not tell', async () => {
		const res = await loadSectionRoster(asClient(), null);
		expect(res.ok).toBe(true);
		expect(res.ok && res.data.managesReady).toBe(false);
		expect(res.ok && res.data.rows).toEqual([]);
	});

	it('with the function present and RAISING it fails closed, carrying the refusal', async () => {
		// Created under the real name and signature, so `loadSectionRoster`'s own
		// unmodified call reaches it.
		await db.sql(`
			create function public.classroom_section_roster(p_section_id uuid default null)
			returns table (section_id uuid, student_email text, display_name text,
			               active boolean, updated_at timestamptz, manages boolean)
			language plpgsql stable security definer set search_path = public as $$
			begin
				raise exception 'Only a manager of this section can read its roster.';
			end $$;
			grant execute on function public.classroom_section_roster(uuid) to authenticated;
		`);

		const res = await loadSectionRoster(asClient(), null);

		// THE ASSERTION THE CONFLATED SHIM COULD NOT MAKE. Before this fix the
		// raise arrived as PGRST202 and this call answered
		// `{ ok: true, managesReady: false }` -- byte for byte the control above.
		// A manager exclusion that silently reads as "cannot tell" is exactly the
		// weaker path the PGRST202-alone rule exists to refuse.
		expect(res.ok).toBe(false);
		expect(!res.ok && res.message).toContain('Only a manager of this section can read its roster.');
	});
});

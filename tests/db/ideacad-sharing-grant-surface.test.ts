/**
 * 0205's own grant surface, asserted from the catalog rather than from the
 * migration's self-check passing.
 *
 * WHY THIS EXISTS AS A TEST AND NOT ONLY AS THE FILE'S OWN do-BLOCK. The
 * self-check tells you the self-check ran. This reads proacl and
 * has_function_privilege back on a database the whole chain was applied to, on
 * every suite run, which is the durable half -- exactly the split 0199's own
 * header describes. And 0201 is the reason it is not optional: it shipped ten
 * anon-executable functions and four wide-open tables past a review, because
 * `revoke ... from public` looks correct and does nothing on this project.
 *
 * THE FIXTURE CARRIES THE PROJECT'S DEFAULT PRIVILEGES (tests/db/supabase-stub.sql
 * sets them), so this is not vacuous: without those three lines the bare
 * `from public` form would appear to work and every assertion here would pass
 * over a database that had never had an anon grant to remove. The first test
 * asserts the defaults are actually in force.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { startTestDb, type TestDb } from './harness';

const ALL_MIGRATIONS = readdirSync(new URL('../../supabase/migrations', import.meta.url))
	.filter((file) => file.endsWith('.sql'))
	.sort();
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

let db: TestDb;

beforeAll(async () => {
	db = await startTestDb([FIXTURE_COMPLETION, ...ALL_MIGRATIONS]);
}, 600_000);

afterAll(async () => db?.stop());

describe('0205: the instrument', () => {
	it('is running on a fixture that really does carry the anon default privileges', async () => {
		// The positive control for the whole file. A function created with no
		// deliberate grant must come out anon-executable here, or this database is
		// not the one production is and nothing below means anything.
		await db.sql(
			"create or replace function public._ideacad_defaults_probe() returns integer language sql as 'select 1'"
		);
		const { rows } = await db.sql<{ anon_x: boolean }>(
			"select has_function_privilege('anon', 'public._ideacad_defaults_probe()', 'execute') as anon_x"
		);
		expect(rows[0].anon_x).toBe(true);
		await db.sql('drop function public._ideacad_defaults_probe()');
	});

	it('can still see a grant that IS deliberately held by anon', async () => {
		// app_short_link_target is anon-executable on purpose (0137 keeps it:
		// printed handouts resolve before any session exists). A sweep that
		// answered false here would be looking in the wrong place.
		const { rows } = await db.sql<{ anon_x: boolean }>(
			"select has_function_privilege('anon', 'public.app_short_link_target(text)', 'execute') as anon_x"
		);
		expect(rows[0].anon_x).toBe(true);
	});
});

describe('0205: no ideacad function is executable by anon', () => {
	it('sweeps the whole ideacad surface by name prefix and finds none', async () => {
		const { rows } = await db.sql<{ sig: string; anon_x: boolean; authed_x: boolean }>(
			`select p.oid::regprocedure::text as sig,
			        has_function_privilege('anon', p.oid, 'execute') as anon_x,
			        has_function_privilege('authenticated', p.oid, 'execute') as authed_x
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname ~ '^_?ideacad'
			 order by 1`
		);
		// The sweep found something to sweep: 0201's ten, 0205's five, and the
		// four private predicates.
		expect(rows).toHaveLength(19);
		expect(rows.filter((r) => r.anon_x).map((r) => r.sig)).toEqual([]);
	});

	it('leaves 0201/0202 grants exactly as it found them, which is the scope decision', async () => {
		// 0205 touches the grant surface of what it INTRODUCES and nothing else.
		// Re-revoking 0201's seven widened functions was a first draft, was
		// measured unnecessary (a create or replace preserves the acl), and had a
		// real cost: it closed them in the deliberate without-0202 world that
		// tests/db/ideacad-grants-anon-execute-surface.test.ts section E asserts
		// they are OPEN in, quietly falsifying another migration's control.
		const body = readFileSync(
			new URL('../../supabase/migrations/0205_ideacad_document_sharing.sql', import.meta.url),
			'utf8'
		);
		const grantSection = body.slice(body.indexOf('revoke all on function'));
		for (const untouched of [
			'ideacad_open_document(uuid)',
			'ideacad_roster(uuid)',
			'ideacad_set_editor(uuid,text,jsonb)',
			'ideacad_save_concept(uuid,jsonb,integer)',
			'ideacad_new_concept(uuid,text,jsonb)',
			'ideacad_commit_concept(uuid)'
		]) {
			expect(grantSection).not.toContain(untouched);
		}
		// The control: the five it DOES name are all there.
		for (const mine of [
			'ideacad_share_document(uuid,text,text)',
			'ideacad_unshare_document(uuid,text)',
			'ideacad_document_grants(uuid)',
			'ideacad_open_shared_document(uuid)',
			'ideacad_shared_with_me(uuid)'
		]) {
			expect(grantSection).toContain(mine);
		}
	});

	it('grants EXECUTE to authenticated on every public ideacad RPC and on no private helper', async () => {
		const { rows } = await db.sql<{ proname: string; sig: string; authed_x: boolean }>(
			`select p.proname, p.oid::regprocedure::text as sig,
			        has_function_privilege('authenticated', p.oid, 'execute') as authed_x
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname ~ '^_?ideacad'
			 order by 1`
		);
		const publicRpcs = rows.filter((r) => !r.proname.startsWith('_'));
		const privateHelpers = rows.filter((r) => r.proname.startsWith('_'));
		expect(publicRpcs).toHaveLength(15);
		expect(privateHelpers).toHaveLength(4);
		// A public RPC authenticated cannot call is the feature switched off.
		expect(publicRpcs.filter((r) => !r.authed_x).map((r) => r.sig)).toEqual([]);
		// EXACTLY TWO private predicates hold it, and they are the two named
		// inside the section 3 policies. A policy expression is evaluated as the
		// QUERYING role, so those two MUST have it or every read of these tables
		// fails with "permission denied for function"; the other two are reached
		// only from SECURITY DEFINER bodies and holding it would be surface
		// nobody asked for.
		expect(privateHelpers.filter((r) => r.authed_x).map((r) => r.proname).sort()).toEqual([
			'_ideacad_can_read_document',
			'_ideacad_manages_document'
		]);
	});

	it('keeps all four private predicates on service_role, per 0166', async () => {
		const { rows } = await db.sql<{ sig: string; svc_x: boolean }>(
			`select p.oid::regprocedure::text as sig,
			        has_function_privilege('service_role', p.oid, 'execute') as svc_x
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname like '\\_ideacad%'
			 order by 1`
		);
		expect(rows).toHaveLength(4);
		expect(rows.filter((r) => !r.svc_x)).toEqual([]);
	});
});

describe('0205: the grant table holds exactly SELECT for authenticated', () => {
	const privileges = [
		'select',
		'insert',
		'update',
		'delete',
		'truncate',
		'references',
		'trigger'
	] as const;

	it('gives anon nothing at all, on any of the seven privileges', async () => {
		const held: string[] = [];
		for (const privilege of privileges) {
			const { rows } = await db.sql<{ ok: boolean }>(
				`select has_table_privilege('anon', 'public.ideacad_grants', $1) as ok`,
				[privilege]
			);
			if (rows[0].ok) held.push(privilege);
		}
		expect(held).toEqual([]);
	});

	it('gives authenticated SELECT and nothing else', async () => {
		const held: string[] = [];
		for (const privilege of privileges) {
			const { rows } = await db.sql<{ ok: boolean }>(
				`select has_table_privilege('authenticated', 'public.ideacad_grants', $1) as ok`,
				[privilege]
			);
			if (rows[0].ok) held.push(privilege);
		}
		// RLS covers none of TRUNCATE, REFERENCES or TRIGGER, so the revoke has to
		// be explicit and this is where that is checked.
		expect(held).toEqual(['select']);
	});

	it('has row level security enabled, with exactly one SELECT policy and no write policy', async () => {
		const rls = await db.sql<{ on: boolean }>(
			"select relrowsecurity as on from pg_class where oid = 'public.ideacad_grants'::regclass"
		);
		expect(rls.rows[0].on).toBe(true);
		const { rows } = await db.sql<{ cmd: string; policyname: string }>(
			"select cmd, policyname from pg_policies where schemaname = 'public' and tablename = 'ideacad_grants'"
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].cmd).toBe('SELECT');
	});

	it('created no sequence, so 0203’s sequence sweep has nothing new to cover', async () => {
		// A serial or identity column would have arrived with its sequence granted
		// to both client roles by the same bootstrap, which is 0203's territory.
		const { rows } = await db.sql<{ relname: string }>(
			`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
			 where n.nspname = 'public' and c.relkind = 'S' and c.relname like 'ideacad%'`
		);
		expect(rows).toEqual([]);
	});
});

describe('0205: re-applying it is ordinary', () => {
	it('applies a second time over its own result and leaves the grants where they were', async () => {
		const sql = readdirSync(new URL('../../supabase/migrations', import.meta.url))
			.filter((f) => f.startsWith('0205_'))
			.map((f) => new URL(`../../supabase/migrations/${f}`, import.meta.url));
		expect(sql).toHaveLength(1);
		const body = await (await import('node:fs/promises')).readFile(sql[0], 'utf8');
		// The file's own self-check raises on a wrong grant surface, so a clean
		// second apply IS the idempotence assertion.
		await db.sql(body);
		const { rows } = await db.sql<{ sig: string }>(
			`select p.oid::regprocedure::text as sig
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname ~ '^_?ideacad'
			   and has_function_privilege('anon', p.oid, 'execute')`
		);
		expect(rows.map((r) => r.sig)).toEqual([]);
		const grants = await db.sql<{ ok: boolean }>(
			"select has_table_privilege('anon', 'public.ideacad_grants', 'select') as ok"
		);
		expect(grants.rows[0].ok).toBe(false);
	});
});

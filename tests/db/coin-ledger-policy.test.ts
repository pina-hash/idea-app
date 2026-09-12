// tests/db/coin-ledger-policy.test.ts
//
// WHAT THIS FILE IS FOR, AND WHY IT IS NOT THE MIGRATION IT WAS ASKED TO PROVE.
//
// docs/decisions/entries/02-coin-ledger-test-rls-policy.md asked for a "test RLS
// policy" to be removed from the coin ledger. It was raised on 2026-08-31 and
// answered on 2026-09-12, and the audit that was supposed to precede the
// migration found there is nothing to remove: no policy on any coin table is a
// test, a debug or a temporary one, and `coin_transactions` -- the ledger -- has
// exactly ONE policy, the own-row-or-admin SELECT `0070` wrote for it. The
// premise names nothing that exists. So there is no `0204`, and this file is
// what the bundle leaves behind instead.
//
// THE REASON IT IS A TEST RATHER THAN A NOTE IN A LEDGER ENTRY. The entry's own
// `Tree check` line already said this on 2026-09-02, by grep, and it was audited
// again by hand on 2026-09-12 because a grep over migration TEXT is not the
// catalog: a policy can be created in one file and replaced in another, and
// `create policy` statements counted across 201 files do not say what a database
// carrying all of them ends up with. Doing that audit by hand a third time is
// the failure mode, not the work. This file asks the CATALOG, after the whole
// chain, so the answer is re-derived on every suite run.
//
// AND THE REGRESSION IT GUARDS IS SILENT, which is this repo's bar for adding a
// test at all. A permissive policy added to the coin ledger -- a `using (true)`
// for a new board, an `anon` grant for a public surface, a genuine debugging
// policy somebody forgets -- breaks nothing on screen, fails no type check, and
// publishes every student's balance to every signed-in student. Nothing else in
// the suite reads `pg_policies` for a coin table.
//
// WHAT IT ASSERTS, AND WHY BY NAME RATHER THAN BY COUNT. A count passes on
// exactly the swap that matters: one deliberate policy dropped and one loose one
// added holds the count at 15. So section A pins the ledger's own policy field
// by field, section B pins the whole coin policy surface as a NAME-TO-TABLE map,
// and section C is the absence sweep -- test-shaped names, `anon` roles, and
// `using (true)` on the ledger -- each one PLANTED AGAINST in section D, because
// an absence over an absence is the assertion most likely to be reading the
// wrong column and coming back clean.

import { readdirSync } from 'node:fs';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { startTestDb, type TestDb } from './harness';

/**
 * The whole chain, in file order, read off disk rather than listed -- a
 * migration that adds a coin policy tomorrow is reconciled the day it lands
 * rather than the day somebody remembers to extend an array here.
 */
const MIGRATION_DIR = new URL('../../supabase/migrations', import.meta.url);
const ALL_MIGRATIONS = readdirSync(MIGRATION_DIR)
	.filter((f) => f.endsWith('.sql'))
	.sort();

/** Applied before 0001: auth.jwt() and the empty realtime publication. */
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

/** The ledger itself. Every other coin table is a neighbour of it. */
const LEDGER = 'coin_transactions';

/**
 * The whole coin policy surface after the chain, as it stood on 2026-09-12:
 * one policy per coin table, every one of them SELECT, every one of them to
 * `authenticated` alone. Stated as a map so a rename, a re-table and a swap all
 * redden, where a count would pass on the swap.
 *
 * `coin_public_id_secret` is deliberately absent: it carries the salt behind the
 * public ledger's opaque ids, has RLS enabled and NO policy at all, which is how
 * a table denies every client (0089).
 */
const COIN_POLICIES: Readonly<Record<string, string>> = {
	coin_categories: 'read coin categories',
	coin_contract_claims: 'read own or admin coin contract claims',
	coin_contracts: 'read coin contracts',
	coin_import_batches: 'admins read coin import batches',
	coin_import_mappings: 'admins read coin import mappings',
	coin_role_application_answers: 'admins read coin role application answers',
	coin_role_applications: 'admins read coin role applications',
	coin_role_definitions: 'admins read coin role definitions',
	coin_role_holders: 'admins read coin role holders',
	coin_role_quiz_questions: 'admins read coin role quiz questions',
	coin_section_students: 'admins read coin section students',
	coin_sections: 'admins read coin sections',
	coin_students: 'admins read coin students',
	coin_transactions: 'read own or admin coin transactions',
	coin_wage_tiers: 'read own or admin wage tier'
};

/**
 * The only two coin reads that are `using (true)`, both to `authenticated`, both
 * commented as deliberate in the same breath as "no insert/update/delete
 * policies": the PRICE LIST (0070) and the CONTRACT LIST (0077). Neither is the
 * ledger, and neither carries a student's balance. Pinned here so a third one
 * arriving is a decision somebody has to make rather than a line somebody adds.
 */
const DELIBERATE_OPEN_READS = ['coin_categories', 'coin_contracts'] as const;

/**
 * Word-bounded on purpose. An unanchored `temp` matches `attempts`, which is how
 * a sweep for test-shaped names comes back with two hits on
 * `gauntlet_speedrun_attempts` and `greenline_track_attempts` and reads as a
 * finding. Measured: the unanchored form reports 2 schema-wide, both false.
 */
const TEST_SHAPED = String.raw`\y(test|debug|temp|tmp|todo|scratch|remove me)\y`;

interface PolicyRow {
	tablename: string;
	policyname: string;
	cmd: string;
	permissive: string;
	roles: string[];
	qual: string | null;
	with_check: string | null;
}

const POLICY_SELECT = `
	select tablename, policyname, cmd, permissive,
	       -- pg_policies.roles is name[], an oid node-postgres carries no array
	       -- parser for, so it arrives as the raw literal {authenticated} and
	       -- every array method on it throws. Cast in SQL, not in the test.
	       roles::text[] as roles,
	       qual, with_check
	from pg_policies
	where schemaname = 'public' and tablename like 'coin%'
	order by tablename, policyname
`;

let db: TestDb;

beforeAll(async () => {
	db = await startTestDb([FIXTURE_COMPLETION, ...ALL_MIGRATIONS]);
}, 600_000);

afterAll(async () => {
	await db?.stop();
});

describe('the coin ledger carries one policy, and it is the one 0070 wrote', () => {
	it('applied the whole chain, not half a schema', () => {
		// A chain that stopped early is a green run over a schema that never
		// existed. 201 files on 2026-09-12; the floor, not the number.
		expect(
			ALL_MIGRATIONS.length,
			'Read off disk. A short chain makes every assertion below vacuous.'
		).toBeGreaterThanOrEqual(201);
		expect(ALL_MIGRATIONS).toContain('0070_coin_economy.sql');
		expect(ALL_MIGRATIONS).toContain('0157_coin_public_surface_hardening.sql');
	});

	// -----------------------------------------------------------------------
	// A. THE LEDGER ITSELF, FIELD BY FIELD.
	// -----------------------------------------------------------------------

	it('has RLS enabled on the ledger, with exactly one policy on it', async () => {
		const rls = await db.sql<{ relrowsecurity: boolean }>(
			`select c.relrowsecurity
			 from pg_class c join pg_namespace n on n.oid = c.relnamespace
			 where n.nspname = 'public' and c.relname = $1 and c.relkind = 'r'`,
			[LEDGER]
		);
		expect(rls.rows, `${LEDGER} must exist as a table after the chain`).toHaveLength(1);
		expect(rls.rows[0].relrowsecurity, 'RLS off makes every policy below decoration').toBe(true);

		const mine = await db.sql<PolicyRow>(POLICY_SELECT);
		const ledger = mine.rows.filter((p) => p.tablename === LEDGER);
		expect(ledger.map((p) => p.policyname)).toEqual([COIN_POLICIES[LEDGER]]);
	});

	it('reads own-row-or-admin, for SELECT, to authenticated alone', async () => {
		const rows = (await db.sql<PolicyRow>(POLICY_SELECT)).rows.filter(
			(p) => p.tablename === LEDGER
		);
		const p = rows[0];
		expect(p.cmd, 'A ledger policy that is not SELECT-only is a client write path').toBe('SELECT');
		expect(p.permissive).toBe('PERMISSIVE');
		expect(
			[...p.roles].sort(),
			'anon or public here publishes every balance to the internet'
		).toEqual(['authenticated']);
		expect(p.with_check, 'A WITH CHECK on a SELECT policy means somebody added a write').toBeNull();

		const qual = p.qual ?? '';
		expect(qual, 'The own-row half').toContain('student_email');
		expect(qual, 'The own-row half reads the caller, never a parameter').toContain(
			'current_user_email()'
		);
		expect(qual, 'The staff half').toContain('is_admin()');
		// The two halves are an OR, not an AND: an admin reads rows that are not
		// theirs, which is the whole point of the second half.
		expect(qual).toMatch(/\bOR\b/i);
		// `is_teacher()` returns is_admin() (the 0067 naming trap), so it would
		// pass an is_admin() grep while reading as a wider gate.
		expect(qual, 'The 0067 naming trap: is_teacher() must not be the spelling here').not.toContain(
			'is_teacher'
		);
		// `true` anywhere in the qual would make the two halves theatre.
		expect(qual.trim().toLowerCase()).not.toBe('true');
	});

	it('has no write policy of any kind on the ledger', async () => {
		// 0070 says so in a comment; this is the catalog saying it. Every coin
		// write goes through a SECURITY DEFINER RPC gated on is_admin(), with
		// classroom_song_approve (0145) the one named non-admin exception, and
		// that one mints its row inside a definer too -- so a write POLICY here
		// is a second write path nobody authorized.
		const writes = (await db.sql<PolicyRow>(POLICY_SELECT)).rows.filter(
			(p) => p.tablename === LEDGER && p.cmd !== 'SELECT'
		);
		expect(writes.map((p) => `${p.cmd} "${p.policyname}"`)).toEqual([]);
	});

	// -----------------------------------------------------------------------
	// B. NOTHING ELSE ON THE COIN SURFACE MOVED -- BY NAME, NOT BY COUNT.
	// -----------------------------------------------------------------------

	it('carries exactly the known coin policies, one per table, asserted by name', async () => {
		const rows = (await db.sql<PolicyRow>(POLICY_SELECT)).rows;
		const actual: Record<string, string> = {};
		for (const p of rows) {
			// One per table is itself the claim: a second policy on a coin table
			// would be OR'd with the first and could only widen the read.
			expect(
				actual[p.tablename],
				`${p.tablename} carries a second policy: "${p.policyname}"`
			).toBeUndefined();
			actual[p.tablename] = p.policyname;
		}
		expect(actual).toEqual(COIN_POLICIES);
	});

	it('projects every coin policy as a SELECT to authenticated alone', async () => {
		const rows = (await db.sql<PolicyRow>(POLICY_SELECT)).rows;
		const offenders = rows
			.filter((p) => p.cmd !== 'SELECT' || p.roles.length !== 1 || p.roles[0] !== 'authenticated')
			.map((p) => `${p.tablename} "${p.policyname}" cmd=${p.cmd} roles=[${p.roles.join(',')}]`);
		expect(offenders).toEqual([]);
		expect(rows.length, 'A sweep that generated nothing cannot pass').toBe(
			Object.keys(COIN_POLICIES).length
		);
	});

	it('leaves the public-id salt table with RLS on and no policy at all', async () => {
		// Absence is the mechanism: a table with RLS enabled and zero policies
		// denies every `anon` and `authenticated` select. A policy added here for
		// any reason is what opens the salt behind every opaque public id.
		const secret = await db.sql<{ relrowsecurity: boolean; n: string }>(
			`select c.relrowsecurity,
			        (select count(*) from pg_policies p
			          where p.schemaname = 'public' and p.tablename = c.relname)::text as n
			 from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
			 where ns.nspname = 'public' and c.relname = 'coin_public_id_secret'`
		);
		expect(secret.rows).toHaveLength(1);
		expect(secret.rows[0].relrowsecurity).toBe(true);
		expect(secret.rows[0].n).toBe('0');
	});

	// -----------------------------------------------------------------------
	// C. THE ABSENCE SWEEPS. Each one is planted against in section D.
	// -----------------------------------------------------------------------

	it('has no test-shaped policy name on any coin table', async () => {
		const hits = await db.sql<{ tablename: string; policyname: string }>(
			`select tablename, policyname from pg_policies
			 where schemaname = 'public' and tablename like 'coin%'
			   and policyname ~* $1
			 order by tablename, policyname`,
			[TEST_SHAPED]
		);
		// THIS IS DECISION 02'S PREMISE, asked of the catalog rather than of a
		// grep over migration text. Zero is the answer, and it is why no 0204
		// exists.
		expect(hits.rows.map((r) => `${r.tablename} :: "${r.policyname}"`)).toEqual([]);
	});

	it('admits anon to no coin table', async () => {
		const hits = await db.sql<{ tablename: string; policyname: string }>(
			`select tablename, policyname from pg_policies
			 where schemaname = 'public' and tablename like 'coin%'
			   and ('anon' = any(roles) or 'public' = any(roles))
			 order by tablename, policyname`
		);
		// The public coin ledger at /coins is real, and it is served by
		// anon-granted RPCs that project the address away INSIDE the database
		// (0089 through 0157). Not by a policy. A policy here is the shape that
		// bypasses every one of those projections.
		expect(hits.rows.map((r) => `${r.tablename} :: "${r.policyname}"`)).toEqual([]);
	});

	it('opens only the price list and the contract list with using (true)', async () => {
		const open = await db.sql<{ tablename: string; policyname: string }>(
			`select tablename, policyname from pg_policies
			 where schemaname = 'public' and tablename like 'coin%'
			   and permissive = 'PERMISSIVE' and coalesce(qual, '') = 'true'
			 order by tablename`
		);
		expect(open.rows.map((r) => r.tablename)).toEqual([...DELIBERATE_OPEN_READS]);
		expect(
			DELIBERATE_OPEN_READS as readonly string[],
			'The ledger must never be on this list'
		).not.toContain(LEDGER);
	});

	// -----------------------------------------------------------------------
	// D. THE PLANTED POSITIVE CONTROLS.
	//
	// Mutation in the PERMISSIVE direction, which is the one that reproduces the
	// real leak: a policy commented out fails closed and reddens almost nothing.
	// Planted as the connection OWNER (RLS is irrelevant to DDL), then dropped in
	// a `finally` so a failed expectation cannot leave the fixture mutated for
	// the assertions above -- which run first, in file order, on the same
	// database.
	// -----------------------------------------------------------------------

	async function withPlanted<T>(ddl: string, name: string, fn: () => Promise<T>): Promise<T> {
		await db.sql(ddl);
		try {
			return await fn();
		} finally {
			await db.sql(`drop policy if exists "${name}" on public.${LEDGER}`);
		}
	}

	it('the test-shaped-name sweep bites on a planted test policy', async () => {
		const name = 'temp debug read all coin transactions';
		await withPlanted(
			`create policy "${name}" on public.${LEDGER} for select to authenticated using (true)`,
			name,
			async () => {
				const hits = await db.sql<{ policyname: string }>(
					`select policyname from pg_policies
					 where schemaname='public' and tablename like 'coin%' and policyname ~* $1`,
					[TEST_SHAPED]
				);
				expect(hits.rows.map((r) => r.policyname)).toEqual([name]);
			}
		);
		// And clean again afterwards, so the drop is proven rather than assumed.
		const after = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_policies
			 where schemaname='public' and tablename like 'coin%' and policyname ~* $1`,
			[TEST_SHAPED]
		);
		expect(after.rows[0].n).toBe('0');
	});

	it('the anon sweep bites on a planted anon policy', async () => {
		const name = 'zz planted anon read';
		await withPlanted(
			`create policy "${name}" on public.${LEDGER} for select to anon using (true)`,
			name,
			async () => {
				const hits = await db.sql<{ policyname: string }>(
					`select policyname from pg_policies
					 where schemaname='public' and tablename like 'coin%'
					   and ('anon' = any(roles) or 'public' = any(roles))`
				);
				expect(hits.rows.map((r) => r.policyname)).toEqual([name]);
			}
		);
	});

	it('the using(true) sweep and the by-name map both bite on a planted second policy', async () => {
		const name = 'zz planted open read';
		await withPlanted(
			`create policy "${name}" on public.${LEDGER} for select to authenticated using (true)`,
			name,
			async () => {
				const open = await db.sql<{ tablename: string }>(
					`select tablename from pg_policies
					 where schemaname='public' and tablename like 'coin%'
					   and permissive='PERMISSIVE' and coalesce(qual,'')='true'
					 order by tablename`
				);
				expect(open.rows.map((r) => r.tablename)).toContain(LEDGER);

				// The by-name map's one-per-table claim is the half that catches a
				// swap, so it gets its own control.
				const rows = (await db.sql<PolicyRow>(POLICY_SELECT)).rows;
				const onLedger = rows.filter((p) => p.tablename === LEDGER).map((p) => p.policyname);
				expect(onLedger).toHaveLength(2);
				expect(onLedger).toContain(COIN_POLICIES[LEDGER]);
				expect(onLedger).toContain(name);
			}
		);
		const restored = (await db.sql<PolicyRow>(POLICY_SELECT)).rows.filter(
			(p) => p.tablename === LEDGER
		);
		expect(restored.map((p) => p.policyname)).toEqual([COIN_POLICIES[LEDGER]]);
	});

	it('the unanchored spelling of the test-shaped pattern is why the anchors are there', async () => {
		// The negative control for the INSTRUMENT rather than for the schema:
		// `temp` unanchored matches `attempts`, so the loose pattern reports
		// hits on two tables that have nothing to do with any of this. If this
		// ever returns 0, the anchors have stopped being load-bearing and the
		// comment on TEST_SHAPED is stale.
		const loose = await db.sql<{ tablename: string }>(
			`select distinct tablename from pg_policies
			 where schemaname='public' and policyname ~* '(test|debug|temp|tmp|todo)'
			 order by tablename`
		);
		expect(loose.rows.map((r) => r.tablename)).toEqual([
			'gauntlet_speedrun_attempts',
			'greenline_track_attempts'
		]);
		const anchored = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_policies
			 where schemaname='public' and policyname ~* $1`,
			[TEST_SHAPED]
		);
		expect(anchored.rows[0].n, 'Anchored, the whole schema is clean').toBe('0');
	});
});

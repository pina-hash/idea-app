// tests/coin-admin-and-own-rows-set-returning.test.ts
//
// THE LAST TWO COIN SET-RETURNING READS NOTHING HAD EVER CALLED.
//
//     coin_admin_list_sections   0073   ADMIN, inline `where public.is_admin()`
//     coin_my_contract_claims    0089   OWN ROWS, `current_user_email()`
//
// Both are named in `tests/coin-public-board-anon-projection.test.ts` and
// `tests/coin-public-ledger.test.ts` -- inside `has_function_privilege`
// sweeps, which mention a SIGNATURE and never run a BODY. Neither has been
// executed by anything, in any test, in any shape. That is precisely the state
// `docs/history/set-returning-function-tests-imch2v.md` named as what let
// earlier defects hide, and these two are the last of the pair it named.
//
// WHO MAY CALL AND WHAT THEY RECEIVE, both, for each. A gate that admits the
// right caller and hands back a column nobody should see is the same defect one
// field over.
//
//   * `coin_admin_list_sections` projects `created_by`, which is a STAFF EMAIL,
//     and `note`, which is admin free text about a class. Neither belongs
//     anywhere but an admin console, and the gate is what keeps them there.
//   * `coin_my_contract_claims` is the narrowest projection in the schema --
//     one column, `contract_id` -- and its whole job is a BOUNDARY: one
//     student's claims must not reach another. That boundary is asserted below
//     in the permissive direction and mutation-proven by OPENING it, never by
//     reading the SQL.
//
// EVERYTHING IS DRIVEN THROUGH THE SHARED POSTGREST SHIM, so the keys and the
// types are the ones a browser receives -- a `bigint` as a NUMBER and a
// `timestamptz` as an ISO STRING, neither of which is what node-postgres hands
// back. And each is put to its REAL ROUTE as well, because the bytes that
// reach a screen are what the route emits and not the row set underneath it.
//
// THE ROUTE SPLIT, WHICH IS THIS FILE'S OWN FINDING, and it is the mirror of
// the one the sibling file found inside `/api/coin/public`:
//
//   | reader                          | shape                        | an added RPC column reaches a browser? |
//   | ------------------------------- | ---------------------------- | -------------------------------------- |
//   | /coin-desk/students  +page.server | `(sections ?? []) as Coin…`  | YES, verbatim -- a cast strips nothing |
//   | /api/coin/claim      GET          | `rows.map(r => r.contract_id)` | no                                    |
//
// Measured below with a benign-column mutant, not read off the source.
//
// THE PINS ARE WHOLE SETS. Each projection is pinned TWICE from one constant --
// the DECLARED result columns in `pg_proc`, and the complete key set of a real
// row a real caller received -- so a column added to a function reddens both.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import { startTestDb, createUser, type TestDb, type SeededUser } from './db/harness';
import { GET as claimGet } from '../src/routes/api/coin/claim/+server';
import { load as studentsLoad } from '../src/routes/coin-desk/students/+page.server';

/**
 * The coin chain as production stands, taken from
 * `tests/coin-public-board-anon-projection.test.ts` so the coin suites cannot
 * disagree about what these functions run on. 0137 goes last because it is a
 * sweep over whatever the chain above it created.
 *
 * `0100_coin_legacy_reimport.sql` is deliberately absent: it is a one-time
 * import of real archived data, and every row asserted about below is written
 * through a live write RPC.
 */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0070_coin_economy.sql',
	'0072_coin_my_eating_pass_status.sql',
	'0073_coin_sections.sql',
	'0074_coin_roles.sql',
	'0076_coin_role_quiz_and_expiration.sql',
	'0077_coin_contracts.sql',
	'0079_coin_bulk_payout.sql',
	'0080_coin_category_admin.sql',
	'0081_coin_debt_payment.sql',
	'0084_coin_legacy_import.sql',
	'0087_coin_weekly_wage_tier.sql',
	'0089_coin_public_ledger.sql',
	'0096_coin_medium.sql',
	'0103_coin_public_medium_display.sql',
	'0107_coin_public_adjustment_bucket.sql',
	'0137_anon_execute_sweep.sql'
] as const;

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const SECTION = 'eng1h-sophomore';
const SECTION_LABEL = 'Engineering I Honors, Sophomore';
const SECTION_NOTE = 'Block 3. Do not log the Tuesday cohort here.';

/**
 * THE PROJECTIONS, WRITTEN DOWN ONCE, asserted twice each below.
 */
const PROJECTIONS = {
	coin_admin_list_sections: [
		'id',
		'label',
		'color',
		'active',
		'note',
		'created_by',
		'created_at',
		'updated_at',
		'student_count'
	],
	coin_my_contract_claims: ['contract_id']
} as const;

type Who = 'admin' | 'teacher' | 'ada' | 'grace';
const NON_ADMINS: readonly Who[] = ['teacher', 'ada', 'grace'];

let db: TestDb;
/** The catalog snapshot PostgREST caches, taken once. */
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;
const user = {} as Record<Who, SeededUser>;
const client = {} as Record<Who, ReturnType<typeof createPostgrestShim>>;
let anon: ReturnType<typeof createPostgrestShim>;

/** Ada claims this one. Grace claims the other. Nobody claims the third. */
let contractAda = '';
let contractGrace = '';
let contractUnclaimed = '';

async function ok<T>(
	call: PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<T> {
	const res = await call;
	if (res.error) throw new Error(res.error.message);
	return res.data as T;
}

async function refusal(
	call: PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<string | null> {
	const res = await call;
	return res.error ? res.error.message : null;
}

function keysOf(row: unknown): string[] {
	return Object.keys(row as Record<string, unknown>).sort();
}

/** The DECLARED result columns of a set-returning function, off the catalog. */
async function declaredColumns(name: string): Promise<string[]> {
	const { rows } = await db.sql<{ names: string[] | null; modes: string[] | null }>(
		`select p.proargnames as names, p.proargmodes::text[] as modes
		   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		  where n.nspname = 'public' and p.proname = $1`,
		[name]
	);
	const names = rows[0]?.names ?? [];
	const modes = rows[0]?.modes;
	if (!modes) return names;
	return names.filter((_, i) => modes[i] === 't');
}

/**
 * The REAL `/api/coin/claim` GET, with one caller's shim client in
 * `locals.supabase`. `claims` is what the handler branches on for the
 * signed-out case, so it is passed exactly as the handler reads it.
 */
async function claimRoute(
	who: Who | null
): Promise<{ status: number; contractIds: string[] }> {
	const supabase = who ? client[who] : anon;
	const res = (await claimGet({
		locals: { supabase, claims: who ? { sub: user[who].id } : null },
		setHeaders: () => {}
	} as unknown as Parameters<typeof claimGet>[0])) as Response;
	const body = (await res.json()) as { contractIds: string[] };
	return { status: res.status, contractIds: body.contractIds };
}

/** The REAL /coin-desk/students page load, with one caller's client. */
async function studentsPage(who: Who): Promise<{
	sections: Record<string, unknown>[];
	sectionsConfigured: boolean;
}> {
	return (await studentsLoad({
		locals: { supabase: client[who] }
	} as unknown as Parameters<typeof studentsLoad>[0])) as unknown as {
		sections: Record<string, unknown>[];
		sectionsConfigured: boolean;
	};
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	user.admin = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	// @boscotech.edu, so `role_for_email` makes them a TEACHER and nothing more.
	// This caller is the one that separates "admin" from "staff": a gate keyed
	// on the domain role would admit them and `is_admin()` does not.
	user.teacher = await createUser(db, 'notanadmin@boscotech.edu', 'Plain Teacher');
	user.ada = await createUser(db, 'ada.lovelace@boscotech.net', 'Ada Lovelace');
	user.grace = await createUser(db, 'grace.hopper@boscotech.net', 'Grace Hopper');

	await db.sql(`insert into public.app_admins (email) values ($1) on conflict do nothing`, [
		user.admin.email
	]);

	await db.asUser(user.admin.id, async (q) => {
		await q(`select public.coin_admin_upsert_section($1, $2, $3, $4, $5)`, [
			SECTION,
			SECTION_LABEL,
			'#00FF41',
			true,
			SECTION_NOTE
		]);
		// A SECOND, ARCHIVED section. 0073's list deliberately returns archived
		// sections too (archiving is reversible and the roster survives), and
		// the ordering is `active desc, id` -- so without an inactive row the
		// ordering clause is a sort over one value.
		await q(`select public.coin_admin_upsert_section($1, $2, $3, $4, $5)`, [
			'eng2-junior',
			'Engineering II, Junior',
			null,
			false,
			null
		]);
		await q(`select public.coin_admin_assign_section_students($1, $2::text[])`, [
			SECTION,
			[user.ada.email, user.grace.email]
		]);

		// Three unsectioned contracts, so anybody signed in may claim one
		// (`coin_contract_self_claim` refuses a section mismatch but lets any
		// caller claim a contract with no section).
		const mk = async (title: string) => {
			const { rows } = await q<{ r: { id: string } }>(
				`select public.coin_admin_post_contract($1, null, 10, 1, null) as r`,
				[title]
			);
			return rows[0].r.id;
		};
		contractAda = await mk("Ada's job");
		contractGrace = await mk("Grace's job");
		contractUnclaimed = await mk('Nobody has taken this');
	});

	await db.asUser(user.ada.id, (q) =>
		q(`select public.coin_contract_self_claim($1::uuid)`, [contractAda])
	);
	await db.asUser(user.grace.id, (q) =>
		q(`select public.coin_contract_self_claim($1::uuid)`, [contractGrace])
	);

	fks = await loadForeignKeys(db);
	for (const who of Object.keys(user) as Who[]) {
		client[who] = createPostgrestShim(db, fks, user[who].id);
	}
	anon = createPostgrestShim(db, fks, null);
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
describe('the callers are really the callers', () => {
	// Runs FIRST. A shim silently running as the table owner would satisfy
	// every claim in this file, so the same client is put to something it must
	// be refused and to something it must be given.

	it('refuses a student client an admin write and gives the admin client the same one', async () => {
		const denied = await refusal(
			client.ada.rpc('coin_admin_upsert_section', {
				p_id: 'sneaky',
				p_label: 'Not mine to make',
				p_color: null,
				p_active: true,
				p_note: null
			})
		);
		expect(denied).toMatch(/admin/i);
		// The positive half, same shim, same RPC.
		const made = await ok<{ ok?: boolean; id?: string }>(
			client.admin.rpc('coin_admin_upsert_section', {
				p_id: 'control-section',
				p_label: 'Control',
				p_color: null,
				p_active: false,
				p_note: null
			})
		);
		expect(made).toBeTruthy();
		await db.sql(`delete from public.coin_sections where id = 'control-section'`);
	});

	it('is genuinely anon on the anon client: neither read is granted to it', async () => {
		// `set role anon` with no claims. 0137 keeps both out of its eighteen.
		expect(await refusal(anon.rpc('coin_admin_list_sections'))).toMatch(/permission denied/i);
		expect(await refusal(anon.rpc('coin_my_contract_claims'))).toMatch(/permission denied/i);
	});
});

// ---------------------------------------------------------------------------
describe('the EXECUTE partition, read off the catalog', () => {
	it('grants both to authenticated and neither to anon, with a shut control beside them', async () => {
		const { rows } = await db.sql<Record<string, boolean>>(
			`select
			   has_function_privilege('anon', 'public.coin_admin_list_sections()', 'execute') as sections_anon,
			   has_function_privilege('authenticated', 'public.coin_admin_list_sections()', 'execute') as sections_auth,
			   has_function_privilege('anon', 'public.coin_my_contract_claims()', 'execute') as claims_anon,
			   has_function_privilege('authenticated', 'public.coin_my_contract_claims()', 'execute') as claims_auth,
			   has_function_privilege('anon', 'public.coin_public_contracts()', 'execute') as public_anon,
			   has_function_privilege('authenticated', 'public._coin_public_roster()', 'execute') as roster_auth`
		);
		expect(rows[0]).toEqual({
			sections_anon: false,
			sections_auth: true,
			claims_anon: false,
			claims_auth: true,
			// THE PARTITION HALF: a fixture in which everything were revoked
			// would satisfy the two `false`s above on its own. `anon` really
			// does hold EXECUTE on the public contracts board, and the private
			// roster helper really is shut to every client role.
			public_anon: true,
			roster_auth: false
		});
	});
});

// ---------------------------------------------------------------------------
describe('coin_admin_list_sections: an admin read carrying a staff email', () => {
	it('answers an admin with every section, active first', async () => {
		const rows = await ok<Record<string, unknown>[]>(client.admin.rpc('coin_admin_list_sections'));
		// The ARCHIVED section is present, which is 0073's own decision and is
		// what the ordering clause exists for.
		expect(rows.map((r) => r.id)).toEqual([SECTION, 'eng2-junior']);
		expect(rows.map((r) => r.active)).toEqual([true, false]);
	});

	it('answers a plain teacher and two students with NOTHING, not an error', async () => {
		// The gate is `where public.is_admin()` inside the definer body, so a
		// non-admin gets an empty set -- the same answer an empty section list
		// gives, which is what stops the function's existence being a probe.
		// The TEACHER is the caller that matters: `role_for_email` makes every
		// @boscotech.edu address a teacher and that must still buy nothing.
		for (const who of NON_ADMINS) {
			const rows = await ok<unknown[]>(client[who].rpc('coin_admin_list_sections'));
			expect(rows, `sections answered ${who}`).toEqual([]);
		}
	});

	it('pins the projection TWICE from one constant', async () => {
		const expected = [...PROJECTIONS.coin_admin_list_sections].sort();
		expect((await declaredColumns('coin_admin_list_sections')).sort()).toEqual(expected);
		const rows = await ok<Record<string, unknown>[]>(client.admin.rpc('coin_admin_list_sections'));
		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) expect(keysOf(row)).toEqual(expected);
	});

	it('carries a STAFF EMAIL in created_by and admin free text in note', async () => {
		const rows = await ok<Record<string, unknown>[]>(client.admin.rpc('coin_admin_list_sections'));
		const live = rows.find((r) => r.id === SECTION);
		// Stamped by the definer body from `current_user_email()`. It is the one
		// address this projection carries, and it is why the gate matters: the
		// PUBLIC sibling of this read, `coin_public_sections`, answers a label
		// and a colour and nothing else.
		expect(live?.created_by).toBe(user.admin.email);
		expect(String(live?.created_by)).toMatch(/@boscotech\.edu$/);
		// Free text an admin wrote about a class, returned verbatim. Nothing in
		// the column's name says it is private, and only the gate makes it so.
		expect(live?.note).toBe(SECTION_NOTE);
		// The comparison that makes the point a measurement rather than a
		// description: the public read of the same table has neither field.
		const publicRows = await ok<Record<string, unknown>[]>(anon.rpc('coin_public_sections'));
		expect(publicRows.length).toBeGreaterThan(0);
		for (const row of publicRows) {
			expect(keysOf(row)).toEqual(['color', 'section']);
		}
	});

	it('counts the roster it was joined against, and counts an empty one as zero', async () => {
		const rows = await ok<Record<string, unknown>[]>(client.admin.rpc('coin_admin_list_sections'));
		const live = rows.find((r) => r.id === SECTION);
		const empty = rows.find((r) => r.id === 'eng2-junior');
		// A `bigint` over the wire is a NUMBER through PostgREST and a STRING
		// through node-postgres. This is the shape a console branches on.
		expect(Number(live?.student_count)).toBe(2);
		// The LEFT JOIN's own case: a section with nobody on it counts 0, never
		// 1 and never null.
		expect(Number(empty?.student_count)).toBe(0);
	});

	it('carries NO student address, with a positive control that there are two to leak', async () => {
		// THE CONTROL FIRST: an empty answer carries no address either.
		const { rows: seeded } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.coin_section_students where section_id = $1`,
			[SECTION]
		);
		expect(Number(seeded[0].n)).toBe(2);

		const rows = await ok<Record<string, unknown>[]>(client.admin.rpc('coin_admin_list_sections'));
		const blob = JSON.stringify(rows);
		expect(blob).not.toContain('@boscotech.net');
		expect(blob).not.toContain('ada.lovelace');
		expect(blob).not.toContain('grace.hopper');
		// The roster IS reachable -- through a different, admin-gated function
		// that names it -- so the absence here is a projection decision and not
		// an absence of data.
		const roster = await ok<Record<string, unknown>[]>(
			client.admin.rpc('coin_admin_list_section_students', { p_section_id: SECTION })
		);
		expect(roster.map((r) => r.student_email).sort()).toEqual([
			user.ada.email,
			user.grace.email
		]);
	});
});

// ---------------------------------------------------------------------------
describe('coin_my_contract_claims: OWN ROWS, in the permissive direction', () => {
	it('gives each student exactly their own claim and nobody else theirs', async () => {
		const adaRows = await ok<{ contract_id: string }[]>(
			client.ada.rpc('coin_my_contract_claims')
		);
		const graceRows = await ok<{ contract_id: string }[]>(
			client.grace.rpc('coin_my_contract_claims')
		);
		expect(adaRows.map((r) => r.contract_id)).toEqual([contractAda]);
		expect(graceRows.map((r) => r.contract_id)).toEqual([contractGrace]);
		// THE BOUNDARY, STATED IN THE PERMISSIVE DIRECTION: what must be ABSENT
		// alongside what is present. Ada must not reach Grace's claim, and the
		// unclaimed contract must reach neither.
		expect(adaRows.map((r) => r.contract_id)).not.toContain(contractGrace);
		expect(graceRows.map((r) => r.contract_id)).not.toContain(contractAda);
		expect([...adaRows, ...graceRows].map((r) => r.contract_id)).not.toContain(
			contractUnclaimed
		);
		// And the positive control on the whole assertion: both claims really
		// are in the table, so "Ada cannot see Grace's" is not "there is no
		// Grace row to see".
		const { rows: all } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.coin_contract_claims`
		);
		expect(Number(all[0].n)).toBe(2);
	});

	it('gives a claimless caller an empty ARRAY, never null', async () => {
		// The admin and the teacher have claimed nothing. An empty array and a
		// null are different answers to a route that does `(data ?? [])`, and
		// only one of them means "you are on no contracts".
		for (const who of ['admin', 'teacher'] as const) {
			const rows = await ok<unknown[]>(client[who].rpc('coin_my_contract_claims'));
			expect(rows, `claims answered ${who}`).toEqual([]);
		}
	});

	it('takes no identity parameter at all, which is what makes the gate structural', async () => {
		// CLAUDE.md's rule: a student-facing read whose caller is
		// `current_user_email()` cannot be asked about somebody else, because
		// there is no parameter through which to ask. Asserted from the
		// catalog rather than from the file.
		const { rows } = await db.sql<{ nargs: number; src: string }>(
			`select p.pronargs as nargs, p.prosrc as src
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'coin_my_contract_claims'`
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].nargs).toBe(0);
		expect(rows[0].src).toMatch(/current_user_email\(\)/);
	});

	it('pins the projection TWICE from one constant: ONE column and nothing else', async () => {
		const expected = [...PROJECTIONS.coin_my_contract_claims].sort();
		expect((await declaredColumns('coin_my_contract_claims')).sort()).toEqual(expected);
		const rows = await ok<Record<string, unknown>[]>(client.ada.rpc('coin_my_contract_claims'));
		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) expect(keysOf(row)).toEqual(expected);
		// WHAT IT MUST NOT RETURN. `coin_contract_claims` carries the claimant's
		// own address and the claim's timestamp; this read projects neither, and
		// the columns really are on the table, which is what makes that a
		// projection decision rather than an empty claim.
		const { rows: cols } = await db.sql<{ column_name: string }>(
			`select column_name from information_schema.columns
			  where table_schema = 'public' and table_name = 'coin_contract_claims'`
		);
		const onTable = cols.map((c) => c.column_name);
		expect(onTable).toContain('student_email');
		expect(JSON.stringify(rows)).not.toContain('@');
	});

	it('is NARROWER than the table it reads, in two directions at once', async () => {
		// The RPC is not the only way in and this file does not claim it is:
		// 0077 grants SELECT on `coin_contract_claims` to `authenticated` under
		// an own-row-or-admin policy, so the table's RLS is the real boundary
		// and the function is a projection over it. Measured, because the two
		// differ in BOTH directions and only one of them is obvious.
		const adaTable = await ok<Record<string, unknown>[]>(
			client.ada.from('coin_contract_claims').select('contract_id,student_email')
		);
		// 1. THE TABLE CARRIES THE ADDRESS AND THE FUNCTION DROPS IT -- even
		//    from the caller's own row, where it discloses nothing new. That is
		//    what makes `coin_my_contract_claims` safe to hand to a route that
		//    serves a public board.
		expect(adaTable).toHaveLength(1);
		expect(adaTable[0].student_email).toBe(user.ada.email);
		const adaRpc = await ok<Record<string, unknown>[]>(
			client.ada.rpc('coin_my_contract_claims')
		);
		expect(keysOf(adaRpc[0])).toEqual(['contract_id']);

		// 2. AND IT IS NARROWER FOR AN ADMIN THAN THE POLICY IS. The policy's
		//    `or public.is_admin()` gives an admin BOTH claims and both
		//    addresses; the function's `where student_email =
		//    current_user_email()` has no admin branch at all, so the same admin
		//    gets nothing. The function cannot be used to read somebody else's
		//    claims by anyone, admin included -- which is the property a route
		//    calling it on every page load depends on.
		const adminTable = await ok<Record<string, unknown>[]>(
			client.admin.from('coin_contract_claims').select('contract_id,student_email')
		);
		expect(adminTable).toHaveLength(2);
		expect((adminTable.map((r) => r.student_email) as string[]).sort()).toEqual([
			user.ada.email,
			user.grace.email
		]);
		const adminRpc = await ok<unknown[]>(client.admin.rpc('coin_my_contract_claims'));
		expect(adminRpc).toEqual([]);

		// 3. Ada cannot reach Grace's row through the table either -- the
		//    policy, not the function, is what refuses that.
		expect(adaTable.map((r) => r.contract_id)).not.toContain(contractGrace);
		// And a signed-out caller holds no SELECT on it at all: a refusal,
		// never an empty set.
		expect(await refusal(anon.from('coin_contract_claims').select('contract_id'))).toMatch(
			/permission denied/i
		);
	});
});

// ---------------------------------------------------------------------------
describe('the two routes are a second gate on ONE of them and none on the other', () => {
	it('GET /api/coin/claim reshapes to bare ids, and never emits an RPC row', async () => {
		const ada = await claimRoute('ada');
		expect(ada.status).toBe(200);
		expect(ada.contractIds).toEqual([contractAda]);
		const grace = await claimRoute('grace');
		expect(grace.contractIds).toEqual([contractGrace]);
		// A hand reshape, so the wire carries STRINGS and not objects. A column
		// added to the RPC cannot reach a browser through this route.
		expect(ada.contractIds.every((v) => typeof v === 'string')).toBe(true);
	});

	it('GET /api/coin/claim answers a signed-out caller [] without calling the RPC', async () => {
		// The handler branches on `claims` BEFORE it touches supabase, which is
		// why an anon caller gets a normal empty answer rather than the
		// `permission denied` the RPC would give. Worth pinning: the route is
		// what makes "not signed in" and "on no contracts" the same answer here,
		// and a refactor that moved the RPC call above the guard would turn a
		// public page load into a logged error on every request.
		const out = await claimRoute(null);
		expect(out.status).toBe(200);
		expect(out.contractIds).toEqual([]);
	});

	it('/coin-desk/students passes the section rows through WHOLE, cast and unstripped', async () => {
		const page = await studentsPage('admin');
		expect(page.sectionsConfigured).toBe(true);
		expect(page.sections.map((s) => s.id)).toEqual([SECTION, 'eng2-junior']);
		// `(sections ?? []) as CoinSectionRow[]` is a TYPE ASSERTION. It strips
		// nothing at run time, so every key the RPC returned reaches `data`, and
		// with it the staff email and the admin note.
		for (const row of page.sections) {
			expect(keysOf(row)).toEqual([...PROJECTIONS.coin_admin_list_sections].sort());
		}
		const live = page.sections.find((s) => s.id === SECTION);
		expect(live?.created_by).toBe(user.admin.email);
		expect(live?.note).toBe(SECTION_NOTE);
	});

	it('/coin-desk/students answers a non-admin an EMPTY, still-configured list', async () => {
		// The page's own gate is the group layout, not this load. Driven with a
		// non-admin client the RPC succeeds and returns nothing, so
		// `sectionsConfigured` stays TRUE -- the flag means "0073 is applied",
		// never "you may see sections", and a reader could easily take it for
		// the latter.
		const page = await studentsPage('teacher');
		expect(page.sections).toEqual([]);
		expect(page.sectionsConfigured).toBe(true);
	});
});

// ---------------------------------------------------------------------------
describe('the shim models a ONE-COLUMN returns table, which it did not before', () => {
	// `coin_my_contract_claims` is the only function in the migrations whose
	// `returns table` has a single column, and driving it here is what exposed
	// the gap: Postgres compiles a one-column `returns table` to a BASE return
	// type (measured: `returns table (contract_id uuid)` gives typname `uuid`,
	// typtype `b`, proargmodes `{t}`), so aggregating over the function alias
	// directly yields an array of bare VALUES, while two or more columns give
	// `prorettype = record` and yield objects. PostgREST answers objects for
	// both. The shim now aggregates over `select * from f(...)`, which recovers
	// the OUT column names in either case.
	//
	// `tests/postgrest-shim-rpc-shape.test.ts`'s sweep could not see this: it
	// asks `routineShape` whether the rows are objects, and the answer was
	// always correct -- the classification was right and the SQL that ran after
	// it was not.

	it('reports the one-column function as a base return type in the catalog', async () => {
		const { rows } = await db.sql<{ typname: string; typtype: string; modes: string[] }>(
			`select t.typname, t.typtype, p.proargmodes::text[] as modes
			   from pg_proc p
			   join pg_type t on t.oid = p.prorettype
			   join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'coin_my_contract_claims'`
		);
		expect(rows[0].typname).toBe('uuid');
		expect(rows[0].typtype).toBe('b');
		expect(rows[0].modes).toEqual(['t']);
		// THE POSITIVE CONTROL, and it is what makes the line above a finding
		// rather than a curiosity: the multi-column sibling on the same chain
		// compiles to `record`, so the two really do differ.
		const { rows: multi } = await db.sql<{ typname: string; typtype: string }>(
			`select t.typname, t.typtype
			   from pg_proc p
			   join pg_type t on t.oid = p.prorettype
			   join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'coin_admin_list_sections'`
		);
		expect(multi[0].typname).toBe('record');
		expect(multi[0].typtype).toBe('p');
	});

	it('still hands a client OBJECTS keyed by the OUT column name', async () => {
		const rows = await ok<unknown[]>(client.ada.rpc('coin_my_contract_claims'));
		expect(rows).toHaveLength(1);
		// The assertion that reddens if the aggregate goes back to the function
		// alias: a bare uuid string would make `typeof` 'string' and
		// `Object.keys` a list of character indices.
		expect(typeof rows[0]).toBe('object');
		expect(rows[0]).not.toBeNull();
		expect(keysOf(rows[0])).toEqual(['contract_id']);
		// And the shipped reader is the reason it has to be an object:
		// `/api/coin/claim` does `rows.map((r) => r.contract_id)`, which over an
		// array of strings answers `[null]` -- a board that marks nothing,
		// silently, on every load.
		const viaRoute = await claimRoute('ada');
		expect(viaRoute.contractIds).toEqual([contractAda]);
	});

	it('is the ONLY function of that shape in this chain, swept with a control', async () => {
		// If a second one ever lands, this guard should be generalized rather
		// than renumbered -- the sweep is what says whether that has happened.
		const { rows } = await db.sql<{ proname: string }>(
			`select p.proname
			   from pg_proc p
			   join pg_type t on t.oid = p.prorettype
			   join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.prokind = 'f' and p.proretset
			    and t.typtype <> 'c' and t.typname <> 'record'
			    and coalesce(p.proargmodes, '{}'::"char"[]) && '{o,b,t}'::"char"[]
			  order by p.proname`
		);
		expect(rows.map((r) => r.proname)).toEqual(['coin_my_contract_claims']);
		// POSITIVE CONTROL: the same sweep without the narrowing sees plenty,
		// so an empty-looking result above cannot be a query that matches
		// nothing at all.
		const { rows: all } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.prokind = 'f' and p.proretset`
		);
		expect(Number(all[0].n)).toBeGreaterThan(5);
	});
});

// ---------------------------------------------------------------------------
describe('a table widening cannot reach either projection', () => {
	it('declares an explicit result column list on both, with no select * in either body', async () => {
		const { rows } = await db.sql<{ proname: string; result: string; src: string }>(
			`select p.proname, pg_get_function_result(p.oid) as result, p.prosrc as src
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public'
			    and p.proname in ('coin_admin_list_sections', 'coin_my_contract_claims')
			  order by p.proname`
		);
		expect(rows.map((r) => r.proname)).toEqual([
			'coin_admin_list_sections',
			'coin_my_contract_claims'
		]);
		for (const row of rows) {
			expect(row.result.toLowerCase().startsWith('table(')).toBe(true);
			expect(row.src).not.toMatch(/select\s+\*/i);
		}
		// SO THE GUARD WORTH WRITING IS THE ONE ABOVE -- a pin on the FUNCTION.
		// A column added to `coin_sections` or `coin_contract_claims` reaches
		// neither caller without an edit to the function itself.
	});

	it('has a contrast control: app_short_link_list really is the OTHER kind', async () => {
		// Read from the migration TEXT, because 0093 is not on this chain and
		// adding a short-link migration to a coin fixture to buy one assertion
		// would change what the fixture is. Without this half, "both of ours are
		// the safe kind" is a claim about a category with nothing in it.
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'app_short_link_list'`
		);
		expect(Number(rows[0].n)).toBe(0);
		const sql = readFileSync(join(REPO_ROOT, 'supabase/migrations/0093_short_links.sql'), 'utf8');
		expect(sql).toMatch(
			/create\s+or\s+replace\s+function\s+public\.app_short_link_list\(\)\s*\n\s*returns\s+setof\s+public\.app_short_links/i
		);
	});
});

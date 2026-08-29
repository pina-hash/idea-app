// tests/short-link-list-gate.test.ts
//
// `app_short_link_list` (0093) -- the fifth set-returning function that had NO
// TEST OF ANY KIND, and the only one of the five that is not coin-desk.
// `docs/history/postgrest-shim-set-returning-57e7a3.md` found all five by
// instrumenting the whole suite; this file closes this one.
//
// IT IS THE ODD ONE OUT IN TWO WAYS, and both are why it gets its own file.
//
//   * IT RETURNS `setof public.app_short_links` -- a TABLE ROWTYPE, not a
//     `returns table (...)` column list. That is a different branch of the
//     shim's `routineShape` (`typtype = 'c'` rather than an OUT/TABLE
//     `proargmodes`), and it is the branch nothing had ever exercised. It also
//     means the projection is not written down in the function at all: the
//     function says `select *`, so ADDING A COLUMN TO THE TABLE silently adds
//     it to what this read returns. The column set is pinned below for exactly
//     that reason.
//   * IT HAS A REAL SERVER LOAD IN FRONT OF IT
//     (`src/routes/admin/links/+page.server.ts`), so the deployed call path can
//     be driven end to end rather than simulated. That load is the
//     `loadSectionRoster` shape one route over: it hands the RPC's answer
//     straight on as `(data ?? []) as ShortLinkRow[]`, which before the shim fix
//     would have been a composite STRING typed as an array of objects. The load
//     is driven here, not re-implemented.
//
// The gate itself is the `admin_list()` shape 0073 copied and 0093 copied
// again: `where public.is_admin()` INLINE in the body, over a table with a
// client write grant of exactly none. What it protects is smaller than the coin
// reads -- slugs, targets, who created them -- but it is the ENUMERATION of the
// whole short-link table, which `app_short_link_target` (the anon-granted
// sibling) deliberately cannot do at any price.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import { load as LINKS_LOAD } from '../src/routes/admin/links/+page.server';

/**
 * 0093 and the two things it stands on: 0001 for `profiles`/`role_for_email`
 * and 0067 for `is_admin()`. 0137 last, per the harness note -- it is the sweep
 * that makes the `anon` grant assertions below true rather than vacuous, and
 * 0137 is precisely the migration that revoked `anon` from this function while
 * KEEPING it on `app_short_link_target` beside it.
 */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0093_short_links.sql',
	'0137_anon_execute_sweep.sql'
] as const;

let db: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;

let owner: SeededUser;
let admin: SeededUser;
/** `@boscotech.edu`, so `role_for_email` says teacher, and NOT in app_admins. */
let teacher: SeededUser;
let student: SeededUser;

const EMAIL = {
	owner: 'apina@boscotech.edu',
	admin: 'dean.links@boscotech.edu',
	teacher: 'notadmin.links@boscotech.edu',
	student: 'stella.links@boscotech.net'
} as const;

function rpcAs<T>(who: SeededUser, call: string, values: unknown[] = []): Promise<T> {
	return db.asUser(who.id, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, values);
		return rows[0].result;
	});
}

const client = (who: SeededUser) => createPostgrestShim(db, fks, who.id);

async function listAs(who: SeededUser): Promise<Record<string, unknown>[]> {
	const res = await client(who).rpc('app_short_link_list');
	if (res.error) throw new Error(`app_short_link_list failed: ${res.error.message}`);
	expect(Array.isArray(res.data)).toBe(true);
	return res.data as Record<string, unknown>[];
}

/**
 * The REAL page load, driven exactly as SvelteKit would call it: the shim in
 * `locals.supabase` (so `isAdmin()`'s own `is_admin` RPC and the list RPC both
 * go through the same client a request would hold) and `claims` set or not.
 */
function loadLinks(who: SeededUser | null) {
	return (LINKS_LOAD as unknown as (event: unknown) => Promise<{ links: unknown; ready: boolean }>)(
		{
			locals: {
				supabase: who ? client(who) : null,
				claims: who ? { sub: who.id, email: who.email } : null
			}
		}
	);
}

/** SvelteKit's error() throws; this turns that into a status number. */
async function statusOf(run: () => Promise<unknown>): Promise<number | 'ok'> {
	try {
		await run();
		return 'ok';
	} catch (thrown) {
		const status = (thrown as { status?: number }).status;
		if (typeof status === 'number') return status;
		throw thrown;
	}
}

beforeAll(async () => {
	db = await startTestDb([...CHAIN]);
	fks = await loadForeignKeys(db);

	owner = await createUser(db, EMAIL.owner, 'Site Owner');
	admin = await createUser(db, EMAIL.admin, 'Dean Links');
	teacher = await createUser(db, EMAIL.teacher, 'Not An Admin');
	student = await createUser(db, EMAIL.student, 'Stella Links');

	await rpcAs(owner, 'public.admin_grant($1, $2)', [EMAIL.admin, 'gate test']);

	// Seeded through the REAL write RPC, never a raw insert: the point of the
	// list is what the upsert put there, and a hand-built row could carry a
	// shape the upsert would refuse.
	await rpcAs(admin, 'public.app_short_link_upsert($1, $2, $3, $4)', [
		'209h',
		'/assignments/idea209h-syllabus',
		'IDEA209H syllabus',
		true
	]);
	await rpcAs(admin, 'public.app_short_link_upsert($1, $2, $3, $4)', [
		'open-house',
		'/assignments/open-house',
		'Open house handout',
		true
	]);
	// RETIRED, so the list has a row `app_short_link_target` will not resolve.
	// That pair is the whole reason the admin read exists separately.
	await rpcAs(admin, 'public.app_short_link_upsert($1, $2, $3, $4)', [
		'last-year',
		'/assignments/last-year',
		null,
		false
	]);
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// THE POSITIVE CONTROL FIRST, for the reason every "gets none" test needs one:
// an empty array is also what a fixture that seeded nothing hands back.
// ---------------------------------------------------------------------------
describe('the fixture has links in it (the positive control)', () => {
	test('an admin reads all three, slug-ordered', async () => {
		const got = await listAs(admin);
		expect(got.map((r) => r.slug)).toEqual(['209h', 'last-year', 'open-house']);
	});

	test('the OWNER is admitted on their own path through is_admin()', async () => {
		// is_admin() short-circuits on admin_owner_email() before it reads
		// app_admins at all, so this is a different branch and not a duplicate.
		expect((await listAs(owner)).map((r) => r.slug)).toEqual([
			'209h',
			'last-year',
			'open-house'
		]);
	});
});

// ---------------------------------------------------------------------------
// THE GATE
// ---------------------------------------------------------------------------
describe('a signed-in caller who is not an admin gets nothing', () => {
	/**
	 * THE CASE MOST LIKELY TO BE LET THROUGH BY ACCIDENT. Every
	 * `@boscotech.edu` address is a `teacher` by domain and CLAUDE.md says in
	 * capitals that on its own that grants nothing; `is_teacher()` still exists
	 * and now returns `is_admin()`, so a gate written with the wrong one of the
	 * two names reads correct and is correct -- which is exactly why the
	 * teacher case has to be asserted rather than assumed from the student one.
	 */
	test('a teacher who is not an admin reads no rows', async () => {
		expect(await listAs(teacher)).toEqual([]);
	});

	test('a student reads no rows', async () => {
		expect(await listAs(student)).toEqual([]);
	});

	test('admin-ness is read per call: a revoked admin stops seeing rows', async () => {
		const temp = await createUser(db, 'temp.links@boscotech.edu', 'Temporarily Admin');
		await rpcAs(owner, 'public.admin_grant($1, $2)', [temp.email, 'temporary']);
		expect(await listAs(temp)).toHaveLength(3);

		await rpcAs(owner, 'public.admin_revoke($1)', [temp.email]);
		expect(await listAs(temp)).toEqual([]);
	});
});

describe('a signed-out caller gets nothing, and is refused twice over', () => {
	/**
	 * TWO INDEPENDENT REFUSALS, asserted apart so opening either alone is
	 * visible: 0137 revoked `anon` EXECUTE (layer 1), and `is_admin()` answers
	 * false with a null `auth.uid()` (layer 2). Layer 2 is measured through
	 * `service_role` with NO subject -- a role 0137 deliberately leaves alone,
	 * so it holds EXECUTE, and one that bypasses RLS, so the inline `where` is
	 * the only thing that can be refusing it.
	 */
	test('anon holds no EXECUTE on app_short_link_list', async () => {
		const { rows } = await db.sql<{ ok: boolean }>(
			`select has_function_privilege('anon', 'public.app_short_link_list()', 'execute') as ok`
		);
		expect(rows[0].ok).toBe(false);
	});

	/**
	 * AND ITS PUBLIC SIBLING STILL HAS IT. `app_short_link_target` resolves a
	 * printed QR code before any session exists, and 0137 keeps it for that
	 * reason -- so this pair is the assertion that the sweep NARROWED rather
	 * than blanketed. Without it, "anon cannot call the list" would be equally
	 * satisfied by a fixture in which anon can call nothing at all.
	 */
	test('but its anon-granted sibling app_short_link_target still resolves', async () => {
		const { rows } = await db.sql<{ ok: boolean }>(
			`select has_function_privilege('anon', 'public.app_short_link_target(text)', 'execute') as ok`
		);
		expect(rows[0].ok).toBe(true);

		const resolved = await db.asAnon(
			async (q) =>
				(await q<{ t: string | null }>('select public.app_short_link_target($1) as t', ['209h']))
					.rows[0].t
		);
		expect(resolved).toBe('/assignments/idea209h-syllabus');

		// A signed-out visitor resolves ONE slug and cannot enumerate: the
		// retired one answers null through the same public function.
		const retired = await db.asAnon(
			async (q) =>
				(
					await q<{ t: string | null }>('select public.app_short_link_target($1) as t', [
						'last-year'
					])
				).rows[0].t
		);
		expect(retired).toBeNull();
	});

	test('an anon call to the list is refused at the grant, not answered emptily', async () => {
		await expect(
			db.asAnon((q) => q('select * from public.app_short_link_list()'))
		).rejects.toThrow(/permission denied for function/i);
	});

	test('and the gate itself refuses a session-less caller that DOES hold execute', async () => {
		const seen = await db.asServiceRole(
			async (q) => (await q('select * from public.app_short_link_list()')).rows
		);
		expect(seen).toEqual([]);

		// The positive control for this exact path: the same role, the same
		// bypassed RLS, WITH an admin subject, reads all three. Without it an
		// empty array would equally mean service_role cannot call it at all.
		const withAdmin = await db.asServiceRole(
			async (q) => (await q('select * from public.app_short_link_list()')).rows,
			admin.id
		);
		expect(withAdmin).toHaveLength(3);
	});
});

// ---------------------------------------------------------------------------
// WHAT COMES BACK
// ---------------------------------------------------------------------------
describe('the projection is the whole table row, which is why it is pinned', () => {
	/**
	 * THE FUNCTION SAYS `select *`. So unlike the four coin reads, whose
	 * `returns table (...)` clause states their projection, this one's answer is
	 * whatever `app_short_links` happens to hold -- a column added to that table
	 * in a later migration reaches every admin's screen with nothing in 0093
	 * changed and nothing anywhere saying so. This assertion is the thing that
	 * would say so.
	 *
	 * Every column here belongs in an admin's hands: the slug and target are the
	 * mapping being managed, `label` and `active` are the two editable fields,
	 * and `created_by` is a STAFF address (`app_short_link_upsert` writes
	 * `current_user_email()`, and only an admin can reach it) -- not a student's.
	 * There is nothing about a visitor in the table at all: no hit count, no
	 * referrer, no address, so enumerating it discloses staff's own work and
	 * nobody else's.
	 */
	test('the row is exactly the seven columns of app_short_links', async () => {
		const [row] = await listAs(admin);
		expect(Object.keys(row).sort()).toEqual(
			[
				'active',
				'created_at',
				'created_by',
				'label',
				'slug',
				'target',
				'updated_at'
			].sort()
		);
		expect(row.slug).toBe('209h');
		expect(row.target).toBe('/assignments/idea209h-syllabus');
		expect(row.label).toBe('IDEA209H syllabus');
		expect(row.active).toBe(true);
		expect(row.created_by).toBe(EMAIL.admin);
	});

	/**
	 * AND IT AGREES WITH THE TABLE, read directly as the connection owner. The
	 * point is not that `select *` returns what `select *` returns -- it is that
	 * the SHIM's answer and the database's own column list are the same set, so
	 * an assertion above cannot be passing over a shape the shim invented.
	 */
	test("and that set is the table's own column list, not the fixture's idea of it", async () => {
		const { rows: columns } = await db.sql<{ column_name: string }>(
			`select column_name from information_schema.columns
			  where table_schema = 'public' and table_name = 'app_short_links'`
		);
		const [row] = await listAs(admin);
		expect(Object.keys(row).sort()).toEqual(columns.map((c) => c.column_name).sort());
	});

	/**
	 * THE SHAPE CONTRACT. A single-row result read as `[row]` is exactly what
	 * the pre-fix shim also produced, so the multi-row case is the one that
	 * separates an array of row objects from one collapsed composite string.
	 */
	test('a multi-row read arrives as an array of row objects, not one composite', async () => {
		const got = await listAs(admin);
		expect(got).toHaveLength(3);
		for (const row of got) {
			expect(typeof row).toBe('object');
			expect(row).not.toBeNull();
			expect(typeof row.slug).toBe('string');
			expect(typeof row.active).toBe('boolean');
			// A timestamptz reaches a client as an ISO STRING over JSON, never a
			// Date -- the reason the shim answers json_agg rather than the
			// driver's parsed rows.
			expect(typeof row.created_at).toBe('string');
		}
	});
});

// ---------------------------------------------------------------------------
// THE DEPLOYED CALL PATH
// ---------------------------------------------------------------------------
describe('the real /admin/links load, driven rather than described', () => {
	/**
	 * THIS IS THE HALF THE SHIM FIX MADE POSSIBLE. The load does
	 * `(data ?? []) as ShortLinkRow[]` -- no validation, no reshaping -- so
	 * whatever the client hands back is what the page renders. Against the
	 * pre-fix shape that would have been a composite string wearing an array's
	 * type, and no test in this repo could have caught it.
	 */
	test('an admin gets the rows and ready true', async () => {
		const data = await loadLinks(admin);
		expect(data.ready).toBe(true);
		const links = data.links as Record<string, unknown>[];
		expect(Array.isArray(links)).toBe(true);
		expect(links.map((r) => r.slug)).toEqual(['209h', 'last-year', 'open-house']);
		expect(links[0].target).toBe('/assignments/idea209h-syllabus');
	});

	/**
	 * AND EVERY NON-ADMIN GETS 404, NOT 403 AND NOT A REDIRECT -- CLAUDE.md's
	 * probing rule: `/admin` is deliberately outside `authedPrefixes` so a
	 * signed-out visitor and a signed-in student get the SAME answer, and the
	 * existence of a short-link console is not something either can confirm.
	 * The three are asserted separately because a load that distinguished them
	 * would still pass a test that only checked one.
	 */
	test.each([
		['a teacher who is not an admin', () => teacher],
		['a student', () => student]
	])('%s gets 404 from the page load', async (_label, who) => {
		expect(await statusOf(() => loadLinks(who()))).toBe(404);
	});

	test('a signed-out visitor gets the identical 404, before any query runs', async () => {
		// `locals.supabase` is null here, so a load that reached the client at
		// all would throw a TypeError rather than a 404 -- which is the
		// assertion that the claims check comes first.
		expect(await statusOf(() => loadLinks(null))).toBe(404);
	});
});

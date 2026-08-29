// tests/coin-admin-list-gates.test.ts
//
// THE FOUR ADMIN SET-RETURNING READS IN THE COIN SUBSYSTEM, AND NOTHING ELSE.
//
//   coin_role_admin_list_applications      (0074, rewritten 0076)
//   coin_role_admin_list_holders           (0074, rewritten 0076)
//   coin_role_admin_list_role_questions    (0076)
//   coin_admin_list_section_students       (0073)
//
// Until this file they had NO TEST OF ANY KIND -- not through the shim, not in
// raw SQL, not anywhere. `docs/history/postgrest-shim-set-returning-57e7a3.md`
// found that by instrumenting the whole suite, and it is the reason this file
// exists: each of the four is a `where public.is_admin()` written INLINE in the
// body, the shape 0073 copied from `admin_list()`, and each returns other
// students' rows. That is `gauntlet_room_board`'s shape -- it handed every
// room's roster, student full names included, to any caller for two months,
// because nothing asserted its scoping. A gate nobody has ever put a
// non-admin to is a gate nobody knows bites.
//
// WHY THE ADMITTED CALLS GO THROUGH THE SHIM AND THE SIGNED-OUT ONES DO NOT.
// All four are reached from the browser as `supabase.rpc(...)`
// (`RolesManager.svelte`, `LogView.svelte`, `SectionManager.svelte`), so the
// faithful question is what a PostgREST client receives -- an ARRAY OF ROW
// OBJECTS, which is a shape no test in this repo could produce until the shim
// learned to read `proretset` off `pg_proc`. `createPostgrestShim` drives every
// signed-in caller here for that reason. It can only model a signed-in one
// (it runs `db.asUser`), so the two signed-out cases are raw, and they are
// TWO rather than one because the refusals are independent -- see the
// signed-out describe block.
//
// AND THE PROJECTION IS ASSERTED, NOT ONLY THE GATE. A gate that admits the
// right caller and hands back a column nobody should see is the same defect one
// field over, so each function's columns are pinned whole. What that pinning is
// FOR is stated per function below; the short version is that all four are
// admin consoles over a roster, so a name and an email are the job, and the
// question is whether anything beyond the job crept in.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';

/**
 * 0076 and everything the four functions stand on. 0070 is the coin economy
 * base (0073's sections hang off its ledger), 0073 the sections, 0074 the
 * roles, 0076 the quiz rewrite that recreates three of the four.
 *
 * 0137 LAST, per the harness note: it is a sweep over whatever the chain above
 * created, and every grant fact asserted here is only true once it has run.
 */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0070_coin_economy.sql',
	'0073_coin_sections.sql',
	'0074_coin_roles.sql',
	'0076_coin_role_quiz_and_expiration.sql',
	'0137_anon_execute_sweep.sql'
] as const;

let db: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;

/** The pinned owner. Admin unconditionally, table or no table. */
let owner: SeededUser;
/** A granted admin who is not the owner -- the ordinary admin case. */
let admin: SeededUser;
/**
 * `@boscotech.edu`, so `role_for_email` makes them a TEACHER, and NOT in
 * `app_admins`. CLAUDE.md's admin tier in one caller: teacher on its own grants
 * nothing, and this is the caller most likely to be let through by accident.
 */
let teacher: SeededUser;
/** An ordinary student, and one of the rows these functions return. */
let student: SeededUser;

const SECTION = 'gates-demo';
const OTHER_SECTION = 'gates-other';

const EMAIL = {
	owner: 'apina@boscotech.edu',
	admin: 'dean.gates@boscotech.edu',
	teacher: 'notadmin.gates@boscotech.edu',
	student: 'stella.gates@boscotech.net',
	second: 'rafa.gates@boscotech.net',
	revoked: 'ines.gates@boscotech.net',
	elsewhere: 'oscar.gates@boscotech.net'
} as const;

const ROLE = 'quartermaster';
const OTHER_ROLE = 'safety_officer';
/** A third role, carrying a question of its own so the p_role_id filter has
 * something real to exclude. OTHER_ROLE deliberately has NO questions, which
 * is what lets an application for it be seeded with an empty answer list. */
const QUIZLESS_PEER = 'shop_steward';

/** A raw call as a signed-in user, for seeding through the real write RPCs. */
function rpcAs<T>(who: SeededUser, call: string, values: unknown[] = []): Promise<T> {
	return db.asUser(who.id, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, values);
		return rows[0].result;
	});
}

/** The shim, as the deployed browser client would hold it for `who`. */
const client = (who: SeededUser) => createPostgrestShim(db, fks, who.id);

/**
 * Every RPC here is set-returning, so a successful call answers an ARRAY. A
 * refusal inside a function body reaches the shim as PGRST202 (see that file's
 * own note), and every caller in this file expects rows or an empty array, so
 * an error is surfaced rather than swallowed -- a test that read an error as
 * "no rows" would pass for a denial that never happened.
 */
async function rows(
	who: SeededUser,
	name: string,
	args?: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
	const res = await client(who).rpc(name, args);
	if (res.error) throw new Error(`${name} failed for ${who.email}: ${res.error.message}`);
	expect(Array.isArray(res.data)).toBe(true);
	return res.data as Record<string, unknown>[];
}

beforeAll(async () => {
	db = await startTestDb([...CHAIN]);
	fks = await loadForeignKeys(db);

	owner = await createUser(db, EMAIL.owner, 'Site Owner');
	admin = await createUser(db, EMAIL.admin, 'Dean Gates');
	teacher = await createUser(db, EMAIL.teacher, 'Not An Admin');
	student = await createUser(db, EMAIL.student, 'Stella Gates');
	await createUser(db, EMAIL.second, 'Rafa Gates');
	await createUser(db, EMAIL.revoked, 'Ines Gates');
	await createUser(db, EMAIL.elsewhere, 'Oscar Gates');

	await rpcAs(owner, 'public.admin_grant($1, $2)', [EMAIL.admin, 'gate test']);

	// Two sections, so every filtered read has something it must NOT return.
	await rpcAs(admin, 'public.coin_admin_upsert_section($1, $2, $3, $4, $5)', [
		SECTION,
		'Gates Demo',
		null,
		null,
		true
	]);
	await rpcAs(admin, 'public.coin_admin_upsert_section($1, $2, $3, $4, $5)', [
		OTHER_SECTION,
		'Somewhere Else',
		null,
		null,
		true
	]);
	await rpcAs(admin, 'public.coin_admin_assign_section_students($1, $2::text[])', [
		SECTION,
		[EMAIL.student, EMAIL.second, EMAIL.revoked]
	]);
	await rpcAs(admin, 'public.coin_admin_assign_section_students($1, $2::text[])', [
		OTHER_SECTION,
		[EMAIL.elsewhere]
	]);

	// THE QUIZ QUESTIONS ARE A RAW INSERT, AND THAT IS THE REAL PRODUCER.
	// 0076 creates coin_role_quiz_questions and leaves it EMPTY on purpose;
	// there is no write RPC for it anywhere in the migrations, because real
	// quiz content is pasted into the table by hand by whoever holds SQL editor
	// access (CLAUDE.md, Scope). So a hand-written insert IS what produces
	// these rows in production, and building them any other way would be the
	// fixture inventing a producer.
	await db.sql(
		`insert into public.coin_role_quiz_questions
		   (role_id, type, question_text, sequence, options, correct_option_index)
		 values
		   ($1, 'mc', 'Where does the tool crib key live?', 1,
		     '["On the hook", "In a pocket", "Nowhere"]'::jsonb, 0),
		   ($1, 'written', 'Describe your check-out routine.', 2, null, null),
		   ($2, 'mc', 'What comes first in a spill?', 1,
		     '["Tell someone", "Keep working"]'::jsonb, 0)`,
		[ROLE, QUIZLESS_PEER]
	);
	// Inactive, so the function's own `and active` filter has something to drop.
	await db.sql(
		`insert into public.coin_role_quiz_questions
		   (role_id, type, question_text, sequence, active)
		 values ($1, 'written', 'A retired question.', 9, false)`,
		[ROLE]
	);

	const questions = await db.sql<{ id: string; type: string }>(
		`select id, type from public.coin_role_quiz_questions
		  where role_id = $1 and active order by sequence`,
		[ROLE]
	);
	const answers = questions.rows.map((q) =>
		q.type === 'mc'
			? { question_id: q.id, selected_option_index: 0 }
			: { question_id: q.id, written_answer: 'I sign every tool out and back.' }
	);

	// One PENDING application, and one APPROVED into a live holder.
	await rpcAs(admin, 'public.coin_role_apply($1, $2, $3::jsonb)', [
		EMAIL.student,
		ROLE,
		JSON.stringify(answers)
	]);
	const revokedApp = await rpcAs<{ application_id: string }>(
		admin,
		'public.coin_role_apply($1, $2, $3::jsonb)',
		[EMAIL.revoked, OTHER_ROLE, JSON.stringify([])]
	);
	await rpcAs(admin, 'public.coin_role_admin_review($1::uuid, $2, $3)', [
		revokedApp.application_id,
		'approve',
		'seed: a holder to revoke'
	]);
	const holder = await db.sql<{ id: string }>(
		`select id from public.coin_role_holders where student_email = $1`,
		[EMAIL.revoked]
	);
	await rpcAs(admin, 'public.coin_role_admin_revoke($1::uuid, $2)', [
		holder.rows[0].id,
		'seed: stepped down'
	]);

	// A second, LIVE holder, so the default (unrevoked) read is not empty.
	const liveApp = await rpcAs<{ application_id: string }>(
		admin,
		'public.coin_role_apply($1, $2, $3::jsonb)',
		[EMAIL.second, OTHER_ROLE, JSON.stringify([])]
	);
	await rpcAs(admin, 'public.coin_role_admin_review($1::uuid, $2, $3)', [
		liveApp.application_id,
		'approve',
		'seed: the live holder'
	]);
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// THE SEED IS A POSITIVE CONTROL, and it comes first.
//
// Every "gets none" assertion below is an assertion about an EMPTY ARRAY, and
// an empty array is also what a fixture that seeded nothing produces. So the
// admin reads run first and are asserted NON-EMPTY: without this block the
// whole file could pass over four functions that return nothing to anybody.
// ---------------------------------------------------------------------------
describe('the fixture actually has rows in it (the positive control)', () => {
	test('an admin sees a pending application, a holder, a question and a roster', async () => {
		expect(await rows(admin, 'coin_role_admin_list_applications')).toHaveLength(1);
		expect(await rows(admin, 'coin_role_admin_list_holders')).toHaveLength(1);
		expect(
			await rows(admin, 'coin_role_admin_list_role_questions', { p_role_id: ROLE })
		).toHaveLength(2);
		expect(
			await rows(admin, 'coin_admin_list_section_students', { p_section_id: SECTION })
		).toHaveLength(3);
	});

	test('the OWNER is admitted too, table row or not', async () => {
		// is_admin() short-circuits on admin_owner_email() before it ever reads
		// app_admins, so the owner is a genuinely different path through the
		// gate and not a duplicate of the admin case.
		expect(await rows(owner, 'coin_role_admin_list_applications')).toHaveLength(1);
		expect(await rows(owner, 'coin_role_admin_list_holders')).toHaveLength(1);
		expect(
			await rows(owner, 'coin_role_admin_list_role_questions', { p_role_id: ROLE })
		).toHaveLength(2);
		expect(
			await rows(owner, 'coin_admin_list_section_students', { p_section_id: SECTION })
		).toHaveLength(3);
	});
});

// ---------------------------------------------------------------------------
// THE GATE
// ---------------------------------------------------------------------------
describe('a signed-in caller who is not an admin gets nothing', () => {
	/**
	 * THE ONE THAT MATTERS MOST. `role_for_email` grants `teacher` to every
	 * `@boscotech.edu` address automatically, and CLAUDE.md's admin tier says
	 * in capitals that on its own it grants NOTHING. A gate written as
	 * `is_teacher()` -- which still exists and now returns `is_admin()`, the
	 * naming trap -- would pass the student case below and fail only here.
	 */
	test.each([
		['coin_role_admin_list_applications', undefined],
		['coin_role_admin_list_holders', undefined],
		['coin_role_admin_list_role_questions', { p_role_id: ROLE }],
		['coin_admin_list_section_students', { p_section_id: SECTION }]
	] as const)('a teacher who is not an admin reads no rows from %s', async (name, args) => {
		expect(await rows(teacher, name, args as Record<string, unknown> | undefined)).toEqual([]);
	});

	test.each([
		['coin_role_admin_list_applications', undefined],
		['coin_role_admin_list_holders', undefined],
		['coin_role_admin_list_role_questions', { p_role_id: ROLE }],
		['coin_admin_list_section_students', { p_section_id: SECTION }]
	] as const)('a student reads no rows from %s', async (name, args) => {
		expect(await rows(student, name, args as Record<string, unknown> | undefined)).toEqual([]);
	});

	/**
	 * A STUDENT ASKING ABOUT THEMSELVES IS STILL REFUSED, which is worth its own
	 * assertion because it is the one a well-meaning widening would open first:
	 * every one of these functions could plausibly gain an "or it is your own
	 * row" arm, and none of them has one. Stella is on the seeded roster and has
	 * the pending application; she sees neither.
	 */
	test('a student cannot read the section they are on, or their own application', async () => {
		expect(
			await rows(student, 'coin_admin_list_section_students', { p_section_id: SECTION })
		).toEqual([]);
		expect(await rows(student, 'coin_role_admin_list_applications', { p_status: null })).toEqual(
			[]
		);
	});

	/**
	 * AND A REVOKED ADMIN GOES BACK TO NOTHING. The gate reads `app_admins` per
	 * call rather than anything cached at sign-in, so this is the assertion that
	 * the grant is a live lookup. Granted and revoked inside the test so the
	 * shared fixture is unchanged on the way out.
	 */
	test('admin-ness is read per call: a revoked admin stops seeing rows', async () => {
		const temp = await createUser(db, 'temp.gates@boscotech.edu', 'Temporarily Admin');
		await rpcAs(owner, 'public.admin_grant($1, $2)', [temp.email, 'temporary']);
		expect(await rows(temp, 'coin_role_admin_list_holders')).toHaveLength(1);

		await rpcAs(owner, 'public.admin_revoke($1)', [temp.email]);
		expect(await rows(temp, 'coin_role_admin_list_holders')).toEqual([]);
		expect(
			await rows(temp, 'coin_admin_list_section_students', { p_section_id: SECTION })
		).toEqual([]);
	});
});

describe('a signed-out caller gets nothing, and is refused twice over', () => {
	/**
	 * TWO INDEPENDENT REFUSALS, ASSERTED SEPARATELY, because opening either one
	 * alone must not produce rows and a single test could not tell which layer
	 * was doing the work:
	 *
	 *   1. THE GRANT. 0137 revoked `anon` EXECUTE on all four (none is in its
	 *      eighteen deliberate public surfaces), so a real signed-out request
	 *      never reaches the body at all.
	 *   2. THE GATE. `is_admin()` answers false when `auth.uid()` is null, so a
	 *      caller who somehow held EXECUTE with no session still reads nothing.
	 *
	 * The second is measured through `service_role` WITHOUT a subject -- a role
	 * 0137 deliberately does not touch, so it holds EXECUTE, and one that
	 * bypasses RLS, so nothing but the inline `where` can be what refuses it.
	 * That is the closest this fixture can get to "the body ran with no
	 * session", and it is what makes the layer-1 assertion a narrowing rather
	 * than the only thing standing.
	 */
	const NAMES = [
		'coin_role_admin_list_applications',
		'coin_role_admin_list_holders',
		'coin_role_admin_list_role_questions',
		'coin_admin_list_section_students'
	] as const;

	test.each(NAMES)('anon holds no EXECUTE on %s', async (name) => {
		const { rows: acl } = await db.sql<{ ok: boolean }>(
			`select bool_or(has_function_privilege('anon', p.oid, 'execute')) as ok
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = $1`,
			[name]
		);
		expect(acl[0].ok).toBe(false);
	});

	test('an anon call is refused at the grant, not answered emptily', async () => {
		await expect(
			db.asAnon((q) => q('select * from public.coin_role_admin_list_holders()'))
		).rejects.toThrow(/permission denied for function/i);
		await expect(
			db.asAnon((q) => q('select * from public.coin_admin_list_section_students($1)', [SECTION]))
		).rejects.toThrow(/permission denied for function/i);
	});

	test('and the gate itself refuses a session-less caller that DOES hold execute', async () => {
		const seen = await db.asServiceRole(async (q) => ({
			applications: (await q('select * from public.coin_role_admin_list_applications()')).rows,
			holders: (await q('select * from public.coin_role_admin_list_holders()')).rows,
			questions: (
				await q('select * from public.coin_role_admin_list_role_questions($1)', [ROLE])
			).rows,
			students: (
				await q('select * from public.coin_admin_list_section_students($1)', [SECTION])
			).rows
		}));
		expect(seen.applications).toEqual([]);
		expect(seen.holders).toEqual([]);
		expect(seen.questions).toEqual([]);
		expect(seen.students).toEqual([]);

		// THE POSITIVE CONTROL FOR THIS EXACT PATH: the same role, same
		// bypassed RLS, WITH a subject that is an admin, reads rows. Without
		// it, four empty arrays would equally well mean service_role cannot
		// call these at all.
		const withAdmin = await db.asServiceRole(
			async (q) => (await q('select * from public.coin_role_admin_list_holders()')).rows,
			admin.id
		);
		expect(withAdmin).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// WHAT COMES BACK
// ---------------------------------------------------------------------------
describe('the projection is what an admin console needs and no more', () => {
	/**
	 * COLUMN SETS ARE PINNED WHOLE, not spot-checked, and the reason is the one
	 * this file opens with: a gate that admits the right caller and returns a
	 * column nobody should see is the same defect one field over. A pinned set
	 * reddens on an ADDED column too, which is the direction a disclosure
	 * arrives from -- CLAUDE.md calls widening a payload a decision, not a field
	 * addition, and this is where that decision gets noticed.
	 *
	 * The sets are read off the RESULT rather than off `pg_proc`, because what a
	 * client receives is the question; a `returns table` clause that disagreed
	 * with the select under it would still be answered by the select.
	 */
	test('coin_role_admin_list_applications projects the review queue', async () => {
		const [row] = await rows(admin, 'coin_role_admin_list_applications');
		expect(Object.keys(row).sort()).toEqual(
			[
				'answers',
				'display_name',
				'full_name',
				'id',
				'review_note',
				'reviewed_at',
				'reviewed_by',
				'role_id',
				'role_name',
				'section_id',
				'status',
				'student_email',
				'submitted_at',
				'submitted_by'
			].sort()
		);
		expect(row.student_email).toBe(EMAIL.student);
		expect(row.full_name).toBe('Stella Gates');
		expect(row.status).toBe('pending');
		expect(row.section_id).toBe(SECTION);

		// THE ONE COLUMN WORTH ARGUING ABOUT, and it belongs: `answers` carries
		// each question's `correct_option_index` and `is_correct` beside the
		// student's own choice. That is the marking key, and an admin deciding
		// an application is exactly who needs it -- it is the reason 0076 built
		// the snapshot table. It must not reach any other caller, which is what
		// the gate above is for. (`coin_public_role_questions`, the anon-facing
		// read of the same bank, projects no answer key at all.)
		const answers = row.answers as Array<Record<string, unknown>>;
		expect(answers).toHaveLength(2);
		expect(answers[0]).toMatchObject({
			type: 'mc',
			selected_option_index: 0,
			correct_option_index: 0,
			is_correct: true
		});
		expect(answers[1]).toMatchObject({ type: 'written', written_answer: expect.any(String) });
	});

	test('coin_role_admin_list_holders projects the grant and how it ended', async () => {
		const [live] = await rows(admin, 'coin_role_admin_list_holders');
		expect(Object.keys(live).sort()).toEqual(
			[
				'assigned_by',
				'display_name',
				'expires_at',
				'full_name',
				'id',
				'is_active',
				'revoke_reason',
				'revoked_at',
				'revoked_by',
				'role_id',
				'role_name',
				'section_id',
				'since',
				'student_email'
			].sort()
		);
		expect(live.student_email).toBe(EMAIL.second);
		expect(live.is_active).toBe(true);
		expect(live.revoked_at).toBeNull();

		// `revoked_by` and `revoke_reason` name a STAFF member and carry a note
		// a staff member wrote about a student. Both belong here -- this is the
		// record of who ended a grant and why, which is the whole purpose of an
		// admin holders list -- and both are why the gate on this one is the
		// least forgiving of the four.
		const all = await rows(admin, 'coin_role_admin_list_holders', { p_include_revoked: true });
		const revoked = all.find((r) => r.student_email === EMAIL.revoked);
		expect(revoked).toBeDefined();
		expect(revoked!.is_active).toBe(false);
		expect(revoked!.revoked_by).toBe(EMAIL.admin);
		expect(revoked!.revoke_reason).toBe('seed: stepped down');
	});

	test('coin_role_admin_list_role_questions projects the ANSWER KEY, which is why it is admin-only', async () => {
		const got = await rows(admin, 'coin_role_admin_list_role_questions', { p_role_id: ROLE });
		expect(Object.keys(got[0]).sort()).toEqual(
			[
				'correct_option_index',
				'id',
				'options',
				'question_text',
				'role_id',
				'sequence',
				'type'
			].sort()
		);
		// The whole disclosure sits in one column. A student who could read this
		// function could pass the quiz that gates a paid role.
		expect(got[0].correct_option_index).toBe(0);
		expect(got.map((r) => r.sequence)).toEqual([1, 2]);
		// `active` is filtered, not projected: the retired question is absent.
		expect(got.map((r) => r.question_text)).not.toContain('A retired question.');
		// And the filter is a real one, not an empty table.
		const { rows: all } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.coin_role_quiz_questions where role_id = $1`,
			[ROLE]
		);
		expect(all[0].n).toBe('3');
	});

	test('coin_admin_list_section_students projects the roster and nothing about money', async () => {
		const got = await rows(admin, 'coin_admin_list_section_students', { p_section_id: SECTION });
		expect(Object.keys(got[0]).sort()).toEqual(
			['assigned_at', 'display_name', 'full_name', 'student_email'].sort()
		);
		// NO BALANCE, and that is the notable absence: this is the picker the
		// coin desk logs a section from, so a balance column would put every
		// student's holdings in a list an admin opens to choose a name. It reads
		// coin_section_students and profiles only -- the ledger is a separate
		// read behind its own function.
		expect(Object.keys(got[0]).join(',')).not.toMatch(/balance|coin|amount/i);
		expect(got.map((r) => r.student_email).sort()).toEqual(
			[EMAIL.revoked, EMAIL.second, EMAIL.student].sort()
		);
		// The other section's student is not in it -- the p_section_id filter
		// is real, so an admin reading one class does not read the school.
		expect(got.map((r) => r.student_email)).not.toContain(EMAIL.elsewhere);
	});

	/**
	 * THE SHIM'S OWN CONTRACT, ASSERTED ONCE HERE RATHER THAN ASSUMED. These
	 * four are the first callers in the repo to reach a `returns table` function
	 * through the shared shim on a real chain, and the whole file is worthless
	 * if what came back were the pre-fix composite string: `Object.keys()` on a
	 * string yields character indices, and every column assertion above would
	 * have failed loudly rather than passed -- but a SINGLE-row result read as
	 * `[row]` is exactly the shape the broken shim also produced, so the
	 * multi-row case is the one that separates them.
	 */
	test('a multi-row read arrives as an array of row objects, not one composite', async () => {
		const got = await rows(admin, 'coin_admin_list_section_students', { p_section_id: SECTION });
		expect(got).toHaveLength(3);
		for (const row of got) {
			expect(typeof row).toBe('object');
			expect(row).not.toBeNull();
			expect(typeof row.student_email).toBe('string');
			// A timestamptz reaches a client as an ISO STRING over JSON, never as
			// a Date -- the reason the shim answers json_agg rather than the
			// driver's parsed rows.
			expect(typeof row.assigned_at).toBe('string');
		}
	});
});

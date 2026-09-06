// tests/db/feedback-delete-is-a-status.test.ts
//
// 0186: "delete a false or spam report" is a FOURTH STATUS, and the row is
// still there.
//
// WHY THIS IS A TEST AND NOT A HARNESS DRIVE. The console renders identically
// whichever answer was chosen -- a button that says Spam looks the same whether
// it marks a row or destroys one -- and every claim below fails invisibly:
//
//   1. THE ROW SURVIVES. If a later bundle "simplifies" this into a delete, the
//      console still works, the queue still shrinks, and the only sign is that
//      an export taken afterwards is missing reports nobody can name. On a
//      table whose `reporter_hash` exists to be COUNTED (0126), a deleted row
//      also deletes the pattern that count is for.
//   2. IT IS REVERSIBLE, AND BY THE SAME CALL. There is no separate restore
//      path to test, and that is the property: a spam row moves back to `new`
//      through `app_feedback_set_status` exactly as it moved out.
//   3. NOBODY ELSE CAN MOVE IT. The status column has no update grant and no
//      update policy for anyone; the RPC is the whole write path and it opens
//      with `is_admin()`. A fourth value is a fourth thing an ordinary caller
//      must still be refused.
//   4. AND THE THIRD VALUE STILL REFUSES. The guard is a literal list, so a
//      widening is exactly the edit that could turn it into "anything goes".
//
// SEEDED PRE-MIGRATION, THEN MIGRATED OVER THE TOP: the chain boots SHORT of
// 0186, files reports through the REAL write paths of that world and moves them
// through the REAL pre-0186 RPC, and only then applies the file. So the rows
// asserted about genuinely predate the fourth status.
//
// THE POSITIVE CONTROL IS AN IN-DATABASE MUTATION on a THROWAWAY database: the
// CHECK constraint is opened to any text, and the "an unknown status is still
// refused" assertion must stop holding. Nothing on disk is touched.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

/**
 * The chain SHORT OF 0186. 0053 is the table, 0067 the admin tier its policies
 * resolve through, 0082/0083/0085 the classroom files the status column and its
 * RPC arrive in, 0126/0127 the anonymous path and the console read, 0170 the
 * current shape of both. 0137 is LAST, as in every chain here.
 *
 * THE COIN FILES AND 0145 ARE HERE BECAUSE 0186 IS ONE FILE. Its other half is
 * the song queue's Spotify rule, which replaces `classroom_song_request` and
 * calls `_classroom_song_url_ok` -- so a database without the song queue cannot
 * apply it. That is worth having pinned rather than worked around: the two
 * halves ship together, and either subsystem missing is a failed apply that
 * rolls back whole, not a half-applied schema.
 */
const PRE_0186 = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
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
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0126_app_feedback_anonymous.sql',
	'0127_app_feedback_console_anonymous.sql',
	'0170_feedback_tried_and_screenshot.sql',
	'0137_anon_execute_sweep.sql',
	'0145_classroom_song_queue.sql'
] as const;

const SQL_0186 = readFileSync(
	new URL('../../supabase/migrations/0186_song_spotify_and_feedback_spam.sql', import.meta.url),
	'utf8'
);

let db: TestDb;
let admin: SeededUser;
let student: SeededUser;
/** Filed and triaged BEFORE the migration, so it is genuinely a legacy row. */
let legacyId: string;
let spamId: string;

async function makeAdmin(handle: TestDb, user: SeededUser) {
	await handle.sql(
		`insert into public.app_admins (email, granted_by) values ($1, $1)
		 on conflict (email) do nothing`,
		[user.email]
	);
}

/** A report filed the way a signed-in person's is: the direct own-row insert. */
async function fileReport(handle: TestDb, user: SeededUser, message: string): Promise<string> {
	return handle.asUser(user.id, async (q) => {
		const { rows } = await q<{ id: string }>(
			`insert into public.app_feedback (user_id, app, kind, message)
			 values ((select auth.uid()), 'classroom', 'bug', $1) returning id`,
			[message]
		);
		return rows[0].id;
	});
}

function setStatus(handle: TestDb, user: SeededUser, id: string, status: string) {
	return handle.asUser(user.id, async (q) => {
		const { rows } = await q<{ result: { ok: boolean; status: string } }>(
			'select public.app_feedback_set_status($1::uuid, $2::text) as result',
			[id, status]
		);
		return rows[0].result;
	});
}

async function statusOf(handle: TestDb, id: string): Promise<string | null> {
	const { rows } = await handle.sql<{ status: string }>(
		'select status from public.app_feedback where id = $1::uuid',
		[id]
	);
	return rows.length ? rows[0].status : null;
}

beforeAll(async () => {
	db = await startTestDb(PRE_0186);
	admin = await createUser(db, 'apina@boscotech.edu', 'A. Pina');
	student = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	await makeAdmin(db, admin);

	legacyId = await fileReport(db, student, 'The grade page will not open on my phone.');
	spamId = await fileReport(db, student, 'BUY CHEAP WATCHES AT example.net');

	// Moved through the PRE-0186 RPC, so the row carries a real triage history
	// across the apply rather than arriving fresh.
	const pre = await setStatus(db, admin, legacyId, 'seen');
	expect(pre.ok).toBe(true);

	await db.sql(SQL_0186);
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

describe('spam is a status, not a delete', () => {
	test('an admin can mark a report spam', async () => {
		const res = await setStatus(db, admin, spamId, 'spam');
		expect(res.ok).toBe(true);
		expect(res.status).toBe('spam');
		expect(await statusOf(db, spamId)).toBe('spam');
	});

	test('and the row, and its words, are still there', async () => {
		// THE CLAIM THE WHOLE CHOICE RESTS ON. Not "the row exists" alone: the
		// MESSAGE is what an export carries and what a later reader needs.
		const { rows } = await db.sql<{ message: string; created_at: string }>(
			'select message, created_at from public.app_feedback where id = $1::uuid',
			[spamId]
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].message).toBe('BUY CHEAP WATCHES AT example.net');
		expect(rows[0].created_at).toBeTruthy();
	});

	test('who marked it, and when, is recorded', async () => {
		const { rows } = await db.sql<{ reviewed_by: string; reviewed_at: string }>(
			'select reviewed_by, reviewed_at from public.app_feedback where id = $1::uuid',
			[spamId]
		);
		expect(rows[0].reviewed_by).toBe(admin.email);
		expect(rows[0].reviewed_at).toBeTruthy();
	});

	test('marking it spam is reversible by the same call', async () => {
		// THE UNDO IS THE PROPERTY, and there is no second RPC for it. A row
		// marked in error goes straight back into the queue.
		const back = await setStatus(db, admin, spamId, 'new');
		expect(back.ok).toBe(true);
		expect(await statusOf(db, spamId)).toBe('new');
		// Put it back, so the rest of the file reads a marked row.
		await setStatus(db, admin, spamId, 'spam');
		expect(await statusOf(db, spamId)).toBe('spam');
	});

	test('a row triaged before the migration is untouched by it', async () => {
		expect(await statusOf(db, legacyId)).toBe('seen');
	});

	test('and still moves through every status afterwards', async () => {
		for (const s of ['new', 'resolved', 'spam', 'seen']) {
			const res = await setStatus(db, admin, legacyId, s);
			expect(res.ok).toBe(true);
			expect(await statusOf(db, legacyId)).toBe(s);
		}
	});
});

describe('the write path did not widen', () => {
	test('a non-admin cannot mark anything spam, including their own report', async () => {
		await expect(setStatus(db, student, spamId, 'spam')).rejects.toThrow(
			/Only a site admin can triage feedback/
		);
		// AND NOTHING MOVED. A refusal that still wrote would be the whole defect.
		expect(await statusOf(db, spamId)).toBe('spam');
	});

	test('there is still no update grant and no update policy on the table', async () => {
		const { rows: grants } = await db.sql<{ grantee: string }>(
			`select grantee from information_schema.role_table_grants
			 where table_schema = 'public' and table_name = 'app_feedback'
			   and privilege_type = 'UPDATE' and grantee in ('anon', 'authenticated')`
		);
		expect(grants).toEqual([]);
		const { rows: pol } = await db.sql<{ policyname: string }>(
			`select policyname from pg_policies
			 where schemaname = 'public' and tablename = 'app_feedback' and cmd = 'UPDATE'`
		);
		expect(pol).toEqual([]);
	});

	test('and no delete grant and no delete policy either', async () => {
		// THE ALTERNATIVE THIS BUNDLE DID NOT TAKE, pinned so a later one has to
		// argue for it rather than add it quietly.
		const { rows: grants } = await db.sql<{ grantee: string }>(
			`select grantee from information_schema.role_table_grants
			 where table_schema = 'public' and table_name = 'app_feedback'
			   and privilege_type = 'DELETE' and grantee in ('anon', 'authenticated')`
		);
		expect(grants).toEqual([]);
		const { rows: pol } = await db.sql<{ policyname: string }>(
			`select policyname from pg_policies
			 where schemaname = 'public' and tablename = 'app_feedback' and cmd = 'DELETE'`
		);
		expect(pol).toEqual([]);
		// AND NO FUNCTION OFFERS ONE. A definer RPC would route around both.
		//
		// THE BACKSLASHES ARE DOUBLED because this is a JS template literal and an
		// UNRECOGNISED ESCAPE IN ONE IS KEPT AS THE BARE LETTER -- `\s` written
		// singly reaches Postgres as `s`, so the pattern becomes `deletes+froms+`
		// and matches nothing, silently, reporting a clean result. The positive
		// control below is what caught exactly that while this was being written.
		//
		// `\y` IS LOAD-BEARING: `app_feedback_rate` is a DIFFERENT table that
		// `app_feedback_submit` legitimately deletes from (0126's rate window is
		// also its retention), and an `ilike '%...app_feedback%'` matches it. A
		// probe that reported that as a delete of the reports themselves would
		// have to be relaxed, and the relaxation is what would hide a real one.
		const deletesFrom = async (handle: TestDb, table: string) => {
			const { rows } = await handle.sql<{ proname: string }>(
				`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public' and p.prosrc ~* ('delete\\s+from\\s+public\\.' || $1 || '\\y')
				 order by p.proname`,
				[table]
			);
			return rows.map((r) => r.proname);
		};
		expect(await deletesFrom(db, 'app_feedback')).toEqual([]);
		// POSITIVE CONTROL: the same probe DOES find the one function that
		// genuinely deletes, from the rate table beside it. Without this, an
		// empty result could equally mean the regex matches nothing at all.
		expect(await deletesFrom(db, 'app_feedback_rate')).toContain('app_feedback_submit');
	});

	test('an unknown status is still refused', async () => {
		await expect(setStatus(db, admin, spamId, 'archived')).rejects.toThrow(
			/Status must be new, seen, resolved or spam/
		);
		await expect(setStatus(db, admin, spamId, 'deleted')).rejects.toThrow(
			/Status must be new, seen, resolved or spam/
		);
	});

	test('the RPC is still admin-reachable and never anon-reachable', async () => {
		const { rows } = await db.sql<{ a: boolean; b: boolean }>(
			`select has_function_privilege('anon', 'public.app_feedback_set_status(uuid, text)', 'execute') as a,
			        has_function_privilege('authenticated', 'public.app_feedback_set_status(uuid, text)', 'execute') as b`
		);
		expect(rows[0].a).toBe(false);
		expect(rows[0].b).toBe(true);
	});
});

describe('the constraint is the backstop, not the RPC', () => {
	test('a raw write of an unknown status is refused by the table itself', async () => {
		// Run as the connection owner, which bypasses RLS and every grant -- so
		// the ONLY thing that can refuse this is the CHECK. Defence in depth: the
		// RPC's guard and the constraint are two layers, and this is the one that
		// holds if somebody ever adds a second write path.
		await expect(
			db.sql(`update public.app_feedback set status = 'archived' where id = $1::uuid`, [spamId])
		).rejects.toThrow(/app_feedback_status_check/);
	});

	test('and it admits exactly the four', async () => {
		const { rows } = await db.sql<{ def: string }>(
			`select pg_get_constraintdef(oid) as def from pg_constraint
			 where conrelid = 'public.app_feedback'::regclass and conname = 'app_feedback_status_check'`
		);
		expect(rows).toHaveLength(1);
		for (const s of ['new', 'seen', 'resolved', 'spam']) {
			expect(rows[0].def).toContain(`'${s}'`);
		}
	});
});

// ---------------------------------------------------------------------------
// THE MUTATION. A throwaway database, the constraint opened in the PERMISSIVE
// direction, and the refusal assertions above must stop holding.
// ---------------------------------------------------------------------------

describe('the constraint, opened', () => {
	test('with the CHECK dropped, an unknown status lands and the probe notices', async () => {
		const mutant = await startTestDb(PRE_0186);
		try {
			const a = await createUser(mutant, 'apina@boscotech.edu', 'A. Pina');
			const s = await createUser(mutant, 'ana@boscotech.net', 'Ana Reyes');
			await makeAdmin(mutant, a);
			await mutant.sql(SQL_0186);
			const id = await fileReport(mutant, s, 'seed');

			// As applied, the raw write is refused.
			await expect(
				mutant.sql(`update public.app_feedback set status = 'archived' where id = $1::uuid`, [id])
			).rejects.toThrow(/app_feedback_status_check/);

			// THE MUTATION: the backstop removed, nothing else touched.
			await mutant.sql('alter table public.app_feedback drop constraint app_feedback_status_check');

			await mutant.sql(`update public.app_feedback set status = 'archived' where id = $1::uuid`, [
				id
			]);
			// THE READING THAT MAKES THE ASSERTION ABOVE MEAN SOMETHING: with the
			// constraint gone the value really does land, so "refused" over there
			// is the constraint working rather than the write never happening.
			expect(await statusOf(mutant, id)).toBe('archived');

			// AND THE RPC'S OWN GUARD IS A SEPARATE LAYER, still refusing with the
			// backstop gone -- which is what "defence in depth" has to mean here.
			await expect(setStatus(mutant, a, id, 'archived')).rejects.toThrow(
				/Status must be new, seen, resolved or spam/
			);
		} finally {
			await mutant.stop();
		}
	}, 180_000);
});

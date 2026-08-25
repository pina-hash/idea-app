// tests/classroom-submission-open-race.test.ts
//
// 0134: TWO OF A STUDENT'S FILES ARRIVING AT ONCE MUST NOT LOSE ONE.
//
// A student's submission row is created lazily by the first thing they do on an
// assignment. Before 0133 the file uploads were sequential, so that lazy insert
// could never race itself; 0133 made them concurrent, which is the entire point
// of it, and the race that had been latent since 0086 fired on the first real
// attempt. Measured through the real UI against a real Supabase project: nine
// files picked at once, 7 landed, 2 came back with a raw
// `duplicate key value violates unique constraint
// classroom_submissions_item_id_student_email_key` and nothing to retry.
//
// THIS FILE IS BUILT AS A PAIRED MEASUREMENT, not as an assertion about timing.
// Two databases on the same cluster: one whose chain STOPS at 0133, one with
// 0134 over the top. The same concurrent burst is fired at both.
//
//   - the 0133 database is the POSITIVE CONTROL. It must raise at least once,
//     or this test is not exercising the race at all and its pass means
//     nothing. A count is reported either way.
//   - the 0134 database must never raise, and every caller must come back with
//     the SAME submission id -- one row, not one per winner.
//
// That is the shape a race test has to have. "The new code passed" is worthless
// on its own here: a burst that happened not to overlap passes on the broken
// code too.

import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';

const THROUGH_0133 = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0133_classroom_storage_attachments.sql'
] as const;

const THROUGH_0134 = [...THROUGH_0133, '0134_classroom_submission_open_race.sql'] as const;

/** How many callers fire at once, and how many rounds. The harness pool holds 4
 *  connections, so 4 is the real concurrency ceiling; the rounds are what make
 *  the control reliable rather than lucky. */
const BURST = 4;
const ROUNDS = 10;

interface Fixture {
	db: TestDb;
	students: SeededUser[];
	items: string[];
}

async function build(migrations: readonly string[]): Promise<Fixture> {
	const db = await startTestDb(migrations);
	const teacher = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	const students: SeededUser[] = [];
	for (let i = 0; i < ROUNDS; i += 1) {
		students.push(await createUser(db, `s${i}@boscotech.net`, `Student ${i}`));
	}

	const rpc = async <T>(userId: string, call: string, params: unknown[]): Promise<T> =>
		db.asUser(userId, async (q) => {
			const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
			return rows[0].result;
		});

	const course = await rpc<{ course_id: string }>(
		teacher.id,
		'public.classroom_upsert_course($1, $2)',
		['IDEA100', 'Intro to Engineering Design']
	);
	const section = await rpc<{ section_id: string }>(
		teacher.id,
		'public.classroom_upsert_section($1::uuid, $2, $3)',
		[course.course_id, 'Period 1', 'Block A']
	);
	for (const s of students) {
		await rpc(teacher.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
			section.section_id,
			s.email,
			s.email,
			true
		]);
	}

	// ONE ITEM PER ROUND. A fresh (item, student) pair per round is what makes
	// each round a genuine first-touch, which is the only moment the race exists.
	const items: string[] = [];
	for (let i = 0; i < ROUNDS; i += 1) {
		const item = await rpc<{ item_id: string }>(
			teacher.id,
			`public.classroom_create_item('assignment', $1::uuid[], $2, $3, $4, null, null, true, '[]'::jsonb, false)`,
			[[section.section_id], `Hand-in ${i}`, 'Do the work.', 30]
		);
		items.push(item.item_id);
	}

	return { db, students, items };
}

/**
 * Fire BURST concurrent `classroom_open_submission` calls for one student on
 * one item, from separate connections. Returns the ids that came back and the
 * SQLSTATEs of anything that raised.
 */
async function burst(
	db: TestDb,
	userId: string,
	itemId: string
): Promise<{ ids: string[]; codes: string[] }> {
	const settled = await Promise.all(
		Array.from({ length: BURST }, () =>
			db
				.asUser(userId, async (q) => {
					const { rows } = await q<{ result: { ok?: boolean; submission_id?: string } }>(
						'select public.classroom_open_submission($1::uuid) as result',
						[itemId]
					);
					return { ok: true as const, id: rows[0].result?.submission_id ?? null };
				})
				.catch((e: unknown) => ({
					ok: false as const,
					code: (e as { code?: string }).code ?? 'unknown'
				}))
		)
	);
	return {
		ids: settled.flatMap((r) => (r.ok && r.id ? [r.id] : [])),
		codes: settled.flatMap((r) => (r.ok ? [] : [r.code]))
	};
}

let before: Fixture;
let after: Fixture;

beforeAll(async () => {
	before = await build(THROUGH_0133);
	after = await build(THROUGH_0134);
}, 300_000);

afterAll(async () => {
	await before?.db?.stop();
	await after?.db?.stop();
});

describe('concurrent first-touch on a submission', () => {
	test('POSITIVE CONTROL: at 0133 the burst raises a unique violation', async () => {
		let raised = 0;
		let rounds = 0;
		for (let i = 0; i < ROUNDS; i += 1) {
			const r = await burst(before.db, before.students[i].id, before.items[i]);
			rounds += 1;
			raised += r.codes.filter((c) => c === '23505').length;
		}
		// Reported, not just asserted: if this ever comes back 0 the test below
		// is passing over a race it never provoked, and that is the failure mode
		// worth seeing in the output.
		console.log(
			`[submission race] 0133 control: ${raised} unique violation(s) across ${rounds} rounds of ${BURST}`
		);
		expect(raised, 'the race did not fire at all, so the fix is untested').toBeGreaterThan(0);
	});

	test('at 0134 the same burst never raises, and produces exactly ONE submission', async () => {
		let raised = 0;
		for (let i = 0; i < ROUNDS; i += 1) {
			const r = await burst(after.db, after.students[i].id, after.items[i]);
			raised += r.codes.length;
			// Every caller got an id...
			expect(r.ids, `round ${i}`).toHaveLength(BURST);
			// ...and it is the SAME id. Several rows would mean the unique index
			// was gone rather than the race being handled.
			expect(new Set(r.ids).size, `round ${i}: distinct submission ids`).toBe(1);
		}
		expect(raised, 'a caller raised under concurrency').toBe(0);

		const { rows } = await after.db.sql<{ n: string }>(
			`select count(*)::text as n from (
			   select item_id, student_email from public.classroom_submissions
			   group by item_id, student_email having count(*) > 1
			 ) d`
		);
		expect(Number(rows[0].n), 'duplicate (item, student) pairs').toBe(0);
	});

	test('a locked submission is still refused, and by its reason rather than by raising', async () => {
		// The conflict-tolerant path re-reads the row, so it has to re-ask the
		// question that could have changed while it was not looking. Asserted on
		// the ordinary (uncontended) path, which reaches the same guard.
		const student = after.students[0];
		const itemId = after.items[0];
		// The STATE is set as the connection owner rather than through
		// classroom_submit_assignment, because that RPC runs a preflight and
		// refuses an assignment with nothing in it -- which is correct, and is
		// not what is under test here. What is under test is the guard inside
		// classroom_open_submission, and it reads the column.
		const flipped = await after.db.sql(
			`update public.classroom_submissions set state = 'submitted'
			 where item_id = $1 and student_email = $2`,
			[itemId, student.email]
		);
		expect(flipped.rowCount, 'the submission the burst created').toBe(1);

		const r = await after.db.asUser(student.id, async (q) => {
			const { rows } = await q<{ result: { ok?: boolean; reason?: string } }>(
				'select public.classroom_open_submission($1::uuid) as result',
				[itemId]
			);
			return rows[0].result;
		});
		expect(r?.ok).toBe(false);
		expect(r?.reason).toBe('locked');
	});
});

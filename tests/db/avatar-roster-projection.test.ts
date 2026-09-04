// tests/db/avatar-roster-projection.test.ts
//
// 0179: THE ROSTER PROJECTS AN AVATAR, AND PROJECTS IT TO NOBODY NEW.
//
// This bundle's whole claim is that an avatar goes only where the same
// audience already sees the person's NAME. `classroom_section_roster` already
// returns `student_email` and `display_name` to a section manager; 0179 adds
// `avatar` and `avatar_url` beside them. So there are exactly three things
// worth proving and each one fails silently if it is wrong:
//
//   1. THE PROJECTION IS NECESSARY. A teacher of record cannot read a
//      student's `profiles` row directly -- "teachers select all profiles"
//      (0001) is `is_teacher()`, which 0067 redefined to `is_admin()`. If that
//      were false the migration would be pointless, and nothing on screen
//      would say so.
//   2. THE PROJECTION WORKS. A manager gets the avatar; a roster row with no
//      account, and one whose person chose no picture, come back NULL rather
//      than dropping the row.
//   3. THE GATE DID NOT MOVE. A student calling this still gets nothing.
//      That is the assertion this file exists for, and it is the one that
//      would pass vacuously if the seeding were wrong -- so it sits beside a
//      positive control on the same call.
//
// SEEDED THROUGH THE REAL PRE-MIGRATION WORLD, then 0179 applied over the top,
// because a migration tested only against a reset chain is a migration tested
// against a schema no production database has.

import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0069_notebook.sql',
	'0070_coin_economy.sql',
	'0071_notebook_optional_label.sql',
	'0075_notebook_optional_photo.sql',
	'0078_notebook_entry_notes.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0088_notebook_folders.sql',
	'0090_classroom_instructor_materials.sql',
	'0091_notebook_pin_and_activity.sql',
	'0094_notebook_classroom_sections.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0097_notebook_documentation_check.sql',
	'0098_notebook_session_postings.sql',
	'0106_notebook_instructor_student_access.sql',
	'0114_notebook_note_entry_session.sql',
	'0116_notebook_soft_delete.sql',
	'0117_notebook_soft_delete_restore.sql',
	'0118_notebook_draft_state.sql',
	'0120_notebook_session_item_link.sql',
	'0121_notebook_review_acknowledged.sql',
	'0138_classroom_manager_exclusion_and_enrollment_removal.sql'
] as const;

const MIGRATION_0179 = readFileSync(
	join(process.cwd(), 'supabase', 'migrations', '0179_classroom_roster_avatar.sql'),
	'utf8'
);

let db: TestDb;
let owner: SeededUser;
let teacher: SeededUser;
/** Manages a DIFFERENT section: the caller who may not see these people. */
let otherTeacher: SeededUser;
let otherSectionId: string;
/** Signed in, chose an upload. */
let alice: SeededUser;
/** Signed in, no chosen avatar and no Google photo. */
let bruno: SeededUser;
/** Signed in, Google photo only. */
let carla: SeededUser;
let sectionId: string;

async function rpc<T = Record<string, unknown>>(userId: string, call: string, params: unknown[]): Promise<T> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

/** The roster read exactly as `loadSectionRoster` makes it. */
type Row = {
	student_email: string;
	display_name: string | null;
	avatar: string | null;
	avatar_url: string | null;
};
async function roster(as: SeededUser): Promise<Row[]> {
	return db.asUser(as.id, async (q) => {
		const r = await q<Row>(`select * from public.classroom_section_roster($1)`, [sectionId]);
		return r.rows;
	});
}

beforeAll(async () => {
	db = await startTestDb([...CHAIN]);

	owner = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	teacher = await createUser(db, 'teacher@boscotech.edu', 'Tee Cher');
	otherTeacher = await createUser(db, 'other@boscotech.edu', 'Otto Ther');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bruno = await createUser(db, 'bruno@boscotech.net', 'Bruno Barros');
	carla = await createUser(db, 'carla@boscotech.net', 'Carla Cruz');

	// Pictures, set the way a person sets them: own row, own update policy.
	await db.asUser(alice.id, (q) =>
		q(`update public.profiles set avatar = $2 where id = $1`, [alice.id, `upload:${alice.id}/avatar-1.png`])
	);
	await db.asUser(carla.id, (q) =>
		q(`update public.profiles set avatar_url = $2 where id = $1`, [carla.id, 'https://lh3.example/carla.jpg'])
	);
	// Bruno deliberately has neither.

	// SEEDED THROUGH THE REAL RPCs, never a raw insert: the section and every
	// enrollment arrive the way the app makes them, so the roster read is
	// answering about a world the application could actually have produced.
	const courseId = (
		await rpc<{ course_id: string }>(teacher.id, 'public.classroom_upsert_course($1, $2)', [
			'IDEA100',
			'Intro to Engineering Design'
		])
	).course_id;
	sectionId = (
		await rpc<{ section_id: string }>(
			teacher.id,
			'public.classroom_upsert_section($1::uuid, $2, $3)',
			[courseId, 'Period 3', 'Block C']
		)
	).section_id;

	// A SECOND SECTION WITH A SECOND TEACHER, so the refusal below is about a
	// real manager of a real class rather than about a caller who manages
	// nothing -- those two fail for different reasons and only one of them is
	// the boundary this bundle rests on.
	otherSectionId = (
		await rpc<{ section_id: string }>(
			otherTeacher.id,
			'public.classroom_upsert_section($1::uuid, $2, $3)',
			[courseId, 'Period 9', 'Block A']
		)
	).section_id;
	await rpc(otherTeacher.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
		otherSectionId,
		'zoe@boscotech.net',
		'Zoe Zamora',
		true
	]);

	for (const [email, name] of [
		[alice.email, 'Alice Alvarez'],
		[bruno.email, 'Bruno Barros'],
		[carla.email, 'Carla Cruz'],
		// ON THE ROSTER, NEVER SIGNED IN -- no auth.users row at all, which is
		// the case the email/uuid bridge has to answer null for.
		['dana@boscotech.net', 'Dana Diaz']
	] as const) {
		await rpc(teacher.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
			sectionId,
			email,
			name,
			true
		]);
	}
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

describe('before 0179: the projection is genuinely unreachable', () => {
	test("A TEACHER OF RECORD CANNOT READ A STUDENT'S profiles ROW -- the reason 0179 exists", async () => {
		const seen = await db.asUser(teacher.id, (q) =>
			q<{ n: string }>(`select count(*)::text as n from public.profiles where id = $1`, [alice.id])
		);
		expect(Number(seen.rows[0].n)).toBe(0);
	});

	test('AND AN ADMIN CAN -- the positive control that says profiles is readable at all', async () => {
		await db.sql(`insert into public.app_admins (email) values ($1) on conflict do nothing`, [owner.email]);
		const seen = await db.asUser(owner.id, (q) =>
			q<{ n: string }>(`select count(*)::text as n from public.profiles where id = $1`, [alice.id])
		);
		expect(Number(seen.rows[0].n)).toBe(1);
	});

	test('the roster does not carry an avatar yet', async () => {
		const rows = await roster(teacher);
		expect(rows.length).toBe(4);
		expect(Object.keys(rows[0])).not.toContain('avatar');
	});
});

describe('after 0179', () => {
	beforeAll(async () => {
		await db.sql(MIGRATION_0179);
	});

	test('THE MANAGER GETS THE AVATAR, and every roster row survives', async () => {
		const rows = await roster(teacher);
		expect(rows.length).toBe(4);
		const by = Object.fromEntries(rows.map((r) => [r.student_email, r]));
		expect(by['alice@boscotech.net'].avatar).toBe(`upload:${alice.id}/avatar-1.png`);
		expect(by['carla@boscotech.net'].avatar_url).toBe('https://lh3.example/carla.jpg');
	});

	test('NULL IS AN ORDINARY ANSWER: no picture, and no account at all', async () => {
		const by = Object.fromEntries((await roster(teacher)).map((r) => [r.student_email, r]));
		// Signed in, chose nothing.
		expect(by['bruno@boscotech.net'].avatar).toBeNull();
		expect(by['bruno@boscotech.net'].avatar_url).toBeNull();
		// On the roster, never signed in -- and STILL A ROW, with a name.
		expect(by['dana@boscotech.net'].display_name).toBe('Dana Diaz');
		expect(by['dana@boscotech.net'].avatar).toBeNull();
		expect(by['dana@boscotech.net'].avatar_url).toBeNull();
	});

	test('THE GATE DID NOT MOVE: a student gets nothing, manager gets four', async () => {
		// The denial and its positive control on the same call, because an
		// empty result from a broken seed is indistinguishable from a refusal.
		expect((await roster(alice)).length).toBe(0);
		expect((await roster(bruno)).length).toBe(0);
		expect((await roster(teacher)).length).toBe(4);
	});

	test("ANOTHER SECTION'S TEACHER IS REFUSED THIS SECTION'S FACES", async () => {
		// CONTROL 1. `otherTeacher` is a genuine manager -- of Period 9 -- so a
		// zero here is the SECTION gate answering, not a caller with no
		// standing. The positive control is the same call for the section they
		// do manage, which must come back with a row and its avatar columns.
		expect((await roster(otherTeacher)).length).toBe(0);

		const theirs = await db.asUser(otherTeacher.id, (q) =>
			q<Row>(`select * from public.classroom_section_roster($1)`, [otherSectionId])
		);
		expect(theirs.rows.length).toBe(1);
		expect(theirs.rows[0].student_email).toBe('zoe@boscotech.net');
		expect(theirs.rows[0]).toHaveProperty('avatar');
	});

	test('AND A STUDENT STILL CANNOT REACH A PEER AVATAR ANY OTHER WAY', async () => {
		const seen = await db.asUser(bruno.id, (q) =>
			q<{ n: string }>(`select count(*)::text as n from public.profiles where id = $1`, [alice.id])
		);
		expect(Number(seen.rows[0].n)).toBe(0);
	});

	test('anon holds no EXECUTE, and authenticated does -- the ACL read back, not the guard believed', async () => {
		const r = await db.sql<{ a: boolean; b: boolean }>(
			`select has_function_privilege('anon', 'public.classroom_section_roster(uuid)', 'execute') as a,
			        has_function_privilege('authenticated', 'public.classroom_section_roster(uuid)', 'execute') as b`
		);
		expect(r.rows[0].a).toBe(false);
		expect(r.rows[0].b).toBe(true);
	});

	test('exactly ONE arity survives the drop/create -- the signature trap', async () => {
		const r = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
			 where n.nspname = 'public' and pr.proname = 'classroom_section_roster'`
		);
		expect(Number(r.rows[0].n)).toBe(1);
	});

	test('RE-APPLIES CLEANLY, because re-pasting a migration is ordinary', async () => {
		await db.sql(MIGRATION_0179);
		expect((await roster(teacher)).length).toBe(4);
	});
});

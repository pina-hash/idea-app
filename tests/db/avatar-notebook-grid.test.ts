// tests/db/avatar-notebook-grid.test.ts
//
// 0180: THE NOTEBOOK GRID'S ROSTER PROJECTS AN AVATAR, AND PROJECTS IT TO
// NOBODY NEW.
//
// This bundle's whole claim -- inherited from 0033's and re-verified here
// rather than read off it -- is that a face goes only where the same audience
// already sees the person's NAME. `notebook_get_section_grid` already returns
// `name` and `email` for every roster row to whoever clears
// `notebook_reviews_section`; 0180 adds `avatar` and `avatar_url` beside them.
//
// FOUR THINGS ARE WORTH PROVING AND EACH FAILS SILENTLY IF IT IS WRONG:
//
//   1. THE PROJECTION IS NECESSARY, AND 0179 DID NOT ALREADY DO IT. Two
//      separate reasons, both measured: an instructor of record cannot read a
//      student's `profiles` row at all ("teachers select all profiles" is
//      `is_teacher()`, which 0067 redefined to `is_admin()`), AND the notebook
//      grid does not call `classroom_section_roster` -- it calls
//      `_notebook_section_roster`, a different function with a different
//      population. If either were false the migration would be pointless and
//      nothing on screen would say so.
//   2. THE PROJECTION WORKS. A manager gets the avatar; a roster row with no
//      account, and one whose person chose no picture, come back NULL rather
//      than dropping the row.
//   3. THE GATE DID NOT MOVE. A signed-in NON-STAFF caller -- a student
//      enrolled in this very section, which is the widest a student can be --
//      still raises, and so does a genuine instructor of a DIFFERENT section.
//      Each denial sits beside a positive control on the same call, because an
//      empty or thrown result from a broken seed is indistinguishable from a
//      refusal.
//   4. THE ROSTER POPULATION DID NOT MOVE EITHER. 0180 re-signs
//      `_notebook_section_roster`, whose UNION decides who is on the grid at
//      all; a transcription slip there would silently add or drop people. The
//      row set is captured BEFORE the migration and compared after.
//
// SEEDED THROUGH THE REAL PRE-MIGRATION RPCs, then 0180 applied over the top,
// because a migration tested only against a reset chain is a migration tested
// against a schema no production database has.
//
// MUTATION IS AT THE END, because a mutant poisons the database it runs in.
// Restore is from a copy of the file text read ONCE at import, never
// `git checkout --` (which restores from HEAD and discards uncommitted work),
// and the copy's md5 is compared against the on-disk file after every restore.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './harness';

/** The chain the live project carries, through the sweep. */
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
	'0088_notebook_folders.sql',
	'0091_notebook_pin_and_activity.sql',
	'0094_notebook_classroom_sections.sql',
	'0098_notebook_session_postings.sql',
	'0099_notebook_view_as.sql',
	'0106_notebook_instructor_student_access.sql',
	'0114_notebook_note_entry_session.sql',
	'0116_notebook_soft_delete.sql',
	'0117_notebook_soft_delete_restore.sql',
	'0118_notebook_draft_state.sql',
	'0119_notebook_note_delete.sql',
	'0121_notebook_review_acknowledged.sql',
	// LAST in the chain, the sweep. 0138, 0140 and 0169 are applied by hand
	// after it, exactly as on the real project, and each revokes for itself.
	'0137_anon_execute_sweep.sql'
] as const;

const migration = (name: string): string =>
	readFileSync(fileURLToPath(new URL(`../../supabase/migrations/${name}`, import.meta.url)), 'utf8');

const FILE_0180 = fileURLToPath(new URL('../../supabase/migrations/0180_notebook_grid_avatar.sql', import.meta.url));
/** Read ONCE, at import, before anything can have mutated it. */
const MIGRATION_0180 = readFileSync(FILE_0180, 'utf8');
const MD5_0180 = createHash('md5').update(MIGRATION_0180).digest('hex');

let db: TestDb;
let owner: SeededUser;
/** Instructor of record for Period 1 -- NOT an admin. */
let teacher: SeededUser;
/** A genuine instructor, of Period 2. The caller who may not see these faces. */
let otherTeacher: SeededUser;
/** Signed in, chose an upload. */
let alice: SeededUser;
/** Signed in, chose nothing and Google gave nothing. */
let bruno: SeededUser;
/** Signed in, Google photo only. */
let carla: SeededUser;
let p1: string;
let p2: string;

interface GridStudentRow {
	student_key: string;
	id: string | null;
	name: string;
	email: string | null;
	enrolled: boolean;
	avatar?: string | null;
	avatar_url?: string | null;
}

async function rpc<T = Record<string, unknown>>(
	as: SeededUser,
	call: string,
	params: unknown[]
): Promise<T> {
	return db.asUser(as.id, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

/** The grid, exactly as `loadGrid` in `/notebook/review/+page.svelte` asks for it. */
async function grid(as: SeededUser, section: string): Promise<{ students: GridStudentRow[] }> {
	return rpc(as, 'public.notebook_get_section_grid($1, $2::integer)', [section, null]);
}

/** The refusal MESSAGE, or null if the call did not raise. */
async function refusal(as: SeededUser, section: string): Promise<string | null> {
	try {
		await grid(as, section);
		return null;
	} catch (e) {
		return (e as Error).message;
	}
}

const byEmail = (students: GridStudentRow[]) =>
	Object.fromEntries(students.map((s) => [s.email ?? s.student_key, s]));

/** The roster helper's own row set, as a stable string, for the population check. */
async function rosterShape(): Promise<string> {
	const { rows } = await db.sql<{ line: string }>(
		`select r.student_key || '|' || r.name || '|' || r.enrolled::text as line
		 from public._notebook_section_roster($1) r order by 1`,
		[p1]
	);
	return rows.map((r) => r.line).join('\n');
}

let rosterBefore: string;

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	// Applied by hand, in order, after the sweep -- the real project's shape.
	await db.sql(migration('0138_classroom_manager_exclusion_and_enrollment_removal.sql'));
	await db.sql(migration('0140_notebook_scheduled_check_ins.sql'));
	await db.sql(migration('0169_notebook_section_reviewer_tier.sql'));

	owner = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	teacher = await createUser(db, 'teacher@boscotech.edu', 'Tee Cher');
	otherTeacher = await createUser(db, 'other@boscotech.edu', 'Otto Ther');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bruno = await createUser(db, 'bruno@boscotech.net', 'Bruno Barros');
	carla = await createUser(db, 'carla@boscotech.net', 'Carla Cruz');

	// Pictures set the way a person sets them: own row, own update policy.
	await db.asUser(alice.id, (q) =>
		q(`update public.profiles set avatar = $2 where id = $1`, [
			alice.id,
			`upload:${alice.id}/avatar-1.png`
		])
	);
	await db.asUser(carla.id, (q) =>
		q(`update public.profiles set avatar_url = $2 where id = $1`, [
			carla.id,
			'https://lh3.example/carla.jpg'
		])
	);
	// Bruno deliberately has neither.

	await db.sql(`insert into public.app_admins (email) values ($1) on conflict do nothing`, [
		owner.email
	]);

	p1 = await createClassroomSection(db, {
		as: owner,
		courseCode: 'IDEA209H',
		courseTitle: 'Engineering I Honors',
		label: 'Period 1',
		teacherEmail: teacher.email
	});
	// A SECOND SECTION WITH A SECOND TEACHER, so the refusal below is about a
	// real manager of a real class rather than about a caller who manages
	// nothing -- those two fail for different reasons and only one of them is
	// the boundary this bundle rests on.
	p2 = await createClassroomSection(db, {
		as: owner,
		courseCode: 'IDEA209H',
		label: 'Period 2',
		teacherEmail: otherTeacher.email
	});

	for (const [email, name] of [
		[alice.email, 'Alice Alvarez'],
		[bruno.email, 'Bruno Barros'],
		[carla.email, 'Carla Cruz'],
		// ON THE ROSTER, NEVER SIGNED IN -- no auth.users row at all, which is
		// the case the email/uuid bridge has to answer null for.
		['dana@boscotech.net', 'Dana Diaz']
	] as const) {
		await enrollStudent(db, { as: teacher, sectionId: p1, email, displayName: name });
	}
	await enrollStudent(db, {
		as: otherTeacher,
		sectionId: p2,
		email: 'zoe@boscotech.net',
		displayName: 'Zoe Zamora'
	});

	rosterBefore = await rosterShape();
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

describe('before 0180: the projection is genuinely unreachable', () => {
	test("AN INSTRUCTOR OF RECORD CANNOT READ A STUDENT'S profiles ROW -- reason one", async () => {
		const seen = await db.asUser(teacher.id, (q) =>
			q<{ n: string }>(`select count(*)::text as n from public.profiles where id = $1`, [alice.id])
		);
		expect(Number(seen.rows[0].n)).toBe(0);
	});

	test('AND AN ADMIN CAN -- the positive control that says profiles is readable at all', async () => {
		const seen = await db.asUser(owner.id, (q) =>
			q<{ n: string }>(`select count(*)::text as n from public.profiles where id = $1`, [alice.id])
		);
		expect(Number(seen.rows[0].n)).toBe(1);
	});

	test('THE GRID DOES NOT CALL 0179 -- reason two, read off the catalog', async () => {
		// 0179 widened `classroom_section_roster`. If the grid called it, this
		// bundle would need no migration at all -- so the claim is checked
		// against the deployed function body rather than against the prose.
		const { rows } = await db.sql<{ src: string }>(
			`select p.prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'notebook_get_section_grid'`
		);
		expect(rows.length).toBe(1);
		expect(rows[0].src).toContain('_notebook_section_roster(');
		expect(rows[0].src).not.toContain('classroom_section_roster(');
	});

	test('AND 0179 IS APPLIED AND STILL DOES NOT HELP -- the positive control on reason two', async () => {
		// The classroom roster genuinely carries the avatar for these same
		// people, so "the grid has no avatar" is about the grid and not about
		// the data. Applied here so the two projections coexist exactly as they
		// will in production.
		await db.sql(migration('0179_classroom_roster_avatar.sql'));
		const { rows } = await db.asUser(teacher.id, (q) =>
			q<{ avatar: string | null }>(
				`select avatar from public.classroom_section_roster($1) where student_email = $2`,
				[p1, alice.email]
			)
		);
		expect(rows[0].avatar).toBe(`upload:${alice.id}/avatar-1.png`);

		const students = (await grid(teacher, p1)).students;
		expect(students.length).toBe(4);
		expect(Object.keys(students[0])).not.toContain('avatar');
	});
});

describe('after 0180', () => {
	beforeAll(async () => {
		await db.sql(MIGRATION_0180);
	});

	test('THE MANAGER GETS THE AVATAR, and every roster row survives', async () => {
		const students = (await grid(teacher, p1)).students;
		expect(students.length).toBe(4);
		const by = byEmail(students);
		expect(by[alice.email].avatar).toBe(`upload:${alice.id}/avatar-1.png`);
		expect(by[alice.email].avatar_url).toBeNull();
		expect(by[carla.email].avatar_url).toBe('https://lh3.example/carla.jpg');
		expect(by[carla.email].avatar).toBeNull();
	});

	test('NULL IS AN ORDINARY ANSWER: no picture, and no account at all', async () => {
		const by = byEmail((await grid(teacher, p1)).students);
		// Signed in, chose nothing.
		expect(by[bruno.email].avatar).toBeNull();
		expect(by[bruno.email].avatar_url).toBeNull();
		// On the roster, never signed in -- and STILL A ROW, with a name.
		expect(by['dana@boscotech.net'].name).toBe('Dana Diaz');
		expect(by['dana@boscotech.net'].id).toBeNull();
		expect(by['dana@boscotech.net'].avatar).toBeNull();
		expect(by['dana@boscotech.net'].avatar_url).toBeNull();
	});

	test('THE ROSTER POPULATION DID NOT MOVE -- the re-signing carried no slip', async () => {
		expect(await rosterShape()).toBe(rosterBefore);
	});

	test('AN ADMIN AND THE INSTRUCTOR SEE THE SAME FACES -- no tier gained detail', async () => {
		const t = byEmail((await grid(teacher, p1)).students);
		const a = byEmail((await grid(owner, p1)).students);
		for (const email of [alice.email, bruno.email, carla.email, 'dana@boscotech.net']) {
			expect(a[email].avatar).toBe(t[email].avatar);
			expect(a[email].avatar_url).toBe(t[email].avatar_url);
		}
	});

	test('THE GATE DID NOT MOVE: a signed-in student in THIS section is refused', async () => {
		// The widest a student can be with respect to this payload: enrolled in
		// the very section being asked about, signed in, with a profile row.
		const said = await refusal(alice, p1);
		expect(said).toMatch(/section instructor, a section reviewer, or a site admin/);
		// The positive control on the SAME call, so an exception thrown by a
		// broken seed cannot read as a refusal.
		expect((await grid(teacher, p1)).students.length).toBe(4);
	});

	test("ANOTHER SECTION'S INSTRUCTOR IS REFUSED THIS SECTION'S FACES", async () => {
		// `otherTeacher` genuinely manages Period 2, so a refusal here is the
		// SECTION gate answering rather than a caller with no standing at all.
		expect(await refusal(otherTeacher, p1)).toMatch(/section instructor/);
		// ...and the same call for the section they DO manage comes back with a
		// row and its avatar keys present.
		const theirs = (await grid(otherTeacher, p2)).students;
		expect(theirs.length).toBe(1);
		expect(theirs[0].email).toBe('zoe@boscotech.net');
		expect(theirs[0]).toHaveProperty('avatar');
		expect(theirs[0]).toHaveProperty('avatar_url');
	});

	test('AND A STUDENT STILL CANNOT REACH A PEER AVATAR ANY OTHER WAY', async () => {
		const seen = await db.asUser(bruno.id, (q) =>
			q<{ n: string }>(`select count(*)::text as n from public.profiles where id = $1`, [alice.id])
		);
		expect(Number(seen.rows[0].n)).toBe(0);
		// Nor by calling the roster helper directly: it is granted to nobody.
		let denied: string | null = null;
		try {
			await db.asUser(bruno.id, (q) =>
				q(`select * from public._notebook_section_roster($1)`, [p1])
			);
		} catch (e) {
			denied = (e as Error).message;
		}
		expect(denied).toMatch(/permission denied/i);
	});

	test('THE ACL READ BACK, not the guard believed', async () => {
		const r = await db.sql<{ ganon: boolean; gauth: boolean; ranon: boolean; rauth: boolean }>(
			`select has_function_privilege('anon', 'public.notebook_get_section_grid(uuid, int)', 'execute') as ganon,
			        has_function_privilege('authenticated', 'public.notebook_get_section_grid(uuid, int)', 'execute') as gauth,
			        has_function_privilege('anon', 'public._notebook_section_roster(uuid)', 'execute') as ranon,
			        has_function_privilege('authenticated', 'public._notebook_section_roster(uuid)', 'execute') as rauth`
		);
		expect(r.rows[0].ganon).toBe(false);
		expect(r.rows[0].gauth).toBe(true);
		// The helper is granted to NOBODY: its only caller is definer.
		expect(r.rows[0].ranon).toBe(false);
		expect(r.rows[0].rauth).toBe(false);
	});

	test('exactly ONE arity of each survives the drop/create -- the signature trap', async () => {
		const r = await db.sql<{ proname: string; n: string }>(
			`select pr.proname, count(*)::text as n from pg_proc pr
			 join pg_namespace n on n.oid = pr.pronamespace
			 where n.nspname = 'public'
			   and pr.proname in ('_notebook_section_roster', 'notebook_get_section_grid')
			 group by pr.proname order by pr.proname`
		);
		expect(r.rows.map((x) => [x.proname, Number(x.n)])).toEqual([
			['_notebook_section_roster', 1],
			['notebook_get_section_grid', 1]
		]);
	});

	test('NOTHING ELSE CALLS THE HELPER -- the plpgsql drop has no silent orphan', async () => {
		const r = await db.sql<{ proname: string }>(
			`select pr.proname from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
			 where n.nspname = 'public' and pr.prosrc like '%_notebook_section_roster(%'
			   and pr.proname <> '_notebook_section_roster'`
		);
		expect(r.rows.map((x) => x.proname)).toEqual(['notebook_get_section_grid']);
	});

	test('RE-APPLIES CLEANLY, because re-pasting a migration is ordinary', async () => {
		await db.sql(MIGRATION_0180);
		const by = byEmail((await grid(teacher, p1)).students);
		expect(by[alice.email].avatar).toBe(`upload:${alice.id}/avatar-1.png`);
		expect(await rosterShape()).toBe(rosterBefore);
	});
});

// ---------------------------------------------------------------------------
// CONTROL 3 (the prompt's third): break the projection's guard and confirm a
// non-staff caller STOPS being refused. Last, because a mutant poisons the
// database it runs in.
// ---------------------------------------------------------------------------
describe('mutation: the gate is what refuses, and opening it is visible', () => {
	test('OPENING notebook_reviews_section LETS A STUDENT READ EVERY FACE', async () => {
		// The refusal, green, immediately before the mutation.
		expect(await refusal(alice, p1)).toMatch(/section instructor/);

		// PERMISSIVE direction, per CLAUDE.md: a predicate commented out fails
		// closed and reddens almost nothing; `select true` reproduces the leak.
		const original = await db.sql<{ src: string }>(
			`select pg_get_functiondef(p.oid) as src from pg_proc p
			 join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'notebook_reviews_section'`
		);
		const restore = original.rows[0].src;
		expect(restore).toContain('notebook_reviews_section');

		await db.sql(`create or replace function public.notebook_reviews_section(p_section_id uuid)
			returns boolean language sql stable security definer set search_path = '' as $mut$ select true $mut$;`);
		try {
			const leaked = await grid(alice, p1);
			// THE MUTANT BITES: the student now reads the whole roster, avatars
			// and all. If this were still a refusal the denial assertion above
			// would have been passing for some other reason.
			expect(leaked.students.length).toBe(4);
			expect(byEmail(leaked.students)[carla.email].avatar_url).toBe(
				'https://lh3.example/carla.jpg'
			);
		} finally {
			await db.sql(restore);
		}

		// Restored, and the refusal is green again.
		expect(await refusal(alice, p1)).toMatch(/section instructor/);
		// The migration file on disk is byte-identical to what was tested.
		expect(createHash('md5').update(readFileSync(FILE_0180, 'utf8')).digest('hex')).toBe(MD5_0180);
	});
});

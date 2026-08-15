// tests/notebook-instructor-access.test.ts
//
// 0106: an instructor reads the WHOLE notebook of a student they teach, free-
// form entries included, and nobody else's.
//
// WHY THESE AND NOT MORE. Every assertion here is one that fails SILENTLY. A
// widened read predicate does not crash anything -- it either quietly hands a
// teacher a student they do not teach, or quietly keeps hiding the free-form
// entries this migration exists to reveal, and both look exactly like a working
// notebook from the inside. What the grid looks like, which name is a link and
// where it points are covered by pure functions and the dev harness.
//
// THE ONE THING THAT WOULD MAKE THIS SUITE MEANINGLESS is asserting the new
// access without pinning the OLD boundary beside it, so every "can" below has a
// matching "cannot" over the same shape of row: same table, same query, one
// enrollment apart.
//
// NOT COVERED HERE, on purpose, because it is already pinned elsewhere and a
// second copy is a second thing to keep true:
//   * a note may be ADDED to a check-in entry and NOT edited afterwards --
//     tests/notebook-notes.test.ts, which owns 0078's rule.
//   * a session-linked entry with no photo is still refused --
//     tests/notebook-entry-photo-rule.test.ts, which owns 0075's.
// 0106 touches neither rule; the check-in note work this session shipped was a
// UI gap, not a data-layer one.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	MIGRATIONS,
	type SeededUser,
	type TestDb
} from './db/harness';

const MIGRATION_PATH = fileURLToPath(
	new URL('../supabase/migrations/0106_notebook_instructor_student_access.sql', import.meta.url)
);

/**
 * The shared chain plus 0091, spliced in at its own place in the order.
 *
 * 0106's payload helper selects `pinned_at` and reads `notebook_entry_activity`,
 * both of which 0091 adds -- and the shared chain does not carry it, because no
 * suite before this one needed it. The helper is plpgsql, so its body is parsed
 * lazily and it CREATES cleanly without 0091; it simply cannot run. Which is the
 * point of naming the dependency here rather than leaning on that.
 */
const CHAIN = MIGRATIONS.flatMap((m) =>
	m === '0094_notebook_classroom_sections.sql' ? ['0091_notebook_pin_and_activity.sql', m] : [m]
);

let db: TestDb;

let owner: SeededUser; // the pinned admin: the chair tier
let teacherA: SeededUser; // teacher of record for section A only
let teacherB: SeededUser; // teacher of record for section B only
let unattachedStaff: SeededUser; // role 'teacher', teaches nothing, not an admin
let alice: SeededUser; // enrolled in A only
let bob: SeededUser; // enrolled in B only
let carol: SeededUser; // enrolled in A, then DEACTIVATED, but filed work there

let sectionA: string;
let sectionB: string;
let sessionA: string;

/** Entries with NO section at all -- the ones 0106 exists to reach. */
let aliceFree: string;
let bobFree: string;
let carolFree: string;
/** Section-scoped work, readable before 0106 through the section predicate. */
let aliceCheckIn: string;
let carolCheckIn: string;

interface Payload {
	student: { email: string; display_name: string | null; user_id: string | null };
	section_label: string | null;
	entries: { id: string; section_id: string | null; session_id: string | null }[];
	folders: { id: string; name: string }[];
	sessions: { id: string }[];
	activity: { id: string }[];
}

async function captureError(run: () => Promise<unknown>): Promise<{ code?: string; message: string }> {
	try {
		await run();
	} catch (error) {
		const e = error as { code?: string; message?: string };
		return { code: e.code, message: e.message ?? String(error) };
	}
	throw new Error('Expected this statement to be rejected, but it succeeded.');
}

/** Every notebook_entries row this user can actually SELECT, sorted. */
async function visibleEntryIds(userId: string): Promise<string[]> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ id: string }>('select id from public.notebook_entries');
		return rows.map((r) => r.id).sort();
	});
}

/**
 * The by-id read, which is the one that matters: a policy that filters a LIST
 * correctly can still hand over a row asked for by name, and that is the shape
 * an attacker uses.
 */
async function canReadEntryById(userId: string, entryId: string): Promise<boolean> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q('select id from public.notebook_entries where id = $1', [entryId]);
		return rows.length > 0;
	});
}

async function visiblePhotoCount(userId: string, entryId: string): Promise<number> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ n: string }>(
			'select count(*)::text as n from public.notebook_entry_photos where entry_id = $1',
			[entryId]
		);
		return Number(rows[0].n);
	});
}

async function visibleNoteCount(userId: string, entryId: string): Promise<number> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ n: string }>(
			'select count(*)::text as n from public.notebook_entry_notes where entry_id = $1',
			[entryId]
		);
		return Number(rows[0].n);
	});
}

async function studentNotebook(userId: string, email: string): Promise<Payload> {
	const { rows } = await db.asUser(userId, (q) =>
		q<{ result: Payload }>('select public.notebook_review_student_notebook($1) as result', [email])
	);
	return rows[0].result;
}

/** A free-form entry: no session, no section. The 0075/0078 tier. */
async function createFreeEntry(student: SeededUser, label: string): Promise<string> {
	const { rows } = await db.asUser(student.id, (q) =>
		q<{ result: { entry_id: string } }>(
			`select public.notebook_create_entry(
				p_student_id => $1, p_drive_file_id => $2, p_custom_label => $3) as result`,
			[student.id, `drive-${label}`, label]
		)
	);
	return rows[0].result.entry_id;
}

async function createCheckInEntry(
	student: SeededUser,
	sessionId: string,
	sectionId: string,
	file: string
): Promise<string> {
	const { rows } = await db.asUser(student.id, (q) =>
		q<{ result: { entry_id: string } }>(
			`select public.notebook_create_entry(
				p_student_id => $1, p_drive_file_id => $2,
				p_session_id => $3, p_section_id => $4) as result`,
			[student.id, file, sessionId, sectionId]
		)
	);
	return rows[0].result.entry_id;
}

/** The stored shape: 0078's sanitized block list, not Tiptap's own JSON. */
const NOTE = [{ type: 'p', runs: [{ text: 'Gearbox ratios worked out.' }] }];

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	owner = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	teacherA = await createUser(db, 'teacher.a@boscotech.edu', 'Teacher A');
	teacherB = await createUser(db, 'teacher.b@boscotech.edu', 'Teacher B');
	unattachedStaff = await createUser(db, 'nobody@boscotech.edu', 'Teaches Nothing');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bob = await createUser(db, 'bob@boscotech.net', 'Bob Brandt');
	carol = await createUser(db, 'carol@boscotech.net', 'Carol Chen');

	sectionA = await createClassroomSection(db, {
		as: owner,
		courseCode: 'IDEA209H',
		courseTitle: 'Engineering Design & Development',
		label: 'Period 2',
		teacherEmail: teacherA.email
	});
	sectionB = await createClassroomSection(db, {
		as: owner,
		courseCode: 'IDEA209H',
		label: 'Period 5',
		teacherEmail: teacherB.email
	});

	await enrollStudent(db, {
		as: teacherA,
		sectionId: sectionA,
		email: alice.email,
		displayName: 'Alvarez, Alice'
	});
	await enrollStudent(db, {
		as: teacherB,
		sectionId: sectionB,
		email: bob.email,
		displayName: 'Brandt, Bob'
	});
	// Carol: enrolled, files real work, then leaves. 0094 keeps her on the grid
	// precisely so that work is not hidden, and 0106 must not undo that.
	await enrollStudent(db, {
		as: teacherA,
		sectionId: sectionA,
		email: carol.email,
		displayName: 'Chen, Carol'
	});

	const { rows: session } = await db.asUser(teacherA.id, (q) =>
		q<{ result: { session_id: string } }>(
			`select public.notebook_admin_upsert_session(
				p_section_ids => $1::uuid[], p_unit_number => 1,
				p_session_date => '2026-03-02'::date, p_session_label => 'Lab 1') as result`,
			[[sectionA]]
		)
	);
	sessionA = session[0].result.session_id;

	aliceCheckIn = await createCheckInEntry(alice, sessionA, sectionA, 'drive-alice-checkin');
	carolCheckIn = await createCheckInEntry(carol, sessionA, sectionA, 'drive-carol-checkin');

	aliceFree = await createFreeEntry(alice, 'alice-sketches');
	bobFree = await createFreeEntry(bob, 'bob-sketches');
	carolFree = await createFreeEntry(carol, 'carol-sketches');

	// A note and a folder on the free-form entry, so the DELEGATED surfaces
	// (0078, 0088) are exercised and not just notebook_entries itself.
	await db.asUser(alice.id, (q) =>
		q('select public.notebook_add_note($1, $2::jsonb)', [aliceFree, JSON.stringify(NOTE)])
	);
	const { rows: folder } = await db.asUser(alice.id, (q) =>
		q<{ result: { folder_id: string } }>(
			'select public.notebook_upsert_folder($1, $2) as result',
			['Sketchbook', 'gold']
		)
	);
	await db.asUser(alice.id, (q) =>
		q('select public.notebook_move_entries($1::uuid[], $2)', [
			[aliceFree],
			folder[0].result.folder_id
		])
	);

	// Carol leaves AFTER filing. Her rows stay; her enrollment goes inactive.
	await enrollStudent(db, {
		as: teacherA,
		sectionId: sectionA,
		email: carol.email,
		displayName: 'Chen, Carol',
		active: false
	});
});

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 1. The gap this closes, and the boundary beside it.
// ---------------------------------------------------------------------------

describe('a free-form entry reaches the instructor who teaches its author', () => {
	test('the instructor reads it, by list AND by id', async () => {
		expect(await canReadEntryById(teacherA.id, aliceFree)).toBe(true);
		expect(await visibleEntryIds(teacherA.id)).toContain(aliceFree);
	});

	test('a teacher who does not teach that student cannot, by list OR by id', async () => {
		// The decisive pair: bobFree and aliceFree are the same SHAPE of row --
		// free-form, no section, nothing on them to tell apart -- and differ only
		// by whose roster their author is on.
		expect(await canReadEntryById(teacherB.id, aliceFree)).toBe(false);
		expect(await visibleEntryIds(teacherB.id)).not.toContain(aliceFree);
		expect(await canReadEntryById(teacherA.id, bobFree)).toBe(false);
		expect(await visibleEntryIds(teacherA.id)).not.toContain(bobFree);
	});

	test('each teacher sees exactly their own students, and no others', async () => {
		// teacherA teaches alice (and carol, who has left -- see below).
		expect(await visibleEntryIds(teacherA.id)).toEqual(
			[aliceFree, aliceCheckIn, carolCheckIn].sort()
		);
		// teacherB teaches bob and nobody else.
		expect(await visibleEntryIds(teacherB.id)).toEqual([bobFree]);
	});

	test('a staff account that teaches nothing sees nothing at all', async () => {
		// Keeps the rest honest: `teacher` is a role by email domain (0067's
		// naming trap), and if it had quietly re-acquired privilege every
		// assertion above would still pass while meaning nothing.
		expect(await visibleEntryIds(unattachedStaff.id)).toEqual([]);
		expect(await canReadEntryById(unattachedStaff.id, aliceFree)).toBe(false);
	});

	test('the chair tier reads every student, enrolled or not', async () => {
		const visible = await visibleEntryIds(owner.id);
		expect(visible).toContain(aliceFree);
		expect(visible).toContain(bobFree);
		expect(visible).toContain(carolFree);
	});

	test('a student still sees only their own, and gains nothing over a classmate', async () => {
		// The predicate this feature's isolation rests on is untouched, and the
		// new one answers false for anyone who is not staff.
		expect(await visibleEntryIds(alice.id)).toEqual([aliceFree, aliceCheckIn].sort());
		expect(await canReadEntryById(alice.id, bobFree)).toBe(false);
		expect(await canReadEntryById(alice.id, carolFree)).toBe(false);
		expect(await canReadEntryById(bob.id, aliceFree)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 2. The union, which is the part a strict replacement would have broken.
// ---------------------------------------------------------------------------

describe('a student who has LEFT the class', () => {
	test('their filed work stays readable to that instructor', async () => {
		// 0094 keeps them on the grid so already-reviewed work is not hidden. An
		// enrollment-only predicate would show the row and refuse its cells.
		expect(await canReadEntryById(teacherA.id, carolCheckIn)).toBe(true);
	});

	test('but their free-form entries do not, because they are no longer enrolled', async () => {
		expect(await canReadEntryById(teacherA.id, carolFree)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 3. The delegated surfaces. Widening one function has to widen all of them,
// which is the whole reason photos/notes/folders delegate rather than restate.
// ---------------------------------------------------------------------------

describe('photos, notes and folders follow the entry', () => {
	test('the instructor reads the photos and notes of a free-form entry', async () => {
		expect(await visiblePhotoCount(teacherA.id, aliceFree)).toBeGreaterThan(0);
		expect(await visibleNoteCount(teacherA.id, aliceFree)).toBe(1);
	});

	test('a teacher who does not teach that student reads neither', async () => {
		expect(await visiblePhotoCount(teacherB.id, aliceFree)).toBe(0);
		expect(await visibleNoteCount(teacherB.id, aliceFree)).toBe(0);
	});

	test('the folder holding it becomes visible, and only to that instructor', async () => {
		const names = async (userId: string) =>
			db.asUser(userId, async (q) => {
				const { rows } = await q<{ name: string }>('select name from public.notebook_folders');
				return rows.map((r) => r.name);
			});
		expect(await names(teacherA.id)).toContain('Sketchbook');
		expect(await names(teacherB.id)).not.toContain('Sketchbook');
	});
});

// ---------------------------------------------------------------------------
// 4. The RPC behind the UI.
// ---------------------------------------------------------------------------

describe('notebook_review_student_notebook', () => {
	test('hands the instructor the student’s WHOLE notebook, free entries included', async () => {
		const payload = await studentNotebook(teacherA.id, alice.email);
		expect(payload.student.email).toBe(alice.email);
		expect(payload.student.user_id).toBe(alice.id);
		expect(payload.entries.map((e) => e.id).sort()).toEqual([aliceFree, aliceCheckIn].sort());
		// The one that would have been missing before 0106.
		expect(payload.entries.some((e) => e.section_id === null && e.session_id === null)).toBe(true);
		expect(payload.folders.map((f) => f.name)).toContain('Sketchbook');
	});

	test('never returns more than the caller could read directly', async () => {
		// A payload wider than the policy would be a second, looser door onto the
		// same rows -- the failure this pairing exists to make impossible.
		const payload = await studentNotebook(teacherA.id, alice.email);
		const readable = await visibleEntryIds(teacherA.id);
		for (const entry of payload.entries) expect(readable).toContain(entry.id);
	});

	test('refuses a teacher who does not teach that student', async () => {
		const err = await captureError(() => studentNotebook(teacherB.id, alice.email));
		expect(err.message).toMatch(/instructor of one of this student/i);
	});

	test('refuses a staff account that teaches nothing', async () => {
		await captureError(() => studentNotebook(unattachedStaff.id, alice.email));
	});

	test('refuses a student, including for their own notebook', async () => {
		// Not a student surface: they have /notebook. Their own is refused too, so
		// the rule is "who may review", not "who may read".
		await captureError(() => studentNotebook(alice.id, alice.email));
		await captureError(() => studentNotebook(alice.id, bob.email));
	});

	test('refuses a student who has left, for the instructor they left', async () => {
		// Matches the policy exactly: their free-form work is no longer readable,
		// so the full-notebook view must not open either. The UI renders no link.
		await captureError(() => studentNotebook(teacherA.id, carol.email));
	});

	test('the chair reaches any student', async () => {
		expect((await studentNotebook(owner.id, bob.email)).entries.map((e) => e.id)).toEqual([bobFree]);
		expect((await studentNotebook(owner.id, carol.email)).entries.length).toBe(2);
	});

	test('normalizes the address, and refuses a malformed one rather than probing', async () => {
		const payload = await studentNotebook(teacherA.id, `  ${alice.email.toUpperCase()} `);
		expect(payload.student.email).toBe(alice.email);
		await captureError(() => studentNotebook(teacherA.id, 'not-an-address'));
	});

	test('an enrolled student with no account is an empty notebook, not a refusal', async () => {
		// 0094's rule: a roster row with no auth.users behind it is normal. The
		// two must stay distinguishable, which is why the guard raises rather
		// than answering null.
		await enrollStudent(db, {
			as: teacherA,
			sectionId: sectionA,
			email: 'dana.newcomer@boscotech.net',
			displayName: 'Newcomer, Dana'
		});
		const payload = await studentNotebook(teacherA.id, 'dana.newcomer@boscotech.net');
		expect(payload.student.user_id).toBeNull();
		expect(payload.entries).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// 5. The surface area itself.
// ---------------------------------------------------------------------------

describe('privileges', () => {
	test('anon can execute neither reader nor the predicate', async () => {
		const { rows } = await db.sql<{ name: string; anon: boolean }>(
			`select p.proname as name,
			        has_function_privilege('anon', p.oid, 'execute') as anon
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public'
			   and p.proname in ('notebook_review_student_notebook', 'notebook_manages_student',
			                     'notebook_can_read_entry', 'notebook_view_as_notebook')`
		);
		expect(rows.length).toBe(4);
		for (const row of rows) expect(row.anon).toBe(false);
	});

	test('the email-keyed core and the payload helper are reachable by nobody', async () => {
		// No grant, the `_notebook_` convention: granted, the first would be a
		// probe for who is on a roster and the second an unguarded read of any
		// student's notebook.
		const { rows } = await db.sql<{ name: string; anon: boolean; auth: boolean }>(
			`select p.proname as name,
			        has_function_privilege('anon', p.oid, 'execute') as anon,
			        has_function_privilege('authenticated', p.oid, 'execute') as auth
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public'
			   and p.proname in ('_notebook_manages_student_email', '_notebook_student_payload')`
		);
		expect(rows.length).toBe(2);
		for (const row of rows) {
			expect(row.anon).toBe(false);
			expect(row.auth).toBe(false);
		}
	});

	test('there is no write counterpart, and the reader is STABLE', async () => {
		// The same structural guarantee 0099 rests on: read-only because there is
		// nothing else in the family to call, not because the UI declines to.
		const { rows } = await db.sql<{ name: string; volatility: string }>(
			`select p.proname as name, p.provolatile as volatility
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname like 'notebook_review_student%'`
		);
		expect(rows.map((r) => r.name)).toEqual(['notebook_review_student_notebook']);
		expect(rows[0].volatility).toBe('s');
	});

	test('there is still no client write path to notebook_entries', async () => {
		for (const user of [alice, teacherA, owner]) {
			const err = await captureError(() =>
				db.asUser(user.id, (q) =>
					q('update public.notebook_entries set custom_label = $1 where id = $2', [
						'tampered',
						aliceFree
					])
				)
			);
			expect(err.code).toBe('42501');
		}
	});
});

// ---------------------------------------------------------------------------
// 6. The file re-applies. Migrations here are pasted in by hand, so a second
// run is an ordinary event -- 0088's died half way through in the live editor.
// ---------------------------------------------------------------------------

describe('idempotency', () => {
	test('re-running the migration twice changes nothing', async () => {
		const sql = readFileSync(MIGRATION_PATH, 'utf8');
		await db.sql(sql);
		await db.sql(sql);

		expect(await canReadEntryById(teacherA.id, aliceFree)).toBe(true);
		expect(await canReadEntryById(teacherB.id, aliceFree)).toBe(false);
		expect(await canReadEntryById(alice.id, bobFree)).toBe(false);

		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_policies
			 where schemaname = 'public' and tablename = 'notebook_entries'`
		);
		expect(Number(rows[0].n)).toBe(2);
	});
});

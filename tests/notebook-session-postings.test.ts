// tests/notebook-session-postings.test.ts
//
// 0098 makes a notebook check-in multi-section the way a Classroom item already
// is: ONE canonical notebook_sessions row, one notebook_session_postings row
// per section. Most of it is visible the moment anyone looks -- a missing
// column in a grid is not a silent failure.
//
// WHAT IS SILENT, and therefore why this file exists:
//
//   1. WHAT THE MIGRATION DID TO REAL DATA. Live check-ins exist. A migration
//      that quietly re-created them, or dropped an entry's link to one, looks
//      exactly like a working notebook to whoever opens it next -- the work is
//      still there, it is just no longer filed against anything. So the fixture
//      boots the chain SHORT OF 0098, seeds the OLD shape through the REAL
//      pre-0098 RPCs, and only then applies the real file over the top (the
//      0085 / 0095 / 0096 two-halves shape). Anything else is asserting against
//      a fixture that agrees with itself.
//   2. THE COMPOSITE KEY. 0069 made "an entry whose section disagrees with its
//      session" unrepresentable via a foreign key, not an RPC check. Repointing
//      that key at the postings table is the one part of this change that could
//      silently weaken -- every RPC would still pass its own checks.
//   3. THE ALL-OR-NOTHING AUTHORIZATION. Posting a check-in into a class you do
//      not manage writes a row that looks identical to a legitimate one. The
//      only way to find out is to try it.
//   4. UNPOSTING MUST DETACH, NEVER DESTROY. A student's photographed work
//      disappearing because a teacher tidied up their own class's schedule is
//      the worst outcome available here, and it would be discovered weeks later.
//   5. THE SIGNATURE TRAP. p_section_id (uuid) became p_section_ids (uuid[]).
//      A surviving old arity is a second overload that files a check-in into one
//      section while the caller believes they picked three.
//   6. RE-APPLYING. Migrations here are pasted in by hand, so a re-run is
//      ordinary -- and 0088 shipped one that died on its second run.
//
// Deliberately NOT covered: which sections the form pre-checks, how the "posted
// to" line reads, column ordering. Those are a pure layer and a dev harness.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	MIGRATIONS,
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';

const POSTINGS_FILE = '0098_notebook_session_postings.sql';
/** Everything up to but NOT including 0098: the world as it was. */
const CHAIN_BEFORE = MIGRATIONS.filter((m) => m !== POSTINGS_FILE);
const POSTINGS_SQL = readFileSync(
	fileURLToPath(new URL(`../supabase/migrations/${POSTINGS_FILE}`, import.meta.url)),
	'utf8'
);

let db: TestDb;

let teacherA: SeededUser; // teaches sections 1 and 2
let teacherB: SeededUser; // teaches section 3 only
let chair: SeededUser; // the pinned 0067 owner
let ada: SeededUser; // student in section 1
let ben: SeededUser; // student in section 3

let section1: string;
let section2: string;
let section3: string;

/** Seeded BEFORE 0098, in the single-section shape. */
let legacySession: string;
let legacyEntry: string;
let legacyOtherSession: string;

interface Grid {
	sessions: { id: string; unit_number: number; session_date: string; session_label: string }[];
	cells: {
		student_key: string;
		session_id: string;
		status: string;
		entry_id: string | null;
		entry_count: number;
	}[];
}

async function grid(as: SeededUser, sectionId: string): Promise<Grid> {
	const { rows } = await db.asUser(as.id, (q) =>
		q<{ result: Grid }>('select public.notebook_get_section_grid($1) as result', [sectionId])
	);
	return rows[0].result;
}

/** Create a check-in across N sections through the post-0098 RPC. */
async function createSession(
	as: SeededUser,
	sectionIds: string[],
	unit: number,
	date: string,
	label: string
): Promise<string> {
	const { rows } = await db.asUser(as.id, (q) =>
		q<{ result: { session_id: string } }>(
			'select public.notebook_admin_upsert_session($1::uuid[], $2, $3, $4) as result',
			[sectionIds, unit, date, label]
		)
	);
	return rows[0].result.session_id;
}

/** A student files a photographed entry against a check-in. */
async function fileEntry(
	student: SeededUser,
	sessionId: string,
	driveFileId: string,
	sectionId: string | null = null
): Promise<string> {
	const { rows } = await db.asUser(student.id, (q) =>
		q<{ result: { entry_id: string } }>(
			`select public.notebook_create_entry(
				p_student_id => $1, p_drive_file_id => $2, p_session_id => $3, p_section_id => $4)
			 as result`,
			[student.id, driveFileId, sessionId, sectionId]
		)
	);
	return rows[0].result.entry_id;
}

async function sectionsOf(sessionId: string): Promise<string[]> {
	const { rows } = await db.sql<{ section_id: string }>(
		`select section_id from public.notebook_session_postings
		 where session_id = $1 order by section_id`,
		[sessionId]
	);
	return rows.map((r) => r.section_id);
}

async function captureError(fn: () => Promise<unknown>): Promise<{ code?: string; message: string }> {
	try {
		await fn();
	} catch (error) {
		return error as { code?: string; message: string };
	}
	throw new Error('expected a rejection, got none');
}

beforeAll(async () => {
	db = await startTestDb(CHAIN_BEFORE);

	chair = await createUser(db, 'apina@boscotech.edu', 'A Pina'); // the pinned owner
	teacherA = await createUser(db, 'teacher.a@boscotech.edu', 'Teacher A');
	teacherB = await createUser(db, 'teacher.b@boscotech.edu', 'Teacher B');
	ada = await createUser(db, 'ada.pike@boscotech.net', 'Ada Pike');
	ben = await createUser(db, 'ben.okafor@boscotech.net', 'Ben Okafor');

	section1 = await createClassroomSection(db, {
		as: teacherA,
		courseCode: 'IDEA209H',
		courseTitle: 'Engineering Design',
		label: 'Period 1',
		teacherEmail: teacherA.email
	});
	section2 = await createClassroomSection(db, {
		as: teacherA,
		courseCode: 'IDEA209H',
		label: 'Period 2',
		teacherEmail: teacherA.email
	});
	section3 = await createClassroomSection(db, {
		as: teacherB,
		courseCode: 'IDEA209H',
		label: 'Period 3',
		teacherEmail: teacherB.email
	});

	await enrollStudent(db, {
		as: teacherA,
		sectionId: section1,
		email: ada.email,
		displayName: 'Pike, Ada'
	});
	await enrollStudent(db, {
		as: teacherB,
		sectionId: section3,
		email: ben.email,
		displayName: 'Okafor, Ben'
	});

	// ---- THE OLD SHAPE, through the REAL pre-0098 RPC. -----------------------
	const legacy = await db.asUser(teacherA.id, (q) =>
		q<{ result: { session_id: string } }>(
			'select public.notebook_admin_upsert_session($1, $2, $3, $4) as result',
			[section1, 3, '2026-10-14', 'Bearing teardown']
		)
	);
	legacySession = legacy.rows[0].result.session_id;

	const other = await db.asUser(teacherB.id, (q) =>
		q<{ result: { session_id: string } }>(
			'select public.notebook_admin_upsert_session($1, $2, $3, $4) as result',
			[section3, 1, '2026-10-15', 'Capstone kickoff']
		)
	);
	legacyOtherSession = other.rows[0].result.session_id;

	// A real student's real work, filed against the old-shape check-in.
	legacyEntry = await fileEntry(ada, legacySession, 'drive-legacy-1');

	// ---- 0098, over the top of all of it. -----------------------------------
	await db.sql(POSTINGS_SQL);
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 1. What the migration did to rows that already existed.
// ---------------------------------------------------------------------------

describe('the migration over real data', () => {
	it('keeps every existing check-in, id and fields intact', async () => {
		const { rows } = await db.sql<{
			id: string;
			unit_number: number;
			session_date: string;
			session_label: string;
			created_by: string;
		}>(
			`select id, unit_number, to_char(session_date, 'YYYY-MM-DD') as session_date,
			        session_label, created_by
			 from public.notebook_sessions where id = $1`,
			[legacySession]
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].unit_number).toBe(3);
		expect(rows[0].session_date).toBe('2026-10-14');
		expect(rows[0].session_label).toBe('Bearing teardown');
		// Authorship survives too: it is not a fresh row wearing the old id.
		expect(rows[0].created_by).toBe(teacherA.id);
	});

	it('posts each one to exactly the section it already belonged to', async () => {
		expect(await sectionsOf(legacySession)).toEqual([section1]);
		expect(await sectionsOf(legacyOtherSession)).toEqual([section3]);

		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_session_postings`
		);
		// Two legacy check-ins, one posting each. Nothing invented.
		expect(Number(rows[0].n)).toBe(2);
	});

	it('preserves every entry link, section included', async () => {
		const { rows } = await db.sql<{ session_id: string | null; section_id: string | null }>(
			`select session_id, section_id from public.notebook_entries where id = $1`,
			[legacyEntry]
		);
		expect(rows[0].session_id).toBe(legacySession);
		expect(rows[0].section_id).toBe(section1);

		// And the photo it was filed with is still attached to it.
		const photos = await db.sql<{ drive_file_id: string }>(
			`select drive_file_id from public.notebook_entry_photos where entry_id = $1`,
			[legacyEntry]
		);
		expect(photos.rows.map((r) => r.drive_file_id)).toEqual(['drive-legacy-1']);
	});

	it('still shows the migrated check-in on its own section grid', async () => {
		const g = await grid(teacherA, section1);
		expect(g.sessions.map((s) => s.id)).toContain(legacySession);
		const cell = g.cells.find(
			(c) => c.session_id === legacySession && c.student_key === ada.email
		);
		expect(cell?.status).toBe('compliant');
		expect(cell?.entry_id).toBe(legacyEntry);
	});

	it('drops the single-section column and its unique key', async () => {
		const col = await db.sql<{ n: string }>(
			`select count(*)::text as n from information_schema.columns
			 where table_schema = 'public' and table_name = 'notebook_sessions'
			   and column_name = 'section_id'`
		);
		expect(Number(col.rows[0].n)).toBe(0);

		const uniq = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_constraint
			 where conname = 'notebook_sessions_id_section_key'`
		);
		expect(Number(uniq.rows[0].n)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// 2. The composite key, repointed rather than lost.
// ---------------------------------------------------------------------------

describe('the composite key', () => {
	it('now references the postings table', async () => {
		const { rows } = await db.sql<{ def: string }>(
			`select pg_get_constraintdef(oid) as def from pg_constraint
			 where conname = 'notebook_entries_session_posting_fkey'`
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].def).toMatch(/FOREIGN KEY \(session_id, section_id\)/i);
		expect(rows[0].def).toMatch(/REFERENCES notebook_session_postings\(session_id, section_id\)/i);

		// The one it replaced is gone, not left beside it.
		const old = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_constraint
			 where conname = 'notebook_entries_session_section_fkey'`
		);
		expect(Number(old.rows[0].n)).toBe(0);
	});

	it('refuses an entry filed into a section the check-in does not run in', async () => {
		// THE DECISIVE CASE, and why the constraint is composite. This runs as
		// the CONNECTION OWNER -- no RLS, no RPC, no application check of any
		// kind -- so the only thing that can refuse it is the key itself.
		const error = await captureError(() =>
			db.sql(
				`insert into public.notebook_entries (student_id, section_id, session_id)
				 values ($1, $2, $3)`,
				[ada.id, section2, legacySession]
			)
		);
		expect(error.code).toBe('23503');
	});
});

// ---------------------------------------------------------------------------
// 3. The signature trap.
// ---------------------------------------------------------------------------

describe('the signature trap', () => {
	it('leaves exactly one notebook_admin_upsert_session, taking an array', async () => {
		const { rows } = await db.sql<{ args: string }>(
			`select pg_get_function_identity_arguments(p.oid) as args
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'notebook_admin_upsert_session'`
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].args).toMatch(/uuid\[\]/);
	});

	it('leaves exactly one of every other RPC it recreated', async () => {
		const { rows } = await db.sql<{ proname: string; n: string }>(
			`select proname, count(*)::text as n
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and proname in (
				 'notebook_admin_delete_session', 'notebook_create_entry',
				 'notebook_admin_override_entry', 'notebook_admin_set_excusal',
				 'notebook_get_section_grid', 'notebook_add_session_postings',
				 'notebook_remove_session_posting')
			 group by proname order by proname`
		);
		expect(rows).toHaveLength(7);
		expect(rows.every((r) => Number(r.n) === 1)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 4. One check-in, three sections.
// ---------------------------------------------------------------------------

describe('a check-in posted to three sections', () => {
	let shared: string;

	beforeAll(async () => {
		shared = await createSession(
			chair, // the admin manages every section, which is what a three-way needs
			[section1, section2, section3],
			1,
			'2026-11-02',
			'Unit 1 lab log'
		);
	});

	it('is ONE canonical record with three postings', async () => {
		const sessions = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_sessions where id = $1`,
			[shared]
		);
		expect(Number(sessions.rows[0].n)).toBe(1);
		expect((await sectionsOf(shared)).sort()).toEqual([section1, section2, section3].sort());
	});

	it('appears as one column in EACH section’s grid, under the same id', async () => {
		for (const [as, sectionId] of [
			[teacherA, section1],
			[teacherA, section2],
			[teacherB, section3]
		] as const) {
			const g = await grid(as, sectionId);
			const matches = g.sessions.filter((s) => s.id === shared);
			expect(matches).toHaveLength(1);
			expect(matches[0].session_label).toBe('Unit 1 lab log');
			expect(String(matches[0].session_date)).toContain('2026-11-02');
		}
	});

	it('edited ONCE, updates all three', async () => {
		await db.asUser(chair.id, (q) =>
			q('select public.notebook_admin_upsert_session($1::uuid[], $2, $3, $4, $5)', [
				[section1, section2, section3],
				1,
				'2026-11-09',
				'Unit 1 lab log (moved)',
				shared
			])
		);

		for (const [as, sectionId] of [
			[teacherA, section1],
			[teacherA, section2],
			[teacherB, section3]
		] as const) {
			const g = await grid(as, sectionId);
			const found = g.sessions.find((s) => s.id === shared);
			expect(found?.session_label).toBe('Unit 1 lab log (moved)');
			expect(String(found?.session_date)).toContain('2026-11-09');
		}
	});

	it('keeps each section’s entries on its OWN grid', async () => {
		const adaEntry = await fileEntry(ada, shared, 'drive-ada-shared', section1);
		const benEntry = await fileEntry(ben, shared, 'drive-ben-shared', section3);

		const g1 = await grid(teacherA, section1);
		const cell1 = g1.cells.find((c) => c.session_id === shared && c.student_key === ada.email);
		expect(cell1?.entry_id).toBe(adaEntry);
		// Ben is not on section 1's roster at all, so his work cannot appear here.
		expect(g1.cells.some((c) => c.student_key === ben.email)).toBe(false);

		const g3 = await grid(teacherB, section3);
		const cell3 = g3.cells.find((c) => c.session_id === shared && c.student_key === ben.email);
		expect(cell3?.entry_id).toBe(benEntry);

		// Section 2 shares the check-in and has nobody on it: a column, no cells.
		const g2 = await grid(teacherA, section2);
		expect(g2.sessions.some((s) => s.id === shared)).toBe(true);
		expect(g2.cells.filter((c) => c.session_id === shared)).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// 5. Authorization: all-or-nothing across every section involved.
// ---------------------------------------------------------------------------

describe('who may post a check-in where', () => {
	it('refuses a teacher posting into a section they do not manage', async () => {
		const error = await captureError(() =>
			createSession(teacherA, [section1, section3], 2, '2026-11-16', 'Not yours')
		);
		expect(error.message).toMatch(/not the teacher of record/i);

		// And nothing landed: not the canonical row, not a partial posting.
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_sessions where session_label = 'Not yours'`
		);
		expect(Number(rows[0].n)).toBe(0);
	});

	it('lets that same teacher post across the two they DO manage', async () => {
		const id = await createSession(teacherA, [section1, section2], 2, '2026-11-16', 'Both mine');
		expect((await sectionsOf(id)).sort()).toEqual([section1, section2].sort());
	});

	it('refuses adding a foreign section to an existing check-in', async () => {
		const id = await createSession(teacherA, [section1], 4, '2026-11-20', 'Mine alone');
		const error = await captureError(() =>
			db.asUser(teacherA.id, (q) =>
				q('select public.notebook_add_session_postings($1, $2::uuid[])', [id, [section3]])
			)
		);
		expect(error.message).toMatch(/not the teacher of record/i);
		expect(await sectionsOf(id)).toEqual([section1]);
	});

	it('refuses editing a check-in the caller does not manage in every section', async () => {
		const id = await createSession(chair, [section1, section3], 5, '2026-11-24', 'Shared A+B');

		// Listing the foreign section is refused by the target check...
		const listed = await captureError(() =>
			db.asUser(teacherA.id, (q) =>
				q('select public.notebook_admin_upsert_session($1::uuid[], $2, $3, $4, $5)', [
					[section1, section3],
					5,
					'2026-11-25',
					'Rewritten by A',
					id
				])
			)
		);
		expect(listed.message).toMatch(/not the teacher of record/i);

		// ...and listing ONLY their own section does not get them in either.
		// That is the case that matters: reconcile-to-my-section-only would
		// otherwise be a way to seize a shared check-in and unpost the class
		// that shares it.
		const trimmed = await captureError(() =>
			db.asUser(teacherA.id, (q) =>
				q('select public.notebook_admin_upsert_session($1::uuid[], $2, $3, $4, $5)', [
					[section1],
					5,
					'2026-11-25',
					'Rewritten by A',
					id
				])
			)
		);
		expect(trimmed.message).toMatch(/every section this check-in runs in/i);

		// Unchanged, in both classes.
		const { rows } = await db.sql<{ session_label: string }>(
			`select session_label from public.notebook_sessions where id = $1`,
			[id]
		);
		expect(rows[0].session_label).toBe('Shared A+B');
		expect((await sectionsOf(id)).sort()).toEqual([section1, section3].sort());
	});

	it('lets the admin tier through, since it manages every section', async () => {
		const id = await createSession(chair, [section1, section3], 6, '2026-12-01', 'Admin made');
		expect((await sectionsOf(id)).sort()).toEqual([section1, section3].sort());
	});

	it('refuses an empty target list', async () => {
		const error = await captureError(() => createSession(teacherA, [], 7, '2026-12-02', 'Nowhere'));
		expect(error.message).toMatch(/at least one section/i);
	});

	it('refuses a student outright', async () => {
		const error = await captureError(() =>
			createSession(ada, [section1], 8, '2026-12-03', 'Student made')
		);
		expect(error.message).toMatch(/not the teacher of record/i);
	});
});

// ---------------------------------------------------------------------------
// 6. Unposting detaches, never destroys.
// ---------------------------------------------------------------------------

describe('unposting one section', () => {
	let shared: string;
	let adaEntry: string;
	let benEntry: string;

	beforeAll(async () => {
		shared = await createSession(
			chair,
			[section1, section3],
			9,
			'2026-12-08',
			'Shared teardown'
		);
		adaEntry = await fileEntry(ada, shared, 'drive-ada-unpost', section1);
		benEntry = await fileEntry(ben, shared, 'drive-ben-unpost', section3);
	});

	it('keeps the entries, relabelled, and leaves the other section alone', async () => {
		const { rows } = await db.asUser(teacherB.id, (q) =>
			q<{ result: { ok: boolean; detached_entries: number; remaining: number } }>(
				'select public.notebook_remove_session_posting($1, $2) as result',
				[shared, section3]
			)
		);
		expect(rows[0].result.ok).toBe(true);
		expect(rows[0].result.detached_entries).toBe(1);
		expect(rows[0].result.remaining).toBe(1);

		// Ben's work is STILL THERE: same row, same photos, no session, and
		// labelled with the check-in it used to belong to.
		const ben = await db.sql<{
			session_id: string | null;
			section_id: string | null;
			custom_label: string | null;
		}>(`select session_id, section_id, custom_label from public.notebook_entries where id = $1`, [
			benEntry
		]);
		expect(ben.rows).toHaveLength(1);
		expect(ben.rows[0].session_id).toBeNull();
		expect(ben.rows[0].section_id).toBe(section3);
		expect(ben.rows[0].custom_label).toBe('Shared teardown');

		const photos = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_entry_photos where entry_id = $1`,
			[benEntry]
		);
		expect(Number(photos.rows[0].n)).toBe(1);

		// Section 1 is untouched: still posted, still holding Ada's entry.
		expect(await sectionsOf(shared)).toEqual([section1]);
		const ada1 = await db.sql<{ session_id: string | null }>(
			`select session_id from public.notebook_entries where id = $1`,
			[adaEntry]
		);
		expect(ada1.rows[0].session_id).toBe(shared);
	});

	it('drops the column from that section’s grid only', async () => {
		expect((await grid(teacherB, section3)).sessions.some((s) => s.id === shared)).toBe(false);
		expect((await grid(teacherA, section1)).sessions.some((s) => s.id === shared)).toBe(true);
	});

	it('refuses the LAST posting as a structured answer, not an exception', async () => {
		const { rows } = await db.asUser(teacherA.id, (q) =>
			q<{ result: { ok: boolean; reason: string } }>(
				'select public.notebook_remove_session_posting($1, $2) as result',
				[shared, section1]
			)
		);
		expect(rows[0].result.ok).toBe(false);
		expect(rows[0].result.reason).toBe('last_posting');
		expect(await sectionsOf(shared)).toEqual([section1]);
	});

	it('is the WEAKER permission: a teacher may unpost their own section only', async () => {
		const id = await createSession(chair, [section1, section3], 10, '2026-12-10', 'Weak unpost');

		// Teacher A does not manage section 3, so cannot take it off.
		const error = await captureError(() =>
			db.asUser(teacherA.id, (q) =>
				q('select public.notebook_remove_session_posting($1, $2)', [id, section3])
			)
		);
		expect(error.message).toMatch(/teacher of record/i);

		// But teacher B can take THEIR OWN class off a check-in they do not
		// otherwise manage -- the deliberate asymmetry.
		const { rows } = await db.asUser(teacherB.id, (q) =>
			q<{ result: { ok: boolean } }>(
				'select public.notebook_remove_session_posting($1, $2) as result',
				[id, section3]
			)
		);
		expect(rows[0].result.ok).toBe(true);
		expect(await sectionsOf(id)).toEqual([section1]);
	});

	it('reconciling a section away on edit detaches it the same way', async () => {
		const id = await createSession(chair, [section1, section3], 11, '2026-12-14', 'Reconcile');
		const entry = await fileEntry(ben, id, 'drive-ben-reconcile', section3);

		const { rows } = await db.asUser(chair.id, (q) =>
			q<{ result: { removed: number; detached_entries: number } }>(
				'select public.notebook_admin_upsert_session($1::uuid[], $2, $3, $4, $5) as result',
				[[section1], 11, '2026-12-14', 'Reconcile', id]
			)
		);
		expect(rows[0].result.removed).toBe(1);
		expect(rows[0].result.detached_entries).toBe(1);

		const kept = await db.sql<{ session_id: string | null; custom_label: string | null }>(
			`select session_id, custom_label from public.notebook_entries where id = $1`,
			[entry]
		);
		expect(kept.rows).toHaveLength(1);
		expect(kept.rows[0].session_id).toBeNull();
		expect(kept.rows[0].custom_label).toBe('Reconcile');
	});
});

// ---------------------------------------------------------------------------
// 7. Deleting the whole check-in.
// ---------------------------------------------------------------------------

describe('deleting a multi-section check-in', () => {
	it('detaches every section’s entries and takes the postings with it', async () => {
		const id = await createSession(chair, [section1, section3], 12, '2027-01-05', 'Doomed');
		const adaEntry = await fileEntry(ada, id, 'drive-ada-doomed', section1);
		const benEntry = await fileEntry(ben, id, 'drive-ben-doomed', section3);

		const { rows } = await db.asUser(chair.id, (q) =>
			q<{ result: { deleted: boolean; detached_entries: number } }>(
				'select public.notebook_admin_delete_session($1) as result',
				[id]
			)
		);
		expect(rows[0].result.deleted).toBe(true);
		expect(rows[0].result.detached_entries).toBe(2);

		expect(await sectionsOf(id)).toEqual([]);
		const kept = await db.sql<{ id: string; session_id: string | null; custom_label: string }>(
			`select id, session_id, custom_label from public.notebook_entries
			 where id = any($1) order by id`,
			[[adaEntry, benEntry]]
		);
		expect(kept.rows).toHaveLength(2);
		expect(kept.rows.every((r) => r.session_id === null)).toBe(true);
		expect(kept.rows.every((r) => r.custom_label === 'Doomed')).toBe(true);
	});

	it('refuses a teacher who does not manage every section it runs in', async () => {
		const id = await createSession(chair, [section1, section3], 13, '2027-01-12', 'Not deletable');
		const error = await captureError(() =>
			db.asUser(teacherA.id, (q) => q('select public.notebook_admin_delete_session($1)', [id]))
		);
		expect(error.message).toMatch(/every section this check-in runs in/i);
		expect((await sectionsOf(id)).sort()).toEqual([section1, section3].sort());
	});
});

// ---------------------------------------------------------------------------
// 8. Privileges.
// ---------------------------------------------------------------------------

describe('the postings table has no client write path', () => {
	it.each([['insert'], ['update'], ['delete']])('%s is refused for a teacher', async (verb) => {
		const statement =
			verb === 'insert'
				? `insert into public.notebook_session_postings (session_id, section_id) values ($1, $2)`
				: verb === 'update'
					? `update public.notebook_session_postings set section_id = $2 where session_id = $1`
					: `delete from public.notebook_session_postings where session_id = $1 and section_id = $2`;
		const error = await captureError(() =>
			db.asUser(teacherA.id, (q) => q(statement, [legacySession, section1]))
		);
		expect(error.code).toBe('42501');
	});

	it('is refused for the admin tier too', async () => {
		const error = await captureError(() =>
			db.asUser(chair.id, (q) =>
				q(
					`insert into public.notebook_session_postings (session_id, section_id) values ($1, $2)`,
					[legacySession, section2]
				)
			)
		);
		expect(error.code).toBe('42501');
	});

	it('grants anon nothing at all', async () => {
		const { rows } = await db.sql<{ tbl: boolean; add_fn: boolean; remove_fn: boolean }>(
			`select
				has_table_privilege('anon', 'public.notebook_session_postings', 'select') as tbl,
				has_function_privilege('anon',
					'public.notebook_add_session_postings(uuid, uuid[])', 'execute') as add_fn,
				has_function_privilege('anon',
					'public.notebook_remove_session_posting(uuid, uuid)', 'execute') as remove_fn`
		);
		expect(rows[0]).toEqual({ tbl: false, add_fn: false, remove_fn: false });
	});

	it('is readable by any signed-in user, like the check-in itself', async () => {
		const { rows } = await db.asUser(ada.id, (q) =>
			q<{ n: string }>(`select count(*)::text as n from public.notebook_session_postings`)
		);
		expect(Number(rows[0].n)).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// 9. Re-applying.
// ---------------------------------------------------------------------------

describe('the migration file re-applies cleanly', () => {
	it('runs twice more over a populated schema and changes nothing', async () => {
		const before = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_session_postings`
		);

		await db.sql(POSTINGS_SQL);
		await db.sql(POSTINGS_SQL);

		const after = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_session_postings`
		);
		expect(after.rows[0].n).toBe(before.rows[0].n);

		// The key, the column and the overload count all survive the re-run --
		// 0088 died on exactly this, with the schema half-built.
		const fk = await db.sql<{ def: string }>(
			`select pg_get_constraintdef(oid) as def from pg_constraint
			 where conname = 'notebook_entries_session_posting_fkey'`
		);
		expect(fk.rows).toHaveLength(1);
		expect(fk.rows[0].def).toMatch(/REFERENCES notebook_session_postings\(session_id, section_id\)/i);

		const fns = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
			 where ns.nspname = 'public' and p.proname = 'notebook_admin_upsert_session'`
		);
		expect(Number(fns.rows[0].n)).toBe(1);

		// And the legacy entry is still linked to the legacy check-in.
		const entry = await db.sql<{ session_id: string | null; section_id: string | null }>(
			`select session_id, section_id from public.notebook_entries where id = $1`,
			[legacyEntry]
		);
		expect(entry.rows[0].session_id).toBe(legacySession);
		expect(entry.rows[0].section_id).toBe(section1);
	});
});

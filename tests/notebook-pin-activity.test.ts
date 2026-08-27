// tests/notebook-pin-activity.test.ts
//
// 0091 adds a pin and a derived activity timestamp. Most of it is not worth a
// test -- a pin that fails to render is visible the moment anyone looks at the
// feed, and the sort control is a pure function over data a dev harness can
// drive.
//
// FOUR THINGS ARE WORTH ONE, and every one of them fails SILENTLY:
//
//   1. THE FILE RE-APPLIES. 0088 shipped a drop-then-add on a constraint that
//      another object depended on, so its second run in the live SQL editor
//      raised 2BP01 and took the rest of the file with it -- with the schema
//      half-built. Migrations here are pasted in by hand, so a re-run is
//      ordinary. This suite runs the real file a second time and then
//      re-checks what it exists for.
//   2. WHOSE ENTRY CAN BE PINNED. notebook_set_entry_pinned takes no student
//      id; the WHERE clause is the whole authorization. Widen it and the app
//      looks identical while one student can reorder another's feed.
//   3. WHAT THE ACTIVITY VIEW LETS THROUGH. It is security_invoker precisely
//      so it adds no reach. Drop that and it becomes a list of every entry in
//      the school, keyed by student, readable by anyone signed in -- and
//      nothing in the UI would look any different, because the UI only ever
//      asks about its own rows.
//   4. WHAT THE ACTIVITY TIMESTAMP ACTUALLY MEANS. It is the whole basis of
//      the new sort, and a wrong one (say, ignoring notes) produces an order
//      that is plausible on every screen and simply wrong.
//
// The fixture is the real embedded Postgres with the real migration files
// applied (tests/db/harness.ts).

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

/**
 * The notebook chain with pinning spliced in at its real place in history --
 * BEFORE 0098, which is the last entry of the shared chain. Appending it would
 * apply 0091 after a later migration, which is not an ordering anyone will ever
 * run for real.
 */
const CHAIN = [
	...MIGRATIONS.filter((m) => m !== '0098_notebook_session_postings.sql'),
	'0091_notebook_pin_and_activity.sql',
	'0098_notebook_session_postings.sql',
	'0137_anon_execute_sweep.sql'
] as const;

const MIGRATION_PATH = fileURLToPath(
	new URL('../supabase/migrations/0091_notebook_pin_and_activity.sql', import.meta.url)
);

let db: TestDb;
let ada: SeededUser; // student
let ben: SeededUser; // a DIFFERENT student
let instructor: SeededUser; // teaches Ada's section
let outsider: SeededUser; // @boscotech.edu, teaches nothing
let sectionId: string;

/** A free-form entry owned by `owner`, created at `at`. */
async function newEntry(owner: SeededUser, label: string, at?: string) {
	const { rows } = await db.sql<{ id: string }>(
		`insert into public.notebook_entries (student_id, custom_label, upload_timestamp)
		 values ($1, $2, coalesce($3::timestamptz, now())) returning id`,
		[owner.id, label, at ?? null]
	);
	return rows[0].id;
}

const NOTE = [{ type: 'p', runs: [{ text: 'hello' }] }];

/** A note revision on `entryId`, written at `at`. */
async function newNote(owner: SeededUser, entryId: string, at: string) {
	const id = (await db.sql<{ id: string }>(`select gen_random_uuid() as id`)).rows[0].id;
	await db.sql(
		`insert into public.notebook_entry_notes
			(id, entry_id, note_id, revision, content, author_id, created_at)
		 values ($1, $2, $1, 1, $3::jsonb, $4, $5::timestamptz)`,
		[id, entryId, JSON.stringify(NOTE), owner.id, at]
	);
	return id;
}

async function activityOf(entryId: string) {
	const { rows } = await db.sql<{ last_activity_at: Date }>(
		`select last_activity_at from public.notebook_entry_activity where id = $1`,
		[entryId]
	);
	return rows[0]?.last_activity_at ?? null;
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	ada = await createUser(db, 'ada.pike@boscotech.net', 'Ada Pike');
	ben = await createUser(db, 'ben.okafor@boscotech.net', 'Ben Okafor');
	instructor = await createUser(db, 'instructor@boscotech.edu', 'Ines Tructor');
	outsider = await createUser(db, 'outsider@boscotech.edu', 'Otto Sider');

	// Since 0094 the notebook hangs off a CLASSROOM section, and "the
	// instructor" is its teacher of record. Enrollment moved with it: the old
	// `profiles.section_id = 'eng1h-sophomore'` line here was the 0003
	// self-selected-class model the notebook no longer reads.
	sectionId = await createClassroomSection(db, {
		as: instructor,
		courseCode: 'ENG1H',
		courseTitle: 'Engineering I Honors',
		label: 'Period 2',
		teacherEmail: instructor.email
	});
	await enrollStudent(db, {
		as: instructor,
		sectionId,
		email: ada.email,
		displayName: 'Pike, Ada'
	});
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------

describe('a student can only pin their OWN entries', () => {
	it('pins one, and the stamp comes back', async () => {
		const entryId = await newEntry(ada, 'Ada’s page');
		const { rows } = await db.asUser(ada.id, (q) =>
			q<{ result: { ok: boolean; pinned_at: string | null } }>(
				`select public.notebook_set_entry_pinned($1, true) as result`,
				[entryId]
			)
		);
		expect(rows[0].result.ok).toBe(true);
		expect(rows[0].result.pinned_at).toBeTruthy();

		const check = await db.sql<{ pinned_at: Date | null }>(
			`select pinned_at from public.notebook_entries where id = $1`,
			[entryId]
		);
		expect(check.rows[0].pinned_at).not.toBeNull();
	});

	it('re-pinning keeps the ORIGINAL stamp, so the top of the feed never reshuffles', async () => {
		const entryId = await newEntry(ada, 'Stable pin');
		const first = await db.asUser(ada.id, (q) =>
			q<{ result: { pinned_at: string } }>(
				`select public.notebook_set_entry_pinned($1, true) as result`,
				[entryId]
			)
		);
		const again = await db.asUser(ada.id, (q) =>
			q<{ result: { pinned_at: string } }>(
				`select public.notebook_set_entry_pinned($1, true) as result`,
				[entryId]
			)
		);
		expect(again.rows[0].result.pinned_at).toBe(first.rows[0].result.pinned_at);
	});

	it('unpinning clears it, and re-pinning is a genuinely new decision', async () => {
		const entryId = await newEntry(ada, 'Off and on');
		const first = await db.asUser(ada.id, (q) =>
			q<{ result: { pinned_at: string } }>(
				`select public.notebook_set_entry_pinned($1, true) as result`,
				[entryId]
			)
		);
		const off = await db.asUser(ada.id, (q) =>
			q<{ result: { pinned_at: string | null } }>(
				`select public.notebook_set_entry_pinned($1, false) as result`,
				[entryId]
			)
		);
		expect(off.rows[0].result.pinned_at).toBeNull();

		const back = await db.asUser(ada.id, (q) =>
			q<{ result: { pinned_at: string } }>(
				`select public.notebook_set_entry_pinned($1, true) as result`,
				[entryId]
			)
		);
		expect(back.rows[0].result.pinned_at).not.toBe(first.rows[0].result.pinned_at);
	});

	it('another student’s entry is reported as not found, and stays unpinned', async () => {
		const bensEntry = await newEntry(ben, 'Ben’s page');
		await expect(
			db.asUser(ada.id, (q) => q(`select public.notebook_set_entry_pinned($1, true)`, [bensEntry]))
		).rejects.toThrow(/does not exist or is not yours/i);

		const check = await db.sql<{ pinned_at: Date | null }>(
			`select pinned_at from public.notebook_entries where id = $1`,
			[bensEntry]
		);
		expect(check.rows[0].pinned_at).toBeNull();
	});

	it('an instructor cannot pin a student’s entry either — a pin is the student’s own', async () => {
		const entryId = await newEntry(ada, 'Not the instructor’s to pin');
		await expect(
			db.asUser(instructor.id, (q) =>
				q(`select public.notebook_set_entry_pinned($1, true)`, [entryId])
			)
		).rejects.toThrow(/does not exist or is not yours/i);
	});

	it('there is still no direct write path to pinned_at', async () => {
		const entryId = await newEntry(ada, 'No back door');
		await expect(
			db.asUser(ada.id, (q) =>
				q(`update public.notebook_entries set pinned_at = now() where id = $1`, [entryId])
			)
		).rejects.toMatchObject({ code: '42501' });
	});

	it('anon holds no execute grant on the RPC', async () => {
		const { rows } = await db.sql<{ ok: boolean }>(
			`select has_function_privilege('anon',
				'public.notebook_set_entry_pinned(uuid, boolean)', 'execute') as ok`
		);
		expect(rows[0].ok).toBe(false);
	});
});

// ---------------------------------------------------------------------------

describe('the activity view says what it means', () => {
	it('an untouched entry reads its own creation stamp', async () => {
		const entryId = await newEntry(ada, 'Untouched', '2026-03-01T10:00:00Z');
		expect((await activityOf(entryId))?.toISOString()).toBe('2026-03-01T10:00:00.000Z');
	});

	it('a NOTE written later raises it — the whole point of the sort', async () => {
		const entryId = await newEntry(ada, 'Revisited', '2026-03-01T10:00:00Z');
		await newNote(ada, entryId, '2026-06-01T09:30:00Z');
		expect((await activityOf(entryId))?.toISOString()).toBe('2026-06-01T09:30:00.000Z');
	});

	it('the NEWEST note revision wins, not the first', async () => {
		const entryId = await newEntry(ada, 'Edited twice', '2026-03-01T10:00:00Z');
		await newNote(ada, entryId, '2026-04-01T00:00:00Z');
		await newNote(ada, entryId, '2026-07-04T12:00:00Z');
		await newNote(ada, entryId, '2026-05-01T00:00:00Z');
		expect((await activityOf(entryId))?.toISOString()).toBe('2026-07-04T12:00:00.000Z');
	});

	it('a PHOTO added later raises it too', async () => {
		const entryId = await newEntry(ada, 'Second page added', '2026-03-01T10:00:00Z');
		await db.sql(
			`insert into public.notebook_entry_photos
				(entry_id, drive_file_id, variant, sequence_order, created_at)
			 values ($1, 'drive-1', 'original', 1, '2026-08-09T18:00:00Z')`,
			[entryId]
		);
		expect((await activityOf(entryId))?.toISOString()).toBe('2026-08-09T18:00:00.000Z');
	});

	it('an OLDER entry touched yesterday outranks a NEWER untouched one', async () => {
		// The decisive ordering assertion, and the exact case the feature
		// exists for. Asserted through the view's own ORDER BY, not by
		// comparing two numbers the test computed itself.
		const older = await newEntry(ada, 'September build log', '2026-09-02T08:00:00Z');
		await newNote(ada, older, '2026-11-20T16:00:00Z');
		const newer = await newEntry(ada, 'Untouched October page', '2026-10-15T08:00:00Z');

		const { rows } = await db.sql<{ id: string }>(
			`select a.id from public.notebook_entry_activity a
			 where a.id = any($1) order by a.last_activity_at desc`,
			[[older, newer]]
		);
		expect(rows.map((r) => r.id)).toEqual([older, newer]);
	});
});

// ---------------------------------------------------------------------------

describe('the activity view adds no reach', () => {
	it('a student sees their own entries in it', async () => {
		const entryId = await newEntry(ada, 'Mine');
		const { rows } = await db.asUser(ada.id, (q) =>
			q(`select id from public.notebook_entry_activity where id = $1`, [entryId])
		);
		expect(rows).toHaveLength(1);
	});

	it('a DIFFERENT student sees nothing of theirs — by list and by id', async () => {
		const adasEntry = await newEntry(ada, 'Ada’s private page');
		const byId = await db.asUser(ben.id, (q) =>
			q(`select id from public.notebook_entry_activity where id = $1`, [adasEntry])
		);
		expect(byId.rows).toHaveLength(0);

		const byList = await db.asUser(ben.id, (q) =>
			q(`select id from public.notebook_entry_activity where student_id = $1`, [ada.id])
		);
		expect(byList.rows).toHaveLength(0);
	});

	it('the section instructor sees a student’s entry, an unattached teacher does not', async () => {
		const entryId = await newEntry(ada, 'For the grid');
		await db.sql(`update public.notebook_entries set section_id = $1 where id = $2`, [
			sectionId,
			entryId
		]);

		const seen = await db.asUser(instructor.id, (q) =>
			q(`select id from public.notebook_entry_activity where id = $1`, [entryId])
		);
		expect(seen.rows).toHaveLength(1);

		const unseen = await db.asUser(outsider.id, (q) =>
			q(`select id from public.notebook_entry_activity where id = $1`, [entryId])
		);
		expect(unseen.rows).toHaveLength(0);
	});

	it('anon can read nothing from it', async () => {
		const { rows } = await db.sql<{ ok: boolean }>(
			`select has_table_privilege('anon', 'public.notebook_entry_activity', 'select') as ok`
		);
		expect(rows[0].ok).toBe(false);
	});

	it('it is genuinely security_invoker, which is what makes all of the above true', async () => {
		const { rows } = await db.sql<{ opts: string[] | null }>(
			`select c.reloptions as opts from pg_class c
			 join pg_namespace n on n.oid = c.relnamespace
			 where n.nspname = 'public' and c.relname = 'notebook_entry_activity'`
		);
		expect(rows[0].opts ?? []).toContain('security_invoker=true');
	});
});

// ---------------------------------------------------------------------------

/**
 * The lesson 0088 learned in the field rather than in review: migrations here
 * are applied BY HAND in the Supabase SQL editor, so a second run is an
 * ordinary thing that happens -- somebody re-pastes the file, or a first
 * attempt failed partway and gets retried.
 */
describe('the migration re-applies cleanly over its own objects', () => {
	it('runs a second time, and the schema still behaves', async () => {
		const entryId = await newEntry(ada, 'Pinned across the re-run');
		await db.asUser(ada.id, (q) =>
			q(`select public.notebook_set_entry_pinned($1, true)`, [entryId])
		);

		await expect(db.sql(readFileSync(MIGRATION_PATH, 'utf8'))).resolves.toBeDefined();

		// Not merely "it did not throw": every guarantee the file exists for
		// has to survive the re-run, with real pinned rows already in place.
		const pinned = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_entries where pinned_at is not null`
		);
		expect(Number(pinned.rows[0].n)).toBeGreaterThan(0);

		// Still exactly one RPC, and it still refuses a foreign entry.
		const procs = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_proc p
			 join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'notebook_set_entry_pinned'`
		);
		expect(Number(procs.rows[0].n)).toBe(1);

		const bensEntry = await newEntry(ben, 'Still Ben’s');
		await expect(
			db.asUser(ada.id, (q) => q(`select public.notebook_set_entry_pinned($1, true)`, [bensEntry]))
		).rejects.toThrow(/does not exist or is not yours/i);

		// And the view is still there, still invoker-scoped, still correct.
		const activityEntry = await newEntry(ada, 'After the re-run', '2026-03-01T10:00:00Z');
		await newNote(ada, activityEntry, '2026-06-01T09:30:00Z');
		expect((await activityOf(activityEntry))?.toISOString()).toBe('2026-06-01T09:30:00.000Z');

		const byOther = await db.asUser(ben.id, (q) =>
			q(`select id from public.notebook_entry_activity where id = $1`, [activityEntry])
		);
		expect(byOther.rows).toHaveLength(0);
	});

	it('a THIRD run is fine too', async () => {
		await expect(db.sql(readFileSync(MIGRATION_PATH, 'utf8'))).resolves.toBeDefined();
	});
});

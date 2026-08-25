// tests/notebook-soft-delete.test.ts
//
// 0116 makes notebook entries and photos correctable, softly: a deletion is a
// stamp on a row that goes on existing. Two halves are worth a test, and both
// fail SILENTLY.
//
//   1. THE REFUSALS. Every one of them is the only thing standing between a
//      student and work somebody else is keeping a record of -- a reviewed entry
//      withdrawn, another student's entry removed, an entry emptied into a shell
//      with nothing in it. A missing guard looks exactly like a working feature
//      to whoever is using it, and is only discovered by the person whose work
//      went.
//   2. THE EXCLUSION SWEEP. The RLS policies are UNCHANGED, so a deleted row is
//      still selectable and it is the filters -- ten of them, across a view, a
//      roster, a grid, a payload and three client reads -- that decide whether a
//      deletion is visible. One filter missing means a deleted entry keeps
//      holding a grid cell red, or keeps a departed student on a roster, and
//      nothing errors anywhere.
//
// EVERY EXCLUSION ASSERTION CARRIES A POSITIVE CONTROL and reports both counts.
// A scan that reads the wrong property, or a fixture that never had the row it
// is looking for, comes back clean -- and clean is the result nobody
// investigates. So each one names the row that must be GONE and the row that
// must still be THERE, in the same assertion.
//
// The fixture is the real embedded Postgres with the real migration files
// applied (tests/db/harness.ts).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';

/**
 * The notebook chain, plus the migrations 0116's own sweep touches the output
 * of: 0091 (the activity view and pinned_at, both of which _notebook_student_payload
 * carries), 0099 + 0083 + 0053 (the view-as reader, so the payload's OTHER
 * caller is exercised rather than assumed to behave like the first).
 */
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
	'0137_anon_execute_sweep.sql'
] as const;

const MIGRATION_0116 = readFileSync(
	fileURLToPath(new URL('../supabase/migrations/0116_notebook_soft_delete.sql', import.meta.url)),
	'utf8'
);

let db: TestDb;

let owner: SeededUser; // the pinned admin (0067's admin_owner_email): the chair tier
let teacher: SeededUser; // teacher of record for P1
let otherTeacher: SeededUser; // teacher of record for P2, and nothing of P1
let ada: SeededUser; // student, enrolled in P1
let ben: SeededUser; // student, enrolled in P1
let carol: SeededUser; // NOT enrolled; filed in P1, then deleted it
let dave: SeededUser; // NOT enrolled; filed in P1 and still has it

let p1: string;
let p2: string;
let session1: string; // seeded once and never written to again -- the grid measures it
let session2: string; // everything the write-path tests create hangs off this one

// Ada's entries, by the job each one does in the assertions below.
let adaFreeLive: string; // survives everything; the positive control almost everywhere
let adaFreeDeleted: string; // deleted; must vanish from every list
let adaCheckInOld: string; // older, compliant, live -- the cell that SHOULD win
let adaCheckInNew: string; // newer, FLAGGED, deleted -- must not win the cell
let adaReviewed: string; // an instructor has reviewed it
let adaSinglePhoto: string; // one photo, no notes: the shell case
let adaPhotoAndNote: string; // one photo AND a note: the shell case's control
let adaLabelOnly: string; // a title and nothing else
let adaLabelAndPhoto: string; // a title with a photo behind it
let adaNotedCheckIn: string; // session-linked, carries a note

let benCheckIn: string;
let benFree: string;
let carolFree: string;
let daveFree: string;

let adaLivePhoto: string; // adaFreeLive's surviving photo
let adaRemovedPhoto: string; // adaFreeLive's removed one -- created LATEST of all
let adaNoteId: string; // the note on adaNotedCheckIn

const NOTE = [{ type: 'p', runs: [{ text: 'hello' }] }];

async function newEntry(
	owner_: SeededUser,
	opts: {
		label?: string | null;
		sectionId?: string | null;
		sessionId?: string | null;
		at?: string;
		status?: string;
	} = {}
): Promise<string> {
	const { rows } = await db.sql<{ id: string }>(
		`insert into public.notebook_entries
			(student_id, custom_label, section_id, session_id, upload_timestamp, status)
		 values ($1, $2, $3, $4, coalesce($5::timestamptz, now()), coalesce($6, 'compliant'))
		 returning id`,
		[
			owner_.id,
			opts.label ?? null,
			opts.sectionId ?? null,
			opts.sessionId ?? null,
			opts.at ?? null,
			opts.status ?? null
		]
	);
	return rows[0].id;
}

async function newPhoto(entryId: string, sequence: number, at?: string): Promise<string> {
	const { rows } = await db.sql<{ id: string }>(
		`insert into public.notebook_entry_photos
			(entry_id, drive_file_id, variant, sequence_order, created_at)
		 values ($1, $2, 'original', $3, coalesce($4::timestamptz, now()))
		 returning id`,
		[entryId, `drive-${entryId}-${sequence}`, sequence, at ?? null]
	);
	return rows[0].id;
}

async function newNote(author: SeededUser, entryId: string): Promise<string> {
	const { rows } = await db.sql<{ id: string }>(`select gen_random_uuid() as id`);
	const id = rows[0].id;
	await db.sql(
		`insert into public.notebook_entry_notes
			(id, entry_id, note_id, revision, content, author_id)
		 values ($1, $2, $1, 1, $3::jsonb, $4)`,
		[id, entryId, JSON.stringify(NOTE), author.id]
	);
	return id;
}

/** Runs an RPC as `authenticated` with the given uid, returning its jsonb. */
async function rpc<T = Record<string, unknown>>(
	user: SeededUser,
	call: string,
	params: unknown[] = []
): Promise<T> {
	const { rows } = await db.asUser(user.id, (q) =>
		q<{ result: T }>(`select ${call} as result`, params)
	);
	return rows[0].result;
}

async function deletedAt(entryId: string): Promise<Date | null> {
	const { rows } = await db.sql<{ deleted_at: Date | null }>(
		`select deleted_at from public.notebook_entries where id = $1`,
		[entryId]
	);
	return rows[0]?.deleted_at ?? null;
}

async function removedAt(photoId: string): Promise<Date | null> {
	const { rows } = await db.sql<{ removed_at: Date | null }>(
		`select removed_at from public.notebook_entry_photos where id = $1`,
		[photoId]
	);
	return rows[0]?.removed_at ?? null;
}

interface Grid {
	students: { student_key: string; name: string; email: string | null; free_entries: number }[];
	cells: {
		student_key: string;
		session_id: string;
		status: string;
		entry_id: string | null;
		entry_count: number;
		flag_reason: string | null;
	}[];
}

async function grid(as: SeededUser, sectionId: string): Promise<Grid> {
	return rpc<Grid>(as, `public.notebook_get_section_grid($1, null)`, [sectionId]);
}

interface Payload {
	entries: {
		id: string;
		custom_label: string | null;
		photos: { id: string }[];
	}[];
	activity: { id: string; last_activity_at: string }[];
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	owner = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	teacher = await createUser(db, 'teacher@boscotech.edu', 'Terry Teacher');
	otherTeacher = await createUser(db, 'other@boscotech.edu', 'Olive Other');
	ada = await createUser(db, 'ada@boscotech.net', 'Ada Pike');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben Okafor');
	carol = await createUser(db, 'carol@boscotech.net', 'Carol Reyes');
	dave = await createUser(db, 'dave@boscotech.net', 'Dave Ngo');

	p1 = await createClassroomSection(db, {
		as: owner,
		courseCode: 'IDEA209H',
		courseTitle: 'Engineering Design',
		label: 'Period 1',
		teacherEmail: teacher.email
	});
	p2 = await createClassroomSection(db, {
		as: owner,
		courseCode: 'IDEA209H',
		label: 'Period 2',
		teacherEmail: otherTeacher.email
	});

	await enrollStudent(db, { as: teacher, sectionId: p1, email: ada.email, displayName: 'Pike, Ada' });
	await enrollStudent(db, { as: teacher, sectionId: p1, email: ben.email, displayName: 'Okafor, Ben' });

	const s = await rpc<{ session_id: string }>(
		teacher,
		`public.notebook_admin_upsert_session(
			p_section_ids => $1::uuid[], p_unit_number => $2::integer,
			p_session_date => $3::date, p_session_label => $4)`,
		[[p1], 1, '2026-03-10', 'Bearing teardown']
	);
	session1 = s.session_id;

	// A SECOND check-in for the write-path tests to use. Section 6's grid
	// assertions are arithmetic over session1, so anything created later against
	// it would silently move the numbers they are checking -- which is how a
	// fixture starts describing itself instead of the code.
	session2 = (
		await rpc<{ session_id: string }>(
			teacher,
			`public.notebook_admin_upsert_session(
				p_section_ids => $1::uuid[], p_unit_number => $2::integer,
				p_session_date => $3::date, p_session_label => $4)`,
			[[p1], 2, '2026-03-17', 'Shaft stackup']
		)
	).session_id;

	// --- Ada -------------------------------------------------------------
	adaFreeLive = await newEntry(ada, {
		label: 'Live free entry',
		sectionId: p1,
		at: '2026-03-01T10:00:00Z'
	});
	adaLivePhoto = await newPhoto(adaFreeLive, 1, '2026-03-01T10:05:00Z');
	// Created LATER than anything else in the fixture on purpose: once it is
	// removed, the activity view must fall back to the live photo's stamp, which
	// is the only way to tell a filtered sub-select from an unfiltered one.
	adaRemovedPhoto = await newPhoto(adaFreeLive, 2, '2026-03-05T09:00:00Z');

	adaFreeDeleted = await newEntry(ada, {
		label: 'Deleted free entry',
		sectionId: p1,
		at: '2026-03-02T10:00:00Z'
	});
	await newPhoto(adaFreeDeleted, 1);

	adaCheckInOld = await newEntry(ada, {
		sessionId: session1,
		sectionId: p1,
		at: '2026-03-09T08:00:00Z'
	});
	await newPhoto(adaCheckInOld, 1);
	// Newer AND flagged AND deleted: without the filter it wins the distinct-on
	// and paints the cell red for work that is not there.
	adaCheckInNew = await newEntry(ada, {
		sessionId: session1,
		sectionId: p1,
		at: '2026-03-11T08:00:00Z',
		status: 'flagged'
	});
	await newPhoto(adaCheckInNew, 1);

	adaReviewed = await newEntry(ada, { label: 'Reviewed work', sectionId: p1 });
	await newPhoto(adaReviewed, 1);

	adaSinglePhoto = await newEntry(ada, { label: null });
	await newPhoto(adaSinglePhoto, 1);

	adaPhotoAndNote = await newEntry(ada, { label: null });
	await newPhoto(adaPhotoAndNote, 1);
	await newNote(ada, adaPhotoAndNote);

	adaLabelOnly = await newEntry(ada, { label: 'Nothing but a title' });

	adaLabelAndPhoto = await newEntry(ada, { label: 'A title over a photo' });
	await newPhoto(adaLabelAndPhoto, 1);

	adaNotedCheckIn = await newEntry(ada, {
		sessionId: session1,
		sectionId: p1,
		at: '2026-03-08T08:00:00Z'
	});
	await newPhoto(adaNotedCheckIn, 1);
	adaNoteId = await newNote(ada, adaNotedCheckIn);

	// --- Ben: the control student, untouched by every deletion below -------
	benCheckIn = await newEntry(ben, {
		sessionId: session1,
		sectionId: p1,
		at: '2026-03-09T09:00:00Z'
	});
	await newPhoto(benCheckIn, 1);
	benFree = await newEntry(ben, { label: 'Ben free', sectionId: p1 });

	// --- Two non-enrolled holders, one of each kind ------------------------
	carolFree = await newEntry(carol, { label: 'Carol, transferred out', sectionId: p1 });
	daveFree = await newEntry(dave, { label: 'Dave, transferred out', sectionId: p1 });

	// The two deletions the sweep is measured against, through the REAL RPCs.
	await rpc(ada, `public.notebook_delete_entry($1)`, [adaFreeDeleted]);
	await rpc(ada, `public.notebook_delete_entry($1)`, [adaCheckInNew]);
	await rpc(carol, `public.notebook_delete_entry($1)`, [carolFree]);
	await rpc(ada, `public.notebook_remove_photo($1)`, [adaRemovedPhoto]);

	// Reviewed AFTER the deletions above, so nothing in the sweep depends on it.
	await rpc(teacher, `public.notebook_flag_entry($1, $2, $3)`, [
		adaReviewed,
		'illegible',
		'Please redo this page.'
	]);
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 1. notebook_delete_entry -- the student's own removal, and every refusal.
// ---------------------------------------------------------------------------

describe('notebook_delete_entry', () => {
	it('stamps deleted_at and deleted_by, and destroys nothing', async () => {
		const entryId = await newEntry(ada, { label: 'To be removed' });
		const photoId = await newPhoto(entryId, 1);

		const result = await rpc<{ ok: boolean; deleted_at: string }>(
			ada,
			`public.notebook_delete_entry($1)`,
			[entryId]
		);
		expect(result.ok).toBe(true);
		expect(result.deleted_at).toBeTruthy();

		const { rows } = await db.sql<{ deleted_at: Date | null; deleted_by: string | null }>(
			`select deleted_at, deleted_by from public.notebook_entries where id = $1`,
			[entryId]
		);
		// THE ROW SURVIVES. That is the whole feature: one row still there,
		// stamped, with its photo still attached.
		expect(rows).toHaveLength(1);
		expect(rows[0].deleted_at).not.toBeNull();
		expect(rows[0].deleted_by).toBe(ada.id);

		const photos = await db.sql(
			`select 1 from public.notebook_entry_photos where id = $1`,
			[photoId]
		);
		expect(photos.rowCount).toBe(1);
	});

	it('REFUSES another student’s entry, and leaves it undeleted', async () => {
		await expect(
			db.asUser(ben.id, (q) => q(`select public.notebook_delete_entry($1)`, [adaFreeLive]))
		).rejects.toThrow(/does not exist or is not yours/i);
		expect(await deletedAt(adaFreeLive)).toBeNull();
	});

	it('REFUSES an entry an instructor has already reviewed, and says who can', async () => {
		await expect(
			db.asUser(ada.id, (q) => q(`select public.notebook_delete_entry($1)`, [adaReviewed]))
		).rejects.toThrow(/already reviewed[\s\S]*ask them/i);
		expect(await deletedAt(adaReviewed)).toBeNull();
	});

	it('REFUSES one that is already deleted', async () => {
		await expect(
			db.asUser(ada.id, (q) => q(`select public.notebook_delete_entry($1)`, [adaFreeDeleted]))
		).rejects.toThrow(/already been deleted/i);
	});

	it('an instructor cannot use the student path on a student’s entry', async () => {
		await expect(
			db.asUser(teacher.id, (q) => q(`select public.notebook_delete_entry($1)`, [adaFreeLive]))
		).rejects.toThrow(/does not exist or is not yours/i);
		expect(await deletedAt(adaFreeLive)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 2. notebook_staff_delete_entry.
// ---------------------------------------------------------------------------

describe('notebook_staff_delete_entry', () => {
	it('the section’s teacher removes a reviewed entry, and it is logged', async () => {
		const entryId = await newEntry(ada, {
			label: 'Instructor removes this',
			sectionId: p1,
			sessionId: session2
		});
		await newPhoto(entryId, 1);
		await rpc(teacher, `public.notebook_flag_entry($1, $2, $3)`, [entryId, 'other', 'Wrong page.']);

		// NO reviewed-state refusal here: that rule protects the record from the
		// student, and this is the instructor keeping it.
		const result = await rpc<{ ok: boolean; student_id: string }>(
			teacher,
			`public.notebook_staff_delete_entry($1)`,
			[entryId]
		);
		expect(result.ok).toBe(true);
		expect(result.student_id).toBe(ada.id);
		expect(await deletedAt(entryId)).not.toBeNull();

		const log = await db.sql<{ actor_id: string; student_id: string; details: Record<string, unknown> }>(
			`select actor_id, student_id, details from public.notebook_admin_log
			 where action = 'delete_entry' and entry_id = $1`,
			[entryId]
		);
		expect(log.rowCount).toBe(1);
		expect(log.rows[0].actor_id).toBe(teacher.id);
		expect(log.rows[0].student_id).toBe(ada.id);
		expect(log.rows[0].details.custom_label).toBe('Instructor removes this');
	});

	it('REFUSES a teacher of a different section, with a message that reveals nothing', async () => {
		const entryId = await newEntry(ada, { label: 'Not Olive’s to remove', sectionId: p1 });
		await expect(
			db.asUser(otherTeacher.id, (q) =>
				q(`select public.notebook_staff_delete_entry($1)`, [entryId])
			)
		).rejects.toThrow(/does not exist, or is not in a class you manage/i);
		expect(await deletedAt(entryId)).toBeNull();
	});

	it('an unknown id answers IDENTICALLY to a real one they may not touch', async () => {
		const real = db
			.asUser(otherTeacher.id, (q) =>
				q(`select public.notebook_staff_delete_entry($1)`, [adaFreeLive])
			)
			.catch((e: Error) => e.message);
		const imaginary = db
			.asUser(otherTeacher.id, (q) =>
				q(`select public.notebook_staff_delete_entry('11111111-2222-3333-4444-555555555555')`)
			)
			.catch((e: Error) => e.message);
		expect(await real).toBe(await imaginary);
	});

	it('REFUSES a student', async () => {
		const entryId = await newEntry(ada, { label: 'Not Ben’s to remove', sectionId: p1 });
		await expect(
			db.asUser(ben.id, (q) => q(`select public.notebook_staff_delete_entry($1)`, [entryId]))
		).rejects.toThrow(/does not exist, or is not in a class you manage/i);
		expect(await deletedAt(entryId)).toBeNull();
	});

	it('a FREE-FORM entry is admin-only: the teacher is refused, the chair is not', async () => {
		// section_id is null, so classroom_manages_section(null) is is_admin() --
		// documented in 0116 as deliberately narrower than the READ predicate.
		const entryId = await newEntry(ada, { label: 'Free-form, no class' });
		await expect(
			db.asUser(teacher.id, (q) => q(`select public.notebook_staff_delete_entry($1)`, [entryId]))
		).rejects.toThrow(/does not exist, or is not in a class you manage/i);
		expect(await deletedAt(entryId)).toBeNull();

		const result = await rpc<{ ok: boolean }>(owner, `public.notebook_staff_delete_entry($1)`, [
			entryId
		]);
		expect(result.ok).toBe(true);
		expect(await deletedAt(entryId)).not.toBeNull();
	});

	it('REFUSES one that is already deleted', async () => {
		await expect(
			db.asUser(teacher.id, (q) =>
				q(`select public.notebook_staff_delete_entry($1)`, [adaCheckInNew])
			)
		).rejects.toThrow(/already been deleted/i);
	});
});

// ---------------------------------------------------------------------------
// 3. notebook_remove_photo.
// ---------------------------------------------------------------------------

describe('notebook_remove_photo', () => {
	it('stamps removed_at and removed_by, and keeps the row and its Drive id', async () => {
		const entryId = await newEntry(ada, { label: 'Two pages' });
		const keep = await newPhoto(entryId, 1);
		const drop = await newPhoto(entryId, 2);

		const result = await rpc<{ ok: boolean; entry_id: string }>(
			ada,
			`public.notebook_remove_photo($1)`,
			[drop]
		);
		expect(result.ok).toBe(true);
		expect(result.entry_id).toBe(entryId);

		const { rows } = await db.sql<{ removed_by: string | null; drive_file_id: string }>(
			`select removed_by, drive_file_id from public.notebook_entry_photos where id = $1`,
			[drop]
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].removed_by).toBe(ada.id);
		expect(rows[0].drive_file_id).toBeTruthy();
		// The control: the other page is untouched.
		expect(await removedAt(keep)).toBeNull();
	});

	it('REFUSES the last photo of an entry with no notes -- no shell', async () => {
		const { rows: before } = await db.sql<{ n: string }>(
			`select count(*) as n from public.notebook_entry_photos
			 where entry_id = $1 and removed_at is null`,
			[adaSinglePhoto]
		);
		const photo = await db.sql<{ id: string }>(
			`select id from public.notebook_entry_photos where entry_id = $1`,
			[adaSinglePhoto]
		);
		await expect(
			db.asUser(ada.id, (q) =>
				q(`select public.notebook_remove_photo($1)`, [photo.rows[0].id])
			)
		).rejects.toThrow(/only thing in this entry/i);
		expect(await removedAt(photo.rows[0].id)).toBeNull();
		expect(before[0].n).toBe('1');
	});

	it('ALLOWS the last photo when a note remains -- the shell rule is about emptiness', async () => {
		const photo = await db.sql<{ id: string }>(
			`select id from public.notebook_entry_photos where entry_id = $1`,
			[adaPhotoAndNote]
		);
		const result = await rpc<{ ok: boolean }>(ada, `public.notebook_remove_photo($1)`, [
			photo.rows[0].id
		]);
		expect(result.ok).toBe(true);
		expect(await removedAt(photo.rows[0].id)).not.toBeNull();
	});

	it('REFUSES another student’s photo, and leaves it in place', async () => {
		await expect(
			db.asUser(ben.id, (q) => q(`select public.notebook_remove_photo($1)`, [adaLivePhoto]))
		).rejects.toThrow(/does not exist or is not yours/i);
		expect(await removedAt(adaLivePhoto)).toBeNull();
	});

	it('an instructor cannot remove a student’s photo', async () => {
		await expect(
			db.asUser(teacher.id, (q) => q(`select public.notebook_remove_photo($1)`, [adaLivePhoto]))
		).rejects.toThrow(/does not exist or is not yours/i);
		expect(await removedAt(adaLivePhoto)).toBeNull();
	});

	it('REFUSES one that is already removed', async () => {
		await expect(
			db.asUser(ada.id, (q) => q(`select public.notebook_remove_photo($1)`, [adaRemovedPhoto]))
		).rejects.toThrow(/already been removed/i);
	});

	it('an ALREADY-REMOVED sibling does not count as remaining', async () => {
		// Two photos, one already gone: the survivor is then the last one, so the
		// shell rule must fire on it. This is what tells "count the rows" from
		// "count the LIVE rows".
		const entryId = await newEntry(ada, { label: null });
		const first = await newPhoto(entryId, 1);
		const second = await newPhoto(entryId, 2);
		await rpc(ada, `public.notebook_remove_photo($1)`, [second]);
		await expect(
			db.asUser(ada.id, (q) => q(`select public.notebook_remove_photo($1)`, [first]))
		).rejects.toThrow(/only thing in this entry/i);
		expect(await removedAt(first)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 4. notebook_set_entry_label.
// ---------------------------------------------------------------------------

describe('notebook_set_entry_label', () => {
	it('retitles a free-form entry, trimming as the column would', async () => {
		const entryId = await newEntry(ada, { label: 'Before' });
		await newPhoto(entryId, 1);
		const result = await rpc<{ ok: boolean; custom_label: string }>(
			ada,
			`public.notebook_set_entry_label($1, $2)`,
			[entryId, '  After  ']
		);
		expect(result.custom_label).toBe('After');

		const { rows } = await db.sql<{ custom_label: string }>(
			`select custom_label from public.notebook_entries where id = $1`,
			[entryId]
		);
		expect(rows[0].custom_label).toBe('After');
	});

	it('REFUSES a session-linked entry -- the title is the check-in’s', async () => {
		await expect(
			db.asUser(ada.id, (q) =>
				q(`select public.notebook_set_entry_label($1, $2)`, [adaCheckInOld, 'Mine now'])
			)
		).rejects.toThrow(/scheduled check-in/i);

		const { rows } = await db.sql<{ custom_label: string | null }>(
			`select custom_label from public.notebook_entries where id = $1`,
			[adaCheckInOld]
		);
		expect(rows[0].custom_label).toBeNull();
	});

	it('REFUSES another student’s entry, and leaves the title alone', async () => {
		await expect(
			db.asUser(ben.id, (q) =>
				q(`select public.notebook_set_entry_label($1, $2)`, [adaFreeLive, 'Ben was here'])
			)
		).rejects.toThrow(/does not exist or is not yours/i);

		const { rows } = await db.sql<{ custom_label: string }>(
			`select custom_label from public.notebook_entries where id = $1`,
			[adaFreeLive]
		);
		expect(rows[0].custom_label).toBe('Live free entry');
	});

	it('REFUSES a title over 200 characters, and accepts one at exactly 200', async () => {
		const entryId = await newEntry(ada, { label: 'Length test' });
		await newPhoto(entryId, 1);
		await expect(
			db.asUser(ada.id, (q) =>
				q(`select public.notebook_set_entry_label($1, $2)`, [entryId, 'x'.repeat(201)])
			)
		).rejects.toThrow(/too long/i);

		const ok = await rpc<{ custom_label: string }>(
			ada,
			`public.notebook_set_entry_label($1, $2)`,
			[entryId, 'y'.repeat(200)]
		);
		expect(ok.custom_label).toHaveLength(200);
	});

	it('a blank title CLEARS it when the entry has something else in it', async () => {
		const result = await rpc<{ custom_label: string | null }>(
			ada,
			`public.notebook_set_entry_label($1, $2)`,
			[adaLabelAndPhoto, '   ']
		);
		expect(result.custom_label).toBeNull();

		const { rows } = await db.sql<{ custom_label: string | null }>(
			`select custom_label from public.notebook_entries where id = $1`,
			[adaLabelAndPhoto]
		);
		expect(rows[0].custom_label).toBeNull();
	});

	it('REFUSES clearing the title of an entry that has nothing else -- no shell', async () => {
		await expect(
			db.asUser(ada.id, (q) => q(`select public.notebook_set_entry_label($1, null)`, [adaLabelOnly]))
		).rejects.toThrow(/only thing in this entry/i);

		const { rows } = await db.sql<{ custom_label: string }>(
			`select custom_label from public.notebook_entries where id = $1`,
			[adaLabelOnly]
		);
		expect(rows[0].custom_label).toBe('Nothing but a title');
	});

	it('REFUSES a deleted entry', async () => {
		await expect(
			db.asUser(ada.id, (q) =>
				q(`select public.notebook_set_entry_label($1, $2)`, [adaFreeDeleted, 'Back from the dead'])
			)
		).rejects.toThrow(/has been deleted/i);
	});
});

// ---------------------------------------------------------------------------
// 5. A note on a check-in entry becomes editable (0078's refusal removed).
// ---------------------------------------------------------------------------

describe('notebook_edit_note on a check-in entry', () => {
	it('is ALLOWED now, and the earlier revision is still there', async () => {
		const revised = [{ type: 'p', runs: [{ text: 'corrected' }] }];
		const result = await rpc<{ revision: number; note_id: string }>(
			ada,
			`public.notebook_edit_note($1, $2::jsonb)`,
			[adaNoteId, JSON.stringify(revised)]
		);
		expect(result.revision).toBe(2);

		const { rows } = await db.sql<{ revision: number; content: unknown; supersedes_id: string | null }>(
			`select revision, content, supersedes_id from public.notebook_entry_notes
			 where note_id = $1 order by revision`,
			[adaNoteId]
		);
		// BOTH revisions survive -- which is the reason the refusal could go.
		expect(rows).toHaveLength(2);
		expect(rows[0].revision).toBe(1);
		expect(rows[0].content).toEqual(NOTE);
		expect(rows[1].revision).toBe(2);
		expect(rows[1].content).toEqual(revised);
		expect(rows[1].supersedes_id).toBe(
			(
				await db.sql<{ id: string }>(
					`select id from public.notebook_entry_notes where note_id = $1 and revision = 1`,
					[adaNoteId]
				)
			).rows[0].id
		);
	});

	it('still REFUSES someone else’s note', async () => {
		await expect(
			db.asUser(ben.id, (q) =>
				q(`select public.notebook_edit_note($1, $2::jsonb)`, [adaNoteId, JSON.stringify(NOTE)])
			)
		).rejects.toThrow(/not yours/i);
	});

	it('still REFUSES content that is not a valid note', async () => {
		await expect(
			db.asUser(ada.id, (q) =>
				q(`select public.notebook_edit_note($1, $2::jsonb)`, [
					adaNoteId,
					JSON.stringify([{ type: 'script', runs: [] }])
				])
			)
		).rejects.toThrow(/not a valid note/i);
	});
});

// ---------------------------------------------------------------------------
// 6. THE EXCLUSION SWEEP. Every assertion names what must be gone AND what must
// still be there, and reports both counts.
// ---------------------------------------------------------------------------

describe('the compliance grid excludes deleted entries', () => {
	it('the CELL shows the live entry, not the newer deleted one', async () => {
		// The distinct-on picks the NEWEST. Pinned first: the newest row really is
		// the deleted one, so an unfiltered pick would genuinely land on it -- an
		// assertion that the cell is compliant proves nothing if every candidate
		// was compliant anyway.
		const newestRaw = await db.sql<{ id: string; deleted_at: Date | null }>(
			`select id, deleted_at from public.notebook_entries
			 where student_id = $1 and session_id = $2 and section_id = $3
			 order by upload_timestamp desc, id desc limit 1`,
			[ada.id, session1, p1]
		);
		expect(newestRaw.rows[0].id).toBe(adaCheckInNew);
		expect(newestRaw.rows[0].deleted_at).not.toBeNull();

		const g = await grid(teacher, p1);
		const adaCell = g.cells.find((c) => c.student_key === ada.email && c.session_id === session1);
		const benCell = g.cells.find((c) => c.student_key === ben.email && c.session_id === session1);

		// GONE: the newer, flagged, deleted entry does not win the pick...
		expect(adaCell?.entry_id).not.toBe(adaCheckInNew);
		expect(adaCell?.status).not.toBe('flagged');
		expect(adaCell?.flag_reason).toBeNull();
		// ...THERE: the older live one does, and the cell reads compliant.
		expect(adaCell?.entry_id).toBe(adaCheckInOld);
		expect(adaCell?.status).toBe('compliant');
		// CONTROL: Ben's cell, which no deletion touched, is unchanged.
		expect(benCell?.entry_id).toBe(benCheckIn);
		expect(benCell?.status).toBe('compliant');
	});

	it('the multi-entry COUNT drops the deleted one and keeps the rest', async () => {
		const g = await grid(teacher, p1);
		const adaCell = g.cells.find((c) => c.student_key === ada.email && c.session_id === session1);
		const benCell = g.cells.find((c) => c.student_key === ben.email && c.session_id === session1);
		// Ada filed THREE against this check-in (old, new-deleted, noted); two live.
		const total = await db.sql<{ n: string }>(
			`select count(*) as n from public.notebook_entries
			 where student_id = $1 and session_id = $2 and section_id = $3`,
			[ada.id, session1, p1]
		);
		expect(total.rows[0].n).toBe('3');
		expect(adaCell?.entry_count).toBe(2);
		expect(benCell?.entry_count).toBe(1);
	});

	it('free_entries counts only the live ones', async () => {
		const g = await grid(teacher, p1);
		const adaRow = g.students.find((s) => s.student_key === ada.email);
		const benRow = g.students.find((s) => s.student_key === ben.email);
		// Ada holds several free entries in P1; exactly one of the two seeded here
		// survives, and Ben's single one is the control.
		const raw = await db.sql<{ n: string }>(
			`select count(*) as n from public.notebook_entries
			 where student_id = $1 and section_id = $2 and session_id is null`,
			[ada.id, p1]
		);
		const live = await db.sql<{ n: string }>(
			`select count(*) as n from public.notebook_entries
			 where student_id = $1 and section_id = $2 and session_id is null and deleted_at is null`,
			[ada.id, p1]
		);
		expect(Number(raw.rows[0].n)).toBeGreaterThan(Number(live.rows[0].n));
		expect(adaRow?.free_entries).toBe(Number(live.rows[0].n));
		expect(benRow?.free_entries).toBe(1);
	});

	it('the ROSTER drops a departed student whose only work here is deleted, and keeps one whose is not', async () => {
		const g = await grid(teacher, p1);
		const keys = g.students.map((s) => s.student_key);
		// GONE: Carol filed here, left, and removed it.
		expect(keys).not.toContain(carol.email);
		// THERE: Dave did the same but still has his, so he stays reachable.
		expect(keys).toContain(dave.email);
		// CONTROL: both enrolled students are on it regardless.
		expect(keys).toContain(ada.email);
		expect(keys).toContain(ben.email);
		expect(g.students).toHaveLength(3);
	});

	it('the admin sees exactly the same grid as the teacher', async () => {
		const asTeacher = await grid(teacher, p1);
		const asOwner = await grid(owner, p1);
		expect(asOwner.students.map((s) => s.student_key)).toEqual(
			asTeacher.students.map((s) => s.student_key)
		);
		expect(asOwner.cells).toEqual(asTeacher.cells);
	});
});

describe('the student payload excludes deleted entries and removed photos', () => {
	const shape = (p: Payload) => ({
		ids: p.entries.map((e) => e.id),
		labels: p.entries.map((e) => e.custom_label)
	});

	it('through the INSTRUCTOR reader', async () => {
		const payload = await rpc<Payload>(teacher, `public.notebook_review_student_notebook($1)`, [
			ada.email
		]);
		const { ids } = shape(payload);
		const raw = await db.sql<{ n: string }>(
			`select count(*) as n from public.notebook_entries where student_id = $1`,
			[ada.id]
		);
		const live = await db.sql<{ n: string }>(
			`select count(*) as n from public.notebook_entries
			 where student_id = $1 and deleted_at is null`,
			[ada.id]
		);

		expect(ids).not.toContain(adaFreeDeleted); // GONE
		expect(ids).not.toContain(adaCheckInNew); // GONE
		expect(ids).toContain(adaFreeLive); // THERE
		expect(ids).toContain(adaCheckInOld); // THERE
		expect(Number(raw.rows[0].n)).toBeGreaterThan(Number(live.rows[0].n));
		expect(ids).toHaveLength(Number(live.rows[0].n));
	});

	it('through the ADMIN view-as reader, which must show what the student sees', async () => {
		const payload = await rpc<Payload>(owner, `public.notebook_view_as_notebook($1)`, [ada.email]);
		const ids = payload.entries.map((e) => e.id);
		expect(ids).not.toContain(adaFreeDeleted);
		expect(ids).toContain(adaFreeLive);

		// And the two readers agree, which is the point of sharing the payload.
		const asTeacher = await rpc<Payload>(teacher, `public.notebook_review_student_notebook($1)`, [
			ada.email
		]);
		expect(ids).toEqual(asTeacher.entries.map((e) => e.id));
	});

	it('a REMOVED PHOTO is dropped while its live sibling stays', async () => {
		const payload = await rpc<Payload>(teacher, `public.notebook_review_student_notebook($1)`, [
			ada.email
		]);
		const entry = payload.entries.find((e) => e.id === adaFreeLive);
		const photoIds = (entry?.photos ?? []).map((p) => p.id);
		const raw = await db.sql<{ n: string }>(
			`select count(*) as n from public.notebook_entry_photos where entry_id = $1`,
			[adaFreeLive]
		);
		expect(raw.rows[0].n).toBe('2');
		expect(photoIds).not.toContain(adaRemovedPhoto); // GONE
		expect(photoIds).toContain(adaLivePhoto); // THERE
		expect(photoIds).toHaveLength(1);
	});
});

describe('the activity view excludes deleted entries and removed photos', () => {
	it('a deleted entry has no activity row, and a live one does', async () => {
		const rows = await db.asUser(ada.id, (q) =>
			q<{ id: string }>(`select id from public.notebook_entry_activity`)
		);
		const ids = rows.rows.map((r) => r.id);
		const live = await db.sql<{ n: string }>(
			`select count(*) as n from public.notebook_entries
			 where student_id = $1 and deleted_at is null`,
			[ada.id]
		);

		expect(ids).not.toContain(adaFreeDeleted); // GONE
		expect(ids).not.toContain(adaCheckInNew); // GONE
		expect(ids).toContain(adaFreeLive); // THERE
		expect(ids).toHaveLength(Number(live.rows[0].n));
	});

	it('a REMOVED photo does not keep an entry looking recent', async () => {
		const { rows } = await db.sql<{ last_activity_at: Date }>(
			`select last_activity_at from public.notebook_entry_activity where id = $1`,
			[adaFreeLive]
		);
		// The removed photo was created 2026-03-05; the live one 2026-03-01T10:05.
		// Counting the removed one would report the later stamp.
		expect(rows[0].last_activity_at.toISOString()).toBe('2026-03-01T10:05:00.000Z');
	});

	it('is still security_invoker, so it adds no reach', async () => {
		const { rows } = await db.sql<{ ok: boolean }>(
			`select (c.reloptions @> array['security_invoker=true']) as ok
			 from pg_class c where c.relname = 'notebook_entry_activity'`
		);
		expect(rows[0].ok).toBe(true);

		const bensView = await db.asUser(ben.id, (q) =>
			q<{ id: string }>(`select id from public.notebook_entry_activity`)
		);
		expect(bensView.rows.map((r) => r.id)).not.toContain(adaFreeLive);
		expect(bensView.rows.map((r) => r.id)).toContain(benCheckIn);
	});
});

describe('detaching a check-in reports the live count but moves every row', () => {
	it('counts only live entries, and still detaches the deleted one', async () => {
		const sessionId = (
			await rpc<{ session_id: string }>(
				teacher,
				`public.notebook_admin_upsert_session(
					p_section_ids => $1::uuid[], p_unit_number => $2::integer,
					p_session_date => $3::date, p_session_label => $4)`,
				[[p1], 9, '2026-04-01', 'Detach me']
			)
		).session_id;

		const live = await newEntry(ada, { sessionId, sectionId: p1 });
		await newPhoto(live, 1);
		const gone = await newEntry(ada, { sessionId, sectionId: p1 });
		await newPhoto(gone, 1);
		await rpc(ada, `public.notebook_delete_entry($1)`, [gone]);

		const { rows } = await db.sql<{ n: number }>(
			`select public._notebook_detach_session_entries($1, $2) as n`,
			[sessionId, p1]
		);
		// The teacher's message says how much work is still in the class.
		expect(rows[0].n).toBe(1);

		// But BOTH rows were detached -- the deleted one still carries the
		// composite key, so leaving it attached would block the posting's removal.
		const after = await db.sql<{ id: string; session_id: string | null; custom_label: string | null }>(
			`select id, session_id, custom_label from public.notebook_entries where id = any($1::uuid[])`,
			[[live, gone]]
		);
		expect(after.rows.every((r) => r.session_id === null)).toBe(true);
		expect(after.rows.every((r) => r.custom_label === 'Detach me')).toBe(true);
	});
});

describe('deleting a folder reports the live count but unfiles every row', () => {
	it('counts only live entries, and still unfiles the deleted one', async () => {
		const folderId = (
			await rpc<{ folder_id: string }>(ada, `public.notebook_upsert_folder($1, $2, null)`, [
				'Unit 4',
				'gold'
			])
		).folder_id;

		const live = await newEntry(ada, { label: 'Filed and live' });
		await newPhoto(live, 1);
		const gone = await newEntry(ada, { label: 'Filed and deleted' });
		await newPhoto(gone, 1);
		await rpc(ada, `public.notebook_move_entries($1::uuid[], $2)`, [[live, gone], folderId]);
		await rpc(ada, `public.notebook_delete_entry($1)`, [gone]);

		const result = await rpc<{ unfiled_entries: number }>(
			ada,
			`public.notebook_delete_folder($1)`,
			[folderId]
		);
		// The student's message names the entries they can still see.
		expect(result.unfiled_entries).toBe(1);

		// But BOTH were unfiled: the folder link is a composite key with no
		// on-delete action, so a deleted entry left pointing at it would block the
		// folder's own removal -- and the folder is gone.
		const after = await db.sql<{ id: string; folder_id: string | null }>(
			`select id, folder_id from public.notebook_entries where id = any($1::uuid[])`,
			[[live, gone]]
		);
		expect(after.rows.every((r) => r.folder_id === null)).toBe(true);
		expect(
			(await db.sql(`select 1 from public.notebook_folders where id = $1`, [folderId])).rowCount
		).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// 7. The boundary: no new write path, no anon reach.
// ---------------------------------------------------------------------------

describe('the write boundary is unchanged', () => {
	it('nobody may write deleted_at or removed_at directly', async () => {
		for (const user of [ada, teacher, owner]) {
			await expect(
				db.asUser(user.id, (q) =>
					q(`update public.notebook_entries set deleted_at = now() where id = $1`, [adaFreeLive])
				)
			).rejects.toThrow();
			await expect(
				db.asUser(user.id, (q) =>
					q(`update public.notebook_entry_photos set removed_at = now() where id = $1`, [
						adaLivePhoto
					])
				)
			).rejects.toThrow();
		}
		expect(await deletedAt(adaFreeLive)).toBeNull();
		expect(await removedAt(adaLivePhoto)).toBeNull();
	});

	it('there is still no DELETE grant on either table, for anyone', async () => {
		for (const user of [ada, teacher, owner]) {
			await expect(
				db.asUser(user.id, (q) =>
					q(`delete from public.notebook_entries where id = $1`, [adaFreeLive])
				)
			).rejects.toThrow();
			await expect(
				db.asUser(user.id, (q) =>
					q(`delete from public.notebook_entry_photos where id = $1`, [adaLivePhoto])
				)
			).rejects.toThrow();
		}
		const { rows } = await db.sql<{ n: string }>(
			`select count(*) as n from information_schema.role_table_grants
			 where table_schema = 'public'
			   and table_name in ('notebook_entries', 'notebook_entry_photos')
			   and privilege_type = 'DELETE'
			   and grantee in ('anon', 'authenticated')`
		);
		expect(rows[0].n).toBe('0');
	});

	it('anon can execute none of the four new RPCs', async () => {
		for (const fn of [
			'public.notebook_delete_entry(uuid)',
			'public.notebook_staff_delete_entry(uuid)',
			'public.notebook_remove_photo(uuid)',
			'public.notebook_set_entry_label(uuid, text)'
		]) {
			const { rows } = await db.sql<{ ok: boolean }>(
				`select has_function_privilege('anon', $1, 'execute') as ok`,
				[fn]
			);
			expect(rows[0].ok, fn).toBe(false);
		}
	});

	it('each new RPC exists exactly once -- no stray overload', async () => {
		for (const name of [
			'notebook_delete_entry',
			'notebook_staff_delete_entry',
			'notebook_remove_photo',
			'notebook_set_entry_label',
			'notebook_edit_note'
		]) {
			const { rows } = await db.sql<{ n: string }>(
				`select count(*) as n from pg_proc p
				 join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public' and p.proname = $1`,
				[name]
			);
			expect(rows[0].n, name).toBe('1');
		}
	});
});

// ---------------------------------------------------------------------------
// 8. The file re-applies. 0088 shipped a migration that only worked once and
// failed in the live SQL editor with the schema half-built; migrations here are
// pasted in by hand, so a re-run is an ordinary thing that happens.
// ---------------------------------------------------------------------------

describe('0116 re-applies cleanly', () => {
	it('runs twice more and every guarantee still holds', async () => {
		await db.sql(MIGRATION_0116);
		await db.sql(MIGRATION_0116);

		// The columns did not double up, and nothing was reset.
		const cols = await db.sql<{ n: string }>(
			`select count(*) as n from information_schema.columns
			 where table_schema = 'public'
			   and ((table_name = 'notebook_entries' and column_name in ('deleted_at', 'deleted_by'))
			     or (table_name = 'notebook_entry_photos' and column_name in ('removed_at', 'removed_by')))`
		);
		expect(cols.rows[0].n).toBe('4');
		expect(await deletedAt(adaFreeDeleted)).not.toBeNull();

		// The sweep still sweeps.
		const g = await grid(teacher, p1);
		expect(g.students.map((s) => s.student_key)).not.toContain(carol.email);
		expect(g.students.map((s) => s.student_key)).toContain(dave.email);

		// And the refusals still refuse.
		await expect(
			db.asUser(ben.id, (q) => q(`select public.notebook_delete_entry($1)`, [adaFreeLive]))
		).rejects.toThrow(/does not exist or is not yours/i);
	});
});

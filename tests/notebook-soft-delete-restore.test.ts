// tests/notebook-soft-delete-restore.test.ts
//
// 0117 closes the one gap 0116 shipped on purpose: the row survived a
// deletion, but nothing a student or an instructor could reach put it back.
// Three RPCs restore an entry, a staff-restore, and a photo; a fourth change
// widens notebook_staff_delete_entry's gate to match the READ predicate
// (0106's notebook_manages_student) it fell short of.
//
// EVERY REFUSAL HERE IS THE ONLY THING STANDING BETWEEN A STUDENT AND WORK
// SOMEBODY ELSE REMOVED, OR BETWEEN AN OUTSIDER AND A ROW THAT IS NOT THEIRS
// TO TOUCH. A missing guard looks exactly like a working restore button to
// whoever presses it. So every refusal is asserted with a positive control
// beside it -- the same row, restored the RIGHT way, to prove the assertion is
// not simply "this call always fails".

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';

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
	'0117_notebook_soft_delete_restore.sql'
] as const;

let db: TestDb;

let owner: SeededUser; // the pinned admin (0067's admin_owner_email): the chair tier
let teacher: SeededUser; // teacher of record for P1
let otherTeacher: SeededUser; // teacher of record for P2, and nothing of P1
let ada: SeededUser; // student, enrolled in P1

let p1: string;
let p2: string;

async function newEntry(
	owner_: SeededUser,
	opts: { label?: string | null; sectionId?: string | null; sessionId?: string | null } = {}
): Promise<string> {
	const { rows } = await db.sql<{ id: string }>(
		`insert into public.notebook_entries
			(student_id, custom_label, section_id, session_id, upload_timestamp)
		 values ($1, $2, $3, $4, now())
		 returning id`,
		[owner_.id, opts.label ?? null, opts.sectionId ?? null, opts.sessionId ?? null]
	);
	return rows[0].id;
}

async function newPhoto(entryId: string, sequence: number): Promise<string> {
	const { rows } = await db.sql<{ id: string }>(
		`insert into public.notebook_entry_photos
			(entry_id, drive_file_id, variant, sequence_order)
		 values ($1, $2, 'original', $3)
		 returning id`,
		[entryId, `drive-${entryId}-${sequence}`, sequence]
	);
	return rows[0].id;
}

/** Runs an RPC as `authenticated` with the given uid, returning its jsonb. */
async function rpc<T = Record<string, unknown>>(
	user: SeededUser,
	call: string,
	params: unknown[] = []
): Promise<T> {
	const { rows } = await db.asUser(user.id, (q) => q<{ result: T }>(`select ${call} as result`, params));
	return rows[0].result;
}

async function deletedAt(entryId: string): Promise<Date | null> {
	const { rows } = await db.sql<{ deleted_at: Date | null }>(
		`select deleted_at from public.notebook_entries where id = $1`,
		[entryId]
	);
	return rows[0]?.deleted_at ?? null;
}

async function deletedBy(entryId: string): Promise<string | null> {
	const { rows } = await db.sql<{ deleted_by: string | null }>(
		`select deleted_by from public.notebook_entries where id = $1`,
		[entryId]
	);
	return rows[0]?.deleted_by ?? null;
}

async function removedAt(photoId: string): Promise<Date | null> {
	const { rows } = await db.sql<{ removed_at: Date | null }>(
		`select removed_at from public.notebook_entry_photos where id = $1`,
		[photoId]
	);
	return rows[0]?.removed_at ?? null;
}

interface Grid {
	students: { student_key: string; free_entries: number }[];
	cells: {
		student_key: string;
		session_id: string;
		status: string;
		entry_id: string | null;
		entry_count: number;
	}[];
}

async function grid(as: SeededUser, sectionId: string): Promise<Grid> {
	return rpc<Grid>(as, `public.notebook_get_section_grid($1, null)`, [sectionId]);
}

interface Payload {
	entries: { id: string }[];
	deleted_entries: {
		id: string;
		custom_label: string | null;
		session: { session_label: string } | null;
		upload_timestamp: string;
		deleted_at: string;
		deleted_by: string | null;
	}[];
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	owner = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	teacher = await createUser(db, 'teacher@boscotech.edu', 'Terry Teacher');
	otherTeacher = await createUser(db, 'other@boscotech.edu', 'Olive Other');
	ada = await createUser(db, 'ada@boscotech.net', 'Ada Pike');

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
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 1. notebook_restore_entry -- the student's own restore.
// ---------------------------------------------------------------------------

describe('notebook_restore_entry', () => {
	it('clears deleted_at and deleted_by, and the entry is readable as live again', async () => {
		const entryId = await newEntry(ada, { label: 'Back and forth' });
		await newPhoto(entryId, 1);
		await rpc(ada, `public.notebook_delete_entry($1)`, [entryId]);
		expect(await deletedAt(entryId)).not.toBeNull();

		const result = await rpc<{ ok: boolean; entry_id: string }>(
			ada,
			`public.notebook_restore_entry($1)`,
			[entryId]
		);
		expect(result.ok).toBe(true);
		expect(result.entry_id).toBe(entryId);
		expect(await deletedAt(entryId)).toBeNull();
		expect(await deletedBy(entryId)).toBeNull();

		// POSITIVE CONTROL: it is visible again through the caller's own RLS-scoped
		// read with the same "deleted_at is null" clause the notebook load uses.
		const live = await db.asUser(ada.id, (q) =>
			q<{ id: string }>(`select id from public.notebook_entries where deleted_at is null`)
		);
		expect(live.rows.map((r) => r.id)).toContain(entryId);
	});

	it('REFUSES one that has not been deleted', async () => {
		const entryId = await newEntry(ada, { label: 'Never removed' });
		await expect(
			db.asUser(ada.id, (q) => q(`select public.notebook_restore_entry($1)`, [entryId]))
		).rejects.toThrow(/has not been deleted/i);
	});

	it('REFUSES another student’s entry', async () => {
		const entryId = await newEntry(ada, { label: 'Not Ben’s' });
		await rpc(ada, `public.notebook_delete_entry($1)`, [entryId]);
		const ben = await createUser(db, 'ben-restore@boscotech.net', 'Ben Restore');
		await expect(
			db.asUser(ben.id, (q) => q(`select public.notebook_restore_entry($1)`, [entryId]))
		).rejects.toThrow(/does not exist or is not yours/i);
		expect(await deletedAt(entryId)).not.toBeNull();
	});

	it('REFUSES an entry an instructor removed, and names who can restore it', async () => {
		const entryId = await newEntry(ada, { label: 'Instructor’s call', sectionId: p1 });
		await rpc(teacher, `public.notebook_staff_delete_entry($1)`, [entryId]);
		expect(await deletedBy(entryId)).toBe(teacher.id);

		await expect(
			db.asUser(ada.id, (q) => q(`select public.notebook_restore_entry($1)`, [entryId]))
		).rejects.toThrow(/instructor removed[\s\S]*ask them/i);
		expect(await deletedAt(entryId)).not.toBeNull();

		// POSITIVE CONTROL: the same row IS restorable by the instructor who removed it.
		const result = await rpc<{ ok: boolean }>(teacher, `public.notebook_staff_restore_entry($1)`, [
			entryId
		]);
		expect(result.ok).toBe(true);
		expect(await deletedAt(entryId)).toBeNull();
	});

	it('an instructor cannot use the student path on a student’s entry', async () => {
		const entryId = await newEntry(ada, { label: 'Student path only' });
		await rpc(ada, `public.notebook_delete_entry($1)`, [entryId]);
		await expect(
			db.asUser(teacher.id, (q) => q(`select public.notebook_restore_entry($1)`, [entryId]))
		).rejects.toThrow(/does not exist or is not yours/i);
	});
});

// ---------------------------------------------------------------------------
// 2. notebook_staff_restore_entry.
// ---------------------------------------------------------------------------

describe('notebook_staff_restore_entry', () => {
	it('the section’s teacher restores a student’s entry and it is logged', async () => {
		const entryId = await newEntry(ada, { label: 'Restored by staff', sectionId: p1 });
		await rpc(ada, `public.notebook_delete_entry($1)`, [entryId]);

		const result = await rpc<{ ok: boolean; student_id: string }>(
			teacher,
			`public.notebook_staff_restore_entry($1)`,
			[entryId]
		);
		expect(result.ok).toBe(true);
		expect(result.student_id).toBe(ada.id);
		expect(await deletedAt(entryId)).toBeNull();

		const log = await db.sql<{ actor_id: string; student_id: string }>(
			`select actor_id, student_id from public.notebook_admin_log
			 where action = 'restore_entry' and entry_id = $1`,
			[entryId]
		);
		expect(log.rowCount).toBe(1);
		expect(log.rows[0].actor_id).toBe(teacher.id);
		expect(log.rows[0].student_id).toBe(ada.id);
	});

	it('REFUSES a teacher of a different section, with a message that reveals nothing', async () => {
		const entryId = await newEntry(ada, { label: 'Not Olive’s', sectionId: p1 });
		await rpc(ada, `public.notebook_delete_entry($1)`, [entryId]);
		await expect(
			db.asUser(otherTeacher.id, (q) =>
				q(`select public.notebook_staff_restore_entry($1)`, [entryId])
			)
		).rejects.toThrow(/does not exist, or is not one you manage/i);
		expect(await deletedAt(entryId)).not.toBeNull();
	});

	it('an unknown id answers IDENTICALLY to a real one they may not touch', async () => {
		const entryId = await newEntry(ada, { label: 'Real but foreign', sectionId: p1 });
		await rpc(ada, `public.notebook_delete_entry($1)`, [entryId]);
		const real = db
			.asUser(otherTeacher.id, (q) => q(`select public.notebook_staff_restore_entry($1)`, [entryId]))
			.catch((e: Error) => e.message);
		const imaginary = db
			.asUser(otherTeacher.id, (q) =>
				q(`select public.notebook_staff_restore_entry('11111111-2222-3333-4444-555555555555')`)
			)
			.catch((e: Error) => e.message);
		expect(await real).toBe(await imaginary);
	});

	it('REFUSES a student', async () => {
		const entryId = await newEntry(ada, { label: 'Not a student’s job', sectionId: p1 });
		await rpc(ada, `public.notebook_delete_entry($1)`, [entryId]);
		const other = await createUser(db, 'classmate-restore@boscotech.net', 'Classmate');
		await expect(
			db.asUser(other.id, (q) => q(`select public.notebook_staff_restore_entry($1)`, [entryId]))
		).rejects.toThrow(/does not exist, or is not one you manage/i);
	});

	it('REFUSES one that has not been deleted', async () => {
		const entryId = await newEntry(ada, { label: 'Live', sectionId: p1 });
		await expect(
			db.asUser(teacher.id, (q) => q(`select public.notebook_staff_restore_entry($1)`, [entryId]))
		).rejects.toThrow(/has not been deleted/i);
	});
});

// ---------------------------------------------------------------------------
// 3. notebook_restore_photo.
// ---------------------------------------------------------------------------

describe('notebook_restore_photo', () => {
	it('clears removed_at, keeping the Drive id untouched', async () => {
		const entryId = await newEntry(ada, { label: 'Two pages' });
		const keep = await newPhoto(entryId, 1);
		const bring_back = await newPhoto(entryId, 2);
		await rpc(ada, `public.notebook_remove_photo($1)`, [bring_back]);
		expect(await removedAt(bring_back)).not.toBeNull();

		const result = await rpc<{ ok: boolean; photo_id: string }>(
			ada,
			`public.notebook_restore_photo($1)`,
			[bring_back]
		);
		expect(result.ok).toBe(true);
		expect(await removedAt(bring_back)).toBeNull();
		// CONTROL: the sibling that was never removed is untouched by this call.
		expect(await removedAt(keep)).toBeNull();

		const { rows } = await db.sql<{ drive_file_id: string }>(
			`select drive_file_id from public.notebook_entry_photos where id = $1`,
			[bring_back]
		);
		expect(rows[0].drive_file_id).toBe(`drive-${entryId}-2`);
	});

	it('REFUSES a photo that has not been removed', async () => {
		const entryId = await newEntry(ada, { label: 'Never removed' });
		const photoId = await newPhoto(entryId, 1);
		await expect(
			db.asUser(ada.id, (q) => q(`select public.notebook_restore_photo($1)`, [photoId]))
		).rejects.toThrow(/has not been removed/i);
	});

	it('REFUSES when the PARENT ENTRY is deleted, and says to restore it first', async () => {
		const entryId = await newEntry(ada, { label: 'Whole entry gone' });
		const p1photo = await newPhoto(entryId, 1);
		const p2photo = await newPhoto(entryId, 2);
		await rpc(ada, `public.notebook_remove_photo($1)`, [p2photo]);
		await rpc(ada, `public.notebook_delete_entry($1)`, [entryId]);

		await expect(
			db.asUser(ada.id, (q) => q(`select public.notebook_restore_photo($1)`, [p2photo]))
		).rejects.toThrow(/entry has been deleted[\s\S]*restore the entry first/i);
		expect(await removedAt(p2photo)).not.toBeNull();

		// POSITIVE CONTROL: restoring the entry first, THEN the photo, works.
		await rpc(ada, `public.notebook_restore_entry($1)`, [entryId]);
		const result = await rpc<{ ok: boolean }>(ada, `public.notebook_restore_photo($1)`, [p2photo]);
		expect(result.ok).toBe(true);
		expect(await removedAt(p2photo)).toBeNull();
		void p1photo;
	});

	it('REFUSES another student’s photo', async () => {
		const entryId = await newEntry(ada, { label: 'Ada’s own' });
		const photoId = await newPhoto(entryId, 1);
		const p2p = await newPhoto(entryId, 2);
		await rpc(ada, `public.notebook_remove_photo($1)`, [p2p]);
		const ben = await createUser(db, 'ben-photo@boscotech.net', 'Ben Photo');
		await expect(
			db.asUser(ben.id, (q) => q(`select public.notebook_restore_photo($1)`, [p2p]))
		).rejects.toThrow(/does not exist or is not yours/i);
		void photoId;
	});
});

// ---------------------------------------------------------------------------
// 4. notebook_staff_delete_entry's WIDENED gate.
// ---------------------------------------------------------------------------

describe('notebook_staff_delete_entry, widened to match notebook_manages_student', () => {
	it('a teacher of record can now staff-delete a FREE-FORM entry of a student they actually teach', async () => {
		// section_id is null: under 0116 alone, classroom_manages_section(null) is
		// is_admin(), so this would have refused the teacher. 0117 widens it with
		// notebook_manages_student, which reaches this because Ada is actively
		// enrolled in Terry's own section.
		const entryId = await newEntry(ada, { label: 'Free-form, taught by Terry' });

		const result = await rpc<{ ok: boolean }>(teacher, `public.notebook_staff_delete_entry($1)`, [
			entryId
		]);
		expect(result.ok).toBe(true);
		expect(await deletedAt(entryId)).not.toBeNull();
		expect(await deletedBy(entryId)).toBe(teacher.id);
	});

	it('a teacher who does NOT teach that student is still refused on the identical free-form entry', async () => {
		const entryId = await newEntry(ada, { label: 'Free-form, not Olive’s' });
		await expect(
			db.asUser(otherTeacher.id, (q) =>
				q(`select public.notebook_staff_delete_entry($1)`, [entryId])
			)
		).rejects.toThrow(/does not exist, or is not in a class you manage/i);
		expect(await deletedAt(entryId)).toBeNull();

		// POSITIVE CONTROL: the chair tier still reaches it either way.
		const result = await rpc<{ ok: boolean }>(owner, `public.notebook_staff_delete_entry($1)`, [
			entryId
		]);
		expect(result.ok).toBe(true);
	});

	it('the section-scoped path is unaffected: a section entry still refuses the wrong teacher', async () => {
		const entryId = await newEntry(ada, { label: 'Section-scoped, unchanged', sectionId: p1 });
		await expect(
			db.asUser(otherTeacher.id, (q) =>
				q(`select public.notebook_staff_delete_entry($1)`, [entryId])
			)
		).rejects.toThrow(/does not exist, or is not in a class you manage/i);
		expect(await deletedAt(entryId)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 5. _notebook_student_payload's `deleted_entries` key.
// ---------------------------------------------------------------------------

describe('the student payload carries deleted_entries as its own key', () => {
	it('through the instructor reader: live stays in `entries`, deleted moves to `deleted_entries`, never both', async () => {
		const liveId = await newEntry(ada, { label: 'Payload: stays live', sectionId: p1 });
		const goneId = await newEntry(ada, { label: 'Payload: goes to trash', sectionId: p1 });
		await rpc(ada, `public.notebook_delete_entry($1)`, [goneId]);

		const payload = await rpc<Payload>(teacher, `public.notebook_review_student_notebook($1)`, [
			ada.email
		]);
		const entryIds = payload.entries.map((e) => e.id);
		const deletedIds = payload.deleted_entries.map((e) => e.id);

		expect(entryIds).toContain(liveId);
		expect(entryIds).not.toContain(goneId);
		expect(deletedIds).toContain(goneId);
		expect(deletedIds).not.toContain(liveId);

		const row = payload.deleted_entries.find((e) => e.id === goneId);
		expect(row?.custom_label).toBe('Payload: goes to trash');
		expect(row?.deleted_by).toBe(ada.id);
		expect(row?.deleted_at).toBeTruthy();
	});

	it('through the ADMIN view-as reader, which must agree with the instructor’s', async () => {
		const goneId = await newEntry(ada, { label: 'Seen by both readers', sectionId: p1 });
		await rpc(ada, `public.notebook_delete_entry($1)`, [goneId]);

		const asTeacher = await rpc<Payload>(teacher, `public.notebook_review_student_notebook($1)`, [
			ada.email
		]);
		const asOwner = await rpc<Payload>(owner, `public.notebook_view_as_notebook($1)`, [ada.email]);
		expect(asOwner.deleted_entries.map((e) => e.id).sort()).toEqual(
			asTeacher.deleted_entries.map((e) => e.id).sort()
		);
		expect(asOwner.deleted_entries.map((e) => e.id)).toContain(goneId);
	});
});

// ---------------------------------------------------------------------------
// 6. A full round trip: delete, confirm it leaves the grid, restore, confirm
// it returns with the SAME counts as before the delete.
// ---------------------------------------------------------------------------

describe('a full delete-then-restore round trip', () => {
	it('the grid returns to its exact pre-delete shape', async () => {
		const sessionId = (
			await rpc<{ session_id: string }>(
				teacher,
				`public.notebook_admin_upsert_session(
					p_section_ids => $1::uuid[], p_unit_number => $2::integer,
					p_session_date => $3::date, p_session_label => $4)`,
				[[p1], 5, '2026-05-01', 'Round trip']
			)
		).session_id;

		const entryId = await newEntry(ada, { sectionId: p1, sessionId });
		await newPhoto(entryId, 1);

		const before = await grid(teacher, p1);
		const beforeCell = before.cells.find(
			(c) => c.student_key === ada.email && c.session_id === sessionId
		);
		const beforeRow = before.students.find((s) => s.student_key === ada.email);
		expect(beforeCell?.entry_id).toBe(entryId);
		expect(beforeCell?.status).toBe('compliant');

		await rpc(ada, `public.notebook_delete_entry($1)`, [entryId]);
		const during = await grid(teacher, p1);
		const duringCell = during.cells.find(
			(c) => c.student_key === ada.email && c.session_id === sessionId
		);
		expect(duringCell?.entry_id).toBeNull();
		expect(duringCell?.status).toBe('missing');

		await rpc(ada, `public.notebook_restore_entry($1)`, [entryId]);
		const after = await grid(teacher, p1);
		const afterCell = after.cells.find(
			(c) => c.student_key === ada.email && c.session_id === sessionId
		);
		const afterRow = after.students.find((s) => s.student_key === ada.email);

		expect(afterCell).toEqual(beforeCell);
		expect(afterRow?.free_entries).toBe(beforeRow?.free_entries);
	});
});

// ---------------------------------------------------------------------------
// 7. The boundary: no new write path, no anon reach, exactly one overload.
// ---------------------------------------------------------------------------

describe('the write boundary holds for the new RPCs', () => {
	it('anon can execute none of the four new/changed RPCs', async () => {
		for (const fn of [
			'public.notebook_restore_entry(uuid)',
			'public.notebook_staff_restore_entry(uuid)',
			'public.notebook_restore_photo(uuid)',
			'public.notebook_staff_delete_entry(uuid)'
		]) {
			const { rows } = await db.sql<{ ok: boolean }>(
				`select has_function_privilege('anon', $1, 'execute') as ok`,
				[fn]
			);
			expect(rows[0].ok, fn).toBe(false);
		}
	});

	it('each new RPC exists exactly once -- no stray overload from re-signing', async () => {
		for (const name of [
			'notebook_restore_entry',
			'notebook_staff_restore_entry',
			'notebook_restore_photo',
			'notebook_staff_delete_entry',
			'_notebook_student_payload'
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

	it('nobody may clear deleted_at / removed_at with a direct UPDATE', async () => {
		const entryId = await newEntry(ada, { label: 'No back door' });
		await newPhoto(entryId, 1);
		const photoId = await newPhoto(entryId, 2);
		await rpc(ada, `public.notebook_remove_photo($1)`, [photoId]);
		await rpc(ada, `public.notebook_delete_entry($1)`, [entryId]);

		for (const user of [ada, teacher, owner]) {
			await expect(
				db.asUser(user.id, (q) =>
					q(`update public.notebook_entries set deleted_at = null where id = $1`, [entryId])
				)
			).rejects.toThrow();
			await expect(
				db.asUser(user.id, (q) =>
					q(`update public.notebook_entry_photos set removed_at = null where id = $1`, [
						photoId
					])
				)
			).rejects.toThrow();
		}
		expect(await deletedAt(entryId)).not.toBeNull();
		expect(await removedAt(photoId)).not.toBeNull();
	});
});

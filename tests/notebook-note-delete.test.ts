// tests/notebook-note-delete.test.ts
//
// 0119 makes a NOTE removable, which 0116 was asked for and did not ship. Two
// student RPCs, two staff RPCs, one refusal added to notebook_edit_note, and an
// exclusion sweep across five server-side reads.
//
// THE CLAIM THIS FILE EXISTS FOR IS THE CHAIN RULE, and it is the one whose
// failure is silent. A note is every row sharing `note_id`, and which revision
// counts is a `max()` -- so a deletion that marked only the head would leave
// revision N-1 as the new head, and a read filtering `deleted_at is null` would
// answer with the note as it read BEFORE the last edit. Nothing errors. The
// student presses Remove and an older draft of the same note takes its place.
// Every test below that says "no read surfaces revision 2 as a head" is aimed
// at exactly that, and each names what must be PRESENT beside what must be
// ABSENT so a vacuous pass is impossible.
//
// FOUR OF THE FIVE SWEEP TARGETS ARE COUNTS THAT GATE A REFUSAL rather than
// lists that render, which is this migration's particular hazard: a deleted
// note left in a count does not show anything wrong, it silently OPENS a guard.
// Those are asserted from the caller's side -- the RPC refuses, or does not --
// because that is where a wrong count actually costs something.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';
import { deletedNoteThreads, noteThreads, type NotebookNoteRow } from '../src/lib/notebook-notes';

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
	'0119_notebook_note_delete.sql'
] as const;

let db: TestDb;

let owner: SeededUser; // the pinned admin (0067's admin_owner_email): the chair tier
let teacher: SeededUser; // teacher of record for P1
let otherTeacher: SeededUser; // teacher of record for P2, and nothing of P1
let ada: SeededUser; // student, enrolled in P1
let bo: SeededUser; // a classmate, and nobody's instructor

let p1: string;
let p2: string;

/** A jsonb note document in the stored shape (0078). */
function doc(text: string) {
	return JSON.stringify([{ type: 'p', runs: [{ text }] }]);
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

/**
 * An entry, written directly rather than through notebook_create_entry, so a
 * test can put one in any state (draft, submitted, reviewed) without driving
 * four RPCs to get there. The RPCs under test are the ones this file is about;
 * the fixture is not.
 */
async function newEntry(
	student: SeededUser,
	opts: {
		label?: string | null;
		sectionId?: string | null;
		submitted?: boolean;
		reviewed?: boolean;
	} = {}
): Promise<string> {
	const { rows } = await db.sql<{ id: string }>(
		`insert into public.notebook_entries
			(student_id, custom_label, section_id, upload_timestamp, submitted_at, reviewed_at)
		 values ($1, $2, $3, now(), $4, $5)
		 returning id`,
		[
			student.id,
			opts.label ?? 'An entry',
			opts.sectionId ?? null,
			opts.submitted === false ? null : new Date().toISOString(),
			opts.reviewed ? new Date().toISOString() : null
		]
	);
	return rows[0].id;
}

async function newPhoto(entryId: string, sequence = 1): Promise<string> {
	const { rows } = await db.sql<{ id: string }>(
		`insert into public.notebook_entry_photos (entry_id, drive_file_id, variant, sequence_order)
		 values ($1, $2, 'original', $3) returning id`,
		[entryId, `drive-${entryId}-${sequence}`, sequence]
	);
	return rows[0].id;
}

/** Writes a note through the REAL RPC and returns its logical note_id. */
async function addNote(student: SeededUser, entryId: string, text: string): Promise<string> {
	const result = await rpc<{ note_id: string }>(
		student,
		`public.notebook_add_note($1::uuid, $2::jsonb)`,
		[entryId, doc(text)]
	);
	return result.note_id;
}

/** Edits it through the REAL RPC, producing the next revision in its chain. */
async function editNote(student: SeededUser, noteId: string, text: string) {
	return rpc(student, `public.notebook_edit_note($1::uuid, $2::jsonb)`, [noteId, doc(text)]);
}

/** Every stored revision of one logical note, oldest first, straight off the table. */
async function chain(noteId: string) {
	const { rows } = await db.sql<{
		id: string;
		revision: number;
		deleted_at: Date | null;
		deleted_by: string | null;
	}>(
		`select id, revision, deleted_at, deleted_by
		 from public.notebook_entry_notes where note_id = $1 order by revision`,
		[noteId]
	);
	return rows;
}

/**
 * The chain as the CLIENT would receive it, so the pure reader can be pointed
 * at real stored state rather than at a hand-typed fixture of what this file
 * believes the database holds.
 */
async function clientRows(entryId: string, noteId: string): Promise<NotebookNoteRow[]> {
	const rows = await chain(noteId);
	return rows.map((r) => ({
		id: r.id,
		entry_id: entryId,
		note_id: noteId,
		revision: r.revision,
		content: [],
		created_at: new Date(2026, 0, r.revision).toISOString(),
		deleted_at: r.deleted_at ? r.deleted_at.toISOString() : null,
		deleted_by: r.deleted_by
	}));
}

interface PayloadEntry {
	id: string;
	notes: NotebookNoteRow[];
}
interface Payload {
	entries: PayloadEntry[];
	deleted_entries: { id: string }[];
}

/** The staff payload both instructor-facing readers delegate to (0106/0118/0119). */
async function reviewPayload(as: SeededUser, studentEmail: string): Promise<Payload> {
	return rpc<Payload>(as, `public.notebook_review_student_notebook($1)`, [studentEmail]);
}

async function refuses(p: Promise<unknown>, match: RegExp) {
	await expect(p).rejects.toThrow(match);
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	owner = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	teacher = await createUser(db, 'teacher@boscotech.edu', 'Terry Teacher');
	otherTeacher = await createUser(db, 'other@boscotech.edu', 'Olive Other');
	ada = await createUser(db, 'ada@boscotech.net', 'Ada Pike');
	bo = await createUser(db, 'bo@boscotech.net', 'Bo Reyes');

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

	await enrollStudent(db, {
		as: teacher,
		sectionId: p1,
		email: ada.email,
		displayName: 'Pike, Ada'
	});
	await enrollStudent(db, { as: teacher, sectionId: p1, email: bo.email, displayName: 'Reyes, Bo' });
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 1. THE CHAIN. The claim this migration lives or dies on.
// ---------------------------------------------------------------------------

describe('deleting a note marks its whole revision chain', () => {
	it('marks all three revisions, and no read surfaces revision 2 as a head', async () => {
		const entry = await newEntry(ada, { sectionId: p1 });
		await newPhoto(entry); // so the shell guard is not what is under test here
		const noteId = await addNote(ada, entry, 'first draft');
		await editNote(ada, noteId, 'second draft');
		await editNote(ada, noteId, 'third and final');

		// POSITIVE CONTROL, before anything is deleted: three revisions exist,
		// they are one logical note, and every one of them is live.
		const before = await chain(noteId);
		expect(before.map((r) => r.revision)).toEqual([1, 2, 3]);
		expect(before.filter((r) => r.deleted_at === null)).toHaveLength(3);
		expect(noteThreads(await clientRows(entry, noteId))).toHaveLength(1);

		const result = await rpc<{ ok: boolean; revisions: number }>(
			ada,
			`public.notebook_delete_note($1::uuid)`,
			[noteId]
		);
		expect(result.ok).toBe(true);
		// The RPC reports how much of the record went with it.
		expect(Number(result.revisions)).toBe(3);

		// EVERY revision carries the stamp, not just the head. This is the whole
		// migration: 3 marked, 0 left live, one actor.
		const after = await chain(noteId);
		expect(after).toHaveLength(3);
		expect(after.filter((r) => r.deleted_at !== null)).toHaveLength(3);
		expect(after.filter((r) => r.deleted_at === null)).toHaveLength(0);
		expect(new Set(after.map((r) => r.deleted_by))).toEqual(new Set([ada.id]));
		// One instant for the whole chain: a single UPDATE, so `now()` is stable.
		expect(new Set(after.map((r) => String(r.deleted_at))).size).toBe(1);

		// AND THE CONSEQUENCE, asserted through the reader rather than the rows:
		// the one funnel every rendering surface goes through returns NO thread
		// at all -- not a thread whose head is revision 2.
		const rows = await clientRows(entry, noteId);
		expect(noteThreads(rows)).toHaveLength(0);
		// The mirror still has it, whole: 3 revisions, head still at revision 3.
		const removed = deletedNoteThreads(rows);
		expect(removed).toHaveLength(1);
		expect(removed[0].revisions).toBe(3);
		expect(removed[0].current.revision).toBe(3);
		expect(removed[0].history.map((h) => h.revision)).toEqual([2, 1]);
	});

	it('restores the whole chain, history intact', async () => {
		const entry = await newEntry(ada, { sectionId: p1 });
		await newPhoto(entry);
		const noteId = await addNote(ada, entry, 'v1');
		await editNote(ada, noteId, 'v2');
		await editNote(ada, noteId, 'v3');

		await rpc(ada, `public.notebook_delete_note($1::uuid)`, [noteId]);
		expect((await chain(noteId)).filter((r) => r.deleted_at !== null)).toHaveLength(3);

		const result = await rpc<{ ok: boolean; revisions: number }>(
			ada,
			`public.notebook_restore_note($1::uuid)`,
			[noteId]
		);
		expect(result.ok).toBe(true);
		expect(Number(result.revisions)).toBe(3);

		// Back to three LIVE revisions -- not one, and not "the head only".
		const after = await chain(noteId);
		expect(after.map((r) => r.revision)).toEqual([1, 2, 3]);
		expect(after.filter((r) => r.deleted_at === null)).toHaveLength(3);
		expect(after.filter((r) => r.deleted_by !== null)).toHaveLength(0);

		// And the reader sees one thread again, with its history: the round trip
		// cost the note nothing.
		const thread = noteThreads(await clientRows(entry, noteId));
		expect(thread).toHaveLength(1);
		expect(thread[0].revisions).toBe(3);
		expect(thread[0].current.revision).toBe(3);
		expect(deletedNoteThreads(await clientRows(entry, noteId))).toHaveLength(0);
	});

	it('refuses to edit a deleted note, so a live head cannot be grafted onto a marked chain', async () => {
		const entry = await newEntry(ada, { sectionId: p1 });
		await newPhoto(entry);
		const noteId = await addNote(ada, entry, 'original');
		await editNote(ada, noteId, 'edited once');
		await rpc(ada, `public.notebook_delete_note($1::uuid)`, [noteId]);

		await refuses(editNote(ada, noteId, 'sneaking back in'), /has been deleted/i);

		// THE POINT OF THE REFUSAL, asserted rather than assumed: no revision 3
		// was inserted, so the chain cannot end up half deleted -- a live head
		// over a marked history is the one state the whole-chain rule exists to
		// make unreachable.
		const after = await chain(noteId);
		expect(after.map((r) => r.revision)).toEqual([1, 2]);
		expect(after.filter((r) => r.deleted_at === null)).toHaveLength(0);

		// POSITIVE CONTROL: restore it and the identical edit lands.
		await rpc(ada, `public.notebook_restore_note($1::uuid)`, [noteId]);
		await editNote(ada, noteId, 'legitimately edited');
		expect((await chain(noteId)).map((r) => r.revision)).toEqual([1, 2, 3]);
	});

	it('leaves a sibling note on the same entry completely alone', async () => {
		const entry = await newEntry(ada, { sectionId: p1 });
		const doomed = await addNote(ada, entry, 'this one goes');
		await editNote(ada, doomed, 'this one still goes');
		const kept = await addNote(ada, entry, 'this one stays');

		await rpc(ada, `public.notebook_delete_note($1::uuid)`, [doomed]);

		// The exclusion and its positive control, side by side on one entry.
		expect((await chain(doomed)).filter((r) => r.deleted_at !== null)).toHaveLength(2);
		expect((await chain(kept)).filter((r) => r.deleted_at !== null)).toHaveLength(0);

		const rows = [...(await clientRows(entry, doomed)), ...(await clientRows(entry, kept))];
		expect(noteThreads(rows).map((t) => t.noteId)).toEqual([kept]);
		expect(deletedNoteThreads(rows).map((t) => t.noteId)).toEqual([doomed]);
	});
});

// ---------------------------------------------------------------------------
// 2. WHO MAY DO IT. Every refusal with a positive control beside it, so no
// assertion can pass merely because the call always fails.
// ---------------------------------------------------------------------------

describe('notebook_delete_note: the owner, and nobody else', () => {
	it('refuses a classmate, and refuses an instructor through the student path', async () => {
		const entry = await newEntry(ada, { sectionId: p1 });
		await newPhoto(entry);
		const noteId = await addNote(ada, entry, 'Ada wrote this');

		// A classmate and an instructor answer IDENTICALLY to a note that does
		// not exist, so an id cannot be probed through this function.
		await refuses(
			rpc(bo, `public.notebook_delete_note($1::uuid)`, [noteId]),
			/does not exist or is not yours/i
		);
		await refuses(
			rpc(teacher, `public.notebook_delete_note($1::uuid)`, [noteId]),
			/does not exist or is not yours/i
		);
		await refuses(
			rpc(bo, `public.notebook_delete_note($1::uuid)`, [crypto.randomUUID()]),
			/does not exist or is not yours/i
		);

		// Nothing moved.
		expect((await chain(noteId)).filter((r) => r.deleted_at !== null)).toHaveLength(0);

		// POSITIVE CONTROL: the owner, same note, same call.
		await rpc(ada, `public.notebook_delete_note($1::uuid)`, [noteId]);
		expect((await chain(noteId)).filter((r) => r.deleted_at !== null)).toHaveLength(1);
	});

	it('refuses a note that is already deleted', async () => {
		const entry = await newEntry(ada, { sectionId: p1 });
		await newPhoto(entry);
		const noteId = await addNote(ada, entry, 'once');
		await rpc(ada, `public.notebook_delete_note($1::uuid)`, [noteId]);
		await refuses(
			rpc(ada, `public.notebook_delete_note($1::uuid)`, [noteId]),
			/already been deleted/i
		);
	});

	it('takes no identity parameter: the signature is the boundary', async () => {
		const { rows } = await db.sql<{ args: string }>(
			`select pg_get_function_arguments(p.oid) as args
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = $1`,
			['notebook_delete_note']
		);
		// Exactly one row: the signature trap (a second overload would make
		// PostgREST unable to resolve the call at all).
		expect(rows).toHaveLength(1);
		expect(rows[0].args).toBe('p_note_id uuid');
	});
});

describe('the shell guard: a submitted entry cannot be emptied, a draft can', () => {
	it('refuses the last note on a submitted entry with no live photos', async () => {
		const entry = await newEntry(ada, { sectionId: p1, submitted: true });
		const noteId = await addNote(ada, entry, 'the only content');

		await refuses(
			rpc(ada, `public.notebook_delete_note($1::uuid)`, [noteId]),
			/only thing in this entry/i
		);
		expect((await chain(noteId)).filter((r) => r.deleted_at !== null)).toHaveLength(0);

		// POSITIVE CONTROL: give the entry a photo and the same call lands. The
		// refusal was about the entry being emptied, not about the note.
		await newPhoto(entry);
		await rpc(ada, `public.notebook_delete_note($1::uuid)`, [noteId]);
		expect((await chain(noteId)).filter((r) => r.deleted_at !== null)).toHaveLength(1);
	});

	it('counts a SIBLING note as remaining content, but not the chain being deleted', async () => {
		const entry = await newEntry(ada, { sectionId: p1, submitted: true });
		const first = await addNote(ada, entry, 'one');
		const second = await addNote(ada, entry, 'two');

		// Two notes, no photos: removing either is fine, the other remains.
		await rpc(ada, `public.notebook_delete_note($1::uuid)`, [first]);

		// THE EXCLUSION THAT MATTERS: the guard must not count the now-deleted
		// first note as remaining content when the second one goes.
		await refuses(
			rpc(ada, `public.notebook_delete_note($1::uuid)`, [second]),
			/only thing in this entry/i
		);
		expect((await chain(second)).filter((r) => r.deleted_at !== null)).toHaveLength(0);
	});

	it('does not count the deleted chain’s OWN older revisions as remaining content', async () => {
		const entry = await newEntry(ada, { sectionId: p1, submitted: true });
		const noteId = await addNote(ada, entry, 'draft one');
		await editNote(ada, noteId, 'draft two');
		await editNote(ada, noteId, 'draft three');

		// Three rows on the entry, ONE logical note, no photos. A guard that
		// excluded only the head row by id would see two siblings remaining and
		// let the entry be emptied.
		expect(await chain(noteId)).toHaveLength(3);
		await refuses(
			rpc(ada, `public.notebook_delete_note($1::uuid)`, [noteId]),
			/only thing in this entry/i
		);
	});

	it('lets a DRAFT be emptied', async () => {
		const entry = await newEntry(ada, { sectionId: p1, submitted: false });
		const noteId = await addNote(ada, entry, 'unfinished thought');

		await rpc(ada, `public.notebook_delete_note($1::uuid)`, [noteId]);
		expect((await chain(noteId)).filter((r) => r.deleted_at !== null)).toHaveLength(1);
	});

	it('lets a REVIEWED entry lose a note: the rule is about emptiness, not review', async () => {
		const entry = await newEntry(ada, { sectionId: p1, submitted: true, reviewed: true });
		await newPhoto(entry);
		const noteId = await addNote(ada, entry, 'written before review');

		await rpc(ada, `public.notebook_delete_note($1::uuid)`, [noteId]);
		expect((await chain(noteId)).filter((r) => r.deleted_at !== null)).toHaveLength(1);
	});
});

describe('notebook_restore_note: only your own removal, and only onto a live entry', () => {
	it('refuses a note the instructor removed, and names who can undo it', async () => {
		const entry = await newEntry(ada, { sectionId: p1, submitted: true });
		await newPhoto(entry);
		const noteId = await addNote(ada, entry, 'the instructor takes this down');

		await rpc(teacher, `public.notebook_staff_delete_note($1::uuid)`, [noteId]);
		await refuses(
			rpc(ada, `public.notebook_restore_note($1::uuid)`, [noteId]),
			/instructor removed that note/i
		);
		expect((await chain(noteId)).filter((r) => r.deleted_at !== null)).toHaveLength(1);

		// POSITIVE CONTROL: the instructor CAN, which is what that message
		// promises -- otherwise the refusal is a dead end.
		await rpc(teacher, `public.notebook_staff_restore_note($1::uuid)`, [noteId]);
		expect((await chain(noteId)).filter((r) => r.deleted_at !== null)).toHaveLength(0);
	});

	it('refuses when the parent entry is deleted, and says to restore it first', async () => {
		const entry = await newEntry(ada, { sectionId: p1, submitted: true });
		await newPhoto(entry);
		const noteId = await addNote(ada, entry, 'on a doomed entry');
		await rpc(ada, `public.notebook_delete_note($1::uuid)`, [noteId]);
		await rpc(ada, `public.notebook_delete_entry($1::uuid)`, [entry]);

		await refuses(
			rpc(ada, `public.notebook_restore_note($1::uuid)`, [noteId]),
			/Restore the entry first/i
		);
		expect((await chain(noteId)).filter((r) => r.deleted_at !== null)).toHaveLength(1);

		// POSITIVE CONTROL: restore the entry and the identical call lands.
		await rpc(ada, `public.notebook_restore_entry($1::uuid)`, [entry]);
		await rpc(ada, `public.notebook_restore_note($1::uuid)`, [noteId]);
		expect((await chain(noteId)).filter((r) => r.deleted_at !== null)).toHaveLength(0);
	});

	it('answers the staff refusal BEFORE the entry one, so the errand is not wasted', async () => {
		// Both conditions true at once. Telling the student to go restore the
		// entry, only to refuse them again afterwards, is the outcome the order
		// in the migration exists to avoid.
		const entry = await newEntry(ada, { sectionId: p1, submitted: true });
		await newPhoto(entry);
		const noteId = await addNote(ada, entry, 'both refusals apply');
		await rpc(teacher, `public.notebook_staff_delete_note($1::uuid)`, [noteId]);
		await rpc(ada, `public.notebook_delete_entry($1::uuid)`, [entry]);

		await refuses(
			rpc(ada, `public.notebook_restore_note($1::uuid)`, [noteId]),
			/instructor removed that note/i
		);
	});

	it('refuses a note that was never deleted, and refuses a classmate', async () => {
		const entry = await newEntry(ada, { sectionId: p1, submitted: true });
		await newPhoto(entry);
		const noteId = await addNote(ada, entry, 'live and well');

		await refuses(
			rpc(ada, `public.notebook_restore_note($1::uuid)`, [noteId]),
			/has not been deleted/i
		);
		await rpc(ada, `public.notebook_delete_note($1::uuid)`, [noteId]);
		await refuses(
			rpc(bo, `public.notebook_restore_note($1::uuid)`, [noteId]),
			/does not exist or is not yours/i
		);

		// POSITIVE CONTROL: the owner, same deleted note.
		await rpc(ada, `public.notebook_restore_note($1::uuid)`, [noteId]);
		expect((await chain(noteId)).filter((r) => r.deleted_at !== null)).toHaveLength(0);
	});
});

describe('the staff RPCs: gated like notebook_staff_delete_entry after 0117, and logged', () => {
	it('lets the teacher of record and the chair act, and refuses an unrelated teacher', async () => {
		const entry = await newEntry(ada, { sectionId: p1, submitted: true });
		await newPhoto(entry);
		const noteId = await addNote(ada, entry, 'Ada wrote this in P1');

		// The teacher of another section is not a manager of this one.
		await refuses(
			rpc(otherTeacher, `public.notebook_staff_delete_note($1::uuid)`, [noteId]),
			/does not exist, or is not one you manage/i
		);
		// Nor is a classmate.
		await refuses(
			rpc(bo, `public.notebook_staff_delete_note($1::uuid)`, [noteId]),
			/does not exist, or is not one you manage/i
		);
		expect((await chain(noteId)).filter((r) => r.deleted_at !== null)).toHaveLength(0);

		// POSITIVE CONTROLS: the teacher of record can...
		await rpc(teacher, `public.notebook_staff_delete_note($1::uuid)`, [noteId]);
		expect((await chain(noteId)).filter((r) => r.deleted_by === teacher.id)).toHaveLength(1);
		// ...and so can the chair tier.
		await rpc(owner, `public.notebook_staff_restore_note($1::uuid)`, [noteId]);
		expect((await chain(noteId)).filter((r) => r.deleted_at !== null)).toHaveLength(0);
	});

	it('reaches a FREE-FORM entry through notebook_manages_student, which section alone would not', async () => {
		// section_id null: classroom_manages_section(null) is is_admin(), so
		// without 0117's second branch only the chair would qualify -- even
		// though 0106 widened the READ so the student's own instructor sees it.
		const entry = await newEntry(ada, { sectionId: null, submitted: true });
		await newPhoto(entry);
		const noteId = await addNote(ada, entry, 'a free-form note');

		await rpc(teacher, `public.notebook_staff_delete_note($1::uuid)`, [noteId]);
		expect((await chain(noteId)).filter((r) => r.deleted_by === teacher.id)).toHaveLength(1);

		// The unrelated teacher still cannot: the branch is "manages this
		// STUDENT", not "manages nobody in particular".
		await rpc(teacher, `public.notebook_staff_restore_note($1::uuid)`, [noteId]);
		await refuses(
			rpc(otherTeacher, `public.notebook_staff_delete_note($1::uuid)`, [noteId]),
			/does not exist, or is not one you manage/i
		);
	});

	it('refuses a DRAFT, in the same words as a note that is not there', async () => {
		const entry = await newEntry(ada, { sectionId: p1, submitted: false });
		const noteId = await addNote(ada, entry, 'not turned in yet');

		// Naming the draft would confirm to a manager that the student is
		// holding unturned-in work, which is what a draft is private about.
		await refuses(
			rpc(teacher, `public.notebook_staff_delete_note($1::uuid)`, [noteId]),
			/does not exist, or is not one you manage/i
		);
		await refuses(
			rpc(teacher, `public.notebook_staff_restore_note($1::uuid)`, [noteId]),
			/does not exist, or is not one you manage/i
		);
		expect((await chain(noteId)).filter((r) => r.deleted_at !== null)).toHaveLength(0);

		// POSITIVE CONTROL: turn the entry in and the identical call lands, so
		// the refusal is about draft state and not about the gate.
		await rpc(ada, `public.notebook_submit_entry($1::uuid)`, [entry]);
		await rpc(teacher, `public.notebook_staff_delete_note($1::uuid)`, [noteId]);
		expect((await chain(noteId)).filter((r) => r.deleted_at !== null)).toHaveLength(1);
	});

	it('writes an audit row for both directions, and the student path writes none', async () => {
		const entry = await newEntry(ada, { sectionId: p1, submitted: true });
		await newPhoto(entry);
		const staffNote = await addNote(ada, entry, 'staff removes this');
		await editNote(ada, staffNote, 'staff removes this, edited');
		const ownNote = await addNote(ada, entry, 'Ada removes this herself');

		await rpc(teacher, `public.notebook_staff_delete_note($1::uuid)`, [staffNote]);
		await rpc(teacher, `public.notebook_staff_restore_note($1::uuid)`, [staffNote]);
		await rpc(ada, `public.notebook_delete_note($1::uuid)`, [ownNote]);

		const { rows } = await db.sql<{
			action: string;
			actor_id: string;
			entry_id: string;
			student_id: string;
			details: { note_id: string; revisions: number };
		}>(
			`select action, actor_id, entry_id, student_id, details
			 from public.notebook_admin_log
			 where entry_id = $1 order by created_at, action`,
			[entry]
		);

		// Both staff acts, and ONLY the staff acts: a student tidying their own
		// notebook is not an event anyone reviews.
		expect(rows.map((r) => r.action).sort()).toEqual(['delete_note', 'restore_note']);
		expect(rows.every((r) => r.actor_id === teacher.id)).toBe(true);
		expect(rows.every((r) => r.student_id === ada.id)).toBe(true);
		expect(rows.every((r) => r.details.note_id === staffNote)).toBe(true);
		// The one number that says how much of a record went with it.
		expect(rows.map((r) => Number(r.details.revisions))).toEqual([2, 2]);

		// The exclusion, stated as its own count rather than left to the sort
		// above: nothing was logged about the note the student removed.
		const { rows: own } = await db.sql<{ n: string }>(
			`select count(*) as n from public.notebook_admin_log
			 where details->>'note_id' = $1`,
			[ownNote]
		);
		expect(Number(own[0].n)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// 3. THE EXCLUSION SWEEP, asserted where a wrong count actually costs
// something. Four of these are guards, not lists.
// ---------------------------------------------------------------------------

describe('the exclusion sweep: a deleted note is not content', () => {
	it('notebook_submit_entry: a draft holding only a deleted note has nothing to turn in', async () => {
		const entry = await newEntry(ada, { sectionId: p1, submitted: false });
		const noteId = await addNote(ada, entry, 'written then withdrawn');
		await rpc(ada, `public.notebook_delete_note($1::uuid)`, [noteId]);

		await refuses(
			rpc(ada, `public.notebook_submit_entry($1::uuid)`, [entry]),
			/nothing in it to turn in/i
		);

		// POSITIVE CONTROL: restore the note and the identical call lands, so the
		// refusal is the deleted-note filter and not a broken guard.
		await rpc(ada, `public.notebook_restore_note($1::uuid)`, [noteId]);
		const ok = await rpc<{ ok: boolean }>(ada, `public.notebook_submit_entry($1::uuid)`, [entry]);
		expect(ok.ok).toBe(true);
	});

	it('notebook_remove_photo: a deleted note cannot be what keeps the last photo removable', async () => {
		const entry = await newEntry(ada, { sectionId: p1, submitted: true });
		const photo = await newPhoto(entry);
		const noteId = await addNote(ada, entry, 'the only other content');
		await rpc(ada, `public.notebook_delete_note($1::uuid)`, [noteId]);

		// The two guards must agree: the note already refused to be the last
		// thing removed, so the photo must too.
		await refuses(
			rpc(ada, `public.notebook_remove_photo($1::uuid)`, [photo]),
			/only thing in this entry/i
		);

		// POSITIVE CONTROL: restore the note and the photo comes out fine.
		await rpc(ada, `public.notebook_restore_note($1::uuid)`, [noteId]);
		const ok = await rpc<{ ok: boolean }>(ada, `public.notebook_remove_photo($1::uuid)`, [photo]);
		expect(ok.ok).toBe(true);
	});

	it('notebook_set_entry_label: a deleted note cannot be what makes a title clearable', async () => {
		// A DRAFT, so the note can be deleted at all -- section 2's own shell
		// guard would refuse to empty a submitted entry, and this test is about
		// the LABEL guard, which has no draft exemption of its own.
		const entry = await newEntry(ada, { sectionId: p1, label: 'A free entry', submitted: false });
		const noteId = await addNote(ada, entry, 'the only content');
		await rpc(ada, `public.notebook_delete_note($1::uuid)`, [noteId]);

		await refuses(
			rpc(ada, `public.notebook_set_entry_label($1::uuid, null)`, [entry]),
			/only thing in this entry/i
		);

		// POSITIVE CONTROL.
		await rpc(ada, `public.notebook_restore_note($1::uuid)`, [noteId]);
		const ok = await rpc<{ ok: boolean }>(
			ada,
			`public.notebook_set_entry_label($1::uuid, null)`,
			[entry]
		);
		expect(ok.ok).toBe(true);
	});

	it('notebook_entry_activity: a deleted note does not make an entry look recently worked on', async () => {
		const entry = await newEntry(ada, { sectionId: p1, submitted: true });
		await newPhoto(entry);
		// The entry's own stamps are old; only the note is recent.
		await db.sql(
			`update public.notebook_entries set upload_timestamp = now() - interval '30 days' where id = $1`,
			[entry]
		);
		await db.sql(
			`update public.notebook_entry_photos set created_at = now() - interval '30 days' where entry_id = $1`,
			[entry]
		);
		const noteId = await addNote(ada, entry, 'written today');

		const activityAt = async () => {
			const { rows } = await db.asUser(ada.id, (q) =>
				q<{ last_activity_at: Date }>(
					`select last_activity_at from public.notebook_entry_activity where id = $1`,
					[entry]
				)
			);
			return rows[0].last_activity_at;
		};

		// POSITIVE CONTROL first: the live note IS what makes it recent.
		const withNote = await activityAt();
		const uploaded = new Date(Date.now() - 30 * 24 * 3600 * 1000);
		expect(withNote.getTime()).toBeGreaterThan(uploaded.getTime() + 3600 * 1000);

		await rpc(ada, `public.notebook_delete_note($1::uuid)`, [noteId]);

		// And once removed it is not: the entry falls back to its own old stamp.
		const withoutNote = await activityAt();
		expect(withoutNote.getTime()).toBeLessThan(withNote.getTime());
		expect(withoutNote.getTime()).toBeLessThan(uploaded.getTime() + 3600 * 1000);
	});

	it('_notebook_student_payload: the staff read drops the whole thread, not just its head', async () => {
		const entry = await newEntry(ada, { sectionId: p1, submitted: true });
		await newPhoto(entry);
		const doomed = await addNote(ada, entry, 'rev one');
		await editNote(ada, doomed, 'rev two');
		await editNote(ada, doomed, 'rev three');
		const kept = await addNote(ada, entry, 'a note that stays');

		// POSITIVE CONTROL: before deletion the instructor sees four rows across
		// two logical notes.
		const before = await reviewPayload(teacher, ada.email);
		const beforeNotes = before.entries.find((e) => e.id === entry)?.notes ?? [];
		expect(beforeNotes).toHaveLength(4);
		expect(new Set(beforeNotes.map((n) => n.note_id))).toEqual(new Set([doomed, kept]));

		await rpc(ada, `public.notebook_delete_note($1::uuid)`, [doomed]);

		const after = await reviewPayload(teacher, ada.email);
		const afterNotes = after.entries.find((e) => e.id === entry)?.notes ?? [];
		// ONE row, and it is the surviving note -- not three of the deleted one,
		// and not revision 2 standing in as its head.
		expect(afterNotes).toHaveLength(1);
		expect(afterNotes.map((n) => n.note_id)).toEqual([kept]);
		expect(afterNotes.filter((n) => n.note_id === doomed)).toHaveLength(0);

		// The admin preview reads the SAME payload, so it cannot disagree.
		const viewAs = await rpc<Payload>(owner, `public.notebook_view_as_notebook($1)`, [ada.email]);
		const viewAsNotes = viewAs.entries.find((e) => e.id === entry)?.notes ?? [];
		expect(viewAsNotes.map((n) => n.note_id)).toEqual([kept]);
	});

	it('notebook_get_section_grid counts entries, not notes: the cell is unchanged', async () => {
		// Checked rather than assumed -- the grid names notebook_entry_notes
		// nowhere, and presence is "an entry was filed", which a removed note
		// does not undo.
		const { rows } = await db.sql<{ n: string }>(
			`select count(*) as n from pg_proc p
			 join pg_namespace ns on ns.oid = p.pronamespace
			 where ns.nspname = 'public' and p.proname = 'notebook_get_section_grid'
			   and pg_get_functiondef(p.oid) like '%notebook_entry_notes%'`
		);
		expect(Number(rows[0].n)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// 4. THE ROUND TRIP, end to end and across every reader at once.
// ---------------------------------------------------------------------------

describe('the round trip: delete, absent from every staff read, restore, whole again', () => {
	it('walks a three-revision note out of the staff reads and back in', async () => {
		const entry = await newEntry(ada, { sectionId: p1, submitted: true });
		await newPhoto(entry);
		const noteId = await addNote(ada, entry, 'one');
		await editNote(ada, noteId, 'two');
		await editNote(ada, noteId, 'three');

		const staffNoteIds = async (as: SeededUser) => {
			const payload = await reviewPayload(as, ada.email);
			return (payload.entries.find((e) => e.id === entry)?.notes ?? []).map((n) => n.note_id);
		};

		// PRESENT: three revisions of one note, in both staff readers.
		expect(await staffNoteIds(teacher)).toEqual([noteId, noteId, noteId]);
		expect(await staffNoteIds(owner)).toEqual([noteId, noteId, noteId]);

		await rpc(ada, `public.notebook_delete_note($1::uuid)`, [noteId]);

		// ABSENT: from every staff read, all three revisions of it.
		expect(await staffNoteIds(teacher)).toEqual([]);
		expect(await staffNoteIds(owner)).toEqual([]);

		// PRESENT in the owner's own history read, with its revisions intact --
		// which is what makes the deletion reversible rather than merely hidden.
		const ownerRows = await clientRows(entry, noteId);
		const removed = deletedNoteThreads(ownerRows);
		expect(removed).toHaveLength(1);
		expect(removed[0].revisions).toBe(3);
		expect(removed[0].deletedBy).toBe(ada.id);
		expect(noteThreads(ownerRows)).toHaveLength(0);

		await rpc(ada, `public.notebook_restore_note($1::uuid)`, [noteId]);

		// BACK, all three, in both staff readers and in the owner's live view.
		expect(await staffNoteIds(teacher)).toEqual([noteId, noteId, noteId]);
		expect(await staffNoteIds(owner)).toEqual([noteId, noteId, noteId]);
		const restored = noteThreads(await clientRows(entry, noteId));
		expect(restored).toHaveLength(1);
		expect(restored[0].revisions).toBe(3);
		expect(restored[0].current.revision).toBe(3);
	});
});

// ---------------------------------------------------------------------------
// 5. The migration's own shape.
// ---------------------------------------------------------------------------

describe('0119 as a migration', () => {
	it('leaves exactly one overload of each new function', async () => {
		for (const name of [
			'notebook_delete_note',
			'notebook_restore_note',
			'notebook_staff_delete_note',
			'notebook_staff_restore_note'
		]) {
			const { rows } = await db.sql<{ n: string }>(
				`select count(*) as n from pg_proc p
				 join pg_namespace ns on ns.oid = p.pronamespace
				 where ns.nspname = 'public' and p.proname = $1`,
				[name]
			);
			expect([name, Number(rows[0].n)]).toEqual([name, 1]);
		}
	});

	it('grants execute to authenticated and to nobody else', async () => {
		for (const name of [
			'notebook_delete_note',
			'notebook_restore_note',
			'notebook_staff_delete_note',
			'notebook_staff_restore_note'
		]) {
			const { rows } = await db.sql<{ grantee: string }>(
				`select grantee from information_schema.role_routine_grants g
				 join pg_proc p on p.oid = ('public.' || g.routine_name)::regproc
				 where g.routine_schema = 'public' and g.routine_name = $1
				   and g.privilege_type = 'EXECUTE'`,
				[name]
			);
			const grantees = new Set(rows.map((r) => r.grantee));
			expect([name, grantees.has('authenticated')]).toEqual([name, true]);
			expect([name, grantees.has('PUBLIC')]).toEqual([name, false]);
			expect([name, grantees.has('anon')]).toEqual([name, false]);
		}
	});

	it('adds no client write grant on notebook_entry_notes', async () => {
		const { rows } = await db.sql<{ privilege_type: string; grantee: string }>(
			`select privilege_type, grantee from information_schema.role_table_grants
			 where table_schema = 'public' and table_name = 'notebook_entry_notes'
			   and grantee in ('authenticated', 'anon', 'PUBLIC')`
		);
		// SELECT to authenticated (0078) and nothing else: no insert, no update,
		// no delete, so `deleted_at` has no direct client write path.
		expect(rows.map((r) => `${r.grantee}:${r.privilege_type}`).sort()).toEqual([
			'authenticated:SELECT'
		]);
	});

	it('re-applies cleanly: a second paste is a no-op, not a duplicate-object error', async () => {
		const entry = await newEntry(ada, { sectionId: p1, submitted: true });
		await newPhoto(entry);
		const noteId = await addNote(ada, entry, 'survives a re-paste');
		await rpc(ada, `public.notebook_delete_note($1::uuid)`, [noteId]);

		const sql = readFileSync(
			join(process.cwd(), 'supabase/migrations/0119_notebook_note_delete.sql'),
			'utf8'
		);
		await db.sql(sql);
		await db.sql(sql);

		// The stamp survived (the column was not re-added and cleared), and the
		// functions still work.
		expect((await chain(noteId)).filter((r) => r.deleted_at !== null)).toHaveLength(1);
		await rpc(ada, `public.notebook_restore_note($1::uuid)`, [noteId]);
		expect((await chain(noteId)).filter((r) => r.deleted_at !== null)).toHaveLength(0);
	});
});

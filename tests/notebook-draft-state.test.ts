// tests/notebook-draft-state.test.ts
//
// 0118 gives a notebook entry a draft state: `submitted_at` null means the
// student has not turned it in, which makes it private to them. Three things
// here fail SILENTLY, and they are what this file is for.
//
//   1. THE BACKFILL. Every entry that existed before this migration was turned
//      in when it was made, and a row left null becomes invisible to every
//      instructor read AT ONCE -- a term of student work gone, with nothing
//      raised. It is asserted against a database booted on the chain WITHOUT
//      0118, filled with real entries through the real pre-0118 RPCs, and then
//      migrated -- which is the only way to see what the backfill did to rows
//      that already existed.
//   2. THE REFUSALS. Each is the only thing standing between a student and work
//      turned in by accident, pulled back after review, or acted on by somebody
//      who was never shown it. Every one looks like a working feature to
//      whoever is using it.
//   3. THE PRIVACY BOUNDARY, AND IT IS TWO SITES. The staff SELECT policy on
//      notebook_entries governs a direct read; notebook_can_read_entry governs
//      every delegated one -- the photos, the notes, the folder name, and the
//      Drive proxy. Fixing only the lists would leave a draft's pages fetchable
//      one at a time by id, which is a leak nothing on screen would show.
//
// EVERY EXCLUSION ASSERTION CARRIES A POSITIVE CONTROL and reports both counts
// (the 0116 convention). A scan reading the wrong property, or a fixture that
// never had the row it looks for, comes back clean -- and clean is the result
// nobody investigates. So each names the row that must be GONE and the row that
// must still be THERE, in the same assertion.

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
 * The chain the live project carries. 0091 (the activity view + pinned_at) and
 * 0099 + 0083 + 0053 (the view-as reader) are here for 0116's reason: the
 * payload has TWO callers and both have to be exercised rather than one assumed
 * to behave like the other.
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
	'0117_notebook_soft_delete_restore.sql',
	'0118_notebook_draft_state.sql'
] as const;

/** The same chain stopping one short: the world the backfill has to migrate. */
const PRE_DRAFT_CHAIN = CHAIN.filter((m) => m !== '0118_notebook_draft_state.sql');

const MIGRATION_0118 = readFileSync(
	fileURLToPath(new URL('../supabase/migrations/0118_notebook_draft_state.sql', import.meta.url)),
	'utf8'
);

let db: TestDb;

let owner: SeededUser; // the pinned admin (0067's admin_owner_email): the chair tier
let teacher: SeededUser; // teacher of record for P1
let otherTeacher: SeededUser; // teacher of record for P2, and nothing of P1
let ada: SeededUser; // student, enrolled in P1
let ben: SeededUser; // student, enrolled in P1 -- the control in every roster assertion

let p1: string;
let p2: string;
let session1: string; // the check-in the grid assertions measure

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function rpc<T>(user: SeededUser, call: string, params: unknown[] = []): Promise<T> {
	const { rows } = await db.asUser(user.id, (q) =>
		q<{ result: T }>(`select ${call} as result`, params)
	);
	return rows[0].result;
}

/** A photo entry through the REAL creating RPC, drafted or turned in. */
async function newEntry(
	student: SeededUser,
	opts: {
		submitted?: boolean;
		label?: string | null;
		sessionId?: string | null;
		sectionId?: string | null;
		file?: string;
	} = {}
): Promise<string> {
	const result = await rpc<{ entry_id: string }>(
		student,
		'public.notebook_create_entry($1, $2, $3, $4, $5, null, null, $6)',
		[
			student.id,
			opts.file ?? `drive-${Math.random().toString(36).slice(2)}`,
			opts.sessionId ?? null,
			opts.sectionId ?? null,
			opts.label ?? null,
			opts.submitted ?? true
		]
	);
	return result.entry_id;
}

async function submittedAt(entryId: string): Promise<Date | null> {
	const { rows } = await db.sql<{ submitted_at: Date | null }>(
		`select submitted_at from public.notebook_entries where id = $1`,
		[entryId]
	);
	return rows[0]?.submitted_at ?? null;
}

async function statusOf(entryId: string): Promise<string> {
	const { rows } = await db.sql<{ status: string }>(
		`select status from public.notebook_entries where id = $1`,
		[entryId]
	);
	return rows[0].status;
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
	return rpc<Grid>(as, 'public.notebook_get_section_grid($1, null)', [sectionId]);
}

interface Payload {
	entries: { id: string }[];
	deleted_entries: { id: string }[];
	activity: { id: string }[];
}

/** How many rows a caller can SELECT, as that caller -- RLS, not a definer read. */
async function visibleEntries(as: SeededUser, ids: string[]): Promise<string[]> {
	return db.asUser(as.id, async (q) => {
		const { rows } = await q<{ id: string }>(
			`select id from public.notebook_entries where id = any($1::uuid[]) order by id`,
			[ids]
		);
		return rows.map((r) => r.id);
	});
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	owner = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	teacher = await createUser(db, 'teacher@boscotech.edu', 'Terry Teacher');
	otherTeacher = await createUser(db, 'other@boscotech.edu', 'Olive Other');
	ada = await createUser(db, 'ada@boscotech.net', 'Ada Pike');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben Okafor');

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
	await enrollStudent(db, {
		as: teacher,
		sectionId: p1,
		email: ben.email,
		displayName: 'Okafor, Ben'
	});

	session1 = (
		await rpc<{ session_id: string }>(
			teacher,
			'public.notebook_admin_upsert_session($1::uuid[], $2, $3::date, $4)',
			[[p1], 1, '2026-08-10', 'Gearbox teardown']
		)
	).session_id;
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 1. The backfill, against a database that predates the column.
// ---------------------------------------------------------------------------

describe('the backfill', () => {
	let pre: TestDb;

	afterAll(async () => {
		await pre?.stop();
	});

	it('marks every pre-0118 entry as turned in, at its own upload stamp', async () => {
		pre = await startTestDb(PRE_DRAFT_CHAIN);

		const t = await createUser(pre, 'teacher@boscotech.edu', 'Terry Teacher');
		const s = await createUser(pre, 'student@boscotech.net', 'Sam Student');
		const sectionId = await createClassroomSection(pre, {
			as: t,
			courseCode: 'ENG1H',
			label: 'Period 2',
			teacherEmail: t.email
		});
		await enrollStudent(pre, {
			as: t,
			sectionId,
			email: s.email,
			displayName: 'Student, Sam'
		});
		const checkIn = (
			await pre.asUser(t.id, async (q) => {
				const { rows } = await q<{ result: { session_id: string } }>(
					'select public.notebook_admin_upsert_session($1::uuid[], $2, $3::date, $4) as result',
					[[sectionId], 2, '2026-07-01', 'Bearing teardown']
				);
				return rows[0].result;
			})
		).session_id;

		// Real work, through the REAL pre-0118 RPCs -- a photo entry against a
		// check-in, a free photo entry, and a written note. All three arities are
		// the pre-0118 ones, which is also what proves the drop-and-recreate in
		// section 2 does not need them.
		const ids: string[] = [];
		ids.push(
			(
				await pre.asUser(s.id, async (q) => {
					const { rows } = await q<{ result: { entry_id: string } }>(
						'select public.notebook_create_entry($1, $2, $3, $4, null, null) as result',
						[s.id, 'drive-pre-1', checkIn, sectionId]
					);
					return rows[0].result;
				})
			).entry_id
		);
		ids.push(
			(
				await pre.asUser(s.id, async (q) => {
					const { rows } = await q<{ result: { entry_id: string } }>(
						'select public.notebook_create_entry($1, $2, null, null, $3, null) as result',
						[s.id, 'drive-pre-2', 'Sketchbook page']
					);
					return rows[0].result;
				})
			).entry_id
		);
		ids.push(
			(
				await pre.asUser(s.id, async (q) => {
					const { rows } = await q<{ result: { entry_id: string } }>(
						'select public.notebook_create_note_entry($1::jsonb, $2, null, null) as result',
						[
							JSON.stringify([{ type: 'p', runs: [{ text: 'Preload measured at 0.004 in.' }] }]),
							'Bearing notes'
						]
					);
					return rows[0].result;
				})
			).entry_id
		);
		// One of them DELETED before the migration: a soft-deleted row is still a
		// row, and leaving it null would make it unrestorable into anything staff
		// could see.
		await pre.asUser(s.id, (q) => q('select public.notebook_delete_entry($1)', [ids[1]]));

		expect(ids).toHaveLength(3);
		// The column genuinely does not exist yet -- otherwise everything below is
		// asserting about a world that was never the "before".
		const before = await pre.sql<{ n: string }>(
			`select count(*)::text as n from information_schema.columns
			 where table_name = 'notebook_entries' and column_name = 'submitted_at'`
		);
		expect(before.rows[0].n).toBe('0');

		await pre.sql(MIGRATION_0118);

		const { rows } = await pre.sql<{
			id: string;
			submitted_at: Date | null;
			upload_timestamp: Date;
		}>(`select id, submitted_at, upload_timestamp from public.notebook_entries`);
		expect(rows).toHaveLength(3);
		// NOT ONE NULL, and each stamp is the entry's OWN upload time rather than
		// the minute the migration ran -- a now() backfill would rewrite the whole
		// history and any later reading of this column with it.
		expect(rows.filter((r) => r.submitted_at === null)).toHaveLength(0);
		for (const row of rows) {
			expect([row.id, row.submitted_at?.toISOString()]).toEqual([
				row.id,
				row.upload_timestamp.toISOString()
			]);
		}
	}, 180_000);

	it('leaves a DRAFT alone when the file is applied a second time', async () => {
		// The hazard the guard exists for: re-pasting a migration is ordinary
		// here, and an unguarded `where submitted_at is null` on the second run
		// would turn in every genuine draft in the school, silently.
		const draft = await newEntry(ada, { submitted: false, label: 'Still working' });
		const live = await newEntry(ada, { label: 'Turned in' });
		expect(await submittedAt(draft)).toBeNull();

		await db.sql(MIGRATION_0118);
		await db.sql(MIGRATION_0118);

		// GONE: nothing stamped the draft. THERE: the turned-in entry is untouched.
		expect(await submittedAt(draft)).toBeNull();
		expect(await submittedAt(live)).not.toBeNull();

		await db.sql('delete from public.notebook_entries where id = any($1::uuid[])', [
			[draft, live]
		]);
	}, 120_000);

	it('re-applying leaves exactly one signature of each re-signed function', async () => {
		for (const name of [
			'notebook_create_entry',
			'notebook_create_note_entry',
			'notebook_submit_entry',
			'notebook_unsubmit_entry',
			'notebook_can_read_entry',
			'notebook_remove_photo',
			'notebook_get_section_grid'
		]) {
			const { rows } = await db.sql<{ n: string }>(
				`select count(*)::text as n from pg_proc p
				 join pg_namespace ns on ns.oid = p.pronamespace
				 where ns.nspname = 'public' and p.proname = $1`,
				[name]
			);
			// A second overload is the silent-wrong-function trap: PostgREST
			// resolves by supplied argument NAMES, so a caller omitting the new
			// parameter would keep hitting the old body forever.
			expect([name, rows[0].n]).toEqual([name, '1']);
		}
	});
});

// ---------------------------------------------------------------------------
// 2. Creating a draft.
// ---------------------------------------------------------------------------

describe('the creating RPCs', () => {
	it('defaults to turned in, so every existing caller is unchanged', async () => {
		// Called with the PRE-0118 argument list: no p_submitted anywhere.
		const id = (
			await rpc<{ entry_id: string; submitted_at: string | null }>(
				ada,
				'public.notebook_create_entry($1, $2, null, null, $3, null)',
				[ada.id, 'drive-default', 'Default is turned in']
			)
		).entry_id;
		expect(await submittedAt(id)).not.toBeNull();
	});

	it('makes a draft when asked, for a photo entry and a note entry alike', async () => {
		const photo = await newEntry(ada, { submitted: false, label: 'Photo draft' });
		const note = (
			await rpc<{ entry_id: string }>(
				ada,
				'public.notebook_create_note_entry($1::jsonb, $2, null, null, null, false)',
				[JSON.stringify([{ type: 'p', runs: [{ text: 'Half a thought.' }] }]), 'Note draft']
			)
		).entry_id;
		expect(await submittedAt(photo)).toBeNull();
		expect(await submittedAt(note)).toBeNull();

		// The control: the same two calls with the default turn in.
		const liveNote = (
			await rpc<{ entry_id: string }>(
				ada,
				'public.notebook_create_note_entry($1::jsonb, $2, null, null)',
				[JSON.stringify([{ type: 'p', runs: [{ text: 'Finished.' }] }]), 'Note, turned in']
			)
		).entry_id;
		expect(await submittedAt(liveNote)).not.toBeNull();
	});

	it('reads an explicit null p_submitted as the default rather than as a draft', async () => {
		const id = (
			await rpc<{ entry_id: string }>(
				ada,
				'public.notebook_create_entry($1, $2, null, null, $3, null, null, null)',
				[ada.id, 'drive-explicit-null', 'Explicit null']
			)
		).entry_id;
		expect(await submittedAt(id)).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 3. notebook_submit_entry.
// ---------------------------------------------------------------------------

describe('notebook_submit_entry', () => {
	it('turns a draft in', async () => {
		const id = await newEntry(ada, { submitted: false, label: 'Ready now' });
		expect(await submittedAt(id)).toBeNull();
		const result = await rpc<{ ok: boolean }>(ada, 'public.notebook_submit_entry($1)', [id]);
		expect(result.ok).toBe(true);
		expect(await submittedAt(id)).not.toBeNull();
	});

	it('refuses an entry with nothing in it, counting LIVE photos only', async () => {
		// A draft whose only page was REMOVED (0116). Its photo row still exists,
		// so counting rows rather than live ones would let an empty entry through
		// onto an instructor's grid as if it were work.
		const id = await newEntry(ada, { submitted: false, label: 'Emptied draft' });
		const photoId = (
			await db.sql<{ id: string }>(
				`select id from public.notebook_entry_photos where entry_id = $1`,
				[id]
			)
		).rows[0].id;
		await rpc(ada, 'public.notebook_remove_photo($1)', [photoId]);
		expect(
			(
				await db.sql<{ n: string }>(
					`select count(*)::text as n from public.notebook_entry_photos where entry_id = $1`,
					[id]
				)
			).rows[0].n
		).toBe('1');

		await expect(
			rpc(ada, 'public.notebook_submit_entry($1)', [id])
		).rejects.toThrow(/nothing in it to turn in/i);
		expect(await submittedAt(id)).toBeNull();

		// THE POSITIVE CONTROL: put something back and the same call succeeds, so
		// the refusal is about the emptiness and not about this entry.
		await rpc(ada, 'public.notebook_add_note($1, $2::jsonb)', [
			id,
			JSON.stringify([{ type: 'p', runs: [{ text: 'Written instead.' }] }])
		]);
		await rpc(ada, 'public.notebook_submit_entry($1)', [id]);
		expect(await submittedAt(id)).not.toBeNull();
	});

	it('refuses a second submit', async () => {
		const id = await newEntry(ada, { label: 'Already in' });
		await expect(
			rpc(ada, 'public.notebook_submit_entry($1)', [id])
		).rejects.toThrow(/already been turned in/i);
	});

	it('refuses a non-owner, including the section instructor and the chair', async () => {
		const id = await newEntry(ada, { submitted: false, sectionId: p1, label: 'Ada only' });
		for (const stranger of [ben, teacher, owner, otherTeacher]) {
			await expect(
				rpc(stranger, 'public.notebook_submit_entry($1)', [id])
			).rejects.toThrow(/does not exist or is not yours/i);
		}
		// THERE: still a draft, and its owner can still turn it in.
		expect(await submittedAt(id)).toBeNull();
		await rpc(ada, 'public.notebook_submit_entry($1)', [id]);
		expect(await submittedAt(id)).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 4. notebook_unsubmit_entry.
// ---------------------------------------------------------------------------

describe('notebook_unsubmit_entry', () => {
	it('pulls a turned-in entry back to a draft', async () => {
		const id = await newEntry(ada, { label: 'Sent too early' });
		await rpc(ada, 'public.notebook_unsubmit_entry($1)', [id]);
		expect(await submittedAt(id)).toBeNull();
	});

	it('refuses once an instructor has reviewed it', async () => {
		const id = await newEntry(ada, { sectionId: p1, label: 'Reviewed' });
		await rpc(teacher, 'public.notebook_flag_entry($1, $2, $3)', [
			id,
			'illegible',
			'Hard to read.'
		]);
		await expect(
			rpc(ada, 'public.notebook_unsubmit_entry($1)', [id])
		).rejects.toThrow(/already reviewed/i);
		// THERE: still turned in, so nothing was half-done.
		expect(await submittedAt(id)).not.toBeNull();

		// THE CONTROL: an identical entry in the same class that was NOT reviewed
		// comes back fine, so the refusal is the review and not the class.
		const other = await newEntry(ada, { sectionId: p1, label: 'Not reviewed' });
		await rpc(ada, 'public.notebook_unsubmit_entry($1)', [other]);
		expect(await submittedAt(other)).toBeNull();
	});

	it('refuses an entry that is already a draft', async () => {
		const id = await newEntry(ada, { submitted: false, label: 'Never sent' });
		await expect(
			rpc(ada, 'public.notebook_unsubmit_entry($1)', [id])
		).rejects.toThrow(/has not been turned in/i);
	});

	it('refuses a non-owner', async () => {
		const id = await newEntry(ada, { sectionId: p1, label: 'Ada only, submitted' });
		for (const stranger of [ben, teacher, owner]) {
			await expect(
				rpc(stranger, 'public.notebook_unsubmit_entry($1)', [id])
			).rejects.toThrow(/does not exist or is not yours/i);
		}
		expect(await submittedAt(id)).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 5. Staff cannot act on a draft.
// ---------------------------------------------------------------------------

describe('the staff write path refuses a draft', () => {
	it('refuses to flag one, and flags the same entry once it is turned in', async () => {
		const id = await newEntry(ada, { submitted: false, sectionId: p1, label: 'Draft to flag' });
		await expect(
			rpc(teacher, 'public.notebook_flag_entry($1, $2, null)', [id, 'not_dated'])
		).rejects.toThrow(/has not been turned in/i);
		expect(await statusOf(id)).toBe('compliant');

		await rpc(ada, 'public.notebook_submit_entry($1)', [id]);
		await rpc(teacher, 'public.notebook_flag_entry($1, $2, null)', [id, 'not_dated']);
		expect(await statusOf(id)).toBe('flagged');
	});

	it('refuses to resolve one', async () => {
		const id = await newEntry(ada, { submitted: false, sectionId: p1, label: 'Draft to resolve' });
		await expect(
			rpc(teacher, 'public.notebook_resolve_entry($1, null)', [id])
		).rejects.toThrow(/has not been turned in/i);

		await rpc(ada, 'public.notebook_submit_entry($1)', [id]);
		await rpc(teacher, 'public.notebook_resolve_entry($1, null)', [id]);
		expect(await statusOf(id)).toBe('compliant');
	});

	it('refuses to staff-delete one, and says nothing about why', async () => {
		const id = await newEntry(ada, { submitted: false, sectionId: p1, label: 'Draft to delete' });
		// The message is the ordinary not-yours one on purpose: naming the draft
		// would confirm to a manager that a student is holding unturned-in work,
		// which is precisely what a draft is private about.
		await expect(
			rpc(teacher, 'public.notebook_staff_delete_entry($1)', [id])
		).rejects.toThrow(/does not exist, or is not in a class you manage/i);
		const { rows } = await db.sql<{ deleted_at: Date | null }>(
			`select deleted_at from public.notebook_entries where id = $1`,
			[id]
		);
		expect(rows[0].deleted_at).toBeNull();
		// And no audit row was written for something that did not happen.
		expect(
			(
				await db.sql<{ n: string }>(
					`select count(*)::text as n from public.notebook_admin_log where entry_id = $1`,
					[id]
				)
			).rows[0].n
		).toBe('0');

		// THE CONTROL: the same entry, turned in, deletes and logs.
		await rpc(ada, 'public.notebook_submit_entry($1)', [id]);
		await rpc(teacher, 'public.notebook_staff_delete_entry($1)', [id]);
		expect(
			(
				await db.sql<{ deleted_at: Date | null }>(
					`select deleted_at from public.notebook_entries where id = $1`,
					[id]
				)
			).rows[0].deleted_at
		).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 6. The shell guard relaxes for drafts only.
// ---------------------------------------------------------------------------

describe('emptying an entry', () => {
	it('lets a DRAFT be emptied, so a wrong page can be replaced', async () => {
		const id = await newEntry(ada, { submitted: false, label: 'Wrong page' });
		const photoId = (
			await db.sql<{ id: string }>(
				`select id from public.notebook_entry_photos where entry_id = $1`,
				[id]
			)
		).rows[0].id;
		await rpc(ada, 'public.notebook_remove_photo($1)', [photoId]);
		expect(
			(
				await db.sql<{ n: string }>(
					`select count(*)::text as n from public.notebook_entry_photos
					 where entry_id = $1 and removed_at is null`,
					[id]
				)
			).rows[0].n
		).toBe('0');
	});

	it('still refuses to empty a TURNED-IN entry', async () => {
		const id = await newEntry(ada, { label: 'Turned in, one page' });
		const photoId = (
			await db.sql<{ id: string }>(
				`select id from public.notebook_entry_photos where entry_id = $1`,
				[id]
			)
		).rows[0].id;
		await expect(
			rpc(ada, 'public.notebook_remove_photo($1)', [photoId])
		).rejects.toThrow(/only thing in this entry/i);

		// THE DISCRIMINATOR: pull the SAME entry back to a draft and the identical
		// call succeeds, so what changed is the state and not the photo.
		await rpc(ada, 'public.notebook_unsubmit_entry($1)', [id]);
		await rpc(ada, 'public.notebook_remove_photo($1)', [photoId]);
	});
});

// ---------------------------------------------------------------------------
// 7. THE PRIVACY BOUNDARY, at the RLS layer.
// ---------------------------------------------------------------------------

describe('a draft is private, at both read sites', () => {
	let draft: string;
	let live: string;
	let draftPhoto: string;
	let livePhoto: string;
	let draftNote: string;

	beforeAll(async () => {
		draft = await newEntry(ada, { submitted: false, sectionId: p1, label: 'Private draft' });
		live = await newEntry(ada, { sectionId: p1, label: 'Turned in beside it' });
		draftPhoto = (
			await db.sql<{ id: string }>(
				`select id from public.notebook_entry_photos where entry_id = $1`,
				[draft]
			)
		).rows[0].id;
		livePhoto = (
			await db.sql<{ id: string }>(
				`select id from public.notebook_entry_photos where entry_id = $1`,
				[live]
			)
		).rows[0].id;
		draftNote = (
			await rpc<{ note_id: string }>(ada, 'public.notebook_add_note($1, $2::jsonb)', [
				draft,
				JSON.stringify([{ type: 'p', runs: [{ text: 'Private thinking.' }] }])
			])
		).note_id;
	});

	it('the ENTRY itself is unreadable by staff and readable by its owner', async () => {
		// The POLICY, which governs a direct select. GONE: the draft. THERE: the
		// turned-in entry beside it, so this is not simply an empty read.
		for (const staff of [teacher, owner]) {
			expect([staff.email, await visibleEntries(staff, [draft, live])]).toEqual([
				staff.email,
				[live]
			]);
		}
		const forOwner = await visibleEntries(ada, [draft, live]);
		expect(forOwner.sort()).toEqual([draft, live].sort());
	});

	it('an AUTOSAVED draft -- the note door, no photo -- is invisible at the same gate', async () => {
		// THE SHAPE THE COMPOSER'S AUTOSAVE WRITES. It never uploads a photo, so
		// its first write is always notebook_create_note_entry with p_submitted
		// false, and every later one is notebook_edit_note on the chain that
		// created. The photo-door draft above proves the gate; this proves the
		// gate is the one the autosave lands behind, because an entry that
		// appears the moment somebody types is only acceptable if nobody else
		// can see it.
		const typed = (
			await rpc<{ entry_id: string; note_id: string }>(
				ada,
				'public.notebook_create_note_entry($1::jsonb, $2, null, null, null, $3)',
				[
					JSON.stringify([{ type: 'p', runs: [{ text: 'Half a sentence, mid-thought.' }] }]),
					'Autosaved while typing',
					false
				]
			)
		).entry_id;
		// A second autosave, exactly as the composer makes it: an EDIT of the
		// same chain, not another note. The entry must still be one draft.
		await rpc(ada, 'public.notebook_edit_note($1, $2::jsonb)', [
			(
				await db.sql<{ note_id: string }>(
					`select note_id from public.notebook_entry_notes where entry_id = $1`,
					[typed]
				)
			).rows[0].note_id,
			JSON.stringify([{ type: 'p', runs: [{ text: 'Half a sentence, finished.' }] }])
		]);
		const { rows: chains } = await db.sql<{ n: string }>(
			`select count(distinct note_id) as n from public.notebook_entry_notes where entry_id = $1`,
			[typed]
		);
		expect(chains[0].n).toBe('1');
		expect(await submittedAt(typed)).toBeNull();

		const can = (as: SeededUser, id: string) =>
			rpc<boolean>(as, 'public.notebook_can_read_entry($1)', [id]);
		// GONE: the autosaved draft. THERE: `live`, turned in by the same student
		// in the same section -- the positive control, so a gate answering false
		// to everything (or a fixture with no readable row in it) cannot pass this.
		expect([await can(teacher, typed), await can(teacher, live)]).toEqual([false, true]);
		expect([await can(owner, typed), await can(owner, live)]).toEqual([false, true]);
		expect([await can(ada, typed), await can(ada, live)]).toEqual([true, true]);

		// And the same answer at the OTHER read site, the policy itself.
		expect(await visibleEntries(teacher, [typed, live])).toEqual([live]);
		expect((await visibleEntries(ada, [typed, live])).sort()).toEqual([typed, live].sort());

		// THE WORDS THEMSELVES, one delegated read down. The positive control is
		// its OWN turned-in note entry rather than `live`, which the tests below
		// assert has no notes on it: a control that mutates shared fixture state
		// is a control that breaks the next assertion instead of proving this one.
		const turnedIn = (
			await rpc<{ entry_id: string }>(
				ada,
				'public.notebook_create_note_entry($1::jsonb, $2, null, null, null, $3)',
				[
					JSON.stringify([{ type: 'p', runs: [{ text: 'Written and handed in.' }] }]),
					'Turned in beside the autosaved one',
					true
				]
			)
		).entry_id;
		const noteRows = (as: SeededUser, entryId: string) =>
			db.asUser(as.id, async (q) => {
				const { rows } = await q<{ id: string }>(
					`select id from public.notebook_entry_notes where entry_id = $1`,
					[entryId]
				);
				return rows.length;
			});
		// GONE: both revisions of the autosaved draft. THERE: the turned-in one.
		expect([await noteRows(teacher, typed), await noteRows(teacher, turnedIn)]).toEqual([0, 1]);
		// The owner reads the whole chain, revisions and all -- two of them,
		// because an edit APPENDS rather than replacing.
		expect(await noteRows(ada, typed)).toBe(2);
	});

	it('notebook_can_read_entry says the same thing', async () => {
		// The FUNCTION, which governs every delegated read -- and the two must not
		// be able to disagree, which is why 0118 recreates both.
		const can = (as: SeededUser, id: string) =>
			rpc<boolean>(as, 'public.notebook_can_read_entry($1)', [id]);
		expect([await can(teacher, draft), await can(teacher, live)]).toEqual([false, true]);
		expect([await can(owner, draft), await can(owner, live)]).toEqual([false, true]);
		expect([await can(ada, draft), await can(ada, live)]).toEqual([true, true]);
	});

	it('a staff select against the draft PHOTOS returns zero rows', async () => {
		// The leak this closes: excluding a draft from the grid and the payload
		// but leaving its pages readable by id would let them be fetched one at a
		// time through /api/notebook/photo/[photo_id], which authorizes through
		// exactly this policy.
		const seen = await db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ id: string }>(
				`select id from public.notebook_entry_photos where id = any($1::uuid[])`,
				[[draftPhoto, livePhoto]]
			);
			return rows.map((r) => r.id);
		});
		expect(seen).toEqual([livePhoto]);

		// THE OWNER'S CONTROL: both of their own photos are readable.
		const mine = await db.asUser(ada.id, async (q) => {
			const { rows } = await q<{ id: string }>(
				`select id from public.notebook_entry_photos where id = any($1::uuid[])`,
				[[draftPhoto, livePhoto]]
			);
			return rows.map((r) => r.id);
		});
		expect(mine.sort()).toEqual([draftPhoto, livePhoto].sort());
	});

	it('a staff select against the draft NOTES returns zero rows', async () => {
		const seen = await db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ entry_id: string }>(
				`select entry_id from public.notebook_entry_notes where entry_id = any($1::uuid[])`,
				[[draft, live]]
			);
			return rows.map((r) => r.entry_id);
		});
		expect(seen).toEqual([]);
		expect(draftNote).toBeTruthy();

		const mine = await db.asUser(ada.id, async (q) => {
			const { rows } = await q<{ id: string }>(
				`select id from public.notebook_entry_notes where entry_id = $1`,
				[draft]
			);
			return rows.map((r) => r.id);
		});
		expect(mine).toEqual([draftNote]);
	});

	it('the photo proxy answers 404 for a draft and gets past the gate for the turned-in one', async () => {
		// Driven through the REAL shipped route handler, so this is the answer a
		// browser gets rather than what the policy says in isolation.
		//
		// THE THREE DRIVE ENV VARS ARE SET FIRST, and that is not incidental: the
		// route answers 503 on an unconfigured Drive BEFORE it ever reads the row,
		// so without them BOTH cases would come back 503 and the assertion would
		// be measuring nothing. Configured, the read runs -- and since there is no
		// Drive to reach, an ALLOWED photo fails downstream with a 502, which is
		// exactly the distinction this test is about: 404 means "you may not see
		// this", anything else means the gate let it through.
		process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id';
		process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
		process.env.GOOGLE_DRIVE_REFRESH_TOKEN = 'test-refresh-token';
		const { GET } = await import('../src/routes/api/notebook/photo/[photo_id]/+server');

		/**
		 * The one query the route makes, translated to SQL under the caller's own
		 * session. The `notebook_entries!inner(id)` embed is a real INNER JOIN,
		 * which is what it means -- PostgREST applies RLS to an embedded resource,
		 * so an entry the caller cannot read collapses the join and drops the
		 * photo row. That is the mechanism a draft is caught by.
		 */
		const call = (as: SeededUser, photoId: string) =>
			(GET as unknown as (event: unknown) => Promise<Response>)({
				params: { photo_id: photoId },
				url: new URL(`http://localhost/api/notebook/photo/${photoId}`),
				locals: {
					supabase: {
						from: (table: string) => {
							expect(table).toBe('notebook_entry_photos');
							return {
								select: (columns: string) => {
									expect(columns).toContain('notebook_entries!inner');
									return {
										eq: (column: string, value: string) => {
											expect(column).toBe('id');
											return {
												maybeSingle: async () =>
													db.asUser(as.id, async (q) => {
														const { rows } = await q<{ drive_file_id: string }>(
															`select p.drive_file_id
															   from public.notebook_entry_photos p
															   join public.notebook_entries e on e.id = p.entry_id
															  where p.id = $1`,
															[value]
														);
														return { data: rows[0] ?? null, error: null };
													})
											};
										}
									};
								}
							};
						}
					},
					claims: { sub: as.id, email: as.email, role: 'authenticated' }
				}
			});

		const denied = await call(teacher, draftPhoto);
		expect(denied.status).toBe(404);
		// THE CONTROL: same caller, same route, the turned-in photo beside it.
		const allowed = await call(teacher, livePhoto);
		expect(allowed.status).not.toBe(404);
		// And the owner is never refused their own draft's page.
		const mine = await call(ada, draftPhoto);
		expect(mine.status).not.toBe(404);

		delete process.env.GOOGLE_OAUTH_CLIENT_ID;
		delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
		delete process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
	});
});

// ---------------------------------------------------------------------------
// 8. The exclusion sweep, and the round trip through it.
// ---------------------------------------------------------------------------

describe('the exclusion sweep', () => {
	let draft: string;
	let live: string;

	beforeAll(async () => {
		// Ada holds one draft and one turned-in entry against the SAME check-in in
		// the SAME class, which is what makes every assertion below a comparison
		// rather than an empty read. Ben holds nothing: he is the roster control.
		live = await newEntry(ada, {
			sectionId: p1,
			sessionId: session1,
			label: null,
			file: 'drive-sweep-live'
		});
		draft = await newEntry(ada, {
			submitted: false,
			sectionId: p1,
			label: 'Sweep draft',
			file: 'drive-sweep-draft'
		});
	});

	it('the grid counts the turned-in entry and not the draft', async () => {
		// `free_entries` is measured as a DELTA rather than an absolute, because
		// earlier cases in this file have left Ada holding other work in P1 -- and
		// an absolute number would silently start measuring that instead. Turning
		// the draft in must move it by exactly one; the draft existing must not
		// move it at all.
		const before = (await grid(teacher, p1)).students.find(
			(s) => s.student_key === ada.email
		)!.free_entries;
		await rpc(ada, 'public.notebook_submit_entry($1)', [draft]);
		const after = (await grid(teacher, p1)).students.find(
			(s) => s.student_key === ada.email
		)!.free_entries;
		expect(after - before).toBe(1);
		await rpc(ada, 'public.notebook_unsubmit_entry($1)', [draft]);
		const back = (await grid(teacher, p1)).students.find(
			(s) => s.student_key === ada.email
		)!.free_entries;
		expect(back).toBe(before);

		// THERE: the turned-in entry holds the check-in cell throughout.
		const cell = (await grid(teacher, p1)).cells.find(
			(c) => c.student_key === ada.email && c.session_id === session1
		)!;
		expect([cell.entry_id, cell.entry_count, cell.status]).toEqual([live, 1, 'compliant']);
	});

	it('a student holding ONLY a draft reads as missing', async () => {
		// The headline: a draft is not presence. Ben's entry is unlinked, so his
		// check-in cell must stay missing whatever he is holding.
		const benDraft = await newEntry(ben, {
			submitted: false,
			sectionId: p1,
			sessionId: session1,
			file: 'drive-ben-draft'
		});
		const g = await grid(teacher, p1);
		const cell = g.cells.find((c) => c.student_key === ben.email && c.session_id === session1)!;
		expect([cell.status, cell.entry_id, cell.entry_count]).toEqual(['missing', null, 0]);

		// THE ROUND TRIP: turn it in and the same cell fills, exactly where a
		// directly-created entry would have put it.
		await rpc(ben, 'public.notebook_submit_entry($1)', [benDraft]);
		const after = await grid(teacher, p1);
		const filled = after.cells.find(
			(c) => c.student_key === ben.email && c.session_id === session1
		)!;
		expect([filled.status, filled.entry_id, filled.entry_count]).toEqual([
			'compliant',
			benDraft,
			1
		]);

		// AND BACK: unsubmitting empties it again.
		await rpc(ben, 'public.notebook_unsubmit_entry($1)', [benDraft]);
		const back = await grid(teacher, p1);
		const empty = back.cells.find(
			(c) => c.student_key === ben.email && c.session_id === session1
		)!;
		expect([empty.status, empty.entry_id, empty.entry_count]).toEqual(['missing', null, 0]);
	});

	it('the roster does not put a departed student back on it for a draft', async () => {
		// Carol is on nobody's roster. A DRAFT in P1 must not make her a holder;
		// a turned-in entry must.
		const carol = await createUser(db, 'carol@boscotech.net', 'Carol Reyes');
		const carolDraft = await newEntry(carol, {
			submitted: false,
			sectionId: p1,
			label: 'Not in the class'
		});

		const before = await grid(teacher, p1);
		expect(before.students.map((s) => s.student_key)).not.toContain(carol.email);
		// THERE: the two enrolled students are on it, so the roster is not simply
		// coming back empty.
		expect(before.students.map((s) => s.student_key).sort()).toEqual(
			[ada.email, ben.email].sort()
		);

		await rpc(carol, 'public.notebook_submit_entry($1)', [carolDraft]);
		const after = await grid(teacher, p1);
		expect(after.students.map((s) => s.student_key)).toContain(carol.email);
	});

	it('the student payload skips a draft, through BOTH of its callers', async () => {
		const viaReview = await rpc<Payload>(
			teacher,
			'public.notebook_review_student_notebook($1)',
			[ada.email]
		);
		const viaViewAs = await rpc<Payload>(owner, 'public.notebook_view_as_notebook($1)', [
			ada.email
		]);
		for (const [name, payload] of [
			['review', viaReview],
			['view-as', viaViewAs]
		] as const) {
			const ids = payload.entries.map((e) => e.id);
			// GONE and THERE, in one assertion, for each caller.
			expect([name, ids.includes(draft), ids.includes(live)]).toEqual([name, false, true]);
			// The activity list is the same rows and must agree with them.
			const activity = payload.activity.map((a) => a.id);
			expect([name, activity.includes(draft), activity.includes(live)]).toEqual([
				name,
				false,
				true
			]);
		}
	});

	it('the payload skips a DELETED draft in deleted_entries too', async () => {
		const deletedDraft = await newEntry(ada, {
			submitted: false,
			sectionId: p1,
			label: 'Deleted draft'
		});
		const deletedLive = await newEntry(ada, { sectionId: p1, label: 'Deleted, turned in' });
		await rpc(ada, 'public.notebook_delete_entry($1)', [deletedDraft]);
		await rpc(ada, 'public.notebook_delete_entry($1)', [deletedLive]);

		const payload = await rpc<Payload>(teacher, 'public.notebook_review_student_notebook($1)', [
			ada.email
		]);
		const ids = payload.deleted_entries.map((e) => e.id);
		expect([ids.includes(deletedDraft), ids.includes(deletedLive)]).toEqual([false, true]);
	});

	it('the detach count names the turned-in entries only', async () => {
		// A check-in of its own so the count is unambiguous: one draft, one
		// turned-in entry, both filed against it.
		const session = (
			await rpc<{ session_id: string }>(
				teacher,
				'public.notebook_admin_upsert_session($1::uuid[], $2, $3::date, $4)',
				[[p1], 9, '2026-09-01', 'Detach test']
			)
		).session_id;
		await newEntry(ada, {
			sectionId: p1,
			sessionId: session,
			file: 'drive-detach-live'
		});
		const detachDraft = await newEntry(ben, {
			submitted: false,
			sectionId: p1,
			sessionId: session,
			file: 'drive-detach-draft'
		});

		const result = await rpc<{ ok: boolean; detached_entries: number }>(
			teacher,
			'public.notebook_admin_delete_session($1)',
			[session]
		);
		// The number a teacher READS: one, not two.
		expect(result.detached_entries).toBe(1);
		// THERE: the draft was still detached, because the composite key demands
		// it -- only the count left it out.
		const { rows } = await db.sql<{ session_id: string | null }>(
			`select session_id from public.notebook_entries where id = $1`,
			[detachDraft]
		);
		expect(rows[0].session_id).toBeNull();
	});

	it('a student’s own folder count still includes their drafts', async () => {
		// The mirror of the assertion above, and the reason the two differ: this
		// number is shown to the STUDENT deleting their own folder, and their
		// drafts are theirs and are about to be unfiled.
		const folder = (
			await rpc<{ folder_id: string }>(ada, 'public.notebook_upsert_folder($1, $2, $3)', [
				'Drafts folder',
				'gold',
				null
			])
		).folder_id;
		const a = await newEntry(ada, { submitted: false, label: 'In the folder, draft' });
		const b = await newEntry(ada, { label: 'In the folder, turned in' });
		await rpc(ada, 'public.notebook_move_entries($1::uuid[], $2)', [[a, b], folder]);

		const result = await rpc<{ unfiled_entries: number }>(
			ada,
			'public.notebook_delete_folder($1)',
			[folder]
		);
		expect(result.unfiled_entries).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// 9. 0116 AND 0117'S OWN GUARANTEES, RE-CHECKED WITH 0118 APPLIED.
//
// Adding a second reason to hide a row is exactly where the first one gets
// quietly relaxed: 0118 recreates the grid, the roster, the payload and
// notebook_remove_photo from 0116's and 0117's bodies, and a clause dropped in
// the copying would not fail anything those two suites run -- their chains stop
// short of this migration, so they are testing a world where 0118 does not
// exist.
//
// THEY ARE NOT MODIFIED, AND THEIR CHAINS ARE DELIBERATELY LEFT ALONE. 0116's
// suite re-applies 0116's own file to prove it is re-runnable, which on a
// database carrying 0118 would revert every function 0118 recreated and leave
// the rest of that file passing against a half-reverted schema -- a test that
// certifies the opposite of what it says. So the cross-check lives here, where
// the chain is the real one.
// ---------------------------------------------------------------------------

describe('0116 and 0117 still hold with 0118 applied', () => {
	it('a DELETED entry is still excluded from the grid, roster and payload', async () => {
		const deleted = await newEntry(ada, { sectionId: p1, label: 'Deleted, turned in' });
		const kept = await newEntry(ada, { sectionId: p1, label: 'Kept, turned in' });
		const before = (await grid(teacher, p1)).students.find(
			(s) => s.student_key === ada.email
		)!.free_entries;
		await rpc(ada, 'public.notebook_delete_entry($1)', [deleted]);
		const after = (await grid(teacher, p1)).students.find(
			(s) => s.student_key === ada.email
		)!.free_entries;
		// GONE from the count, and THERE is the one beside it that must not move.
		expect(after).toBe(before - 1);

		const payload = await rpc<Payload>(teacher, 'public.notebook_review_student_notebook($1)', [
			ada.email
		]);
		const ids = payload.entries.map((e) => e.id);
		expect([ids.includes(deleted), ids.includes(kept)]).toEqual([false, true]);
		// 0117's own key still carries it.
		expect(payload.deleted_entries.map((e) => e.id)).toContain(deleted);
	});

	it('a REMOVED photo is still excluded from the payload', async () => {
		const id = await newEntry(ada, { sectionId: p1, label: 'Two pages' });
		const second = (
			await rpc<{ photo_id: string }>(ada, 'public.notebook_add_photo($1, $2, $3, null)', [
				id,
				'drive-second-page',
				'original'
			])
		).photo_id;
		const first = (
			await db.sql<{ id: string }>(
				`select id from public.notebook_entry_photos
				 where entry_id = $1 and id <> $2`,
				[id, second]
			)
		).rows[0].id;
		await rpc(ada, 'public.notebook_remove_photo($1)', [second]);

		const payload = await rpc<{ entries: { id: string; photos: { id: string }[] }[] }>(
			teacher,
			'public.notebook_review_student_notebook($1)',
			[ada.email]
		);
		const entry = payload.entries.find((e) => e.id === id)!;
		const photoIds = entry.photos.map((p) => p.id);
		expect([photoIds.includes(second), photoIds.includes(first)]).toEqual([false, true]);
	});

	it('0116 and 0117 refusals still refuse', async () => {
		const mine = await newEntry(ada, { sectionId: p1, label: 'Ada owns this' });
		// 0116: a student cannot delete somebody else's entry.
		await expect(
			rpc(ben, 'public.notebook_delete_entry($1)', [mine])
		).rejects.toThrow(/does not exist or is not yours/i);
		// 0116: a REVIEWED entry cannot be self-deleted.
		await rpc(teacher, 'public.notebook_resolve_entry($1, null)', [mine]);
		await expect(
			rpc(ada, 'public.notebook_delete_entry($1)', [mine])
		).rejects.toThrow(/instructor/i);
		// 0117: restoring one that is not deleted.
		await expect(
			rpc(ada, 'public.notebook_restore_entry($1)', [mine])
		).rejects.toThrow(/has not been deleted/i);
	});
});

// ---------------------------------------------------------------------------
// 10. The boundary: no client write path, and no anon reach.
// ---------------------------------------------------------------------------

describe('the write boundary', () => {
	it('no student, teacher or admin can write submitted_at directly', async () => {
		const id = await newEntry(ada, { submitted: false, sectionId: p1, label: 'No direct write' });
		for (const user of [ada, teacher, owner]) {
			await expect(
				db.asUser(user.id, (q) =>
					q(`update public.notebook_entries set submitted_at = now() where id = $1`, [id])
				)
			).rejects.toThrow(/permission denied/i);
		}
		expect(await submittedAt(id)).toBeNull();
	});

	it('anon holds no execute grant on either new RPC', async () => {
		for (const sig of [
			'public.notebook_submit_entry(uuid)',
			'public.notebook_unsubmit_entry(uuid)'
		]) {
			const { rows } = await db.sql<{ ok: boolean }>(
				`select has_function_privilege('anon', $1, 'execute') as ok`,
				[sig]
			);
			expect([sig, rows[0].ok]).toEqual([sig, false]);
		}
	});

	it('a signed-out caller cannot reach notebook_entries at all', async () => {
		// Stronger than "sees no drafts": `anon` holds no SELECT grant on the
		// table, so a signed-out probe is refused before RLS is even consulted.
		// Asserted as the privilege rather than as a thrown query, so it stays
		// true whatever an unrelated policy does later.
		const { rows } = await db.sql<{ ok: boolean }>(
			`select has_table_privilege('anon', 'public.notebook_entries', 'select') as ok`
		);
		expect(rows[0].ok).toBe(false);
		await expect(
			db.asAnon((q) => q(`select id from public.notebook_entries`))
		).rejects.toThrow(/permission denied/i);
	});
});

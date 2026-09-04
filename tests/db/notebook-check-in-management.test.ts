// tests/db/notebook-check-in-management.test.ts
//
// EDITING, RESCHEDULING AND DELETING A CHECK-IN THAT STUDENTS HAVE ALREADY
// ANSWERED, against the real RPCs.
//
// This bundle changed no SQL. What it changed is what a teacher is TOLD before
// they press one of these, and every sentence it now renders is a claim about
// what these functions do to work that already exists. A sentence that is
// wrong is worse than no sentence -- "entries are kept and relabelled" printed
// over a cascade would be an instruction to destroy a term of work -- so the
// claims are asserted here, against the deployed functions, rather than read
// off their headers.
//
// THE THREE CONTROLS THE BUNDLE OWES, and where each one is:
//
//   1. A STUDENT ANSWERS, THE INSTRUCTOR EDITS, AND THE ANSWER IS STILL THE
//      ANSWER (section 2). The link is asserted by ID on both sides, and the
//      mutation that breaks it deliberately is section 2's last case.
//
//   2. A NON-INSTRUCTOR IS REFUSED EACH OPERATION (section 4), with the
//      permissive mutation -- the caller made a manager -- confirming each
//      refusal flips to allowed. A refusal that would pass on a broken guard is
//      not a refusal that was tested.
//
//   3. DELETE WITH ANSWERS PRESENT DOES WHAT THE SURFACE SAYS (section 3), not
//      what its header says: entries survive, are detached, are relabelled, and
//      keep their photos and notes -- and the EXCUSALS do not survive, which is
//      the half nothing on screen used to mention.
//
// WHY THE COUNTS ARE ASSERTED FROM THE GRID RATHER THAN FROM A SECOND WALK.
// The client counts what is filed against a check-in off
// `notebook_get_section_grid`'s own cells, because that is the payload already
// on screen. So the number a teacher reads is the number this RPC produces, and
// section 5 pins the two together -- a hand-written `select count(*)` here
// would be a third opinion, and the one that quietly stops matching.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SectionGrid } from '$lib/notebook-review';
import {
	checkInEditKind,
	checkInLoadIndex,
	checkInLoad
} from '$lib/notebook/admin-actions';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './harness';

/**
 * The chain the live project carries through the check-in surface. 0137 goes
 * LAST, as the sweep over whatever the chain above it created.
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
	'0118_notebook_draft_state.sql',
	'0119_notebook_note_delete.sql',
	'0121_notebook_review_acknowledged.sql',
	'0137_anon_execute_sweep.sql'
] as const;

const MIGRATION_0140 = readFileSync(
	fileURLToPath(
		new URL('../../supabase/migrations/0140_notebook_scheduled_check_ins.sql', import.meta.url)
	),
	'utf8'
);

let db: TestDb;
let owner: SeededUser;
let teacher: SeededUser;
let stranger: SeededUser; // a teacher of NO section here -- the refusal control
let ada: SeededUser;
let ben: SeededUser;
let cara: SeededUser;
let p1 = '';

async function rpc<T>(user: SeededUser, call: string, params: unknown[] = []): Promise<T> {
	const { rows } = await db.asUser(user.id, (q) =>
		q<{ result: T }>(`select ${call} as result`, params)
	);
	return rows[0].result;
}

async function createSession(date: string, label: string, unit = 3): Promise<string> {
	const result = await rpc<{ session_id: string }>(
		teacher,
		'public.notebook_admin_upsert_session($1::uuid[], $2, $3, $4)',
		[[p1], unit, date, label]
	);
	return result.session_id;
}

/** A turned-in photo entry through the REAL creating RPC, as the student. */
async function fileEntry(student: SeededUser, sessionId: string): Promise<string> {
	const result = await rpc<{ entry_id: string }>(
		student,
		'public.notebook_create_entry($1, $2, $3, $4, null, null, null, true)',
		[student.id, `drive-${Math.random().toString(36).slice(2)}`, sessionId, p1]
	);
	return result.entry_id;
}

const grid = (as: SeededUser, unit: number | null = 3): Promise<SectionGrid> =>
	rpc<SectionGrid>(as, 'public.notebook_get_section_grid($1, $2::integer)', [p1, unit]);

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	await db.sql(MIGRATION_0140);

	owner = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	teacher = await createUser(db, 'ines.tructor@boscotech.edu', 'Ines Tructor');
	stranger = await createUser(db, 'else.where@boscotech.edu', 'Else Where');
	ada = await createUser(db, 'ada@boscotech.net', 'Ada Lovelace');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben Okafor');
	cara = await createUser(db, 'cara@boscotech.net', 'Cara Diaz');

	p1 = await createClassroomSection(db, {
		as: owner,
		courseCode: 'IDEA209H',
		courseTitle: 'Engineering I Honors',
		label: 'Period 1',
		teacherEmail: teacher.email
	});
	for (const s of [ada, ben, cara]) {
		await enrollStudent(db, { as: teacher, sectionId: p1, email: s.email, displayName: s.email });
	}
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 1. The RPCs the surface calls exist at the arity it calls them at.
//
// The bundle's whole premise is that no migration is needed, which is a claim
// about these signatures. If it is wrong, everything below is testing
// something else.
// ---------------------------------------------------------------------------

describe('the edit and delete the surface calls are the deployed ones', () => {
	it('upsert takes the trailing id that turns a create into an edit', async () => {
		const { rows } = await db.sql<{ args: string }>(
			`select pg_get_function_arguments(p.oid) as args
			   from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
			  where ns.nspname = 'public' and p.proname = 'notebook_admin_upsert_session'`
		);
		// The signature trap: exactly one arity, so no old overload can be
		// silently answering an edit as a create.
		expect(rows).toHaveLength(1);
		expect(rows[0].args).toBe(
			'p_section_ids uuid[], p_unit_number integer, p_session_date date, ' +
				'p_session_label text, p_id uuid DEFAULT NULL::uuid'
		);
	});

	it('delete exists and takes one session', async () => {
		const { rows } = await db.sql<{ args: string }>(
			`select pg_get_function_identity_arguments(p.oid) as args
			   from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
			  where ns.nspname = 'public' and p.proname = 'notebook_admin_delete_session'`
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].args).toBe('p_session_id uuid');
	});
});

// ---------------------------------------------------------------------------
// 2. CONTROL 1. A student answers, the instructor edits, and the answer is
//    still attached to what they actually answered.
// ---------------------------------------------------------------------------

describe('control 1: an edit never re-points a student answer', () => {
	let session = '';
	let adaEntry = '';

	beforeAll(async () => {
		session = await createSession('2026-09-01', 'Bearing teardown');
		adaEntry = await fileEntry(ada, session);
	});

	it('a rename leaves the entry on the same check-in, owned by the same student', async () => {
		await rpc(teacher, 'public.notebook_admin_upsert_session($1::uuid[], $2, $3, $4, $5)', [
			[p1],
			3,
			'2026-09-01',
			'Bearing teardown (corrected)',
			session
		]);

		const { rows } = await db.sql<{ session_id: string; student_id: string; deleted_at: string | null }>(
			'select session_id, student_id, deleted_at from public.notebook_entries where id = $1',
			[adaEntry]
		);
		expect(rows).toHaveLength(1);
		// THE LINK ITSELF, by id, on both sides. This is the assertion the
		// bundle's central promise rests on: the entry is still filed against
		// THIS check-in and is still Ada's.
		expect(rows[0].session_id).toBe(session);
		expect(rows[0].student_id).toBe(ada.id);
		expect(rows[0].deleted_at).toBeNull();

		// And the check-in really did change, so the case is not passing because
		// nothing happened.
		const { rows: after } = await db.sql<{ session_label: string }>(
			'select session_label from public.notebook_sessions where id = $1',
			[session]
		);
		expect(after[0].session_label).toBe('Bearing teardown (corrected)');
	});

	it('a reschedule leaves it attached too, and moves only the day', async () => {
		await rpc(teacher, 'public.notebook_admin_upsert_session($1::uuid[], $2, $3, $4, $5)', [
			[p1],
			3,
			'2026-09-08',
			'Bearing teardown (corrected)',
			session
		]);
		const { rows } = await db.sql<{ session_id: string }>(
			'select session_id from public.notebook_entries where id = $1',
			[adaEntry]
		);
		expect(rows[0].session_id).toBe(session);
		const { rows: s } = await db.sql<{ session_date: string; session_label: string }>(
			`select session_date::text as session_date, session_label
			   from public.notebook_sessions where id = $1`,
			[session]
		);
		expect(s[0].session_date).toBe('2026-09-08');
		expect(s[0].session_label).toBe('Bearing teardown (corrected)');
	});

	it('MUTATION: dropping the class from the edit DOES break the link, which is why the form never does', async () => {
		// THE DELIBERATE BREAK, and it is not hypothetical -- it is the one
		// argument shape that severs an answer, which is exactly why
		// SessionManager sends the CURRENT section set unchanged on an edit and
		// makes adding or removing a class its own action with its own confirm.
		//
		// A second section is posted first, so the check-in survives the drop
		// and this measures the DETACH rather than a refusal.
		const p2 = await createClassroomSection(db, {
			as: owner,
			courseCode: 'IDEA209H',
			courseTitle: 'Engineering I Honors',
			label: 'Period 2',
			teacherEmail: teacher.email
		});
		const shared = await createSession('2026-09-09', 'Shared day');
		await rpc(teacher, 'public.notebook_admin_upsert_session($1::uuid[], $2, $3, $4, $5)', [
			[p1, p2],
			3,
			'2026-09-09',
			'Shared day',
			shared
		]);
		const benEntry = await fileEntry(ben, shared);

		await rpc(teacher, 'public.notebook_admin_upsert_session($1::uuid[], $2, $3, $4, $5)', [
			[p2], // p1 dropped
			3,
			'2026-09-09',
			'Shared day',
			shared
		]);

		const { rows } = await db.sql<{ session_id: string | null; custom_label: string | null }>(
			'select session_id, custom_label from public.notebook_entries where id = $1',
			[benEntry]
		);
		// Detached -- and the entry SURVIVES, carrying the check-in's name, which
		// is the property that makes even this path non-destructive.
		expect(rows[0].session_id).toBeNull();
		expect(rows[0].custom_label).toBe('Shared day');
	});
});

// ---------------------------------------------------------------------------
// 3. CONTROL 3. Delete, with answers present, does what the confirm says.
// ---------------------------------------------------------------------------

describe('control 3: deleting a check-in keeps written work and destroys excusals', () => {
	let session = '';
	let adaEntry = '';
	let noteId = '';

	beforeAll(async () => {
		session = await createSession('2026-09-20', 'Gearbox assembly');
		adaEntry = await fileEntry(ada, session);
		// A NOTE ON THE ENTRY, so "the entry survives" is asserted about the
		// student's actual writing and not just about a row id. Notes cascade
		// from the ENTRY, so they are the thing a wrong delete would take.
		// The stored note shape is an ARRAY OF BLOCKS (`_notebook_note_content_ok`),
		// not an object with runs on it. No `.catch()` here on purpose: a note
		// this test could not write would make the survival assertion below pass
		// over nothing, which is the vacuous green this repo keeps finding.
		const note = await rpc<{ note_id: string }>(ada, `public.notebook_add_note($1, $2::jsonb)`, [
			adaEntry,
			JSON.stringify([{ type: 'p', runs: [{ text: 'Pressed the bearing to 2.4 mm.' }] }])
		]);
		noteId = note.note_id;
		await rpc(owner, 'public.notebook_admin_set_excusal($1, $2, true, $3)', [
			session,
			ben.id,
			'Away with the robotics team.'
		]);
	});

	it('reports the entries it detached', async () => {
		const before = await db.sql<{ n: string }>(
			'select count(*)::text as n from public.notebook_session_excusals where session_id = $1',
			[session]
		);
		expect(before.rows[0].n).toBe('1');

		const result = await rpc<{ deleted: boolean; detached_entries: number }>(
			teacher,
			'public.notebook_admin_delete_session($1)',
			[session]
		);
		expect(result.deleted).toBe(true);
		expect(result.detached_entries).toBe(1);
	});

	it('the entry is KEPT, detached, and relabelled with the check-in name', async () => {
		const { rows } = await db.sql<{
			session_id: string | null;
			custom_label: string | null;
			deleted_at: string | null;
			student_id: string;
		}>(
			'select session_id, custom_label, deleted_at, student_id from public.notebook_entries where id = $1',
			[adaEntry]
		);
		expect(rows).toHaveLength(1); // NOT cascade-deleted.
		expect(rows[0].session_id).toBeNull();
		expect(rows[0].custom_label).toBe('Gearbox assembly');
		expect(rows[0].deleted_at).toBeNull();
		expect(rows[0].student_id).toBe(ada.id);
	});

	it("the student's own writing on it survives with the entry", async () => {
		// Notes cascade from the ENTRY, so this is the assertion that "written
		// work is kept" is about actual writing rather than about a surviving row
		// id. `noteId` is asserted first so a fixture that failed to write one
		// cannot leave this looking green.
		expect(noteId).toBeTruthy();
		const { rows } = await db.sql<{ n: string; body: string }>(
			`select count(*)::text as n,
			        coalesce(max(n.content::text), '') as body
			   from public.notebook_entry_notes n where n.entry_id = $1`,
			[adaEntry]
		);
		expect(Number(rows[0].n)).toBeGreaterThan(0);
		expect(rows[0].body).toContain('Pressed the bearing to 2.4 mm.');
	});

	it('the EXCUSAL is destroyed, which is the half nothing used to say out loud', async () => {
		const { rows } = await db.sql<{ n: string }>(
			'select count(*)::text as n from public.notebook_session_excusals where session_id = $1',
			[session]
		);
		// `on delete cascade` on notebook_session_excusals.session_id. There is no
		// restore path for this, which is why the delete confirm now names it.
		expect(rows[0].n).toBe('0');
	});

	it('the check-in itself and its postings are gone', async () => {
		const { rows } = await db.sql<{ s: string; p: string }>(
			`select (select count(*) from public.notebook_sessions where id = $1)::text as s,
			        (select count(*) from public.notebook_session_postings where session_id = $1)::text as p`,
			[session]
		);
		expect(rows[0].s).toBe('0');
		expect(rows[0].p).toBe('0');
	});
});

// ---------------------------------------------------------------------------
// 4. CONTROL 2. A non-instructor is refused every one of these, and the
//    refusal is proven to bite by making the same caller a manager.
// ---------------------------------------------------------------------------

describe('control 2: a non-instructor is refused, and the refusal is not vacuous', () => {
	/**
	 * ONE CHECK-IN PER CASE, and that is not tidiness -- it is what the mutation
	 * run forced. Sharing a single check-in across all four cases, with both
	 * authorization layers opened, let the student's now-SUCCEEDING delete
	 * remove the row before the stranger's turn, so the stranger's attempt threw
	 * `That session does not exist.` and its refusal assertion went on passing
	 * over an open guard. A refusal that survives its own mutation because a
	 * neighbouring case destroyed the fixture is not a refusal that was tested.
	 */
	const owned: Record<string, string> = {};

	beforeAll(async () => {
		for (const key of ['studentEdit', 'studentDelete', 'strangerEdit', 'strangerDelete', 'untouched']) {
			owned[key] = await createSession('2026-09-25', 'Fixture inspection');
		}
	});

	it('a student cannot edit one', async () => {
		await expect(
			rpc(ada, 'public.notebook_admin_upsert_session($1::uuid[], $2, $3, $4, $5)', [
				[p1],
				3,
				'2026-09-25',
				'Renamed by a student',
				owned.studentEdit
			])
		).rejects.toThrow();
	});

	it('a student cannot delete one', async () => {
		await expect(
			rpc(ada, 'public.notebook_admin_delete_session($1)', [owned.studentDelete])
		).rejects.toThrow();
	});

	it('a teacher of another section cannot edit one', async () => {
		await expect(
			rpc(stranger, 'public.notebook_admin_upsert_session($1::uuid[], $2, $3, $4, $5)', [
				[p1],
				3,
				'2026-09-25',
				'Renamed by a stranger',
				owned.strangerEdit
			])
		).rejects.toThrow();
	});

	it('a teacher of another section cannot delete one', async () => {
		await expect(
			rpc(stranger, 'public.notebook_admin_delete_session($1)', [owned.strangerDelete])
		).rejects.toThrow();
	});

	it('every one of those check-ins is untouched', async () => {
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_sessions
			  where id = any($1::uuid[]) and session_label = 'Fixture inspection'`,
			[Object.values(owned)]
		);
		expect(rows[0].n).toBe(String(Object.keys(owned).length));
	});

	it('POSITIVE CONTROL: the same caller, made teacher of record, is allowed', async () => {
		// THE MUTATION IS ON THE CALLER, NOT ON THE GUARD -- opening
		// `_notebook_manages_session`'s body would prove the guard can be broken,
		// which nobody doubts. Making the stranger a real manager proves the
		// refusals above were about AUTHORIZATION and not about some unrelated
		// failure (a bad cast, a missing row) that would have thrown anyway.
		const p3 = await createClassroomSection(db, {
			as: owner,
			courseCode: 'IDEA209H',
			courseTitle: 'Engineering I Honors',
			label: 'Period 3',
			teacherEmail: stranger.email
		});
		const own = await rpc<{ session_id: string }>(
			stranger,
			'public.notebook_admin_upsert_session($1::uuid[], $2, $3, $4)',
			[[p3], 3, '2026-09-25', 'A check-in they do manage']
		);
		expect(own.session_id).toBeTruthy();

		// Edit: allowed.
		await rpc(stranger, 'public.notebook_admin_upsert_session($1::uuid[], $2, $3, $4, $5)', [
			[p3],
			3,
			'2026-09-26',
			'Renamed by its own teacher',
			own.session_id
		]);
		const { rows } = await db.sql<{ session_label: string }>(
			'select session_label from public.notebook_sessions where id = $1',
			[own.session_id]
		);
		expect(rows[0].session_label).toBe('Renamed by its own teacher');

		// Delete: allowed.
		const gone = await rpc<{ deleted: boolean }>(
			stranger,
			'public.notebook_admin_delete_session($1)',
			[own.session_id]
		);
		expect(gone.deleted).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 5. The number a teacher reads is the number the grid produces.
//
// The warnings count students off `notebook_get_section_grid`'s cells. This is
// where that client-side arithmetic is put to a REAL payload from the REAL
// function, so the sentence on screen and the grid under it cannot disagree.
// ---------------------------------------------------------------------------

describe('the counts on screen come from the grid the teacher is looking at', () => {
	let session = '';

	beforeAll(async () => {
		session = await createSession('2026-09-28', 'Motor characterisation');
		await fileEntry(ada, session);
		await fileEntry(cara, session);
		await rpc(owner, 'public.notebook_admin_set_excusal($1, $2, true, $3)', [
			session,
			ben.id,
			'Excused.'
		]);
	});

	it('counts STUDENTS who filed, and the excusals beside them', async () => {
		const g = await grid(teacher);
		const index = checkInLoadIndex(g);
		const load = checkInLoad(index, session);
		expect(load).not.toBeNull();
		// Two students filed; Ben is excused and filed nothing.
		expect(load!.answered).toBe(2);
		expect(load!.excused).toBe(1);
	});

	it('a second entry from one student does not double-count them', async () => {
		await fileEntry(ada, session);
		const g = await grid(teacher);
		const load = checkInLoad(checkInLoadIndex(g), session)!;
		// Still 2 STUDENTS, though Ada now has two entries -- which the grid
		// reports as entry_count 2 on her single cell.
		expect(load.answered).toBe(2);
		const adaCell = g.cells.find(
			(c) => c.student_key === ada.email && c.session_id === session
		)!;
		expect(adaCell.entry_count).toBe(2);
	});

	it('a check-in the grid does not cover reports CANNOT TELL, never zero', async () => {
		// The unit filter is the ordinary state of the console. A check-in in
		// another unit has no cells in this payload, and answering 0 for it is
		// the sentence that gets work thrown away.
		const other = await createSession('2026-10-05', 'Another unit entirely', 9);
		await fileEntry(ada, other);

		const unit3 = await grid(teacher, 3);
		expect(checkInLoad(checkInLoadIndex(unit3), other)).toBeNull();

		// POSITIVE CONTROL: asked for the unit it IS in, the same check-in
		// reports a real count -- so `null` above means "not covered" and not
		// "this index never finds anything".
		const unit9 = await grid(teacher, 9);
		expect(checkInLoad(checkInLoadIndex(unit9), other)?.answered).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// 6. The classification that decides which warning renders.
//
// Pure, so it is asserted directly rather than through a mount -- but asserted
// HERE, beside the RPC behaviour it is a claim about, because the whole point
// of calling a date change safe is that the RPC leaves answers alone when only
// the date moves. Section 2 is what makes this section true.
// ---------------------------------------------------------------------------

describe('an edit is classified by what it moves', () => {
	const base = { unit_number: 3, session_date: '2026-09-01', session_label: 'Bearing teardown' };

	it('nothing moved is `none`', () => {
		expect(checkInEditKind(base, { ...base })).toBe('none');
	});

	it('the day alone is a reschedule', () => {
		expect(checkInEditKind(base, { ...base, session_date: '2026-09-08' })).toBe('schedule');
	});

	it('the unit alone is a reschedule', () => {
		expect(checkInEditKind(base, { ...base, unit_number: 4 })).toBe('schedule');
	});

	it('the name is an identity change', () => {
		expect(checkInEditKind(base, { ...base, session_label: 'Gearbox assembly' })).toBe('identity');
	});

	it('a rename that also moves the day is still an identity change', () => {
		// The more serious of the two wins: a reschedule riding along does not
		// make a rename safer.
		expect(
			checkInEditKind(base, { session_date: '2026-09-08', unit_number: 4, session_label: 'New' })
		).toBe('identity');
	});

	it('whitespace alone is not a rename, because the RPC trims before storing', () => {
		expect(checkInEditKind(base, { ...base, session_label: '  Bearing teardown  ' })).toBe('none');
	});
});

// tests/notebook-staff-actions.test.ts
//
// FIVE SECURITY DEFINER CAPABILITIES THAT WERE LIVE, GRANTED AND UNCALLED, and
// the controls that now call them. `notebook_admin_set_excusal` (0069/0098),
// `notebook_admin_override_entry` (0069/0071/0094/0098),
// `notebook_staff_restore_note` (0119), `notebook_link_session_item` (0120) and
// the `notebook_admin_log` table itself (0069).
//
// WHY THIS FILE EXISTS AT ALL, given that CLAUDE.md says automated tests are the
// exception: every claim below is one whose regression is SILENT.
//
//   * A GATE THAT STOPS BITING looks exactly like a gate that holds, from the
//     outside, until the wrong person does something. Three of these functions
//     are the only path to a state a student is graded on.
//   * AN AUDIT ROW THAT STOPS BEING WRITTEN is invisible by construction:
//     `_notebook_log` returns void, no caller checks it, and the only way to
//     notice is to go looking for a row that is not there months later. That is
//     the whole reason the log exists, so it is asserted per action.
//   * THE TIER SPLIT IS THE THING MOST LIKELY TO BE "TIDIED" WRONG. Two of the
//     five are admin-only and two are instructor-tier, and the excusal splits
//     down the middle (read instructor, write admin). A future change that
//     harmonized them would read as a cleanup and would either take a
//     capability away from the teachers who need it or hand out one they should
//     not have.
//
// EVERY GATE IS ASSERTED IN BOTH DIRECTIONS, per the verification standard: the
// role that should reach it does reach it AND the write lands, and the roles
// that should not are refused. An absence assertion with no positive control
// beside it is a test that passes when the fixture is broken.
//
// THE `_notebook_log` ASSERTIONS ARE COUNTED BEFORE AND AFTER rather than
// listed, because other tests in this file write to the same table: a bare
// "there is a row with action X" would pass on a row an earlier `it` left
// behind.

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';
import {
	ADMIN_LOG_ACTIONS,
	EXCUSAL_NOTE_MAX,
	adminLogActor,
	adminLogDetail,
	adminLogLabel,
	entryMoveChanged,
	entryMovePayload,
	excusalBlockedReason,
	excusalIndex,
	excusalKey,
	type AdminLogRow
} from '../src/lib/notebook/admin-actions';

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
	// 0085 is what creates `classroom_postings`, which 0120 needs to exist
	// before it can point a check-in at an item; 0086/0090/0095/0097 are what
	// 0085's own chain needs. This is the world 0120 was written into.
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0088_notebook_folders.sql',
	'0090_classroom_instructor_materials.sql',
	'0091_notebook_pin_and_activity.sql',
	'0094_notebook_classroom_sections.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0097_notebook_documentation_check.sql',
	'0098_notebook_session_postings.sql',
	'0099_notebook_view_as.sql',
	'0106_notebook_instructor_student_access.sql',
	'0114_notebook_note_entry_session.sql',
	'0116_notebook_soft_delete.sql',
	'0117_notebook_soft_delete_restore.sql',
	'0118_notebook_draft_state.sql',
	'0119_notebook_note_delete.sql',
	'0120_notebook_session_item_link.sql',
	// LAST, always: 0137 is a sweep over whatever the chain above it created,
	// and the harness default puts it last for the same reason.
	'0137_anon_execute_sweep.sql'
] as const;

let db: TestDb;

let owner: SeededUser; // the pinned admin (0067's admin_owner_email): ADMIN tier
let teacher: SeededUser; // teacher of record for P1. NOT an admin -- "Mr Cosso"
let otherTeacher: SeededUser; // teacher of record for P2 and nothing of P1
let ada: SeededUser; // student, enrolled in P1
let bo: SeededUser; // classmate in P1

let p1: string;
let p2: string;
/** A check-in posted to P1, and a second one, so an entry has somewhere to move. */
let sessionA: string;
let sessionB: string;

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
 * Runs a plain SELECT as `authenticated`, so RLS is what filters it.
 *
 * The constraint mirrors `QueryFn`'s own (`pg.QueryResultRow`) rather than
 * `Record<string, unknown>`: an interface gets no implicit index signature, so
 * the tighter constraint refuses every named row type this file has -- which is
 * all of them.
 */
async function selectAs<T extends pg.QueryResultRow>(
	user: SeededUser,
	sql: string,
	params: unknown[] = []
): Promise<T[]> {
	const { rows } = await db.asUser(user.id, (q) => q<T>(sql, params));
	return rows;
}

async function newEntry(
	student: SeededUser,
	opts: { sectionId?: string | null; sessionId?: string | null; submitted?: boolean } = {}
): Promise<string> {
	const { rows } = await db.sql<{ id: string }>(
		`insert into public.notebook_entries
			(student_id, custom_label, section_id, session_id, upload_timestamp, submitted_at)
		 values ($1, $2, $3, $4, now(), $5)
		 returning id`,
		[
			student.id,
			opts.sessionId ? null : 'A free entry',
			opts.sectionId ?? null,
			opts.sessionId ?? null,
			opts.submitted === false ? null : new Date().toISOString()
		]
	);
	return rows[0].id;
}

async function addNote(student: SeededUser, entryId: string, text: string): Promise<string> {
	const result = await rpc<{ note_id: string }>(
		student,
		`public.notebook_add_note($1::uuid, $2::jsonb)`,
		[entryId, doc(text)]
	);
	return result.note_id;
}

/** How many log rows carry this action, straight off the table as the owner. */
async function logCount(action: string): Promise<number> {
	const { rows } = await db.sql<{ n: string }>(
		'select count(*) as n from public.notebook_admin_log where action = $1',
		[action]
	);
	return Number(rows[0].n);
}

/** The newest log row for an action, so its `details` can be asserted. */
async function newestLog(action: string): Promise<AdminLogRow | null> {
	const { rows } = await db.sql<AdminLogRow>(
		`select id, actor_id, action, section_id, session_id, entry_id, student_id, details, created_at
		 from public.notebook_admin_log where action = $1
		 order by created_at desc, id desc limit 1`,
		[action]
	);
	return rows[0] ?? null;
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

	await enrollStudent(db, { as: teacher, sectionId: p1, email: ada.email, displayName: 'Pike, Ada' });
	await enrollStudent(db, { as: teacher, sectionId: p1, email: bo.email, displayName: 'Reyes, Bo' });

	// Two check-ins in P1, created through the REAL upsert.
	sessionA = (
		await rpc<{ session_id: string }>(
			teacher,
			`public.notebook_admin_upsert_session($1::uuid[], $2::integer, $3::date, $4::text)`,
			[[p1], 1, '2026-03-02', 'Bench log A']
		)
	).session_id;
	sessionB = (
		await rpc<{ session_id: string }>(
			teacher,
			`public.notebook_admin_upsert_session($1::uuid[], $2::integer, $3::date, $4::text)`,
			[[p1], 1, '2026-03-04', 'Bench log B']
		)
	).session_id;
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 0. THE FIXTURE ITSELF, so nothing below passes vacuously.
// ---------------------------------------------------------------------------

describe('the fixture is the world these gates are written for', () => {
	it('the owner is an admin and the teacher of record is NOT', async () => {
		// THE POSITIVE CONTROL FOR EVERY REFUSAL IN THIS FILE. If `teacher` were
		// accidentally an admin, every "an instructor is refused" assertion below
		// would fail loudly rather than passing -- but if the owner were NOT an
		// admin, every "an admin may" assertion would fail instead. Both
		// directions are asserted here once so the rest can be read plainly.
		const [asOwner] = await selectAs<{ ok: boolean }>(owner, 'select public.is_admin() as ok');
		const [asTeacher] = await selectAs<{ ok: boolean }>(teacher, 'select public.is_admin() as ok');
		const [asStudent] = await selectAs<{ ok: boolean }>(ada, 'select public.is_admin() as ok');
		expect(asOwner.ok).toBe(true);
		expect(asTeacher.ok).toBe(false);
		expect(asStudent.ok).toBe(false);
	});

	it('the teacher of record DOES manage P1 -- the instructor tier is real here', async () => {
		const [mine] = await selectAs<{ ok: boolean }>(
			teacher,
			'select public.classroom_manages_section($1::uuid) as ok',
			[p1]
		);
		const [theirs] = await selectAs<{ ok: boolean }>(
			teacher,
			'select public.classroom_manages_section($1::uuid) as ok',
			[p2]
		);
		expect(mine.ok).toBe(true);
		expect(theirs.ok).toBe(false);
	});

	it('all five capabilities are granted to `authenticated` and none to `anon`', async () => {
		// The audit's own premise, re-derived from the catalog rather than taken
		// on trust -- and asserted AFTER 0137, which is the migration that could
		// have swept any of them.
		const names = [
			'notebook_admin_set_excusal',
			'notebook_admin_override_entry',
			'notebook_staff_restore_note',
			'notebook_link_session_item'
		];
		for (const name of names) {
			const { rows } = await db.sql<{ sig: string; auth: boolean; anon: boolean }>(
				`select p.oid::regprocedure::text as sig,
				        has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth,
				        has_function_privilege('anon', p.oid, 'EXECUTE') as anon
				 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public' and p.proname = $1`,
				[name]
			);
			expect(rows, `${name} should exist exactly once`).toHaveLength(1);
			expect(rows[0].auth, `${name} granted to authenticated`).toBe(true);
			expect(rows[0].anon, `${name} must not be granted to anon`).toBe(false);
		}

		// The log is a TABLE, so its gate is a grant plus a policy, not a body.
		const { rows: tableAcl } = await db.sql<{ auth: boolean; anon: boolean }>(
			`select has_table_privilege('authenticated', 'public.notebook_admin_log', 'SELECT') as auth,
			        has_table_privilege('anon', 'public.notebook_admin_log', 'SELECT') as anon`
		);
		expect(tableAcl[0].auth).toBe(true);
		expect(tableAcl[0].anon).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 1. THE EXCUSAL. The one that matters: `excused` is a first-class read state
//    in six places and nothing could set it.
// ---------------------------------------------------------------------------

describe('notebook_admin_set_excusal: the write is admin-only, the read is not', () => {
	it('an admin records an excusal WITH a reason, and the grid changes answer', async () => {
		// BEFORE: the grid says this cell is missing, which is the whole point --
		// an excused student was counted as outstanding because nothing could
		// mark them otherwise.
		const before = await rpc<{ cells: { session_id: string; student_id: string | null; status: string; excused: boolean }[] }>(
			teacher,
			`public.notebook_get_section_grid($1::uuid, $2::integer)`,
			[p1, 1]
		);
		const cellBefore = before.cells.find(
			(c) => c.session_id === sessionA && c.student_id === ada.id
		);
		expect(cellBefore, 'Ada should have a cell for session A').toBeDefined();
		expect(cellBefore!.excused).toBe(false);
		expect(cellBefore!.status).toBe('missing');

		const logsBefore = await logCount('set_excusal');

		const result = await rpc<{ excused: boolean }>(
			owner,
			`public.notebook_admin_set_excusal($1::uuid, $2::uuid, $3::boolean, $4::text)`,
			[sessionA, ada.id, true, 'Field trip, approved by the office']
		);
		expect(result.excused).toBe(true);

		// AFTER: the same grid read, by the same instructor, now says excused.
		const after = await rpc<{ cells: { session_id: string; student_id: string | null; status: string; excused: boolean }[] }>(
			teacher,
			`public.notebook_get_section_grid($1::uuid, $2::integer)`,
			[p1, 1]
		);
		const cellAfter = after.cells.find((c) => c.session_id === sessionA && c.student_id === ada.id);
		expect(cellAfter!.excused).toBe(true);
		expect(cellAfter!.status).toBe('excused');

		// THE AUDIT ROW. Counted rather than merely found, so a row left by an
		// earlier test cannot satisfy this.
		expect(await logCount('set_excusal')).toBe(logsBefore + 1);
		const row = await newestLog('set_excusal');
		expect(row?.actor_id).toBe(owner.id);
		expect(row?.student_id).toBe(ada.id);
		expect(row?.session_id).toBe(sessionA);
		expect((row?.details as { note?: string })?.note).toBe('Field trip, approved by the office');
	});

	it('the reason is READABLE, which is the half that has never been selected', async () => {
		// The note column has existed since 0069 and no surface in the repo has
		// ever asked for it. This asserts the instructor -- who cannot WRITE one
		// -- can read it, because that is what makes an excusal explainable in
		// March.
		const rows = await selectAs<{ note: string | null; student_id: string; session_id: string }>(
			teacher,
			`select session_id, student_id, note from public.notebook_session_excusals
			 where session_id = $1 and student_id = $2`,
			[sessionA, ada.id]
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].note).toBe('Field trip, approved by the office');
	});

	it('AN INSTRUCTOR IS REFUSED THE WRITE, and the refusal names the tier', async () => {
		await expect(
			rpc(owner, 'public.notebook_admin_set_excusal($1::uuid, $2::uuid)', [sessionA, bo.id])
		).resolves.toBeTruthy(); // positive control: the same call from an admin lands

		await expect(
			rpc(teacher, 'public.notebook_admin_set_excusal($1::uuid, $2::uuid)', [sessionA, bo.id])
		).rejects.toThrow(/Only a site admin can excuse notebook sessions/);
	});

	it('a student is refused, including for themselves', async () => {
		await expect(
			rpc(ada, 'public.notebook_admin_set_excusal($1::uuid, $2::uuid)', [sessionB, ada.id])
		).rejects.toThrow(/Only a site admin can excuse notebook sessions/);
		// AND NOTHING LANDED. A refusal that still wrote would be the worst of
		// both, so the absence is asserted rather than inferred.
		const { rows } = await db.sql(
			'select 1 from public.notebook_session_excusals where session_id = $1 and student_id = $2',
			[sessionB, ada.id]
		);
		expect(rows).toHaveLength(0);
	});

	it('clearing an excusal deletes the row and logs the OTHER action string', async () => {
		const clearsBefore = await logCount('clear_excusal');
		await rpc(owner, 'public.notebook_admin_set_excusal($1::uuid, $2::uuid, $3::boolean)', [
			sessionA,
			bo.id,
			false
		]);
		const { rows } = await db.sql(
			'select 1 from public.notebook_session_excusals where session_id = $1 and student_id = $2',
			[sessionA, bo.id]
		);
		expect(rows).toHaveLength(0);
		// The two branches are two action strings from one call site, which is
		// exactly the sort of thing a refactor collapses into one.
		expect(await logCount('clear_excusal')).toBe(clearsBefore + 1);
	});

	it('a second excusal on the same cell REPLACES the reason rather than erroring', async () => {
		// `on conflict ... do update` -- an instructor correcting the reason must
		// not have to clear it first, and a unique violation surfacing as a raw
		// constraint string is not a sentence anybody can act on.
		await rpc(owner, 'public.notebook_admin_set_excusal($1::uuid, $2::uuid, true, $3::text)', [
			sessionA,
			ada.id,
			'Medical, note on file'
		]);
		const rows = await selectAs<{ note: string | null }>(
			owner,
			'select note from public.notebook_session_excusals where session_id = $1 and student_id = $2',
			[sessionA, ada.id]
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].note).toBe('Medical, note on file');
	});

	it('the note cap the control enforces is the column CHECK, not a guess', async () => {
		// EXCUSAL_NOTE_MAX is restated in TypeScript so a field can refuse before
		// a round trip. That number is only worth having if it is the same one
		// the database uses, so the database is asked.
		await expect(
			db.sql(
				`insert into public.notebook_session_excusals (session_id, student_id, note)
				 values ($1, $2, repeat('x', $3))`,
				[sessionB, bo.id, EXCUSAL_NOTE_MAX + 1]
			)
		).rejects.toThrow();
		// POSITIVE CONTROL: exactly at the cap is accepted, so the assertion above
		// is about the boundary and not about the insert being broken.
		await db.sql(
			`insert into public.notebook_session_excusals (session_id, student_id, note)
			 values ($1, $2, repeat('x', $3))
			 on conflict (session_id, student_id) do nothing`,
			[sessionB, bo.id, EXCUSAL_NOTE_MAX]
		);
		const { rows } = await db.sql<{ n: number }>(
			'select char_length(note) as n from public.notebook_session_excusals where session_id = $1 and student_id = $2',
			[sessionB, bo.id]
		);
		expect(rows[0].n).toBe(EXCUSAL_NOTE_MAX);
		await db.sql(
			'delete from public.notebook_session_excusals where session_id = $1 and student_id = $2',
			[sessionB, bo.id]
		);
	});

	it('a student with no account cannot be excused, which is why the control says so', async () => {
		// 0094's roster carries an enrolled student who has never signed in, and
		// the RPC refuses them. `excusalBlockedReason` is the client mirror, so
		// the two are asserted together: the sentence exists precisely because
		// this call cannot succeed.
		await enrollStudent(db, {
			as: teacher,
			sectionId: p1,
			email: 'ghost@boscotech.net',
			displayName: 'Ghost, G'
		});
		const madeUp = '00000000-0000-0000-0000-0000000000ff';
		await expect(
			rpc(owner, 'public.notebook_admin_set_excusal($1::uuid, $2::uuid)', [sessionA, madeUp])
		).rejects.toThrow(/That student does not exist/);
		expect(excusalBlockedReason(null)).toMatch(/never signed in/);
		expect(excusalBlockedReason(ada.id)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 2. THE OVERRIDE. Two corrections out of nine parameters.
// ---------------------------------------------------------------------------

describe('notebook_admin_override_entry: moving an entry, admin-only', () => {
	it('an admin moves an entry to another check-in, and the audit row records both ends', async () => {
		const entry = await newEntry(ada, { sectionId: p1, sessionId: sessionA });
		const logsBefore = await logCount('override_entry');

		const payload = entryMovePayload(
			entry,
			{ sessionId: sessionA, sectionId: p1 },
			{ sessionId: sessionB, sectionId: p1 }
		);
		// The client helper's own output is what is sent, so the test exercises
		// the mapping the control actually uses rather than a hand-written call.
		expect(payload).toEqual({
			entryId: entry,
			setSession: true,
			sessionId: sessionB,
			setSection: false,
			sectionId: null
		});

		const result = await rpc<{ session_id: string; section_id: string }>(
			owner,
			`public.notebook_admin_override_entry($1::uuid, $2::boolean, $3::uuid, $4::boolean, $5::uuid)`,
			[payload.entryId, payload.setSession, payload.sessionId, payload.setSection, payload.sectionId]
		);
		expect(result.session_id).toBe(sessionB);
		expect(result.section_id).toBe(p1);

		const { rows } = await db.sql<{ session_id: string }>(
			'select session_id from public.notebook_entries where id = $1',
			[entry]
		);
		expect(rows[0].session_id).toBe(sessionB);

		expect(await logCount('override_entry')).toBe(logsBefore + 1);
		const row = await newestLog('override_entry');
		const details = row?.details as { before?: Record<string, unknown>; after?: Record<string, unknown> };
		expect(details.before?.session_id).toBe(sessionA);
		expect(details.after?.session_id).toBe(sessionB);
	});

	it('A MOVE IS NOT A REVIEW: reviewed_by and reviewed_at are left alone', async () => {
		// Sending no `p_status` is what makes the RPC leave the review stamps
		// alone, and it is the reason the control exposes five parameters rather
		// than nine. If a future edit sent a status "for completeness", correcting
		// a student's filing would silently also record that somebody read it.
		const entry = await newEntry(ada, { sectionId: p1, sessionId: sessionA });
		await rpc(
			owner,
			`public.notebook_admin_override_entry($1::uuid, true, $2::uuid, false, null)`,
			[entry, sessionB]
		);
		const { rows } = await db.sql<{ reviewed_by: string | null; reviewed_at: string | null }>(
			'select reviewed_by, reviewed_at from public.notebook_entries where id = $1',
			[entry]
		);
		expect(rows[0].reviewed_by).toBeNull();
		expect(rows[0].reviewed_at).toBeNull();
	});

	it('detaching is a real outcome, and needs the set flag rather than a bare null', async () => {
		// This is the whole reason the RPC carries `p_set_session`: null with the
		// flag TRUE detaches, null with it FALSE means "leave alone". A control
		// that sent null for both would silently never detach anything.
		const entry = await newEntry(ada, { sectionId: p1, sessionId: sessionA });

		// NEGATIVE CONTROL FIRST: the flag false leaves the session in place.
		await rpc(owner, `public.notebook_admin_override_entry($1::uuid, false, null, false, null)`, [
			entry
		]);
		let { rows } = await db.sql<{ session_id: string | null }>(
			'select session_id from public.notebook_entries where id = $1',
			[entry]
		);
		expect(rows[0].session_id).toBe(sessionA);

		// Now with the flag true, which is what `entryMovePayload` emits for a
		// move to the detach sentinel.
		const payload = entryMovePayload(
			entry,
			{ sessionId: sessionA, sectionId: p1 },
			{ sessionId: null, sectionId: p1 }
		);
		expect(payload.setSession).toBe(true);
		expect(payload.sessionId).toBeNull();
		await rpc(owner, `public.notebook_admin_override_entry($1::uuid, true, null, false, null)`, [
			entry
		]);
		({ rows } = await db.sql<{ session_id: string | null }>(
			'select session_id from public.notebook_entries where id = $1',
			[entry]
		));
		expect(rows[0].session_id).toBeNull();
	});

	it('AN INSTRUCTOR IS REFUSED, even for an entry in their own class', async () => {
		const entry = await newEntry(ada, { sectionId: p1, sessionId: sessionA });
		// Positive control: the admin can do it to this exact entry.
		await expect(
			rpc(owner, `public.notebook_admin_override_entry($1::uuid, true, $2::uuid, false, null)`, [
				entry,
				sessionB
			])
		).resolves.toBeTruthy();
		await expect(
			rpc(teacher, `public.notebook_admin_override_entry($1::uuid, true, $2::uuid, false, null)`, [
				entry,
				sessionA
			])
		).rejects.toThrow(/Only a site admin can override notebook entries/);
		// AND THE REFUSAL WROTE NOTHING: still on session B.
		const { rows } = await db.sql<{ session_id: string }>(
			'select session_id from public.notebook_entries where id = $1',
			[entry]
		);
		expect(rows[0].session_id).toBe(sessionB);
	});

	it('a student is refused their own entry', async () => {
		const entry = await newEntry(ada, { sectionId: p1, sessionId: sessionA });
		await expect(
			rpc(ada, `public.notebook_admin_override_entry($1::uuid, true, $2::uuid, false, null)`, [
				entry,
				sessionB
			])
		).rejects.toThrow(/Only a site admin can override notebook entries/);
	});

	it('the client refuses to send a move that is not a move', async () => {
		// `entryMoveChanged` drives BOTH the button and the handler. Sending an
		// unchanged pair would succeed at the database and mint an audit row
		// saying an admin moved an entry that did not move.
		expect(entryMoveChanged({ sessionId: 'a', sectionId: 'x' }, { sessionId: 'a', sectionId: 'x' })).toBe(
			false
		);
		expect(entryMoveChanged({ sessionId: 'a', sectionId: 'x' }, { sessionId: 'b', sectionId: 'x' })).toBe(
			true
		);
		expect(
			entryMoveChanged({ sessionId: null, sectionId: 'x' }, { sessionId: 'a', sectionId: 'x' })
		).toBe(true);
		expect(entryMoveChanged({ sessionId: 'a', sectionId: 'x' }, { sessionId: 'a', sectionId: 'y' })).toBe(
			true
		);
		// And a section-only move sets ONLY the section flag, so re-pointing a
		// class never rewrites the check-in as a side effect.
		const onlySection = entryMovePayload(
			'e',
			{ sessionId: 'a', sectionId: 'x' },
			{ sessionId: 'a', sectionId: 'y' }
		);
		expect(onlySection.setSession).toBe(false);
		expect(onlySection.setSection).toBe(true);
		expect(onlySection.sectionId).toBe('y');
	});
});

// ---------------------------------------------------------------------------
// 3. STAFF NOTE RESTORE. NOT admin-only, despite sitting in the same audit.
// ---------------------------------------------------------------------------

describe('notebook_staff_restore_note: the instructor tier, not the admin one', () => {
	it('THE TEACHER OF RECORD CAN RESTORE, which is the finding this test pins', async () => {
		// If this ever starts refusing, the capability has been narrowed to
		// admins and the colleague teaching the parallel section loses it. The
		// gate is `classroom_manages_section OR notebook_manages_student`, and
		// `teacher` is deliberately not an admin in this fixture.
		const entry = await newEntry(ada, { sectionId: p1, sessionId: sessionA });
		const noteId = await addNote(ada, entry, 'a measurement');
		await rpc(teacher, 'public.notebook_staff_delete_note($1::uuid)', [noteId]);

		let { rows } = await db.sql<{ deleted_at: string | null }>(
			'select deleted_at from public.notebook_entry_notes where note_id = $1',
			[noteId]
		);
		expect(rows.every((r) => r.deleted_at !== null)).toBe(true);

		const logsBefore = await logCount('restore_note');
		const result = await rpc<{ ok: boolean; revisions: number }>(
			teacher,
			'public.notebook_staff_restore_note($1::uuid)',
			[noteId]
		);
		expect(result.ok).toBe(true);
		expect(result.revisions).toBeGreaterThan(0);

		({ rows } = await db.sql<{ deleted_at: string | null }>(
			'select deleted_at from public.notebook_entry_notes where note_id = $1',
			[noteId]
		));
		expect(rows.every((r) => r.deleted_at === null)).toBe(true);
		expect(await logCount('restore_note')).toBe(logsBefore + 1);
	});

	it('it restores a note the STUDENT deleted, which is why no author check is offered', async () => {
		// The staff disclosure offers Restore on every deleted thread with no
		// `deletedBy` branch. That is the RPC's own rule, not a looser copy of
		// the owner's, and it is the case an instructor is actually asked about.
		const entry = await newEntry(ada, { sectionId: p1, sessionId: sessionA });
		const noteId = await addNote(ada, entry, 'deleted by its author');
		// The entry needs OTHER content or `notebook_delete_note` refuses: 0119
		// will not let a student empty an entry by removing its last note ("Delete
		// the whole entry instead"). A second note is the smallest way to get
		// there and keeps the shell guard out of what this test is about.
		await addNote(ada, entry, 'and one that stays');
		await rpc(ada, 'public.notebook_delete_note($1::uuid)', [noteId]);

		await expect(
			rpc(teacher, 'public.notebook_staff_restore_note($1::uuid)', [noteId])
		).resolves.toMatchObject({ ok: true });
	});

	it('an instructor of ANOTHER class is refused, and so is a classmate', async () => {
		const entry = await newEntry(ada, { sectionId: p1, sessionId: sessionA });
		const noteId = await addNote(ada, entry, 'not yours');
		await rpc(teacher, 'public.notebook_staff_delete_note($1::uuid)', [noteId]);

		await expect(
			rpc(otherTeacher, 'public.notebook_staff_restore_note($1::uuid)', [noteId])
		).rejects.toThrow(/does not exist, or is not one you manage/);
		await expect(
			rpc(bo, 'public.notebook_staff_restore_note($1::uuid)', [noteId])
		).rejects.toThrow(/does not exist, or is not one you manage/);

		// STILL DELETED after both refusals -- the absence assertion the two
		// rejections above are only half of.
		const { rows } = await db.sql<{ deleted_at: string | null }>(
			'select deleted_at from public.notebook_entry_notes where note_id = $1',
			[noteId]
		);
		expect(rows.every((r) => r.deleted_at !== null)).toBe(true);

		// POSITIVE CONTROL: the manager of the class it is in still can.
		await expect(
			rpc(teacher, 'public.notebook_staff_restore_note($1::uuid)', [noteId])
		).resolves.toMatchObject({ ok: true });
	});
});

// ---------------------------------------------------------------------------
// 4. ATTACHING A SCHEDULED CHECK-IN TO AN ITEM. Also instructor-tier.
// ---------------------------------------------------------------------------

describe('notebook_link_session_item: attaching one that already exists', () => {
	let itemId: string;

	beforeAll(async () => {
		const item = await rpc<{ item_id: string }>(
			teacher,
			'public.classroom_create_item($1, $2::uuid[], $3, $4, $5::integer, null, null, true)',
			['assignment', [p1], 'Bench log write-up', 'Write it up.', 100]
		);
		itemId = item.item_id;
	});

	it('THE TEACHER OF RECORD CAN ATTACH ONE, and the posting carries the pointer', async () => {
		// Before 0120's function had a caller, the only path was
		// notebook_create_item_check_in, which MAKES a new check-in -- so a
		// check-in already on the calendar could not be attached to its item
		// without deleting it and detaching every entry filed against it.
		const before = await selectAs<{ item_id: string | null }>(
			teacher,
			'select item_id from public.notebook_session_postings where session_id = $1 and section_id = $2',
			[sessionA, p1]
		);
		expect(before).toHaveLength(1);
		expect(before[0].item_id).toBeNull();

		const result = await rpc<{ linked: number }>(
			teacher,
			'public.notebook_link_session_item($1::uuid, $2::uuid, $3::uuid)',
			[sessionA, p1, itemId]
		);
		expect(result.linked).toBe(1);

		const after = await selectAs<{ item_id: string | null }>(
			teacher,
			'select item_id from public.notebook_session_postings where session_id = $1 and section_id = $2',
			[sessionA, p1]
		);
		expect(after[0].item_id).toBe(itemId);
	});

	it('unlinking puts it back in the stream and touches nothing else', async () => {
		const result = await rpc<{ cleared: number }>(
			teacher,
			'public.notebook_unlink_session_item($1::uuid, $2::uuid)',
			[sessionA, p1]
		);
		expect(result.cleared).toBe(1);
		const after = await selectAs<{ item_id: string | null }>(
			teacher,
			'select item_id from public.notebook_session_postings where session_id = $1 and section_id = $2',
			[sessionA, p1]
		);
		expect(after[0].item_id).toBeNull();
		// The check-in itself is untouched -- the posting is what carried the
		// pointer, and 0120 says the entries filed against it are unaffected.
		const { rows } = await db.sql<{ n: string }>(
			'select count(*) as n from public.notebook_sessions where id = $1',
			[sessionA]
		);
		expect(Number(rows[0].n)).toBe(1);
	});

	it('an instructor of another class is refused, and a student is', async () => {
		await expect(
			rpc(otherTeacher, 'public.notebook_link_session_item($1::uuid, $2::uuid, $3::uuid)', [
				sessionA,
				p1,
				itemId
			])
		).rejects.toThrow(/Only the class instructor or a site admin/);
		await expect(
			rpc(ada, 'public.notebook_link_session_item($1::uuid, $2::uuid, $3::uuid)', [
				sessionA,
				p1,
				itemId
			])
		).rejects.toThrow(/Only the class instructor or a site admin/);

		// NOTHING LANDED from either refusal.
		const after = await selectAs<{ item_id: string | null }>(
			teacher,
			'select item_id from public.notebook_session_postings where session_id = $1 and section_id = $2',
			[sessionA, p1]
		);
		expect(after[0].item_id).toBeNull();
	});

	it('an item not posted to this class is refused, which is why the picker is scoped', async () => {
		// The picker offers exactly "items posted to this section", read through
		// a `!inner` embed on classroom_postings -- the same condition this
		// refusal names. If the two ever diverge the control starts offering
		// something the RPC turns down, so the refusal is pinned here.
		const foreign = await rpc<{ item_id: string }>(
			otherTeacher,
			'public.classroom_create_item($1, $2::uuid[], $3, $4, $5::integer, null, null, true)',
			['assignment', [p2], 'Another class entirely', 'Not for P1.', 100]
		);
		await expect(
			rpc(teacher, 'public.notebook_link_session_item($1::uuid, $2::uuid, $3::uuid)', [
				sessionA,
				p1,
				foreign.item_id
			])
		).rejects.toThrow(/not posted to this class/);
	});
});

// ---------------------------------------------------------------------------
// 5. THE LOG. Admin-only by POLICY, which fails to an empty list rather than
//    to an error -- so both halves have to be asserted.
// ---------------------------------------------------------------------------

describe('notebook_admin_log: the listing, and who may read it', () => {
	it('an admin reads rows, newest first', async () => {
		const rows = await selectAs<AdminLogRow>(
			owner,
			`select id, actor_id, action, section_id, session_id, entry_id, student_id, details, created_at
			 from public.notebook_admin_log order by created_at desc limit 50`
		);
		// Every describe above this one wrote to the table, so this is a real
		// listing rather than a fixture of its own.
		expect(rows.length).toBeGreaterThan(0);
		const actions = new Set(rows.map((r) => r.action));
		expect(actions.has('set_excusal')).toBe(true);
		expect(actions.has('override_entry')).toBe(true);

		const stamps = rows.map((r) => new Date(r.created_at).getTime());
		expect([...stamps].sort((a, b) => b - a)).toEqual(stamps);
	});

	it('AN INSTRUCTOR READS NOTHING, and it is an empty result rather than a refusal', async () => {
		// The /admin doctrine: an empty RLS result is indistinguishable from the
		// rows not existing. The positive control is the assertion above -- the
		// rows are definitely there, and this caller simply cannot see them.
		const rows = await selectAs<AdminLogRow>(
			teacher,
			'select id, action from public.notebook_admin_log'
		);
		expect(rows).toHaveLength(0);
	});

	it('a student reads nothing', async () => {
		const rows = await selectAs<AdminLogRow>(
			ada,
			'select id, action from public.notebook_admin_log'
		);
		expect(rows).toHaveLength(0);
	});

	it('nobody but the definer functions can write to it', async () => {
		// There is no insert grant at all, so the log cannot be forged even by an
		// admin acting directly. `_notebook_log` has no grants either -- only the
		// SECURITY DEFINER RPCs, running as the owner, reach it.
		await expect(
			db.asUser(owner.id, (q) =>
				q(`insert into public.notebook_admin_log (action) values ('forged')`)
			)
		).rejects.toThrow();
		await expect(
			db.asUser(owner.id, (q) => q(`select public._notebook_log('forged', null, null, null, null, '{}'::jsonb)`))
		).rejects.toThrow();
	});

	it('the label map covers every action string the migrations actually log', async () => {
		// Read from the TABLE rather than from a list retyped here, so an action
		// a future migration introduces reddens this instead of rendering as a
		// raw string nobody notices. `adminLogLabel` falls back to the string
		// itself, which is deliberate -- this test is what turns that fallback
		// from a silent gap into a finding.
		const { rows } = await db.sql<{ action: string }>(
			'select distinct action from public.notebook_admin_log'
		);
		expect(rows.length).toBeGreaterThan(0);
		for (const { action } of rows) {
			expect(ADMIN_LOG_ACTIONS[action], `no label for logged action "${action}"`).toBeDefined();
			expect(adminLogLabel(action)).not.toBe(action);
		}
		// And an unknown action renders as itself rather than as "Unknown".
		expect(adminLogLabel('some_future_action')).toBe('some_future_action');
	});

	it('the detail line reads the shapes the RPCs really write', async () => {
		// Built from a REAL row rather than a hand-typed `details` blob: a
		// fixture the producer cannot emit is a green test over a dead branch.
		const excusal = await newestLog('set_excusal');
		expect(excusal).not.toBeNull();
		expect(adminLogDetail(excusal!)).toMatch(/^Reason: /);

		const moved = await newestLog('override_entry');
		expect(moved).not.toBeNull();
		expect(adminLogDetail(moved!)).toBeTruthy();

		const restored = await newestLog('restore_note');
		expect(restored).not.toBeNull();
		expect(adminLogDetail(restored!)).toMatch(/revision/);
	});

	it('the actor renders as "You" only for the viewer, and never resolves anybody else', async () => {
		const row = await newestLog('set_excusal');
		expect(adminLogActor(row!, owner.id)).toBe('You');
		// Anybody else stays a uuid: resolving it would mean reading other
		// people's profile rows for a cosmetic gain.
		expect(adminLogActor(row!, teacher.id)).toBe(owner.id);
		expect(adminLogActor(row!, null)).toBe(owner.id);
		expect(adminLogActor({ ...row!, actor_id: null }, owner.id)).toBe('Unknown');
	});
});

// ---------------------------------------------------------------------------
// 6. The excusal index, which is what joins a note to a cell.
// ---------------------------------------------------------------------------

describe('excusalIndex keys on the pair the RPC writes on', () => {
	it('finds a row by (session, student) and misses on either half', () => {
		const rows = [
			{ session_id: 's1', student_id: 'u1', excused_at: 'x', excused_by: null, note: 'trip' },
			{ session_id: 's2', student_id: 'u1', excused_at: 'x', excused_by: null, note: null }
		];
		const index = excusalIndex(rows);
		expect(index.get(excusalKey('s1', 'u1'))?.note).toBe('trip');
		expect(index.get(excusalKey('s2', 'u1'))?.note).toBeNull();
		// The misses are the point: a key built from one half would silently
		// show one check-in's reason under another's cell.
		expect(index.get(excusalKey('s1', 'u2'))).toBeUndefined();
		expect(index.get(excusalKey('s3', 'u1'))).toBeUndefined();
		// And a student with no uuid can never collide with a real one.
		expect(index.get(excusalKey('s1', ''))).toBeUndefined();
	});
});

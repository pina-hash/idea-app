// tests/notebook-review-acknowledged.test.ts
//
// 0121 gives review a second verdict: `notebook_accept_entry` records that
// somebody LOOKED at an entry, without saying anything about the work. What is
// worth a test here, per this repo's rule that automated tests are for
// guarantees whose regression is SILENT:
//
//   1. WHAT ACCEPT DOES NOT TOUCH. `status`, `flag_reason` and
//      `instructor_comment` must come through unchanged. An accept that quietly
//      cleared a flag would look like a working button and would erase a
//      verdict an instructor recorded on purpose -- and nothing on the screen
//      that pressed it would show what was lost.
//
//   2. THE GRID'S THREE READS. The free-entry count, the distinct-on that picks
//      a cell's entry, and the counts badge each gained the reviewed dimension
//      separately, so each can be wrong separately. A badge that disagrees with
//      the cell beside it is exactly the kind of wrong number nobody
//      investigates, so the badge is asserted AGAINST the cell it summarizes and
//      both are asserted against a fixture built to known figures.
//
//   3. THE EXCLUSIONS THE GRID ALREADY CARRIED. Drafts (0118) and soft-deleted
//      rows (0116) stay off all three reads. This migration rewrites the whole
//      function body, which is the shape of change that drops a filter, so every
//      one of them is re-run here with 0121 applied.
//
//   4. THE DOOR ACCEPT CLOSES. notebook_delete_entry (0116) and
//      notebook_unsubmit_entry (0118) both refuse once `reviewed_at` is set, so
//      accepting now stops a student deleting or withdrawing their own work.
//      That is the intended consequence; un-accepting must reopen it, and if it
//      ever stopped doing so a student would be locked out of their own entry by
//      an instructor's misclick with no way back.
//
//   5. THE PUBLICATION. Realtime membership is invisible from the app: a table
//      left out of it produces a console that simply never updates, which reads
//      as a slow network rather than a missing migration.
//
// EVERY EXCLUSION ASSERTION CARRIES A POSITIVE CONTROL and reports both counts
// (the 0116 convention).

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

/** The chain the live project carries, through this migration. */
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
	'0121_notebook_review_acknowledged.sql'
] as const;

/** The same chain stopping one short: what section 6 applies 0121 over. */
const PRE_CHAIN = CHAIN.filter((m) => m !== '0121_notebook_review_acknowledged.sql');

const MIGRATION_0121 = readFileSync(
	fileURLToPath(
		new URL('../supabase/migrations/0121_notebook_review_acknowledged.sql', import.meta.url)
	),
	'utf8'
);

let db: TestDb;

let owner: SeededUser; // the pinned admin (0067's admin_owner_email)
let teacher: SeededUser; // teacher of record for P1
let otherTeacher: SeededUser; // teacher of record for P2, and nothing of P1
let ada: SeededUser; // student, enrolled in P1
let ben: SeededUser; // student, enrolled in P1
let cara: SeededUser; // student, enrolled in P1 -- the empty-cell control

let p1: string;
let p2: string;
let session1: string; // the check-in every cell assertion measures
let session2: string; // the excused day

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function rpc<T>(user: SeededUser, call: string, params: unknown[] = []): Promise<T> {
	const { rows } = await db.asUser(user.id, (q) =>
		q<{ result: T }>(`select ${call} as result`, params)
	);
	return rows[0].result;
}

async function captureError(run: () => Promise<unknown>): Promise<string> {
	try {
		await run();
	} catch (error) {
		return (error as { message?: string }).message ?? String(error);
	}
	throw new Error('Expected this statement to be rejected, but it succeeded.');
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

const accept = (as: SeededUser, entryId: string) =>
	rpc<{ ok: boolean; entry_id: string; status: string; reviewed_at: string | null }>(
		as,
		'public.notebook_accept_entry($1)',
		[entryId]
	);

const unaccept = (as: SeededUser, entryId: string) =>
	rpc<{ ok: boolean; entry_id: string; status: string; reviewed_at: string | null }>(
		as,
		'public.notebook_unaccept_entry($1)',
		[entryId]
	);

interface Cell {
	student_key: string;
	session_id: string;
	status: string;
	entry_id: string | null;
	entry_count: number;
	unreviewed_count: number;
	reviewed: boolean | null;
	reviewed_at: string | null;
	excused: boolean;
	flag_reason: string | null;
}

interface Student {
	student_key: string;
	free_entries: number;
	free_entries_unreviewed: number;
}

interface Grid {
	students: Student[];
	cells: Cell[];
}

async function grid(as: SeededUser, sectionId: string, unit: number | null = null): Promise<Grid> {
	return rpc<Grid>(as, 'public.notebook_get_section_grid($1, $2::integer)', [sectionId, unit]);
}

const cellFor = (g: Grid, student: SeededUser, sessionId: string): Cell =>
	g.cells.find((c) => c.student_key === student.email && c.session_id === sessionId)!;

const studentRow = (g: Grid, student: SeededUser): Student =>
	g.students.find((s) => s.student_key === student.email)!;

/** The whole row as the database holds it. Owner read: no RLS in the way. */
async function rowOf(entryId: string): Promise<Record<string, unknown>> {
	const { rows } = await db.sql(`select * from public.notebook_entries where id = $1`, [entryId]);
	return rows[0] as Record<string, unknown>;
}

interface Payload {
	entries: { id: string }[];
	deleted_entries: { id: string }[];
	activity: { id: string }[];
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	owner = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	teacher = await createUser(db, 'teacher@boscotech.edu', 'Terry Teacher');
	otherTeacher = await createUser(db, 'other@boscotech.edu', 'Olive Other');
	ada = await createUser(db, 'ada@boscotech.net', 'Ada Pike');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben Okafor');
	cara = await createUser(db, 'cara@boscotech.net', 'Cara Nunez');

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

	for (const [student, name] of [
		[ada, 'Pike, Ada'],
		[ben, 'Okafor, Ben'],
		[cara, 'Nunez, Cara']
	] as const) {
		await enrollStudent(db, { as: teacher, sectionId: p1, email: student.email, displayName: name });
	}

	session1 = (
		await rpc<{ session_id: string }>(
			teacher,
			'public.notebook_admin_upsert_session($1::uuid[], $2, $3::date, $4)',
			[[p1], 1, '2026-08-10', 'Gearbox teardown']
		)
	).session_id;
	session2 = (
		await rpc<{ session_id: string }>(
			teacher,
			'public.notebook_admin_upsert_session($1::uuid[], $2, $3::date, $4)',
			[[p1], 1, '2026-08-11', 'Bearing press']
		)
	).session_id;
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 1. The migration file itself.
// ---------------------------------------------------------------------------

describe('the migration file', () => {
	it('re-applies cleanly, twice', async () => {
		// Migrations here are pasted in by hand, so a re-run is ordinary (0088's
		// lesson) and a file that only works once fails exactly then.
		await db.sql(MIGRATION_0121);
		await db.sql(MIGRATION_0121);
	});

	it('leaves exactly ONE overload of each function', async () => {
		// THE SIGNATURE TRAP. notebook_get_section_grid keeps its arity here, so
		// `create or replace` is correct -- but a second row would mean PostgREST
		// could not resolve the call at all, which is the failure that breaks the
		// client rather than quietly serving it.
		for (const name of [
			'notebook_accept_entry',
			'notebook_unaccept_entry',
			'notebook_get_section_grid'
		]) {
			const { rows } = await db.sql<{ n: string; args: string }>(
				`select count(*)::text as n,
				        string_agg(pg_get_function_identity_arguments(p.oid), ' | ') as args
				   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				  where n.nspname = 'public' and p.proname = $1`,
				[name]
			);
			expect([name, rows[0].n], `${name}: ${rows[0].args}`).toEqual([name, '1']);
		}

		const { rows: gridArgs } = await db.sql<{ types: string[] }>(
			`select array(select format_type(t, null) from unnest(p.proargtypes) t) as types
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'notebook_get_section_grid'`
		);
		expect(gridArgs[0].types).toEqual(['uuid', 'integer']);
	});

	it('both new functions are SECURITY DEFINER with a pinned search_path', async () => {
		const { rows } = await db.sql<{ proname: string; prosecdef: boolean; config: string[] }>(
			`select p.proname, p.prosecdef, p.proconfig as config
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public'
			    and p.proname in ('notebook_accept_entry', 'notebook_unaccept_entry')`
		);
		expect(rows).toHaveLength(2);
		for (const row of rows) {
			expect(row.prosecdef, `${row.proname} is security definer`).toBe(true);
			expect(
				(row.config ?? []).some((c) => c.startsWith('search_path=')),
				`${row.proname} pins search_path`
			).toBe(true);
		}
	});

	it('grants execute to authenticated and to nobody else', async () => {
		for (const name of ['notebook_accept_entry', 'notebook_unaccept_entry']) {
			const { rows } = await db.sql<{ grantee: string }>(
				`select grantee from information_schema.role_routine_grants
				  where routine_schema = 'public' and routine_name = $1
				  order by grantee`,
				[name]
			);
			const grantees = rows.map((r) => r.grantee).filter((g) => g !== 'postgres');
			// GONE: anon and PUBLIC. THERE: authenticated.
			expect([name, grantees.includes('anon'), grantees.includes('PUBLIC')]).toEqual([
				name,
				false,
				false
			]);
			expect([name, grantees.includes('authenticated')]).toEqual([name, true]);
		}
	});
});

// ---------------------------------------------------------------------------
// 2. What accept writes, and what it must leave alone.
// ---------------------------------------------------------------------------

describe('accepting an entry', () => {
	it('stamps reviewed_by and reviewed_at, and changes NOTHING else on the row', async () => {
		const entry = await newEntry(ada, { sectionId: p1, label: 'Untouched fields' });
		const before = await rowOf(entry);

		const result = await accept(teacher, entry);
		expect(result.ok).toBe(true);
		expect(result.status).toBe('compliant');
		expect(result.reviewed_at).toBeTruthy();

		const after = await rowOf(entry);
		// COLUMN BY COLUMN, over whatever columns the table has -- so a future
		// column this function starts writing is caught without editing a list.
		const changed = Object.keys(after).filter(
			(k) => JSON.stringify(after[k]) !== JSON.stringify(before[k])
		);
		expect(changed.sort()).toEqual(['reviewed_at', 'reviewed_by']);
		expect(after.reviewed_by).toBe(teacher.id);
	});

	it('leaves a FLAG standing: status, flag_reason and instructor_comment survive', async () => {
		// The one that would be invisible. Accepting a flagged entry records that
		// somebody looked at it again; it is not a way to withdraw the flag.
		const entry = await newEntry(ben, { sectionId: p1, label: 'Flagged then accepted' });
		await rpc(teacher, 'public.notebook_flag_entry($1, $2, $3)', [
			entry,
			'illegible',
			'Photograph is out of focus.'
		]);
		const before = await rowOf(entry);
		expect([before.status, before.flag_reason, before.instructor_comment]).toEqual([
			'flagged',
			'illegible',
			'Photograph is out of focus.'
		]);

		const result = await accept(owner, entry);
		// The RETURN reports the status it found, not a status it set.
		expect(result.status).toBe('flagged');

		const after = await rowOf(entry);
		expect([after.status, after.flag_reason, after.instructor_comment]).toEqual([
			'flagged',
			'illegible',
			'Photograph is out of focus.'
		]);
		// ...and the stamp moved to whoever just looked.
		expect(after.reviewed_by).toBe(owner.id);
	});

	it('leaves a RESOLVED entry’s comment alone', async () => {
		const entry = await newEntry(ben, { sectionId: p1, label: 'Resolved then accepted' });
		await rpc(teacher, 'public.notebook_flag_entry($1, $2, $3)', [entry, 'not_dated', 'Add a date.']);
		await rpc(teacher, 'public.notebook_resolve_entry($1, $2)', [entry, 'Dated now, thank you.']);
		const before = await rowOf(entry);

		await accept(teacher, entry);
		const after = await rowOf(entry);
		const changed = Object.keys(after).filter(
			(k) => JSON.stringify(after[k]) !== JSON.stringify(before[k])
		);
		// reviewed_by is the same person here, so only the timestamp moves.
		expect(changed).toEqual(['reviewed_at']);
		expect(after.instructor_comment).toBe('Dated now, thank you.');
		expect(after.status).toBe('compliant');
	});

	it('re-accepting moves the stamp to the second reviewer', async () => {
		const entry = await newEntry(ada, { sectionId: p1, label: 'Two reviewers' });
		await accept(teacher, entry);
		const first = await rowOf(entry);
		await accept(owner, entry);
		const second = await rowOf(entry);
		expect([first.reviewed_by, second.reviewed_by]).toEqual([teacher.id, owner.id]);
		expect(
			(second.reviewed_at as Date).getTime() >= (first.reviewed_at as Date).getTime()
		).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 3. The gate, and the refusals.
// ---------------------------------------------------------------------------

describe('who may accept, and what cannot be accepted', () => {
	it('refuses a DRAFT and a DELETED entry, and accepts the turned-in one', async () => {
		const draft = await newEntry(ada, { submitted: false, sectionId: p1, label: 'Draft' });
		const removed = await newEntry(ada, { sectionId: p1, label: 'Deleted' });
		await rpc(ada, 'public.notebook_delete_entry($1)', [removed]);
		const live = await newEntry(ada, { sectionId: p1, label: 'Turned in' });

		expect(await captureError(() => accept(teacher, draft))).toContain('has not been turned in');
		expect(await captureError(() => accept(teacher, removed))).toContain('has been deleted');
		// THE POSITIVE CONTROL: the same caller, the same call, on a row that is
		// neither -- so the two refusals are about the ROW and not about the gate.
		expect((await accept(teacher, live)).ok).toBe(true);

		// Neither refusal wrote anything.
		expect([(await rowOf(draft)).reviewed_at, (await rowOf(removed)).reviewed_at]).toEqual([
			null,
			null
		]);
	});

	it('refuses everyone who does not manage the class, and allows the admin', async () => {
		const entry = await newEntry(ada, { sectionId: p1, label: 'Gate probe' });

		for (const [who, user] of [
			['the other teacher', otherTeacher],
			['the student who owns it', ada],
			['another student', ben]
		] as const) {
			const message = await captureError(() => accept(user, entry));
			expect([who, message.includes('Only the section instructor')]).toEqual([who, true]);
			expect([who, await unaccept(user, entry).then(() => 'allowed', () => 'refused')]).toEqual([
				who,
				'refused'
			]);
		}
		expect((await rowOf(entry)).reviewed_at).toBeNull();

		// The pinned owner manages every section (0067): the control that the
		// refusals above are about WHO rather than about the call.
		expect((await accept(owner, entry)).ok).toBe(true);
	});

	it('tells an outsider nothing about a draft they may not see', async () => {
		// Probing must reveal nothing: the authorization refusal comes FIRST, so
		// an outsider gets the outsider's message whatever shape the row is in.
		const draft = await newEntry(ada, { submitted: false, sectionId: p1, label: 'Hidden draft' });
		const message = await captureError(() => accept(otherTeacher, draft));
		expect(message).toContain('Only the section instructor');
		expect(message).not.toContain('turned in');
	});

	it('refuses an entry that does not exist, and a null id', async () => {
		expect(
			await captureError(() => accept(teacher, '00000000-0000-0000-0000-000000000000'))
		).toContain('does not exist');
		expect(
			await captureError(() =>
				rpc(teacher, 'public.notebook_accept_entry($1::uuid)', [null])
			)
		).toContain('Which entry?');
	});

	it('a free entry with no section is admin-only, exactly as flagging one is', async () => {
		// Not a new rule: classroom_manages_section(null) is is_admin() and always
		// has been. Asserted so a later widening of the gate is a deliberate act.
		const free = await newEntry(ada, { label: 'No section at all' });
		expect(await captureError(() => accept(teacher, free))).toContain(
			'Only the section instructor'
		);
		expect((await accept(owner, free)).ok).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 4. Un-accepting.
// ---------------------------------------------------------------------------

describe('un-accepting an entry', () => {
	it('clears BOTH columns and touches nothing else', async () => {
		const entry = await newEntry(ada, { sectionId: p1, label: 'Round trip' });
		const pristine = await rowOf(entry);
		await accept(teacher, entry);
		expect((await rowOf(entry)).reviewed_by).toBe(teacher.id);

		const result = await unaccept(teacher, entry);
		expect([result.ok, result.reviewed_at]).toEqual([true, null]);

		const after = await rowOf(entry);
		// Byte for byte back to where it started, over every column.
		expect(after).toEqual(pristine);
	});

	it('is a no-op, not an error, on an entry nobody has accepted', async () => {
		// A second click on Undo asks for a state that already holds.
		const entry = await newEntry(ada, { sectionId: p1, label: 'Never accepted' });
		expect((await unaccept(teacher, entry)).ok).toBe(true);
		expect((await unaccept(teacher, entry)).ok).toBe(true);
		expect((await rowOf(entry)).reviewed_at).toBeNull();
	});

	it('REFUSES a flagged entry, so a flag can never lose its reviewer', async () => {
		const entry = await newEntry(ben, { sectionId: p1, label: 'Flagged, undo attempt' });
		await rpc(teacher, 'public.notebook_flag_entry($1, $2, null)', [entry, 'insufficient_detail']);

		const message = await captureError(() => unaccept(teacher, entry));
		expect(message).toContain('flagged');
		expect(message).toContain('Resolve the flag');
		expect((await rowOf(entry)).reviewed_at).not.toBeNull();

		// THE WAY BACK IS resolve, and after it the undo works: the refusal is
		// about the flag, not about the entry.
		await rpc(teacher, 'public.notebook_resolve_entry($1, null)', [entry]);
		expect((await unaccept(teacher, entry)).ok).toBe(true);
		expect((await rowOf(entry)).reviewed_at).toBeNull();
	});

	it('refuses a draft and a deleted entry, the same way accept does', async () => {
		const draft = await newEntry(ada, { submitted: false, sectionId: p1, label: 'Undo a draft' });
		const removed = await newEntry(ada, { sectionId: p1, label: 'Undo a deleted one' });
		await rpc(ada, 'public.notebook_delete_entry($1)', [removed]);

		expect(await captureError(() => unaccept(teacher, draft))).toContain('has not been turned in');
		expect(await captureError(() => unaccept(teacher, removed))).toContain('has been deleted');
	});
});

// ---------------------------------------------------------------------------
// 5. THE DOOR ACCEPT CLOSES, and the one that reopens it.
//
// This is the behaviour change 0121 makes outside its own file: two existing
// student-facing refusals read `reviewed_at`, and until now only a flag or a
// resolve could set it.
// ---------------------------------------------------------------------------

describe('what acceptance costs the student', () => {
	it('closes their own delete, and un-accepting reopens it', async () => {
		const entry = await newEntry(ada, { sectionId: p1, label: 'Delete after review' });

		// BEFORE: the student may delete their own entry. (The control, on a
		// second entry, so the one under test survives to be refused.)
		const control = await newEntry(ada, { sectionId: p1, label: 'Deletable control' });
		expect(await rpc<{ ok: boolean }>(ada, 'public.notebook_delete_entry($1)', [control])).toEqual(
			expect.objectContaining({ ok: true })
		);

		await accept(teacher, entry);
		const refused = await captureError(() =>
			rpc(ada, 'public.notebook_delete_entry($1)', [entry])
		);
		expect(refused).toContain('already reviewed');
		expect((await rowOf(entry)).deleted_at).toBeNull();

		await unaccept(teacher, entry);
		expect(
			await rpc<{ ok: boolean }>(ada, 'public.notebook_delete_entry($1)', [entry])
		).toEqual(expect.objectContaining({ ok: true }));
	});

	it('closes their own take-it-back, and un-accepting reopens it', async () => {
		const entry = await newEntry(ada, { sectionId: p1, label: 'Unsubmit after review' });
		await accept(teacher, entry);

		const refused = await captureError(() =>
			rpc(ada, 'public.notebook_unsubmit_entry($1)', [entry])
		);
		expect(refused).toContain('already reviewed');
		expect((await rowOf(entry)).submitted_at).not.toBeNull();

		await unaccept(teacher, entry);
		expect(
			await rpc<{ ok: boolean }>(ada, 'public.notebook_unsubmit_entry($1)', [entry])
		).toEqual(expect.objectContaining({ ok: true }));
		expect((await rowOf(entry)).submitted_at).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 6. The grid: five states, and a badge that agrees with the cell beside it.
//
// A CLASS OF ITS OWN, with its own students, so every number below is an
// ABSOLUTE built to a known figure rather than a delta measured against
// whatever earlier cases in this file left lying around.
// ---------------------------------------------------------------------------

describe('the grid', () => {
	let sectionId: string;
	let checkIn: string;
	let excusedDay: string;
	let dana: SeededUser; // two entries, one accepted -- the partial badge
	let evan: SeededUser; // one entry, flagged
	let fern: SeededUser; // nothing filed
	let gus: SeededUser; // one entry, accepted
	let danaNewest: string;
	let evanEntry: string;
	let gusEntry: string;

	beforeAll(async () => {
		sectionId = await createClassroomSection(db, {
			as: owner,
			courseCode: 'IDEA300',
			courseTitle: 'Grid States',
			label: 'Period 6',
			teacherEmail: teacher.email
		});
		dana = await createUser(db, 'dana@boscotech.net', 'Dana Ruiz');
		evan = await createUser(db, 'evan@boscotech.net', 'Evan Marsh');
		fern = await createUser(db, 'fern@boscotech.net', 'Fern Ito');
		gus = await createUser(db, 'gus@boscotech.net', 'Gus Palmer');
		for (const [student, name] of [
			[dana, 'Ruiz, Dana'],
			[evan, 'Marsh, Evan'],
			[fern, 'Ito, Fern'],
			[gus, 'Palmer, Gus']
		] as const) {
			await enrollStudent(db, {
				as: teacher,
				sectionId,
				email: student.email,
				displayName: name
			});
		}

		checkIn = (
			await rpc<{ session_id: string }>(
				teacher,
				'public.notebook_admin_upsert_session($1::uuid[], $2, $3::date, $4)',
				[[sectionId], 2, '2026-09-01', 'Sprocket layout']
			)
		).session_id;
		excusedDay = (
			await rpc<{ session_id: string }>(
				teacher,
				'public.notebook_admin_upsert_session($1::uuid[], $2, $3::date, $4)',
				[[sectionId], 2, '2026-09-02', 'Field trip']
			)
		).session_id;

		// Dana: TWO entries against the check-in. The older one is accepted, the
		// newer one is not -- so the cell reads unreviewed while the badge has to
		// report 1 of 2 outstanding. A reviewed dimension taken only from the
		// picked entry would say 0 of 2 and nobody would ever notice.
		const danaOlder = await newEntry(dana, { sectionId, sessionId: checkIn, file: 'dana-1' });
		danaNewest = await newEntry(dana, { sectionId, sessionId: checkIn, file: 'dana-2' });
		await accept(teacher, danaOlder);

		evanEntry = await newEntry(evan, { sectionId, sessionId: checkIn, file: 'evan-1' });
		await rpc(teacher, 'public.notebook_flag_entry($1, $2, null)', [evanEntry, 'illegible']);

		gusEntry = await newEntry(gus, { sectionId, sessionId: checkIn, file: 'gus-1' });
		await accept(teacher, gusEntry);

		// Fern files nothing but a DRAFT, and is excused from the other day.
		await newEntry(fern, {
			submitted: false,
			sectionId,
			sessionId: checkIn,
			file: 'fern-draft'
		});
		// Excusing is ADMIN-tier, not teacher-tier (0069), so the owner runs it.
		await rpc(owner, 'public.notebook_admin_set_excusal($1, $2, true, null)', [
			excusedDay,
			fern.id
		]);
	});

	it('resolves all five states, each to its own shape', async () => {
		const g = await grid(teacher, sectionId, 2);

		// 1. MISSING -- and this is also the draft case: Fern is holding one.
		expect([
			cellFor(g, fern, checkIn).status,
			cellFor(g, fern, checkIn).entry_id,
			cellFor(g, fern, checkIn).entry_count,
			cellFor(g, fern, checkIn).unreviewed_count,
			cellFor(g, fern, checkIn).reviewed,
			cellFor(g, fern, checkIn).reviewed_at
		]).toEqual(['missing', null, 0, 0, null, null]);

		// 2. FILED AND UNREVIEWED, with an accepted sibling behind it.
		const danaCell = cellFor(g, dana, checkIn);
		expect([
			danaCell.status,
			danaCell.entry_id,
			danaCell.entry_count,
			danaCell.unreviewed_count,
			danaCell.reviewed,
			danaCell.reviewed_at
		]).toEqual(['compliant', danaNewest, 2, 1, false, null]);

		// 3. FILED AND ACCEPTED.
		const gusCell = cellFor(g, gus, checkIn);
		expect([gusCell.status, gusCell.entry_id, gusCell.entry_count, gusCell.unreviewed_count]).toEqual(
			['compliant', gusEntry, 1, 0]
		);
		expect(gusCell.reviewed).toBe(true);
		expect(gusCell.reviewed_at).toBeTruthy();

		// 4. FLAGGED -- which is always reviewed, because only a reviewer can set
		// it and un-accepting one is refused.
		const evanCell = cellFor(g, evan, checkIn);
		expect([
			evanCell.status,
			evanCell.flag_reason,
			evanCell.entry_count,
			evanCell.unreviewed_count,
			evanCell.reviewed
		]).toEqual(['flagged', 'illegible', 1, 0, true]);

		// 5. EXCUSED -- 0069's state, untouched, and still not "reviewed".
		const excusedCell = cellFor(g, fern, excusedDay);
		expect([
			excusedCell.status,
			excusedCell.excused,
			excusedCell.entry_id,
			excusedCell.reviewed
		]).toEqual(['excused', true, null, null]);
	});

	it('the badge agrees with the cell it summarizes, on every cell', async () => {
		const g = await grid(teacher, sectionId, 2);
		expect(g.cells.length).toBe(4 * 2); // four students, two check-ins: no vacuous sweep

		for (const cell of g.cells) {
			const where = `${cell.student_key} / ${cell.session_id}`;
			// The badge can never claim more outstanding than there are entries.
			expect(cell.unreviewed_count <= cell.entry_count, `${where} count`).toBe(true);
			if (cell.entry_id === null) {
				// Nothing filed: no count and no verdict about a reviewer.
				expect([where, cell.entry_count, cell.unreviewed_count, cell.reviewed]).toEqual([
					where,
					0,
					0,
					null
				]);
			} else if (cell.unreviewed_count === 0) {
				// Everything filed has been looked at, so the PICKED one has too.
				expect([where, cell.reviewed]).toEqual([where, true]);
			} else if (cell.unreviewed_count === cell.entry_count) {
				// Nothing filed has been looked at, so the picked one has not.
				expect([where, cell.reviewed]).toEqual([where, false]);
			}
			// `reviewed` and `reviewed_at` are one fact spelled two ways.
			expect([where, cell.reviewed], `${where} stamp`).toEqual([
				where,
				cell.entry_id === null ? null : cell.reviewed_at !== null
			]);
		}
	});

	it('accepting the newest entry closes the badge out, and un-accepting reopens it', async () => {
		const before = cellFor(await grid(teacher, sectionId, 2), dana, checkIn);
		expect([before.unreviewed_count, before.reviewed]).toEqual([1, false]);

		await accept(teacher, danaNewest);
		const after = cellFor(await grid(teacher, sectionId, 2), dana, checkIn);
		expect([after.entry_count, after.unreviewed_count, after.reviewed]).toEqual([2, 0, true]);

		await unaccept(teacher, danaNewest);
		const back = cellFor(await grid(teacher, sectionId, 2), dana, checkIn);
		expect([back.entry_count, back.unreviewed_count, back.reviewed]).toEqual([2, 1, false]);
	});

	it('the free-entry counts carry the dimension, and still skip drafts and deletions', async () => {
		// A student of her own, so these are absolute numbers: THREE free entries
		// turned in, one accepted, plus a draft and a deleted one that must not
		// reach either count.
		const hana = await createUser(db, 'hana@boscotech.net', 'Hana Weiss');
		await enrollStudent(db, {
			as: teacher,
			sectionId,
			email: hana.email,
			displayName: 'Weiss, Hana'
		});

		const first = await newEntry(hana, { sectionId, label: 'Sketch 1' });
		await newEntry(hana, { sectionId, label: 'Sketch 2' });
		await newEntry(hana, { sectionId, label: 'Sketch 3' });
		await newEntry(hana, { submitted: false, sectionId, label: 'Sketch draft' });
		const removed = await newEntry(hana, { sectionId, label: 'Sketch removed' });
		await rpc(hana, 'public.notebook_delete_entry($1)', [removed]);

		const before = studentRow(await grid(teacher, sectionId, 2), hana);
		expect([before.free_entries, before.free_entries_unreviewed]).toEqual([3, 3]);

		await accept(teacher, first);
		const after = studentRow(await grid(teacher, sectionId, 2), hana);
		expect([after.free_entries, after.free_entries_unreviewed]).toEqual([3, 2]);

		await unaccept(teacher, first);
		const back = studentRow(await grid(teacher, sectionId, 2), hana);
		expect([back.free_entries, back.free_entries_unreviewed]).toEqual([3, 3]);
	});

	it('the grid is still refused to everyone who does not manage the class', async () => {
		for (const user of [otherTeacher, dana]) {
			expect(await captureError(() => grid(user, sectionId, 2))).toContain(
				'Only the section instructor'
			);
		}
		// THERE: the manager and the admin both read it.
		expect((await grid(teacher, sectionId, 2)).cells.length).toBeGreaterThan(0);
		expect((await grid(owner, sectionId, 2)).cells.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// 7. THE EXCLUSIONS 0116 AND 0118 ALREADY WON, re-run with 0121 applied.
//
// 0121 rewrites the whole grid body, which is the shape of change that drops a
// filter. Each of these is 0118's or 0116's own assertion, re-stated against the
// three reads as they now stand.
// ---------------------------------------------------------------------------

describe('the exclusions the grid already carried', () => {
	let draft: string;
	let live: string;
	let deleted: string;

	beforeAll(async () => {
		live = await newEntry(cara, {
			sectionId: p1,
			sessionId: session1,
			file: 'cara-live'
		});
		draft = await newEntry(cara, { submitted: false, sectionId: p1, label: 'Cara draft' });
		deleted = await newEntry(cara, { sectionId: p1, label: 'Cara deleted' });
		await rpc(cara, 'public.notebook_delete_entry($1)', [deleted]);
	});

	it('a student holding ONLY a draft still reads as missing', async () => {
		const benDraft = await newEntry(ben, {
			submitted: false,
			sectionId: p1,
			sessionId: session2,
			file: 'ben-draft-again'
		});
		const g = await grid(teacher, p1);
		const cell = cellFor(g, ben, session2);
		// GONE: the draft, from all three reads at once.
		expect([cell.status, cell.entry_id, cell.entry_count, cell.unreviewed_count]).toEqual([
			'missing',
			null,
			0,
			0
		]);

		// THERE: turning it in fills the same cell, as unreviewed.
		await rpc(ben, 'public.notebook_submit_entry($1)', [benDraft]);
		const filled = cellFor(await grid(teacher, p1), ben, session2);
		expect([
			filled.status,
			filled.entry_id,
			filled.entry_count,
			filled.unreviewed_count,
			filled.reviewed
		]).toEqual(['compliant', benDraft, 1, 1, false]);

		// AND BACK.
		await rpc(ben, 'public.notebook_unsubmit_entry($1)', [benDraft]);
		const empty = cellFor(await grid(teacher, p1), ben, session2);
		expect([empty.status, empty.entry_id, empty.entry_count, empty.unreviewed_count]).toEqual([
			'missing',
			null,
			0,
			0
		]);
	});

	it('a draft and a deleted entry stay out of BOTH free-entry counts', async () => {
		const before = studentRow(await grid(teacher, p1), cara);
		// Cara filed one check-in entry, one draft and one deleted free entry, so
		// both free-entry numbers are zero...
		expect([before.free_entries, before.free_entries_unreviewed]).toEqual([0, 0]);

		// ...and THERE is the control: one ordinary free entry moves both by one.
		const real = await newEntry(cara, { sectionId: p1, label: 'Cara real' });
		const after = studentRow(await grid(teacher, p1), cara);
		expect([after.free_entries, after.free_entries_unreviewed]).toEqual([1, 1]);
		await rpc(cara, 'public.notebook_delete_entry($1)', [real]);
	});

	it('a DELETED entry is still excluded from the cell it used to hold', async () => {
		const cell = cellFor(await grid(teacher, p1), cara, session1);
		expect([cell.entry_id, cell.entry_count]).toEqual([live, 1]);

		await rpc(teacher, 'public.notebook_staff_delete_entry($1)', [live]);
		const gone = cellFor(await grid(teacher, p1), cara, session1);
		expect([gone.status, gone.entry_id, gone.entry_count, gone.unreviewed_count]).toEqual([
			'missing',
			null,
			0,
			0
		]);

		// THERE: restoring it puts it back, so the exclusion is the stamp and not
		// the row having vanished.
		await rpc(teacher, 'public.notebook_staff_restore_entry($1)', [live]);
		const restored = cellFor(await grid(teacher, p1), cara, session1);
		expect([restored.status, restored.entry_id, restored.entry_count]).toEqual([
			'compliant',
			live,
			1
		]);
	});

	it('the student payload still skips a draft, through BOTH of its callers', async () => {
		const viaReview = await rpc<Payload>(teacher, 'public.notebook_review_student_notebook($1)', [
			cara.email
		]);
		const viaViewAs = await rpc<Payload>(owner, 'public.notebook_view_as_notebook($1)', [
			cara.email
		]);
		for (const [name, payload] of [
			['review', viaReview],
			['view-as', viaViewAs]
		] as const) {
			const ids = payload.entries.map((e) => e.id);
			expect([name, ids.includes(draft), ids.includes(live)]).toEqual([name, false, true]);
			const activity = payload.activity.map((a) => a.id);
			expect([name, activity.includes(draft), activity.includes(live)]).toEqual([
				name,
				false,
				true
			]);
		}
	});

	it('the roster does not put a non-enrolled student on it for a draft', async () => {
		const iris = await createUser(db, 'iris@boscotech.net', 'Iris Vega');
		const irisDraft = await newEntry(iris, {
			submitted: false,
			sectionId: p1,
			label: 'Not in the class'
		});

		const before = await grid(teacher, p1);
		expect(before.students.map((s) => s.student_key)).not.toContain(iris.email);
		// THERE: the enrolled students are on it, so this is not an empty read.
		expect(before.students.map((s) => s.student_key)).toEqual(
			expect.arrayContaining([ada.email, ben.email, cara.email])
		);

		await rpc(iris, 'public.notebook_submit_entry($1)', [irisDraft]);
		expect((await grid(teacher, p1)).students.map((s) => s.student_key)).toContain(iris.email);
	});
});

// ---------------------------------------------------------------------------
// 8. The realtime publication.
//
// The publication is a PLATFORM object: it exists on a real Supabase project and
// does NOT exist in this fixture, so both worlds are exercised here. A missing
// table produces a console that never updates, which reads as a slow network.
// ---------------------------------------------------------------------------

describe('the realtime publication', () => {
	const TABLES = ['notebook_entries', 'notebook_entry_photos', 'notebook_entry_notes'];

	it('does nothing at all where no publication exists', async () => {
		// The fixture is that world, and the whole chain has already been applied
		// to it in beforeAll -- twice more in section 1. Not raising is the
		// assertion; this states what it proves.
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_publication where pubname = 'supabase_realtime'`
		);
		expect(rows[0].n).toBe('0');
	});

	it('adds exactly the three tables, and re-applying adds nothing', async () => {
		const fresh = await startTestDb(PRE_CHAIN);
		try {
			// A publication shaped like the platform's: created empty, the way a
			// project that has never published a notebook table looks.
			await fresh.sql(`create publication supabase_realtime`);
			await fresh.sql(MIGRATION_0121);

			const published = async () =>
				(
					await fresh.sql<{ tablename: string }>(
						`select tablename from pg_publication_tables
						  where pubname = 'supabase_realtime' and schemaname = 'public'
						  order by tablename`
					)
				).rows.map((r) => r.tablename);

			expect(await published()).toEqual([...TABLES].sort());

			// IDEMPOTENT: a re-paste is ordinary, and `alter publication ... add
			// table` raises 42710 on a table already in it.
			await fresh.sql(MIGRATION_0121);
			expect(await published()).toEqual([...TABLES].sort());
		} finally {
			await fresh.stop();
		}
	});

	it('leaves a table somebody already published alone, and adds the rest', async () => {
		const fresh = await startTestDb(PRE_CHAIN);
		try {
			// The dashboard is editable, so a project can already have one of these
			// published by hand. That is the state the inner guard is for.
			await fresh.sql(`create publication supabase_realtime for table public.notebook_entries`);
			await fresh.sql(MIGRATION_0121);

			const { rows } = await fresh.sql<{ tablename: string }>(
				`select tablename from pg_publication_tables
				  where pubname = 'supabase_realtime' and schemaname = 'public' order by tablename`
			);
			expect(rows.map((r) => r.tablename)).toEqual([...TABLES].sort());
		} finally {
			await fresh.stop();
		}
	});

	it('does NOT publish notebook_entry_activity, which is a view', async () => {
		const fresh = await startTestDb(PRE_CHAIN);
		try {
			await fresh.sql(`create publication supabase_realtime`);
			await fresh.sql(MIGRATION_0121);

			const { rows } = await fresh.sql<{ n: string }>(
				`select count(*)::text as n from pg_publication_tables
				  where pubname = 'supabase_realtime' and tablename = 'notebook_entry_activity'`
			);
			expect(rows[0].n).toBe('0');
			// THERE: it exists, and it is a VIEW -- which is why it cannot be in a
			// publication and why the three tables under it are.
			const { rows: kind } = await fresh.sql<{ relkind: string }>(
				`select c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
				  where n.nspname = 'public' and c.relname = 'notebook_entry_activity'`
			);
			expect(kind[0].relkind).toBe('v');
		} finally {
			await fresh.stop();
		}
	});
});

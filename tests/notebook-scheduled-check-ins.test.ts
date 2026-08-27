// tests/notebook-scheduled-check-ins.test.ts
//
// 0140: A CHECK-IN DATED IN THE FUTURE IS `scheduled`, NOT `missing`.
//
// WHY THIS IS A TEST AND NOT A HARNESS DRIVE. The defect it fixes was invisible
// from the inside for months, and every part of it fails the same silent way:
// the number is WRONG rather than absent. `notebook_get_section_grid` reported
// a check-in nobody could have filed against yet as `missing`, so a teacher who
// laid out a unit's five remaining days saw thirty students x five columns of
// dashes, a compliance badge counting all of it as outstanding, every student
// on the "needs a look" list, and a Documentation Check pre-filling a presence
// score out of a denominator that included work that is not due. Nothing on
// screen says a number is wrong; the only way to find out is to know what it
// should have been.
//
// AND THE OTHER DIRECTION IS THE SAME KIND OF SILENT. If `scheduled` ever
// started swallowing a genuinely missing cell -- a `>=` where a `>` belongs, a
// summary that dropped the wrong bucket -- a class that is really behind would
// read as caught up, which nobody investigates either. So every assertion here
// is PAIRED: the state that must stop counting is asserted beside the state
// that must keep counting, on the same fixture, in the same read.
//
// WHAT IS ASSERTED, and where each number comes from:
//
//   1. THE DEFECT ITSELF, measured against the deployed function BEFORE the
//      migration. The chain boots short of 0140, the fixture is seeded through
//      the REAL RPCs, and the pre-migration grid is captured. That is the
//      "before" this bundle is claimed against, rather than a description of it.
//
//   2. 0140 APPLIES OVER THAT DATA, AND RE-APPLIES. Re-pasting is ordinary here.
//
//   3. THE FOUR ARMS OF THE CELL, in the RPC's own precedence order: an entry
//      outranks everything, an excusal outranks the date, a future day with
//      nothing in it is `scheduled`, and a day that HAS arrived with nothing in
//      it is still `missing`.
//
//   4. THE CALENDAR IS AMERICA/LOS_ANGELES, not UTC. The boundary is asserted
//      against the LA day at every hour; the discriminator against UTC only
//      EXISTS during the seven or eight hours a day the two calendars disagree,
//      so that arm is conditional and the test REPORTS whether it ran rather
//      than passing quietly either way.
//
//   5. THE PAYLOAD SHAPE DID NOT MOVE. The key set of a cell, of a student row
//      and of the envelope are compared pre- to post-migration. One existing key
//      gains one possible value; nothing else changes, which is what makes the
//      migration and the client deploy independent of each other.
//
//   6. THE CLIENT SIDE, DRIVEN FROM THE REAL PAYLOAD. `gridSummary`,
//      `summarize`, `presenceScoreFor` and `presenceEvidence` are imported from
//      the shipping modules and handed the grid the real function just returned,
//      so "does not count as outstanding anywhere" is asserted end to end rather
//      than against a hand-built fixture that could disagree with the RPC.
//
//   7. THE GRANTS. A `create or replace` under a hosted Supabase project's
//      default privileges hands the function a fresh `anon` grant, which 0137's
//      one-time sweep does not cover. Asserted off `has_function_privilege`,
//      not off the migration's own self-check.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	CELL_STATES,
	cellDisplay,
	gridSummary,
	summarize,
	type GridCell,
	type SectionGrid
} from '$lib/notebook-review';
import { presenceEvidence, presenceScoreFor } from '$lib/notebook-documentation-check';
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
	'0121_notebook_review_acknowledged.sql',
	// LAST, the sweep over whatever the chain above created. 0140 is applied by
	// hand AFTER it on the real project, and revokes for itself for exactly that
	// reason -- which is what section 7 checks.
	'0137_anon_execute_sweep.sql'
] as const;

const MIGRATION_0140 = readFileSync(
	fileURLToPath(new URL('../supabase/migrations/0140_notebook_scheduled_check_ins.sql', import.meta.url)),
	'utf8'
);

let db: TestDb;

let owner: SeededUser; // the pinned admin (0067's admin_owner_email)
let teacher: SeededUser; // teacher of record for P1
let ada: SeededUser; // files early against the future check-in
let ben: SeededUser; // excused ahead of the future check-in
let cara: SeededUser; // files nothing at all -- the control on every arm

let p1: string;

/**
 * THE CHECK-INS, and each one exists to pin a different arm.
 *
 * The dates are computed from the DATABASE'S OWN America/Los_Angeles day rather
 * than written down: a pinned literal turns into an ordinary past date at some
 * point and the state under test stops being produced, silently.
 *
 * UNIT 3 IS THE FIXTURE AND UNIT 9 IS THE CALENDAR PROBE, and the split is what
 * keeps every count below a constant. A check-in dated the UTC day is dated
 * LA-tomorrow for seven or eight hours a day and LA-today for the rest, so a
 * fixture holding one would make every tally in this file swing on the hour the
 * suite happened to run. It gets a unit of its own, `notebook_get_section_grid`
 * is asked for one unit at a time, and the conditional arithmetic stays inside
 * the one test that is about the boundary.
 */
let laToday = '';
let utcToday = '';
let sesPast = ''; // unit 3, yesterday -- must stay `missing`
let sesToday = ''; // unit 3, TODAY -- must stay `missing` (the boundary)
let sesSoon = ''; // unit 3, tomorrow -- `scheduled`
let sesLater = ''; // unit 3, +10 days -- where Ada files early and Ben is excused
let sesUtcToday = ''; // unit 9, the UTC day: LA-tomorrow for part of each day

/** UNIT 3's grid exactly as it read BEFORE 0140, kept for the shape comparison. */
let before: SectionGrid;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function rpc<T>(user: SeededUser, call: string, params: unknown[] = []): Promise<T> {
	const { rows } = await db.asUser(user.id, (q) => q<{ result: T }>(`select ${call} as result`, params));
	return rows[0].result;
}

/** The fixture unit by default; the calendar probe asks for 9 explicitly. */
const grid = (as: SeededUser, unit: number | null = 3): Promise<SectionGrid> =>
	rpc<SectionGrid>(as, 'public.notebook_get_section_grid($1, $2::integer)', [p1, unit]);

/** A check-in across one section, through the post-0098 RPC. */
async function createSession(date: string, label: string, unit = 3): Promise<string> {
	const result = await rpc<{ session_id: string }>(
		teacher,
		'public.notebook_admin_upsert_session($1::uuid[], $2, $3, $4)',
		[[p1], unit, date, label]
	);
	return result.session_id;
}

/** A turned-in photo entry through the REAL creating RPC. */
async function fileEntry(student: SeededUser, sessionId: string): Promise<string> {
	const result = await rpc<{ entry_id: string }>(
		student,
		'public.notebook_create_entry($1, $2, $3, $4, null, null, null, true)',
		[student.id, `drive-${Math.random().toString(36).slice(2)}`, sessionId, p1]
	);
	return result.entry_id;
}

const cellFor = (g: SectionGrid, student: SeededUser, sessionId: string): GridCell =>
	g.cells.find((c) => c.student_key === student.email && c.session_id === sessionId)!;

const statusFor = (g: SectionGrid, student: SeededUser, sessionId: string): string =>
	cellFor(g, student, sessionId).status;

const summaryFor = (g: SectionGrid, student: SeededUser) =>
	summarize(g).find((s) => s.student.student_key === student.email)!;

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	owner = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	teacher = await createUser(db, 'ines.tructor@boscotech.edu', 'Ines Tructor');
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

	// THE DAYS COME FROM POSTGRES, in the same expression the function uses, so
	// the fixture and the rule under test cannot disagree about where the day
	// boundary is. `en-CA`-shaped `date` values, which is what the column holds.
	const { rows } = await db.sql<{ la: string; utc: string; soon: string; later: string; past: string }>(
		`select (now() at time zone 'America/Los_Angeles')::date::text as la,
		        (now() at time zone 'UTC')::date::text as utc,
		        ((now() at time zone 'America/Los_Angeles')::date + 1)::text as soon,
		        ((now() at time zone 'America/Los_Angeles')::date + 10)::text as later,
		        ((now() at time zone 'America/Los_Angeles')::date - 1)::text as past`
	);
	laToday = rows[0].la;
	utcToday = rows[0].utc;

	sesPast = await createSession(rows[0].past, 'Bearing teardown');
	sesToday = await createSession(laToday, 'Shaft stackup calcs');
	sesSoon = await createSession(rows[0].soon, 'Gearbox reassembly');
	sesLater = await createSession(rows[0].later, 'Fixture inspection');
	sesUtcToday = await createSession(utcToday, 'UTC-dated day', 9);

	// ADA IS THE STUDENT WHO IS COMPLETELY UP TO DATE, which is the case the
	// defect punished: both days that have arrived, plus the +10 day filed early.
	// BEN is excused ahead of that same +10 day and has filed nothing.
	// CARA has filed nothing at all -- the control on every arm, and the student
	// who must go on reading as behind after this migration.
	await fileEntry(ada, sesPast);
	await fileEntry(ada, sesToday);
	await fileEntry(ada, sesLater);
	await rpc(owner, 'public.notebook_admin_set_excusal($1, $2, true, $3)', [
		sesLater,
		ben.id,
		'Away with the robotics team.'
	]);

	before = await grid(teacher);
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 1. The defect, measured against the function as it was deployed.
// ---------------------------------------------------------------------------

describe('before 0140: a future check-in counts against the class', () => {
	it('the fixture really is pre-migration', async () => {
		// A behavioural probe, not a version string: the pre-0140 function has no
		// way to produce this value at all.
		expect(before.cells.some((c) => c.status === 'scheduled')).toBe(false);
	});

	it('every cell of a check-in nobody could have filed reads `missing`', () => {
		for (const student of [ada, ben, cara]) {
			expect(statusFor(before, student, sesSoon)).toBe('missing');
		}
		// Ada filed early, so hers is the one cell of the +10 day that is not.
		expect(statusFor(before, ada, sesLater)).toBe('compliant');
		expect(statusFor(before, ben, sesLater)).toBe('excused');
		expect(statusFor(before, cara, sesLater)).toBe('missing');
	});

	it('and the summary counts them, which is the number the teacher sees', () => {
		const summary = gridSummary(before);
		// Three students x four check-ins = 12 cells. Filed: Ada's three, one of
		// which lands LATE (she files yesterday's check-in today, which is the
		// rule 0094 owns and this file does not touch). Excused: Ben's +10. The
		// other eight are `missing`.
		expect(before.cells.length).toBe(12);
		expect(summary.counts.missing).toBe(8);
		expect(summary.counts.late).toBe(1);
		expect(summary.outstanding).toBe(9);
		// HALF OF THAT IS WORK NOBODY COULD HAVE FILED: tomorrow's check-in for
		// all three, plus Cara's +10 day. The figure comes from the FIXTURE (the
		// dates it was seeded with) rather than from the function being tested.
		const dateOf = new Map(before.sessions.map((x) => [x.id, x.session_date]));
		const future = before.cells.filter(
			(c) => dateOf.get(c.session_id)! > laToday && c.status === 'missing'
		);
		expect(future.length).toBe(4);
	});

	it('and puts a student who is completely up to date on the attention list', () => {
		// ADA IS THE POINT. She has filed every day that has arrived and one that
		// has not, and she is on the "needs a look" list anyway -- because `total`
		// counted a day that has not happened, so `covered < total` is true for a
		// student who owes nothing.
		const summary = gridSummary(before);
		expect(summary.attention.map((s) => s.student.student_key).sort()).toEqual(
			[ada.email, ben.email, cara.email].sort()
		);
		expect(summaryFor(before, ada).total).toBe(4);
		expect(summaryFor(before, ada).covered).toBe(3);
		// The presence pre-fill an instructor would have saved for her: 3 of 4
		// x 7, rounded. She has missed nothing.
		expect(summaryFor(before, ada).presenceScore).toBe(5);
	});
});

// ---------------------------------------------------------------------------
// 2. The migration.
// ---------------------------------------------------------------------------

describe('0140 applies over that data, and re-applies', () => {
	it('applies twice', async () => {
		await db.sql(MIGRATION_0140);
		// Re-pasting a migration is ordinary here (a first attempt that failed
		// partway gets retried), so it has to survive a second pass.
		await db.sql(MIGRATION_0140);
	});

	it('leaves exactly one notebook_get_section_grid, at the same arity', async () => {
		const { rows } = await db.sql<{ n: string; args: string }>(
			`select count(*)::text as n,
			        max(pg_get_function_identity_arguments(p.oid)) as args
			 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
			 where ns.nspname = 'public' and p.proname = 'notebook_get_section_grid'`
		);
		expect(rows[0].n).toBe('1');
		expect(rows[0].args).toBe('p_section_id uuid, p_unit_number integer');
	});
});

// ---------------------------------------------------------------------------
// 3. The four arms, in the RPC's own precedence order.
// ---------------------------------------------------------------------------

describe('after 0140: the cell arms', () => {
	let after: SectionGrid;
	beforeAll(async () => {
		after = await grid(teacher);
	});

	it('a future check-in with nothing filed is `scheduled`', () => {
		for (const student of [ada, ben, cara]) {
			expect(statusFor(after, student, sesSoon)).toBe('scheduled');
		}
		expect(statusFor(after, cara, sesLater)).toBe('scheduled');
	});

	it('a day that HAS arrived with nothing filed is still `missing`', () => {
		// THE POSITIVE CONTROL, and the one that matters most: if this ever went
		// `scheduled` too, a class that is genuinely behind would read as caught
		// up. Yesterday and today, both students who filed nothing.
		expect(statusFor(after, cara, sesPast)).toBe('missing');
		expect(statusFor(after, cara, sesToday)).toBe('missing');
		expect(statusFor(after, ben, sesPast)).toBe('missing');
		expect(statusFor(after, ben, sesToday)).toBe('missing');
	});

	it('an entry outranks the date: filing early is filing', () => {
		expect(statusFor(after, ada, sesLater)).toBe('compliant');
		expect(cellFor(after, ada, sesLater).entry_id).not.toBeNull();
		// And it is ON TIME, because the upload's LA date is at or before the
		// session's -- the rule 0094 already owned, untouched by this file.
		expect(cellFor(after, ada, sesLater).on_time).toBe(true);
	});

	it('an excusal outranks the date', () => {
		expect(statusFor(after, ben, sesLater)).toBe('excused');
		expect(cellFor(after, ben, sesLater).excused).toBe(true);
	});

	it('a scheduled cell carries the same empty shape a missing one does', () => {
		const scheduled = cellFor(after, cara, sesSoon);
		const missing = cellFor(after, cara, sesToday);
		expect(scheduled.entry_id).toBeNull();
		expect(scheduled.entry_count).toBe(0);
		expect(scheduled.on_time).toBeNull();
		expect(scheduled.excused).toBe(false);
		expect(scheduled.flag_reason).toBeNull();
		// Everything except `status` (and the column it is in) reads identically
		// on the two, which is what "the payload only gains a value" means at the
		// level of one cell.
		const bare = (c: GridCell) => ({ ...c, status: null, session_id: null });
		expect(bare(scheduled)).toEqual(bare(missing));
	});
});

// ---------------------------------------------------------------------------
// 4. The calendar.
// ---------------------------------------------------------------------------

describe('the day boundary is America/Los_Angeles', () => {
	it('is inclusive of today: the day a check-in is FOR is due, not scheduled', async () => {
		const after = await grid(teacher);
		expect(statusFor(after, cara, sesToday)).toBe('missing');
	});

	it('names the LA calendar in the function body, and takes the day from it', async () => {
		// The always-biting half. The behavioural discriminator below only exists
		// for the hours the two calendars disagree, so the source assertion is
		// what holds at 9am Pacific.
		const { rows } = await db.sql<{ def: string }>(
			`select pg_get_functiondef(p.oid) as def
			 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
			 where ns.nspname = 'public' and p.proname = 'notebook_get_section_grid'`
		);
		const def = rows[0].def;
		expect(def).toContain("v_today date := (pg_catalog.now() at time zone 'America/Los_Angeles')::date");
		expect(def).toContain('when se.session_date > v_today then');
		// No bare UTC day anywhere in the comparison.
		expect(def).not.toContain('now()::date');
	});

	it('the two calendars really do disagree, at a pinned evening instant', async () => {
		// THE ALWAYS-BITING BEHAVIOURAL HALF. The live probe below can only run
		// the divergence for the seven or eight hours a day it exists, so the
		// divergence itself is asserted here against a FIXED instant instead: 8pm
		// Pacific on a summer evening, which is already the next day in UTC.
		//
		// It is the function's own expression, with the timestamp pinned rather
		// than read -- so it says what `v_today` would have been under each
		// calendar and what the `>` would then have answered for a check-in dated
		// tomorrow-in-LA. If the two ever stopped disagreeing this test would be
		// pointless, and it would say so by failing.
		const { rows } = await db.sql<{ la_day: string; utc_day: string; la: boolean; utc: boolean }>(
			`with at_8pm_pacific as (
			   select timestamptz '2026-08-27 20:00:00-07' as t,
			          date '2026-08-28' as tomorrow_in_la
			 )
			 select (t at time zone 'America/Los_Angeles')::date::text as la_day,
			        (t at time zone 'UTC')::date::text as utc_day,
			        (tomorrow_in_la > (t at time zone 'America/Los_Angeles')::date) as la,
			        (tomorrow_in_la > (t at time zone 'UTC')::date) as utc
			 from at_8pm_pacific`
		);
		expect(rows[0].la_day).toBe('2026-08-27');
		expect(rows[0].utc_day).toBe('2026-08-28');
		// The LA rule the migration ships: tomorrow's check-in is SCHEDULED.
		expect(rows[0].la).toBe(true);
		// The UTC rule it refused: the same check-in is already DUE, and every
		// cell of it counts against the class from 5pm Pacific onwards.
		expect(rows[0].utc).toBe(false);
	});

	it('a check-in dated the UTC day is scheduled exactly when LA has not reached it', async () => {
		// UNIT 9, the calendar probe -- see the fixture note. Both arms assert a
		// real outcome, so neither is a pass-by-default; which one runs depends on
		// the hour, and the comparison that decides it is printed into the failure
		// message rather than left for the reader to reconstruct.
		const probe = await grid(teacher, 9);
		expect(probe.sessions.map((x) => x.id)).toEqual([sesUtcToday]);
		const status = statusFor(probe, cara, sesUtcToday);
		expect({ status, laToday, utcToday }).toEqual({
			// UTC ahead of LA (the evening window, 5pm Pacific to midnight UTC --
			// which is exactly when a teacher sets up the next day): a UTC
			// comparison would call this check-in due and count it against the
			// class. The LA one does not.
			status: utcToday > laToday ? 'scheduled' : 'missing',
			laToday,
			utcToday
		});
	});
});

// ---------------------------------------------------------------------------
// 5. The payload shape did not move.
// ---------------------------------------------------------------------------

describe('the payload is the same shape it was', () => {
	it('gains no key and loses none, at any level', async () => {
		const after = await grid(teacher);
		const keys = (o: object) => Object.keys(o).sort();
		expect(keys(after)).toEqual(keys(before));
		expect(keys(after.cells[0])).toEqual(keys(before.cells[0]));
		expect(keys(after.students[0])).toEqual(keys(before.students[0]));
		expect(keys(after.sessions[0])).toEqual(keys(before.sessions[0]));
		expect(keys(after.section)).toEqual(keys(before.section));
	});

	it('changes exactly the cells whose day has not arrived, and no others', async () => {
		const after = await grid(teacher);
		const key = (c: GridCell) => `${c.student_key}|${c.session_id}`;
		const beforeBy = new Map(before.cells.map((c) => [key(c), c]));
		const moved = after.cells.filter((c) => beforeBy.get(key(c))!.status !== c.status);
		// Every changed cell moved missing -> scheduled and nothing else moved.
		for (const c of moved) {
			expect(beforeBy.get(key(c))!.status).toBe('missing');
			expect(c.status).toBe('scheduled');
		}
		// POSITIVE CONTROL ON THE SWEEP, with the exact figure rather than "more
		// than none": tomorrow's check-in for all three students, plus Cara's
		// +10 day. Ada's early entry and Ben's excusal are the two cells on a
		// future day that must NOT move, and this count is what says they did not.
		expect(moved.length).toBe(4);
		expect(after.cells.length).toBe(before.cells.length);
	});
});

// ---------------------------------------------------------------------------
// 6. The client side, driven from the payload the real function returned.
// ---------------------------------------------------------------------------

describe('scheduled does not count as outstanding anywhere', () => {
	let after: SectionGrid;
	beforeAll(async () => {
		after = await grid(teacher);
	});

	it('cellDisplay renders it as its own state', () => {
		expect(cellDisplay(cellFor(after, cara, sesSoon))).toBe('scheduled');
		// Paired with the state it must NOT collapse into.
		expect(cellDisplay(cellFor(after, cara, sesToday))).toBe('missing');
	});

	it('the legend carries it, with a glyph and a label of its own', () => {
		const state = CELL_STATES.find((s) => s.key === 'scheduled');
		expect(state).toBeDefined();
		expect(state!.glyph.trim()).not.toBe('');
		expect(state!.label.trim()).not.toBe('');
		expect(state!.hint.trim()).not.toBe('');
		// NO TWO STATES SHARE A GLYPH OR A KEY. The grid is readable without
		// colour only while that holds, and a seventh state is exactly when it
		// stops holding by accident.
		expect(new Set(CELL_STATES.map((s) => s.glyph)).size).toBe(CELL_STATES.length);
		expect(new Set(CELL_STATES.map((s) => s.key)).size).toBe(CELL_STATES.length);
	});

	it('gridSummary counts it separately and leaves it out of `outstanding`', () => {
		const summary = gridSummary(after);
		expect(summary.counts.scheduled).toBe(4);
		// THE PAIR, and both halves are exact. What is genuinely outstanding is
		// Ben's and Cara's yesterday and today -- four missing cells, down from
		// eight -- PLUS Ada's late one, which must go on counting. `outstanding`
		// falls from 9 to 5, and it falls by exactly the cells that are not due.
		expect(summary.counts.missing).toBe(4);
		expect(summary.counts.late).toBe(1);
		expect(summary.outstanding).toBe(5);
		expect(summary.outstanding).toBe(summary.counts.missing + summary.counts.late);
		// And every cell is still in exactly one bucket, so nothing was dropped
		// on the way rather than moved.
		const bucketed = CELL_STATES.reduce((n, st) => n + summary.counts[st.key], 0);
		expect(bucketed).toBe(after.cells.length);
		expect(bucketed).toBe(12);
	});

	it('summarize holds it out of the denominator, PER STUDENT', () => {
		// ADA: the +10 day counts for her, because she filed against it. Three
		// days in her denominator (yesterday, today, +10), three filed, one held
		// out (tomorrow).
		const adaRow = summaryFor(after, ada);
		expect(adaRow.covered).toBe(3);
		expect(adaRow.total).toBe(3);
		expect(adaRow.scheduled).toBe(1);

		// CARA filed nothing, so the same +10 day is held out for HER -- which is
		// the per-student half: the day counts for the student who did the work
		// and not for the one who has not been asked yet.
		const caraRow = summaryFor(after, cara);
		expect(caraRow.covered).toBe(0);
		expect(caraRow.total).toBe(2);
		expect(caraRow.scheduled).toBe(2);

		// BEN's excused day is in his denominator and is not covered, which is
		// the rule 0069 already had and this migration does not touch.
		const benRow = summaryFor(after, ben);
		expect(benRow.total).toBe(3);
		expect(benRow.covered).toBe(0);
		expect(benRow.excused).toBe(1);
		expect(benRow.scheduled).toBe(1);

		// Every student's two halves add back up to the whole column list.
		for (const row of [adaRow, benRow, caraRow]) {
			expect(row.total + row.scheduled).toBe(after.sessions.length);
		}
		// THE PAIR: a student who is genuinely behind still reads as behind.
		expect(caraRow.covered).toBeLessThan(caraRow.total);
	});

	it('a student who is up to date is off the attention list, and the rest stay on it', () => {
		const summary = gridSummary(after);
		const names = summary.attention.map((s) => s.student.student_key).sort();
		// EXACTLY the two students who are actually behind, where before the
		// migration it was all three.
		expect(names).toEqual([ben.email, cara.email].sort());
	});

	it('the presence pre-fill is out of the days that have happened', () => {
		const adaRow = summaryFor(after, ada);
		// Every day that has come due, filed: full marks, where the same function
		// on the same data pre-filled 5 of 7 for her before the migration.
		expect(adaRow.presenceScore).toBe(7);
		expect(presenceScoreFor(adaRow, 7)).toBe(7);
		expect(presenceScoreFor(adaRow, 10)).toBe(10);
		// AND THE EVIDENCE LINE SAYS WHERE THE REST WENT. A denominator that
		// shrank without saying so is a number an instructor cannot check.
		expect(presenceEvidence(adaRow)).toContain('not due yet');
		// The control: a student with nothing scheduled-and-unfiled gets no such
		// clause, so the sentence is not simply always there.
		expect(presenceEvidence({ ...adaRow, scheduled: 0 })).not.toContain('not due yet');
	});
});

// ---------------------------------------------------------------------------
// 7. The grants.
// ---------------------------------------------------------------------------

describe('the replaced function is not open to anon', () => {
	it('is granted to authenticated and to nobody else', async () => {
		const { rows } = await db.sql<{
			anon: boolean;
			authed: boolean;
			service: boolean;
			acl: string | null;
		}>(
			`select has_function_privilege('anon', p.oid, 'execute') as anon,
			        has_function_privilege('authenticated', p.oid, 'execute') as authed,
			        has_function_privilege('service_role', p.oid, 'execute') as service,
			        array_to_string(p.proacl, ' | ') as acl
			 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
			 where ns.nspname = 'public' and p.proname = 'notebook_get_section_grid'`
		);
		// THE ACL ITSELF, not the migration's own verdict on it.
		expect(rows[0].anon).toBe(false);
		expect(rows[0].authed).toBe(true);
		expect(rows[0].service).toBe(false);
		expect(rows[0].acl).toContain('authenticated=X/');
	});
});

// ---------------------------------------------------------------------------
// 8. The gate is still the gate.
// ---------------------------------------------------------------------------

describe('0140 changes nothing about who may read a grid', () => {
	it('a student cannot read their own class’s grid', async () => {
		await expect(grid(ada)).rejects.toThrow(/instructor or a site admin/);
	});

	it('the teacher of record and the owner both can', async () => {
		expect((await grid(teacher)).cells.length).toBe(12);
		expect((await grid(owner)).cells.length).toBe(12);
	});
});

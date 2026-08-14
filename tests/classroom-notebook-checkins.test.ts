// tests/classroom-notebook-checkins.test.ts
//
// Notebook check-ins as they appear inside IDEA Classroom: the class stream
// post, and the outstanding count on the notebook link.
//
// WHAT IS WORTH A TEST HERE, per this repo's rule that automated tests are for
// guarantees whose regression is SILENT:
//
//   1. THE CONSTRAINT. A check-in must never become a submittable, separately
//      graded Classroom assignment. A notebook unit is already graded exactly
//      once, as a Documentation Check assignment through notebook_unit_items ->
//      classroom_submissions (0097); a second scoring path for the same work
//      would break the one-number-per-student guarantee that integration exists
//      for. If this ever regressed, nothing would look broken -- a stream would
//      simply grow a second gradeable thing, and the two numbers would drift
//      apart weeks later in a gradebook. So the flow is driven end to end and
//      the submission, rubric and item tables are asserted UNTOUCHED.
//
//   2. STUDENT-STATUS ISOLATION. The stream shows a student where THEY stand.
//      A leak here shows one student another's filing state while looking
//      completely normal to whoever is testing it, because the page renders a
//      status either way -- the only difference is whose.
//
//   3. THE MULTI-SECTION FAN-OUT. One canonical check-in posted to three
//      classes has to appear in all three streams (0098's whole point), and a
//      regression would quietly drop it from two of them.
//
// The ranking, the card copy and the badge's appearance are pure functions and
// a dev harness; they are deliberately not here, because a test that cannot
// fail dilutes what a red run means.
//
// HOW IT DRIVES THEM. The REAL `load` from the REAL route, against a REAL
// Postgres carrying the REAL migration chain, through the PostgREST shim -- so
// the select strings, the embeds, the RPC argument names and the RLS policies
// are all the shipping ones. An SQL-level re-implementation of the load's
// queries would test this file's idea of the page, not the page.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import {
	isOutstanding,
	outstandingCheckIns,
	streamEntries,
	type ClassCheckIn
} from '../src/lib/classroom/class-check-ins';
import type { ClassroomItem } from '../src/lib/classroom/classroom';
import { load } from '../src/routes/classroom/[sectionId]/+page.server';

/**
 * The chain the live project carries, up to and including the Documentation
 * Check link. 0097 is here specifically so the constraint above has real tables
 * to be asserted empty: without it, "no submission row was created" would be
 * true because the table does not exist.
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
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0088_notebook_folders.sql',
	'0090_classroom_instructor_materials.sql',
	'0091_notebook_pin_and_activity.sql',
	'0094_notebook_classroom_sections.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0097_notebook_documentation_check.sql',
	'0098_notebook_session_postings.sql'
];

let db: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;

let teacher: SeededUser;
/** The pinned owner (0067). Excusing is admin-only, so it takes the chair. */
let owner: SeededUser;
let other: SeededUser;
let alice: SeededUser;
let bruno: SeededUser;
let chloe: SeededUser;

/** Three classes, so the fan-out is a real fan-out. */
let p1: string;
let p2: string;
let p4: string;

/** One canonical check-in, posted to all three. */
let sharedCheckIn: string;
/** A second, in Period 1 only -- so "shared" is not the only shape tested. */
let soloCheckIn: string;

interface LoadResult {
	canManage: boolean;
	items: ClassroomItem[];
	checkIns: ClassCheckIn[];
	sectionOutstanding: number | null;
}

/** Calls the REAL class page load the way SvelteKit would. */
function runLoad(user: SeededUser, sectionId: string): Promise<LoadResult> {
	return (load as unknown as (event: unknown) => Promise<LoadResult>)({
		params: { sectionId },
		locals: {
			supabase: createPostgrestShim(db, fks, user.id),
			claims: { sub: user.id, email: user.email, role: 'authenticated' }
		}
	});
}

const upsertSession = (
	as: SeededUser,
	sectionIds: string[],
	unit: number,
	date: string,
	label: string
) =>
	db.asUser(as.id, async (q) => {
		const { rows } = await q<{ result: { session_id: string } }>(
			'select public.notebook_admin_upsert_session($1::uuid[], $2, $3::date, $4) as result',
			[sectionIds, unit, date, label]
		);
		return rows[0].result.session_id;
	});

const createEntry = (as: SeededUser, sessionId: string | null, sectionId: string | null) =>
	db.asUser(as.id, async (q) => {
		const { rows } = await q<{ result: { entry_id: string } }>(
			'select public.notebook_create_entry($1, $2, $3, $4, $5, $6) as result',
			[as.id, `drive-${as.email}-${sessionId ?? 'free'}`, sessionId, sectionId, null, 'page.jpg']
		);
		return rows[0].result.entry_id;
	});

const countRows = async (table: string, where = 'true') =>
	Number((await db.sql<{ n: string }>(`select count(*) as n from public.${table} where ${where}`)).rows[0].n);

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	fks = await loadForeignKeys(db);

	teacher = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	owner = await createUser(db, 'apina@boscotech.edu', 'Site Owner');
	other = await createUser(db, 'nolan@boscotech.edu', 'N. Olan');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bruno = await createUser(db, 'bruno@boscotech.net', 'Bruno Okafor');
	chloe = await createUser(db, 'chloe@boscotech.net', 'Chloe Tran');

	const section = (label: string) =>
		createClassroomSection(db, {
			as: teacher,
			courseCode: 'ENG1H',
			courseTitle: 'Engineering I Honors',
			label,
			teacherEmail: teacher.email
		});
	p1 = await section('Period 1');
	p2 = await section('Period 2');
	p4 = await section('Period 4');

	// One student per class, so a status crossing a class boundary is visible.
	await enrollStudent(db, { as: teacher, sectionId: p1, email: alice.email, displayName: 'Alice Alvarez' });
	await enrollStudent(db, { as: teacher, sectionId: p1, email: bruno.email, displayName: 'Bruno Okafor' });
	await enrollStudent(db, { as: teacher, sectionId: p2, email: chloe.email, displayName: 'Chloe Tran' });
	await enrollStudent(db, { as: teacher, sectionId: p4, email: alice.email, displayName: 'Alice Alvarez' });

	sharedCheckIn = await upsertSession(teacher, [p1, p2, p4], 3, '2026-08-10', 'Gearbox teardown');
	soloCheckIn = await upsertSession(teacher, [p1], 3, '2026-08-12', 'Shaft stackup calcs');

	// Alice files against the shared check-in in Period 1 and nothing else.
	// Bruno files nothing. Chloe (Period 2) is excused from the shared one.
	await createEntry(alice, sharedCheckIn, p1);
	await db.asUser(owner.id, (q) =>
		q('select public.notebook_admin_set_excusal($1, $2, true, $3)', [
			sharedCheckIn,
			chloe.id,
			'Field trip'
		])
	);
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 1. The constraint: a check-in never becomes a gradeable Classroom item
// ---------------------------------------------------------------------------

describe('a check-in is a notice, never a submittable item', () => {
	it('creates no classroom item, posting, submission or rubric anywhere in the flow', async () => {
		// The flow, driven for real: the teacher's page, both students' pages,
		// and a filing against a check-in from one of them.
		await runLoad(teacher, p1);
		await runLoad(alice, p1);
		await runLoad(bruno, p1);
		await createEntry(bruno, soloCheckIn, p1);
		await runLoad(bruno, p1);

		// Nothing above posted content, so classroom_items is still empty -- a
		// check-in did not become one, and could not have.
		expect(await countRows('classroom_items')).toBe(0);
		expect(await countRows('classroom_postings')).toBe(0);
		// The two tables that carry a grade. A second scoring path for notebook
		// work would land here, and this is the assertion that would redden.
		expect(await countRows('classroom_submissions')).toBe(0);
		expect(await countRows('classroom_rubrics')).toBe(0);
		// And the 0097 link, which is the ONE sanctioned way a notebook unit is
		// graded: still unmade, because surfacing a check-in does not make one.
		expect(await countRows('notebook_unit_items')).toBe(0);
	});

	it('carries no gradeable field on the payload at all', async () => {
		const { checkIns } = await runLoad(alice, p1);
		expect(checkIns.length).toBeGreaterThan(0);
		for (const checkIn of checkIns) {
			// A ClassCheckIn has no shape to grade: nothing a submission, a
			// rubric or a points total could attach to.
			for (const forbidden of ['points', 'due_at', 'kind', 'rubric', 'submission', 'published']) {
				expect(checkIn).not.toHaveProperty(forbidden);
			}
		}
	});

	it('keeps check-ins out of `items`, so nothing downstream can treat one as an item', async () => {
		const { items, checkIns } = await runLoad(alice, p1);
		expect(checkIns.map((c) => c.session_id)).toContain(sharedCheckIn);
		expect(items).toHaveLength(0);

		// And the merged stream keeps them apart by construction: a check-in
		// entry has no `item`, so an item-shaped read of one is a type error
		// rather than a silently wrong render.
		const entries = streamEntries(items, checkIns);
		expect(entries.every((e) => (e.kind === 'check-in' ? !('item' in e) : true))).toBe(true);
		expect(entries.filter((e) => e.kind === 'check-in')).toHaveLength(checkIns.length);
	});
});

// ---------------------------------------------------------------------------
// 2. The fan-out
// ---------------------------------------------------------------------------

describe('a check-in posted to three sections', () => {
	it('appears in all three streams', async () => {
		for (const sectionId of [p1, p2, p4]) {
			const { checkIns } = await runLoad(teacher, sectionId);
			expect(checkIns.map((c) => c.session_id)).toContain(sharedCheckIn);
			// Carrying THIS class's posting, which is what an entry filed from
			// here is keyed on.
			const row = checkIns.find((c) => c.session_id === sharedCheckIn)!;
			expect(row.section_id).toBe(sectionId);
			expect(row.session_label).toBe('Gearbox teardown');
		}
	});

	it('reaches the students of each of those sections', async () => {
		const inP1 = await runLoad(alice, p1);
		const inP2 = await runLoad(chloe, p2);
		expect(inP1.checkIns.map((c) => c.session_id)).toContain(sharedCheckIn);
		expect(inP2.checkIns.map((c) => c.session_id)).toContain(sharedCheckIn);
	});

	it('does not leak a check-in into a class it was not posted to', async () => {
		const { checkIns } = await runLoad(chloe, p2);
		// soloCheckIn runs in Period 1 only.
		expect(checkIns.map((c) => c.session_id)).not.toContain(soloCheckIn);
	});
});

// ---------------------------------------------------------------------------
// 3. Student status isolation -- the leak that would look normal
// ---------------------------------------------------------------------------

describe('a student sees their own status and nobody else’s', () => {
	it('reports filed for the student who filed, and missing for their classmate', async () => {
		const forAlice = await runLoad(alice, p1);
		const forBruno = await runLoad(bruno, p1);

		const aliceShared = forAlice.checkIns.find((c) => c.session_id === sharedCheckIn)!;
		const brunoShared = forBruno.checkIns.find((c) => c.session_id === sharedCheckIn)!;

		// Alice filed against it; Bruno did not. Same check-in, same class, two
		// different answers -- which is the whole property.
		expect(aliceShared.status).toBe('filed');
		expect(brunoShared.status).toBe('missing');
	});

	it('does not let one student’s filing raise or lower another’s count', async () => {
		const forAlice = await runLoad(alice, p1);
		const forBruno = await runLoad(bruno, p1);
		// Alice: shared filed, solo missing -> 1 outstanding.
		// Bruno: shared missing, solo filed (created above) -> 1 outstanding.
		// The counts happen to match; the STATUSES are what must not.
		expect(
			forAlice.checkIns.map((c) => [c.session_id, c.status])
		).not.toEqual(forBruno.checkIns.map((c) => [c.session_id, c.status]));
	});

	it('reports an excusal only to the student it belongs to', async () => {
		const forChloe = await runLoad(chloe, p2);
		const chloeShared = forChloe.checkIns.find((c) => c.session_id === sharedCheckIn)!;
		expect(chloeShared.status).toBe('excused');

		// Alice is in the same shared check-in, in a different class, and is not
		// excused from anything.
		const forAlice = await runLoad(alice, p4);
		const aliceShared = forAlice.checkIns.find((c) => c.session_id === sharedCheckIn)!;
		expect(aliceShared.status).toBe('missing');
	});

	it('scopes a student’s status to the class they are looking at', async () => {
		// Alice filed against the shared check-in in Period 1. Period 4 runs the
		// SAME canonical check-in, and she has filed nothing there.
		const inP1 = await runLoad(alice, p1);
		const inP4 = await runLoad(alice, p4);
		expect(inP1.checkIns.find((c) => c.session_id === sharedCheckIn)!.status).toBe('filed');
		expect(inP4.checkIns.find((c) => c.session_id === sharedCheckIn)!.status).toBe('missing');
	});

	it('gives a MANAGER no personal status, so no card can claim one', async () => {
		const { canManage, checkIns } = await runLoad(teacher, p1);
		expect(canManage).toBe(true);
		expect(checkIns.length).toBeGreaterThan(0);
		for (const checkIn of checkIns) expect(checkIn.status).toBeNull();
		// A null status is never outstanding, so a teacher's cards cannot be
		// counted as personal work.
		expect(outstandingCheckIns(checkIns)).toBe(0);
	});

	it('refuses a foreign class entirely', async () => {
		// `other` teaches nothing here and is enrolled nowhere: the section is
		// unreadable, so the page 404s before any check-in read happens.
		await expect(runLoad(other, p1)).rejects.toMatchObject({ status: 404 });
	});
});

// ---------------------------------------------------------------------------
// 4. The outstanding count
// ---------------------------------------------------------------------------

describe('the outstanding count', () => {
	it('reflects real state and is zero when there is nothing to do', async () => {
		const { checkIns } = await runLoad(alice, p1);
		// Shared: filed. Solo: nothing filed -> outstanding 1.
		expect(outstandingCheckIns(checkIns)).toBe(1);

		// File the remaining one, and the count empties.
		const entryId = await createEntry(alice, soloCheckIn, p1);
		const after = await runLoad(alice, p1);
		expect(outstandingCheckIns(after.checkIns)).toBe(0);

		// A flag puts it back: a flagged entry is asking the student for another
		// page, which is exactly what outstanding means.
		await db.asUser(teacher.id, (q) =>
			q('select public.notebook_flag_entry($1, $2, $3)', [entryId, 'illegible', 'Hard to read'])
		);
		const flagged = await runLoad(alice, p1);
		const row = flagged.checkIns.find((c) => c.session_id === soloCheckIn)!;
		expect(row.status).toBe('flagged');
		expect(row.flag_reason).toBe('illegible');
		expect(outstandingCheckIns(flagged.checkIns)).toBe(1);

		// Resubmitting flips it to awaiting review -- the ball is with the
		// instructor now, so it stops counting against the student.
		await db.asUser(alice.id, (q) =>
			q('select public.notebook_add_photo($1, $2, $3)', [entryId, 'drive-alice-redo', 'original'])
		);
		const resubmitted = await runLoad(alice, p1);
		const redo = resubmitted.checkIns.find((c) => c.session_id === soloCheckIn)!;
		expect(redo.status).toBe('awaiting_review');
		expect(isOutstanding(redo.status)).toBe(false);
		expect(outstandingCheckIns(resubmitted.checkIns)).toBe(0);
	});

	it('gives a manager the class’s own total, from the grid the console summarizes', async () => {
		const { canManage, sectionOutstanding } = await runLoad(teacher, p2);
		expect(canManage).toBe(true);
		// Period 2 has one student (Chloe) and one check-in, and she is excused
		// from it -- so nothing is behind, and the grid says so.
		expect(sectionOutstanding).toBe(0);

		// Period 1 has two students against two check-ins; whatever is behind
		// there, it is a real number from the real grid rather than a null.
		const p1Load = await runLoad(teacher, p1);
		expect(typeof p1Load.sectionOutstanding).toBe('number');
		expect(p1Load.sectionOutstanding).toBeGreaterThan(0);
	});

	it('never gives a student a section-wide number', async () => {
		const { sectionOutstanding } = await runLoad(alice, p1);
		expect(sectionOutstanding).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 5. Nothing changes for a class with no check-ins
// ---------------------------------------------------------------------------

describe('a class with no check-ins', () => {
	it('loads with an empty list, no badge, and its stream untouched', async () => {
		const empty = await createClassroomSection(db, {
			as: teacher,
			courseCode: 'ENG2',
			courseTitle: 'Engineering II',
			label: 'Period 6',
			teacherEmail: teacher.email
		});
		await enrollStudent(db, {
			as: teacher,
			sectionId: empty,
			email: bruno.email,
			displayName: 'Bruno Okafor'
		});
		// One ordinary announcement, so "the stream still works" is about a
		// stream that has something in it.
		await db.asUser(teacher.id, (q) =>
			q(
				`select public.classroom_create_item(
					p_kind => $1, p_section_ids => $2::uuid[], p_title => $3, p_body => $4, p_published => true
				)`,
				['post', [empty], 'Welcome', 'Read the syllabus.']
			)
		);

		// KEEPS THE CONSTRAINT ASSERTIONS HONEST. Those read zero from these same
		// counters; this is the one place a real classroom item is posted, and it
		// proves the counter observes a write rather than always reading empty.
		expect(await countRows('classroom_items')).toBe(1);
		expect(await countRows('classroom_postings')).toBe(1);

		const asStudent = await runLoad(bruno, empty);
		expect(asStudent.checkIns).toEqual([]);
		expect(asStudent.sectionOutstanding).toBeNull();
		expect(outstandingCheckIns(asStudent.checkIns)).toBe(0);

		// The stream is exactly the items, in exactly their order.
		const entries = streamEntries(asStudent.items, asStudent.checkIns);
		expect(entries.map((e) => e.kind)).toEqual(asStudent.items.map(() => 'item'));
		expect(entries.map((e) => (e.kind === 'item' ? e.item.id : null))).toEqual(
			asStudent.items.map((i) => i.id)
		);
	});
});

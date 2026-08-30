// tests/classroom-feed-false-counts.test.ts
//
// THE OUTSTANDING-WORK INDICATOR, AND THE THREE WAYS IT COUNTED WORK THAT DID
// NOT EXIST.
//
// A student reported being told he had work to do when he did not. Three
// separate mechanisms produced that, none of them visible to anybody looking
// at the screen -- a count is believable by construction, and a student has no
// way to tell a wrong one from a right one:
//
//   1. AN UNDATED ASSIGNMENT NEVER STOPPED COUNTING. `isUnsubmitted` reads a
//      MISSING submission row as "not handed in", and `studentReason` returned
//      'unsubmitted' for an assignment with no due date, which `ACTIONABLE`
//      counts. Nothing on a `classroom_items` row says whether it collects a
//      hand-in at all, so an assignment graded on paper or at the bench had no
//      row to find, no deadline to expire, and no way out of the chip -- ever.
//
//   2. A CONCLUDED CLASS KEPT ITS CARD. `classroom_sections.active` is 0083's
//      archive flag; `SECTION_SELECT` carries it and `normalizeSectionRow`
//      preserves it, and NOTHING on the home path read it. RLS does not filter
//      on it either (`classroom_can_read_section` asks about management and
//      enrollment), and archiving deliberately does not unenroll anybody, so
//      last term's overdue rows stayed in this term's count.
//
//   3. A CHECK-IN SCHEDULED FOR NEXT MONTH WAS ALREADY MISSING. `checkInStatus`
//      had no clock, and the class layout load read `notebook_session_postings`
//      with no date bound, so a future check-in came back with no entry against
//      it, resolved to `missing`, and `isOutstanding` counted it.
//
//      THE FIRST FIX WAS A DATE BOUND ON THE READ, AND IT IS GONE. It hid the
//      row rather than naming it, which was the best answer available until
//      `0140` gave the teacher's grid a word for "not asked for yet" -- and a
//      bound that hid a teacher's own scheduled check-in from their own class
//      page was the mistake `0140` explicitly refused to make on the grid. The
//      row is read now and resolves to `scheduled`, which `isOutstanding` does
//      not name, `checkInTone` mutes, and `mergeCheckIns` puts BELOW everything
//      actionable. So section 3 below asserts a count that did not change and a
//      row that did: the number this file exists to protect is identical, and
//      the thing producing it is a status rather than an absence.
//
// WHY THIS IS A TEST AND NOT A HARNESS DRIVE. Every one of these fails in the
// direction nobody investigates: the number is simply larger than it should be
// and looks exactly like real work. And every FIX moves a count DOWNWARDS, so
// the regression risk is now the mirror image -- real work quietly dropping out
// of the count, which is worse than the bug being fixed. So each of the three
// assertions here is PAIRED WITH A POSITIVE CONTROL on the same fixture and in
// the same test: a dated assignment with no submission still counts, an active
// section still appears, a check-in dated today and one dated yesterday still
// count. An over-filtering regression reddens the control, not just the count.
//
// HOW IT DRIVES THEM. The REAL loads and the REAL ranking, against a REAL
// Postgres carrying the REAL migration chain:
//
//   - `src/routes/+page.server.ts` (the home load) and
//     `src/routes/classroom/[sectionId]/+layout.server.ts` (the class load) are
//     imported from their own files and called the way SvelteKit calls them,
//     through the PostgREST shim -- so the select strings, the embeds, the RPC
//     names, the ladders and the RLS policies are the shipping ones.
//   - `buildFeed` is the shipping function, run over what those reads returned.
//
// The one thing NOT driven from a load is the clock: the class load reads
// `new Date()` itself, so the check-in fixture is dated RELATIVE to the real
// America/Los_Angeles day rather than to a frozen one. That is the same
// calendar `notebook_get_section_grid` adjudicates `on_time` in.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
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
	buildFeed,
	isActionable,
	type FeedSubmission,
	type SectionFeed
} from '../src/lib/classroom/feed';
import {
	checkInIsScheduled,
	checkInTone,
	isOutstanding,
	laCalendarDay,
	mergeCheckIns,
	outstandingCheckIns,
	type ClassCheckIn
} from '../src/lib/classroom/class-check-ins';
import type { ClassroomItem, ClassroomSection } from '../src/lib/classroom/classroom';
import { load as homeLoad } from '../src/routes/+page.server';
import { load as classLoad } from '../src/routes/classroom/[sectionId]/+layout.server';

/**
 * The live chain through 0121. The item read's widest rungs (0108/0109/0111)
 * are deliberately absent: `selectItemsWithDoc` degrades to `ITEM_SELECT`,
 * which is a supported production state and changes nothing about any column
 * this file reads. What the chain MUST carry is 0083 (the archive flag and
 * `classroom_set_section_active`), 0086 (submissions) and 0098/0116/0118/0120
 * (check-ins, soft deletion, drafts, item links).
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
	'0098_notebook_session_postings.sql',
	'0106_notebook_instructor_student_access.sql',
	'0114_notebook_note_entry_session.sql',
	'0116_notebook_soft_delete.sql',
	'0117_notebook_soft_delete_restore.sql',
	'0118_notebook_draft_state.sql',
	'0120_notebook_session_item_link.sql',
	'0121_notebook_review_acknowledged.sql',
	// 0138 IS THE FOURTH FALSE COUNT, and this file ran without it until now.
	// The home load calls `loadSectionRoster(supabase, null)` to build
	// `feedManagerEmails`, which `buildFeed` uses to keep an instructor's own
	// hand-in out of their own to-grade tally. Without the migration that call
	// answers PGRST202, `loadSectionRoster` takes its DEGRADE rung, the map is
	// `{}` -- the honest pre-0138 answer -- and the exclusion has never once
	// been exercised through this load. Section 4 below is what that costs.
	'0138_classroom_manager_exclusion_and_enrollment_removal.sql'
] as const;

let db: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;

let teacher: SeededUser;
let alice: SeededUser; // the reporting student: two classes, one archived
let bruno: SeededUser; // a real hand-in, so the teacher's queue is not empty

let current: string; // Period 1, active
let concluded: string; // Period 6, ARCHIVED after seeding

let dated: string; // assignment, past due, alice never handed in -> counts
let dueSoon: string; // assignment, due in 3 days, never handed in -> counts
let undated: string; // assignment, NO due date, no submission -> the bug
let undatedHandedIn: string; // undated, alice DID hand in -> must not count either
let announcement: string; // a post, so the card is not all assignments
/** An undated assignment BRUNO and the TEACHER both hand in -- section 4. */
let managerHandIn: string;
let archivedWork: string; // an overdue assignment in the ARCHIVED class

/** Check-in dates, on the same calendar `session_date` is adjudicated in. */
const laDay = (offsetDays: number): string => {
	const d = new Date(Date.now() + offsetDays * 86_400_000);
	return d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
};

async function rpc<T = Record<string, unknown>>(
	userId: string,
	call: string,
	params: unknown[]
): Promise<T> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

const mkItem = (
	kind: 'post' | 'assignment' | 'material',
	sections: string[],
	title: string,
	dueAt: string | null
) =>
	rpc<{ item_id: string }>(
		teacher.id,
		`public.classroom_create_item($1, $2::uuid[], $3, 'Body.', $4, $5::timestamptz, null, true, '[]'::jsonb, false)`,
		[kind, sections, title, kind === 'assignment' ? 10 : null, dueAt]
	).then((r) => r.item_id);

const upsertSession = (sectionIds: string[], unit: number, date: string, label: string) =>
	rpc<{ session_id: string }>(
		teacher.id,
		'public.notebook_admin_upsert_session($1::uuid[], $2, $3::date, $4)',
		[sectionIds, unit, date, label]
	).then((r) => r.session_id);

// ---------------------------------------------------------------------------
// Driving the two REAL loads
// ---------------------------------------------------------------------------

interface HomeData {
	classroomReady: boolean;
	feedSections: ClassroomSection[];
	feedItems: ClassroomItem[];
	feedSubmissions: FeedSubmission[];
	feedManagerEmails: Record<string, string[]>;
}

/** The REAL home load, called the way SvelteKit calls it. */
function runHomeLoad(user: SeededUser, isAdmin = false): Promise<HomeData> {
	return (homeLoad as unknown as (event: unknown) => Promise<HomeData>)({
		locals: {
			supabase: createPostgrestShim(db, fks, user.id),
			claims: { sub: user.id, email: user.email, role: 'authenticated' }
		},
		parent: async () => ({ isAdmin })
	});
}

interface ClassData {
	canManage: boolean;
	items: ClassroomItem[];
	checkIns: ClassCheckIn[];
	sectionOutstanding: number | null;
}

/** The REAL class layout load, called the way SvelteKit calls it. */
function runClassLoad(user: SeededUser, sectionId: string): Promise<ClassData> {
	return (classLoad as unknown as (event: unknown) => Promise<ClassData>)({
		params: { sectionId },
		locals: {
			supabase: createPostgrestShim(db, fks, user.id),
			claims: { sub: user.id, email: user.email, role: 'authenticated' }
		}
	});
}

/**
 * The home page's own derivation, spelled exactly as `src/routes/+page.svelte`
 * spells it: the load's payload straight into the shipping `buildFeed`.
 */
function feedFor(data: HomeData, user: SeededUser, isAdmin = false, now = new Date()): SectionFeed[] {
	return buildFeed({
		sections: data.feedSections,
		items: data.feedItems,
		submissions: data.feedSubmissions,
		myEmail: user.email,
		isAdmin,
		managerEmails: data.feedManagerEmails,
		now
	});
}

/** The "N to do" chip's number, summed across every card the page renders. */
const chipTotal = (feeds: SectionFeed[]) => feeds.reduce((n, f) => n + f.actionCount, 0);

const cardFor = (feeds: SectionFeed[], sectionId: string) =>
	feeds.find((f) => f.section.id === sectionId);

const reasonForItem = (feeds: SectionFeed[], sectionId: string, itemId: string) =>
	cardFor(feeds, sectionId)?.urgent.find((e) => e.item.id === itemId)?.reason ?? null;

// A clock 3 days before `dueSoon` and after `dated`, so "due soon" is a fact
// about the fixture rather than about when the suite happens to run.
const NOW = new Date('2026-10-15T12:00:00Z');
const OVERDUE_AT = '2026-10-10T07:00:00Z';
const SOON_AT = '2026-10-18T07:00:00Z';

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	fks = await loadForeignKeys(db);

	teacher = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bruno = await createUser(db, 'bruno@boscotech.net', 'Bruno Okafor');

	const section = (label: string) =>
		createClassroomSection(db, {
			as: teacher,
			courseCode: 'ENG1H',
			courseTitle: 'Engineering I Honors',
			label,
			teacherEmail: teacher.email
		});
	current = await section('Period 1');
	concluded = await section('Period 6');

	for (const sectionId of [current, concluded]) {
		await enrollStudent(db, {
			as: teacher,
			sectionId,
			email: alice.email,
			displayName: 'Alice Alvarez'
		});
	}
	await enrollStudent(db, {
		as: teacher,
		sectionId: current,
		email: bruno.email,
		displayName: 'Bruno Okafor'
	});

	// THE MANAGER, ENROLLED IN HER OWN CLASS. Ordinary and common: an instructor
	// adds themselves to see the class the way a student does, or a roster
	// import sweeps them in. It is the state 0138 exists for, and nothing in
	// sections 1 to 3 reads this section's enrollments.
	await enrollStudent(db, {
		as: teacher,
		sectionId: current,
		email: teacher.email,
		displayName: 'T. Vargas'
	});

	dated = await mkItem('assignment', [current], 'Truss bridge sketch', OVERDUE_AT);
	dueSoon = await mkItem('assignment', [current], 'Tolerance worksheet', SOON_AT);
	undated = await mkItem('assignment', [current], 'Bench measurement check', null);
	undatedHandedIn = await mkItem('assignment', [current], 'Shop safety quiz', null);
	announcement = await mkItem('post', [current], 'Field trip permission slips', null);
	// UNDATED on purpose, so it ranks for nobody as a student (section 1 is the
	// proof of that) and section 4's numbers are about the to-grade tally alone.
	managerHandIn = await mkItem('assignment', [current], 'Bench torque log', null);
	archivedWork = await mkItem('assignment', [concluded], 'Last term: final portfolio', OVERDUE_AT);

	// Alice really did hand one thing in, so "no submission row" is a fact about
	// the other items rather than about her account.
	await rpc(alice.id, 'public.classroom_add_submission_file($1::uuid, $2, $3, $4, $5, $6, $7)', [
		undatedHandedIn,
		'drive-alice-safety',
		'safety.jpg',
		'image/jpeg',
		1234,
		null,
		null
	]);
	await rpc(alice.id, 'public.classroom_submit_assignment($1::uuid)', [undatedHandedIn]);

	// And bruno hands in the dated one, so the teacher's card has a real queue
	// that none of these three fixes may touch.
	await rpc(bruno.id, 'public.classroom_add_submission_file($1::uuid, $2, $3, $4, $5, $6, $7)', [
		dated,
		'drive-bruno-truss',
		'truss.jpg',
		'image/jpeg',
		1234,
		null,
		null
	]);
	await rpc(bruno.id, 'public.classroom_submit_assignment($1::uuid)', [dated]);

	// Section 4's pair: bruno's hand-in is real work to grade, the teacher's is
	// her own copy and is not. On the degrade rung the tally cannot tell them
	// apart and answers 2.
	for (const who of [bruno, teacher]) {
		await rpc(who.id, 'public.classroom_add_submission_file($1::uuid, $2, $3, $4, $5, $6, $7)', [
			managerHandIn,
			`drive-${who.email}-torque`,
			'torque.jpg',
			'image/jpeg',
			1234,
			null,
			null
		]);
		await rpc(who.id, 'public.classroom_submit_assignment($1::uuid)', [managerHandIn]);
	}

	// Check-ins in the CURRENT class: one yesterday, one today, one next month.
	// Alice files nothing against any of them, so each resolves on its date
	// alone -- which is the only variable under test.
	await upsertSession([current], 3, laDay(-1), 'Gearbox teardown');
	await upsertSession([current], 3, laDay(0), 'Shaft stackup calcs');
	await upsertSession([current], 4, laDay(30), 'Final assembly photos');

	// The class is archived LAST, so everything above was created against a
	// live section through the ordinary RPCs.
	await rpc(teacher.id, 'public.classroom_set_section_active($1::uuid, false)', [concluded]);
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 1. An assignment with no due date is not actionable
// ---------------------------------------------------------------------------

describe('an assignment with no due date', () => {
	test('does not rank and does not reach the chip, while every dated one still does', async () => {
		const data = await runHomeLoad(alice);
		const feeds = feedFor(data, alice, false, NOW);
		const card = cardFor(feeds, current)!;

		// THE FIX. Neither undated assignment produces a row of any kind: the one
		// with no submission is the reported defect, and the one she DID hand in
		// was already excluded by `isUnsubmitted` and must stay that way.
		expect(reasonForItem(feeds, current, undated)).toBeNull();
		expect(reasonForItem(feeds, current, undatedHandedIn)).toBeNull();
		expect(card.urgent.map((e) => e.item.id)).not.toContain(undated);

		// THE POSITIVE CONTROLS, on the same card and the same read. If the rule
		// ever widens from "no due date" to "no submission row", these three go
		// with it -- so an over-filtering regression cannot pass this test by
		// simply counting nothing.
		expect(reasonForItem(feeds, current, dated)).toBe('overdue');
		expect(reasonForItem(feeds, current, dueSoon)).toBe('due-soon');
		expect(isActionable('overdue')).toBe(true);
		expect(isActionable('due-soon')).toBe(true);
		expect(card.actionCount).toBe(2);

		// The item is READ, ranked out, and not simply missing from the payload:
		// a load that had stopped returning it would satisfy the absence above
		// for entirely the wrong reason.
		expect(data.feedItems.map((i) => i.id)).toContain(undated);
		expect(data.feedItems.find((i) => i.id === undated)?.due_at ?? null).toBeNull();
		expect(data.feedSubmissions.some((s) => s.item_id === undated)).toBe(false);
	});

	test('the announcement beside it is unaffected, so this is a due-date rule and not a kind rule', async () => {
		const data = await runHomeLoad(alice);
		const feeds = feedFor(data, alice, false, NOW);
		// A post has never ranked without a pin or an edit, and still does not --
		// stated so a future change that starts ranking every undated thing has
		// something to redden.
		expect(reasonForItem(feeds, current, announcement)).toBeNull();
		expect(data.feedItems.map((i) => i.id)).toContain(announcement);
	});

	test("the teacher's grading queue is untouched by any of it", async () => {
		const data = await runHomeLoad(teacher);
		const feeds = feedFor(data, teacher, false, NOW);
		const card = cardFor(feeds, current)!;

		// 'unsubmitted' was never a teacher reason, so the queue must be exactly
		// what it was: bruno's hand-in on the dated item, and alice's on the
		// undated one -- an undated assignment that DOES collect work still
		// grades, which is the half this narrowing must not have taken.
		expect(card.urgent.find((e) => e.item.id === dated)?.reason).toBe('ungraded');
		expect(card.urgent.find((e) => e.item.id === dated)?.count).toBe(1);
		expect(card.urgent.find((e) => e.item.id === undatedHandedIn)?.reason).toBe('ungraded');
		expect(card.urgent.find((e) => e.item.id === undatedHandedIn)?.count).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// 2. An archived section leaves the home page entirely
// ---------------------------------------------------------------------------

describe('a concluded class', () => {
	test('leaves the feed, while the live class beside it keeps every row', async () => {
		const data = await runHomeLoad(alice);
		const feeds = feedFor(data, alice, false, NOW);

		// THE FIX, at the payload and at the feed alike -- the section is gone
		// from `feedSections`, so the header's class chip cannot name it either.
		expect(data.feedSections.map((s) => s.id)).not.toContain(concluded);
		expect(feeds.map((f) => f.section.id)).not.toContain(concluded);
		expect(cardFor(feeds, concluded)).toBeUndefined();

		// AND ITS ITEMS ARE NOT FETCHED AT ALL: `sectionIds` feeds the item read,
		// so an overdue assignment in last term's class cannot reach any card,
		// including one it is co-posted to.
		expect(data.feedItems.map((i) => i.id)).not.toContain(archivedWork);

		// THE POSITIVE CONTROL. The live section is still there with its full
		// count, so this is an `active` filter and not an "only the first
		// section" bug or an empty read.
		expect(data.feedSections.map((s) => s.id)).toContain(current);
		expect(cardFor(feeds, current)!.actionCount).toBe(2);
		expect(chipTotal(feeds)).toBe(2);
	});

	test('is still readable by the database, so the filter is ours and not RLS doing it for us', async () => {
		// The decisive direction: the row and the enrollment are both intact and
		// the policies still hand the section back. If this ever became false the
		// test above would pass for a reason that has nothing to do with the fix.
		const rows = await db.asUser(alice.id, async (q) =>
			(
				await q<{ id: string; active: boolean }>(
					'select id, active from public.classroom_sections where id = $1',
					[concluded]
				)
			).rows
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].active).toBe(false);

		const enrolled = await db.asUser(alice.id, async (q) =>
			Number(
				(
					await q<{ n: string }>(
						'select count(*) as n from public.classroom_enrollments where section_id = $1 and lower(student_email) = $2',
						[concluded, alice.email]
					)
				).rows[0].n
			)
		);
		expect(enrolled).toBe(1);
	});

	test('the class page itself still opens, because archiving is not deletion', async () => {
		// Archiving takes a class off the home page. It must NOT take away the
		// work: the roster, the stream and every graded record stay exactly as
		// they were (0083), and a link into last term still resolves.
		const data = await runClassLoad(alice, concluded);
		expect(data.items.map((i) => i.id)).toContain(archivedWork);
	});
});

// ---------------------------------------------------------------------------
// 3. A check-in dated in the future is scheduled, and scheduled is not work
// ---------------------------------------------------------------------------

describe('a check-in scheduled for the future', () => {
	test('is read and named `scheduled`, while today and yesterday still count', async () => {
		const data = await runClassLoad(alice, current);
		const labels = data.checkIns.map((c) => c.session_label).sort();

		// IT IS ON THE PAGE NOW. The date bound that used to drop it is gone, so
		// this is the assertion that reversed: a student sees the same three
		// check-ins their teacher scheduled.
		expect(labels).toEqual(['Final assembly photos', 'Gearbox teardown', 'Shaft stackup calcs']);

		const future = data.checkIns.find((c) => c.session_label === 'Final assembly photos')!;
		expect(future.session_date).toBe(laDay(30));
		expect(future.status).toBe('scheduled');

		// THE FIX, WHICH IS NOW ARITHMETIC RATHER THAN ABSENCE. The row is right
		// there and still does not count.
		expect(isOutstanding(future.status)).toBe(false);

		// AND IT IS NOT TONED AS WORK. `attention` is the tone `missing` and
		// `draft` wear; a row a student cannot act on yet must not wear it.
		expect(checkInTone('scheduled')).toBe('muted');

		// THE POSITIVE CONTROLS. Both of these have no entry filed against them,
		// so they resolve to `missing` for exactly the reason the future one used
		// to -- the ONLY difference is the date. A comparison that filtered on
		// anything else, or that used `>=` where it should use `>`, takes one of
		// them out of the count.
		const due = data.checkIns.filter((c) => c.session_label !== 'Final assembly photos');
		expect(due.map((c) => c.status)).toEqual(['missing', 'missing']);
		expect(due.filter((c) => isOutstanding(c.status))).toHaveLength(2);

		// The badge ClassView actually draws, from this same array. It is the
		// SAME NUMBER the date bound produced, which is the point: the fix moved
		// from the read to the status and the total did not move with it.
		expect(outstandingCheckIns(data.checkIns)).toBe(2);
	});

	test('sorts BELOW everything actionable, which is where the original defect did not put it', async () => {
		// The stream is newest-first and a future date is the newest thing on the
		// page, so an insertion by date puts a check-in nobody has been asked for
		// in the FIRST row a student reads -- which is exactly where the
		// unbounded read used to put it. `mergeCheckIns` appends it instead.
		const data = await runClassLoad(alice, current);
		const entries = mergeCheckIns(data.items, data.checkIns);

		const last = entries[entries.length - 1];
		expect(last.kind).toBe('check-in');
		expect(last.kind === 'check-in' && last.checkIn.session_label).toBe('Final assembly photos');

		// AND IT IS THE ONLY THING DOWN THERE: every other entry, item and
		// check-in alike, is above it. Asserting the index rather than only the
		// tail is what catches a second scheduled row landing mid-list.
		const scheduledAt = entries.findIndex(
			(e) => e.kind === 'check-in' && e.checkIn.status === 'scheduled'
		);
		expect(scheduledAt).toBe(entries.length - 1);

		// THE POSITIVE CONTROL, and it is the one that matters: an ACTIONABLE
		// check-in is still merged by DATE among the items, not swept to the
		// bottom with the scheduled one. A partition that moved every check-in
		// would pass both assertions above and be a different bug.
		//
		// Every item in this fixture was created just now, so all three check-ins
		// are older than all of them and the walk has nothing to place them above
		// -- which is a fixture accident, not the rule. So this ages ONE REAL ROW
		// past the actionable check-ins and re-merges: `mergeCheckIns` is pure, so
		// the aged copy is the same shape the load returned with one field moved.
		const oldest = data.items[data.items.length - 1];
		const aged = data.items.map((i, n) =>
			n === data.items.length - 1
				? { ...i, created_at: `${laDay(-5)}T12:00:00.000Z`, pinned: false }
				: i
		);
		const control = mergeCheckIns(aged, data.checkIns);
		const agedAt = control.findIndex((e) => e.kind === 'item' && e.item.id === oldest.id);
		const gearboxAt = control.findIndex(
			(e) => e.kind === 'check-in' && e.checkIn.session_label === 'Gearbox teardown'
		);
		expect(agedAt).toBeGreaterThanOrEqual(0);
		// Dated yesterday, so it belongs ABOVE a five-day-old item, and it is
		// there.
		expect(gearboxAt).toBeLessThan(agedAt);
		// And the scheduled one is still below that item, at the very end.
		expect(control[control.length - 1].kind).toBe('check-in');
		expect(
			control[control.length - 1].kind === 'check-in' &&
				(control[control.length - 1] as { checkIn: ClassCheckIn }).checkIn.status
		).toBe('scheduled');
		expect(agedAt).toBeLessThan(control.length - 1);
	});

	test('is on the roster grid too, so nothing about the schedule changed', async () => {
		// The decisive direction: the check-in exists, is posted to this class,
		// and the database hands it back to a plain read. Nothing deleted it and
		// nothing moved its date -- only what the page does with it changed.
		const rows = await db.asUser(alice.id, async (q) =>
			(
				await q<{ session_label: string; session_date: string }>(
					`select s.session_label, s.session_date::text as session_date
					   from public.notebook_session_postings p
					   join public.notebook_sessions s on s.id = p.session_id
					  where p.section_id = $1
					  order by s.session_date`,
					[current]
				)
			).rows
		);
		expect(rows.map((r) => r.session_label)).toEqual([
			'Gearbox teardown',
			'Shaft stackup calcs',
			'Final assembly photos'
		]);
		expect(rows[2].session_date > laDay(0)).toBe(true);
	});

	test('a check-in dated today counts, which is the boundary the comparison is written on', async () => {
		const data = await runClassLoad(alice, current);
		const today = data.checkIns.find((c) => c.session_date === laDay(0));
		expect(today).toBeDefined();
		expect(today!.session_label).toBe('Shaft stackup calcs');
		expect(today!.status).toBe('missing');
		expect(isOutstanding(today!.status)).toBe(true);
		// The predicate itself, at the same boundary: today is not scheduled.
		expect(checkInIsScheduled(laDay(0), laDay(0))).toBe(false);
		expect(checkInIsScheduled(laDay(1), laDay(0))).toBe(true);
	});

	test("the manager sees it too, and it is the one status a manager carries", async () => {
		// The bound's worst direction: it took a teacher's own scheduled check-in
		// off their own class page. `0140` refused that on the grid for the same
		// reason -- a teacher schedules ahead, and hiding what they just scheduled
		// hides their own work from them.
		const data = await runClassLoad(teacher, current);
		expect(data.canManage).toBe(true);
		const byLabel = new Map(data.checkIns.map((c) => [c.session_label, c.status]));
		expect(byLabel.get('Final assembly photos')).toBe('scheduled');

		// AND NO OTHER STATUS LEAKS ONTO A MANAGER'S CARD. `scheduled` is a fact
		// about the DAY; every other value would be a claim about work a teacher
		// does not file, assembled from somebody else's rows.
		expect(byLabel.get('Gearbox teardown')).toBeNull();
		expect(byLabel.get('Shaft stackup calcs')).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 3b. The calendar, at a pinned instant where LA and UTC disagree
// ---------------------------------------------------------------------------

describe('the calendar the comparison is made in', () => {
	// 8pm Pacific on 2026-08-27 is 03:00 UTC on 2026-08-28. Everything above
	// runs against the real wall clock, which agrees with UTC for most of the
	// working day -- so a bug in the calendar cannot redden any of it unless the
	// suite happens to run in the evening. These four assertions do not depend
	// on when the suite runs.
	const evening = new Date('2026-08-28T03:00:00Z');

	test('reads the America/Los_Angeles day, not the UTC one', () => {
		expect(laCalendarDay(evening)).toBe('2026-08-27');
		expect(evening.toISOString().slice(0, 10)).toBe('2026-08-28');
	});

	test('so tomorrow is still scheduled at 8pm Pacific, where a UTC reading calls it due', () => {
		// THE SHIPPED RULE.
		expect(checkInIsScheduled('2026-08-28', laCalendarDay(evening))).toBe(true);
		// THE REJECTED ONE, spelled out so the difference is a value in the file
		// rather than a claim in a comment: under UTC the same check-in is due,
		// every evening, which is exactly when a teacher lays the next day out.
		expect(checkInIsScheduled('2026-08-28', evening.toISOString().slice(0, 10))).toBe(false);
	});

	test('and 08:09 Pacific is why that instant is pinned rather than taken from the clock', () => {
		// The two calendars AGREE for most of the school day, so a check written
		// against `new Date()` in the morning cannot tell them apart. `0140` hit
		// exactly this: its UTC mutation did not redden the behavioural assertion
		// because the run was at 08:09 Pacific.
		const morning = new Date('2026-08-27T15:09:00Z');
		expect(laCalendarDay(morning)).toBe('2026-08-27');
		expect(morning.toISOString().slice(0, 10)).toBe('2026-08-27');
	});
});

// ---------------------------------------------------------------------------
// 4. An instructor's own hand-in is not work for them to grade
// ---------------------------------------------------------------------------

describe("a manager enrolled in their own class", () => {
	/**
	 * THE FOURTH FALSE COUNT, and the one this file could not see until its
	 * chain carried 0138. It runs in the same direction as the other three --
	 * the number is simply larger than the work is -- and it is invisible for
	 * the same reason: one extra head in a to-grade tally looks exactly like
	 * one more student who handed something in.
	 *
	 * IT IS ALSO THE ONE THAT PROVES THE WIDE RUNG IS RUNNING. `feedManagerEmails`
	 * is `{}` on `loadSectionRoster`'s degrade rung, so every assertion here is
	 * a statement about which rung answered as much as about the tally.
	 */
	test('is kept out of their own to-grade tally, while the student beside it still counts', async () => {
		const data = await runHomeLoad(teacher);

		// THE RUNG. An empty map is what a project without 0138 returns, and it
		// is indistinguishable from "nobody enrolled who manages" unless the
		// value is read.
		expect(data.feedManagerEmails[current]).toEqual([teacher.email]);

		const feeds = feedFor(data, teacher, false, NOW);
		const card = cardFor(feeds, current)!;

		// THE FIX. Two people handed this in and exactly one of them is work.
		expect(card.urgent.find((e) => e.item.id === managerHandIn)?.reason).toBe('ungraded');
		expect(card.urgent.find((e) => e.item.id === managerHandIn)?.count).toBe(1);

		// THE POSITIVE CONTROLS, on the same read. The exclusion is a TALLY
		// decision, not a missing row: both submissions are in the payload, and
		// the two items only a student handed in still count exactly 1 each. An
		// over-filtering regression -- one that dropped every submission on an
		// item a manager also touched, or that read the whole class as managers
		// -- reddens these rather than passing by counting nothing.
		const onItem = data.feedSubmissions.filter((s) => s.item_id === managerHandIn);
		expect(onItem.map((s) => s.student_email).sort()).toEqual(
			[bruno.email, teacher.email].sort()
		);
		expect(card.urgent.find((e) => e.item.id === dated)?.count).toBe(1);
		expect(card.urgent.find((e) => e.item.id === undatedHandedIn)?.count).toBe(1);
	});

	test('the map is a MANAGEMENT read: a student gets nothing at all from it', async () => {
		// `classroom_section_roster(null)` gates per row on
		// `classroom_manages_section`, so alice does not even get her own row --
		// and she is enrolled in a class whose manager IS enrolled, which is the
		// only fixture where the difference is visible.
		const asStudent = await runHomeLoad(alice);
		expect(asStudent.feedManagerEmails).toEqual({});

		// THE POSITIVE CONTROL: the same call, same fixture, same section, made
		// by the manager, is not empty. Without it an empty map here is equally
		// well explained by 0138 not being applied.
		const asTeacher = await runHomeLoad(teacher);
		expect(asTeacher.feedManagerEmails[current]).toEqual([teacher.email]);
	});

	test('and her own class card is unchanged for the student in it', async () => {
		// The exclusion touches the TEACHER'S tally and nothing else: alice's
		// chip is the same 2 it has been through sections 1 to 3, with the new
		// undated item ranking for her exactly as `undated` does -- not at all.
		const feeds = feedFor(await runHomeLoad(alice), alice, false, NOW);
		expect(cardFor(feeds, current)!.actionCount).toBe(2);
		expect(reasonForItem(feeds, current, managerHandIn)).toBeNull();
	});
});

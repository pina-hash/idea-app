// tests/notebook-documentation-check.test.ts
//
// DOCUMENTATION CHECK (migration 0097), against a real Postgres with the real
// migration files applied unmodified.
//
// WHAT IS COVERED, AND WHY ONLY THIS. Everything here fails SILENTLY if it
// regresses:
//
//   * A link pointing at an item the class cannot see looks exactly like a
//     working link right up to the moment a grade is refused.
//   * A teacher who could grade another class's student would see a perfectly
//     ordinary grading list -- there is no error to notice.
//   * A grade written in the wrong shape (missing criterion keys, a total that
//     is not the sum) still renders, and only shows up when someone reconciles
//     a gradebook by hand weeks later.
//   * A migration that fails on its SECOND run leaves a half-built schema, and
//     migrations here are pasted in by hand, so a re-run is ordinary (0088's
//     lesson, learned in the field rather than in review).
//
// Deliberately NOT covered: which unit the picker defaults to, how the panel
// lays out, what the evidence line reads. A dev harness answers those, and
// pulling them in here would dilute what a red run means.
//
// THE PURE CODE UNDER TEST IS THE SHIPPING CODE. `summarize` (the grid's own
// counting), `presenceScoreFor`, `DOC_CHECK_CRITERIA`, `studentWorkRows` and
// `gradesCsv` are imported from $lib and driven with the REAL RPC's real
// output -- so "the presence pre-fill matches the grid" and "it exports
// through the FACTS CSV" are measured end to end rather than asserted from a
// fixture that agrees with itself by construction.
//
// Cast: teacherA runs P1 (alice, bruno). teacherB runs P2 (cleo). owner is the
// pinned 0067 admin -- the only tier that may excuse a session.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import {
	summarize,
	type SectionGrid as SectionGridData,
	type StudentSummary
} from '$lib/notebook-review';
import {
	DOC_CHECK_CRITERIA,
	DOC_CHECK_PRESENCE_ID,
	DOC_CHECK_TOTAL,
	presenceScoreFor
} from '$lib/notebook-documentation-check';
import {
	criterionMax,
	gradesCsv,
	studentWorkRows,
	normalizeSubmissionRow,
	type GradingData
} from '$lib/classroom/assignment-spec';

/**
 * The notebook chain (0094's, which already carries Classroom's 0082) plus the
 * assignment engine it now grades through: 0083 + 0085 + 0086 are 0095's own
 * dependencies, 0053 is 0085's, and 0097 sits on top of all of it.
 */
const MIGRATIONS = [
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
	'0094_notebook_classroom_sections.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0097_notebook_documentation_check.sql'
] as const;

const MIGRATION_0097 = readFileSync(
	join(process.cwd(), 'supabase', 'migrations', '0097_notebook_documentation_check.sql'),
	'utf8'
);

let db: TestDb;
let owner: SeededUser;
let teacherA: SeededUser;
let teacherB: SeededUser;
let alice: SeededUser;
let bruno: SeededUser;
let cleo: SeededUser;
let p1: string;
let p2: string;
/** The assignment P1's unit 1 is graded on. */
let docItem: string;
/** A second ordinary assignment in P1: the "alongside other work" control. */
let essayItem: string;
/** A material in P1: not gradeable, so not linkable. */
let materialItem: string;
/** An assignment posted only to P2. */
let foreignItem: string;
/** Unit 1's four check-ins in P1. */
let sessionIds: string[] = [];

async function captureError(run: () => Promise<unknown>): Promise<{ message: string }> {
	try {
		await run();
	} catch (error) {
		return { message: (error as { message?: string }).message ?? String(error) };
	}
	throw new Error('Expected this statement to be rejected, but it succeeded.');
}

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

function link(userId: string, sectionId: string, unit: number, itemId: string) {
	return rpc(userId, 'public.notebook_link_unit_item($1::uuid, $2::integer, $3::uuid)', [
		sectionId,
		unit,
		itemId
	]);
}

function grade(
	userId: string,
	itemId: string,
	email: string,
	scores: Record<string, number>,
	release = false,
	comments: Record<string, string> | null = null
) {
	return rpc<{ ok: boolean; reason?: string; score?: number; missing?: string[] }>(
		userId,
		'public.classroom_grade_submission($1::uuid, $2, $3::jsonb, $4, $5, $6::jsonb)',
		[
			itemId,
			email,
			JSON.stringify(scores),
			null,
			release,
			comments ? JSON.stringify(comments) : null
		]
	);
}

/** The grid, exactly as `/notebook/review` reads it. */
async function readGrid(userId: string, sectionId: string, unit: number | null) {
	return rpc<SectionGridData>(
		userId,
		'public.notebook_get_section_grid($1::uuid, $2::integer)',
		[sectionId, unit]
	);
}

function summaryFor(grid: SectionGridData, email: string): StudentSummary {
	const found = summarize(grid).find((s) => s.student.email === email);
	if (!found) throw new Error(`No roster row for ${email}`);
	return found;
}

async function createItem(
	userId: string,
	kind: 'assignment' | 'material',
	sectionIds: string[],
	title: string,
	points: number | null
): Promise<string> {
	const res = await rpc<{ item_id: string }>(
		userId,
		`public.classroom_create_item($1, $2::uuid[], $3, $4, $5::integer, null, null, true)`,
		[kind, sectionIds, title, '', points]
	);
	return res.item_id;
}

beforeAll(async () => {
	db = await startTestDb(MIGRATIONS);

	// The pinned owner (0067's admin_owner_email), so admin-only setup works.
	owner = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	teacherA = await createUser(db, 'teacher.a@boscotech.edu', 'Teacher A');
	teacherB = await createUser(db, 'teacher.b@boscotech.edu', 'Teacher B');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bruno = await createUser(db, 'bruno@boscotech.net', 'Bruno Barros');
	cleo = await createUser(db, 'cleo@boscotech.net', 'Cleo Cruz');

	const course = await rpc<{ course_id: string }>(
		owner.id,
		'public.classroom_upsert_course($1, $2)',
		['IDEA209H', 'IDEA 209H']
	);
	p1 = (
		await rpc<{ section_id: string }>(owner.id, 'public.classroom_upsert_section($1::uuid, $2, $3, $4)', [
			course.course_id,
			'Period 1',
			'A',
			teacherA.email
		])
	).section_id;
	p2 = (
		await rpc<{ section_id: string }>(owner.id, 'public.classroom_upsert_section($1::uuid, $2, $3, $4)', [
			course.course_id,
			'Period 2',
			'B',
			teacherB.email
		])
	).section_id;

	await rpc(teacherA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
		p1,
		alice.email,
		'Alvarez, Alice',
		true
	]);
	await rpc(teacherA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
		p1,
		bruno.email,
		'Barros, Bruno',
		true
	]);
	await rpc(teacherB.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
		p2,
		cleo.email,
		'Cruz, Cleo',
		true
	]);

	// Unit 1: four check-ins in P1.
	for (const [n, label] of ['Design brief', 'Bench test', 'Teardown', 'Writeup'].entries()) {
		const res = await rpc<{ session_id: string }>(
			teacherA.id,
			'public.notebook_admin_upsert_session($1::uuid, $2::integer, $3::date, $4, null)',
			[p1, 1, `2026-09-0${n + 1}`, label]
		);
		sessionIds.push(res.session_id);
	}

	// Alice files three of four, on time. Bruno files one and is EXCUSED for a
	// second -- the case the presence pre-fill has to get right, since an
	// excusal is deliberately NOT counted as covered.
	for (const sessionId of sessionIds.slice(0, 3)) {
		await rpc(
			alice.id,
			'public.notebook_create_entry($1::uuid, $2, $3::uuid, $4::uuid, $5, $6, null)',
			[alice.id, 'drive-file', sessionId, p1, null, 'page.jpg']
		);
	}
	await rpc(
		bruno.id,
		'public.notebook_create_entry($1::uuid, $2, $3::uuid, $4::uuid, $5, $6, null)',
		[bruno.id, 'drive-file', sessionIds[0], p1, null, 'page.jpg']
	);
	await rpc(owner.id, 'public.notebook_admin_set_excusal($1::uuid, $2::uuid, $3, $4)', [
		sessionIds[1],
		bruno.id,
		true,
		'Field trip'
	]);

	docItem = await createItem(teacherA.id, 'assignment', [p1], 'Unit 1 Documentation Check', 25);
	essayItem = await createItem(teacherA.id, 'assignment', [p1], 'Gearbox writeup', 40);
	materialItem = await createItem(teacherA.id, 'material', [p1], 'Course syllabus', null);
	foreignItem = await createItem(teacherB.id, 'assignment', [p2], 'P2 Documentation Check', 25);
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
describe('the link', () => {
	test('a teacher points their own unit at their own assignment, and re-points it', async () => {
		await link(teacherA.id, p1, 1, essayItem);
		await link(teacherA.id, p1, 1, docItem);
		const { rows } = await db.sql<{ item_id: string; n: string }>(
			`select item_id, count(*) over () as n from public.notebook_unit_items
			 where section_id = $1 and unit_number = 1`,
			[p1]
		);
		// One row, not two: re-pointing a unit is an upsert, so a unit can never
		// end up with two Documentation Checks.
		expect(rows).toHaveLength(1);
		expect(rows[0].item_id).toBe(docItem);
	});

	test('a teacher of another section cannot link in this one', async () => {
		const refusal = await captureError(() => link(teacherB.id, p1, 2, docItem));
		expect(refusal.message).toMatch(/Only the section instructor or a site admin/i);
		const { rows } = await db.sql(
			`select 1 from public.notebook_unit_items where section_id = $1 and unit_number = 2`,
			[p1]
		);
		expect(rows).toHaveLength(0);
	});

	test('only an assignment can be linked; a material is refused by name', async () => {
		const refusal = await captureError(() => link(teacherA.id, p1, 3, materialItem));
		expect(refusal.message).toMatch(/has to be an assignment/i);
		expect(refusal.message).toMatch(/material/);
	});

	test('an assignment this class is not posted to is refused', async () => {
		const refusal = await captureError(() => link(teacherA.id, p1, 4, foreignItem));
		expect(refusal.message).toMatch(/not posted to this class/i);
	});

	test('THE COMPOSITE FK refuses an unposted pair with RLS out of the way entirely', async () => {
		// As the connection OWNER: RLS does not apply and no RPC is involved, so
		// nothing but the key itself can refuse this. That is the whole point of
		// making it a foreign key rather than a check inside a function.
		const refusal = await captureError(() =>
			db.sql(
				`insert into public.notebook_unit_items (section_id, unit_number, item_id, linked_by)
				 values ($1, 90, $2, 'raw@boscotech.edu')`,
				[p1, foreignItem]
			)
		);
		expect(refusal.message).toMatch(/foreign key|notebook_unit_items_posting_fkey/i);

		// The same insert with a genuinely posted pair goes through, so the
		// refusal above is the FK doing its job and not the statement being
		// malformed.
		await db.sql(
			`insert into public.notebook_unit_items (section_id, unit_number, item_id, linked_by)
			 values ($1, 91, $2, 'raw@boscotech.edu')`,
			[p1, essayItem]
		);
		await db.sql(`delete from public.notebook_unit_items where section_id = $1 and unit_number = 91`, [
			p1
		]);
	});

	test('unposting the item takes the link with it', async () => {
		// Posted to BOTH classes, because 0085 refuses to remove an item's LAST
		// posting -- an item nobody can see is not a state it lets you reach.
		const shared = await createItem(owner.id, 'assignment', [p1, p2], 'Shared check', 25);
		await link(teacherA.id, p1, 5, shared);
		const res = await rpc<{ ok: boolean }>(
			owner.id,
			'public.classroom_remove_posting($1::uuid, $2::uuid)',
			[shared, p1]
		);
		expect(res.ok).not.toBe(false);
		const { rows } = await db.sql(
			`select 1 from public.notebook_unit_items where section_id = $1 and unit_number = 5`,
			[p1]
		);
		// Nothing swept it: the composite FK cascaded, because a link to a class
		// that can no longer see the item is not a link worth keeping.
		expect(rows).toHaveLength(0);
	});

	test('unlink removes the link and nothing else', async () => {
		await link(teacherA.id, p1, 6, essayItem);
		const res = await rpc<{ removed: number }>(
			teacherA.id,
			'public.notebook_unlink_unit_item($1::uuid, $2::integer)',
			[p1, 6]
		);
		expect(res.removed).toBe(1);
		const item = await db.sql(`select 1 from public.classroom_items where id = $1`, [essayItem]);
		expect(item.rows).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
describe('who can see and change a link', () => {
	test('the section teacher and an admin read it; another teacher and a student do not', async () => {
		const read = (userId: string) =>
			db.asUser(userId, async (q) => {
				const { rows } = await q(
					`select item_id from public.notebook_unit_items
					 where section_id = $1 and unit_number = 1`,
					[p1]
				);
				return rows;
			});
		expect(await read(teacherA.id)).toHaveLength(1);
		expect(await read(owner.id)).toHaveLength(1);
		expect(await read(teacherB.id)).toHaveLength(0);
		expect(await read(alice.id)).toHaveLength(0);
	});

	test('nobody has a direct write path, admin included', async () => {
		for (const user of [alice, teacherA, owner]) {
			const insert = await captureError(() =>
				db.asUser(user.id, (q) =>
					q(
						`insert into public.notebook_unit_items (section_id, unit_number, item_id, linked_by)
						 values ($1, 40, $2, 'x@y.z')`,
						[p1, docItem]
					)
				)
			);
			expect(insert.message).toMatch(/permission denied/i);
			const update = await captureError(() =>
				db.asUser(user.id, (q) =>
					q(`update public.notebook_unit_items set item_id = $1`, [essayItem])
				)
			);
			expect(update.message).toMatch(/permission denied/i);
			const del = await captureError(() =>
				db.asUser(user.id, (q) => q(`delete from public.notebook_unit_items`))
			);
			expect(del.message).toMatch(/permission denied/i);
		}
	});

	test('anon can neither read the table nor call either RPC', async () => {
		const { rows } = await db.sql<{ ok: boolean }>(
			`select
				has_table_privilege('anon', 'public.notebook_unit_items', 'select') as t,
				has_function_privilege('anon', 'public.notebook_link_unit_item(uuid, integer, uuid)', 'execute') as l,
				has_function_privilege('anon', 'public.notebook_unlink_unit_item(uuid, integer)', 'execute') as u`
		);
		const row = rows[0] as unknown as Record<string, boolean>;
		expect(row.t).toBe(false);
		expect(row.l).toBe(false);
		expect(row.u).toBe(false);
	});
});

// ---------------------------------------------------------------------------
describe('the presence pre-fill matches the grid', () => {
	test("it is the grid's own counts, and an excusal is not counted as covered", async () => {
		const grid = await readGrid(teacherA.id, p1, 1);
		expect(grid.sessions).toHaveLength(4);

		const a = summaryFor(grid, alice.email);
		expect([a.covered, a.total, a.excused]).toEqual([3, 4, 0]);
		// round(3/4 x 7) = round(5.25) = 5
		expect(a.presenceScore).toBe(5);

		const b = summaryFor(grid, bruno.email);
		// One entry, one excusal: covered stays 1, and the excusal is REPORTED
		// rather than folded into the fraction. If an excusal ever silently
		// counted as covered this would read 2 and the score would be 4.
		expect([b.covered, b.total, b.excused]).toEqual([1, 4, 1]);
		expect(b.presenceScore).toBe(2);
	});

	test('presenceScoreFor agrees with the criterion it is scoring', async () => {
		const grid = await readGrid(teacherA.id, p1, 1);
		const a = summaryFor(grid, alice.email);
		const presence = DOC_CHECK_CRITERIA.find((c) => c.id === DOC_CHECK_PRESENCE_ID)!;
		expect(criterionMax(presence)).toBe(7);
		expect(presenceScoreFor(a, criterionMax(presence))).toBe(a.presenceScore);
		// A rescaled criterion still lands in range: round(3/4 x 10) = 8.
		expect(presenceScoreFor(a, 10)).toBe(8);
		// Nothing to be present for is 0, not NaN.
		const emptyGrid = await readGrid(teacherA.id, p1, 99);
		const none = summaryFor(emptyGrid, alice.email);
		expect(none.total).toBe(0);
		expect(none.presenceScore).toBe(0);
	});
});

// ---------------------------------------------------------------------------
describe('the grade lands in classroom_submissions like any other assignment', () => {
	test('the standard rubric installs through the ordinary RPC', async () => {
		await rpc(teacherA.id, 'public.classroom_set_rubric($1::uuid, $2::jsonb)', [
			docItem,
			JSON.stringify(DOC_CHECK_CRITERIA)
		]);
		const { rows } = await db.sql<{ criteria: { id: string; points: number; incomplete: boolean }[] }>(
			`select criteria from public.classroom_rubrics where item_id = $1`,
			[docItem]
		);
		const criteria = rows[0].criteria;
		expect(criteria.map((c) => c.id)).toEqual(DOC_CHECK_CRITERIA.map((c) => c.id));
		expect(criteria.reduce((n, c) => n + Number(c.points), 0)).toBe(DOC_CHECK_TOTAL);
		expect(DOC_CHECK_TOTAL).toBe(25);
		// Every criterion is COMPLETE: the server would flag an unfinished one,
		// and a rubric shipped half-authored is not a rubric worth installing.
		expect(criteria.every((c) => c.incomplete === false)).toBe(true);
	});

	test('a saved grade is rubric_scores keyed by the four ids, with score = their sum', async () => {
		const grid = await readGrid(teacherA.id, p1, 1);
		const a = summaryFor(grid, alice.email);
		const scores = {
			[DOC_CHECK_PRESENCE_ID]: a.presenceScore, // 5 -- an OFF-LEVEL value
			'doc-check-raw-data': 6,
			'doc-check-legibility': 3,
			'doc-check-specificity': 6
		};
		const result = await grade(teacherA.id, docItem, alice.email, scores, true, {
			// The presence evidence, which is what makes the off-level 5 storable.
			[DOC_CHECK_PRESENCE_ID]: 'From the notebook grid: 3 of 4 check-ins filed.'
		});
		expect(result.ok).toBe(true);
		expect(Number(result.score)).toBe(20);

		const { rows } = await db.sql<{
			rubric_scores: Record<string, number>;
			score: string;
			state: string;
			criterion_comments: Record<string, string>;
		}>(
			`select rubric_scores, score, state, criterion_comments
			 from public.classroom_submissions where item_id = $1 and student_email = $2`,
			[docItem, alice.email]
		);
		expect(rows).toHaveLength(1);
		expect(Object.keys(rows[0].rubric_scores).sort()).toEqual(
			DOC_CHECK_CRITERIA.map((c) => c.id).sort()
		);
		expect(Number(rows[0].score)).toBe(
			Object.values(rows[0].rubric_scores).reduce((n, v) => n + Number(v), 0)
		);
		expect(rows[0].state).toBe('returned');
		expect(rows[0].criterion_comments[DOC_CHECK_PRESENCE_ID]).toMatch(/3 of 4/);
	});

	test('an off-level presence score with NO evidence comment is refused', async () => {
		// The counterpart of the test above: it is the evidence line, not luck,
		// that lets a computed score be stored.
		const result = await grade(teacherA.id, docItem, bruno.email, {
			[DOC_CHECK_PRESENCE_ID]: 2, // round(1/4 x 7); 7/5/3/0 are the levels
			'doc-check-raw-data': 6,
			'doc-check-legibility': 6,
			'doc-check-specificity': 6
		});
		expect(result.ok).toBe(false);
		expect(result.reason).toBe('override_needs_comment');
		expect(result.missing).toEqual([DOC_CHECK_PRESENCE_ID]);
		const { rows } = await db.sql(
			`select 1 from public.classroom_submissions where item_id = $1 and student_email = $2`,
			[docItem, bruno.email]
		);
		expect(rows).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
describe('the FACTS CSV', () => {
	test('the Documentation Check exports through the same path as any other assignment', async () => {
		// Grade the ordinary assignment too, so the two are genuinely compared.
		await rpc(teacherA.id, 'public.classroom_set_rubric($1::uuid, $2::jsonb)', [
			essayItem,
			JSON.stringify([
				{
					id: 'essay-quality',
					criterion: 'Writeup quality',
					levels: [
						{ points: 40, label: 'Strong', descriptor: 'Complete and clear.' },
						{ points: 20, label: 'Developing', descriptor: 'Partly there.' },
						{ points: 0, label: 'Absent', descriptor: 'Not attempted.' }
					]
				}
			])
		]);
		await grade(teacherA.id, essayItem, alice.email, { 'essay-quality': 40 }, true);

		/** The real `loadGrading` reads, as the teacher's own session. */
		const loadGrading = async (itemId: string): Promise<GradingData> =>
			db.asUser(teacherA.id, async (q) => {
				const roster = await q(
					`select section_id, student_email, display_name, active, updated_at
					 from public.classroom_enrollments where section_id = $1 order by display_name`,
					[p1]
				);
				const submissions = await q(
					`select id, item_id, student_email, state, submitted_at, returned_at,
					        rubric_scores, criterion_comments, score, teacher_comment,
					        graded_by, graded_at, updated_at
					 from public.classroom_submissions where item_id = $1`,
					[itemId]
				);
				return {
					roster: roster.rows as GradingData['roster'],
					submissions: (submissions.rows as Record<string, unknown>[]).map(normalizeSubmissionRow),
					responses: [],
					files: [],
					approvals: []
				};
			});

		const csvFor = async (itemId: string, outOf: number) => {
			const rows = studentWorkRows(await loadGrading(itemId));
			return gradesCsv(
				rows.map((s) => ({
					displayName: s.displayName,
					email: s.email,
					score: s.submission?.state === 'returned' ? (s.submission.score ?? null) : null,
					outOf
				}))
			);
		};

		const docCsv = await csvFor(docItem, DOC_CHECK_TOTAL);
		const essayCsv = await csvFor(essayItem, 40);

		// The header, the BOM and the last-name ordering are the FACTS shape;
		// nothing about the Documentation Check is special in any of them.
		expect(docCsv.charCodeAt(0)).toBe(0xfeff);
		const docLines = docCsv.slice(1).split('\r\n').filter(Boolean);
		expect(docLines[0]).toBe('Last,First,Score,Out of');
		expect(docLines[1]).toBe('Alvarez,Alice,20,25');
		// Bruno's refused grade left no submission at all, so his score is blank
		// for hand entry -- exactly what an ungraded student reads as anywhere.
		expect(docLines[2]).toBe('Barros,Bruno,,25');

		const essayLines = essayCsv.slice(1).split('\r\n').filter(Boolean);
		expect(essayLines[1]).toBe('Alvarez,Alice,40,40');
		// The point of the whole session: one student, two assignments, one
		// export path, and the Documentation Check is indistinguishable from
		// ordinary classwork in it.
		expect(docLines[0]).toBe(essayLines[0]);
	});
});

// ---------------------------------------------------------------------------
describe('cross-section grading', () => {
	test("a teacher cannot grade another class's student on their own item", async () => {
		const refusal = await captureError(() =>
			grade(teacherB.id, docItem, alice.email, { [DOC_CHECK_PRESENCE_ID]: 7 })
		);
		expect(refusal.message).toMatch(/teacher of record for this student's class/i);
	});

	test('...nor by pointing their own item at that student', async () => {
		await rpc(teacherB.id, 'public.classroom_set_rubric($1::uuid, $2::jsonb)', [
			foreignItem,
			JSON.stringify(DOC_CHECK_CRITERIA)
		]);
		const refusal = await captureError(() =>
			grade(teacherB.id, foreignItem, alice.email, { [DOC_CHECK_PRESENCE_ID]: 7 })
		);
		expect(refusal.message).toMatch(/teacher of record for this student's class/i);
	});

	test('the same call for their OWN student succeeds, so the refusal is scoping and not breakage', async () => {
		const result = await grade(
			teacherB.id,
			foreignItem,
			cleo.email,
			{
				[DOC_CHECK_PRESENCE_ID]: 7,
				'doc-check-raw-data': 6,
				'doc-check-legibility': 6,
				'doc-check-specificity': 6
			},
			true
		);
		expect(result.ok).toBe(true);
		expect(Number(result.score)).toBe(25);
	});

	test('and the admin tier reaches across sections, as it does everywhere', async () => {
		const result = await grade(owner.id, docItem, alice.email, {
			[DOC_CHECK_PRESENCE_ID]: 7,
			'doc-check-raw-data': 6,
			'doc-check-legibility': 6,
			'doc-check-specificity': 6
		});
		expect(result.ok).toBe(true);
		expect(Number(result.score)).toBe(25);
	});
});

// ---------------------------------------------------------------------------
describe('the migration re-applies', () => {
	test('running the real file again is a no-op that leaves everything standing', async () => {
		const before = await db.sql<{ n: string }>(
			`select count(*) as n from public.notebook_unit_items`
		);
		await db.sql(MIGRATION_0097);
		await db.sql(MIGRATION_0097);
		const after = await db.sql<{ n: string }>(
			`select count(*) as n from public.notebook_unit_items`
		);
		expect(after.rows[0].n).toBe(before.rows[0].n);

		// The composite FK is still exactly one constraint, not dropped and not
		// duplicated -- 0088 shipped a drop-then-add that died on its second run
		// with 2BP01, and a migration that only works once fails exactly then.
		const fk = await db.sql<{ n: string }>(
			`select count(*) as n from pg_constraint
			 where conrelid = 'public.notebook_unit_items'::regclass and contype = 'f'`
		);
		expect(fk.rows[0].n).toBe('1');

		// One policy, and one overload of each RPC (a second would be callable
		// beside the first and PostgREST could not resolve either).
		const policies = await db.sql<{ n: string }>(
			`select count(*) as n from pg_policies
			 where schemaname = 'public' and tablename = 'notebook_unit_items'`
		);
		expect(policies.rows[0].n).toBe('1');
		for (const name of ['notebook_link_unit_item', 'notebook_unlink_unit_item']) {
			const fns = await db.sql<{ n: string }>(
				`select count(*) as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public' and p.proname = $1`,
				[name]
			);
			expect(fns.rows[0].n).toBe('1');
		}

		// And the grades written before the re-run are untouched.
		const { rows } = await db.sql<{ score: string }>(
			`select score from public.classroom_submissions where item_id = $1 and student_email = $2`,
			[docItem, alice.email]
		);
		expect(Number(rows[0].score)).toBe(25);
	});
});

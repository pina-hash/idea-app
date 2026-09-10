// tests/html-assignment-rubric-db.test.ts
//
// THE REAL `classroom_set_rubric` ACCEPTS WHAT `manifestToRubric` PRODUCES,
// against a real Postgres with the real migration files applied unmodified.
//
// WHY THIS AND NOT A UNIT TEST. `tests/html-assignment-rubric.test.ts` proves
// the output equals what a spec produces. That is agreement between two client
// modules and says nothing about the column: `_classroom_normalize_rubric` has
// rules the client mirror does not carry (the id's character set, the 64
// character cap, uniqueness, the 300-character criterion text, the 50-criteria
// cap) and it REWRITES what it stores -- it stamps `points` from the top level
// and `incomplete` from its own check, and discards whatever the caller sent
// for either. So "the console renders it" and "the database keeps it" are two
// questions and only this one answers the second.
//
// THE THREE CLAIMS, all of which fail silently in production:
//   1. The rubric round-trips: what comes back out of `classroom_rubrics` is
//      what went in, `short` included, with `incomplete` false on every row.
//   2. `classroom_set_rubric` TOUCHES NO SCORES. A grade taken before the
//      rubric is written must survive it byte for byte -- which is what makes
//      a re-uploaded HTML assignment revision safe to re-derive a rubric from.
//   3. A criterion id repeated across two modules is harmless and one repeated
//      inside a module collides, from the normalizer's own mouth rather than
//      from the client's prediction of it.
//
// Cast: teacherA runs P1 with alice enrolled.

import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import {
	manifestRubricIssues,
	manifestToRubric,
	type HtmlAssignmentManifest
} from '../src/lib/classroom/html-assignment/rubric';
import type { RubricCriterion } from '../src/lib/classroom/assignment-spec';

const MIGRATIONS = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0090_classroom_instructor_materials.sql',
	'0092_classroom_reference_specs.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0104_classroom_edit_visibility.sql',
	'0108_classroom_rich_body.sql',
	'0109_classroom_scheduled_posting.sql',
	// 0110 is the CURRENT definition of classroom_set_rubric (it adds the
	// content-revision snapshot). Testing against 0095's would be testing a
	// function production no longer has.
	'0110_classroom_content_revisions.sql',
	'0137_anon_execute_sweep.sql'
] as const;

let db: TestDb;
let teacherA: SeededUser;
let alice: SeededUser;
let p1: string;
let item: string;

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

function setRubric(userId: string, itemId: string, criteria: unknown) {
	return rpc(userId, 'public.classroom_set_rubric($1::uuid, $2::jsonb)', [
		itemId,
		JSON.stringify(criteria)
	]);
}

async function readCriteria(itemId: string): Promise<RubricCriterion[]> {
	const { rows } = await db.sql<{ criteria: RubricCriterion[] }>(
		`select criteria from public.classroom_rubrics where item_id = $1`,
		[itemId]
	);
	return rows[0]?.criteria ?? [];
}

async function captureError(run: () => Promise<unknown>): Promise<string> {
	try {
		await run();
	} catch (error) {
		return (error as { message?: string }).message ?? String(error);
	}
	throw new Error('Expected this statement to be rejected, but it succeeded.');
}

/** Three descending levels ending at 0, each with a `short` unlike its descriptor. */
function levels(max: number, mid: number) {
	return [
		{ points: max, label: 'Complete', short: `All of it (${max}).`, descriptor: 'Everything the procedure asks for, done and recorded.' },
		{ points: mid, label: 'Developing', short: `Part of it (${mid}).`, descriptor: 'Some of the work is there, or it is there and wrong.' },
		{ points: 0, label: 'Absent', short: 'None of it.', descriptor: 'Not attempted at all.' }
	];
}

/** TWO MODULES SHARING CRITERION IDS -- the case the namespacing exists for. */
const MANIFEST: HtmlAssignmentManifest = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Blade Design Log',
	course: 'IDEA113',
	points: 20,
	// IDENTITY FIELDS, which carry no points and must never reach the rubric.
	header: [
		{ id: 'hdr-name', field: 'studentName', type: 'text' },
		{ id: 'hdr-team', field: 'teamName', type: 'text' },
		{ id: 'hdr-date', field: 'sessionDate', type: 'text' }
	],
	modules: [
		{
			id: 'setup',
			title: 'Bench setup',
			points: 10,
			blocks: [{ id: 'setup-notes', field: 'benchNotes', type: 'longText' }],
			criteria: [
				{ id: 'quality', text: 'Bench is set up as specified', points: 6, levels: levels(6, 3) },
				{ id: 'notes', text: 'Setup notes record what was done', points: 4, levels: levels(4, 2) }
			]
		},
		{
			id: 'cut',
			title: 'First cut',
			points: 10,
			blocks: [{ id: 'cut-reflection', field: 'cutReflection', type: 'longText' }],
			criteria: [
				{ id: 'quality', text: 'The cut is within tolerance', points: 6, levels: levels(6, 3) },
				{ id: 'notes', text: 'Reflection explains the error', points: 4, levels: levels(4, 2) }
			]
		}
	]
};

beforeAll(async () => {
	db = await startTestDb(MIGRATIONS);

	teacherA = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');

	const course = await rpc<{ course_id: string }>(
		teacherA.id,
		'public.classroom_upsert_course($1, $2)',
		['IDEA113', 'Engineering Design II']
	);
	p1 = (
		await rpc<{ section_id: string }>(
			teacherA.id,
			'public.classroom_upsert_section($1::uuid, $2, $3)',
			[course.course_id, 'Period 1', null]
		)
	).section_id;
	await rpc(teacherA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
		p1,
		alice.email,
		alice.email,
		true
	]);

	item = (
		await rpc<{ item_id: string }>(
			teacherA.id,
			`public.classroom_create_item('assignment', $1::uuid[], $2, 'Log the build.', 20, null, null, true, '[]'::jsonb, false)`,
			[[p1], 'Blade Design Log']
		)
	).item_id;
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

describe('the database accepts a manifest-derived rubric and keeps it whole', () => {
	test('the client predicts no problems, which is the precondition for the rest', () => {
		expect(manifestRubricIssues(MANIFEST)).toEqual([]);
	});

	test('classroom_set_rubric stores all four criteria, none incomplete', async () => {
		const result = await setRubric(teacherA.id, item, manifestToRubric(MANIFEST));
		expect(result).toMatchObject({ ok: true, unfinished: 0 });

		const stored = await readCriteria(item);
		expect(stored.map((c) => c.id)).toEqual([
			'setup-quality',
			'setup-notes',
			'cut-quality',
			'cut-notes'
		]);
		expect(stored.every((c) => c.incomplete === false)).toBe(true);
	});

	test('every `short` survives the round trip, which is the whole point of it', async () => {
		const stored = await readCriteria(item);
		const shorts = stored.flatMap((c) => c.levels.map((l) => l.short));
		expect(shorts).toEqual([
			'All of it (6).',
			'Part of it (3).',
			'None of it.',
			'All of it (4).',
			'Part of it (2).',
			'None of it.',
			'All of it (6).',
			'Part of it (3).',
			'None of it.',
			'All of it (4).',
			'Part of it (2).',
			'None of it.'
		]);
		// The normalizer passes `levels` through verbatim, so every level comes
		// back with every field it went in with.
		//
		// `toEqual` AND NOT A STRINGIFIED COMPARISON, WHICH IS A FACT ABOUT
		// `jsonb` RATHER THAN A WEAKER TEST. Measured here: the same array went
		// in as `points,label,descriptor,short` and came back as
		// `label,short,points,descriptor` -- `jsonb` stores an object as a sorted
		// key set (by key length, then bytewise) and does not keep insertion
		// order, where `json` would. So "byte for byte" is a claim about the
		// CLIENT side of the translation, which
		// `tests/html-assignment-rubric.test.ts` asserts as a string against
		// `rubricFromSpec`, and it is not a claim any round trip through this
		// column can make. Nothing downstream reads a key order.
		expect(stored.map((c) => c.levels)).toEqual(
			manifestToRubric(MANIFEST).map((c) => c.levels)
		);
	});

	test('the stored maximum is the top level and the total is 20', async () => {
		const stored = await readCriteria(item);
		expect(stored.map((c) => c.points)).toEqual([6, 4, 6, 4]);
		expect(stored.reduce((n, c) => n + Number(c.points), 0)).toBe(20);
	});
});

describe('classroom_set_rubric touches no scores', () => {
	test('a grade taken before the rubric is rewritten survives it byte for byte', async () => {
		// Grade Alice against the rubric that is already stored.
		const graded = await rpc<{ ok: boolean; score?: number }>(
			teacherA.id,
			'public.classroom_grade_submission($1::uuid, $2, $3::jsonb, $4, $5, $6::jsonb)',
			[
				item,
				alice.email,
				JSON.stringify({ 'setup-quality': 6, 'setup-notes': 2, 'cut-quality': 3, 'cut-notes': 4 }),
				'Good log.',
				true,
				null
			]
		);
		expect(graded.ok).toBe(true);

		const before = await db.sql<{ rubric_scores: Record<string, number>; score: string; state: string }>(
			`select rubric_scores, score, state from public.classroom_submissions
			 where item_id = $1 and student_email = $2`,
			[item, alice.email]
		);
		expect(before.rows[0].rubric_scores).toEqual({
			'setup-quality': 6,
			'setup-notes': 2,
			'cut-quality': 3,
			'cut-notes': 4
		});

		// Now re-derive the rubric from a REVISED manifest -- the re-upload path,
		// which is the only way an HTML assignment's rubric ever changes. Every
		// criterion id is unchanged, because the contract makes them permanent.
		const revised: HtmlAssignmentManifest = {
			...MANIFEST,
			modules: MANIFEST.modules.map((m) => ({
				...m,
				criteria: m.criteria.map((c) => ({ ...c, text: `${c.text} (revised)` }))
			}))
		};
		await setRubric(teacherA.id, item, manifestToRubric(revised));

		const after = await db.sql<{ rubric_scores: Record<string, number>; score: string; state: string }>(
			`select rubric_scores, score, state from public.classroom_submissions
			 where item_id = $1 and student_email = $2`,
			[item, alice.email]
		);
		expect(after.rows[0]).toEqual(before.rows[0]);
		// POSITIVE CONTROL: the rubric really did change, so the equality above
		// is not the equality of two writes that never happened.
		const stored = await readCriteria(item);
		expect(stored[0].criterion).toBe('Bench setup: Bench is set up as specified (revised)');
	});
});

describe('contract amendment 1: the half-point rule has NO counterpart in SQL', () => {
	test('the database ACCEPTS a level worth half a point, which is why the client refuses it', () => {
		// THE MEASUREMENT THE RULE RESTS ON. `_classroom_check_levels` takes a
		// `numeric`; 0.5 descends strictly, the top level still equals the
		// maximum and the bottom is still 0, so nothing in SQL objects. It stores
		// -- and a half point in a LEVEL is a half point in the gradebook for
		// every student who lands there, which reaches FACTS.
		//
		// So `manifestRubricIssues` is the only place this can be caught, and this
		// test is what stops anyone deleting it on the belief that the column would
		// have refused it anyway.
		const halved: HtmlAssignmentManifest = {
			...MANIFEST,
			modules: [
				{
					...MANIFEST.modules[0],
					criteria: [
						{
							...MANIFEST.modules[0].criteria[0],
							levels: [
								{ points: 6, label: 'Complete', short: 'All.', descriptor: 'All of it.' },
								{ points: 0.5, label: 'Developing', short: 'Barely.', descriptor: 'Barely any.' },
								{ points: 0, label: 'Absent', short: 'None.', descriptor: 'None of it.' }
							]
						},
						MANIFEST.modules[0].criteria[1]
					]
				}
			]
		};
		// The client refuses it...
		expect(
			manifestRubricIssues(halved).some((i) => i.includes('worth a fraction of a point (0.5)'))
		).toBe(true);
		// ...and the database does not.
		return setRubric(teacherA.id, item, manifestToRubric(halved)).then(async (result) => {
			expect(result).toMatchObject({ ok: true, unfinished: 0 });
			const stored = await readCriteria(item);
			expect(stored[0].levels[1].points).toBe(0.5);
			// Put the rubric back, so the id tests below run against the fixture
			// they describe rather than against this one.
			await setRubric(teacherA.id, item, manifestToRubric(MANIFEST));
			expect((await readCriteria(item))[0].levels[1].points).toBe(3);
		});
	});
});

describe('the id collision, from the normalizer itself', () => {
	test('a criterion id repeated ACROSS two modules is accepted', async () => {
		// Already proven by the four stored rows above -- both modules use
		// `quality` and `notes` -- and restated here as the positive control the
		// refusal below needs.
		const stored = await readCriteria(item);
		expect(stored.filter((c) => c.id.endsWith('-quality'))).toHaveLength(2);
	});

	test('a criterion id repeated INSIDE one module is refused by name', async () => {
		const collides: HtmlAssignmentManifest = {
			...MANIFEST,
			modules: [
				{
					...MANIFEST.modules[0],
					criteria: [
						MANIFEST.modules[0].criteria[0],
						{ ...MANIFEST.modules[0].criteria[1], id: 'quality' }
					]
				}
			]
		};
		const message = await captureError(() =>
			setRubric(teacherA.id, item, manifestToRubric(collides))
		);
		expect(message).toContain('Duplicate rubric criterion id "setup-quality"');
		// And the client says so first, without a round trip.
		expect(
			manifestRubricIssues(collides).some((i) => i.includes('repeats the criterion id "quality"'))
		).toBe(true);
	});

	test('an id the character set refuses is refused by the database too', async () => {
		const spaced: HtmlAssignmentManifest = {
			...MANIFEST,
			modules: [{ ...MANIFEST.modules[0], id: 'set up' }]
		};
		const message = await captureError(() =>
			setRubric(teacherA.id, item, manifestToRubric(spaced))
		);
		expect(message).toContain('needs an id (letters, digits, - and _ only)');
		expect(manifestRubricIssues(spaced).some((i) => i.includes('"set up-quality"'))).toBe(true);
	});
});

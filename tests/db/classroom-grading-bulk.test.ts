// tests/db/classroom-grading-bulk.test.ts
//
// BULK GRADING (migration 0175), against a real Postgres with the real
// migration files applied unmodified.
//
// WHY THIS IS AUTOMATED. Three of the four guarantees here regress SILENTLY.
//   * A batch that stops at the first refusal still returns `{ok:true}` with a
//     plausible-looking report; the students after the failure are simply not
//     graded and nothing on any screen says so.
//   * A per-student refusal that stopped being reported reads, from the
//     console, as a grade that landed.
//   * The cross-section boundary is invisible from the UI: a manager of one
//     section who could grade another section's student would look exactly like
//     one who could not, until a grade turned up in somebody else's gradebook.
//   * And `graded_at` is what CLEARS the post-grade change signal (prompt
//     0011); a bulk write that stamped it differently from the single-row path
//     would leave a whole class permanently flagged, or permanently clean.
//
// THE CHAIN IS DELIBERATELY SHORT OF 0175 AT BOOT, the way the extra-credit
// suite is short of 0171: the fixture grades through the REAL single-row RPC
// first, so the "before" is a measured state rather than an assumption, and
// 0175 is applied over the top exactly as it will be by hand.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

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
	'0095_classroom_leveled_rubrics.sql',
	'0133_classroom_storage_attachments.sql',
	'0134_classroom_submission_open_race.sql',
	'0160_classroom_submit_incomplete_work.sql',
	'0171_classroom_extra_credit.sql',
	'0137_anon_execute_sweep.sql'
] as const;

const read = (f: string) => readFileSync(join(process.cwd(), 'supabase', 'migrations', f), 'utf8');
const MIGRATION_0175 = read('0175_classroom_bulk_grading.sql');

interface BulkRow {
	email: string;
	ok: boolean;
	reason?: string;
	message?: string;
	missing?: string[];
	score?: number;
	state?: string;
	extra_credit?: number | null;
}
interface BulkResult {
	ok: boolean;
	total: number;
	succeeded: number;
	refused: number;
	results: BulkRow[];
}

let db: TestDb;
/** Manages Period 1 AND Period 2 of the same course. */
let teacher: SeededUser;
/** Manages Period 3 of the same course, and nothing else. */
let other: SeededUser;
let p1 = '';
let p2 = '';
let p3 = '';
let item = '';

/** Period 1. */
let alice: SeededUser;
let bruno: SeededUser;
let cleo: SeededUser;
/** Period 2 -- the SAME assignment, a different class. */
let dev: SeededUser;
let esme: SeededUser;
/** Period 3 -- posted to, but `teacher` does not manage it. */
let finn: SeededUser;

function rpc<T = Record<string, unknown>>(userId: string, call: string, params: unknown[]): Promise<T> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

async function captureError(run: () => Promise<unknown>): Promise<string> {
	try {
		await run();
	} catch (error) {
		return (error as { message?: string }).message ?? String(error);
	}
	throw new Error('Expected this statement to be rejected, but it succeeded.');
}

interface Grade {
	student_email: string;
	scores?: Record<string, number>;
	comment?: string | null;
	criterion_comments?: Record<string, string>;
	extra_credit?: number | null;
}

function bulk(userId: string, grades: Grade[], release = false, itemId = item): Promise<BulkResult> {
	return rpc<BulkResult>(
		userId,
		'public.classroom_grade_submissions($1::uuid, $2::jsonb, $3)',
		[itemId, JSON.stringify(grades), release]
	);
}

function single(userId: string, email: string, scores: Record<string, number>, release = false) {
	return rpc<{ ok: boolean; score?: number }>(
		userId,
		'public.classroom_grade_submission($1::uuid, $2, $3::jsonb, $4, $5, $6::jsonb, $7::numeric)',
		[item, email, JSON.stringify(scores), null, release, null, null]
	);
}

interface Row {
	student_email: string;
	score: string | null;
	extra_credit: string | null;
	rubric_scores: Record<string, number> | null;
	criterion_comments: Record<string, string> | null;
	teacher_comment: string | null;
	state: string;
	graded_at: Date | null;
	updated_at: Date | null;
}

async function rows(): Promise<Map<string, Row>> {
	const { rows: r } = await db.sql<Row>(
		`select student_email, score, extra_credit, rubric_scores, criterion_comments,
		        teacher_comment, state, graded_at, updated_at
		 from public.classroom_submissions where item_id = $1`,
		[item]
	);
	return new Map(r.map((x) => [x.student_email, x]));
}

const LEVELS = (max: number) => [
	{ points: max, label: 'Complete', descriptor: 'All of it.' },
	{ points: max / 2, label: 'Developing', descriptor: 'Some of it.' },
	{ points: 0, label: 'Absent', descriptor: 'Not attempted.' }
];

const RUBRIC = [
	{ id: 'c1', criterion: 'Sketch', points: 10, levels: LEVELS(10) },
	{ id: 'c2', criterion: 'Reflection', points: 10, levels: LEVELS(10) }
];

const SPEC = {
	schemaVersion: 1,
	meta: { assignmentId: 'idea100-u1-01', title: 'Bridge', totalPoints: 20 },
	modules: [
		{
			id: 'm1',
			title: 'Only module',
			points: 20,
			blocks: [{ type: 'textField', id: 'f1', prompt: 'Say something.', minSentences: 1 }],
			rubric: [
				{ id: 'c1', criterion: 'Sketch', levels: LEVELS(10) },
				{ id: 'c2', criterion: 'Reflection', levels: LEVELS(10) }
			]
		}
	]
};

beforeAll(async () => {
	db = await startTestDb(MIGRATIONS);
	teacher = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	other = await createUser(db, 'rmonroe@boscotech.edu', 'R. Monroe');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bruno = await createUser(db, 'bruno@boscotech.net', 'Bruno Baptiste');
	cleo = await createUser(db, 'cleo@boscotech.net', 'Cleo Cardenas');
	dev = await createUser(db, 'dev@boscotech.net', 'Dev Desai');
	esme = await createUser(db, 'esme@boscotech.net', 'Esme Eze');
	finn = await createUser(db, 'finn@boscotech.net', 'Finn Fadel');

	const course = await rpc<{ course_id: string }>(
		teacher.id,
		'public.classroom_upsert_course($1, $2)',
		['IDEA100', 'Intro to Engineering Design']
	);
	const mkSection = async (userId: string, label: string) =>
		(
			await rpc<{ section_id: string }>(
				userId,
				'public.classroom_upsert_section($1::uuid, $2, $3)',
				[course.course_id, label, null]
			)
		).section_id;

	p1 = await mkSection(teacher.id, 'Period 1');
	p2 = await mkSection(teacher.id, 'Period 2');
	// A DIFFERENT teacher of record. This is the section `teacher` must never
	// be able to grade, and it is a section of the SAME course carrying the
	// SAME assignment -- which is exactly the shape that makes a cross-section
	// console dangerous if the boundary is in the UI rather than the database.
	p3 = await mkSection(other.id, 'Period 3');

	const enroll = (owner: string, section: string, s: SeededUser) =>
		rpc(owner, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
			section,
			s.email,
			s.email,
			true
		]);
	for (const s of [alice, bruno, cleo]) await enroll(teacher.id, p1, s);
	for (const s of [dev, esme]) await enroll(teacher.id, p2, s);
	await enroll(other.id, p3, finn);

	// ONE canonical assignment, posted to all three sections. `classroom_items`
	// is the record and `classroom_postings` is the join, so "the same
	// assignment in three classes" is one row, not three.
	item = (
		await rpc<{ item_id: string }>(
			teacher.id,
			`public.classroom_create_item('assignment', $1::uuid[], $2, 'Do it.', 20, null, null, true, '[]'::jsonb, false)`,
			[[p1, p2], 'Bridge Sketch']
		)
	).item_id;
	await rpc(teacher.id, 'public.classroom_set_assignment_spec($1::uuid, $2::jsonb)', [
		item,
		JSON.stringify(SPEC)
	]);
	await rpc(teacher.id, 'public.classroom_set_rubric($1::uuid, $2::jsonb)', [
		item,
		JSON.stringify(RUBRIC)
	]);

	// PERIOD 3'S POSTING LANDS LAST, and by raw insert. `classroom_set_spec`
	// and `classroom_set_rubric` both require the caller to manage EVERY
	// section the item is posted to, so authoring has to finish before the
	// third class is attached -- which is exactly what happens in life when a
	// colleague posts your assignment into their own block. `teacher` could not
	// have made this posting, and that is the point of it.
	await db.sql(
		`insert into public.classroom_postings (item_id, section_id) values ($1, $2)
		 on conflict do nothing`,
		[item, p3]
	);


	for (const s of [alice, bruno, cleo, dev, esme, finn]) {
		await rpc(s.id, 'public.classroom_save_response($1::uuid, $2, $3::jsonb)', [
			item,
			'f1',
			JSON.stringify('A first answer that is a whole sentence.')
		]);
		await rpc(s.id, 'public.classroom_submit_assignment($1::uuid)', [item]);
	}

	// A REAL pre-0175 world: one student graded one at a time, through the RPC
	// the deployed console calls.
	await single(teacher.id, alice.email, { c1: 10, c2: 5 }, true);
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 1. Before the migration.
// ---------------------------------------------------------------------------

describe('the pre-0175 world has no bulk grade path', () => {
	test('the function does not exist', async () => {
		const { rows: r } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'classroom_grade_submissions'`
		);
		expect(r[0].n).toBe('0');
	});

	test('and the single-student path is the only one, so a class is one call per student', async () => {
		// The measurement the bundle exists to reduce, taken from the database
		// rather than asserted: five students still ungraded, five calls.
		const before = await rows();
		expect([...before.keys()].filter((e) => before.get(e)?.graded_at)).toEqual([alice.email]);
	});
});

// ---------------------------------------------------------------------------
// 2. Apply it.
// ---------------------------------------------------------------------------

describe('0175 applies, and re-applies', () => {
	test('the migration runs', async () => {
		await db.sql(MIGRATION_0175);
	});

	test('and running it again is not an error (re-pasting is ordinary)', async () => {
		await db.sql(MIGRATION_0175);
		const { rows: r } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'classroom_grade_submissions'`
		);
		// EXACTLY ONE. A second overload differing by a defaulted trailing
		// parameter is what makes PostgREST unable to resolve the call at all.
		expect(r[0].n).toBe('1');
	});

	test('anon cannot execute it and authenticated can', async () => {
		const { rows: r } = await db.sql<{ anon: boolean; auth: boolean; svc: boolean }>(
			`select has_function_privilege('anon', $1, 'execute') as anon,
			        has_function_privilege('authenticated', $1, 'execute') as auth,
			        has_function_privilege('service_role', $1, 'execute') as svc`,
			['public.classroom_grade_submissions(uuid, jsonb, boolean)']
		);
		expect(r[0].anon).toBe(false);
		expect(r[0].auth).toBe(true);
		// Not granted, and deliberately: nothing server-side holds the service
		// key and grades on somebody's behalf.
		expect(r[0].svc).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 3. The batch lands, and it lands the same rows the single path lands.
// ---------------------------------------------------------------------------

describe('one statement grades a whole class', () => {
	test('five students across two sections, one call, one report', async () => {
		const res = await bulk(
			teacher.id,
			[
				{ student_email: alice.email, scores: { c1: 10, c2: 10 } },
				{ student_email: bruno.email, scores: { c1: 10, c2: 5 } },
				{ student_email: cleo.email, scores: { c1: 5, c2: 5 }, extra_credit: 3 },
				{ student_email: dev.email, scores: { c1: 10, c2: 10 } },
				{ student_email: esme.email, scores: { c1: 0, c2: 5 }, comment: 'Come see me.' }
			],
			true
		);
		expect(res.ok).toBe(true);
		expect(res.total).toBe(5);
		expect(res.succeeded).toBe(5);
		expect(res.refused).toBe(0);
		expect(res.results.map((r) => r.email)).toEqual(
			[alice.email, bruno.email, cleo.email, dev.email, esme.email].sort()
		);
	});

	test('and the rows are exactly what the single-student RPC writes', async () => {
		const r = await rows();
		expect(Number(r.get(alice.email)!.score)).toBe(20);
		expect(Number(r.get(bruno.email)!.score)).toBe(15);
		// The award is summed into `score` by the one implementation, never by
		// this file: 5 + 5 + 3.
		expect(Number(r.get(cleo.email)!.score)).toBe(13);
		expect(Number(r.get(cleo.email)!.extra_credit)).toBe(3);
		expect(r.get(esme.email)!.teacher_comment).toBe('Come see me.');
		// `p_return` is one decision for the batch, and it reached every row.
		for (const s of [alice, bruno, cleo, dev, esme]) {
			expect(r.get(s.email)!.state).toBe('returned');
			expect(r.get(s.email)!.graded_at).not.toBeNull();
		}
	});

	test('a batch of one writes the same row as the single-student call', async () => {
		// The batch is a LOOP over the single call, not a second implementation.
		// Grading Bruno the same way twice, once each way, must produce the same
		// stored row apart from the instant.
		await single(teacher.id, bruno.email, { c1: 5, c2: 0 }, false);
		const viaSingle = (await rows()).get(bruno.email)!;
		await bulk(teacher.id, [{ student_email: bruno.email, scores: { c1: 5, c2: 0 } }], false);
		const viaBulk = (await rows()).get(bruno.email)!;
		expect(Number(viaBulk.score)).toBe(Number(viaSingle.score));
		expect(viaBulk.rubric_scores).toEqual(viaSingle.rubric_scores);
		expect(viaBulk.state).toBe(viaSingle.state);
		// Put Bruno back where the rest of the suite expects him.
		await bulk(teacher.id, [{ student_email: bruno.email, scores: { c1: 10, c2: 5 } }], true);
	});
});

// ---------------------------------------------------------------------------
// 4. PARTIAL FAILURE IS REPORTED, PER STUDENT. The assertion most likely to be
//    vacuous, so it is measured in both directions: the refused row is named
//    AND the rows either side of it landed.
// ---------------------------------------------------------------------------

describe('one student refusing does not abort the batch', () => {
	test('a score above a criterion maximum refuses that row and only that row', async () => {
		const res = await bulk(
			teacher.id,
			[
				// ON-LEVEL scores either side, so the only thing refused is the
				// one thing meant to be refused. (9 of 10 is BETWEEN levels and
				// would have needed an override comment -- a control that refuses
				// for its own reason proves nothing about the failure under test.)
				{ student_email: alice.email, scores: { c1: 10, c2: 5 } },
				// 12 of a possible 10. The single-row RPC RAISES on this; the
				// per-row handler turns it into a line in the report.
				{ student_email: bruno.email, scores: { c1: 12, c2: 5 } },
				{ student_email: cleo.email, scores: { c1: 5, c2: 10 } }
			],
			false
		);
		expect(res.total).toBe(3);
		expect(res.succeeded).toBe(2);
		expect(res.refused).toBe(1);
		const failed = res.results.filter((x) => !x.ok);
		expect(failed).toHaveLength(1);
		expect(failed[0].email).toBe(bruno.email);
		expect(failed[0].message ?? '').toContain('must be between 0 and 10');

		// THE POSITIVE HALF: the two either side of the failure are stored.
		const r = await rows();
		expect(Number(r.get(alice.email)!.score)).toBe(15);
		// 15 of rubric plus the 3 she was awarded in the batch above: an ABSENT
		// `extra_credit` key leaves the stored award alone (0171's contract,
		// unchanged by the loop).
		expect(Number(r.get(cleo.email)!.score)).toBe(18);
		// And the refused one kept the grade it already had. A refusal is not a
		// partial write.
		expect(Number(r.get(bruno.email)!.score)).toBe(15);
	});

	test('a structured refusal comes back with its reason and its criteria', async () => {
		const res = await bulk(
			teacher.id,
			// Releasing with a criterion unscored: the RPC RETURNS {ok:false}
			// rather than raising, so this is the other refusal shape entirely
			// and both have to survive the loop.
			[{ student_email: cleo.email, scores: { c1: 10 } }],
			true
		);
		expect(res.succeeded).toBe(0);
		expect(res.refused).toBe(1);
		expect(res.results[0].ok).toBe(false);
		expect(res.results[0].reason).toBe('incomplete_scores');
		expect(res.results[0].missing).toEqual(['c2']);
	});

	test('an override with no comment refuses that row, naming the criterion', async () => {
		const res = await bulk(
			teacher.id,
			[
				{ student_email: alice.email, scores: { c1: 10, c2: 10 } },
				// 7 is between the levels 10 and 5, so it needs a note.
				{ student_email: cleo.email, scores: { c1: 7, c2: 10 } }
			],
			false
		);
		expect(res.succeeded).toBe(1);
		const failed = res.results.find((x) => !x.ok)!;
		expect(failed.email).toBe(cleo.email);
		expect(failed.reason).toBe('override_needs_comment');
		expect(failed.missing).toEqual(['c1']);
	});

	test('and the same override WITH a comment lands', async () => {
		const res = await bulk(
			teacher.id,
			[
				{
					student_email: cleo.email,
					scores: { c1: 7, c2: 10 },
					criterion_comments: { c1: 'Two views in proportion, the third rushed.' }
				}
			],
			false
		);
		expect(res.succeeded).toBe(1);
		const r = await rows();
		// 7 + 10 of rubric, plus her standing 3-point award, which this call did
		// not mention and therefore did not touch.
		expect(Number(r.get(cleo.email)!.score)).toBe(20);
		expect(r.get(cleo.email)!.criterion_comments).toEqual({
			c1: 'Two views in proportion, the third rushed.'
		});
	});
});

// ---------------------------------------------------------------------------
// 5. THE CROSS-SECTION BOUNDARY. It is the database's, not the console's.
// ---------------------------------------------------------------------------

describe('a section the caller does not teach is refused, row by row', () => {
	test('Finn is on this assignment, in a section this teacher does not manage', async () => {
		// The setup, asserted rather than assumed: the item IS posted to Period
		// 3 and Finn IS enrolled there, so the only thing standing between this
		// teacher and his grade is the gate.
		const { rows: r } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.classroom_postings pg
			 join public.classroom_enrollments e on e.section_id = pg.section_id
			 where pg.item_id = $1 and e.student_email = $2`,
			[item, finn.email]
		);
		expect(r[0].n).toBe('1');
	});

	test('a batch naming him refuses HIS row and lands everyone else', async () => {
		const res = await bulk(
			teacher.id,
			[
				{ student_email: alice.email, scores: { c1: 10, c2: 5 } },
				{ student_email: finn.email, scores: { c1: 10, c2: 10 } },
				{ student_email: dev.email, scores: { c1: 10, c2: 5 } }
			],
			false
		);
		expect(res.total).toBe(3);
		expect(res.succeeded).toBe(2);
		expect(res.refused).toBe(1);
		const failed = res.results.find((x) => !x.ok)!;
		expect(failed.email).toBe(finn.email);
		expect(failed.message ?? '').toContain('teacher of record');

		const r = await rows();
		expect(r.get(finn.email)?.graded_at ?? null).toBeNull();
		expect(Number(r.get(alice.email)!.score)).toBe(15);
	});

	test('and the section-3 teacher CAN grade him, which is the positive control', async () => {
		const res = await bulk(other.id, [{ student_email: finn.email, scores: { c1: 10, c2: 10 } }], true);
		expect(res.succeeded).toBe(1);
		const r = await rows();
		expect(Number(r.get(finn.email)!.score)).toBe(20);
	});

	test('and that teacher cannot reach Period 1 in the other direction', async () => {
		const res = await bulk(other.id, [{ student_email: alice.email, scores: { c1: 0, c2: 0 } }], false);
		expect(res.succeeded).toBe(0);
		expect(res.results[0].message ?? '').toContain('teacher of record');
		const r = await rows();
		// Untouched: still the 15 the last landing batch wrote.
		expect(Number(r.get(alice.email)!.score)).toBe(15);
	});
});

// ---------------------------------------------------------------------------
// 6. `graded_at` STAMPS ON EVERY ROW, which is what clears the 0011 signal.
// ---------------------------------------------------------------------------

describe('a bulk grade clears the post-grade change signal, and a later edit raises it again', () => {
	test('grading in bulk stamps graded_at after every response', async () => {
		await bulk(
			teacher.id,
			[
				{ student_email: alice.email, scores: { c1: 10, c2: 10 } },
				{ student_email: bruno.email, scores: { c1: 10, c2: 10 } }
			],
			true
		);
		const { rows: r } = await db.sql<{ email: string; after: boolean }>(
			`select s.student_email as email,
			        s.graded_at > coalesce(max(rp.updated_at), s.graded_at - interval '1 day') as after
			 from public.classroom_submissions s
			 left join public.classroom_responses rp
			   on rp.item_id = s.item_id and rp.student_email = s.student_email
			 where s.item_id = $1 and s.student_email = any($2)
			 group by s.student_email, s.graded_at`,
			[item, [alice.email, bruno.email]]
		);
		expect(r).toHaveLength(2);
		// The comparison `postGradeChange` makes, in SQL: nothing was touched
		// after the grade, so there is nothing to flag.
		for (const x of r) expect(x.after).toBe(true);
	});

	test('and one student editing afterwards moves ONLY their own response past it', async () => {
		await rpc(alice.id, 'public.classroom_save_response($1::uuid, $2, $3::jsonb)', [
			item,
			'f1',
			JSON.stringify('I changed my mind after seeing the score, so here is more.')
		]);
		const { rows: r } = await db.sql<{ email: string; changed: boolean }>(
			`select s.student_email as email,
			        coalesce(max(rp.updated_at) > s.graded_at, false) as changed
			 from public.classroom_submissions s
			 left join public.classroom_responses rp
			   on rp.item_id = s.item_id and rp.student_email = s.student_email
			 where s.item_id = $1 and s.student_email = any($2)
			 group by s.student_email, s.graded_at
			 order by s.student_email`,
			[item, [alice.email, bruno.email]]
		);
		expect(r.map((x) => [x.email, x.changed])).toEqual([
			[alice.email, true],
			[bruno.email, false]
		]);
	});

	test('and grading her again in bulk clears it, exactly as a single grade does', async () => {
		await bulk(teacher.id, [{ student_email: alice.email, scores: { c1: 10, c2: 10 } }], true);
		const { rows: r } = await db.sql<{ changed: boolean }>(
			`select coalesce(max(rp.updated_at) > s.graded_at, false) as changed
			 from public.classroom_submissions s
			 left join public.classroom_responses rp
			   on rp.item_id = s.item_id and rp.student_email = s.student_email
			 where s.item_id = $1 and s.student_email = $2
			 group by s.graded_at`,
			[item, alice.email]
		);
		expect(r[0].changed).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 7. The shape refusals: everything that is refused BEFORE anything is written.
// ---------------------------------------------------------------------------

describe('a malformed batch is refused before any row is graded', () => {
	test('two spellings of one address are refused, naming the person', async () => {
		const message = await captureError(() =>
			bulk(teacher.id, [
				{ student_email: alice.email, scores: { c1: 10, c2: 10 } },
				{ student_email: alice.email.toUpperCase(), scores: { c1: 0, c2: 0 } }
			])
		);
		expect(message).toContain('appears twice');
		expect(message).toContain(alice.email);
	});

	test('and nothing was written when it refused', async () => {
		const r = await rows();
		// Still the 20 from the regrade above, not the 0 the duplicate asked for.
		expect(Number(r.get(alice.email)!.score)).toBe(20);
	});

	test('an empty batch is refused', async () => {
		expect(await captureError(() => bulk(teacher.id, []))).toContain('at least one student');
	});

	test('a non-array is refused', async () => {
		const message = await captureError(() =>
			rpc(teacher.id, 'public.classroom_grade_submissions($1::uuid, $2::jsonb, $3)', [
				item,
				JSON.stringify({ student_email: alice.email }),
				false
			])
		);
		expect(message).toContain('must be an array');
	});

	test('an entry with no address is refused, naming its position', async () => {
		const message = await captureError(() =>
			bulk(teacher.id, [
				{ student_email: alice.email, scores: { c1: 10, c2: 10 } },
				{ student_email: '' }
			])
		);
		expect(message).toContain('Entry 2');
	});

	test('over the ceiling is refused with the count', async () => {
		const many = Array.from({ length: 201 }, (_, i) => ({ student_email: `s${i}@boscotech.net` }));
		const message = await captureError(() => bulk(teacher.id, many));
		expect(message).toContain('at most 200');
		expect(message).toContain('201');
	});

	test('a signed-out caller cannot execute it at all', async () => {
		// TWO refusals, and the outer one is the stronger: `anon` holds no
		// EXECUTE grant, so the call is stopped by the privilege check before the
		// body's own `auth.uid()` guard is ever reached. Asserting the ACL as well
		// as the behaviour is what would catch a future migration sweeping the
		// grants blind and handing this back to `anon`.
		const message = await captureError(() =>
			db.asAnon(async (q) => {
				await q(`select public.classroom_grade_submissions($1::uuid, $2::jsonb, false)`, [
					item,
					JSON.stringify([{ student_email: alice.email }])
				]);
			})
		);
		expect(message).toContain('permission denied');
	});
});

// ---------------------------------------------------------------------------
// 8. Extra credit through the batch: absent means LEAVE ALONE.
// ---------------------------------------------------------------------------

describe('extra credit follows 0171 exactly, because it is 0171 doing it', () => {
	test('an award lands and is summed into score once', async () => {
		await bulk(teacher.id, [{ student_email: esme.email, scores: { c1: 5, c2: 5 }, extra_credit: 4 }]);
		const r = await rows();
		expect(Number(r.get(esme.email)!.score)).toBe(14);
		expect(Number(r.get(esme.email)!.extra_credit)).toBe(4);
	});

	test('an ABSENT key leaves the stored award alone', async () => {
		await bulk(teacher.id, [{ student_email: esme.email, scores: { c1: 10, c2: 5 } }]);
		const r = await rows();
		expect(Number(r.get(esme.email)!.extra_credit)).toBe(4);
		expect(Number(r.get(esme.email)!.score)).toBe(19);
	});

	test('an explicit 0 takes it back', async () => {
		await bulk(teacher.id, [
			{ student_email: esme.email, scores: { c1: 10, c2: 5 }, extra_credit: 0 }
		]);
		const r = await rows();
		expect(Number(r.get(esme.email)!.extra_credit)).toBe(0);
		expect(Number(r.get(esme.email)!.score)).toBe(15);
	});

	test('a negative award refuses that row and nothing else', async () => {
		const res = await bulk(teacher.id, [
			{ student_email: dev.email, scores: { c1: 10, c2: 10 } },
			{ student_email: esme.email, scores: { c1: 10, c2: 5 }, extra_credit: -2 }
		]);
		expect(res.succeeded).toBe(1);
		const failed = res.results.find((x) => !x.ok)!;
		expect(failed.email).toBe(esme.email);
		expect(failed.message ?? '').toContain('cannot be negative');
	});

	test('a non-numeric award refuses that row with the same sentence the console shows', async () => {
		const res = await rpc<BulkResult>(
			teacher.id,
			'public.classroom_grade_submissions($1::uuid, $2::jsonb, false)',
			[
				item,
				JSON.stringify([
					{ student_email: dev.email, scores: { c1: 10, c2: 10 } },
					{ student_email: esme.email, scores: { c1: 10, c2: 5 }, extra_credit: '3' }
				])
			]
		);
		expect(res.succeeded).toBe(1);
		const failed = res.results.find((x) => !x.ok)!;
		expect(failed.email).toBe(esme.email);
		expect(failed.message ?? '').toContain('0 or more');
	});
});

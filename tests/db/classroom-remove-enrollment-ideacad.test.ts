// tests/db/classroom-remove-enrollment-ideacad.test.ts
//
// Migration 0213 against a real Postgres: the enrollment-removal census learns
// about IdeaCAD.
//
// WHY THIS IS A TEST AND NOT A HARNESS DRIVE. The defect is invisible from
// every surface. `classroom_remove_enrollment` (0138) is a HARD DELETE whose
// refusal counts four kinds of work, IdeaCAD is not one of them, and
// `ideacad_roster` (0201) drives its whole row set off `classroom_enrollments`
// with the document LEFT JOINED on. So removing a student whose only work is a
// finished IdeaCAD part succeeds, looks exactly like a correct removal, and
// leaves the document sitting in the table with the one function that lists a
// class's IdeaCAD work unable to see it. Nothing raises, now or later.
//
// IT IS TESTED OVER SEEDED PRE-MIGRATION DATA, the 0128/0138 pattern: the
// suite boots the REAL chain SHORT of 0213, seeds a real class through the
// REAL RPCs, MEASURES THE DEFECT ACTUALLY HAPPENING, captures every refusal
// the deployed four-count census gives, then applies 0213 over the top and
// compares case for case.
//
// THE EXPECTED VALUES DO NOT COME FROM THE THING UNDER TEST. The four existing
// refusals are read off the DEPLOYED 0138 function before 0213 exists and are
// compared against the same calls afterwards; the new count is compared
// against an independent query over `ideacad_documents`, not against anything
// the function returned.
//
// A WIDENING THAT BREAKS AN EXISTING REFUSAL IS WORSE THAN THE HOLE, so the
// four baselines are asserted unchanged, key by key, and the removable case is
// asserted still removable. Both directions.
//
// Cast, all in P1 unless said otherwise. cadGone has ONLY IdeaCAD work and is
// removed BEFORE 0213 -- that is the defect, and the orphan he leaves is what
// section 5 uses to show 0213 does not retroactively repair one. cadKept has
// ONLY IdeaCAD work, on TWO blade items, and is the refusal 0213 buys; two
// rather than one because a count that is always 1 cannot be told from a
// boolean. cadElsewhere has IdeaCAD work in P9 ONLY, so removing him from P1
// must still succeed -- the new count is section-scoped like the other four.
// responder, handin, approved and notebooker each carry exactly one of 0138's
// four categories. nobody has nothing at all.

import { readdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';
import { enrollmentWorkSummary } from '../../src/lib/classroom/classroom';

const MIGRATION_FILE = '0213_classroom_remove_enrollment_ideacad_census.sql';
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

const ALL_MIGRATIONS = readdirSync(new URL('../../supabase/migrations', import.meta.url))
	.filter((file) => file.endsWith('.sql'))
	.sort();

/** The world as it was: everything except the file under test. */
const CHAIN = ALL_MIGRATIONS.filter((file) => file !== MIGRATION_FILE);

const MIGRATION_0213 = readFileSync(
	join(process.cwd(), 'supabase', 'migrations', MIGRATION_FILE),
	'utf8'
);

interface Removal {
	ok: boolean;
	reason?: string;
	total?: number;
	counts?: Record<string, number>;
}

let db: TestDb;
let teacher: SeededUser;
let cadGone: SeededUser;
let cadKept: SeededUser;
let cadElsewhere: SeededUser;
let responder: SeededUser;
let handin: SeededUser;
let approved: SeededUser;
let notebooker: SeededUser;
let nobody: SeededUser;
let p1: string;
let p9: string;
let bladeA: string;
let bladeB: string;
let bladeP9: string;
let worksheet: string;

const call = async <T>(user: SeededUser, expression: string, params: unknown[] = []): Promise<T> =>
	db.asUser(user.id, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${expression} as result`, params);
		return rows[0].result;
	});

const remove = (section: string, email: string) =>
	call<Removal>(teacher, 'public.classroom_remove_enrollment($1::uuid, $2)', [section, email]);

/** Documents this section would strand, asked of the TABLE and not the RPC. */
const documentsInSection = async (section: string, email: string): Promise<number> => {
	const { rows } = await db.sql<{ n: string }>(
		`select count(*)::text as n
		   from public.ideacad_documents d
		   join public.classroom_postings pg on pg.item_id = d.item_id
		  where d.student_email = $2 and pg.section_id = $1`,
		[section, email]
	);
	return Number(rows[0].n);
};

const enrolled = async (section: string, email: string): Promise<boolean> => {
	const { rows } = await db.sql(
		`select 1 from public.classroom_enrollments where section_id = $1 and student_email = $2`,
		[section, email]
	);
	return rows.length === 1;
};

function levels(max: number) {
	return [
		{ points: max, label: 'Complete', descriptor: 'Everything asked for is present and correct.' },
		{ points: Math.round(max / 2), label: 'Developing', descriptor: 'Some of it is present.' },
		{ points: 0, label: 'Absent', descriptor: 'Not attempted.' }
	];
}

const SPEC = {
	schemaVersion: 1,
	meta: { assignmentId: 'idea100-u1-01', title: 'Material ID Checkpoint', totalPoints: 20 },
	modules: [
		{
			id: 'm1',
			title: 'Observe',
			points: 20,
			blocks: [
				{ type: 'instructions', content: 'Look closely at the six materials.' },
				{ type: 'textField', id: 'f1', prompt: 'Explain your method.', minSentences: 1 }
			],
			rubric: [{ id: 'c1', criterion: 'Method explained', levels: levels(20) }]
		}
	]
};

/** The refusals 0138's own four-count census gives, read before 0213 exists. */
const baseline = new Map<string, Removal>();

beforeAll(async () => {
	db = await startTestDb([FIXTURE_COMPLETION, ...CHAIN]);

	teacher = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	cadGone = await createUser(db, 'cadgone@boscotech.net', 'Cam Gone');
	cadKept = await createUser(db, 'cadkept@boscotech.net', 'Kit Kept');
	cadElsewhere = await createUser(db, 'cadelse@boscotech.net', 'Elle Sewhere');
	responder = await createUser(db, 'responder@boscotech.net', 'Rae Sponder');
	handin = await createUser(db, 'handin@boscotech.net', 'Hana Din');
	approved = await createUser(db, 'approved@boscotech.net', 'Ann Proved');
	notebooker = await createUser(db, 'notebooker@boscotech.net', 'Noa Booker');
	nobody = await createUser(db, 'nobody@boscotech.net', 'Noa Body');

	const course = await call<{ course_id: string }>(
		teacher,
		'public.classroom_upsert_course($1, $2)',
		['IDEA100', 'Intro to Engineering Design']
	);
	p1 = (
		await call<{ section_id: string }>(
			teacher,
			'public.classroom_upsert_section($1::uuid, $2, null, $3)',
			[course.course_id, 'Period 1', teacher.email]
		)
	).section_id;
	p9 = (
		await call<{ section_id: string }>(
			teacher,
			'public.classroom_upsert_section($1::uuid, $2, null, $3)',
			[course.course_id, 'Period 9', teacher.email]
		)
	).section_id;

	for (const [section, student] of [
		[p1, cadGone],
		[p1, cadKept],
		[p1, cadElsewhere],
		[p9, cadElsewhere],
		[p1, responder],
		[p1, handin],
		[p1, approved],
		[p1, notebooker],
		[p1, nobody]
	] as const) {
		await call(teacher, 'public.classroom_set_enrollment($1::uuid, $2, $3, true)', [
			section,
			student.email,
			student.email
		]);
	}

	// Three blade assignments: two in P1, one in P9.
	const blade = async (section: string, title: string) => {
		const item = await call<{ item_id: string }>(
			teacher,
			`public.classroom_create_item('assignment', $1::uuid[], $2, 'Build it.', 20, null, null, true, '[]'::jsonb, false)`,
			[[section], title]
		);
		await call(teacher, "public.ideacad_set_editor($1::uuid, 'blade', $2::jsonb)", [
			item.item_id,
			JSON.stringify({ defaultFeatures: { blade: 'seed' } })
		]);
		return item.item_id;
	};
	bladeA = await blade(p1, 'Blade A');
	bladeB = await blade(p1, 'Blade B');
	bladeP9 = await blade(p9, 'Blade P9');

	// A plain worksheet for the four existing categories.
	worksheet = (
		await call<{ item_id: string }>(
			teacher,
			`public.classroom_create_item('assignment', $1::uuid[], 'Material worksheet', 'Do the work.', 20, null, null, true, '[]'::jsonb, false)`,
			[[p1]]
		)
	).item_id;
	await call(teacher, 'public.classroom_set_assignment_spec($1::uuid, $2::jsonb)', [
		worksheet,
		JSON.stringify(SPEC)
	]);

	// IdeaCAD work, and NOTHING else, for the three CAD students.
	await call(cadGone, 'public.ideacad_open_document($1::uuid)', [bladeA]);
	await call(cadKept, 'public.ideacad_open_document($1::uuid)', [bladeA]);
	await call(cadKept, 'public.ideacad_open_document($1::uuid)', [bladeB]);
	await call(cadElsewhere, 'public.ideacad_open_document($1::uuid)', [bladeP9]);

	// A real edit on top of the seeded concept, so cadKept's part is work
	// somebody did rather than a page they loaded.
	const opened = await call<{ concepts: Array<{ id: string; revision: number }> }>(
		cadKept,
		'public.ideacad_open_document($1::uuid)',
		[bladeA]
	);
	await call(cadKept, 'public.ideacad_save_concept($1::uuid, $2::jsonb, $3)', [
		opened.concepts[0].id,
		JSON.stringify({ blade: 'a real part' }),
		opened.concepts[0].revision + 1
	]);

	// One of each of 0138's four categories, through the real RPCs.
	await call(responder, 'public.classroom_save_response($1::uuid, $2, $3::jsonb)', [
		worksheet,
		'f1',
		JSON.stringify({ text: 'I compared the samples by mass.' })
	]);
	await call(handin, 'public.classroom_save_response($1::uuid, $2, $3::jsonb)', [
		worksheet,
		'f1',
		JSON.stringify({ text: 'I used the scale.' })
	]);
	await call(handin, 'public.classroom_submit_assignment($1::uuid)', [worksheet]);
	await call(teacher, 'public.classroom_approve_module($1::uuid, $2, $3, true)', [
		worksheet,
		approved.email,
		'm1'
	]);
	const session = await call<{ session_id: string }>(
		teacher,
		'public.notebook_admin_upsert_session($1::uuid[], $2, $3::date, $4)',
		[[p1], 1, '2026-09-02', 'Bench day 1']
	);
	await call(notebooker, 'public.notebook_create_entry($1, $2, $3, $4, $5, $6)', [
		notebooker.id,
		'drive-notebooker',
		session.session_id,
		p1,
		null,
		'page.jpg'
	]);
}, 900_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 1. The defect, measured, before the migration exists.
// ---------------------------------------------------------------------------

describe('before 0213: the census is blind to IdeaCAD', () => {
	test('the deployed census reads four tables and none of them is an IdeaCAD one', async () => {
		const { rows } = await db.sql<{ prosrc: string }>(
			`select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'classroom_remove_enrollment'`
		);
		expect(rows.length).toBe(1);
		const src = rows[0].prosrc;
		// The positive control: the four it DOES count are all there.
		for (const table of [
			'public.classroom_responses',
			'public.classroom_submissions',
			'public.classroom_module_approvals',
			'public.notebook_entries'
		]) {
			expect(src).toContain(table);
		}
		expect(src).not.toContain('ideacad');
	});

	test('cadGone has a real IdeaCAD document and ideacad_roster lists it', async () => {
		expect(await documentsInSection(p1, cadGone.email)).toBe(1);
		const roster = await call<Array<{ studentEmail: string; document: unknown }>>(
			teacher,
			'public.ideacad_roster($1::uuid)',
			[bladeA]
		);
		const row = roster.find((r) => r.studentEmail === cadGone.email);
		expect(row).toBeDefined();
		expect(row?.document).not.toBeNull();
	});

	test('THE DEFECT: he is removed outright, and the refusal never fires', async () => {
		const res = await remove(p1, cadGone.email);
		expect(res).toEqual({ ok: true, section_id: p1, student_email: cadGone.email });
		expect(await enrolled(p1, cadGone.email)).toBe(false);
	});

	test('and the document survives with nothing able to list it', async () => {
		// The row is still there -- this is loss, not deletion.
		expect(await documentsInSection(p1, cadGone.email)).toBe(1);
		const roster = await call<Array<{ studentEmail: string }>>(
			teacher,
			'public.ideacad_roster($1::uuid)',
			[bladeA]
		);
		// The positive control sits in the same reading: cadKept is still listed,
		// so an empty roster cannot be what produced this absence.
		expect(roster.map((r) => r.studentEmail)).toContain(cadKept.email);
		expect(roster.map((r) => r.studentEmail)).not.toContain(cadGone.email);
	});

	test('cadKept, whose only work is IdeaCAD, would be removed too', async () => {
		// NOT executed -- proving it by executing it would consume the case the
		// rest of this file needs. The census is what decides, and it has no
		// IdeaCAD term at all, so its answer for cadKept is the answer it just
		// gave for cadGone.
		expect(await documentsInSection(p1, cadKept.email)).toBe(2);
		const { rows } = await db.sql<{ prosrc: string }>(
			`select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'classroom_remove_enrollment'`
		);
		expect(rows[0].prosrc).not.toContain('ideacad');
	});

	test('the four existing refusals, captured verbatim from the deployed function', async () => {
		for (const [who, key] of [
			[responder, 'responses'],
			[handin, 'submissions'],
			[approved, 'approvals'],
			[notebooker, 'notebook_entries']
		] as const) {
			const res = await remove(p1, who.email);
			expect(res.ok).toBe(false);
			expect(res.reason).toBe('work_attached');
			expect(res.counts?.[key]).toBeGreaterThan(0);
			expect(await enrolled(p1, who.email)).toBe(true);
			baseline.set(who.email, res);
		}
		expect(baseline.size).toBe(4);
	});
});

// ---------------------------------------------------------------------------
// 2. The migration applies, and re-applies.
// ---------------------------------------------------------------------------

describe('0213 applies over that data, and re-applies', () => {
	test('it applies and is idempotent', async () => {
		await db.sql(MIGRATION_0213);
		await db.sql(MIGRATION_0213);
	});

	test('exactly one arity survives, so no overload was added beside it', async () => {
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'classroom_remove_enrollment'`
		);
		expect(rows[0].n).toBe('1');
	});

	test('anon cannot execute it and authenticated can', async () => {
		const { rows } = await db.sql<{ anon: boolean; authed: boolean }>(
			`select has_function_privilege('anon', 'public.classroom_remove_enrollment(uuid, text)', 'execute') as anon,
			        has_function_privilege('authenticated', 'public.classroom_remove_enrollment(uuid, text)', 'execute') as authed`
		);
		expect(rows[0].anon).toBe(false);
		expect(rows[0].authed).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 3. The hole is closed.
// ---------------------------------------------------------------------------

describe('after 0213: IdeaCAD work refuses the removal, with a count', () => {
	test('a student whose ONLY work is IdeaCAD is refused, and the count is right', async () => {
		const independent = await documentsInSection(p1, cadKept.email);
		expect(independent).toBe(2);

		const res = await remove(p1, cadKept.email);
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('work_attached');
		expect(res.counts).toEqual({
			responses: 0,
			submissions: 0,
			approvals: 0,
			notebook_entries: 0,
			ideacad_documents: independent
		});
		expect(res.total).toBe(independent);
		expect(await enrolled(p1, cadKept.email)).toBe(true);
		// It is a COUNT and not a flag: two documents, reported as two.
		expect(enrollmentWorkSummary(res.counts as never)).toBe('2 IdeaCAD documents');
	});

	test('nothing was partially deleted: the documents and concepts are untouched', async () => {
		expect(await documentsInSection(p1, cadKept.email)).toBe(2);
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.ideacad_concepts c
			   join public.ideacad_documents d on d.id = c.document_id
			  where d.student_email = $1`,
			[cadKept.email]
		);
		expect(Number(rows[0].n)).toBeGreaterThan(0);
	});

	test('the count is SECTION-SCOPED: IdeaCAD work in P9 does not refuse a P1 removal', async () => {
		expect(await documentsInSection(p9, cadElsewhere.email)).toBe(1);
		expect(await documentsInSection(p1, cadElsewhere.email)).toBe(0);
		const res = await remove(p1, cadElsewhere.email);
		expect(res).toEqual({ ok: true, section_id: p1, student_email: cadElsewhere.email });
		expect(await enrolled(p1, cadElsewhere.email)).toBe(false);
		// The positive control: his P9 enrollment and his document are both still
		// there, so the removal took the one thing it was asked for.
		expect(await enrolled(p9, cadElsewhere.email)).toBe(true);
		expect(await documentsInSection(p9, cadElsewhere.email)).toBe(1);
	});

	test('a student with no work at all is STILL removable', async () => {
		const res = await remove(p1, nobody.email);
		expect(res).toEqual({ ok: true, section_id: p1, student_email: nobody.email });
		expect(await enrolled(p1, nobody.email)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 4. A widening that breaks an existing refusal is worse than the hole.
// ---------------------------------------------------------------------------

describe('after 0213: each of the four existing categories refuses exactly as it did', () => {
	test('same reason, same four counts, same total, and the new key is zero', async () => {
		for (const who of [responder, handin, approved, notebooker]) {
			const before = baseline.get(who.email);
			expect(before).toBeDefined();
			const after = await remove(p1, who.email);

			expect(after.ok).toBe(false);
			expect(after.reason).toBe(before?.reason);
			for (const key of ['responses', 'submissions', 'approvals', 'notebook_entries'] as const) {
				expect(`${who.email}.${key}=${after.counts?.[key]}`).toBe(
					`${who.email}.${key}=${before?.counts?.[key]}`
				);
			}
			// Nothing else got swept in: none of these four has IdeaCAD work.
			expect(after.counts?.ideacad_documents).toBe(0);
			expect(after.total).toBe(before?.total);
			expect(await enrolled(p1, who.email)).toBe(true);
		}
	});

	test('a removal that is not enrolled at all still answers not_enrolled', async () => {
		const res = await remove(p1, cadGone.email);
		expect(res).toEqual({ ok: false, reason: 'not_enrolled', student_email: cadGone.email });
	});
});

// ---------------------------------------------------------------------------
// 5. What 0213 does NOT do, asserted rather than left to be assumed.
// ---------------------------------------------------------------------------

describe('0213 is the census and not the archive', () => {
	test('it does not repair an orphan an earlier removal already made', async () => {
		// cadGone was removed while the census was blind. His document is still
		// in the table and ideacad_roster still cannot see it, after 0213 as
		// before it. Closing that is decision 29's archive bundle, not this one.
		expect(await documentsInSection(p1, cadGone.email)).toBe(1);
		const roster = await call<Array<{ studentEmail: string }>>(
			teacher,
			'public.ideacad_roster($1::uuid)',
			[bladeA]
		);
		expect(roster.map((r) => r.studentEmail)).toContain(cadKept.email);
		expect(roster.map((r) => r.studentEmail)).not.toContain(cadGone.email);
	});
});

// ---------------------------------------------------------------------------
// 6. The precondition guard, on its own database.
//
//    plpgsql resolves a table reference when the statement first RUNS, so a
//    `create or replace` naming `public.ideacad_documents` on a database
//    without 0201 succeeds QUIETLY and then fails at every removal attempt --
//    including the ones that would otherwise have been allowed, which turns a
//    widened refusal into a total outage of the Remove control. Section 1 of
//    the migration refuses instead. That refusal is the kind of thing that is
//    only ever exercised on a database nobody has, so it gets a control.
// ---------------------------------------------------------------------------

describe('0213 refuses a database that cannot carry it', () => {
	let short: TestDb;

	beforeAll(async () => {
		// Everything up to but NOT including 0201, which creates ideacad_documents.
		short = await startTestDb([
			FIXTURE_COMPLETION,
			...CHAIN.filter((file) => file < '0201_')
		]);
	}, 900_000);

	afterAll(async () => {
		await short?.stop();
	});

	test('the positive control: 0138 is there and ideacad_documents is not', async () => {
		const { rows } = await short.sql<{ fn: string | null; tbl: string | null }>(
			`select to_regprocedure('public.classroom_remove_enrollment(uuid, text)')::text as fn,
			        to_regclass('public.ideacad_documents')::text as tbl`
		);
		expect(rows[0].fn).not.toBeNull();
		expect(rows[0].tbl).toBeNull();
	});

	test('it raises, names 0201, and changes nothing', async () => {
		const before = await short.sql<{ prosrc: string }>(
			`select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'classroom_remove_enrollment'`
		);
		await expect(short.sql(MIGRATION_0213)).rejects.toThrow(/0201_ideacad_blade_editor\.sql/);
		const after = await short.sql<{ prosrc: string }>(
			`select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'classroom_remove_enrollment'`
		);
		expect(after.rows[0].prosrc).toBe(before.rows[0].prosrc);
		expect(after.rows[0].prosrc).not.toContain('ideacad');
	});
});

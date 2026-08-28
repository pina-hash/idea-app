// tests/classroom-course-categories.test.ts
//
// The grading-category datalist's read (0142), and the reason it is an RPC.
//
// WHY THIS IS AUTOMATED WHEN MOST THINGS HERE ARE NOT. Every guarantee below
// fails SILENTLY. The whole defect this bundle fixes is a read that returns a
// plausible-looking short answer with no error anywhere: `classroom_items` is
// gated per SECTION by `classroom_can_read_item`, so a plain select scoped to a
// COURSE is narrowed by RLS to the caller's own sections and handed back
// looking exactly like a correct result. Nobody browsing the composer could
// tell the difference between "this course has three categories" and "this
// course has three categories that I personally posted". The mirror-image
// failure -- a definer function that widened too far -- is equally quiet: a
// teacher would simply be offered a course they have no claim on, which reads
// as a longer list rather than as a leak.
//
// SO BOTH DIRECTIONS ARE ASSERTED WITH THEIR CONTROLS, per this repo's rule
// that an exclusion assertion without a positive control cannot be told from a
// scan that found nothing at all.
//
// AND THE PREMISE ITSELF IS MEASURED, not taken on trust: `describe('the
// premise')` drives the narrowed select a naive implementation would have made
// and shows it silently dropping a category the RPC returns. If RLS on
// `classroom_items` ever widens to the course, that block reddens and this
// whole function becomes deletable -- which is the finding you would want.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import { courseCategorySuggestions } from '../src/lib/classroom/classroom';
import { createClassroomTransports } from '../src/lib/classroom/transports';

/**
 * The classroom items chain, plus 0111 (which is where
 * `_classroom_manages_course` -- the gate 0142 reuses rather than restates --
 * comes from), plus the file under test.
 *
 * 0137 IS SECOND TO LAST, NOT LAST. It is a sweep over what the chain above it
 * created, and 0142 comes after it in the real apply order too. That ordering
 * is load-bearing here rather than cosmetic: the stub carries this project's
 * default privileges, so 0142's `create function` arrives with a fresh `anon`
 * grant that only its OWN revoke removes. Running the sweep afterwards would
 * hide a missing revoke in exactly the file that has to have one.
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
	'0092_classroom_reference_specs.sql',
	'0104_classroom_edit_visibility.sql',
	'0108_classroom_rich_body.sql',
	'0109_classroom_scheduled_posting.sql',
	'0111_classroom_units.sql',
	'0137_anon_execute_sweep.sql',
	'0142_classroom_course_categories.sql'
];

/** The same chain with the file under test removed: a deployment that has this
 *  branch's client code and has not had 0142 pasted into the SQL editor yet,
 *  which is a real state because migrations here are applied by hand. */
const CHAIN_WITHOUT = CHAIN.filter((f) => !f.startsWith('0142'));

let db: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;

let owner: SeededUser;
let teacherA: SeededUser;
let teacherB: SeededUser;
let teacherC: SeededUser;
let student: SeededUser;

/** Two sections of ONE course, taught by two different people. */
let p1: string;
let p2: string;
/** A section of a DIFFERENT course the ENG teachers have no claim on. */
let phys: string;

let engCourse: string;
let physCourse: string;

const rpc = <T>(as: SeededUser, sql: string, params: unknown[]) =>
	db.asUser(as.id, async (q) => (await q<{ result: T }>(sql, params)).rows[0].result);

const createItem = (
	as: SeededUser,
	sectionIds: string[],
	title: string,
	category: string | null,
	published = true
) =>
	rpc<{ item_id: string }>(
		as,
		'select public.classroom_create_item($1, $2::uuid[], $3, $4, null, null, $5, $6) as result',
		['assignment', sectionIds, title, 'Body text.', category, published]
	).then((r) => r.item_id);

/** The function under test, called the way PostgREST calls it. */
const categories = (as: SeededUser, courseIds: (string | null)[]) =>
	rpc<string[] | null>(as, 'select public.classroom_course_categories($1::uuid[]) as result', [
		courseIds
	]);

const courseOf = async (sectionId: string): Promise<string> =>
	(
		await db.sql<{ course_id: string }>(
			'select course_id from public.classroom_sections where id = $1',
			[sectionId]
		)
	).rows[0].course_id;

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	fks = await loadForeignKeys(db);

	owner = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	teacherA = await createUser(db, 'a.teacher@boscotech.edu', 'A Teacher');
	teacherB = await createUser(db, 'b.teacher@boscotech.edu', 'B Teacher');
	teacherC = await createUser(db, 'c.teacher@boscotech.edu', 'C Teacher');
	student = await createUser(db, 'kid@boscotech.net', 'Kid Student');

	p1 = await createClassroomSection(db, {
		as: owner,
		courseCode: 'IDEA209H',
		courseTitle: 'Engineering I Honors',
		label: 'Period 1',
		teacherEmail: teacherA.email
	});
	p2 = await createClassroomSection(db, {
		as: owner,
		courseCode: 'IDEA209H',
		courseTitle: 'Engineering I Honors',
		label: 'Period 2',
		teacherEmail: teacherB.email
	});
	phys = await createClassroomSection(db, {
		as: owner,
		courseCode: 'IDEA301',
		courseTitle: 'Applied Physics',
		label: 'Period 4',
		teacherEmail: teacherC.email
	});

	engCourse = await courseOf(p1);
	physCourse = await courseOf(phys);
	expect(engCourse).toBe(await courseOf(p2));
	expect(engCourse).not.toBe(physCourse);

	// A student enrolled in p1: enrolled is NOT managing, and that difference is
	// the one an over-wide gate would erase.
	await enrollStudent(db, {
		as: owner,
		sectionId: p1,
		email: student.email,
		displayName: 'Kid Student'
	});

	// teacherA's own vocabulary, in the section they teach.
	await createItem(teacherA, [p1], 'Bridge build', 'Unit Labs');
	await createItem(teacherA, [p1], 'Second lab', 'Unit Labs');
	// teacherB's, in the OTHER section of the SAME course. This is the half a
	// section-scoped read silently drops.
	await createItem(teacherB, [p2], 'Notebook check', 'Documentation');
	// A DRAFT. An unpublished item's category is still a category its author
	// chose, and the vocabulary includes it deliberately.
	await createItem(teacherB, [p2], 'Not live yet', 'Design Review', false);
	// No category at all: must not surface as a null in the array.
	await createItem(teacherA, [p1], 'Uncategorized', null);
	// ONE item posted to BOTH sections of the course. It must contribute its
	// category ONCE, not once per posting.
	await createItem(owner, [p1, p2], 'Co-posted', 'Shared Thing');
	// A different course entirely.
	await createItem(teacherC, [phys], 'Field work', 'Field Work');
});

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------

describe('the premise: a plain course-scoped select is silently narrowed by RLS', () => {
	/**
	 * The read a naive implementation would have made -- run as the caller,
	 * through RLS, exactly as the browser client would. It is not refused and
	 * it does not error; it just quietly answers with less.
	 */
	const narrowedSelect = (as: SeededUser, courseId: string) =>
		db.asUser(as.id, async (q) => {
			const { rows } = await q<{ category: string }>(
				`select distinct i.category
				 from public.classroom_items i
				 join public.classroom_postings pg on pg.item_id = i.id
				 join public.classroom_sections s on s.id = pg.section_id
				 where s.course_id = $1 and i.category is not null`,
				[courseId]
			);
			return rows.map((r) => r.category).sort();
		});

	it('returns a short answer rather than an error, so nothing reports the loss', async () => {
		const seen = await narrowedSelect(teacherA, engCourse);
		// It worked. That is the problem: no throw, no empty result, no signal.
		expect(seen.length).toBeGreaterThan(0);
		expect(seen).toContain('Unit Labs');
		// And the other teacher's half of the COURSE vocabulary is simply gone.
		expect(seen).not.toContain('Documentation');
		expect(seen).not.toContain('Design Review');
	});

	it('the definer function answers the question the composer actually asked', async () => {
		// The SAME caller, the SAME course, through 0142: the whole course.
		const via = (await categories(teacherA, [engCourse])) ?? [];
		expect(via).toContain('Unit Labs');
		expect(via).toContain('Documentation');
		expect(via).toContain('Design Review');
	});

	it('there is still no course-level predicate reachable from a client', async () => {
		// `_classroom_manages_course` exists (0111) and is exactly the right rule,
		// which is why 0142 calls it instead of writing a second one -- but it is
		// internal, so a browser cannot ask it and cannot narrow its own select
		// correctly either. Both client roles are refused.
		for (const role of ['anon', 'authenticated']) {
			const { rows } = await db.sql<{ ok: boolean }>(
				`select has_function_privilege($1, 'public._classroom_manages_course(uuid)', 'execute') as ok`,
				[role]
			);
			expect(rows[0].ok).toBe(false);
		}
	});
});

// ---------------------------------------------------------------------------

describe('classroom_course_categories: the per-course gate, both directions', () => {
	it('GRANTS the whole course to a teacher of ONE of its sections', async () => {
		const out = (await categories(teacherA, [engCourse])) ?? [];
		// The positive control for the exclusion below: this caller manages p1
		// and NOT p2, and gets p2's vocabulary anyway, because the scope is the
		// course. That is the entire point of the function.
		expect(out).toContain('Documentation');
		expect(out).toContain('Design Review');
		expect(out).toContain('Unit Labs');
		expect(out).toContain('Shared Thing');
	});

	it('REFUSES a course the caller manages no section of', async () => {
		const out = (await categories(teacherA, [physCourse])) ?? [];
		expect(out).toEqual([]);
		// Positive control, same caller, same call: the gate is per course and is
		// answering, not blanket-denying.
		expect((await categories(teacherA, [engCourse])) ?? []).not.toEqual([]);
	});

	it('SKIPS an unmanaged id in a mixed array instead of raising or failing the call', async () => {
		const out = (await categories(teacherA, [engCourse, physCourse])) ?? [];
		expect(out).toContain('Unit Labs');
		expect(out).not.toContain('Field Work');
	});

	it('answers the mirror case for the other course, so neither result is a constant', async () => {
		const out = (await categories(teacherC, [engCourse, physCourse])) ?? [];
		expect(out).toEqual(['Field Work']);
	});

	it('grants an admin every course', async () => {
		const out = (await categories(owner, [engCourse, physCourse])) ?? [];
		expect(out).toContain('Unit Labs');
		expect(out).toContain('Field Work');
	});

	it('gives an ENROLLED STUDENT nothing: enrolled is not managing', async () => {
		expect((await categories(student, [engCourse])) ?? []).toEqual([]);
		// The student really is on that roster, so the empty answer above is the
		// gate refusing and not a broken fixture.
		const { rows } = await db.sql<{ n: string }>(
			'select count(*) as n from public.classroom_enrollments where section_id = $1 and student_email = $2',
			[p1, student.email]
		);
		expect(Number(rows[0].n)).toBe(1);
	});

	it('answers an empty, a null and an all-unknown array without raising', async () => {
		expect((await categories(teacherA, [])) ?? []).toEqual([]);
		expect((await categories(teacherA, [null])) ?? []).toEqual([]);
		expect(
			await rpc<string[] | null>(
				teacherA,
				'select public.classroom_course_categories(null::uuid[]) as result',
				[]
			)
		).toEqual([]);
	});
});

// ---------------------------------------------------------------------------

describe('classroom_course_categories: what it projects, and how much', () => {
	it('returns bare strings and nothing else -- no title, author, id or section', async () => {
		const out = (await categories(teacherA, [engCourse])) ?? [];
		expect(out.length).toBeGreaterThan(0);
		for (const entry of out) expect(typeof entry).toBe('string');
		// Nothing in the array is a row object wearing a category field. A widened
		// projection would show up here first.
		const asJson = JSON.stringify(out);
		expect(asJson).not.toContain('title');
		expect(asJson).not.toContain('Bridge build');
		expect(asJson).not.toContain(teacherB.email);
		expect(asJson).not.toContain(p2);
	});

	it('counts an item ONCE however many sections of the course it is posted to', async () => {
		const out = (await categories(teacherA, [engCourse])) ?? [];
		// 'Co-posted' is posted to p1 AND p2. Counted per posting it would appear
		// twice and outrank a category a teacher genuinely used more often, for a
		// reason invisible to whoever read the list.
		expect(out.filter((c) => c === 'Shared Thing')).toHaveLength(1);
		// Positive control: repeats that come from DIFFERENT items are kept,
		// because the repeats are what the client ranks by.
		expect(out.filter((c) => c === 'Unit Labs')).toHaveLength(2);
	});

	it('drops a null category rather than returning a null element', async () => {
		const out = (await categories(teacherA, [engCourse])) ?? [];
		expect(out).not.toContain(null);
		expect(out.every((c) => typeof c === 'string' && c.length > 0)).toBe(true);
	});

	it('does not rank or de-duplicate in SQL -- that is the client\'s job', async () => {
		const raw = (await categories(teacherA, [engCourse])) ?? [];
		// Raw carries repeats; the pure client function is what turns them into a
		// distinct, most-used-first list. If SQL had ranked, these would be equal.
		expect(raw.length).toBeGreaterThan(new Set(raw).size);
		expect(courseCategorySuggestions(raw)[0]).toBe('Unit Labs');
	});

	it('is deterministic across calls, so the offered list does not reshuffle', async () => {
		const a = await categories(teacherA, [engCourse]);
		const b = await categories(teacherA, [engCourse]);
		expect(a).toEqual(b);
	});
});

// ---------------------------------------------------------------------------

describe('classroom_course_categories: the grant', () => {
	it('is executable by authenticated and NOT by anon', async () => {
		const { rows } = await db.sql<{ role: string; ok: boolean }>(
			`select r as role,
			        has_function_privilege(r, 'public.classroom_course_categories(uuid[])', 'execute') as ok
			 from unnest(array['anon','authenticated']) as r`
		);
		const acl = Object.fromEntries(rows.map((r) => [r.role, r.ok]));
		expect(acl).toEqual({ anon: false, authenticated: true });
	});

	it('refuses a signed-out caller at the grant', async () => {
		await expect(
			db.asAnon((q) => q('select public.classroom_course_categories($1::uuid[])', [[engCourse]]))
		).rejects.toThrow(/permission denied/i);
	});

	it('re-applies: pasting the file a second time is an ordinary thing to do', async () => {
		// Migrations here go into the Supabase SQL editor by hand, so a re-paste
		// (someone runs it twice, or a first attempt failed partway and gets
		// retried) has to be harmless. The self-check inside the file raises if
		// the grant came out wrong, so this also re-asserts the ACL for free.
		const sql = readFileSync(
			join(process.cwd(), 'supabase', 'migrations', '0142_classroom_course_categories.sql'),
			'utf8'
		);
		await expect(db.sql(sql)).resolves.toBeDefined();

		const { rows } = await db.sql<{ n: string }>(
			`select count(*) as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'classroom_course_categories'`
		);
		expect(Number(rows[0].n)).toBe(1);
		// And it still answers, with the grant the revoke put back.
		expect((await categories(teacherA, [engCourse])) ?? []).toContain('Documentation');
		const acl = await db.sql<{ ok: boolean }>(
			`select has_function_privilege('anon', 'public.classroom_course_categories(uuid[])', 'execute') as ok`
		);
		expect(acl.rows[0].ok).toBe(false);
	});

	it('exists exactly once -- no surviving overload from an earlier arity', async () => {
		const { rows } = await db.sql<{ n: string }>(
			`select count(*) as n from pg_proc p
			 join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'classroom_course_categories'`
		);
		expect(Number(rows[0].n)).toBe(1);
	});
});

// ---------------------------------------------------------------------------

describe('the transport, driven through the real client shim', () => {
	const client = (as: SeededUser) =>
		createPostgrestShim(db, fks, as.id) as unknown as SupabaseClient;

	it('is implemented, and hands back the raw list for the whole course', async () => {
		const tx = createClassroomTransports(client(teacherA));
		expect(typeof tx.loadCategorySuggestions).toBe('function');
		const res = await tx.loadCategorySuggestions!([engCourse]);
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		expect(res.data).toContain('Documentation');
		// Ranked by the ONE implementation of ranking, not by anything here.
		expect(courseCategorySuggestions(res.data)).toEqual([
			'Unit Labs',
			'Documentation',
			'Design Review',
			'Shared Thing'
		]);
	});

	it('carries the gate through unchanged -- a teacher gets nothing for a foreign course', async () => {
		const res = await createClassroomTransports(client(teacherA)).loadCategorySuggestions!([
			physCourse
		]);
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		expect(res.data).toEqual([]);
		// Positive control on the same client: it is not returning [] for everything.
		const control = await createClassroomTransports(client(teacherA)).loadCategorySuggestions!([
			engCourse
		]);
		expect(control.ok && control.data.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------

describe('the absence stays harmless: a deployment without 0142 applied', () => {
	let bare: TestDb;
	let bareFks: Awaited<ReturnType<typeof loadForeignKeys>>;
	let bareTeacher: SeededUser;
	let bareOwner: SeededUser;
	let bareSection: string;

	beforeAll(async () => {
		// Migrations here are pasted in by hand AFTER a merge, so "the client is
		// deployed and the function does not exist yet" is a state production
		// really passes through. It must be the state production is in today.
		bare = await startTestDb(CHAIN_WITHOUT);
		bareFks = await loadForeignKeys(bare);
		bareOwner = await createUser(bare, 'apina@boscotech.edu', 'A Pina');
		bareTeacher = await createUser(bare, 'a.teacher@boscotech.edu', 'A Teacher');
		bareSection = await createClassroomSection(bare, {
			as: bareOwner,
			courseCode: 'IDEA209H',
			courseTitle: 'Engineering I Honors',
			label: 'Period 1',
			teacherEmail: bareTeacher.email
		});
	});

	afterAll(async () => {
		await bare?.stop();
	});

	it('the function genuinely is not there', async () => {
		const { rows } = await bare.sql<{ n: string }>(
			`select count(*) as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'classroom_course_categories'`
		);
		expect(Number(rows[0].n)).toBe(0);
	});

	it('the transport reports a failure instead of throwing, which the composer maps to no suggestions', async () => {
		const tx = createClassroomTransports(
			createPostgrestShim(bare, bareFks, bareTeacher.id) as unknown as SupabaseClient
		);
		const courseId = (
			await bare.sql<{ course_id: string }>(
				'select course_id from public.classroom_sections where id = $1',
				[bareSection]
			)
		).rows[0].course_id;

		const res = await tx.loadCategorySuggestions!([courseId]);
		expect(res.ok).toBe(false);
		// ContentComposer's mapping, spelled out: a non-ok result is an empty
		// list, which is what removes the datalist and leaves a plain input.
		expect(courseCategorySuggestions(res.ok ? res.data : [])).toEqual([]);
	});

	it('a brand-new category nobody has ever used still saves, with or without the function', async () => {
		// The field is free text and the suggestions are only suggestions. This is
		// the guarantee a "fix" that swapped the input for a select would break,
		// and it is asserted on the deployment that has NO suggestion source at
		// all -- the strongest version of the case.
		const created = await bare.asUser(bareTeacher.id, async (q) =>
			(
				await q<{ result: { item_id: string } }>(
					'select public.classroom_create_item($1, $2::uuid[], $3, $4, null, null, $5, $6) as result',
					['assignment', [bareSection], 'Novel', 'Body.', 'A Category Never Used Before', true]
				)
			).rows[0].result
		);
		const { rows } = await bare.sql<{ category: string }>(
			'select category from public.classroom_items where id = $1',
			[created.item_id]
		);
		expect(rows[0].category).toBe('A Category Never Used Before');
	});
});

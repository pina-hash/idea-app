// tests/classroom-units.test.ts
//
// The two guarantees the navigation rework adds whose regression would be
// SILENT, per this repo's rule that a test which cannot fail dilutes what a red
// run means.
//
//   1. TEACHER-ONLY TABS ARE NOT REACHABLE BY TYPING THE URL. People and Grades
//      are new routes under a section a student can legitimately read, so the
//      link simply not rendering is NOT the boundary -- the load is. A
//      regression here shows a student their classmates' roster and every
//      submission count in the class while looking completely normal to whoever
//      is testing it, because a teacher sees exactly the page they expect.
//
//   2. A UNIT ASSIGNMENT IS THE SAME IN EVERY CLASS THE ITEM IS POSTED TO. The
//      whole reason the unit lives on the canonical item rather than on a
//      posting is that three sections on identical pacing file an item ONCE.
//      If that regressed the page would still render: the item would simply sit
//      under Unit 2 in Period 1 and under "Not in a unit" in Period 2, which
//      reads as a teacher having forgotten to file it rather than as a bug.
//
// Also here, because both fail silently in the same way: filing must never
// stamp `edited_at` (it would raise an "Updated" badge on every student's row
// for a change they cannot see), and the units table must have no client write
// path at all.
//
// HOW IT DRIVES THEM. The REAL `load` from the REAL routes, against a REAL
// Postgres carrying the REAL migration chain, through the PostgREST shim -- so
// the select strings, the RPC argument names and the RLS policies are the
// shipping ones. An SQL re-implementation of the loads would test this file's
// idea of the pages, not the pages.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
	UNFILED_GROUP_ID,
	classGroups,
	type ClassroomItem,
	type ClassroomUnit
} from '../src/lib/classroom/classroom';
// The class content load is a LAYOUT load now: it is the two-pane shell's
// navigation pane and must survive opening an item, so it lives above the
// page rather than on it. Same function, same return -- only its file moved.
import { load as loadClass } from '../src/routes/classroom/[sectionId]/+layout.server';
import { load as loadPeople } from '../src/routes/classroom/[sectionId]/people/+page.server';
import { load as loadGrades } from '../src/routes/classroom/[sectionId]/grades/+page.server';

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
	// 0104/0108/0109 are here because the class read's widen-then-degrade chain
	// asks for their columns FIRST: without them the select would legitimately
	// fall back past `unit_id` too, and every unit assertion below would be
	// testing the degraded path rather than the one production runs. 0092 comes
	// with them because 0109 recreates the public reference reads.
	'0092_classroom_reference_specs.sql',
	'0104_classroom_edit_visibility.sql',
	'0108_classroom_rich_body.sql',
	'0109_classroom_scheduled_posting.sql',
	'0111_classroom_units.sql',
	'0137_anon_execute_sweep.sql'
];

let db: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;

let teacher: SeededUser;
let otherTeacher: SeededUser;
let owner: SeededUser;
let alice: SeededUser;
let bruno: SeededUser;

/** Two classes of the SAME course -- the shape units exist for. */
let p1: string;
let p2: string;
/** A class of a DIFFERENT course, taught by somebody else. */
let foreign: string;

let courseId: string;
let unitOne: string;
let unitTwo: string;
/** A unit of the OTHER course, which nothing in this course may be filed into. */
let foreignUnit: string;

/** Posted to p1 AND p2 -- the item the consistency claim is about. */
let sharedItem: string;

interface ClassLoad {
	canManage: boolean;
	items: ClassroomItem[];
	units: ClassroomUnit[];
	work: Record<string, { state: string; score: number | null }>;
}

function event(user: SeededUser | null, sectionId: string) {
	return {
		params: { sectionId },
		locals: {
			supabase: createPostgrestShim(db, fks, user?.id ?? ''),
			claims: user ? { sub: user.id, email: user.email, role: 'authenticated' } : null
		}
	};
}

const runClass = (user: SeededUser, sectionId: string) =>
	(loadClass as unknown as (e: unknown) => Promise<ClassLoad>)(event(user, sectionId));

const runPeople = (user: SeededUser | null, sectionId: string) =>
	(loadPeople as unknown as (e: unknown) => Promise<unknown>)(event(user, sectionId));

const runGrades = (user: SeededUser | null, sectionId: string) =>
	(loadGrades as unknown as (e: unknown) => Promise<unknown>)(event(user, sectionId));

const rpc = <T>(as: SeededUser, sql: string, params: unknown[]) =>
	db.asUser(as.id, async (q) => (await q<{ result: T }>(sql, params)).rows[0].result);

const upsertUnit = (as: SeededUser, course: string, name: string, id: string | null = null) =>
	rpc<{ ok: boolean; unit_id: string | null; reason?: string }>(
		as,
		'select public.classroom_upsert_unit($1, $2, $3) as result',
		[course, name, id]
	);

const setItemUnit = (as: SeededUser, itemId: string, unitId: string | null) =>
	rpc<{ ok: boolean; reason?: string }>(
		as,
		'select public.classroom_set_item_unit($1, $2) as result',
		[itemId, unitId]
	);

const createItem = (
	as: SeededUser,
	sectionIds: string[],
	kind: string,
	title: string,
	published = true
) =>
	rpc<{ item_id: string }>(
		as,
		'select public.classroom_create_item($1, $2::uuid[], $3, $4, null, null, null, $5) as result',
		[kind, sectionIds, title, 'Body text.', published]
	).then((r) => r.item_id);

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	fks = await loadForeignKeys(db);

	teacher = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	otherTeacher = await createUser(db, 'nolan@boscotech.edu', 'N. Olan');
	owner = await createUser(db, 'apina@boscotech.edu', 'Site Owner');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bruno = await createUser(db, 'bruno@boscotech.net', 'Bruno Okafor');

	p1 = await createClassroomSection(db, {
		as: teacher,
		courseCode: 'ENG1H',
		courseTitle: 'Engineering I Honors',
		label: 'Period 1',
		teacherEmail: teacher.email
	});
	p2 = await createClassroomSection(db, {
		as: teacher,
		courseCode: 'ENG1H',
		courseTitle: 'Engineering I Honors',
		label: 'Period 2',
		teacherEmail: teacher.email
	});
	foreign = await createClassroomSection(db, {
		as: otherTeacher,
		courseCode: 'ART1',
		courseTitle: 'Studio Art',
		label: 'Period 3',
		teacherEmail: otherTeacher.email
	});

	await enrollStudent(db, { as: teacher, sectionId: p1, email: alice.email, displayName: 'Alice Alvarez' });
	await enrollStudent(db, { as: teacher, sectionId: p2, email: alice.email, displayName: 'Alice Alvarez' });
	await enrollStudent(db, { as: teacher, sectionId: p1, email: bruno.email, displayName: 'Bruno Okafor' });
	await enrollStudent(db, {
		as: otherTeacher,
		sectionId: foreign,
		email: bruno.email,
		displayName: 'Bruno Okafor'
	});

	courseId = (
		await db.sql<{ course_id: string }>('select course_id from public.classroom_sections where id = $1', [p1])
	).rows[0].course_id;
	const foreignCourse = (
		await db.sql<{ course_id: string }>(
			'select course_id from public.classroom_sections where id = $1',
			[foreign]
		)
	).rows[0].course_id;

	unitOne = (await upsertUnit(teacher, courseId, 'Unit 1'))!.unit_id!;
	unitTwo = (await upsertUnit(teacher, courseId, 'Unit 2'))!.unit_id!;
	foreignUnit = (await upsertUnit(otherTeacher, foreignCourse, 'Unit 1'))!.unit_id!;

	sharedItem = await createItem(teacher, [p1, p2], 'assignment', 'Bridge load test');
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 1. Teacher-only tabs, by direct URL
// ---------------------------------------------------------------------------

describe('People and Grades are not reachable by typing the URL', () => {
	/**
	 * THE HEADLINE, and it is asserted for EVERY section in the fixture rather
	 * than just the interesting one -- "a student cannot reach the teacher tabs
	 * of ANY section" is the claim, and a guard that happened to work only for a
	 * class they are not in would pass a narrower test.
	 */
	it('404s a student on every section, including their own', async () => {
		for (const student of [alice, bruno]) {
			for (const sectionId of [p1, p2, foreign]) {
				await expect(runPeople(student, sectionId)).rejects.toMatchObject({ status: 404 });
				await expect(runGrades(student, sectionId)).rejects.toMatchObject({ status: 404 });
			}
		}
	});

	it('404s rather than redirecting, so probing the URL reveals nothing', async () => {
		// A redirect would confirm the tab exists and is merely off-limits. The
		// answer for a class they are IN and one they are not must be identical.
		const own = (await runPeople(alice, p1).catch((e) => e)) as { status: number };
		const notOwn = (await runPeople(alice, foreign).catch((e) => e)) as { status: number };
		expect(own).toMatchObject({ status: 404 });
		expect(notOwn).toMatchObject({ status: 404 });
		expect(own.status).toBe(notOwn.status);
	});

	it('404s a teacher on a class that is not theirs', async () => {
		await expect(runPeople(otherTeacher, p1)).rejects.toMatchObject({ status: 404 });
		await expect(runGrades(otherTeacher, p1)).rejects.toMatchObject({ status: 404 });
		await expect(runPeople(teacher, foreign)).rejects.toMatchObject({ status: 404 });
		await expect(runGrades(teacher, foreign)).rejects.toMatchObject({ status: 404 });
	});

	it('sends an anonymous visitor to the door, not to a 404', async () => {
		// The /classroom prefix guard is what actually catches these; the load's
		// own redirect is belt and braces, and it must stay a REDIRECT so a
		// signed-out link lands on sign-in rather than on a dead end.
		await expect(runPeople(null, p1)).rejects.toMatchObject({ status: 303 });
		await expect(runGrades(null, p1)).rejects.toMatchObject({ status: 303 });
	});

	it('serves the teacher of record and the chair', async () => {
		for (const user of [teacher, owner]) {
			const people = (await runPeople(user, p1)) as { canManage: boolean; roster: unknown[] };
			expect(people.canManage).toBe(true);
			expect(people.roster.length).toBeGreaterThan(0);
			const grades = (await runGrades(user, p1)) as { standings: unknown[] };
			expect(grades.standings.length).toBeGreaterThan(0);
		}
	});

	/**
	 * KEPT HONEST: the assertions above would all pass if the routes 404'd
	 * everybody. This is the control -- the same student reading the class page
	 * itself, which they are entitled to.
	 */
	it('leaves the class page itself readable by an enrolled student', async () => {
		const res = await runClass(alice, p1);
		expect(res.canManage).toBe(false);
		expect(res.items.map((i) => i.id)).toContain(sharedItem);
	});
});

// ---------------------------------------------------------------------------
// 2. A unit assignment is the same in every class the item is posted to
// ---------------------------------------------------------------------------

describe('a unit assignment is consistent across an item posted to several classes', () => {
	it('files once and reads the same in both classes, for teacher and student alike', async () => {
		const res = await setItemUnit(teacher, sharedItem, unitOne);
		expect(res.ok).toBe(true);

		// Both classes, both audiences: four independent reads of one fact.
		for (const [user, sectionId] of [
			[teacher, p1],
			[teacher, p2],
			[alice, p1],
			[alice, p2]
		] as const) {
			const load = await runClass(user, sectionId);
			const item = load.items.find((i) => i.id === sharedItem);
			expect(item?.unit_id, `${user.email} in ${sectionId}`).toBe(unitOne);

			// And it lands in the SAME group once grouped -- the thing a reader
			// actually sees, rather than the column behind it.
			const group = classGroups(load.items, load.units).find((g) =>
				g.items.some((i) => i.id === sharedItem)
			);
			expect(group?.id).toBe(unitOne);
			expect(group?.label).toBe('Unit 1');
		}
	});

	it('moves in both classes at once when it is refiled', async () => {
		await setItemUnit(teacher, sharedItem, unitTwo);
		for (const sectionId of [p1, p2]) {
			const load = await runClass(teacher, sectionId);
			expect(load.items.find((i) => i.id === sharedItem)?.unit_id).toBe(unitTwo);
		}
	});

	it('unfiles in both classes at once', async () => {
		await setItemUnit(teacher, sharedItem, null);
		for (const sectionId of [p1, p2]) {
			const load = await runClass(teacher, sectionId);
			const item = load.items.find((i) => i.id === sharedItem);
			expect(item?.unit_id).toBeNull();
			const group = classGroups(load.items, load.units).find((g) =>
				g.items.some((i) => i.id === sharedItem)
			);
			expect(group?.id).toBe(UNFILED_GROUP_ID);
		}
		// Put it back for the tests below.
		await setItemUnit(teacher, sharedItem, unitOne);
	});

	/**
	 * FILING IS NOT AN EDIT. `edited_at` is what raises the student-facing
	 * "Updated" badge, and a badge that fires when a teacher tidies their unit
	 * list is a badge that stops being worth opening -- the exact failure 0104
	 * spent a migration on. Nothing about the page would look wrong if this
	 * regressed.
	 */
	it('never stamps edited_at, so filing raises no Updated badge', async () => {
		const before = (
			await db.sql<{ edited_at: string | null; updated_at: string }>(
				'select edited_at, updated_at from public.classroom_items where id = $1',
				[sharedItem]
			)
		).rows[0];
		await setItemUnit(teacher, sharedItem, unitTwo);
		await setItemUnit(teacher, sharedItem, unitOne);
		const after = (
			await db.sql<{ edited_at: string | null }>(
				'select edited_at from public.classroom_items where id = $1',
				[sharedItem]
			)
		).rows[0];
		expect(after.edited_at).toBe(before.edited_at);
		expect(after.edited_at).toBeNull();
	});

	it('refuses a unit belonging to a course the item is not posted into', async () => {
		const res = await setItemUnit(teacher, sharedItem, foreignUnit);
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('wrong_course');
		// And it changed nothing.
		const load = await runClass(teacher, p1);
		expect(load.items.find((i) => i.id === sharedItem)?.unit_id).toBe(unitOne);
	});

	it('shows an empty unit to a manager and hides it from a student', async () => {
		const asTeacher = await runClass(teacher, p1);
		const asStudent = await runClass(alice, p1);
		// Unit 2 holds nothing at this point.
		expect(
			classGroups(asTeacher.items, asTeacher.units, { includeEmptyUnits: true }).map((g) => g.id)
		).toContain(unitTwo);
		expect(classGroups(asStudent.items, asStudent.units).map((g) => g.id)).not.toContain(unitTwo);
	});
});

// ---------------------------------------------------------------------------
// 3. Who may shape a course's units
// ---------------------------------------------------------------------------

describe('units are written only through the RPCs, only by a teacher of the course', () => {
	it('refuses a student and a teacher of another course', async () => {
		await expect(upsertUnit(alice, courseId, 'Student unit')).rejects.toThrow(/teacher of this course/i);
		await expect(upsertUnit(otherTeacher, courseId, 'Foreign unit')).rejects.toThrow(
			/teacher of this course/i
		);
		await expect(setItemUnit(alice, sharedItem, unitTwo)).rejects.toThrow(/teacher of record/i);
		await expect(setItemUnit(otherTeacher, sharedItem, unitTwo)).rejects.toThrow(/teacher of record/i);
	});

	it('has no direct write path for a student, a teacher OR the chair', async () => {
		for (const user of [alice, teacher, owner]) {
			await expect(
				db.asUser(user.id, (q) =>
					q('insert into public.classroom_units (course_id, name, created_by) values ($1, $2, $3)', [
						courseId,
						'Snuck in',
						user.email
					])
				)
			).rejects.toMatchObject({ code: '42501' });
			await expect(
				db.asUser(user.id, (q) =>
					q('update public.classroom_units set name = $1 where id = $2', ['Renamed', unitOne])
				)
			).rejects.toMatchObject({ code: '42501' });
			await expect(
				db.asUser(user.id, (q) => q('delete from public.classroom_units where id = $1', [unitOne]))
			).rejects.toMatchObject({ code: '42501' });
		}
	});

	it('grants anon nothing', async () => {
		const { rows } = await db.sql<{ fn: string; can: boolean }>(
			`select p.proname as fn, has_function_privilege('anon', p.oid, 'execute') as can
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname in
				('classroom_upsert_unit','classroom_delete_unit','classroom_set_unit_order','classroom_set_item_unit')`
		);
		expect(rows.length).toBe(4);
		for (const row of rows) expect(row.can, row.fn).toBe(false);
		const { rows: tbl } = await db.sql<{ can: boolean }>(
			`select has_table_privilege('anon', 'public.classroom_units', 'select') as can`
		);
		expect(tbl[0].can).toBe(false);
	});

	it('refuses a duplicate name as an answer, not an error', async () => {
		const res = await upsertUnit(teacher, courseId, '  unit 1  ');
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('duplicate_name');
	});

	/**
	 * Deleting a unit is ORGANIZATION being removed, never content: the items in
	 * it are unfiled, which is what makes a real delete safe to offer at all.
	 */
	it('unfiles rather than deletes when a unit is removed', async () => {
		const doomed = (await upsertUnit(teacher, courseId, 'Rotation 9')).unit_id!;
		const item = await createItem(teacher, [p1], 'material', 'Rotation handout');
		expect((await setItemUnit(teacher, item, doomed)).ok).toBe(true);

		const res = await rpc<{ ok: boolean; unfiled: number }>(
			teacher,
			'select public.classroom_delete_unit($1) as result',
			[doomed]
		);
		expect(res.unfiled).toBe(1);

		const load = await runClass(teacher, p1);
		const still = load.items.find((i) => i.id === item);
		expect(still, 'the item survives its unit').toBeDefined();
		expect(still?.unit_id).toBeNull();
		expect(load.units.map((u) => u.id)).not.toContain(doomed);
	});
});

// ---------------------------------------------------------------------------
// 4. The file re-applies (0088's lesson, learned in the field)
// ---------------------------------------------------------------------------

describe('the migration re-applies cleanly', () => {
	it('runs a second and third time with every guarantee intact', async () => {
		const sql = readFileSync(
			join(process.cwd(), 'supabase/migrations/0111_classroom_units.sql'),
			'utf8'
		);
		await db.sql(sql);
		await db.sql(sql);

		// The column, the unit rows and the filing all survive.
		const load = await runClass(teacher, p1);
		expect(load.units.map((u) => u.name)).toContain('Unit 1');
		expect(load.items.find((i) => i.id === sharedItem)?.unit_id).toBe(unitOne);

		// And exactly one signature each -- a re-apply must not leave an overload.
		const { rows } = await db.sql<{ proname: string; n: string }>(
			`select p.proname, count(*) as n
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname in
				('classroom_upsert_unit','classroom_delete_unit','classroom_set_unit_order',
				 'classroom_set_item_unit','_classroom_manages_course')
			 group by p.proname`
		);
		expect(rows.length).toBe(5);
		for (const row of rows) expect(Number(row.n), row.proname).toBe(1);
	});
});

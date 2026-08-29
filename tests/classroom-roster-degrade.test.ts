// tests/classroom-roster-degrade.test.ts
//
// `loadSectionRoster`'s DEGRADE RUNG, kept under test DELIBERATELY.
//
// WHY THIS FILE EXISTS. Migrations here are pasted into the SQL editor by hand,
// separately from the deploy, so a deployment sitting between two of them is a
// real state and every select is a widen-then-degrade ladder. `loadSectionRoster`
// is one of those ladders: it asks `classroom_section_roster` (0138) first, and
// on `PGRST202` -- and on that code ALONE -- falls back to the plain
// `classroom_enrollments` select every one of its call sites used to make.
//
// UNTIL NOW THAT RUNG WAS EXERCISED ONLY BY ACCIDENT. Every shim-driven route
// test that reached a roster ran on it, because no chain in the suite carried
// 0138, and not one of them knew: `managesReady` was false, no row carried a
// `manages` column, and the Grades denominator counted an enrolled instructor
// as a head. `tests/classroom-units.test.ts` and
// `tests/classroom-feed-false-counts.test.ts` now carry 0138 and assert the WIDE
// rung, which is the read production runs -- and that would have left the
// fallback covered by nothing at all. So it moves here, where the chain stops
// short of 0138 on purpose and the assertions are about the fallback rather
// than in spite of it.
//
// WHAT IT PINS, and all three fail silently:
//
//   1. THE NULL SECTION SHORT-CIRCUITS. The home feed asks for every section
//      the caller manages; with no 0138 there is nothing to filter by, so the
//      load answers an empty list WITHOUT touching the table. A fallback that
//      ran the section select with a null id would answer the whole enrollment
//      table for the ladder's widest question.
//
//   2. "CANNOT TELL" IS NOT "NO". `managesReady` false and `manages` undefined
//      on every row is the honest answer, and `splitRoster` keeps a row whose
//      `manages` is not exactly `true` -- so the pre-0138 world tallies exactly
//      what it has always tallied rather than silently dropping people.
//
//   3. THE ROWS ARE STILL THE RIGHT ROWS. The fallback is a narrower answer,
//      not a broken one: the same students, scoped to the same section.
//
// HOW IT DRIVES THEM. The REAL `loadSectionRoster` and the REAL People and
// Grades loads, from their own files, against a REAL Postgres carrying the REAL
// chain, through the PostgREST shim.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { loadSectionRoster } from '../src/lib/classroom/transports';
import { splitRoster } from '../src/lib/classroom/classroom';
import { load as loadPeople } from '../src/routes/classroom/[sectionId]/people/+page.server';
import { load as loadGrades } from '../src/routes/classroom/[sectionId]/grades/+page.server';

/**
 * THE CHAIN STOPS SHORT OF 0138, WHICH IS THE WHOLE POINT OF THE FILE. It is
 * otherwise the classroom chain `tests/classroom-units.test.ts` runs, so the
 * two files differ in exactly one migration and the difference between their
 * answers is attributable to it.
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
	'0137_anon_execute_sweep.sql'
] as const;

let db: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;

let teacher: SeededUser;
let alice: SeededUser;
let bruno: SeededUser;
let p1: string;

const client = (as: SeededUser) => createPostgrestShim(db, fks, as.id) as unknown as SupabaseClient;

const event = (user: SeededUser, sectionId: string) => ({
	params: { sectionId },
	locals: {
		supabase: createPostgrestShim(db, fks, user.id),
		claims: { sub: user.id, email: user.email, role: 'authenticated' }
	}
});

const runPeople = (user: SeededUser, sectionId: string) =>
	(loadPeople as unknown as (e: unknown) => Promise<unknown>)(event(user, sectionId));

const runGrades = (user: SeededUser, sectionId: string) =>
	(loadGrades as unknown as (e: unknown) => Promise<unknown>)(event(user, sectionId));

beforeAll(async () => {
	db = await startTestDb([...CHAIN]);
	fks = await loadForeignKeys(db);

	teacher = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bruno = await createUser(db, 'bruno@boscotech.net', 'Bruno Okafor');

	p1 = await createClassroomSection(db, {
		as: teacher,
		courseCode: 'ENG1H',
		courseTitle: 'Engineering I Honors',
		label: 'Period 1',
		teacherEmail: teacher.email
	});

	await enrollStudent(db, { as: teacher, sectionId: p1, email: alice.email, displayName: 'Alice Alvarez' });
	await enrollStudent(db, { as: teacher, sectionId: p1, email: bruno.email, displayName: 'Bruno Okafor' });
	// THE SAME MANAGER ENROLLMENT the widened files carry, so the two chains
	// differ in the migration and NOT in the fixture. It is what makes the
	// pre-0138 answer a NUMBER worth pinning rather than a shrug.
	await enrollStudent(db, { as: teacher, sectionId: p1, email: teacher.email, displayName: 'T. Vargas' });

	// A canonical assignment, so the Grades tab has a standing to carry the
	// denominator on.
	await db.asUser(teacher.id, (q) =>
		q(
			`select public.classroom_create_item('assignment', $1::uuid[], 'Truss bridge sketch', 'Body.', 10, null, null, true, '[]'::jsonb, false)`,
			[[p1]]
		)
	);
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

describe('the chain really is the pre-0138 world', () => {
	it('has no classroom_section_roster at all, which is what puts the load on the fallback', async () => {
		const { rows } = await db.sql<{ n: string }>(
			`select count(*) as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'classroom_section_roster'`
		);
		expect(Number(rows[0].n)).toBe(0);
		// THE POSITIVE CONTROL on the same catalog read: the query finds a
		// function that IS there, so zero is an answer about this name rather
		// than about the query.
		const control = await db.sql<{ n: string }>(
			`select count(*) as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'classroom_manages_section'`
		);
		expect(Number(control.rows[0].n)).toBeGreaterThan(0);
	});
});

describe('loadSectionRoster on the degrade rung', () => {
	it('answers an empty list for the null section, and does not read the table to do it', async () => {
		const res = await loadSectionRoster(client(teacher), null);
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		expect(res.data.rows).toEqual([]);
		expect(res.data.managesReady).toBe(false);
		// AND IT IS A SHORT CIRCUIT, not an empty query result. The shim asserts
		// the table and filter it is handed, so a fallback that ran the section
		// select with a null id would reach `classroom_enrollments` here -- and
		// the section-scoped call below proves that path is reachable and would
		// have returned rows.
		const scoped = await loadSectionRoster(client(teacher), p1);
		expect(scoped.ok && scoped.data.rows.length).toBe(3);
	});

	it('returns the same students for a section, with the manager question UNANSWERED', async () => {
		const res = await loadSectionRoster(client(teacher), p1);
		expect(res.ok).toBe(true);
		if (!res.ok) return;

		// The rows are right: the fallback is narrower, not broken.
		expect(res.data.rows.map((r) => r.student_email).sort()).toEqual(
			[alice.email, bruno.email, teacher.email].sort()
		);
		// The flag is absent, and ABSENT is not FALSE. `manages: false` would be
		// a claim the database never made.
		expect(res.data.managesReady).toBe(false);
		for (const row of res.data.rows) expect(row.manages).toBeUndefined();
	});

	it('so splitRoster keeps every row -- "cannot tell" never reads as "yes"', async () => {
		const res = await loadSectionRoster(client(teacher), p1);
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		const { students, managers } = splitRoster(res.data.rows);
		expect(students.length).toBe(3);
		expect(managers).toEqual([]);
		// THE POSITIVE CONTROL: the same function, the same rows, with the flag
		// the wide rung would have supplied. `splitRoster` is not simply
		// incapable of dropping anybody.
		const withFlags = res.data.rows.map((r) => ({
			...r,
			manages: r.student_email === teacher.email
		}));
		expect(splitRoster(withFlags).students.length).toBe(2);
		expect(splitRoster(withFlags).managers).toEqual([teacher.email]);
	});
});

describe('the two tabs on the degrade rung', () => {
	it('People renders the roster and offers no Remove, because the flag is unknown', async () => {
		const people = (await runPeople(teacher, p1)) as {
			canManage: boolean;
			removalReady: boolean;
			roster: { student_email: string; manages?: boolean }[];
		};
		expect(people.canManage).toBe(true);
		expect(people.roster.length).toBe(3);
		// `removalReady` IS `managesReady`, and false is what removes the control:
		// a Remove offered against a flag nothing answered is a control whose only
		// possible outcome is a refusal.
		expect(people.removalReady).toBe(false);
	});

	it('Grades counts the enrolled instructor as a head -- 3, which is the number 0138 moves', async () => {
		const grades = (await runGrades(teacher, p1)) as { standings: { roster: number }[] };
		expect(grades.standings.length).toBeGreaterThan(0);
		// NOT AN ASPIRATION. This is what the pre-0138 deployment genuinely
		// answers, pinned so the difference between the two rungs is a value in
		// the suite rather than a sentence in a comment: the same fixture on the
		// widened chain in `tests/classroom-units.test.ts` answers 2.
		for (const s of grades.standings) expect(s.roster).toBe(3);
	});
});

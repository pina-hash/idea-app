// tests/notebook-classroom-sections.test.ts
//
// 0094: the notebook's sections and roster are IDEA Classroom's now. This
// suite covers only what would fail SILENTLY -- the shape of a regression here
// is not a broken page, it is a teacher quietly seeing another class's
// notebooks, or a student on a roster quietly having no row at all.
//
//   1. THE AUTHORIZATION SWAP. Instructor authority used to be
//      notebook_sections.instructor_id (a uuid); it is now
//      classroom_sections.teacher_email via classroom_manages_section. The
//      three tiers must come out exactly where they were: own entries for a
//      student, own sections for a teacher of record, everything for the chair
//      tier -- through the grid RPC as well as through plain RLS, because the
//      grid is a SECURITY DEFINER function that bypasses RLS entirely and so
//      carries its own copy of the question.
//   2. THE ROSTER. It comes from classroom_enrollments, so an add shows up, a
//      deactivation with no work behind it disappears, and a student who is on
//      the roster but has NEVER SIGNED IN still gets a row of missing cells
//      rather than breaking the grid or vanishing from it.
//   3. THE IDENTITY BRIDGE. Email and uuid are matched case-insensitively in
//      both directions, and neither bridge function is reachable by a client.
//   4. THE FILE RE-APPLIES. 0088's second run died half way through in the live
//      SQL editor; migrations here are pasted in by hand, so a re-run is an
//      ordinary event and "works once" is not good enough.
//
// Deliberately NOT here: which section the picker defaults to, how the CSV is
// shaped, what the grid looks like. Pure functions and a dev harness cover
// those, and pulling them in would dilute what a red run means.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	MIGRATIONS,
	type SeededUser,
	type TestDb
} from './db/harness';

const MIGRATION_PATH = fileURLToPath(
	new URL('../supabase/migrations/0094_notebook_classroom_sections.sql', import.meta.url)
);

let db: TestDb;

let owner: SeededUser; // pinned admin: the chair tier
let teacherA: SeededUser; // teacher of record for section A only
let teacherB: SeededUser; // teacher of record for section B only
let unattachedStaff: SeededUser; // role 'teacher', teaches nothing, not an admin
let alice: SeededUser; // enrolled in A
let bob: SeededUser; // enrolled in A and B
let carol: SeededUser; // enrolled in A, then deactivated, but has filed work

let sectionA: string;
let sectionB: string;
let sessionA: string;
let sessionB: string;

let aliceEntry: string;
let bobEntryA: string;
let bobEntryB: string;
let carolEntry: string;

/** A roster email with NO auth.users row anywhere: enrolled, never signed in. */
const NEVER_SIGNED_IN = 'dana.newcomer@boscotech.net';

interface GridStudent {
	student_key: string;
	id: string | null;
	name: string;
	email: string | null;
	enrolled: boolean;
	free_entries: number;
}
interface GridCell {
	student_key: string;
	student_id: string | null;
	session_id: string;
	status: string;
	entry_id: string | null;
}
interface Grid {
	section: {
		id: string;
		course_code: string;
		course_title: string;
		label: string;
		block: string | null;
		teacher_email: string;
	};
	sessions: { id: string }[];
	students: GridStudent[];
	cells: GridCell[];
}

async function captureError(run: () => Promise<unknown>): Promise<{ code?: string; message: string }> {
	try {
		await run();
	} catch (error) {
		const e = error as { code?: string; message?: string };
		return { code: e.code, message: e.message ?? String(error) };
	}
	throw new Error('Expected this statement to be rejected, but it succeeded.');
}

async function grid(user: SeededUser, sectionId: string, unit: number | null = null): Promise<Grid> {
	const { rows } = await db.asUser(user.id, (q) =>
		q<{ result: Grid }>('select public.notebook_get_section_grid($1, $2) as result', [
			sectionId,
			unit
		])
	);
	return rows[0].result;
}

async function createEntry(
	student: SeededUser,
	opts: { driveFileId: string; sessionId?: string; sectionId?: string; label?: string }
): Promise<string> {
	const { rows } = await db.asUser(student.id, (q) =>
		q<{ result: { entry_id: string } }>(
			'select public.notebook_create_entry($1, $2, $3, $4, $5) as result',
			[
				student.id,
				opts.driveFileId,
				opts.sessionId ?? null,
				opts.sectionId ?? null,
				opts.label ?? null
			]
		)
	);
	return rows[0].result.entry_id;
}

/** Every notebook_entries row this user can actually SELECT, sorted. */
async function visibleEntryIds(userId: string): Promise<string[]> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ id: string }>('select id from public.notebook_entries');
		return rows.map((r) => r.id).sort();
	});
}

/**
 * THROUGH 0094 AND NO FURTHER, deliberately. This file is about what 0094 did
 * at the moment it ran -- it re-executes 0094's own file over the live schema
 * at the end -- and 0098 later replaces the single-section shape it asserts
 * (notebook_sessions.section_id, and the composite key that referenced it).
 * Booting past it would change the subject; 0098's own guarantees are pinned by
 * tests/notebook-session-postings.test.ts.
 */
const CHAIN = MIGRATIONS.filter(
	(m) =>
		m !== '0098_notebook_session_postings.sql' &&
		// Same reasoning, one migration later: 0106 replaces the section-scoped
		// staff predicate this file exists to pin with an enrollment-based union,
		// so applying it here would change the subject. 0106's own guarantees are
		// pinned by tests/notebook-instructor-access.test.ts.
		m !== '0106_notebook_instructor_student_access.sql'
);

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	owner = await createUser(db, 'apina@boscotech.edu', 'Site Owner');
	teacherA = await createUser(db, 'jbuilder@boscotech.edu', 'J Builder');
	teacherB = await createUser(db, 'kmartin@boscotech.edu', 'K Martin');
	unattachedStaff = await createUser(db, 'tsmith@boscotech.edu', 'T Smith');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bob = await createUser(db, 'bob@boscotech.net', 'Bob Brandt');
	carol = await createUser(db, 'carol@boscotech.net', 'Carol Chen');

	// Assigning a section to another teacher is admin-only in 0082.
	sectionA = await createClassroomSection(db, {
		as: owner,
		courseCode: 'IDEA209H',
		courseTitle: 'Engineering Design & Development',
		label: 'Period 2',
		teacherEmail: teacherA.email
	});
	sectionB = await createClassroomSection(db, {
		as: owner,
		courseCode: 'IDEA209H',
		label: 'Period 5',
		teacherEmail: teacherB.email
	});

	// Rosters, written by each section's own teacher of record.
	await enrollStudent(db, {
		as: teacherA,
		sectionId: sectionA,
		email: alice.email,
		displayName: 'Alvarez, Alice'
	});
	await enrollStudent(db, {
		as: teacherA,
		sectionId: sectionA,
		email: bob.email,
		displayName: 'Brandt, Bob'
	});
	await enrollStudent(db, {
		as: teacherA,
		sectionId: sectionA,
		email: carol.email,
		displayName: 'Chen, Carol'
	});
	// Deliberately MIXED CASE: 0082 lowercases on write, and the bridge has to
	// match auth.users (which does not) regardless.
	await enrollStudent(db, {
		as: teacherA,
		sectionId: sectionA,
		email: NEVER_SIGNED_IN.toUpperCase(),
		displayName: 'Newcomer, Dana'
	});
	await enrollStudent(db, {
		as: teacherB,
		sectionId: sectionB,
		email: bob.email,
		displayName: 'Brandt, Bob'
	});

	sessionA = (
		await db.asUser(teacherA.id, (q) =>
			q<{ result: { session_id: string } }>(
				'select public.notebook_admin_upsert_session($1, $2, $3, $4) as result',
				[sectionA, 3, '2026-10-14', 'Bearing teardown']
			)
		)
	).rows[0].result.session_id;
	sessionB = (
		await db.asUser(teacherB.id, (q) =>
			q<{ result: { session_id: string } }>(
				'select public.notebook_admin_upsert_session($1, $2, $3, $4) as result',
				[sectionB, 1, '2026-10-15', 'Capstone kickoff']
			)
		)
	).rows[0].result.session_id;

	aliceEntry = await createEntry(alice, { driveFileId: 'drive-alice-1', sessionId: sessionA });
	bobEntryA = await createEntry(bob, { driveFileId: 'drive-bob-a', sessionId: sessionA });
	bobEntryB = await createEntry(bob, { driveFileId: 'drive-bob-b', sessionId: sessionB });
	carolEntry = await createEntry(carol, { driveFileId: 'drive-carol-1', sessionId: sessionA });

	// Carol leaves the class AFTER filing real work. Her enrollment goes
	// inactive; her notebook does not.
	await enrollStudent(db, {
		as: teacherA,
		sectionId: sectionA,
		email: carol.email,
		displayName: 'Chen, Carol',
		active: false
	});
});

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------

describe('the old section concept is gone, not renamed', () => {
	test('notebook_sections and its upsert RPC no longer exist', async () => {
		const { rows } = await db.sql<{ tbl: string | null }>(
			`select to_regclass('public.notebook_sections')::text as tbl`
		);
		expect(rows[0].tbl).toBeNull();

		const fns = await db.sql<{ n: string }>(
			`select proname as n from pg_proc
			 where proname in ('notebook_admin_upsert_section', 'notebook_is_section_instructor')`
		);
		expect(fns.rows).toEqual([]);
	});

	test('both section columns reference classroom_sections', async () => {
		const { rows } = await db.sql<{ tbl: string; target: string; del: string }>(
			`select con.conrelid::regclass::text as tbl,
			        con.confrelid::regclass::text as target,
			        con.confdeltype as del
			 from pg_constraint con
			 where con.contype = 'f'
			   and con.conrelid in ('public.notebook_sessions'::regclass, 'public.notebook_entries'::regclass)
			   and con.conkey = array[
			       (select attnum from pg_attribute
			        where attrelid = con.conrelid and attname = 'section_id')
			   ]
			 order by tbl`
		);
		expect(rows).toHaveLength(2);
		expect(rows.every((r) => r.target === 'classroom_sections')).toBe(true);
		// An entry's section must never be deletable out from under it.
		expect(rows.find((r) => r.tbl === 'notebook_entries')?.del).toBe('r'); // RESTRICT
	});

	test('the composite session/section key is preserved exactly', async () => {
		// The guarantee 0069 built: an entry whose section disagrees with its own
		// session's section is unrepresentable. Repointing section_id must not
		// have cost it.
		const { rows } = await db.sql<{ def: string }>(
			`select pg_get_constraintdef(oid) as def from pg_constraint
			 where conname = 'notebook_entries_session_section_fkey'`
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].def).toMatch(/FOREIGN KEY \(session_id, section_id\)/i);
		expect(rows[0].def).toMatch(/REFERENCES notebook_sessions\(id, section_id\)/i);

		// And it genuinely still bites: session A belongs to section A.
		const error = await captureError(() =>
			db.sql(
				`insert into public.notebook_entries (student_id, section_id, session_id)
				 values ($1, $2, $3)`,
				[alice.id, sectionB, sessionA]
			)
		);
		expect(error.code).toBe('23503'); // foreign_key_violation
	});
});

describe('RLS: the three tiers land exactly where they were', () => {
	test('a student sees only their own entries', async () => {
		expect(await visibleEntryIds(alice.id)).toEqual([aliceEntry]);
		expect(await visibleEntryIds(carol.id)).toEqual([carolEntry]);

		// By id, not just by listing -- the probe a filtered list would hide.
		const byId = await db.asUser(alice.id, (q) =>
			q('select 1 from public.notebook_entries where id = $1', [bobEntryA])
		);
		expect(byId.rowCount ?? 0).toBe(0);
	});

	test('a teacher of record sees their own section and no other', async () => {
		expect(await visibleEntryIds(teacherA.id)).toEqual(
			[aliceEntry, bobEntryA, carolEntry].sort()
		);
		// The decisive one: the SAME student, in a section this teacher does not
		// have. Authority is per section, not per student.
		expect(await visibleEntryIds(teacherA.id)).not.toContain(bobEntryB);
		expect(await visibleEntryIds(teacherB.id)).toEqual([bobEntryB]);
	});

	test('a staff account teaching nothing sees nothing', async () => {
		// 0067's naming trap in practice: a plain @boscotech.edu account is not an
		// admin, and it is not a teacher of record either.
		expect(await visibleEntryIds(unattachedStaff.id)).toEqual([]);
	});

	test('the chair tier sees everything', async () => {
		expect(await visibleEntryIds(owner.id)).toEqual(
			[aliceEntry, bobEntryA, bobEntryB, carolEntry].sort()
		);
	});
});

describe('the grid RPC carries its own copy of the boundary', () => {
	// It is SECURITY DEFINER, so it runs as the owner and RLS does not apply to
	// anything inside it. If its own check regressed, every RLS assertion above
	// would still pass while a teacher read the whole school.

	test('a teacher of record gets their own section', async () => {
		const g = await grid(teacherA, sectionA);
		expect(g.section.id).toBe(sectionA);
		expect(g.section.course_code).toBe('IDEA209H');
		expect(g.section.label).toBe('Period 2');
		expect(g.section.teacher_email).toBe(teacherA.email);
	});

	test('a teacher of ANOTHER section is refused, and learns nothing', async () => {
		const error = await captureError(() => grid(teacherB, sectionA));
		expect(error.message).toMatch(/only the section instructor or a site admin/i);

		const back = await captureError(() => grid(teacherA, sectionB));
		expect(back.message).toMatch(/only the section instructor or a site admin/i);
	});

	test('a student is refused their own section’s grid', async () => {
		const error = await captureError(() => grid(alice, sectionA));
		expect(error.message).toMatch(/only the section instructor or a site admin/i);
	});

	test('a staff account teaching nothing is refused', async () => {
		const error = await captureError(() => grid(unattachedStaff, sectionA));
		expect(error.message).toMatch(/only the section instructor or a site admin/i);
	});

	test('the chair tier reads any section’s grid', async () => {
		expect((await grid(owner, sectionA)).section.id).toBe(sectionA);
		expect((await grid(owner, sectionB)).section.id).toBe(sectionB);
	});

	test('anon holds no execute grant on the grid or the bridge', async () => {
		const { rows } = await db.sql<{ fn: string; ok: boolean }>(
			`select fn, has_function_privilege('anon', fn, 'execute') as ok
			 from unnest(array[
			   'public.notebook_get_section_grid(uuid, integer)',
			   'public.notebook_create_entry(uuid, text, uuid, uuid, text, text, uuid)',
			   'public.notebook_flag_entry(uuid, text, text)'
			 ]) as fn`
		);
		expect(rows.every((r) => r.ok === false)).toBe(true);
	});
});

describe('the identity bridge', () => {
	// The two helpers exist only so a uuid-keyed notebook row can be lined up
	// against an email-keyed roster row. Neither is a client-facing surface --
	// a grant on either would hand out a directory of the school's addresses
	// keyed to account ids.
	const BRIDGE = [
		'public._notebook_user_id_for_email(text)',
		'public._notebook_email_for_user(uuid)',
		'public._notebook_section_roster(uuid)'
	];

	test('neither role can execute any of them', async () => {
		for (const fn of BRIDGE) {
			const { rows } = await db.sql<{ a: boolean; b: boolean }>(
				`select has_function_privilege('anon', $1, 'execute') as a,
				        has_function_privilege('authenticated', $1, 'execute') as b`,
				[fn]
			);
			expect(rows[0].a, `${fn} to anon`).toBe(false);
			expect(rows[0].b, `${fn} to authenticated`).toBe(false);
		}
	});

	test('email -> uuid is case- and whitespace-insensitive, and null when absent', async () => {
		const { rows } = await db.sql<{ exact: string | null; loud: string | null; padded: string | null; missing: string | null; blank: string | null }>(
			`select public._notebook_user_id_for_email($1)::text as exact,
			        public._notebook_user_id_for_email($2)::text as loud,
			        public._notebook_user_id_for_email($3)::text as padded,
			        public._notebook_user_id_for_email($4)::text as missing,
			        public._notebook_user_id_for_email('')::text as blank`,
			[alice.email, alice.email.toUpperCase(), `  ${alice.email}  `, NEVER_SIGNED_IN]
		);
		expect(rows[0].exact).toBe(alice.id);
		expect(rows[0].loud).toBe(alice.id);
		expect(rows[0].padded).toBe(alice.id);
		// The roster-before-first-login state. Not an error -- a normal state.
		expect(rows[0].missing).toBeNull();
		expect(rows[0].blank).toBeNull();
	});

	test('uuid -> email answers lowercased, and null for an unknown id', async () => {
		const { rows } = await db.sql<{ found: string | null; unknown: string | null }>(
			`select public._notebook_email_for_user($1) as found,
			        public._notebook_email_for_user('00000000-0000-0000-0000-000000000000') as unknown`,
			[bob.id]
		);
		expect(rows[0].found).toBe(bob.email);
		expect(rows[0].unknown).toBeNull();
	});
});

describe('the roster is Classroom’s', () => {
	test('every actively enrolled student has a row, entries or not', async () => {
		const g = await grid(teacherA, sectionA);
		const byEmail = new Map(g.students.map((s) => [s.email, s]));

		expect(byEmail.has(alice.email)).toBe(true);
		expect(byEmail.has(bob.email)).toBe(true);
		// Enrolled, never signed in, nothing filed -- still a row.
		expect(byEmail.has(NEVER_SIGNED_IN)).toBe(true);
	});

	test('the roster’s own display name is what the grid shows', async () => {
		const g = await grid(teacherA, sectionA);
		const alice_ = g.students.find((s) => s.email === alice.email);
		// "Alvarez, Alice" is what the teacher typed into Classroom, not the
		// 'Alice Alvarez' the Google account carries. The notebook agreeing with
		// Classroom is the point of the whole change.
		expect(alice_?.name).toBe('Alvarez, Alice');
	});

	test('a student added in Classroom appears immediately, with missing cells', async () => {
		const fresh = 'erin.novak@boscotech.net';
		await enrollStudent(db, {
			as: teacherA,
			sectionId: sectionA,
			email: fresh,
			displayName: 'Novak, Erin'
		});

		const g = await grid(teacherA, sectionA);
		const row = g.students.find((s) => s.email === fresh);
		expect(row).toBeDefined();
		expect(row?.enrolled).toBe(true);

		const cells = g.cells.filter((c) => c.student_key === row!.student_key);
		expect(cells).toHaveLength(g.sessions.length);
		expect(cells.every((c) => c.status === 'missing')).toBe(true);

		// ...and removing them takes the row away again, since nothing was filed.
		await enrollStudent(db, {
			as: teacherA,
			sectionId: sectionA,
			email: fresh,
			displayName: 'Novak, Erin',
			active: false
		});
		const after = await grid(teacherA, sectionA);
		expect(after.students.map((s) => s.email)).not.toContain(fresh);
	});

	test('a removed student who FILED work keeps their row, flagged as no longer enrolled', async () => {
		// Carol's enrollment is inactive but her entry is real and was reviewable.
		// Dropping her from the grid would hide submitted work, which is a worse
		// failure than showing a row for someone who has left.
		const g = await grid(teacherA, sectionA);
		const row = g.students.find((s) => s.email === carol.email);
		expect(row).toBeDefined();
		expect(row?.enrolled).toBe(false);

		const cell = g.cells.find(
			(c) => c.student_key === row!.student_key && c.session_id === sessionA
		);
		expect(cell?.entry_id).toBe(carolEntry);
	});

	test('another section’s roster never bleeds in', async () => {
		const a = await grid(teacherA, sectionA);
		const b = await grid(teacherB, sectionB);
		// Bob is in both classes; nobody else crosses.
		expect(b.students.map((s) => s.email)).toEqual([bob.email]);
		expect(a.students.map((s) => s.email)).not.toContain(NEVER_SIGNED_IN.toUpperCase());
		// Bob's cell in B carries his B entry, and A's carries his A entry.
		const bobKeyB = b.students.find((s) => s.email === bob.email)!.student_key;
		expect(b.cells.find((c) => c.student_key === bobKeyB)?.entry_id).toBe(bobEntryB);
		const bobKeyA = a.students.find((s) => s.email === bob.email)!.student_key;
		expect(
			a.cells.find((c) => c.student_key === bobKeyA && c.session_id === sessionA)?.entry_id
		).toBe(bobEntryA);
	});
});

describe('a roster row with no account does not break anything', () => {
	test('it has a stable key, a null id, and every cell missing', async () => {
		const g = await grid(teacherA, sectionA);
		const row = g.students.find((s) => s.email === NEVER_SIGNED_IN);
		expect(row).toBeDefined();

		// The uuid is genuinely absent -- and that is exactly why the ROW KEY is
		// the email. Two never-signed-in students would collide on a null key.
		expect(row!.id).toBeNull();
		expect(row!.student_key).toBe(NEVER_SIGNED_IN);
		expect(row!.free_entries).toBe(0);
		expect(row!.enrolled).toBe(true);

		const cells = g.cells.filter((c) => c.student_key === NEVER_SIGNED_IN);
		expect(cells).toHaveLength(g.sessions.length);
		expect(cells.every((c) => c.status === 'missing' && c.student_id === null)).toBe(true);
	});

	test('every row key on the grid is present and unique', async () => {
		const g = await grid(teacherA, sectionA);
		const keys = g.students.map((s) => s.student_key);
		expect(keys.every((k) => typeof k === 'string' && k.length > 0)).toBe(true);
		expect(new Set(keys).size).toBe(keys.length);

		// And every cell belongs to a row that exists.
		const known = new Set(keys);
		expect(g.cells.every((c) => known.has(c.student_key))).toBe(true);
	});

	test('two never-signed-in students both get their own row', async () => {
		const second = 'frank.osei@boscotech.net';
		await enrollStudent(db, {
			as: teacherA,
			sectionId: sectionA,
			email: second,
			displayName: 'Osei, Frank'
		});
		const g = await grid(teacherA, sectionA);
		const ghosts = g.students.filter((s) => s.id === null);
		expect(ghosts.length).toBeGreaterThanOrEqual(2);
		expect(new Set(ghosts.map((s) => s.student_key)).size).toBe(ghosts.length);

		await enrollStudent(db, {
			as: teacherA,
			sectionId: sectionA,
			email: second,
			displayName: 'Osei, Frank',
			active: false
		});
	});
});

describe('the write RPCs moved tiers with the read ones', () => {
	test('the teacher of record can flag and resolve in their own section', async () => {
		await db.asUser(teacherA.id, (q) =>
			q('select public.notebook_flag_entry($1, $2, $3)', [
				aliceEntry,
				'illegible',
				'Please reshoot.'
			])
		);
		const flagged = await db.sql<{ status: string }>(
			'select status from public.notebook_entries where id = $1',
			[aliceEntry]
		);
		expect(flagged.rows[0].status).toBe('flagged');

		await db.asUser(teacherA.id, (q) =>
			q('select public.notebook_resolve_entry($1)', [aliceEntry])
		);
		const resolved = await db.sql<{ status: string }>(
			'select status from public.notebook_entries where id = $1',
			[aliceEntry]
		);
		expect(resolved.rows[0].status).toBe('compliant');
	});

	test('a teacher of another section cannot flag, and nothing changes', async () => {
		const error = await captureError(() =>
			db.asUser(teacherB.id, (q) =>
				q('select public.notebook_flag_entry($1, $2)', [aliceEntry, 'not_dated'])
			)
		);
		expect(error.message).toMatch(/only the section instructor or a site admin/i);

		const after = await db.sql<{ status: string }>(
			'select status from public.notebook_entries where id = $1',
			[aliceEntry]
		);
		expect(after.rows[0].status).toBe('compliant');
	});

	test('a student cannot flag their own entry', async () => {
		const error = await captureError(() =>
			db.asUser(alice.id, (q) =>
				q('select public.notebook_flag_entry($1, $2)', [aliceEntry, 'other'])
			)
		);
		expect(error.message).toMatch(/only the section instructor or a site admin/i);
	});

	test('only the section’s own teacher can schedule a check-in on it', async () => {
		const error = await captureError(() =>
			db.asUser(teacherB.id, (q) =>
				q('select public.notebook_admin_upsert_session($1, $2, $3, $4)', [
					sectionA,
					9,
					'2026-11-01',
					'Intrusion'
				])
			)
		);
		expect(error.message).toMatch(/only the section instructor or a site admin/i);

		const count = await db.sql('select 1 from public.notebook_sessions where section_id = $1', [
			sectionA
		]);
		expect(count.rowCount).toBe(1);
	});

	test('an entry filed against a section that does not exist is refused', async () => {
		const error = await captureError(() =>
			createEntry(alice, {
				driveFileId: 'drive-nowhere',
				sectionId: '00000000-0000-0000-0000-000000000000',
				label: 'Nowhere'
			})
		);
		expect(error.message).toMatch(/that section does not exist/i);
	});

	test('there is still no direct write path to notebook_entries', async () => {
		for (const actor of [alice, teacherA, owner]) {
			const error = await captureError(() =>
				db.asUser(actor.id, (q) =>
					q(
						`insert into public.notebook_entries (student_id, section_id, custom_label)
						 values ($1, $2, 'forged')`,
						[alice.id, sectionA]
					)
				)
			);
			expect(error.code).toBe('42501');
		}
	});
});

// ---------------------------------------------------------------------------
// Last on purpose: it re-executes the real migration over the live schema, so
// anything after it would be testing a re-applied database rather than a
// freshly migrated one. The guarantees are re-checked inside.
// ---------------------------------------------------------------------------

describe('the migration re-applies cleanly', () => {
	test('running the real file twice more succeeds and changes nothing', async () => {
		const sql = readFileSync(MIGRATION_PATH, 'utf8');

		await expect(db.sql(sql)).resolves.toBeDefined();
		await expect(db.sql(sql)).resolves.toBeDefined();

		// The two things 0088 got wrong on its own second run: a constraint that
		// vanished, and a schema left half-built.
		const fks = await db.sql<{ n: string }>(
			`select conname as n from pg_constraint
			 where conname in (
			   'notebook_sessions_section_id_fkey',
			   'notebook_entries_section_id_fkey',
			   'notebook_entries_session_section_fkey'
			 )`
		);
		expect(fks.rows.map((r) => r.n).sort()).toEqual([
			'notebook_entries_section_id_fkey',
			'notebook_entries_session_section_fkey',
			'notebook_sessions_section_id_fkey'
		]);

		// No duplicate overloads left behind by the recreated RPCs.
		const overloads = await db.sql<{ n: string; c: string }>(
			`select proname as n, count(*)::text as c from pg_proc
			 where proname in (
			   'notebook_create_entry', 'notebook_create_note_entry',
			   'notebook_get_section_grid', 'notebook_flag_entry',
			   'notebook_admin_upsert_session', 'notebook_can_read_entry'
			 )
			 group by proname order by proname`
		);
		expect(overloads.rows.every((r) => r.c === '1')).toBe(true);
		expect(overloads.rows).toHaveLength(6);

		// The policies came back, exactly once each.
		const policies = await db.sql<{ n: string }>(
			`select policyname as n from pg_policies
			 where schemaname = 'public'
			   and policyname in (
			     'section staff read notebook entries',
			     'notebook excusals visible to subject and staff',
			     'students read own notebook entries'
			   )
			 order by policyname`
		);
		expect(policies.rows.map((r) => r.n)).toEqual([
			'notebook excusals visible to subject and staff',
			'section staff read notebook entries',
			'students read own notebook entries'
		]);
	});

	test('and the boundary still holds afterwards', async () => {
		expect(await visibleEntryIds(alice.id)).toEqual([aliceEntry]);
		expect(await visibleEntryIds(teacherA.id)).toEqual(
			[aliceEntry, bobEntryA, carolEntry].sort()
		);
		expect(await visibleEntryIds(teacherB.id)).toEqual([bobEntryB]);
		expect(await visibleEntryIds(unattachedStaff.id)).toEqual([]);
		expect((await grid(teacherA, sectionA)).section.id).toBe(sectionA);
		await expect(grid(teacherB, sectionA)).rejects.toThrow();
	});
});

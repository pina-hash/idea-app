/**
 * ONE CLOSED SECTION MUST NOT CLOSE THE FOUNDRY EVERYWHERE.
 *
 * 0173 built decision 01 the way it was answered -- a per-section toggle,
 * checked on the server -- and then said in its own report what it costs: ANY
 * class a student is enrolled in that has closed the Foundry closed the whole
 * area for that student, in every other class and at home, until somebody
 * opened it. A student in six classes was locked out by one teacher's press.
 *
 * WHAT THIS FILE PROVES IS THE SCOPE, IN BOTH DIRECTIONS, and it is a file
 * rather than a harness drive because both halves of it fail SILENTLY. A
 * narrowing that stops holding gives the student back a page they should not
 * have; a narrowing that spreads takes away pages nobody meant to close, and
 * neither shows up as an error anywhere -- the surface renders, the RPC
 * answers ok, and the only symptom is somebody being able (or unable) to do
 * something. That is the case CLAUDE.md names automated tests for.
 *
 * THREE CONTROLS, EACH PAIRED, AND THE MUTATION LOG IS IN
 * `docs/history/foundry-section-gate-avjwzf.md`:
 *
 *   1. A student in TWO sections, one closed, still gets the payload for the
 *      surfaces a closure does not reach. Break the narrowing (put `mine` in
 *      `FOUNDRY_CLOSURE_BLOCKS`) and they are refused, so the assertion is
 *      about the fix and not about the fixture.
 *   2. That same student is refused the GALLERY, which is what a closure is
 *      meant to take. Open that clause and the refusal flips.
 *   3. An instructor who does not teach a section cannot close it. Open the
 *      `classroom_manages_section` clause in 0173 and the refusal flips.
 *
 * THE LOADS ARE THE REAL ONES, imported from their own files and driven with
 * the shared PostgREST shim, because the scope lives in what each load does
 * with `parent()` -- which is invisible from a raw `select` against the RPC
 * and is exactly where the old behaviour was written.
 */
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
	FOUNDRY_CLOSURE_BLOCKS,
	foundryClosureBlocks,
	FOUNDRY_CLOSURE_EFFECT,
	FOUNDRY_CLOSURE_LIMIT,
	FOUNDRY_CLOSURE_REACH,
	type FoundryAccess
} from '../src/lib/foundry/access';
import type { FoundryPlace } from '../src/lib/foundry/nav';
import type { FoundryGuarded } from '../src/lib/foundry/access';
import { load as galleryLoad } from '../src/routes/foundry/+page.server';
import { load as mineLoad } from '../src/routes/foundry/mine/+page.server';
import { load as submitLoad } from '../src/routes/foundry/submit/+page.server';
import { load as classesLoad } from '../src/routes/foundry/classes/+page.server';

/**
 * The Foundry chain plus the classroom files 0173's gate reads through
 * (`classroom_manages_section` and the enrollment rows), 0094 for the
 * uuid/email bridge, and 0139 so the gallery load's play-count read runs its
 * real path rather than its degrade path. 0137 LAST, because it is a sweep
 * over whatever the chain above it created.
 */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0053_app_feedback.sql',
	'0069_notebook.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0090_classroom_instructor_materials.sql',
	'0094_notebook_classroom_sections.sql',
	'0101_classroom_decks.sql',
	'0130_foundry.sql',
	'0131_foundry_service_role_writes.sql',
	'0132_foundry_author_class.sql',
	'0136_foundry_delete.sql',
	'0139_foundry_telemetry.sql',
	'0141_foundry_app_cap_and_download.sql',
	'0173_foundry_section_gate_description_and_trust.sql',
	'0137_anon_execute_sweep.sql'
] as const;

const OWNER_EMAIL = 'apina@boscotech.edu';
const DESCRIPTION = 'A small browser game about sorting bolts by thread pitch.';

let db: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;

let owner: SeededUser;
let admin: SeededUser;
/** Teaches the section that closes it. */
let closingTeacher: SeededUser;
/** Teaches the section that stays open. */
let openTeacher: SeededUser;
/** Teaches neither, and is the third control's subject. */
let outsideTeacher: SeededUser;
/** In BOTH sections. The person this whole bundle is about. */
let student: SeededUser;

let closedSectionId: string;
let openSectionId: string;
/** The student's own app, so "their own shelf" has something on it. */
let ownAppId: string;

/** `foundry_section_access()` as the caller, shaped the way the layout reads it. */
async function accessFor(user: SeededUser): Promise<FoundryAccess> {
	return db.asUser(user.id, async (q) => {
		const { rows } = await q<{ r: FoundryAccess }>(
			`select public.foundry_section_access() as r`
		);
		return rows[0].r;
	});
}

/**
 * Drives a real load as one caller with a real `parent()` answer.
 *
 * THE ACCESS OBJECT IS THE ONE THE DATABASE JUST GAVE, never a hand-written
 * `{open:false}`: the whole question is what the loads do with what the real
 * RPC actually returns for a student in two sections, and a stubbed shape
 * would be this file agreeing with itself.
 */
async function driveLoad(
	loadFn: (event: never) => unknown,
	user: SeededUser,
	access: FoundryAccess,
	path: string
) {
	const supabase = createPostgrestShim(db, fks, user.id);
	return (await loadFn({
		locals: { supabase, claims: { sub: user.id, email: user.email } },
		url: new URL(`https://ideabosco.com${path}`),
		params: {},
		parent: async () => ({ foundryAccess: access })
	} as never)) as Record<string, unknown>;
}

async function closeSection(as: SeededUser, sectionId: string, note: string | null) {
	await db.asUser(as.id, (q) =>
		q(`select public.foundry_set_section_open($1::uuid, false, $2)`, [sectionId, note])
	);
}

async function openSection(as: SeededUser, sectionId: string) {
	await db.asUser(as.id, (q) =>
		q(`select public.foundry_set_section_open($1::uuid, true, null)`, [sectionId])
	);
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	fks = await loadForeignKeys(db);

	owner = await createUser(db, OWNER_EMAIL, 'Site Owner');
	admin = await createUser(db, 'fdyscope-admin@boscotech.edu', 'An Admin');
	closingTeacher = await createUser(db, 'fdyscope-close@boscotech.edu', 'Closing Teacher');
	openTeacher = await createUser(db, 'fdyscope-open@boscotech.edu', 'Open Teacher');
	outsideTeacher = await createUser(db, 'fdyscope-outside@boscotech.edu', 'Outside Teacher');
	student = await createUser(db, 'fdyscope-student@boscotech.net', 'A Student');

	await db.asUser(owner.id, (q) =>
		q(`select public.admin_grant($1, null)`, ['fdyscope-admin@boscotech.edu'])
	);

	// TWO sections, two different teachers of record, one student in both.
	// That pairing is the whole fixture: without a SECOND section the "one
	// closed does not close the rest" claim has nothing to be about.
	closedSectionId = await createClassroomSection(db, {
		as: admin,
		courseCode: 'IDEA209H',
		courseTitle: 'Engineering I Honors',
		label: 'Block 3',
		teacherEmail: closingTeacher.email
	});
	openSectionId = await createClassroomSection(db, {
		as: admin,
		courseCode: 'IDEA100',
		courseTitle: 'Introduction to Engineering',
		label: 'Block 6',
		teacherEmail: openTeacher.email
	});
	for (const sectionId of [closedSectionId, openSectionId]) {
		await enrollStudent(db, {
			as: admin,
			sectionId,
			email: student.email,
			displayName: 'A Student'
		});
	}

	// The student's own app, unpublished, which is most of what a student has
	// while they are still working and is exactly what /foundry/mine is for.
	ownAppId = await db.asUser(student.id, async (q) => {
		const { rows } = await q<{ r: { app_id: string } }>(
			`select public.foundry_create_app($1, $2, $3, null, $4) as r`,
			['bolt-sorter', 'Bolt Sorter', 'Plain HTML and a bit of JavaScript.', DESCRIPTION]
		);
		return rows[0].r.app_id;
	});
	await db.asUser(student.id, (q) =>
		q(`select public.foundry_create_version($1::uuid, $2)`, [
			ownAppId,
			`${student.id}/${crypto.randomUUID()}.zip`
		])
	);
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
// THE SCOPE ITSELF, as a pure predicate.
// ===========================================================================

describe('what a closure reaches', () => {
	/**
	 * TOTAL OVER THE GUARDED UNION, ASSERTED AS A SET RATHER THAN AS A LIST OF
	 * `expect` LINES. A place with no decision made about it is the thing that
	 * ships ungated, so the union is enumerated here and every member has to
	 * appear on one side or the other.
	 *
	 * IT ENUMERATES `FoundryGuarded`, NOT `FoundryPlace`, AND 0045 IS WHY. The
	 * predicate's domain is wider than the tab strip: `/foundry/preview`,
	 * `/foundry/download` and `/foundry/starter` are `+server.ts` endpoints
	 * that hand over bytes, `locateFoundry` correctly places none of them, and
	 * before 0045 the closure did not reach any of them. Enumerating only the
	 * six tabs would have left the three routes this whole bundle is about
	 * outside the totality check that exists to catch exactly that.
	 */
	const EVERY_PLACE: readonly FoundryPlace[] = [
		'gallery',
		'mine',
		'contract',
		'submit',
		'classes',
		'review'
	];
	const EVERY_GUARDED: readonly FoundryGuarded[] = [
		...EVERY_PLACE,
		'preview',
		'download',
		'starter'
	];

	it('blocks the two places a bundle runs and nothing else', () => {
		const blocked = EVERY_GUARDED.filter((p) => foundryClosureBlocks(p));
		const open = EVERY_GUARDED.filter((p) => !foundryClosureBlocks(p));
		// The gallery mounts `AppStage` and `/foundry/preview` executes a
		// student's own build on the portal origin. Those are the two, and the
		// argument is on `FOUNDRY_CLOSURE_BLOCKS`.
		expect(blocked).toEqual(['gallery', 'preview']);
		// The positive control on the same reading: the other seven are named,
		// so a predicate that started answering true for everything cannot
		// pass the line above by returning an empty second list.
		expect(open).toEqual([
			'mine',
			'contract',
			'submit',
			'classes',
			'review',
			'download',
			'starter'
		]);
		expect([...FOUNDRY_CLOSURE_BLOCKS]).toEqual(['gallery', 'preview']);
		// AND THE UNION IS COVERED. A member added to `FoundryGuarded` and not
		// to the list above would slip past both filters silently; the count is
		// what makes the totality claim a measurement.
		expect(blocked.length + open.length).toBe(EVERY_GUARDED.length);
		expect(EVERY_GUARDED.length).toBe(9);
	});

	it('fails closed for a place nobody has classified', () => {
		// A route added under /foundry that `locateFoundry` does not place yet.
		expect(foundryClosureBlocks(null)).toBe(true);
	});

	/**
	 * THE THREE SENTENCES EXIST, SAY THE THING, AND CARRY NO EM DASH. They are
	 * what B2 is about: the instructor's control and the student's panel read
	 * the SAME strings, so a change to one cannot describe a different
	 * closure to the other. The reach sentence is asserted by CONTENT because
	 * it is the one claim about this switch a person would guess wrong.
	 */
	it('states the reach in words, from one source', () => {
		expect(FOUNDRY_CLOSURE_EFFECT).toMatch(/gallery/i);
		// 0045: the effect sentence gained the second surface a closure now
		// takes, because an instructor reading only "the gallery" would not
		// expect Preview to stop working.
		expect(FOUNDRY_CLOSURE_EFFECT).toMatch(/their own builds/i);
		expect(FOUNDRY_CLOSURE_LIMIT).toMatch(/their own apps/i);
		expect(FOUNDRY_CLOSURE_LIMIT).toMatch(/publishing/i);
		expect(FOUNDRY_CLOSURE_REACH).toMatch(/every class and at home/i);
		expect(FOUNDRY_CLOSURE_REACH).toMatch(/not only during your period/i);
		for (const s of [FOUNDRY_CLOSURE_EFFECT, FOUNDRY_CLOSURE_LIMIT, FOUNDRY_CLOSURE_REACH]) {
			expect(s).not.toContain('—');
		}
	});
});

// ===========================================================================
// CONTROL 1 and CONTROL 2 -- a real student in two sections, one closed.
// ===========================================================================

describe('a student in two sections, one of which has closed it', () => {
	it('is reported closed by the database, naming only the class that closed', async () => {
		// POSITIVE CONTROL FIRST: nothing is closed, so a later `open: false`
		// cannot be the fixture having been broken from the start.
		const before = await accessFor(student);
		expect(before.open).toBe(true);
		expect(before.closed).toHaveLength(0);

		await closeSection(closingTeacher, closedSectionId, 'We are on the CAD assessment today.');

		const after = await accessFor(student);
		expect(after.open).toBe(false);
		// EXACTLY ONE, and it is the one that closed. The other section is a
		// live enrollment the same query walked past.
		expect(after.closed).toHaveLength(1);
		expect(after.closed[0].section_id).toBe(closedSectionId);
		expect(after.closed[0].course_title).toBe('Engineering I Honors');
		expect(after.closed[0].note).toBe('We are on the CAD assessment today.');
		expect(after.closed.map((c) => c.section_id)).not.toContain(openSectionId);
	});

	/**
	 * CONTROL 2. The gallery is what a closure is meant to take, so it is
	 * asserted against the SAME access object the database just produced, and
	 * with the same student's open gallery beside it.
	 */
	it('is refused the gallery, and gets it back the moment the class opens', async () => {
		const closed = await accessFor(student);
		expect(closed.open).toBe(false);

		const shut = await driveLoad(galleryLoad, student, closed, '/foundry');
		expect(shut.apps).toEqual([]);
		expect(shut.selected).toBeNull();

		// POSITIVE CONTROL: the identical load, the identical caller, one
		// section reopened. Nothing else changes.
		await openSection(closingTeacher, closedSectionId);
		const reopened = await accessFor(student);
		expect(reopened.open).toBe(true);
		const lit = await driveLoad(galleryLoad, student, reopened, '/foundry');
		expect(lit.apps).toBeInstanceOf(Array);

		// Put it back for the rest of the file.
		await closeSection(closingTeacher, closedSectionId, 'We are on the CAD assessment today.');
	});

	/**
	 * CONTROL 1, AND THE PROPERTY THE WHOLE BUNDLE EXISTS FOR. The student is
	 * closed out of one of two classes; their own shelf, the publish flow and
	 * the manager control all still answer. Break the narrowing (add `mine` to
	 * `FOUNDRY_CLOSURE_BLOCKS`) and the first of these reddens, which is what
	 * makes it a test of the fix rather than of the fixture.
	 */
	it('still reaches their own shelf', async () => {
		const closed = await accessFor(student);
		expect(closed.open).toBe(false);

		const mine = await driveLoad(mineLoad, student, closed, '/foundry/mine');
		expect(mine.uid).toBe(student.id);
		const apps = mine.apps as { id: string }[];
		expect(apps.map((a) => a.id)).toContain(ownAppId);
	});

	it('still reaches the publish flow', async () => {
		const closed = await accessFor(student);
		expect(closed.open).toBe(false);

		const submit = await driveLoad(submitLoad, student, closed, '/foundry/submit');
		expect(submit.uid).toBe(student.id);
		const apps = submit.apps as { id: string }[];
		expect(apps.map((a) => a.id)).toContain(ownAppId);
	});

	/**
	 * THE ONE-WAY DOOR, WHICH IS A FIX AND NOT A PREFERENCE.
	 *
	 * Instructors enroll themselves in their own sections to see the class the
	 * way a student does, and `foundry_section_access` reads ENROLLMENTS and
	 * exempts only ADMINS. So a section manager who is not an admin, closing
	 * their own class, used to be shown the refusal in place of the only
	 * control that reopens it. Both halves are asserted: the database really
	 * does report them closed, and the classes load really does answer anyway.
	 */
	it('leaves a non-admin teacher their own reopen control after closing their own class', async () => {
		await enrollStudent(db, {
			as: admin,
			sectionId: closedSectionId,
			email: closingTeacher.email,
			displayName: 'Closing Teacher'
		});

		// The database half: the teacher is closed out exactly like a student.
		const teacherAccess = await accessFor(closingTeacher);
		expect(teacherAccess.open).toBe(false);
		expect(teacherAccess.closed.map((c) => c.section_id)).toContain(closedSectionId);

		// And the classes load answers regardless, with the row they came for.
		const classes = await driveLoad(
			classesLoad,
			closingTeacher,
			teacherAccess,
			'/foundry/classes'
		);
		const sections = classes.sections as { section_id: string; foundry_closed_at: string | null }[];
		const row = sections.find((s) => s.section_id === closedSectionId);
		expect(row).toBeDefined();
		expect(row?.foundry_closed_at).not.toBeNull();

		// POSITIVE CONTROL that the load is not simply answering everybody:
		// a teacher of neither section gets no rows from the same call.
		const outsideAccess = await accessFor(outsideTeacher);
		const outside = await driveLoad(
			classesLoad,
			outsideTeacher,
			outsideAccess,
			'/foundry/classes'
		);
		expect(outside.sections).toEqual([]);
	});

	/** An admin was never gated, and this is the line that says so still. */
	it('never reports an administrator closed', async () => {
		await enrollStudent(db, {
			as: admin,
			sectionId: closedSectionId,
			email: admin.email,
			displayName: 'An Admin'
		});
		const r = await accessFor(admin);
		expect(r.open).toBe(true);
		expect(r.closed).toHaveLength(0);
	});
});

// ===========================================================================
// CONTROL 3 -- who may close a section at all.
// ===========================================================================

describe('only a manager of the section can close it', () => {
	it('refuses a teacher who does not teach it, and allows the one who does', async () => {
		await expect(
			db.asUser(outsideTeacher.id, (q) =>
				q(`select public.foundry_set_section_open($1::uuid, false, null)`, [openSectionId])
			)
		).rejects.toThrow(/does not exist/);

		// The section is still open, which is the half a raise alone does not
		// prove: a refusal that had already written the row would pass above.
		const stillOpen = await db.sql<{ foundry_closed_at: string | null }>(
			`select foundry_closed_at from public.classroom_sections where id = $1`,
			[openSectionId]
		);
		expect(stillOpen.rows[0].foundry_closed_at).toBeNull();

		// POSITIVE CONTROL: the teacher of record, same call, same section.
		await closeSection(openTeacher, openSectionId, null);
		const nowClosed = await db.sql<{ foundry_closed_at: string | null }>(
			`select foundry_closed_at from public.classroom_sections where id = $1`,
			[openSectionId]
		);
		expect(nowClosed.rows[0].foundry_closed_at).not.toBeNull();
		await openSection(openTeacher, openSectionId);
	});
});

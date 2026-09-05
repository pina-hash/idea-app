// tests/foundry-author-class.test.ts
//
// THE AUTHOR'S CLASS ON A FOUNDRY APP (0132), AND THE HALF THAT WOULD FAIL
// SILENTLY.
//
// The easy half is that a student browsing the gallery sees the author's name
// and class. That fails visibly the first time anybody looks at the page.
//
// The half worth a test is the other one: the SAME student must still be
// unable to read that peer's `profiles` row or `classroom_enrollments` row by
// any other path. A projection inside a SECURITY DEFINER is only a boundary
// while the tables behind it stay shut, and a policy loosened three migrations
// from now would open them with nothing on screen to say so. So every
// disclosure assertion here has a matching denial, run as the same caller in
// the same session.
//
// AND EVERY DENIAL HAS A POSITIVE CONTROL. An empty result from a locked table
// reads exactly like an empty result from a query pointed at the wrong row, so
// each `toHaveLength(0)` sits beside a read that legitimately returns rows for
// a caller who is allowed them.
//
// THE FIXTURES ARE THE COURSES THAT ACTUALLY EXIST, NOT A COURSE INVENTED TO
// SUIT THE CODE. The first version of 0132 pinned the code 'IDEA' and this file
// created a course called 'IDEA' to match it, so the suite was green against a
// database no school has: production holds 'IDEA209H' and 'IDEA 100' (with a
// space in it), and the pinned constant matched neither. Every course below is
// one of those two, a plausible A-G successor to them, or a deliberate
// non-match.
//
// AND EVERY EXPECTED VALUE COMES FROM THE FIXTURE, NEVER FROM WHAT THE FUNCTION
// RETURNED. That matters most for the tiebreak: a test that enrolls a student
// twice and then pins whatever came back certifies only that the answer is
// stable, which is the easy half of a total order and not the half anybody
// gets wrong. The tiebreak cases below therefore state WHICH enrollment must
// win before asking, assert the stored timestamps that make it the winner
// (read as the connection owner, so RLS is not in the way), and run the same
// fixture in the opposite order so a function ignoring the timestamp entirely
// cannot pass both.

import { beforeAll, afterAll, describe, expect, it } from 'vitest';

import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';

/**
 * The chain this file needs, in numeric order: profiles and the admin tier,
 * the notebook (0069) because 0094's uuid/email bridge lives on top of it,
 * the classroom (0082/0083) for courses, sections and enrollments, 0094 for
 * `_notebook_email_for_user` itself, and Foundry.
 */
const MIGRATIONS = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0053_app_feedback.sql',
	'0069_notebook.sql',
	'0070_coin_economy.sql',
	'0071_notebook_optional_label.sql',
	'0075_notebook_optional_photo.sql',
	'0078_notebook_entry_notes.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0088_notebook_folders.sql',
	'0090_classroom_instructor_materials.sql',
	'0094_notebook_classroom_sections.sql',
	'0101_classroom_decks.sql',
	'0130_foundry.sql',
	'0131_foundry_service_role_writes.sql',
	'0132_foundry_author_class.sql',
	'0137_anon_execute_sweep.sql'
] as const;

let db: TestDb;

/**
 * THE TWO COURSES PRODUCTION ACTUALLY HAS. The space inside 'IDEA 100' is the
 * whole reason the predicate strips whitespace rather than trusting `btrim`,
 * so it is spelled here exactly as it is stored.
 */
const IDEA_209H = { code: 'IDEA209H', title: 'Engineering I Honors' } as const;
const IDEA_100 = { code: 'IDEA 100', title: 'Intro to IDEA' } as const;
/** A course that is not IDEA and must never be projected. */
const PHYS = { code: 'PHYS', title: 'Physics' } as const;
/** An IDEA course that has been retired. Its enrollments still mean something. */
const IDEA_404 = { code: 'IDEA404', title: 'Senior Capstone' } as const;
/** Two more IDEA courses, used only by the same-instant import tie. */
const IDEA_305 = { code: 'IDEA305', title: 'Robotics Systems' } as const;
const IDEA_306 = { code: 'IDEA306', title: 'Digital Fabrication' } as const;

let admin: SeededUser;
/** Another student, who browses the gallery. Enrolled with nobody below. */
let viewer: SeededUser;

/** IDEA209H only, plus a PHYS enrollment that must not surface. */
let author: SeededUser;
/** 'IDEA 100' only -- the course whose code carries a space. */
let hundred: SeededUser;
/** A non-IDEA course only. Projects null, which is a normal state. */
let physOnly: SeededUser;
/** An INACTIVE IDEA course only. */
let retired: SeededUser;
/** Both IDEA courses; 'IDEA 100' enrolled second, so it wins on key 2. */
let dual: SeededUser;
/** The same pair in the opposite order, so key 2 is what decides and not a name. */
let dualReverse: SeededUser;
/** Both IDEA courses in ONE roster import, so key 2 ties and the section decides. */
let sameInstant: SeededUser;
/** A live course enrolled FIRST and a retired one SECOND: key 1 outranks key 2. */
let preferLive: SeededUser;

/** slug -> the class its author must project, decided by the fixtures above. */
const slugs = {
	author: 'tide-clock',
	hundred: 'pixel-metronome',
	physOnly: 'gear-ratio',
	retired: 'kiln-log',
	dual: 'bracket-finder',
	dualReverse: 'truss-solver',
	sameInstant: 'belt-tension',
	preferLive: 'servo-sweep'
} as const;

/** Section ids the tests reach back into. */
let section209H: string;

async function publishApp(owner: SeededUser, slug: string): Promise<string> {
	return db.asUser(owner.id, async (q) => {
		const created = await q<{ result: { app_id: string } }>(
			'select public.foundry_create_app($1, $2, $3) as result',
			[slug, 'App ' + slug, 'Built with an AI tool and then rewritten by hand.']
		);
		return created.rows[0].result.app_id;
	});
}

/** Approve and publish, so the app is in the gallery population. */
async function approveAndPublish(appId: string, owner: SeededUser): Promise<void> {
	const versionId = await db.asUser(owner.id, async (q) => {
		const v = await q<{ result: { version_id: string } }>(
			'select public.foundry_create_version($1, $2) as result',
			[appId, `${owner.id}/bundle.zip`]
		);
		await q('select public.foundry_submit_version($1)', [v.rows[0].result.version_id]);
		return v.rows[0].result.version_id;
	});
	await db.asUser(admin.id, async (q) => {
		await q('select public.foundry_review_version($1, $2, $3, $4)', [
			versionId,
			'approve',
			null,
			null
		]);
		await q('select public.foundry_set_published_version($1, $2)', [appId, versionId]);
	});
}

async function publishFor(owner: SeededUser, slug: string): Promise<void> {
	const appId = await publishApp(owner, slug);
	await approveAndPublish(appId, owner);
}

/** The class every published app projects, keyed by slug, read as one caller. */
async function classesBySlug(viewerId: string): Promise<Map<string, string | null>> {
	const rows = await db.asUser(viewerId, (q) =>
		q<{ slug: string; owner_class: string | null }>(
			'select slug, owner_class from public.foundry_list_apps()'
		)
	);
	return new Map(rows.rows.map((r) => [r.slug, r.owner_class]));
}

/** The single-app read's answer, so both projections are asserted every time. */
async function classFromGetApp(viewerId: string, slug: string): Promise<string | null> {
	const got = await db.asUser(viewerId, (q) =>
		q<{ result: { owner_class: string | null } }>(
			'select public.foundry_get_app($1) as result',
			[slug]
		)
	);
	return got.rows[0].result.owner_class;
}

/**
 * WHY EVERY STAMP IN THIS FILE IS READ IN MICROSECONDS AND NEVER AS A `Date`.
 *
 * `created_at` is a Postgres `timestamptz` and Postgres stamps it at MICROSECOND
 * resolution; `0132` sorts on it at that resolution and orders a pair correctly.
 * node-postgres parses the column into a JS `Date`, which carries MILLISECONDS
 * and TRUNCATES the rest -- measured, `...:00.1234+00` and `...:00.1239+00` both
 * arrive as `getTime() === 1788343200123`. So two enrollments written a few
 * hundred microseconds apart are distinct in the database, ordered correctly by
 * the projection, and INDISTINGUISHABLE to a test comparing `getTime()`.
 *
 * That is what failed CI run #504 -- `expected 1788332569600 to be greater than
 * 1788332569600` -- and what passes on a slower machine, where consecutive
 * enrollments land 1.2ms to 4ms apart and the truncation happens not to collide.
 * The assertion that fell over was this file's own PRECONDITION about its
 * fixture, never its claim about the product: with the pair forced 500us apart
 * the projection still answered "Engineering I Honors" while `getTime()` tied.
 *
 * THE FIX IS RESOLUTION, NOT TOLERANCE. A `toBeGreaterThanOrEqual`, a sleep or a
 * window would each stop the failure without restoring the check: an ordering
 * assertion that admits equality cannot detect the ordering bug it exists for.
 * The stamps are read back as epoch MICROSECONDS instead, which is the
 * resolution the column actually holds, and every ordering here is asserted on
 * those. The `Date` forms are kept beside them: they are what the wire gives, and
 * a reader should be able to see both.
 *
 * AND THE FIXTURE GUARANTEES THE ORDER RATHER THAN RACING FOR IT. Even at
 * microseconds two writes can in principle tie, so every pair whose ORDER is
 * under test is pinned to a named instant (`STAMP`) after the real RPC has
 * written the row. The preconditions stay, because they are what makes the
 * fixture honest -- what changed is that they can now be satisfied on purpose.
 */

/**
 * A `timestamptz` as epoch MICROSECONDS, which is the resolution the column
 * holds. Safe as a JS number: ~1.79e15 against a 9.007e15 integer ceiling.
 */
const MICROS = (col: string) => `(extract(epoch from ${col}) * 1000000)::bigint`;

/**
 * The instants the fixture pins, one per position in an ordering under test.
 * Distinct by a whole day, so an ordering assertion here can only fail because
 * the ORDER is wrong and never because two writes shared a tick.
 */
const STAMP = {
	first: '2026-01-05 09:00:00+00',
	second: '2026-01-06 09:00:00+00'
} as const;

interface SectionStamp {
	id: string;
	createdAt: Date;
	createdAtMicros: number;
}

interface EnrollmentStamps {
	createdAt: Date;
	updatedAt: Date;
	createdAtMicros: number;
	updatedAtMicros: number;
}

/**
 * A section of one course, created through the real RPCs. Returns its id and
 * its stored `created_at`, because the section timestamp is the third sort key
 * and a fixture that assumes an order without reading it back is asserting
 * against its own belief.
 */
async function section(
	course: { code: string; title: string },
	label: string,
	/** Pin the section's own `created_at`, for the pairs whose order is asserted. */
	createdAt?: string
): Promise<SectionStamp> {
	const id = await createClassroomSection(db, {
		as: admin,
		courseCode: course.code,
		courseTitle: course.title,
		label,
		teacherEmail: 'apina@boscotech.edu'
	});
	if (createdAt !== undefined) {
		const { rowCount } = await db.sql(
			`update public.classroom_sections set created_at = $2::timestamptz where id = $1`,
			[id, createdAt]
		);
		expect(rowCount).toBe(1);
	}
	const { rows } = await db.sql<{ created_at: Date; created_us: string }>(
		`select created_at, ${MICROS('created_at')} as created_us
		   from public.classroom_sections where id = $1`,
		[id]
	);
	return { id, createdAt: rows[0].created_at, createdAtMicros: Number(rows[0].created_us) };
}

/** Retire a course through the real admin edit path, not a raw update. */
async function deactivateCourse(course: { code: string; title: string }): Promise<void> {
	const { rows } = await db.sql<{ id: string }>(
		'select id from public.classroom_courses where code = $1',
		[course.code]
	);
	await db.asUser(admin.id, (q) =>
		q('select public.classroom_upsert_course($1, $2, $3, $4)', [
			course.code,
			course.title,
			false,
			rows[0].id
		])
	);
}

/** An enrollment row's own timestamps, read as owner so RLS is not in the way. */
async function enrollmentStamps(sectionId: string, email: string): Promise<EnrollmentStamps> {
	const { rows } = await db.sql<{
		created_at: Date;
		updated_at: Date;
		created_us: string;
		updated_us: string;
	}>(
		`select created_at, updated_at,
		        ${MICROS('created_at')} as created_us,
		        ${MICROS('updated_at')} as updated_us
		   from public.classroom_enrollments
		  where section_id = $1 and student_email = $2`,
		[sectionId, email]
	);
	expect(rows).toHaveLength(1);
	return {
		createdAt: rows[0].created_at,
		updatedAt: rows[0].updated_at,
		createdAtMicros: Number(rows[0].created_us),
		updatedAtMicros: Number(rows[0].updated_us)
	};
}

beforeAll(async () => {
	db = await startTestDb(MIGRATIONS);

	admin = await createUser(db, 'apina@boscotech.edu', 'Reviewing Admin');
	viewer = await createUser(db, 'viewer@boscotech.net', 'Vic Ortega');
	author = await createUser(db, 'author@boscotech.net', 'Ana Reyes');
	hundred = await createUser(db, 'hundred@boscotech.net', 'Nina Park');
	physOnly = await createUser(db, 'nobody@boscotech.net', 'Sam Cruz');
	retired = await createUser(db, 'retired@boscotech.net', 'Rio Vega');
	dual = await createUser(db, 'dual@boscotech.net', 'Dee Lang');
	dualReverse = await createUser(db, 'reverse@boscotech.net', 'Rey Otero');
	sameInstant = await createUser(db, 'instant@boscotech.net', 'Ines Marte');
	preferLive = await createUser(db, 'live@boscotech.net', 'Luz Fabre');

	// --- The two real courses. ------------------------------------------------
	const s209 = await section(IDEA_209H, 'Block 3');
	section209H = s209.id;
	const s100 = await section(IDEA_100, 'Block 3');
	const sPhys = await section(PHYS, 'Block 5');

	await enrollStudent(db, {
		as: admin,
		sectionId: section209H,
		email: author.email,
		displayName: 'Ana Reyes'
	});
	// A SECOND course the author is also in. It must never be projected.
	await enrollStudent(db, {
		as: admin,
		sectionId: sPhys.id,
		email: author.email,
		displayName: 'Ana Reyes'
	});
	await enrollStudent(db, {
		as: admin,
		sectionId: s100.id,
		email: hundred.email,
		displayName: 'Nina Park'
	});
	await enrollStudent(db, {
		as: admin,
		sectionId: sPhys.id,
		email: physOnly.email,
		displayName: 'Sam Cruz'
	});

	// --- A retired IDEA course. -----------------------------------------------
	const s404 = await section(IDEA_404, 'Block 7');
	await enrollStudent(db, {
		as: admin,
		sectionId: s404.id,
		email: retired.email,
		displayName: 'Rio Vega'
	});

	// --- Key 2: the most recent enrollment, both ways round. ------------------
	// `dual` joins 209H first and 100 second, so 'Intro to IDEA' must win.
	await enrollStudent(db, {
		as: admin,
		sectionId: section209H,
		email: dual.email,
		displayName: 'Dee Lang',
		createdAt: STAMP.first
	});
	await enrollStudent(db, {
		as: admin,
		sectionId: s100.id,
		email: dual.email,
		displayName: 'Dee Lang',
		createdAt: STAMP.second
	});
	// `dualReverse` joins them the other way, so 'Engineering I Honors' must win.
	await enrollStudent(db, {
		as: admin,
		sectionId: s100.id,
		email: dualReverse.email,
		displayName: 'Rey Otero',
		createdAt: STAMP.first
	});
	await enrollStudent(db, {
		as: admin,
		sectionId: section209H,
		email: dualReverse.email,
		displayName: 'Rey Otero',
		createdAt: STAMP.second
	});

	// --- Key 1 outranks key 2: a live course enrolled BEFORE a retired one. ---
	await enrollStudent(db, {
		as: admin,
		sectionId: section209H,
		email: preferLive.email,
		displayName: 'Luz Fabre',
		createdAt: STAMP.first
	});
	await enrollStudent(db, {
		as: admin,
		sectionId: s404.id,
		email: preferLive.email,
		displayName: 'Luz Fabre',
		createdAt: STAMP.second
	});
	// Retired AFTER both enrollments exist, so the course flag is what moved and
	// not the order they were made in.
	await deactivateCourse(IDEA_404);

	// --- Key 3: two enrollments made in ONE transaction. ----------------------
	// `classroom_import_roster` is the real producer of that shape: one call,
	// one transaction, so `now()` stamps both rows identically and key 2 cannot
	// decide. 306's section is created second, so it is the newer class.
	const s305 = await section(IDEA_305, 'Block 1', STAMP.first);
	const s306 = await section(IDEA_306, 'Block 2', STAMP.second);
	await db.asUser(admin.id, (q) =>
		q('select public.classroom_import_roster($1::jsonb)', [
			JSON.stringify([
				{
					email: sameInstant.email,
					name: 'Ines Marte',
					course_code: IDEA_305.code,
					section_label: 'Block 1'
				},
				{
					email: sameInstant.email,
					name: 'Ines Marte',
					course_code: IDEA_306.code,
					section_label: 'Block 2'
				}
			])
		])
	);
	// The fixture's own premise, asserted rather than assumed: the sections were
	// created in order, and the import really did stamp both rows the same.
	expect(s306.createdAtMicros).toBeGreaterThan(s305.createdAtMicros);
	const at305 = await enrollmentStamps(s305.id, sameInstant.email);
	const at306 = await enrollmentStamps(s306.id, sameInstant.email);
	// Asserted in microseconds in BOTH directions: at millisecond resolution this
	// equality is the one that can pass while the rows are genuinely apart, which
	// would leave key 3 never reached and the test below green for a wrong reason.
	expect(at306.createdAtMicros).toBe(at305.createdAtMicros);

	await publishFor(author, slugs.author);
	await publishFor(hundred, slugs.hundred);
	await publishFor(physOnly, slugs.physOnly);
	await publishFor(retired, slugs.retired);
	await publishFor(dual, slugs.dual);
	await publishFor(dualReverse, slugs.dualReverse);
	await publishFor(sameInstant, slugs.sameInstant);
	await publishFor(preferLive, slugs.preferLive);
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

describe('which courses count as IDEA', () => {
	/**
	 * The predicate on its own, as the owner. Everything else in this file goes
	 * through it by way of an enrollment, which cannot distinguish "did not
	 * match" from "no such row".
	 */
	it('matches an IDEA code however it is spelled, and nothing else', async () => {
		const cases: Array<[string | null, boolean]> = [
			['IDEA209H', true],
			['IDEA 100', true], // the space is inside the code, so btrim misses it
			['IDEA100', true],
			['idea 100', true],
			['  IDEA210  ', true],
			['IDEA', true],
			['PHYS', false],
			['ENGR209H', false], // an IDEA course misnamed: the one thing that breaks it
			['HON-IDEA-209', false],
			['', false],
			[null, false]
		];
		for (const [code, expected] of cases) {
			const { rows } = await db.sql<{ ok: boolean | null }>(
				'select public._foundry_is_idea_course($1) as ok',
				[code]
			);
			expect(`${code} -> ${rows[0].ok}`).toBe(`${code} -> ${expected}`);
		}
		// A predicate returning NULL rather than false is not a refusal at all:
		// in the WHERE clause below it would fall straight through. Spelled out
		// separately because `toBe(false)` on a null reads the same in a diff.
		const nulled = await db.sql<{ ok: boolean | null }>(
			'select public._foundry_is_idea_course(null) as ok'
		);
		expect(nulled.rows[0].ok).not.toBeNull();
		expect(cases).toHaveLength(11);
	});
});

describe('what a peer student is given', () => {
	it('projects the author name and their IDEA course title into the list', async () => {
		const rows = await db.asUser(viewer.id, (q) =>
			q<{ slug: string; owner_full_name: string; owner_class: string | null }>(
				'select slug, owner_full_name, owner_class from public.foundry_list_apps()'
			)
		);

		const app = rows.rows.find((r) => r.slug === slugs.author);
		expect(app).toBeDefined();
		expect(app!.owner_full_name).toBe('Ana Reyes');
		expect(app!.owner_class).toBe(IDEA_209H.title);
	});

	it('projects the same class through the single-app read', async () => {
		const got = await db.asUser(viewer.id, (q) =>
			q<{ result: { owner_class: string | null; owner_full_name: string } }>(
				'select public.foundry_get_app($1) as result',
				[slugs.author]
			)
		);
		expect(got.rows[0].result.owner_class).toBe(IDEA_209H.title);
		expect(got.rows[0].result.owner_full_name).toBe('Ana Reyes');
	});

	/**
	 * The course whose code carries a space. It is the case the pinned constant
	 * could not have matched even if the constant had been 'IDEA100'.
	 */
	it('projects a course whose code has a space inside it', async () => {
		const classes = await classesBySlug(viewer.id);
		expect(classes.get(slugs.hundred)).toBe(IDEA_100.title);
		expect(await classFromGetApp(viewer.id, slugs.hundred)).toBe(IDEA_100.title);
	});

	/**
	 * THE COURSE TITLE, NEVER THE SECTION LABEL OR THE BLOCK. Both IDEA sections
	 * in this fixture are labelled 'Block 3' on purpose: it is internal
	 * scheduling, it tells a viewer nothing, and it does not even distinguish
	 * the two courses from one another.
	 */
	it('never projects a section label or block', async () => {
		const classes = await classesBySlug(viewer.id);
		const projected = [...classes.values()].filter((v) => v !== null);
		expect(projected.length).toBeGreaterThan(0);
		expect(projected.some((v) => /^Block /.test(v!))).toBe(false);
		// POSITIVE CONTROL: the labels really are 'Block ...' in the fixture, so
		// the absence above is not a search for something nothing ever stored.
		const labels = await db.sql<{ label: string }>(
			'select distinct label from public.classroom_sections'
		);
		expect(labels.rows.every((r) => /^Block /.test(r.label))).toBe(true);
	});

	/**
	 * The state the surfaces have to render as nothing at all. It is not an
	 * error: an app outlives an enrollment, and a roster import lags.
	 */
	it('projects null for an author with no IDEA enrollment', async () => {
		const classes = await classesBySlug(viewer.id);
		expect(classes.has(slugs.physOnly)).toBe(true);
		expect(classes.get(slugs.physOnly)).toBeNull();
		expect(await classFromGetApp(viewer.id, slugs.physOnly)).toBeNull();
	});

	it('never projects a class from a course that is not IDEA', async () => {
		const classes = await classesBySlug(viewer.id);
		// The author is in Block 5 of PHYS as well. Only the IDEA one appears.
		expect(classes.get(slugs.author)).toBe(IDEA_209H.title);
		expect([...classes.values()]).not.toContain(PHYS.title);
	});

	/**
	 * A RETIRED COURSE IS A PREFERENCE, NOT A FILTER. `active` on the ENROLLMENT
	 * says whether this student is still in the class; `active` on the COURSE
	 * says the school stopped teaching it, which is not a claim about whether
	 * they took it. A student whose only IDEA course has been retired still has
	 * one.
	 */
	it('still projects an IDEA course that has been retired', async () => {
		const { rows } = await db.sql<{ active: boolean }>(
			'select active from public.classroom_courses where code = $1',
			[IDEA_404.code]
		);
		expect(rows[0].active).toBe(false); // the fixture's premise
		const classes = await classesBySlug(viewer.id);
		expect(classes.get(slugs.retired)).toBe(IDEA_404.title);
	});

	/**
	 * `active` on the enrollment IS a filter. 0082 soft-deletes a roster row by
	 * clearing it, so a student who left a class must stop claiming they are in
	 * it.
	 */
	it('stops projecting a class once the enrollment goes inactive', async () => {
		expect(await classFromGetApp(viewer.id, slugs.author)).toBe(IDEA_209H.title);

		await enrollStudent(db, {
			as: admin,
			sectionId: section209H,
			email: author.email,
			displayName: 'Ana Reyes',
			active: false
		});
		expect(await classFromGetApp(viewer.id, slugs.author)).toBeNull();

		// Put it back, so the ordering of the file cannot change what the
		// denial tests below are looking at.
		await enrollStudent(db, {
			as: admin,
			sectionId: section209H,
			email: author.email,
			displayName: 'Ana Reyes',
			active: true
		});
		expect(await classFromGetApp(viewer.id, slugs.author)).toBe(IDEA_209H.title);
	});
});

/**
 * THE TIEBREAK, WHICH IS THE PART THE SINGLE-COURSE PREMISE GOT WRONG.
 *
 * A student really can hold two IDEA enrollments at once, so "their class" has
 * to be resolved rather than assumed unique. Each case below names its winner
 * from the fixture and proves the stored values that make it the winner, so a
 * function that returned the other one would fail rather than redefine what the
 * test was checking.
 */
describe('a student holding two IDEA enrollments', () => {
	it('takes the more recently created enrollment', async () => {
		const s100 = await db.sql<{ id: string }>(
			`select s.id from public.classroom_sections s
			 join public.classroom_courses c on c.id = s.course_id
			 where c.code = $1`,
			[IDEA_100.code]
		);
		const at209 = await enrollmentStamps(section209H, dual.email);
		const at100 = await enrollmentStamps(s100.rows[0].id, dual.email);
		// The fixture enrolled 209H first. Assert that, rather than trusting it.
		expect(at100.createdAtMicros).toBeGreaterThan(at209.createdAtMicros);

		const classes = await classesBySlug(viewer.id);
		expect(classes.get(slugs.dual)).toBe(IDEA_100.title);
		expect(await classFromGetApp(viewer.id, slugs.dual)).toBe(IDEA_100.title);
	});

	/**
	 * THE SAME PAIR, ENROLLED THE OTHER WAY ROUND. Without this the case above
	 * is also passed by a function that sorts on the course title, the code, or
	 * the section id -- none of which is a recency rule.
	 */
	it('and the opposite order yields the opposite course', async () => {
		const s100 = await db.sql<{ id: string }>(
			`select s.id from public.classroom_sections s
			 join public.classroom_courses c on c.id = s.course_id
			 where c.code = $1`,
			[IDEA_100.code]
		);
		const at209 = await enrollmentStamps(section209H, dualReverse.email);
		const at100 = await enrollmentStamps(s100.rows[0].id, dualReverse.email);
		expect(at209.createdAtMicros).toBeGreaterThan(at100.createdAtMicros);

		const classes = await classesBySlug(viewer.id);
		expect(classes.get(slugs.dualReverse)).toBe(IDEA_209H.title);
		// And the pair really is the same pair of courses, so the two answers
		// differ because of the ORDER and not because of the fixtures.
		expect(classes.get(slugs.dual)).toBe(IDEA_100.title);
	});

	/**
	 * `created_at` AND NOT `updated_at`. Every roster upsert stamps
	 * `updated_at = now()`, so re-importing last year's file would make last
	 * year's class the newest one if the sort read that column. Here the OLDER
	 * enrollment is touched, which moves its `updated_at` past the winner's and
	 * must change nothing.
	 */
	it('is not moved by a later touch on the older enrollment', async () => {
		const s100 = await db.sql<{ id: string }>(
			`select s.id from public.classroom_sections s
			 join public.classroom_courses c on c.id = s.course_id
			 where c.code = $1`,
			[IDEA_100.code]
		);
		await enrollStudent(db, {
			as: admin,
			sectionId: section209H,
			email: dual.email,
			displayName: 'Dee Lang'
		});
		const at209 = await enrollmentStamps(section209H, dual.email);
		const at100 = await enrollmentStamps(s100.rows[0].id, dual.email);
		// The touch really did invert updated_at while leaving created_at alone.
		expect(at209.updatedAtMicros).toBeGreaterThan(at100.updatedAtMicros);
		expect(at100.createdAtMicros).toBeGreaterThan(at209.createdAtMicros);

		expect(await classFromGetApp(viewer.id, slugs.dual)).toBe(IDEA_100.title);
	});

	/**
	 * KEY 3, and it is reachable in ordinary use rather than contrived: `now()`
	 * is transaction time, and a roster import writes a whole file in one
	 * transaction, so two enrollments made by one import carry the SAME
	 * `created_at`. The more recently created SECTION is then the newer class.
	 */
	it('falls back to the section when both enrollments are the same instant', async () => {
		const sections = await db.sql<{ code: string; created_us: string }>(
			`select c.code, ${MICROS('s.created_at')} as created_us
			   from public.classroom_sections s
			   join public.classroom_courses c on c.id = s.course_id
			  where c.code in ($1, $2)`,
			[IDEA_305.code, IDEA_306.code]
		);
		const at305 = sections.rows.find((r) => r.code === IDEA_305.code)!;
		const at306 = sections.rows.find((r) => r.code === IDEA_306.code)!;
		expect(Number(at306.created_us)).toBeGreaterThan(Number(at305.created_us));

		const classes = await classesBySlug(viewer.id);
		expect(classes.get(slugs.sameInstant)).toBe(IDEA_306.title);
	});

	/**
	 * KEY 1 OUTRANKS KEY 2. The retired course was enrolled SECOND, so recency
	 * alone would pick it. A student carrying a live IDEA course and a dead one
	 * is described by the live one.
	 */
	it('prefers a live course over a retired one even when the retired one is newer', async () => {
		const s404 = await db.sql<{ id: string; active: boolean }>(
			`select s.id, c.active from public.classroom_sections s
			 join public.classroom_courses c on c.id = s.course_id
			 where c.code = $1`,
			[IDEA_404.code]
		);
		expect(s404.rows[0].active).toBe(false);
		const at209 = await enrollmentStamps(section209H, preferLive.email);
		const at404 = await enrollmentStamps(s404.rows[0].id, preferLive.email);
		// Recency points at the RETIRED one. The live course must still win.
		expect(at404.createdAtMicros).toBeGreaterThan(at209.createdAtMicros);

		const classes = await classesBySlug(viewer.id);
		expect(classes.get(slugs.preferLive)).toBe(IDEA_209H.title);
	});

	/**
	 * A TOTAL ORDER IS THE POINT: the same student must not change class
	 * between two page loads. Every projecting fixture is read repeatedly and
	 * must answer identically each time.
	 */
	it('answers identically across repeated reads', async () => {
		const first = await classesBySlug(viewer.id);
		const second = await classesBySlug(viewer.id);
		const third = await classesBySlug(viewer.id);
		expect([...second.entries()].sort()).toEqual([...first.entries()].sort());
		expect([...third.entries()].sort()).toEqual([...first.entries()].sort());
		// POSITIVE CONTROL: the map is not empty and does carry real classes, so
		// three equal empties could not be what passed.
		expect(first.size).toBe(Object.keys(slugs).length);
		expect([...first.values()].filter((v) => v !== null).length).toBeGreaterThan(4);
	});
});

/**
 * THE HALF THAT WOULD FAIL SILENTLY.
 *
 * Everything above says the definer discloses a name and a class. None of it
 * says the tables behind it are still shut, and a projection that works
 * because the underlying table became readable is not a projection at all.
 */
describe('and what that same student still cannot reach', () => {
	it('cannot read the author profiles row, while reading their own', async () => {
		const peer = await db.asUser(viewer.id, (q) =>
			q('select id, full_name, display_name, email from public.profiles where id = $1', [
				author.id
			])
		);
		expect(peer.rows).toHaveLength(0);

		// POSITIVE CONTROL: the same select, same caller, their own row. If this
		// were empty too, the assertion above would be proving nothing about
		// the policy.
		const own = await db.asUser(viewer.id, (q) =>
			q('select id from public.profiles where id = $1', [viewer.id])
		);
		expect(own.rows).toHaveLength(1);
	});

	it('cannot read the author enrollment row, while reading their own', async () => {
		const peer = await db.asUser(viewer.id, (q) =>
			q('select student_email, display_name from public.classroom_enrollments where student_email = $1', [
				author.email
			])
		);
		expect(peer.rows).toHaveLength(0);

		// POSITIVE CONTROL: enroll the viewer, and read that back as themselves.
		await enrollStudent(db, {
			as: admin,
			sectionId: section209H,
			email: viewer.email,
			displayName: 'Vic Ortega'
		});
		const own = await db.asUser(viewer.id, (q) =>
			q('select student_email from public.classroom_enrollments where student_email = $1', [
				viewer.email
			])
		);
		expect(own.rows).toHaveLength(1);
	});

	it('cannot see the whole roster of the class it just learned the name of', async () => {
		// The viewer now knows the author is in Engineering I Honors. That must
		// not become a way to enumerate who else is.
		const rows = await db.asUser(viewer.id, (q) =>
			q('select student_email from public.classroom_enrollments')
		);
		// Their own row, and nothing else -- not the author's, not anyone's.
		expect(rows.rows.map((r) => r.student_email)).toEqual([viewer.email]);
		// POSITIVE CONTROL: the roster really does hold everyone else's rows.
		const all = await db.sql<{ n: string }>(
			'select count(*)::int as n from public.classroom_enrollments'
		);
		expect(Number(all.rows[0].n)).toBeGreaterThan(1);
	});

	/**
	 * THE PRIVATE HELPERS ARE PRIVATE. They are the whole disclosure surface:
	 * either one, granted, answers "what is this account's email" or "what is
	 * this account's class" for any uuid a caller cares to try.
	 */
	it('cannot call the projection helpers directly', async () => {
		await expect(
			db.asUser(viewer.id, (q) =>
				q('select public._foundry_author_class($1)', [author.id])
			)
		).rejects.toThrow(/permission denied/i);

		await expect(
			db.asUser(viewer.id, (q) =>
				q('select public._notebook_email_for_user($1)', [author.id])
			)
		).rejects.toThrow(/permission denied/i);

		await expect(
			db.asUser(viewer.id, (q) =>
				q('select public._foundry_is_idea_course($1)', [IDEA_209H.code])
			)
		).rejects.toThrow(/permission denied/i);

		// POSITIVE CONTROL: the PUBLIC reads that wrap them do work for the same
		// caller, so the three refusals above are about the grant and not about
		// the session being broken.
		const ok = await db.asUser(viewer.id, (q) =>
			q('select count(*)::int as n from public.foundry_list_apps()')
		);
		expect(Number(ok.rows[0].n)).toBeGreaterThan(0);
	});

	/**
	 * No payload carries an email. The class projection reads one internally to
	 * cross the uuid/email gap, and it must not come back out.
	 */
	it('returns no email anywhere in either payload', async () => {
		const rows = await db.asUser(viewer.id, (q) =>
			q('select * from public.foundry_list_apps()')
		);
		expect(rows.rows.length).toBeGreaterThan(0);
		expect(JSON.stringify(rows.rows)).not.toContain('@boscotech');

		const got = await db.asUser(viewer.id, (q) =>
			q<{ result: unknown }>('select public.foundry_get_app($1) as result', [slugs.author])
		);
		expect(JSON.stringify(got.rows[0].result)).not.toContain('@boscotech');

		// POSITIVE CONTROL: the fixture really does use those addresses, so the
		// two absences above are not two ways of searching empty payloads.
		expect(author.email).toContain('@boscotech');
	});
});

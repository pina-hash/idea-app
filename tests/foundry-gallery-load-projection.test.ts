// tests/foundry-gallery-load-projection.test.ts
//
// WHAT THE FOUNDRY GALLERY HANDS A SIGNED-IN STUDENT ABOUT ANOTHER STUDENT.
//
// `foundry_list_apps` is the fourth of the set-returning reads nothing had
// ever driven through a client-shaped call. It differs from the three public
// coin reads in the one way that decides the question: it is granted to
// `authenticated` and NOT to `anon`, and its body refuses a null `auth.uid()`
// outright -- so the audience is every signed-in student, not the internet.
// That is still an audience of several hundred peers reading a payload built
// by joining `profiles` and, through `_foundry_author_class`, the classroom
// roster, both of which are shut to a browsing student by their own policies.
//
// AND THE POINT OF THAT LIST IS WHAT A ROUTE ASSEMBLES, so this drives the
// REAL gallery load (`src/routes/foundry/+page.server.ts`) with the shared
// PostgREST shim in `locals.supabase`, rather than the shim alone. The load
// makes three RPC calls, casts the first straight to `FoundryAppSummary[]`
// with no validation, and degrades the second on purpose; none of that is
// visible from a raw `select * from public.foundry_list_apps()`, which is how
// every existing test in the repo reaches this function.
//
// THE LOAD IS REACHABLE WITHOUT A SESSION OBJECT, which is worth stating
// because it is what makes this possible at all: it reads `locals.supabase`
// and `url` and nothing else -- no `claims`, no `safeGetSession`. The identity
// therefore comes from the shim's caller, exactly as it does in production
// where it comes from the request's cookies, and `/foundry` being in
// `authedPrefixes` is a separate gate in `hooks.server.ts` that this load does
// not restate.
//
// THREE CALLERS, ONE LOAD. A stranger to the app, its OWNER, and an ADMIN, so
// the one field in this projection that is conditional -- `submitted_version_id`,
// whose `case` in 0132 gives it to the owner and to staff and null to everyone
// else -- is asserted in both directions from the payload rather than from the
// function body.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';
import { load } from '../src/routes/foundry/+page.server';

/**
 * 0132's own chain (the author-class suite's, which is where the classroom and
 * notebook prerequisites for `_foundry_author_class` were established) plus
 * 0136 and 0139, so the gallery load's SECOND read -- `foundry_play_counts` --
 * runs its real path instead of its degrade path. 0137 stays last.
 */
const CHAIN = [
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
	'0136_foundry_delete.sql',
	'0139_foundry_telemetry.sql',
	'0137_anon_execute_sweep.sql'
] as const;

let db: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;

let admin: SeededUser;
let teacher: SeededUser;
let author: SeededUser; // publishes; is enrolled in an IDEA course
let viewer: SeededUser; // another student, on nothing of the author's

const COURSE_TITLE = 'Engineering I Honors';
/**
 * The value on `profiles.section_id`, which 0003 lets a student type for
 * themselves and which CLAUDE.md forbids any Foundry surface to render. It is
 * deliberately NOT the course title, so a payload that projected it instead of
 * the roster's answer would be caught by value rather than only by key.
 */
const SELF_DECLARED_SECTION = 'whatever-i-typed-in-my-profile';

/** Drives the REAL gallery load as one caller. */
async function gallery(userId: string, params = '') {
	const supabase = createPostgrestShim(db, fks, userId);
	return (await load({
		locals: { supabase },
		url: new URL(`https://ideabosco.com/foundry${params}`)
	} as unknown as Parameters<typeof load>[0])) as {
		apps: Record<string, unknown>[];
		selected: unknown;
		playCounts: Record<string, { plays: number; plays7d: number }>;
	};
}

async function createApp(owner: SeededUser, slug: string): Promise<string> {
	return db.asUser(owner.id, async (q) => {
		const created = await q<{ result: { app_id: string } }>(
			'select public.foundry_create_app($1, $2, $3) as result',
			[slug, 'App ' + slug, 'Built with an AI tool and then rewritten by hand.']
		);
		return created.rows[0].result.app_id;
	});
}

/** Creates a version and submits it, leaving it in the review queue. */
async function submitVersion(appId: string, owner: SeededUser): Promise<string> {
	return db.asUser(owner.id, async (q) => {
		const v = await q<{ result: { version_id: string } }>(
			'select public.foundry_create_version($1, $2) as result',
			[appId, `${owner.id}/bundle.zip`]
		);
		await q('select public.foundry_submit_version($1)', [v.rows[0].result.version_id]);
		return v.rows[0].result.version_id;
	});
}

async function approveAndPublish(appId: string, versionId: string): Promise<void> {
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

let liveAppId: string;
let draftAppId: string;
let hiddenAppId: string;

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	admin = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	teacher = await createUser(db, 'rmartinez@boscotech.edu', 'R Martinez');
	author = await createUser(db, 'ana.reyes@boscotech.net', 'Ana Reyes');
	viewer = await createUser(db, 'bruno.diaz@boscotech.net', 'Bruno Diaz');

	// The author's IDEA enrollment, which is where `owner_class` comes from.
	const sectionId = await createClassroomSection(db, {
		as: admin,
		courseCode: 'IDEA209H',
		courseTitle: COURSE_TITLE,
		label: 'Block 3',
		teacherEmail: teacher.email
	});
	await enrollStudent(db, {
		as: admin,
		sectionId,
		email: author.email,
		displayName: 'Ana Reyes'
	});

	// The self-declared section on the author's own profile row. Written as the
	// author themselves, through the own-row policy 0003 grants -- this is the
	// value a student really can put there.
	await db.asUser(author.id, (q) =>
		q('update public.profiles set section_id = $1 where id = $2', [
			SELF_DECLARED_SECTION,
			author.id
		])
	);

	// A published app -- the gallery's whole population.
	liveAppId = await createApp(author, 'tide-clock');
	const liveVersion = await submitVersion(liveAppId, author);
	await approveAndPublish(liveAppId, liveVersion);
	// ... with a SECOND version sitting submitted on it, which is what makes
	// `submitted_version_id` a live question rather than null for everyone.
	await submitVersion(liveAppId, author);

	// An app that has never been published: in the table, never in the gallery.
	draftAppId = await createApp(author, 'gear-ratio');

	// A published app the staff then shelved.
	hiddenAppId = await createApp(author, 'kiln-log');
	const hiddenVersion = await submitVersion(hiddenAppId, author);
	await approveAndPublish(hiddenAppId, hiddenVersion);
	await db.asUser(admin.id, (q) =>
		q('select public.foundry_set_app_hidden($1, true, $2)', [hiddenAppId, 'under discussion'])
	);

	fks = await loadForeignKeys(db);
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

/**
 * Every column `foundry_list_apps` hands a browsing student, and the verdict.
 *
 *   id / slug / title / tagline / description / cover_path / build_notes
 *                        the app. It is published; this IS the gallery card.
 *   owner                a uuid. It identifies nobody on its own and the
 *                        gallery needs it to answer "is this mine".
 *   owner_display_name / owner_full_name
 *                        BOTH, on purpose: `foundryAuthorName` picks the
 *                        display name when set and the full name otherwise,
 *                        and CLAUDE.md pins that the third rung -- the EMAIL --
 *                        is never one of them. Two name columns and no address
 *                        is the shape that rule describes.
 *   owner_class          the TITLE of the author's IDEA course, projected
 *                        inside the definer (0132) from a roster the viewer
 *                        cannot read. Never `profiles.section_id`.
 *   published_version_id / published_ordinal / version_count
 *                        which build is live and how many there have been.
 *   submitted_version_id CONDITIONAL: the owner's and staff's only.
 *   metadata_flagged_at / hidden_at / created_at / updated_at
 *                        staff-facing state and the ordering key.
 *
 * WHAT IS NOT HERE: no email in any form, no `profiles.section_id`, no role,
 * no pathway, no play count (that is the load's second read, joined on the id
 * by the client), and no storage path for anything but the cover.
 */
const APP_COLUMNS = [
	'build_notes',
	'cover_path',
	'created_at',
	'description',
	'hidden_at',
	'id',
	'metadata_flagged_at',
	'owner',
	'owner_class',
	'owner_display_name',
	'owner_full_name',
	'published_ordinal',
	'published_version_id',
	'slug',
	'submitted_version_id',
	'tagline',
	'title',
	'updated_at',
	'version_count'
] as const;

describe('the gallery load, driven as a browsing student', () => {
	test('POSITIVE CONTROL: it returns the published app, with the author resolved', async () => {
		const data = await gallery(viewer.id);
		expect(data.apps).toHaveLength(1);
		expect(data.apps[0]).toMatchObject({
			slug: 'tide-clock',
			owner_full_name: 'Ana Reyes',
			owner_class: COURSE_TITLE,
			version_count: 2
		});
		// The load's SECOND read really ran: a key for the app, rather than the
		// empty object its degrade path produces when 0139 is not applied.
		expect(Object.keys(data.playCounts)).toEqual([data.apps[0].id]);
		expect(data.playCounts[data.apps[0].id as string]).toEqual({ plays: 0, plays7d: 0 });
	});

	test('its columns are EXACTLY these nineteen, and a twentieth reddens this', async () => {
		const data = await gallery(viewer.id);
		expect(Object.keys(data.apps[0]).sort()).toEqual([...APP_COLUMNS]);
	});

	test('no address reaches the payload, and the author really has one', async () => {
		// POSITIVE CONTROL first: the address is on the profile row this
		// function joins, so its absence below is a projection decision.
		const { rows } = await db.sql<{ email: string }>(
			'select email from public.profiles where id = $1',
			[author.id]
		);
		expect(rows[0].email).toBe(author.email);

		const text = JSON.stringify(await gallery(viewer.id));
		expect(text.length).toBeGreaterThan(200);
		expect(text).not.toContain('@');
		for (const u of [author, viewer, teacher, admin]) {
			expect(text).not.toContain(u.email);
			expect(text).not.toContain(u.email.split('@')[0]);
		}
	});

	test('`profiles.section_id` appears nowhere, though it is set and is not the class', async () => {
		// The self-declared value is really stored -- read as the connection
		// owner, so RLS is not what is answering.
		const { rows } = await db.sql<{ section_id: string }>(
			'select section_id from public.profiles where id = $1',
			[author.id]
		);
		expect(rows[0].section_id).toBe(SELF_DECLARED_SECTION);

		const data = await gallery(viewer.id);
		expect(JSON.stringify(data)).not.toContain(SELF_DECLARED_SECTION);
		// And the class that IS shown is the roster's answer, not that one.
		expect(data.apps[0].owner_class).toBe(COURSE_TITLE);
	});

	test('the viewer cannot reach either source table by any other path', async () => {
		// A projection inside a definer is a boundary only while the tables
		// behind it stay shut.
		const profiles = await db.asUser(viewer.id, (q) =>
			q('select id from public.profiles where id = $1', [author.id])
		);
		expect(profiles.rows).toHaveLength(0);
		const enrollments = await db.asUser(viewer.id, (q) =>
			q('select student_email from public.classroom_enrollments where student_email = $1', [
				author.email
			])
		);
		expect(enrollments.rows).toHaveLength(0);
		// POSITIVE CONTROL on the same connection: the viewer's OWN profile row
		// is readable, so zero above is about the row and not about the query.
		const own = await db.asUser(viewer.id, (q) =>
			q('select id from public.profiles where id = $1', [viewer.id])
		);
		expect(own.rows).toHaveLength(1);
	});
});

describe('the conditional column, from the payload rather than from the body', () => {
	test('a browsing student is told nothing is in the queue', async () => {
		const data = await gallery(viewer.id);
		expect(data.apps[0].submitted_version_id).toBeNull();
	});

	test('the owner and an admin both see it, and it is a real id', async () => {
		// The POSITIVE half. Without it, a null for the viewer is equally
		// satisfied by a fixture with nothing submitted at all -- which is
		// exactly how this kind of assertion passes for the wrong reason.
		const mine = await gallery(author.id);
		const staff = await gallery(admin.id);
		const submitted = mine.apps.find((a) => a.slug === 'tide-clock')!.submitted_version_id;
		expect(submitted).toMatch(/^[0-9a-f-]{36}$/);
		expect(staff.apps.find((a) => a.slug === 'tide-clock')!.submitted_version_id).toBe(submitted);
		// And it is NOT the published one: the queue holds the second version.
		expect(submitted).not.toBe(mine.apps.find((a) => a.slug === 'tide-clock')!.published_version_id);
	});

	test('a teacher who is not an admin is a browsing student here', async () => {
		// `teacher` is auto-granted by email domain and grants nothing on its
		// own; the gate is `is_admin()`. This is the row that would move if
		// somebody ever wrote `role = 'teacher'` into that case.
		const data = await gallery(teacher.id);
		expect(data.apps).toHaveLength(1);
		expect(data.apps[0].submitted_version_id).toBeNull();
	});
});

describe('the population, from the load', () => {
	test('an unpublished app is the OWNER\'s alone, and a hidden app is nobody\'s', async () => {
		// POSITIVE CONTROL: both rows exist, read as the connection owner, so
		// every absence below is the predicate answering and not an empty table.
		const { rows } = await db.sql<{ n: number }>(
			'select count(*)::int as n from public.student_apps where id = any($1::uuid[])',
			[[draftAppId, hiddenAppId]]
		);
		expect(rows[0].n).toBe(2);

		// `_foundry_app_in_population` (0130) admits an unpublished app to its
		// OWN owner -- `p_owner = auth.uid()` -- so the author's gallery is
		// their shelf plus everyone's published work, and a peer's and an
		// admin's are not. That is the rule; the draft is not a leak.
		expect((await gallery(author.id)).apps.map((a) => a.slug).sort()).toEqual([
			'gear-ratio',
			'tide-clock'
		]);
		for (const caller of [viewer, teacher, admin]) {
			const slugs = (await gallery(caller.id)).apps.map((a) => a.slug);
			expect(slugs, `caller ${caller.email}`).toEqual(['tide-clock']);
		}

		// A HIDDEN app is off every one of them, its owner's included: hiding
		// is a staff act that takes an app off the site for staff too, and the
		// gallery load passes no widening flag.
		for (const caller of [viewer, teacher, author, admin]) {
			const slugs = (await gallery(caller.id)).apps.map((a) => a.slug);
			expect(slugs, `caller ${caller.email}`).not.toContain('kiln-log');
		}
	});

	test('the gallery passes no widening flag, so an admin sees the student gallery', async () => {
		// The load calls `foundry_list_apps()` with no arguments deliberately.
		// Both flags are gated on `is_admin()` inside the predicate, so this is
		// the assertion that would move if either were ever passed: the admin's
		// gallery is byte-for-byte a browsing student's.
		const staff = await gallery(admin.id);
		const student = await gallery(viewer.id);
		expect(staff.apps.map((a) => a.slug)).toEqual(student.apps.map((a) => a.slug));
		// And the row itself is the same row, `submitted_version_id` aside --
		// which section 2 asserts is the one field that legitimately differs.
		const drop = (a: Record<string, unknown>) => {
			const { submitted_version_id: _ignored, ...rest } = a;
			return rest;
		};
		expect(staff.apps.map(drop)).toEqual(student.apps.map(drop));
	});
});

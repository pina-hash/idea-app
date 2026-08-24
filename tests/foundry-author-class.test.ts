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
	'0132_foundry_author_class.sql'
] as const;

let db: TestDb;

/** The app's author. Enrolled in the IDEA course. */
let author: SeededUser;
/** Another student, who browses the gallery. Not enrolled with the author. */
let viewer: SeededUser;
/** An author with no IDEA enrollment at all, which is a normal state. */
let unenrolled: SeededUser;
let admin: SeededUser;

let authorAppSlug: string;
let unenrolledAppSlug: string;

/** Must match `_foundry_idea_course_code()`. */
const IDEA_CODE = 'IDEA';

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

beforeAll(async () => {
	db = await startTestDb(MIGRATIONS);

	admin = await createUser(db, 'apina@boscotech.edu', 'Reviewing Admin');
	author = await createUser(db, 'author@boscotech.net', 'Ana Reyes');
	viewer = await createUser(db, 'viewer@boscotech.net', 'Vic Ortega');
	unenrolled = await createUser(db, 'nobody@boscotech.net', 'Sam Cruz');

	// The author's IDEA class. `block` is left null by the harness helper, so
	// the projection falls back to the section label -- which is the fallback
	// path, and is asserted as such below.
	const ideaSection = await createClassroomSection(db, {
		as: admin,
		courseCode: IDEA_CODE,
		courseTitle: 'Integrated Design, Engineering & Art',
		label: 'Block 3',
		teacherEmail: 'apina@boscotech.edu'
	});
	await enrollStudent(db, {
		as: admin,
		sectionId: ideaSection,
		email: 'author@boscotech.net',
		displayName: 'Ana Reyes'
	});

	// A SECOND course the author is also in. It must never be projected: the
	// point of pinning one code is that "their class" means the IDEA one.
	const otherSection = await createClassroomSection(db, {
		as: admin,
		courseCode: 'PHYS',
		courseTitle: 'Physics',
		label: 'Block 5',
		teacherEmail: 'apina@boscotech.edu'
	});
	await enrollStudent(db, {
		as: admin,
		sectionId: otherSection,
		email: 'author@boscotech.net',
		displayName: 'Ana Reyes'
	});

	authorAppSlug = 'tide-clock';
	const appId = await publishApp(author, authorAppSlug);
	await approveAndPublish(appId, author);

	unenrolledAppSlug = 'gear-ratio';
	const otherAppId = await publishApp(unenrolled, unenrolledAppSlug);
	await approveAndPublish(otherAppId, unenrolled);
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

describe('what a peer student is given', () => {
	it('projects the author name and their IDEA class into the list', async () => {
		const rows = await db.asUser(viewer.id, (q) =>
			q<{ slug: string; owner_full_name: string; owner_class: string | null }>(
				'select slug, owner_full_name, owner_class from public.foundry_list_apps()'
			)
		);

		const app = rows.rows.find((r) => r.slug === authorAppSlug);
		expect(app).toBeDefined();
		expect(app!.owner_full_name).toBe('Ana Reyes');
		expect(app!.owner_class).toBe('Block 3');
	});

	it('projects the same class through the single-app read', async () => {
		const got = await db.asUser(viewer.id, (q) =>
			q<{ result: { owner_class: string | null; owner_full_name: string } }>(
				'select public.foundry_get_app($1) as result',
				[authorAppSlug]
			)
		);
		expect(got.rows[0].result.owner_class).toBe('Block 3');
		expect(got.rows[0].result.owner_full_name).toBe('Ana Reyes');
	});

	/**
	 * The state the surfaces have to render as nothing at all. It is not an
	 * error: an app outlives an enrollment, and a roster import lags.
	 */
	it('projects null for an author with no IDEA enrollment', async () => {
		const rows = await db.asUser(viewer.id, (q) =>
			q<{ slug: string; owner_class: string | null }>(
				'select slug, owner_class from public.foundry_list_apps()'
			)
		);
		const app = rows.rows.find((r) => r.slug === unenrolledAppSlug);
		expect(app).toBeDefined();
		expect(app!.owner_class).toBeNull();
	});

	/**
	 * `block` is 0082's display text and `label` is the roster key, so the
	 * projection prefers the block when one is set. Everything else in this
	 * file exercises the FALLBACK (the harness leaves block null), so without
	 * this the preferred branch would never run.
	 */
	/**
	 * `block` is 0082's display text and `label` is the roster key, so the
	 * projection prefers the block when one is set. Every other case in this
	 * file exercises the FALLBACK (the harness leaves block null), so without
	 * this the preferred branch would never run.
	 *
	 * Self-contained -- its own author, section and app -- because
	 * `classroom_upsert_section` REFUSES a duplicate label rather than updating
	 * one, so a block cannot be added to a section after the fact, and reusing
	 * a shared fixture would make this test's result depend on file order.
	 */
	it('prefers the section block over its label when a block is set', async () => {
		const blocked = await createUser(db, 'blocked@boscotech.net', 'Bo Diaz');

		const course = await db.asUser(admin.id, (q) =>
			q<{ id: string }>('select id from public.classroom_courses where code = $1', [IDEA_CODE])
		);
		const section = await db.asUser(admin.id, (q) =>
			q<{ result: { section_id: string } }>(
				'select public.classroom_upsert_section($1, $2, $3, $4) as result',
				[course.rows[0].id, 'Block 9', 'Period 7', 'apina@boscotech.edu']
			)
		);
		await enrollStudent(db, {
			as: admin,
			sectionId: section.rows[0].result.section_id,
			email: 'blocked@boscotech.net',
			displayName: 'Bo Diaz'
		});

		const appId = await publishApp(blocked, 'block-preference');
		await approveAndPublish(appId, blocked);

		const got = await db.asUser(viewer.id, (q) =>
			q<{ result: { owner_class: string | null } }>(
				'select public.foundry_get_app($1) as result',
				['block-preference']
			)
		);
		// 'Period 7', the block -- not 'Block 9', the label.
		expect(got.rows[0].result.owner_class).toBe('Period 7');
	});

	it('never projects a class from a course that is not IDEA', async () => {
		const rows = await db.asUser(viewer.id, (q) =>
			q<{ slug: string; owner_class: string | null }>(
				'select slug, owner_class from public.foundry_list_apps()'
			)
		);
		const app = rows.rows.find((r) => r.slug === authorAppSlug);
		// The author is in Block 5 of PHYS as well. Only the IDEA one appears.
		expect(app!.owner_class).toBe('Block 3');
		expect(rows.rows.some((r) => r.owner_class === 'Block 5')).toBe(false);
	});

	/**
	 * `active` is 0082's soft delete for a roster row. A student who has left a
	 * class is not in it, and their app must stop claiming they are.
	 */
	it('stops projecting a class once the enrollment goes inactive', async () => {
		const before = await db.asUser(viewer.id, (q) =>
			q<{ result: { owner_class: string | null } }>(
				'select public.foundry_get_app($1) as result',
				[authorAppSlug]
			)
		);
		expect(before.rows[0].result.owner_class).toBe('Block 3');

		const section = await db.asUser(admin.id, (q) =>
			q<{ id: string }>(
				`select s.id from public.classroom_sections s
				 join public.classroom_courses c on c.id = s.course_id
				 where c.code = $1`,
				[IDEA_CODE]
			)
		);
		await enrollStudent(db, {
			as: admin,
			sectionId: section.rows[0].id,
			email: 'author@boscotech.net',
			displayName: 'Ana Reyes',
			active: false
		});

		const after = await db.asUser(viewer.id, (q) =>
			q<{ result: { owner_class: string | null } }>(
				'select public.foundry_get_app($1) as result',
				[authorAppSlug]
			)
		);
		expect(after.rows[0].result.owner_class).toBeNull();

		// Put it back, so the ordering of the file cannot change what the
		// denial tests below are looking at.
		await enrollStudent(db, {
			as: admin,
			sectionId: section.rows[0].id,
			email: 'author@boscotech.net',
			displayName: 'Ana Reyes',
			active: true
		});
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
				'author@boscotech.net'
			])
		);
		expect(peer.rows).toHaveLength(0);

		// POSITIVE CONTROL: enroll the viewer, and read that back as themselves.
		const section = await db.asUser(admin.id, (q) =>
			q<{ id: string }>(
				`select s.id from public.classroom_sections s
				 join public.classroom_courses c on c.id = s.course_id
				 where c.code = $1`,
				[IDEA_CODE]
			)
		);
		await enrollStudent(db, {
			as: admin,
			sectionId: section.rows[0].id,
			email: 'viewer@boscotech.net',
			displayName: 'Vic Ortega'
		});
		const own = await db.asUser(viewer.id, (q) =>
			q('select student_email from public.classroom_enrollments where student_email = $1', [
				'viewer@boscotech.net'
			])
		);
		expect(own.rows).toHaveLength(1);
	});

	it('cannot see the whole roster of the class it just learned the name of', async () => {
		// The viewer now knows the author is in "Block 3". That must not become
		// a way to enumerate who else is.
		const rows = await db.asUser(viewer.id, (q) =>
			q('select student_email from public.classroom_enrollments')
		);
		// Their own row, and nothing else -- not the author's, not anyone's.
		expect(rows.rows.map((r) => r.student_email)).toEqual(['viewer@boscotech.net']);
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
			db.asUser(viewer.id, (q) => q('select public._foundry_idea_course_code()'))
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
			q<{ result: unknown }>('select public.foundry_get_app($1) as result', [authorAppSlug])
		);
		expect(JSON.stringify(got.rows[0].result)).not.toContain('@boscotech');

		// POSITIVE CONTROL: the fixture really does use those addresses, so the
		// two absences above are not two ways of searching empty payloads.
		expect(author.email).toContain('@boscotech');
	});
});

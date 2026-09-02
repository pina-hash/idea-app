/**
 * 0173 -- the three schema decisions, proved against the real migration chain.
 *
 * WHAT THIS FILE IS FOR, and it is not feature correctness. Three of the four
 * things below are REFUSALS -- a class gate, a publication precondition, and
 * an allowlist -- and a refusal that stops working fails SILENTLY: the surface
 * keeps rendering, the RPC keeps returning `ok`, and the only symptom is that
 * somebody could do something they should not have been able to. That is the
 * case `CLAUDE.md` names as the one automated tests are for.
 *
 * EVERY REFUSAL HERE HAS A POSITIVE CONTROL BESIDE IT. An assertion that a
 * call raises passes just as well when the fixture never set the thing up, so
 * each refusal is paired with the same call made by somebody who IS allowed,
 * and the mutation proof in `tests/foundry-0173-mutation.md` records opening
 * each clause permissively and watching the refusal flip.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';

/**
 * The Foundry chain plus what 0173 reaches for: 0094 for
 * `_notebook_email_for_user` (the uuid/email bridge the trust check crosses),
 * and the classroom files for `classroom_manages_section` and the enrollment
 * rows the section gate reads. 0137 LAST, because it is a sweep over whatever
 * the chain above it created and the grant assertions are only true after it.
 */
const MIGRATIONS = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0069_notebook.sql',
	'0053_app_feedback.sql',
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
	'0141_foundry_app_cap_and_download.sql',
	'0173_foundry_section_gate_description_and_trust.sql',
	'0137_anon_execute_sweep.sql'
] as const;

const OWNER_EMAIL = 'apina@boscotech.edu';
const DESCRIPTION = 'A small browser game about sorting bolts by thread pitch.';

let db: TestDb;
let owner: SeededUser;
let admin: SeededUser;
let teacher: SeededUser;
let otherTeacher: SeededUser;

let seq = 0;
async function student(): Promise<SeededUser> {
	seq += 1;
	return createUser(db, `fdy173-s${seq}@boscotech.net`, `Student ${seq}`);
}

/** An app with a description, which after 0173 is what a publishable app is. */
async function createApp(as: SeededUser, slug: string, description: string | null = DESCRIPTION) {
	return db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: { app_id: string } }>(
			`select public.foundry_create_app($1, $2, $3, null, $4) as r`,
			[slug, 'Test app', 'Plain HTML, CSS and a bit of JavaScript.', description]
		);
		return rows[0].r.app_id;
	});
}

async function createVersion(as: SeededUser, appId: string) {
	return db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: { version_id: string } }>(
			`select public.foundry_create_version($1::uuid, $2) as r`,
			[appId, `${as.id}/${crypto.randomUUID()}.zip`]
		);
		return rows[0].r.version_id;
	});
}

async function submit(as: SeededUser, versionId: string) {
	return db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: Record<string, unknown> }>(
			`select public.foundry_submit_version($1::uuid) as r`,
			[versionId]
		);
		return rows[0].r;
	});
}

async function versionRow(versionId: string) {
	const { rows } = await db.sql<{
		status: string;
		auto_published_at: string | null;
		reviewed_at: string | null;
	}>(
		`select status, auto_published_at, reviewed_at
		 from public.student_app_versions where id = $1`,
		[versionId]
	);
	return rows[0];
}

async function publishedOf(appId: string) {
	const { rows } = await db.sql<{ published_version_id: string | null }>(
		`select published_version_id from public.student_apps where id = $1`,
		[appId]
	);
	return rows[0].published_version_id;
}

/** A course, a section and an enrollment, written as the connection owner. */
async function seedSection(label: string, teacherEmail: string, studentEmail: string) {
	const { rows: c } = await db.sql<{ id: string }>(
		`insert into public.classroom_courses (code, title)
		 values ($1, $2) on conflict (code) do update set title = excluded.title
		 returning id`,
		[`IDEA${label}`, `Engineering ${label}`]
	);
	const { rows: s } = await db.sql<{ id: string }>(
		`insert into public.classroom_sections (course_id, label, teacher_email)
		 values ($1, $2, $3) returning id`,
		[c[0].id, label, teacherEmail]
	);
	await db.sql(
		`insert into public.classroom_enrollments (section_id, student_email, display_name, active)
		 values ($1, $2, $3, true)`,
		[s[0].id, studentEmail, studentEmail.split('@')[0]]
	);
	return s[0].id;
}

beforeAll(async () => {
	db = await startTestDb(MIGRATIONS);
	owner = await createUser(db, OWNER_EMAIL, 'Site Owner');
	admin = await createUser(db, 'fdy173-admin@boscotech.edu', 'An Admin');
	teacher = await createUser(db, 'fdy173-teach@boscotech.edu', 'A Teacher');
	otherTeacher = await createUser(db, 'fdy173-other@boscotech.edu', 'Other Teacher');
	await db.asUser(owner.id, (q) =>
		q(`select public.admin_grant($1, null)`, ['fdy173-admin@boscotech.edu'])
	);
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
// DECISION 01 -- the per-section class gate.
// ===========================================================================

describe('the Foundry closes per section, on the server', () => {
	it('is open for a student whose classes have said nothing', async () => {
		const s = await student();
		await seedSection('301', teacher.email, s.email);
		const r = await db.asUser(s.id, async (q) => {
			const { rows } = await q<{ r: { open: boolean; closed: unknown[] } }>(
				`select public.foundry_section_access() as r`
			);
			return rows[0].r;
		});
		expect(r.open).toBe(true);
		expect(r.closed).toHaveLength(0);
	});

	it('closes for a student when the teacher of that section closes it', async () => {
		const s = await student();
		const sectionId = await seedSection('302', teacher.email, s.email);

		// POSITIVE CONTROL, taken FIRST: the same student, same section, open.
		const before = await db.asUser(s.id, async (q) => {
			const { rows } = await q<{ r: { open: boolean } }>(
				`select public.foundry_section_access() as r`
			);
			return rows[0].r;
		});
		expect(before.open).toBe(true);

		await db.asUser(teacher.id, (q) =>
			q(`select public.foundry_set_section_open($1::uuid, false, $2)`, [
				sectionId,
				'We are on the CAD assessment today.'
			])
		);

		const after = await db.asUser(s.id, async (q) => {
			const { rows } = await q<{
				r: { open: boolean; closed: { course_title: string; label: string; note: string }[] };
			}>(`select public.foundry_section_access() as r`);
			return rows[0].r;
		});
		expect(after.open).toBe(false);
		expect(after.closed).toHaveLength(1);
		// The refusal names the class so a student knows who to ask.
		expect(after.closed[0].course_title).toBe('Engineering 302');
		expect(after.closed[0].label).toBe('302');
		expect(after.closed[0].note).toBe('We are on the CAD assessment today.');

		// And it re-opens, which is the half a one-way door would fail.
		await db.asUser(teacher.id, (q) =>
			q(`select public.foundry_set_section_open($1::uuid, true, null)`, [sectionId])
		);
		const reopened = await db.asUser(s.id, async (q) => {
			const { rows } = await q<{ r: { open: boolean } }>(
				`select public.foundry_section_access() as r`
			);
			return rows[0].r;
		});
		expect(reopened.open).toBe(true);
	});

	it('never carries the teacher address into the payload', async () => {
		const s = await student();
		const sectionId = await seedSection('303', teacher.email, s.email);
		await db.asUser(teacher.id, (q) =>
			q(`select public.foundry_set_section_open($1::uuid, false, null)`, [sectionId])
		);
		const r = await db.asUser(s.id, async (q) => {
			const { rows } = await q<{ r: unknown }>(`select public.foundry_section_access() as r`);
			return JSON.stringify(rows[0].r);
		});
		expect(r).not.toContain('@');
	});

	it('never locks an administrator out', async () => {
		const sectionId = await seedSection('304', teacher.email, admin.email);
		await db.asUser(teacher.id, (q) =>
			q(`select public.foundry_set_section_open($1::uuid, false, null)`, [sectionId])
		);
		const r = await db.asUser(admin.id, async (q) => {
			const { rows } = await q<{ r: { open: boolean } }>(
				`select public.foundry_section_access() as r`
			);
			return rows[0].r;
		});
		expect(r.open).toBe(true);
	});

	it('refuses the toggle to a teacher who does not manage the section', async () => {
		const s = await student();
		const sectionId = await seedSection('305', teacher.email, s.email);

		await expect(
			db.asUser(otherTeacher.id, (q) =>
				q(`select public.foundry_set_section_open($1::uuid, false, null)`, [sectionId])
			)
		).rejects.toThrow(/does not exist/);

		// POSITIVE CONTROL: the manager of that same section, same call, allowed.
		await expect(
			db.asUser(teacher.id, (q) =>
				q(`select public.foundry_set_section_open($1::uuid, false, null)`, [sectionId])
			)
		).resolves.toBeDefined();
	});

	it('lists a manager their own sections and nobody else theirs', async () => {
		const mine = await db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ section_id: string }>(
				`select section_id from public.foundry_manageable_sections()`
			);
			return rows;
		});
		const theirs = await db.asUser(otherTeacher.id, async (q) => {
			const { rows } = await q<{ section_id: string }>(
				`select section_id from public.foundry_manageable_sections()`
			);
			return rows;
		});
		// POSITIVE CONTROL and the exclusion in one reading: the teacher of
		// record has rows, the teacher of nothing has none.
		expect(mine.length).toBeGreaterThan(0);
		expect(theirs).toHaveLength(0);
	});
});

// ===========================================================================
// DECISION 05 -- a description is required to publish.
// ===========================================================================

describe('publishing requires a description', () => {
	it('refuses the submit, naming the field', async () => {
		const s = await student();
		const appId = await createApp(s, 'no-desc-app', null);
		const versionId = await createVersion(s, appId);
		await expect(submit(s, versionId)).rejects.toThrow(/description/i);
	});

	it('accepts it the moment there is one, same app, same version', async () => {
		const s = await student();
		const appId = await createApp(s, 'gains-a-desc', null);
		const versionId = await createVersion(s, appId);
		await expect(submit(s, versionId)).rejects.toThrow(/description/i);

		// POSITIVE CONTROL: the only thing that changes is the description.
		await db.asUser(s.id, (q) =>
			q(`select public.foundry_update_app_metadata($1::uuid, 'description', $2)`, [
				appId,
				DESCRIPTION
			])
		);
		const r = (await submit(s, versionId)) as { status: string };
		expect(r.status).toBe('submitted');
	});

	it('refuses the publication itself, not only the submit', async () => {
		// Straight at the trigger, past every RPC: a raw update as the
		// connection owner is the shape an RPC written later would have, and
		// it is what says the SCHEMA is the gate rather than one function.
		const s = await student();
		const appId = await createApp(s, 'trigger-gate', null);
		const versionId = await createVersion(s, appId);
		await db.sql(`update public.student_app_versions set status = 'approved' where id = $1`, [
			versionId
		]);
		await expect(
			db.sql(`update public.student_apps set published_version_id = $1 where id = $2`, [
				versionId,
				appId
			])
		).rejects.toThrow(/description/i);

		// POSITIVE CONTROL: description written, identical statement, allowed.
		await db.sql(`update public.student_apps set description = $1 where id = $2`, [
			DESCRIPTION,
			appId
		]);
		await db.sql(`update public.student_apps set published_version_id = $1 where id = $2`, [
			versionId,
			appId
		]);
		expect(await publishedOf(appId)).toBe(versionId);
	});

	/**
	 * THE NARROWING'S OWN OBLIGATION. An app published BEFORE 0173 with no
	 * description keeps serving and stays editable; what it cannot do is
	 * publish something new. A gate that fired on every write of the row is
	 * the silent narrowing this repository has been bitten by, so it is
	 * asserted in both directions here rather than assumed from the `is
	 * distinct from` in the trigger.
	 */
	it('leaves an app already published without one alone', async () => {
		const s = await student();
		const appId = await createApp(s, 'legacy-published', DESCRIPTION);
		const v1 = await createVersion(s, appId);
		await submit(s, v1);
		await db.asUser(admin.id, (q) =>
			q(`select public.foundry_review_version($1::uuid, 'approve')`, [v1])
		);
		expect(await publishedOf(appId)).toBe(v1);

		// Now make it look like a pre-0173 row: live, and no description.
		await db.sql(`update public.student_apps set description = null where id = $1`, [appId]);

		// It keeps serving...
		expect(await publishedOf(appId)).toBe(v1);
		// ...and an unrelated write of the row still succeeds.
		await db.sql(`update public.student_apps set tagline = 'Still editable' where id = $1`, [
			appId
		]);
		// ...and re-writing the SAME published id is not a publication.
		await db.sql(`update public.student_apps set published_version_id = $1 where id = $2`, [
			v1,
			appId
		]);

		// But a NEW publication is refused until somebody writes one.
		const v2 = await createVersion(s, appId);
		await db.sql(`update public.student_app_versions set status = 'approved' where id = $1`, [
			v2
		]);
		await expect(
			db.sql(`update public.student_apps set published_version_id = $1 where id = $2`, [
				v2,
				appId
			])
		).rejects.toThrow(/description/i);
	});
});

// ===========================================================================
// DECISION 06 -- trusted publishers.
// ===========================================================================

describe('a trusted publisher goes live without review', () => {
	it('queues like everybody else until they are trusted', async () => {
		const s = await student();
		const appId = await createApp(s, 'untrusted-app');
		const versionId = await createVersion(s, appId);
		const r = (await submit(s, versionId)) as { status: string; auto_published: boolean };
		expect(r.status).toBe('submitted');
		expect(r.auto_published).toBe(false);
		expect(await publishedOf(appId)).toBeNull();
	});

	it('publishes in the same statement once they are, and says nobody looked', async () => {
		const s = await student();
		await db.asUser(admin.id, (q) =>
			q(`select public.foundry_trusted_grant($1, $2)`, [s.email, 'Consistently solid work.'])
		);
		const appId = await createApp(s, 'trusted-app');
		const versionId = await createVersion(s, appId);

		const r = (await submit(s, versionId)) as { status: string; auto_published: boolean };
		expect(r.status).toBe('approved');
		expect(r.auto_published).toBe(true);
		expect(await publishedOf(appId)).toBe(versionId);

		const row = await versionRow(versionId);
		expect(row.auto_published_at).not.toBeNull();
		// THE HALF THAT MATTERS: live, and no reviewer's name on it.
		expect(row.reviewed_at).toBeNull();
	});

	it('still refuses a trusted author with no description', async () => {
		const s = await student();
		await db.asUser(admin.id, (q) => q(`select public.foundry_trusted_grant($1, null)`, [s.email]));
		const appId = await createApp(s, 'trusted-no-desc', null);
		const versionId = await createVersion(s, appId);
		await expect(submit(s, versionId)).rejects.toThrow(/description/i);
	});

	it('shows the queue that it is live and unreviewed', async () => {
		const s = await student();
		await db.asUser(admin.id, (q) => q(`select public.foundry_trusted_grant($1, null)`, [s.email]));
		const appId = await createApp(s, 'queue-visible');
		const versionId = await createVersion(s, appId);
		await submit(s, versionId);

		const asAdmin = await db.asUser(admin.id, async (q) => {
			const { rows } = await q<{ live_unreviewed_version_id: string | null }>(
				`select live_unreviewed_version_id from public.foundry_list_apps(null, true, true)
				 where id = $1`,
				[appId]
			);
			return rows[0];
		});
		expect(asAdmin.live_unreviewed_version_id).toBe(versionId);

		const asOwner = await db.asUser(s.id, async (q) => {
			const { rows } = await q<{ live_unreviewed_version_id: string | null }>(
				`select live_unreviewed_version_id from public.foundry_list_apps() where id = $1`,
				[appId]
			);
			return rows[0];
		});
		expect(asOwner.live_unreviewed_version_id).toBe(versionId);

		// EXCLUSION, with the positive control two reads up: another student
		// sees the app (it is published) and NOT that anything is pending.
		const stranger = await student();
		const asStranger = await db.asUser(stranger.id, async (q) => {
			const { rows } = await q<{ live_unreviewed_version_id: string | null }>(
				`select live_unreviewed_version_id from public.foundry_list_apps() where id = $1`,
				[appId]
			);
			return rows;
		});
		expect(asStranger).toHaveLength(1);
		expect(asStranger[0].live_unreviewed_version_id).toBeNull();
	});

	it('lets an admin sign it off after the fact without republishing', async () => {
		const s = await student();
		await db.asUser(admin.id, (q) => q(`select public.foundry_trusted_grant($1, null)`, [s.email]));
		const appId = await createApp(s, 'signed-off-later');
		const versionId = await createVersion(s, appId);
		await submit(s, versionId);

		const r = await db.asUser(admin.id, async (q) => {
			const { rows } = await q<{ r: { after_the_fact: boolean; status: string } }>(
				`select public.foundry_review_version($1::uuid, 'approve', 'Looks good.') as r`,
				[versionId]
			);
			return rows[0].r;
		});
		expect(r.after_the_fact).toBe(true);
		expect(r.status).toBe('approved');
		expect(await publishedOf(appId)).toBe(versionId);

		const row = await versionRow(versionId);
		expect(row.reviewed_at).not.toBeNull();
		// It is no longer in the queue's live-unreviewed list.
		const still = await db.asUser(admin.id, async (q) => {
			const { rows } = await q<{ live_unreviewed_version_id: string | null }>(
				`select live_unreviewed_version_id from public.foundry_list_apps(null, true, true)
				 where id = $1`,
				[appId]
			);
			return rows[0].live_unreviewed_version_id;
		});
		expect(still).toBeNull();
	});

	/**
	 * THE ORDER OF THE TWO WRITES IS WHAT THIS PROVES.
	 * `_foundry_version_status_check` refuses `approved -> rejected` while
	 * that version is what the app publishes, so a rejection written the
	 * obvious way round raises -- and it raises ONLY for a trusted author,
	 * which is the path nobody exercises by hand.
	 */
	it('takes a live build down when it is rejected after the fact', async () => {
		const s = await student();
		await db.asUser(admin.id, (q) => q(`select public.foundry_trusted_grant($1, null)`, [s.email]));
		const appId = await createApp(s, 'rejected-later');
		const versionId = await createVersion(s, appId);
		await submit(s, versionId);
		expect(await publishedOf(appId)).toBe(versionId);

		await db.asUser(admin.id, (q) =>
			q(`select public.foundry_review_version($1::uuid, 'reject', $2, 'content')`, [
				versionId,
				'The third level has language that cannot stay on the site.'
			])
		);

		expect(await publishedOf(appId)).toBeNull();
		expect((await versionRow(versionId)).status).toBe('rejected');
	});

	it('rolls back to the previous approved build rather than blanking the app', async () => {
		const s = await student();
		const appId = await createApp(s, 'rolls-back');
		const v1 = await createVersion(s, appId);
		await submit(s, v1);
		await db.asUser(admin.id, (q) =>
			q(`select public.foundry_review_version($1::uuid, 'approve')`, [v1])
		);
		expect(await publishedOf(appId)).toBe(v1);

		await db.asUser(admin.id, (q) => q(`select public.foundry_trusted_grant($1, null)`, [s.email]));
		const v2 = await createVersion(s, appId);
		await submit(s, v2);
		expect(await publishedOf(appId)).toBe(v2);

		await db.asUser(admin.id, (q) =>
			q(`select public.foundry_review_version($1::uuid, 'reject', $2, 'broken')`, [
				v2,
				'It does not start on a phone.'
			])
		);
		// The working build is back on the gallery, not a blank slot.
		expect(await publishedOf(appId)).toBe(v1);
	});

	it('leaves what is already live alone when trust is revoked', async () => {
		const s = await student();
		await db.asUser(admin.id, (q) => q(`select public.foundry_trusted_grant($1, null)`, [s.email]));
		const appId = await createApp(s, 'revoked-after');
		const v1 = await createVersion(s, appId);
		await submit(s, v1);
		expect(await publishedOf(appId)).toBe(v1);

		await db.asUser(admin.id, (q) => q(`select public.foundry_trusted_revoke($1)`, [s.email]));
		expect(await publishedOf(appId)).toBe(v1);

		// And the NEXT one queues like anybody else's.
		const v2 = await createVersion(s, appId);
		const r = (await submit(s, v2)) as { status: string };
		expect(r.status).toBe('submitted');
	});
});

describe('the trusted roster is an admin instrument', () => {
	it('refuses a grant to a student and to a plain teacher', async () => {
		const s = await student();
		await expect(
			db.asUser(s.id, (q) => q(`select public.foundry_trusted_grant($1, null)`, [s.email]))
		).rejects.toThrow(/administrator/i);
		await expect(
			db.asUser(teacher.id, (q) => q(`select public.foundry_trusted_grant($1, null)`, [s.email]))
		).rejects.toThrow(/administrator/i);

		// POSITIVE CONTROL: the identical call, made by an admin.
		await expect(
			db.asUser(admin.id, (q) => q(`select public.foundry_trusted_grant($1, null)`, [s.email]))
		).resolves.toBeDefined();
	});

	it('refuses an address outside Bosco Tech', async () => {
		await expect(
			db.asUser(admin.id, (q) =>
				q(`select public.foundry_trusted_grant($1, null)`, ['someone@gmail.com'])
			)
		).rejects.toThrow(/Bosco Tech/i);
	});

	it('answers the roster to an admin and nothing to anybody else', async () => {
		await db.asUser(admin.id, (q) =>
			q(`select public.foundry_trusted_grant($1, null)`, ['roster-probe@boscotech.net'])
		);
		const asAdmin = await db.asUser(admin.id, async (q) => {
			const { rows } = await q(`select email from public.foundry_trusted_roster()`);
			return rows;
		});
		const s = await student();
		const asStudent = await db.asUser(s.id, async (q) => {
			const { rows } = await q(`select email from public.foundry_trusted_roster()`);
			return rows;
		});
		// The exclusion and its positive control in one reading.
		expect(asAdmin.length).toBeGreaterThan(0);
		expect(asStudent).toHaveLength(0);
	});

	it('keeps the table itself shut to every client role', async () => {
		const s = await student();
		await expect(
			db.asUser(s.id, (q) => q(`select * from public.foundry_trusted_publishers`))
		).rejects.toThrow();
		await expect(
			db.asUser(admin.id, (q) => q(`select * from public.foundry_trusted_publishers`))
		).rejects.toThrow();
	});
});

/**
 * ASSERT THE ACL, NOT THE MIGRATION'S OWN VERDICT. A hosted Supabase project
 * hands every new function a direct `anon` grant at creation time, so
 * `revoke ... from public` alone does nothing. `tests/db/supabase-stub.sql`
 * carries those default privileges, which is what makes this readable here.
 */
describe('0173 revokes for itself', () => {
	const AUTHENTICATED = [
		'public.foundry_section_access()',
		'public.foundry_set_section_open(uuid, boolean, text)',
		'public.foundry_manageable_sections()',
		'public.foundry_is_trusted()',
		'public._foundry_is_trusted_email(text)',
		'public.foundry_trusted_grant(text, text)',
		'public.foundry_trusted_revoke(text)',
		'public.foundry_trusted_roster()',
		'public.foundry_list_apps(uuid, boolean, boolean)'
	];

	it('grants none of its functions to anon', async () => {
		const results: Record<string, boolean> = {};
		for (const sig of AUTHENTICATED) {
			const { rows } = await db.sql<{ ok: boolean }>(
				`select has_function_privilege('anon', $1, 'EXECUTE') as ok`,
				[sig]
			);
			results[sig] = rows[0].ok;
		}
		// Named rather than counted, so a function added to the list without a
		// revoke reddens with its own name in the message.
		expect(results).toEqual(Object.fromEntries(AUTHENTICATED.map((s) => [s, false])));
	});

	it('grants every one of them to authenticated, which is the positive control', async () => {
		const results: Record<string, boolean> = {};
		for (const sig of AUTHENTICATED) {
			const { rows } = await db.sql<{ ok: boolean }>(
				`select has_function_privilege('authenticated', $1, 'EXECUTE') as ok`,
				[sig]
			);
			results[sig] = rows[0].ok;
		}
		expect(results).toEqual(Object.fromEntries(AUTHENTICATED.map((s) => [s, true])));
	});

	it('leaves exactly one foundry_list_apps behind', async () => {
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_proc p
			 join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'foundry_list_apps'`
		);
		expect(rows[0].n).toBe('1');
	});
});

// tests/foundry-delete.test.ts
//
// IDEA FOUNDRY DELETION (0136), the boundaries whose regression would be
// SILENT.
//
// Deletion is the one Foundry operation with no undo and no visible failure
// mode: a delete that removes too much removes it permanently, and a delete
// that removes the wrong person's work is invisible to the person it happened
// to until they go looking for something that is not there any more. So this
// file asserts WHO MAY DELETE WHAT, and it asserts the DELETE PLAN -- the
// paths the RPC hands back -- because those paths are the only record of which
// objects to remove and they exist for one statement.
//
// EVERY REFUSAL IS PAIRED WITH A POSITIVE CONTROL, and every refusal's actual
// message is asserted rather than merely its existence: a function that
// refused for the wrong reason (a missing grant, a typo'd column, a null) reads
// exactly like one that refused for the right one.
//
// WHAT IS NOT HERE AND CANNOT BE. The Storage half. `student_app_files` rows
// are seeded directly as the connection owner, so the CASCADE is real; the
// bytes those rows describe are not, because this fixture has no Storage
// service. What the object sweep does with the plan is verified in a browser
// against a real project, and the plan itself -- which is the part a wrong
// answer would silently lose -- is verified here.

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';

/** The Foundry chain, exactly 0130's plus this file. See foundry-policies. */
const MIGRATIONS = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0053_app_feedback.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0090_classroom_instructor_materials.sql',
	'0101_classroom_decks.sql',
	'0130_foundry.sql',
	'0131_foundry_service_role_writes.sql',
	'0136_foundry_delete.sql'
] as const;

/** The pinned owner constant from 0067. is_admin() self-heals to it. */
const OWNER_EMAIL = 'apina@boscotech.edu';

let db: TestDb;
let owner: SeededUser;
let admin: SeededUser;

/** A FRESH author per test: the five-app cap is real and is per person. */
let authorSeq = 0;
async function author(): Promise<SeededUser> {
	authorSeq += 1;
	return createUser(db, `del-author${authorSeq}@boscotech.net`, `Author ${authorSeq}`);
}

async function createApp(as: SeededUser, slug: string, title = 'Test app'): Promise<string> {
	return db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: { app_id: string } }>(
			`select public.foundry_create_app($1, $2, $3) as r`,
			[slug, title, 'Built with plain HTML, CSS and a bit of JavaScript. No framework.']
		);
		return rows[0].r.app_id;
	});
}

async function createVersion(as: SeededUser, appId: string, zip: string): Promise<string> {
	return db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: { version_id: string } }>(
			`select public.foundry_create_version($1::uuid, $2) as r`,
			[appId, zip]
		);
		return rows[0].r.version_id;
	});
}

/**
 * Two file rows for a version, written as the CONNECTION OWNER.
 *
 * That is the honest stand-in for the extraction function, which is the only
 * writer this table has: it holds `service_role`, which bypasses RLS, and no
 * client role has an insert grant at all. Writing them here is what makes the
 * cascade assertions below mean something.
 */
async function seedFiles(appId: string, versionId: string): Promise<void> {
	for (const path of ['index.html', 'assets/app.js']) {
		await db.sql(
			`insert into public.student_app_files (version_id, path, content_type, byte_size)
			 values ($1, $2, 'text/html', 100)`,
			[versionId, path]
		);
	}
	// Referenced so a reader can see the object layout this proves: the bytes
	// for these rows sit at `<app id>/<version id>/<path>` in foundry-bundles.
	expect(appId).toMatch(/^[0-9a-f-]{36}$/);
}

/** Approve a version and publish it, through the real RPCs. */
async function publish(student: SeededUser, versionId: string): Promise<void> {
	await db.asUser(student.id, (q) =>
		q(`select public.foundry_submit_version($1::uuid)`, [versionId])
	);
	await db.asUser(admin.id, (q) =>
		q(`select public.foundry_review_version($1::uuid, 'approve')`, [versionId])
	);
}

/** The message Postgres actually produced, so a report can quote it. */
async function refusal(fn: () => Promise<unknown>): Promise<string> {
	try {
		await fn();
	} catch (err) {
		return (err as Error).message;
	}
	throw new Error('expected a refusal, but the call succeeded');
}

type DeletePlan = {
	ok: boolean;
	app_id: string;
	slug: string;
	title: string;
	version_ids: string[];
	zip_paths: string[];
	cover_path: string | null;
	versions_deleted: number;
	files_deleted: number;
};

async function deleteApp(as: SeededUser, appId: string): Promise<DeletePlan> {
	return db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: DeletePlan }>(
			`select public.foundry_delete_app($1::uuid) as r`,
			[appId]
		);
		return rows[0].r;
	});
}

async function deleteVersion(as: SeededUser, versionId: string) {
	return db.asUser(as.id, async (q) => {
		const { rows } = await q<{
			r: { ok: boolean; app_id: string; version_id: string; ordinal: number; zip_path: string; files_deleted: number };
		}>(`select public.foundry_delete_version($1::uuid) as r`, [versionId]);
		return rows[0].r;
	});
}

/** What is actually left, read as the connection owner so RLS cannot hide it. */
async function remaining(appId: string) {
	const apps = await db.sql<{ n: string }>(
		`select count(*)::text as n from public.student_apps where id = $1`,
		[appId]
	);
	const versions = await db.sql<{ id: string }>(
		`select id from public.student_app_versions where app_id = $1 order by ordinal`,
		[appId]
	);
	const files = await db.sql<{ version_id: string; path: string }>(
		`select f.version_id, f.path from public.student_app_files f
		 join public.student_app_versions v on v.id = f.version_id
		 where v.app_id = $1 order by f.path`,
		[appId]
	);
	return {
		apps: Number(apps.rows[0].n),
		versionIds: versions.rows.map((r) => r.id),
		filePaths: files.rows.map((r) => `${r.version_id}/${r.path}`)
	};
}

beforeAll(async () => {
	db = await startTestDb(MIGRATIONS);
	owner = await createUser(db, OWNER_EMAIL, 'Owner Account');
	admin = await createUser(db, 'del-reviewer@boscotech.edu', 'Reviewing Admin');
	await db.asUser(owner.id, (q) => q(`select public.admin_grant($1, null)`, [admin.email]));
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

describe('0136 // an app belongs to its owner', () => {
	it("refuses another student deleting an app, and lets the owner delete it", async () => {
		const student = await author();
		const other = await author();
		const appId = await createApp(student, 'del-mine');
		const v1 = await createVersion(student, appId, `${student.id}/v1.zip`);
		await seedFiles(appId, v1);

		const message = await refusal(() => deleteApp(other, appId));
		// NOT-FOUND AND NOT-YOURS ANSWER IDENTICALLY, so the message must not
		// say "not yours" -- that is itself a disclosure that the id is real.
		expect(message).toBe('That app does not exist.');

		// And nothing moved: the refusal is a refusal, not a partial delete.
		const before = await remaining(appId);
		expect(before).toMatchObject({ apps: 1, versionIds: [v1] });
		expect(before.filePaths).toHaveLength(2);

		// POSITIVE CONTROL: the owner's identical call lands.
		const plan = await deleteApp(student, appId);
		expect(plan.ok).toBe(true);
		expect(plan.slug).toBe('del-mine');
		expect(plan.version_ids).toEqual([v1]);
		expect(plan.files_deleted).toBe(2);

		const after = await remaining(appId);
		expect(after).toEqual({ apps: 0, versionIds: [], filePaths: [] });
	});

	it('lets an ADMIN delete an app they do not own', async () => {
		const student = await author();
		const appId = await createApp(student, 'del-admin-reach');
		const v1 = await createVersion(student, appId, `${student.id}/v1.zip`);
		await seedFiles(appId, v1);

		const plan = await deleteApp(admin, appId);
		expect(plan).toMatchObject({ ok: true, slug: 'del-admin-reach', files_deleted: 2 });
		expect(await remaining(appId)).toEqual({ apps: 0, versionIds: [], filePaths: [] });
	});

	it("refuses a plain @boscotech.edu teacher with no admin grant", async () => {
		// The 0067 case that matters: the email domain hands out `teacher` for
		// free, and `teacher` on its own grants nothing privileged.
		const student = await author();
		const teacher = await createUser(db, 'del-teaches@boscotech.edu', 'Teacher No Grant');
		const role = await db.sql<{ role: string }>(`select role from public.profiles where id = $1`, [
			teacher.id
		]);
		expect(role.rows[0].role).toBe('teacher');

		const appId = await createApp(student, 'del-teacher-probe');
		const message = await refusal(() => deleteApp(teacher, appId));
		expect(message).toBe('That app does not exist.');
		expect((await remaining(appId)).apps).toBe(1);
	});
});

describe('0136 // the published version', () => {
	it('refuses the owner deleting the version their app publishes', async () => {
		const student = await author();
		const appId = await createApp(student, 'del-published');
		const live = await createVersion(student, appId, `${student.id}/live.zip`);
		await seedFiles(appId, live);
		await publish(student, live);

		const message = await refusal(() => deleteVersion(student, live));
		expect(message).toBe(
			'That is the build your app publishes. Make another approved version live first, or delete the whole app.'
		);
		expect((await remaining(appId)).versionIds).toEqual([live]);

		// AN ADMIN IS REFUSED TOO. The rule is about the app being left
		// pointing at nothing, not about who is asking.
		const asAdmin = await refusal(() => deleteVersion(admin, live));
		expect(asAdmin).toContain('the build your app publishes');
	});

	it('lets the owner delete the WHOLE app, published version and all', async () => {
		const student = await author();
		const appId = await createApp(student, 'del-published-whole');
		const live = await createVersion(student, appId, `${student.id}/live.zip`);
		await seedFiles(appId, live);
		await publish(student, live);

		// The published pointer is set: this is the case the composite foreign
		// key would refuse if the function did not clear it first.
		const pointed = await db.sql<{ published_version_id: string }>(
			`select published_version_id from public.student_apps where id = $1`,
			[appId]
		);
		expect(pointed.rows[0].published_version_id).toBe(live);

		const plan = await deleteApp(student, appId);
		expect(plan).toMatchObject({ ok: true, versions_deleted: 1, files_deleted: 2 });
		expect(plan.version_ids).toEqual([live]);
		expect(await remaining(appId)).toEqual({ apps: 0, versionIds: [], filePaths: [] });
	});

	it('lets the owner delete a version that is NOT published, leaving the rest alone', async () => {
		const student = await author();
		const appId = await createApp(student, 'del-one-version');
		const live = await createVersion(student, appId, `${student.id}/live.zip`);
		await seedFiles(appId, live);
		await publish(student, live);

		const junk = await createVersion(student, appId, `${student.id}/junk.zip`);
		await seedFiles(appId, junk);

		const result = await deleteVersion(student, junk);
		expect(result).toMatchObject({
			ok: true,
			app_id: appId,
			version_id: junk,
			ordinal: 2,
			zip_path: `${student.id}/junk.zip`,
			files_deleted: 2
		});

		// POSITIVE CONTROL against the exclusion: the app and the live version
		// and ITS files are all still there. An assertion that something is
		// gone is worth nothing without one that the rest stayed.
		const after = await remaining(appId);
		expect(after.apps).toBe(1);
		expect(after.versionIds).toEqual([live]);
		expect(after.filePaths.map((p) => p.split('/').slice(1).join('/'))).toEqual([
			'assets/app.js',
			'index.html'
		]);
	});

	it('refuses another student deleting a version of an app that is not theirs', async () => {
		const student = await author();
		const other = await author();
		const appId = await createApp(student, 'del-version-reach');
		const v1 = await createVersion(student, appId, `${student.id}/v1.zip`);

		const message = await refusal(() => deleteVersion(other, v1));
		expect(message).toBe('That version does not exist.');
		expect((await remaining(appId)).versionIds).toEqual([v1]);

		// POSITIVE CONTROL: the owner's identical call lands.
		const done = await deleteVersion(student, v1);
		expect(done.ok).toBe(true);
		expect((await remaining(appId)).versionIds).toEqual([]);
	});
});

describe('0136 // a hidden app is staff business', () => {
	it('refuses the owner and allows the admin', async () => {
		const student = await author();
		const appId = await createApp(student, 'del-hidden');
		const v1 = await createVersion(student, appId, `${student.id}/v1.zip`);
		await db.asUser(admin.id, (q) =>
			q(`select public.foundry_set_app_hidden($1::uuid, true, 'Under discussion.')`, [appId])
		);

		const asOwner = await refusal(() => deleteApp(student, appId));
		expect(asOwner).toBe(
			'That app has been hidden by staff, so it is not yours to delete. Ask an instructor.'
		);
		const asOwnerVersion = await refusal(() => deleteVersion(student, v1));
		expect(asOwnerVersion).toContain('hidden by staff');
		expect((await remaining(appId)).apps).toBe(1);

		// POSITIVE CONTROL: the admin's identical call lands.
		const plan = await deleteApp(admin, appId);
		expect(plan.ok).toBe(true);
		expect((await remaining(appId)).apps).toBe(0);
	});
});

describe('0136 // the delete plan', () => {
	it('reports every version prefix and every zip path, in ordinal order', async () => {
		const student = await author();
		const appId = await createApp(student, 'del-plan');
		const v1 = await createVersion(student, appId, `${student.id}/one.zip`);
		const v2 = await createVersion(student, appId, `${student.id}/two.zip`);
		const v3 = await createVersion(student, appId, `${student.id}/three.zip`);
		await seedFiles(appId, v1);
		await seedFiles(appId, v3);

		const plan = await deleteApp(student, appId);
		expect(plan.version_ids).toEqual([v1, v2, v3]);
		expect(plan.zip_paths).toEqual([
			`${student.id}/one.zip`,
			`${student.id}/two.zip`,
			`${student.id}/three.zip`
		]);
		expect(plan.versions_deleted).toBe(3);
		// v2 was never ingested, so it contributes no file rows and no bundle
		// objects -- but its ZIP is still there and must still be swept.
		expect(plan.files_deleted).toBe(4);
	});

	it('reports an app with no versions at all', async () => {
		const student = await author();
		const appId = await createApp(student, 'del-empty');
		const plan = await deleteApp(student, appId);
		expect(plan).toMatchObject({ ok: true, versions_deleted: 0, files_deleted: 0 });
		expect(plan.version_ids).toEqual([]);
		expect(plan.zip_paths).toEqual([]);
		expect(plan.cover_path).toBeNull();
	});

	it('hands back a cover path only when nothing else points at it', async () => {
		const student = await author();
		const shared = `${student.id}/cover.png`;
		const a = await createApp(student, 'del-cover-a');
		const b = await createApp(student, 'del-cover-b');
		for (const id of [a, b]) {
			await db.asUser(student.id, (q) =>
				q(`select public.foundry_update_app_metadata($1::uuid, 'cover_path', $2)`, [id, shared])
			);
		}

		// B still names it, so deleting A must NOT report it for removal.
		const first = await deleteApp(student, a);
		expect(first.cover_path).toBeNull();

		// Now nothing else does, so it comes back.
		const second = await deleteApp(student, b);
		expect(second.cover_path).toBe(shared);
	});
});

describe('0136 // what remains afterwards', () => {
	/**
	 * A ROW COUNT IS NOT PROOF. These list what is actually left, by id and by
	 * path, across all three Foundry tables and across BOTH apps -- so an
	 * assertion that one app is gone is paired with the other app's every row
	 * still being there, named. A delete that took the neighbour with it would
	 * pass any count-based check that only looked at the app it deleted.
	 */
	it('leaves a neighbouring app byte for byte, and nothing of its own', async () => {
		const student = await author();
		const neighbour = await author();

		const mine = await createApp(student, 'del-remains-mine', 'Mine');
		const m1 = await createVersion(student, mine, `${student.id}/m1.zip`);
		const m2 = await createVersion(student, mine, `${student.id}/m2.zip`);
		await seedFiles(mine, m1);
		await seedFiles(mine, m2);
		await publish(student, m1);

		const theirs = await createApp(neighbour, 'del-remains-theirs', 'Theirs');
		const t1 = await createVersion(neighbour, theirs, `${neighbour.id}/t1.zip`);
		await seedFiles(theirs, t1);
		await publish(neighbour, t1);

		const everything = async () => {
			const apps = await db.sql<{ id: string; slug: string; published_version_id: string | null }>(
				`select id, slug, published_version_id from public.student_apps
				 where slug like 'del-remains-%' order by slug`
			);
			const versions = await db.sql<{ id: string; app_id: string; zip_path: string }>(
				`select v.id, v.app_id, v.zip_path from public.student_app_versions v
				 join public.student_apps a on a.id = v.app_id
				 where a.slug like 'del-remains-%' order by a.slug, v.ordinal`
			);
			const files = await db.sql<{ version_id: string; path: string }>(
				`select f.version_id, f.path from public.student_app_files f
				 join public.student_app_versions v on v.id = f.version_id
				 join public.student_apps a on a.id = v.app_id
				 where a.slug like 'del-remains-%' order by f.path`
			);
			return { apps: apps.rows, versions: versions.rows, files: files.rows };
		};

		const before = await everything();
		expect(before.apps.map((a) => a.slug)).toEqual(['del-remains-mine', 'del-remains-theirs']);
		expect(before.versions).toHaveLength(3);
		expect(before.files).toHaveLength(6);

		const plan = await deleteApp(student, mine);
		expect(plan.version_ids).toEqual([m1, m2]);

		const after = await everything();

		// NAMED, not counted: exactly the neighbour's app, its one version and
		// its two files, and nothing else at all.
		expect(after.apps).toEqual([
			{ id: theirs, slug: 'del-remains-theirs', published_version_id: t1 }
		]);
		expect(after.versions).toEqual([
			{ id: t1, app_id: theirs, zip_path: `${neighbour.id}/t1.zip` }
		]);
		expect(after.files).toEqual([
			{ version_id: t1, path: 'assets/app.js' },
			{ version_id: t1, path: 'index.html' }
		]);
	});

	it('leaves the app and every other version when one version goes', async () => {
		const student = await author();
		const appId = await createApp(student, 'del-remains-one');
		const keep1 = await createVersion(student, appId, `${student.id}/k1.zip`);
		const drop = await createVersion(student, appId, `${student.id}/drop.zip`);
		const keep2 = await createVersion(student, appId, `${student.id}/k2.zip`);
		for (const v of [keep1, drop, keep2]) await seedFiles(appId, v);
		await publish(student, keep1);

		await deleteVersion(student, drop);

		const versions = await db.sql<{ id: string; ordinal: number; zip_path: string }>(
			`select id, ordinal, zip_path from public.student_app_versions
			 where app_id = $1 order by ordinal`,
			[appId]
		);
		expect(versions.rows).toEqual([
			{ id: keep1, ordinal: 1, zip_path: `${student.id}/k1.zip` },
			{ id: keep2, ordinal: 3, zip_path: `${student.id}/k2.zip` }
		]);

		const files = await db.sql<{ version_id: string; path: string }>(
			`select f.version_id, f.path from public.student_app_files f
			 join public.student_app_versions v on v.id = f.version_id
			 where v.app_id = $1 order by v.ordinal, f.path`,
			[appId]
		);
		expect(files.rows).toEqual([
			{ version_id: keep1, path: 'assets/app.js' },
			{ version_id: keep1, path: 'index.html' },
			{ version_id: keep2, path: 'assets/app.js' },
			{ version_id: keep2, path: 'index.html' }
		]);

		// The app is untouched and still publishes what it published.
		const app = await db.sql<{ slug: string; published_version_id: string }>(
			`select slug, published_version_id from public.student_apps where id = $1`,
			[appId]
		);
		expect(app.rows).toEqual([{ slug: 'del-remains-one', published_version_id: keep1 }]);
	});
});

describe('0136 // the grants and the signature', () => {
	it('is granted to authenticated and to nobody else, with exactly one arity each', async () => {
		const { rows } = await db.sql<{
			proname: string;
			n: string;
			secdef: boolean;
			auth: boolean;
			anon: boolean;
			pub: boolean;
		}>(
			`select p.proname,
			        count(*) over (partition by p.proname)::text as n,
			        p.prosecdef as secdef,
			        has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth,
			        has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
			        has_function_privilege('public', p.oid, 'EXECUTE') as pub
			 from pg_proc p
			 join pg_namespace ns on ns.oid = p.pronamespace
			 where ns.nspname = 'public'
			   and p.proname in ('foundry_delete_app', 'foundry_delete_version')
			 order by p.proname`
		);

		// Assert the CASE COUNT, so a sweep that found nothing cannot pass.
		expect(rows).toHaveLength(2);
		for (const r of rows) {
			expect({ name: r.proname, n: r.n }).toEqual({ name: r.proname, n: '1' });
			expect(r.secdef).toBe(true);
			expect(r.auth).toBe(true);
			expect(r.anon).toBe(false);
			expect(r.pub).toBe(false);
		}
	});

	it('refuses a signed-out caller', async () => {
		const student = await author();
		const appId = await createApp(student, 'del-anon');
		const message = await refusal(() =>
			db.asAnon((q) => q(`select public.foundry_delete_app($1::uuid)`, [appId]))
		);
		// The GRANT is what refuses first, which is the stronger refusal: `anon`
		// cannot reach the function body at all.
		expect(message).toMatch(/permission denied for function foundry_delete_app/);
		expect((await remaining(appId)).apps).toBe(1);
	});
});

// tests/foundry-policies.test.ts
//
// IDEA FOUNDRY (0130), the guarantees whose regression would be SILENT.
//
// This is deliberately not a feature-correctness suite. What is asserted here
// is the set of boundaries that fail INVISIBLY if they break: a non-owner
// writing somebody else's work, a non-admin reviewing, two submissions landing
// in one queue slot, an app publishing a build nobody approved, and a client
// reaching into the bundle bucket. Everything else about Foundry fails the
// first time a person looks at it and belongs in a harness.
//
// EVERY DENIAL IS PAIRED WITH A POSITIVE CONTROL, because a scan that comes
// back clean because it was pointed at the wrong thing reads exactly like a
// scan that came back clean. Each `expect(...).rejects` below has a sibling
// asserting the SAME call from the permitted caller lands.
//
// THE STORAGE CHECK NEEDS ONE PIECE OF SETUP, and it is stated rather than
// hidden: tests/db/supabase-stub.sql creates storage.objects without the table
// GRANTS a real Supabase project hands `authenticated`. Without them the
// bundles-bucket write would be refused for "permission denied for table
// objects" -- a true refusal that proves nothing about the policy. So the
// grants are added here to match production, and the uploads-bucket write is
// the positive control that says the grant really is in place.

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';

/**
 * The Foundry chain. 0130 reuses _classroom_deck_path_ok from 0101 rather than
 * cloning it (see that file's header), which is what pulls the classroom
 * migrations in: 0101 itself recreates classroom_delete_item and
 * classroom_duplicate_item, so it needs the canonical-items chain under it.
 */
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
	'0131_foundry_service_role_writes.sql'
] as const;

/** The pinned owner constant from 0067. is_admin() self-heals to it. */
const OWNER_EMAIL = 'apina@boscotech.edu';

let db: TestDb;
let owner: SeededUser;
let admin: SeededUser;

/**
 * A FRESH author per test. The five-app cap is real and it is enforced per
 * person, so a shared seed user runs out of slots halfway through the file --
 * which is the cap working, not the suite failing, but it makes every later
 * test depend on how many apps the earlier ones happened to create.
 */
let authorSeq = 0;
async function author(): Promise<SeededUser> {
	authorSeq += 1;
	return createUser(db, `author${authorSeq}@boscotech.net`, `Author ${authorSeq}`);
}

/** Creates an app through the real RPC and returns its id. */
async function createApp(as: SeededUser, slug: string, title = 'Test app'): Promise<string> {
	return db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: { app_id: string } }>(
			`select public.foundry_create_app($1, $2, $3) as r`,
			[slug, title, 'Built with plain HTML, CSS and a bit of JavaScript. No framework.']
		);
		return rows[0].r.app_id;
	});
}

/** Creates a draft version through the real RPC and returns its id. */
async function createVersion(as: SeededUser, appId: string, zip: string): Promise<string> {
	return db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: { version_id: string } }>(
			`select public.foundry_create_version($1::uuid, $2) as r`,
			[appId, zip]
		);
		return rows[0].r.version_id;
	});
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

beforeAll(async () => {
	db = await startTestDb(MIGRATIONS);

	owner = await createUser(db, OWNER_EMAIL, 'Owner Account');
	admin = await createUser(db, 'reviewer@boscotech.edu', 'Reviewing Admin');

	// The owner grants admin, through the real RPC.
	await db.asUser(owner.id, (q) =>
		q(`select public.admin_grant($1, null)`, [admin.email])
	);

	// Match a real Supabase project's storage grants (see the header).
	await db.sql(`grant select, insert, update, delete on storage.objects to authenticated`);
	await db.sql(`grant select, insert, update, delete on storage.objects to service_role`);
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

describe('0130 // ownership', () => {
	it('refuses a non-owner submitting somebody else\'s version, and lets the owner do it', async () => {
		const student = await author();
		const other = await author();
		const appId = await createApp(student, 'ownership-app');
		const versionId = await createVersion(student, appId, 'uploads/ownership/v1.zip');

		const message = await refusal(() =>
			db.asUser(other.id, (q) =>
				q(`select public.foundry_submit_version($1::uuid)`, [versionId])
			)
		);
		expect(message).toContain('does not exist');

		// POSITIVE CONTROL: the same call, from the owner, lands.
		const ok = await db.asUser(student.id, async (q) => {
			const { rows } = await q<{ r: { status: string } }>(
				`select public.foundry_submit_version($1::uuid) as r`,
				[versionId]
			);
			return rows[0].r.status;
		});
		expect(ok).toBe('submitted');
	});

	it('refuses a non-owner creating a version on somebody else\'s app', async () => {
		const student = await author();
		const other = await author();
		const appId = await createApp(student, 'ownership-two');

		const message = await refusal(() =>
			db.asUser(other.id, (q) =>
				q(`select public.foundry_create_version($1::uuid, $2)`, [appId, 'uploads/x/v1.zip'])
			)
		);
		expect(message).toContain('not yours');

		const ordinal = await db.asUser(student.id, async (q) => {
			const { rows } = await q<{ r: { ordinal: number } }>(
				`select public.foundry_create_version($1::uuid, $2) as r`,
				[appId, 'uploads/x/v1.zip']
			);
			return rows[0].r.ordinal;
		});
		expect(ordinal).toBe(1);
	});
});

describe('0130 // review is admin-only', () => {
	it('refuses a non-admin reviewer, and accepts the admin', async () => {
		const student = await author();
		const appId = await createApp(student, 'review-app');
		const versionId = await createVersion(student, appId, 'uploads/review/v1.zip');
		await db.asUser(student.id, (q) =>
			q(`select public.foundry_submit_version($1::uuid)`, [versionId])
		);

		// The author.
		const asAuthor = await refusal(() =>
			db.asUser(student.id, (q) =>
				q(`select public.foundry_review_version($1::uuid, 'approve')`, [versionId])
			)
		);
		expect(asAuthor).toContain('Only an administrator');

		// A DIFFERENT @boscotech.edu account with role 'teacher' and no admin
		// grant -- the 0067 case that matters, since the domain hands out
		// 'teacher' for free.
		const teacher = await createUser(db, 'teaches@boscotech.edu', 'Teacher No Grant');
		const role = await db.sql<{ role: string }>(`select role from public.profiles where id = $1`, [
			teacher.id
		]);
		expect(role.rows[0].role).toBe('teacher');

		const asTeacher = await refusal(() =>
			db.asUser(teacher.id, (q) =>
				q(`select public.foundry_review_version($1::uuid, 'approve')`, [versionId])
			)
		);
		expect(asTeacher).toContain('Only an administrator');

		// POSITIVE CONTROL: the admin's identical call lands and publishes.
		const result = await db.asUser(admin.id, async (q) => {
			const { rows } = await q<{ r: { status: string; published: boolean } }>(
				`select public.foundry_review_version($1::uuid, 'approve') as r`,
				[versionId]
			);
			return rows[0].r;
		});
		expect(result).toMatchObject({ ok: true, status: 'approved', published: true });
	});

	it('refuses a rejection with no note, and accepts one with a note', async () => {
		const student = await author();
		const appId = await createApp(student, 'reject-app');
		const v1 = await createVersion(student, appId, 'uploads/reject/v1.zip');
		await db.asUser(student.id, (q) => q(`select public.foundry_submit_version($1::uuid)`, [v1]));

		const blank = await refusal(() =>
			db.asUser(admin.id, (q) =>
				// Whitespace only: the gate is _foundry_norm, not btrim, so a
				// value of newlines and tabs is empty here too.
				q(`select public.foundry_review_version($1::uuid, 'reject', E'\\n\\t  ')`, [v1])
			)
		);
		expect(blank).toContain('needs a note');

		const status = await db.asUser(admin.id, async (q) => {
			const { rows } = await q<{ r: { status: string } }>(
				`select public.foundry_review_version($1::uuid, 'reject', 'Add a title to index.html.', 'incomplete') as r`,
				[v1]
			);
			return rows[0].r.status;
		});
		expect(status).toBe('rejected');
	});
});

describe('0130 // one submitted version per app', () => {
	it('refuses a second submitted row written directly, and withdraws through the RPC instead', async () => {
		const student = await author();
		const appId = await createApp(student, 'queue-app');
		const v1 = await createVersion(student, appId, 'uploads/queue/v1.zip');
		const v2 = await createVersion(student, appId, 'uploads/queue/v2.zip');

		await db.asUser(student.id, (q) => q(`select public.foundry_submit_version($1::uuid)`, [v1]));

		// The INDEX, not the RPC. Written as the connection owner, which
		// bypasses RLS and every grant, so nothing but the constraint itself
		// can be what refuses this.
		const message = await refusal(() =>
			db.sql(`update public.student_app_versions set status = 'submitted' where id = $1`, [v2])
		);
		expect(message).toContain('student_app_versions_one_submitted_idx');

		// POSITIVE CONTROL: the RPC withdraws v1 in the same transaction, so
		// exactly one row is submitted afterwards and it is v2.
		const withdrew = await db.asUser(student.id, async (q) => {
			const { rows } = await q<{ r: { withdrew: string[] } }>(
				`select public.foundry_submit_version($1::uuid) as r`,
				[v2]
			);
			return rows[0].r.withdrew;
		});
		expect(withdrew).toEqual([v1]);

		const { rows } = await db.sql<{ id: string }>(
			`select id from public.student_app_versions where app_id = $1 and status = 'submitted'`,
			[appId]
		);
		expect(rows.map((r) => r.id)).toEqual([v2]);
	});
});

describe('0130 // published_version_id', () => {
	it('refuses a draft, refuses another app\'s approved version, and accepts its own', async () => {
		const student = await author();
		const other = await author();
		const appId = await createApp(student, 'publish-app');
		const draft = await createVersion(student, appId, 'uploads/publish/v1.zip');
		const good = await createVersion(student, appId, 'uploads/publish/v2.zip');

		// A second app with its own approved version.
		const otherApp = await createApp(other, 'publish-other');
		const foreign = await createVersion(other, otherApp, 'uploads/other/v1.zip');
		await db.asUser(other.id, (q) => q(`select public.foundry_submit_version($1::uuid)`, [foreign]));
		await db.asUser(admin.id, (q) =>
			q(`select public.foundry_review_version($1::uuid, 'approve')`, [foreign])
		);

		// Approve `good` so there is something legitimate to publish.
		await db.asUser(student.id, (q) => q(`select public.foundry_submit_version($1::uuid)`, [good]));
		await db.asUser(admin.id, (q) =>
			q(`select public.foundry_review_version($1::uuid, 'approve')`, [good])
		);

		// (a) Through the RPC, at a draft.
		const rpcDraft = await refusal(() =>
			db.asUser(student.id, (q) =>
				q(`select public.foundry_set_published_version($1::uuid, $2::uuid)`, [appId, draft])
			)
		);
		expect(rpcDraft).toContain('Only an approved version can be published');

		// (b) DIRECTLY, as the connection owner -- past RLS, past the grants and
		//     past the RPC entirely. This is the layer the trigger exists for.
		const triggerDraft = await refusal(() =>
			db.sql(`update public.student_apps set published_version_id = $1 where id = $2`, [
				draft,
				appId
			])
		);
		expect(triggerDraft).toContain('Only an approved version can be published');

		// (c) Another app's APPROVED version, through the RPC.
		const rpcForeign = await refusal(() =>
			db.asUser(student.id, (q) =>
				q(`select public.foundry_set_published_version($1::uuid, $2::uuid)`, [appId, foreign])
			)
		);
		expect(rpcForeign).toContain('does not belong to this app');

		// (d) The same, directly. The trigger answers first; the composite
		//     foreign key is underneath it. Both are opened separately below.
		const triggerForeign = await refusal(() =>
			db.sql(`update public.student_apps set published_version_id = $1 where id = $2`, [
				foreign,
				appId
			])
		);
		expect(triggerForeign).toContain('must belong to the app publishing it');

		// POSITIVE CONTROL: its own approved version publishes.
		const published = await db.asUser(student.id, async (q) => {
			const { rows } = await q<{ r: { published_version_id: string } }>(
				`select public.foundry_set_published_version($1::uuid, $2::uuid) as r`,
				[appId, good]
			);
			return rows[0].r.published_version_id;
		});
		expect(published).toBe(good);
	});

	it('DEFENSE IN DEPTH: with the trigger dropped, the composite key still refuses a foreign version', async () => {
		const student = await author();
		const other = await author();
		// The rule is enforced twice. A mutation test that leaves both layers in
		// place cannot tell whether either one works, so this drops the trigger
		// and confirms the FOREIGN KEY is what bites, then puts it back.
		const appId = await createApp(student, 'depth-app');
		const otherApp = await createApp(other, 'depth-other');
		const foreign = await createVersion(other, otherApp, 'uploads/depth/v1.zip');
		await db.asUser(other.id, (q) => q(`select public.foundry_submit_version($1::uuid)`, [foreign]));
		await db.asUser(admin.id, (q) =>
			q(`select public.foundry_review_version($1::uuid, 'approve')`, [foreign])
		);

		await db.sql(`alter table public.student_apps disable trigger foundry_published_version_check`);
		try {
			const message = await refusal(() =>
				db.sql(`update public.student_apps set published_version_id = $1 where id = $2`, [
					foreign,
					appId
				])
			);
			expect(message).toContain('student_apps_published_version_fkey');
		} finally {
			await db.sql(`alter table public.student_apps enable trigger foundry_published_version_check`);
		}

		// And confirm the trigger is back on: the same write refuses with the
		// trigger's own message again.
		const restored = await refusal(() =>
			db.sql(`update public.student_apps set published_version_id = $1 where id = $2`, [
				foreign,
				appId
			])
		);
		expect(restored).toContain('must belong to the app publishing it');
	});

	it('refuses moving the currently published version out of approved', async () => {
		const student = await author();
		const appId = await createApp(student, 'unapprove-app');
		const v1 = await createVersion(student, appId, 'uploads/unapprove/v1.zip');
		await db.asUser(student.id, (q) => q(`select public.foundry_submit_version($1::uuid)`, [v1]));
		await db.asUser(admin.id, (q) =>
			q(`select public.foundry_review_version($1::uuid, 'approve')`, [v1])
		);

		const message = await refusal(() =>
			db.sql(`update public.student_app_versions set status = 'draft' where id = $1`, [v1])
		);
		expect(message).toContain('currently publishes');

		// POSITIVE CONTROL: a version that is NOT published moves freely.
		const v2 = await createVersion(student, appId, 'uploads/unapprove/v2.zip');
		await db.sql(`update public.student_app_versions set status = 'approved' where id = $1`, [v2]);
		await db.sql(`update public.student_app_versions set status = 'draft' where id = $1`, [v2]);
		const { rows } = await db.sql<{ status: string }>(
			`select status from public.student_app_versions where id = $1`,
			[v2]
		);
		expect(rows[0].status).toBe('draft');
	});
});

describe('0130 // the five-app cap', () => {
	it('refuses the sixth live app, and a hidden one frees the slot', async () => {
		const capped = await createUser(db, 'capped@boscotech.net', 'Five Apps');
		for (let i = 1; i <= 5; i += 1) {
			await createApp(capped, `capped-app-${i}`);
		}

		const message = await refusal(() => createApp(capped, 'capped-app-6'));
		expect(message).toContain('which is the limit');

		// POSITIVE CONTROL: hiding one is a soft delete, so it stops counting.
		const { rows } = await db.sql<{ id: string }>(
			`select id from public.student_apps where slug = 'capped-app-1'`
		);
		await db.asUser(admin.id, (q) =>
			q(`select public.foundry_set_app_hidden($1::uuid, true, 'test')`, [rows[0].id])
		);
		const sixth = await createApp(capped, 'capped-app-6');
		expect(sixth).toMatch(/^[0-9a-f-]{36}$/);
	});
});

describe('0130 // liveness and disclosure', () => {
	it('shows a published app to everyone, an unpublished one to its owner alone, and a hidden one to admins alone', async () => {
		const student = await author();
		const other = await author();
		const live = await createApp(student, 'liveness-live');
		const draftOnly = await createApp(student, 'liveness-draft');

		const v = await createVersion(student, live, 'uploads/liveness/v1.zip');
		await db.asUser(student.id, (q) => q(`select public.foundry_submit_version($1::uuid)`, [v]));
		await db.asUser(admin.id, (q) =>
			q(`select public.foundry_review_version($1::uuid, 'approve')`, [v])
		);

		const slugsFor = (as: SeededUser, hidden = false, unpublished = false) =>
			db.asUser(as.id, async (q) => {
				const { rows } = await q<{ slug: string }>(
					`select slug from public.foundry_list_apps(null, $1, $2) where slug like 'liveness-%'`,
					[hidden, unpublished]
				);
				return rows.map((r) => r.slug).sort();
			});

		expect(await slugsFor(other)).toEqual(['liveness-live']);
		expect(await slugsFor(student)).toEqual(['liveness-draft', 'liveness-live']);

		// A student PASSING THE FLAGS reads exactly what a student not passing
		// them reads: the widening is gated on is_admin() inside the predicate.
		expect(await slugsFor(other, true, true)).toEqual(['liveness-live']);
		expect(await slugsFor(admin, true, true)).toEqual(['liveness-draft', 'liveness-live']);
		expect(await slugsFor(admin)).toEqual(['liveness-live']);

		// Hide the published one. It leaves every list including its OWNER's,
		// and comes back only for an admin who asks for that population.
		await db.asUser(admin.id, (q) =>
			q(`select public.foundry_set_app_hidden($1::uuid, true, 'off-topic')`, [live])
		);
		expect(await slugsFor(other)).toEqual([]);
		expect(await slugsFor(student)).toEqual(['liveness-draft']);
		expect(await slugsFor(admin, true, true)).toEqual(['liveness-draft', 'liveness-live']);

		// foundry_get_app answers with the SAME rule, which is the 404.
		const gone = await db.asUser(student.id, async (q) => {
			const { rows } = await q<{ r: unknown }>(`select public.foundry_get_app('liveness-live') as r`);
			return rows[0].r;
		});
		expect(gone).toBeNull();

		const seen = await db.asUser(admin.id, async (q) => {
			const { rows } = await q<{ r: { slug: string } | null }>(
				`select public.foundry_get_app('liveness-live', true, true) as r`
			);
			return rows[0].r;
		});
		expect(seen?.slug).toBe('liveness-live');
	});

	it('carries no email in either read RPC', async () => {
		const student = await author();
		const other = await author();
		const appId = await createApp(student, 'no-email-app');
		const v = await createVersion(student, appId, 'uploads/noemail/v1.zip');
		await db.asUser(student.id, (q) => q(`select public.foundry_submit_version($1::uuid)`, [v]));
		await db.asUser(admin.id, (q) =>
			q(`select public.foundry_review_version($1::uuid, 'approve')`, [v])
		);

		const payload = await db.asUser(other.id, async (q) => {
			const { rows } = await q<{ r: unknown }>(
				`select public.foundry_get_app('no-email-app') as r`
			);
			return JSON.stringify(rows[0].r);
		});
		// POSITIVE CONTROL first: the payload really is this app's.
		expect(payload).toContain('no-email-app');
		expect(payload).not.toContain('@');

		const listed = await db.asUser(other.id, async (q) => {
			const { rows } = await q(
				`select to_jsonb(t) as r from public.foundry_list_apps() t where slug = 'no-email-app'`
			);
			return JSON.stringify(rows);
		});
		expect(listed).toContain('no-email-app');
		expect(listed).not.toContain('@');

		// And a non-owner gets the build, not the paperwork: exactly one
		// version, with the review trail nulled.
		const versions = await db.asUser(other.id, async (q) => {
			const { rows } = await q<{ r: { versions: Array<Record<string, unknown>> } }>(
				`select public.foundry_get_app('no-email-app') as r`
			);
			return rows[0].r.versions;
		});
		expect(versions).toHaveLength(1);
		expect(versions[0].zip_path).toBeNull();
		expect(versions[0].reviewed_by).toBeNull();
		// POSITIVE CONTROL: the owner's read of the same row carries both.
		const ownerVersions = await db.asUser(student.id, async (q) => {
			const { rows } = await q<{ r: { versions: Array<Record<string, unknown>> } }>(
				`select public.foundry_get_app('no-email-app') as r`
			);
			return rows[0].r.versions;
		});
		expect(ownerVersions[0].zip_path).toBe('uploads/noemail/v1.zip');
		expect(ownerVersions[0].reviewed_by).toBe(admin.id);
	});
});

describe('0130 // metadata', () => {
	it('flags an edit only when the app is published and the value actually moved, and never touches the slug', async () => {
		const student = await author();
		const appId = await createApp(student, 'meta-app');

		// Unpublished: an edit lands and stamps nothing.
		const beforePublish = await db.asUser(student.id, async (q) => {
			const { rows } = await q<{ r: { changed: boolean; metadata_flagged_at: string | null } }>(
				`select public.foundry_update_app_metadata($1::uuid, 'title', 'Renamed') as r`,
				[appId]
			);
			return rows[0].r;
		});
		expect(beforePublish).toMatchObject({ changed: true, metadata_flagged_at: null });

		const v = await createVersion(student, appId, 'uploads/meta/v1.zip');
		await db.asUser(student.id, (q) => q(`select public.foundry_submit_version($1::uuid)`, [v]));
		await db.asUser(admin.id, (q) =>
			q(`select public.foundry_review_version($1::uuid, 'approve')`, [v])
		);

		// A save that changed nothing is not an edit.
		const noop = await db.asUser(student.id, async (q) => {
			const { rows } = await q<{ r: { changed: boolean; metadata_flagged_at: string | null } }>(
				`select public.foundry_update_app_metadata($1::uuid, 'title', 'Renamed') as r`,
				[appId]
			);
			return rows[0].r;
		});
		expect(noop).toMatchObject({ changed: false, metadata_flagged_at: null });

		// A real one is.
		const real = await db.asUser(student.id, async (q) => {
			const { rows } = await q<{ r: { changed: boolean; metadata_flagged_at: string | null } }>(
				`select public.foundry_update_app_metadata($1::uuid, 'tagline', 'A tiny game') as r`,
				[appId]
			);
			return rows[0].r;
		});
		expect(real.changed).toBe(true);
		expect(real.metadata_flagged_at).not.toBeNull();

		const slug = await refusal(() =>
			db.asUser(student.id, (q) =>
				q(`select public.foundry_update_app_metadata($1::uuid, 'slug', 'something-else')`, [appId])
			)
		);
		expect(slug).toContain('permanent');

		const unknown = await refusal(() =>
			db.asUser(student.id, (q) =>
				q(`select public.foundry_update_app_metadata($1::uuid, 'owner', 'me')`, [appId])
			)
		);
		expect(unknown).toContain('no editable field');

		// Whitespace-only build notes are EMPTY, which is the btrim trap this
		// file's normalizer exists for.
		const blank = await refusal(() =>
			db.asUser(student.id, (q) =>
				q(`select public.foundry_update_app_metadata($1::uuid, 'build_notes', E'\\n\\t ')`, [appId])
			)
		);
		expect(blank).toContain('cannot be empty');

		// Clearing the flag is admin-only.
		const notAdmin = await refusal(() =>
			db.asUser(student.id, (q) =>
				q(`select public.foundry_clear_metadata_flag($1::uuid)`, [appId])
			)
		);
		expect(notAdmin).toContain('Only an administrator');

		await db.asUser(admin.id, (q) =>
			q(`select public.foundry_clear_metadata_flag($1::uuid)`, [appId])
		);
		const { rows } = await db.sql<{ metadata_flagged_at: string | null }>(
			`select metadata_flagged_at from public.student_apps where id = $1`,
			[appId]
		);
		expect(rows[0].metadata_flagged_at).toBeNull();
	});
});

describe('0130 // storage', () => {
	it('refuses a client write to foundry-bundles, in both roles, while the uploads bucket accepts one', async () => {
		const student = await author();
		const other = await author();
		// POSITIVE CONTROL, and it runs FIRST so a refusal below cannot be a
		// missing grant: the owner's own prefix in foundry-uploads accepts a
		// write from the same role, through the same table.
		const inserted = await db.asUser(student.id, async (q) => {
			const { rowCount } = await q(
				`insert into storage.objects (bucket_id, name, owner) values ('foundry-uploads', $1, $2)`,
				[`${student.id}/app/v1.zip`, student.id]
			);
			return rowCount;
		});
		expect(inserted).toBe(1);

		// Somebody else's prefix in the SAME bucket is refused, so the policy is
		// doing the work rather than the bucket name.
		const wrongPrefix = await refusal(() =>
			db.asUser(student.id, (q) =>
				q(`insert into storage.objects (bucket_id, name, owner) values ('foundry-uploads', $1, $2)`, [
					`${other.id}/app/v1.zip`,
					student.id
				])
			)
		);
		expect(wrongPrefix).toContain('row-level security');

		// THE BUNDLES BUCKET: no policy names it, so RLS denies by default.
		const asStudent = await refusal(() =>
			db.asUser(student.id, (q) =>
				q(`insert into storage.objects (bucket_id, name, owner) values ('foundry-bundles', $1, $2)`, [
					`${student.id}/v1/index.html`,
					student.id
				])
			)
		);
		expect(asStudent).toContain('row-level security');

		// An ADMIN is still a client. is_admin() opens nothing here.
		const asAdmin = await refusal(() =>
			db.asUser(admin.id, (q) =>
				q(`insert into storage.objects (bucket_id, name, owner) values ('foundry-bundles', $1, $2)`, [
					`app/v1/index.html`,
					admin.id
				])
			)
		);
		expect(asAdmin).toContain('row-level security');

		// And a plain read of it is refused too -- the proxy is server-side.
		const read = await db.asUser(student.id, async (q) => {
			const { rows } = await q(`select name from storage.objects where bucket_id = 'foundry-bundles'`);
			return rows.length;
		});
		expect(read).toBe(0);

		// POSITIVE CONTROL for the denial: service_role, which is what the
		// extraction function holds, writes and reads it.
		const service = await db.asServiceRole(async (q) => {
			await q(`insert into storage.objects (bucket_id, name) values ('foundry-bundles', $1)`, [
				'app/v1/index.html'
			]);
			const { rows } = await q(`select name from storage.objects where bucket_id = 'foundry-bundles'`);
			return rows.length;
		});
		expect(service).toBe(1);
	});

	it("lets an owner see and delete their OWN upload, and nobody else's (0131)", async () => {
		// 0130 gave foundry-uploads INSERT, UPDATE and DELETE policies and no
		// SELECT policy, which made the UPDATE and DELETE ones INERT: Storage
		// has to find an object before it can act on one, and PostgreSQL applies
		// SELECT policies to a WHERE-qualified UPDATE. The visible symptom was a
		// delete that reported success while the object survived, which is the
		// worst kind of wrong because nothing anywhere says so.
		const student = await author();
		const other = await author();

		await db.sql(
			`insert into storage.objects (bucket_id, name, owner) values ('foundry-uploads', $1, $2)`,
			[`${student.id}/mine.zip`, student.id]
		);
		await db.sql(
			`insert into storage.objects (bucket_id, name, owner) values ('foundry-uploads', $1, $2)`,
			[`${other.id}/theirs.zip`, other.id]
		);

		const visible = await db.asUser(student.id, async (q) => {
			const { rows } = await q<{ name: string }>(
				`select name from storage.objects where bucket_id = 'foundry-uploads' order by name`
			);
			return rows.map((r) => r.name);
		});
		// Exactly their own, and the other row is the positive control that says
		// the policy is scoping rather than the bucket simply being empty.
		expect(visible).toEqual([`${student.id}/mine.zip`]);

		const deletedOwn = await db.asUser(student.id, async (q) => {
			const { rowCount } = await q(
				`delete from storage.objects where bucket_id = 'foundry-uploads' and name = $1`,
				[`${student.id}/mine.zip`]
			);
			return rowCount;
		});
		expect(deletedOwn).toBe(1);

		const deletedOther = await db.asUser(student.id, async (q) => {
			const { rowCount } = await q(
				`delete from storage.objects where bucket_id = 'foundry-uploads' and name = $1`,
				[`${other.id}/theirs.zip`]
			);
			return rowCount;
		});
		expect(deletedOther).toBe(0);

		// And the row really is still there, rather than merely unreported.
		// Scoped to this test's own two names: earlier tests in this file leave
		// their own uploads behind, and a whole-bucket listing would count them.
		const survivors = await db.sql<{ name: string }>(
			`select name from storage.objects
			  where bucket_id = 'foundry-uploads' and name = any($1::text[])
			  order by name`,
			[[`${student.id}/mine.zip`, `${other.id}/theirs.zip`]]
		);
		expect(survivors.rows.map((r) => r.name)).toEqual([`${other.id}/theirs.zip`]);
	});

	it('declares the three buckets with the intended visibility', async () => {
		const { rows } = await db.sql<{ id: string; public: boolean }>(
			`select id, public from storage.buckets where id like 'foundry-%' order by id`
		);
		expect(rows).toEqual([
			{ id: 'foundry-bundles', public: false },
			{ id: 'foundry-covers', public: true },
			{ id: 'foundry-uploads', public: false }
		]);
	});
});

describe('0130 // no client write grants', () => {
	it('grants only SELECT to anon and authenticated on all three tables', async () => {
		const { rows } = await db.sql<{ table_name: string; grantee: string; privilege_type: string }>(
			`select table_name, grantee, privilege_type
			 from information_schema.role_table_grants
			 where table_schema = 'public'
			   and table_name in ('student_apps', 'student_app_versions', 'student_app_files')
			   and grantee in ('anon', 'authenticated')
			 order by table_name, grantee, privilege_type`
		);
		// POSITIVE CONTROL: the sweep found something. A query returning nothing
		// would pass the exclusion below for the wrong reason.
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.every((r) => r.privilege_type === 'SELECT')).toBe(true);
		expect(rows.filter((r) => r.grantee === 'anon')).toEqual([]);
	});

	it('has exactly one row in pg_proc for every foundry RPC (the signature trap)', async () => {
		const { rows } = await db.sql<{ proname: string; n: string }>(
			`select p.proname, count(*)::text as n
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname like 'foundry\\_%'
			 group by p.proname order by p.proname`
		);
		// The eleven RPCs plus the two read predicates foundry_can_read_app and
		// foundry_can_read_version. Every one must be a SINGLE row: an overload
		// left behind by a later `create or replace` that added a parameter is
		// the signature trap, and two overloads differing only by a defaulted
		// trailing parameter make PostgREST unable to resolve the call at all.
		expect(rows.map((r) => r.proname)).toEqual([
			'foundry_can_read_app',
			'foundry_can_read_version',
			'foundry_clear_metadata_flag',
			'foundry_create_app',
			'foundry_create_version',
			'foundry_get_app',
			'foundry_list_apps',
			'foundry_review_version',
			'foundry_set_app_hidden',
			'foundry_set_published_version',
			'foundry_submit_version',
			'foundry_update_app_metadata',
			'foundry_withdraw_version'
		]);
		expect(rows.filter((r) => r.n !== '1')).toEqual([]);
	});
});

describe('0131 // service_role can satisfy the write-time predicates', () => {
	/*
	 * A CHECK CONSTRAINT'S FUNCTION IS EVALUATED AS THE WRITING ROLE.
	 * service_role bypasses RLS; it does NOT bypass function grants. 0130
	 * revoked its three private predicates from `public` and granted them
	 * onward to nobody, so every Foundry table was unwritable by the one caller
	 * it was designed to be written by -- and NOTHING said so until an
	 * extraction ran, wrote its bytes to the bucket, and failed on the index
	 * insert with `permission denied for function _classroom_deck_path_ok`.
	 *
	 * THE RULE IS ASSERTED, NOT THE THREE NAMES. Spelling out the current
	 * predicates would pass forever the moment a fourth one is added to a CHECK
	 * without a grant, which is the exact way this recurs.
	 */
	it('can execute EVERY function reachable from a CHECK on a table it may write', async () => {
		const { rows } = await db.sql<{ fn: string; svc: boolean; tbl: string }>(`
			select p.proname as fn,
			       has_function_privilege('service_role', p.oid, 'EXECUTE') as svc,
			       c.conrelid::regclass::text as tbl
			  from pg_constraint c
			  join pg_proc p
			    on position(p.proname || '(' in pg_get_constraintdef(c.oid)) > 0
			  join pg_namespace pn on pn.oid = p.pronamespace
			 where c.contype = 'c'
			   and c.connamespace = 'public'::regnamespace
			   and pn.nspname = 'public'
			   and has_table_privilege('service_role', c.conrelid, 'INSERT')
			 group by 1, 2, 3
			 order by 1, 3
		`);

		// The sweep found something: a zero-row result would pass vacuously and
		// is indistinguishable from a query that matches nothing.
		expect(rows.length).toBeGreaterThan(0);
		expect(new Set(rows.map((r) => r.fn))).toEqual(
			new Set(['_classroom_deck_path_ok', '_foundry_norm', '_foundry_slug_ok'])
		);

		const ungranted = rows.filter((r) => !r.svc).map((r) => `${r.fn} (via ${r.tbl})`);
		expect(ungranted).toEqual([]);
	});

	it('actually writes the three tables directly, which is what the grants are for', async () => {
		const student = await author();
		const app = await db.asUser(student.id, (q) =>
			q<{ foundry_create_app: { app_id: string } }>(
				`select public.foundry_create_app($1, $2, $3) as foundry_create_app`,
				['svc-write-probe', 'Service Write Probe', 'Built to exercise the direct write path.']
			)
		);
		const appId = app.rows[0].foundry_create_app.app_id;

		const version = await db.asUser(student.id, (q) =>
			q<{ foundry_create_version: { version_id: string } }>(
				`select public.foundry_create_version($1, $2) as foundry_create_version`,
				[appId, `${student.id}/probe.zip`]
			)
		);
		const versionId = version.rows[0].foundry_create_version.version_id;

		// student_app_files.path -> _classroom_deck_path_ok
		const inserted = await db.asServiceRole(async (q) => {
			const { rowCount } = await q(
				`insert into public.student_app_files (version_id, path, content_type, byte_size)
				 values ($1, 'index.html', 'text/html; charset=utf-8', 42)`,
				[versionId]
			);
			return rowCount;
		});
		expect(inserted).toBe(1);

		// An UPDATE re-evaluates EVERY check on the row, which is what pulls
		// _foundry_norm in even though the manifest is the only column moving.
		const updated = await db.asServiceRole(async (q) => {
			const { rowCount } = await q(
				`update public.student_app_versions
				    set manifest = '{"ok": true}'::jsonb, file_count = 1, byte_size = 42
				  where id = $1`,
				[versionId]
			);
			return rowCount;
		});
		expect(updated).toBe(1);

		// student_apps.slug -> _foundry_slug_ok, which the extraction function
		// never reaches but the next direct writer of this table would.
		const appRow = await db.asServiceRole(async (q) => {
			const { rowCount } = await q(
				`insert into public.student_apps (owner, slug, title, build_notes)
				 values ($1, 'svc-direct-write', 'Direct', 'Written by service_role.')`,
				[student.id]
			);
			return rowCount;
		});
		expect(appRow).toBe(1);
	});
});

// tests/db/foundry-publish-description-optional.test.ts
//
// DECISION 05, REVERSED (0204). A Foundry app publishes and submits with NO
// DESCRIPTION. Mr. Pina answered on 2026-09-12: publishing needs a name, a
// thumbnail and the app; a description is optional.
//
// WHY THIS IS A TEST AND NOT A HARNESS DRIVE. `CLAUDE.md` says to add a test
// only for a guarantee whose regression would be SILENT, and the regression
// here is the loudest kind for a student and the quietest kind for us: the
// gate coming back means a student cannot submit their work for review, with
// nothing on any surface of ours reporting it. 0173 put the requirement in
// TWO places -- the publication trigger and `foundry_submit_version` -- so
// half a restoration is also possible, and that is worse: the submit would
// work and the publish would fail days later in front of a reviewer.
//
// IT IS A PAIRED MEASUREMENT ACROSS TWO CHAINS, which is the only shape that
// proves anything here. A test that asserts a blank description publishes
// passes IDENTICALLY on a database where the gate was never written -- so the
// same fixture is put to the chain stopping at 0173, where both gates must
// FIRE and quote 0173's own sentences, and then to the chain with 0204 over
// it, where both must be gone. Without the first half the second half is a
// green tick over an untested claim.

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

/** The Foundry chain through 0173: the world the moment before this bundle. */
const BEFORE = [
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
	// 0139 IS A HARD DEPENDENCY OF 0204, not scenery: section 4 of that file
	// revokes on `student_app_plays`, which 0139 creates. Measured by leaving
	// it out -- `relation "public.student_app_plays" does not exist`.
	'0139_foundry_telemetry.sql',
	'0141_foundry_app_cap_and_download.sql',
	'0173_foundry_section_gate_description_and_trust.sql',
	'0137_anon_execute_sweep.sql'
] as const;

/** The same chain with 0204 over it. 0137 goes last in both, as it always does. */
const AFTER = [
	...BEFORE.slice(0, BEFORE.length - 1),
	'0204_foundry_description_optional_and_public_play_stats.sql',
	'0137_anon_execute_sweep.sql'
] as const;

/** The pinned owner constant from 0067. */
const OWNER_EMAIL = 'apina@boscotech.edu';

/**
 * THE EMPTINESS CASES, and they are three different things rather than one.
 * The database's predicate is `_foundry_norm`, which normalises whitespace, so
 * a description of newlines and tabs was empty to 0173 and is the case a
 * length check would have let through. All three must publish now.
 */
const BLANK_DESCRIPTIONS: { label: string; value: string | null }[] = [
	{ label: 'null', value: null },
	{ label: 'the empty string', value: '' },
	{ label: 'newlines and tabs only', value: '\n\t\t \n ' }
];

interface World {
	db: TestDb;
	admin: SeededUser;
	seq: number;
}

async function boot(chain: readonly string[]): Promise<World> {
	const db = await startTestDb(chain as unknown as string[]);
	const owner = await createUser(db, OWNER_EMAIL, 'Owner Account');
	const admin = await createUser(db, 'reviewer@boscotech.edu', 'Reviewing Admin');
	await db.asUser(owner.id, (q) => q(`select public.admin_grant($1, null)`, [admin.email]));
	return { db, admin, seq: 0 };
}

/** A fresh author per app: the five-app cap (0141) is real and per person. */
async function author(w: World): Promise<SeededUser> {
	w.seq += 1;
	return createUser(w.db, `author${w.seq}@boscotech.net`, `Author ${w.seq}`);
}

async function createApp(
	w: World,
	as: SeededUser,
	slug: string,
	description: string | null
): Promise<string> {
	return w.db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: { app_id: string } }>(
			`select public.foundry_create_app($1, $2, $3, null, $4) as r`,
			[slug, 'Test app', 'Plain HTML and a bit of JavaScript.', description]
		);
		return rows[0].r.app_id;
	});
}

async function createVersion(w: World, as: SeededUser, appId: string): Promise<string> {
	return w.db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: { version_id: string } }>(
			`select public.foundry_create_version($1::uuid, $2) as r`,
			[appId, `uploads/${appId}/v1.zip`]
		);
		return rows[0].r.version_id;
	});
}

async function submit(w: World, as: SeededUser, versionId: string): Promise<unknown> {
	return w.db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: unknown }>(
			`select public.foundry_submit_version($1::uuid) as r`,
			[versionId]
		);
		return rows[0].r;
	});
}

async function approve(w: World, versionId: string): Promise<unknown> {
	return w.db.asUser(w.admin.id, async (q) => {
		const { rows } = await q<{ r: unknown }>(
			`select public.foundry_review_version($1::uuid, 'approve', null, null) as r`,
			[versionId]
		);
		return rows[0].r;
	});
}

async function publishedVersionOf(w: World, appId: string): Promise<string | null> {
	const { rows } = await w.db.sql<{ v: string | null }>(
		`select published_version_id as v from public.student_apps where id = $1`,
		[appId]
	);
	return rows[0].v;
}

/** The message Postgres actually produced, so the report can quote it. */
async function refusal(fn: () => Promise<unknown>): Promise<string> {
	try {
		await fn();
	} catch (err) {
		return (err as Error).message;
	}
	throw new Error('expected a refusal, but the call succeeded');
}

let before: World;
let after: World;

/**
 * SERIALLY, AND THAT IS NOT A STYLE CHOICE. The roles the stub creates
 * (`anon`, `authenticated`, `service_role`) are CLUSTER-wide, not per
 * database, and `tests/db/cluster.ts` gives the whole run one cluster. Two
 * overlapping `startTestDb` calls therefore race the stub's
 * `create role ... if not exists` guards against each other and fail with a
 * unique violation on `pg_authid` -- which is the same race `CLAUDE.md`
 * describes for parallel test FILES, reproduced inside one file by an
 * innocent-looking `Promise.all`. Measured here before it was fixed:
 * `duplicate key value violates unique constraint "pg_authid_rolname_index",
 * Key (rolname)=(anon) already exists`.
 */
beforeAll(async () => {
	before = await boot(BEFORE);
	after = await boot(AFTER);
}, 180_000);

afterAll(async () => {
	await before?.db.stop();
	await after?.db.stop();
});

// ---------------------------------------------------------------------------
// THE CONTROL. Both gates fire on the chain through 0173.
// ---------------------------------------------------------------------------

describe('0173 // the world before: a description is required in two places', () => {
	it('refuses a SUBMIT with no description, in 0173\'s own words', async () => {
		const alice = await author(before);
		const appId = await createApp(before, alice, 'before-submit', null);
		const versionId = await createVersion(before, alice, appId);

		const message = await refusal(() => submit(before, alice, versionId));
		// Pinned by TEXT, because the text is what a student reads and it is
		// what this bundle is removing.
		expect(message).toContain('Write a description before submitting');

		// POSITIVE CONTROL on the same database: the identical call lands the
		// moment a description is there, so the refusal is the description
		// gate and not a broken fixture.
		const bob = await author(before);
		const okApp = await createApp(before, bob, 'before-submit-ok', 'A real description.');
		const okVersion = await createVersion(before, bob, okApp);
		await expect(submit(before, bob, okVersion)).resolves.toBeTruthy();
	});

	it('refuses a PUBLISH with no description at the trigger, which is the second gate', async () => {
		const alice = await author(before);
		// The app carries a description so the SUBMIT gate lets it past; the
		// description is then blanked, which is how the publication gate is
		// reached at all.
		const appId = await createApp(before, alice, 'before-publish', 'Temporarily present.');
		const versionId = await createVersion(before, alice, appId);
		await submit(before, alice, versionId);
		await before.db.sql(`update public.student_apps set description = null where id = $1`, [
			appId
		]);

		// THE REAL PUBLISH PATH: a reviewer approving, which sets
		// `published_version_id` and therefore fires the trigger.
		const viaReview = await refusal(() => approve(before, versionId));
		expect(viaReview).toContain('Write a description before publishing');

		// AND THE RAW WRITE, as the connection owner, which bypasses RLS and
		// every RPC. This is what makes the trigger the boundary rather than
		// the function: there is no way round it.
		//
		// The version is marked approved directly first, because the review
		// above was REFUSED and therefore never advanced it -- and the
		// trigger's status check fires ahead of the description check, so
		// without this the raw probe measures 'Only an approved version can
		// be published' and says nothing about decision 05. Measured: that is
		// exactly what it returned before this line was added.
		await before.db.sql(
			`update public.student_app_versions set status = 'approved' where id = $1`,
			[versionId]
		);
		const viaRaw = await refusal(() =>
			before.db.sql(`update public.student_apps set published_version_id = $2 where id = $1`, [
				appId,
				versionId
			])
		);
		expect(viaRaw).toContain('Write a description before publishing');

		// The app really did stay unpublished, so the refusals above were
		// refusals and not messages beside a write that happened anyway.
		expect(await publishedVersionOf(before, appId)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// THE ANSWER. Both gates are gone with 0204 over the same chain.
// ---------------------------------------------------------------------------

describe('0204 // decision 05 reversed: a description is optional', () => {
	for (const { label, value } of BLANK_DESCRIPTIONS) {
		it(`submits, approves and publishes with a description of ${label}`, async () => {
			const alice = await author(after);
			const slug = `after-${label.replace(/[^a-z]+/g, '-')}`;
			const appId = await createApp(after, alice, slug, value);
			const versionId = await createVersion(after, alice, appId);

			// GATE ONE IS GONE.
			await expect(submit(after, alice, versionId)).resolves.toBeTruthy();
			// GATE TWO IS GONE, through the real review path.
			await expect(approve(after, versionId)).resolves.toBeTruthy();

			// AND THE APP IS GENUINELY LIVE, which is the assertion that
			// cannot pass on a call that merely did not throw.
			expect(await publishedVersionOf(after, appId)).toBe(versionId);
		});
	}

	it('carries neither sentence in either function, read back off the catalog', async () => {
		const { rows } = await after.db.sql<{ name: string; src: string }>(
			`select p.proname as name, p.prosrc as src
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public'
			    and p.proname in ('_foundry_published_version_check', 'foundry_submit_version')`
		);
		// The sweep must have found both, or the absence below is vacuous.
		expect(rows.map((r) => r.name).sort()).toEqual([
			'_foundry_published_version_check',
			'foundry_submit_version'
		]);
		for (const row of rows) {
			expect([row.name, /before (publishing|submitting)/.test(row.src)]).toEqual([
				row.name,
				false
			]);
			expect([row.name, row.src.includes('.description')]).toEqual([row.name, false]);
		}

		// POSITIVE CONTROL: the same sweep over the BEFORE database finds
		// both sentences, so the predicate above is one that can say yes.
		const { rows: had } = await before.db.sql<{ name: string; src: string }>(
			`select p.proname as name, p.prosrc as src
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public'
			    and p.proname in ('_foundry_published_version_check', 'foundry_submit_version')`
		);
		expect(had.every((r) => /before (publishing|submitting)/.test(r.src))).toBe(true);
	});

	it('keeps every publication check that is NOT decision 05', async () => {
		const alice = await author(after);
		const bob = await author(after);
		const appId = await createApp(after, alice, 'after-other-checks', null);
		const versionId = await createVersion(after, alice, appId);

		// A version that is not approved cannot be published. This is 0130's
		// check and the easy thing to delete while removing the one beside it.
		const notApproved = await refusal(() =>
			after.db.sql(`update public.student_apps set published_version_id = $2 where id = $1`, [
				appId,
				versionId
			])
		);
		expect(notApproved).toContain('Only an approved version can be published');

		// A version belonging to another app cannot be published either.
		const otherApp = await createApp(after, bob, 'after-other-app', null);
		const otherVersion = await createVersion(after, bob, otherApp);
		await submit(after, bob, otherVersion);
		await approve(after, otherVersion);
		const wrongApp = await refusal(() =>
			after.db.sql(`update public.student_apps set published_version_id = $2 where id = $1`, [
				appId,
				otherVersion
			])
		);
		expect(wrongApp).toContain('must belong to the app publishing it');

		// And a version that does not exist at all.
		const missing = await refusal(() =>
			after.db.sql(
				`update public.student_apps set published_version_id = gen_random_uuid() where id = $1`,
				[appId]
			)
		);
		expect(missing).toContain('That version does not exist');
	});

	it('keeps decision 06, which is the arm most likely to be lost in the re-signing', async () => {
		// 0204 re-signs `foundry_submit_version`. The cheap mistake is
		// re-signing it from 0130, which silently deletes 0173's trusted
		// publisher arm -- and nothing would report that except a student
		// quietly losing auto-publish.
		const { rows } = await after.db.sql<{ src: string }>(
			`select p.prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'foundry_submit_version'`
		);
		expect(rows[0].src).toContain('_foundry_is_trusted_email');
		expect(rows[0].src).toContain('auto_published_at');

		// BEHAVIOURALLY, not just textually: a trusted author's submit goes
		// straight to approved and publishes in the same transaction, with a
		// BLANK description, which is both decisions at once.
		const trusted = await author(after);
		await after.db.asUser(after.admin.id, (q) =>
			q(`select public.foundry_trusted_grant($1, null)`, [trusted.email])
		);
		const appId = await createApp(after, trusted, 'after-trusted', null);
		const versionId = await createVersion(after, trusted, appId);
		const r = (await submit(after, trusted, versionId)) as {
			status: string;
			auto_published: boolean;
		};
		expect(r.status).toBe('approved');
		expect(r.auto_published).toBe(true);
		expect(await publishedVersionOf(after, appId)).toBe(versionId);
	});
});

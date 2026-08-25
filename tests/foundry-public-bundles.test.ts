import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';

/**
 * 0135 // THE BUNDLE BUCKET IS PUBLIC, AND THIS IS WHAT THAT COSTS.
 *
 * The token proxy is removed. `foundry-bundles` had NO policy at all under
 * 0130, which under RLS denies every `anon` and `authenticated` request by
 * default and left `service_role` as its only reader; the proxy then re-checked
 * on every request that the version belonged to the app, that it was still the
 * app's `published_version_id`, and that the app was not hidden.
 *
 * ALL THREE OF THOSE ARE GONE, and this file is where that is written down as
 * a behaviour rather than as a note. A visibility change is exactly the kind of
 * thing the repo says to test: it fails SILENTLY -- nothing on any screen says
 * a draft became world-readable, and the gallery looks identical either way.
 *
 * SO EVERY ASSERTION HERE IS PAIRED. The reads that now succeed are asserted
 * beside the writes that must still fail, because "the bucket opened" and "the
 * bucket opened for writing too" are one migration apart and only one of them
 * is intended.
 *
 * THE CHAIN IS 0130 + 0131 + 0135. `tests/foundry-policies.test.ts` deliberately
 * stops at 0131 and keeps asserting what 0130 built, which is still the truth
 * about those two files; this one is about what 0135 changes on top of them.
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
	'0131_foundry_service_role_writes.sql',
	'0135_foundry_public_bundles.sql'
];

const OWNER_EMAIL = 'apina@boscotech.edu';

let db: TestDb;
let student: SeededUser;
let other: SeededUser;
let admin: SeededUser;
let owner: SeededUser;

async function refusal(run: () => Promise<unknown>): Promise<string> {
	try {
		await run();
	} catch (err) {
		return (err as Error).message;
	}
	throw new Error('expected a refusal, but the call succeeded');
}

beforeAll(async () => {
	db = await startTestDb(MIGRATIONS);

	owner = await createUser(db, OWNER_EMAIL, 'Owner Account');
	admin = await createUser(db, 'reviewer@boscotech.edu', 'Reviewing Admin');
	student = await createUser(db, 'maker@boscotech.net', 'Maker Student');
	other = await createUser(db, 'other@boscotech.net', 'Other Student');

	await db.asUser(owner.id, (q) => q(`select public.admin_grant($1, null)`, [admin.email]));

	// Match a real Supabase project's storage grants: the table grants are wide
	// and RLS is what narrows them, which is the whole reason a missing policy
	// is a denial rather than an error.
	await db.sql(`grant select, insert, update, delete on storage.objects to authenticated`);
	await db.sql(`grant select, insert, update, delete on storage.objects to service_role`);
	await db.sql(`grant select on storage.objects to anon`);

	// One object, written the way the ingest function writes one.
	await db.asServiceRole((q) =>
		q(`insert into storage.objects (bucket_id, name) values ('foundry-bundles', $1)`, [
			'app-1/version-1/index.html'
		])
	);
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

describe('0135 // the bucket flag', () => {
	it('flips foundry-bundles to public and leaves the other two alone', async () => {
		const { rows } = await db.sql<{ id: string; public: boolean }>(
			`select id, public from storage.buckets where id like 'foundry-%' order by id`
		);
		expect(rows).toEqual([
			{ id: 'foundry-bundles', public: true },
			{ id: 'foundry-covers', public: true },
			// The raw zips stay shut. They are an input to extraction, not
			// something anybody reads back, and nothing about this change touches
			// them.
			{ id: 'foundry-uploads', public: false }
		]);
	});

	/**
	 * EXACTLY ONE POLICY NAMES THIS BUCKET, so "what opened it" has one answer.
	 * 0130 dropped three speculative names defensively and 0135 drops them
	 * again; a second policy appearing here later is how a read policy quietly
	 * becomes a write policy.
	 */
	it('names the bucket in exactly one policy, and it is a SELECT', async () => {
		const { rows } = await db.sql<{ policyname: string; cmd: string; roles: string }>(
			`select policyname, cmd, roles::text as roles
			   from pg_policies
			  where schemaname = 'storage' and tablename = 'objects'
			    and qual like '%foundry-bundles%'
			  order by policyname`
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].policyname).toBe('foundry bundles public read');
		expect(rows[0].cmd).toBe('SELECT');
		expect(rows[0].roles).toContain('public');
	});
});

describe('0135 // who can read, and who still cannot write', () => {
	it('lets a signed-in student, a signed-out visitor and a stranger all read it', async () => {
		const asOwnerOfNothing = await db.asUser(student.id, async (q) => {
			const { rows } = await q(
				`select name from storage.objects where bucket_id = 'foundry-bundles'`
			);
			return rows.length;
		});
		expect(asOwnerOfNothing).toBe(1);

		// Somebody who has nothing to do with this app.
		const asStranger = await db.asUser(other.id, async (q) => {
			const { rows } = await q(
				`select name from storage.objects where bucket_id = 'foundry-bundles'`
			);
			return rows.length;
		});
		expect(asStranger).toBe(1);

		// AND ANONYMOUSLY, which is the part that is genuinely new. Under 0130
		// this was 0 for every role but service_role.
		const asAnon = await db.asAnon(async (q) => {
			const { rows } = await q(
				`select name from storage.objects where bucket_id = 'foundry-bundles'`
			);
			return rows.length;
		});
		expect(asAnon).toBe(1);
	});

	/**
	 * THE WRITE SIDE DID NOT MOVE, and this is the assertion that would catch
	 * the mistake worth catching. A `for all` policy instead of a `for select`
	 * one reads almost identically in a diff and would let any signed-in
	 * student overwrite any published app's `index.html`.
	 */
	it('still refuses every client write, in every role, while service_role writes', async () => {
		const asStudent = await refusal(() =>
			db.asUser(student.id, (q) =>
				q(`insert into storage.objects (bucket_id, name, owner) values ('foundry-bundles', $1, $2)`, [
					'app-2/version-2/index.html',
					student.id
				])
			)
		);
		expect(asStudent).toContain('row-level security');

		// An ADMIN is still a client. is_admin() opens nothing here.
		const asAdmin = await refusal(() =>
			db.asUser(admin.id, (q) =>
				q(`insert into storage.objects (bucket_id, name, owner) values ('foundry-bundles', $1, $2)`, [
					'app-3/version-3/index.html',
					admin.id
				])
			)
		);
		expect(asAdmin).toContain('row-level security');

		/*
		 * OVERWRITING THE PUBLISHED OBJECT IS THE SPECIFIC ATTACK THE READ
		 * POLICY MUST NOT HAVE BROUGHT WITH IT, and it is asserted as a ROW
		 * COUNT rather than as an exception, which is the trap here.
		 *
		 * An INSERT with no matching WITH CHECK raises. An UPDATE or DELETE
		 * with no matching policy DOES NOT: the rows simply fall out of the
		 * command's own view and it reports success having changed nothing.
		 * That difference matters more now than it did under 0130, because the
		 * new SELECT policy makes these rows VISIBLE -- so the statement finds
		 * the row, is refused the write, and says nothing at all. A test
		 * written to expect a throw here would fail while the database was
		 * behaving correctly, and one written to expect success would pass
		 * while it was not.
		 */
		const overwrite = await db.asUser(other.id, async (q) => {
			const { rowCount } = await q(
				`update storage.objects set name = $1
				  where bucket_id = 'foundry-bundles' and name = $2`,
				['app-1/version-1/evil.html', 'app-1/version-1/index.html']
			);
			return rowCount;
		});
		expect(overwrite).toBe(0);

		const remove = await db.asUser(other.id, async (q) => {
			const { rowCount } = await q(
				`delete from storage.objects where bucket_id = 'foundry-bundles' and name = $1`,
				['app-1/version-1/index.html']
			);
			return rowCount;
		});
		expect(remove).toBe(0);

		// AND THE OBJECT IS STILL THERE UNDER ITS ORIGINAL NAME. Two zeroes
		// above could also mean the row was never found; this says it was.
		const survivors = await db.sql<{ name: string }>(
			`select name from storage.objects
			  where bucket_id = 'foundry-bundles' and name = 'app-1/version-1/index.html'`
		);
		expect(survivors.rows).toHaveLength(1);

		// POSITIVE CONTROL: the extraction function's role still writes, so the
		// four refusals above are RLS and not a missing table grant.
		const service = await db.asServiceRole(async (q) => {
			const { rowCount } = await q(
				`insert into storage.objects (bucket_id, name) values ('foundry-bundles', $1)`,
				['app-9/version-9/index.html']
			);
			return rowCount;
		});
		expect(service).toBe(1);
	});

	/**
	 * THE UPLOAD BUCKET IS THE CONTROL FOR THE WHOLE FILE. If 0135 had somehow
	 * opened storage generally rather than one bucket, this would go green
	 * where it should stay red -- and every assertion above would still pass.
	 */
	it("does not touch foundry-uploads: a stranger still cannot read another student's zip", async () => {
		await db.asServiceRole((q) =>
			q(`insert into storage.objects (bucket_id, name, owner) values ('foundry-uploads', $1, $2)`, [
				`${student.id}/private.zip`,
				student.id
			])
		);

		const stranger = await db.asUser(other.id, async (q) => {
			const { rows } = await q(
				`select name from storage.objects where bucket_id = 'foundry-uploads'`
			);
			return rows.length;
		});
		expect(stranger).toBe(0);

		// POSITIVE CONTROL: the owner sees their own, so the 0 above is the
		// own-prefix rule and not an empty table.
		const mine = await db.asUser(student.id, async (q) => {
			const { rows } = await q(
				`select name from storage.objects where bucket_id = 'foundry-uploads'`
			);
			return rows.length;
		});
		expect(mine).toBe(1);
	});
});

describe('0135 // re-applying it is ordinary', () => {
	/**
	 * A re-paste is a normal event here -- someone runs the file twice, or a
	 * first attempt failed partway. A migration that only works once fails
	 * exactly then, with the schema half-built.
	 */
	it('applies a second time with the same result', async () => {
		const sql = await import('node:fs/promises').then((fs) =>
			fs.readFile(
				new URL('../supabase/migrations/0135_foundry_public_bundles.sql', import.meta.url),
				'utf8'
			)
		);
		await db.sql(sql);

		const { rows } = await db.sql<{ public: boolean }>(
			`select public from storage.buckets where id = 'foundry-bundles'`
		);
		expect(rows[0].public).toBe(true);

		const { rows: policies } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_policies
			  where schemaname = 'storage' and tablename = 'objects'
			    and qual like '%foundry-bundles%'`
		);
		expect(policies[0].n).toBe('1');
	});
});

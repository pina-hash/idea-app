// tests/db/foundry-cover-private-bucket.test.ts
//
// 0057 PHASE B1: THE FOUR CONTROLS FOR 0183, EACH WITH ITS MUTATION.
//
// The BEFORE picture is measured here too rather than in a second file: the
// last describe boots the chain SHORT of 0183, seeds an object through the
// real pre-migration upload path, proves the exposure, then applies the file
// over the top and proves the closure on the same database. That is the only
// arrangement that says anything about the objects production already holds.
//
// WHY THE MEASUREMENT AND NOT THE POLICY TEXT. Every fact 0183's header
// asserts is one a comment asserts, and a comment is not a boundary. The four
// cases prompt 0057 asks for:
//
//   1. anon reads a known key                       -> REFUSED
//   2. anon LISTS the bucket                        -> REFUSED
//   3. the owner reads their own                    -> ALLOWED
//   4. a signed-in PEER reads one they may see      -> ALLOWED
//
// Case 4 is the decision rather than a gap: `/foundry` is in `authedPrefixes`
// and the gallery deliberately shows every signed-in student every published
// app, so `to authenticated` is exactly that tier. It is asserted so a later
// bundle narrowing it has to come here and say so.
//
// EVERY MUTATION IS APPLIED TO A THROWAWAY DATABASE AT THE SQL LEVEL, never to
// a file on disk -- so there is no file to restore and no `git checkout --`
// anywhere near this suite. The permissive direction is the one CLAUDE.md
// names: a policy merely dropped fails closed and would redden nothing here,
// because closed is what this file asserts.
//
// The stub does not carry the table GRANTS a real Supabase project hands
// `authenticated` and `anon`, so they are added below to match production.
// Control 3's mutation is what says the grant really landed.

import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

const MIGRATION_0183 = readFileSync(
	join(process.cwd(), 'supabase', 'migrations', '0183_foundry_covers_private.sql'),
	'utf8'
);
const apply0183 = (d: TestDb) => d.sql(MIGRATION_0183);

/**
 * 0130's own dependency chain, taken from `tests/foundry-policies.test.ts` so
 * the two files agree about what a Foundry database is, plus 0062 -- because
 * the last describe asserts what this migration does NOT do to
 * `tournament-thumbs`, and a bucket that is not there cannot be asserted about.
 */
const BEFORE = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0004_gauntlet.sql',
	'0020_profiles_identity.sql',
	'0062_tournaments.sql',
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
const AFTER = [...BEFORE, '0183_foundry_covers_private.sql'] as const;

const BUCKET = 'foundry-covers';

/** The production grants the stub omits. Applied identically to every database here. */
async function grantLikeProduction(d: TestDb) {
	await d.sql(
		`grant select, insert, update, delete on storage.objects to authenticated, service_role`
	);
	await d.sql(`grant select on storage.objects to anon`);
	await d.sql(`grant select on storage.buckets to anon, authenticated, service_role`);
}

/** Reads one object's row the way a client select would. */
async function canRead(
	q: (sql: string, p?: unknown[]) => Promise<{ rows: { n: string }[] }>,
	key: string,
	bucket = BUCKET
) {
	const res = await q(
		`select count(*)::text as n from storage.objects where bucket_id = $1 and name = $2`,
		[bucket, key]
	);
	return Number(res.rows[0].n);
}

/** Every object name the caller can see with NO key known in advance. */
async function canList(
	q: (sql: string, p?: unknown[]) => Promise<{ rows: { name: string }[] }>,
	bucket = BUCKET
) {
	const res = await q(`select name from storage.objects where bucket_id = $1 order by name`, [
		bucket
	]);
	return res.rows.map((r) => r.name);
}

let db: TestDb;
let alice: SeededUser;
let bruno: SeededUser;
let aliceKey: string;

beforeAll(async () => {
	db = await startTestDb([...AFTER]);
	await grantLikeProduction(db);
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bruno = await createUser(db, 'bruno@boscotech.net', 'Bruno Barros');
	// The shape all three upload sites produce: `<uid>/<uuid>.<ext>`.
	aliceKey = `${alice.id}/6f1d2b4e-6a5c-4f0e-9d1a-2b3c4d5e6f70.png`;
	// Written through the bucket's OWN write policy, which 0183 does not touch
	// and which this line is the first proof of.
	await db.asUser(alice.id, (q) =>
		q(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [BUCKET, aliceKey])
	);
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

describe('0183 closes the foundry-covers bucket', () => {
	test('THE BUCKET IS PRIVATE, in the column and not only in the prose', async () => {
		const res = await db.sql<{ public: boolean }>(
			`select public from storage.buckets where id = $1`,
			[BUCKET]
		);
		expect(res.rows[0].public).toBe(false);
	});

	test('NO SELECT POLICY ON THIS BUCKET NAMES `public` OR `anon` ANY MORE', async () => {
		// Asked by ROLE rather than by policy name, so a policy added later
		// under some other name is caught by the same assertion.
		const res = await db.sql<{ policyname: string }>(
			`select policyname from pg_policies
			 where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'
			   and qual like '%foundry-covers%'
			   and (roles::text[] && array['public', 'anon'])`
		);
		expect(res.rows.map((r) => r.policyname)).toEqual([]);
	});

	test("0130'S THREE WRITE POLICIES SURVIVED -- this file narrows reads and nothing else", async () => {
		// The upload path and `POST /api/foundry/delete`'s sweep both depend on
		// them, so losing one here would be a regression wearing a tidy-up's
		// clothes.
		const res = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_policies
			 where schemaname = 'storage' and tablename = 'objects'
			   and policyname in (
			     'foundry covers insert own folder',
			     'foundry covers update own folder',
			     'foundry covers delete own folder'
			   )`
		);
		expect(Number(res.rows[0].n)).toBe(3);
	});

	test('THE OTHER TWO FOUNDRY BUCKETS ARE UNTOUCHED', async () => {
		// `foundry-bundles` carries NO policy at all and that absence is the
		// mechanism; `foundry-uploads` is write-only plus 0131's own-folder
		// read. A file that widened either while narrowing this one would pass
		// every assertion above.
		const res = await db.sql<{ id: string; public: boolean }>(
			`select id, public from storage.buckets
			 where id in ('foundry-uploads','foundry-bundles') order by id`
		);
		expect(res.rows).toEqual([
			{ id: 'foundry-bundles', public: false },
			{ id: 'foundry-uploads', public: false }
		]);
		const bundles = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_policies
			 where schemaname = 'storage' and tablename = 'objects'
			   and qual like '%foundry-bundles%'`
		);
		expect(Number(bundles.rows[0].n)).toBe(0);
	});
});

describe('CONTROL 1 and 2 -- an anonymous caller', () => {
	test('READS NOTHING: not even the object it knows the key of', async () => {
		expect(await db.asAnon((q) => canRead(q, aliceKey))).toBe(0);
	});

	test('AND CANNOT LIST, which is the half that made the old bucket worse than guessable', async () => {
		expect(await db.asAnon((q) => canList(q))).toEqual([]);
	});

	test("THE MUTATION: put 0130's `to public` policy back and BOTH of those flip", async () => {
		const leak = await startTestDb([...AFTER]);
		try {
			await grantLikeProduction(leak);
			const u = await createUser(leak, 'alice@boscotech.net', 'Alice Alvarez');
			const key = `${u.id}/6f1d2b4e-6a5c-4f0e-9d1a-2b3c4d5e6f70.png`;
			await leak.asUser(u.id, (q) =>
				q(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [BUCKET, key])
			);
			// Sanity: closed before the mutation, on this database too.
			expect(await leak.asAnon((q) => canRead(q, key))).toBe(0);

			await leak.sql(`create policy "foundry covers public read" on storage.objects
				for select to public using (bucket_id = 'foundry-covers')`);

			expect(await leak.asAnon((q) => canRead(q, key))).toBe(1);
			expect(await leak.asAnon((q) => canList(q))).toEqual([key]);
		} finally {
			await leak.stop();
		}
	}, 240_000);
});

describe('CONTROL 3 -- the owner', () => {
	test('READS THEIR OWN COVER', async () => {
		expect(await db.asUser(alice.id, (q) => canRead(q, aliceKey))).toBe(1);
	});

	test('AND STILL WRITES THEIR OWN: 0183 did not cost the upload path', async () => {
		const second = `${alice.id}/aa11bb22-cc33-dd44-ee55-ff6677889900.png`;
		await db.asUser(alice.id, (q) =>
			q(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [BUCKET, second])
		);
		expect(await db.asUser(alice.id, (q) => canRead(q, second))).toBe(1);
	});

	test('THE MUTATION: break the GRANT and the permitted read stops -- so the grant is what carried it', async () => {
		// The two ways a permitted read can be permitted are the POLICY and the
		// table GRANT, and a suite that only ever adds grants cannot tell which
		// one it is measuring.
		const noGrant = await startTestDb([...AFTER]);
		try {
			await grantLikeProduction(noGrant);
			const u = await createUser(noGrant, 'alice@boscotech.net', 'Alice Alvarez');
			const key = `${u.id}/6f1d2b4e-6a5c-4f0e-9d1a-2b3c4d5e6f70.png`;
			await noGrant.asUser(u.id, (q) =>
				q(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [BUCKET, key])
			);
			expect(await noGrant.asUser(u.id, (q) => canRead(q, key))).toBe(1);

			await noGrant.sql(`revoke select on storage.objects from authenticated`);

			await expect(noGrant.asUser(u.id, (q) => canRead(q, key))).rejects.toThrow(
				/permission denied/i
			);
			// And the policy is still there, so the refusal above is the grant's.
			const still = await noGrant.sql<{ n: string }>(
				`select count(*)::text as n from pg_policies
				 where schemaname = 'storage' and tablename = 'objects'
				   and policyname = 'foundry covers authenticated read'`
			);
			expect(Number(still.rows[0].n)).toBe(1);
		} finally {
			await noGrant.stop();
		}
	}, 240_000);
});

describe('CONTROL 4 -- a signed-in peer with no relationship to the owner', () => {
	test('READS IT, and that is the DECISION rather than a gap', async () => {
		// The gallery shows every signed-in student every published app, and
		// every surface that renders a cover is under `/foundry`, which is in
		// `authedPrefixes`. A per-viewer rule here would break the gallery while
		// claiming to fix a bucket.
		expect(await db.asUser(bruno.id, (q) => canRead(q, aliceKey))).toBe(1);
	});

	test('AND STILL CANNOT WRITE INTO HER FOLDER -- the control that says RLS is on at all', async () => {
		// If the select above passed because RLS was simply off, this would pass
		// too. It must not.
		await expect(
			db.asUser(bruno.id, (q) =>
				q(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [
					BUCKET,
					`${alice.id}/forged.png`
				])
			)
		).rejects.toThrow(/row-level security/i);
	});

	test('THE MUTATION: narrow the policy to own-folder and control 4 flips while control 3 holds', async () => {
		// The permissive direction is control 1's mutation; this is the other
		// one, and it is what makes control 4 an assertion rather than a
		// restatement of "the policy admits authenticated". Narrowed, the owner
		// still reads and the peer stops -- which is exactly the change a later
		// bundle would be making, so this test is where it has to argue for it.
		const narrow = await startTestDb([...AFTER]);
		try {
			await grantLikeProduction(narrow);
			const a = await createUser(narrow, 'alice@boscotech.net', 'Alice Alvarez');
			const b = await createUser(narrow, 'bruno@boscotech.net', 'Bruno Barros');
			const key = `${a.id}/6f1d2b4e-6a5c-4f0e-9d1a-2b3c4d5e6f70.png`;
			await narrow.asUser(a.id, (q) =>
				q(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [BUCKET, key])
			);
			expect(await narrow.asUser(b.id, (q) => canRead(q, key))).toBe(1);

			await narrow.sql(`drop policy "foundry covers authenticated read" on storage.objects`);
			await narrow.sql(`create policy "foundry covers authenticated read" on storage.objects
				for select to authenticated
				using (bucket_id = 'foundry-covers'
				       and (storage.foldername(name))[1] = (select auth.uid())::text)`);

			expect(await narrow.asUser(b.id, (q) => canRead(q, key))).toBe(0);
			expect(await narrow.asUser(a.id, (q) => canRead(q, key))).toBe(1);
		} finally {
			await narrow.stop();
		}
	}, 240_000);
});

describe('0183 over a database that already holds covers', () => {
	// CLAUDE.md's migration rule: boot the chain SHORT of the file, seed
	// through the real pre-migration path, then apply the file over the top. A
	// reset chain says the end state is reachable; it says nothing about
	// whether the objects already in the bucket survive it, which is the only
	// question production has.
	test('every existing object survives, keeps its key, and stops being anonymous', async () => {
		const d = await startTestDb([...BEFORE]);
		try {
			await grantLikeProduction(d);
			const u = await createUser(d, 'alice@boscotech.net', 'Alice Alvarez');
			const key = `${u.id}/6f1d2b4e-6a5c-4f0e-9d1a-2b3c4d5e6f70.png`;
			await d.asUser(u.id, (q) =>
				q(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [BUCKET, key])
			);
			// THE WORLD AS IT IS TODAY, measured rather than read off 0130: an
			// anonymous caller reads it, AND can list it.
			expect(await d.asAnon((q) => canRead(q, key))).toBe(1);
			expect(await d.asAnon((q) => canList(q))).toEqual([key]);
			// 0052's control, re-run here: the listing above is the POLICY and
			// not RLS being off, because the same connection is refused a table
			// no policy admits it to.
			await expect(d.asAnon((q) => q(`select count(*) from public.profiles`))).rejects.toThrow(
				/permission denied/i
			);

			await apply0183(d);

			// The object is still there, under the same key -- so every
			// `student_apps.cover_path` still names it and nothing needed
			// backfilling.
			const stillThere = await d
				.sql<{ n: string }>(
					`select count(*)::text as n from storage.objects where bucket_id = $1 and name = $2`,
					[BUCKET, key]
				)
				.then((r) => Number(r.rows[0].n));
			expect(stillThere).toBe(1);
			expect(await d.asUser(u.id, (q) => canRead(q, key))).toBe(1);
			// And the thing that changed.
			expect(await d.asAnon((q) => canRead(q, key))).toBe(0);
			expect(await d.asAnon((q) => canList(q))).toEqual([]);
		} finally {
			await d.stop();
		}
	}, 240_000);

	test('IT RE-APPLIES. Re-pasting a migration is ordinary and must not half-build anything', async () => {
		// The self-check inside the file raises on a partial apply, so a second
		// paste that left the policy dropped and not recreated would throw here
		// rather than pass quietly.
		const d = await startTestDb([...AFTER]);
		try {
			await grantLikeProduction(d);
			await apply0183(d);
			await apply0183(d);
			const res = await d.sql<{ public: boolean }>(
				`select public from storage.buckets where id = $1`,
				[BUCKET]
			);
			expect(res.rows[0].public).toBe(false);
			const pol = await d.sql<{ n: string }>(
				`select count(*)::text as n from pg_policies
				 where schemaname = 'storage' and tablename = 'objects'
				   and policyname = 'foundry covers authenticated read'`
			);
			expect(Number(pol.rows[0].n)).toBe(1);
		} finally {
			await d.stop();
		}
	}, 240_000);

	test('THE STATED UNDO REALLY REOPENS IT -- the 8am move, run rather than written down', async () => {
		// 0183's header offers three statements as the reversal. A reversal
		// nobody has executed is a paragraph, so it is executed here, and the
		// bucket has to come back to exactly the state 0130 left it in.
		const d = await startTestDb([...AFTER]);
		try {
			await grantLikeProduction(d);
			const u = await createUser(d, 'alice@boscotech.net', 'Alice Alvarez');
			const key = `${u.id}/6f1d2b4e-6a5c-4f0e-9d1a-2b3c4d5e6f70.png`;
			await d.asUser(u.id, (q) =>
				q(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [BUCKET, key])
			);
			expect(await d.asAnon((q) => canRead(q, key))).toBe(0);

			await d.sql(`update storage.buckets set public = true where id = 'foundry-covers'`);
			await d.sql(
				`drop policy if exists "foundry covers authenticated read" on storage.objects`
			);
			await d.sql(`create policy "foundry covers public read" on storage.objects for select
				to public using (bucket_id = 'foundry-covers')`);

			const pub = await d.sql<{ public: boolean }>(
				`select public from storage.buckets where id = $1`,
				[BUCKET]
			);
			expect(pub.rows[0].public).toBe(true);
			expect(await d.asAnon((q) => canRead(q, key))).toBe(1);
		} finally {
			await d.stop();
		}
	}, 240_000);
});

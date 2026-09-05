// tests/db/avatar-private-bucket.test.ts
//
// 0052 PHASE B3: THE THREE CONTROLS FOR 0181, EACH WITH ITS MUTATION.
//
// `tests/db/avatar-bucket-boundary.test.ts` is the BEFORE picture and stays
// exactly as 0033 wrote it: it applies 0001 + 0020 only, and it proves the
// exposure. This file applies 0181 on top of that same chain and proves the
// closure, so the two read as a pair and neither can be mistaken for the
// other.
//
// WHY THE MEASUREMENT AND NOT THE POLICY TEXT. Every fact here is one a
// migration comment already asserts, and a comment is not a boundary. The
// three cases the prompt asks for are:
//
//   1. `anon` reads an avatar object -> must be REFUSED, where it was
//      permitted before this file's migration.
//   2. A signed-in peer with no relationship to the owner -> must be
//      PERMITTED, because `to authenticated` is deliberately not a per-viewer
//      rule (see 0181's header, and the GAUNTLET leaderboard).
//   3. A caller who legitimately may see it -> must work, and the grant must
//      be what makes it work.
//
// EACH CONTROL IS MUTATED, and the mutations are what make the assertions
// worth reading. The permissive mutation is the one CLAUDE.md names: a policy
// commented out entirely fails closed and reddens almost nothing, while
// putting 0020's `to public` policy BACK reproduces the real leak. Every
// mutation is applied to the DATABASE (a fresh one, at the SQL level) and not
// to a file on disk, so there is no file to restore and no `git checkout --`
// anywhere near this suite.
//
// The stub does not carry the table GRANTS a real Supabase project hands
// `authenticated` and `anon`, exactly as tests/classroom-storage-objects.test.ts
// states about itself, so they are added below to match production. Control 3
// is what says the grant really landed.

import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

/**
 * Applies a migration file to an already-booted database, verbatim, exactly as
 * a person pastes it into the Supabase SQL editor. The house pattern in this
 * directory; there is no runner and this file does not invent one.
 */
const MIGRATION_0181 = readFileSync(
	join(process.cwd(), 'supabase', 'migrations', '0181_avatars_private.sql'),
	'utf8'
);
const apply0181 = (d: TestDb) => d.sql(MIGRATION_0181);

const BEFORE = ['0001_profiles.sql', '0020_profiles_identity.sql'] as const;
const AFTER = [...BEFORE, '0181_avatars_private.sql'] as const;

/** The production grants the stub omits. Applied identically to every database here. */
async function grantLikeProduction(d: TestDb) {
	await d.sql(`grant select, insert, update, delete on storage.objects to authenticated, service_role`);
	await d.sql(`grant select on storage.objects to anon`);
	await d.sql(`grant select on storage.buckets to anon, authenticated, service_role`);
}

/** Reads one object's row the way a client select would. 0033's helper, unchanged. */
async function canRead(
	q: (sql: string, p?: unknown[]) => Promise<{ rows: { n: string }[] }>,
	key: string
) {
	const res = await q(
		`select count(*)::text as n from storage.objects where bucket_id = 'avatars' and name = $1`,
		[key]
	);
	return Number(res.rows[0].n);
}

/** Every object name the caller can see with NO key known in advance. */
async function canList(q: (sql: string, p?: unknown[]) => Promise<{ rows: { name: string }[] }>) {
	const res = await q(`select name from storage.objects where bucket_id = 'avatars' order by name`);
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
	aliceKey = `${alice.id}/avatar-1757000000000.png`;
	// Alice uploads her own face, through the write policy that governs it --
	// which 0181 does not touch, and which this line is the first proof of.
	await db.asUser(alice.id, (q) =>
		q(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [aliceKey])
	);
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

describe('0181 closes the avatars bucket', () => {
	test('THE BUCKET IS PRIVATE, in the column and not only in the prose', async () => {
		const res = await db.sql<{ public: boolean }>(
			`select public from storage.buckets where id = 'avatars'`
		);
		expect(res.rows[0].public).toBe(false);
	});

	test('NO SELECT POLICY ON THIS BUCKET NAMES `public` OR `anon` ANY MORE', async () => {
		// Asked by ROLE rather than by policy name, so a policy added later under
		// some other name is caught by the same assertion.
		const res = await db.sql<{ policyname: string }>(
			`select policyname from pg_policies
			 where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'
			   and qual like '%avatars%'
			   and (roles::text[] && array['public', 'anon'])`
		);
		expect(res.rows.map((r) => r.policyname)).toEqual([]);
	});

	test("0020'S THREE WRITE POLICIES SURVIVED -- this file narrows reads and nothing else", async () => {
		const res = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_policies
			 where schemaname = 'storage' and tablename = 'objects'
			   and policyname in ('avatars insert own folder','avatars update own folder','avatars delete own folder')`
		);
		expect(Number(res.rows[0].n)).toBe(3);
	});
});

describe('CONTROL 1 -- an anonymous caller', () => {
	test('READS NOTHING: not the object it knows the key of', async () => {
		expect(await db.asAnon((q) => canRead(q, aliceKey))).toBe(0);
	});

	test('AND CANNOT LIST, which is the half that made the old bucket worse than guessable', async () => {
		expect(await db.asAnon((q) => canList(q))).toEqual([]);
	});

	test('THE MUTATION: put 0020\'s `to public` policy back and BOTH of those flip', async () => {
		// The permissive direction, per CLAUDE.md: a policy merely dropped fails
		// closed and would redden nothing here, because closed is what this suite
		// asserts. Restoring the real leak is what proves the assertions bite.
		const leak = await startTestDb([...AFTER]);
		try {
			await grantLikeProduction(leak);
			const u = await createUser(leak, 'alice@boscotech.net', 'Alice Alvarez');
			const key = `${u.id}/avatar-1757000000000.png`;
			await leak.asUser(u.id, (q) =>
				q(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [key])
			);
			// Sanity: closed before the mutation, on this database too.
			expect(await leak.asAnon((q) => canRead(q, key))).toBe(0);

			await leak.sql(`create policy "avatars public read" on storage.objects
				for select to public using (bucket_id = 'avatars')`);

			expect(await leak.asAnon((q) => canRead(q, key))).toBe(1);
			expect(await leak.asAnon((q) => canList(q))).toEqual([key]);
		} finally {
			await leak.stop();
		}
	}, 180_000);
});

describe('CONTROL 2 -- a signed-in peer with no relationship to the owner', () => {
	test('READS IT, and that is the DECISION rather than a gap', async () => {
		// 0181 is about the stranger, not about who may see whose face. Every
		// surface that renders an avatar is signed-in tier already, and the
		// GAUNTLET leaderboard has shown every student every other student's
		// face since 0024. Narrowing this would break that while claiming to fix
		// a bucket. The test asserts the decision so that a later bundle
		// narrowing it has to come here and say so.
		expect(await db.asUser(bruno.id, (q) => canRead(q, aliceKey))).toBe(1);
	});

	test('AND STILL CANNOT WRITE INTO HER FOLDER -- the control that says RLS is on at all', async () => {
		// If the select above passed because RLS was simply off, this would pass
		// too. It must not.
		await expect(
			db.asUser(bruno.id, (q) =>
				q(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [
					`${alice.id}/forged.png`
				])
			)
		).rejects.toThrow(/row-level security/i);
	});
});

describe('CONTROL 3 -- a caller who legitimately may see it', () => {
	test('THE OWNER READS HER OWN', async () => {
		expect(await db.asUser(alice.id, (q) => canRead(q, aliceKey))).toBe(1);
	});

	test('AND SHE STILL WRITES HER OWN: 0181 did not cost the upload path', async () => {
		const second = `${alice.id}/avatar-1757000000009.png`;
		await db.asUser(alice.id, (q) =>
			q(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [second])
		);
		expect(await db.asUser(alice.id, (q) => canRead(q, second))).toBe(1);
	});

	test('THE MUTATION: break the GRANT and the permitted read stops -- so the grant is what carried it', async () => {
		// The two ways a permitted read can be permitted are the POLICY and the
		// table GRANT, and a suite that only ever adds grants cannot tell which
		// one it is measuring. Revoking the grant on a throwaway database is what
		// separates them: the policy is untouched and the read still fails.
		const noGrant = await startTestDb([...AFTER]);
		try {
			await grantLikeProduction(noGrant);
			const u = await createUser(noGrant, 'alice@boscotech.net', 'Alice Alvarez');
			const key = `${u.id}/avatar-1757000000000.png`;
			await noGrant.asUser(u.id, (q) =>
				q(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [key])
			);
			// Positive control first: it works while the grant is there.
			expect(await noGrant.asUser(u.id, (q) => canRead(q, key))).toBe(1);

			await noGrant.sql(`revoke select on storage.objects from authenticated`);

			await expect(noGrant.asUser(u.id, (q) => canRead(q, key))).rejects.toThrow(
				/permission denied/i
			);
			// And the policy is still there, so the refusal above is the grant's.
			const still = await noGrant.sql<{ n: string }>(
				`select count(*)::text as n from pg_policies
				 where schemaname = 'storage' and tablename = 'objects'
				   and policyname = 'avatars authenticated read'`
			);
			expect(Number(still.rows[0].n)).toBe(1);
		} finally {
			await noGrant.stop();
		}
	}, 180_000);
});

describe('0181 over a database that already holds avatars', () => {
	// CLAUDE.md's migration rule: boot the chain SHORT of the file, seed
	// through the real pre-migration path, then apply the file over the top.
	// A reset chain says the end state is reachable; it says nothing about
	// whether the objects already in the bucket survive it, which is the only
	// question production has.
	test('every existing object survives, keeps its key, and stops being anonymous', async () => {
		const d = await startTestDb([...BEFORE]);
		try {
			await grantLikeProduction(d);
			const u = await createUser(d, 'alice@boscotech.net', 'Alice Alvarez');
			const key = `${u.id}/avatar-1757000000000.png`;
			await d.asUser(u.id, (q) =>
				q(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [key])
			);
			// The world as it is today: anon reads it, and can list it.
			expect(await d.asAnon((q) => canRead(q, key))).toBe(1);
			expect(await d.asAnon((q) => canList(q))).toEqual([key]);

			await apply0181(d);

			// The object is still there, under the same key -- so every
			// `profiles.avatar` value of the form `upload:<key>` still names it
			// and nothing needed backfilling.
			expect(await d.sql<{ n: string }>(
				`select count(*)::text as n from storage.objects where bucket_id = 'avatars' and name = $1`,
				[key]
			).then((r) => Number(r.rows[0].n))).toBe(1);
			expect(await d.asUser(u.id, (q) => canRead(q, key))).toBe(1);
			// And the thing that changed.
			expect(await d.asAnon((q) => canRead(q, key))).toBe(0);
			expect(await d.asAnon((q) => canList(q))).toEqual([]);
		} finally {
			await d.stop();
		}
	}, 180_000);

	test('IT RE-APPLIES. Re-pasting a migration is ordinary and must not half-build anything', async () => {
		// The self-check inside the file raises on a partial apply, so a second
		// paste that left the policy dropped and not recreated would throw here
		// rather than pass quietly.
		const d = await startTestDb([...AFTER]);
		try {
			await grantLikeProduction(d);
			await apply0181(d);
			await apply0181(d);
			const res = await d.sql<{ public: boolean }>(
				`select public from storage.buckets where id = 'avatars'`
			);
			expect(res.rows[0].public).toBe(false);
			const pol = await d.sql<{ n: string }>(
				`select count(*)::text as n from pg_policies
				 where schemaname = 'storage' and tablename = 'objects'
				   and policyname = 'avatars authenticated read'`
			);
			expect(Number(pol.rows[0].n)).toBe(1);
		} finally {
			await d.stop();
		}
	}, 180_000);
});

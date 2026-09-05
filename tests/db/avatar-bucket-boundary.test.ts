// tests/db/avatar-bucket-boundary.test.ts
//
// 0033 PHASE A1: WHO CAN READ AN AVATAR OBJECT, MEASURED RATHER THAN READ OFF
// THE POLICY.
//
// The whole privacy argument of this bundle rests on one fact, and a fact that
// important is not taken from a migration's own comment. `0020_profiles_
// identity.sql` creates the `avatars` bucket with `public = true` and a select
// policy `to public using (bucket_id = 'avatars')`, and says in prose that
// "avatars are non-sensitive by design (they render on public leaderboards)".
// This file puts that sentence to a real Postgres with the real migration
// applied and reports what actually happens.
//
// IT IS DELIBERATELY NOT A DENIAL SUITE. Every other storage test in this
// directory proves a refusal; this one proves the OPPOSITE, because the
// finding that matters here is that there is no read boundary at all. A test
// that only asserted "alice can read her own" would pass identically on a
// private bucket and would have told the next reader nothing.
//
// The stub does not carry the table GRANTS a real Supabase project hands
// `authenticated` and `anon`, exactly as tests/classroom-storage-objects.test.ts
// states about itself, so they are added below to match production. The
// permitted-caller controls are what say the grant really landed.

import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

const MIGRATIONS = ['0001_profiles.sql', '0020_profiles_identity.sql'] as const;

let db: TestDb;
let alice: SeededUser;
let bruno: SeededUser;

/** Reads one object's row the way a client select would. */
async function canRead(q: (sql: string, p?: unknown[]) => Promise<{ rows: { n: string }[] }>, key: string) {
	const res = await q(`select count(*)::text as n from storage.objects where bucket_id = 'avatars' and name = $1`, [key]);
	return Number(res.rows[0].n);
}

beforeAll(async () => {
	db = await startTestDb([...MIGRATIONS]);
	await db.sql(`grant select, insert, update, delete on storage.objects to authenticated, service_role`);
	await db.sql(`grant select on storage.objects to anon`);
	await db.sql(`grant select on storage.buckets to anon, authenticated, service_role`);
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bruno = await createUser(db, 'bruno@boscotech.net', 'Bruno Barros');
	// Alice uploads her own face, through the policy that governs writes.
	await db.asUser(alice.id, (q) =>
		q(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${alice.id}/avatar-1.png`])
	);
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

describe('the avatars bucket read boundary', () => {
	test('THE BUCKET IS PUBLIC, in the column and not only in the prose', async () => {
		const res = await db.sql(`select public from storage.buckets where id = 'avatars'`);
		expect(res.rows[0].public).toBe(true);
	});

	test("A GENUINELY ANONYMOUS CALLER READS ANOTHER PERSON'S AVATAR OBJECT", async () => {
		// This is the finding. It is not a defect to fix here -- 0020 chose it
		// deliberately and the GAUNTLET leaderboard depends on it -- but every
		// surface decision in this bundle has to be made knowing it.
		const n = await db.asAnon((q) => canRead(q, `${alice.id}/avatar-1.png`));
		expect(n).toBe(1);
	});

	test('A SIGNED-IN NON-STAFF PEER READS IT TOO', async () => {
		const n = await db.asUser(bruno.id, (q) => canRead(q, `${alice.id}/avatar-1.png`));
		expect(n).toBe(1);
	});

	test('WRITES ARE OWN-FOLDER ONLY -- the control that says the policies are real', async () => {
		// If the select above passed because RLS was simply off, this would pass
		// too. It must not.
		await expect(
			db.asUser(bruno.id, (q) =>
				q(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${alice.id}/forged.png`])
			)
		).rejects.toThrow(/row-level security/i);
	});

	test('AND BRUNO CAN WRITE HIS OWN -- the positive control for that refusal', async () => {
		await db.asUser(bruno.id, (q) =>
			q(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${bruno.id}/avatar-1.png`])
		);
		expect(await db.asAnon((q) => canRead(q, `${bruno.id}/avatar-1.png`))).toBe(1);
	});

	test("BUT THE PATH IS NOT: `profiles.avatar` is own-row-or-admin, so a peer cannot LEARN alice's key", async () => {
		// The bytes are open; the pointer is not. That asymmetry is the whole of
		// what protects a face today, and it is why a surface that PROJECTS
		// `avatar` past RLS is making a disclosure decision rather than a
		// rendering one.
		const mine = await db.asUser(bruno.id, (q) =>
			q(`select count(*)::text as n from public.profiles where id = $1`, [bruno.id])
		);
		expect(Number(mine.rows[0].n)).toBe(1);
		const theirs = await db.asUser(bruno.id, (q) =>
			q(`select count(*)::text as n from public.profiles where id = $1`, [alice.id])
		);
		expect(Number(theirs.rows[0].n)).toBe(0);
	});
});

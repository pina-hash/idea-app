// tests/db/tournament-thumb-stays-public.test.ts
//
// 0057 PHASE A3/B1: THE BUCKET THIS BUNDLE DELIBERATELY DID NOT CLOSE.
//
// Prompt 0052's sweep named three buckets with one shape -- `avatars` (closed
// by 0181), `foundry-covers` (closed by 0183) and `tournament-thumbs`. This
// file is why the third is still open, written as assertions rather than as a
// paragraph, because "left alone on purpose" and "forgotten" look identical in
// a schema and only one of them is defensible.
//
// THE EXPOSURE IS REAL AND IS MEASURED HERE, not softened: an anonymous caller
// reads a known key AND lists every key in the bucket, exactly as it could in
// `foundry-covers` before 0183.
//
// WHAT MAKES IT A DIFFERENT DECISION IS THE AUDIENCE, and that is measured
// here too. `0062_tournaments.sql` grants `select` on every tournament table
// to `anon` under `using (true)`, `/tournaments` is not in `authedPrefixes`,
// and the `[id]` page load's own header says "fully PUBLIC (no session, no
// cookie needed)". So `to authenticated` on this bucket is not a fix, it is a
// public bracket that stops showing thumbnails -- and the prompt that
// commissioned this work says so in as many words.
//
// AND THE SHAPE OF WHAT LEAKS IS DIFFERENT. `tournament_entries.thumbnail_url`
// stores the WHOLE PUBLIC URL in a table any anonymous caller may select, so
// for an ENTRY thumbnail the storage listing is a second door to a room whose
// front door is deliberately open. The final test measures exactly that: what
// the listing adds over the public table is the objects no public row names --
// 0064's banner art, and replaced or orphaned uploads. That residue is the
// whole of what a future narrowing would buy, and it is quantified rather than
// described so whoever owns the decision can see its size.

import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

const BUCKET = 'tournament-thumbs';

const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0004_gauntlet.sql',
	'0020_profiles_identity.sql',
	'0062_tournaments.sql'
] as const;

// 0064 (entry banner styles) is NOT in the chain, and its absence changes
// nothing this file measures. It adds style COLUMNS and reuses 0062's bucket
// verbatim -- "No new bucket: banner art and entry thumbnails have identical
// visibility and identical ownership rules" is its own comment -- so the
// policy governing the banner object below is 0062's either way. It is left
// out because it declares a Realtime publication the stub does not create,
// which would make this file fail for a reason unrelated to its subject.

async function grantLikeProduction(d: TestDb) {
	await d.sql(
		`grant select, insert, update, delete on storage.objects to authenticated, service_role`
	);
	await d.sql(`grant select on storage.objects to anon`);
	await d.sql(`grant select on storage.buckets to anon, authenticated, service_role`);
}

let db: TestDb;
let alice: SeededUser;
let thumbKey: string;
let bannerKey: string;

beforeAll(async () => {
	db = await startTestDb([...CHAIN]);
	await grantLikeProduction(db);
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	// The two shapes the page actually uploads: a registration thumbnail and,
	// since 0064, a banner background into the SAME bucket.
	thumbKey = `${alice.id}/1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f9.png`;
	bannerKey = `${alice.id}/bg-2a3b4c5d-6e7f-4081-9243-b5c6d7e8f9a0.png`;
	for (const key of [thumbKey, bannerKey]) {
		await db.asUser(alice.id, (q) =>
			q(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [BUCKET, key])
		);
	}
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

describe('the exposure, stated plainly rather than softened', () => {
	test('THE BUCKET IS STILL PUBLIC and an anonymous caller reads a known key', async () => {
		const pub = await db.sql<{ public: boolean }>(
			`select public from storage.buckets where id = $1`,
			[BUCKET]
		);
		expect(pub.rows[0].public).toBe(true);

		const n = await db.asAnon((q) =>
			q<{ n: string }>(
				`select count(*)::text as n from storage.objects where bucket_id = $1 and name = $2`,
				[BUCKET, thumbKey]
			)
		);
		expect(Number(n.rows[0].n)).toBe(1);
	});

	test('AND CAN LIST EVERY KEY, banner art included -- no guessing required', async () => {
		const listed = await db.asAnon((q) =>
			q<{ name: string }>(`select name from storage.objects where bucket_id = $1 order by name`, [
				BUCKET
			])
		);
		expect(listed.rows.map((r) => r.name).sort()).toEqual([thumbKey, bannerKey].sort());
	});

	test('0052\'S CONTROL: the listing is the POLICY, not RLS being off', async () => {
		// The same connection, a table no policy admits `anon` to. If this
		// passed, everything above would be measuring a database with RLS
		// disabled and would say nothing about the policy.
		await expect(db.asAnon((q) => q(`select count(*) from public.profiles`))).rejects.toThrow(
			/permission denied/i
		);
	});
});

describe('why it is not closed by the same migration that closed foundry-covers', () => {
	test('THE AUDIENCE IS ANONYMOUS BY DESIGN: every tournament table is `select to anon using (true)`', async () => {
		// 0062 builds these in a loop, so this is asked of the catalog rather
		// than of a list somebody typed -- a table added to that loop later is
		// covered by the same assertion.
		const res = await db.sql<{ tablename: string; roles: string; qual: string | null }>(
			`select tablename, roles::text as roles, qual from pg_policies
			 where schemaname = 'public' and tablename like 'tournament%' and cmd = 'SELECT'
			 order by tablename`
		);
		expect(res.rows.length).toBeGreaterThan(0);
		for (const row of res.rows) {
			expect(row.roles).toContain('anon');
			expect(row.qual).toBe('true');
		}
	});

	test('SO AN ANONYMOUS SPECTATOR READS THE THUMBNAIL URL OUT OF THE TABLE', async () => {
		// This is the finding that makes the storage listing a SECOND door for
		// an entry thumbnail: the first one is a public table, by design, and
		// closing storage would not close it.
		// Seeded as the CONNECTION OWNER: these two tables carry no client write
		// grant at all (every mutation is a SECURITY DEFINER RPC), so seeding
		// through a role would be measuring the write path rather than the read
		// one this test is about.
		const t = await db.sql<{ id: string }>(
			`insert into public.tournaments (name, description, config, status)
			 values ('Spring Scrimmage', '', '{}'::jsonb, 'registration_open') returning id`
		);
		const tid = t.rows[0].id;
		const publicUrl = `https://example-ref.supabase.co/storage/v1/object/public/${BUCKET}/${thumbKey}`;
		await db.sql(
			`insert into public.tournament_entries (tournament_id, user_id, display_name, description, thumbnail_url)
			 values ($1, $2, 'Team Bee', '', $3)`,
			[tid, alice.id, publicUrl]
		);

		const seen = await db.asAnon((q) =>
			q<{ thumbnail_url: string | null }>(
				`select thumbnail_url from public.tournament_entries where tournament_id = $1`,
				[tid]
			)
		);
		expect(seen.rows.map((r) => r.thumbnail_url)).toEqual([publicUrl]);
		// And the key inside it is the key the listing would have handed over.
		expect(seen.rows[0].thumbnail_url).toContain(thumbKey);
	});

	test('WHAT A FUTURE NARROWING WOULD ACTUALLY BUY: the objects no public row names', async () => {
		// Quantified rather than described. The banner object was uploaded into
		// the same bucket by 0064's own path and is named by NO
		// `thumbnail_url`, so it is reachable today only through the listing --
		// which is the entire residue a policy change would close, with the
		// bucket left `public = true` so the bracket keeps rendering.
		const named = await db.asAnon((q) =>
			q<{ thumbnail_url: string | null }>(
				`select thumbnail_url from public.tournament_entries where thumbnail_url is not null`
			)
		);
		const namedKeys = new Set(
			named.rows
				.map((r) => r.thumbnail_url ?? '')
				.map((u) => u.slice(u.indexOf(`${BUCKET}/`) + BUCKET.length + 1))
				.filter(Boolean)
		);
		const listed = await db.asAnon((q) =>
			q<{ name: string }>(`select name from storage.objects where bucket_id = $1`, [BUCKET])
		);
		const residue = listed.rows.map((r) => r.name).filter((n) => !namedKeys.has(n));

		// A positive control on the same reading: the entry thumbnail IS named,
		// so a suite that found "everything is residue" would be measuring a
		// broken key comparison rather than the real overlap.
		expect(namedKeys.has(thumbKey)).toBe(true);
		expect(residue).toEqual([bannerKey]);
	});
});

describe('0183 left this bucket exactly as it found it', () => {
	test('no policy on tournament-thumbs mentions foundry, and none was renamed', async () => {
		// The one migration this bundle ships names one bucket. If it ever
		// starts naming this one, it does so in a file of its own with its own
		// answer for the public bracket, and this assertion is where that has
		// to be argued.
		const res = await db.sql<{ policyname: string; roles: string }>(
			`select policyname, roles::text as roles from pg_policies
			 where schemaname = 'storage' and tablename = 'objects'
			   and qual like '%tournament-thumbs%' and cmd = 'SELECT'
			 order by policyname`
		);
		expect(res.rows.map((r) => r.policyname)).toEqual(['tournament thumbs public read']);
		expect(res.rows[0].roles).toContain('public');
	});
});

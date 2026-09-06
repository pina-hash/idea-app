// tests/db/tournament-thumbs-listing.test.ts
//
// 0076 PHASE A1/B1/B2/B5: THE LAST BUCKET ANYONE COULD ENUMERATE.
//
// `tests/db/tournament-thumb-stays-public.test.ts` (0057) measured this bucket
// wide open and argued it should STAY open, and it was right about the front
// door: `/tournaments` is a signed-out spectator surface and every tournament
// table is `select to anon using (true)`, so an entry thumbnail is public by
// design and closing storage would not close it.
//
// THIS FILE CORRECTS ONE READING IN THAT ONE AND CLOSES WHAT IS LEFT.
//
// The correction: that file leaves 0064 OUT of its chain, deliberately and for
// a good reason (0064 declares a Realtime publication the stub does not
// create), and therefore measures a database with no `tournament_entry_styles`
// in it. So the banner object it seeds is named by nothing, and it concludes --
// as does 0183's header, in the same words -- that the residue a narrowing
// would buy is "0064's banner art, and replaced or orphaned uploads". In
// PRODUCTION 0064 is applied and grants `anon` SELECT on
// `tournament_entry_styles` under `using (true)`, so `background_value` holds
// the whole public URL and a stranger reads it through the front door like
// every thumbnail. THE BANNER IS NOT RESIDUE. The orphans are, and they are all
// that is.
//
// THIS FILE PUTS 0064 IN THE CHAIN by creating the publication first and then
// applying the REAL migration file verbatim -- the "boot the chain short of the
// file, then apply the file over the top" shape, so nothing about 0064's own
// SQL is edited or reimplemented to make it fit.
//
// EVERY NUMBER BELOW IS MEASURED AS A GENUINELY ANONYMOUS CALLER (`set role
// anon`, no claims), with 0052's control on the same connection, and every
// absence assertion is paired with a positive control on the same reading.

import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

const BUCKET = 'tournament-thumbs';
const PROJECT = 'https://example-ref.supabase.co';
const publicUrl = (key: string) => `${PROJECT}/storage/v1/object/public/${BUCKET}/${key}`;

const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0004_gauntlet.sql',
	'0020_profiles_identity.sql',
	'0062_tournaments.sql'
] as const;

const MIGRATION_0064 = 'supabase/migrations/0064_tournament_entry_styles.sql';
const MIGRATION_0187 = 'supabase/migrations/0187_tournament_thumbs_no_anon_listing.sql';

/** The grants a hosted Supabase project carries on the storage schema. */
async function grantLikeProduction(d: TestDb) {
	await d.sql(
		`grant select, insert, update, delete on storage.objects to authenticated, service_role`
	);
	await d.sql(`grant select on storage.objects to anon`);
	await d.sql(`grant select on storage.buckets to anon, authenticated, service_role`);
}

let db: TestDb;
let alice: SeededUser;

/** An entry thumbnail on a LIVE tournament -- the ordinary spectator case. */
let liveThumbKey: string;
/**
 * An entry thumbnail on a DRAFT tournament. The prompt asked for "published"
 * and "unpublished"; there is NO published flag on an entry, and the nearest
 * thing -- `tournaments.status` -- is not a visibility gate either, because
 * 0062's loop puts `using (true)` on `tournaments` too. So this key is here to
 * MEASURE that degeneracy rather than to demonstrate a difference: it must come
 * out on the same side of every reading as the live one.
 */
let draftThumbKey: string;
/** An image banner named by tournament_entry_styles.background_value (0064). */
let bannerKey: string;
/**
 * An ORPHAN. Not a contrivance: both upload paths in
 * `src/routes/tournaments/[id]/+page.svelte` PUT the bytes before the row
 * exists, and the banner editor uploads again on every re-pick, so a refused
 * registration or a changed mind leaves exactly this behind. Nothing sweeps it.
 */
let orphanKey: string;

/** Keys an ANONYMOUS caller can list right now. */
async function anonListed(): Promise<string[]> {
	const r = await db.asAnon((q) =>
		q<{ name: string }>(`select name from storage.objects where bucket_id = $1 order by name`, [
			BUCKET
		])
	);
	return r.rows.map((x) => x.name);
}

/** Keys an ANONYMOUS caller can recover from the two public COLUMNS. */
async function anonNamedKeys(): Promise<{ fromEntries: string[]; fromStyles: string[] }> {
	const keyOf = (u: string) => {
		const marker = `/${BUCKET}/`;
		const i = u.indexOf(marker);
		return i < 0 ? '' : u.slice(i + marker.length);
	};
	const e = await db.asAnon((q) =>
		q<{ thumbnail_url: string }>(
			`select thumbnail_url from public.tournament_entries where thumbnail_url is not null`
		)
	);
	const s = await db.asAnon((q) =>
		q<{ url: string }>(
			`select background_value #>> '{}' as url from public.tournament_entry_styles
			 where background_type = 'image'`
		)
	);
	return {
		fromEntries: e.rows.map((r) => keyOf(r.thumbnail_url)).filter(Boolean),
		fromStyles: s.rows.map((r) => keyOf(r.url)).filter(Boolean)
	};
}

beforeAll(async () => {
	db = await startTestDb([...CHAIN]);
	await grantLikeProduction(db);
	// 0064's own guard asks whether the TABLE is in the publication, not whether
	// the publication exists, so with no `supabase_realtime` it reaches
	// `alter publication` and fails. The publication is Supabase platform
	// furniture that lives outside supabase/migrations, so creating it here is
	// the same job the stub does -- and 0064 itself is then applied VERBATIM.
	await db.sql(`create publication supabase_realtime`);
	await db.sql(readFileSync(MIGRATION_0064, 'utf8'));

	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');

	// The four key shapes the page actually writes.
	liveThumbKey = `${alice.id}/1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f9.png`;
	draftThumbKey = `${alice.id}/2a3b4c5d-6e7f-4081-9243-b5c6d7e8f9a0.png`;
	bannerKey = `${alice.id}/bg-3b4c5d6e-7f80-4192-a354-c6d7e8f9a0b1.png`;
	orphanKey = `${alice.id}/4c5d6e7f-8091-42a3-b465-d7e8f9a0b1c2.png`;
	for (const key of [liveThumbKey, draftThumbKey, bannerKey, orphanKey]) {
		await db.asUser(alice.id, (q) =>
			q(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [BUCKET, key])
		);
	}

	// Rows, seeded as the CONNECTION OWNER: these tables carry no client write
	// grant at all (every mutation is a SECURITY DEFINER RPC), so seeding
	// through a role would be measuring the write path rather than the read one
	// this file is about.
	const live = await db.sql<{ id: string }>(
		`insert into public.tournaments (name, description, config, status)
		 values ('Spring Scrimmage', '', '{}'::jsonb, 'live') returning id`
	);
	const draft = await db.sql<{ id: string }>(
		`insert into public.tournaments (name, description, config, status)
		 values ('Unannounced Cup', '', '{}'::jsonb, 'draft') returning id`
	);
	const liveEntry = await db.sql<{ id: string }>(
		`insert into public.tournament_entries (tournament_id, user_id, display_name, description, thumbnail_url)
		 values ($1, $2, 'Team Bee', '', $3) returning id`,
		[live.rows[0].id, alice.id, publicUrl(liveThumbKey)]
	);
	await db.sql(
		`insert into public.tournament_entries (tournament_id, display_name, description, thumbnail_url)
		 values ($1, 'Walk-up Wasp', '', $2)`,
		[draft.rows[0].id, publicUrl(draftThumbKey)]
	);
	await db.sql(
		`insert into public.tournament_entry_styles (entry_id, tournament_id, background_type, background_value)
		 values ($1, $2, 'image', to_jsonb($3::text))`,
		[liveEntry.rows[0].id, live.rows[0].id, publicUrl(bannerKey)]
	);
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// A1 -- the exposure as 0062 left it, and the two doors measured against each
// other. This is the whole question the bundle turns on.
// ---------------------------------------------------------------------------

describe('A1: the two doors, measured before anything is changed', () => {
	test('the bucket is public and an anonymous caller reads a known key', async () => {
		const pub = await db.sql<{ public: boolean }>(
			`select public from storage.buckets where id = $1`,
			[BUCKET]
		);
		expect(pub.rows[0].public).toBe(true);

		const n = await db.asAnon((q) =>
			q<{ n: string }>(
				`select count(*)::text as n from storage.objects where bucket_id = $1 and name = $2`,
				[BUCKET, liveThumbKey]
			)
		);
		expect(Number(n.rows[0].n)).toBe(1);
	});

	test('0052\'S CONTROL: the listing is the POLICY, not RLS being off', async () => {
		// The same connection, a table no policy admits `anon` to. If this
		// passed, every reading in this file would be measuring a database with
		// RLS disabled and would say nothing about any policy.
		await expect(db.asAnon((q) => q(`select count(*) from public.profiles`))).rejects.toThrow(
			/permission denied/i
		);
	});

	test('THE SECOND DOOR IS WIDER: anon lists 4 of 4, including the orphan', async () => {
		expect(await anonListed()).toEqual(
			[liveThumbKey, draftThumbKey, bannerKey, orphanKey].sort()
		);
	});

	test('THE FRONT DOOR IS 3 OF 4: thumbnail_url gives 2, background_value gives a third', async () => {
		const { fromEntries, fromStyles } = await anonNamedKeys();
		// The number the prompt asked for, on its own: what
		// `select thumbnail_url from public.tournament_entries` hands a stranger.
		expect(fromEntries.sort()).toEqual([liveThumbKey, draftThumbKey].sort());
		// And the reading 0183 and 0057 did not have, because their chain has no
		// 0064 in it: the banner is named by an anon-readable row too.
		expect(fromStyles).toEqual([bannerKey]);
		const named = new Set([...fromEntries, ...fromStyles]);
		expect(named.size).toBe(3);
		// So the residue -- and the entire size of this bundle -- is the orphan.
		expect((await anonListed()).filter((k) => !named.has(k))).toEqual([orphanKey]);
	});

	test('A DRAFT TOURNAMENT IS NOT A VISIBILITY GATE, which is why the two thumbs land together', async () => {
		// Asked of the catalog rather than of a list somebody typed, so a table
		// added to 0062's loop later is covered by the same assertion.
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
		// And behaviourally: the draft tournament's own row is readable too, so
		// there is no "unpublished entry" for a predicate to exclude.
		const seen = await db.asAnon((q) =>
			q<{ n: string }>(
				`select count(*)::text as n from public.tournaments where status = 'draft'`
			)
		);
		expect(Number(seen.rows[0].n)).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// B1 -- the migration, and what it actually changes.
// ---------------------------------------------------------------------------

describe('B1: 0187 closes the listing and leaves the public flag alone', () => {
	test('the migration applies, and re-applies (idempotence)', async () => {
		const text = readFileSync(MIGRATION_0187, 'utf8');
		await db.sql(text);
		await db.sql(text);
	});

	test('ANON NOW LISTS ONLY WHAT A ROW NAMES -- 3 of 4, the orphan gone', async () => {
		const listed = await anonListed();
		expect(listed).toEqual([liveThumbKey, draftThumbKey, bannerKey].sort());
		expect(listed).not.toContain(orphanKey);
		// Positive control on the same reading: the listing did not simply go
		// empty. A policy that admitted nothing would satisfy "the orphan is
		// gone" and would take every spectator thumbnail with it.
		expect(listed.length).toBe(3);
	});

	test('THE LISTING NOW MIRRORS THE FRONT DOOR EXACTLY -- the two doors are the same width', async () => {
		const { fromEntries, fromStyles } = await anonNamedKeys();
		expect((await anonListed()).sort()).toEqual([...fromEntries, ...fromStyles].sort());
	});

	test('THE BANNER SURVIVES, which is the half 0057 and 0183 would have got wrong', async () => {
		// If the predicate asked only `tournament_entries`, this key would have
		// been delisted with the orphan and an image banner would have stopped
		// being listable. Asserted on its own so a regression names itself.
		expect(await anonListed()).toContain(bannerKey);
	});

	test('THE BUCKET IS STILL PUBLIC and the spectator read path is untouched', async () => {
		const pub = await db.sql<{ public: boolean }>(
			`select public from storage.buckets where id = $1`,
			[BUCKET]
		);
		expect(pub.rows[0].public).toBe(true);
		// And the URLs the bracket renders are still readable out of the tables
		// with no session, which is what `<img src>` actually consumes.
		const e = await db.asAnon((q) =>
			q<{ n: string }>(
				`select count(*)::text as n from public.tournament_entries where thumbnail_url is not null`
			)
		);
		expect(Number(e.rows[0].n)).toBe(2);
	});

	test('A SIGNED-IN CALLER STILL LISTS THE WHOLE BUCKET -- the tier this file lands on', async () => {
		const r = await db.asUser(alice.id, (q) =>
			q<{ name: string }>(`select name from storage.objects where bucket_id = $1`, [BUCKET])
		);
		expect(r.rows.map((x) => x.name).sort()).toEqual(
			[liveThumbKey, draftThumbKey, bannerKey, orphanKey].sort()
		);
	});

	test("0062's three own-folder write policies are intact, and the old read policy is gone", async () => {
		const res = await db.sql<{ policyname: string; cmd: string; roles: string }>(
			`select policyname, cmd, roles::text as roles from pg_policies
			 where schemaname = 'storage' and tablename = 'objects'
			   and (qual like '%tournament-thumbs%' or with_check like '%tournament-thumbs%')
			 order by policyname`
		);
		const names = res.rows.map((r) => r.policyname);
		expect(names).not.toContain('tournament thumbs public read');
		for (const w of [
			'tournament thumbs insert own folder',
			'tournament thumbs update own folder',
			'tournament thumbs delete own folder'
		]) {
			expect(names).toContain(w);
		}
		const anon = res.rows.filter((r) => r.cmd === 'SELECT' && r.roles.includes('anon'));
		expect(anon.map((r) => r.policyname)).toEqual(['tournament_thumbs_named_read']);
	});
});

// ---------------------------------------------------------------------------
// B1's two positive controls. Each MUTATES ONE CLAUSE IN-DATABASE rather than
// editing the migration file, and the sound state is asserted first (above) so
// a broken fixture is told apart from a clause that matters.
// ---------------------------------------------------------------------------

describe('B1 controls: each clause is load-bearing, proved by removing it', () => {
	const restore = async () => {
		await db.sql(readFileSync(MIGRATION_0187, 'utf8'));
	};

	test('CONTROL 1 -- drop the scoping clause and anon lists everything again', async () => {
		// Sound state first, on this exact connection.
		expect(await anonListed()).toHaveLength(3);

		await db.sql(`drop policy tournament_thumbs_named_read on storage.objects`);
		await db.sql(
			`create policy tournament_thumbs_named_read on storage.objects
			 for select to anon using (bucket_id = '${BUCKET}')`
		);
		const wide = await anonListed();
		expect(wide).toHaveLength(4);
		expect(wide).toContain(orphanKey);

		await restore();
		expect(await anonListed()).toHaveLength(3);
	});

	test('CONTROL 2 -- drop the STYLES half and the banner is delisted with the orphan', async () => {
		// This is the control that catches the mistake 0057's chain made
		// invisible. A predicate asking only `tournament_entries` still passes
		// "the orphan is gone" and still passes "the listing is not empty".
		expect(await anonListed()).toContain(bannerKey);

		await db.sql(`drop policy tournament_thumbs_named_read on storage.objects`);
		await db.sql(
			`create policy tournament_thumbs_named_read on storage.objects
			 for select to anon using (
				bucket_id = '${BUCKET}'
				and exists (
					select 1 from public.tournament_entries e
					where e.thumbnail_url like '%/${BUCKET}/%'
						and right(e.thumbnail_url, length(storage.objects.name) + 1)
							= '/' || storage.objects.name
				)
			 )`
		);
		const half = await anonListed();
		expect(half.sort()).toEqual([liveThumbKey, draftThumbKey].sort());
		expect(half).not.toContain(bannerKey);

		await restore();
		expect(await anonListed()).toContain(bannerKey);
	});
});

// ---------------------------------------------------------------------------
// B2 -- what an anonymous caller can STILL do, asserted rather than left to be
// found. Delisting is not deleting and the migration header says so; this is
// that sentence as a test.
// ---------------------------------------------------------------------------

describe('B2: the orphan is delisted, not removed, and not unreachable', () => {
	test('the bytes are still there -- nothing was swept', async () => {
		const r = await db.sql<{ n: string }>(
			`select count(*)::text as n from storage.objects where bucket_id = $1`,
			[BUCKET]
		);
		expect(Number(r.rows[0].n)).toBe(4);
	});

	test('and the bucket flag that serves it by exact key was not touched', async () => {
		// `/object/public/<bucket>/<key>` is governed by this flag, not by the
		// policy above, so an orphan whose key somebody already holds is still
		// fetchable. That is 0062's accepted trade; what stopped is being handed
		// the key for the asking.
		const pub = await db.sql<{ public: boolean }>(
			`select public from storage.buckets where id = $1`,
			[BUCKET]
		);
		expect(pub.rows[0].public).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// B5 -- the delegation itself. The reason the predicate has no visibility test
// in it is that it INHERITS one; this is that claim as a measurement rather
// than as a paragraph in a header.
// ---------------------------------------------------------------------------

describe('B5: the storage read FOLLOWS the row read', () => {
	test('deleting the naming row delists its object, with no policy change at all', async () => {
		expect(await anonListed()).toContain(draftThumbKey);
		const before = await db.sql<{ id: string; thumbnail_url: string }>(
			`select id, thumbnail_url from public.tournament_entries where thumbnail_url = $1`,
			[publicUrl(draftThumbKey)]
		);
		expect(before.rows).toHaveLength(1);

		await db.sql(`delete from public.tournament_entries where id = $1`, [before.rows[0].id]);
		expect(await anonListed()).not.toContain(draftThumbKey);

		// Restore, and confirm it comes back -- so the assertion above is about
		// the delegation and not about a connection that stopped working.
		await db.sql(
			`insert into public.tournament_entries (tournament_id, display_name, description, thumbnail_url)
			 select id, 'Walk-up Wasp', '', $1 from public.tournaments where status = 'draft'`,
			[publicUrl(draftThumbKey)]
		);
		expect(await anonListed()).toContain(draftThumbKey);
	});

	test('a row pointing at some OTHER host unlocks nothing', async () => {
		// The constant `like '%/tournament-thumbs/%'` is what stops an entry
		// naming `https://evil.example/<uid>/<uuid>.png` from admitting a key it
		// merely ends with.
		const t = await db.sql<{ id: string }>(
			`select id from public.tournaments where status = 'live'`
		);
		const ins = await db.sql<{ id: string }>(
			`insert into public.tournament_entries (tournament_id, display_name, description, thumbnail_url)
			 values ($1, 'Impostor', '', $2) returning id`,
			[t.rows[0].id, `https://evil.example/${orphanKey}`]
		);
		expect(await anonListed()).not.toContain(orphanKey);
		await db.sql(`delete from public.tournament_entries where id = $1`, [ins.rows[0].id]);
	});

	test('an object name carrying a LIKE wildcard matches only itself', async () => {
		// The extension comes from `file.name.split('.').pop()` with no
		// allowlist, so `_` and `%` can genuinely reach a key. `right()` is
		// plain string equality and has no metacharacters in it; a `like '%' ||
		// name` spelling would have matched the sibling below.
		const wild = `${alice.id}/9e8d7c6b-5a49-4382-9170-f6e5d4c3b2a1._n`;
		const sibling = `${alice.id}/9e8d7c6b-5a49-4382-9170-f6e5d4c3b2a1.an`;
		for (const k of [wild, sibling]) {
			await db.asUser(alice.id, (q) =>
				q(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [BUCKET, k])
			);
		}
		const t = await db.sql<{ id: string }>(
			`select id from public.tournaments where status = 'live'`
		);
		const ins = await db.sql<{ id: string }>(
			`insert into public.tournament_entries (tournament_id, display_name, description, thumbnail_url)
			 values ($1, 'Wildcard', '', $2) returning id`,
			[t.rows[0].id, publicUrl(wild)]
		);

		const listed = await anonListed();
		expect(listed).toContain(wild); // positive control: the real one is admitted
		expect(listed).not.toContain(sibling); // and the wildcard did not spread

		await db.sql(`delete from public.tournament_entries where id = $1`, [ins.rows[0].id]);
		await db.sql(`delete from storage.objects where bucket_id = $1 and name = any($2)`, [
			BUCKET,
			[wild, sibling]
		]);
	});

	test('the delegation needs the anon SELECT grant, and the migration asserts it', async () => {
		// 0109's lesson (the 0070 one): a function or table named inside an RLS
		// predicate is reached as the QUERYING role, so revoking the grant does
		// not narrow the read, it blanks it. The migration's self-check (c)
		// refuses rather than shipping that state; this is the behaviour behind
		// the refusal.
		expect(
			(
				await db.sql<{ ok: boolean }>(
					`select has_table_privilege('anon', 'public.tournament_entries', 'SELECT') as ok`
				)
			).rows[0].ok
		).toBe(true);
		expect(
			(
				await db.sql<{ ok: boolean }>(
					`select has_table_privilege('anon', 'public.tournament_entry_styles', 'SELECT') as ok`
				)
			).rows[0].ok
		).toBe(true);
	});
});

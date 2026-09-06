// tests/maps-media-listing.test.ts
//
// 0186: AN ANONYMOUS CALLER MAY NOT ENUMERATE `maps-media`.
//
// WHY THIS FILE EXISTS. `maps-media` is a PUBLIC bucket whose only select
// policy (0163) read `using (bucket_id = 'maps-media')` -- a predicate that
// names the bucket and nothing else, which places no restriction on WHICH rows
// the role may select. That is not a read rule, it is a listing rule: a
// stranger does not have to guess a key, it can ask for all of them. The
// regression is invisible from every surface in the app -- no page lists this
// bucket, so no page would ever look wrong -- which is exactly the shape this
// repo writes tests for.
//
// WHAT IT ASSERTS, and every claim is measured in BOTH directions:
//   A. THE WORLD BEFORE. On the pre-0186 chain, a genuinely anonymous caller
//      reads a known key AND lists every object in the bucket. This is the
//      positive control for everything below: without it, "anon lists nothing"
//      is a sentence a broken fixture also satisfies.
//   B. THE CONTROL THAT MAKES A LISTING MEAN THE POLICY. On the SAME anonymous
//      connection, `select count(*) from public.profiles` must be REFUSED.
//      A listing that came back because RLS was off, or because the harness
//      forgot the role switch, proves nothing. Prompt 0052's control, re-run
//      here rather than its result borrowed.
//   C. THE WORLD AFTER. 0186 applied over that same seeded database: the anon
//      listing collapses to exactly the keys `select storage_key from
//      public.maps_photos` already hands an anonymous caller, and the two are
//      compared as SETS rather than as counts.
//   D. READS, EACH ONE NAMED. Through the API path, anon keeps the published
//      photo and loses the draft-owner photo and the orphan. A signed-in
//      caller keeps all three, which is 0186's deliberate landing tier and
//      must not silently narrow.
//   E. TWO PERMISSIVE MUTANTS, each opening ONE clause of the new predicate,
//      on their own disposable databases. Applied IN-DATABASE: no migration
//      file is edited, at any point, for any reason, and the file's md5 is
//      asserted unchanged at the end of the run so that sentence is a
//      measurement rather than a promise.
//
// WHAT IS NOT ASSERTED HERE, AND CANNOT BE. Whether
// `/storage/v1/object/public/maps-media/<key>` consults RLS at all. That is
// storage-api's behaviour, there is no Storage server in this harness, and the
// session that wrote this had no Docker daemon and no Supabase CLI. 0186 is
// written to be correct under either answer and its header says so; this file
// measures the database half, which is the half 0186 changes.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startTestDb, type TestDb } from './db/harness';
import { MAPS_MIGRATIONS, seedMapsWorld, type MapsWorld } from './db/maps-fixture';

const FILE_0168 = '0168_maps_media_types_and_plan_frame.sql';
const FILE_0172 = '0172_maps_editor_grants.sql';
const FILE_0186 = '0186_maps_media_no_anon_listing.sql';

const pathOf = (file: string) =>
	fileURLToPath(new URL(`../supabase/migrations/${file}`, import.meta.url));
const sqlOf = (file: string) => readFileSync(pathOf(file), 'utf8');
const md5Of = (file: string) => createHash('md5').update(readFileSync(pathOf(file))).digest('hex');

/** The md5 every migration file this suite READS must still have at the end. */
const MD5_BEFORE = Object.fromEntries(
	[FILE_0168, FILE_0172, FILE_0186].map((f) => [f, md5Of(f)])
);

/** Production order, with the two maps files numbered after the shared chain. */
const CHAIN = [...MAPS_MIGRATIONS, FILE_0168, FILE_0172] as const;

const PUBLISHED_KEY = 'node/aaaaaaaa-0000-0000-0000-000000000001.jpg';
const DRAFT_KEY = 'node/bbbbbbbb-0000-0000-0000-000000000002.jpg';
const ORPHAN_KEY = 'node/cccccccc-0000-0000-0000-000000000003.jpg';
const ALL_KEYS = [PUBLISHED_KEY, DRAFT_KEY, ORPHAN_KEY];

/**
 * A LIVE SUPABASE PROJECT GRANTS `storage.objects` TO `anon` AND
 * `authenticated`; the test stub grants nothing at all. Without this every
 * assertion below would be refused by the GRANT and pass vacuously -- the
 * listing would "close" because the table was never reachable. This is the
 * same thing `tests/classroom-instructor-storage.test.ts` does and for the
 * same reason.
 */
async function grantStorageLikeProduction(db: TestDb): Promise<void> {
	await db.sql(
		`grant select, insert, update, delete on storage.objects to authenticated, service_role`
	);
	await db.sql(`grant select on storage.objects to anon`);
}

interface Seeded {
	world: MapsWorld;
	draftNodeId: string;
}

/**
 * Three objects and two photo rows, written the way the editor writes them:
 * as a signed-in ADMIN through the live RLS policies, never with the owner
 * connection. A corpus seeded past RLS is a corpus the real producer cannot
 * emit.
 *
 *   PUBLISHED_KEY -- a photo on `Tool Chest A`, which `seedMapsWorld`
 *                    publishes through the real `maps_publish`.
 *   DRAFT_KEY     -- a photo on a unit that was never published. `status`
 *                    defaults to 'draft' and only `maps_publish` moves it, so
 *                    this row is the same thing a real unpublished edit is.
 *   ORPHAN_KEY    -- bytes in the bucket that no `maps_photos` row names. A
 *                    half-finished upload, or a photo row somebody deleted:
 *                    0163 says deleting a row does not delete the object.
 */
async function seed(db: TestDb): Promise<Seeded> {
	const world = await seedMapsWorld(db);
	await grantStorageLikeProduction(db);

	const draftNodeId = await db.asUser(world.admin.id, async (q) => {
		const { rows } = await q<{ id: string }>(
			`insert into public.maps_nodes (parent_id, kind, name, subtype)
			 values ($1, 'unit', 'Unpublished Cabinet', null)
			 returning id`,
			[world.node['Machine Shop']]
		);
		return rows[0].id;
	});

	// The OBJECTS. storage-api writes these; there is no Storage server here,
	// so they go in directly -- this is the stub's own table, not a policy
	// bypass, and the policies under test are on SELECT.
	await db.sql(
		`insert into storage.objects (bucket_id, name) values
		 ('maps-media', $1), ('maps-media', $2), ('maps-media', $3)`,
		ALL_KEYS
	);

	// The ROWS, as the admin, through 0163's own insert policy.
	await db.asUser(world.admin.id, async (q) => {
		await q(
			`insert into public.maps_photos (node_id, storage_key) values ($1, $2), ($3, $4)`,
			[world.node['Tool Chest A'], PUBLISHED_KEY, draftNodeId, DRAFT_KEY]
		);
	});

	return { world, draftNodeId };
}

/** What an anonymous caller can see of the bucket, through the API path. */
async function anonView(db: TestDb) {
	return db.asAnon(async (q) => {
		const list = await q<{ name: string }>(
			`select name from storage.objects where bucket_id = 'maps-media' order by name`
		);
		const photos = await q<{ storage_key: string }>(
			`select storage_key from public.maps_photos order by storage_key`
		);
		const reads: Record<string, number> = {};
		for (const key of ALL_KEYS) {
			const { rows } = await q<{ n: string }>(
				`select count(*)::text as n from storage.objects
				 where bucket_id = 'maps-media' and name = $1`,
				[key]
			);
			reads[key] = Number(rows[0].n);
		}
		return { list: rows(list), photos: keys(photos), reads };
	});
}

const rows = (r: { rows: { name: string }[] }) => r.rows.map((x) => x.name);
const keys = (r: { rows: { storage_key: string }[] }) => r.rows.map((x) => x.storage_key);

/** The control that says a listing was the POLICY and not RLS being off. */
async function profilesControl(db: TestDb): Promise<string> {
	return db.asAnon(async (q) => {
		try {
			await q(`select count(*) from public.profiles`);
			return 'NOT REFUSED';
		} catch (error) {
			return (error as Error).message;
		}
	});
}

describe('0186 -- maps-media stops being listable by a stranger', () => {
	let db: TestDb;
	let seeded: Seeded;
	let before: Awaited<ReturnType<typeof anonView>>;
	let control: string;

	beforeAll(async () => {
		db = await startTestDb([...CHAIN]);
		seeded = await seed(db);

		// A. and B. -- measured BEFORE the migration, on the seeded database,
		// which is what makes every assertion after it a paired reading rather
		// than a bare claim.
		before = await anonView(db);
		control = await profilesControl(db);

		// The migration, applied over that same seeded pre-migration data.
		await db.sql(sqlOf(FILE_0186));
	}, 180_000);

	afterAll(async () => {
		await db?.stop();
	});

	// ---------------------------------------------------------------------
	// A / B. The world before, and the control.
	// ---------------------------------------------------------------------
	describe('A. before 0186, the positive control', () => {
		it('an anonymous caller lists EVERY object in the bucket', () => {
			expect(before.list).toEqual([...ALL_KEYS].sort());
			expect(`listed ${before.list.length} of ${ALL_KEYS.length}`).toBe('listed 3 of 3');
		});

		it('and reads all three by key', () => {
			expect(before.reads).toEqual({
				[PUBLISHED_KEY]: 1,
				[DRAFT_KEY]: 1,
				[ORPHAN_KEY]: 1
			});
		});

		it('while `maps_photos` already showed it only the published one', () => {
			// The excess of the storage listing over the front door: 3 - 1 = 2.
			expect(before.photos).toEqual([PUBLISHED_KEY]);
			expect(before.list.length - before.photos.length).toBe(2);
		});

		it('B. and the same connection is REFUSED public.profiles', () => {
			expect(control).toMatch(/permission denied for table profiles/);
		});
	});

	// ---------------------------------------------------------------------
	// C. The listing closes.
	// ---------------------------------------------------------------------
	describe('C. after 0186, the anonymous listing', () => {
		it('returns exactly the keys maps_photos already hands an anonymous caller', async () => {
			const after = await anonView(db);
			expect(after.list).toEqual(after.photos);
			expect(after.list).toEqual([PUBLISHED_KEY]);
		});

		it('and the control still holds on the same connection', async () => {
			expect(await profilesControl(db)).toMatch(/permission denied for table profiles/);
		});
	});

	// ---------------------------------------------------------------------
	// D. Reads, each one named.
	// ---------------------------------------------------------------------
	describe('D. reads through the API path', () => {
		it('anon keeps the published photo and loses the draft-owner one and the orphan', async () => {
			const after = await anonView(db);
			expect(after.reads).toEqual({
				[PUBLISHED_KEY]: 1,
				[DRAFT_KEY]: 0,
				[ORPHAN_KEY]: 0
			});
		});

		it('a signed-in NON-ADMIN still reads and lists all three -- 0186 does not narrow that tier', async () => {
			const seen = await db.asUser(seeded.world.nonAdmin.id, async (q) => {
				const { rows: r } = await q<{ name: string }>(
					`select name from storage.objects where bucket_id = 'maps-media' order by name`
				);
				return r.map((x) => x.name);
			});
			expect(seen).toEqual([...ALL_KEYS].sort());
		});

		it('an admin still reads and lists all three', async () => {
			const seen = await db.asUser(seeded.world.admin.id, async (q) => {
				const { rows: r } = await q<{ name: string }>(
					`select name from storage.objects where bucket_id = 'maps-media' order by name`
				);
				return r.map((x) => x.name);
			});
			expect(seen).toEqual([...ALL_KEYS].sort());
		});
	});

	// ---------------------------------------------------------------------
	// The structural claims 0186's own self-check makes, re-read here from the
	// catalog rather than trusting that the file's DO block ran.
	// ---------------------------------------------------------------------
	describe('the catalog', () => {
		it('carries no unscoped public/anon select policy for this bucket', async () => {
			const { rows: r } = await db.sql<{ policyname: string; qual: string }>(
				`select policyname, qual from pg_policies
				 where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'
					 and qual like '%maps-media%'
					 and (roles::text[] && array['public', 'anon'])
					 and qual not like '%maps_photos%'`
			);
			expect(r.map((x) => x.policyname)).toEqual([]);
		});

		it('leaves the bucket row exactly as 0163/0168/0185 left it', async () => {
			const { rows: r } = await db.sql<{ p: boolean; t: string[] | null }>(
				`select public as p, allowed_mime_types as t from storage.buckets where id = 'maps-media'`
			);
			expect(r[0].p).toBe(true);
			expect(r[0].t).toEqual([
				'image/jpeg',
				'image/png',
				'image/webp',
				'image/heic',
				'image/heif',
				'image/avif'
			]);
		});

		it('leaves 0163 and 0172 write policies intact', async () => {
			const { rows: r } = await db.sql<{ policyname: string }>(
				`select policyname from pg_policies
				 where schemaname = 'storage' and tablename = 'objects'
					 and policyname like 'maps\\_media\\_%' and cmd <> 'SELECT'
				 order by policyname`
			);
			expect(r.map((x) => x.policyname)).toEqual([
				'maps_media_admin_delete',
				'maps_media_admin_insert',
				'maps_media_admin_update',
				'maps_media_editor_insert'
			]);
		});
	});

	// ---------------------------------------------------------------------
	// E. The mutants. Each opens ONE clause, in the PERMISSIVE direction, on
	//    its own disposable database.
	// ---------------------------------------------------------------------
	describe('E. permissive mutants', () => {
		it('dropping the maps_photos clause puts the whole listing back', async () => {
			const mutant = await startTestDb([...CHAIN]);
			try {
				await seed(mutant);
				await mutant.sql(sqlOf(FILE_0186));
				// Sound first, so a mutant that "fails" because the fixture
				// broke is told apart from one that fails because the clause
				// matters.
				expect((await anonView(mutant)).list).toEqual([PUBLISHED_KEY]);

				await mutant.sql(`drop policy maps_media_published_read on storage.objects`);
				await mutant.sql(
					`create policy maps_media_published_read on storage.objects
					 for select to anon using (bucket_id = 'maps-media')`
				);
				expect((await anonView(mutant)).list).toEqual([...ALL_KEYS].sort());
			} finally {
				await mutant.stop();
			}
		}, 180_000);

		it('making the maps_photos clause row-independent puts the whole listing back', async () => {
			const mutant = await startTestDb([...CHAIN]);
			try {
				await seed(mutant);
				await mutant.sql(sqlOf(FILE_0186));
				expect((await anonView(mutant)).list).toEqual([PUBLISHED_KEY]);

				// The clause is still there and still names maps_photos -- it
				// simply stops correlating to THIS object. This is the mutant a
				// policy-name or policy-text assertion would sail straight past.
				await mutant.sql(`drop policy maps_media_published_read on storage.objects`);
				await mutant.sql(
					`create policy maps_media_published_read on storage.objects
					 for select to anon using (
						bucket_id = 'maps-media'
						and exists (select 1 from public.maps_photos p where p.storage_key is not null)
					 )`
				);
				expect((await anonView(mutant)).list).toEqual([...ALL_KEYS].sort());
			} finally {
				await mutant.stop();
			}
		}, 180_000);
	});

	it('re-applies cleanly -- a re-paste lands on the same end state', async () => {
		// Re-pasting a migration is ordinary here (a first attempt failed
		// partway, or somebody pastes it twice), so a file that only works once
		// fails exactly then. Every statement in 0186 is a drop-then-create.
		await db.sql(sqlOf(FILE_0186));
		const after = await anonView(db);
		expect(after.list).toEqual([PUBLISHED_KEY]);
		const { rows: r } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_policies
			 where schemaname = 'storage' and tablename = 'objects'
				 and policyname in ('maps_media_published_read', 'maps_media_authenticated_read')`
		);
		expect(r[0].n).toBe('2');
	}, 60_000);

	it('no migration file was edited by this run', () => {
		for (const [file, md5] of Object.entries(MD5_BEFORE)) {
			expect(`${file} ${md5Of(file)}`).toBe(`${file} ${md5}`);
		}
	});
});

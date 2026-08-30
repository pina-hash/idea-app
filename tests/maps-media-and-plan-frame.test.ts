// tests/maps-media-and-plan-frame.test.ts
//
// IDEA MAPS (0168): the three properties that migration establishes, pinned.
//
// WHY THIS FILE EXISTS. 0168 closes a hole that is invisible from every
// surface in the app: `maps-media` is a PUBLIC bucket and 0163 pinned its
// allowed_mime_types to the wildcard `image/*`, which matches image/svg+xml.
// An SVG is a document -- script, external references, event handlers -- and
// Storage's own content-type rewrite only catches text/html, so an accepted
// SVG is a scriptable document on a public URL on the project's Storage
// origin. Nothing in `src/` reads that bucket, so nothing in `src/` can
// regress it and nothing in `src/` would report it either: the bucket row IS
// the gate, and a catalog row that quietly widens again is exactly the silent
// regression this repo writes tests for.
//
// WHAT IT ASSERTS:
//   A. THE BUCKET LIST refuses every SVG spelling and admits the six raster
//      types the maps photo path carries, asserted through a matcher that
//      MIRRORS storage-api's own wildcard semantics rather than comparing the
//      array. That is the difference between an assertion that bites and one
//      that does not: `image/*` and a NULL list both admit SVG, and both are
//      shapes a future edit could produce, so the question asked has to be
//      "does this list admit svg" and never "is this list the array I typed".
//   B. THE ELEVATION SLOT INDEX refuses a second published compartment in an
//      occupied slot, with two positive controls beside it so the refusal
//      cannot be coming from something wider: the same duplicate is ALLOWED
//      while the row is a draft, and the same slot number is allowed under a
//      different unit.
//   C. THE PLAN FRAME comments are present on the geometry columns AND say
//      the load-bearing things -- units, whose frame, which anchor, which way
//      the axes run. Presence alone would be satisfied by `comment ... is 'x'`.
//   D. THE MIGRATION'S OWN REFUSAL, driven over seeded PRE-migration data:
//      a database carrying a published duplicate must REFUSE 0168 with the
//      count, rather than renumbering somebody's drawers.
//   E. THE MUTATION PROOF for A, B and C, applied IN-DATABASE against this
//      file's own disposable database. No migration file is edited, at any
//      point, for any reason.
//
// EACH MUTATION MOVES TOWARD THE DEFECT, NEVER AWAY. Widening the mime list
// back to `image/*` is the real regression; DELETING the list would also
// redden A, and is covered by the matcher treating a null list as admitting
// everything, which is what storage-api does. Dropping the index makes the
// duplicate representable, which is the finding. Clearing a comment removes
// the information, which is the finding. None of the three is a "remove the
// object so the exclusion passes vacuously" control.
//
// WHAT IS NOT ASSERTED HERE, AND CANNOT BE. `allowed_mime_types` is enforced
// by storage-api at upload time against the request's DECLARED content type,
// not by a database constraint -- the db harness has no Storage server in it,
// and the test stub's `storage.objects` has no metadata column at all. So A
// asserts the POLICY VALUE the upload path reads, which is the whole of what
// this migration controls, and does not simulate an upload.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startTestDb, type TestDb } from './db/harness';
import { MAPS_MIGRATIONS, publish, seedMapsWorld, type MapsWorld } from './db/maps-fixture';

const FILE_0168 = '0168_maps_media_types_and_plan_frame.sql';
const SQL_0168 = readFileSync(
	fileURLToPath(new URL(`../supabase/migrations/${FILE_0168}`, import.meta.url)),
	'utf8'
);

/** The six 0168 admits. Named here so the positive control cannot drift silently. */
const ADMITTED = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/heic',
	'image/heif',
	'image/avif'
] as const;

/** Every spelling of "an SVG" a browser or a tool might declare. */
const SVG_TYPES = ['image/svg+xml', 'IMAGE/SVG+XML', 'image/svg+xml-compressed'] as const;

/**
 * Does this bucket's allowed_mime_types admit `type`?
 *
 * MIRRORS storage-api: a NULL or empty list means "no restriction" and admits
 * everything, `*` / `type/*` match by prefix, anything else matches exactly,
 * case-insensitively. Written as the RULE rather than as an array comparison
 * so it bites on every shape of re-widening -- the wildcard coming back, the
 * list being emptied, the list being dropped to null, or `image/svg+xml`
 * simply being added.
 */
function admits(list: string[] | null, type: string): boolean {
	if (list === null || list.length === 0) return true;
	const want = type.trim().toLowerCase();
	return list.some((raw) => {
		const m = raw.trim().toLowerCase();
		if (m === '*' || m === '*/*') return true;
		if (m.endsWith('/*')) return want.startsWith(m.slice(0, -1));
		return m === want;
	});
}

async function mimeList(db: TestDb): Promise<string[] | null> {
	const { rows } = await db.sql<{ t: string[] | null }>(
		`select allowed_mime_types as t from storage.buckets where id = 'maps-media'`
	);
	expect(rows).toHaveLength(1);
	return rows[0].t;
}

async function columnComment(db: TestDb, column: string): Promise<string | null> {
	const { rows } = await db.sql<{ c: string | null }>(
		`select col_description(a.attrelid, a.attnum) as c
		 from pg_catalog.pg_attribute a
		 where a.attrelid = 'public.maps_nodes'::regclass and a.attname = $1`,
		[column]
	);
	expect(rows).toHaveLength(1);
	return rows[0].c;
}

/** Inserts a compartment straight at the given status. Admin, through RLS. */
async function addCompartment(
	db: TestDb,
	world: MapsWorld,
	parentId: string,
	name: string,
	order: number,
	status: 'draft' | 'published'
): Promise<string> {
	return db.asUser(world.admin.id, async (q) => {
		const { rows } = await q<{ id: string }>(
			`insert into public.maps_nodes
				(parent_id, kind, name, subtype, elevation_order, elevation_h_in, elevation_w_in, status)
			 values ($1, 'compartment', $2, 'drawer', $3, 3, 28, $4)
			 returning id`,
			[parentId, name, order, status]
		);
		return rows[0].id;
	});
}

/** Runs `fn` and returns the SQLSTATE it raised, or null if it did not raise. */
async function sqlstateOf(fn: () => Promise<unknown>): Promise<string | null> {
	try {
		await fn();
		return null;
	} catch (error) {
		return ((error as { code?: string }).code ?? 'NO_CODE') as string;
	}
}

describe('IDEA Maps 0168 -- maps-media types, elevation slots, plan frame', () => {
	let db: TestDb;
	let world: MapsWorld;

	beforeAll(async () => {
		db = await startTestDb([...MAPS_MIGRATIONS, FILE_0168]);
		world = await seedMapsWorld(db);
	}, 120_000);

	afterAll(async () => {
		await db?.stop();
	});

	// -----------------------------------------------------------------------
	// A. The bucket list.
	// -----------------------------------------------------------------------
	describe('A. the maps-media mime list', () => {
		it('refuses every SVG spelling', async () => {
			const list = await mimeList(db);
			for (const t of SVG_TYPES) {
				expect(`${t}: ${admits(list, t)}`).toBe(`${t}: false`);
			}
		});

		it('still admits the six raster types the photo path carries', async () => {
			const list = await mimeList(db);
			// The positive control: an emptied or over-narrowed list reddens here,
			// so "refuses SVG" can never be satisfied by refusing everything.
			for (const t of ADMITTED) {
				expect(`${t}: ${admits(list, t)}`).toBe(`${t}: true`);
			}
		});

		it('carries no wildcard member at all', async () => {
			const list = await mimeList(db);
			expect(list).not.toBeNull();
			expect((list ?? []).filter((m) => m.includes('*'))).toEqual([]);
		});

		it('leaves 0163 public-read and the 20 MiB ceiling alone', async () => {
			const { rows } = await db.sql<{ public: boolean; file_size_limit: string | number }>(
				`select public, file_size_limit from storage.buckets where id = 'maps-media'`
			);
			expect(rows[0].public).toBe(true);
			expect(Number(rows[0].file_size_limit)).toBe(20971520);
		});
	});

	// -----------------------------------------------------------------------
	// B. The elevation slot index.
	// -----------------------------------------------------------------------
	describe('B. the published elevation slot', () => {
		it('is a unique index scoped to published compartments', async () => {
			const { rows } = await db.sql<{ uniq: boolean; pred: string | null; cols: string }>(
				`select i.indisunique as uniq,
						pg_get_expr(i.indpred, i.indrelid) as pred,
						pg_get_indexdef(i.indexrelid) as cols
				 from pg_catalog.pg_index i
				 where i.indexrelid = 'public.maps_nodes_elevation_slot'::regclass`
			);
			expect(rows).toHaveLength(1);
			expect(rows[0].uniq).toBe(true);
			expect(rows[0].pred).toContain('compartment');
			expect(rows[0].pred).toContain('published');
			expect(rows[0].cols).toContain('parent_id');
			expect(rows[0].cols).toContain('elevation_order');
		});

		it('allows a DRAFT compartment to sit in a published sibling\'s slot', async () => {
			// The scoping control. Drawer 1 is published at slot 1 (fixture).
			const id = await addCompartment(
				db,
				world,
				world.node['Tool Chest A'],
				'Drawer 1 (restack draft)',
				1,
				'draft'
			);
			expect(id).toMatch(/^[0-9a-f-]{36}$/);
		});

		it('allows the same slot number under a DIFFERENT unit', async () => {
			// The other control: the index keys on the parent, not on the number.
			const id = await addCompartment(
				db,
				world,
				world.node['Bench Cabinet'],
				'Cabinet shelf 1',
				1,
				'published'
			);
			expect(id).toMatch(/^[0-9a-f-]{36}$/);
		});

		it('refuses a second PUBLISHED compartment in an occupied slot (direct write)', async () => {
			const code = await sqlstateOf(() =>
				addCompartment(db, world, world.node['Tool Chest A'], 'Drawer 1 (dupe)', 1, 'published')
			);
			expect(code).toBe('23505');
		});

		it('refuses PUBLISHING a draft into an occupied slot, through the real RPC', async () => {
			const draftId = await addCompartment(
				db,
				world,
				world.node['Tool Chest A'],
				'Drawer 2 (dupe via publish)',
				2,
				'draft'
			);
			const code = await sqlstateOf(() => publish(db, world.admin, 'maps_nodes', draftId));
			expect(code).toBe('23505');
			// And it really did not land: the row is still a draft.
			const { rows } = await db.sql<{ status: string }>(
				`select status from public.maps_nodes where id = $1`,
				[draftId]
			);
			expect(rows[0].status).toBe('draft');
		});
	});

	// -----------------------------------------------------------------------
	// C. The plan frame, in the catalog.
	// -----------------------------------------------------------------------
	describe('C. the plan frame comments', () => {
		it('is present on both position columns and on rotation and outline', async () => {
			for (const col of ['position_x_in', 'position_y_in', 'rotation_deg', 'outline']) {
				const c = await columnComment(db, col);
				expect(`${col}: ${c === null ? 'MISSING' : 'present'}`).toBe(`${col}: present`);
			}
		});

		it('states the units, the frame and the anchor on each position column', async () => {
			for (const col of ['position_x_in', 'position_y_in']) {
				const c = (await columnComment(db, col))!.toLowerCase();
				expect(`${col} names inches: ${c.includes('inch')}`).toBe(`${col} names inches: true`);
				expect(`${col} names the parent frame: ${c.includes('parent')}`).toBe(
					`${col} names the parent frame: true`
				);
				expect(`${col} names the anchor: ${c.includes('origin') || c.includes('corner')}`).toBe(
					`${col} names the anchor: true`
				);
			}
		});

		it('states which way each axis runs', async () => {
			const x = (await columnComment(db, 'position_x_in'))!.toLowerCase();
			const y = (await columnComment(db, 'position_y_in'))!.toLowerCase();
			expect(`x: ${x.includes('right')}`).toBe('x: true');
			expect(`y: ${y.includes('down')}`).toBe('y: true');
		});

		it('says rotation turns about the anchor, and which way is positive', async () => {
			const r = (await columnComment(db, 'rotation_deg'))!.toLowerCase();
			expect(`degrees: ${r.includes('degree')}`).toBe('degrees: true');
			expect(`about the anchor: ${r.includes('origin') || r.includes('corner')}`).toBe(
				'about the anchor: true'
			);
			expect(`sense: ${r.includes('clockwise')}`).toBe('sense: true');
		});

		it('carries a table comment too, so the whole convention reads in one place', async () => {
			const { rows } = await db.sql<{ c: string | null }>(
				`select obj_description('public.maps_nodes'::regclass, 'pg_class') as c`
			);
			expect(rows[0].c).not.toBeNull();
			expect(rows[0].c!.toLowerCase()).toContain('plan frame');
		});
	});

	// -----------------------------------------------------------------------
	// E. Mutation proof, in-database. Runs last: each mutation is restored and
	//    re-verified, but the assertions above must not depend on that.
	// -----------------------------------------------------------------------
	describe('E. mutation proof (in-database, this file\'s own database)', () => {
		it('widening the mime list back to image/* re-admits SVG', async () => {
			const before = await mimeList(db);
			await db.sql(
				`update storage.buckets set allowed_mime_types = array['image/*'] where id = 'maps-media'`
			);
			const widened = await mimeList(db);
			expect(admits(widened, 'image/svg+xml')).toBe(true); // the finding, reproduced
			expect((widened ?? []).filter((m) => m.includes('*'))).not.toEqual([]);

			await db.sql(`update storage.buckets set allowed_mime_types = $1 where id = 'maps-media'`, [
				before
			]);
			expect(await mimeList(db)).toEqual(before);
			expect(admits(await mimeList(db), 'image/svg+xml')).toBe(false);
		});

		it('dropping the mime list entirely also re-admits SVG', async () => {
			const before = await mimeList(db);
			await db.sql(
				`update storage.buckets set allowed_mime_types = null where id = 'maps-media'`
			);
			expect(admits(await mimeList(db), 'image/svg+xml')).toBe(true);

			await db.sql(`update storage.buckets set allowed_mime_types = $1 where id = 'maps-media'`, [
				before
			]);
			expect(admits(await mimeList(db), 'image/svg+xml')).toBe(false);
		});

		it('dropping the index makes the duplicate published slot representable', async () => {
			const def = (
				await db.sql<{ d: string }>(
					`select pg_get_indexdef('public.maps_nodes_elevation_slot'::regclass) as d`
				)
			).rows[0].d;

			await db.sql('drop index public.maps_nodes_elevation_slot');
			const code = await sqlstateOf(() =>
				addCompartment(db, world, world.node['Tool Chest A'], 'Drawer 1 (mutant)', 1, 'published')
			);
			expect(code).toBeNull(); // with the index gone, the duplicate lands

			// Restore: the mutant row has to go before the unique index can exist.
			await db.sql(`delete from public.maps_nodes where name = 'Drawer 1 (mutant)'`);
			await db.sql(def);
			const again = await sqlstateOf(() =>
				addCompartment(db, world, world.node['Tool Chest A'], 'Drawer 1 (dupe again)', 1, 'published')
			);
			expect(again).toBe('23505');
		});

		it('clearing a plan-frame comment loses the convention', async () => {
			const before = await columnComment(db, 'position_x_in');
			expect(before).not.toBeNull();

			await db.sql('comment on column public.maps_nodes.position_x_in is null');
			expect(await columnComment(db, 'position_x_in')).toBeNull();

			await db.sql(`comment on column public.maps_nodes.position_x_in is ${literal(before!)}`);
			expect(await columnComment(db, 'position_x_in')).toBe(before);
		});
	});
});

/** A single-quoted SQL literal. Used only to put a captured comment back. */
function literal(text: string): string {
	return `'${text.replace(/'/g, "''")}'`;
}

// ---------------------------------------------------------------------------
// D. The migration over seeded PRE-migration data.
//
// The narrowing discipline: a database that already holds a published
// duplicate must REFUSE 0168 with the count and the unit name, not renumber
// the drawers. Boots the chain SHORT of 0168, seeds the duplicate through the
// real path, then applies the file over the top.
// ---------------------------------------------------------------------------
describe('D. 0168 over pre-migration data', () => {
	let db: TestDb;

	afterAll(async () => {
		await db?.stop();
	});

	it('refuses to apply over a published duplicate, and names the count and the unit', async () => {
		db = await startTestDb(MAPS_MIGRATIONS); // deliberately WITHOUT 0168
		const world = await seedMapsWorld(db);

		// Two published compartments in slot 1 of Tool Chest A. Legal before
		// 0168 -- which is the finding.
		await addCompartment(db, world, world.node['Tool Chest A'], 'Drawer 1b', 1, 'published');
		const { rows: pre } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.maps_nodes
			 where kind = 'compartment' and status = 'published' and elevation_order = 1
				 and parent_id = $1`,
			[world.node['Tool Chest A']]
		);
		expect(Number(pre[0].n)).toBe(2); // the duplicate is really there

		let message = '';
		try {
			await db.sql(SQL_0168);
		} catch (error) {
			message = (error as Error).message;
		}
		expect(message).toContain('0168 REFUSES');
		expect(message).toContain('Tool Chest A');
		expect(message).toContain('1 duplicate pair');

		// And it refused rather than renumbering: both rows still say slot 1.
		const { rows: post } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.maps_nodes
			 where kind = 'compartment' and status = 'published' and elevation_order = 1
				 and parent_id = $1`,
			[world.node['Tool Chest A']]
		);
		expect(Number(post[0].n)).toBe(2);

		// Positive control on the refusal itself: with the duplicate resolved,
		// the SAME file applies cleanly. A migration that always raised would
		// pass the assertion above for the wrong reason.
		await db.sql(
			`update public.maps_nodes set elevation_order = 9 where name = 'Drawer 1b'`
		);
		await expect(db.sql(SQL_0168)).resolves.toBeDefined();
		const { rows: idx } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_catalog.pg_class
			 where relname = 'maps_nodes_elevation_slot' and relkind = 'i'`
		);
		expect(Number(idx[0].n)).toBe(1);

		// And it re-applies. Re-pasting a migration is ordinary here -- someone
		// re-pastes, or a first attempt failed partway and gets retried -- so a
		// file that only works once fails exactly then, with the schema half
		// built. The second apply must leave exactly the same one index.
		await expect(db.sql(SQL_0168)).resolves.toBeDefined();
		const { rows: idx2 } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_catalog.pg_class
			 where relname = 'maps_nodes_elevation_slot' and relkind = 'i'`
		);
		expect(Number(idx2[0].n)).toBe(1);
		expect(admits(await mimeList(db), 'image/svg+xml')).toBe(false);
	}, 180_000);
});

// tests/db/maps-viewer-anonymous.test.ts
//
// THE PUBLIC VIEWER'S OWN READS, DRIVEN AS A GENUINELY ANONYMOUS CALLER.
//
// The whole surface is anonymous, so a test that ran as the connection owner
// -- or even as `authenticated` -- would prove nothing about it: the owner
// bypasses RLS and every grant, and `authenticated` holds grants `anon` does
// not. Every read below goes through `db.asAnon`, which is `set role anon`
// with no jwt claims at all: a signed-out request through PostgREST.
//
// WHAT THIS ADDS OVER `tests/maps-rls-boundary.test.ts`, which already proves
// the policies: that is a test of the DATABASE's answers, table by table. This
// is a test of the VIEWER'S READ -- `loadMapsPublicData`, the one function the
// route calls, exactly as it calls it -- and of what the viewer's own
// arithmetic then builds out of that payload. A policy can be right while the
// module that reads it asks for a column `anon` cannot see, and the symptom
// would be a public map that throws for the public.
//
// THE POSITIVE CONTROL IS THE ADMIN'S OWN READ OF THE SAME FIXTURE, on the
// same instrument, in the same file. Without it, "the draft is absent" passes
// for a read that came back empty, which is exactly what a broken select looks
// like.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	loadMapsPublicData,
	mapsViewerTransports,
	type MapsPublicClient
} from '$lib/maps/transports';
import type { MapsReadClient } from '$lib/maps/selects';
import {
	mapsChain,
	mapsContents,
	mapsPlanView,
	mapsStagedRoute,
	type MapsViewerData
} from '$lib/maps/viewer/viewer';
import { createPostgrestShim, loadForeignKeys } from './postgrest-shim';
import { seedMapsWorld, startMapsDb, type MapsWorld } from './maps-fixture';
import type { TestDb } from './harness';

let world: MapsWorld;
let db: TestDb;
/* `loadForeignKeys`' own return type -- the interface is internal to the
   shim and is deliberately not exported, so the type is taken from the
   function rather than restated here. */
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;

beforeAll(async () => {
	db = await startMapsDb();
	world = await seedMapsWorld(db);
	fks = await loadForeignKeys(db);
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

/**
 * The viewer's read, run as one role.
 *
 * IT DRIVES THE REAL `loadMapsPublicData` THROUGH THE POSTGREST SHIM rather
 * than issuing its own selects, which is the point: the shim resolves the
 * column list the module actually ships and asserts the table it was handed,
 * so a select that names a column `anon` cannot read fails HERE rather than in
 * production. A hand-written `select *` in this file would test the policies a
 * second time and the module not at all.
 */
async function readAs(userId: string | null): Promise<MapsViewerData> {
	// `userId` null is the shim's SIGNED-OUT caller: role `anon`, no claims.
	return loadMapsPublicData(
		createPostgrestShim(db, fks, userId) as unknown as MapsReadClient
	);
}

function searchAs(userId: string | null, query: string) {
	return mapsViewerTransports(
		createPostgrestShim(db, fks, userId) as unknown as MapsPublicClient
	).search(query);
}

describe('the viewer reads the published map with no session at all', () => {
	it('loads every published table, and the drafts are simply not there', async () => {
		const anon = await readAs(null);
		const names = anon.nodes.map((n) => n.name);

		// PRESENT: the published spine, root to leaf.
		for (const name of ['IDEA Building', 'Machine Shop', 'Mill Room', 'Tool Chest A', 'Drawer 1']) {
			expect(names, name).toContain(name);
		}
		// ABSENT: the two draft rooms, and the published unit UNDER one of them
		// is a separate case -- 0161 ties no node's visibility to its parent's,
		// so `Lab Cart` IS public even though its room is not. That is the
		// schema's answer and the viewer's chain walk is written for it.
		expect(names).not.toContain('Prototype Lab');
		expect(names).not.toContain('Fabrication Annex');

		expect(anon.itemTypes.map((t) => t.name)).not.toContain('Prototype Widget');
		expect(anon.items.map((i) => i.name)).not.toContain('Unreleased Gadget');

		// EVERY ROW THAT CAME BACK IS PUBLISHED. Asserted as a property over the
		// whole payload rather than name by name, so a draft added to the fixture
		// later cannot slip through by not being on a list.
		for (const table of ['nodes', 'itemTypes', 'items', 'stock'] as const) {
			const rows = anon[table] as { status: string }[];
			expect(rows.length, `${table} came back empty`).toBeGreaterThan(0);
			expect(
				rows.filter((r) => r.status !== 'published'),
				`${table} carries an unpublished row`
			).toEqual([]);
		}

		// THE POSITIVE CONTROL: the admin's own read of the same fixture, on the
		// same instrument, sees strictly more. Without this the assertions above
		// pass for a read that returned nothing.
		const admin = await readAs(world.admin.id);
		expect(admin.nodes.map((n) => n.name)).toContain('Prototype Lab');
		expect(admin.itemTypes.map((t) => t.name)).toContain('Prototype Widget');
		expect(admin.nodes.length).toBeGreaterThan(anon.nodes.length);
		expect(admin.items.length).toBeGreaterThan(anon.items.length);
		expect(admin.stock.length).toBeGreaterThan(anon.stock.length);
	});

	it('gives a signed-in non-admin exactly what it gives a signed-out visitor', async () => {
		// The public map is the same map for everybody who is not an editor.
		const anon = await readAs(null);
		const other = await readAs(world.nonAdmin.id);
		expect(other.nodes.map((n) => n.id).sort()).toEqual(anon.nodes.map((n) => n.id).sort());
		expect(other.items.map((i) => i.id).sort()).toEqual(anon.items.map((i) => i.id).sort());
	});

	it('never hands a draft to the viewer\'s own arithmetic', async () => {
		const anon = await readAs(null);
		// The building's plan: the two draft rooms cannot be drawn on it and
		// cannot be listed beside it either, because they are not in the payload.
		const plan = mapsPlanView(anon, world.node['IDEA Building']);
		const onPlan = [...plan.shapes.map((s) => s.node.name), ...plan.unplaced.map((n) => n.name)];
		expect(onPlan).toContain('Machine Shop');
		expect(onPlan).not.toContain('Prototype Lab');
		expect(onPlan).not.toContain('Fabrication Annex');

		// A draft item in a PUBLISHED room is absent from that room's contents.
		const shop = mapsContents(anon, world.node['Machine Shop']);
		expect(shop.items.map((i) => i.name)).not.toContain('Unreleased Gadget');
		// POSITIVE CONTROL: the same read, same room, as the admin.
		const adminShop = mapsContents(await readAs(world.admin.id), world.node['Machine Shop']);
		expect(adminShop.items.map((i) => i.name)).toContain('Unreleased Gadget');
	});

	it('walks the chain only as far as the public tree goes', async () => {
		const anon = await readAs(null);
		// `Lab Cart` is published under the DRAFT `Prototype Lab`. The chain a
		// viewer can build for it therefore starts at the cart itself -- the
		// draft room is not an ancestor it can name, because it cannot see it.
		const chain = mapsChain(anon.nodes, world.node['Lab Cart']);
		expect(chain.map((n) => n.name)).toEqual(['Lab Cart']);
		expect(chain.map((n) => n.name)).not.toContain('Prototype Lab');
		// POSITIVE CONTROL: the admin's chain for the same node has the room.
		const adminChain = mapsChain((await readAs(world.admin.id)).nodes, world.node['Lab Cart']);
		expect(adminChain.map((n) => n.name)).toEqual(['IDEA Building', 'Prototype Lab', 'Lab Cart']);
	});

	it('stages a real route from the anonymous payload, end to end', async () => {
		const anon = await readAs(null);
		const caliper = anon.items.find((i) => i.node_id === world.node['Drawer 1']);
		expect(caliper, 'the published drawer caliper is missing from the anon payload').toBeDefined();
		const stages = mapsStagedRoute(anon, { kind: 'item', id: caliper!.id });
		expect(stages.map((s) => s.at)).toEqual([
			null,
			world.node['IDEA Building'],
			world.node['Machine Shop'],
			world.node['Tool Chest A'],
			world.node['Drawer 1']
		]);
		expect(stages[stages.length - 1].item).toBe(caliper!.id);
	});
});

describe('un-publishing a node takes it off the public map, everywhere', () => {
	/**
	 * THE CONTROL THIS WHOLE SURFACE RESTS ON. The editor's draft-and-publish
	 * discipline exists so that unfinished content is invisible; a viewer that
	 * leaks a draft is worse than no viewer at all, because the discipline
	 * would then be costing everybody something it is not buying.
	 *
	 * IT IS DRIVEN AT RUNTIME AGAINST THE REAL ROW rather than by editing a
	 * fixture file: the row is un-published in this test's own database, the
	 * same three reads are taken again, and the row is put back. Nothing on
	 * disk is touched, so there is no copy to restore and no chance of a
	 * restore that silently discards something else.
	 *
	 * THE BEFORE MEASUREMENT IS THE POSITIVE CONTROL, taken on the same
	 * instrument in the same test: without it, "the Mill Room is absent" is
	 * true of a read that failed.
	 */
	it('vanishes from the payload, from the plan, from the chain and from search', async () => {
		const millRoom = world.node['Mill Room'];
		const mill = world.item['Bridgeport Mill'];

		// BEFORE: the room is on the map and its mill is findable.
		const before = await readAs(null);
		expect(before.nodes.map((n) => n.id)).toContain(millRoom);
		expect(
			mapsPlanView(before, world.node['IDEA Building']).shapes.map((s) => s.node.id)
		).toContain(millRoom);
		expect(mapsChain(before.nodes, millRoom).map((n) => n.name)).toEqual([
			'IDEA Building',
			'Mill Room'
		]);
		const beforeSearch = await searchAs(null, 'Bridgeport');
		expect(beforeSearch.ok).toBe(true);
		if (!beforeSearch.ok) return;
		expect(new Set(beforeSearch.data.map((r) => r.result_id)).has(mill)).toBe(true);

		// THE MUTATION: the room goes back to draft. Its ITEM is untouched and
		// stays published, which is the sharp half of the case -- a published
		// thing in a room the public cannot see must not be offered.
		await db.sql(
			`update public.maps_nodes set status = 'draft', published_at = null where id = $1`,
			[millRoom]
		);
		try {
			const after = await readAs(null);
			expect(after.nodes.map((n) => n.id), 'the drafted room is still in the payload').not.toContain(
				millRoom
			);
			expect(
				mapsPlanView(after, world.node['IDEA Building']).shapes.map((s) => s.node.id),
				'the drafted room is still drawn on the building plan'
			).not.toContain(millRoom);
			expect(
				mapsPlanView(after, world.node['IDEA Building']).unplaced.map((n) => n.id),
				'the drafted room is still listed beside the plan'
			).not.toContain(millRoom);
			expect(mapsChain(after.nodes, millRoom), 'the drafted room still has a chain').toEqual([]);
			// The mill is still a published ROW, and is still in the payload --
			// 0161 ties no item's visibility to its container's. What must be
			// gone is any way to REACH it: its route cannot be staged, and the
			// search must not offer it.
			expect(mapsStagedRoute(after, { kind: 'item', id: mill })).toEqual([]);

			const afterSearch = await searchAs(null, 'Bridgeport');
			expect(afterSearch.ok).toBe(true);
			if (!afterSearch.ok) return;
			expect(
				new Set(afterSearch.data.map((r) => r.result_id)).has(mill),
				'a search still offers an item inside a drafted room'
			).toBe(false);
		} finally {
			await db.sql(
				`update public.maps_nodes set status = 'published', published_at = now() where id = $1`,
				[millRoom]
			);
		}

		// AND IT COMES BACK, so a later test in this file is not running against
		// a world this one quietly broke.
		const restored = await readAs(null);
		expect(restored.nodes.map((n) => n.id)).toContain(millRoom);
	});
});

describe('the viewer\'s search, anonymously', () => {
	it('runs, and returns the containment chain the staged route needs', async () => {
		const outcome = await searchAs(null, 'caliper');
		expect(outcome.ok, 'maps_search refused an anonymous caller').toBe(true);
		if (!outcome.ok) return;
		expect(outcome.data.length).toBeGreaterThan(0);
		// Spec 5.3: the matched thing, its FULL containment chain, and the
		// geometry references the staged route renders from. Never a bare row.
		for (const row of outcome.data) {
			expect(Array.isArray(row.chain), row.label).toBe(true);
			expect(row.chain!.length, row.label).toBeGreaterThan(0);
			expect(row.chain![0]).toHaveProperty('outline');
			expect(row.chain![row.chain!.length - 1].id).toBe(row.node_id);
		}
	});

	it('finds nothing that is not published, including under a draft room', async () => {
		// AN ITEM TYPE IS NOT A RESULT KIND. `maps_search` unions nodes, items
		// and stock only (0165), so a draft type is reachable only THROUGH the
		// draft item that references it -- which is why the assertion below names
		// the item id and not the type id. Naming the type id would be an
		// assertion that cannot fail, because no search can ever return one.
		const anon = await searchAs(null, 'caliper');
		expect(anon.ok).toBe(true);
		if (!anon.ok) return;
		expect(new Set(anon.data.map((r) => r.result_id)).has(world.item['Shop Caliper'])).toBe(true);

		for (const query of ['widget', 'secret widget', 'PW-0001', 'Unreleased Gadget', 'UG-0001']) {
			const outcome = await searchAs(null, query);
			expect(outcome.ok, query).toBe(true);
			if (!outcome.ok) continue;
			expect(
				new Set(outcome.data.map((r) => r.result_id)).has(world.item['Unreleased Gadget']),
				query
			).toBe(false);
		}

		// POSITIVE CONTROL: the admin's own search finds the draft item through
		// every one of those spellings, so the absences above are the policy and
		// not five queries that match nothing.
		for (const query of ['widget', 'secret widget', 'PW-0001', 'Unreleased Gadget', 'UG-0001']) {
			const admin = await searchAs(world.admin.id, query);
			expect(admin.ok, query).toBe(true);
			if (!admin.ok) continue;
			expect(
				new Set(admin.data.map((r) => r.result_id)).has(world.item['Unreleased Gadget']),
				query
			).toBe(true);
		}
	});

	it('offers nothing under a DRAFT ROOM, even though the row itself is published', async () => {
		// `Lab Cart Caliper` is a PUBLISHED item, in a PUBLISHED cart, in a DRAFT
		// room. Its own status is not the question; 0162's invoker-security claim
		// is -- a thing whose route cannot be staged must not be offered, or the
		// map sends somebody to a room that does not exist for them.
		const anon = await searchAs(null, 'MIT-505-0100');
		expect(anon.ok).toBe(true);
		if (!anon.ok) return;
		expect(new Set(anon.data.map((r) => r.result_id)).has(world.item['Lab Cart Caliper'])).toBe(
			false
		);
		// POSITIVE CONTROL on the same serial, as the admin.
		const admin = await searchAs(world.admin.id, 'MIT-505-0100');
		expect(admin.ok).toBe(true);
		if (!admin.ok) return;
		expect(new Set(admin.data.map((r) => r.result_id)).has(world.item['Lab Cart Caliper'])).toBe(
			true
		);
	});

	it('accepts an anonymous INSERT into the search log and no read of it', async () => {
		// Spec 5.4: every query logged with its count, no identity. The grant is
		// INSERT to anon and SELECT to authenticated-and-admin, so the writer
		// genuinely cannot read back what it wrote.
		//
		// DRIVEN AS RAW SQL RATHER THAN THROUGH THE TRANSPORT, because the
		// PostgREST shim models `select` and `rpc` and no write verb at all --
		// so a transport driven through it here would silently prove nothing.
		// What the TRANSPORT does with the value (the clamp, the silence) is
		// pinned in `tests/maps-viewer-transports.test.ts` against a recording
		// client; what the DATABASE allows is this.
		await db.asAnon((q) =>
			q(`insert into public.maps_search_log (query, result_count) values ($1, $2)`, [
				'a query nobody will match',
				0
			])
		);
		const { rows } = await db.sql<{ query: string; result_count: number }>(
			`select query, result_count from public.maps_search_log where query = $1`,
			['a query nobody will match']
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].result_count).toBe(0);

		// And the log carries no identity column to have written one into.
		const { rows: cols } = await db.sql<{ column_name: string }>(
			`select column_name from information_schema.columns
			 where table_schema = 'public' and table_name = 'maps_search_log'`
		);
		expect(cols.map((c) => c.column_name).sort()).toEqual([
			'created_at',
			'id',
			'query',
			'result_count'
		]);
	});

	it('refuses an anonymous read of the log and of the revision history', async () => {
		// The two things a public viewer must never be able to reach: what other
		// people searched for, and the unpublished content in the revision table.
		for (const table of ['maps_search_log', 'maps_revisions']) {
			await expect(
				db.asAnon((q) => q(`select * from public.${table} limit 1`))
			).rejects.toThrow(/permission denied/i);
		}
		// POSITIVE CONTROL: the owner connection reads both, so the rejections
		// above are the grants and not a table that does not exist.
		await expect(db.sql('select * from public.maps_search_log limit 1')).resolves.toBeTruthy();
		await expect(db.sql('select * from public.maps_revisions limit 1')).resolves.toBeTruthy();
	});
});

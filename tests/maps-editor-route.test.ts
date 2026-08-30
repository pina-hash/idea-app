// tests/maps-editor-route.test.ts
//
// THE /maps/edit LOAD GUARD, DRIVEN THROUGH THE REAL LOAD -- both directions
// in one test, because a refusal assertion that would also pass against a
// broken page is not an assertion: the same fixture, the same drive, has to
// refuse the non-admin AND answer the admin with rows only an admin can see.
//
// The refusal is 404 -- not 403, not a redirect -- because an editor lane's
// existence is not public (the /admin and /foundry/review posture). And it is
// the LOAD that refuses: a non-admin never receives a page that renders
// empty, which is what the prompt for this bundle asked to be proven.
//
// The admin's payload is asserted by IDENTITY, not by count (verification
// addenda rule 17): the sorted node names are the fixture's own, so a drifted
// population names which row moved instead of only that a total did.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import { seedMapsWorld, startMapsDb, type MapsWorld } from './db/maps-fixture';
import type { TestDb } from './db/harness';
import { load } from '../src/routes/maps/edit/+page.server';

let db: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;
let world: MapsWorld;

/** The staged-edit description, distinct from the live row's on purpose. */
const STAGED_DESCRIPTION = 'Three mills and the incoming surface grinder.';

beforeAll(async () => {
	db = await startMapsDb();
	fks = await loadForeignKeys(db);
	world = await seedMapsWorld(db);

	// Stage a PENDING edit on a published node, exactly as the editor stages
	// one: an admin insert into maps_revisions (state='pending', full proposed
	// row as the snapshot). The load must hand it back beside the live rows.
	await db.asUser(world.admin.id, async (q) => {
		await q(
			`insert into public.maps_revisions (node_id, state, snapshot)
			 values ($1, 'pending', $2)`,
			[
				world.node['Mill Room'],
				JSON.stringify({
					parent_id: world.node['IDEA Building'],
					kind: 'room',
					name: 'Mill Room',
					subtype: null,
					description: STAGED_DESCRIPTION,
					outline: { kind: 'rect', w: 300, h: 300 },
					position_x_in: 400,
					position_y_in: 0,
					rotation_deg: null,
					elevation_order: null,
					elevation_h_in: null,
					elevation_w_in: null
				})
			]
		);
	});
});

afterAll(async () => {
	await db?.stop();
});

interface LoadedMaps {
	maps: {
		nodes: { id: string; name: string; status: string }[];
		itemTypes: { name: string; status: string }[];
		items: { status: string }[];
		stock: { status: string }[];
		pending: { node_id: string | null; snapshot: Record<string, unknown> }[];
	};
}

/** Drives the REAL load as one caller. Null = no session at all. */
function drive(userId: string | null): Promise<LoadedMaps> {
	const supabase = createPostgrestShim(db, fks, userId);
	return load({
		locals: { supabase, claims: userId ? { sub: userId } : null }
	} as unknown as Parameters<typeof load>[0]) as unknown as Promise<LoadedMaps>;
}

describe('/maps/edit load guard', () => {
	it('refuses a non-admin with 404 and answers an admin with the drafts and the pending edit, in the same test', async () => {
		// The refusing half: no session, and a signed-in NON-admin (a real
		// @boscotech.edu teacher, which grants nothing elevated).
		await expect(drive(null)).rejects.toMatchObject({ status: 404 });
		await expect(drive(world.nonAdmin.id)).rejects.toMatchObject({ status: 404 });

		// The answering half, which is what stops the refusal passing against a
		// broken page: the SAME drive, as the admin, returns the whole tree --
		// including rows a non-admin could never have been handed even if the
		// guard were skipped, because RLS answers published rows only.
		const { maps } = await drive(world.admin.id);

		const names = maps.nodes.map((n) => n.name).sort();
		expect(names).toEqual(
			[
				'Bench Cabinet',
				'Drawer 1',
				'Drawer 2',
				'Fabrication Annex',
				'IDEA Building',
				'Lab Cart',
				'Machine Shop',
				'Mill Room',
				'Prototype Lab',
				'Tool Chest A'
			].sort()
		);
		// The two draft nodes are the rows whose presence separates the admin
		// read from the public one.
		const drafts = maps.nodes.filter((n) => n.status === 'draft').map((n) => n.name);
		expect(drafts.sort()).toEqual(['Fabrication Annex', 'Prototype Lab']);

		const draftTypes = maps.itemTypes.filter((t) => t.status === 'draft').map((t) => t.name);
		expect(draftTypes).toEqual(['Prototype Widget']);

		// The staged edit rides the payload, carrying the snapshot the editor
		// seeds its form from.
		expect(maps.pending).toHaveLength(1);
		expect(maps.pending[0].node_id).toBe(world.node['Mill Room']);
		expect(maps.pending[0].snapshot.description).toBe(STAGED_DESCRIPTION);
	});

	it('answers a signed-in non-admin 404 even though the public read would have rows for them', async () => {
		// The guard is not "there is nothing to show": a non-admin CAN read
		// published maps rows (that is the public tier). The 404 is about the
		// SURFACE, so the same caller who gets rows from the table gets
		// nothing from the route.
		const shim = createPostgrestShim(db, fks, world.nonAdmin.id);
		const { data } = await shim.from('maps_nodes').select('id, name, status');
		const rows = data as { status: string }[];
		expect(rows.length).toBeGreaterThan(0); // positive control: the table answers
		expect(rows.every((r) => r.status === 'published')).toBe(true);
		await expect(drive(world.nonAdmin.id)).rejects.toMatchObject({ status: 404 });
	});
});

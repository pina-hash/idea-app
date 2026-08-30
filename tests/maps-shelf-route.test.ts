// tests/maps-shelf-route.test.ts
//
// THE HOISTED GATE, AND THE SECOND PAGE THAT DEPENDS ON IT.
//
// `/maps/edit` grew a second page in this bundle (the shelf-entry surface), so
// its admin check moved into `+layout.server.ts` -- a group-wide gate stated
// once, which is what makes a THIRD page gated by existing rather than by
// somebody remembering to copy a check. That move is only safe if the layout
// really refuses, so this drives the REAL layout load and the REAL shelf page
// load rather than a description of them.
//
// THE SHELF PAGE'S OWN LOAD DELIBERATELY CARRIES NO GATE, which is the point of
// the hoist and also the thing that would be catastrophic if the layout were
// wrong. So both halves are asserted here: the layout refuses a non-admin and
// no-session caller with 404, and the page load is proven to be the
// unguarded-by-design half by driving it directly. A reader who finds that
// second assertion alarming is reading it correctly -- it is why the first one
// exists.
//
// MUTATION-CHECKED (this session): opening the layout gate reddens the refusal
// assertions here while the editor page's own second layer stays closed, which
// is the defence-in-depth claim measured rather than asserted.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import { seedMapsWorld, startMapsDb, type MapsWorld } from './db/maps-fixture';
import type { TestDb } from './db/harness';
import { load as layoutLoad } from '../src/routes/maps/edit/+layout.server';
import { load as shelfLoad } from '../src/routes/maps/edit/shelf/+page.server';
import { load as editorLoad } from '../src/routes/maps/edit/+page.server';

let db: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;
let world: MapsWorld;

beforeAll(async () => {
	db = await startMapsDb();
	fks = await loadForeignKeys(db);
	world = await seedMapsWorld(db);
});

afterAll(async () => {
	await db?.stop();
});

const localsFor = (userId: string | null) => ({
	supabase: createPostgrestShim(db, fks, userId),
	claims: userId ? { sub: userId } : null
});

function driveLayout(userId: string | null) {
	return layoutLoad({ locals: localsFor(userId) } as unknown as Parameters<typeof layoutLoad>[0]);
}

interface ShelfPayload {
	maps: { nodes: { name: string; status: string }[]; photos: unknown[] };
	containerId: string | null;
}

function driveShelf(userId: string | null, query = ''): Promise<ShelfPayload> {
	return shelfLoad({
		locals: localsFor(userId),
		url: new URL(`http://localhost/maps/edit/shelf${query}`)
	} as unknown as Parameters<typeof shelfLoad>[0]) as unknown as Promise<ShelfPayload>;
}

describe('the gate that now covers the whole /maps/edit area', () => {
	it('refuses no session and a signed-in non-admin with 404, and admits the admin, in one test', async () => {
		// The refusing half. 404 rather than 403 or a redirect: an editor
		// lane's existence is not public.
		await expect(driveLayout(null)).rejects.toMatchObject({ status: 404 });
		await expect(driveLayout(world.nonAdmin.id)).rejects.toMatchObject({ status: 404 });

		// The answering half, which is what stops the refusal passing against a
		// layout that refuses everybody.
		await expect(driveLayout(world.admin.id)).resolves.toEqual({});
	});

	it('still refuses at the editor page itself, so opening one layer leaves the other closed', async () => {
		// DEFENCE IN DEPTH, measured. The editor page kept its own check when
		// the gate was hoisted; this is the assertion that says so, and it is
		// what a mutation opening the layout has to get past.
		const drive = (userId: string | null) =>
			editorLoad({ locals: localsFor(userId) } as unknown as Parameters<typeof editorLoad>[0]);
		await expect(drive(null)).rejects.toMatchObject({ status: 404 });
		await expect(drive(world.nonAdmin.id)).rejects.toMatchObject({ status: 404 });
	});
});

describe('the shelf page load', () => {
	it('hands the admin the whole map INCLUDING the photo rows the surface needs', async () => {
		const payload = await driveShelf(world.admin.id);
		const names = payload.maps.nodes.map((n) => n.name).sort();
		expect(names).toContain('Drawer 1');
		expect(names).toContain('Tool Chest A');
		// The draft rows are what separate an admin read from the public one,
		// so their presence is the proof this ran as an admin.
		expect(payload.maps.nodes.some((n) => n.status === 'draft')).toBe(true);
		// 0163's photo rows ride the same read. Empty is the right answer on a
		// fixture with no photos, and the KEY being present is what proves the
		// select resolved rather than the table being missing -- a select
		// naming an unknown table fails the whole read (PGRST200).
		expect(Array.isArray(payload.maps.photos)).toBe(true);
	});

	it('passes `?node=` through as the container, unvalidated and on purpose', async () => {
		const drawer = world.node['Drawer 1'];
		expect((await driveShelf(world.admin.id, `?node=${drawer}`)).containerId).toBe(drawer);
		// A bookmark to a container somebody deleted answers "pick one" rather
		// than 404: the component resolves the id against the nodes it was
		// handed, and an id naming nothing falls through to the picker.
		expect((await driveShelf(world.admin.id, '?node=node-that-was-deleted')).containerId).toBe(
			'node-that-was-deleted'
		);
		expect((await driveShelf(world.admin.id)).containerId).toBeNull();
	});

	it('CARRIES NO GATE OF ITS OWN, which is exactly what the hoisted one is for', async () => {
		// Driven directly, with no layout above it, this load answers a
		// non-admin -- because in the app the layout has already refused them.
		// Asserting it makes the dependency explicit rather than leaving it to
		// be discovered by whoever next moves the layout.
		const payload = await driveShelf(world.nonAdmin.id);
		expect(Array.isArray(payload.maps.nodes)).toBe(true);
		// And RLS is still the real boundary underneath: what that caller gets
		// is published rows only, never the drafts the admin read above.
		expect(payload.maps.nodes.every((n) => n.status === 'published')).toBe(true);
	});
});

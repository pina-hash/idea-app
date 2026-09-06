// tests/maps-editor-entry.test.ts
//
// THE WAY INTO THE EDITOR, BOTH HALVES, EACH OPENABLE ON ITS OWN (prompt 0093,
// B6 control 3). The public map at `/maps` offers an "Edit map" control to a
// caller who may edit and to nobody else; the route under `/maps/edit` refuses
// a caller who may not, whether or not they saw a control. Those are two
// different mechanisms -- a render predicate and a load guard -- and this file
// asserts them SEPARATELY, so that opening either one reddens exactly its own
// half:
//
//   * the RENDER half: the REAL `/maps/+page.svelte`, server-rendered with the
//     root layout's `isAdmin` set and unset, counts the control. Zero for a
//     signed-out visitor and for a signed-in non-admin whose grants have not
//     been resolved; one for an admin. Mutating `mapsCanEnterEditor` to answer
//     yes for everybody reddens this and only this.
//   * the ROUTE half: the REAL `+layout.server.ts` load, driven through the
//     PostgREST shim as a no-session caller, a signed-in non-editor and an
//     admin. Opening the layout gate reddens this and only this.
//
// AND THE TWO ARE TIED TOGETHER BY A REAL GRANT: the same non-admin who is
// refused and shown nothing is GRANTED a container through the real
// `maps_editor_grant` RPC, and then the scope the page would probe answers
// yes and the layout admits them -- in one test, so "the control follows the
// gate" is measured rather than described.
//
// WHAT IS NOT ASSERTED HERE: the grantee's control appearing after hydration on
// the public page. It is resolved by a browser-side probe (the page's
// `onMount`), which a server render never runs; the predicate that probe feeds
// is what the grant test below pins.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import MapsPage from '../src/routes/maps/+page.svelte';
import { page } from './stubs/app-state';
import { mapsViewerFixture } from '../src/routes/dev/maps-viewer/fixture';
import { MAPS_EDITOR_ENTRY_LABEL, MAPS_EDITOR_PATH, mapsCanEnterEditor } from '../src/lib/maps/entry';
import { MAPS_ADMIN_SCOPE, MAPS_NO_SCOPE } from '../src/lib/maps/grants';
import { loadMapsScope, type MapsWriteClient } from '../src/lib/maps/transports';
import { load as layoutLoad } from '../src/routes/maps/edit/+layout.server';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import { startTestDb, type TestDb } from './db/harness';
import { MAPS_MIGRATIONS, seedMapsWorld, type MapsWorld } from './db/maps-fixture';

const count = (html: string, needle: string) => html.split(needle).length - 1;

/**
 * Server-render the REAL public map page as one viewer. The page reads
 * `page.data.isAdmin` (the root layout's) and `page.url` (for the search), so
 * both are put in place and restored however the render ends.
 */
function renderMaps(pageData: Record<string, unknown>): string {
	const stub = page as unknown as { data: Record<string, unknown>; url?: URL };
	const previous = { data: stub.data, url: stub.url };
	stub.data = pageData;
	stub.url = new URL('http://localhost/maps');
	try {
		return render(MapsPage, {
			props: {
				data: {
					maps: mapsViewerFixture(),
					mapsError: null,
					mapsSearchResults: [],
					mapsQuery: ''
				} as never
			}
		}).body;
	} finally {
		stub.data = previous.data;
		stub.url = previous.url;
	}
}

describe('the entry control on /maps: rendered for an editor, absent for everyone else', () => {
	it('an admin gets exactly one control, linking to the editor and saying what it is', () => {
		const html = renderMaps({ isAdmin: true, claims: { sub: 'admin-uid' } });
		expect(count(html, 'data-testid="maps-edit-entry"')).toBe(1);
		expect(html).toContain(`href="${MAPS_EDITOR_PATH}"`);
		expect(html).toContain(MAPS_EDITOR_ENTRY_LABEL);
		// The positive control for the zeros below: the same render carries the
		// viewer, so an absent control is an absence and not a page that failed.
		expect(count(html, 'data-testid="maps-viewer"')).toBe(1);
	});

	it('a signed-out visitor gets none, and the viewer is still there', () => {
		const html = renderMaps({});
		expect(count(html, 'data-testid="maps-edit-entry"')).toBe(0);
		expect(html).not.toContain(MAPS_EDITOR_ENTRY_LABEL);
		expect(count(html, 'data-testid="maps-viewer"')).toBe(1);
	});

	it('a signed-in non-admin gets none in the first render (their grants are probed after hydration)', () => {
		const html = renderMaps({ isAdmin: false, claims: { sub: 'student-uid' } });
		expect(count(html, 'data-testid="maps-edit-entry"')).toBe(0);
		expect(count(html, 'data-testid="maps-viewer"')).toBe(1);
	});

	it('the predicate: an admin or any grant says yes; no scope, no grants, or an unresolved scope says no', () => {
		expect(mapsCanEnterEditor(MAPS_ADMIN_SCOPE)).toBe(true);
		expect(mapsCanEnterEditor({ admin: false, grants: [{ node_id: 'some-node' }] })).toBe(true);
		expect(mapsCanEnterEditor(MAPS_NO_SCOPE)).toBe(false);
		expect(mapsCanEnterEditor(null)).toBe(false);
		expect(mapsCanEnterEditor(undefined)).toBe(false);
	});
});

describe('the route refuses the same caller the control is hidden from, and a grant flips both together', () => {
	let db: TestDb;
	let fks: Awaited<ReturnType<typeof loadForeignKeys>>;
	let world: MapsWorld;

	beforeAll(async () => {
		// The maps chain plus the grants migration: the RPC the flip below
		// calls is 0172's.
		db = await startTestDb([...MAPS_MIGRATIONS, '0172_maps_editor_grants.sql']);
		fks = await loadForeignKeys(db);
		world = await seedMapsWorld(db);
	});

	afterAll(async () => {
		await db?.stop();
	});

	const drive = (userId: string | null) =>
		layoutLoad({
			locals: { supabase: createPostgrestShim(db, fks, userId), claims: userId ? { sub: userId } : null }
		} as unknown as Parameters<typeof layoutLoad>[0]);

	it('no session: 404 from the route (there is no scope to show a control for)', async () => {
		await expect(drive(null)).rejects.toMatchObject({ status: 404 });
	});

	it('a signed-in non-editor: the scope the page would probe says NO, and the route says 404', async () => {
		const shim = createPostgrestShim(db, fks, world.nonAdmin.id);
		const scope = await loadMapsScope(shim as unknown as MapsWriteClient, false);
		expect(scope.grants).toEqual([]);
		expect(mapsCanEnterEditor(scope)).toBe(false);
		await expect(drive(world.nonAdmin.id)).rejects.toMatchObject({ status: 404 });
	});

	it('the admin: the predicate says YES and the route admits them as an admin', async () => {
		expect(mapsCanEnterEditor({ admin: true, grants: [] })).toBe(true);
		await expect(drive(world.admin.id)).resolves.toMatchObject({
			mapsIsAdmin: true,
			mapsScope: { admin: true }
		});
	});

	it('GRANTING the non-editor one container flips both halves: the probe says YES and the route admits them', async () => {
		await db.asUser(world.admin.id, async (q) => {
			await q('select public.maps_editor_grant($1, $2)', [world.nonAdmin.email, world.node['Machine Shop']]);
		});
		const shim = createPostgrestShim(db, fks, world.nonAdmin.id);
		const scope = await loadMapsScope(shim as unknown as MapsWriteClient, false);
		expect(scope.grants.map((g) => g.node_id)).toEqual([world.node['Machine Shop']]);
		expect(mapsCanEnterEditor(scope)).toBe(true);
		await expect(drive(world.nonAdmin.id)).resolves.toMatchObject({
			mapsIsAdmin: false,
			mapsScope: { admin: false }
		});
	});
});

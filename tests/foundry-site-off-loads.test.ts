// tests/foundry-site-off-loads.test.ts
//
// WHILE THE WHOLE FOUNDRY IS OFF, THE PAGES THAT NAME OTHER STUDENTS SEND
// NOTHING (report c26026b0, ledger 0360).
//
// The layout renders the "turned off" panel in place of every page, but a
// panel is markup; the PAYLOAD is the boundary. The gallery (everybody's apps),
// a publisher's page and the request board (other students' names) each
// return an empty payload without making a single read, and the identical
// load with the switch on does read: the positive control that the empty
// answer is the switch's and not a load that reads nothing anyway.
//
// THE REAL LOADS, imported from their own files, with a client that records
// every RPC it is asked for.

import { describe, expect, it } from 'vitest';

import { load as galleryLoad } from '../src/routes/foundry/+page.server';
import { load as authorLoad } from '../src/routes/foundry/author/[ownerId]/+page.server';
import { load as requestsLoad } from '../src/routes/foundry/requests/+page.server';
import { foundryAccessFromRpc } from '../src/lib/foundry/access';

const OFF = foundryAccessFromRpc(
	{ open: true, closed: [], site_open: false, site_note: null, site_closed_at: '2026-10-01T08:00:00Z', site_exempt: false },
	null
);
const OFF_ADMIN = foundryAccessFromRpc(
	{ open: true, closed: [], site_open: false, site_note: null, site_closed_at: '2026-10-01T08:00:00Z', site_exempt: true },
	null
);
const ON = foundryAccessFromRpc({ open: true, closed: [] }, null);

function recorder() {
	const calls: string[] = [];
	const supabase = {
		rpc: async (fn: string) => {
			calls.push(fn);
			if (fn === 'foundry_author_profile') {
				return {
					data: { owner: 'o', owner_display_name: null, owner_full_name: 'Ana Reyes', owner_class: null, avatar: null, avatar_url: null, pathway: null, app_count: 1, first_published_at: null },
					error: null
				};
			}
			return { data: [], error: null };
		}
	};
	return { calls, supabase };
}

async function drive(load: (e: never) => unknown, access: unknown, extra: Record<string, unknown> = {}) {
	const r = recorder();
	const out = (await load({
		locals: { supabase: r.supabase, claims: { sub: 'u-1' } },
		url: new URL('https://ideabosco.com/foundry'),
		params: { ownerId: '11111111-1111-4111-8111-111111111111' },
		parent: async () => ({ foundryAccess: access }),
		...extra
	} as never)) as Record<string, unknown>;
	return { out, calls: r.calls };
}

describe('the payloads that name other students are withheld while it is off', () => {
	it('gallery: no apps and no reads while off; reads while on', async () => {
		const off = await drive(galleryLoad as never, OFF);
		expect(off.out.apps).toEqual([]);
		expect(off.calls).toEqual([]);
		const on = await drive(galleryLoad as never, ON);
		expect(on.calls).toContain('foundry_list_apps');
	});

	it('publisher page: no card and no reads while off; the card while on', async () => {
		const off = await drive(authorLoad as never, OFF);
		expect(off.out.card).toBeNull();
		expect(off.out.apps).toEqual([]);
		expect(off.calls).toEqual([]);
		const on = await drive(authorLoad as never, ON);
		expect(on.calls).toContain('foundry_author_profile');
		expect((on.out.card as { owner_full_name: string }).owner_full_name).toBe('Ana Reyes');
	});

	it('request board: no requests and no reads while off; reads while on', async () => {
		const off = await drive(requestsLoad as never, OFF);
		expect(off.out.requests).toEqual([]);
		expect(off.calls).toEqual([]);
		const on = await drive(requestsLoad as never, ON);
		expect(on.calls).toEqual(['foundry_game_requests']);
	});

	it('an administrator, exempt, still gets every payload while it is off', async () => {
		expect((await drive(galleryLoad as never, OFF_ADMIN)).calls).toContain('foundry_list_apps');
		expect((await drive(requestsLoad as never, OFF_ADMIN)).calls).toEqual(['foundry_game_requests']);
		expect((await drive(authorLoad as never, OFF_ADMIN)).calls).toContain('foundry_author_profile');
	});

	it('the board says it is not on yet on a database without 0230', async () => {
		const r = await requestsLoad({
			locals: { supabase: { rpc: async () => ({ data: null, error: { code: 'PGRST202' } }) } },
			parent: async () => ({ foundryAccess: ON })
		} as never);
		expect(r).toEqual({ requests: [], available: false });
	});
});

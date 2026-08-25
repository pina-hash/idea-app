// tests/foundry-delete-route.test.ts
//
// THE DELETE ROUTE, DRIVEN AS THE ROUTE and not as a copy of it.
//
// WHY THIS FILE EXISTS, given the repo adds tests sparingly. The route is the
// join between two systems that have no transaction between them, and every
// guarantee at that join fails SILENTLY:
//
// 1. A FAILED OBJECT SWEEP IS NOT A FAILED DELETE. The rows are gone before
//    the sweep runs, so a route that reported `ok: false` because Storage was
//    unreachable would tell a student their app is still there when it is not
//    -- and the obvious next thing they do is press Delete again, on a row
//    that no longer exists, and read "That app does not exist." This is the
//    one behaviour here that nothing on screen would ever reveal as wrong.
//
// 2. THE RPC's OWN SENTENCE REACHES THE STUDENT. Those messages were written
//    for the person who will read them ("That is the build your app
//    publishes."). A route that swallowed them for a generic failure string
//    would leave every refusal meaning nothing, and no type or check would
//    notice.
//
// 3. THE ROUTE IS NOT THE AUTHORIZATION BOUNDARY. It must call the RPC on the
//    CALLER'S client, never a service-role one, or the database stops deciding
//    who may delete. That is asserted structurally: the client the handler is
//    handed is the only one it calls.
//
// It drives the REAL handler, imported from its own file. The Supabase client
// is a recording stand-in rather than a live project -- there is no Storage
// service in this fixture -- so what this file covers is the ROUTE's decisions.
// The RPCs' own decisions are covered against a real Postgres in
// tests/foundry-delete.test.ts, and the object sweep against real Storage is
// covered by neither and is stated as unverified in this bundle's history entry.

import { describe, expect, it } from 'vitest';
import { POST } from '../src/routes/api/foundry/delete/+server.ts';

const APP = '11111111-1111-4111-8111-111111111111';
const VERSION = '22222222-2222-4222-8222-222222222222';

type RpcCall = { fn: string; args: Record<string, unknown> };

/**
 * A Supabase stand-in that RECORDS. Nothing here is more permissive than the
 * real thing: it answers exactly what the RPC would and records what was
 * asked, so "the route called the caller's client, once, with these arguments"
 * is a counted assertion.
 */
function client(answer: { data?: unknown; error?: { message: string } | null }) {
	const calls: RpcCall[] = [];
	return {
		calls,
		rpc: async (fn: string, args: Record<string, unknown>) => {
			calls.push({ fn, args });
			return { data: answer.data ?? null, error: answer.error ?? null };
		}
	};
}

async function post(
	body: unknown,
	supabase: ReturnType<typeof client>,
	claims: { sub: string } | null = { sub: 'someone' }
) {
	const res = await POST({
		request: new Request('http://localhost/api/foundry/delete', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		locals: { supabase, claims }
	} as never);
	return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const APP_PLAN = {
	ok: true,
	app_id: APP,
	slug: 'ember-clock',
	title: 'Ember Clock',
	version_ids: [VERSION],
	zip_paths: ['uid/one.zip'],
	cover_path: 'uid/cover.png',
	versions_deleted: 1,
	files_deleted: 4
};

describe('the delete route // who is asking', () => {
	it('refuses a signed-out caller before it calls anything', async () => {
		const c = client({ data: APP_PLAN });
		const r = await post({ appId: APP }, c, null);
		expect(r.status).toBe(401);
		// THE POSITIVE HALF: no RPC was reached at all, so a signed-out request
		// cannot even cause a definer function to run.
		expect(c.calls).toHaveLength(0);
	});

	it('calls the RPC on the CALLER\'s own client, once', async () => {
		const c = client({ data: APP_PLAN });
		await post({ appId: APP }, c);
		expect(c.calls).toEqual([{ fn: 'foundry_delete_app', args: { p_app_id: APP } }]);
	});

	it('passes the RPC\'s own sentence through verbatim', async () => {
		const message =
			'That is the build your app publishes. Make another approved version live first, or delete the whole app.';
		const c = client({ error: { message } });
		const r = await post({ versionId: VERSION }, c);
		expect(r.body).toMatchObject({ ok: false, message });
		expect(c.calls).toEqual([
			{ fn: 'foundry_delete_version', args: { p_version_id: VERSION } }
		]);
	});
});

describe('the delete route // what it will act on', () => {
	it('refuses a body naming both, or neither, without calling anything', async () => {
		for (const body of [{ appId: APP, versionId: VERSION }, {}]) {
			const c = client({ data: APP_PLAN });
			const r = await post(body, c);
			expect(r.status).toBe(400);
			expect(c.calls).toHaveLength(0);
		}
	});

	it('refuses an id that is not a uuid without calling anything', async () => {
		for (const body of [{ appId: 'nope' }, { versionId: '../../etc' }]) {
			const c = client({ data: APP_PLAN });
			const r = await post(body, c);
			expect(r.status).toBe(400);
			expect(c.calls).toHaveLength(0);
		}
	});

	// POSITIVE CONTROL for the two above: a well-formed body of each kind DOES
	// reach its RPC, so the refusals are about the body and not about the route
	// being broken.
	it('reaches the right RPC for each well-formed body', async () => {
		const a = client({ data: APP_PLAN });
		await post({ appId: APP }, a);
		expect(a.calls[0].fn).toBe('foundry_delete_app');

		const v = client({
			data: {
				ok: true,
				app_id: APP,
				slug: 's',
				version_id: VERSION,
				ordinal: 2,
				zip_path: 'uid/two.zip',
				files_deleted: 3
			}
		});
		await post({ versionId: VERSION }, v);
		expect(v.calls[0].fn).toBe('foundry_delete_version');
	});
});

describe('the delete route // a failed sweep is not a failed delete', () => {
	/**
	 * `SUPABASE_SERVICE_ROLE_KEY` is unset in this fixture, so
	 * `sweepFoundryObjects` takes its not-configured branch and removes nothing
	 * at all. That is the WORST case of a partial sweep and it must still be a
	 * successful delete: the rows went first, and they are gone.
	 */
	it('answers ok with a storageProblem when no object could be removed', async () => {
		const c = client({ data: APP_PLAN });
		const r = await post({ appId: APP }, c);

		expect(r.status).toBe(200);
		expect(r.body.ok).toBe(true);
		expect(r.body.deleted).toEqual({ kind: 'app', slug: 'ember-clock', title: 'Ember Clock' });
		// The counts are the ROWS, which really did go.
		expect(r.body.counts).toEqual({ versions: 1, fileRows: 4 });
		// And the sweep says so rather than pretending.
		expect(r.body.storageProblem).toMatch(/not configured/i);
		expect(r.body.removed).toEqual({ bundles: 0, uploads: 0, covers: 0 });
	});

	it('carries the version plan\'s own paths and never the app\'s cover', async () => {
		const c = client({
			data: {
				ok: true,
				app_id: APP,
				slug: 's',
				version_id: VERSION,
				ordinal: 2,
				zip_path: 'uid/two.zip',
				files_deleted: 3
			}
		});
		const r = await post({ versionId: VERSION }, c);
		expect(r.body.ok).toBe(true);
		expect(r.body.deleted).toEqual({ kind: 'version', ordinal: 2 });
		expect(r.body.counts).toEqual({ versions: 1, fileRows: 3 });
		expect(r.body.storageProblem).toMatch(/not configured/i);
		// WHAT THIS FILE DOES NOT COVER, said rather than implied: that a
		// version delete leaves the APP's cover object alone. The route builds
		// that plan with `coverPath: null` and the plan never reaches the
		// response body, so it is not observable from here -- and with no
		// service key configured the sweep short-circuits before it could be.
		// Verifying it needs a real Storage service.
		expect(Object.keys(r.body)).not.toContain('plan');
	});
});

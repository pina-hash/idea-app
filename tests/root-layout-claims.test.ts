// tests/root-layout-claims.test.ts
//
// THE ROOT UNIVERSAL LOAD ASKS AUTH FOR THE CLAIMS ONLY IN THE BROWSER
// (ledger 0360, report R08).
//
// `src/routes/+layout.ts` called `supabase.auth.getClaims()` unconditionally.
// On the server that is a SECOND validation of a session `hooks.server.ts` had
// already validated (and retried), and on this project it is not local: the
// JWTs are signed HS256, so auth-js falls back to `getUser()`, a live round
// trip to the Auth server, which reads Postgres. One extra Auth call on every
// server-rendered page load in the site, for an answer the hook had already
// put in `data.claims`.
//
// The browser call stays, exactly as it was: it is the post-OAuth hydration
// fix described beside it (the first server render can land a beat before the
// session cookie is readable, and the browser client reads it fresh).
//
// The REAL load is imported from its own file; only the Supabase client
// factory is replaced, by a fake whose `auth.getClaims` counts its calls.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ browser: false, getClaims: 0, rpc: 0 }));

vi.mock('@supabase/ssr', () => {
	const client = () => ({
		auth: {
			getClaims: async () => {
				state.getClaims += 1;
				return { data: { claims: { sub: 'from-the-client', email: 'client@boscotech.net' } }, error: null };
			}
		},
		rpc: async () => {
			state.rpc += 1;
			return { data: false, error: null };
		},
		from: () => {
			throw new Error('the root load must not read a table when the profile is already in hand');
		}
	});
	return {
		isBrowser: () => state.browser,
		createBrowserClient: client,
		createServerClient: client
	};
});

const { load } = await import('../src/routes/+layout');

const HOOK_CLAIMS = { sub: 'user-1', email: 'alice@boscotech.net', role: 'authenticated' };
const PROFILE = { id: 'user-1', role: 'student', display_name: null, full_name: 'Alice' };

type LoadOut = { claims: unknown; userProfile: unknown; isAdmin: boolean; supabase: unknown };

function run(data: Record<string, unknown>): Promise<LoadOut> {
	return (load as unknown as (e: unknown) => Promise<LoadOut>)({
		fetch: globalThis.fetch,
		data,
		depends: () => {}
	});
}

beforeEach(() => {
	state.getClaims = 0;
	state.rpc = 0;
});

describe('the root universal load', () => {
	it('on the SERVER it hands back the hook-validated claims and makes no Auth call', async () => {
		state.browser = false;
		const out = await run({ claims: HOOK_CLAIMS, userProfile: PROFILE, isAdmin: false, cookies: [] });
		expect(state.getClaims).toBe(0);
		expect(out.claims).toBe(HOOK_CLAIMS);
		expect(out.userProfile).toBe(PROFILE);
		expect(state.rpc).toBe(0);
	});

	it('on the server a signed-out request stays signed out, still with no Auth call', async () => {
		state.browser = false;
		const out = await run({ claims: null, userProfile: null, isAdmin: false, cookies: [] });
		expect(state.getClaims).toBe(0);
		expect(out.claims).toBeNull();
	});

	it('in the BROWSER it still asks the client exactly once (positive control: the hydration fix stands)', async () => {
		state.browser = true;
		const out = await run({ claims: HOOK_CLAIMS, userProfile: PROFILE, isAdmin: false, cookies: [] });
		expect(state.getClaims).toBe(1);
		expect((out.claims as { sub: string }).sub).toBe('from-the-client');
	});
});

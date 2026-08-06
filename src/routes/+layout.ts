import { createBrowserClient, createServerClient, isBrowser } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { fetchUserProfile } from '$lib/profile';
import type { LayoutLoad } from './$types';

/**
 * Creates a Supabase client available to every page and component, on both
 * the server (during SSR) and the browser.
 */
export const load: LayoutLoad = async ({ fetch, data, depends }) => {
	depends('supabase:auth');

	const supabase = isBrowser()
		? createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
				global: { fetch }
			})
		: createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
				global: { fetch },
				cookies: {
					getAll() {
						return data.cookies;
					}
				}
			});

	// Resolve claims from THIS client. This matters for the sign-in flow: after
	// the OAuth callback redirects back, the browser client reads the freshly
	// set session cookies here (during hydration) and reports "signed in" even
	// if the very first server render of this request happened a beat before
	// the session was fully readable server-side. Without this, the UI stays on
	// the "Sign in" button until a manual refresh. On the server this just
	// re-reads the same session hooks.server.ts already validated.
	const { data: claimsData, error } = await supabase.auth.getClaims();
	const claims = error ? null : (claimsData?.claims ?? null);

	// Self-heal the profile on the browser. Right after the OAuth callback
	// redirect, the first server render can resolve `claims` (used above and in
	// hooks.server.ts) yet still come back with a null `userProfile` -- the
	// server-side profiles read runs before the request's auth is fully settled,
	// so RLS returns no row. That is what left the menu showing "Signed in" /
	// "SI" until a manual refresh. The browser client here already holds the
	// session cookies, so it can read the row directly during hydration, making
	// the name and avatar correct without a refresh. Gated to the browser so
	// SSR (which already tried via +layout.server.ts) doesn't double-fetch.
	let userProfile = data?.userProfile ?? null;
	let isAdmin = data?.isAdmin ?? false;
	const userId = (claims as { sub?: string } | null)?.sub;
	if (!userProfile && userId && isBrowser()) {
		userProfile = await fetchUserProfile(supabase, userId);
		// The admin flag (0067) is resolved server-side in +layout.server.ts and
		// only re-checked here in the SAME transient the profile self-heal
		// exists for: if that read came back empty, the server's is_admin() call
		// raced the settling session too and would have answered false for a
		// real admin. Deliberately not re-checked on the normal path -- that
		// would be a second round trip on every page for every visitor.
		const { data: adminData } = await supabase.rpc('is_admin');
		isAdmin = adminData === true;
	}

	return { supabase, claims, userProfile, isAdmin };
};

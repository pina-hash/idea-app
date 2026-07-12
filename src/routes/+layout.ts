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
	const userId = (claims as { sub?: string } | null)?.sub;
	if (!userProfile && userId && isBrowser()) {
		userProfile = await fetchUserProfile(supabase, userId);
	}

	return { supabase, claims, userProfile };
};

import { createBrowserClient, createServerClient, isBrowser } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
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

	return { supabase, claims, userProfile: data?.userProfile ?? null };
};

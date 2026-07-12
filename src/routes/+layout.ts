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

	// `claims` were already validated once in hooks.server.ts (which is what
	// +layout.server.ts's `userProfile` fetch is keyed on); re-validating here
	// on a second, independent client instance would be redundant and, for
	// projects still on legacy HS256 signing, an extra network round trip
	// (getClaims falls back to a live getUser() call in that case). Just
	// forward the already-verified value.
	return { supabase, claims: data?.claims ?? null, userProfile: data?.userProfile ?? null };
};

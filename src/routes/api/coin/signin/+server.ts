import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Starts Google sign-in and returns to the IDEA Coin Ledger.
 *
 * The Ledger at `/coins/index.html` is a carried-over static page with no
 * Supabase client of its own, so it cannot call `signInWithOAuth` the way
 * every SvelteKit page does. Claiming a contract and applying for a role both
 * need a session, so this is the way in: a plain link the page can point at.
 *
 * The redirect URL is minted by the SERVER Supabase client on purpose. This
 * project uses the PKCE flow, and `/auth/callback` completes it with
 * `exchangeCodeForSession`, which needs the code verifier `signInWithOAuth`
 * stores. Going straight to Supabase's `/authorize` endpoint by hand would
 * skip that and the callback would fail; here the verifier is written through
 * the cookie adapter configured in `hooks.server.ts` and rides the redirect.
 *
 * This is a copy of `/api/coin-ledger/signin`, not a reuse of it: that route
 * belongs to the legacy Apps Script surface Phase 4 removes wholesale, and the
 * Ledger must not still be pointing into it when that happens.
 */
export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const { data, error } = await supabase.auth.signInWithOAuth({
		provider: 'google',
		options: {
			redirectTo: `${url.origin}/auth/callback?next=${encodeURIComponent('/coins/index.html')}`,
			skipBrowserRedirect: true
		}
	});

	if (error || !data?.url) {
		redirect(303, '/auth/error');
	}

	redirect(303, data.url);
};

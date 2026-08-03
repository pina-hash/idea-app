import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Starts Google sign-in and returns to the public coin leaderboard.
 *
 * The leaderboard at `/coins/index.html` is a carried-over static page with no
 * Supabase client of its own, so it cannot call `signInWithOAuth` the way every
 * SvelteKit page does. Now that applying for a role requires a session, it needs
 * some way in — this is it: a plain link the page can point at.
 *
 * The redirect URL is minted by the SERVER Supabase client on purpose. This
 * project uses the PKCE flow, and `/auth/callback` completes it with
 * `exchangeCodeForSession`, which needs the code verifier that `signInWithOAuth`
 * stores. Going straight to Supabase's `/authorize` endpoint by hand would skip
 * that and the callback would fail; here the verifier is written through the
 * cookie adapter configured in `hooks.server.ts` and rides the redirect.
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

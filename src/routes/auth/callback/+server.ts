import { redirect } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestHandler } from './$types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The 0001 signup trigger creates a user's `profiles` row transactionally
 * before Supabase ever issues them a session, but that write and this read
 * happen on different connections, so a manual sign-in cannot just assume
 * it's visible yet. Blocking the redirect here (rather than in every page
 * that reads the profile later) is the one chokepoint that guarantees every
 * subsequent page, starting with the root layout's own profile load, finds
 * the row on its very first try.
 */
async function waitForProfile(supabase: SupabaseClient, userId: string): Promise<void> {
	for (let attempt = 0; attempt < 10; attempt++) {
		const { data } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle();
		if (data) return;
		await sleep(200);
	}
	console.error(
		`auth/callback: profiles row for user ${userId} was not visible after sign-in; proceeding anyway.`
	);
}

/**
 * OAuth (PKCE) callback. Google redirects here with a `code` query param,
 * which we exchange for a session. The session cookies are written by the
 * server Supabase client configured in hooks.server.ts.
 */
export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const code = url.searchParams.get('code');
	const next = url.searchParams.get('next') ?? '/dashboard';

	if (code) {
		const { data, error } = await supabase.auth.exchangeCodeForSession(code);
		if (!error && data.user) {
			await waitForProfile(supabase, data.user.id);
			redirect(303, next);
		}
	}

	redirect(303, '/auth/error');
};

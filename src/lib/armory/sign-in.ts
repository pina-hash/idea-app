import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The site's normal Google sign-in, coming back to the page the person is on,
 * query string included, which is how a connect link survives a sign-in.
 * `/auth/callback`'s `_safeNext` accepts exactly a same-origin path.
 */
export async function armorySignIn(supabase: SupabaseClient | undefined): Promise<void> {
	if (!supabase || typeof window === 'undefined') return;
	const next = window.location.pathname + window.location.search;
	await supabase.auth.signInWithOAuth({
		provider: 'google',
		options: {
			redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
			queryParams: { prompt: 'select_account' }
		}
	});
}

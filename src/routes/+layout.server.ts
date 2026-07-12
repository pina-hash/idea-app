import type { SupabaseClient } from '@supabase/supabase-js';
import type { LayoutServerLoad } from './$types';

const PROFILE_COLUMNS =
	'id, email, full_name, display_name, avatar_url, avatar, role, section_id, pathway, preferences';
// Pre-0038 fallback (pathway column not applied yet): a select naming a
// missing column errors, which would sign everyone out of the profile
// system. This narrower select degrades the portal to "no pathway".
const PROFILE_COLUMNS_NO_PATHWAY =
	'id, email, full_name, display_name, avatar_url, avatar, role, section_id, preferences';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Every signed-in user is guaranteed a profiles row: the 0001 signup trigger
 * creates it in the same transaction as their auth.users row, before a
 * session is ever issued to them. So a query that comes back empty right
 * after sign-in (immediately following the OAuth callback redirect) is a
 * transient read-after-write hiccup, not a real "no profile" account. This
 * retries a few times, with a short backoff, INSIDE this same server load
 * call so the row is always in hand before the page renders, rather than
 * rendering once with nothing and patching it up client-side later.
 */
async function loadProfile(supabase: SupabaseClient, userId: string) {
	let lastError: unknown = null;
	for (let attempt = 0; attempt < 3; attempt++) {
		if (attempt > 0) await sleep(attempt * 150);

		let { data, error } = await supabase
			.from('profiles')
			.select(PROFILE_COLUMNS)
			.eq('id', userId)
			.single();
		if (error) lastError = error;

		if (!data) {
			({ data, error } = await supabase
				.from('profiles')
				.select(PROFILE_COLUMNS_NO_PATHWAY)
				.eq('id', userId)
				.single());
			if (data) (data as Record<string, unknown>).pathway = null;
			if (error) lastError = error;
		}

		if (data) return data;
	}

	if (lastError) {
		console.error('Failed to load profile for signed-in user after retries:', lastError);
	}
	return null;
}

/**
 * Passes the cookies and validated claims from the server to the universal
 * layout load, so the browser client can be created with the same session.
 * Also loads the signed-in user's profile once here (as `userProfile`, a key
 * no page load shadows) so the global ProfileMenu and per-user preferences
 * are available on every page, on the FIRST render (see loadProfile above).
 */
export const load: LayoutServerLoad = async ({ locals: { supabase, claims }, cookies }) => {
	const userProfile = claims ? await loadProfile(supabase, claims.sub) : null;

	return {
		claims,
		userProfile,
		cookies: cookies.getAll()
	};
};

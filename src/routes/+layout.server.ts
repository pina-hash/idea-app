import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchUserProfile } from '$lib/profile';
import type { LayoutServerLoad } from './$types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Load the signed-in user's profile during SSR. Every signed-in user is
 * guaranteed a profiles row (the 0001 signup trigger), so a null here right
 * after sign-in is a transient read (the request's session/token not fully
 * settled server-side yet), not a real "no profile" account. A short retry
 * covers that. If it still comes back empty, the browser-side load in
 * +layout.ts fetches it during hydration, so the name/avatar are still correct
 * without a manual refresh.
 */
async function loadProfile(supabase: SupabaseClient, userId: string) {
	for (let attempt = 0; attempt < 2; attempt++) {
		if (attempt > 0) await sleep(200);
		const profile = await fetchUserProfile(supabase, userId);
		if (profile) return profile;
	}
	return null;
}

/**
 * Passes the cookies and validated claims from the server to the universal
 * layout load, so the browser client can be created with the same session.
 * Also loads the signed-in user's profile once here (as `userProfile`, a key
 * no page load shadows) so the global ProfileMenu and per-user preferences
 * are available on every page, on the first render.
 */
export const load: LayoutServerLoad = async ({ locals: { supabase, claims }, cookies }) => {
	const userProfile = claims ? await loadProfile(supabase, claims.sub) : null;

	return {
		claims,
		userProfile,
		cookies: cookies.getAll()
	};
};

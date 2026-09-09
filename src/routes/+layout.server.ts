import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchUserProfile } from '$lib/profile';
import { isAdmin } from '$lib/server/admin';
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
 *
 * `isAdmin` rides along for the same reason: since 0067 every privileged
 * affordance in the shell (the launcher's admin tools, the dashboard link,
 * FRC teacher tools) keys off admin rather than `role === 'teacher'`, and
 * resolving it once here keeps every component from asking separately.
 */
export const load: LayoutServerLoad = async ({ locals: { supabase, claims }, cookies }) => {
	/*
	 * THE TWO READS ARE INDEPENDENT, SO THEY GO TOGETHER. This ran as two
	 * sequential awaits, which made every authenticated page load in the site
	 * pay both round trips end to end. Nothing links them: `isAdmin` calls the
	 * `is_admin()` RPC, which resolves the caller from their own JWT claims and
	 * reads nothing this profile load produces. (Its pre-0067 fallback does read
	 * `profiles`, but as its own query keyed on the same `claims.sub` -- it does
	 * not consume `userProfile` either, so it is independent too.)
	 *
	 * `Promise.all` and NOT `allSettled`: a rejection here is a failed layout
	 * load, which is what `+error.svelte` and the `handleError` correlation id
	 * exist for. Swallowing one would hand every page a silently empty profile.
	 */
	const [userProfile, admin] = await Promise.all([
		claims ? loadProfile(supabase, claims.sub) : Promise.resolve(null),
		claims ? isAdmin(supabase, claims.sub) : Promise.resolve(false)
	]);

	return {
		claims,
		userProfile,
		isAdmin: admin,
		cookies: cookies.getAll()
	};
};

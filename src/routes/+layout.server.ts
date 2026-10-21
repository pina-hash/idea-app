import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchUserProfile } from '$lib/profile';
import { isAdmin } from '$lib/server/admin';
import { VIEW_AS_RETURN_COOKIE } from '$lib/server/view-as/flow';
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
/**
 * The signed-in person's unread certification notifications (ledger 0391), for
 * the badge on the profile menu across the site. It NEVER rejects: a database
 * without the certification migrations answers PGRST202, a network fault
 * answers an error, and both read as "cannot tell" (null), which draws no
 * badge, so a layout load can never fail over a count.
 */
async function loadCertUnread(supabase: SupabaseClient): Promise<number | null> {
	try {
		const { data, error } = await supabase.rpc('cert_notifications_unread');
		if (error) return null;
		return typeof data === 'number' && Number.isFinite(data) ? data : null;
	} catch {
		return null;
	}
}

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
export const load: LayoutServerLoad = async ({ locals: { supabase, claims, viewAs }, cookies }) => {
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
	const [userProfile, admin, certUnread] = await Promise.all([
		claims ? loadProfile(supabase, claims.sub) : Promise.resolve(null),
		claims ? isAdmin(supabase, claims.sub) : Promise.resolve(false),
		// Independent of the two above, and it cannot reject (see loadCertUnread).
		claims ? loadCertUnread(supabase) : Promise.resolve(null)
	]);

	return {
		claims,
		userProfile,
		isAdmin: admin,
		certUnread,
		// Ledger 0422: set only while an admin is viewing or acting as this
		// account; the floating exit panel is drawn from it and nothing else.
		viewAs: viewAs ?? null,
		// The admin's waiting refresh token is httpOnly and stays that way.
		cookies: cookies.getAll().filter((c) => c.name !== VIEW_AS_RETURN_COOKIE)
	};
};

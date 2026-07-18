import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * GREENLINE (combat-racing) route. Signed-in tier, any role: hooks.server.ts
 * already redirects anonymous users off `/greenline` to `/`, the portal's
 * standard signed-out handling (mirrored here defensively).
 *
 * There is no role-dependent chrome in the game anymore (the teacher-only
 * live tuning panel was removed), so no role lookup is needed. The
 * build/leaderboard data all flows through the browser Supabase client in the
 * page (the persistence seam), so only the user id is loaded here.
 */
export const load: PageServerLoad = async ({ locals: { claims } }) => {
	if (!claims) {
		redirect(303, '/');
	}

	return {
		userId: claims.sub
	};
};

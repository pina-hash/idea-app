import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * GREENLINE (combat-racing) route. Signed-in tier, any role: hooks.server.ts
 * already redirects anonymous users off `/greenline` to `/`, the portal's
 * standard signed-out handling (mirrored here defensively).
 *
 * The only role-dependent bit is the in-game tuning panel: it stays available
 * for continued tuning but is teacher-only (@boscotech.edu -> `teacher`), the
 * same server-side `profiles.role` check the dashboard and GAUNTLET authoring
 * use. Students reach a clean game with no debug chrome. The build/leaderboard
 * data all flows through the browser Supabase client in the page (the
 * persistence seam), so nothing else is loaded here.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) {
		redirect(303, '/');
	}

	const { data: profile } = await supabase
		.from('profiles')
		.select('role')
		.eq('id', claims.sub)
		.single();

	return {
		userId: claims.sub,
		isTeacher: profile?.role === 'teacher'
	};
};

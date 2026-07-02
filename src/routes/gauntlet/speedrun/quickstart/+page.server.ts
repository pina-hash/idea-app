import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Student quick-start for the SolidWorks "IDEA // GAUNTLET" Speedrun add-in.
 * Reference content only (no challenge data); auth-gated with the rest of
 * /gauntlet by hooks.server.ts. One tap from the Speedrun list.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) {
		redirect(303, '/');
	}

	const { data: profile } = await supabase
		.from('profiles')
		.select('full_name, role')
		.eq('id', claims.sub)
		.single();

	return {
		userName: profile?.full_name ?? claims.email ?? 'Signed in',
		userRole: profile?.role ?? 'student'
	};
};

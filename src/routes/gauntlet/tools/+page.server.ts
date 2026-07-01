import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * GAUNTLET tools: download and setup for the SolidWorks capture macros. Auth-gated
 * with the rest of /gauntlet (hooks.server.ts). The macros ship pre-configured
 * with this project's public values, so there is nothing to surface here.
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
		userRole: profile?.role ?? 'student',
		isTeacher: profile?.role === 'teacher'
	};
};

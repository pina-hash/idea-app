import { redirect } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import type { PageServerLoad } from './$types';

/**
 * GAUNTLET tools: download and setup for the SolidWorks capture macro. Auth-gated
 * with the rest of /gauntlet (hooks.server.ts). We surface the exact (public)
 * macro endpoint URL for this project so setup is copy-paste; the anon key is
 * the project's public key, fetched by the user from Supabase settings.
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
		isTeacher: profile?.role === 'teacher',
		endpoint: `${PUBLIC_SUPABASE_URL}/rest/v1/rpc/gauntlet_macro_submit`
	};
};

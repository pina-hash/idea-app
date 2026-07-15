import { redirect } from '@sveltejs/kit';
import { loadFrcInterestSubmissions } from '$lib/fsp/frc-interest';
import type { PageServerLoad } from './$types';

/**
 * Teacher-only roster for the FRC interest form. Same role-gated pattern as
 * /coin-entry and the dashboard: the role lives in `profiles`, not the JWT, so
 * it's looked up server-side.
 *   - signed out             -> redirect to /
 *   - signed in, non-teacher -> redirect to /
 *   - signed in, teacher     -> the submissions table.
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

	if (profile?.role !== 'teacher') {
		redirect(303, '/');
	}

	const { ready, rows } = await loadFrcInterestSubmissions(supabase);

	return { rows, ready };
};

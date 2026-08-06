import { redirect } from '@sveltejs/kit';
import { loadFrcInterestSubmissions } from '$lib/fsp/frc-interest';
import { isAdmin } from '$lib/server/admin';
import type { PageServerLoad } from './$types';

/**
 * ADMIN-only roster for the FRC interest form (0067). This page is the most
 * sensitive read on the site: the rows carry prospective students' real names,
 * emails, phone numbers and parent/guardian emails, which is exactly why it
 * moved off the auto-granted teacher role.
 *   - signed out            -> redirect to /
 *   - signed in, non-admin  -> redirect to /
 *   - signed in, admin      -> the submissions table.
 * The RLS policy on fsp_frc_interest enforces the same rule server-side.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) {
		redirect(303, '/');
	}

	if (!(await isAdmin(supabase, claims.sub))) {
		redirect(303, '/');
	}

	const { ready, rows } = await loadFrcInterestSubmissions(supabase);

	return { rows, ready };
};

import { error } from '@sveltejs/kit';
import type { FeedbackRow } from '$lib/feedback/feedback';
import { isAdmin } from '$lib/server/admin';
import type { PageServerLoad } from './$types';

/**
 * The feedback console. ADMIN ONLY, and a non-admin gets a 404 rather than a
 * redirect (the /admin rule): probing the URL should tell a curious student
 * nothing at all. Anonymous visitors never reach it -- /classroom is in
 * hooks.server.ts authedPrefixes -- but the guard stands on its own regardless.
 *
 * This page guard is convenience: app_feedback_admin_list and
 * app_feedback_set_status both open with is_admin() inside the function body,
 * so a hand-rolled PostgREST call is refused by the database, not by a load.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) error(404, 'Not found');
	if (!(await isAdmin(supabase, claims.sub))) error(404, 'Not found');

	// EVERY APP, NOT JUST THE CLASSROOM. `p_app` was 'classroom' when the
	// classroom was the only surface with a Feedback button; the affordance is
	// mounted in the root layout now, so narrowing to one app here would hide
	// most of what arrives. `app_feedback_admin_list` already defaults `p_app` to
	// null (all apps), so this is an omission rather than a new parameter -- no
	// deploy-ordering problem, and it works against the schema already applied.
	const { data, error: rpcError } = await supabase.rpc('app_feedback_admin_list');

	return {
		// Fails soft: 0085 unapplied reads as a clearly-flagged card, not a crash.
		ready: !rpcError,
		rows: (data ?? []) as unknown as FeedbackRow[]
	};
};

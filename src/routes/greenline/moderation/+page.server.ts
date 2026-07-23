import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * GREENLINE community-track moderation: TEACHER-ONLY (Bundle 4b).
 *
 * The guard is the exact pattern the track builder carried while it was
 * teacher-gated (now retired there, reused here): the role is assigned from
 * the Google sign-in email domain (`role_for_email` in 0001,
 * @boscotech.edu -> teacher) and lives in `profiles`, not the JWT, so it is
 * looked up server-side — the same shape as `/coin-entry` and `/dashboard`.
 * Anyone signed in who is not a teacher gets a 404 (tells a probing student
 * nothing); anonymous visitors never reach this load at all, because
 * `/greenline` is in hooks.server.ts's authedPrefixes and they are redirected
 * to `/` first (the portal's standard signed-out handling).
 *
 * This gate is convenience/discoverability only — the real boundary is
 * `is_teacher()` INSIDE the greenline_track_set_featured and
 * greenline_track_remove RPCs, which a non-teacher cannot call successfully
 * no matter what they reach.
 */
export const prerender = false;

export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) error(404, 'Not found');

	const { data: profile } = await supabase
		.from('profiles')
		.select('role')
		.eq('id', claims.sub)
		.single();

	if (profile?.role !== 'teacher') error(404, 'Not found');

	return {};
};

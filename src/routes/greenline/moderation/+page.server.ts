import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import type { PageServerLoad } from './$types';

/**
 * GREENLINE community-track moderation: ADMIN-ONLY (0067; was teacher-only in
 * Bundle 4b).
 *
 * Anyone signed in who is not an admin gets a 404 rather than a redirect (it
 * tells a probing student nothing); anonymous visitors never reach this load
 * at all, because `/greenline` is in hooks.server.ts's authedPrefixes and they
 * are redirected to `/` first (the portal's standard signed-out handling).
 *
 * This gate is convenience/discoverability only — the real boundary is
 * `is_teacher()` INSIDE greenline_track_set_featured and
 * greenline_track_remove, and since 0067 that function resolves to the admin
 * check, so a non-admin cannot call them successfully no matter what they
 * reach.
 */
export const prerender = false;

export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) error(404, 'Not found');

	if (!(await isAdmin(supabase, claims.sub))) error(404, 'Not found');

	return {};
};

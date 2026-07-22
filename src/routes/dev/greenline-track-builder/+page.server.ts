import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * GREENLINE track builder: TEACHER-ONLY, on the live deployment.
 *
 * This replaces the dev-only `if (!dev) error(404)` guard the other harnesses
 * use. The builder is a real authoring tool, so it has to render for a signed-in
 * teacher in production — but it is still not something students should find.
 *
 * It reuses the portal's existing role model exactly (no new auth): the role is
 * assigned from the Google sign-in email domain (`role_for_email` in 0001,
 * @boscotech.edu -> teacher) and lives in `profiles`, not the JWT, so it is
 * looked up server-side here — the same shape as `/coin-entry` and
 * `/dashboard`.
 *
 * Anyone who is not a teacher gets a 404, deliberately NOT the redirect those
 * two use: a 404 is what this path has always returned, and it tells a probing
 * student nothing about whether the route exists. The route stays unlinked from
 * every nav surface, so 404 is also all they could ever see.
 *
 * `/dev` is not in `hooks.server.ts`'s `authedPrefixes` and must not be added
 * to it: that would bounce anonymous visitors with a redirect instead of the
 * 404, and would sweep in every other dev harness besides.
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

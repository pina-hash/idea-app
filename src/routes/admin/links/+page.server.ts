import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import type { ShortLinkRow } from '$lib/short-links';
import type { PageServerLoad } from './$types';

/**
 * Short-link management (0093). Printed material accumulates these -- a
 * syllabus QR code, a handout, a poster -- and the TARGETS move while the paper
 * does not, so re-pointing one has to be a thing an admin does, not a deploy.
 *
 * A non-admin gets 404 rather than a redirect (the /admin rule), and /admin is
 * deliberately not in authedPrefixes so an anonymous visitor gets exactly the
 * same 404 as a signed-in student. UI gating is convenience either way: every
 * write RPC re-checks is_admin() inside its own body.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) error(404, 'Not found');
	if (!(await isAdmin(supabase, claims.sub))) error(404, 'Not found');

	const { data, error: rpcError } = await supabase.rpc('app_short_link_list');

	return {
		// Fails soft pre-0093: an empty list plus the apply-migration note.
		links: (data ?? []) as ShortLinkRow[],
		ready: !rpcError
	};
};

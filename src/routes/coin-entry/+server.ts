import { redirect } from '@sveltejs/kit';
import { coinEntryHtml, rewriteLegacyLinks } from '$lib/legacy';
import { injectVersionBadge } from '$lib/version-badge';
import { isAdmin } from '$lib/server/admin';
import type { RequestHandler } from './$types';

/**
 * Gated, ADMIN-only serving pattern (0067).
 *
 * Serves the legacy coin entry tool (`entry/index.html`) only to admins:
 *   - signed out           -> redirect to /
 *   - signed in, non-admin -> redirect to /
 *   - signed in, admin     -> the original HTML, unchanged, as text/html.
 *
 * This tool writes real coin balances, so it moved to the admin tier with the
 * rest of the privileged surface; an ordinary @boscotech.edu teacher no longer
 * reaches it. The matching API route (/api/coin-ledger/teacher) enforces the
 * same rule, and that check is the actual boundary.
 */
export const GET: RequestHandler = async ({ locals: { supabase, claims } }) => {
	if (!claims) {
		redirect(303, '/');
	}

	if (!(await isAdmin(supabase, claims.sub))) {
		redirect(303, '/');
	}

	return new Response(injectVersionBadge(rewriteLegacyLinks(coinEntryHtml), 'coins'), {
		headers: { 'content-type': 'text/html; charset=utf-8' }
	});
};

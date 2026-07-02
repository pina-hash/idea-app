import { redirect } from '@sveltejs/kit';
import { coinEntryHtml, rewriteLegacyLinks } from '$lib/legacy';
import { injectVersionBadge } from '$lib/version-badge';
import type { RequestHandler } from './$types';

/**
 * Gated, teacher-only serving pattern.
 *
 * Serves the legacy coin entry tool (`entry/index.html`) only to teachers:
 *   - signed out          -> redirect to /
 *   - signed in, non-teacher -> redirect to /
 *   - signed in, teacher  -> the original HTML, unchanged, as text/html.
 *
 * The role lives in `profiles`, not the JWT, so we look it up server-side.
 */
export const GET: RequestHandler = async ({ locals: { supabase, claims } }) => {
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

	return new Response(injectVersionBadge(rewriteLegacyLinks(coinEntryHtml), 'coins'), {
		headers: { 'content-type': 'text/html; charset=utf-8' }
	});
};

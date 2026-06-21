import { error, redirect } from '@sveltejs/kit';
import { loadAssignmentHtml, rewriteLegacyLinks } from '$lib/legacy';
import type { RequestHandler } from './$types';

/**
 * Gated serving pattern.
 *
 * Checks the server session via `locals.claims`:
 *   - not signed in  -> redirect to /
 *   - signed in      -> return the original legacy HTML, unchanged,
 *                       as text/html.
 *
 * The HTML never lives in `static/`, so this endpoint is the only way to
 * reach it.
 */
export const GET: RequestHandler = async ({ params, locals: { claims } }) => {
	if (!claims) {
		redirect(303, '/');
	}

	const html = await loadAssignmentHtml(params.slug);
	if (html === null) {
		error(404, 'Assignment not found');
	}

	return new Response(rewriteLegacyLinks(html), {
		headers: { 'content-type': 'text/html; charset=utf-8' }
	});
};

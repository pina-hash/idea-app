import { error } from '@sveltejs/kit';
import { loadAssignmentHtml, rewriteLegacyLinks } from '$lib/legacy';
import type { RequestHandler } from './$types';

/**
 * Public serving pattern (raw-import, not `static/`).
 *
 * Assignments are public: anyone may open `/assignments/<slug>`. The HTML
 * still lives OUTSIDE `static/` and is pulled in via build-time raw imports,
 * so this endpoint remains the only way to reach it (and the serve-time
 * `rewriteLegacyLinks` fixes its legacy asset/link paths).
 */
export const GET: RequestHandler = async ({ params }) => {
	const html = await loadAssignmentHtml(params.slug);
	if (html === null) {
		error(404, 'Assignment not found');
	}

	return new Response(rewriteLegacyLinks(html), {
		headers: { 'content-type': 'text/html; charset=utf-8' }
	});
};

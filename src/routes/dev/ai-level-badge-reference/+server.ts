import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import referenceHtml from '../../../../docs/policy/ai-level-badge-and-declaration-reference.html?raw';
import type { RequestHandler } from './$types';

/**
 * DEV-ONLY preview of the AI-Level Badge / Declaration reference artifact
 * (`docs/policy/ai-level-badge-and-declaration-reference.html`), 404 in
 * production. Mirrors the raw-import serving pattern in
 * `src/routes/assignments/[slug]/+server.ts`: the file lives outside
 * `static/`, pulled in at build time via a Vite `?raw` import, served
 * verbatim (it references no legacy assets, so no link rewrite is needed).
 * This is a reference artifact, not a real assignment: it is not registered
 * in `$lib/legacy`, has no slug, and is unreachable from `/assignments/`.
 */
export const GET: RequestHandler = async () => {
	if (!dev) error(404, 'Not found');

	return new Response(referenceHtml, {
		headers: { 'content-type': 'text/html; charset=utf-8' }
	});
};

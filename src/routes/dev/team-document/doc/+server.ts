import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { teamFixtureHtml } from '$lib/classroom/html-assignment/team-fixture';
import { hxDocumentHeaders } from '../../../hx/_headers';
import type { RequestHandler } from './$types';

/** The team fixture document, served under the same headers a stored document gets. Dev only. */
export const GET: RequestHandler = async ({ url }) => {
	if (!dev) error(404, 'Not found');
	const headers = hxDocumentHeaders(url.origin);
	headers.set('content-type', 'text/html; charset=utf-8');
	return new Response(teamFixtureHtml(), { headers });
};

import { error } from '@sveltejs/kit';
import { domainById } from '$lib/frc/track';
import type { PageLoad } from './$types';

/**
 * Resolve the domain landing page by slug from the client-safe track registry
 * (plain data, so a universal load suffices; the signed-in guard for /frc*
 * lives in hooks.server.ts). Unknown slugs 404.
 */
export const load: PageLoad = ({ params }) => {
	const domain = domainById(params.domain);
	if (!domain) error(404, 'Unknown training domain');
	return { domain };
};

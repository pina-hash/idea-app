import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * TEMPORARY. Deployed on lane/foundry-proxy only, to measure which host-bearing
 * values actually reach the SvelteKit server on Vercel. REMOVED BEFORE MERGE.
 *
 * It echoes nothing the caller did not already send.
 */
export const GET: RequestHandler = async ({ request, url }) => {
	return json({
		hostHeader: request.headers.get('host'),
		xForwardedHost: request.headers.get('x-forwarded-host'),
		xVercelDeploymentUrl: request.headers.get('x-vercel-deployment-url'),
		urlHost: url.host,
		urlOrigin: url.origin,
		agree: request.headers.get('host') === url.host
	});
};

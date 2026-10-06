import type { RequestHandler } from './$types';
import { armoryDeps } from '$lib/server/armory/deps';
import { handleConnectStart } from '$lib/server/armory/handlers';

/**
 * IDEA Armory contract section 3c. The confirm page at /armory/connect posts
 * here with the site's own session cookie; the answer is a 303 to
 * `http://127.0.0.1:<port>/callback`, the only target this route can build.
 */
export const POST: RequestHandler = ({ request, locals, getClientAddress }) => {
	const claims = locals.claims;
	const email = typeof claims?.email === 'string' ? claims.email.trim().toLowerCase() : '';
	const siteUser = claims?.sub && email ? { id: claims.sub, email } : null;
	return handleConnectStart(request, siteUser, getClientAddress(), armoryDeps());
};

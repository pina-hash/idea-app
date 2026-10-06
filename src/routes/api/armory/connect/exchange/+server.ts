import type { RequestHandler } from './$types';
import { armoryDeps } from '$lib/server/armory/deps';
import { handleConnectExchange } from '$lib/server/armory/handlers';

/**
 * IDEA Armory contract sections 3d to 3f: the agent trades the one-time code
 * and its PKCE verifier for a session of its own and a registered device.
 * There is no cookie here and none is read.
 */
export const POST: RequestHandler = ({ request, getClientAddress }) =>
	handleConnectExchange(request, getClientAddress(), armoryDeps());

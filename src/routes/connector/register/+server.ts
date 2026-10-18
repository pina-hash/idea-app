/** RFC 7591 dynamic client registration, for a client that does not use a metadata document. */
import type { RequestHandler } from './$types';
import { connectorDeps } from '$lib/server/connector/deps';
import { handleRegister } from '$lib/server/connector/oauth';

export const POST: RequestHandler = async ({ request, getClientAddress }) =>
	handleRegister(request, await connectorDeps(), getClientAddress());

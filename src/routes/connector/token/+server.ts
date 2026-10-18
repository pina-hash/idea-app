/** The connector's token endpoint (form-urlencoded; exempt from the cross-site form check, see csrf.ts). */
import type { RequestHandler } from './$types';
import { connectorDeps } from '$lib/server/connector/deps';
import { handleToken } from '$lib/server/connector/oauth';

export const POST: RequestHandler = async ({ request }) => handleToken(request, await connectorDeps());

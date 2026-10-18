/** RFC 7009 token revocation (form-urlencoded; exempt from the cross-site form check, see csrf.ts). */
import type { RequestHandler } from './$types';
import { connectorDeps } from '$lib/server/connector/deps';
import { handleRevoke } from '$lib/server/connector/oauth';

export const POST: RequestHandler = async ({ request }) => handleRevoke(request, await connectorDeps());

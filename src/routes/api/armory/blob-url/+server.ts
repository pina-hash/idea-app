import type { RequestHandler } from './$types';
import { armoryDeps } from '$lib/server/armory/deps';
import { handleBlobUrl } from '$lib/server/armory/handlers';

/**
 * IDEA Armory contract section 2: a fifteen-minute signed URL for one
 * content-addressed object. Authorized by the agent's Bearer token, never a
 * cookie; see `$lib/server/armory/handlers.ts` for the order of checks.
 */
export const POST: RequestHandler = ({ request }) => handleBlobUrl(request, armoryDeps());

import type { RequestHandler } from './$types';
import { armorySweepDeps } from '$lib/server/armory/deps';
import { handlePurge } from '$lib/server/armory/handlers';

/**
 * Armory v0.3 item 3: Delete forever, for a site admin, on an archived
 * project. The RPC runs on the caller's own client, so the database decides;
 * see `$lib/server/armory/handlers.ts`. Answers its own 401, which is why
 * `/api` is not in the authed prefixes.
 */
export const POST: RequestHandler = ({ request, locals }) =>
	handlePurge(request, locals.supabase, !!locals.claims?.sub, armorySweepDeps());

import type { RequestHandler } from './$types';
import { armorySweepDeps } from '$lib/server/armory/deps';
import { handleSweep } from '$lib/server/armory/handlers';

/**
 * Armory storage cleanup: removes, from file storage, stored files no project
 * names any more. Site admins only, decided by the database on the caller's
 * own client; everyone else gets the bodyless 404.
 */
export const POST: RequestHandler = ({ locals }) => handleSweep(locals.supabase, !!locals.claims?.sub, armorySweepDeps());

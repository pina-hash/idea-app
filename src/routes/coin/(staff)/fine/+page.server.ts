import { requireCoinArea } from '$lib/server/coin-scope';
import type { PageServerLoad } from './$types';

/**
 * THE FINE SCREEN (IDEA Coin V2). Open to section coin staff as well as full
 * coin admins (decision 68): the screen lists only the classes the caller's
 * tier reaches, and every RPC it calls re-checks the same scope. The page asks
 * for its area as its own first statement, because the layout's load and this
 * one run concurrently.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	await requireCoinArea(supabase, claims?.sub, 'fine');
	return {};
};

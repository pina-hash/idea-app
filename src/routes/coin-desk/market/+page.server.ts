import { requireCoinArea } from '$lib/server/coin-scope';
import type { PageServerLoad } from './$types';

/**
 * THE MARKET ON THE COIN DESK (ledger 0402), open to section coin staff, who
 * see their own students only. Its own first statement asks for the area's
 * tier again (decision 68); every RPC the page calls re-checks tier and scope
 * in the database. The stocks list is a full coin admin's alone.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	const staff = await requireCoinArea(supabase, claims?.sub, 'market');
	return { full: staff.scope === 'full' };
};

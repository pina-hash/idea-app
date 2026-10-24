import { requireCoinArea } from '$lib/server/coin-scope';
import type { PageServerLoad } from './$types';

/**
 * PAYDAY (IDEA Coin V2, 2.4), open to section coin staff, who see only their
 * own classes. Its own first statement asks for the area's tier again, because
 * the layout's load and this one run concurrently (decision 68). Every RPC the
 * page calls re-checks the same tier and scope inside the database; this
 * decides only who gets the page at all.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	await requireCoinArea(supabase, claims?.sub, 'payday');
	return {};
};

import { requireCoinArea } from '$lib/server/coin-scope';
import type { PageServerLoad } from './$types';

/**
 * THE TOURNAMENT TRANSFER (IDEA Coin V2, 2.9), a full coin admin's area:
 * section staff get 404. Its own first statement asks for the area's tier
 * again, because the layout's load and this one run concurrently (decision
 * 68). Every RPC the page calls re-checks the same tier and scope inside the
 * database; this decides only who gets the page at all.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	await requireCoinArea(supabase, claims?.sub, 'tournaments');
	return {};
};

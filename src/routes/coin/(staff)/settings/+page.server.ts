import { requireCoinArea } from '$lib/server/coin-scope';
import type { PageServerLoad } from './$types';

/** Settings are a full coin admin's alone (decision 68). */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	await requireCoinArea(supabase, claims?.sub, 'settings');
	return {};
};

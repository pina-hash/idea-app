import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { PageServerLoad } from './$types';

/** THE TEAM PLAN HARNESS (ledger 0436): the real TeamPlan over a fixture plan. Dev only. */
export const load: PageServerLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};

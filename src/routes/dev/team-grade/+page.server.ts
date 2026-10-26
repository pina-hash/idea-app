import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { PageServerLoad } from './$types';

/** THE TEAM GRADING HARNESS (ledger 0436). Dev only. */
export const load: PageServerLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};

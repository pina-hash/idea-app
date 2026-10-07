import {
	ARMORY_REPORTS_NOT_READY,
	armoryReportsNotReady,
	parseArmoryFeedbackRows
} from '$lib/feedback/armory-reports';
import { requireFeedbackConsole } from '$lib/server/feedback-console';
import type { PageServerLoad } from './$types';

/**
 * THE ARMORY APP'S NOTES (website requests v0.3, item 4), admin only.
 *
 * THE GATE IS THIS LOAD'S FIRST STATEMENT, and the layout's own call does not
 * make it redundant: SvelteKit runs the two loads concurrently, so without this
 * a non-admin's request would start the read below before the layout's 404.
 * The database is still the boundary -- `armory_app_feedback_admin_list` opens
 * with `is_admin()` -- and this is what keeps a non-admin from landing on a
 * page whose every read would be refused.
 *
 * A DATABASE THAT HAS NOT BEEN UPDATED YET IS A STATE, NOT A FAILURE: the
 * tables and the function arrive in one migration applied separately from the
 * deploy, so a missing function or relation reads as a sentence saying so.
 */
export const load: PageServerLoad = async ({ locals }) => {
	await requireFeedbackConsole(locals);
	const { data, error } = await locals.supabase.rpc('armory_app_feedback_admin_list', {
		p_limit: 500
	});
	if (error) {
		return {
			rows: [],
			unavailable: armoryReportsNotReady(error.code)
				? ARMORY_REPORTS_NOT_READY
				: `The Armory notes could not be read: ${error.message}`
		};
	}
	return { rows: parseArmoryFeedbackRows(data), unavailable: null };
};

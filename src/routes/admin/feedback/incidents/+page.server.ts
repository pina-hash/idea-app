import {
	ARMORY_REPORTS_NOT_READY,
	armoryReportsNotReady,
	parseArmoryIncidentRows
} from '$lib/feedback/armory-reports';
import { requireFeedbackConsole } from '$lib/server/feedback-console';
import type { PageServerLoad } from './$types';

/**
 * THE ARMORY APP'S INCIDENTS (website requests v0.3, item 4b), admin only.
 *
 * The gate is this load's first statement for the reason the notes page gives:
 * the layout's load runs beside this one, not before it.
 *
 * THE LIST CARRIES NO REPORT. `armory_app_incidents_admin_list` projects every
 * column but `report` and a `report_bytes` beside it, because a report can be a
 * megabyte and a page of them would be tens. The page fetches a report only
 * when one is downloaded.
 */
export const load: PageServerLoad = async ({ locals }) => {
	await requireFeedbackConsole(locals);
	const { data, error } = await locals.supabase.rpc('armory_app_incidents_admin_list', {
		p_limit: 500
	});
	if (error) {
		return {
			rows: [],
			unavailable: armoryReportsNotReady(error.code)
				? ARMORY_REPORTS_NOT_READY
				: `The Armory incidents could not be read: ${error.message}`
		};
	}
	return { rows: parseArmoryIncidentRows(data), unavailable: null };
};
